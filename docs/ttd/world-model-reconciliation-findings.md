# World-model reconciliation findings

**Status:** PHASE 1 COMPLETE — READ-ONLY.  
**Repository head inspected:** `950a9d8` on `claude/platform-work-summary-nmb0cm`.  
**Date:** 30 August 2026.  
**Implementation gate:** **C · ARCHITECTURAL DECISION REQUIRED — STOP.**

## 1. Executive verdict

IntelliQ already contains roughly **80% of the requested world-model capability**. The working
spine is not hypothetical:

`canonical Evidence → reference-only Signal/Observation → Pattern/Hypothesis → Inquiry → governed
Action/Intervention/Focus → Observation/Evaluation/Outcome → Evidence and learning`.

It already supports immutable provenance, corrections, competing hypotheses, counter-evidence,
falsifiers, collection frontiers, actor and group subjects, organisational operating context,
action outcomes, temporal history, privacy inheritance and deterministic authority gates.

The missing capability is narrow but load-bearing: **a governed, canonical relationship claim
cannot itself be addressed as a subject**. Relationships currently exist in at least four forms:

1. organisation structure in `orgNodes` (`parentId`/`parentIds`, membership and leadership);
2. operating arrangements in `orgContextRecords` (`responsibility`, `dependency`);
3. inquiry identity/provenance relationships (`SAME_AS`, `REFINES`, `SUPPORTS`, `CONTRADICTS`,
   `RELATED_TO`);
4. ephemeral correlational `item.graph = { nodes, edges }` output.

Those forms overlap but do not share identity, lifecycle, evidence attachment, visibility or
subject semantics. Meanwhile Goal, Focus and Intervention each have multiple persistent homes.
Choosing which existing shape becomes authoritative is a consolidation decision, not a mechanical
field addition. Therefore the gate is **C**, not B. No production work may start until the founder
adjudicates the owners named in §13.

## 2. Prior art: what was already settled

### `organisational-ontology-investigation.md`

The earlier investigation settled that IntelliQ already has an implicit ontology made of evidence,
signals, hypotheses, inquiries and operating-context records; it explicitly rejected a universal
entity/edge rewrite, graph database, triple store and migration. It found that a signal already
behaves like a reified, evidence-backed relationship and proposed only a behaviour-in-context to
organisational-aim bearing, expressed by reusing the hypothesis shape. It also required context,
time, provenance and visibility inheritance and prohibited a general traversal endpoint.

### `ontology-integration-and-decay.md`

The follow-up settled that temporal correctness should reuse the repository's existing
distinct-day and dormancy idiom rather than invent exponential decay. It preferred inspectable
timestamps and `STALE`-based dormancy over a continuous weighting system.

### Reconciliation with this audit

This report **does not contradict either document**. It confirms their central conclusions:

- no new ontology substrate or graph database is justified;
- relationship meaning should reuse evidence, hypothesis and inquiry machinery;
- context and time must remain explicit;
- existing temporal idioms should be reused.

The additional finding is that the repository now contains more overlapping persistent owners
than the earlier investigation catalogued. That makes selecting the canonical existing owner a
founder decision before the small generalisation can be implemented.

## 3. Current primitive map

| Stage / role | Repository primitive | What it already guarantees |
|---|---|---|
| Evidence | `lib/evidence.js` envelope; `evidenceLog`; `cold_evidence` | org, source, subject/person/group references, type/value/text, observed/retrieved time, visibility, confidence, status, provenance, durable correction/erasure |
| Observation / signal | canonical envelopes; `orgSignals`; inquiry `signals[]` | typed observation shape; inquiry signals retain refs and epistemic shape rather than copied content |
| Pattern | `ai/intelligence.js`, `ai/reason.js`, `ai/person-model.js`, `ai/self-model.js` | deterministic/self-relative detection, temporal qualification, privacy projection |
| Hypothesis | `ai/diagnose.js` inquiry hypotheses; reasoner beliefs | support and challenge refs, confidence, rivals, falsifiers, contest/refutation |
| Inquiry | `inquiryStates[code][subjectRef][concept]` | stable identity, aliases, subject, frontier, provenance, timeline, parking, correction |
| Operating context | `orgContextRecords`; `ai/org-context.js`; `ai/org-state.js` | confirmed event/objective/responsibility/requirement/rhythm/dependency/decision; authority and provenance |
| Action | `lib/action.js`; `actionsLog` | recommend/draft/approve/execute/observe/evaluate lifecycle and evidence refs |
| Intervention | `orgInterventions` | proposed and outcome-bearing support activity, but separate from Focus |
| Focus | personal `userAiProfiles[].focuses`; group `teamFocuses`; assigned assessment work | deliberate work and outcomes, but three non-canonical shapes |
| Outcome | action observation/evaluation; Focus outcome; assessment result; outcome intelligence | results can be observed and returned to the evidence loop without implying causation |
| Learning | `ai/outcome-intelligence.js`, `ai/org-learning.js`, confidence feedback | repeated history with limitations; no automatic causal claim |
| Subject | free `subjectRef`, plus `subjectId`, `groupRef`, node scope | actor and group work through one Inquiry kernel; organisation is represented elsewhere, not yet through the same subject resolver |
| Relation | node links, operating-context edges, inquiry provenance links, correlational graph edges | several partial representations; no single governed relationship identity |

