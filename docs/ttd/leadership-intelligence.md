# Leadership intelligence without surveillance

**Status:** architecture and product investigation. Nothing implemented. Nothing queued ahead of
the pilot blockers.

**Verdict in one line: the premise is inverted. IntelliQ has not overcorrected toward privacy for
leaders — it already ships the single most person-revealing surface in the product, and it is the
leader's home page.** `/api/intelligence/roster` returns every visible person by name with a
behavioural status and a pattern label. `/api/intelligence/briefing` returns fifteen named
individuals with their evidence basis. Both are live, both are fetched by `js/app.js`, and neither
passes through the privacy projection the documentation describes.

The leadership intelligence layer the founder wants is therefore not an addition. **It is a
replacement**, and building it is how the surveillance surface gets retired.

---

# 0 · What I checked

Read or re-read: `ai/privacy.js`, `ai/proactive.js`, `ai/behaviour.js`, `ai/reason.js`,
`ai/inquiry.js`, `ai/contribution.js`, `ai/forum.js`, `ai/org-learning.js`, `ai/org-playbook.js`,
`ai/org-answer.js`, `ai/scoped-intelligence-packet.js`, `ai/readiness.js`, `ai/intelligence.js`,
`ai/primitives.js`, `ai/org-context.js`, `ai/safeguarding.js`. Read in region in `server.js`: the
intelligence surfaces (3023–3320, 4150–4360), the leader proactive path (4498–4515), visibility
(`getVisibleUserIds`), org-state (9880–9960), the reasoner (10395–11050), team readiness (10476),
the member cohort guard (16915–16955). Searched for: cohort minimums, k-anonymity, suppression,
privacy budgets, query history, drill-down limits, re-identification guards.

Searches that returned **nothing**: `privacyBudget`, `queryBudget`, `queryHistory`, `drillDown`,
`deanon`, `reidentif`. Cohort protection exists in exactly one place in the entire codebase.

---

# 1 · Current architecture — what leadership can actually know

## 1.1 · There are two leader paths with opposite privacy postures

This is the finding everything else depends on.

**Path A — the governed projection.** Kernel finding → `proactive.toInsight(finding, { audience })`
→ `audienceSafe()` → `behaviour.plan()` → `/api/proactive/insights/leader/:subjectId`
(`server.js:4500`). For a leader audience, `ai/proactive.js:273` **empties `basis`**, and
`audienceSafe` re-checks it at 303 and rejects the artifact if any evidence string survived. The
route comment states the guarantee: *"the projection strips evidence basis and numbers before it
reaches the leader."* It also requires `getVisibleUserIds(...).includes(subjectId)` plus
`view_insights` or `review_checkins`. **This path is correct.**

**Path B — the intelligence surfaces.** Two routes, both live in the leader UI:

| Route | Returns per person | Gate |
|---|---|---|
| `/api/intelligence/roster` `server.js:4250`, fetched at `js/app.js:7059` | `{ id, name, status: attention\|improving\|steady\|no-data, topLabel, lastActiveDays }` for **every visible member** | `view_team` **or** `view_insights` |
| `/api/intelligence/briefing` `server.js:4150`, fetched at `js/app.js:6632` | up to **15** items of `{ memberId, name, severity, patterns[{type,label,basis,confidence}], whyNow, evidence[], recommendedAction }` (`ai/intelligence.js` `composeBriefingItem`) | same |

`basis` strings are the individual's own evidence, phrased for a human — *"participation
(check-ins) is 40% below their usual"*, *"no activity in ~2 weeks, though they were regular
before"* (`ai/primitives.js:76-90`). `topLabel` is a behavioural label from `PATTERN_LABEL` —
*"Pulling back"*, *"Gone quiet"*, *"Overload risk"*, *"Becoming isolated"*.

**Path B never touches `audienceSafe`.** It calls `intel.detectPatterns(m)` and
`composeBriefingItem` directly. The privacy projection that Path A is built around is simply not in
this call graph.

