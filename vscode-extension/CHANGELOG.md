# Changelog

## 0.4.0

- Detects subscription vs. API billing. On API billing the 5h/7d quota bars
  give way to `Session $…` and `Month $…`, using only the cost Claude Code
  reported to the terminal statusline (no estimates).
- New setting `claudeStatusline.usageView`.

## 0.3.1

- Reset countdowns are shown as `↻4h` again instead of `(resets in 4h)`.

## 0.3.0

- Matches the terminal statusline: `Sonnet 5 - xhigh`, `💻 user@IP`,
  `Context window [bar] 4% (45k/1000k)`, and `Session (5h)` / `Weekly (7d)`
  bars with `(resets in …)`.
- `claudeStatusline.showLocation` now only covers the folder and repo:branch.

## 0.2.0

- Compact status bar: model/effort, context, 5h and 7d bars; user@IP, folder,
  and repo:branch moved to the tooltip (`claudeStatusline.showLocation` to
  show them in the bar).
- Quotas show a countdown to their reset (`37m`, `4h`, `3d`) and are hidden
  once their window has reset.
- Context window sizes come from a per-model map kept by the terminal
  statusline.

## 0.1.x

- Initial release: mirrors the terminal statusline into the status bar from
  Claude Code session transcripts, including windows with no folder open.
