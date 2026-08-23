# W-3 / W-4 implementation contract

**Status:** implementation brief. Architecture is settled here; Codex implements decisions, it does
not make them.
**Subordinate to:** `docs/ttd/intelliq-ttd-v1.md` → `docs/ttd/intelliq-constitution.md` →
`docs/ttd/web-semantics-and-continuous-intelligence.md`.
**Written against:** `981cae7`. Every line number below was read at that commit.
**Not in scope:** PR #74 corrections (separate brief), P0-5, P0-6, Focus redesign, Forum revival.

Everything in this document that says a test passes, fails, or changes was **executed**, not
reasoned about. Where an earlier document guessed and was wrong, the correction is marked.

---

## 0. Two corrections to the Web adjudication

`docs/ttd/web-semantics-and-continuous-intelligence.md` §1 and §14 contain two claims about W-3
that were derived by reading rather than running. Both are wrong, and both change the work.

### Correction 1 — `scripts/org-graph-smoke.js` needs no amendment

The adjudication said assertion `:33` ("a team lead does NOT see a sibling branch") asserts the old
law positively and must be amended as a founder law change (recorded as decision D-W1).

**It does not.** I applied the W-3 change and ran the suite: **18 passed, 0 failed.**

The reason is the property W-3 was designed around. `visibleScope` adds the *parent node id* and
never re-expands downward from it, so a leader gains their parent without gaining the parent's other
children. Every assertion in that file is an `includes` / `!includes` on a specific node, and none
of them flips. `coachA` gains `root`; `teamB` stays excluded.

**D-W1 is therefore not a live founder decision for this file.** It remains live only for the file
below.

### Correction 2 — the test that *does* change is elsewhere, and there is exactly one

Full `npm test` under the W-3 patch: **one suite regresses, one assertion inside it.**

`scripts/scoped-intelligence-packet-smoke.js:47`

```js
ok('least leader only sees their immediate led branch below',
   packet.buildPacket({ actor: { userId: 'salesALead' }, nodes, feed: normalized })
     .visibleNodes.join(',') === 'salesA');
```

This is a strict equality on the whole scope set, and it encodes the old law in its name: *"only
sees their immediate led branch **below**"*. Under W-3 `salesALead` sees `sales,salesA`.

---

## 1. The exact scope delta, measured

Fixture from `scripts/scoped-intelligence-packet-smoke.js:20-26` (root → sales/ops → salesA/salesB/opsA).
Both columns produced by running `visibleScope` against that fixture.

| Actor | Leads | OLD LAW | NEW LAW (W-3) | Delta |
|---|---|---|---|---|
| `ceo` | root | `ops,opsA,root,sales,salesA,salesB` | unchanged | none — root has no parent |
| `salesLead` | sales | `sales,salesA,salesB` | `root,sales,salesA,salesB` | **+root** |
| `opsLead` | ops | `ops,opsA` | `ops,opsA,root` | **+root** |
| `salesALead` | salesA | `salesA` | `sales,salesA` | **+sales** |
| `salesBLead` | salesB | `salesB` | `sales,salesB` | **+sales** |
| `maya` | — (member salesA) | `sales,salesA` | unchanged | none |
| `niko` | — (member salesB) | `sales,salesB` | unchanged | none |
| `omar` | — (member opsA) | `ops,opsA` | unchanged | none |

Three properties, all confirmed by measurement rather than argument:

1. **Members are entirely unaffected.** They already received direct parents.
2. **Leaders gain exactly their direct parent(s), nothing else.**
3. **No sibling leakage.** `salesALead` gains `sales` and not `salesB`. `opsLead` gains `root` and
   not `sales`, `salesA` or `salesB`. This is the safety property the founder law depends on, and it
   holds because the parent is added as an id, never as a traversal root.

---

## 2. W-3 — THE IMPLEMENTATION CONTRACT

### 2.1 The law

> **L-W1 (ratified).** For an actor A in organisation O with node graph G:
>
> ```
> Web(A) = ⋃ over each node N that A LEADS   { N } ∪ descendants(G,N) ∪ directParents(G,N)
>        ∪ ⋃ over each node N that A is a MEMBER of  { N } ∪ directParents(G,N)
> ```
>
> `directParents` is one level and never transitive. `descendants` is the transitive closure
> downward, cycle-safe. Adding a parent adds **that node only** — it never re-expands downward from
> the parent.

