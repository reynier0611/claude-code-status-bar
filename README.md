# claude-statusline

A Claude Code statusline that always shows:

- The **model** in use, bold/highlighted so it stands out, with the current
  **reasoning effort** (when the model supports it)
- Your **username** and **public IPv4 address**
- The current **working directory** (`$HOME` collapsed to `~`)
- The current **repo and git branch**
- **Context window** usage for the current conversation, as a progress bar
- **5-hour** session usage quota, as a progress bar, with a countdown to its reset
- **7-day** weekly usage quota (when your plan/gateway reports them), as a progress bar, with a countdown to its reset

On **API billing** (no subscription quotas) the 5h/7d bars are replaced by
the money spent this session and this month, e.g.
`Session cost $1.23  |  This month $45.67`. Which one you see is detected
automatically: reported `rate_limits` mean a subscription; otherwise an
`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` in the environment means API, and
an OAuth login in `~/.claude.json` means a subscription. Force a view with
`CLAUDE_STATUSLINE_USAGE=quota` or `=cost`. Session cost is Claude Code's own
figure; the month total sums a ledger at `~/.claude/statusline-costs.json`
(only sessions that ran through this statusline are in it).

Countdowns show minutes under an hour (`37m`), hours under a day (`4h`), and
days beyond that (`3d`).

```
*  Claude Sonnet 5 - high  |  💻 alice@203.0.113.42  |  📂 ~/WORK/TOOLS/claude-statusline  |  🌿 claude-statusline:main
  Context window [████████████░░░░░░░░] 61% (122k/200k)  |  Session (5h) [███████░░░░░░░░░░░░░] 34% (resets in 2h)  |  Weekly (7d) [████████████████░░░░] 82% (resets in 3d)
```

Two lines: identity/location (model, username/IP, path, repo:branch) on
top, usage bars (context, 5h, 7d) below, indented to line up under the
first line's content. A bold orange `*` (Claude's brand color) opens
the first line as a logo stand-in, with the model name/effort in the
same orange (not bold) so they read as branded together. Sections are
separated by `  |  ` for scannability. Colors are tuned for dark-background
terminals: repo name bright magenta, branch bright blue, username bright
cyan, and everything else (IP, path, labels, brackets, percentages)
bright white — nothing else is bold. Bars are 20 characters wide and
color-coded (green < 50%, yellow 50-79%, red ≥ 80%).
A statusline script only receives JSON on stdin, so it has no way to query
the terminal for its actual theme — there's no light/dark auto-detection,
just a palette chosen for dark backgrounds. The repo:branch segment is
omitted outside a git repo (falls back to just the directory name), and
the 5h/7d segments only appear when Claude Code reports them (e.g. not
present for plain API-key usage without a subscription quota).

Applied globally via `~/.claude/settings.json`, so it's active in every
Claude Code session on the machine, in every project.

## Install (on any machine)

```bash
git clone <this-repo-url> ~/WORK/TOOLS/claude-statusline
cd ~/WORK/TOOLS/claude-statusline
./install.sh
```

