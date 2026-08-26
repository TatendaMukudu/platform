# Web workstream — final contract (W-3, graph invalidation, W-4 parity)

**Status:** CURRENT implementation brief. **Nothing implemented. No executable test modified.**
**Stages 8, 9 and 10** of the final pre-implementation hardening program. Preceded by `d8a0cc9`.
**Written against:** `d8a0cc9`.
**Supersedes** `docs/briefs/w3-w4-implementation-contract.md` §4.4 and §5 on the choke-point claim —
see §2.1.

---

## PART 1 — W-3 FINAL CONTRACT (Stage 8)

### 1.1 · The law, with D-W6 resolved

> **L-W1 (ratified).**
> `Web(A) = ⋃ over each node N that A LEADS { N } ∪ descendants(N) ∪ directParents(N)`
> `        ∪ ⋃ over each node N that A is a MEMBER of { N } ∪ directParents(N)`

**D-W6 — what does gaining the parent grant?** Resolved by ratified direction (Stage 1 §3). The four
readings must not be conflated, and the answer differs for each:

| Reading | Granted | Mechanism |
|---|---|---|
| **A · node identity** | **YES** | the id enters `visibleNodes` |
| **B · aggregate parent intelligence** | **YES** | R1 — "reasons across" one level above |
| **C · parent node-scoped evidence** | **YES** | `canSee(scope, parentId)` admits evidence stamped to that node |
| **C′ · parent private / person-level evidence** | **NO** | R2; `_kernelEvidence:7773` excludes private from org purposes regardless of scope |
| **D · parent member identities** | **NO** | R4; `getVisibleUserIds` is a separate layer and W-3 does not touch it |

**The one-line change delivers exactly A+B+C and cannot deliver C′ or D**, because it adds an id to a
set consumed only by `canSee`, which governs node-scoped evidence. `_primaryNodeScope`
(`server.js:9847`) stamps a person's evidence to *their own* led node, so a sibling leader's material
never enters the shared parent.

**This must be asserted, not assumed** — see W3-9 and W3-10 below.

### 1.2 · Production change — two edits, both required

**Edit 1** — `ai/org-graph.js:68-72`, the leader branch gains the line the member branch has at `:76`:

```js
for (const n of leaderNodeIds) {
  if (!graph.byId.has(n)) continue;
  seen.add(n);
  for (const d of descendants(graph, n)) seen.add(d);
  for (const p of (graph.parentsOf.get(n) || [])) seen.add(p);   // W-3: ONE level up
}
```

**Do not use `ancestors()`** (`:60`). It is transitive, consumed nowhere, and wiring it in would grant
a squad coach the whole school.

**Edit 2** — `ai/scoped-intelligence-packet.js:41`, **D-W7 resolved as structural**:

```js
const leadsARootNode = declared.leaderNodeIds.some(
  n => g.byId.has(n) && (g.parentsOf.get(n) || new Set()).size === 0);
const role = declared.leaderNodeIds.length ? (leadsARootNode ? 'top_leader' : 'leader') : 'member';
```

Measured: without Edit 2, a two-tier org — Falcon's shape — promotes **every** node leader to
`top_leader`.

### 1.3 · RED tests — write before either edit

`scripts/org-graph-smoke.js` needs **no amendment** (measured: 18/18 pass under the patch). These are
**additions**. A three-deep fixture `root → mid → leaf` is required for W3-3.

| Id | Invariant | Fails today? |
|---|---|---|
| **W3-1** | a leader's scope includes each direct parent of every led node | **YES** |
| **W3-2** | a leader's scope excludes the parent's other children — no sibling leak | passes; must not regress |
| **W3-3** | a leader's scope excludes **grandparents** — one level only | **YES** (needs the 3-deep fixture) |
| **W3-4** | a member's scope is byte-identical before and after | passes; must not regress |
| **W3-5** | a multi-parent leader gains **both** parents, **neither** parent's subtree | **YES** |
| **W3-6** | a root leader gains nothing | passes |
| **W3-7** | `role === 'top_leader'` **iff** the actor leads a parentless node, on a **two-tier** org | **YES** |
| **W3-8** | a cycle terminates with a finite scope | passes |
| **W3-9** | **D-W6 negative:** gaining the parent adds **no person** to `getVisibleUserIds` | **untested** |
| **W3-10** | **D-W6 negative:** gaining the parent admits **no private** evidence | **untested** |
| **W3-11** | a responsibility entry (`orgMeta.professionals`, `safeguardingLeadId`) adds no node to any Web | **untested**, currently true |
| **W3-12** | tenant: a node id from another org is never in any Web | passes structurally; assert it |

