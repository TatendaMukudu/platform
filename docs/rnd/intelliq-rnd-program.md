# IntelliQ R&D programme register

**Status: NON-AUTHORITATIVE.** Nothing in this document is a decision, a plan, a commitment or a
queue. **Written against:** `d06ba74`.

---

## 0 · THE WALL

This document exists to hold research *out* of the build, not to feed research *into* it.

**Four rules govern everything below.**

1. **Nothing here may be cited as a reason to build anything.** Not by a person, not by a model, not
   by a future session reading this file for context. A programme in this register has no standing.
2. **`docs/rnd/` is not an implementation queue.** The queue is
   `docs/ttd/pilot-blocker-challenge-and-packets.md`. If an item appears in both, the queue governs
   and the R&D entry is stale — delete the R&D entry, do not promote the queue entry.
3. **Promotion is one-way and explicit.** A programme leaves this register only by a founder
   decision that names it, states what evidence justified it, and writes it into the queue. There is
   no gradual promotion, no "we've basically decided", no implementation that starts as a spike.
4. **A research programme may not weaken a law to make itself viable.** If a programme requires
   relaxing privacy, provenance, admissibility, tenant isolation, authority-vs-truth or durability,
   the programme is rejected, not the law.

**Why the wall exists.** The implementation queue has repeatedly grown faster than the pilot has
approached — 46 tracked items against 6 real blockers. Most of that growth came from research being
written down next to work, in the same voice, with the same confidence. Separating the two documents
separates the two kinds of claim.

### What this register is for

Three legitimate uses, and no others:

- **Recording that a question was asked and deliberately not answered**, so it is not re-asked.
- **Recording that an option was examined and rejected**, with the reason, so it is not re-adopted.
- **Recording what evidence would change the answer**, so the pilot can be watched for it.

---

## 1 · CLASSIFICATION

| Class | Meaning |
|---|---|
| **OPEN** | a real question with no current answer; no implementation intent |
| **PARKED** | answerable, but the answer costs more than it is worth today |
| **REJECTED** | examined and declined; the reason is recorded so it is not re-adopted |
| **WATCH** | not a build; a thing to observe during the pilot, because observing it is cheap |

**Counts:** 31 programmes — 14 OPEN, 9 PARKED, 5 REJECTED, 3 WATCH.

**Deployment-shape neutrality.** No programme below is specific to one school, one sport or one
pilot. Where a programme's trigger is "a second organisation", that means *any* second organisation —
a second team at the same school counts, and so does a classroom.

---

## 2 · FAMILY A — REPRESENTATION

*How organisational knowledge is stored and related.*

### A1 · Ontology substrate (graph database or triple store) — **REJECTED**

**Question.** Should organisational entities and relations move into a graph database or an RDF/OWL
substrate rather than the current document store plus derived indices?

**Why rejected.** `docs/ttd/organisational-ontology-investigation.md` answered this directly: the
answer is no. The repository already has event sourcing and CQRS in all but name; the joins that
motivated the question (J1, J3) are four foreign keys, not a substrate. A graph database would add an
operational dependency, a migration, and a second place where truth can live — the last of which is a
direct violation of the single-truth-store law.

**What would reopen it.** Query patterns that are genuinely variable-depth and unknown in advance,
across millions of edges. Nothing observed to date is deeper than three hops.

---

### A2 · Graph embeddings, GNNs, classical ML — **REJECTED**

**Question.** Should learned representations replace or supplement deterministic pattern detection?

**Why rejected.** Laws L-B1 and L-B2. An embedding is a place organisational truth can live that is
not inspectable, not correctable, and not attributable to evidence. Every property the harness
exists to guarantee — provenance, correction propagation, admissibility, the epistemic ladder —
is lost the moment a claim's justification is a vector.

**What would reopen it.** Nothing at the truth layer. A learned model could legitimately *propose*
candidates that the kernel then adjudicates against evidence, which is the existing
models-propose/kernel-adjudicates contract and needs no new law. That is a routing question (Family
E), not a representation question.

---

### A3 · Structural similarity for peer comparability — **PARKED**

**Question.** Given two nodes in two different organisations, when are they similar enough that
comparing their aggregates is meaningful rather than misleading?

**Status.** The one graph technique judged worth adopting later
(`docs/ttd/organisational-ontology-investigation.md` §3). Parked because it has no consumer: the
comparison Web (B2) is itself deferred, and without a second organisation there is nothing to compare.

**What would promote it.** A second organisation *and* a decision to build B2. Neither exists.

---

### A4 · Decision-as-history (J4) — **OPEN**

