# IntelliQ + Platform — Architecture Review & Roadmap

## What already exists (and is genuinely good)

The "Behavior → Intervention → Outcome → Learning" loop is **partially built already**:

- **Intervention lifecycle** (`server.js:4109–4219`): suggested → acknowledged → completed → dismissed, with real outcome measurement (`_measureInterventionOutcome`, `:3697`) computing pre/post mood, engagement-frequency, and weekly-participation deltas with confidence scoring.
- **Learning engine** (`:4221–4403`): effectiveness-by-action-type, rule-based risk patterns, linear-regression mood-decline predictions (`_predictMemberRisksFromData`, `:3153`), and an org-level learning narrative.
- **Memory engine** (`userAiProfiles`, `:445–595`): open threads, recurring themes (keyword-overlap dedup), prior follow-ups, injected into prompts.
- **Permission model** (`:891–950`): role defaults + auto node-leader grants + explicit per-user overrides; subtree visibility engine.

So the loop exists. What's missing is **structure, privacy enforcement, addressability, and scale**.

---

## 1. Features / structures that no longer align with the vision

| Current | Problem vs. vision |
|---|---|
| **Single JSONB blob** (`db.js` — entire org store in one `iq_store('main')` row, loaded into memory at boot, `saveMain` rewrites the whole document) | The #1 blocker. "Institutional memory," cross-member similarity, and per-signal queryability are impossible when every write rewrites one JSON document and concurrent writers clobber each other. Caps you at toy scale. |
| **Free-form `orgMetrics`** (`:439`) | Signals don't map to the COGNITIVE/EMOTIONAL/SOCIAL/EXECUTION framework. Nothing rolls up into the 14 sub-dimensions because there's no taxonomy. |
| **Keyword-overlap memory** (`:475–481`, 40% word match) | Brittle; "behavioral understanding" can't emerge from string matching. No embeddings, no behavioral state. |
| **Org-only insights, no per-member advisor** | `org-insights` and `member-timeline` exist, but there's no "select a member and ask a question" surface. The headline new feature has no home. |
| **Memory block trusts the model with raw private text** (`:577` "only reference if directly relevant") | A privacy liability, not a model. Counselor/trainer/journal text can leak. Vision explicitly forbids this. |
| **Permission-gated, not permission-shaped AI** | Permissions decide *if* you get the endpoint, never *how the AI answers*. A trainer and a head coach get identical narratives. |
| **Per-org learning silos** (`learningSummaryCache` per `orgCode`) | "Similar athletes / what worked before" can't cross org boundaries — the flywheel's compounding value is capped. |
| **Mood-only outcome measurement** | Outcomes measure mood/engagement deltas only — not tied to the 4 categories or to *predicted* outcomes. The loop learns "did mood go up," not "did accountability improve." |

## 2. Missing infrastructure

1. **A normalized Signal event store** — one append-only table every input writes into (check-in, scenario, weekly, note, observation, attendance, film participation), each tagged with category, source, sensitivity, and weight.
2. **A Behavioral Profile object per member** — derived state across the 14 sub-dimensions + trends + confidence, recomputed from signals. This is the "behavioral understanding" the advisor reasons over.
3. **A vector/embedding layer** — for memory recall, semantic theme clustering, and cross-member similarity ("athletes like this one"). pgvector on the existing Postgres is the cheapest path.
4. **A privacy/sensitivity classifier + redaction gate** — a hard server-side boundary between "may inform reasoning" and "may be disclosed."
5. **A job/worker for derivation** — profile recomputation, embedding generation, outcome re-measurement should be background jobs, not request-time.
6. **An AI gateway/abstraction** — right now `client.messages.create` with a hardcoded `claude-haiku-4-5` is copy-pasted ~15 times. One module: model selection, retries, token budgeting, response-schema validation, and the privacy gate applied uniformly.

## 3. Database changes

Move off the single blob incrementally (keep the blob during transition):

```
signals        (id, org_code, member_id, ts, category, sub_dimension,
                source, sensitivity, weight, value_num, value_text,
                embedding vector, raw_ref)
behavioral_profiles (org_code, member_id, dimension_scores jsonb,
                trends jsonb, confidence jsonb, summary_embedding vector,
                updated_at)
interventions  (promote from orgInterventions blob → real rows;
                add predicted_dimension, predicted_delta, measured_delta)
intervention_outcomes (intervention_id, dimension, before, after, delta, confidence)
advisor_threads (id, org_code, member_id, requester_id, requester_role,
                question, answer, signals_used jsonb, created_at)
```

Add **pgvector** (`CREATE EXTENSION vector`). Index `signals(org_code, member_id, ts)` and an ivfflat index on embeddings. This single change unlocks items 2, 3, and 8.

## 4. API changes

- **New: `POST /api/advisor/:memberId/ask`** — the Individual Advisor. Body `{ question }`; server resolves requester role + permissions, builds the behavioral profile + permission-scoped signal context, runs the privacy gate, returns a recommendation + (non-sensitive) evidence. Persists to `advisor_threads`.
- **New: `GET /api/member/:memberId/profile`** — the behavioral profile across the 4 categories with trends/confidence.
- **Refactor: all ingestion endpoints** (`/api/member/checkin`, `/api/weekly/submit`, `/api/member/submit-result`, `/api/notes`) → also emit a normalized `signal` with category + sensitivity tags.
- **Refactor: interventions** → capture `predictedDimension`/`predictedDelta` at creation so outcomes can score against prediction, not just mood.
- **New: `GET /api/intelliq/similar/:memberId`** — cross-member (later cross-org, anonymized) matches + what worked for them.

