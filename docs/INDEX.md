# IntelliQ — architecture index

**The one page.** If you read nothing else, read §1. Everything below it is navigation.
**Written against:** `81447fc`. **Branch:** `claude/platform-work-summary-nmb0cm`.
**Freshness is asserted** by `scripts/docs-status-smoke.js` — a stale index sends an agent confidently toward duplicate work, which has already happened twice.

---

## 1 · THE ONE PAGE

### What is IntelliQ?

> An **organisational intelligence harness**: a governed, deterministic substrate holding an
> organisation's evidence, provenance, structure, scope, privacy, authority, corrections, Inquiry
> state, Focus state, actions, outcomes and memory — over which **replaceable** models reason.
>
> **Models propose. The kernel adjudicates.** No organisational truth may live only in a model,
> prompt, embedding, provider store or generated summary.

### Which document is authoritative?

| Question | Document |
|---|---|
| **What must I build next?** | `briefs/codex-pilot-programme.md` — **the work order: seven lanes, a conflict matrix, and the run order** |
| What is the reasoning behind those lanes? | `ttd/pilot-blocker-challenge-and-packets.md` |
| What is IntelliQ / what is broken? | `ttd/intelliq-constitution.md` §1, §12, §13 |
| Is a law enforced? | `ttd/intelliq-ttd-v1.md` |
| Scope, Web, privacy floors | `ttd/web-semantics-and-continuous-intelligence.md` |
| Self vs Web | `ttd/self-web-production-trace.md` (traced) → `ttd/self-and-web-orchestration.md` (laws) |
| Do we need an ontology / graph DB? | `ttd/organisational-ontology-investigation.md` — **the answer is no** |
| What does Falcon actually get? | `ttd/falcon-persona-rehearsal.md` |
| **Who do we compete with, and what should we borrow?** | `ttd/competitive-landscape-and-borrows.md` |
| **What has the founder decided?** | `ttd/founder-decisions-2026-08.md` — **binding, 48 decisions, indexed at the top.** Read the index, then only what your task touches. This is the store: nothing in it should ever be re-derived or re-asked |
| **What does each layer do, and what is wrong?** | `ttd/layer-map.md` — **read this if you are unsure what is right** |
| **What is duplicated, and what is hiding?** | `ttd/duplication-sweep.md` — 87 of 298 routes have no front-end caller |
| **What is home meant to look like?** | `ttd/object-as-conversation.md` — every object is a thread; **design, not yet built** |
| **Who will know I said this?** | `ai/audience.js` — audience is a durable REFERENCE resolved at read time; `GET /api/evidence/:id/audience` answers it deterministically |
| **What are we deliberately NOT deciding?** | `rnd/intelliq-rnd-program.md` — **non-authoritative; never a reason to build** |

### What is implemented?

Evidence lifecycle · provenance and origin counting · corrections and supersession · contest state ·
P0-D authority-vs-truth · P0-3 durable CAS · Web scope (`ai/org-graph.js`) · privacy projection
(`audienceSafe`) · robust statistics (median/MAD baselines, Wilson efficacy) · deterministic pattern
detection · **group** Inquiry creation · Focus persistence and outcome learning · org memory ·
event sourcing and CQRS in all but name · **the team-grain surface** (`ai/team-state.js`:
High / Low / Inquiry / Focus over one node, two-sided floor enforced, origin-counted,
`GET /api/group/:nodeId/state`) · **team Focus with `origin { by, at, from, inquiryId }` and an
outcome loop** · **the agent answering team questions at the team's grain** · **named audiences** (`ai/audience.js`) and a deterministic answer to "can my coach see what I just said?".

### What is partial?

**87 of 298 routes have no front-end caller** (`ttd/duplication-sweep.md` §B; three were closed by
the safeguarding and answerability screens) · the **deterministic voice** now has a home
(`ai/voice.explainObject`, **D30**) but `ai/proactive.js`'s 30 message tables have not yet moved
into it · `orgGroups` and `orgNodes` are two group
models · Focus has two constructors · corrections do not reach already-emitted signals (**T-2**,
now founder decision **D19**) · Web governs a minority of scope call sites, measured by
`scope-parity-smoke`.