So the honest statement of current capability is:

> A leader with `view_team` sees a named list of their people, each labelled with whether they are
> pulling back, gone quiet, overloaded or becoming isolated, plus how many days since they were
> last active — and for the top fifteen, the evidence behind it.

That is a behavioural status board on identifiable people. It is exactly what §10 of the founder
prompt says must never exist, and it is shipped.

## 1.2 · What is intentionally hidden, and genuinely is

These hold, verified in code:

| Boundary | Mechanism | Where |
|---|---|---|
| Private text never reaches a group | `toGroupProposal` sets `sourceSpan: null`, `verbatim: false` | `ai/contribution.js:246-268` |
| Membership is not consent | `mayContribute` requires ownership **and** `explicit: true` | `ai/contribution.js:121-133` |
| A leader cannot publish a member's words | enforced twice | `ai/contribution.js:129`, `ai/forum.js:127` |
| Forum speech is epistemically inert | the module has no evidence vocabulary at all | `ai/forum.js:8` |
| The reasoner never sees raw text | receives only privacy-safe observations; claims are fixed templates | `ai/reason.js:22` |
| Private assessments are owner-only | admitted only under a personal purpose, never a leader purpose | `server.js:7628` |
| A person's self-model is theirs | *"NEVER shared with a leader above them and never used to evaluate them"* | `ai/self-model.js:17` |
| Person model stores no raw text | fixed categorical vocabularies; a disclosure cannot be stored | `ai/person-model.js:26` |
| Sibling branches do not leak sideways | org-graph scope | `ai/scoped-intelligence-packet.js:11` |
| Cross-tenant isolation | structural partitioning by `orgCode` | verified previously |
| Restricted topics classified | counselling, medical, bereavement, family | `ai/privacy.js:26` |

**The individual-protection architecture is real and good.** The founder's instinct that it exists
is correct. The error is believing it covers the leader surfaces.

## 1.3 · What does not exist at all

Searched and found nothing:

- **Any cohort minimum on a leadership surface.** `MIN_COHORT = 2` exists once, at
  `server.js:16932`, and it protects a *member's* "what helped people like me" view, not a leader
  view. Its comment states the exact principle the leader surfaces ignore: *"A cohort of one is not
  a cohort — and its 'shared pattern' could point a leader straight at a single identifiable
  person."*
- **Privacy budget, query history, drill-down limits, re-identification detection.** None.
- **Group truth as a first-class object.** Every aggregate is computed per request and thrown away.
- **A leadership question surface.** `ai/org-answer.js` exists and is the right shape — pure,
  deterministic, scoped, member-safe, routes when it cannot answer — but it answers operational
  questions (readiness, outstanding, ownership), not the analytical questions in §7.

---

# 2 · The privacy boundary — a corrected ontology

The founder's four categories are nearly right. The architecture suggests one addition and one
sharpening.

| Category | Definition | Exists? |
|---|---|---|
| **Person truth** | about an identifiable individual | yes — and over-exposed to leaders (§1.1) |
| **Cohort truth** | a pattern across a *named, bounded* set of people | **the dangerous middle** — see below |
| **Group truth** | a pattern across a group large and diverse enough that no member is inferable | **does not exist as an object** |
| **Organisational truth** | conclusions about structures, processes, environments, conditions, interventions | partially — `ai/org-learning.js`, `ai/org-playbook.js` |
| **Leadership intelligence** | the subset of group + organisational truth safe to surface to someone with responsibility | **does not exist** |

**The addition is cohort truth**, and separating it from group truth is the whole safety argument.
"Three of the six-person finance team" is cohort truth wearing group truth's clothes. A category
that does not distinguish them will fail §4 every time. **Group truth must be defined by the
property that no member is inferable, not by the fact that individuals were aggregated.**

**The sharpening** is that the founder's principle already has a precedent in this codebase and
should be stated in its terms:

