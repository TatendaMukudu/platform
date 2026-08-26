# Deterministic Web intelligence — the intelligence ladder

**Status:** architecture audit. **Nothing implemented.** No production code changed.
**Stage B** of the autonomous architecture loop. Preceded by `f7faaac` (model/worker economics).
**Written against:** `f7faaac`.

**The question:** how much organisational intelligence can the Web compute with no model at all?

**The answer:** considerably more than assumed, because IntelliQ already sits at Level 2 of the
ladder below — it has robust statistics in production, not just graph traversal.

---

## 1 · Executive finding

**F-1 · IntelliQ is already at Level 2, not Level 0.** The deterministic layer contains genuine
statistics, not heuristics:

- **Wilson score lower bound** for efficacy ranking (`ai/outcome-intelligence.js:79`), with the
  observed rate and sample size deliberately kept separate in the public record so the bound is
  *only* an ordering key.
- **Median + median absolute deviation** baselines (`ai/baseline.js:41-53`) — robust to outliers in
  a way a mean is not — over a trailing 90-day window that **excludes** the recent window, so
  "normal" is never contaminated by "lately" (`:55-66`).
- A **spread floor** (`max(mad, 0.15·|normal|, 0.5)`) so a low-variance series does not become a
  hair-trigger detector, and a `MIN_POINTS` gate below which nothing is asserted.

That is careful applied statistics. Any ladder that places IntelliQ at "graph truth only"
understates the existing substrate by two levels.

**F-2 · The graph layer, by contrast, is minimal — and correctly so.** `ai/org-graph.js` provides
`buildGraph`, `descendants`, `ancestors`, `visibleScope`, `routeTarget`, `canSee`. There is no
centrality, no community detection, no similarity, no motif detection. **This is not a gap.** With
one node hierarchy of tens of nodes, centrality is a formality and community detection would
rediscover the org chart it was given.

**F-3 · The binding constraint on Web intelligence is not algorithms. It is missing edges.** Every
Level-2 capability worth having at Falcon scale is blocked by J1-J4 from the ontology audit, not by
the absence of a graph algorithm. Adding NetworkX-grade analytics to a graph with four broken joins
would compute elegant answers about an incomplete world.

---

## 2 · THE INTELLIGENCE LADDER

For every capability the governing question is: **can this be computed deterministically?** If yes,
*the model may explain it, but must not own it.*

### LEVEL 0 — graph truth

*What is structurally the case.*

| Capability | Status | Where |
|---|---|---|
| Node hierarchy, multi-parent, cycle-safe | **ENFORCED** | `ai/org-graph.js:29-60` |
| Membership and leadership | **ENFORCED** | `orgNodes[].memberIds/leaderIds` |
| Reachability (descendants / ancestors) | **ENFORCED** | `:59-60` |
| Scope resolution | **ENFORCED** | `visibleScope:66` |
| Nearest responsible leader | **ENFORCED** | `routeTarget:102`, `org-routing._nearestLeaders:33` |
| Tenant isolation | **ENFORCED** structurally | `orgNodes[code]` |
| **Temporal graph** (node/edge validity windows) | **MISSING** | gap GW-4 |

### LEVEL 1 — deterministic Web computation

*What follows from the graph plus current state, by traversal.*

| Capability | Status | Blocked by |
|---|---|---|
| Admissible evidence for an actor | **ENFORCED** | — |
| Scope-signature caching | **ENFORCED** (`server.js:9951`) | — |
| Cohort membership for an aggregate | **ENFORCED** | — |
| Routing conflicts (multi-parent, no owner) | **ENFORCED** (`org-routing.js:60`) | — |
| Objectives with no inquiry serving them | **MISSING** | **J1** |
| Inquiries resolved with no decision recorded | **MISSING** | **J1 + J4** |
| Focus whose originating Inquiry was refuted | **MISSING** | **J2** |
| Interventions with no measured outcome after N days | **PARTIAL** | J3 |
| Stale beliefs | **ENFORCED** (`reason.js:38`, `STALE = 21d`) | — |
| Graph-change invalidation | **MISSING** | GW-5 |

**Every missing Level-1 capability is a missing foreign key.** Not one needs an algorithm.

### LEVEL 2 — deterministic / statistical organisational intelligence

*What follows from evidence, statistically, with no learning.*