**The nine-route action loop** (`propose · draft · approve · reject · execute · observe · evaluate`)
is complete, tested and deliberately dark for the pilot — **D31**. It is not missing.

### What blocks Falcon?

**Nothing on the original list.** All six are closed, each proven by mutation:

| Was | Closed by |
|---|---|
| Real no-LLM suite | `no-llm-floor-smoke` — 20 assertions, dummy credentials so the SWITCH is what is proven |
| Two-sided cohort floor | `team-state.cohortFloor`, now at **5**; complement attack refused |
| Count origins, derive confidence | `contribution.shouldOpenGroupInquiry`, `fitForSurface` |
| Derive `perspective` from `subjectRef` | `proactive.toInsight`; a caller cannot launder a person artifact |
| Person-model distinct days | `person-model-temporal-smoke` |
| Invalidate on person removal | `graph-invalidation-smoke`; both call sites load-bearing |

**What is actually left before the pilot:**

**D33 splits this list.** Anything protecting *"nothing breaks"* is pilot-blocking; everything else
is better product, not a broken one.

| # | Thing | Bar | Where |
|---|---|---|---|
| 1 | ~~Safeguarding lead has no screen~~ | — | **DONE** — `safeguarding-screen-smoke` |
| 2 | ~~A person cannot see their own record~~ | — | **DONE** — `answerability-screen-smoke` |
| 3 | ~~Leader surfaces strip performance figures~~ | — | **DONE** — D26, `primitive-number-disclosure-http-smoke` |
| 4 | ~~One polarity vocabulary; FIVE existed~~ | — | **DONE** — §22, `ai/intelligence-feed.js` owns `bucketOf`; `governance-smoke` asserts no other module may author one. **OPEN: `condition` was mapped to `opportunity` (High) — founder to rule; see below** |
| 5 | **Withdrawal recomputes and tells (T-2)** | **BLOCKING** | founder decision **D19** |
| 6 | ~~A finding about a leader must not be attributable~~ | — | **DONE** — §24, `leader-subject-projection-http-smoke`; routes to the subject and their own leader only, fails closed on an unidentifiable subject |
| 7 | ~~The safeguarding exception stated before anyone speaks~~ | — | **DONE** — D21, `advance-notice-http-smoke`; one home in `ai/safeguarding.SAFETY_EXCEPTION` |
| 8 | ~~The thread — `about` on the conversation store~~ | — | **DONE** — `thread-binding-http-smoke`; the bottleneck five decisions waited on. The thread VIEW is still to build |
| 9 | Self Highs and Lows, derived | product | `ttd/object-as-conversation.md` §4 G2 |
| — | ~~The composer — `ai/voice.js` explains a governed object~~ | — | **DONE** — `voice-composer-smoke`, wired into `/api/inquiry/lead` |
| — | ~~"What I've learned about how you work"~~ | — | **DONE** — `/api/self/patterns` and its feedback route are no longer orphaned |
| 10 | The front end reflecting the object model | product | `ttd/object-as-conversation.md`, **D24 — do it last** |
| 11 | Live database run, staging deploy, real users | — | needs Render |

**The record of what was shown to whom now EXISTS** — `finding_view` audit entries,
`finding-emission-audit-smoke`. D19, D27, D28 and the awkward half of D8/D17 all depend on it and
can now be built. Nothing else is blocked on a missing substrate.

### What is the next code task?

> **§25 — a withdrawal tells whoever saw the old picture.** The last bar-one blocker, and the
> last of the original six: it closes **T-2**. The emission record it needs already exists
> (`finding_view`, §23). The work order is written.

**One founder ruling is outstanding on work already merged.** §22 mapped `diagnose.js`'s
`condition` to `opportunity`, which files it as a **High**. `ai/diagnose.js:311` describes the
value as *"a strength or a difficulty or a condition for success"* — an enabling circumstance, not
good news. Under **D5** a thing that is neither good nor bad belongs in **neither bucket**, which
argues for `neutral`. It is one line in `ai/intelligence-feed.js` either way. Codex was asked to
report rather than decide this and decided it; the mapping stands until the founder rules.

