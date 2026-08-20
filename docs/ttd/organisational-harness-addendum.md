# Addendum — hierarchy, adaptive questioning, decisions, temporal truth

**Baseline:** `docs/ttd/organisational-harness-review.md`, accepted.
**Verdict in one line: one new P0, everything else is P1/P2 or already built.**

---

# 1. Hierarchy verdict

**Three hierarchies exist in the founder's model. IntelliQ implements two of them, and conflates
them.**

| Hierarchy | Status | Evidence |
|---|---|---|
| **Organisational structure** | **ENFORCED** | `ai/org-graph.js` — `buildGraph`, `descendants`, `ancestors`, `routeTarget`. `orgNodes[code]` holds `{nodeId, parentId, leaderIds, memberIds, childNodeIds}`. Falcon → Sport → 1st XI → coach → player is representable today, at arbitrary depth. |
| **Authorisation** | **ENFORCED** | `visibleScope(graph, {leaderNodeIds, memberNodeIds})` (`:66`) — a leader sees their node **plus all descendants**; `canSee` (`:118`); `scopeOfActor` (`:82`). Tested by `org-graph-smoke`, `org-routing-http-smoke`. |
| **Epistemic scope** | **PARTIAL** | Exists as *evidence visibility* (`_kernelEvidence` purpose-scoping) but is not a distinct concept from authorisation. What a scope may *know* and what it may *see* are the same question today. |

## The gap: inheritance does not exist

`ancestors` is exported from `ai/org-graph.js` and **consumed nowhere** — the only match outside
that file is a comment in `ai/org-routing.js:6`. Context flows **down** not at all, and **up** only
as audience-safe routing summaries.

So the founder's "lower scopes inherit authorised context from higher scopes" is **not
implemented**. A 1st XI onboarding session cannot today be handed Falcon's confirmed objectives as
inherited context, because nothing walks the ancestor chain to fetch them.

Lower-level evidence *can* influence higher-level reasoning — `ai/org-routing.js` rolls
audience-safe summaries up a leader's own subtree, and cross-subject hypotheses form when ≥2
subjects in a scope share a risk (`ai/reason.js:260-268`). That direction works.

**Status: SPECIFIED.** The graph is right, the traversal exists, nothing calls it downward.

---

# 2. Adaptive questioning verdict

**The seam is one function signature.**

`/api/org-context/preview` (`server.js:9729-9745`) does exactly this:

```js
const ex = orgContext.extract(b.text, { now: Date.now() });
```

**The only inputs are raw text and the clock.** No confirmed objectives, no inherited scope, no
actor role beyond a visibility check, no previous answers, no active inquiries, no known unknowns.

What *does* reach it: `_actorRole(code, userId)` and `actorCanShareOrg: _isLeader(...)` are passed
to `validate` and `preview`, so **authority is already wired** — members submit as
shared-unverified, leaders make records authoritative.

And note what `extract` actually is: a **parser**, not a questioner. It turns prose into proposed
records. It never asks a next question. Question generation lives elsewhere entirely —
`ai/diagnose.js:rankQuestions` (`:721`) ranks candidates by expected information gain and
hypothesis importance, but those candidates come from an inquiry's own frontier, never from
objectives.

**How close are we to `harness + current answer → next useful question`?**

Closer than it looks. Every ingredient exists and is governed. What is missing is that nothing
assembles them:

> `orgContext.extract(text, { now })` → `orgContext.extract(text, { now, context })`
> where `context = { objectives, inheritedScope, openUncertainties, actorScope }`

**That is the smallest missing seam.** One optional parameter, assembled by the caller from paths
that already exist (`_orgContextConfig`, `stateToUncertainties`, `scopeOfActor`). No planner, no
agent, no new subsystem.

**Status: SPECIFIED.** P1 — see §8.

---

# 3. T0 data verdict

**Yes. Falcon could finish onboarding tomorrow and immediately have useful inquiries. The path is
proven.**

```
prose → extract → proposals → human confirms (_confirmOrgContext:9493)
     → _orgContextConfig → _buildOrgStateInputs:9478 → deriveOrgState:9544
     → stateToUncertainties → inquiry.buildUncertainty (:9555, :9875)
     → INQUIRIES, on day one
```

`ai/org-state.js:258` explicitly emits `"no explicit objectives/events configured — state is
thin"` when the mandate is absent — the system already knows the difference between having a
mandate and not.

