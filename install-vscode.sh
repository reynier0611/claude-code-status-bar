#!/usr/bin/env bash
# Packages vscode-extension/ into dist/ (via package-vscode.sh) and installs it into VS Code.
# Run ./install.sh first: the VS Code status bar reads the 5h/7d quotas and
# context-window sizes that the terminal statusline snapshots to disk.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CODE_BIN="$(command -v code || true)"
if [ -z "$CODE_BIN" ] && [ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
  CODE_BIN="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
fi
if [ -z "$CODE_BIN" ]; then
  echo "VS Code's 'code' CLI not found (in VS Code: Cmd+Shift+P → 'Shell Command: Install code command in PATH')." >&2
  exit 1
fi
VSIX=$("$REPO_DIR/package-vscode.sh" | tail -1)
"$CODE_BIN" --install-extension "$VSIX" --force

echo "Installed $(basename "$VSIX") into VS Code."
echo "Reload open VS Code windows (Cmd+Shift+P → 'Developer: Reload Window') to see it."
