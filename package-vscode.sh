#!/usr/bin/env bash
# Builds dist/claude-statusline-<version>.vsix from vscode-extension/ — the
# file to share. Install it with install-vscode.sh, `code --install-extension`,
# or VS Code's Extensions view → ⋯ → Install from VSIX.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$REPO_DIR/vscode-extension"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm (Node.js) is required to package the extension — install Node and re-run." >&2
  exit 1
fi

mkdir -p "$REPO_DIR/dist"
cd "$EXT_DIR"
npm ci --silent --no-audit --no-fund
npm run --silent package

VERSION=$(node -p "require('./package.json').version")
echo "$REPO_DIR/dist/claude-statusline-$VERSION.vsix"