| | |
|---|---|
| **Already captured** | objectives (with `successCriteria`, `priority`, `owner`, `targetAt`), structure, responsibilities, requirements, rhythms, dependencies, decisions-to-be-made, derived uncertainties → inquiries |
| **Derivable** | initial inquiries; "what we have no evidence for" (org-state limitations) |
| **Missing** | **declared beliefs as a record type.** `RECORD_TYPES` (`ai/org-context.js:18`) has no `declaration`/`belief`. "The headmaster believes communication is the problem" has nowhere to live as a first-class sourced claim. Also missing: member observations at T0. |
| **Should NOT be captured** | anything `FORBIDDEN` (`:22`) already blocks — private, wellbeing, surveillance content becoming operating rules. Correct as-is. |

The missing declaration type is the interesting one, and it is **P1, not P0** — because a
declaration can be carried today as an `objective` with `successCriteria` unset, or simply asked
about and turned into an uncertainty. Falcon does not need a new record type to have a useful
day one.

---

# 4. Decision verdict

**Traced. `decision` is a forward-looking record, not a historical one.** `ai/org-state.js:103`:

```js
function decision(d = {}) {
  return { kind: 'decision', id, question, owner, requiredBy, requiredInputs,
           status: d.status || 'open', decisionClaim, provenance };
}
```

That models **a decision that needs making** — a question, who owns it, what inputs it needs, when
it is required by. It is a *collection frontier* item.

It does **not** model a decision that *was* made. No decided-at, no decider, no evidence
considered, no belief-at-the-time, no resulting intervention, no outcome, no review horizon.

| Connected to | Verdict |
|---|---|
| Objectives | **No** |
| Inquiries | **Partial** — reaches inquiries via `stateToUncertainties` as a thing to resolve |
| Evidence | **No** |
| Beliefs | **No** |
| Interventions | **No** — `orgInterventions[code]` (`server.js:14337`, written `:4038`, measured `:2947`) is an entirely separate lineage |
| Outcomes | **No** directly; interventions carry the outcome half |
| Historically reconstructable | **No** |

**The other half already exists and is better than the decision record.** `orgInterventions`
records an action and `:2947` filters those that were *measured* — so
`intervention → outcome → measurement` works, and `ai/outcome-intelligence.js` reasons over it.
What is absent is the join from *why* to *what we did*.

## Recommendation: **D — remain unchanged until pilot evidence.**

Not B, not C, and emphatically not a new Decision system. Two reasons:

1. **The pieces to compose already exist** — a decision-that-was-made is an intervention plus the
   inquiry it resolved plus the belief active at the time. Composing them is cheap *once we know
   which joins Falcon actually needs*.
2. **We do not know that yet.** Building the full chain now means guessing at a schema for the
   single most consequential long-term primitive, before one real decision has passed through it.

Falcon will make perhaps a dozen consequential decisions in a pilot. Watch them, then model.

---

# 5. Temporal truth verdict

**Reconstruction is possible in principle and implemented nowhere. There is no current
correctness problem, because nothing currently claims to reconstruct.**

The ingredients are real:

- evidence carries `observedAt` and `retrievedAt` (`_writeResolutionEvidence:10039`)
- supersession preserves history rather than overwriting (`ai/diagnose.js:485`)
- beliefs carry `firstSeen`/`lastSeen`, and `contested`/`resolved` transitions are recorded
- `ai/org-playbook.js` keeps `confidenceAtConfirmation` — a genuine point-in-time snapshot, and the
  right pattern to copy

What is missing is point-in-time *retrieval*. `_retrieveGrounding` has no `asOf` parameter; it
answers with everything currently admissible. So "why did we believe X at T1" would today be
answered using evidence that arrived at T2.

**This is P2, and I want to be precise about why it is not urgent:** nothing in IntelliQ currently
offers a historical-reconstruction feature, so nothing is currently *wrong*. The risk arrives the
day we build "here is why we decided that" — at which point `asOf` becomes mandatory, not
optional. Note it in the design of that feature; do not build the infrastructure now.

**Status: OPEN.** The one cheap insurance policy is P0-B (`prov()` gaining `by`/`at`), already
queued — without a timestamp on declarations, no later reconstruction is possible at all.

---

# 6. Authority vs truth

**Largely enforced already, and better than the founder's formulation.** `ai/inquiry.js:220-276`
adjudicates an answer into an evidence tier, and `server.js:10033-10034` maps that tier onto
evidence class and confidence:

```js
const source     = adj.authority === 'authoritative' ? 'system_of_record' : 'reported';
const confidence = adj.authority === 'authoritative' ? 'high'
                 : adj.authority === 'needs_corroboration' ? 'low' : 'reported';
```

So authority does not mint truth directly — it determines **what class of evidence** a statement
becomes. That is the right shape, and it is the same insight as the D1 evidence-class work.

## The corrected law