Requires [`jq`](https://jqlang.org) (`brew install jq` / `apt install jq`) and
`curl` (for the public IPv4 lookup; preinstalled on macOS and most Linux
distros).

`install.sh` is safe to re-run — it only touches the top-level `statusLine`
key in `~/.claude/settings.json`, leaving every other setting (permissions,
model, theme, etc.) untouched. If `~/.claude/settings.json` doesn't exist
yet, it creates one.

## Manual install

If you'd rather not run the script:

1. Copy `statusline.sh` to `~/.claude/statusline-command.sh` and `chmod +x` it.
2. Add this to `~/.claude/settings.json` (merge with whatever's already there):

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "bash /Users/you/.claude/statusline-command.sh"
     }
   }
   ```

## How it works

Claude Code pipes a JSON blob to the statusline command's stdin on every
turn, including a pre-calculated `context_window` object, `workspace`
(current directory and, when available, repo name — the same current
directory is shown directly in its own section, with `$HOME` collapsed
to `~`), and (when available)
a `rate_limits` object with `five_hour` / `seven_day` usage percentages.
`statusline.sh` reads those fields directly with `jq` — no transcript
parsing needed — and renders each percentage as a 20-character Unicode
block bar. The git branch isn't in the JSON payload, so the script runs a
quick local `git branch --show-current` in the reported working directory.
The username comes from `whoami`. The public IPv4 address is looked up via
[ipify](https://www.ipify.org) and cached on disk for 5 minutes (keyed by
a fixed path, shared across all sessions) since it's a network call —
a failed lookup (e.g. offline) keeps the last known-good value, times out
after 1.5s, and doesn't retry again until the cache expires.

## VS Code status bar

Claude Code's VS Code chat panel never runs the `statusLine` command, so
the statusline above only shows up in a terminal. `vscode-extension/` is a
small companion extension that puts the same information in VS Code's
status bar, at the bottom of every window, next to the official Claude
Code extension (it doesn't replace it). Clicking it opens Claude Code.

```bash
./install.sh          # the terminal statusline also feeds the extension (see below)
./install-vscode.sh   # needs Node (npx) and VS Code's `code` CLI
```

Then reload VS Code windows (`Developer: Reload Window`).

To share it, run `./package-vscode.sh`. It builds
`dist/claude-statusline-<version>.vsix` (gitignored) with the `vsce` version
pinned in `vscode-extension/package-lock.json`. Others install that file
from VS Code's Extensions view (**⋯ → Install from VSIX…**) or with
`code --install-extension <file>.vsix`. They'll also need `./install.sh` for
the quotas (see below). Bump `version` in `vscode-extension/package.json`, and
add a `vscode-extension/CHANGELOG.md` entry, for each release.

Where each piece comes from:

- **Model, effort, context used, path:** from the newest Claude Code
  transcript for the open workspace (`~/.claude/projects/<workspace>/*.jsonl`),
  which both the chat panel and the CLI write. It updates every 2 seconds.
- **Repo/branch, username, public IP:** read directly, using the same IP
  cache file as `statusline.sh`.
- **5h / 7d quotas:** these are only ever handed to the `statusLine` command,
  so `statusline.sh` snapshots its data to `~/.claude/statusline-live.json` and
  the extension shows the latest values and reset times (they're
  account-wide, so any terminal session will do). The tooltip shows how old
  they are. Each one is hidden once its window has reset, since the old
  percentage no longer applies.
- **Context window size:** transcripts don't record it, so `statusline.sh`
  keeps a per-model map (`ctx_sizes`) of the sizes Claude Code has reported.
  Until a model has been seen, it falls back to 200k (1M for `[1m]` models).
  You can also set `claudeStatusline.contextWindowSize` explicitly.

VS Code's status bar is a single row shared with everything else, so the
extension shows both lines of the terminal statusline side by side, minus the
folder and repo:branch (VS Code already shows those):

```
✱ Sonnet 5 - xhigh   💻 alice@203.0.113.42   Context window [█░░░░] 4% (45k/1000k)   Session (5h) [█░░░░] 10% ↻4h   Weekly (7d) [██░░░] 43% ↻3d
```

On API billing the two quota segments become `Session $1.23` and
`Month $45.67`. These are only ever the figures Claude Code reported to the
terminal statusline (read from its ledger); nothing is estimated. The VS Code
panel never reports cost, so its sessions aren't counted and the session
figure is hidden when the open session isn't in the ledger. Set
`claudeStatusline.usageView` (`auto`/`quota`/`cost`) to override detection.

Hovering shows exact reset times, the folder, and repo:branch. Set
`claudeStatusline.showLocation` to also put the folder and repo:branch in the
bar itself, and
`claudeStatusline.barWidth` (default 5) to change the bar length. VS Code
colors a status bar item as a whole, so each segment gets one color.

## Updating

Edit `statusline.sh` here, then re-run `./install.sh` on each machine to
pick up the change (or just edit `~/.claude/statusline-command.sh` directly on a
given machine, then copy the change back here).
