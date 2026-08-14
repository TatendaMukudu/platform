#!/usr/bin/env bash
# Codex environment setup — establishes a working PUSH path.
#
# Set the Codex environment's "Setup script" (Manual) to:  bash scripts/codex-setup.sh
# Network access is always enabled for that step, which is why the remote and credential must
# be established there. Putting the same line in "Maintenance script" too is safe — this is
# idempotent — and re-verifies before every task.
#
# The failure this exists for: Codex could clone (its infrastructure does that) but never push
# (the agent does that). Completed tasks were stranded in containers that were then reclaimed.
#
# Never fails the environment build. A broken setup script would leave Codex unable to work at
# all, which is worse than unable to push.
#
# ── Why this is so defensive ───────────────────────────────────────────────────────────────
# Three earlier versions each "fixed" the push path and each still failed, because each
# assumed which step was broken instead of measuring it. This one measures: it verifies that
# git config persisted, probes git's own credential system directly, and falls through a
# ladder of strategies until a real dry-run push succeeds. It reports which rung worked.

set -uo pipefail

REPO_URL="https://github.com/TatendaMukudu/platform.git"
REPO_DIR="${CODEX_REPO_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CRED_FILE="/tmp/.codex-git-credentials"
PROBE_REF="refs/heads/codex/connectivity-check"

cd "$REPO_DIR" 2>/dev/null || { echo "codex-setup: no repo directory at $REPO_DIR"; exit 0; }

say() { echo "codex-setup: $*"; }

# Remote first and unconditionally. An earlier version returned early when the token was
# missing, leaving no remote, so the symptom read as "'origin' does not appear to be a git
# repository" — pointing at the clone rather than the credential. Different faults must not
# produce the same message.
git remote remove origin 2>/dev/null
git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
git config --global user.name  "Codex"           2>/dev/null
git config --global user.email "codex@users.noreply.github.com" 2>/dev/null
git config --global push.default current         2>/dev/null

# Presence only, never the value. The obvious one-liner is a trap and it leaked a live token:
#     echo "${GITHUB_TOKEN:+SET}${GITHUB_TOKEN:-NOT SET}"
# ${VAR:-default} substitutes VAR'S VALUE when set, so the branch labelled "NOT SET" printed
# the secret exactly when there was one. Guarded by scripts/epistemic-invariants-smoke.js,
# which runs this script WITH a token and asserts the value never reaches output.
if [ -n "${GITHUB_TOKEN:-}" ]; then
  say "GITHUB_TOKEN is SET (${#GITHUB_TOKEN} chars)"
else
  say "GITHUB_TOKEN is NOT SET"
  say "remote configured, but there is no credential. PUSH WILL FAIL."
  say "add GITHUB_TOKEN to the Codex environment VARIABLES (not Secrets), then reset the cache."
  exit 0
fi

say "HOME=${HOME:-<unset>}  user=$(id -un 2>/dev/null || echo '?')  git=$(git --version 2>/dev/null | awk '{print $3}')"

# Does git's credential system actually hand back a password for github.com? This is the
# question the push is really asking, and asking it directly is the difference between knowing
# and guessing. grep -q consumes the output, so the credential is never printed.
cred_probe() {
  printf 'protocol=https\nhost=github.com\n\n' \
    | timeout 15 git credential fill 2>/dev/null \
    | grep -q '^password='
}

# The real test. Contacts the remote and authenticates without writing anything, so a 403
# surfaces here rather than after an hour of undeliverable work.
push_probe() {
  timeout 45 git push --dry-run origin "HEAD:$PROBE_REF" >/dev/null 2>&1
}

# ── Rung 1: credential helper with an absolute file ────────────────────────────────────────
# Absolute, and the helper names it explicitly: the setup step and the task step do not
# necessarily share $HOME, so a credential written to ~ can simply be absent later.
printf 'https://x-access-token:%s@github.com\n' "$GITHUB_TOKEN" > "$CRED_FILE" 2>/dev/null
chmod 600 "$CRED_FILE" 2>/dev/null
git config --system credential.helper "store --file=$CRED_FILE" 2>/dev/null
git config --global credential.helper "store --file=$CRED_FILE" 2>/dev/null

# Verify the config PERSISTED rather than assuming it did — the previous version's blind spot.
if [ -n "$(git config --get credential.helper 2>/dev/null)" ]; then
  say "rung 1: credential.helper is configured"
else
  say "rung 1: git config did not persist a credential.helper (HOME unwritable?)"
fi
[ -s "$CRED_FILE" ] && say "rung 1: credential file written" || say "rung 1: credential file NOT written"
cred_probe && say "rung 1: git credential fill RETURNS a credential" \
           || say "rung 1: git credential fill returns nothing"

if push_probe; then
  say "push path VERIFIED via credential helper."
  say "remote is $(git remote get-url origin)"
  exit 0
fi

# ── Rung 2: url.insteadOf rewrite ──────────────────────────────────────────────────────────
# Rewrites the URL at transport time, so `git remote -v` still prints a clean URL while the
# push carries the token. Needs global config to be readable at push time.
say "rung 1 failed — trying url.insteadOf"
git config --global "url.https://x-access-token:${GITHUB_TOKEN}@github.com/.insteadOf" \
  "https://github.com/" 2>/dev/null

if push_probe; then
  say "push path VERIFIED via url.insteadOf (remote -v stays clean)."
  say "remote is $(git remote get-url origin)"
  exit 0
fi

# ── Rung 3: token embedded in the remote URL ───────────────────────────────────────────────
# Last resort, and it has a real cost: `git remote -v` will print the token. The container is
# ephemeral and single-tenant so the exposure is bounded, but an agent that pastes `git remote
# -v` into chat leaks it — which has already happened once tonight by a different route.
say "rung 2 failed — trying an authenticated remote URL"
git config --global --unset-all "url.https://x-access-token:${GITHUB_TOKEN}@github.com/.insteadOf" 2>/dev/null
git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/TatendaMukudu/platform.git"

if push_probe; then
  say "push path VERIFIED via authenticated remote URL."
  say "WARNING: the remote URL now contains the token."
  say "WARNING: do NOT run or paste 'git remote -v' — it will print the credential."
  exit 0
fi

# ── All rungs failed ───────────────────────────────────────────────────────────────────────
git remote set-url origin "$REPO_URL"   # leave no token behind in a path that does not work
say "push path NOT working after all three strategies."
say "the token is present, so this is most likely the network: either Agent internet access is"
say "off, or the proxy blocks writes to github.com. Check, in order:"
say "  1. Agent internet access is On for this environment"
say "  2. the token is unexpired and has Contents: Read and write on TatendaMukudu/platform"
say "  3. the environment cache was reset after the token was added"
say "remote is $(git remote get-url origin)"