| Capability | Status | Where |
|---|---|---|
| Robust per-person baseline (median + MAD) | **ENFORCED** | `ai/baseline.js:55` |
| Deviation-from-self detection | **ENFORCED** | `ai/baseline.js:68` |
| Change-point / shift detection | **ENFORCED** | `ai/baseline.js:90` |
| Trajectory patterns (7 detectors) | **ENFORCED** | `ai/intelligence.js:188` |
| Structural patterns (5 detectors) | **ENFORCED** | `ai/primitives.js:66` |
| Efficacy ranking with sample discounting | **ENFORCED** (Wilson) | `ai/outcome-intelligence.js:79` |
| Reliability calibration by feedback | **ENFORCED** | `ai/confidence.js:20` |
| Independent-origin corroboration | **ENFORCED** | `ai/contribution.js:203` |
| Contradiction / staleness / missing-owner | **ENFORCED** | `ai/org-state.js:317-343` |
| Segment rate comparison with a material-difference floor | **ENFORCED** | `server.js:3240-3250` |
| **Cohort-level aggregation across a Web** | **PARTIAL** | PR #74, needs §22 origin contract |
| **Cross-node comparison** (peer programmes) | **MISSING** | Stage D |
| **Intervention → outcome attribution across a cohort** | **PARTIAL** | J3 |
| **Time-to-effect / lag analysis** | **MISSING** | — |

### LEVEL 3 — classical ML

*Learned models over tabular features.*

**Verdict: NOT NEEDED, and probably never at Falcon scale.** Logistic regression or gradient
boosting over a few hundred observations per organisation would produce a model with wider error
bars than the Wilson bound already reports, and it would be less explainable. The existing
`deriveConfidence` + Wilson combination is the correct tool for this data size.

*Revisit only when a single organisation has thousands of measured intervention outcomes.*

### LEVEL 4 — neural / graph learning

*GNNs, graph embeddings, node2vec, link prediction.*

**Verdict: REJECT for the foreseeable future.** Three independent reasons, each sufficient:

1. **Scale.** GNNs need hundreds of thousands of nodes to beat hand-specified features. Falcon has
   tens.
2. **Explainability.** A link-prediction score cannot enter the epistemic ladder — it is neither an
   observation, an interpretation, nor a hypothesis with citable support. It would have to be
   admitted as a `conclusion`, which `MODEL_MAY_PROPOSE` forbids to *any* engine.
3. **Governance.** An embedding is a lossy re-encoding of private evidence with no provenance and
   no supersession. Correcting an evidence item cannot correct an embedding that absorbed it. This
   collides directly with the correction law.

> **L-B1 (proposed).** No learned representation may enter the kernel unless a correction to its
> input can be shown to propagate to its output. Embeddings and GNN outputs currently cannot satisfy
> this, which is why they may support *retrieval* but never *belief*.

That law also settles the existing `ai/embeddings.js` position: it is a **retrieval accelerator**,
not a source of organisational truth, and nothing it produces may be cited.

### LEVEL 5 — cheap language / reasoning workers

Specified in Stage A (`model-worker-economics.md` §3). Proposals only, schema-constrained, no
authority.

### LEVEL 6 — frontier supervision

Stage A §3. Open reasoning, ambiguity, adversarial review.

---

## 3 · GRAPH THEORY — WHAT IS ACTUALLY APPLICABLE

Assessed honestly against an organisation of tens of nodes and hundreds of people.

| Technique | Applicable at Falcon? | Why |
|---|---|---|
| Reachability / traversal | **yes — in use** | the Web itself |
| Shortest path | **yes — in use** | `routeTarget` is BFS-up |
| Centrality (degree, betweenness, PageRank) | **no** | in a tree, degree centrality *is* the org chart. Would restate structure as insight |
| Community detection (Louvain, label propagation) | **no** | would rediscover the declared nodes; where it disagreed, the declared structure wins by law |
| Structural similarity / role equivalence | **later — genuinely interesting** | "which programmes are structurally comparable" is the Stage D peer question, and this is its principled form |
| Motif detection | **no** | needs a dense multi-relational graph IntelliQ does not have |
| Diffusion / propagation | **no** | models influence spread; IntelliQ has no interaction edges to diffuse over |
| Temporal graphs | **yes — but as validity windows, not analytics** | GW-4; a node needs a lifetime, not a temporal-motif algorithm |
| Change-point detection | **yes — in use** | `baseline.shift` |
| Causal inference / diff-in-diff | **later** | the honest form of "did this intervention work across a cohort"; needs J3 first |
| Graph embeddings | **no** | L-B1 |

### The one technique worth adopting later

**Structural similarity** answers the Stage D question — *which peer programmes are comparable
enough that an aggregate across them is meaningful?* — without granting any lateral visibility. Two
nodes are comparable when they share a parent, have similar depth, similar membership size, and
similar evidence density. That is four deterministic features and a threshold, not an algorithm
library.

---

## 4 · EXTERNAL INFRASTRUCTURE — RELATIONSHIP SCOPE VS PERMISSION

Studied for the primitive each solved. The recurring lesson is the same one three times.