**W3-9 and W3-10 are the ones that make D-W6 safe rather than merely decided.** Without them, a later
change that routes person visibility through `visibleScope` would silently deliver reading D.

### 1.4 · The one expectation that changes

`scripts/scoped-intelligence-packet-smoke.js:47` — `=== 'salesA'` becomes `=== 'sales,salesA'`, with
the OLD LAW / NEW RATIFIED LAW / WHY comment already drafted in the superseded brief §2.5. It is the
**only** assertion in the registry that changes.

### 1.5 · Adversarial: the naive W-3 fix

> *"Add the parent, then recompute descendants so the leader sees the parent's subtree too."*

This is the mistake the law exists to prevent, and it would pass W3-1 and W3-3. **W3-2 and W3-5 are
the assertions that catch it** — which is why W3-5 specifies "neither parent's subtree" explicitly
rather than just "both parents".

---

## PART 2 — GRAPH INVALIDATION CONTRACT (Stage 9)

### 2.1 · CORRECTION: `_commitTreeMutation` is NOT the single choke point

`docs/briefs/w3-w4-implementation-contract.md` §4.4 and `docs/ttd/deterministic-web-intelligence.md`
state that `_commitTreeMutation` (`server.js:2450`) is the sole commit path for tree changes. **False.**

Audited at `d8a0cc9`. **Two** paths mutate node membership:

| Path | Endpoints | Calls `_commitTreeMutation`? | Calls `_backfillUserNodeIds`? |
|---|---|---|---|
| `/api/tree/node` POST (`:2501`), PUT (`:2544`), DELETE (`:2574`) | 3 | **yes** | yes, inside the commit |
| **`_removePerson` (`:1903`)** — called from `:2077` and the legacy delete endpoint (`:2090`) | 2 | **NO** | **NO** |

`_removePerson:1932-1933`:

```js
Object.values(nodes).forEach(node => {
  if (node.memberIds) node.memberIds = node.memberIds.filter(id => id !== userId);
  if (node.leaderIds) node.leaderIds = node.leaderIds.filter(id => id !== userId);
});
```

Across its full 167 lines (`:1903-2070`) it invalidates **nothing**: not `rosterCache`, not
`intelBriefingCache`, not `orgStateCache`, not `reasonTickCache`, and it does not call `_reasonNudge`.

### 2.2 · The consequence, and it is worse than staleness

Step 8 of `_removePerson` is headed *"Hard-delete ALL of this person's data (GDPR Art 17 — right to
erasure). Must leave NO orphaned personal data anywhere."*

But `rosterCache[code:viewerId]` holds `{id, name, role}` rows and is **TTL-only at
`BRIEFING_TTL = 2h`** (`server.js:3632`), never invalidated by anything. So:

> **After a person is erased, their name is still served from every leader's cached roster for up to
> two hours.**

**Severity: pre-pilot, and it is the strongest single argument for the invalidation work.** It is not
merely a stale-projection bug; it is an erasure path that does not erase.

### 2.3 · The law

> **L-W13 (proposed).** Any mutation of organisational structure — node create, delete, re-parent,
> membership change, leadership change, **or person removal** — invalidates every derived projection
> whose scope could have changed, for **every affected actor**, not only the actor who moved.
> **Consistency boundary: the next read.**

### 2.4 · Implementation

**One shared helper, called from both paths.**

