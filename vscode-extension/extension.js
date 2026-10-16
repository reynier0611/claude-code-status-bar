const vscode = require('vscode');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const HOME = os.homedir();
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const LIVE_FILE = process.env.CLAUDE_STATUSLINE_LIVE_FILE || path.join(HOME, '.claude', 'statusline-live.json');
// Same cache file statusline.sh uses, so the terminal and VS Code share one lookup.
const IP_CACHE = path.join(process.env.TMPDIR || '/tmp', 'claude-statusline-public-ip');
const IP_TTL_MS = 300 * 1000;
const GIT_TTL_MS = 10 * 1000;
const POLL_MS = 2000;
const TAIL_BYTES = 512 * 1024;
// Quotas only ever come from the terminal statusline hook. Without a reset time,
// treat a snapshot older than 5h as stale since the 5h window has rolled over.
const QUOTA_MAX_AGE_MS = 5 * 3600 * 1000;
const OPEN_CLAUDE_COMMAND = 'claude-vscode.editor.openLast';

const ORANGE = '#d75f00';
const color = (id) => new vscode.ThemeColor(id);

let items = {};
let log = null;
let lastRendered = '';
let shown = [];
let timer = null;
let busy = false;
let sessionCache = { key: '', data: null };
let gitCache = { cwd: '', at: 0, repo: '', branch: '' };
let ipFetch = null;

function activate(context) {
  log = vscode.window.createOutputChannel('Claude Statusline', { log: true });
  context.subscriptions.push(log);
  const order = ['model', 'identity', 'ctx', 'five', 'seven', 'path', 'git'];
  order.forEach((name, i) => {
    const item = vscode.window.createStatusBarItem(`claudeStatusline.${name}`, vscode.StatusBarAlignment.Left, -1000 - i);
    item.name = 'Claude Statusline';
    item.command = OPEN_CLAUDE_COMMAND;
    items[name] = item;
    context.subscriptions.push(item);
  });

  timer = setInterval(refresh, POLL_MS);
  context.subscriptions.push(
    { dispose: () => clearInterval(timer) },
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('claudeStatusline')) {
        sessionCache.key = '';
        refresh();
      }
    })
  );
  refresh();
}

function deactivate() {}

async function refresh() {
  if (busy) return;
  busy = true;
  try {
    render(await collect());
  } catch (err) {
    log.error(err);
  } finally {
    busy = false;
  }
}

async function collect() {
  const folders = (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath);
  // With no folder open, the Claude Code panel runs its sessions in $HOME.
  if (!folders.length) folders.push(HOME);

  const transcript = await newestTranscript(folders);
  let session = null;
  if (transcript) {
    const key = `${transcript.path}:${transcript.mtimeMs}:${transcript.size}`;
    if (sessionCache.key !== key) {
      sessionCache = { key, data: parseSession(await readTail(transcript.path, transcript.size)) };
    }
    session = sessionCache.data && { ...sessionCache.data, mtimeMs: transcript.mtimeMs };
  }

  const cwd = (session && session.cwd) || folders[0];
  const [git, ip, live] = await Promise.all([gitInfo(cwd), publicIp(), readLive()]);
  return { session, cwd, git, ip, live, username: os.userInfo().username };
}

// Claude Code stores each project's transcripts under ~/.claude/projects/<cwd with non-alphanumerics as '-'>.
function projectSlug(dir) {
  return dir.replace(/[^a-zA-Z0-9]/g, '-');
}

async function newestTranscript(folders) {
  let best = null;
  for (const folder of folders) {
    const dir = path.join(PROJECTS_DIR, projectSlug(folder));
    let names;
    try {
      names = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name);
      try {
        const st = await fsp.stat(file);
        if (!best || st.mtimeMs > best.mtimeMs) best = { path: file, mtimeMs: st.mtimeMs, size: st.size };
      } catch {}
    }
  }
  return best;
}

async function readTail(file, size) {
  const start = Math.max(0, size - TAIL_BYTES);
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    const lines = buf.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    return lines;
  } finally {
    await fh.close();
  }
}