| Source | Primitive | Need it? | Have it? | Verdict |
|---|---|---|---|---|
| **Google Zanzibar** | relationship tuples + a `check` API; **zookies** = consistency tokens so a read never mixes graph versions | concept yes | partly — `_getOrgState`'s scope signature | **ADAPT the zookie**; reject the service (GW-5) |
| **SpiceDB** | Zanzibar OSS; schema language for relation definitions | **no** | n/a | **REJECT** — one hierarchy, five relation kinds |
| **OpenFGA** | same family, simpler | **no** | n/a | **REJECT** |
| **OPA** | policy as data; **decision logs with reasons** | concept yes | partly — `policyResult: {effect, reason}` | **ADAPT**: `canSee` returns a bare boolean, so a filtered read shrinks silently (GW-10) |
| **AWS Cedar** | typed, analysable policy language; provable properties | later | no | **LATER** — G9 |
| **Kubernetes controllers** | level-triggered reconciliation; events are hints, never the mechanism | **yes** | **yes** — `_reasonSweep` + `_reasonNudge` | **already correct** |
| **Palantir Ontology** | objects + links; **all writes via typed Actions** | **yes** | **yes** — proposal→confirm→execute | **already correct**, closest structural match |
| **Glean** | one enterprise index, per-person relevance at query time | **yes** | **yes** — shared fold + per-actor projection | **already correct**; its hard problem is permission *freshness* = GW-5 |
| **Neo4j / graph-tool / TinkerPop** | graph storage and traversal at scale | **no** | n/a | **REJECT** — §5 |
| **NetworkX** | in-process graph algorithms | **no** for the pilot | `buildGraph` covers what is used | **LATER** if structural similarity ships; it is ~40 lines, not a dependency |
| **Event sourcing** | append-only log; state as a fold | **yes** | **yes** — `evidenceLog` with supersession, `orgStateHistory` | **already correct** |
| **CQRS** | separate write and read models | **yes** | **yes** — evidence writes vs derived projections | **already correct**, unnamed |
| **Deterministic workflow engines** | durable step execution | **no** | reasoning is idempotent recomputation | **REJECT** |

### The convergent lesson, stated once

**Zanzibar, Glean and Kubernetes independently identify the same failure: the graph changing is the
event systems forget to invalidate on.** IntelliQ invalidates on evidence change (five `_reasonNudge`
sites) and on structure change **not at all**. Three literatures pointing at one gap is why GW-5 is
ranked as it is.

The second lesson: **IntelliQ has independently arrived at event sourcing, CQRS, Ontology-style
gated writes, and controller reconciliation** — none of them named, all of them correct. That is
strong evidence the substrate is sound and should be *completed*, not replaced.

---

## 5 · DOES THIS NEED A GRAPH DATABASE?

**No.** The ontology audit (`ff56cca` §11) concluded this and no new evidence overturns it. Restated
with the Stage B numbers:

| Consideration | Measurement |
|---|---|
| Nodes per org | tens |
| People per org | tens to low hundreds |
| Traversal depth in use | ≤ 4 (`routeTarget` BFS-up; `descendants` over a shallow tree) |
| Graph construction cost | `buildGraph` is O(nodes + edges), rebuilt per call |
| Queries per request | 1-2 |

`buildGraph` being rebuilt on every `visibleNodesFor` call is the only measurable inefficiency, and
at tens of nodes it is noise. It becomes worth memoising **when the graph fingerprint exists**
(GW-5) — the same key serves both purposes, which is a pleasing consequence rather than a
coincidence.

> **L-B2 (proposed).** A graph database becomes worth discussing when a single organisation exceeds
> ~10,000 nodes **or** a traversal exceeds depth 6 **or** a query pattern requires variable-length
> paths that cannot be expressed as a bounded walk. Falcon meets none of these, and a schools
> business plausibly never will.

---

## 6 · OVERLAPPING NETWORKS — CAN THE CURRENT MODEL CARRY THEM?

The brief asks whether the Web can eventually represent several distinct relationship networks.
Assessed against current storage, not against a wish list.

| Network | Representable today? | How | Verdict |
|---|---|---|---|
| **Authority** | **yes** | `leaderIds` + `routeTarget` + `_nearestLeaders` | in use |
| **Structural membership** | **yes** | `memberIds`, `parentIds` | in use |
| **Responsibility** | **yes** | `orgMeta.professionals[{userId,title,remit}]`, `safeguardingLeadId`, `orgState.responsibility` | in use — routes, does not widen (L-W10) |
| **Focus participation** | **no** | `participantIds` absent | **G1** |
| **Inquiry participation** | **partial** | group inquiries anchor to a node; no participant list | **G1** |
| **Evidence relationship** | **yes** | signals with `supports`/`challenges`/`originRef` | in use, richest network in the product |
| **Intervention** | **partial** | `orgInterventions.targetMemberId`, `patternType` | **J3** — no link to the inquiry |
| **Outcome** | **yes** | `intervention.recordedOutcome` + Wilson ranking | in use |
| **Knowledge / expertise** | **partial** | `professionals.remit` is free text matched by keyword | weakest; adequate for pilot |
| **Collaboration** | **no** | no interaction edges exist | not needed for pilot |