```js
function _invalidateOrgProjections(code) {
  for (const k of Object.keys(rosterCache))        if (k.startsWith(code + ':')) delete rosterCache[k];
  for (const k of Object.keys(intelBriefingCache)) if (k.startsWith(code + ':')) delete intelBriefingCache[k];
  delete orgStateCache[code];
  _reasonNudge(code);
}
```

Called from `_commitTreeMutation` (after `_backfillUserNodeIds`) **and** from `_removePerson`
(which must also call `_backfillUserNodeIds`).

**Plus a graph fingerprint**, folded into `_getOrgState`'s key (`server.js:9951`) as belt-and-braces
so a mutation that bypasses both paths still cannot serve a stale derivation:

```js
function _orgGraphFingerprint(code) {
  const ns = Object.values(orgNodes[code] || {}).map(n =>
    `${n.nodeId}>${[...(Array.isArray(n.parentIds) ? n.parentIds : (n.parentId ? [n.parentId] : []))].sort().join('+')}`
    + `|L:${[...(n.leaderIds || [])].sort().join(',')}`
    + `|M:${[...(n.memberIds || [])].sort().join(',')}`).sort();
  return `${ns.length}:${_hashString(ns.join(';'))}`;
}
```

**Hash ids, parents, leaders and members only.** Names and descriptions do not change who may reason
over what, and including them would invalidate on every rename.

### 2.5 · RED tests

| Id | Case | Assert | Fails today? |
|---|---|---|---|
| **GI-1** | re-parent a node | fingerprint changes | n/a — new |
| **GI-2** | rename a node | fingerprint **unchanged** | n/a |
| **GI-3** | **move a member** | the next roster read for a **different** leader reflects it | **YES** |
| **GI-4** | re-parent | a briefing cached under the old graph is not served | **YES** |
| **GI-5** | add a member to node X | the projection for the leader of **X's parent** is invalidated | **YES** |
| **GI-6** | **remove a person** | their name is absent from every viewer's roster on the **next** read | **YES — the erasure defect** |
| **GI-7** | change a leader | the former leader's Web shrinks on the next read | **YES** |
| **GI-8** | multi-parent change | both affected branches invalidate | **YES** |
| **GI-9** | delete then recreate a node with the same id | treated as new; no stale projection survives | **YES** |
| **GI-10** | cross-tenant mutation attempt | refused; **no** other org's cache is touched | untested |

**GI-5 and GI-6 are the two that matter.** GI-5 is the case a per-actor invalidation misses. GI-6 is
the erasure defect.

### 2.6 · Adversarial: the naive invalidation fix

> *"Invalidate the cache for the user who moved."*

Passes GI-3 and fails GI-5, because the person who moved is not the person whose projection went
stale. **The invalidation must be org-wide**, which at Falcon's scale costs nothing — the caches are
per-`code:userId` and an org has tens of entries.

**No model is required for any of this.**

---

## PART 3 — W-4 PARITY HARNESS (Stage 10)

### 3.1 · The classification stands, with one correction

71 scope call sites: **BRIDGE 5 · GATE 20 · ENUMERATE 19 · FILTER 10 · WEB 11**, plus 4 non-sites
(two comments, the definition, one name collision) and 2 additional `_inNode`/`_leadsNode` definition
lines.

**Correction (Stage 1):** the D-W5 divergence is **not** "plain members see descendants". `member`
role has `view_team: false` (`:1781`), so 3(a2) never fires for them. The real divergence is that any
`view_team` holder sees people under **every node they merely belong to**, including sibling
branches.

### 3.2 · The harness — no behaviour change

`scripts/scope-parity-smoke.js`. **Ships before any migration and changes nothing.**

**Fixture:** three tiers, one multi-parent node, and six actors — a root leader, a mid leader, a leaf
leader, a `view_team` holder who is a *member* of a mid node (the divergence case), a plain member,
and a superadmin.

**For every actor, compute and compare:**

```
A = getVisibleUserIds(code, actor)                          // governance, person-level
B = peopleIn(orgGraph.visibleNodesFor(nodes, actor))        // Web, node-level → people
```

