# claude-statusline

A Claude Code statusline that always shows, as progress bars:

- **Context window** usage for the current conversation
- **5-hour** session usage quota
- **7-day** weekly usage quota (when your plan/gateway reports them)

```
Claude Sonnet 5 | Ctx [██████░░░░] 61% (122k/200k) | 5h [███░░░░░░░] 34% | 7d [████████░░] 82%
```

Bars are color-coded (green < 50%, yellow 50-79%, red ≥ 80%). The 5h/7d
segments only appear when Claude Code reports them (e.g. not present for
plain API-key usage without a subscription quota).

Applied globally via `~/.claude/settings.json`, so it's active in every
Claude Code session on the machine, in every project.

## Install (on any machine)

```bash
git clone <this-repo-url> ~/WORK/TOOLS/claude-statusline
cd ~/WORK/TOOLS/claude-statusline
./install.sh
```

Requires [`jq`](https://jqlang.org) (`brew install jq` / `apt install jq`).

`install.sh` is safe to re-run — it only touches the top-level `statusLine`
key in `~/.claude/settings.json`, leaving every other setting (permissions,
model, theme, etc.) untouched. If `~/.claude/settings.json` doesn't exist
yet, it creates one.

## Manual install

If you'd rather not run the script:

1. Copy `statusline.sh` to `~/.claude/statusline.sh` and `chmod +x` it.
2. Add this to `~/.claude/settings.json` (merge with whatever's already there):

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "/Users/you/.claude/statusline.sh"
     }
   }
   ```

## How it works

Claude Code pipes a JSON blob to the statusline command's stdin on every
turn, including a pre-calculated `context_window` object and (when
available) a `rate_limits` object with `five_hour` / `seven_day` usage
percentages. `statusline.sh` reads those fields directly with `jq` — no
transcript parsing needed — and renders each percentage as a 10-character
Unicode block bar.

## Updating

Edit `statusline.sh` here, then re-run `./install.sh` on each machine to
pick up the change (or just edit `~/.claude/statusline.sh` directly on a
given machine, then copy the change back here).
