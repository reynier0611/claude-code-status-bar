#!/usr/bin/env bash
# Installs the statusline script globally for Claude Code (applies to every
# session on this machine, regardless of working directory) and registers it
# in ~/.claude/settings.json without touching any other settings.
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required (e.g. 'brew install jq' or 'apt install jq') — install it and re-run." >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"
SCRIPT_DEST="$CLAUDE_DIR/statusline-command.sh"

mkdir -p "$CLAUDE_DIR"
cp "$REPO_DIR/statusline.sh" "$SCRIPT_DEST"
chmod +x "$SCRIPT_DEST"

if [ -f "$SETTINGS" ]; then
  tmp=$(mktemp)
  jq --arg cmd "bash $SCRIPT_DEST" '.statusLine = {"type": "command", "command": $cmd}' "$SETTINGS" > "$tmp"
  # Write through (not mv) so a symlinked settings.json keeps pointing at its real target.
  cat "$tmp" > "$SETTINGS"
  rm -f "$tmp"
else
  jq -n --arg cmd "bash $SCRIPT_DEST" '{"statusLine": {"type": "command", "command": $cmd}}' > "$SETTINGS"
fi

echo "Installed statusline script: $SCRIPT_DEST"
echo "Updated: $SETTINGS (all other keys preserved)"
echo "Start a new Claude Code session (or open a new terminal tab) to see it."
