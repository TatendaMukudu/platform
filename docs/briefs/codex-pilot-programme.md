# Codex programme — everything between here and the pilot

**Audience:** an implementing agent (Codex) working in `TatendaMukudu/platform`.
**Status:** CURRENT. This is the work order. **Written against:** the branch head that contains
`ai/team-state.js`.
**Read time before starting: all of §0 and §1. Do not skip to a lane.**

---

> ## STATUS — READ BEFORE ANY LANE
>
> **PHASE 2 IS COMPLETE.** Every lane in this document is done and merged into
> `claude/platform-work-summary-nmb0cm`. H1 and H2 landed from `codex/h2-h1-final`, reviewed by
> mutation: removing the W-3 line kills four assertions, reverting the role derivation to the
> size comparison kills two across two suites, and dropping the budget consumption at the
> provider boundary kills two.
>
> | Lane | State |
> |---|---|
> | **A** no-LLM floor | done — `no-llm-floor-smoke`, 20 assertions, dummy credentials present so the SWITCH is what is proven |
> | **B** privacy corrections | done — two-sided floor and origin counting both go red under mutation |
> | **C** non-interference | done — `non-interference-smoke`; both `careFlag` leaks closed |
> | **D** person model + erasure | done — distinct days, staleness, both invalidation call sites |
> | **E** Web scope | done — W-3, the `top_leader` fix, and `scope-parity-smoke` |
> | **F** team pattern detection | done — group streams via `_kernelEvidence` at an organisational purpose |
> | **G** gateway | done — budget consumed at the provider boundary, `canTranscribe` respects the switch, token telemetry per org/task/tier |
> | H3 pilot rehearsal | done — `scripts/pilot-rehearsal.js`, prints the transcript a coach would read |
> | H4 demo seed | done — crosses the real contribution boundary; squad widened to fourteen |
>
> ### Landed since this document was written — do NOT rebuild any of it
>
> - **`ai/audience.js`** — named audiences. An audience is a durable REFERENCE `{ kind, nodeId }`
>   resolved against CURRENT membership at read time, never a stored list. It NARROWS and never
>   grants; admissibility is still `_kernelEvidence` first. Do not turn it into a permission
>   system and do not add a kind without a deterministic resolver.
> - **`GET /api/evidence/:id/audience`** and **`GET /api/me/audiences`** — "can my coach see what
>   I just said?", answered from state.
> - **`scripts/audience-disclosure-smoke.js`** — 46 assertions. INQUIRY FORMATION IS NOT
>   DISCLOSURE, proven adversarially.
> - **The cohort floor is now 5**, two-sided, and **deliberately not configurable**. Founder
>   decision, August 2026.
>
> ### Three things you must not undo
>
> 1. **Do not lower `MIN_COHORT`, and do not make it a setting.** A floor that can be lowered is
>    a floor that gets lowered the first time a demo looks thin. If a group cannot publish
>    safely, the correct behaviour is to refuse and explain — which the surface already does.
> 2. **Do not narrow a test fixture back down.** Several suites now use twelve- and
>    fourteen-person cohorts *because* the floor is five: a four-person fixture can only ever
>    prove that the floor refuses, never that it also permits. Those numbers are load-bearing.
> 3. **Do not touch `ai/audience.js`, `ai/team-state.js` or `scripts/audience-disclosure-smoke.js`**
>    unless your lane genuinely requires it. Neither H1 nor H2 does.

---

## 0 · HOW TO READ THE DOCUMENTATION

There are two kinds of document in this repository and they have opposite authority. Confusing
them is the single most expensive mistake available to an agent here, so it is settled first.

| Directory | Authority | What it means for you |
|---|---|---|
| `docs/ttd/` · `docs/briefs/` | **LAW** | Binding. A law may be narrowed by a lower layer, never widened. If code and a TTD document disagree, **the code is the finding and the document is the defect** — report it, do not silently edit either. |
| `docs/rnd/` | **NONE** | **Never a reason to build anything.** Not a queue, not a backlog, not a hint. A programme there has no standing until a founder decision names it and writes it into a queue. |