**Output, one row per actor per divergence:**

| Column | Content |
|---|---|
| CALL SITE | the endpoint or function |
| CURRENT SCOPE SOURCE | `getVisibleUserIds` \| `orgGraph` \| `_inNode` |
| INTENDED SCOPE SOURCE | after W-3 |
| CURRENT DIFFERENCE | `A \ B` and `B \ A`, enumerated by user id |
| EXPECTED DIFFERENCE AFTER W-3 | the intended set |
| MIGRATE? | yes / no / never |
| WHY | one line |
| TEST | the assertion id |

**A failing list is an acceptable deliverable provided it is complete and every entry is named.**

### 3.3 · Per-class migration rules

| Class | Rule | Sites |
|---|---|---|
| **BRIDGE** | **NEVER migrate.** Object participation, not organisational visibility. Converting them would grant every ancestor leader posting rights in every descendant's Forum thread | 5 — `:12626`, `:12654`, `:12658`, `:12731`, `:12802` |
| **GATE** | compose as `governance AND Web`, **never** `OR`, never Web alone. W-3 widens Web upward; a gate consulting Web alone would hand a coach the Director's personal record | 20 |
| **ENUMERATE** | migrate — this is the work | 19 |
| **FILTER** | migrate — lower blast radius, the derivation already ran under governance | 10 |
| **WEB** | already correct; **re-test**, do not re-write. W-3 changes all eleven behaviourally | 11 |

### 3.4 · What D-W5 actually blocks

**Nothing in the harness.** It defines **one row** of the expected-difference table: the
`view_team`-holder-as-member case.

Resolved as far as ratified direction permits (Stage 1 §4): R4 says membership confers no downward
person visibility, and the code contradicts its own comment. **Recommendation A — key 3(a2) on
leadership** — but the harness ships first and enumerates who loses what, and the decision follows
the data rather than preceding it.

**Sites blocked by D-W5:** only the ENUMERATE and FILTER sites whose actor set can include a
`view_team` holder who is a plain member of a node. From the fixture that is determinable
mechanically; it is not a design question.

### 3.5 · Sequencing — four rules

1. **W-3 before the harness.** The harness's expected column is defined in terms of post-W-3 Web.
2. **The harness before any migration.** No behaviour change until the divergence is a tracked
   artifact.
3. **Graph invalidation before or with W-3.** W-3 changes what `visibleScope` returns; stale caches
   would serve pre-W-3 scopes for two hours after deploy.
4. **Never bundle the comparison Web** (peers) with any of this — Stage D's sequencing law.

### 3.6 · Adversarial: the naive W-4 migration

> *"Replace `getVisibleUserIds(code, u)` with the people in `visibleNodesFor(nodes, u)`."*

Three ways this breaks:

- **GATE sites become wider or narrower unpredictably** — they are person-level checks and Web is
  node-level; a person with no node assignment vanishes from every gate.
- **The legacy `supervisorId` subtree and led `orgGroups`** (rules (b) and (c),
  `server.js:2818-2825`) have **no Web equivalent** and would be silently dropped.
- **Superadmin and `edit_members`** short-circuit to "everyone" (`:2790-2799`) — an administrative
  authority with no Web meaning at all.

**The harness must enumerate all three** so the migration is a decision per class rather than a
substitution.

---

## 4 · Combined implementation packets

| # | Packet | RED | Depends on | Commit boundary |
|---|---|---|---|---|
| **W-A** | W-3 graph law + role fix | W3-1,3,5,7,9,10 | D-W6 ✓, D-W7 ✓ | one commit, both edits |
| **W-B** | graph invalidation, both paths + fingerprint | GI-3,4,5,6,7,8,9 | — | separate commit; independent of W-A |
| **W-C** | parity harness, no behaviour change | the complete divergence list | W-A | separate commit |
| **W-D** | 3(a2) resolution | the row the harness produced | W-C, D-W5 | separate commit |

**W-B does not depend on W-A** and is the more urgent of the two, because GI-6 is an erasure defect
that exists today independently of any Web change.
