# Web Semantics and Continuous Web Intelligence — architectural adjudication

**Status:** adjudication as of 2026-08-22. Architecture only. No production code changed.
**Subordinate to:** `docs/ttd/intelliq-ttd-v1.md` (the product-truth document) and
`docs/ttd/intelliq-constitution.md` (the constitutional addendum).
**Companion audits:** `docs/ttd/product-reconciliation-audit.md`, `docs/ttd/leadership-intelligence.md`.

Status vocabulary is inherited from TTD v1: **ENFORCED** (code + an executable test),
**PARTIAL** (behaviour exists, law not satisfied), **SPECIFIED** (decided, nothing enforces it),
**OPEN** (deliberately unresolved), **DISCOVER** (settled by pilot evidence).

Every claim below cites a file and line read during this audit. Where the founder's stated
intent and the repository disagree, the disagreement is named rather than smoothed over.

---

## 1. VERDICT

### COMPATIBLE — MATERIAL EXTENSION

`ai/org-graph.js` is the right primitive and does not need replacing. It is 125 lines, pure,
importing nothing, cycle-safe, multi-parent, deterministic and sorted, and it is covered by an
executable suite (`scripts/org-graph-smoke.js`, 16 assertions, registered at
`scripts/test.js:103`). Nothing in it contradicts the Web law. It is a strict subset of the Web
law, not a rival to it.

The extension is **material** rather than small for four reasons, in descending order of weight:

**1. The Web governs a minority of the product.** There are three parallel scope mechanisms in
production, and they do not compose:

| Mechanism | Granularity | Call sites | Governs |
|---|---|---|---|
| `orgGraph.*` (`server.js:27`) | **nodes** | **10** in server.js | org-state evidence pool, org notes, the intelligence packet, routing, node-scope stamping |
| `getVisibleUserIds` (`server.js:2777`) | **people** | **48** in server.js | the reasoner agenda, roster, briefing, pending inquiries, assessments, check-ins, uploads, exports, safeguarding, and most of the leader surface |
| `_inNode` / `_leadsNode` (`server.js:12549-12550`) | **direct node membership** | forum + group contribution | Forum read/post, group inquiry, group candidates |

The Web primitive exists and is wired, but the surface it actually reaches is roughly one fifth
of the scope decisions the product makes. `getVisibleUserIds` is the de facto authority.

**2. The founder's Web rule is not the rule the code implements.** `visibleScope`
(`ai/org-graph.js:66`) gives a **leader** their node plus its entire subtree, and gives a
**member** their node plus its direct parents. A leader gets *no upward visibility at all*. The
founder rule requires self + **one level above** + everything beneath, for every node. Under the
current law the Soccer Coach's Web excludes the Director of Sport. `scripts/org-graph-smoke.js:33`
asserts this omission positively — `coachA` sees `teamA`, `trainers`, `psych` and not `root`.
This is a **law amendment**, not a bug fix, and must be recorded as one.

**3. The SELF/ORG perspective axis does not exist as a first-class field**, and where something
like it exists it is conflated with audience (§4).

**4. There is no worker state.** Continuous reasoning already runs (§6), but it has caches and
cooldowns, not memory. Nothing durably records that a candidate was *surfaced*, to *whom*, and
what happened next.

None of these is an architectural conflict. The graph module does not have to change shape; it
has to grow one rule, and the product has to route more of its scope decisions through it.

### What is already true, and should not be rebuilt

The audit found more of the target architecture already built than the founder brief assumes:

- **A shared continuous engine with per-actor projections already runs.** `_reasonSweep`
  (`server.js:10815`) reasons org-wide every 30 minutes (`server.js:17599`) and once on boot;
  `_reasonScopedAgenda` (`server.js:10878`) projects that shared result per reader. That is
  execution option D, already implemented.
- **Change-driven invalidation already exists.** `_reasonNudge` (`server.js:10824`) is called
  from five sites (`7133`, `7356`, `14163`, `14173`, `14845`) and only ever drops a cache — it
  never queues work. That is the correct controller discipline (§13).
- **A deterministic content fingerprint already exists.** `_orgEvidenceFingerprint`
  (`server.js:9863`), and `_getOrgState` (`server.js:9945`) already caches derived state keyed by
  `org | purpose | policy version | fingerprint | scope signature` — a per-Web cache key.
- **Deterministic contradiction and gap detection already exists.** `stateToUncertainties`
  (`ai/org-state.js:317`) emits `missing_required`, `stale`, `contradiction` and
  `unresolved_owner` with no model involved.
- **The multiple-membership rule is already decided and implemented** (`server.js:12556`), in
  the safe direction (§9).
- **Org-perspective Inquiry already has storage.** `inquiryStates` is keyed
  `code → subjectRef → concept`, and `subjectRef` is already either `member:<id>` or
  `group:<nodeId>` (`server.js:12544`).

---

## 2. EXACT WEB LAW

### L-W1 — The structural Web (proposed law, amends current behaviour)

> For an actor A in organisation O with node graph G:
>
> `Web(A) = ⋃ over every node N where A is a leader   { N } ∪ descendants(G, N) ∪ parents(G, N)`
> `        ∪ ⋃ over every node N where A is a member   { N } ∪ parents(G, N)`
>
> where `parents` is the set of **direct** parents (one level, never transitive) and
> `descendants` is the transitive closure downward (cycle-safe).

Three properties this preserves, and which any implementation must keep:

- **Upward is one level, downward is transitive.** A member of `trainers` sees `teamA`; they do
  not see `root`. A leader of `teamA` sees `root`; they do not see `root`'s other children.
- **Sibling isolation survives the amendment.** Adding a direct parent adds the parent *node*,
  not the parent's other descendants. `coachA` gaining `root` does not gain `teamB`, because
  `visibleScope` adds node ids and never re-expands from them.
- **Multi-parent is honoured in both directions.** A node with two parents contributes both.
  `buildGraph` (`ai/org-graph.js:29`) already applies every edge both ways regardless of which
  side declared it.

### The delta from current code

Exactly one loop body changes, at `ai/org-graph.js:68-72`: the leader branch gains the same
`for (const p of graph.parentsOf.get(n))` the member branch already has at lines 75-77. That is
the entire structural change. Everything else in this document is composition, not graph surgery.

### L-W2 — The Web is reasoning territory, never an access grant (proposed)

> Membership of `Web(A)` makes a node's *shared* material potentially relevant to A. It confers
> no right to any individual datum. Every read of person-level material must pass a governance
> check that is evaluated separately from, and after, Web resolution.

This is already how the code behaves at the two places both layers are present — `canUseItem`
(`ai/scoped-intelligence-packet.js:51`) checks `graph.canSee` for node-scoped items and then
falls through to a *separate* subject-level check for person-level items. The law names what the
code already does, and forbids the shortcut of treating `visibleNodes` as an ACL.

---

## 3. WEB vs GOVERNANCE vs KERNEL vs PROJECTION

The founder asked that these four not be collapsed. They are already four different things in
the repository; they have never been named as a stack. Naming them is most of the work.

| Layer | Question it answers | Owner today | Purity | Status |
|---|---|---|---|---|
| **WEB SCOPE** | Which organisational territory is potentially relevant to this actor? | `ai/org-graph.js` | pure, imports nothing | ENFORCED (for the current rule) |
| **GOVERNANCE** | Within that territory, which specific material may this actor access? | `getVisibleUserIds` (`server.js:2777`), `_userHasPerm`, `_actorRole`, `orgPolicies`, consent | impure — reads users, perms, groups | PARTIAL — correct, but not composed with Web scope |
| **KERNEL REASONING** | Given the admissible evidence, what may legitimately be concluded? | `ai/reason.js`, `ai/diagnose.js`, `ai/org-state.js`, `ai/contribution.js`, `ai/admissibility.js` | pure | ENFORCED |
| **PROJECTION** | What of that conclusion should this actor actually be shown, and how? | `ai/proactive.js` (`audienceSafe`), `ai/behaviour.js`, `ai/scoped-intelligence-packet.js`, `ai/language-guard.js` | pure | PARTIAL — `audienceSafe` has **one** production call site (`server.js:4452`) |

