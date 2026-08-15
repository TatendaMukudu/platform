# IntelliQ TTD v1 — the product-truth document

**Status:** authoritative as of 2026-08-15. Supersedes ad-hoc product statements elsewhere.
**Preceded by:** `docs/ttd/round-3-cross-examination.md` (the audit this document answers).

This document says two different things, and never confuses them:

1. **What IntelliQ is supposed to be** — the laws.
2. **What the implementation currently guarantees** — the enforcement status of each law.

Those are separate columns because they are separate facts. Earlier in this project an
architectural claim was written into three files before anyone opened the code, and it was
false. A TTD that cannot be checked against the implementation is more dangerous than no TTD,
because it is more confidently wrong. Every law below carries a status, and no law is marked
ENFORCED without a cited file **and** a cited test.

## Enforcement status vocabulary

| Status | Meaning |
|---|---|
| **ENFORCED** | Behaviour exists in code **and** an executable test arbitrates it. |
| **PARTIAL** | Supporting behaviour exists but does not satisfy the full law. |
| **SPECIFIED** | The product decision is made; nothing enforces it yet. |
| **OPEN** | Deliberately unresolved. Implementation must not silently decide it. |
| **DISCOVER** | To be settled by user/pilot evidence, not internal speculation. |

A law that is SPECIFIED is not a weaker law. It is an unpaid debt with a due date.

---

# 1. Purpose

**IntelliQ helps an organisation grow.**

More fully: IntelliQ helps individuals, teams and organisations understand what they are trying
to grow, identify what is helping or hindering it, investigate uncertainty through
evidence-backed inquiries, act, measure what happened, and retain contextual learning about what
works.

The organisation defines what growth means for it. IntelliQ helps cultivate that without
violating its own constitution.

**The architectural test of whether this is real:** if the LLM disappears, IntelliQ should become
less articulate and worse at ambiguous synthesis, but it must not become unintelligent. The
deterministic evidence system is the chassis; the model is the bodywork.

**The loop.** Observe → question → understand → act → measure → learn. Expanded:

```
Signal → Question → Inquiry → Evidence → Understanding → Action
       → Measurement → Outcome → Learning → Memory → Better questions
```

The stages overlap in practice and the sequence is not sacred. The ordering that *is* load-bearing
is that **question precedes judgement** and **action precedes measurement** — a system that
diagnoses before asking, or advises without measuring, is a different product.

---

# 2. The Constitutional Boundary

There are two bodies of truth. The interesting part is not either one — it is where they meet.

## 2.1 The IntelliQ Constitution

Non-negotiable. Belongs to the product, not to any customer. Evidence-backed claims, provenance,
inspectability, honest uncertainty, anti-surveillance, privacy, consent, contestability, visible
corrections, human dignity, safety, no winning at all costs, and deterministic reasoning wherever
deterministic reasoning suffices.

## 2.2 The Organisational Constitution

Established at onboarding, amended over time: mission, goals, values, definitions of growth and
success, metrics, acceptable practice, boundaries, policies, structure, vocabulary, priorities.

This is **context, not permission**. It tells IntelliQ what the organisation is trying to grow so
that reasoning is grounded in that rather than in a universal notion of success.

## 2.3 The precedence rule

> **The organisation chooses the destination. The IntelliQ Constitution constrains the
> permissible route.**

---

### LAW C1 — Organisational truth contextualises IntelliQ; it never overrides IntelliQ's constitution

**RATIONALE.** A constitution an administrator can switch off is not a constitution. The founder
would refuse a $2M customer demanding employee surveillance; that refusal must be a property of
the software, not of whoever answers the phone.

**INVARIANT.** No configuration, policy, role or administrative action may enable behaviour the
IntelliQ Constitution prohibits. There is no override mechanism, and adding one is itself a
violation.

**ENFORCEMENT.** Partial and by instance rather than by rule. `ai/org-context.js:12-14` hard-blocks
private/wellbeing/surveillance content from becoming operating rules — refusal is structural
there. No general precedence mechanism exists.

**TEST.** `scripts/org-context-smoke.js` covers the surveillance block. No test asserts the
general rule.

**STATUS: PARTIAL.**

---

### LAW C2 — A refused operation must be explained, offered an alternative, and recorded

**RATIONALE.** Silent refusal is indistinguishable from a bug, and teaches administrators to
route around the product. A recorded conflict is also the evidence base for deciding whether a
boundary is wrong.

**INVARIANT.** On constitutional refusal IntelliQ (a) refuses, (b) names the boundary, (c) offers
a compliant alternative where one exists, (d) records the conflict, (e) never weakens the
boundary.