Corrected spine:

```text
Source record
  → canonical Evidence
  → reference-only Observation/Signal
  → Pattern or proposed interpretation
  → competing Hypotheses inside an Inquiry
  → human-governed Action / Intervention / Focus
  → Observation / Evaluation / Outcome
  → canonical Evidence + longitudinal learning
```

Objective is presently an operating-context object and also appears as plain organisation goal
text. Goal is split between organisation goals, member goals/aims and assignments. Trait is best
understood as a UX alias over a revisable contextual Pattern/Hypothesis. Focus is an alias/extension
of the existing intervention/action loop, but its three current stores must be reconciled first.

## 4. Reconciliation table

| Concept | Existing primitive | Coverage | Missing semantics | Verdict |
|---|---|---:|---|---|
| Objective | org-context `objective`, org-state objectives, `orgGoals` | high | one stable identity connecting intent to evidence-bearing developmental relevance | EXTEND after owner decision |
| Goal | `orgGoals`, member goals/aims, commitments, assignments | medium | proposed/invited/accepted/rejected ownership without treating org intent as personal intent | CONSOLIDATE |
| Trait | contextual patterns, hypotheses, person/self model | high | UX alias and explicit context retention in every projection | ALIAS |
| Focus | personal focuses, `teamFocuses`, `orgInterventions`, actions/assessments | high | canonical owner, participants, room/parallel shape | CONSOLIDATE |
| Actor | `orgUsers`, `member:<id>`, evidence `subjectId` | high | canonical subject resolver rather than string-prefix assumptions | EXTEND |
| Group | `orgNodes`, legacy `orgGroups`, `group:<nodeId>` | high | retire legacy duplicate and use one node identity | CONSOLIDATE |
| Organisation | `orgMeta`, org-state, operating context | medium | `organisation:<id>` as a supported Inquiry subject | EXTEND |
| Subject | `subjectRef`, `subjectId`, `groupRef` | high | typed parsing/resolution for relation and organisation | EXTEND |
| Relation | four partial edge representations | medium | stable identity, evidence refs, context, time, visibility, inquiry subjectability | CONSOLIDATE + EXTEND |
| Ontology concept | inquiry canonical meaning/aliases, packs/lenses, org-context claim types | high | explicit boundary between vocabulary identity and object identity | REUSE |
| Aim | member goals, org intent, evidence primitive metadata | medium | ownership/acceptance distinction | CONSOLIDATE |
| Pattern | intelligence/reason/person/self-model patterns | high | no new primitive | REUSE |
| Behaviour | typed observations and contextual patterns | high | projections must never drop context/time | REUSE |
| Attribute | evidence `attributes`, org/user metadata | high | none for world-model purposes | REUSE |
| Capability | primitive type and action capability | high | names collide semantically but contexts distinguish them | REUSE |
| Intervention | `orgInterventions`, actions, focuses | high | canonical lifecycle owner | CONSOLIDATE |
| Outcome | action evaluation, focus outcomes, assessment/outcome evidence | high | common linkage to the governed experiment identity | EXTEND |
| Alignment | org-state claim states and contextual hypotheses | medium | never global actor score; relation-in-context only | ALIAS |
| Value | `orgValues`, evidence values, priority value | medium | vocabulary collision only | REUSE with naming discipline |
| Signal | canonical evidence projection and inquiry signal refs | high | legacy `orgSignals` remains a duplicate intake path | CONSOLIDATE |
| Observation | evidence derivation/type, reasoner observations | high | no new primitive | REUSE |
| Evidence | canonical envelope/hot+cold store | complete | none | REUSE |
| Inquiry | `ai/diagnose.js` + `inquiryStates` | high | relation and organisation subject resolver | EXTEND |
| Hypothesis | diagnose/reason hypotheses | high | no new primitive | REUSE |
| Unknown | `missingSignals`, limitations, unresolvable claim state | high | explicit missing-context category can be vocabulary, not store | REUSE |
| Context | evidence attributes/group/event, org-context, reason context | medium | canonical bounded context reference on relation claims | EXTEND |
| Space | workspace, node, focus-room concepts | low | no world-model primitive justified | REUSE scope/audience |
| Scope | audiences, org graph, `_kernelEvidence`, packet scope | high | no new primitive | REUSE |
| Role | user role, node leadership, responsibilities, role bindings | high | current-person binding already temporal; no new role engine | REUSE |
| Candidate | group candidates, playbook candidates, model proposals | high | names represent separate proposal boundaries intentionally | REUSE |
| Recommendation | proposals/actions/playbook suggestions | high | invitations must retain confirmation gate | REUSE |