**The rule, stated as an instruction you must follow:**

> You may cite `docs/ttd/` and `docs/briefs/` as justification for a change.
> You may **never** cite `docs/rnd/` as justification for a change.
> If a lane below appears to require something that only `docs/rnd/` describes, that lane is
> mis-specified — stop and report it rather than implementing the research.

`docs/rnd/intelliq-rnd-program.md` §9 lists what is deliberately *absent* from the research
register because it is real queued work. If you find a task described as research there, that
description is the defect and the queue governs.

**Order of authority:**

```
FOUNDING INTENT → CONSTITUTION → TTD v1 → ADJUDICATIONS → BRIEFS → INVARIANTS → PRODUCTION
                                                                    (R&D sits outside this chain)
```

---

## 1 · GROUND RULES

These apply to every lane. Violating one invalidates the work even if the tests are green.

### 1.1 · Laws that may not be weakened

1. **One truth store.** No organisational claim may live only in a model, prompt, embedding,
   provider store, cache or generated summary. Every claim must be recomputable from the
   evidence log.
2. **Privacy.** Private evidence is excluded **before** context assembly, never retrieved and
   filtered afterwards. `_kernelEvidence` in `server.js` is the only door to kernel reasoning —
   do not add a second.
3. **Provenance.** Every signal carries its origin. Contribution changes the *audience* of
   evidence, never what it rests on. Nothing may mint independence.
4. **Admissibility.** Superseded evidence stops grounding answers.
5. **Tenant isolation.** Absent and belonging-to-another-org must return the *same* answer, so a
   refusal never confirms a record exists elsewhere.
6. **Authority vs truth.** A position grants authority, not correctness.
7. **Durability.** Split durable-unit writes go through CAS. Do not bypass it.
8. **The epistemic ladder.** `MODEL_MAY_PROPOSE` excludes `conclusion` (`ai/diagnose.js`). A
   model proposes; the kernel adjudicates and computes confidence itself.

### 1.2 · Absolute prohibitions

- **Do not merge anything.** Push to a branch, open nothing without being asked.
- **Do not make a failing test pass by weakening it.** If a test is wrong, say so and stop.
- **Do not delete or rewrite an assertion to get green.** Adding assertions is always fine.
- **Do not add a dependency.** No graph DB, no orchestration framework, no ML library. See
  `docs/ttd/organisational-ontology-investigation.md` — the answer is no, with reasons.
- **No emojis.** Anywhere. Not in code, UI, commits or docs. Inline SVG where an icon is needed.
- **Do not touch another lane's files.** See the conflict matrix in §8.

### 1.3 · Definition of done, per lane

A lane is done when **all** of these hold:

1. `npm test` prints `TRUTH LAYER GREEN`.
2. The lane's own new assertions exist, are registered in `scripts/test.js`, and pass.
3. Each new assertion has been **mutation-tested**: break the production line it covers, confirm
   the assertion goes red, restore. An assertion that stays green when you break the code is
   worse than no assertion — six of the current no-LLM suite's eight are exactly that, which is
   why Lane A exists.
4. Every non-obvious decision is explained in a comment that says *why*, not *what*.
5. One commit per lane, or per coherent step within a lane. Never one commit for two lanes.

### 1.4 · Cost discipline

You are being run with a budget. In order of savings:

- **Read the brief, not the repository.** Each lane below names its files. Do not survey.
- **Grep, do not read whole files.** `server.js` is ~17k lines. Never read it end to end.
- **Line numbers in this document are indicative and have drifted.** Grep for the quoted symbol
  or string instead of trusting the number.
- **Run one suite, not the whole thing, while iterating.** `node scripts/<lane>-smoke.js`. Run
  `npm test` once before committing.
- **Do not re-derive what this document already states.** If it says a leak was measured, it was
  measured; reproduce it only if your fix depends on the exact shape.
