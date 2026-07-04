#!/usr/bin/env bash
# install-claude-bundle.sh — place the Claude Code config bundle into the Astropress repo.
#
# Run this from the repo root with this package's folder reachable. It copies the
# .claude/ and .vscode/ trees in, makes the hooks executable, and ensures local
# Claude artifacts are gitignored. Safe to re-run. If you extracted the package
# *inside* the repo root already, you can skip this — the folders are in place.
set -uo pipefail

# Directory of this script (the package root is its parent).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "Package: $PKG_ROOT"
echo "Repo:    $REPO_ROOT"

if [ "$PKG_ROOT" = "$REPO_ROOT" ]; then
  echo "Package is already at the repo root — nothing to copy."
else
  cp -R "$PKG_ROOT/.claude" "$REPO_ROOT/"   && echo "  ok  .claude/"
  cp -R "$PKG_ROOT/.vscode" "$REPO_ROOT/"   && echo "  ok  .vscode/"
fi

# Hooks must be executable (matters for Git Bash too).
chmod +x "$REPO_ROOT/.claude/hooks/"*.sh 2>/dev/null || true
echo "  ok  hooks are executable"

# Keep machine-local Claude settings out of git (team settings.json is committed).
for line in '.claude/settings.local.json' 'CLAUDE.local.md' '.claude/.cache/'; do
  grep -qxF "$line" "$REPO_ROOT/.gitignore" 2>/dev/null || echo "$line" >> "$REPO_ROOT/.gitignore"
done
echo "  ok  .gitignore seeded"

echo
echo "Done. Commit the team config so everyone shares it:"
echo "  git add .claude .vscode .gitignore && git commit -S -m 'chore: Claude Code setup'"
echo "Then open the repo in VS Code and accept the recommended extensions,"
echo "or run 'claude' from Windows Terminal / PowerShell to start a session."
