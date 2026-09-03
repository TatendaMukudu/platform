# IntelliQ — architecture index

**The one page.** If you read nothing else, read §1. Everything below it is navigation.
**Written against:** `0bbc01e`. **Branch:** `claude/platform-work-summary-nmb0cm`.
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
| **What has the founder decided?** | `ttd/founder-decisions-2026-08.md` — **binding, 49 decisions, indexed at the top.** Read the index, then only what your task touches. This is the store: nothing in it should ever be re-derived or re-asked |
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
models · Focus has two constructors · Web governs a minority of scope call sites, measured by
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
| 4 | ~~One polarity vocabulary; FIVE existed~~ | — | **DONE** — §22, `ai/intelligence-feed.js` owns `bucketOf`; `governance-smoke` asserts no other module may author one. **SETTLED — D49: a condition for success is a High; the mapping stands** |
| 5 | ~~Withdrawal recomputes and tells (T-2)~~ | — | **DONE** — §25, `finding-change-notice-http-smoke`; the notice is content-free by construction. **T-2 closed** |
| 6 | ~~A finding about a leader must not be attributable~~ | — | **DONE** — §24, `leader-subject-projection-http-smoke`; routes to the subject and their own leader only, fails closed on an unidentifiable subject |
| 7 | ~~The safeguarding exception stated before anyone speaks~~ | — | **DONE** — D21, `advance-notice-http-smoke`; one home in `ai/safeguarding.SAFETY_EXCEPTION` |
| 8 | ~~The thread — `about` on the conversation store~~ | — | **DONE** — `thread-binding-http-smoke`; the bottleneck five decisions waited on. The thread VIEW is still to build |
| 9 | ~~Self Highs and Lows, derived~~ | — | **DONE — and it needed NO production code.** §26 found the projection already worked through `behaviour.plan` + `bucketOf` on `/api/proactive/insights` (reachable from `member-view.js:2879`). `self-high-low-smoke` pins it |
| — | ~~The composer — `ai/voice.js` explains a governed object~~ | — | **DONE** — `voice-composer-smoke`, wired into `/api/inquiry/lead` |
| — | ~~"What I've learned about how you work"~~ | — | **DONE** — `/api/self/patterns` and its feedback route are no longer orphaned |
| 10 | The front end reflecting the object model | product | §27 landed the **inquiry** thread (`object-conversation-screen-http-smoke`, L-OC1 mutation-tested). **Remaining: the four nav buckets (§29), and threads for Focus/High/Low** · then **D24 last** |
| 11 | Live database run, staging deploy, real users | — | needs Render |

**The record of what was shown to whom now EXISTS** — `finding_view` audit entries,
`finding-emission-audit-smoke`. D19, D27, D28 and the awkward half of D8/D17 all depend on it and
can now be built. Nothing else is blocked on a missing substrate.

### What is the next code task?

> **BAR ONE IS COMPLETE.** Every "nothing breaks" blocker under D33 is closed and
> mutation-tested. What remains is product, not breakage.

**ONE WORK ORDER FINISHES THE ARCHITECTURE:** `briefs/final-architecture-programme.md` — five
lanes, a conflict matrix, a run order, and a stop rule per lane. **After it there is no
architectural work left**, front or back; what remains is a live database, a staging deploy and
real people.

The lanes, and the individual prompts they replace:

| Lane | Work | Was |
|---|---|---|
| ~~**A**~~ | ~~the four nav buckets~~ | **DONE** — `dbd4433`, `nav-buckets-http-smoke`. One shared renderer (A5 pins it), L-OC1 holds for all four kinds (A4 mutation-tested) |
| ~~**B**~~ | ~~one voice~~ | **DONE** — `bb37a31`. **All 65 strings moved byte-identical** (verified by diff); `governance-smoke` now asserts `ai/voice.js` is the sole owner |
| ~~**C**~~ | ~~the curiosity stopping rule (D35)~~ | **DONE** — `e07e60a` + `11e7a39`. Kernel in `ai/diagnose.js`, all five assertions bite. **Review found the six `server.js` call sites entirely untested** — every one could be deleted with the suite green; `curiosity-stopping-wired-http-smoke` now turns red on each. `/api/inquiry/pending` untouched, as the corrected scope requires |
| ~~**D**~~ | ~~world-model reconciliation~~ | **DONE** — `6689216`. **~80% already existed**; gate C, adjudicated as D50–D54 |
| ~~**F**~~ | ~~the five consolidations (D50–D54)~~ | **DONE** — `aa8bca9` `c4b46f6` `43858b5` `b30b893` `d739810` `1b68160`, reviewed in `b6132de` + `f4e4208`. Two defects found and fixed: **D54 leaked its compatibility view into the persisted shape** (a read dirtied the store; a reload split leadership into two drifting copies) and **D51 destroyed name-keyed personal goals** on every boot. **D53 is a shape, not a shipped capability** — nothing mints a relationship-claim ref, and `F53.7` fails the moment something does, because erasure only removes `member:<id>` |
| ~~**E**~~ | ~~one home — `app.js` absorbs `member-view.js` (D24)~~ | **DONE** — `13b6642`. **A pure move**: 3548 lines out, 3548 in, the only difference in the whole diff being the filename in one header comment. `js/member-view.js` is deleted and its script tag with it |

**The architecture programme is complete.** What remains is not code: a live database, a
staging deploy, and real people using it.

**One finding outlived the programme.** `scripts/test.js` judges every suite by exit code, and
`server.js`'s process-level crash guards were installed in the test process too — so a suite
that threw logged its stack, swallowed the error and exited 0, and the arbiter recorded a pass.
Nothing was actually crashing, but every HTTP suite sat behind that hole. Closed in `f4e4208`
and pinned by `harness-integrity-smoke`.

**Done:** §19 safeguarding screen · §20 answerability screen · §21 the primitive decides ·
§22 one polarity vocabulary · §23 what was shown to whom · §24 the leader attribution guard ·
§25 the withdrawal notice · §26 self Highs and Lows (**no production code needed**) ·
§27 the inquiry thread.

**Objective is NOT a bucket and must not become one yet.** D4 settles the nav at four. Whether
`Objective` needs to exist at all — REUSE / ALIAS / EXTEND / NEW — is exactly what **§28** decides,
and `briefs/world-model-reconciliation.md` forbids creating it before that answer.

> **The highest-value item on the whole list remains #11: a live database run with real people.**
> It is the only thing here that cannot be compressed at the end, and the only way to find the
> class of bug no suite catches.

### Which founder decisions remain?

**Forty-nine have been taken** — see `ttd/founder-decisions-2026-08.md`, indexed at the top.

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
| `rnd/whose-read-holds-up.md` | **R&D NOTE** — which leaders' reads later hold up, counted from ladder data. Blocked on a behavioural decision, not on engineering |

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

---

## 8 · September 2026 — the delivery pass

Six defects landed in a row that the suite could not see, and they are one shape: **the code
was correct and the person holding the phone was not getting it.** Recorded because the class
matters more than the instances.

| What was wrong | Why no test caught it | Guard now |
|---|---|---|
| Every asset stamped `?v=20260729a`; four sprints of UI never reached the browser | the suite proved the code, not that anyone ran it | `asset-version-smoke` |
| 41 rules used CSS variables that do not exist, falling back to light-theme hex on a dark page | `var(--nope, #111827)` is valid CSS, not an error | `css-token-smoke` |
| `_authHeaders()` sent no `Content-Type`, so Express parsed no JSON body — every send in the app | it presented as a button bug | `client-headers-smoke` |
| The composer had four silent exits; a template reply is indistinguishable from a dull one | nothing counted the exits | `composer-visibility-smoke` |
| Home kept its conversation id in a variable, so every reload started with no memory | no server-side symptom at all | `message-history-smoke` |
| Boot read the whole store twice and discarded half of it, at 86% of a 5 GB transfer allowance | the suite proved writes were cheap and could not see reads | `boot-bandwidth-smoke` |
| "Make this a focus" prefilled the composer and created nothing, through three reports | nothing asserted a focus existed afterwards | `focus-creation-smoke` |