### 2.2 The production change — one loop body

`ai/org-graph.js:68-72`. The leader branch gains the line the member branch already has at `:76`.

```js
  for (const n of leaderNodeIds) {
    if (!graph.byId.has(n)) continue;
    seen.add(n);
    for (const d of descendants(graph, n)) seen.add(d);
    for (const p of (graph.parentsOf.get(n) || [])) seen.add(p);   // W-3: one level up
  }
```

That is the entire graph change. **Do not use `ancestors()`.** It is exported at
`ai/org-graph.js:60`, is transitive, and is consumed nowhere in production. W-3 is one level, not
the ancestor chain. Wiring `ancestors` in would silently grant a squad coach the whole school.

### 2.3 The second production change — and it is not optional

`ai/scoped-intelligence-packet.js:41` derives the actor's role by set-size equality:

```js
const role = declared.leaderNodeIds.length
  ? (visibleNodes.length === g.byId.size && g.byId.size > 0 ? 'top_leader' : 'leader')
  : 'member';
```

**Measured regression.** Two-tier org (`school` → `squad`), which is Falcon's actual shape:

| Actor | OLD LAW | NEW LAW (W-3) if role is untouched |
|---|---|---|
| `head` (leads school) | `top_leader`, `["school","squad"]` | `top_leader` — correct |
| `coach` (leads squad) | `leader`, `["squad"]` | **`top_leader`**, `["school","squad"]` — **wrong** |

Under W-3 the coach's scope becomes the whole node set, so size-equality promotes every node leader
in a shallow organisation to `top_leader`. `role` is returned to the client by
`/api/intelligence/packet` (`server.js:10105`).

**Required change — derive the role structurally, not by cardinality:**

```js
const leadsARootNode = declared.leaderNodeIds.some(
  n => g.byId.has(n) && (g.parentsOf.get(n) || new Set()).size === 0);
const role = declared.leaderNodeIds.length ? (leadsARootNode ? 'top_leader' : 'leader') : 'member';
```

A top leader is one who leads a node with no parent. That definition is stable under W-3, correct in
a one-node org, and correct in a multi-root org.

### 2.4 Behaviour that must NOT change

| Case | Required behaviour | Already true? |
|---|---|---|
| Multi-parent node | Both parents added; both directions honoured by `buildGraph` (`:39-43`) | yes |
| Cycles | `_walk` (`:48`) is `seen`-guarded; must not hang | yes |
| Dangling / self edges | Dropped by `addEdge` (`:36`) | yes |
| Unknown node in `leaderNodeIds` | Skipped by the `byId.has` guard | yes |
| Org with no nodes | Empty scope, so `canSee(…, null)` stays org-wide | yes |
| Determinism | `uniqSort` output | yes |
| **Tenant isolation** | `orgNodes[code]` is the only input; a graph never spans orgs | yes — structural |
| Purity | `ai/org-graph.js` imports nothing | must remain true |

### 2.5 The one test whose expectation changes

`scripts/scoped-intelligence-packet-smoke.js:47`. Change the expected value **and** record why, in
the file, so the next reader does not mistake a ratified law change for a weakened test:

```js
/* OLD LAW: a least leader saw only their own branch downward ('salesA').
   NEW RATIFIED LAW (W-3 / founder law FW-2): a node reasons over itself, ONE level above,
   and everything beneath. salesALead therefore also sees its direct parent 'sales'.
   WHY THIS EXPECTATION CHANGES: the founder ratified upward reasoning scope; this is a law
   amendment, not a relaxed assertion. Sibling isolation is unchanged and is asserted below. */
ok('least leader sees their own branch plus one level above',
   packet.buildPacket({ actor: { userId: 'salesALead' }, nodes, feed: normalized })
     .visibleNodes.join(',') === 'sales,salesA');
```

`'sales,salesA'` is the measured value, sorted by `uniqSort`.

### 2.6 New executable invariants — write these BEFORE the change

Add to `scripts/org-graph-smoke.js` (it needs no amendment, only additions):