> Leadership authority is authority over **actions and arrangements**. It is not epistemic
> authority and it is not privacy authority.

That is the same law P0-D just established for claim types — a responsibility assignment grants
authority to act, never authority over what is true. Leadership intelligence is the same law
applied to *reading* rather than *asserting*. **One principle, two boundaries.** Naming it once is
worth more than two separate rules.

---

# 3 · Privacy-preserving organisational intelligence — what is actually needed

The founder listed twenty privacy mechanisms. Most are unnecessary. What the architecture actually
requires, in order of importance:

### Necessary

1. **A minimum cohort, enforced at the aggregation boundary, not the render boundary.** The
   principle is already written at `server.js:16931`; it needs to become a shared primitive rather
   than a local constant. For a pilot org, ≥5 contributing people is defensible; ≥2 is not.
2. **Independent-origin requirement.** Already exists and is the strongest asset here.
   `contribution.shouldOpenGroupInquiry` counts **origins, not contributors**
   (`ai/contribution.js:203`) precisely because *"five teammates repeating what the captain said are
   five contributors and one origin."* A leadership signal must inherit this: N independent origins,
   not N mentions. This single reuse defeats the "one outspoken participant" attack (§12.2) for
   free.
3. **Source diversity across contexts.** The founder's own example — *"this pattern appears across
   four independent contexts"* — is the safety property, not just a confidence property. A pattern
   confined to one team is a cohort signal; the same pattern in four teams is organisational.
4. **Suppression below threshold, failing closed and silently.** Not "insufficient data for the
   finance team" — that itself discloses. See §4.
5. **Confidence bands, never scores.** Already enforced everywhere; must not regress.
6. **Purpose limitation on the read.** `_assessmentEvidenceFor` already demonstrates the pattern
   (`server.js:7618`): a purpose parameter that structurally excludes private evidence from
   leader-facing reads.

### Unnecessary — reject

7. **Differential privacy.** Reject. It is designed for repeated statistical queries over large
   populations. A 300-person school produces counts in single digits, where the noise required to
   protect is larger than the signal. It would produce false organisational claims, which is worse
   than silence, and this product's entire posture is that silence is a valid answer.
8. **Formal k-anonymity machinery.** Reject the framework, keep the intuition. Real k-anonymity
   requires enumerating quasi-identifiers, which for an organisation means role, team, year group,
   tenure — an unbounded set. A cohort minimum plus source diversity plus the drill-down floor
   (§8) gets the same protection at a tiny fraction of the complexity.
9. **Temporal aggregation as a privacy mechanism.** Reject as privacy; keep as honesty. Three-week
   windows make signals more trustworthy, not more anonymous — a leader knows who was absent last
   week regardless of the window.

---

# 4 · The re-identification failure mode

The founder is right that aggregation is not protection, and the architecture currently has nothing
to stop it.

**Three distinct attacks, only one of which a cohort minimum addresses:**

| Attack | Example | Defeated by |
|---|---|---|
| **Small denominator** | "3 of the 6-person finance team report problems with their manager" | cohort minimum |
| **Contextual uniqueness** | "A Year 11 student in the football team is experiencing X" — the intersection is one person | **attribute-intersection floor**, not size |
| **Differencing** | "the science department" then "excluding physics" | **query-sequence awareness** (§8) |

The second is the one a cohort minimum misses entirely, and it is the founder's own example. The
finance team might have twelve people, but "Year 11 ∩ football team ∩ experiencing X" can be one.

**The rule that covers all three:**

> A leadership signal may be surfaced only if the set of people who could have produced it is at
> least K, **after** accounting for every attribute named in the signal itself and in the query
> that produced it.

And critically:

> **Suppression must be indistinguishable from absence.** A leader must not be able to tell the
> difference between "nothing is happening in the finance team" and "something is happening but is
> below threshold." Otherwise the suppression message is itself the disclosure, and probing for it
> becomes the attack.