**The Codex queue, in order — all written, all ready to send:**

| | Work order | Bar |
|---|---|---|
| 1 | **§25** a withdrawal tells whoever saw the old picture (D19, closes T-2) | **BLOCKING** |
| 2 | **§26** self Highs and Lows, derived (G2) | product — unblocked by §22 |
| 3 | **§27** the thread view (§6c) | product — both halves already built |
| 4 | **§16** the curiosity stopping rule | **a dependency of §27 under D35** |
| 5 | **§28** world-model reconciliation — `briefs/world-model-reconciliation.md` | read-only, **deliberately last** |

**Done:** §19 safeguarding screen · §20 answerability screen · §21 the primitive decides ·
§22 one polarity vocabulary · §23 what was shown to whom · §24 the leader attribution guard.

**§28 is last on purpose** — read-only, and R&D where nothing is a reason to build. But its bet
is well founded: **five capabilities this session turned out to be already built and merely
hidden** (the safeguarding queue, the answerability layer, `/api/self/patterns`, `falsifiers`, the
import routes), and two concepts existed several times over. The brief is
`briefs/world-model-reconciliation.md`; it requires reading the two existing ontology documents
first and treats any contradiction with them as the finding.

### Which founder decisions remain?

**Forty-eight have been taken** — see `ttd/founder-decisions-2026-08.md`, indexed at the top.

Still open: `D-E2`, the quality floor for a cheap model, which needs a post-pilot benchmark. Plus
two flagged inside the record rather than settled: whether a leader sees a finding about themselves
at the same moment their manager does (**D27**), and how to notify a person whose Low was parked
while a coach was acting on it (**D8/D17**).

### What must NOT be built yet?

Graph database · new ontology substrate · LangChain / LangGraph / AutoGen / Temporal / Ray ·
per-person agents · peer/comparison Web · GNNs or graph analytics · local-model infrastructure ·
model routing tables · High/Low stores · Forum UI · full W-4 migration · `webCandidates` store ·
decision-as-history (J4) · behaviour→aim bearings (J5).

---

## 2 · Order of authority

```
FOUNDING INTENT → CONSTITUTION → TTD v1 → ADJUDICATIONS → BRIEFS → INVARIANTS → PRODUCTION
```

A lower layer may narrow an upper one, never widen it. **Where a document and the code disagree, the
code is the finding and the document is the defect** — corrected in place with the correction marked,
never silently edited.

**Status vocabulary:** `CURRENT` · `SUPERSEDED` · `EXPLORATION` · `IMPLEMENTED` · `PARTIAL` ·
`SPECIFIED` · `DISCOVER` · `FUTURE`.

---

## 3 · Document register

### Governing

| Document | Status |
|---|---|
| `INDEX.md` | **CURRENT** |
| `ttd/intelliq-ttd-v1.md` | **CURRENT** — enforcement status per law |
| `ttd/intelliq-constitution.md` | **CURRENT** — identity §1, infrastructure question §12, gap register §13 |
| `ttd/pilot-blocker-challenge-and-packets.md` | **CURRENT** — **the queue and the packets** |
| `ttd/consolidated-implementation-queue.md` | **PARTIAL** — 46-item register still valid; **its blocker classification is superseded** |

### Adjudications — current law on their subject

