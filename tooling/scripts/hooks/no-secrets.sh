#!/usr/bin/env bash
if git diff --cached --name-only | grep -qE '(^|/)\.env(\.|$)'; then
  echo "Refusing to commit .env files — remove them from the staging area."
  exit 1
fi