This is a real product cost and the founder should see it plainly: **IntelliQ will sometimes stay
silent about something real, and will not be able to say that it is staying silent.** That is the
price of the guarantee, and it is why `ai/behaviour.js:12` treating silence as success is
load-bearing rather than stylistic.

---

# 5 · Urgency and safeguarding

The separation the founder asks for **already exists as a separate module and route set** —
`ai/safeguarding.js`, routes at `server.js:12745`, with a designated lead role (`_isSgLead`) and its
own resource list. It is not part of the intelligence path and must not become part of it.

The architectural rule:

> Safeguarding is a **routed disclosure to a named responsible person**, triggered by content.
> Leadership intelligence is a **statistical read of the organisation**, triggered by a leader.
> They must never share a code path, and a safeguarding event must never appear in an
> organisational aggregate.

The second half matters and is not currently enforced: a safeguarding disclosure is evidence, and
if it flows into a group aggregate it can both distort the organisational picture and re-identify
the person through a spike. **Safeguarding-flagged evidence should be excluded from every leadership
aggregate**, on both grounds.

`ai/privacy.js` already classifies the relevant topics `RESTRICTED` (`:26`). The rule is therefore
implementable as a filter on an existing field, not a new classification.

**Do not invent legal requirements.** Nothing in this report claims a reporting duty. The
safeguarding path exists because the product chose it, and that is the correct basis.

---

# 6 · Architecture → capability → leadership value

For the actual production architecture. This is where the existing investment already pays.

| Architecture (production) | Capability | Leadership value | Status |
|---|---|---|---|
| `prov()` + evidence envelopes | every belief names its basis | *"Why are you telling me this?"* | **already implemented**, unsurfaced to leaders |
| `diagnose.supersede` + `admissibility.partition` | corrected evidence stops grounding answers, visibly | leadership stops acting on obsolete conclusions | **already implemented** |
| contest state, `contest-smoke` 27/0 | disagreement stays epistemically visible | leadership sees *disputed*, not false certainty | **already implemented** |
| `inquiryStates` | a question persists across conversations and staff changes | recurring issues survive turnover | **already implemented** |
| `orgInterventions` + `/api/intelligence/outcome` + `outcome-intelligence.summarize` | action connected to subsequent evidence, ranked by what worked not what was done most | *"did our change help?"* | **already implemented** |
| `ai/org-memory.js` moments + `ai/org-learning.js` intervals | longitudinal comparison of derived states | *"a similar pattern occurred last semester"* | **already implemented**, never leader-facing |
| `ai/org-playbook.js` candidate practices with counter-evidence | *"this recurred, here is what argues against it — do you recognise it?"* | organisational learning a leader confirms | **already implemented** |
| `ai/forum.js` inertness + `ai/contribution.js` door | collective reasoning can inform understanding without granting access to conversation | **already implemented** (no UI) |
| `contribution.shouldOpenGroupInquiry` origin counting | repetition cannot masquerade as corroboration | protects leadership from a confident minority | **already implemented** |
| `ai/inquiry.js` uncertainties + `stateToUncertainties` | the system knows what it does not know | *"what don't I know about this organisation?"* | **already implemented**, unsurfaced |
| `ai/behaviour.js` plan/silence | volume control and calm empty states | a Monday page that can say "nothing" | **already implemented** |
| `ai/proactive.js` `audienceSafe` | audience-appropriate projection | the safety primitive the new layer needs | **already implemented**, bypassed by Path B |
| `ai/org-answer.js` | scoped, grounded, deterministic answering that routes when it cannot answer | the leadership question surface | **partially** — operational intents only |

**Eleven of thirteen already exist.** The gap is not capability. It is that almost none of it is
assembled into anything a leader sees, while the one thing they do see is the surveillance surface.

---

# 7 · The leadership intelligence model — proposal

**New proposal, built almost entirely from existing parts.**

### 7.1 · One new object: the Organisational Signal

Not a new kernel. A record that says *something is true of the organisation*, carrying its own
admissibility proof:

```
{ signalId, orgCode, scope: 'org' | 'node:<id>',
  kind: emerging | worsening | persistent | recurring | contested | improving
        | unexpectedly_improved | awaiting_measurement | assumption_unsupported,
  claim,                      // template, never free text — same discipline as ai/reason.js
  window: { from, to },
  cohortSize,                 // people who could have produced it
  independentOrigins,         // reusing contribution.js's counting
  contexts,                   // distinct nodes it appears in
  confidence: band,
  basis: [ safe strings ],    // structural categories only, as ai/org-learning.js already redacts
  historicalAnalogue,         // ai/org-memory fingerprint
  provenance: prov(),
  suppressed: bool }          // never rendered, never explained
```

**Admissibility is a property of the signal, computed once, not a render-time filter.** This is the
single most important design decision in this document, and it follows the pattern
`ai/admissibility.js` already established for evidence: partition first, then reason over what
survives.

### 7.2 · Derivation

No new detection. `ai/reason.js` already forms beliefs across people and already exposes
`_collapseByCohort` and `_mergeCohort` (`ai/reason.js:414`, `428`) — cohort collapsing exists. The
new work is to run that collapse and *emit the group-level result while discarding the member-level
one*, rather than the reverse.

### 7.3 · The gate

A signal is admissible to leadership only if **all** hold:

1. `cohortSize >= K` (K = 5 for the pilot, configurable, never below 3)
2. `independentOrigins >= 3` — reusing `contribution.js`'s counting, not contributor counts
3. `contexts >= 2` for anything person-adjacent — the founder's "four independent contexts"
4. no contributing evidence is `RESTRICTED` or safeguarding-flagged
5. no attribute combination in the claim reduces the candidate set below K
6. confidence band is at least `emerging`

Failing any of these sets `suppressed: true`, and a suppressed signal is **absent**, not explained.

---

# 8 · The conversational attack, and where the defence must live

The founder is right that a prompt instruction is not a control. It must be below the LLM.

**The defence is that the LLM never sees person-level data in a leadership session.** Not "is told
not to reveal it" — never receives it. `ai/proactive.js` already proves this is achievable:
`audienceSafe()` is a post-projection assertion that *fails the artifact* if evidence basis
survived. The same assertion applied to a leadership answer's context block is the control.

Concretely:

- The leadership question path assembles its context **only** from admissible Organisational
  Signals (§7). Not from `evidenceLog`, not from `inquiryStates` member subjects, not from
  `orgSignals`.
- A `leadershipSafe()` assertion, modelled on `audienceSafe`, runs on the assembled context before
  any model call and refuses if a person id, name, or evidence basis string is present.
- `ai/privacy.js:redact` remains as last-line defence, not first.

**On query sequences.** The founder asks whether a privacy budget is needed. My answer: **not a
budget — a floor.** A budget is a counter that eventually exhausts, which is complex, hard to
reason about, and produces the "keep querying until the threshold changes" attack the founder lists
in §12.

The floor is simpler and stronger: **every answer in a leadership session is subject to the same
cohort test, applied to the intersection of all attributes named so far in that session.** Ask
about the science department, then Year 11, then Tuesday — the candidate set shrinks with each
constraint, and the answer is refused the moment it drops below K. The session accumulates
constraints; it does not accumulate spend.

This needs session-scoped attribute tracking, which does not exist. **It is the single genuinely new
mechanism this document proposes**, and it is small: a list of attributes named, and a candidate-set
size computed against the org graph.

---

# 9 · Adversarial battle tests

