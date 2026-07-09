# AGENTS.md — the contract every agent works under

This repo is built by a **council**: a founder (taste + direction), and AI
implementers (Claude, Codex) who write and review each other's code. GPT is
used for architecture discussion. **The tests are the arbiter** — not seniority,
not confidence, not who wrote it. Read this before touching anything.

---

## 0. The one rule that overrides all others

**`npm test` must be GREEN before anything merges.** If it's red, it doesn't
merge — no matter who wrote it or how sure they are. See `TESTING.md` for what
the suite guards and why. CI (`.github/workflows/ci.yml`) enforces this on every
push and PR automatically, so there's no "I forgot to run it."

```bash
npm test        # syntax-check all sources + run every suite. One verdict.
```

No DB and no API key are needed to run it — everything in the truth layer is
pure and deterministic on purpose.

---

## 1. What this product is (so you don't drift)

IntelliQ + Platform is **one kernel, two lenses**:
- **IntelliQ** = an individual's private growth record (a mirror, self-relative).
- **Platform** = an organisation's intelligence over its people.

The kernel is **domain-agnostic in LOGIC, domain-parameterised in METADATA**.
It must reason over *any* typed stream (athletics today, anything tomorrow) —
never hard-code an industry into the logic. "No logic, yes parameters."

The five cognitive agents (`ai/agents.js`): **Observer** (notice), **Historian**
(remember), **Analyst** (connect), **Coach** (reflect), **Learner** (improve).

---

## 2. The product laws (non-negotiable — encoded in `scripts/invariants.js`)

Breaking any of these turns the suite red. They are the spec of *what IntelliQ is
allowed to say*:

1. **Directional, never graded.** No `x/100` scores, no letter grades as verdicts.
2. **Honest language.** No "prediction" / deterministic "will quit" claims.
3. **Correlation is not cause.** Cross-signal output never asserts a cause.
4. **Never surface NaN/undefined** to a human.
5. **Self-relative.** The Coach reflects vs the person's *own* normal — never a score.
6. **Confidence honesty.** Never claim reliability below the feedback floor.
7. **Privacy by construction.** Engine items carry **no raw text fields**; sensitive
   context is a **contentless flag** only.
8. **Fairness.** A stable-but-low person is never flagged for being different.
9. **Universality.** Patterns fire on any typed stream, domain-free.

### The privacy law (absolute)

Sensitive / hardship information **may inform** the AI's reasoning but must
**NEVER be revealed, quoted, or surfaced**. `ai/gateway.js` and the privacy gate
classify + redact; `scripts/privacy-smoke.js` guards it. Do not weaken it.

---

## 3. How to work here

- **Fix a bug → add a golden case.** Every defect becomes a permanent test in
  `scripts/eval.js` (or the relevant smoke) so it can never silently return.
- **New capability → a new invariant or golden case** that pins both what it
  *must* do and what it must *never* do.
- **Two implementers review each other's diffs.** Tests break ties, not rank.
- **Consolidate, don't sprawl.** Prefer strengthening the kernel over adding pages.
- **Small, honest commits.** Say what changed and why. Never claim something runs
  or passes that you didn't actually run — a self-report is not truth; the shared
  repo + CI is truth.

### Branch + deploy

- Development branch: **`claude/platform-work-summary-nmb0cm`**.
- `main` is the deploy branch (fast-forward from the dev branch to release).
- **Never push to a branch you weren't asked to.** GitHub scope is limited to
  `tatendamukudu/platform`.
- Open a PR only when asked. Every push triggers CI — keep it green.

### Environment / safety

- Never disable TLS verification or unset `HTTPS_PROXY`.
- Never commit secrets. `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`
  live in the environment only. See `LIVE_SETUP.md`.

---

## 4. The map (where things live)

| Area | Files |
|---|---|
| Server (monolith) | `server.js`, `db.js` |
| Kernel — agents | `ai/agents.js` |
| Kernel — patterns | `ai/intelligence.js`, `ai/primitives.js` |
| Kernel — baselines | `ai/baseline.js` |
| Kernel — confidence | `ai/confidence.js` |
| Domain packs / primitives | `ai/packs.js` |
| AI gateway (Claude + OpenAI) | `ai/gateway.js`, `ai/embeddings.js` |
| Source adapters | `ai/adapters.js` |
| Frontend | `index.html`, `js/app.js`, `js/member-view.js`, `js/data.js` |
| Truth layer | `scripts/test.js`, `scripts/*-smoke.js`, `scripts/eval.js`, `scripts/invariants.js` |
| Demo seed | `scripts/seed.js` (`npm run seed`, needs `DATABASE_URL`) |
| Contracts / docs | `TESTING.md`, `LIVE_SETUP.md`, this file |

---

## 5. The council's division of labour

- **Founder** — direction, taste, the final call on product.
- **GPT** — architecture and design discussion.
- **Claude** — implementation + architecture.
- **Codex** — implementation + review.
- **Tests / evals** — the truth layer. The tiebreaker. Always.

If two agents disagree, the answer is: **write the test that decides it.**