| Id | Invariant | Expected at HEAD |
|---|---|---|
| T-W3.1 | A leader's scope includes each direct parent of every led node | **FAILS** |
| T-W3.2 | A leader's scope excludes the parent's other children (no sibling leak) | passes; must not regress |
| T-W3.3 | A leader's scope excludes grandparents (one level only) | **FAILS** — needs a 3-deep fixture |
| T-W3.4 | A member's scope is byte-identical before and after W-3 | passes; must not regress |
| T-W3.5 | A leader of a multi-parent node gains **both** parents, neither subtree | **FAILS** |
| T-W3.6 | A leader of a root node gains nothing (no parent to add) | passes |
| T-W3.7 | `role === 'top_leader'` iff the actor leads a parentless node — asserted on a two-tier org | **FAILS** (see §2.3) |
| T-W3.8 | A cycle in the parent chain terminates and yields a finite scope | passes |

T-W3.3 needs a fixture deeper than the current one: `root → mid → leaf`. The leader of `leaf` must
see `leaf, mid` and **not** `root`.

### 2.7 Stop conditions

Stop and report rather than proceeding if any of these is true:

- Any suite other than `scoped-intelligence-packet-smoke` regresses. Baseline is `npm test` green
  plus `pilot-loop-smoke` at 28/1.
- `visibleScope` needs more than the one added line.
- The role fix changes `canUseItem` behaviour for any existing assertion.
- You find yourself wanting `ancestors()`.

### 2.8 Completion criterion

`npm test` green; `org-graph-smoke` green including T-W3.1–T-W3.8;
`scoped-intelligence-packet-smoke` green with the amended assertion carrying its OLD/NEW LAW
comment; `pilot-loop-smoke` unchanged at 28/1.

---

## 3. W-4 — COMPLETE SCOPE CALL-SITE AUDIT

**71 scope call sites** exist across `server.js`, mapped mechanically to their enclosing endpoint or
function. Four are not real call sites (two comments at `:2910` and `:13583`, the definition at
`:2777`, an unrelated name match at `:2682`), leaving **67 live sites**.

### 3.1 The classification that prevents the dangerous mistake

The brief's central warning — *"make it impossible for Codex to accidentally convert an object bridge
into Web membership"* — is handled by classifying every site into one of five kinds **before** any
migration. The kinds are not interchangeable and only one of them is Web scope.

| Kind | Question it answers | Correct authority | Migrate to Web? |
|---|---|---|---|
| **GATE** | May this actor access this *named person*? | governance (`getVisibleUserIds`) | **No** — narrow by Web, never widen |
| **ENUMERATE** | Which people form this actor's cohort? | Web ∩ governance | **Yes** |
| **FILTER** | Which of these derived items may this actor receive? | Web ∩ governance | **Yes** |
| **WEB** | Which organisational territory is relevant? | `orgGraph` | already correct |
| **BRIDGE** | Is this actor a participant in this object? | object membership (`_inNode` / `_leadsNode`) | **NEVER** |

### 3.2 BRIDGE — five sites. Do not touch these.

These read node membership **directly** to answer "are you part of this specific group's
deliberation". They are object participation, not organisational visibility. Converting them to Web
scope would grant every ancestor leader posting rights in every descendant's Forum thread.

| FILE:LINE | Function / endpoint | Semantics | Migration |
|---|---|---|---|
| `server.js:12626` | `GET /api/group/:nodeId/candidates` | member-or-leader of *this* node | **NONE — bridge** |
| `server.js:12654` | `POST /api/group/:nodeId/contribute` | leads *this* node | **NONE — bridge** |
| `server.js:12658` | `POST /api/group/:nodeId/contribute` | in *this* node | **NONE — bridge** |
| `server.js:12731` | `GET /api/group/:nodeId/inquiry` | member-or-leader of *this* node | **NONE — bridge** |
| `server.js:12802` | `_forumAccess` | `{inNode, leadsNode}` for `forum.mayRead/mayPost` | **NONE — bridge** |

> **Law B-1 (proposed).** `_inNode` and `_leadsNode` express **object participation**. They must
> never be replaced by, widened to, or derived from `Web(A)`. A future Focus/Inquiry participant
> check belongs in this class, not in the Web class.

### 3.3 WEB — eleven sites. Already correct.