| # | Case | What IntelliQ must do | Covered by |
|---|---|---|---|
| 1 | Six-person team, three complain | suppress — below K | §7.3(1) |
| 2 | One outspoken participant, many signals | one origin, not many — no signal | `contribution.js:203`, **already exists** |
| 3 | Coordinated complaints | independent origins, but same context — needs `contexts >= 2` | §7.3(3) |
| 4 | Malicious manager probing | session attribute floor refuses as the set shrinks | §8 |
| 5 | Malicious participant / false reports | contest state; corroboration required; never authoritative alone | **already exists** |
| 6 | Same underlying evidence, many derived claims | **origin counting, not claim counting** — the confidence-inflation prohibition | `contribution.js:203` |
| 7 | Contradictory groups | surfaced as `contested`, not averaged | **already exists** |
| 8 | Staff turnover | inquiry persists; the *analogue* is org-level so it survives | **already exists** |
| 9 | Safeguarding case | routed to the safeguarding lead, excluded from every aggregate | §5, partially |
| 10 | Private Forum | inert by construction; contribution requires the author | **already exists** |
| 11 | Iterative deanonymisation | §8 floor |  new |
| 12 | Leader asks the LLM directly for a person | the model never received it | §8 |
| 13 | **Intervention "works" because unhappy people left** | **not covered by anything** — see below |
| 14 | Simpson's paradox | **not covered** — see below |
| 15 | Stale historical comparison | `ai/org-learning.js` already requires *semantically compatible* moments before comparing | **already exists** |
| 16 | Demographic subgroup inference | attribute-intersection floor; protected traits already unstorable (`ai/understanding.js` `PROTECTED_RE`) | §7.3(5) + existing |
| 17 | Low participation → misleading "organisational truth" | `data_gap` exists as a first-class pattern; a signal must carry participation rate | partially |
| 18 | Query until threshold changes | floor, not budget — thresholds do not move | §8 |

**Cases 13 and 14 are genuinely unhandled and both are survivorship problems.**

Case 13 — attrition confound. An intervention followed by improvement, where the improvement is the
departure of the people who were unhappy. IntelliQ would report *"reported pressure fell after the
change"*, which is true and dangerously misleading. **The mitigation is cheap:** a signal comparing
two windows must report whether the contributing population changed between them. `orgUsers` has
`status`, so cohort membership per window is computable. This should be a required field on any
before/after claim, and I would make it a blocker for the "did our intervention work?" answer.

Case 14 — Simpson's paradox. An org-wide aggregate moving opposite to every constituent group.
Fully solving it needs stratified analysis. The honest pilot answer is narrower: **when an org-level
signal's direction disagrees with the majority of its constituent node-level signals, mark it
contested and do not surface it as an organisational conclusion.** That is computable from data the
signal already carries, and it fails closed.

---

# 10 · NOTICE → EXPLAIN → INVESTIGATE → ACT → MEASURE → REMEMBER → LEARN

| Stage | Production reality | Status |
|---|---|---|
| **NOTICE** | detection exists and is strong; there is no *organisational* noticing — every finding is per-person | **partially** — needs §7 |
| **EXPLAIN** | `basis`, `because`, `why`, `challenge` all computed; **stripped for leaders and never re-supplied at group level** | **partially** |
| **INVESTIGATE** | `inquiryStates` + `stateToUncertainties` exist; no leader-facing inquiry surface | **specified, not implemented** |
| **ACT** | `POST /api/intelligence/act` → `orgInterventions`; leader-owned, tied to `patternType` | **already implemented** — but per-person |
| **MEASURE** | `POST /api/intelligence/outcome` → `outcome-intelligence.summarize`, ranked by what worked | **already implemented** |
| **REMEMBER** | `ai/org-memory.js` moments; `ai/org-learning.js` intervals; `ai/org-playbook.js` confirmed practices | **already implemented** |
| **LEARN** | `_recordNoticeFeedback` → Confidence Engine suppresses unhelpful noticing types | **already implemented** |

**Five of seven stages exist in production.** The loop is broken in exactly two places, and they are
the same place twice: **the loop runs on individuals, and the leader-facing half of NOTICE and
EXPLAIN was removed for privacy rather than rebuilt at group level.**

That is the honest gap statement. Not "leadership value is missing" — *leadership value was
correctly withheld at the individual grain and never re-offered at the organisational grain.*