### The composition law

### L-W3 — Ordered composition (proposed)

> Every intelligence read resolves in this order and no other:
> `Web scope → governance → kernel → projection`.
> A layer may only narrow what the layer above it produced. No layer may widen.
> A surface that skips a layer must fail closed, not fall through.

### The two ways the stack is currently broken

**Broken forward (Web skipped):** the 48 `getVisibleUserIds` surfaces apply governance with no
Web scope. In practice this is *more* permissive in one specific direction — rule 3(a2) at
`server.js:2810-2814` grants a plain **member** of a node visibility of the people in all
**descendant** nodes. `orgGraph`'s member rule grants the opposite (node + parents, nothing
below). The two mechanisms disagree about what a member may see, and the person-level one wins,
because it is the one guarding the endpoints.

**Broken backward (projection skipped):** `/api/intelligence/roster` (`server.js:4250`) and
`/api/intelligence/briefing` (`server.js:4150`) both resolve governance and kernel and then
return person-level `status` and `topLabel` without passing `audienceSafe`. This was already
recorded in `docs/ttd/leadership-intelligence.md` and remains the highest-priority migration.

---

## 4. SELF / ORG OBJECT MODEL

### Ruling: one object model, not eight stores. And not four either.

The founder's instinct is right and the repository supports it, but the reason is sharper than
"avoid duplication". **High and Low are not storable at all.** They are a projection of polarity
onto a bucket, computed at read time:

- `AXIS` (`ai/reason.js:56-74`) assigns every belief kind a `polarity` of `risk` or `progress`.
- `BUCKET` (`ai/behaviour.js:32`) maps polarity onto `needs_attention` / `worth_celebrating` /
  `opportunities`.
- `behaviour.plan()` (`ai/behaviour.js:69`) groups, ranks, caps and produces first-class empty
  states.

There is no `high` or `low` type anywhere in `ai/` or `server.js`; every hit for those strings is
severity, priority, intensity or confidence vocabulary. **High/Low is already presentation state
derived from kernel polarity, exactly as the founder intends.** Status: ENFORCED. Creating a
store for either would be a regression.

### The real finding: `audience` is carrying two axes

`ai/proactive.js:214` sets `audience = 'leader' | 'self'`, and that single field currently means
three different things at once:

1. **Who is reading** (a leader vs the person themselves) — a governance fact.
2. **Who it is about** (someone else vs me) — a subject fact.
3. **How safely it must be phrased** — a projection rule, correctly derived from (1).

For an ORG High such as *"Focus X appears associated with improvement across 40% of the relevant
people in your Web"* none of the three readings is correct. It is about a **Web aggregate**, not a
person; the reader is a leader; and the numeric leak rule at `ai/proactive.js:300` would reject
the sentence outright, because `SCORE_RE` matches `40%` for any leader audience. **The
aggregate-safe case does not exist in the projection layer today.** An org-level percentage over a
cohort is not a private disclosure, but `audienceSafe` cannot tell it apart from a private one.

### PL-W1 (proposed) — separate perspective from audience

> Every intelligence artifact carries two independent fields:
> `perspective: 'self' | 'web'` — what the item is **about**;
> `audience: 'self' | 'leader'` — who is **reading** it.
> `audienceSafe` gates on `audience`. Bucketing and phrasing gate on `perspective`.
> A `perspective: 'web'` item has **no `subjectId`** — that is what makes it an aggregate. An
> item with a `subjectId` is never `perspective: 'web'`, however many people it resembles.

The last sentence is the guard that stops "org intelligence" becoming a laundering route for
person-level disclosure.

### The four objects, per perspective, against repository truth

| Object | SELF today | ORG/Web today | Verdict |
|---|---|---|---|
| **High** | `polarity: progress` → `worth_celebrating`; `audience: 'self'`. ENFORCED. | `reason.rollUpShared` (`ai/reason.js:382`) already produces shared, cross-group beliefs with `shared: true`, surfaced via `_reasonAgendaSafe`. **PARTIAL** — the org read exists but is scoped by people, not by Web, and has no aggregate-safe phrasing path. | Extend projection. No new store. |
| **Low** | `polarity: risk` → `needs_attention`. ENFORCED. | Same as High; additionally `_collapseByCohort` (`ai/reason.js:414`) already says several kinds over the same people once. **PARTIAL.** | Extend projection. No new store. |
| **Inquiry** | `inquiryStates[code]['member:<id>'][concept]`. ENFORCED. | `inquiryStates[code]['group:<nodeId>'][concept]` — the group subject ref already exists (`server.js:12544`), with a Forum thread anchored to it and a `contribution.shouldOpenGroupInquiry` gate. **ENFORCED for a single node.** | Already there. Needs Web-wide (multi-node) reads, not new storage. |
| **Focus** | `mem.focuses` on `userAiProfiles` (`server.js:1265`), durable via `_persistedStores` (`server.js:184`). Created only by approving a prepared suggestion (`server.js:4838`); closed by `/api/me/focus/outcome` (`server.js:4865`). **PARTIAL** — no create endpoint, no origin field. | **Does not exist.** No scope, no subjectRef, no participants, no node anchor. | The only object needing new structure. |

### The minimum Focus extension

Focus is the one object that genuinely needs new fields. Not a new store — `userAiProfiles` is
already persisted and org-partitioned:

```
focus: {
  id, text, type, status, outcome, createdAt, resolvedAt,   // exist today
  origin:   'self' | 'proposed' | 'assigned',               // NEW — who put it there
  scope:    null | '<nodeId>',                              // NEW — null = personal
  subjectRef: 'member:<id>' | 'group:<nodeId>',             // NEW — what it is about
  participantIds: []                                        // NEW — the bridge (§10, §17)
}
```

`origin` is the field the unresolved coach-created-vs-proposed governance decision hangs on
(§17, D-W3). It must be added even though the decision is open, because without it the decision
cannot later be enforced against records created in the meantime.

---

## 5. CURRENT REPOSITORY MAP

What exists today, by layer, with citations. Read this as the baseline any brief must not
re-implement.

### Web scope — `ai/org-graph.js` (125 lines, pure)

| Export | Line | What it does | Status |
|---|---|---|---|
| `buildGraph` | 29 | adjacency from `parentIds`/`parentId`/`childNodeIds`; edges applied both ways; dangling and self edges dropped | ENFORCED |
| `descendants` / `ancestors` | 59-60 | cycle-safe transitive walk, excludes start | ENFORCED |
| `visibleScope` | 66 | leader → node + subtree; member → node + direct parents | ENFORCED (current rule) |
| `scopeOfActor` | 82 | derives leader/member node ids from `leaderIds`/`memberIds` | ENFORCED |
| `visibleNodesFor` | 94 | convenience composition of the two above | ENFORCED |
| `routeTarget` | 102 | BFS up to the nearest leader at or above a node | ENFORCED |
| `canSee` | 118 | null scope = org-wide broadcast, visible to all | ENFORCED |

Ten call sites in `server.js`: `9830` (`canSee`, evidence pool), `9842` (`visibleNodesFor`),
`9850` (`scopeOfActor`, node stamping), `11145` (`routeTarget` + `buildGraph`), `11182`, `11202`,
`11205`, `11669`, `11670` (`_responsibleLeader`), `14126` (`canSee`, notes). Plus indirect use via
`ai/scoped-intelligence-packet.js:20` and `ai/org-routing.js`.

### Continuous reasoning — already running

| Component | Location | Cadence | Notes |
|---|---|---|---|
| `_reasonTick` | `server.js:10761` | on read, throttled by `BRIEFING_TTL` | folds observations into beliefs, calibrates via `ai/confidence`, stands down unreliable kinds |
| `_reasonSweep` | `server.js:10815` | boot + every 30 min (`17599`) | forces a fresh tick per org; per-org isolated, one failure never stops the others |
| `_reasonNudge` | `server.js:10824` | 5 event sites | drops the tick cache only; queues nothing |
| `_deliverySweep` | `server.js:14367` | hourly (`17605`) | outbound digests, gated on content, quiet hours, once a day |
| connection poller | `server.js:17610` | every 20 min | bounded at 25 per tick, round-robin across orgs, honours backoff |
| `_purgeExpired` | — | boot + daily (`17587`) | GDPR storage limitation |