| FILE:LINE | Function | Call | Semantics |
|---|---|---|---|
| `server.js:9830` | `_orgAdmissibleEvidence` | `canSee` | filters the evidence pool by node scope |
| `server.js:9842` | `_visibleScopeFor` | `visibleNodesFor` | the Web itself |
| `server.js:9850` | `_primaryNodeScope` | `scopeOfActor` | stamps authored evidence with its node |
| `server.js:11145` | `_orgAskRouteLeader` | `routeTarget` + `buildGraph` | routing |
| `server.js:11182` | `_routingItems` | `scopeOfActor` | routing |
| `server.js:11202` | `GET /api/org/routing` | `buildGraph` | routing |
| `server.js:11205` | `GET /api/org/routing` | `scopeOfActor` | routing |
| `server.js:11669` | `_responsibleLeader` | `buildGraph` | responsibility routing |
| `server.js:11670` | `_responsibleLeader` | `scopeOfActor` | responsibility routing |
| `server.js:14126` | `_noteVisibleTo` | `canSee` | note visibility |
| `server.js:14236` | `_actorLevel` | `scopeOfActor` | leader-vs-member level |

Plus indirect use through `ai/scoped-intelligence-packet.js:20` (called at `server.js:10096`) and
`ai/org-routing.js`.

**W-3 changes the behaviour of every one of these**, because they all consume `visibleScope`. That
is intended: it is how a coach begins to receive the Director's context. Each must be re-tested, not
re-written.

### 3.4 GATE — twenty sites. Narrow only; never widen.

Every one of these answers "may this actor touch this named person" and returns 403 (or a boolean)
on failure. Web scope may make them **stricter**. It must never make them looser, and none of them
should be replaced by a Web check alone, because Web is node-level and these are person-level.

| FILE:LINE | Endpoint / function | Gated subject |
|---|---|---|
| `server.js:3389` | `POST /api/intelligence/prepare` | `memberId` |
| `server.js:3441` | `POST /api/intelligence/deliver` | `memberId` |
| `server.js:4302` | `POST /api/intelligence/act` | `memberId` |
| `server.js:4503` | `GET /api/proactive/insights/leader/:subjectId` | `subjectId` |
| `server.js:4950` | `POST /api/observe` | `subjectId` |
| `server.js:5758` | `POST /api/assessments/:id/ask` | `assigneeId` |
| `server.js:6001` | `POST /api/assessments/:id/return` | `assigneeId` |
| `server.js:6033` | `GET /api/assessments/:memberId/presentation` | `memberId` |
| `server.js:6049` | `POST /api/assessments/:id/summarize` | `assigneeId` |
| `server.js:6814` | `POST /api/evidence/:id/resolve` | `subjectId` |
| `server.js:7554` | `POST /api/actions/propose` | `subjectId` |
| `server.js:8486` | `GET /api/checkin/:memberId/intelligence` | `memberId` |
| `server.js:11928` | `_resolveLeaderSubject` | requested subject |
| `server.js:14538` | `GET /api/report/person/:userId` | `targetId` |
| `server.js:15256` | `GET /api/platform/member-results` | `target` |
| `server.js:15401` | `GET /api/member/goals` | `targetId` |
| `server.js:16597` | `GET /api/intelliq/member-timeline` | `targetId` |
| `server.js:16845` | `GET /api/member/:memberId/profile` | `memberId` |
| `server.js:16878` | `GET /api/member/:memberId/similar` | `memberId` |
| `server.js:17129` | `GET /api/signals` | `subjectId` |

> **Law B-2 (proposed).** A GATE composes as `governance AND Web`, never `governance OR Web` and
> never `Web` alone. W-3 widens Web upward; a gate that consulted Web alone would hand a coach
> access to the Director's personal record the day W-3 lands.

### 3.5 ENUMERATE — nineteen sites. These are the migration.

These build the cohort an actor reasons over. Today they are person-derived and Web-blind. This is
where "one coherent scope authority" actually means something.