- **Do not write a design document.** The design is here. Write code and tests.
- **Ask nothing.** Every founder decision this work depends on is already resolved. If you hit a
  genuine fork, pick the more conservative branch, implement it, and note the fork in the commit.

---

## 2 · LANE A — THE NO-LLM FLOOR (`scripts/no-llm-floor-smoke.js`)

**Sequences first. Lanes B, C and D can start in parallel; nothing in Lane A's own group may.**

### Why it blocks

Six of the eight assertions in `scripts/no-llm-harness-smoke.js` are green by construction:

| Assertion | Why it proves nothing |
|---|---|
| provenance / Inquiry / Focus (three) | **fixture readback** — all three pass with no HTTP request made |
| "different projections" | compares two **different endpoints**; passes on an org with zero evidence |
| "private evidence absent" | asserts a value that could never appear in that response |
| "deterministic-only active" | passes with no API key regardless of the switch |

The platform's central claim is that a meaningful capability survives with models disabled. That
claim is currently **true but unproven**. Every later lane's privacy fix will be verified against
this suite, so a suite that cannot fail produces green with no evidence.

### Build

New file `scripts/no-llm-floor-smoke.js`. Contract: `docs/briefs/no-llm-capability-matrix.md`.

- Boot the real server with `IQ_DETERMINISTIC_ONLY=1` and **no** API key.
- Every assertion must issue a real HTTP request against a **seeded** org — never read a fixture
  back.
- Assert the capability floor: evidence capture, provenance, the inquiry frontier, group inquiry
  opening, Focus persistence and outcome, the team-grain surface (`/api/group/:nodeId/state`),
  the assistant's deterministic answers, and the leader briefing.
- Assert the switch is *load-bearing*: at least one assertion must go red if
  `IQ_DETERMINISTIC_ONLY` is ignored. Grep `IQ_DETERMINISTIC_ONLY` in `ai/gateway.js`.
- **Twenty assertions minimum, all mutation-tested.**

### Then

Delete or repair the six green-by-construction assertions in `no-llm-harness-smoke.js`. Repair
is preferred; deletion is acceptable if the assertion cannot be made meaningful. Say which you
did and why in the commit.

---

## 3 · LANE B — THE PRIVACY CORRECTIONS

**One PR. Must not be split — the four corrections interact.** Depends on Lane A.

Contract: `docs/briefs/pr74-final-correction-contract.md`. That document governs where it
disagrees with this summary.

### B1 · The two-sided cohort floor

**Measured live:** a two-person scope publishes a per-person count while claiming the floor was
applied. The one-sided floor is defeated by the **complement attack** — with `k = n`, "two
members" satisfies `k >= MIN_COHORT` and names everyone in the node.

The corrected rule, already implemented and tested in `ai/team-state.js` (`cohortFloor`):

```
disclosable(k, n)  ⟺  k >= MIN_COHORT  AND  n - k >= MIN_COHORT
```

Apply it to the **whole payload**, not to one field. Grep `MIN_COHORT` in `server.js`. Reuse
`teamState.cohortFloor` rather than writing a second copy — a second copy is a second opinion.

Note `k = n` and `k > n` are both refusals, and `n` is the **node's member count**, never the
number of people who happened to contribute. Using contributors as the denominator makes every
count self-clearing.

### B2 · Count origins, not people

**Measured live:** one origin retold by three people surfaces a Web Low. Grep
`MIN_INDEPENDENT_ORIGINS` in `ai/contribution.js` — the rule and the `ECHO` verdict already
exist and are correct. The aggregate path does not use them. Route it through the same rule.

### B3 · Confidence and severity derived, never asserted

A Web artifact currently claims what the kernel never established. Confidence must come from the
inquiry the kernel computed. Grep `deriveConfidence`. See `ai/team-state.js` `fitForSurface` for
the shape: a `tentative` band or a `disputed` status is not surfaced at all.

### B4 · `audienceSafe` protects the Web projection

Every identity vector except one passes today. Grep `audienceSafe`.

### Acceptance