### Deterministic detection already present

- `stateToUncertainties` (`ai/org-state.js:317`) → `missing_required`, `stale`, `contradiction`,
  `unresolved_owner`.
- `inquiry.planInquiries` (`ai/inquiry.js:285`) → value-gated, health-guarded, non-leading,
  deduped, and refuses to ask what it could derive itself.
- `contribution.shouldOpenGroupInquiry` (`ai/contribution.js:194`) → the origin-counting law;
  `MIN_INDEPENDENT_ORIGINS = 2` at line 192, `origins` set at line 203, and the explicit `ECHO`
  verdict for "repetition, not corroboration".
- `reason.reason` (`ai/reason.js:171`) → belief formation, confirmation and refutation along
  polarity axes, staleness at 21 days, dismissal cooldown at 14 days.

### Projection and privacy

- `proactive.toInsight` (`ai/proactive.js:213`), `audienceSafe` (`:291`) — protected-trait
  vocabulary, numeric leak, verbatim quote, basis exposure, unconfirmed action. **One production
  call site: `server.js:4452`.**
- `behaviour.plan` / `opening` (`ai/behaviour.js:69`, `:103`) — grouping, ordering, caps, silence
  as a first-class success state.
- `scopedPacket.buildPacket` (`ai/scoped-intelligence-packet.js:116`), called at
  `server.js:10096` — the one place Web scope and item-level governance are actually composed.

### Persistence and concurrency

`_persistedStores` (`server.js:184`) lists 60-odd stores; `_durableUnits` partitions them as
`store:<name>:<org>` with a `:_` catch-all so no key can silently vanish. Cross-process safety is
the PostgreSQL CAS landed under P0-3. Any new Web-worker state added to `_persistedStores`
inherits all of this for free — that is the strongest argument against a bespoke worker store.

### Governance

`getVisibleUserIds` (`server.js:2777`): superadmin → all; `edit_members` → all; `view_team` →
union of (a) node subtrees led, (a2) descendant nodes of any node belonged to, (b) the legacy
`supervisorId` subtree, (c) members of any led group; everyone else → self only. Three
independent leadership structures unioned, none of them the Web.

---

## 6. CONTINUOUS WEB INTELLIGENCE MODEL

The founder's pipeline, mapped onto what exists and what is missing. **Seven of eleven stages
already have a deterministic owner.**

| # | Stage | Owner today | Status |
|---|---|---|---|
| 1 | Web → admissible evidence/state | `_visibleScopeFor` → `_orgAdmissibleEvidence` (`server.js:9825`) → `_getOrgState` | ENFORCED |
| 2 | Changes since previous reasoning | `_orgEvidenceFingerprint` (`9863`) + `orgMemory.changedSince` (`ai/org-memory.js:406`) | PARTIAL — exists, unused by the sweep |
| 3 | Patterns | `reason.reason` (`ai/reason.js:171`), `intel.detectPatterns` | ENFORCED |
| 4 | Contradictions | `CLAIM.DISPUTED` → `type: 'contradiction'` (`ai/org-state.js:343`) | ENFORCED |
| 5 | Uncertainties | `stateToUncertainties` (`:317`) + `_lifecycleUncertainties` | ENFORCED |
| 6 | Candidate Highs/Lows | belief polarity → `behaviour.plan` buckets | ENFORCED for SELF, PARTIAL for ORG |
| 7 | Candidate/updated Inquiries | `inquiry.planInquiries` (`ai/inquiry.js:285`) | ENFORCED |
| 8 | Focus opportunities | prepared suggestions → `/api/me/prepared/act` (`server.js:4838`) | PARTIAL — self only |
| 9 | Kernel adjudication | `applyProposals`, `contribution.shouldOpenGroupInquiry`, `confidence.shouldSurface` | ENFORCED |
| 10 | Actor-appropriate projection | `scopedPacket.buildPacket` + `behaviour.plan` + `audienceSafe` | PARTIAL — `audienceSafe` at one site |
| 11 | Worker memory / idempotence | caches and cooldowns only | **MISSING** (§10) |

### The logical worker's responsibilities — and its prohibitions

### L-W4 — The worker proposes; it never concludes (proposed)

> The continuous Web worker may **read** admissible state, **compute** candidates, and **write**
> exactly one class of durable record: a *candidate* with a fingerprint, a scope, a surfaced-at
> timestamp and a disposition. It may not write a belief, an evidence envelope, an inquiry
> transition, a Focus, or any confidence value. Those transitions belong to existing kernel
> entry points and, where the constitution requires it, to a person.

This is not a new discipline. `groupCandidates` (`server.js:11464`) was created for precisely
this reason and its header says so: a candidate "is precisely the thing that is NOT evidence:
private to whoever produced it, contributing nothing to any confidence, invisible to everyone
else. Putting it in `inquiryStates` would have made it count for exactly the thing it must not
count for." The Web worker's output is the same kind of object and belongs in the same kind of
place.

---

## 7. EXECUTION MODEL

### Recommendation: **D — a shared incremental engine with per-actor Web projections.** It is already built; formalise it rather than replace it.

Evaluated against the founder's criteria:

| Option | Cost | Determinism | Duplicate work | Web overlap | Verdict |
|---|---|---|---|---|---|
| **A. One logical worker per actor** | O(actors) recomputation of the same org state | high | severe — overlapping Webs recompute identical aggregates | badly handled | **Reject.** Falcon has one org; per-actor workers would recompute the same evidence pool for every leader. |
| **B. One worker per node** | O(nodes) | high | moderate — a parent recomputes its children's work | partially handled | **Reject.** Still duplicates, and the Web is not a partition (multi-parent nodes belong to two workers). |
| **C. Pure event-driven recomputation** | lowest | **fragile** | none | fine | **Reject as sole mechanism.** A missed event is a permanently stale Web with no self-healing. Keep as an accelerator only. |
| **D. Shared engine + per-actor projection** | O(org) once, O(1) per reader | high | none | naturally — projection is a filter over one shared result | **Adopt.** |
| **E. Hybrid** | — | — | — | — | D *is* the hybrid: level-triggered sweep as the floor, edge-triggered nudge as the accelerator. |

### Why D is already the architecture

`_reasonSweep` computes once per org. `_reasonScopedAgenda` filters that one result per reader.
`_getOrgState` derives once and caches per scope signature. Nothing needs inventing; three things
need changing:

1. **The projection filter must consult the Web**, not only `getVisibleUserIds` (§3).
2. **The sweep should skip orgs whose fingerprint has not moved.** Today `_reasonSweep` passes
   `force = true` for every org with any users, every 30 minutes, regardless of change. With
   `_orgEvidenceFingerprint` already computed, a no-change org is a no-op that currently costs a
   full fold.
3. **Cache keys must carry a Web-graph version**, so a membership change invalidates derived
   state. `_getOrgState`'s `scopeSig` accidentally does this for the actor whose membership moved,
   but not for anyone else affected by the same edge.

### L-W5 — One computation, many projections (proposed)

> Web intelligence is computed **once per organisation per change**, never once per actor. An
> actor's Web is a **filter applied at read time**, never a partition the engine iterates. No
> two actors may cause the same aggregate to be derived twice from the same evidence state.

### What "IntelliQ is continuously thinking within my Web" costs

Under D, for the Falcon pilot: one fold per org per change (bounded by the existing 30-minute
floor), plus one filter per read. The founder experience is delivered entirely by the projection
being *already warm* when the person looks — which `_reasonSweep`'s header already states as its
purpose. No per-user process. No per-user LLM agent. No queue infrastructure.

---

## 8. DETERMINISTIC / LLM BOUNDARY

### L-W6 — The proposal/adjudication boundary (proposed, ratifying existing practice)

> A model may **propose**. Only deterministic code may **adjudicate**. No model output may
> become durable organisational state without passing through a deterministic gate that could
> have rejected it, and that gate must be able to reject it for reasons the model did not supply.

