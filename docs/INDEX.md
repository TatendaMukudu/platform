# IntelliQ architecture index

**Purpose:** find the authoritative contract in under a minute. Read this before any other document.
**Stage H** of the architecture loop. Preceded by `702fce8`.
**Written against:** `702fce8`.

---

## 1 · Read this first

| If you are about to… | Read |
|---|---|
| implement anything | `docs/ttd/consolidated-implementation-queue.md` — **the single queue** |
| correct PR #74 | `docs/briefs/pr74-correction-contract.md` |
| implement W-3 or W-4 | `docs/briefs/w3-w4-implementation-contract.md` |
| ask what IntelliQ *is* | `docs/ttd/intelliq-constitution.md` §1, §12 |
| ask whether a law is enforced | `docs/ttd/intelliq-ttd-v1.md` — status per law |
| ask what is broken | `docs/ttd/intelliq-constitution.md` §13 — **the single gap register** |
| ask about scope, Web or privacy | `docs/ttd/web-semantics-and-continuous-intelligence.md` |
| ask about Self vs Web | `docs/ttd/self-and-web-orchestration.md` |
| ask about model cost or tiers | `docs/ttd/model-worker-economics.md` |
| propose an ontology or a graph DB | `docs/ttd/organisational-ontology-investigation.md` — **the answer is already no** |

## 2 · Order of authority

```
FOUNDING PRODUCT INTENT      founder statements in session; not a file
  └─ CONSTITUTION            intelliq-constitution.md
      └─ TTD v1              intelliq-ttd-v1.md — enforcement status of every law
          └─ ADJUDICATIONS   web-semantics…, self-and-web…, peer-web…, ontology…, product-reconciliation…
              └─ BRIEFS      docs/briefs/* — mechanical, cite line numbers
                  └─ INVARIANTS   scripts/*-smoke.js registered in scripts/test.js
                      └─ PRODUCTION   server.js, ai/*, js/app.js
```

**A lower layer may narrow an upper one, never widen it.** Where a document and the code disagree,
**the code is the finding and the document is the defect** — corrected in place, with the correction
marked, never silently edited.

## 3 · Status vocabulary

`CURRENT` · `SUPERSEDED` · `EXPLORATION` (not law) · `IMPLEMENTED` · `PARTIAL` · `SPECIFIED`
(decided, unenforced) · `DISCOVER` (settled by pilot evidence) · `FUTURE`

---

## 4 · Document register

### Governing — read these

| Document | Status | Governs | Lines |
|---|---|---|---|
| `INDEX.md` | **CURRENT** | navigation | this |
| `ttd/intelliq-ttd-v1.md` | **CURRENT** | enforcement status of every law | 964 |
| `ttd/intelliq-constitution.md` | **CURRENT** | identity, object model, gap register §13, doc hierarchy §14, the infrastructure question §12 | 571 |
| `ttd/consolidated-implementation-queue.md` | **CURRENT** | **the only queue**; supersedes all others | 190 |

### Adjudications — current law on their subject

| Document | Status | Governs | Note |
|---|---|---|---|
| `ttd/web-semantics-and-continuous-intelligence.md` | **CURRENT** | Web law, scope/governance/kernel/projection, aggregation §22, privacy floors §23 | §19 reserved for PR #74; §20 carries corrections to §1/§14 |
| `ttd/self-and-web-orchestration.md` | **CURRENT** | the two-scope law and its crossings | Stage C |
| `ttd/peer-web-semantics.md` | **CURRENT** | peer awareness as a separate edge class | Stage D; blocked on D-P1/D-P2 |
| `ttd/model-worker-economics.md` | **CURRENT** | tiers, router, budgets, the crappy-model benchmark | Stage A |
| `ttd/deterministic-web-intelligence.md` | **CURRENT** | the intelligence ladder; what needs no model | Stage B |
| `ttd/organisational-ontology-investigation.md` | **CURRENT** | verdict ADOPT NARROWLY; J1-J5 | Stage E ratifies it |
| `ttd/ontology-integration-and-decay.md` | **CURRENT** | ontology ratification, O-1 decay options | Stage E |
| `ttd/product-reconciliation-audit.md` | **CURRENT** | High/Low/Inquiry/Focus vs repository truth | |
| `ttd/leadership-intelligence.md` | **PARTIAL** | leader privacy; its central finding is being fixed by PR #74 | |
| `ttd/organisational-harness-addendum.md` | **PARTIAL** | hierarchy, decisions, temporal truth, P0-D origin | §1 "leader sees descendants" is now the **old** law — W-3 supersedes |
| `ttd/organisational-harness-review.md` | **PARTIAL** | organisational purpose, `orgGoals` | P0-A framing overtaken — see queue §3 |

### Briefs — mechanical, implementation-ready

| Document | Status | Note |
|---|---|---|
| `briefs/pr74-correction-contract.md` | **CURRENT** | nine corrections, line-pinned at `1c02dc9` |
| `briefs/w3-w4-implementation-contract.md` | **CURRENT** | W-3 + the 71-site scope audit |
| `briefs/p0-d-empirical-precedence.md` | **IMPLEMENTED** | landed as PR #73 |
| `briefs/p0-3-adjudication.md` | **IMPLEMENTED** | landed as PR #72 |
| `briefs/p0-d-authority-and-p0-5-origin.md` | **PARTIAL** | P0-D landed; P0-5 relocates as P0-5′ |
| `briefs/admissibility.md` | **IMPLEMENTED** | `ai/admissibility.js` exists |
| `briefs/d1-d2-founder-decisions.md` | **IMPLEMENTED** | |
| `briefs/principal-agent-slice-1.md` | **PARTIAL** | roles and claim validation |
| `briefs/p0-pilot-blockers.md` | **SUPERSEDED** | self-marked; P0-3 section must not be implemented |
| `briefs/codex-fix-outcome-priority-office.md` | **SUPERSEDED** | self-marked withdrawn |