Extend `scripts/no-llm-floor-smoke.js` (Lane A) or add a sibling suite. Each of the 25 attacks in
`docs/ttd/privacy-inference-attacks.md` that this lane claims to close must have an assertion. At
minimum: the complement attack, the difference attack (a head sees 4 of 7, a coach 3 of 4 ⇒ one
drop among three people), and the echo attack.

### Do not touch

`ai/team-state.js` — its floors are already correct and tested. If you find yourself changing
it, you are solving the wrong problem.

---

## 4 · LANE C — NON-INTERFERENCE

Independent of A and B. Can start immediately.

### The measured leak

Two worlds differing only by one private capture belonging to a member:

| Vector | W1 (no private evidence) | W2 (member has a private sensitive capture) |
|---|---|---|
| Leader's briefing item | `careFlag: false` | **`careFlag: true`** → UI renders *"There may be personal context here — lead with care. Details are kept private."* |
| Leader's recommended action, on an **identical** belief | `scout` | **`supportive_checkin`** |

This is the forbidden case exactly: **private evidence steering what the leader is told to do.**
The evidence layer is correct — `_kernelEvidence` excludes private evidence before context is
assembled. The leak is downstream, in the projection.

### The three sites

Grep for each; line numbers have drifted.

1. `hasSensitiveContext` in `server.js` — derived from `k.sensitive` and
   `privacy.isPrivate(s.sensitivity)`. This is where the contamination originates.
2. `_sanitizeBriefingForLeader` in `server.js` — spreads `{...it}` and does **not** strip
   `careFlag`.
3. `ai/reason.js` — `const wellbeing = WELLBEING_AXES.has(b.axis) || b.careFlag || b.severity === 'high';`
   The `|| b.careFlag` term is what flips the recommended action.

### The contract

**Authorised output must be semantically equivalent across W1 and W2.** A leader's briefing,
recommendation and register must be identical whether or not a member holds private evidence.

`careFlag` may continue to exist for surfaces the *subject themselves* reads. It must not reach
a leader-facing projection, and it must not enter `_register`.

**Verified already clean, do not change:** `careFlag` reaches neither `deriveConfidence` nor the
pattern detectors. Selection and confidence are not contaminated.

### Acceptance

New `scripts/non-interference-smoke.js`. Build two worlds differing **only** by one private
capture. Assert byte-level or semantic equivalence of the leader's briefing payload, the
recommendation and the register. Mutation-test it: re-add `|| b.careFlag` and confirm red.

---

## 5 · LANE D — PERSON MODEL AND ERASURE

Two independent single-function fixes. Can start immediately.

### D1 · Person-model temporal decay

**Measured:** 50 observations labelled `direct` in 2026 plus 20 labelled `gentle` in 2028 still
reports `direct` with evidence 50. A person is labelled by their past, permanently — and for a
pilot involving young people that is the sharpest reputational risk in the codebase.

Also measured: **three observations in a single day assert a dimension.** There is no
per-observation timestamp.

Contract: `docs/briefs/person-model-temporal-contract.md`. Two changes in `ai/person-model.js`:

1. Add a per-observation timestamp. Without it nothing else here is possible.
2. Require **distinct days**, not a raw count, before a dimension is asserted; and weight recent
   observations above old ones so a later pattern can overtake an earlier one.

Use the existing robust statistics — grep `ai/baseline.js` for the median/MAD baseline. Do not
introduce a new decay curve if a baseline already expresses it.

### D2 · Invalidate on person removal

**Measured:** `_removePerson` in `server.js` strips `node.memberIds` and `node.leaderIds`,
calls neither `_commitTreeMutation` nor `_backfillUserNodeIds`, and **invalidates nothing**.
Rosters and derived reads stay stale — an erasure that does not erase.

Note the correction already recorded: `_commitTreeMutation` is **not** the single choke point.
`_removePerson` is a second path. Fix the second path; do not assume the first covers it.

### Acceptance