**Question.** Should a decision be a first-class record with its own history, alternatives considered,
and the evidence available at the time — rather than being reconstructed from Focus and Inquiry state?

**Why not queued.** The scoping answer is "watch a dozen real decisions first". Designing the joins
before seeing which ones are actually needed is how the 46-item queue happened.

**What would promote it.** A dozen observed decisions in a live deployment where reconstruction from
existing records demonstrably fails.

---

### A5 · Behaviour to aim bearings (J5) — **OPEN**

**Question.** Can the system deterministically relate an observed behaviour to an organisational aim
without a model asserting the relationship?

**Why not queued.** It requires real capability observations to test against. Building the mapping
first would mean inventing the bearings, which is exactly the kind of asserted-not-derived claim the
kernel refuses elsewhere.

**What would promote it.** A body of real capability observations from any deployment.

---

## 3 · FAMILY B — TOPOLOGY

*How scope, membership and reach are shaped.*

### B1 · Web-of-Webs (cross-organisation federation) — **PARKED**

**Question.** Can two organisations' Webs be related — a district over schools, a federation over
clubs — without either becoming visible to the other?

**Status.** Parked, deliberately and firmly. The current `orgNodes` graph already handles
arbitrary depth *within* a tenant: a team is one node, a school is a few tiers, a university is more.
**The general case that actually matters is already built.** Web-of-Webs is a different problem —
cross-*tenant* relation — and tenant isolation is a law, not a preference.

**Why this is not a gap for growth.** Growth from one team to many teams, to a whole school, to
classrooms, is depth and breadth *inside* one tenant graph. It needs no new topology primitive.
Federation only becomes a question when two separately-owned organisations want a shared view, which
is a commercial and legal question before it is an architectural one.

**What would promote it.** Two tenants under one owner who require a joint view, plus a resolved
answer to who is the data controller of the joint aggregate.

---

### B2 · Peer / comparison Web — **PARKED**

**Question.** May a node compare its aggregates against structurally similar peer nodes?

**Status.** `docs/ttd/peer-web-semantics.md` establishes that peers are a *separate edge class* from
the hierarchy and must never be conflated with it. Classified SCALE. Two founder decisions (D-P1,
D-P2) are deferred behind it.

**Hard sequencing law, already recorded:** the comparison Web must never be bundled with W-3. Mixing
a scope change with a new edge class makes the blast radius unmeasurable.

**What would promote it.** A second organisation, plus D-P1 and D-P2 answered.

---

### B3 · Node validity windows (GW-4) — **PARKED**

**Question.** Should a node carry a validity window, so that a fixed-term group (a rehabilitation
cohort, a term-long project) expires rather than being manually deleted?

**Status.** Parked pending the first fixed-term intervention group. Deleting a node today is a
supported operation; the window is a convenience, not a correctness property.

**One caution recorded.** Node removal already has a live defect (an erasure that does not
invalidate). Validity windows would inherit that defect and multiply it. **B3 must not be built
before that fix lands.**

---

### B4 · Multi-parent routing reconciliation (GW-3) — **PARKED**

**Question.** When a node has two parents, which parent's leaders receive a routed artifact — both,
the nearest, or a declared primary?

**Status.** The graph is already multi-parent and cycle-safe; the *scope* answer is settled (a member
reaches direct parents). Routing is the open part. Parked until a genuine matrix organisation exists.

**What would promote it.** A deployment where a person genuinely reports into two structures, and the
two structures disagree about who should see something.

---

### B5 · Reason-carrying Web filter (GW-10) — **OPEN**

**Question.** Should a scope decision carry *why* it excluded something, so an explanation can say
"this is filtered because you lead a sibling branch" rather than silently returning less?

**Why not queued.** It is a quality-of-explanation improvement with no safety consequence. The filter
is correct; it is merely mute.

**Interaction to note.** A reason-carrying filter is itself a disclosure channel — "there is
something here you cannot see" is information. Any implementation must pass the inference-attack
suite before it ships.

---

## 4 · FAMILY C — PRIVACY AND DISCLOSURE

*The family where research is most likely to be dangerous, and therefore the family with the
strictest wall.*

### C1 · Differential privacy over aggregates — **OPEN**

**Question.** Should aggregate counts carry calibrated noise rather than being gated by a cohort
floor?

**Why not queued.** The current defence is a two-sided cohort floor (`k >= MIN_COHORT` **and**
`n - k >= MIN_COHORT`), which was itself a correction after the complement attack defeated the
one-sided version. A floor is inspectable and explainable; noise is neither, and a coach who is told
"three players" when it is really two has been given a false claim, which the truth layer forbids.