## 5. Objective, Goal, Trait and Focus verdicts

### Objective

Objective needs stable identity only where it is confirmed organisational intent. The existing
org-context objective is the best candidate because it already has confirmation, provenance,
scope, effective-state projection and supersession. `orgGoals` is an older plain-text store and
must not become a second Objective system. Objective relevance should be a contextual hypothesis
or relation claim bearing on that confirmed object.

### Goal

Goal needs person ownership and acceptance, not a new reasoning engine. The repository currently
cannot safely treat `orgGoals`, leader-assigned work and a member aim as one thing because their
authority differs. A canonical lifecycle must preserve **organisation proposes** versus **person
accepts**. Which existing store owns this lifecycle requires adjudication.

### Trait

Trait needs neither a store nor a permanent label. It is a product-language alias over a
contextual, revisable Pattern/Hypothesis whose evidence, time, rival explanations and falsifiers
remain visible. A global `traits[]` field would violate the attribution and temporal laws.

### Focus

Focus is deliberate activity inside the existing action/intervention/outcome loop. It is not a new
engine. However personal focuses, team focuses, interventions and parallel assessments currently
have different identities and lifecycles. D2/D14 settle the desired product shapes but do not
select the canonical persistent owner. Consolidate before extending participants or rooms.

## 6. Subject generalisation verdict

Actor and Group already share Inquiry machinery: `member:<id>` and `group:<nodeId>` index the same
`inquiryStates` store and use the same hypotheses, confidence, corrections and frontier. That proves
the kernel itself does not require per-grain engines.

Organisation and Relationship are not supported end to end. `subjectRef` is syntactically free,
but consumers explicitly parse `member:` and `group:` or read organisation state through separate
functions. Merely writing `relation:x` or `organisation:y` would create an unresolvable record,
not support. The minimum generalisation is a typed subject resolver used by Inquiry creation,
authorised evidence resolution and projection. It must fail closed for unknown kinds.

## 7. Ontology reconciliation

### Actual grammar

- **Entity/object:** user, org node, organisation, evidence envelope, inquiry, hypothesis,
  org-context record, action, focus/intervention, outcome record.
- **Subject:** currently actor and group through string `subjectRef`; organisation is a separate
  state root; relation has no subject identity.
- **Concept/type:** inquiry canonical meaning + aliases; evidence primitive/type/label;
  org-context record/claim type; domain packs provide display vocabulary only.
- **Relation/link:** structural node links; responsibility/dependency records; inquiry identity and
  evidential relationships; ephemeral correlational graph edges.
- **Event:** evidence observation time and org-context event.
- **Claim/hypothesis:** diagnose hypothesis with support/challenge references and confidence.
- **Context:** distributed across evidence attributes/group/event, reason context and confirmed
  org-context records.
- **State:** status on evidence/inquiry/action/context records, with histories or supersession.
- **Outcome:** focus/action/assessment result, sometimes canonicalised back to evidence.

### Required ontology answers

1. **Grammar:** implicit typed records connected by refs; not a universal graph schema.
2. **Entity primitives:** sufficient for actors, groups, organisation objects, evidence, inquiries,
   actions and outcomes.
3. **Relation primitives:** overlapping and non-canonical.
4. **Evidence on entities:** supported. **Evidence on relations:** only indirectly by making the
   relationship a hypothesis; no canonical relation identity exists.
5. **Context:** representable but distributed and not consistently addressable.
6. **Time/history:** evidence timestamps, supersession, inquiry timeline, context versions, action
   audit and temporal person-model observations.
7. **Uncertainty/contradiction:** hypotheses, support/challenge refs, confidence, status,
   limitations, missing signals and falsifiers already suffice.
