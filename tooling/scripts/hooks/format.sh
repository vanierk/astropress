#!/usr/bin/env bash
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
  exit 0
fi
msg=$(head -1 "$1")
echo "$msg" | grep -qE '^(Merge|Revert|fixup!|squash!)' && exit 0
if ! echo "$msg" | grep -qE '^(feat|fix|chore|docs|test|refactor|perf|ci|build|revert)(\(.+\))?: .{1,72}$'; then
  echo "Commit message must follow conventional commits format:"
  echo "  type(scope)?: subject  (subject max 72 chars)"
  echo "  Types: feat fix chore docs test refactor perf ci build revert"
  exit 1
fi