function parseSession(lines) {
  let last = null;
  let identity = null;
  let title = null;
  for (let i = lines.length - 1; i >= 0 && !(last && identity && title); i--) {
    if (!lines[i]) continue;
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!last && e.type === 'assistant' && !e.isSidechain && e.message && e.message.usage && e.message.model && e.message.model !== '<synthetic>') {
      last = e;
    } else if (!identity && e.type === 'attachment' && e.attachment && e.attachment.type === 'model') {
      identity = e.attachment.identity;
    } else if (!title && e.type === 'ai-title') {
      title = e.aiTitle;
    }
  }
  if (!last) return null;

  const u = last.message.usage;
  const modelId = last.message.model;
  return {
    modelId,
    model: identity && identity.modelId === modelId && identity.marketingName ? identity.marketingName : prettyModel(modelId),
    effort: last.perTurnEffort || last.effort || '',
    ctxUsed: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
    cwd: last.cwd,
    entrypoint: last.entrypoint || '',
    title,
  };
}

// "claude-opus-5-5" -> "Opus 5.5", "claude-haiku-4-5-20251001" -> "Haiku 4.5"
function prettyModel(id) {
  const parts = id.replace(/\[.*\]$/, '').replace(/^claude-/, '').split('-').filter((p) => !/^\d{8}$/.test(p));
  const name = parts.shift() || id;
  return name[0].toUpperCase() + name.slice(1) + (parts.length ? ' ' + parts.join('.') : '');
}

function runGit(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout: 1500 }, (err, out) => resolve(err ? '' : out.trim()));
  });
}

async function gitInfo(cwd) {
  if (gitCache.cwd === cwd && Date.now() - gitCache.at < GIT_TTL_MS) return gitCache;
  const [toplevel, branch, remote] = await Promise.all([
    runGit(cwd, ['rev-parse', '--show-toplevel']),
    runGit(cwd, ['branch', '--show-current']),
    runGit(cwd, ['remote', 'get-url', 'origin']),
  ]);
  const repo = !toplevel ? '' : remote ? path.basename(remote).replace(/\.git$/, '') : path.basename(toplevel);
  gitCache = { cwd, at: Date.now(), repo, branch };
  return gitCache;
}

async function publicIp() {
  let st = null;
  try {
    st = await fsp.stat(IP_CACHE);
  } catch {}
  if ((!st || Date.now() - st.mtimeMs > IP_TTL_MS) && !ipFetch) {
    // Fire-and-forget: the next poll picks up the new value. A failed lookup
    // still touches the cache so we don't retry on every poll while offline.
    ipFetch = fetchIp()
      .then((ip) => (ip ? fsp.writeFile(IP_CACHE, ip) : touch(IP_CACHE)))
      .catch(() => {})
      .finally(() => (ipFetch = null));
  }
  try {
    return (await fsp.readFile(IP_CACHE, 'utf8')).trim();
  } catch {
    return '';
  }
}

async function fetchIp() {
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(1500) });
    const ip = (await res.text()).trim();
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : '';
  } catch {
    return '';
  }
}

async function touch(file) {
  const fh = await fsp.open(file, 'a');
  await fh.close();
  const now = new Date();
  await fsp.utimes(file, now, now);
}