**ENFORCEMENT.** None. `ai/audit.js` provides the recording substrate but has no refusal event.

**TEST.** None.

**STATUS: SPECIFIED — NOT YET ENFORCED.**

---

# 3. Product ontology

The vocabulary, reconciled against what the kernel actually uses. Where the product discussion
and the code disagreed, the code's vocabulary usually won, because it is the one under test.

| Concept | Definition | In code |
|---|---|---|
| **Signal** | The atomic observation. Carries `ref`, `status`, `originRef`, `originKind`. | `ai/diagnose.js` |
| **Evidence envelope** | A canonical record with its own lifecycle, subject and visibility. | `lib/evidence.js:39` |
| **Inquiry** | The primary reasoning container: signals, hypotheses, a frontier of open questions. | `ai/diagnose.js:newInquiry` |
| **Belief** | A durable read the reasoner holds, with a status and outcome. | `ai/reason.js:238` |
| **Claim** | A statement made to a human, which must be grounded. | `ai/conversation.js:25` |

**Two lifecycles exist and must not be conflated.** Evidence envelopes are
`active/held/superseded/deleted/rejected` (`lib/evidence.js:39`); signals are
`active/superseded/withdrawn` (`ai/diagnose.js:190`). A gate written for one does not fit the
other. This is a real asymmetry in the system, not a defect to unify hastily.

---

# 4. Evidence classes — what each kind of evidence can establish

**This section exists because of D1, and it is the most important new material in this document.**

## 4.1 The problem it solves

An organisation is better instrumented than any person in it. A calendar, a chat log and a ticket
system emit corroborating records continuously; a person's account of their own experience emits
one signal. Any rule that resolves disputes by counting sources will therefore, over time and
across every disputed case, decide against the individual — not because the organisation is more
truthful, but because it has more sensors.

That is majority rule wearing the costume of evidence, and it lands hardest on exactly the people
this product claims to serve.

## 4.2 The classes

| Class | Can establish | Cannot establish |
|---|---|---|
| **Occurrence evidence** (calendar, attendance, system logs) | that a thing happened, when, who was present | that it was useful, understood, or well done |
| **Communication evidence** (message metadata, volume, timing) | that communication occurred, its shape and rhythm | its content's quality, or how it was received |
| **Reported experience** (what a person says about their own experience) | that this is how it seemed to them | that it is how it seemed to anyone else |
| **Observation** (what someone saw a third party do) | that the observer perceived it | the observed person's intent or experience |
| **Document** (imported records, policies, artefacts) | what was written and when | that it was followed |
| **Derived** (produced by IntelliQ from data it holds) | a restatement of its inputs | anything its inputs could not establish |

The existing `ORIGIN_KINDS` (`ai/diagnose.js:163-170`) —
`direct_observation, self_report, reported, document, system, unknown` — is a coarse version of
this and is the right foundation. It currently governs **independence counting** only. This law
extends it to govern **what a source may establish**.

---

### LAW E1 — Evidence may only establish claims within its class

**RATIONALE.** A calendar entry proving a 1:1 occurred is not evidence that feedback was given.
Treating it as such is the single most likely way this product becomes an instrument of
management while believing itself to be fair.

**INVARIANT.** For any claim, only evidence whose class can establish that proposition may
contribute support. Evidence outside the class contributes context, never support.

**ENFORCEMENT.** None. `deriveConfidence` (`ai/diagnose.js:200-240`) counts independent origins
regardless of class; `originKind` affects independence weighting, not admissible scope.

**TEST.** None.

**STATUS: SPECIFIED — NOT YET ENFORCED.** *Highest-priority debt in this document.*

---

### LAW E2 — Source count alone never determines truth

**RATIONALE.** Corollary of E1 and the direct answer to instrumentation bias.

**INVARIANT.** Where sources conflict, IntelliQ decomposes the disagreement into the propositions
each source can actually support. Three organisational sources do not defeat one human account
where the three establish only peripheral facts.

**ENFORCEMENT.** Partial and in the opposite direction from what is needed. Repetition is already
prevented from manufacturing confidence — `ai/diagnose.js:218-240` counts distinct `originRef`,
and `UNKNOWN_ORIGIN_CAP` (`:177`) caps unestablished origins at 2 so "a room may never out-weigh
two people known to have seen a thing separately." That is genuine and tested. But nothing
prevents well-attributed *occurrence* evidence from outweighing a self-report about *experience*.

**TEST.** `scripts/origin-correction-smoke.js` covers repetition. Nothing covers class asymmetry.