Extend `scripts/person-model-smoke.js` for D1. For D2, assert that after removal a cached roster
and a cached briefing both reflect the removal without waiting for the sweep.

---

## 6 · LANE E — WEB SCOPE (W-3, invalidation, parity)

**Strictly serial within the lane.** Contract: `docs/briefs/web-final-contract.md`.

### E1 · W-3 — a leader gains direct parents

Founder law FW-2. The change in `ai/org-graph.js` is one line inside the leader loop:

```js
for (const p of (graph.parentsOf.get(n) || [])) seen.add(p);   // W-3: one level up
```

**Includes the `top_leader` regression fix.** Measured: in a two-tier org this change promotes
every node leader to `top_leader`, because `visibleNodes.length === g.byId.size`. Derive the role
from something other than a size comparison. Grep `top_leader` in
`ai/scoped-intelligence-packet.js`.

**Correction already recorded, do not repeat it:** `scripts/org-graph-smoke.js` does **not** need
amending — measured 18/18 pass. The test that changes is
`scripts/scoped-intelligence-packet-smoke.js` (grep for the role assertion).

Eight invariants are listed in the contract. Implement all eight.

### E2 · Graph-change invalidation

Rosters and briefings are stale for up to two hours after a re-parent. One function plus a call
in `_commitTreeMutation` — **and** in `_removePerson`, per Lane D2.

### E3 · W-4 parity harness

**No production change.** A new test file that enumerates where `orgGraph`, `getVisibleUserIds`
and `_inNode`/`_leadsNode` disagree. There are three parallel scope mechanisms across 71 audited
call sites; this measures the divergence so a later migration is safe. Do not migrate anything.

### Do not

Bundle the comparison/peer Web with W-3. That is a recorded sequencing law: mixing a scope change
with a new edge class makes the blast radius unmeasurable. The peer Web is not in scope at all.

---

## 7 · LANE F — TEAM PATTERN DETECTION

**The biggest product gain in this document, and the one that decides whether the pilot's first
screen says anything.**

### The problem

`GET /api/group/:nodeId/state` produces Highs and Lows only from **contributed** group inquiries.
The path is: someone talks to IntelliQ → intake notices it may concern the group → it lands in
their private noticings → they contribute it with a valence → a second independent origin arrives
→ the inquiry opens → the cohort floor passes → it surfaces.

That is the correct design and none of it may be loosened. But it means a group whose members'
streams are all moving is **silent**, and the pilot's first screen opens empty.

### The build

Make the deterministic pattern engine run over a **group** subject.

`ai/primitives.js` `structuralPatterns(streams, now)` already detects `withdrawal`, `data_gap`,
`isolation`, `overload` and `plateau` over `{ key, label, primitive, valence, series }` streams,
domain-free. `ai/proactive.js` `PATTERN_POLARITY` already maps each type to a polarity, including
the two positive ones (`recovering`, `quiet_improvement`). `ai/baseline.js` already provides
median/MAD baselines and `ai/outcome-intelligence.js` a Wilson lower bound.

**No new mathematics. No new detector. No model.**

1. **Group streams.** Build a node's streams by aggregating its members' streams — from
   organisationally-admissible evidence only, through `_kernelEvidence` with an `ORG_PURPOSES`
   purpose. Private evidence must not reach this path, and that must be structural rather than
   filtered afterwards.
2. **Run the existing engine** over those streams.
3. **Project findings into the team surface.** `ai/team-state.js` `buildTeamState` currently
   accepts `inquiries` and `focuses`. Add a `findings` input. A finding carries a polarity
   already; map `strength|progress|milestone|opportunity → High`, `risk|friction → Low`.
4. **Gate them exactly as inquiries are gated.** Every finding that rests on a count of people
   goes through `teamState.cohortFloor` — both sides. A finding derived from a single member's
   stream is a *person* finding and must not become a team High or Low at all.
5. **Say which is which.** A contributed finding and a detected finding are different kinds of
   claim. The surface must distinguish them so a leader knows whether people said this or the
   system measured it.

### Acceptance