---

# 11 · Constitutional prohibitions

The founder's list is good. Corrections and additions:

**Keep as written:** no individual risk or performance score from private activity; no predicted
resignation or misconduct; no personality inference for management; no ranking people by
engagement; no hidden behavioural profiling; no sentiment dashboard identifying individuals; no
leader query reconstructing a protected conversation; no source attribution where the source
expected privacy; no LLM override of deterministic privacy controls.

**Sharpen — "no confidence inflation from shared origin":** this is already enforced for group
inquiries (`contribution.js:203`) and must be stated as a general law, because it is what makes
leadership intelligence honest as well as private.

**Add four:**

- **No leader-visible per-person behavioural status.** This is currently violated
  (`/api/intelligence/roster`) and naming it is what makes the violation actionable.
- **No explained suppression.** The system must not disclose that it is withholding a signal about
  an identifiable group. Suppression is indistinguishable from absence (§4).
- **No leadership aggregate containing safeguarding or `RESTRICTED` evidence** (§5).
- **No before/after organisational claim without reporting population change** (§9, case 13).

**Reject one framing.** "No employee/student risk score" is right but too narrow — the danger is the
*label*, not the number. `topLabel: "Pulling back"` on a named person is a risk score with words.
The prohibition should be on **any leader-visible per-person state derived from behaviour**,
numeric or not.

---

# 12 · The Monday-morning experience — feasibility

The founder's three examples, assessed against what the architecture can honestly support:

**"Workload pressure is rising … strongest correlate is overlapping deadlines"** — the first half is
supportable from `load` primitive streams aggregated at node level. **The second half is not**, and
should not be attempted: nothing in production computes correlates between organisational
conditions, and `ai/primitives.js` is explicit that findings are *"honest by construction: evidence
+ confidence, never a cause."* Offering a "strongest correlate" would be the first causal claim in
the product. **Recommend: state the pattern, list what co-occurred, never rank causes.**

**"A similar pattern occurred last semester; the previous intervention helped but faded after eight
weeks"** — **fully supportable today.** `ai/org-memory.js` fingerprints comparable moments,
`ai/org-learning.js` requires semantic compatibility before comparing, and
`outcome-intelligence.summarize` already phrases historically (*"was followed by"*) with
`limitations: ['not_causal']`. This is the most valuable and least risky item on the page.