**STATUS: PARTIAL.**

---

### LAW E3 — Lived experience is not outvoted by instrumentation

**RATIONALE.** The narrow case of E1 that matters most for dignity.

**INVARIANT.** Where a person's report about their own experience conflicts with inference drawn
from organisational instrumentation, the result is a contested finding. It is never silently
resolved against the person.

**ENFORCEMENT.** None.

**TEST.** None.

**STATUS: SPECIFIED — NOT YET ENFORCED.**

---

### LAW E4 — Every meaningful claim carries provenance

**RATIONALE.** A claim that cannot be traced cannot be argued with, and an unarguable system
becomes an oracle.

**INVARIANT.** Every claim can answer what, why, who, when, how, source, confidence, uncertainty.
Unknown origin is recorded as unknown, never assumed.

**ENFORCEMENT.** `ai/diagnose.js:163-170` `ORIGIN_KINDS` with `unknown` as the conservative
default; `originOf`/`normaliseOrigin` `:452-458`; `deriveConfidence` returns `{score, band,
because}` where `because` is a human-readable justification array.

**TEST.** `scripts/origin-correction-smoke.js`, `scripts/diagnose-smoke.js`.

**STATUS: ENFORCED.**

---

### LAW E5 — Repetition is not corroboration

**INVARIANT.** Confidence counts independent origins, never voices. Ten people relaying one
observation is one origin. An origin is never minted to move a number.

**ENFORCEMENT.** `ai/diagnose.js:218-240`; `UNKNOWN_ORIGIN_CAP = 2` at `:177`.

**TEST.** `scripts/origin-correction-smoke.js`.

**STATUS: ENFORCED.**

---

### LAW E6 — Corrections preserve history and stop counting

**INVARIANT.** Superseded evidence stops supporting current claims and never disappears.
Revisions do not rewrite the epistemic timeline.

**ENFORCEMENT.** `supersede()` `ai/diagnose.js:485-491` returns a **new** signal retaining
`supersededBy/At/Reason`; `:380-386` summarises what was corrected; `_kernelEvidence`
(`server.js:7355`) excludes non-active envelopes from retrieval by allowlist;
`ai/admissibility.js` gates signals and reports *why* each exclusion happened.

**TEST.** `scripts/origin-correction-smoke.js`, `scripts/lifecycle-smoke.js`,
`scripts/admissibility-smoke.js`.

**STATUS: ENFORCED.**

---

### LAW E7 — "I don't know" is a valid and preferred answer

**INVARIANT.** With insufficient evidence IntelliQ says so, offers plausible possibilities with
their support, and names what would resolve the uncertainty. It never escalates to invention.

**ENFORCEMENT.** Partial. `deriveConfidence` returns a `tentative` band with an explaining
`because` when nothing is recorded (`ai/diagnose.js:206-209`), and
`ai/outcome-intelligence.js:earlySignalBrief` returns `suggestedNextStep: null` with a
`no_outcome_history` limitation rather than guessing. There is no general rule forcing an
unknown answer at the composition boundary.

**TEST.** `scripts/outcome-ranking-smoke.js` case 7 covers the outcome path.

**STATUS: PARTIAL.**

---

### LAW E8 — Confidence is computed, never asserted

**INVARIANT.** No module may state its own confidence or its own safety. A hardcoded `safe: true`
or a literal confidence band on an evidence-citing item is a defect.

**ENFORCEMENT.** `scripts/epistemic-invariants-smoke.js` sections 1, 1b, 1c scan every module in
`ai/`. Producers compute `safe` through `ai/language-guard.js`.

**TEST.** `scripts/epistemic-invariants-smoke.js`.

**STATUS: ENFORCED.**

---

# 5. The three authorities

**Knowing, disclosing and acting are three different permissions.** This distinction was exposed
by the Round 3 audit and is now constitutional.

```
EPISTEMIC AUTHORITY   — may IntelliQ believe this?        governed by evidence
DISCLOSURE AUTHORITY  — may IntelliQ tell someone?        governed by consent
ACTION AUTHORITY      — may IntelliQ do something?        governed by mandate
```

Each is a separate gate, and passing one grants nothing about the next.

- IntelliQ may hold evidence about John that stays private to John.
- IntelliQ may judge Jane's method relevant to Engineering without permission to name Jane.
- IntelliQ may tell a user a problem exists without authority to act on the organisation.
- A safety exception may alter **disclosure** authority without granting **action** authority.

---

### LAW A1 — Epistemic, disclosure and action authority are separately gated