| FILE:LINE | Endpoint / function | Privacy consequence | Relevance consequence | Priority |
|---|---|---|---|---|
| `server.js:4165` | `GET /api/intelligence/briefing` | **high** — the leader surface | high | **P1** |
| `server.js:4264` | `GET /api/intelligence/roster` | **high** — names | high | **P1** |
| `server.js:3704` | `GET /api/workspace/briefing` | high | high | **P1** |
| `server.js:3521` | `GET /api/workspace/group-health` | high | high | P2 |
| `server.js:3597` | `GET /api/workspace/my-tree` | medium | high | P2 |
| `server.js:2845` | `GET /api/workspace/visible-members` | medium | high | P2 |
| `server.js:2932` | `GET /api/workspace/team-insights` | high | high | P2 |
| `server.js:3026` | `GET /api/intelligence/watch` | high | medium | P2 |
| `server.js:3063` | `GET /api/intelligence/success` | medium | medium | P2 |
| `server.js:3300` | `GET /api/intelligence/discoveries` | low — a count | medium | P3 |
| `server.js:3437` | `POST /api/intelligence/deliver` | high — delivery targets | high | P2 |
| `server.js:4014` | `_promptCandidates` | medium | high | P2 |
| `server.js:4564` | `POST /api/signals/import-csv` | medium | low | P3 |
| `server.js:5451` | `_gatherPlanningContext` | medium | high | P3 |
| `server.js:13588` | `GET /api/org/divisions` | medium | high | P2 |
| `server.js:15283` | `GET /api/platform/org-results` | high | medium | P2 |
| `server.js:15665` | `GET /api/platform/org-checkins` | high | medium | P2 |
| `server.js:17075` | `GET /api/advisor/:memberId/threads` | high | low | P2 |
| `server.js:17250` | `POST /api/signals/import` | medium | low | P3 |

### 3.6 FILTER — ten sites.

These scope an already-derived result. Same target semantics as ENUMERATE; lower blast radius
because the derivation already happened under governance.

| FILE:LINE | Function | Notes |
|---|---|---|
| `server.js:3102` | `_assessmentOutcomes` | feeds `_promptCandidates` |
| `server.js:3221` | `_orgDiscoveries` | **already cohort-shaped** — see §4 |
| `server.js:5277` | `_importTeamTable` | ingest-time |
| `server.js:5677` | `POST /api/assessments/assign` | assign-time range check |
| `server.js:9596` | `_assistantAnswer` | grounded answer scoping |
| `server.js:10008` | `_pendingInquiries` | inquiry surfacing |
| `server.js:10866` | `_reasonCanSeeBelief` | belief visibility |
| `server.js:10880` | `_reasonScopedAgenda` | **the reasoner projection** — highest value |
| `server.js:17099` | `POST /api/signals/ingest` | ingest-time |
| `server.js:17152` | `GET /api/signals/recent` | read scoping |

### 3.7 The divergence that must be resolved first

`getVisibleUserIds` rule 3(a2) (`server.js:2810-2814`):

```js
// (a2) Hierarchy leadership — for any node this user belongs to, see the
// people in its DESCENDANT nodes (the tiers below), but not their own peers.
getUserNodeIds(orgCode, requestingUserId).forEach(nid =>
  getDescendantNodeIds(orgCode, nid).forEach(d => { if (d !== nid) addPeople(d); }));
```

> **CORRECTED at Stage 1 (`docs/ttd/founder-decision-reduction.md` §4).** The paragraph below
> originally read *"a plain member of a node sees the people in all descendant nodes"*. **That is
> false.** `server.js:1781` sets `view_team: false` for the `member` role, and 3(a2) sits inside
> `if (_userHasPerm(…, 'view_team'))`, so it **never fires for a plain member**.

The real divergence is narrower and sharper. 3(a2) keys on `getUserNodeIds` (`:2654`), which returns
nodes where the user is a member **or** a leader. So for any `view_team` holder — superadmin, admin,
coach, or a member-role node leader via `LEADER_GRANTS` (`:2591`) — it grants the people under
**every node they merely belong to**, including nodes they do not lead.

Concrete leak: a coach who leads `Soccer` and is also a *member* of `Sport` receives every person
under `Sport`, including `Rugby`. That is lateral person-level access across a sibling branch, which
branch isolation forbids. And the code contradicts its own comment — it says "hierarchy
**leadership**" and keys on **membership**, while rule (a) already handles leadership correctly.

**W-4 must not begin until this is settled**, because every ENUMERATE migration inherits whichever
answer is chosen. It is a founder decision (D-W5, §6).

### 3.8 W-4 deliverable — a parity harness, not a rewrite

The first W-4 task produces **no behaviour change**. It produces a test that enumerates disagreement.

`scripts/scope-parity-smoke.js`:

1. Build a fixture org with three tiers, a multi-parent node, a member with `view_team`, a member
   without, a leader, and a superadmin.
2. For every actor, compute `getVisibleUserIds(code, actor)` and the person-set implied by
   `visibleNodesFor(nodes, actor)`.
3. Assert the difference equals an **explicitly enumerated expected list**, with a one-line reason
   for each entry.

