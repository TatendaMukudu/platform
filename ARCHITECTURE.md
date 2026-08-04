# IntelliQ — Architecture

> The map a human (you at 2am, or your first engineering hire) reads to understand the system.
> Kept honest: it says what's strong, what's load-bearing, and where the ceilings are.

## 1. The thesis, in one paragraph

IntelliQ is a **privacy-first, deterministic organisational-learning system**. The rule that
shapes everything: **the deterministic core owns truth and never fabricates; the LLM lives only
at the edges, governed.** The core reasons from recorded signals into beliefs it can defend; the
model is allowed to read messy input, reason about the *world*, and phrase things warmly — but it
may never assert an organisational fact it can't cite, never predict, never name a person it
wasn't given. "Agentic in initiative, governed in action."

## 2. The shape of the code

```
server.js            ~15k lines. The monolith: Express app, ~90 in-memory stores, every HTTP
                     endpoint, and the wiring that connects the pure modules to the outside world.
ai/*.js              The reasoning core + governed edges. PURE where it matters: no IO, no DB,
                     no network — deterministic functions the truth layer can test in isolation.
js/*.js              The frontend (vanilla, no framework): app.js (leader), member-view.js, etc.
css/styles.css       Styles.  index.html  the shell.  sw.js  the service worker (PWA).
scripts/*.js         The truth layer — one smoke suite per capability + test.js the runner.
```

### The boundary that matters most
`ai/*.js` is the **crown jewel and the moat**. Pure, deterministic, dependency-free reasoning:

- `reason.js` — the belief ledger + agenda (what's worth attention), roll-ups, calibration.
- `reasoning-register.js` — classifies a question (org-fact / world-knowledge / mixed / planning)
  and **enforces cite-or-ask in code**: an org claim without a real citation is demoted to a
  question, never asserted. This is what makes the LLM safe.
- `kernel-coreasoning.js` — the LLM helps the *kernel* reason over **de-identified aggregates**
  (counts, never people); proposes hypotheses to test, never writes a belief.
- `render-artifact.js` — the output edge: every figure in a rendered summary/email must trace to
  the source data (an invented number is caught, the plain version is shown instead).
- `safeguarding.js` — deterministic distress detection + crisis resources. **Works with the model
  off** — safety never depends on the LLM.
- Plus: `gateway.js` (the single LLM layer, Claude + OpenAI fallback + no-egress mode),
  `privacy.js`, `confidence.js`, `voice.js`, `retrieval.js`, `rate-limit.js`, `errorlog.js`,
  `metrics.js`, and the rest.

**Keep the monolith's mess out of these modules.** The day the pure boundary erodes is the day the
"deterministic, never fabricates" guarantee becomes a hope instead of a fact.

## 3. Data flow (one turn)

```
person types  →  POST /api/assistant/turn  →  _assistantTurn (server.js):
  1. safeguarding check (deterministic, FIRST) — a crisis short-circuits into resources + a flag
  2. capture decision (governed persist)       — a disclosure may become evidence (confirmed)
  3. reasoning register (org-fact vs world)     — routes to the grounded read or the governed edge
  4. governed reasoning (LLM, if a key + budget)— cite-or-ask enforced by assembleGoverned
  5. response + confirm-gated proposals         — nothing outward/persistent without a human yes
```

The **belief ledger is only ever written by deterministic derivation** (the reasoner), never by an
LLM path. Chats, notes, artifacts are the user's own; they inform reasoning only through a
confirmed capture.

## 4. Persistence & the ceilings (read this before scaling)

State lives in **~90 in-memory objects**, serialized to Postgres as **one JSON blob** on every
change (debounced 500ms, `scheduleSave` → `db.saveMain`). This is the correct choice for now —
simple, fast to build on — and it is a **hard ceiling** in three named ways:

1. **Single process only.** Rate limiters, sessions, the error/metric buffers, and all state are
   per-process. The moment you need a **second dyno**, they diverge. You are single-instance until
   the data layer changes.
2. **Whole-world write.** Every change rewrites the entire blob — O(everything) per save, RAM-
   bound. Chat history and the Library store full transcripts *into this blob*; it grows unbounded.
3. **No partial writes / weak concurrency.** A failed save risks the whole blob.

**The trigger for the next big project** (blob → per-entity Postgres tables) is the *first* of:
second dyno needed · blob too big for RAM · real concurrent writes. Have it planned, not discovered.
Don't do it before a pilot forces it.

## 5. The truth layer (the testing philosophy)

`node scripts/test.js` runs: `node --check` on every source, then every smoke suite, then a
dead-code scan. **Green is the gate — nothing merges red** (CI: `.github/workflows/ci.yml`).

- Suites boot the *real* app with `DB_OPTIONAL=1` and **no LLM key** — they assert the honest
  deterministic behaviour, so CI never needs (or carries) a live key.
- Tests are the executable spec. When you change a governed boundary, the suite that pins it should
  change with intent, not by accident.
- Known gap: the *actual* LLM output is only lightly tested (no key in CI). The **governance** that
  contains it is tested (`prompt-injection-smoke`, `reasoning-register-smoke`) — that's the part
  that must hold; the model's prose is judged live.

## 6. Security posture

- **Identity comes from the session (`req.iqSession`), never the request body.** Write and read
  endpoints are `requireAuth` + org-scoped; body-supplied `orgCode`/`authorId` are ignored.
  Pinned by `cross-org-isolation-http-smoke`. *When adding an endpoint: default to authenticated +
  session-scoped; only the genuine pre-auth flows (login, set-password, member/join, register-org)
  are public.*
- **Abuse/cost:** login lockout per email+IP; per-org LLM budget (hourly/daily) that degrades to
  deterministic over cap. **Observability:** redacted error log + per-org metrics
  (`/api/admin/errors`, `/api/admin/metrics`; own-org for a superadmin, all orgs with
  `IQ_PLATFORM_KEY`).
- **No-egress mode:** `IQ_DETERMINISTIC_ONLY=1` hard-refuses every model call.

## 7. Key environment variables

| Var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Turns the reasoning edges on (Claude). Off ⇒ honest deterministic fallback. |
| `OPENAI_API_KEY` | Whisper voice + embeddings + LLM fallback. |
| `IQ_DETERMINISTIC_ONLY` | No model is ever called, even with a key (the hard privacy guarantee). |
| `IQ_LLM_ORG_HOURLY` / `IQ_LLM_ORG_DAILY` | Per-org LLM call caps (cost control). |
| `IQ_LOGIN_MAX` | Failed logins / 15 min before lockout. |
| `IQ_ERROR_WEBHOOK` | Optional Slack/Discord webhook for real-time error alerts. |
| `IQ_PLATFORM_KEY` | Lets the platform owner read all-org errors/metrics via `x-platform-key`. |
| `RETENTION_DAYS` | Personal-data retention window (default 730). |

## 8. What I'd tell the next engineer

- Read `ai/reason.js` and `ai/reasoning-register.js` first — they *are* the product.
- Never let an LLM write a belief. If you're tempted, you've found the edge; govern it.
- Carve cohesive slices out of `server.js` into modules **as you touch them** — a habit, not a
  refactor project.
- The persistence ceiling (§4) is the one architectural decision that will force real work. Respect
  the trigger; don't pre-optimise, don't get caught out.