> **Authority determines what a person may *decide* and what class of evidence their statement
> becomes. It never determines whether a proposition is true.**

Which decomposes into what is and is not enforced:

| Clause | Status |
|---|---|
| Authorised leaders may confirm objectives | **ENFORCED** — `_confirmOrgContext`, `actorCanShareOrg` |
| Members may contribute evidence without authority over direction | **ENFORCED** — `ai/contribution.js`, shared-unverified tier |
| Evidence may challenge leadership beliefs | **ENFORCED** — contested state, `contest-smoke` |
| Evidence does not automatically rewrite objectives | **ENFORCED** — objectives change only through confirmation |
| AI authority is subordinate to human | **ENFORCED** — `requiresConfirmation`, `prompt-injection-smoke` |
| **Leadership authority does not increase confidence in an empirical claim** | **CONTRADICTED — see below** |

## The one real defect, and it is Falcon's exact scenario

`ai/inquiry.js:253` and `:262` compute authority **purely from ownership**:

```js
authority: isOwner ? 'authoritative' : (isMember ? 'shared_but_unverified' : 'reported')
```

`claimType` is threaded into the resulting proposal (`:244`, `:255`, `:268`, `:276`) but **never
affects the authority decision**. So an owner is authoritative for *any* kind of claim.

For an **operational** claim that is correct — the owner of a deadline genuinely is the system of
record for it. For an **empirical** claim it is wrong. A headmaster who owns the "communication"
question answers *"yes, communication is our biggest problem"* and it becomes
`system_of_record` evidence at `confidence: high` — a high-confidence organisational belief minted
by declaration.

That is precisely Founder Decision 4's failure mode, live, in the one activity Falcon onboarding
consists of: leadership declaring beliefs about their own organisation.

It is also the same error as instrumentation bias, inverted — there, whoever had more sensors won;
here, whoever holds the role wins.

**This is the only justified P0 expansion**, and the founder's own criterion ("compelling
Falcon-safety or correctness reason") is met: without it, the pilot's first act produces confident
organisational beliefs with no evidence behind them, in a product sold on not doing that.

---

# 7. Updated register

| Capability | Status |
|---|---|
| Organisational structure at arbitrary depth | ENFORCED |
| Authorisation by scope (leader sees descendants) | ENFORCED |
| Authority determines evidence class, not truth | ENFORCED *(except empirical claims — below)* |
| Authority must not confer confidence on empirical claims | **CONTRADICTED** |
| Members contribute evidence without direction authority | ENFORCED |
| Objectives generate inquiries | ENFORCED |
| Human confirmation before context persists | ENFORCED |
| Downward context inheritance | SPECIFIED |
| Adaptive next question from harness + answer | SPECIFIED |
| Declared belief as a first-class record | SPECIFIED |
| Decision as historical record (why we chose) | OPEN |
| Point-in-time reconstruction (`asOf`) | OPEN |
| Epistemic scope distinct from authorisation | PARTIAL |

---

# 8. P0 / P1 / P2

## P0 — Falcon needs these

Unchanged from the baseline, **plus one**:

- **P0-A** retire `orgGoals`
- **P0-B** `prov()` gains `by` and `at`
- **P0-C** an inquiry records the objective that produced it
- **P0-D · NEW** — *authority must not confer confidence on an empirical claim.* Claim types split
  into operational (owner authoritative) and empirical (no role is authoritative; corroboration
  always required). Touches `ai/inquiry.js:253,262` and the type list. Small.

**Manual onboarding is sufficient for Pilot #001.** Hierarchical onboarding and Decisions must not
delay it. Falcon can be onboarded by a human walking the headmaster through
`/api/org-context/preview` and confirming records — the governed path is the same one a UI would
use, and doing it manually will teach us more about the right questions than building the UI
first.

## P1 — once Falcon produces evidence

- The context seam: `extract(text, { now, context })`
- Downward inheritance: call `ancestors` when assembling a lower scope's onboarding context
- `declaration` as a record type

## P2 — wait for evidence

- Decision as a historical object
- `asOf` point-in-time retrieval
- Objective-aware retrieval
- Epistemic scope as a concept distinct from authorisation

---

# 9. Tests

Only P0-D is new. Sequencing is unchanged: **current blocker queue lands → tests → brief →
implementation → independent verification.**

`scripts/authority-truth-smoke.js` (to be written after the blocker queue lands):

1. An owner answering an **operational** claim ("the fixture is on Saturday") produces
   `authoritative` / `system_of_record` / `high`.