| Document | Status | Note |
|---|---|---|
| `ttd/web-semantics-and-continuous-intelligence.md` | **CURRENT** | §19 reserved for PR #74; §20 carries corrections; §23 floor corrected to two-sided |
| `ttd/self-web-production-trace.md` | **CURRENT** | the traced call graph; corrects Stage C |
| `ttd/self-and-web-orchestration.md` | **CURRENT** | the crossing laws; §1 corrected |
| `ttd/privacy-inference-attacks.md` | **CURRENT** | 25 attacks, 12 invariants, the two-sided floor |
| `ttd/founder-decision-reduction.md` | **CURRENT** | thirteen → two |
| `ttd/falcon-persona-rehearsal.md` | **CURRENT** | six personas, seventeen scenarios |
| `ttd/competitive-landscape-and-borrows.md` | **CURRENT** | market and architecture research |
| `ttd/founder-decisions-2026-08.md` | **CURRENT** | four decisions taken in session; D2 promotes focus participants and extends the audience model |
| `ttd/duplication-sweep.md` | **CURRENT** | six duplicated concepts; 92 orphaned routes; the scanner checks functions, not routes |
| `ttd/layer-map.md` | **CURRENT** | ten layers traced; the only genuinely confused one is naming, duplicated three times |
| `ttd/object-as-conversation.md` | **CURRENT** | the home/nav/thread design. Mostly assembly; one missing primitive; self High/Low is a founder decision |
| `ttd/peer-web-semantics.md` | **CURRENT** | peers are a separate edge class; deferred to SCALE |
| `ttd/model-worker-economics.md` | **CURRENT** | tiers, router, call map |
| `ttd/deterministic-web-intelligence.md` | **CURRENT** | the intelligence ladder |
| `ttd/organisational-ontology-investigation.md` | **CURRENT** | ADOPT NARROWLY; J1-J5 |
| `ttd/ontology-integration-and-decay.md` | **CURRENT** | ratification + O-1 options |
| `ttd/product-reconciliation-audit.md` | **CURRENT** | object model vs repository |
| `ttd/leadership-intelligence.md` | **PARTIAL** | its finding is what PR #74 corrects |
| `ttd/organisational-harness-addendum.md` | **PARTIAL** | §1 is the **old** Web law |
| `ttd/organisational-harness-review.md` | **PARTIAL** | `orgGoals` framing overtaken |

### Briefs — implementation-ready

| Document | Status |
|---|---|
| `briefs/codex-pilot-programme.md` | **CURRENT** — **the work order.** §0 settles TTD-vs-R&D authority; §1 the ground rules; §9 the conflict matrix. **Carries a correction: PR #76 claims Lanes A/B/D/E already** |
| `briefs/session-prompts.md` | **CURRENT** — ten copy-paste session prompts |
| `briefs/pr74-final-correction-contract.md` | **CURRENT** — nine corrections with adversarial passes |
| `briefs/no-llm-capability-matrix.md` | **CURRENT** — Packet 1 |
| `briefs/web-final-contract.md` | **CURRENT** — W-3, invalidation, W-4 parity (Packets 6, 8, 9) |
| `briefs/object-and-focus-contract.md` | **CURRENT** — object matrix + Focus |
| `briefs/person-model-temporal-contract.md` | **CURRENT** — Packet 5 |
| `briefs/p0-5-prime-origin-contract.md` | **CURRENT** — origin independence |
| `briefs/gateway-and-benchmark-contract.md` | **CURRENT** — Packet 7 + benchmark |
| `briefs/w3-w4-implementation-contract.md` | **PARTIAL** — superseded by `web-final-contract.md`; §3 audit still valid |
| `briefs/pr74-correction-contract.md` | **SUPERSEDED** — its C1 fix is defeated by the complement attack |
| `briefs/p0-d-empirical-precedence.md` · `briefs/p0-3-adjudication.md` · `briefs/admissibility.md` · `briefs/d1-d2-founder-decisions.md` | **IMPLEMENTED** |
| `briefs/p0-d-authority-and-p0-5-origin.md` · `briefs/principal-agent-slice-1.md` | **PARTIAL** |
| `briefs/p0-pilot-blockers.md` · `briefs/codex-fix-outcome-priority-office.md` | **SUPERSEDED** |

### R&D — explicitly non-authoritative

| Document | Status |
|---|---|
| `rnd/intelliq-rnd-program.md` | **NON-AUTHORITATIVE** — 31 programmes; nothing here may be cited as a reason to build |
| `rnd/audience-relative-reasoning-investigation.md` | **RESEARCH** — verdict STRONG DIRECTION; its bounded fix is queued work, its generalisation is not |