**RATIONALE.** Collapsing them is how well-intentioned systems become surveillance: the
justification for knowing quietly becomes the justification for telling.

**INVARIANT.** No code path may treat justified belief as sufficient grounds for disclosure, or
permitted disclosure as sufficient grounds for action.

**ENFORCEMENT.** Partial and implicit. The gates exist but are not named as one model:
`_kernelEvidence` (`server.js:7349-7362`) is purpose-scoped and excludes private evidence before
context is built; `ai/proactive.js:audienceSafe()` constrains what a leader-audience artifact may
carry; every suggestion carries `requiresConfirmation`. There is no unified authority model, so
the separation depends on each path remembering it.

**TEST.** `scripts/private-evidence-smoke.js`, `scripts/proactive-smoke.js`.

**STATUS: PARTIAL.**

---

# 6. Privacy, consent and the surveillance boundary

### LAW P1 — IntelliQ is not surveillance, and the test is structural

**RATIONALE.** "IntelliQ is not spyware" is a slogan until it is a mechanism. Observing Slack to
infer a person's trajectory *is* monitoring, however benign the intent — so the defensible
distinction is not whether behaviour is observed but what the observed person can see, withhold
and control.

**INVARIANT.** Three properties, all required:
1. the subject can inspect everything derived about them;
2. the subject can withhold a source from inference about themselves, and the system degrades
   confidence rather than penalising the refusal;
3. no derived intelligence about a person reaches another person without an authorised act.

**ENFORCEMENT.** (1) Partial — `server.js:10662` exposes a rectification route and
`ai/audit.js` records access. (2) **Nothing.** (3) Partial — purpose scoping and `audienceSafe()`.

**TEST.** `scripts/privacy-smoke.js`, `scripts/private-evidence-smoke.js`,
`scripts/audit-smoke.js`.

**STATUS: PARTIAL.** *Property 2 is entirely absent, and it is the one that makes the other two
more than transparency theatre — inspection without the power to withdraw is not control.*

---

### LAW P2 — Relevance is not authorisation; membership is not consent

**INVARIANT.** Something may obviously concern a team and still belong privately to one person.
These are two questions with two answers and two functions.

**ENFORCEMENT.** `ai/contribution.js` exists entirely for this — "Membership is not consent, and
it is not relevance either" (`:14`); `classifyScope` and `mayContribute` are separate functions.

**TEST.** `scripts/group-subject-smoke.js`, `scripts/private-evidence-smoke.js`.

**STATUS: ENFORCED.**

---

### LAW P3 — Speech is not evidence

**INVARIANT.** A Forum message changes nothing until its author deliberately contributes it
through the contribution boundary.

**ENFORCEMENT.** `ai/forum.js`, `ai/contribution.js`.

**TEST.** `scripts/forum-smoke.js`.

**STATUS: ENFORCED.**

---

### LAW P4 — The person is the first beneficiary of intelligence about themselves

**RATIONALE.** If IntelliQ notices John's pattern, John should learn first and decide who else
does. This is the product's central promise to the people it observes.

**INVARIANT.** Intelligence about an individual is offered to that individual before it is
available to anyone above them, and onward disclosure requires the subject's act.

**ENFORCEMENT.** Partial, and the gap is a category difference rather than a shortfall.
`ai/proactive.js:11-22` provides `render.self` and `render.leader` with `audienceSafe()` ensuring
leader-audience artifacts carry "ONLY a directional signal" without private specifics. That is
audience-scoped *disclosure*. It is not *sequencing* and not *consent*: both renderings are
produced in one pass, and nothing withholds the leader view pending the subject's decision.

**TEST.** `scripts/proactive-smoke.js` covers audience safety, not sequencing.

**STATUS: PARTIAL.**

---

### LAW P5 — Consent is required before revealing another person's private contribution

**RATIONALE.** The Jane case. A Finance solution relevant to Engineering does not become
Engineering's to know because it would be useful.

**INVARIANT.** Before identifying a person or surfacing their private material to others,
IntelliQ asks that person. It may describe the situation without unnecessarily identifying
anyone.

**ENFORCEMENT.** **None.** `ai/contribution.js:81` states explicitly that it "Returns
{ scope, reason, groupLanguage } — **never a permission**". No consent-request workflow exists.

**TEST.** None.

**STATUS: SPECIFIED — NOT YET ENFORCED.**

---

### LAW P6 — Anonymity means unable to be inferred, not merely unnamed

**RATIONALE.** D2. In a six-person team, "one engineer with declining deadlines benefited from
written instructions" identifies its subject to anyone who knows the team. Removing a `userId`
does not make knowledge anonymous.

