# The Codex push path

Codex could read this repository but never write to it. Three completed tasks were stranded
in containers that were then reclaimed — the work was real, there was simply no way out of the
box. This document is the fix, and the checks that prove it works.

**A weigh-in that isn't in the repo didn't happen.** That rule is only fair if pushing is
possible.

---

## What was broken

Two separate things, and fixing one without the other changes nothing:

| | Symptom | Fix |
|---|---|---|
| **Read path** | workspace pinned 44 commits behind `main`; `docs/briefs/` absent | reset the environment cache (done) |
| **Write path** | `CONNECT tunnel failed, response 403`, and "no configured remote" | this document |

The write path needs three things at once: network access, a remote, and a credential. Codex
had none of them.

---

## Setup — four steps, done once

### 1. Turn on Agent internet access

Codex environment → **platform** → Edit → **Agent internet access: On**.

The agent process is what runs `git push`. With access off, the environment's own
infrastructure can still clone for it, which is exactly why this failure was confusing: Codex
appeared to have a working repo right up until it tried to deliver.

### 2. Create a fine-grained token

GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate.

- **Repository access:** Only select repositories → `TatendaMukudu/platform`
- **Permissions:** `Contents: Read and write`, `Pull requests: Read and write`
- **Expiration:** set one. 90 days is reasonable; put a reminder to rotate.

Nothing broader. This token can write to one repository and do nothing else, so a leak costs
one repository rather than the account.

### 3. Add it as an environment variable

Codex environment → **Environment variables** → add:

```
GITHUB_TOKEN = <the token>
```

**Never commit this value.** It belongs in the environment only, exactly like `DATABASE_URL`
and `ANTHROPIC_API_KEY` (see `LIVE_SETUP.md`). If it ever lands in a commit, revoke it
immediately — rotating is cheap, and a token in git history is public forever.

### 4. Set the maintenance setup script

Codex environment → **Maintenance setup script** → paste the contents of
[`scripts/codex-setup.sh`](../scripts/codex-setup.sh).

It configures the remote, stores the credential in a `0600` file, and — the part that matters —
**verifies the push path at setup time** with `git push --dry-run`. A 403 then surfaces during
environment build rather than after an hour of work that cannot be delivered.

The token goes in `~/.git-credentials`, not in the remote URL, so `git remote -v` prints a
clean URL. A token in the URL rides into every log, transcript and error message the agent
pastes back into chat.

---

## Verifying it works

After the environment rebuilds, the setup log should end with:

```
codex-setup: push path VERIFIED — remote reachable and credential accepted.
codex-setup: remote is https://github.com/TatendaMukudu/platform.git
```

If instead it says `push path NOT working`, the three causes in order of likelihood are:
internet access still off, token missing `Contents: write`, or token expired.

### The canary task

Before spending a real task on it, dispatch this. It is cheap, non-destructive, and it fails
loudly rather than silently:

> Report only. Run `git log --oneline -1`, `git remote -v`, and
> `git push --dry-run origin HEAD:refs/heads/codex/connectivity-check`. Paste all three
> outputs verbatim. Change nothing and push nothing.

**Pass:** HEAD at current `main`, a remote pointing at `TatendaMukudu/platform`, and a dry-run
that completes without a 403.

**Fail:** any 403, or `remote is NOT SET`.

---

## Rules once it works

- **Push to `codex/<topic>`, never to `main` and never to another agent's branch.** `main` is
  the deploy branch; see AGENTS.md §3.
- **Open a PR.** A pushed branch generates no webhook anyone receives, so it can sit unnoticed.
  A PR wakes review and CI automatically.
- **A task is not done until it is pushed.** Local commits die with the container. This is not
  a process preference — it is what the last three stranded tasks cost.
- **Paste real command output, never a summary of it.** `implemented != tested !=
  integration-tested != proven`.

## If it still cannot push

Then Codex is a read-only advisor on this plan, and that is worth knowing rather than
rediscovering each session. Route implementation to whoever can write to the repo, and use
Codex for review, investigation and second opinions — which it can do perfectly well from a
clone it cannot push.
