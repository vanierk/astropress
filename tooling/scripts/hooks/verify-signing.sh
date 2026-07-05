#!/usr/bin/env bash
# Commits to main require a GPG or SSH signature (enforced by the
# GitHub branch ruleset). Verify both that config is correct AND that
# the key can actually produce a signature right now, so a silent
# failure (agent not running, wrong passphrase, etc.) is caught before
# the commit rather than discovered after a push is rejected.
gpgsign=$(git config --get commit.gpgsign 2>/dev/null || true)
if [ "$gpgsign" != "true" ]; then
  echo ""
  echo "❌  Commit signing is not configured locally."
  echo "    GitHub requires signed commits on main."
  echo ""
  echo "    GPG key:  git config --global commit.gpgsign true"
  echo "              git config --global user.signingkey <KEY-ID>"
  echo ""
  echo "    SSH key:  git config --global gpg.format ssh"
  echo "              git config --global user.signingkey /path/to/key.pub"
  echo "              git config --global commit.gpgsign true"
  echo ""
  echo "    See AGENTS.md § Signing setup for full instructions."
  exit 1
fi
signingkey=$(git config --get user.signingkey 2>/dev/null || true)
gpg_format=$(git config --get gpg.format 2>/dev/null || echo "openpgp")
if [ -z "$signingkey" ] && [ "$gpg_format" = "openpgp" ]; then
  echo ""
  echo "❌  commit.gpgsign is true but user.signingkey is not set."
  echo "    Find your key ID: gpg --list-secret-keys --keyid-format=long"
  echo "    Then: git config --global user.signingkey <KEY-ID>"
  echo ""
  exit 1
fi
# Perform a live test-sign to confirm the key is accessible right now.
# This catches 'agent not running' and similar silent failures that
# would otherwise produce an unsigned commit without any error.
if [ "$gpg_format" = "ssh" ]; then
  key_file="$signingkey"
  # Strip leading ~ manually in POSIX sh
  case "$key_file" in
    "~/"*) key_file="$HOME/${key_file#~/}" ;;
  esac
  if ! printf 'test' | ssh-keygen -Y sign -f "$key_file" -n git - >/dev/null 2>&1; then
    echo ""
    echo "❌  SSH signing key is configured but could not sign."
    echo "    Is your SSH agent running and does it have the key loaded?"
    echo "    Check: ssh-add -l"
    echo "    Load:  ssh-add $key_file"
    echo ""
    exit 1
  fi
else
  if ! printf 'test' | gpg --sign --batch --quiet --output /dev/null 2>/dev/null; then
    echo ""
    echo "❌  GPG key is configured but could not sign."
    echo "    Is gpg-agent running?  gpgconf --launch gpg-agent"
    echo ""
    exit 1
  fi
fi
# Also reject creating new commits on top of unsigned branch history.
# GitHub checks the full PR range against the default branch, not just
# the newest commit, so local hooks must do the same.
default_ref=""
if git symbolic-ref -q refs/remotes/origin/HEAD >/dev/null 2>&1; then
  default_ref=$(git symbolic-ref --short refs/remotes/origin/HEAD)
elif git rev-parse --verify origin/main >/dev/null 2>&1; then
  default_ref="origin/main"
elif git rev-parse --verify main >/dev/null 2>&1; then
  default_ref="main"
fi
if [ -n "$default_ref" ]; then
  unsigned=""
  commits=$(git rev-list "${default_ref}..HEAD" 2>/dev/null || true)
  for commit in $commits; do
    sig=$(git log --format="%G?" -1 "$commit" 2>/dev/null || echo "N")
    if [ "$sig" = "N" ]; then
      unsigned="$unsigned\n  $(git log --format='%h %s' -1 "$commit")"
    fi
  done
  if [ -n "$unsigned" ]; then
    echo ""
    echo "❌  This branch already contains unsigned commits relative to ${default_ref}:"
    printf "%b\n" "$unsigned"
    echo ""
    echo "    Re-sign them before creating more commits on top:"
    echo "    git rebase --rebase-merges --exec 'git commit --amend -S --no-edit --no-verify' ${default_ref}"
    echo ""
    exit 1
  fi
fi