**INVARIANT.** Knowledge may not be promoted as anonymous organisational learning where
contextual re-identification risk is meaningful. Where it is, IntelliQ keeps it private,
generalises further, waits for aggregation, or asks consent. The individual controls identifiable
promotion by default.

**ENFORCEMENT.** **None.** `ai/org-playbook.js` promotes candidates to entries on
confidence/support grounds with no cohort-size or re-identification test.

**TEST.** None.

**STATUS: SPECIFIED — NOT YET ENFORCED.**
*The cohort threshold is a founder number and remains OPEN — see §13.*

---

### LAW P7 — Cross-organisation isolation is absolute

**INVARIANT.** No evidence, belief or derived artifact crosses an organisation boundary.

**ENFORCEMENT.** `_kernelEvidence` org-scoped; durable units partition per org
(`server.js:_durableUnits`).

**TEST.** `scripts/cross-org-isolation-http-smoke.js`, `scripts/persistence-smoke.js` case 3.

**STATUS: ENFORCED.**

---

# 7. Contestability and user rights

### LAW U1 — A person may inspect what IntelliQ believes about them

**ENFORCEMENT.** `server.js:10662` documents the rectification route;
`_reasonCanSeeBelief` scopes visibility; subjects may read beliefs about themselves.

**TEST.** `scripts/self-model-http-smoke.js`, `scripts/audit-http-smoke.js`.

**STATUS: ENFORCED.**

---

### LAW U2 — A contest changes the epistemic state of a belief

**RATIONALE.** D4. If a contest only annotates, contestability is a comment box. If it deletes,
any inconvenient truth can be switched off. The honest middle is a state change.

**INVARIANT.** A valid contest moves the belief out of settled status. While contested:
history is preserved; the counterclaim becomes first-class evidence; IntelliQ may not present the
belief as settled fact; downstream reasoning discloses the contest; high-impact uses may be
suspended; IntelliQ seeks resolving evidence; resolution is itself evidence-backed and audited.

**ENFORCEMENT.** Partial, and the shortfall is specific. **The state machine already exists** —
`ai/reason.js:238` computes `dormant | contested | open`, and `:254-255` maps
`contested → resolved` once resolving evidence arrives. But a *user's* contest does not drive it.
`applyFeedback` (`ai/reason.js:490-499`) records `b.feedback` and sets
`b.suppressUntil = now + WRONG_COOLDOWN` — a **timer, not a state**. `server.js:10572` writes a
`belief_contest` audit event. `server.js:10252` states the design intent plainly: contest is "a
signal to revisit, never an automatic change."

Consequence: a contested belief is hidden for a cooldown and then **returns automatically,
unresolved, and presents as settled again**. That is the specific behaviour D4 prohibits.

**TEST.** `scripts/self-model-http-smoke.js` covers the contest route's permissions, not its
epistemic effect.

**STATUS: PARTIAL.** *Closest large gap to being closed — the vocabulary and the state machine
both exist; the user's contest simply is not wired to them.*

---

### LAW U3 — IntelliQ may disagree with a human, and is never an oracle

**RATIONALE.** The founder's "both are entitled to their opinion" is out of keeping with the rest
of the model — IntelliQ holds claims with provenance and confidence, not opinions. A manager's
disagreement is new evidence of the *reported experience* class, and the honest result is a
contested finding.

**INVARIANT.** Disagreement between IntelliQ and a human produces a contested finding recording
both accounts, never a silent win for either.

**ENFORCEMENT.** Partial — `ai/conversation.js:25` has `disputed` as a first-class claim state and
`:58` derives it when "two definite answers of different authority AND different content" appear.
The code is ahead of the product model here. It is not connected to belief-level contest (U2).

**TEST.** `scripts/conversation-smoke.js`.

**STATUS: PARTIAL.**

---

### LAW U4 — A person may decline IntelliQ's attention

**RATIONALE.** A system that keeps checking on someone who has said no is not supportive, and
"the person benefits first" becomes "the person is managed first."

**INVARIANT.** A subject may decline proactive attention on a topic or entirely. The refusal is
honoured, is not itself treated as a signal of concern, and does not degrade their standing.

**ENFORCEMENT.** None beyond `suppressUntil` cooldowns, which expire.

**TEST.** None.

**STATUS: SPECIFIED — NOT YET ENFORCED.**

---

# 8. Question before judgement

### LAW Q1 — A change produces a question before it produces a diagnosis