Extend `scripts/team-state-smoke.js` (118 assertions today; do not weaken any of them). Add at
minimum:

- a node whose members' participation is declining produces a Low with no contributions at all
- a finding resting on one member never becomes a team finding
- the two-sided floor applies to detected findings identically to contributed ones
- a detected finding is labelled distinguishably from a contributed one
- **a private capture changes nothing about the group surface** (the Lane C property, at group
  grain)

---

## 8 · LANE G — THE GATEWAY

Independent of everything. Small, and it is a live cost risk during a pilot.

1. **Move `_llmBudgetOk` inside the gateway.** Grep it in `server.js` — there are 19 unbudgeted
   call sites. Fixing them one by one is 19 chances to miss one; moving the check into
   `ai/gateway.js` fixes them all at once and makes the next one safe by default.
2. **`canTranscribe()` must respect `IQ_DETERMINISTIC_ONLY`.** A no-egress org is currently
   advertised a capability it has disabled. Note the correction already recorded: `understand`
   and `transcribe` are **latent**, not live — no caller exists. The live bug is only
   `canTranscribe()`.
3. **Token-denominated telemetry.** A call counter cannot distinguish 160 tokens from 4,000.

Contract: `docs/briefs/gateway-and-benchmark-contract.md`. **Do not** re-tier any call site to a
cheaper model — the integrity benchmark runs first, and re-tiering before it is the one
sequencing mistake available here.

---

## 9 · CONFLICT MATRIX

| Lane | Owns | Must not run at the same time as |
|---|---|---|
| **A** no-LLM floor | `scripts/no-llm-*` | — (but B waits for it) |
| **B** privacy corrections | leader briefing + Web projection in `server.js`, `ai/proactive.js` | **E**, once E reaches the briefing endpoint |
| **C** non-interference | `hasSensitiveContext`, `_sanitizeBriefingForLeader`, `ai/reason.js` | **B** (same region of `server.js`) |
| **D** person model + erasure | `ai/person-model.js`, `_removePerson` | **E2** (both call invalidation) |
| **E** Web scope | `ai/org-graph.js`, `ai/scoped-intelligence-packet.js` | **B**, **D2** |
| **F** team patterns | `ai/team-state.js`, `ai/primitives.js` callers, group streams | nothing |
| **G** gateway | `ai/gateway.js`, `_llmBudgetOk` | nothing |

**Safe parallel sets:** `{A, C, D, G}` then `{B, F}` then `{E}`.
**If only one agent is available, run in this order:** A → C → F → B → D → E → G.

That order puts the two things that decide the pilot demo — a suite that can fail, and a screen
that says something — before the rest.

---

## 10 · WHAT IS EXPLICITLY NOT IN SCOPE

Do not build any of these, and do not let a lane grow into one:

Graph database · ontology substrate · LangChain / LangGraph / AutoGen / Temporal / Ray ·
per-person agents · peer or comparison Web · Web-of-Webs · GNNs, embeddings or classical ML ·
local-model infrastructure · model routing tables · re-tiering to cheap models · fine-tuning ·
differential privacy · `webCandidates` durable store · decision-as-history (J4) ·
behaviour→aim bearings (J5) · full W-4 migration · Forum UI · a second truth store of any kind.

Every one of these is examined in `docs/rnd/intelliq-rnd-program.md` with the reason it is
parked or rejected. **That document is context for why you are not building them. It is not
permission to build them.**

---

## 11 · REPORT BACK

For each lane, in the commit body and once at the end:

1. What you changed, and the one-line reason.
2. Every assertion you added, and **confirmation that you mutation-tested it** — which line you
   broke and that the assertion went red.
3. Anything in this document you found to be **wrong**. The code is the finding and the document
   is the defect; five of the corrections already recorded in `docs/INDEX.md` §4 are corrections
   to earlier claims made with confidence. Finding a sixth is a good outcome, not a problem.
4. Anything you did **not** do, and why. A lane finished at 70% and reported as done is the worst
   outcome available.

---