### Deterministic ownership — non-negotiable

Each of these is already deterministic in the repository. The law forbids regression, it does not
request work.

| Operation | Owner | Cited |
|---|---|---|
| Web resolution | `ai/org-graph.js` | pure, imports nothing (line 19-20 header) |
| Authorization | `getVisibleUserIds`, `_userHasPerm`, `_actorRole` | `server.js:2777` |
| Privacy filtering | `audienceSafe`, `language-guard`, `ai/privacy.js` | `ai/proactive.js:291` |
| Evidence admissibility | `_kernelEvidence` status gate, `ai/admissibility.js` | `ai/admissibility.js:10-12` |
| Provenance | `originRef` / `originKind`, preserved across contribution | `ai/contribution.js:242` header |
| Independent-origin counting | `shouldOpenGroupInquiry` | `ai/contribution.js:203` |
| Correction / contest state | `supersededBy`, `supersededReason`, `status: 'contested'` | `server.js:10890` |
| Authority vs empirical truth | `claimNature` five-tier precedence (P0-D) | `ai/inquiry.js` |
| Durable state transitions | `applyProposals`, `scheduleSave`, `_durableUnits` CAS | `server.js:184` |
| Dedupe / idempotence | `dedupeKey`, candidate `evidenceRef + nodeId` check | `ai/proactive.js:244`, `server.js:12569` |
| Visibility | `canSee`, `canUseItem` | `ai/org-graph.js:118` |
| Candidate → durable promotion | `contribution.mayContribute` + explicit human act | `ai/contribution.js:121` |

### Where a model may help — and the shape of the permission

| Permitted | Constraint | Existing precedent |
|---|---|---|
| Semantic interpretation of free text | Output is a *proposal* with `requiredApproval: true`; never an evidence envelope | `_assistantProposals` (`server.js:11698`) |
| Hypothesis proposals | Must be expressed as an uncertainty the kernel then values and gates | `planInquiries` rejects below threshold |
| Question generation | Must survive `critique()` and `healthGuard()` deterministically | `ai/inquiry.js:140`, `:172` |
| Summarisation / explanation | May only restyle what it was given | `/api/reason/brief` — "may only restyle what it's given, never add a name, number, cause, or prediction, and any breach falls straight back to the deterministic line" (`server.js:10958`) |
| Ambiguous text classification | Fails to the conservative class, never the permissive one | `claimNature` tier 5 defaults empirical |
| Ranking candidate interpretations | Ranking only; may not add or remove candidates | `priority.stamp` remains deterministic |

### The two hard prohibitions

### L-W7 (proposed)

> A model may never (a) determine who may see something, or (b) count anything the confidence
> layer relies on. Scope, audience, origin counts and corroboration are structural facts, and a
> model asked to judge them will produce a plausible number rather than a true one.

`ai/gateway.js` already enforces a related cost boundary: `_llmBudgetOk` (`server.js:11420`)
degrades to the deterministic path when an org exceeds its budget, "exactly as if the key were
off". The Web worker must inherit that behaviour, not bypass it.

---

## 9. GRAPH EDGE CASES

### 9.1 Multiple structural memberships — **already decided, in the safe direction**

A student who is also a prefect, or a teacher who also coaches football, holds two node
memberships. `scopeOfActor` (`ai/org-graph.js:82`) already collects `leaderNodeIds` and
`memberNodeIds` independently and `visibleScope` unions them. So:

- **Yes, each structural membership creates another Web branch.**
- **Union, not intersection** — a teacher-coach's Web is the teacher branch ∪ the coach branch.
- **The union is over scope, never over content.** This is the important part, and the repository
  already ruled on it. `_noteGroupCandidates` (`server.js:12556`): *"One node at a time: a member
  in two squads produces a candidate per squad, because the remark may concern one and not the
  other, and merging them would decide that for them."*

### L-W8 — Union scope, never union content (proposed, ratifying `server.js:12562`)

> Overlapping Webs union at the **scope** layer and stay separate at the **evidence** layer. A
> signal admissible in branch X does not become admissible in branch Y because one person belongs
> to both. Aggregates are computed per branch and presented per branch; an actor who sees two
> branches sees two readings, not one merged reading.

The failure this prevents: a teacher-coach's Web merging classroom evidence and training-ground
evidence into a single "this student" aggregate, which would make one person's dual role a
privacy bypass that neither role grants on its own.

### 9.2 Matrix organisations and cross-department teams

Already supported structurally: `buildGraph` accepts `parentIds` (plural) and the smoke test
covers a genuine multi-parent node (`trainers` under both `teamA` and `psych`,
`scripts/org-graph-smoke.js:21`). A matrix team is a node with two parents. Under L-W1 its
members see both parents; its leader sees both parents plus the subtree.

**One caution, and it is real.** `routeTarget` (`ai/org-graph.js:102`) returns the *first* leader
found by BFS, which for a two-parent node is order-dependent. `ai/org-routing.js` handles the
same case correctly — `_nearestLeaders` returns *all* divergent leaders and `buildRoutes` marks
`conflict: true` rather than silently picking a winner (`ai/org-routing.js:60`). **Two modules
disagree about multi-parent routing, and the more permissive one is the one in `org-graph`.**
Recorded as gap GW-3.

### 9.3 Temporary project groups

A project group is an ordinary node with a lifetime. Nothing in `buildGraph` reads dates, and
`orgNodes` has no `endsAt`. A disbanded project is deleted or left in place forever; either way
Web membership does not expire. Recorded as gap GW-4. Not a pilot blocker — Falcon's structure is
stable for a term — but it becomes one the first time a school runs a fixed-term intervention
group.

### 9.4 Focus and Inquiry participation bridges

> *Example: a sports physiotherapist participates in a Focus with a football player, across
> branches. Or a cross-department Inquiry spans Finance, Operations and HR.*

Four candidate rules were considered:

| Rule | Effect | Assessment |
|---|---|---|
| Participation **extends** Web scope | The physio's Web gains the player's node | **Reject.** Unrestricted transitive access; one Focus grants a whole branch. |
| Participation creates a **scoped temporary bridge** with node semantics | A pseudo-node joining both | **Reject.** Nodes are the thing governance is computed over; a synthetic node inherits subtree semantics nobody intended. |
| Participation grants access to **that object only** | The physio sees the Focus, its history, its outcome, and nothing else | **Adopt.** |
| Participation is entirely **separate** from Web | The physio cannot collaborate at all | **Reject.** Defeats the founder requirement. |

### L-W9 — Object-scoped participation (proposed)

> Participation in a Focus or an Inquiry grants access to **that object and its own record**, and
> nothing else. It does not add any node to the participant's Web, does not make the other
> participants' other material admissible, and does not survive the object closing. A participant
> is listed on the object; the grant is read from that list and nowhere else.

Consequences that must hold:

- A cross-department Inquiry (Finance + Operations + HR) is **one object with three participants**,
  not three Webs merged. Each participant reads the Inquiry; none gains the others' branch.
- The physiotherapist's contributions to the Focus enter the record through the **same**
  `ai/contribution.js` boundary as everyone else's, carrying their own `originRef`. Cross-branch
  participation is a change of audience, not a change of provenance — the exact rule
  `toGroupProposal` already states (`ai/contribution.js:242` header).
- Because the grant is object-scoped, **an aggregate must not be computed across a bridge.** A
  Web High may not count a bridged participant's node as part of the Web's cohort. Otherwise
  bridges become a route to synthesise cohorts that k-anonymity floors were sized against.

This is also why `participantIds` belongs on the Focus record (§4) rather than being inferred:
inferring participation from message authorship would make reading a thread into a grant.

### 9.5 Responsibility bridges

> *Example: a safeguarding lead has responsibility across multiple branches.*

The repository already has two distinct responsibility mechanisms and they behave differently:

- **`orgMeta.professionals`** (`server.js:11640`) — a directory of `{ userId, title, remit }`,
  re-checked against role on every read *"because directory rows outlive the reasons they were
  written"*. It affects **routing** — who a person is offered — and grants **no** access.