### Explorations — not law

| Document | Status | Note |
|---|---|---|
| `ttd/product-compression-and-forum-intelligence.md` | **EXPLORATION** | Forum-as-destination is retired; its **laws** survive (constitution §5.1) |
| `ttd/lab-and-deliberate-development.md` | **EXPLORATION** | predates the object-model ratification |
| `ttd/conversation-as-capability.md` | **EXPLORATION** | Forum/Focus convergence |
| `ttd/expression-and-initiative.md` | **EXPLORATION** | |
| `ttd/pilot-plan-and-market.md` | **SUPERSEDED** | its task list is now the consolidated queue |

### History — retained, not current

| Document | Status |
|---|---|
| `ttd/round-3-cross-examination.md` | **SUPERSEDED** by TTD v1 |
| `ttd/pilot-readiness-review.md` | **SUPERSEDED** by constitution §13 |

---

## 5 · Contradictions found and resolved in this pass

Recorded rather than silently edited, per §2.

| # | Where | Contradiction | Resolution |
|---|---|---|---|
| 1 | `web-semantics…` §1, §14, D-W1 | claimed `org-graph-smoke.js:33` must be amended for W-3 | **Wrong — measured 18/18 pass.** Corrected in §20; the real change is `scoped-intelligence-packet-smoke.js:47` |
| 2 | PR #74 review | classified `understand`/`transcribe` as live model escapes | **Latent, not live** — no caller exists. Stage A. The real bug is `canTranscribe()` ignoring the switch |
| 3 | `harness-review` §1 | *"`orgGoals` … consumed by no reasoning subsystem anywhere"* | **Overtaken** — now read at `server.js:17028` into a citable string. Still no deterministic consumer |
| 4 | `harness-addendum` §1 | *"a leader sees their node plus all descendants"* — ENFORCED | **Now the old law.** W-3 adds one level up |
| 5 | `harness-addendum` §7 | *"epistemic scope distinct from authorisation — PARTIAL"* | **Now named**: Web ≠ governance ≠ kernel ≠ projection |
| 6 | constitution §2.4 | *"wired at nine call sites"* | **Eleven** in `server.js` |
| 7 | constitution §6 G4/G8 | duplicated GW-7 and GW-11 | merged; §13 is the single register |
| 8 | across the TTD | Forum as a live destination | absorbed; laws survive, UI feeder does not |
| 9 | multiple queues | five separate implementation orders | one queue; `consolidated-implementation-queue.md` governs |

## 6 · Claims stronger than their tests

Tracked so nothing is marked ENFORCED without an arbiter.

| Claim | Test status |
|---|---|
| "a meaningful capability survives with models disabled" | **weaker than claimed** — 6 of 8 assertions green by construction (C5) |
| "the Web governs scope" | governs 11 of 67 scope call sites (GW-1) |
| Self/Web two-scope law | **enforced but unarbitrated** — no test asserts it (T-C4) |
| responsibility does not widen a Web | **true but untested** (T-B.2) |
| Focus outcome crossing carries no subject | **true but untested** (T-C7) |
| `pilot-loop-smoke §10` LLM independence | **green by construction** — `&& false` (GW-6) |

## 7 · Founder decisions outstanding

Consolidated from every stage. Full scenarios and options live in the cited documents.

| Id | Decision | Blocks | Recommendation |
|---|---|---|---|
| **D-C1** | may private evidence count toward a Web aggregate? | G3, future Focus aggregates | consented aggregation post-pilot; current law until then |
| **D-E3 / C7** | do embeddings join the deterministic switch? | **the no-LLM claim wording** | yes — join the switch |
| **D-W3** | coach-created vs proposed personal Focus | enforcement, not the field | add `origin.by` now regardless |
| **D-W5** | may a plain member see descendant-node people? | **W-4** | keep as documented governance widening, pinned by the parity test |
| **D-W6** | does a leader's upward scope include the parent's own evidence? | **W-3 sign-off** | yes |
| **D-W7** | is `top_leader` structural or coverage-based? | W-3 | structural |
| **D-W4** | may the worker open a group Inquiry unprompted? | worker authority | propose-only for the pilot |
| **D-P1** | how many peer nodes must an aggregate span? | comparison Web | ≥3 plus leave-one-out stability |
| **D-P2** | is a node leader's identifiability person-level? | peer phrasing | no, with a no-naming rule |
| **D-O1** | is a dormant behavioural dimension quiet or forgotten? | nothing | person-controlled erase; dormant default |
| **D-B1** | may a sweep say a Focus rests on a refuted Inquiry? | B1 surfacing | yes, as an offer to revisit |
| **D-E1** | is a local T1 a pilot selling point? | nothing | design for it, build nothing |
| **D-E2** | acceptable quality floor for T1 on member-facing text? | **E4 re-tiering** | needs the benchmark first |

**Two of thirteen block current work:** D-W5 (W-4) and D-E3 (the no-LLM claim). D-W6 and D-W7 block
W-3 sign-off but both have unambiguous recommendations.
