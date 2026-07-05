#!/usr/bin/env bash
# Walk every commit in the PR range and reject the push if any of them
# lack a signature. GitHub evaluates the full default-branch diff, not
# only commits newer than the branch upstream. git log --format="%G?"
# returns:
#   G  good signature          U  unknown key (sig present)
#   X  expired sig             Y  expired key
#   E  key not in allowedSigners (SSH, sig present but unverified)
#   N  NO signature at all  ← the only value we must reject
#
# Note: E is normal for SSH-signed commits when gpg.ssh.allowedSignersFile
# is not configured in CI; the signature still exists, we just can't
# verify trust.  We only block N.
default_ref=""
if git symbolic-ref -q refs/remotes/origin/HEAD >/dev/null 2>&1; then
  default_ref=$(git symbolic-ref --short refs/remotes/origin/HEAD)
elif git rev-parse --verify origin/main >/dev/null 2>&1; then
  default_ref="origin/main"
elif git rev-parse --verify main >/dev/null 2>&1; then
  default_ref="main"
fi
if [ -n "$default_ref" ]; then
  commits=$(git rev-list "${default_ref}..HEAD" 2>/dev/null || true)
else
  commits=$(git rev-list HEAD --not --remotes 2>/dev/null || true)
fi
if [ -z "$commits" ]; then
  exit 0
fi
unsigned=""
for commit in $commits; do
  sig=$(git log --format="%G?" -1 "$commit" 2>/dev/null || echo "N")
  if [ "$sig" = "N" ]; then
    unsigned="$unsigned\n  $(git log --format='%h %s' -1 "$commit")"
  fi
done
if [ -n "$unsigned" ]; then
  echo ""
  echo "❌  The following commits are not signed:"
  printf "%b\n" "$unsigned"
  echo ""
  echo "    Re-sign the range with:"
  echo "    git rebase --rebase-merges --exec 'git commit --amend -S --no-edit --no-verify' \\"
  if [ -n "$default_ref" ]; then
    echo "      ${default_ref}"
  else
    echo "      \$(git rev-list HEAD --not --remotes | tail -1)^"
  fi
  echo ""
  exit 1
fi
echo "✔ All pushed commits carry a signature."