A failing list is an acceptable deliverable **provided it is complete and each entry is named**. The
point is to make the divergence a tracked artifact rather than a discovery made during migration.

---

## 4. What already exists and must not be rebuilt

Read this before writing anything. Four capabilities the briefs above depend on are already in
production, and three of them are not documented anywhere else.

### 4.1 The three-tier disclosure floor — already implemented, never written down

The repository already answers "what magnitude may be disclosed at what cohort size", in three
places, with three principled thresholds:

| Threshold | Value | Location | Governs |
|---|---|---|---|
| `MIN_COHORT` | **2** | `server.js:16932` | a cohort may be *referred to* at all |
| `MIN_SAMPLE` | **2** | `server.js:16934` | an outcome tally may be shown as *guidance* |
| `MIN_SEG` | **4** | `server.js:3240` | a **rate / percentage** may be published |
| (confidence tier) | **12** | `server.js:3250` | a claim may rise above `tentative` |

`_orgDiscoveries` (`server.js:3240-3250`) is the model implementation and should be the template for
every future Web magnitude statement. It publishes a percentage only at n≥4, requires a **≥20-point
material difference** before reporting a comparison at all, tiers confidence at n≥12, and phrases the
result as a cohort statement with a count-based basis and no person in it.

**Consequence for the Web work:** the founder's target sentence *"Focus X appears associated with
improvement across 40% of the relevant people"* is a **rate**, so it needs `MIN_SEG` semantics
(n≥4), not `MIN_COHORT` (n≥2). No new threshold is required and no founder decision is needed for
the common cases.

### 4.2 Deterministic group-Inquiry creation already exists

`_admitGroupContributions` (`server.js:12588-12606`) is fully model-free:

```
contribution.shouldOpenGroupInquiry(pending)   // origin counting, ECHO rule
  → contribution.toGroupProposal(c)            // origin preserved intact
  → diagnose.applyProposals(inq, proposals)
  → inquiryStates[code][subjectRef][key] = after
```

`scripts/group-subject-smoke.js` already runs this with `IQ_DETERMINISTIC_ONLY = '1'` (`:19`).

**This is the correct place to prove a no-LLM Inquiry capability.** Not the personal intake path —
see §4.3.

### 4.3 Personal Inquiry creation is model-REQUIRED, and this is the honest finding

`_intakeTurn` (`server.js:9175`) opens with:

```js
if (!IQ_COMPOSER || !ai.enabled() || !_llmBudgetOk(code)) { … return; }
```

and reaches `inquiryStates[…] = after` at `:9351` only via `ai.completeJSON` proposals at `:9187`.

With models disabled, **no personal Inquiry is created or updated from free text.** Any no-LLM claim
covering "Inquiry" must say *group* Inquiry, or say "maintained, not discovered".

### 4.4 Graph mutation choke point

> **CORRECTED at Stage 9 (`docs/briefs/web-final-contract.md` §2.1): there are TWO paths, not one.**
> `_removePerson` (`server.js:1903`) strips `node.memberIds`/`node.leaderIds` at `:1932-1933`, calls
> neither `_commitTreeMutation` nor `_backfillUserNodeIds`, and invalidates nothing across 167 lines.
> Because `rosterCache` holds names and is TTL-only at 2h, an erased person's name is still served
> from every leader's cached roster for up to two hours.


`_commitTreeMutation` (`server.js:2450`) is the sole commit path for tree changes. It calls
`_backfillUserNodeIds()` and invalidates **no reasoning cache**. That makes the invalidation fix
(§5) a single-function change rather than an audit.

---

## 5. GRAPH INVALIDATION CONTRACT

### 5.1 The measured gap

`_orgEvidenceFingerprint` (`server.js:9863`) is composed of:

```
activeEvidenceCount : newestTimestamp : changedCount : ctxLen:ctxInactive : configJsonLength
```

It contains **nothing derived from `orgNodes`**. Cache inventory:

| Cache | Key | Invalidated by evidence? | Invalidated by graph change? |
|---|---|---|---|
| `orgStateCache[code][scopeSig]` | evidence fingerprint + scope signature | **yes** | only for the actor who moved |
| `reasonTickCache[code]` | TTL + `_reasonNudge` (5 sites) | **yes** | **no** |
| `intelBriefingCache[code:userId]` | TTL only (2 h) | manual, 2 sites | **no** |
| `rosterCache[code:userId]` | TTL only (2 h) | **no** | **no** |