# PHASE 2 — the last stretch to the pilot

**Everything above is done except Lane G and half of Lane E.** Phase 2 finishes those and adds
the three things that actually decide whether the demo works on the day.

**Before starting anything in Phase 2 — confirm the branch, and say what you found:**

```
git fetch --prune origin
git checkout claude/platform-work-summary-nmb0cm
git reset --hard origin/claude/platform-work-summary-nmb0cm
git log --oneline -5
```

**All current work lives on `claude/platform-work-summary-nmb0cm`.** Not `work`, not `main` —
both are weeks behind and nothing lands on them.

Two duplications have already happened for this exact reason. Lane A was implemented twice
because a branch was cut twenty minutes before the status block that would have prevented it.
Worse, an agent left on `work` — 80 commits and eleven days behind — re-implemented roughly
3,500 lines that already existed: the no-LLM guards, CAS durability, `claimNature`, the
person-model temporal fixes and the whole team-grain surface.

Being on the wrong branch does not fail loudly. It produces confident duplicate work, and the
cost is only visible afterwards. Checking costs one command.

---

## H1 · LANE G — the gateway (unchanged from §8, restated for convenience)

**Independent of everything. Small, and it is a live cost risk the moment a real org starts using
the product.**

1. **Move `_llmBudgetOk` inside the gateway.** Grep it in `server.js`. Fixing call sites one by
   one is one chance per site to miss one; moving the check into `ai/gateway.js` fixes them all
   and makes the next call site safe by default.
2. **`canTranscribe()` must respect `IQ_DETERMINISTIC_ONLY`.** A no-egress org is advertised a
   capability it has disabled. `understand` and `transcribe` are latent (no caller); only
   `canTranscribe()` is live. Do not "fix" the latent ones.
3. **Token-denominated telemetry.** A call counter cannot distinguish 160 tokens from 4,000, and
   without that the cost of a pilot cannot be forecast at all.

**Acceptance.** A new `scripts/gateway-budget-smoke.js`. At minimum: a call made with the budget
exhausted is refused *inside the gateway* rather than at the call site; `canTranscribe()` returns
false under the deterministic switch; and token counts accumulate per org. Mutation-test each.

**Do not** re-tier any call site to a cheaper model. The integrity benchmark runs first.

---

## H2 · LANE E — finish the Web scope work

**Strictly serial. Contract: `docs/briefs/web-final-contract.md`.**

E2 (invalidation) landed. Two things did not:

### H2a · W-3 — a leader gains direct parents

Founder law FW-2. In `ai/org-graph.js` `visibleScope`, the **member** loop already adds direct
parents. The **leader** loop does not, and that is the change:

```js
for (const n of leaderNodeIds) {
  if (!graph.byId.has(n)) continue;
  seen.add(n);
  for (const d of descendants(graph, n)) seen.add(d);
  for (const p of (graph.parentsOf.get(n) || [])) seen.add(p);   // W-3: one level up
}
```

**It comes with a regression that must be fixed in the same change.** `ai/scoped-intelligence-packet.js`
derives the role by comparing set sizes:

```js
const role = declared.leaderNodeIds.length
  ? (visibleNodes.length === g.byId.size && g.byId.size > 0 ? 'top_leader' : 'leader')
  : 'member';
```

Once a leader can see one level up, in a two-tier organisation every node leader's visible set
equals the whole graph, so **every coach becomes `top_leader`**. Derive the role from something
that is actually true of a top leader — leading a node with no parents — not from a size
comparison that W-3 invalidates.

**Correction already recorded, do not repeat it:** `scripts/org-graph-smoke.js` does **not** need
amending — measured 18/18 pass. The suite that changes is
`scripts/scoped-intelligence-packet-smoke.js`.

Eight invariants are listed in the contract. Implement all eight.

### H2b · W-4 parity harness

**No production change.** A new test file that enumerates where `orgGraph`, `getVisibleUserIds`
and `_inNode`/`_leadsNode` disagree, across the 71 audited scope call sites. It measures the
divergence so a later migration is safe. **Do not migrate anything.**