8. **Relations as Inquiry subjects:** **not currently supported end to end**.
9. **Shared substrate:** Actor and Group prove it; Organisation and Relation need subject-resolver
   generalisation, not separate engines.
10. **Exact missing expressive capability:** stable, governed, contextual relationship-claim
    identity that can be an Inquiry subject and inherit evidence visibility.
11. **Duplicate architecture:** node edges, org-context edges, inquiry links and correlational graph
    edges; plus legacy `orgGroups` beside `orgNodes`.
12. **Minimum consolidation:** select one relationship-claim representation by extending Inquiry /
    hypothesis identity; do not add an edge store. Select canonical Goal and Focus owners.

### Ontology verdict

**HAS OVERLAPPING PRIMITIVES REQUIRING CONSOLIDATION.**

This is not a verdict for a graph database or new ontology. The needed semantics fit existing
Evidence + Hypothesis + Inquiry machinery, but the repository has multiple candidates for the
object identities they must attach to.

## 8. Polarity reconciliation

The repository correctly keeps several different meanings separate:

- evidence direction (`higher_is_good`, stream direction and deviation);
- finding polarity (`risk`, `friction`, `progress`, `milestone`, `opportunity`, `strength`,
  `neutral`) and High/Low projection owned once by `intelligence-feed`;
- evidential relationship (`SUPPORTS`, `CONTRADICTS`, challenge refs);
- confidence band/score;
- lifecycle status;
- action outcome (`improved`, `unchanged`, `worsened`, `unclear` and equivalents);
- readiness/alignment claim state.

These must not be collapsed. High/Low is a navigation projection, not empirical support and not a
global moral value. Evidence can support an uncomfortable Low; evidence can contradict a High.
Primitive direction is relative to the measured thing, not the person.

Context-specific support/constrain semantics do not yet have a canonical relationship claim. The
same pattern can therefore be represented by two hypotheses, but cannot share one stable
relationship identity across contexts.

The brief's `condition` concern has already been adjudicated by D49: a condition for success maps
to `opportunity` and therefore High. This audit does not reopen it.

## 9. Gap tests

### Gap test 1 — emergent potential

**Works today:** evidence for D; contextual patterns; an Inquiry without ranking; leader-safe
suggestion; confirmation-gated action; Focus/action outcome; outcome evidence; longitudinal
learning.

**Fails at:** stable Objective relevance and Goal ownership. There is no canonical evidence-backed
relation *D BEARS_ON Objective Leadership in Context X*, and no unified invited/accepted Goal
lifecycle. Comparable-focus learning exists in fragments but Focus identities are split.

**Minimum delta after adjudication:** reuse confirmed org-context Objective; represent relevance as
a contextual relationship hypothesis addressable by Inquiry; invitation remains a proposal;
consolidate Focus owner and link action/outcome evidence.

### Gap test 2 — missing world factor

**Passes with current architecture.** An Inquiry may keep several hypotheses, an empty or weak
leading explanation, limitations, missing signals and falsifiers. `MODEL_MAY_PROPOSE` refuses a
conclusion. A missing external factor can be a frontier question without becoming a cause or an
ontology edge. No new primitive is required.

### Gap test 3 — contextual polarity

**Partially passes.** Two separate contextual hypotheses can say X supports Y in A and constrains Z
in B without assigning global actor polarity. It fails to recognise those as two contextual
expressions of one stable relationship/pattern identity because relation claims have no canonical
identity or context reference. The delta is the same relation-subject generalisation, not a new
polarity system.

## 10. Duplication risks

Naïve implementation would duplicate:

- **Objective** with `orgGoals`, org-context objectives and org-state objectives;
- **Goal** with member aims, org goals, commitments and assignments;
- **Trait** with Pattern, Hypothesis, person model and self model;
- **Focus** with personal focuses, team focuses, interventions, actions and assessments;
- **Actor/Group/Organisation engines** with the already subject-generic Inquiry kernel;
- **Subject** with free `subjectRef` and existing actor/group addressing;
- **Relationship influence** with inquiry hypotheses/provenance, org-context edges and graph edges;
- **Ontology** with Evidence + Inquiry + org-context;
- **Contextual Person Model** with evidence context, scope, groups, roles and temporal models;
- **Organisational Learning** with outcome intelligence and org learning;
- **Emergent Potential** with candidates, Inquiry and confirmation-gated suggestions;
- **Polarity** with the canonical bucket owner, primitive direction, evidential support and outcome;
- **Unknown external factor** with missing signals, limitations and hypothesis competition;
- **Team State** with group evidence and group Inquiry;
- **High/Low objects** with feed projections;
- **a graph store** with four existing relation representations;
- **an evidence path** with the canonical envelope and hot/cold lifecycle.