`BRIEFING_TTL = 2 * 60 * 60 * 1000` (`server.js:3632`). So moving a person between teams leaves a
**stale roster and a stale briefing for up to two hours**, computed under the old Web.

### 5.2 The law

> **L-W13 (proposed).** Any mutation of organisational structure — node create, delete, re-parent,
> membership change, leadership change — invalidates every derived projection whose scope could have
> changed, for **every affected actor**, not only the actor who moved. No stale Web projection may
> outlive its graph beyond the consistency boundary.
>
> **Consistency boundary: the next read.** Not eventual, not TTL-bounded.

### 5.3 The implementation

Add a graph fingerprint and fold it into the cache identity:

```js
function _orgGraphFingerprint(code) {
  const ns = Object.values(orgNodes[code] || {})
    .map(n => `${n.nodeId}>${[...(Array.isArray(n.parentIds) ? n.parentIds
              : (n.parentId ? [n.parentId] : []))].sort().join('+')}`
              + `|L:${[...(n.leaderIds || [])].sort().join(',')}`
              + `|M:${[...(n.memberIds || [])].sort().join(',')}`)
    .sort();
  return `${ns.length}:${_hashString(ns.join(';'))}`;
}
```

Then, in `_commitTreeMutation` (`server.js:2450`) after `_backfillUserNodeIds()`, clear every
per-actor cache for that org:

```js
Object.keys(rosterCache).forEach(k => { if (k.startsWith(code + ':')) delete rosterCache[k]; });
Object.keys(intelBriefingCache).forEach(k => { if (k.startsWith(code + ':')) delete intelBriefingCache[k]; });
delete orgStateCache[code];
_reasonNudge(code);
```

Fold `_orgGraphFingerprint(code)` into `_getOrgState`'s key at `server.js:9951` as belt-and-braces,
so a mutation that bypasses the choke point still cannot serve a stale derivation.

**Do not** hash node *content* beyond ids, parents, leaders and members. Names and descriptions do
not change who may reason over what, and including them would invalidate on every rename.

### 5.4 Tests

| Id | Invariant |
|---|---|
| T-GI.1 | Re-parenting a node changes `_orgGraphFingerprint` |
| T-GI.2 | Renaming a node does **not** change it |
| T-GI.3 | After a membership change, the **next** roster read for an unrelated leader in the same org reflects the new graph |
| T-GI.4 | After a re-parent, a briefing cached under the old graph is not served |
| T-GI.5 | Adding a member to node X invalidates the projection for the leader of X's **parent**, who never appeared in the mutation payload |

T-GI.5 is the one that matters. It is the case a per-actor invalidation would miss.

---

## 6. FOUNDER DECISIONS REQUIRED BEFORE W-4

Only genuine unresolved choices. Everything else above is settled.

### D-W5 — May a plain member see people in descendant nodes? **BLOCKS W-4.**

`getVisibleUserIds` rule 3(a2) says yes (gated on `view_team`); `orgGraph`'s member rule says no.
One must yield.

- **Option A — Web wins.** A member sees self + node + direct parents. Tighter, matches L-W1,
  breaks any org relying on 3(a2) for a deputy-style role.
- **Option B — governance wins, documented.** Keep 3(a2) as a deliberate *permission-gated*
  widening distinct from Web scope, and assert the difference in `scope-parity-smoke`.
- **Recommendation: B for the pilot.** `view_team` is an explicit grant, not an accident of
  structure, and Falcon may well have deputies. But it must be named as governance, not mistaken
  for Web, and the parity test must pin it.

### D-W6 — Does a leader's new upward scope include the parent node's own evidence? **BLOCKS W-3 sign-off.**

Under W-3 a coach gains node `root`. Evidence stamped `nodeScope: 'root'` becomes admissible to them.
In practice `_primaryNodeScope` (`server.js:9847`) stamps a person's evidence to their **own** led
node, so a sibling branch leader's material stays in their branch and does not cross through the
shared parent.

**Recommendation: yes.** Without it W-3 adds a node id and no intelligence, and the Director's
context reaching the coach is the entire point of FW-2. The leak surface is bounded by node stamping.
*(This restates D-W2 from the adjudication; it is unchanged and still open.)*

### D-W7 — Is `top_leader` a structural role or a coverage role?

