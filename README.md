# claude-statusline

A Claude Code statusline that always shows:

- The **model** in use, bold/highlighted so it stands out, with the current
  **reasoning effort** (when the model supports it)
- Your **username** and **public IPv4 address**
- The current **repo and git branch**
- **Context window** usage for the current conversation, as a progress bar
- **5-hour** session usage quota, as a progress bar
- **7-day** weekly usage quota (when your plan/gateway reports them), as a progress bar

```
*  Claude Sonnet 5 - high   |   alice@203.0.113.42   |   claude-statusline:main   |   Context window [██████░░░░] 61% (122k/200k)   |   Session (5h) [███░░░░░░░] 34%   |   Weekly (7d) [████████░░] 82%
```

A bold orange `*` (Claude's brand color) opens the line as a logo
stand-in, with the model name/effort in the same orange (not bold) so
they read as branded together. Sections are separated by wide `   |   `
gaps for scannability. Colors are tuned for dark-background terminals:
repo name bright magenta, branch bright blue, and everything else
(username/IP, labels, brackets, percentages) bright white — nothing
else is bold. Bars are 10 characters wide and color-coded (green < 50%,
yellow 50-79%, red ≥ 80%).
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
(current directory and, when available, repo name), and (when available)
a `rate_limits` object with `five_hour` / `seven_day` usage percentages.
`statusline.sh` reads those fields directly with `jq` — no transcript
parsing needed — and renders each percentage as a 10-character Unicode
block bar. The git branch isn't in the JSON payload, so the script runs a
quick local `git branch --show-current` in the reported working directory.
The username comes from `whoami`. The public IPv4 address is looked up via
[ipify](https://www.ipify.org) and cached on disk for 5 minutes (keyed by
a fixed path, shared across all sessions) since it's a network call —
a failed lookup (e.g. offline) keeps the last known-good value, times out
after 1.5s, and doesn't retry again until the cache expires.

## Updating

Edit `statusline.sh` here, then re-run `./install.sh` on each machine to
pick up the change (or just edit `~/.claude/statusline-command.sh` directly on a
given machine, then copy the change back here).
