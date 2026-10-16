# Claude Statusline

Shows your Claude Code session status in VS Code's status bar, for when you
use the Claude Code chat panel (which doesn't run the terminal `statusLine`
command):

```
✱ Sonnet 5 - xhigh   💻 alice@203.0.113.42   Context window [█░░░░] 4% (45k/1000k)   Session (5h) [█░░░░] 10% ↻4h   Weekly (7d) [██░░░] 43% ↻3d
```

- **Model and effort** of the most recent Claude Code session in the open folder
- **Username and public IPv4 address**
- **Context window** usage
- **5-hour and 7-day quotas**, with a countdown to each reset (`37m`, `4h`, `3d`)

Hover for details (exact reset times, folder, repo:branch). Click to open Claude Code. This works alongside Anthropic's
Claude Code extension; it doesn't replace it.

## Requirements

Model, effort, and context come from Claude Code's session transcripts and
work on their own. The quotas and per-model context window sizes are only
available to Claude Code's terminal `statusLine` command, so install the
terminal statusline from
[claude-code-status-bar](https://github.com/reynier0611/claude-code-status-bar)
(`./install.sh`, needs `jq`) and run a terminal Claude Code session once.
Quotas are hidden once their window has reset.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `claudeStatusline.showLocation` | `false` | Also show the folder and repo:branch in the bar |
| `claudeStatusline.barWidth` | `5` | Progress bar length in characters |
| `claudeStatusline.contextWindowSize` | `0` | Context window size in tokens; `0` = auto |