**"Your organisation may believe something the evidence doesn't support"** — **supportable and
genuinely novel.** `ai/inquiry.js` has `UNCERTAINTY.UNSUPPORTED_HYPOTHESIS` (*"a pattern has
competing explanations, none confirmed"*) and `discriminate()` ranks alternatives. Confirmed org
context provides what leadership believes. The comparison is computable from two things that already
exist and have never been pointed at each other.

**The page shape** is `behaviour.plan()` with an org audience — grouping, ordering, volume cap and
calm silence already exist and need no new layer.

---

# 13 · Smallest pilot-worthy implementation

Ordered by value per risk. **All of it is behind the P0 blockers.**

**Step 0 — retire the surveillance surface.** Before building anything: remove `topLabel` and
per-person `status` from `/api/intelligence/roster`, and route `/api/intelligence/briefing` through
`proactive.toInsight({ audience: 'leader' })` + `audienceSafe` so Path B inherits Path A's
guarantee. **This is a deletion, it is the highest-value change in this document, and it does not
depend on anything else.** A leader keeps a roster of who they lead; they lose the behavioural
labels.

**Step 1 — the historical analogue.** One card: *"a similar pattern occurred before; here is what
was tried and what followed."* Uses `org-memory` + `org-learning` + `outcome-intelligence`, all
existing, all already privacy-redacted to structural categories. No new privacy surface.

**Step 2 — the Organisational Signal object and its gate** (§7). This is the real work.

**Step 3 — belief vs evidence.** Confirmed org context against `UNSUPPORTED_HYPOTHESIS`. Small,
distinctive, no person-level data by construction.

**Step 4 — the leadership question surface.** Extend `ai/org-answer.js` intents; context assembled
only from admissible signals; `leadershipSafe()` before any model call; session attribute floor.

**Not for the pilot:** the attention engine ranking (§11 of the prompt) — `behaviour.plan()` already
ranks, and a second ranker is the parallel-system failure this codebase has three examples of.
Differential privacy. Formal k-anonymity. Causal correlates.

---

# 14 · Tests and invariants required before implementation

Written before code, per the established pattern:

1. `leadership-privacy-smoke` — **no leader-facing route returns a person id, name, or evidence
   basis string.** Asserted by walking the actual route responses, not by inspection. This is the
   Step 0 gate and it will fail today.
2. `cohort-floor-smoke` — a signal with cohort < K is absent, and absent identically to a signal
   that does not exist. Assert the two responses are byte-identical.
3. `attribute-intersection-smoke` — the Year 11 ∩ football case suppresses even when each attribute
   individually clears K.
4. `session-floor-smoke` — a four-question drill-down sequence refuses at the point the candidate
   set drops below K, and refuses identically regardless of order.
5. `origin-inflation-smoke` — twenty derived claims from one origin produce one origin's confidence.
6. `population-change-smoke` — a before/after claim whose cohort membership changed reports it.
7. `safeguarding-exclusion-smoke` — restricted and safeguarding-flagged evidence never enters an
   aggregate.
8. `leadership-llm-context-smoke` — the assembled model context contains no person-level data;
   assert on what is passed to the gateway, not on what comes back.

---

# 15 · Founder decisions still required

1. **Step 0 — do the leader surfaces get cut before the pilot?** Falcon's headmaster will see either
   a named behavioural status board or a roster without labels. This is a product decision with a
   real cost: the current surface is the most concretely useful thing a leader has today, and it is
   the thing the founder says must never exist. **I recommend cutting it, and I recognise that is
   removing working functionality a month before a pilot.**
2. **K.** I recommend 5, never below 3. At a 300-person school with year groups and teams, K=5
   suppresses a lot. This is the privacy/utility dial and it belongs to the founder.
3. **Silent suppression.** Confirm that IntelliQ may stay silent about something real and may not
   say that it is doing so.
4. **Causal correlates.** Confirm they are out of scope — the founder's own example asked for one.
5. **Does the leader keep the per-person path at all?** `/api/proactive/insights/leader/:subjectId`
   is privacy-correct and genuinely useful for supporting one person a leader is already worried
   about. I recommend keeping it: it is directional, care-first, basis-stripped, and
   `audienceSafe`-verified. But it is a per-person leader read, and the founder should affirm it
   deliberately rather than inherit it.

---

# The honest summary

IntelliQ has not overcorrected toward privacy for leaders. **It has excellent individual protection
and one un-projected leader path that walks straight past it** — a named list of people labelled
*Pulling back*, *Gone quiet*, *Overload risk*, fetched by the leader home page today.

Eleven of the thirteen capabilities a leadership intelligence layer needs already exist in
production. Five of the seven loop stages exist. What is missing is not intelligence — it is that
the loop runs at the individual grain, and the leader-facing half of NOTICE and EXPLAIN was
correctly withheld there and never rebuilt at the organisational grain.

So the answer to the founder's closing question is **yes, and the two halves are the same
change**. Making the organisation knowable is what lets you stop making its people legible: the
Organisational Signal is both the new leadership value and the reason the roster's labels can be
deleted. Build the group-level notice, and the person-level one has nothing left to justify it.

One mechanism is genuinely new — the session attribute floor — and it is a list of named attributes
and a candidate-set count, not a privacy budget. Everything else is assembly.

**Nothing here precedes P0-1, P0-2, P0-3, P0-D or P0-5.** Step 0 is a deletion and could ship
alongside them; the rest waits for Falcon to say which signals a real headmaster acts on.