Two of those carried a privacy defect underneath:

- **Personal focuses were readable by any leader**, including the ones the interface called
  private. A focus is now private unless its owner shares it; an AIM (`kind: 'goal'`) still
  reaches a leader, because it was declared in the org's context and it is the frame they
  support against.
- **Sources were live-only.** A composed reply cited nothing at all — the better the answer,
  the less checkable it was. Sources now ride with the message into history.

Also retired: the three demo seeds (one was 21.5 MB of a vocabulary the product no longer
speaks) for a single 32 KB college-soccer programme; the Groups tab, superseded by the tree.
`DELETE /api/admin/org/:code` removes an organisation from the database, because deleting a
seed from the repository never did.

Then a seventh, of the same shape and worse: **Highs and Lows had been structurally dead since
the daily check-in was retired** — six of the seven detectors read the mood series that question
produced — so the app reported *"Nothing needs your attention right now, you're in a steady
place"* to a person it could not see at all. Zero highs and zero lows across 28 seeded players
who had real evidence in the system. Guard: `highs-lows-smoke`.

## 9 · The person decides, the machine holds the gates

What replaced the check-in is worth stating as a rule, because four features now share it and
the next one should too.

**Nobody but the person calls it.** Not the model, not a keyword list over their wording, not a
leader. The machine counts the evidence, checks the origins are independent, and refuses when it
is thin; a human says which way it points. A call is not evidence: call a single-origin belief
anything you like and it stays where it is, with the refusal shown rather than swallowed. This
is how the team surface already worked, and it is the only reason to trust either of them.

| Feature | The person's act | What the machine holds | Guard |
|---|---|---|---|
| Highs and Lows | calling it working-well or worth-attention | origins, band, contested — a call cannot promote thin evidence | `highs-lows-smoke` |
| The ladder | raising it to their leaders | who the ladder is, that a pass says why, that a pass raises priority | `escalation-smoke` |
| Forum | offering a statement as your account | speech never becomes evidence by being agreed with | `forum-reach-smoke` |
| Outside reading | reading it, or not | the query is composed from owned vocabulary; an uncited answer is refused | `web-sources-smoke` |

Two of those were founder decisions taken explicitly rather than chosen in code, because both
changed a privacy law:

- **A raise is the subject's act.** Automatic routing on the call was offered and rejected. A
  private read on yourself arriving in front of five people the instant you tap is not what
  anybody expects the first time, and consent that surprises somebody was never consent.
- **A pass raises priority.** Ordinary software reads a dismissal as "show this less". A thing
  five people each handed on is a thing nobody owns — a fact about the organisation, not about
  the person — so it climbs. Five vantages are also five independent origins, which is why
  routing is not overhead on the way to evidence; routing *is* the evidence-gathering.

### The vacuity pattern, still the most common failure in this suite

Every suite above was mutation-tested, and the recurring finding was not in the product. It was
assertions that passed because they were standing on nothing:

- a fixture with **zero admitted signals**, so a gate could be deleted with no effect;
- `inquiryStates[C] = {}`, so "talking changes nothing the system believes" compared an empty
  object with an empty object;
- a snapshot taken **mid-suite**, after an earlier call had already applied an idempotent
  corruption, so before and after matched;
- a regex that matched the **topic** rather than a leak (`/tight/` against
  `soccer.hamstring_tightness`), failing on correct code;
- two gates that are **the same condition** along the only reachable path, so deleting either
  changed no answer any request could produce.

The last one is not a defect and the others were mine. All five are now written where the next
person will look for them, because a green suite that cannot go red is worse than no suite: it
is a claim that something is protected when nothing is.