**Seven of ten already exist.** The three gaps are G1 (participants), J3 (intervention→inquiry) and
collaboration (not needed). No new storage shape is required for any of them — `participantIds` is
an array on an existing record and `respondsToInquiryId` is a string.

> **L-B3 (proposed).** Networks are represented as **typed fields on existing records**, never as a
> generic edge table. A network that cannot be expressed as a field on the object that owns it is a
> signal the object model is wrong, not that a graph store is needed.

---

## 7 · WHAT THE MODEL MAY EXPLAIN BUT MUST NOT OWN

The ladder's operative rule, made concrete.

| Computation | Owner | Model's permitted role |
|---|---|---|
| Baseline, deviation, shift | **T0** `ai/baseline.js` | phrase it warmly |
| Efficacy ranking | **T0** Wilson | explain what the ranking means |
| Independent-origin count | **T0** `contribution.js` | never touch it (L-W7) |
| Cohort membership and floors | **T0** Web + `MIN_COHORT`/`MIN_SEG` | never touch it |
| Contradiction detection | **T0** `org-state.js:343` | describe the contradiction |
| Staleness | **T0** `reason.js:38` | phrase the nudge |
| Which objectives lack inquiries | **T0** (needs J1) | phrase the prompt |
| Whether a Focus's origin was refuted | **T0** (needs J2) | phrase the check-in |
| Structural similarity of two programmes | **T0** (later) | explain why they are comparable |
| **Whether a behaviour bears on an aim** | **model proposes**, T0 tests | propose the hypothesis |
| **Prose → candidate observations** | **model only** | irreducible |
| **Recognising an unstated concern** | **model only** | irreducible |

> **L-B4 (proposed).** If a quantity can be computed deterministically, the model may **never**
> produce it — not even as a convenience, not even when it would be faster. A model-produced number
> that a deterministic function could have produced is a provenance defect, because the number now
> has two possible sources and only one is reproducible.

---

## 8 · MINIMUM VIABLE ADOPTION

Nothing in Stage B requires an algorithm library, a graph store, or an ML dependency.

| # | Change | Level | Blocked by |
|---|---|---|---|
| **B1** | The four Level-1 sweeps (unserved objectives, refuted-origin Focus, undecided inquiries, unmeasured interventions) | 1 | J1-J4 |
| **B2** | Graph fingerprint + memoised `buildGraph` — one key, two benefits | 0/1 | — |
| **B3** | `canSee` returns `{visible, excluded:[{id,reason}]}` (OPA lesson, GW-10) | 1 | — |
| **B4** | Cohort aggregation honouring the origin contract | 2 | PR #74 §22 |
| **B5** | Structural similarity for peer comparability | 2 | Stage D |
| **B6** | Node validity windows (temporal graph) | 0 | GW-4 |

**B1 is the highest value and needs no new mathematics** — four traversals over foreign keys that do
not yet exist. This is the same conclusion the ontology audit reached from a different direction,
which is corroboration rather than repetition.

---

## 9 · DEFERRED — do not build

- Any graph database, triple store, or graph query language.
- Centrality, community detection, motif analysis, diffusion modelling.
- Graph embeddings, node2vec, GNNs, link prediction — see L-B1.
- Classical ML over organisational features at pilot scale.
- NetworkX or any graph library as a dependency; if structural similarity ships, it is ~40 lines.
- Causal inference / difference-in-differences until J3 exists and a pilot has produced cohorts.

---

## 10 · FOUNDER DECISIONS ARISING

### D-B1 · May a deterministic sweep tell someone their Focus rests on a refuted Inquiry?

The B1 sweep produces a true and useful statement — *"the belief that prompted this work no longer
holds"* — which is also potentially deflating, and IntelliQ has a standing preference for silence
over noise (`ai/behaviour.js:36-47`).
**Options:** (A) surface to the person; (B) surface only to whoever created the Focus; (C) surface
to neither, only count it in org learning.
**Recommendation: A**, phrased as an offer to revisit rather than a verdict. It is the single most
useful thing the sweep can say and withholding it wastes the person's effort.
**Blocks:** B1 surfacing (not the computation).

### D-B2 · Does `ai/embeddings.js` remain outside the deterministic switch?

Raised in Stage A as D-E3 and reinforced here by L-B1: an embedding cannot carry correction
propagation, so it may accelerate retrieval but must never be cited. If it stays outside the switch,
the no-egress guarantee has an exception that must be written down.
**Recommendation: bring it inside the switch and state plainly that semantic retrieval degrades to
keyword in no-egress mode.**
**Blocks:** the no-LLM floor wording.