**What would reopen it.** Cohorts large enough that a floor stops being the binding constraint —
hundreds, not dozens. Not a realistic near-term shape.

---

### C2 · May private evidence count toward an aggregate? (D-C1) — **WATCH**

**Question.** May a private capture contribute to a group-level count without ever being individually
disclosed?

**Status.** Currently **no**: `_kernelEvidence` excludes private evidence from every organisational
purpose before context is assembled. This is deliberate and is the strongest privacy property the
system has.

**Why WATCH and not OPEN.** The cost of the current answer is real and measurable during a pilot: a
genuine pattern can be invisible because every instance of it is private. **The thing to observe is
how often that happens** — not to change the rule speculatively.

**The trap, recorded explicitly.** "It only contributes to a count, it is never disclosed" is exactly
the reasoning that the complement attack defeats. A count *is* a disclosure when the cohort is small.
Any future yes must survive the full inference-attack suite, not an intuition.

---

### C3 · Silent spiral — private distress with no public evidence — **OPEN**

**Question.** What should the system do when a person is visibly struggling in private evidence and
visibly fine in public evidence?

**Why this is the hardest open question in the register.** The two failure modes are both severe:
telling the coach is a privacy violation the person did not consent to; saying nothing may leave a
young person unsupported.

**What is already true in the code.** The `data_gap` primitive already catches *public* silence — a
person with no public signals is surfaced as a gap, not as a diagnosis. That is a real partial
answer: the system can say "we have little to go on here" without saying why.

**What is already broken.** Non-interference fails today in the opposite direction: `careFlag` is
derived from private evidence and reaches the leader's UI and the recommended action. So the current
behaviour is not "stay silent" — it is "leak a hint". **Fixing that leak is queued work, not
research.** Deciding what *should* replace it is the research question.

**Three candidate answers, none adopted.**
- **Nothing changes for the leader.** The person's own Self surface carries the support path.
- **A subject-directed prompt.** The system speaks to the person, not about them.
- **A non-attributed org-level signal.** The organisation is told support capacity is needed
  somewhere, with no person attached — which the cohort floor may make impossible at team size.

**What would promote it.** A founder decision, informed by the pilot's safeguarding obligations,
which are a legal question as much as an architectural one. This is not a decision an architecture
document may make.

---

### C4 · Longitudinal disclosure across repeated queries — **OPEN**

**Question.** A single answer can pass every floor while a *sequence* of answers over weeks does not.
Should the system track what an audience has already been told?

**Why not queued.** It requires a per-audience disclosure ledger — a new store, and a store that is
itself sensitive. The inference-attack work identified the difference attack (a head sees 4 of 7, a
coach sees 3 of 4, one drop among three people is implied) as the same class of problem in space
rather than time.

**What would promote it.** Evidence that real usage produces the sequence, which a pilot can show
cheaply by logging queries without acting on them.

---

### C5 · Policy as data — Cedar/OPA-shaped permissions (G9) — **PARKED**

**Question.** Should permissions move from code constants into a declarative policy engine?

**Status.** Permissions today are code constants. That is inspectable, testable and cheap. A policy
engine is the right answer at an organisation count where policies genuinely differ per tenant.

**What would promote it.** A tenant that requires a permission shape the constants cannot express.
Note that "wants a different role name" is not that.

---

## 5 · FAMILY D — INFERENCE

*What may be concluded, and by what method.*

### D1 · Causal inference on interventions — **OPEN**

**Question.** Can the effect of a Focus be estimated causally — difference-in-differences across
cohorts — rather than reported as a before/after change?

**Why not queued.** It needs J3 (`intervention.respondsToInquiryId`) and real cohorts. Neither
exists. Today `reason` is the string literal `'briefing'`, so there is not yet a link from an
intervention to what it was responding to.

**The honest caution.** Team-sized cohorts will rarely support a causal claim. The likely finding is
that the correct output is a *narrower* claim, not a stronger one — which the epistemic ladder
already supports by refusing to let a model propose `conclusion`.

---

### D2 · Bayesian revision over the epistemic ladder — **OPEN**

**Question.** Should a belief's confidence update continuously as evidence accumulates, rather than
being derived at each recomputation?

**Why not queued.** Confidence is currently *derived*, which is a correctness property (a Web artifact
must not claim what the kernel never established). A stateful posterior is a place a claim can live
that is not recomputable from the evidence log — the same objection as A2, in smaller form.

---

### D3 · Counterfactual outcome estimation — **OPEN**

**Question.** Can the system estimate what would have happened without a Focus?