`docs/rnd/` is **not** an implementation queue. Promotion out of it is one-way and requires a named
founder decision. If an item appears both here and in the queue, the queue governs.

### Explorations and history — not law

`ttd/product-compression-and-forum-intelligence.md` · `ttd/lab-and-deliberate-development.md` ·
`ttd/conversation-as-capability.md` · `ttd/expression-and-initiative.md` (**EXPLORATION**) ·
`ttd/round-3-cross-examination.md` · `ttd/pilot-readiness-review.md` · `ttd/pilot-plan-and-market.md`
(**SUPERSEDED**).

---

## 4 · Contradictions found and corrected

Recorded, never silently edited. **Six of these are corrections to my own earlier work.**

| # | Claim | Correction |
|---|---|---|
| 1 | `org-graph-smoke.js:33` must be amended for W-3 | **False** — measured 18/18 pass. The real change is `scoped-intelligence-packet-smoke.js:47` |
| 2 | `understand`/`transcribe` are live model escapes | **Latent** — no caller. The live bug is `canTranscribe()` ignoring the switch |
| 3 | *"a plain member sees descendant-node people"* | **False** — `member` has `view_team: false`. The real leak is any `view_team` holder seeing under nodes they merely *belong to*, crossing sibling branches |
| 4 | `_commitTreeMutation` is the single choke point | **False** — `_removePerson` is a second path that invalidates nothing |
| 5 | *"drop `patternCounts` below `MIN_COHORT`"* fixes C1 | **Insufficient** — `k = n` clears the floor and names everyone |
| 6 | `_kernelEvidence`'s branches are the Self/Web split | **Incomplete** — the Self *pattern* pipeline bypasses that door entirely |
| 7 | D-W5 and D-E3 block current work | **Neither does** |
| 8 | J2 is a pilot blocker because intent is unrecoverable | **False** — one creation path exists, so back-fill is deterministic |
| 9 | Web is wired at nine call sites | **Ten** |
| 10 | `orgGoals` is consumed by nothing | **Overtaken** — read at `server.js:17028`, still no deterministic consumer |

---

## 5 · Tests currently green by construction

| Test | Why it proves nothing |
|---|---|
| `pilot-loop-smoke §10` (both assertions) | one is `typeof x === 'function'`; the other contains `&& false` |
| `no-llm-harness-smoke` — provenance, Inquiry, Focus | **fixture readback** — all three pass with no HTTP request |
| `no-llm-harness-smoke` — "different projections" | compares two **different endpoints**; passes on an org with zero evidence |
| `no-llm-harness-smoke` — "private evidence absent" | asserts a value that could never appear in that response |
| `no-llm-harness-smoke` — "deterministic-only active" | passes with no key regardless of the switch |

**Six of eight.** Packet 1 replaces them with twenty mutation-tested assertions.

## 6 · Claims stronger than their tests

| Claim | Reality |
|---|---|
| "a meaningful capability survives with models disabled" | true, **unproven** — Packet 1 |
| "the Web governs scope" | 11 of 67 scope call sites |
| Self/Web two-scope law | enforced, **unarbitrated** — no test asserts it |
| responsibility does not widen a Web | true, **untested** (W3-11) |
| Focus outcome crossing carries no subject | true, **untested** |
| a superadmin cannot read a private capture | true, **untested** (R-3) |
| origin independence across turns | **prompt-enforced only** — P0-5′ O-12 |

---

## 7 · Founder decisions

| Id | Decision | Status |
|---|---|---|
| **D-W3** | coach-created vs proposed Focus | **OPEN** — non-blocking; the field lands regardless |
| **D-E2** | quality floor for a cheap model on member-facing text | **OPEN** — needs the post-pilot benchmark |
| D-W5 · D-W6 · D-W7 · D-W4 · D-B1 | — | **resolved** — repository/safety dominant |
| D-C1 · D-E3 · D-O1 · D-E1 | — | **resolved** — answered by ratified direction |
| D-P1 · D-P2 | peer aggregates | **deferred** — comparison Web is SCALE |

One item needs founder **awareness**, not a decision: the 3(a2) lateral leak (§4 row 3).