---

## H3 · THE PILOT REHEARSAL — a seeded organisation that walks the whole loop

**The highest-value item in Phase 2, and the one nothing has ever proven.**

Every suite in this repository tests a slice. Nothing has ever run the product as a deployment:
one organisation, real people, from an empty database to a screen a coach would recognise. Until
that runs, "ready for the pilot" is an inference from unit tests.

### The build

A new `scripts/pilot-rehearsal.js`. Not a smoke test — a **scripted deployment** that starts from
an empty store and drives production HTTP routes only, in the order a real month would happen:

1. Create the organisation and its tree. One team node under one parent. A coach who leads it,
   twelve members in it. This is deliberately a shape that is neither Falcon nor Alma
   specifically — a node is a node.
2. Members talk to IntelliQ over `/api/assistant/turn` across several distinct days. Some
   material is personal, some uses collective language.
3. Members read their own noticings at `/api/group/:nodeId/candidates` and contribute some of
   them at `/api/group/:nodeId/contribute` with a declared valence. **Some decline.** At least
   one is withdrawn afterwards.
4. A second independent origin arrives for one concept, so a group inquiry opens on the rule
   rather than on a fixture.
5. The coach reads `/api/inquiry/lead`, `/api/group/:nodeId/state` and
   `/api/intelligence/briefing`, and asks the assistant "how is the team doing?".
6. The coach sets a team Focus from the open inquiry, and later records its outcome.
7. The coach acts on one person item and records how it went.
8. One member is removed with erasure. Every read is taken again.

### What it must assert

Not "did it return 200". At each step, **what a human would see**:

- after step 4, the team surface reports a Low with a real basis, not an empty screen
- after step 5, the assistant's answer names no individual
- after step 6, `IntelliQ:` says something specific about what is not yet known
- after step 8, the removed person is gone from every read with no TTL wait, and the group keeps
  the finding they contributed

### What it must print

A transcript. The literal text a coach would read at each step, to stdout, so a human can look at
it and say whether it is any good. **That output is the deliverable as much as the pass/fail.**

### The honest part

Report what the rehearsal shows, including if it is thin. If the screen is empty at step 5, say
so — that is the finding, and it is far better to have it now than on the day.

---

## H4 · SEED DATA THAT REACHES THE NEW SURFACES

`scripts/seed-club.js` and `scripts/seed.js` predate group inquiries, contribution valence, team
Focus and the team-grain surface. A demo seeded with them opens on an empty team screen.

Extend the existing seed — do not write a third one — so that a freshly seeded organisation
already has: one open group inquiry with two independent origins, one contributed High, one
contributed Low, one team Focus with an outcome recorded, and at least one finding **withheld**
by the cohort floor so the "not shown yet" path is visible.

**Seeded state must be produced by calling the same functions the product calls.** A seed that
writes `inquiryStates` directly creates records the real path could never produce, and the first
time that diverges it will do so silently in front of a customer.

---

## H5 · WHAT ONLY A HUMAN OR A BROWSER CAN DO

Out of scope for Codex, recorded so it is not assumed done:

- **Nothing has been opened in a browser.** The front-end assertions are structural — they catch
  a route losing its caller, not a layout that is broken or unreadable.
- **Live PostgreSQL CAS and stale-delete** need `DATABASE_URL`.
- **Render overlap and drain** need a staging environment.

---

## H6 · ORDER

```
H1 (gateway)  ─┐
H2 (W-3, then parity) ─┼→ H3 (rehearsal) → H4 (seed, informed by what the rehearsal showed)
```

H1 and H2 are independent of each other and of H3's design, but **H3 must run after them** so the
rehearsal exercises the final scope rules rather than the current ones. H4 comes last because the
rehearsal is what tells you which seeded state actually matters.

**If only one agent is available: H2 → H1 → H3 → H4.** W-3 first because it changes what every
scope consumer sees, and everything after it should be measured against the final rule.