## 5. AI architecture changes

1. **One AI gateway module** wrapping `messages.create`: centralized model choice, JSON-schema validation, retry/backoff, and a mandatory `privacyGate(context)` step. Today nothing is centralized.
2. **Tiered models**: keep Haiku for ingestion-time micro-tasks (check-in insight, categorization); use **Sonnet/Opus for the advisor and learning synthesis** where reasoning quality is the product. (Both via the gateway so it's a config flag.)
3. **Behavioral-understanding prompting**: the advisor reasons over the *derived profile + redacted signal digest*, and is instructed to answer from understanding, never quote sources — matching the "GOOD vs BAD" example in the brief.
4. **Schema-validated outputs** everywhere (JSON is parsed loosely in several places today — make it enforced).

## 6. Permission model changes

- Add **role-conditioned advisor lenses**. The permission set already exists; add an `advisor_lens` per role (head coach → leadership/accountability/role; assistant → training/communication; trainer → recovery/wellness adherence; teacher → engagement/participation; admin → org-level only). The advisor prompt is assembled from the requester's lens.
- Add **sensitivity-scoped read tiers**: a permission like `view_sensitive_source` distinct from `view_insights`. A trainer's notes inform everyone's advisor reasoning but raw text is readable only by sensitivity-cleared roles.
- Keep the existing subtree visibility engine — it's solid; just feed `requester_role` into the advisor context.

## 7. Memory engine changes

- Promote `userAiProfiles` from keyword threads → the **Behavioral Profile** (category scores + trends + embedding). Keep open-threads/follow-ups as one input among many.
- Replace 40%-word-overlap dedup with **embedding similarity**.
- Make memory **derivation-driven** (recomputed from the signal store by a worker) rather than mutated inline on each request — so it's reproducible and auditable.
- Tag every memory item with **sensitivity** so the privacy gate can act on it.

## 8. New services / agents / workflows

- **Signal Ingestion service** — normalize + categorize + classify sensitivity + embed on write.
- **Profile Derivation worker** — recompute behavioral profiles + predictions on a schedule.
- **Advisor agent** — the permission-aware, privacy-safe per-member reasoner.
- **Privacy gate** — shared redaction/transformation boundary.
- **Outcome Measurement worker** — promote the existing `_measureInterventionOutcome` re-check (currently lazy, on-request at `:4206`) into a scheduled job scoring against predicted dimensions.
- **Cross-entity Learning service** (Phase 3+) — similarity + "what worked" retrieval.

---

## Phased Roadmap

### Phase 1 — Immediate (foundations + the headline feature)
- Define the Performance Framework taxonomy (4 categories → 14 sub-dimensions) as a shared constant.
- Build the **AI gateway** + **privacy gate** and route all existing `messages.create` calls through them (closes the leak risk now).
- Ship the **Individual Advisor AI** (`/api/advisor/:memberId/ask`) reasoning over *existing* data (checkins, weeklies, scenarios, memory, notes) with role lenses and the privacy gate. High user-visible value, no DB migration required.
- Tag notes/observations with sensitivity at write time.

### Phase 2 — Near-term (structure the data)
- Introduce the **`signals` table** + pgvector; dual-write from all ingestion endpoints (blob stays as fallback).
- Build the **Behavioral Profile** object + `GET /member/:id/profile`; advisor switches to reasoning over the profile.
- Embedding-based memory recall replaces keyword overlap.
- Interventions capture predicted dimension/delta.

### Phase 3 — Scale (institutional memory)
- Promote interventions/outcomes/memory fully out of the blob into rows; retire the single-document write path.
- **Cross-member similarity** + "what worked for similar members" in the advisor.
- Profile derivation + outcome measurement as scheduled workers.
- Anonymized cross-org learning (opt-in) — the moat begins compounding.

### Phase 4 — Predictive Intelligence
- Multi-dimensional trajectory prediction per category (beyond mood regression).
- "Who is likely to succeed / struggle" leaderboards with intervention recommendations ranked by *measured historical effectiveness for similar members*.
- Closed-loop: advisor recommendations auto-link to interventions, whose outcomes feed back into recommendation ranking — the full flywheel.

---

## Two assumptions worth challenging

1. **The single JSONB blob has to go sooner than "Phase 3."** Everything visionary here — institutional memory, similarity, queryable signals — is gated by it, and it's also a correctness bug today (concurrent writes overwrite each other). Start dual-writing the `signals` table in Phase 2 rather than treating storage as a late concern.

2. **"Don't score people" vs. the 14 sub-dimensions.** These are in tension. Resolve it explicitly: scores are **internal reasoning substrate for the advisor**, never a leaderboard shown to members. The product surface stays "who's struggling / why / what to do / did it work" — the numbers live under the hood. Make this a hard design rule so the framework doesn't quietly become a ranking system.
