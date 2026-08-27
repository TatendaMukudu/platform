#!/usr/bin/env bash
# PREFLIGHT — refuse to start work in a state that has already cost us a week.
#
# Written instructions did not stop an agent working eleven days behind on `work` and
# re-implementing roughly 3,500 lines that already existed. Prose gives direction; only a
# script that exits non-zero actually prevents it.
#
# Run before ANY implementation session, by any agent or human:
#     bash scripts/codex-preflight.sh
#
# Exits 0 only when it is safe to start. Every failure names the fix.

set -uo pipefail

DEV_BRANCH="claude/platform-work-summary-nmb0cm"
FAIL=0
say() { printf '  %-4s %s\n' "$1" "$2"; }
ok()   { say "OK" "$1"; }
bad()  { say "STOP" "$1"; FAIL=1; }

echo
echo "PREFLIGHT — $(date -u '+%Y-%m-%d %H:%M UTC')"
echo

# 1 ── Are we in the repository at all?
git rev-parse --git-dir >/dev/null 2>&1 || { bad "not inside a git repository"; exit 1; }

# 2 ── Can we reach the remote? Checked FIRST, because every later check needs it and
#      discovering a network problem after an hour of work is the expensive order.
if git fetch --prune origin >/dev/null 2>&1; then
  ok "remote reachable, refs fetched"
else
  bad "cannot fetch origin — fix connectivity before starting, not after"
fi

# 3 ── The branch. The single most expensive mistake available here.
CURRENT="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
if [ "$CURRENT" = "$DEV_BRANCH" ]; then
  ok "on the development branch ($DEV_BRANCH)"
elif git merge-base --is-ancestor "origin/$DEV_BRANCH" HEAD 2>/dev/null; then
  ok "on task branch '$CURRENT', based on current $DEV_BRANCH"
else
  bad "on '$CURRENT', which is NOT $DEV_BRANCH and is not based on it"
  say "" "fix: git checkout $DEV_BRANCH && git reset --hard origin/$DEV_BRANCH"
  say "" "if you have work on '$CURRENT', say so before resetting — do not discard it silently"
fi

# 4 ── How far behind? Being behind is not fatal on a task branch, but it must be SEEN:
#      a branch cut twenty minutes before a status block never saw the status block.
if BEHIND="$(git rev-list --count "HEAD..origin/$DEV_BRANCH" 2>/dev/null)"; then
  if [ "$BEHIND" = "0" ]; then
    ok "up to date with origin/$DEV_BRANCH"
  elif [ "$BEHIND" -le 5 ]; then
    say "NOTE" "$BEHIND commit(s) behind origin/$DEV_BRANCH — rebase before you start"
  else
    bad "$BEHIND commits behind origin/$DEV_BRANCH — you will not see recent work and may rebuild it"
    say "" "fix: git rebase origin/$DEV_BRANCH"
  fi
fi

# 5 ── A dirty tree means someone else's half-finished change is about to be committed with yours.
if [ -z "$(git status --porcelain)" ]; then
  ok "working tree clean"
else
  bad "working tree is dirty — commit, stash or discard before starting"
  git status --short | head -5 | sed 's/^/       /'
fi

# 6 ── The documents an agent is told to read must actually exist at THIS commit.
for f in docs/INDEX.md docs/briefs/codex-pilot-programme.md AGENTS.md; do
  [ -f "$f" ] && ok "present: $f" || bad "missing: $f — the work order says to read it"
done

# 7 ── The truth layer is the arbiter, so it has to be runnable before work starts,
#      not discovered to be broken at commit time.
if [ -f package.json ] && grep -q '"test"' package.json; then
  ok "npm test is defined (the final arbiter)"
else
  bad "no npm test — the definition of done is unrunnable"
fi

echo
if [ "$FAIL" = "0" ]; then
  echo "  PREFLIGHT PASSED — safe to start."
  echo
  exit 0
fi
echo "  PREFLIGHT FAILED — do not start. Fix the items marked STOP."
echo
exit 1