**Status.** Downstream of D1 and strictly harder. Recorded so it is not mistaken for a near-term
capability when someone asks "does IntelliQ prove impact?" — the honest answer is that it measures
change and reports uncertainty, which is what the acceptance target already says out loud.

---

### D4 · Sequence models over evidence timelines — **PARKED**

**Question.** Would a temporal model detect patterns the deterministic detectors miss?

**Status.** Parked under the same law as A2 for anything reaching the truth layer. Legitimate only as
a proposer whose output the kernel adjudicates.

**One real finding it would have to beat.** The existing robust statistics — median plus MAD
baselines, Wilson score lower bounds — are already deterministic, explainable and in production. A
sequence model must demonstrably beat them on a benchmark before it earns the loss of explainability.

---

### D5 · Cross-team transfer of learned Focus efficacy — **OPEN**

**Question.** If a Focus worked for one team, should that raise its standing when proposed to
another?

**Why this matters for growth and still is not queued.** This is the programme that would make the
tenth deployment better than the first, so it is genuinely valuable rather than speculative. It is
not queued because it crosses a tenant boundary with derived knowledge, and the law on that is not
"be careful" — it is that the crossing must be adjudicated before it is built.

**What would promote it.** A second deployment, plus an adjudication of what may cross a tenant
boundary in aggregate form. Note that the honest version may be very narrow: *the shape of an
intervention* may be transferable while *its efficacy* is not, because efficacy is contextual.

---

## 6 · FAMILY E — MODEL ECONOMICS

*Which model does what, at what cost, under what floor.*

### E1 · Local / on-box model path — **PARKED**

**Question.** Should a tenant be able to run with no external provider at all?

**Status.** Parked behind D-E1 and a school that requires it. The deterministic switch
(`IQ_DETERMINISTIC_ONLY`) already gives a no-egress mode; a local model is a *quality* improvement on
that mode, not an availability one.

**Related live defect, not research.** `canTranscribe()` currently ignores the switch, so a no-egress
tenant is advertised a capability it has disabled. That is queued work.

---

### E2 · Model routing tables and quality floors — **PARKED**

**Question.** Should model selection be a data-driven routing table rather than call-site constants?

**Status.** Parked behind the integrity benchmark. **The sequencing law is recorded and firm:** the
crappy-model benchmark runs *before* any re-tiering. Re-tiering to cheap models before establishing
whether the kernel holds against a weak model is the single worst sequencing mistake available here.

---

### E3 · Content-addressed proposal cache — **PARKED**

**Question.** Should identical proposal requests be served from a content-addressed cache?

**Status.** A cost optimisation with a correctness edge: a cached proposal computed under one
admissible set must never be served to an audience with a different one. The cache key would have to
include the audience, which removes most of the saving. Parked behind token-denominated telemetry,
because without it the saving cannot even be measured.

---

### E4 · Standing integrity benchmark as a merge gate — **OPEN**

**Question.** Should the crappy-model benchmark run continuously as a gate, rather than once?

**Why this is genuinely interesting.** The system's central claim is that the harness survives model
replacement. A standing benchmark is the only thing that would keep that claim true over time rather
than true once.

**Why not queued.** The benchmark itself does not exist yet. Build the measurement before building
the gate.

---

### E5 · Fine-tuning or distillation on organisational corpora — **REJECTED**

**Question.** Should a model be trained on a tenant's own data?

**Why rejected.** Three independent law violations, any one of which is sufficient: organisational
truth would live in model weights (single-truth-store); a correction could not propagate into weights
(correction law); and weights trained on one tenant's data are a cross-tenant leak vector the moment
they are reused (tenant isolation). Recorded here because it is a question that will be asked
repeatedly by people who have not read the laws.

---

## 7 · FAMILY F — AGENT AND INTERACTION

*What the system is, from the user's side.*

### F1 · Per-person agents — **REJECTED**

**Question.** Should each person have a persistent agent of their own?

**Why rejected.** It is on the explicit must-not-build list. The Self surface is already
person-relative — `_kernelEvidence` computes a genuinely different admissible set per viewer. A
per-person *agent* adds per-person state that is not derived from the evidence log, which is a new
place truth can live, plus N times the model cost for a personalisation the admissible set already
provides.

---

### F2 · Multi-agent orchestration frameworks — **REJECTED**

**Question.** LangChain, LangGraph, AutoGen, Temporal, Ray?

**Why rejected.** On the must-not-build list, and for a specific reason worth restating: the
orchestration these frameworks provide is *control flow around model calls*. The hard part here is
not control flow — it is adjudication, admissibility and provenance, none of which any of these
frameworks supplies. Adopting one would add a dependency and a second scheduler while leaving every
actual problem untouched.

