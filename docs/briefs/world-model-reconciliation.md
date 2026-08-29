# World-model reconciliation — objectives, development, ontology

**Status:** CURRENT — **PHASE 1 IS READ-ONLY.** **Origin:** founder brief, August 2026.
**Supersedes** the ontology-only investigation previously queued as `session-prompts.md` §28.

**Why this exists.** IntelliQ is increasingly behaving like a world model: a structured,
evidence-backed representation of actors, groups, organisations, objectives, goals,
traits/patterns, roles, relationships, focuses, actions, inquiries, hypotheses, evidence,
observations, outcomes and contextual conditions — which interact.

**The desired result is NOT more architecture.** It is a smaller, generic architecture capable of
representing individual, group and organisational development without parallel systems.

> A successful result may conclude: *"most of this already exists and requires only several
> fields, relationships, aliases, or generalised subject references."* **That is preferable to
> introducing new infrastructure.**

**DISCOVER → RECONCILE → MINIMISE → THEN IMPLEMENT ONLY IF JUSTIFIED. Repository truth wins.**

---

## 0 · WHY THIS BRIEF DESERVES TO BE RUN — the evidence from this repository

The brief's central bet is that proposed architecture usually already exists under another name.
**In this codebase that has been true five times out of five**, each found by reading rather than
building:

| Believed missing | Actually |
|---|---|
| A safeguarding lead's queue | Three routes, complete, **no caller** |
| A person's right to see their own record | `/api/me/data`, `/api/me/export`, `/api/me/audiences` — complete, **no caller** |
| A model of how a person works | `/api/self/patterns` — *"full transparency into everything it has learned about your working habits"*, **no caller** |
| *"What would change my mind"* | `falsifiers`, computed on every inquiry since `diagnose.js` was written, **projected nowhere** |
| A way to start the pilot with history | `/api/signals/import` and `/api/signals/import-csv`, **no caller** |

Two more concepts turned out to exist **several times over**: polarity (five vocabularies, now one)
and the deterministic voice (four homes, now one).

**So the prior is strong: assume it exists, and make the investigation prove otherwise.**

---

## 1 · HARD CONSTRAINTS

- **PHASE 1 IS READ-ONLY.** No production code. No test changes. No new files except the report.
- **DO NOT** create a graph database, a second ontology, a second evidence substrate, or parallel
  Person / Team / Organisation engines.
- **DO NOT** introduce domain vocabulary into the kernel — player, coach, season, squad, employee,
  manager, student, teacher. Those are domain data. The kernel reasons about *subjects*.