Because duplicates are present, the brief's instruction is to stop and recommend
reuse/consolidation rather than implement.

## 11. Minimum delta

Target remains:

- **0 new stores**
- **0 new engines**
- **0 new truth layers**
- **0 new evidence paths**
- **0 new persistence systems**
- **0 new graph infrastructure**

After adjudication, the likely patch is:

1. add a typed, fail-closed subject-ref parser/resolver supporting existing member/group plus
   organisation and a canonical relationship-claim kind;
2. reuse Inquiry/Hypothesis as the relationship-claim object, adding bounded context/objective
   references rather than an edge table;
3. attach evidence through existing inquiry signal refs and inherit the least-visible basis;
4. select confirmed org-context objective as Objective owner and deprecate/alias plain `orgGoals`;
5. select one Focus/Intervention owner and migrate adapters, not data models;
6. preserve Goal proposer/owner/acceptance explicitly within that selected lifecycle;
7. route outcomes back through canonical evidence as today.

## 12. Invariants

1. Model proposals cannot become empirical truth; deterministic code admits state.
2. Organisational authority establishes intent/arrangement, never a person's experience.
3. Organisation-proposed work never silently becomes a person-owned Goal.
4. A Trait is contextual, revisable and evidence-backed; never permanent identity.
5. Actor-level claims require contextual alternatives where attribution is uncertain.
6. Polarity belongs to a projection or contextual relationship, never permanently to an actor.
7. Correlational paths never assert cause.
8. Learning inherits the least-visible supporting evidence and satisfies disclosure floors.
9. External knowledge proposes interventions; it never becomes internal empirical evidence.
10. Missing explanations remain unknown and produce frontier questions.
11. Group phenomena never automatically become individual deficits.
12. Objective/Goal recommendations remain invitations requiring human acceptance.
13. No ontology edge is manufactured for coherence.
14. Unknown subject kinds fail closed.
15. Relation claims preserve support, challenge, correction, context, time and provenance.

## 13. Decisions required before implementation

The founder must select exactly one owner in each row:

| Decision | Candidates | Recommendation |
|---|---|---|
| Objective identity | confirmed org-context objective vs `orgGoals` | org-context objective; alias/deprecate `orgGoals` |
| Personal Goal lifecycle | member aims/goals vs assignments vs Focus invitation | person-owned aim with explicit proposal/acceptance; assignments remain commitments |
| Focus/Intervention identity | personal profile focus vs `teamFocuses` vs `orgInterventions`/Action | Action/Intervention lifecycle as kernel owner; Focus as product projection with D2/D14 participation |
| Relationship claim identity | new edge record vs Inquiry/Hypothesis extension | extend Inquiry/Hypothesis; no edge store |
| Group identity | `orgNodes` vs legacy `orgGroups` | `orgNodes`; migrate callers, do not maintain both |

## 14. Implementation plan after adjudication

No implementation is authorised at gate C. If the recommended owners are ratified, split work into
small contracts:

1. **Subject resolver generalisation** — reuse `subjectRef`; touch diagnose/server scope helpers;
   test actor/group parity, organisation support, relation support, unknown-kind fail-closed.
2. **Relationship claim context** — reuse Inquiry/Hypothesis and evidence refs; add objective/context
   refs; test support/challenge, correction, visibility inheritance, temporality and no causation.
3. **Objective alias/convergence** — reuse confirmed org-context; test authority is intent-only and
   empirical evidence cannot be minted by a superadmin.
4. **Goal ownership convergence** — reuse chosen person aim lifecycle; test proposed is not accepted,
   rejection persists and no leader can author a member's intent.
5. **Focus convergence** — reuse chosen action/intervention lifecycle; adapt self/team/parallel
   projections; test D2/D14/D15/D16 and outcomes returning as evidence.
6. **Legacy convergence** — migrate adapters away from `orgGroups`, `orgGoals`, legacy signals and
   duplicate Focus homes only after parity tests prove no behavioural change.

## 15. Final gate

**Ontology verdict:** **HAS OVERLAPPING PRIMITIVES REQUIRING CONSOLIDATION.**  
**Implementation gate:** **C · ARCHITECTURAL DECISION REQUIRED.**

**STOP.** The existing kernel is the correct substrate and no new ontology is justified, but owner
selection across overlapping Objective, Goal, Focus and Relation primitives is a founder decision.
Lanes A, B, C and E of the final architecture programme must not proceed in this run after this
gate, because the programme explicitly requires stopping on C or D.