- **`safeguardingLeadId`** (`server.js:11470`) — a named person a crisis flag routes *to*. Again
  routing, not scope.

Both are correct, and both are already the model this section should recommend.

### L-W10 — Responsibility routes, it does not widen (proposed)

> A responsibility makes an actor a valid **target** for material arising anywhere in its remit.
> It does not add any node to their Web, and it does not make anything in that remit readable
> until something is actually routed to them. The safeguarding lead does not browse four branches;
> four branches can reach the safeguarding lead.
>
> Where a responsibility must confer reading access — a Designated Safeguarding Lead reviewing a
> flag — the access is to the **specific routed record**, on the object-scoped rule of L-W9, and
> it is audited (`_audit`, `server.js:9799`) as an accountable access.

This keeps one property that matters more than convenience: **the number of people who can read
any given person's material stays countable, and is a function of structure plus explicit routes,
never of a job title.**

---

## 10. WORKER STATE / IDEMPOTENCE

### The requirement

A continuous engine that recomputes from scratch will re-surface the same insight every tick.
Today the product avoids this by not persisting candidates at all — it recomputes and re-filters
on every read, with cooldowns as the only memory. That works for a read-triggered product. It
does not work for a proactive one, because a proactive surface that forgets what it said becomes
a nag, and `behaviour.js` treats silence as success precisely to avoid that.

### What already exists — check here before proposing a store

| Need | Existing primitive | Location | Sufficient? |
|---|---|---|---|
| Last processed evidence version | `_orgEvidenceFingerprint` | `server.js:9863` | **Yes** — deterministic: active count + newest timestamp + supersede/delete count + config size |
| Change detection between versions | `orgMemory.changedSince`, `momentByFingerprint` | `ai/org-memory.js:406`, `:419` | **Yes**, and currently unused by the sweep |
| Derived-state reuse per Web | `orgStateCache[code][scopeSig]` | `server.js:9951` | **Yes** for reads; not durable across restart |
| Candidate fingerprint | `dedupeKey = subjectId:patternType:audience` | `ai/proactive.js:244` | Partly — no scope component, so two Webs collide |
| Surfaced-at | `insight.surfacedAt` | `ai/proactive.js:275` | **No** — set at render, never persisted |
| Acknowledged / dismissed | `insightSuppression`, `inquiryDismissed`, `reason.applyFeedback` (`acted`/`useful`/`dismissed`/`wrong`) | `server.js:184`, `ai/reason.js:494` | **Yes** for the disposition; keyed by belief/uncertainty, not by Web candidate |
| Cooldown | `DISMISS_COOLDOWN` 14d, `INQUIRY_COOLDOWN` | `ai/reason.js:39` | **Yes** |
| Stale / recovered | `STALE` 21d → belief goes dormant | `ai/reason.js:38` | **Yes** |
| Inquiry already opened | `inquiryStates[code][subjectRef][concept]` | `server.js:11405` | **Yes** — keyed by concept, so idempotent by construction |
| Focus already suggested | none | — | **No** |

**Nine of eleven needs are already met.** The gap is narrow and specific.

### PL-W2 (proposed) — one new durable concept, and only one

> `webCandidates`: `code → [ candidate ]`, added to `_persistedStores`, inheriting org
> partitioning and CAS automatically.
>
> ```
> {
>   id,                  // deterministic: hash(fingerprint)
>   fingerprint,         // hash(scopeNodeId | perspective | patternType | subjectRef | evidenceFingerprint)
>   scopeNodeId,         // the Web node this candidate belongs to — null = org-wide
>   perspective,         // 'self' | 'web'
>   kind,                // 'high' | 'low' | 'inquiry' | 'focus_opportunity'
>   subjectRef,          // 'member:<id>' | 'group:<nodeId>' | null for an aggregate
>   firstSeenAt, lastSeenAt,
>   surfacedAt,          // null until actually delivered to a person
>   surfacedTo,          // [userId] — who has seen it
>   disposition,         // 'open' | 'acted' | 'dismissed' | 'wrong' | 'stale' | 'promoted'
>   promotedRef          // the inquiryId / focusId it became, if any
> }
> ```

Four properties this must satisfy, each of which has a precedent in the repository:

1. **Deterministic id.** The same Web state must produce the same candidate id on every process,
   so a restart or a second instance cannot double-surface. `ai/proactive.js:189` already uses a
   dependency-free stable hash for exactly this reason ("so dedupe and suppression are stable
   across renders without persisting a counter").
2. **Fingerprint includes scope.** Without `scopeNodeId` in the hash, the same pattern in two
   branches collapses into one candidate and one branch silently loses its own signal. This is
   the same failure L-W8 forbids at the evidence layer.
3. **Holds references, never copies.** `groupCandidates` states the rule
   (`server.js:11462`): *"Holds REFERENCES to member evidence, never a copy, so nothing in here
   can leak somebody's words."* A Web candidate that quoted its basis would be a privacy store.
4. **A candidate is not evidence and contributes to no confidence.** It is invisible to origin
   counting. `contribution.js:203` counts `originRef`s, and a candidate has none.

### L-W11 — Prefer a deterministic hash over remembered context (proposed)

> Worker memory is a hash of observed state, never a model's recollection of what it said. If two
> processes with the same evidence disagree about whether something has already been surfaced,
> the worker is wrong regardless of which one is right.

---

## 11. TRIGGERS

### Recommendation: change-driven **plus** a level-triggered floor. Not either alone.

The repository already has both halves and they are correctly separated. `_reasonNudge` invalidates
a cache and queues nothing; `_reasonSweep` recomputes unconditionally on a timer. Keep exactly
this shape and extend it.

| Trigger | Should fire? | Existing hook | Notes |
|---|---|---|---|
| New evidence | **Yes** | `_reasonNudge` at `server.js:14163` | already wired |
| Corrected evidence | **Yes** | `_reasonNudge` at `14173` | already wired |
| Erased evidence | **Yes** | fingerprint's `changed` counter moves (`9866`) | covered without a hook |
| Contribution | **Yes** | `applyProposals` path | needs a nudge; not currently wired |
| New organisational relationship | **Yes** | none | **gap GW-5** — an edge change alters every affected Web and nothing invalidates |
| Web membership change | **Yes** | partially, via `scopeSig` | only for the person who moved |
| New Focus | **Yes** | none | Focus does not participate in reasoning at all today |
| Focus outcome | **Yes** | `_recordNoticeFeedback` (`server.js:4883`) | feeds confidence, does not nudge |
| Inquiry state transition | **Yes** | `inquiryStates` write path | not wired |
| Decision | **Yes** | `orgStateHistory` append (`10335`) | fingerprint moves |
| Scheduled passage of time | **Yes, as a floor only** | 30-min sweep (`17599`) | see below |
| External measurement | **Yes** | connector poller (`17610`) → `_reasonNudge` at `7133` | already wired |
| Startup / recovery | **Yes** | boot sweep (`17598`) | already wired |

### L-W12 — Edge triggers are hints; the level trigger is the guarantee (proposed)

> An event may make reasoning happen **sooner**. Only the periodic pass makes it happen
> **eventually**. No correctness property may depend on an event having been delivered. Any event
> hook that does more than invalidate — that enqueues work, or writes state — is a bug.

This is the Kubernetes controller discipline (§13) and the repository already follows it. Writing
it down protects it from the natural pressure to "just do the work in the handler".

### Are scheduled full scans needed?

**For the pilot, yes, and they are already there.** A 30-minute unconditional sweep over one org
with tens of users is trivial, and it is the only thing that makes a missed hook self-healing. The
worthwhile refinement is not removing it but making it *cheap*: compare
`_orgEvidenceFingerprint` against the last-swept value and skip the fold when it has not moved,
which turns 48 daily full folds per org into a handful. That is a small, independently testable
change and it belongs in the pilot sequence.

---

## 12. NO-LLM CAPABILITY FLOOR

### The switch exists. The floor does not.

`ai/gateway.js:56`: `ENV_NO_LLM = /^(1|true|yes|on)$/i.test(String(process.env.IQ_DETERMINISTIC_ONLY || ''))`,
with `deterministicOnly()` and `setDeterministicOnly()` at lines 58-60, and the env form
deliberately unable to be re-enabled at runtime. `scripts/no-egress-smoke.js` proves the switch
mechanics — including that `setDeterministicOnly(false)` cannot override the env form (assertion 5,
verified in a child process). Two suites already run under it: `scripts/forum-smoke.js:15` and
`scripts/group-subject-smoke.js:19`.

**What does not exist is any test asserting that the product still works with the switch on.**

### The false-green, stated precisely

`scripts/pilot-loop-smoke.js` §10 claims to be that test. It is not:

```js
ok('10 · the whole loop above ran with no model call', typeof gateway.deterministicOnly === 'function');
ok('10 · …and the kernel modules import no gateway at all',
  !Object.keys(require.cache).some(k => /ai[/\\]gateway\.js$/.test(k) && false));
```

The first assertion tests that a function is a function. The second contains `&& false`, so the
inner predicate is unconditionally false, `.some()` is unconditionally false, and the negation is
unconditionally true. **Both assertions are green by construction and would remain green if every
module in the loop called a model on every line.** The file's own header makes the strongest
architectural claim in the product — *"if they hold with the reasoning model absent then
IntelliQ's organisational kernel is real rather than model cleverness"* — and §10 is the only part
purporting to verify it.

This is not a cosmetic defect. It is the single assertion standing behind the harness claim.

### PL-W3 (proposed) — the Web intelligence no-LLM floor

> With `IQ_DETERMINISTIC_ONLY=1` and no API key configured, continuous Web intelligence must
> still, provably:
>
> | # | Capability | Deterministic owner today |
> |---|---|---|
> | 1 | Resolve any actor's Web | `ai/org-graph.js` — pure |
> | 2 | Compute the admissible evidence set for that Web | `_orgAdmissibleEvidence` (`server.js:9825`) |
> | 3 | Detect that the Web's state has changed since the last pass | `_orgEvidenceFingerprint` (`9863`) |
> | 4 | Recognise High and Low conditions | belief polarity → `behaviour.plan` |
> | 5 | Detect contradictions and unknowns | `stateToUncertainties` (`ai/org-state.js:317`) |
> | 6 | Produce or update Inquiry candidates | `inquiry.planInquiries` (`ai/inquiry.js:285`) |
> | 7 | Refuse to open a group Inquiry on an echo | `shouldOpenGroupInquiry` → `ECHO` (`ai/contribution.js:203`) |
> | 8 | Report Focus and outcome changes | `mem.focuses` + `_recordNoticeFeedback` |
> | 9 | Emit a structured, actor-specific, audience-safe packet | `scopedPacket.buildPacket` + `audienceSafe` |
> | 10 | Return calm silence when nothing qualifies | `behaviour.plan` empty states (`ai/behaviour.js:36-47`) |
>
> The test must **fail** if a model is reached. Two mechanisms, both required, because either
> alone can be satisfied trivially: (a) set `IQ_DETERMINISTIC_ONLY=1` and no key, and (b) stub
> `gateway.complete` to `throw`, so a call is a hard failure rather than a silent fallback.

Item 10 matters as much as items 1-9. A no-LLM mode that produces noise instead of silence has
not degraded gracefully; it has degraded into a different product.

**The LLM improves the output. It does not constitute the existence of the output.** Every row
above already has a deterministic owner — the floor is a test to write, not a capability to build.

---

## 13. EXTERNAL ARCHITECTURE LESSONS

Only lessons that change a decision here. For each: the problem it solves, the IntelliQ
equivalent, whether IntelliQ has it, and the recommendation.

### Kubernetes controller reconciliation — **adopt the concept; it is already the design**

- **Problem:** distributed state converges reliably despite lost events.
- **Principle:** level-triggered reconciliation. The controller compares observed to desired and
  acts idempotently; events are hints that make reconciliation *sooner*, never the mechanism that
  makes it *happen*.
- **IntelliQ equivalent:** `_reasonSweep` (level) + `_reasonNudge` (edge hint that only
  invalidates).
- **Has it?** **Yes, and correctly.** `_reasonNudge` schedules no work — a discipline most
  hand-rolled systems get wrong on the first try.
- **Recommendation:** **adopt the concept explicitly as L-W12.** No technology. The one refinement
  worth taking is *generation tracking*: skip the fold when the fingerprint has not moved (§11).

### Google Zanzibar / SpiceDB — **adopt one concept, reject the technology**

- **Problem:** authorization decisions over a large relationship graph, consistent and fast.
- **Principles worth taking:** (a) authorization is a *graph traversal over relationship tuples*,
  not a permission bit on a row; (b) **zookies** — a consistency token so a read is never
  evaluated against a mix of two graph versions.
- **IntelliQ equivalent:** (a) is exactly `orgNodes` edges + `canSee`. (b) is
  `_getOrgState`'s cache key, which already includes an evidence fingerprint and a scope
  signature.
- **Has it?** (a) yes. (b) **partially** — the key covers evidence and the reader's own scope, but
  **not a version of the graph itself**. Move an edge and every other actor's cached derivation is
  stale with nothing to detect it. That is gap GW-5, and Zanzibar is precisely the literature that
  names it.
- **Recommendation:** **adopt the zookie concept** — add a graph version to the cache key. **Reject
  the technology.** A school pilot with one org and tens of nodes does not need a distributed
  authorization service, and introducing one would move the Web law out of a 125-line pure module
  that a person can read in full.

### OPA / Cedar — **adopt one concept, reject the technology**

- **Problem:** policy decisions decoupled from application code, with auditable decision logs.
- **Principle:** every allow/deny is a **logged decision with a reason**, not a silent branch.
- **IntelliQ equivalent:** `orgPolicies`, `policyResult: { effect, reason }` on proposals
  (`server.js:11708`), and `_audit(code, { actor, action, subjectIds, basis })` (`server.js:9799`),
  already called for `agenda_view`.
- **Has it?** **Partially.** Proposals carry a reason; Web reads mostly do not. `canSee` returns a
  boolean with no reason, so a filtered-out item is indistinguishable from an absent one — the
  same silent-shrink problem `ai/admissibility.js:33` already identified at the signal layer and
  fixed there with `partition()`.
- **Recommendation:** **adopt the concept** — give the Web filter a `partition()`-shaped return
  (`{ visible, excluded: [{ id, reason }] }`) so a Web read can say *"three groups, one outside
  your Web"* instead of quietly reporting two. **Reject the technology**; a policy engine for a
  five-rule graph is inversion of cost. Note that the internal precedent (`admissibility.partition`)
  is a better model to copy than OPA itself.

### Palantir Foundry Ontology — **adopt the concept; already implemented**

- **Problem:** analytics that can actually change the operational world, without analysts writing
  directly to systems of record.
- **Principle:** objects and links are read freely; **all writes go through typed Actions** with
  their own authorization and audit. Derived views never write.
- **IntelliQ equivalent:** the proposal → confirm → execute pipeline; `applyProposals` as the
  single kernel entry; `requiresConfirmation: true` on every suggestion; `ai/behaviour.js` and
  `ai/scoped-intelligence-packet.js` structurally unable to write.
- **Has it?** **Yes — this is the closest structural match found in the audit.** `behaviour.js`
  enforces it by importing nothing (`ai/behaviour.js:15-23`).
- **Recommendation:** **adopt the concept as the naming discipline for the Web worker.** The
  worker is a derived view. L-W4 is the Ontology action rule applied to it.

### Glean — enterprise graph with per-person relevance — **adopt the concept; validates option D**

- **Problem:** one enterprise index, but every person's results ranked and filtered by their own
  position and permissions.
- **Principle:** compute the corpus once; personalise at query time. Never build a per-person index.
- **IntelliQ equivalent:** `_reasonSweep` (once) + `_reasonScopedAgenda` / `buildPacket` (per
  reader).
- **Has it?** **Yes.**
- **Recommendation:** **adopt the concept as the argument against options A and B.** No technology.
  The transferable warning: Glean's hard problem is permission *freshness* — a stale ACL surfaces a
  document to someone who lost access. IntelliQ's analogue is a stale Web after an edge move, which
  is again GW-5. Two independent literatures point at the same gap.

### Temporal / durable execution — **reject for the pilot**

- **Problem:** long-running workflows survive process death with exactly-once semantics.
- **IntelliQ equivalent:** none needed. Reasoning is *idempotent recomputation from durable state*,
  not a workflow with steps to resume. There is no partial-progress state worth checkpointing —
  that is a consequence of L-W5, not an accident.
- **Recommendation:** **neither concept nor technology, for the pilot.** Revisit only if Web
  reasoning ever becomes long-running or multi-step in a way a fold cannot express. The nearest
  real risk — two instances writing during a Render deploy overlap — is already solved by the
  PostgreSQL CAS landed under P0-3, which is the right-sized answer.

### The one lesson worth stating alone

Three independent systems — Zanzibar, Glean, and Kubernetes — converge on the same warning:
**the graph changing is the event most systems forget to invalidate on.** IntelliQ invalidates on
evidence changing (five hooks) and does not invalidate on structure changing (zero hooks). That
convergence is why GW-5 is ranked above the other gaps in §14.

---

## 14. TESTS / LAWS REQUIRED

### Founder-ratified in this brief

| Id | Law |
|---|---|
| **FW-1** | The Web is a fundamental reasoning primitive, not a permission list. |
| **FW-2** | A node reasons across itself, one organisational level above it, and everything structurally beneath it. |
| **FW-3** | Web scope, governance, kernel reasoning and projection are four distinct concepts and must not be collapsed. |
| **FW-4** | High, Low, Inquiry and Focus each support a SELF and an ORG/Web perspective, and are not self-help-only objects. |
| **FW-5** | Continuous Web intelligence must exist, and must not become an unconstrained LLM agent. |
| **FW-6** | Model output must not automatically become organisational truth. |
| **FW-7** | Responsibility and participation must not be equated with unrestricted raw-data access. |

### Reviewer-proposed laws (require founder ratification)

| Id | Law | §|
|---|---|---|
| L-W1 | The structural Web definition, including the leader-gains-direct-parents amendment | 2 |
| L-W2 | The Web is reasoning territory, never an access grant | 2 |
| L-W3 | Ordered composition: Web → governance → kernel → projection; narrowing only | 3 |
| L-W4 | The worker proposes; it never concludes | 6 |
| L-W5 | One computation per org per change, many projections | 7 |
| L-W6 | The proposal/adjudication boundary | 8 |
| L-W7 | A model may never decide scope or count corroboration | 8 |
| L-W8 | Overlapping Webs union at scope, stay separate at evidence | 9 |
| L-W9 | Object-scoped participation; bridges grant the object, not the branch | 9 |
| L-W10 | Responsibility routes, it does not widen | 9 |
| L-W11 | Deterministic hash over remembered context | 10 |
| L-W12 | Edge triggers are hints; the level trigger is the guarantee | 11 |
| PL-W1 | Separate `perspective` from `audience` | 4 |
| PL-W2 | One new durable concept: `webCandidates` | 10 |
| PL-W3 | The Web intelligence no-LLM capability floor | 12 |

### Executable invariants to write

Ordered by what each would catch. **T-W1, T-W6 and T-W9 fail today** and are the ones worth
writing first.

| Id | Invariant | Where | Fails today? |
|---|---|---|---|
| **T-W1** | A leader's Web includes its node's direct parents; a member's does not include grandparents; sibling isolation survives both | `scripts/org-graph-smoke.js` — amends assertion at line 33 | **Yes** (by design; this is the L-W1 amendment) |
| **T-W2** | Adding a direct parent to a leader's scope adds no sibling branch | same | passes; must not regress |
| **T-W3** | `getVisibleUserIds` and `visibleNodesFor` never disagree about whether an actor may see a person | new cross-check suite | **Yes** — rule 3(a2) vs the member rule (§3) |
| **T-W4** | A person in two nodes produces two candidates, never one merged candidate | extends `group-subject-smoke.js` | passes (`server.js:12562`); must not regress |
| **T-W5** | Focus/Inquiry participation grants the object and adds no node to `Web(participant)` | new | n/a — feature not built |
| **T-W6** | A responsibility (`orgMeta.professionals`, `safeguardingLeadId`) adds no node to any Web | new | **Yes** — untested, though currently true |
| **T-W7** | The same Web state produces an identical candidate id across two fresh processes | new | n/a |
| **T-W8** | A candidate's fingerprint changes when `scopeNodeId` changes, all else equal | new | n/a |
| **T-W9** | The §12 capability floor, with `gateway.complete` stubbed to throw | replaces `pilot-loop-smoke.js` §10 | **Yes** — current §10 is green by construction |
| **T-W10** | A graph edge change invalidates derived state for every affected actor, not only the one who moved | new | **Yes** — GW-5 |
| **T-W11** | A `perspective: 'web'` item carries no `subjectId` | new | n/a |
| **T-W12** | An aggregate is never computed across a participation bridge | new | n/a |
| **T-W13** | `/api/intelligence/roster` and `/briefing` pass `audienceSafe` | new | **Yes** — carried forward from the leadership audit |

### Gap register (continues G1-G12 from the constitution)

| Id | Gap | Severity |
|---|---|---|
| **GW-1** | The Web governs 10 call sites; `getVisibleUserIds` governs 48. The two disagree about a member's downward visibility. | High |
| **GW-2** | `visibleScope`'s leader branch omits direct parents — FW-2 not implemented. | High |
| **GW-3** | `org-graph.routeTarget` picks the first leader on a multi-parent node; `org-routing._nearestLeaders` correctly reports a conflict. Two modules, one question, different answers. | Medium |
| **GW-4** | Nodes have no lifetime; temporary project groups never expire from a Web. | Low (pilot), High (post-pilot) |
| **GW-5** | No trigger invalidates derived state on an org-structure change. Named independently by Zanzibar, Glean and Kubernetes. | High |
| **GW-6** | `pilot-loop-smoke.js` §10 — the sole assertion behind the harness claim — is green by construction. | High |
| **GW-7** | `audienceSafe` has one production call site; roster and briefing bypass it. | High (carried) |
| **GW-8** | `audienceSafe` cannot express an aggregate-safe leader message; `SCORE_RE` rejects any percentage. ORG Highs of the founder's example form are currently unrenderable. | Medium |
| **GW-9** | Focus has no `origin`, `scope`, `subjectRef` or `participantIds`. | Medium |
| **GW-10** | Web filtering returns a boolean with no reason; a filtered read silently shrinks. | Low |

---

## 15. PILOT MINIMUM — what Falcon actually requires

Falcon is one organisation with a stable term-length structure, tens of users, one dyno, and a
deploy overlap window. That rules out most of the infrastructure above.

**Required for the pilot, in dependency order:**

1. **GW-7 — the leader privacy migration.** Strip `topLabel`/`status` from `/api/intelligence/roster`;
   route `/api/intelligence/briefing` through `audienceSafe`. Already the top of the constitution's
   §10 sequence. It is the only item where shipped code does something the product laws forbid.
2. **GW-6 — a real no-LLM floor test.** Replace `pilot-loop-smoke.js` §10 with T-W9. Until this
   exists, "deterministic harness" is a claim rather than a fact, and it is the claim the whole
   product identity rests on.
3. **GW-2 — the L-W1 leader amendment.** One loop body in `ai/org-graph.js`, plus the amended
   assertion in `org-graph-smoke.js`. Falcon has a Director of Sport above coaches; FW-2 is the
   rule the founder demonstrated with that exact example.
4. **GW-1 — reconcile the two scope mechanisms**, at minimum by proving where they disagree (T-W3)
   and closing the member-sees-descendants divergence at `server.js:2810-2814`. Full unification is not
   pilot work; a documented, tested boundary is.
5. **GW-9 — the four Focus fields**, plus `POST /api/me/focus`. Fields must land before the pilot
   creates records, because retrofitting `origin` onto existing Focus rows means guessing.
6. **The fingerprint skip in `_reasonSweep`** (§11). Small, self-contained, and it is what makes
   "continuously thinking" affordable rather than merely true.

**Explicitly not required for the pilot:** `webCandidates` as a durable store. Falcon can run on
recompute-and-filter, exactly as the product does today, because a 30-minute cadence over one org
does not need surfaced-at memory to avoid nagging — `insightSuppression` and the 14-day dismissal
cooldown already cover it. Introduce PL-W2 when a second organisation or a shorter cadence makes
re-surfacing observable.

---

## 16. POST-PILOT INFRASTRUCTURE

| Item | Why it can wait |
|---|---|
| `webCandidates` durable store (PL-W2) | Recompute-and-filter is sufficient at Falcon's scale and cadence. |
| Node lifetimes (GW-4) | Falcon's structure is stable for a term. It becomes urgent with the first fixed-term intervention group. |
| Graph-version cache key (GW-5) | Real, and named by three literatures — but at one org with an occasional structural edit, the 30-minute sweep bounds the staleness to 30 minutes. Do it before the second org. |
| Full unification of `getVisibleUserIds` into the Web (GW-1) | 48 call sites is a migration, not a change. Prove the boundary first; unify with evidence. |
| Aggregate-safe projection (GW-8) | Only blocks ORG Highs phrased with a number. Directional phrasing works today. |
| Multi-parent routing reconciliation (GW-3) | Only bites in a genuine matrix. Falcon is a tree with occasional dual roles. |
| Reason-carrying Web filter (GW-10) | A quality-of-explanation improvement, not a correctness one. |
| Any external authorization technology | Rejected outright for the pilot (§13); revisit only above tens of organisations. |

---

## 17. FOUNDER DECISIONS

Only genuine unresolved choices. Everything else in this document is either repository truth or a
recommendation with a stated default.

### D-W1 — Ratify the L-W1 leader amendment, knowing it changes a passing test

`scripts/org-graph-smoke.js:33` currently asserts that a team lead does **not** see `root`. FW-2
requires that they do. This is a law change, and the constitution forbids making tests green by
changing assertions — so it needs an explicit ratification that this assertion is being *amended
because the law changed*, not *edited because it failed*.

**Recommendation: ratify.** The founder stated FW-2 as the structural starting rule and
demonstrated it with the Director of Sport example. Sibling isolation, the property the test was
really protecting, is unaffected.

### D-W2 — Does a leader's new upward visibility include the parent node's *own* scoped material?

Under L-W1, `coachA` gains node `root`. Evidence stamped `nodeScope: 'root'` becomes admissible to
them. In practice this is material the CEO or Director scoped to the top level, because
`_primaryNodeScope` (`server.js:9847`) stamps a person's evidence to *their own* led node — so
`teamB`'s leader's material stays in `teamB` and does not leak sideways through the shared parent.

**Recommendation: yes, include it.** That is the substance of "reasons across one level above";
without it the amendment adds a node id and no intelligence. The leak surface is bounded by node
stamping, and the founder's example — the coach reasoning with the Director's context — is exactly
this material.

### D-W3 — Coach-created vs proposed personal Focus (**carried forward, still open**)

Recorded as unresolved in the reconciliation audit and deliberately not decided here. The brief
instructs preserving it, and this adjudication does.

What this document adds: the `origin: 'self' | 'proposed' | 'assigned'` field must be **added now,
before the pilot creates Focus records**, even though the decision is open. Without it, whichever
way the decision goes, it cannot be enforced against records created in the meantime — and
back-filling `origin` onto existing rows means guessing at intent that was never recorded.

### D-W4 — May a Web worker create a group Inquiry without a human?

`shouldOpenGroupInquiry` already has three deterministic opening rules
(`ai/contribution.js:213-223`): `LEADER_OPENED`, `AUTHORITATIVE_SOURCE`, `INDEPENDENT_CORROBORATION`.
Two of the three do not require a person in the loop. So the kernel *already* has authority to open
a group Inquiry on corroborated evidence — the question is whether the continuous worker may
*exercise* it unprompted, or must always surface it as a candidate for a leader to open.

**Recommendation: for the pilot, propose only.** The worker computes the verdict and surfaces
"this meets the corroboration bar — open it?"; a leader opens it. Reason: opening an Inquiry
about a group is visible to that group, and the first time IntelliQ does that unprompted at Falcon
should be a decision someone made. The kernel authority stays exactly as it is; only the worker's
licence to act on it is withheld. Revisit with pilot evidence on how often leaders agree with the
verdict — if agreement is near-total, the human step is ceremony.

This is a genuine choice, not a formality: D-W4 is the line between a curious system and an
autonomous one, and it is the one place in this document where machine authority would expand.

---

## 18. CODEX IMPLEMENTATION SEQUENCE

Small, ordered, independently reviewable. Each task states its own done condition. No task depends
on a later one. Tasks 1-3 are pure test-and-narrow-change work and can be reviewed in an hour each.

| # | Task | Scope | Done when | Depends on |
|---|---|---|---|---|
| **W-1** | **Leader privacy migration** (GW-7) | `server.js:4250`, `4150` | T-W13 written **first** and failing; then `topLabel`/`status` removed from roster, briefing routed through `audienceSafe`; T-W13 green | — |
| **W-2** | **No-LLM capability floor** (GW-6) | `scripts/pilot-loop-smoke.js` §10 → new `scripts/no-llm-floor-smoke.js`, registered in `scripts/test.js` | T-W9 green with `IQ_DETERMINISTIC_ONLY=1`, no key, **and** `gateway.complete` stubbed to throw; all ten §12 capabilities asserted; deleting the stub does not change the result | — |
| **W-3** | **L-W1 leader amendment** (GW-2) | `ai/org-graph.js:68-72` (one loop), `scripts/org-graph-smoke.js` | T-W1 and T-W2 green; the amended assertion carries a comment naming D-W1 as the ratifying decision | D-W1 |
| **W-4** | **Scope-mechanism divergence proof** (GW-1) | new `scripts/scope-parity-smoke.js` | T-W3 enumerates every disagreement between `getVisibleUserIds` and `visibleNodesFor` over a fixture org and asserts the intended set exactly — **a failing list is an acceptable deliverable if it is complete and named** | W-3 |
| **W-5** | **Close the member-descendants divergence** | `server.js:2810-2814` | The `view_team` rule 3(a2) either matches the Web member rule or is documented as a deliberate governance widening with a test asserting the difference; T-W3 green | W-4 |
| **W-6** | **Focus fields + create endpoint** (GW-9) | `server.js:1265`, `4838`; new `POST /api/me/focus` | `origin`, `scope`, `subjectRef`, `participantIds` present on every new Focus; existing records read safely with the fields absent; T-W5 written against `participantIds` | D-W3 (field only, not the decision) |
| **W-7** | **Responsibility non-widening test** (T-W6) | new assertions | Adding a `professionals` entry or a `safeguardingLeadId` changes no actor's `visibleNodesFor` output | W-3 |
| **W-8** | **Fingerprint skip in the sweep** | `server.js:10815` | `_reasonSweep` records the last-swept fingerprint per org and skips the fold when unchanged; a test proves a no-change tick performs no fold and a changed tick does | — |
| **W-9** | **`perspective` field** (PL-W1) | `ai/proactive.js`, `ai/intelligence-feed.js` | `perspective` set independently of `audience`; T-W11 green (a `web` item has no `subjectId`); `audienceSafe` unchanged | PL-W1 ratified |
| **W-10** | **Graph-version cache key** (GW-5) | `server.js:9951` | An edge change invalidates derived state for every affected actor; T-W10 green | W-4 |

**Not in this sequence, deliberately:** `webCandidates` (post-pilot, §15), multi-parent routing
reconciliation (GW-3), node lifetimes (GW-4), aggregate-safe projection (GW-8), and any unification
of the 48 `getVisibleUserIds` sites. Each is real; none is Falcon's blocker.

### One instruction that applies to every task above

Write the test before the change, and confirm it fails for the reason you expect. Three of the
gaps in this document — GW-6 most sharply — exist because an assertion was written to pass rather
than to arbitrate. A test that has never failed has proved nothing.