- **Read the prior art first and say what it already settled:**
  `ttd/organisational-ontology-investigation.md` (recorded verdict: *"do we need an ontology /
  graph DB? — the answer is no"*) and `ttd/ontology-integration-and-decay.md`. A new ontology
  substrate is on `docs/INDEX.md`'s **must NOT be built yet** list. **If a finding contradicts
  either document, that contradiction IS the finding** — name it; do not quietly overrule it.
- Read `ttd/founder-decisions-2026-08.md` (48 binding decisions, indexed) before proposing
  anything. Several questions below are already settled there.

---

## 2 · WHAT MUST BE RECONCILED, NOT BUILT

Each of the following is a **semantic role**, not a proposed table. For each, decide
**REUSE / ALIAS / EXTEND / NEW** — and **NEW is the last resort.**

### Objective
The organising developmental concept — *Leadership, Communication, Decision Making, Collaboration,
Resilience, Technical Excellence, Customer Service, Mentorship*. **These are domain vocabulary,
not kernel constants.** *Leadership* is not necessarily itself a Goal.

Before proposing an Objective store, determine whether existing ontology concepts, topics, aims,
labels, categories, inquiry identity or pattern primitives already provide this role.

### Goal
A desired future state — *"become more confident leading group discussions."* Determine whether
aims, objectives, interventions, alignment structures or inquiry state already represent it.

**The governance rule that must survive:** an organisation wanting something from a person is
**not** automatically that person's Goal.

> *Leader: "I want D to develop leadership"* must never silently become *"D wants leadership
> development."*

Preserve **org/leader-proposed** distinct from **person-owned/accepted**. Lifecycle concepts might
include proposed · invited · accepted · contested · rejected · retired — **but do not copy those
enums into production; reconcile them against existing state machinery.**

### Trait
A revisable, evidence-backed description of a subject — *"peers increasingly seek this actor out
during uncertainty."* It must **never** become permanent personality labelling, unsupported AI
judgement, a simplistic score, or organisational opinion masquerading as empirical truth.

Investigate whether Pattern, Hypothesis, Behaviour, Attribute, Signal or Assessment machinery
already represents this. **"Trait" may be nothing more than a UX name over an existing Pattern or
Hypothesis primitive, and that would be preferable to duplication.**

### Focus
A bounded deliberate practice, experiment or intervention that creates movement and generates
evidence. **IntelliQ already has intervention machinery. DO NOT CREATE A SECOND INTERVENTION
SYSTEM.** Determine whether Focus is REUSE, ALIAS, EXTEND or NEW — and prefer the first three.

A Focus may target an Actor, Relationship, Group, Organisation, Process or Environment. Determine
whether `subjectRef`, scope or ontology already expresses that.

**Already settled — do not re-decide:** `ttd/founder-decisions-2026-08.md` **D14** gives Focus two
shapes (a shared *room* and a *parallel* focus with one private thread per person), **D2** makes it
self / invited / assigned, and **D14b** forbids any number scoring a person.

---

## 3 · THE GENERIC SUBJECT MODEL

The kernel must reason generically over subject levels: **Actor · Relationship/Dyad · Group/Team ·
Organisation**, and any other ontology-addressable subject where justified.

**Do NOT create separate reasoning engines per level.** The target is:

> ONE evidence system · ONE Inquiry system · ONE Hypothesis/Confidence system · ONE
> ontology/relation substrate · ONE Intervention/Focus loop · ONE Outcome Learning loop —
> all operating over different subjects and contexts.

### Actor ↔ environment

Behaviour must not be modelled as `PERSON → BEHAVIOUR`. It may arise from
Actor × Role × Relationships × Group × Organisation × Situation × Environment.

IntelliQ must distinguish *"this appears characteristic of the actor"* from *"this appears to
emerge under these conditions."*

> Evidence: *D rarely demonstrates leadership.*
> **Bad conclusion:** *"D lacks leadership."*
> Competing hypotheses: insufficient opportunity · another actor monopolises leadership · D's role
> constrains it · authority dynamics suppress it · D leads in peer contexts but not high-authority
> ones.

**Investigate an attribution guard:** before promoting behavioural evidence into an actor-level
claim, contextual explanations should be considered where warranted. Determine whether existing
hypothesis competition, admissibility, context, pattern or inquiry machinery already enforces it.
**Do not build another reasoning engine if the kernel can already do this.**

### Durable actor + contextual expression

Can the architecture support **one durable actor identity plus contextual expressions of it**? Not
*"D is a bad communicator"* but *"evidence suggests D communicates directly in peer-led
environments and becomes less explicit in high-authority contexts."* Determine whether Spaces,
scope, Groups, Roles, evidence context or ontology links already support it.

### Group and organisation as subjects

A Group is not the average of its members; some phenomena emerge **between** actors — trust,
psychological safety, coordination, role clarity, shared understanding, communication structure,
collective confidence, norms, distributed leadership. **Examples only — do not hard-code them.**

> Five actors independently report difficulty disagreeing with authority. Do **not** infer *"five
> actors lack confidence."* A competing hypothesis is *"the group environment suppresses upward
> disagreement."*

An Organisation must likewise be able to be a subject of Inquiry. **Do NOT create an
`organisationHealthScore` or any equivalent aggregate truth.** An organisation may simultaneously
show strong trust, poor role clarity, high engagement and weak cross-group communication.
Preserve the distinctions.

---

## 4 · POLARITY RECONCILIATION *(mandatory section of the report)*

Trace all current code representing positive · negative · direction · band · support ·
contradiction · aligned · misaligned · beneficial · harmful · increase · decrease · confidence.

Determine: which meanings are **overloaded**; whether polarity is primitive-relative; whether
relationship effects can carry **context-specific** direction; whether any code assumes
positive/negative **globally**; whether High/Low semantics are confused with **evidential**
polarity; whether Goal-progress direction is confused with **empirical support**.

> **Trait ≠ positive. Trait ≠ negative.** Optimism may SUPPORT group recovery after setbacks while
> simultaneously CONSTRAINING early articulation of concerns. The *relationship* has direction
> **in context**.
>
> Likewise **High ≠ universally good** and **Low ≠ universally bad.** An uncomfortable Low may
> produce valuable learning; a High may reveal a harmful pattern.

**Do NOT invent a universal +1/−1 system. Do NOT collapse distinct semantics into one polarity
field for convenience.** Determine whether polarity belongs on Evidence, Observations, Relations,
Hypotheses, Outcomes or Objective-relationships — or whether existing primitives already keep
these meanings separate.

**Context this investigation must start from:** polarity was consolidated in August 2026 —
`ai/intelligence-feed.js` now owns `POLARITY_BUCKET` and `bucketOf()`, and `governance-smoke`
asserts no other module may author one. **One mapping remains unadjudicated:** `condition`
currently normalises to `opportunity` (a High), where `ai/diagnose.js:311` describes it as *"a
strength or a difficulty or a condition for success"* — an enabling circumstance, which under
**D5** argues for `neutral`.

---

## 5 · INFLUENCE WITHOUT FAKE CAUSALITY

The eventual target is reasoning over paths — *actor action → relationship change → group behaviour
change → group state change → outcome change.* **Correlation must not become causal truth.**

> D begins coordinating others · peers increasingly seek D out · coordination improves ·
> performance improves.
>
> The system MAY investigate: *"is D's emerging leadership contributing to improved
> coordination?"* It may NOT assert: *"D caused performance improvement."*

Audit how confidence, admissibility and hypothesis machinery handle this today. Note that
`item.graph = { nodes, edges }` is already described in code as *"honest, correlational"*.

---

## 6 · WORLD-MODEL INCOMPLETENESS

If the represented world does not explain observed outcomes, IntelliQ must **not force an
explanation**. Possible readings: the relationships are wrong · evidence is incomplete · an unknown
internal factor exists · an external factor is missing · the outcome is noise · the hypothesis is
wrong.

**This should produce curiosity, not a conclusion.** Domain-specific possibilities — resources,
schedule, market, injury, family circumstances, regulation, weather, customer behaviour, financial
pressure — are **domain data, never kernel constants.**

**A richer world model should primarily improve IntelliQ's ability to ASK BETTER QUESTIONS**, not
to give more confident answers. The AI should behave like a disciplined curiosity engine, not an
oracle.

---

## 7 · EMERGENT POTENTIAL — the concrete capability

The organisation defines **Objective: Leadership**. Actors A, B and C are intentionally invited
into Leadership goals. **D is not.** Over time D produces evidence: initiating coordination during
uncertainty, peers seeking D out, taking responsibility after failures, resolving ambiguity.

The system should notice that D is showing evidence relevant to Leadership **without ranking D**,
and might ask the leader: *"Leadership was not originally selected for D, but recent evidence
increasingly bears on it. Would you like to invite D to work on a Leadership Goal?"* — then
possibly offer a Focus that has helped comparable eligible actors, a generated context-specific
alternative, or a conversation with D first.

**CRITICAL:** this must never become automatic assignment. **Leader recommendation ≠ personal
adoption. Evidence ≠ deterministic labelling.** D retains the ability to accept, modify, contest
or reject.

**And it must not become ranking.** Never produce *A: Leadership 91 · D: 88 · B: 63*. The system
may ask *"are we developing only the actors we expected to lead, or are others beginning to
demonstrate it in practice?"* — as evidence-backed inquiry with explanation.

**Contribution, not just alignment.** Ask not only *"how aligned is this actor with the
organisation?"* but *"what does this actor contribute to the environment?"*

---

## 8 · ORGANISATIONAL LEARNING AND EXTERNAL KNOWLEDGE

**Audit existing Intervention/Outcome learning BEFORE proposing anything.** The target statement is
*"in contexts resembling this one, Intervention X was followed by Outcome Y in N eligible cases"* —
**never** *"X works."* Preserve similarity limitations, evidence count, subject/context
differences, uncertainty, contradictory outcomes and privacy. **If existing Outcome Learning
supports this with small extensions, REUSE IT.**

Focus recommendations may come from **SELF** (what helped this actor before), **ORGANISATION**
(what helped comparable eligible actors here) or **EXTERNAL** (credible outside knowledge).

> Internal evidence determines **what** deserves investigation. External knowledge may suggest
> **how** to intervene. **External knowledge must never silently become empirical truth about an
> actor, group or organisation.**

Audit the existing Self/Web admissibility architecture and reuse it. **Note the naming collision:**
"Web" in this codebase means the *organisational* web (scope), not the internet — and there is
currently **no outbound fetch anywhere** in `server.js` or `ai/`.

---

## 9 · HIGHS AND LOWS

Highs and Lows should not automatically become heavyweight ontology objects. Investigate their
current implementation — they may simply be **input surfaces that produce Evidence**.

> *"I led today's review and the group responded really well"* may bear on the Actor, the
> Leadership Objective, a Goal, a Focus, the Group's response, an Inquiry and an Outcome.

**One input may provide evidence to multiple existing subjects and relations. DO NOT duplicate
ingestion.**

---

## 10 · AI AND THE DETERMINISTIC KERNEL

> **AI PROPOSES MEANING. DETERMINISTIC MACHINERY CONTROLS WHAT MAY BECOME SYSTEM STATE.**

AI may propose a relationship, objective relevance, trait interpretation, goal candidate, focus
candidate, missing factor, inquiry, hypothesis or explanation path. Existing deterministic
machinery verifies evidence existence, provenance, subject identity, permissions, privacy, scope,
admissibility, contradictory evidence, required support, ontology legality, authority boundaries
and state transitions.

**Audit what already exists. DO NOT create another truth layer.** Note that `MODEL_MAY_PROPOSE`
(`ai/diagnose.js:49`) already admits observation / interpretation / hypothesis and **refuses
`conclusion`**, and that **D25** already settles the direction: *the model reads, the kernel
writes.*

---

## 11 · ONTOLOGY RECONCILIATION *(mandatory section of the report)*

**Do NOT assume that because ontology-related code exists, the ontology is sufficient. Do NOT
create a second ontology.** Reconstruct the actual grammar from repository truth.

Determine what IntelliQ currently considers an **entity/object · subject · concept/type ·
relation/link · event · evidence · observation/signal · claim/hypothesis · context · state ·
outcome** — and which of these are **true ontology primitives** versus application records that
merely reference ontology concepts.

Determine whether generic semantics can be expressed **without bespoke architecture per
relationship** — these are **semantics, not proposed enums**:

```
Actor MEMBER_OF Group          Evidence BEARS_ON Actor        Action OCCURS_IN Context
Actor HAS_ROLE Role            Evidence BEARS_ON Relation     Outcome FOLLOWS Focus
Actor WORKS_ON Goal            Trait RELATES_TO Objective     Actor CONTRIBUTES_TO Group
Goal RELATES_TO Objective      Focus TARGETS Goal             Context CONSTRAINS Actor
Relation SUPPORTS Hypothesis   Evidence CHALLENGES Hypothesis Context ENABLES Actor
```

**Relationships are first-class meaning.** Much of the useful intelligence lives *between* objects.
Determine whether existing relation/link machinery can itself be identified, contextualised,
time-bounded, supported by evidence, challenged by evidence, given provenance, queried by Inquiry,
revised, retired, and connected to outcomes.

> It is not enough to know *Actor D · Objective Leadership · Group X*. The system may need to
> investigate the claim **"D CONTRIBUTES_TO leadership within Group X"** — and that relationship
> may itself be uncertain and evidence-backed.

**Context changes meaning.** Pattern X may SUPPORT Objective Y in Context A while CONSTRAINING
Objective Z in Context B — without duplicating records or introducing global labels.

**Time matters.** *"D increasingly appears to occupy an informal leadership role"* must be
representable without ever asserting *"D IS a leader."* *"Group X currently shows high role
clarity"* must not become an eternal property of Group X.

**The model must be able to be wrong.** UNKNOWN · CONTESTED · CONTRADICTED · INSUFFICIENT EVIDENCE
· MISSING RELATIONSHIP · MISSING CONTEXT. **Do not invent these if existing Inquiry/Hypothesis
machinery already represents them.** A missing explanation must remain missing: **never manufacture
an ontology edge merely to make the represented world internally coherent.**

### Required ontology answers

1. Current ontology grammar. 2. Entity/object primitives. 3. Relation/link primitives.
4. How evidence attaches to entities **and to relations**. 5. How context is represented.
6. How time/history is represented. 7. How uncertainty/contradiction is represented.
8. **Whether relations themselves can be subjects of Inquiry.** 9. Whether Actor/Group/Organisation
can share one substrate. 10. Exact missing expressive capability, if any. 11. Duplicate ontology
architecture already present. 12. Minimum consolidation required.

**Verdict, exactly one:** ONTOLOGY ALREADY SUFFICIENT · NEEDS SMALL GENERALISATION · HAS
OVERLAPPING PRIMITIVES REQUIRING CONSOLIDATION · MISSING A GENUINELY NECESSARY PRIMITIVE.

### A starting read to CONFIRM OR REFUTE — not to accept

`subjectRef` is a free string carrying `member:<id>` or `group:<nodeId>`, so `relation:` is not
forbidden but nothing supports it and every consumer assumes the two known kinds. Relations exist
as two unrelated things — `orgNodes` structure via `parentId`, and `item.graph = { nodes, edges }`,
explicitly *correlational, never causal*. Context looks like the weakest area. **Verify all of
this; it may be wrong.**

---

## 12 · DUPLICATION AUDIT *(mandatory)*

Search for existing equivalents of: Objective · Goal · Trait · Focus · Actor · Group · Organisation
· Subject · Relation · Ontology Concept · Aim · Pattern · Behaviour · Attribute · Capability ·
Intervention · Outcome · Alignment · Value · Signal · Observation · Evidence · Inquiry · Hypothesis
· Unknown · Context · Space · Scope · Role · Candidate · Recommendation.

For each proposed capability report: existing primitive · where created · where persisted ·
lifecycle transitions · API exposure · UI exposure · tests · evidence integration · privacy/scope
behaviour · **whether extension is actually necessary.**

**Actively investigate whether:** Goal duplicates Aim · Trait duplicates Pattern/Hypothesis ·
Focus duplicates Intervention · Objective duplicates Ontology Concept/Topic · Team State duplicates
Group Evidence/Inquiry · World Model duplicates existing Ontology · Subject duplicates `subjectRef`
· Contextual Person Model duplicates Spaces/scope · Organisational Learning duplicates Outcome
Learning · Emergent Potential duplicates candidate machinery · Polarity duplicates existing
direction/band/effect semantics · Relationship Influence duplicates existing link primitives ·
Unknown External Factor duplicates Inquiry unknowns or Self/Web evidence machinery.

**If any are duplicates: STOP AND RECOMMEND REUSE/CONSOLIDATION.**

---

## 13 · THE THREE GAP TESTS

Attempt each using **CURRENT architecture only**, and report **exactly where it fails**. Those
failure points define the minimum delta. **Do not implement around imaginary failures.**

**GAP TEST 1 — EMERGENT POTENTIAL.** Model §7 end to end: the organisation's Objective; A, B, C
developing it; D not; accumulating evidence; the system noticing **without ranking**; an Inquiry
opened; an explainable leader suggestion citing admissible evidence; a Focus drawn from what helped
comparable actors **or** newly generated; D able to accept, modify, contest or reject; the Focus
producing Actions; Actions producing Outcomes; Outcomes returning as Evidence; the system learning.

**GAP TEST 2 — MISSING WORLD FACTOR.** Performance declines. Goals, role clarity, coordination and
known relationships are all stable. No internal hypothesis explains it. Can existing
Inquiry/Unknown/Evidence machinery represent *"the current model is insufficient; investigate a
missing internal or external factor"* and seek evidence **without inventing a cause**?

**GAP TEST 3 — CONTEXTUAL POLARITY.** A Pattern is beneficial in one context and constraining in
another — *X SUPPORTS Y under Context A* while *X CONSTRAINS Z under Context B* — represented
simultaneously, **without labelling the actor or trait globally positive or negative.**

---

## 14 · INVARIANTS TO INVESTIGATE

At minimum, laws equivalent to:

1. AI interpretation cannot silently become empirical truth.
2. Organisational authority cannot silently become empirical truth. *(P0-D; and **D42** — the
   superadmin is authoritative about **intent**, never about anyone's experience.)*
3. Organisational Goals cannot silently become personal Goals.
4. Traits cannot become permanent unsupported labels.
5. Contextual behaviour cannot automatically become global actor identity.
6. Polarity is contextual, not a permanent property of an actor.
7. Correlation cannot silently become causation.
8. Private evidence cannot leak through organisational learning. *(**D15** — admissible is not
   visible.)*
9. External knowledge cannot silently become internal evidence.
10. A missing explanation remains unknown rather than fabricated.
11. Group phenomena cannot automatically be attributed to individuals.
12. Objective recommendations remain invitations, never automatic assignments. *(**D2**, **D38**.)*
13. Ontology edges cannot be manufactured merely to make the model coherent.

---

## 15 · THE REPORT

Write `docs/ttd/world-model-reconciliation-findings.md` containing:

1. **Executive verdict** — how much already exists, grounded in code with an approximate figure.
2. **Current primitive map** — the actual architecture. Begin from this **hypothesis only** and
   correct it wherever repository truth differs:
   `Evidence → Observation/Signal → Pattern/Hypothesis → Inquiry → Intervention → Outcome →
   Learning`. Then show where Objective · Goal · Trait · Focus · Subject · Context · Relation ·
   Emergent Potential fit.
3. **Reconciliation table** — `Concept | Existing primitive | Coverage | Missing semantics |
   Verdict`, verdict being **REUSE / ALIAS / EXTEND / NEW**.
4. **Objective / Goal / Trait / Focus verdict** — for each: does it need first-class identity? does
   it need persistence? does an equivalent exist? can it be an alias? can it be a relation or a
   field instead?
5. **Subject generalisation verdict** — can one architecture reason over Actor, Relationship, Group
   and Organisation without parallel engines?
6. **Ontology reconciliation** (§11). **Mandatory.**
7. **Polarity reconciliation** (§4). **Mandatory.**
8. **Gap test results** (§13), all three.
9. **Duplication risks** (§12) — **explicitly name every proposal in this brief that would
   duplicate existing code if implemented naïvely.**
10. **Minimum delta** — the smallest possible change. Prefer **0 new stores · 0 new engines · 0 new
    truth layers · 0 new evidence paths · 0 new persistence systems · 0 new graph infrastructure.**
    **If the answer is several fields and generalised existing functions, SAY SO.**
11. **Invariants** (§14).
12. **Implementation plan** — only after the audit. Per change: exact primitive reused · exact
    missing semantic · files likely affected · tests required · invariant protected · why this does
    not duplicate architecture.

### The gate — return exactly ONE

| | |
|---|---|
| **A · NO IMPLEMENTATION REQUIRED** | existing architecture already supports this |
| **B · SMALL EXTENSION** | existing primitives suffice; give the exact minimal patch plan |
| **C · ARCHITECTURAL DECISION REQUIRED** | primitives overlap or conflict — **STOP**, founder adjudicates |
| **D · GENUINELY NEW PRIMITIVE REQUIRED** | repository evidence proves something is missing |

**On C or D: STOP. Do not implement until adjudicated.**

---

## 16 · THE FINAL PRINCIPLE

We are **not** building a Goal System, a Trait System, a Focus System, an Objective System, a Team
Engine, an Organisation Engine or a World Model Engine. **That would be architectural failure.**

The question is whether the existing kernel can be generalised enough that entities participate in
relationships and events, evidence bears on both, inquiries investigate uncertainty, hypotheses
explain, objectives organise developmental meaning, goals represent desired states,
traits/patterns represent revisable understanding, focuses represent deliberate experiments, and
outcomes return as evidence — **with one kernel reasoning about actors, relationships, groups and
organisations.**

When the represented world fails to explain reality: **do not force reality to fit the model.**
Become curious. Ask what relationship may be wrong, what evidence is missing, what internal factor
is absent, whether an external factor exists. **Preserve the unknown until evidence resolves it.**

> AI proposes possible meaning. The deterministic kernel protects truth.
> **And above all: reuse the architecture we already paid to build.**
>
> The best outcome of this task is not more code. It is discovering that the existing kernel needs
> only a small amount of generalisation to express the larger idea.