2. An owner answering an **empirical** claim ("morale is low", "communication is our biggest
   problem") does **not** produce `authoritative`, and carries `corroborationNeeded: true`.
3. A leader's declaration about an empirical proposition does not raise derived confidence in that
   proposition — declaring it is not evidence for it.
4. A member's contradicting observation on the same empirical claim is admissible and is not
   outranked by role.
5. Operational authority is unaffected — no overcorrection.

P0-A/B/C tests fold into `scripts/org-mandate-smoke.js` as already planned.

---

# 10. Falcon walkthrough

| Step | Status | Evidence |
|---|---|---|
| Falcon states purpose in prose | **WORKS** | `/api/org-context/preview` |
| Extracted into proposed objectives | **WORKS** | `orgContext.extract`, `RECORD_TYPES:18` |
| Headmaster confirms; records become authoritative | **WORKS** | `_confirmOrgContext:9493` |
| Falcon's objectives generate uncertainties → inquiries | **WORKS** | `:9555`, `:9875` |
| Sport onboards **inheriting** Falcon's objectives | **MISSING** | `ancestors` never called downward |
| 1st XI onboards inheriting Falcon + Sport | **MISSING** | same |
| Coach declares "we lose concentration in second halves" | **PARTIAL** | enters as a record; no `declaration` type, so it lands as objective-or-uncertainty |
| That declaration becomes high-confidence org belief | **BROKEN — P0-D** | `ai/inquiry.js:253` |
| Player contributes a contradicting observation | **WORKS** | `ai/contribution.js`, shared-unverified |
| Contradiction becomes contested rather than resolved by rank | **WORKS** | `conversation.js:58`, `contest-smoke` |
| Evidence accumulates; belief forms with stated basis | **WORKS** | `deriveConfidence` |
| Belief traced back to Falcon's objective | **MISSING — P0-C** | no objective id on the inquiry |
| Decision recorded with reasons | **MISSING** | §4 — deliberately deferred |
| Intervention run and measured | **WORKS** | `orgInterventions:4038`, measured `:2947` |
| Outcome ranked by efficacy | **WORKS** | `outcome-ranking-smoke` |
| Belief updated; correction preserved | **WORKS** | `supersede`, `admissibility` |
| "Why did we decide this in March?" | **FUTURE** | §5 |

---

# The five answers

**1 · If Falcon onboards at every level tomorrow, how much can IntelliQ use?**
The **top level, fully**. Falcon's own objectives are captured, confirmed, and generate inquiries.
Every level below is captured as *structure* — Sport, 1st XI, coach, player all exist as nodes with
authorisation — but their onboarding answers cannot inherit context from above, because `ancestors`
is never called downward. Falcon's mandate reaches Falcon. It does not reach the 1st XI.

**2 · Can IntelliQ use the mandate plus what someone is saying to pick a better next question?**
Partially, and the missing seam is exactly one signature. `orgContext.extract(text, { now })` sees
only the text and the clock. Every other ingredient — confirmed objectives, actor scope, open
uncertainties — exists and is reachable from the same request. Add a `context` parameter and
assemble it from paths that already work. No agent, no planner.

**3 · Does IntelliQ preserve enough to answer "why did Falcon decide this"?**
**No.** `decision` models a decision *to be made*, not one that *was* made — no decider, no
evidence considered, no belief at the time, no link to the intervention that followed. The
intervention half exists and is measured; the "why" half does not. Deliberately deferred: watch a
dozen real Falcon decisions before modelling this.

**4 · Smallest additional work before Pilot #001?**
Four small changes: P0-A, P0-B, P0-C, and the new P0-D. Plus the existing pilot blocker queue.
Hierarchical onboarding, adaptive questioning and Decisions are **not** required — a human can walk
Falcon through the governed path manually, and doing so will teach us the right questions faster
than building the UI would.

**5 · One coherent loop, or subsystems sharing a repository?**

**Genuinely one loop, with two breaks — and both breaks are joins, not missing machinery.**

The chain that provably runs today:

```
objective → org-state → uncertainty → inquiry → contribution → evidence
   → belief (with basis) → contest → resolution → intervention → measured outcome
   → efficacy ranking → updated belief
```

Every arrow there is code I have cited, most covered by a registered suite. That is not a
collection of subsystems; that is a loop.

The two breaks:

- **objective → inquiry loses its parent** (P0-C). The loop runs but cannot say which objective it
  was serving.
- **belief → decision → intervention is not joined** (§4). We know what was done and what happened.
  We cannot say why it was chosen.

Both are foreign keys, not architecture. That is a much better position than the founder's question
implies — and it is worth saying plainly, because the risk here has never been that the loop does
not exist. It is that it will keep being refined for another six months instead of being pointed at
Falcon.
