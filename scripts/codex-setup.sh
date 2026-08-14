#!/usr/bin/env bash
# Codex environment setup — establishes a working PUSH path.
#
# Paste this into the Codex environment's "Maintenance setup script" field. It runs during
# environment setup, where the network is available, and it is the only place the push path
# can be configured: by the time the agent is running, `git push` needs a remote and a
# credential that already exist.
#
# The failure this exists for: Codex could clone (its infrastructure does that) but never
# push (the agent does that). Three completed tasks were stranded in containers that were
# then reclaimed. The work was real; there was simply no way out of the box.
#
# Never fails the environment build. A missing token warns and continues — a broken setup
# script would leave Codex unable to work at all, which is worse than unable to push.

set -uo pipefail

REPO_URL="https://github.com/TatendaMukudu/platform.git"
REPO_DIR="${CODEX_REPO_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

cd "$REPO_DIR" 2>/dev/null || { echo "codex-setup: no repo directory at $REPO_DIR"; exit 0; }

# The remote is configured FIRST and unconditionally, before anything can go wrong with the
# credential. An earlier version returned early when the token was missing, which left no
# remote at all — so the failure read as "'origin' does not appear to be a git repository"
# and pointed at the wrong problem entirely. A missing token and a missing remote are
# different faults and must not produce the same symptom.
git remote remove origin 2>/dev/null
git remote add origin "$REPO_URL" || git remote set-url origin "$REPO_URL"

git config --global user.name  "Codex"
git config --global user.email "codex@users.noreply.github.com"
git config --global push.default current

# Presence only, never the value — this line goes into logs the agent may paste back.
#
# The obvious one-liner is a trap and it leaked a live token once:
#     echo "... ${GITHUB_TOKEN:+SET}${GITHUB_TOKEN:-NOT SET}"
# ${VAR:-default} substitutes VAR'S VALUE when VAR is set, so the "NOT SET" branch printed the
# secret exactly when there was a secret to print. Test a redaction against the SET case; the
# unset case cannot reveal anything and proves nothing.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  echo "codex-setup: GITHUB_TOKEN is SET (${#GITHUB_TOKEN} chars)"
else
  echo "codex-setup: GITHUB_TOKEN is NOT SET"
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "codex-setup: remote configured, but there is no credential. PUSH WILL FAIL."
  echo "codex-setup: add GITHUB_TOKEN to the Codex environment variables, then reset the cache."
  echo "codex-setup: remote is $(git remote get-url origin 2>/dev/null || echo 'NOT SET')"
  exit 0
fi

# Credentials live in a 0600 file, not in the remote URL. Putting the token in the URL means
# `git remote -v` prints it, and it then rides into any log, transcript or error message the
# agent pastes back. This keeps it out of all of them.
#
# The file path is ABSOLUTE and the helper names it explicitly. Relying on ~ failed in this
# environment with "could not read Username for 'https://github.com'": the setup step and the
# task step do not necessarily share $HOME, so a credential written to ~ at setup was simply
# not there when the agent later tried to push. An absolute path is the same path for both.
CRED_FILE="/tmp/.codex-git-credentials"
printf 'https://x-access-token:%s@github.com\n' "$GITHUB_TOKEN" > "$CRED_FILE"
chmod 600 "$CRED_FILE"

# --system first so the config is found whatever $HOME turns out to be, falling back to
# --global where there is no root. Both are set when possible; git reads system then global.
git config --system credential.helper "store --file=$CRED_FILE" 2>/dev/null \
  || echo "codex-setup: no system git config (not root) — using global only"
git config --global credential.helper "store --file=$CRED_FILE"

echo "codex-setup: HOME=$HOME  user=$(id -un 2>/dev/null || echo '?')  credfile=$CRED_FILE"

# Prove the credential actually works, without writing anything. --dry-run still contacts the
# remote and authenticates, so a 403 surfaces HERE, at setup, rather than after an hour of
# work that then cannot be delivered.
if git push --dry-run origin HEAD:refs/heads/codex/connectivity-check >/dev/null 2>&1; then
  echo "codex-setup: push path VERIFIED — remote reachable and credential accepted."
else
  echo "codex-setup: push path NOT working. Clone and tests are fine; pushes will fail."
  echo "codex-setup: check (1) Agent internet access is On, (2) the token has Contents: write"
  echo "codex-setup: on TatendaMukudu/platform, (3) the token has not expired."
fi

echo "codex-setup: remote is $(git remote get-url origin 2>/dev/null || echo 'NOT SET')"