**RATIONALE.** Three missed deadlines mean *something has changed*. They do not mean *disengaged*
and they never mean *will quit*.

**INVARIANT.** A detected change opens an inquiry or a question before any characterisation of a
person. Escalation from observation to interpretation requires evidence that the interpretation
specifically needs.

**ENFORCEMENT.** Partial. The machinery exists — `ai/diagnose.js` `frontierFor`, `nextNeed`,
`rankQuestions`, `diagnosticYield`; `LEVELS = ['observation','interpretation','hypothesis',
'conclusion']` (`:44`) with `MODEL_MAY_PROPOSE` constraining what a model may assert. No rule
*orders* question before judgement.

**TEST.** `scripts/diagnose-smoke.js`.

**STATUS: PARTIAL.**

---

### LAW Q2 — IntelliQ never predicts a person

**INVARIANT.** IntelliQ describes evidence, uncertainty and possibility. It does not turn them
into prophecies about a person. "Signals indicate elevated disengagement risk" is admissible when
grounded; "This player will quit" is not, in any confidence band.

**ENFORCEMENT.** `ai/language-guard.js` `PREDICTIVE` and `DIAGNOSTIC`, applied at LLM edges.
PR #58 adds `PERSON_FUTURE` closing the bald-prophecy gap.

**TEST.** `scripts/language-guard-smoke.js`.

**STATUS: PARTIAL on `main` today; ENFORCED when PR #58 merges.** A known false-positive class
remains — `Sync will fail` matches `PERSON_FUTURE` because system nouns look like names.

---

# 9. Learning, memory and promotion

### LAW L1 — Knowledge does not travel upward automatically

**INVARIANT.** personal → shared → group → organisational is a path, not a gradient. Each step
requires a reason and, where identity is involved, consent.

**ENFORCEMENT.** `ai/contribution.js` gates entry to group subjects; `ai/org-playbook.js` requires
candidate→entry confirmation with `confirmedBy`/`confirmedAt` (`:128-140`).

**TEST.** `scripts/group-subject-smoke.js`, `scripts/org-playbook-smoke.js`.

**STATUS: ENFORCED** for the group boundary; see P6 for the anonymity condition, which is not.

---

### LAW L2 — Learning is contextual, and failure is remembered contextually too

**RATIONALE.** A remedy that worked in Finance is not a prescription for Engineering, and one
that failed in Team A is not banned from Team B. Context, not symptom similarity, decides.

**INVARIANT.** Before transfer IntelliQ compares context, constraints and outcomes, states which
properties match and which differ, and offers the transfer as a proposal with confidence.
Failures are recorded against their context, never globally.

**ENFORCEMENT.** Partial. `ai/org-playbook.js` retains `confidenceAtConfirmation`,
`counterEvidenceAtConfirmation`, `limitations` and sample; lifecycle review re-checks a confirmed
practice against current history (`:143-148`). No cross-context similarity test exists.

**TEST.** `scripts/org-playbook-smoke.js`, `scripts/org-learning-smoke.js`.

**STATUS: PARTIAL.**

---

### LAW L3 — IntelliQ says when it was wrong

**INVARIANT.** A revised assessment is stated as a revision, with the earlier position intact and
visible. Silence about a reversal is a lie of omission.

**ENFORCEMENT.** `supersede()` preserves the prior signal; `ai/diagnose.js:380-386` produces a
correction summary; `ai/reason.js:254` resolves contested beliefs explicitly.

**TEST.** `scripts/origin-correction-smoke.js`.

**STATUS: ENFORCED** at the evidence layer. Whether a *recommendation* reversal is surfaced to
the person who acted on it is **PARTIAL** — see M2.

---

# 10. Measurement and outcomes

### LAW M1 — Advice without measurement is not intelligence

**INVARIANT.** IntelliQ retains what was attempted, where, under what circumstances, expected
outcome, actual outcome, evidence strength, uncertainty and subsequent corrections.