**What is already in production instead.** Level-triggered reconciliation: a periodic sweep plus
invalidate-only nudges. That is the correct pattern for this problem and it is thirty lines.

---

### F3 · Conversation as capability — **OPEN**

**Question.** Should the conversational surface itself be a first-class capability — able to open an
Inquiry, record evidence, and close a Focus — rather than a read surface over things created
elsewhere?

**Status.** An exploration document exists; it is not law. Recorded as open because the agent-repair
work now in the queue will partially answer it in practice: an agent that can answer "how is the team
doing?" from governed evidence is already halfway to a capability surface.

**The line to hold.** Reading is safe. *Writing* through conversation must go through the same
admissibility and provenance doors as any other write, with no shortcut for being conversational.

---

### F4 · Expression and initiative — unprompted worker action — **OPEN**

**Question.** May the system act without being asked — open a group Inquiry, raise a concern, propose
a Focus?

**Status.** One narrow instance of this is already a founder decision deferred to the pilot (D-W4:
may the worker open a group Inquiry unprompted?). The general question is broader and is not being
answered in advance.

**The pilot question underneath it.** How often do leaders agree with the corroboration verdict? If
the answer is "usually", initiative is cheap. If it is "sometimes", initiative is a trust cost.

---

### F5 · Forum intelligence — **PARKED**

**Question.** Should there be a shared organisational forum surface, and should the system reason
over it?

**Status.** Parked; the Forum UI is on the must-not-build list. One law survives from the work done
here — origin independence (P0-5 prime) — and it survives *without* the Forum, which is why the law is
queued and the surface is not.

---

### F6 · Audience-relative reasoning, generalised — **WATCH**

**Question.** Should the two-purpose split (personal / organisational) generalise to arbitrary
audiences, each with its own admissible set?

**Status.** The investigation returned STRONG DIRECTION, and the bounded part of it — fixing the two
proven non-interference leaks — is queued work, not research. **What remains research is the
generalisation**: N audiences rather than two.

**Why WATCH.** The pilot will show whether two audiences are enough. A coach, a head of department, a
parent and a player are four audiences, not two — but three of those may be adequately served by the
existing two sets plus scope. Observe before generalising.

---

## 8 · FAMILY G — CONTINUITY

*Three programmes that do not fit the families above.*

### G1 · Inquiry-state concurrency recovery (P0-6) — **OPEN**

**Question.** What happens to Inquiry state under a partial failure that durable CAS does not cover?

**Status.** Unadjudicated and explicitly **not** a pilot blocker. Recorded so that "P0-6 is
outstanding" is not mistaken for "P0-6 is blocking".

---

### G2 · Durable candidate store (`webCandidates`) — **PARKED**

**Question.** Should Web candidates persist between sweeps rather than being recomputed?

**Status.** Parked. Recomputation is correct; persistence is an optimisation whose only observable
benefit appears at a shorter cadence or with a second organisation, because that is when
re-surfacing becomes visible to a user.

---

### G3 · Member organisational intelligence (G3, Web to Self) — **OPEN**

**Question.** Should a member see organisational intelligence about their own group — the team's
Highs and Lows, not only their own?

**Why this is on the register and not in the queue, despite being product-shaped.** It is the
mirror of the leader surface and it is genuinely wanted. It is not queued because it crosses Web to
Self, and that crossing must satisfy the corrected aggregate contracts first. Building it before the
cohort floors are correct would put the aggregate leak in front of *more* people, not fewer.

**What would promote it.** The corrected aggregate contracts landing, then a founder decision. This
is the most likely programme in this register to be promoted early, and it should still be promoted
explicitly rather than drifting in.

---

## 9 · WHAT THIS REGISTER DOES NOT CONTAIN

Deliberately absent, because they are **queued work** and belong in
`docs/ttd/pilot-blocker-challenge-and-packets.md`:

- the real no-LLM suite
- the two-sided cohort floor
- origin counting and derived confidence
- perspective derivation from `subjectRef`
- person-model temporal decay
- invalidation on person removal
- the non-interference leaks (`careFlag`, `_register`)
- team-grain product surface (Inquiries, Highs, Lows, Focuses)
- agent repair

**If a future session finds one of these described as research, that description is the defect.**

---

## 10 · REVIEW RULE

This register is reviewed **only** when a founder decision promotes something out of it, or when a
pilot observation answers a WATCH item. It is not reviewed on a schedule, and it is not expanded as a
by-product of other work. **A register that grows is a register that is being used as a queue.**