§2.3 recommends structural (leads a parentless node). The alternative — "sees every node" — is what
the code does today and it breaks under W-3. Confirm the structural definition so the fix is not
mistaken for a behaviour change.

---

## 7. IMPLEMENTATION QUEUE

Ordering is derived from dependencies, not from the numbering. Two things force the order: PR #74's
corrections touch the same briefing surface W-4 migrates, and D-W5 gates every ENUMERATE migration.

| # | Task | Depends on | Non-goals | Completion criterion |
|---|---|---|---|---|
| **1** | **PR #74 corrections** (6 items, separate brief) | — | W-3, W-4, Focus | PR #74 review re-run returns APPROVE |
| **2** | **W-3 graph law** — `visibleScope` + role derivation + 8 invariants + the one amended assertion | D-W6, D-W7 | any call-site migration | §2.8 |
| **3** | **Graph invalidation** — fingerprint + `_commitTreeMutation` + T-GI.1–5 | W-3 | distributed consistency, zookies | T-GI.5 green |
| **4** | **W-4 parity harness** — `scope-parity-smoke.js`, no behaviour change | W-3, D-W5 | migrating anything | complete enumerated divergence list |
| **5** | **W-4 P1 migration** — briefing, roster, workspace briefing (3 ENUMERATE sites) | 4 | the other 16 sites | parity harness green on those three |
| **6** | **Focus origin + participants fields** (no behaviour) | — | Focus redesign, D-W3 | fields present, existing records read safely |
| **7** | **P0-5′ relocation** — origin preservation at the Focus/Inquiry contribution boundary | 6 | Forum UI revival | echo does not become an independent origin |
| **8** | **W-4 P2 migration** — 10 further ENUMERATE + FILTER sites | 5 | GATE sites | parity harness green |
| **9** | **Continuous Web reasoning** — fingerprint skip in `_reasonSweep`, graph-aware nudge | 3 | `webCandidates` store | no-change tick performs no fold |

Tasks 2, 3, 4 and 6 are independent of PR #74 and could run in parallel with its correction if two
sessions are available. Tasks 5 and 8 must not.

### Per-task non-goals worth stating explicitly

- **W-3 must not touch any call site.** It changes what `visibleScope` returns; every consumer
  inherits that. Migrating consumers in the same change makes the blast radius unmeasurable.
- **W-4 must not touch GATE sites.** Twenty of them. They compose as AND; leave them.
- **Neither W-3 nor W-4 may touch `_inNode` / `_leadsNode`.** Five bridge sites, listed in §3.2.
- **Nothing here creates a durable High or Low store.**

---

## 8. TESTS THAT SHOULD EXIST BEFORE ANY CODE IS WRITTEN

Ordered by which would have caught a real defect found in this pass.

| Id | Test | Would have caught | Fails today? |
|---|---|---|---|
| T-W3.7 | `top_leader` iff leading a parentless node, on a two-tier org | the role regression in §2.3 | **yes** |
| T-GI.5 | Membership change invalidates the *parent leader's* projection | the two-hour stale roster | **yes** |
| T-W3.1 | Leader scope includes direct parents | W-3 itself | **yes** |
| T-W3.3 | Leader scope excludes grandparents | an `ancestors()` mis-wiring | **yes** |
| T-W3.5 | Multi-parent leader gains both parents, neither subtree | a partial W-3 | **yes** |
| T-W4.1 | `scope-parity-smoke` enumerates every divergence | the 3(a2) contradiction | **yes** |
| T-W3.2 | No sibling leak after W-3 | the feared W-3 failure that does not occur | no — must not regress |
| T-W3.4 | Member scope byte-identical after W-3 | scope creep | no — must not regress |
| T-B.1 | A Focus/Inquiry participant gains no node in `Web(A)` | bridge→membership conversion | n/a — not built |
| T-B.2 | A responsibility entry adds no node to any Web | responsibility→visibility creep | **yes** — untested, currently true |

---

## 9. WHAT THIS BRIEF DELIBERATELY DOES NOT DECIDE

- Whether `getVisibleUserIds` is eventually deleted. 67 sites is a migration, not a change; the
  parity harness must run for a while first.
- The `webCandidates` durable store. Post-pilot; recompute-and-filter is sufficient at Falcon scale.
- Focus origin vocabulary. Fields yes, names no — that is D-W3 and it stays open.
- Any external authorization technology. Rejected for the pilot in the adjudication §13 and
  unchanged.