async function readLive() {
  try {
    return JSON.parse(await fsp.readFile(LIVE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// Transcripts don't record the context window size; statusline.sh keeps a
// per-model map of the sizes Claude Code has reported to it.
function contextWindowSize(session, live) {
  const configured = vscode.workspace.getConfiguration('claudeStatusline').get('contextWindowSize');
  if (configured > 0) return configured;
  if (/\[1m\]/i.test(session.modelId)) return 1000000;
  const known = live && live.ctx_sizes && live.ctx_sizes[session.model];
  return known > 0 ? known * 1000 : 200000;
}

function bar(pct, width) {
  const filled = Math.max(0, Math.min(width, Math.round((pct * width) / 100)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pctColor(pct) {
  if (pct >= 80) return color('terminal.ansiRed');
  if (pct >= 50) return color('terminal.ansiYellow');
  return color('terminal.ansiGreen');
}

function segment(label, pct, width, suffix = '') {
  return `${label} [${bar(pct, width)}] ${pct}%${suffix}`;
}

// Matches statusline.sh: "37m" under an hour, "4h" under a day, else "3d".
function countdown(ms) {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min}m`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / (24 * 60))}d`;
}

// Returns { pct, resetsAt } for a quota window still in effect, or null.
function quota(live, key, now) {
  if (!live || live[`${key}_pct`] == null) return null;
  const resetsAt = live[`${key}_resets_at`] ? live[`${key}_resets_at`] * 1000 : null;
  if (resetsAt ? resetsAt <= now : now - live.updated_at * 1000 > QUOTA_MAX_AGE_MS) return null;
  return { pct: live[`${key}_pct`], resetsAt };
}

function quotaText(label, q, width, now) {
  return segment(label, q.pct, width, q.resetsAt ? ` ↻${countdown(q.resetsAt - now)}` : '');
}

function quotaTip(label, q, now) {
  if (!q) return '';
  const when = q.resetsAt ? ` · resets in ${countdown(q.resetsAt - now)} (${new Date(q.resetsAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })})` : '';
  return `${label}: ${q.pct}%${when}\n\n`;
}

function displayPath(dir) {
  if (dir === HOME) return '~';
  if (dir.startsWith(HOME + path.sep)) return '~' + dir.slice(HOME.length);
  return dir;
}

function ago(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m ago`;
}

function set(name, text, opts = {}) {
  const item = items[name];
  if (!text) {
    item.hide();
    return;
  }
  item.text = text;
  item.color = opts.color;
  item.tooltip = opts.tooltip;
  item.show();
  shown.push(text);
}

function render(data) {
  shown = [];
  const { session, cwd, git, ip, live, username } = data;
  const config = vscode.workspace.getConfiguration('claudeStatusline');
  const width = config.get('barWidth');
  const showLocation = config.get('showLocation');
  const now = Date.now();
  const tip = new vscode.MarkdownString('', true);
  tip.supportThemeIcons = true;

  let ctx = null;
  if (session) {
    const size = contextWindowSize(session, live);
    const pct = Math.min(100, Math.round((session.ctxUsed / size) * 100));
    ctx = { pct, usedK: Math.round(session.ctxUsed / 1000), sizeK: Math.round(size / 1000) };
    tip.appendMarkdown(`**${session.model}**${session.effort ? ` · effort \`${session.effort}\`` : ''}\n\n`);
    if (session.title) tip.appendMarkdown(`Session: _${session.title}_\n\n`);
    tip.appendMarkdown(`Context window: ${ctx.usedK}k / ${ctx.sizeK}k (${ctx.pct}%)\n\n`);
  } else {
    tip.appendMarkdown('No Claude Code session found for this workspace yet.\n\n');
  }

  const five = quota(live, 'five', now);
  const seven = quota(live, 'seven', now);
  tip.appendMarkdown(quotaTip('Session (5h)', five, now) + quotaTip('Weekly (7d)', seven, now));
  if (five || seven) {
    tip.appendMarkdown(`_Quotas as of ${ago(now - live.updated_at * 1000)}, from the terminal statusline (the VS Code panel doesn't expose them)_\n\n`);
  }

  const branchPart = git.branch ? `:${git.branch}` : '';
  tip.appendMarkdown('---\n\n');
  tip.appendMarkdown(`$(folder-opened) ${displayPath(cwd)}${git.repo ? ` · $(git-branch) ${git.repo}${branchPart}` : ''}\n\n`);
  if (session) tip.appendMarkdown(`Last activity ${ago(now - session.mtimeMs)} · ${session.entrypoint === 'claude-vscode' ? 'VS Code panel' : session.entrypoint || 'unknown'} · click to open Claude Code`);

  set('model', session ? `✱ ${session.model}${session.effort ? ` - ${session.effort}` : ''}` : '✱ Claude', { color: ORANGE, tooltip: tip });
  set('identity', username || ip ? `💻 ${username}${ip ? `@${ip}` : ''}` : '', { color: color('terminal.ansiBrightCyan'), tooltip: tip });
  set('ctx', ctx ? segment('Context window', ctx.pct, width, ` (${ctx.usedK}k/${ctx.sizeK}k)`) : '', { color: ctx && pctColor(ctx.pct), tooltip: tip });
  set('five', five ? quotaText('Session (5h)', five, width, now) : '', { color: five && pctColor(five.pct), tooltip: tip });
  set('seven', seven ? quotaText('Weekly (7d)', seven, width, now) : '', { color: seven && pctColor(seven.pct), tooltip: tip });
  set('path', showLocation ? `$(folder-opened) ${displayPath(cwd)}` : '', { tooltip: tip });
  set('git', showLocation && git.repo ? `$(git-branch) ${git.repo}${branchPart}` : '', { color: color('terminal.ansiBrightBlue'), tooltip: tip });
  logRendered();
}

function logRendered() {
  const rendered = shown.join(' | ');
  if (rendered !== lastRendered) {
    lastRendered = rendered;
    log.info(`rendered: ${rendered}`);
  }
}

module.exports = { activate, deactivate };