**ENFORCEMENT.** `ai/outcome-intelligence.js` records intervention→outcome with evidence refs and
limitations; ranking is by efficacy with evidence strength preserved separately (PR #58).

**TEST.** `scripts/outcome-intelligence-smoke.js`, `scripts/outcome-ranking-smoke.js`.

**STATUS: PARTIAL** on `main`; the efficacy ranking lands with PR #58.

---

### LAW M2 — Activity, output, outcome and improvement are four different things

**RATIONALE.** "Activity alone is not success" is a sentence until the system can tell the four
apart. An organisation that defines success as ticket volume will otherwise get exactly that.
70 tickets is activity; happier customers and three colleagues improved is outcome.

**INVARIANT.** IntelliQ distinguishes the four levels and will not report activity as
improvement. An Organisational Constitution may not define success purely as activity.

**ENFORCEMENT.** **None.** No such taxonomy exists anywhere in `ai/`.

**TEST.** None.

**STATUS: SPECIFIED — NOT YET ENFORCED.**

---

### LAW M3 — Causal language is earned, not assumed

**INVARIANT.** "Performance improved after this intervention" is admissible; "this intervention
worked" requires evidence that specifically supports causation. Correlation is never reported as
cause.

**ENFORCEMENT.** `ai/outcome-intelligence.js` emits `"was followed by"` phrasing and carries
`not_causal` in every `limitations` array; `scripts/invariants.js` product law 3.

**TEST.** `scripts/outcome-ranking-smoke.js` case 7, `scripts/invariants.js`.

**STATUS: ENFORCED.**

---

# 11. Safety escalation

### LAW S1 — Safety never depends on the model being switched on

**ENFORCEMENT.** `ai/safeguarding.js:3` — "Safety must NEVER depend on the LLM being switched on.
This module is fully deterministic". Two tiers, real crisis resources, org-overridable numbers.

**TEST.** `scripts/safeguarding-smoke.js`, `scripts/safeguarding-http-smoke.js`.

**STATUS: ENFORCED.**

---

### LAW S2 — Safety exceptions are narrow, governed and audited

**RATIONALE.** The exception must not become a generic "AI may escalate concerning things"
permission. A safety exception alters **disclosure** authority only; it grants no action
authority (LAW A1).

**INVARIANT.** Any disclosure under exception has a defined trigger, an evidence threshold, a
named accountable recipient, minimum necessary disclosure, human involvement where the situation
allows, and an audit record.

**ENFORCEMENT.** Partial, and this is the widest gap between stated policy and code in the
system. `ai/safeguarding.js` is honest about the trade-off and tells the person plainly that a
safe adult is being brought in — which is right. But CRISIS routes a flag to the safeguarding
lead **on pattern match alone**: no confidence threshold, no human authorisation before
disclosure, recipient is a role rather than a named person, and no minimum-disclosure rule.

**TEST.** `scripts/safeguarding-smoke.js` tests detection, not disclosure governance.

**STATUS: PARTIAL.**

*Deliberate note: erring toward sensitivity on self-harm is correct and this law does not ask for
a slower path to help. It asks what is disclosed, to whom, and who authorised it.*

---

# 12. Agent autonomy and product simplicity

### LAW G1 — The LLM proposes; deterministic code decides

**INVARIANT.** Permissions, identity, confidence, origin counts and state transitions are
computed, never generated. A model may never author a permission or assert its own confidence.

**ENFORCEMENT.** `ai/gateway.js:58` `deterministicOnly()`, `:137` no-egress backstop;
`MODEL_MAY_PROPOSE` in `ai/diagnose.js`; `scripts/epistemic-invariants-smoke.js` enforces computed
safety and confidence.

**TEST.** `scripts/no-egress-smoke.js`, `scripts/reasoning-boundaries-smoke.js`,
`scripts/epistemic-invariants-smoke.js`.

**STATUS: ENFORCED.**

---

### LAW G2 — The agent is proactive, not controlling

**INVARIANT.** It raises questions, surfaces evidence, requests context, suggests actions and
follows outcomes. Every suggestion is confirmation-gated. It does not act on the organisation
autonomously and does not behave as an omniscient manager.

**ENFORCEMENT.** `requiresConfirmation` on suggestions across `ai/proactive.js`,
`ai/outcome-intelligence.js`, `ai/scoped-intelligence-packet.js`, computed in
`ai/priority-office.js:stamp`.

**TEST.** `scripts/proactive-smoke.js`, `scripts/priority-office-smoke.js`.

**STATUS: ENFORCED.**

---

### LAW G3 — Complex system, simple mental model

**INVARIANT.** Prefer the simplest mechanism that preserves the invariant: a deterministic rule
over a model where the outcome is determinable; one agent with clear capabilities over
multi-agent coordination; ordinary retrieval over graph machinery where relationships are already
explicit; explicit state transitions over autonomous reasoning where the workflow is
deterministic. AI sophistication is not a product objective. Growth is.

**ENFORCEMENT.** Cultural, enforced at review. `AGENTS.md` §3 "Consolidate, don't sprawl";
`scripts/epistemic-invariants-smoke.js:1c` enforces one canonical language guard rather than
per-module copies.

**STATUS: PARTIAL.** Structural in one place, cultural elsewhere.

---

# 13. Register — OPEN and DISCOVER

## OPEN — must not be silently decided by implementation

| # | Question | Why it stays open |
|---|---|---|
| O1 | Does personal development understanding travel with a person between organisations? | Depends on account/subscription structure not yet settled. Affects whether IntelliQ is an employer tool or a person's record. |
| O2 | The re-identification cohort threshold for LAW P6 | The number encodes how much organisational learning is traded for how much re-identification risk. A founder number. |
| O3 | Who authorises a safety disclosure under LAW S2, and what happens out of hours | Determines whether S2 is implementable as designed. |
| O4 | When individual growth goals conflict with organisational goals, what does IntelliQ do? | Not yet posed sharply enough to answer; likely resolves into LAW A1's authority split. |
| O5 | How is the Organisational Constitution amended, and by whom? | Governance question; affects whether org truth can be quietly rewritten to suit a narrative. |

## DISCOVER — settle with users, not internally

| # | Question |
|---|---|
| D-1 | The five surviving concepts and the navigation model. Candidates: Ask, Inquiries, Growth, People, Forum. |
| D-2 | The home-screen invitation. Candidate: "What are you trying to improve?" Principle is *prompt strongly*; wording undecided. |
| D-3 | Proactive check-in cadence, and what "appropriately" means in practice. |
| D-4 | Whether the agent is a destination or an intelligence layer throughout the product. |

**One caution on D-1.** The founder named Inquiries as the concept that proves someone
understands IntelliQ. If that is true, navigation should make Inquiries unavoidable — and a
search-box home screen makes it optional. Test that tension directly with users.

---

# 14. Law register — the honest ledger

| Law | Subject | Status |
|---|---|---|
| E4 | Provenance on every claim | ENFORCED |
| E5 | Repetition is not corroboration | ENFORCED |
| E6 | Corrections preserve history and stop counting | ENFORCED |
| E8 | Confidence and safety computed, never asserted | ENFORCED |
| P2 | Relevance is not authorisation | ENFORCED |
| P3 | Speech is not evidence | ENFORCED |
| P7 | Cross-org isolation | ENFORCED |
| U1 | A person may inspect beliefs about them | ENFORCED |
| L1 | Knowledge does not travel upward automatically | ENFORCED |
| L3 | IntelliQ says when it was wrong (evidence layer) | ENFORCED |
| M3 | Causal language is earned | ENFORCED |
| S1 | Safety independent of the LLM | ENFORCED |
| G1 | LLM proposes, deterministic code decides | ENFORCED |
| G2 | Proactive, not controlling | ENFORCED |
| C1 | Org truth cannot override the constitution | PARTIAL |
| E2 | Source count never determines truth | PARTIAL |
| E7 | "I don't know" is valid | PARTIAL |
| A1 | Three authorities separately gated | PARTIAL |
| P1 | Not surveillance — three structural properties | PARTIAL |
| P4 | The person benefits first | PARTIAL |
| U2 | A contest changes epistemic state | PARTIAL |
| U3 | May disagree, never an oracle | PARTIAL |
| Q1 | Question before judgement | PARTIAL |
| Q2 | Never predicts a person | PARTIAL (ENFORCED on PR #58 merge) |
| L2 | Learning is contextual | PARTIAL |
| M1 | Advice without measurement is not intelligence | PARTIAL |
| S2 | Safety exceptions narrow and governed | PARTIAL |
| G3 | Complex system, simple model | PARTIAL |
| C2 | Refusal explained, alternative offered, recorded | SPECIFIED |
| E1 | Evidence establishes only within its class | SPECIFIED |
| E3 | Lived experience not outvoted by instrumentation | SPECIFIED |
| P5 | Consent before revealing another's contribution | SPECIFIED |
| P6 | Anonymity means uninferable | SPECIFIED |
| U4 | A person may decline attention | SPECIFIED |
| M2 | Activity ≠ output ≠ outcome ≠ improvement | SPECIFIED |

**14 ENFORCED · 14 PARTIAL · 6 SPECIFIED · 5 OPEN · 4 DISCOVER**

---

# 15. What this document is not

It is not architecture, and it is not a plan. It does not authorise any implementation. Turning a
SPECIFIED law into an ENFORCED one requires the same discipline as any other change here: write
the distinguishing test first, let it fail, then make it pass.

And it is not finished. A law whose status is wrong is worse than a law that is missing, so the
register in §14 should be re-verified against the code whenever a status is claimed to have
changed — by opening the implementation, not by remembering.
