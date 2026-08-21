# P0-3 adjudication — durable concurrency

**Status:** architecture decision. Supersedes Decision B and Brief 3 in
`docs/briefs/p0-pilot-blockers.md`. Contract for `scripts/write-conflict-smoke.js` (rewritten)
and `scripts/db-cas-smoke.js` (new).

Codex was right to stop. All three of its objections are factually correct against the
repository. Its recommendation is not, and the reason matters: **aggregate CAS cannot detect the
failure P0-3 was written for.** Both mechanisms are required, at two layers.

While verifying this I found a live data-loss bug that is larger than P0-3 and is triggered by
every deploy that has any traffic. It is §3, and it changes the order of the work.

---

# 1 · Verdict

**Approved: Option A, plus the object revision the original brief specified. Not one or the
other.**

| Layer | Mechanism | Catches |
|---|---|---|
| Semantic | `rev` on the node object, `ifRev` in the request | two admins editing one node in one process |
| Durable | monotonic `rev` on the `iq_store` row, compare-and-swap in PostgreSQL | one process overwriting another's committed state |

**Option B** (per-object rows) — rejected for the pilot. It is the right long-term shape and it is
a persistence-layer rewrite: identity, tombstones, reconstruction, and a migration of live data,
all before a pilot that has four other blockers open.

**Option C** (nested JSONB predicates) — rejected outright. `PUT /api/tree/node/:id` mutates the
target node, the old parent's `childNodeIds`, the new parent's `childNodeIds`, and reparents
children (`server.js:2235-2294`). A nested predicate would have to span all of them, and any
ordinary aggregate save would still overwrite the result. It creates two competing persistence
mechanisms, which is worse than having one imperfect one.

## 1.1 · Why Option A alone is insufficient

This is the decisive finding and Codex's analysis missed it.

Two admins edit `teamA`. Admin A's PUT lands at T0 and mutates `orgNodes[code].teamA` in memory,
then calls `scheduleSave()` — a 1500 ms debounce (`server.js:273`, `385`). Admin B's PUT lands at
T0+200 ms, computed against the state B read before A wrote, and overwrites the same in-memory
object. At T0+1500 ms **one** save fires, carrying the merged aggregate.

PostgreSQL sees a single write, from durable revision 14 to 15, with no conflict to detect.
A's change was destroyed 1.3 seconds before the database was involved at all.

> **Durable CAS protects the database from a stale process. It cannot protect a process from
> itself.** The object revision is the only thing that can, because it is the only check that
> happens inside the request.

The converse is also true: an object revision cannot catch cross-process overwrite, because the
overwriting process's in-memory object carries the revision it loaded and is internally
consistent. Two defects, two layers, two mechanisms.

## 1.2 · Correcting the threat model

`render.yaml` declares one web service and **no instance count and no autoscaling**. There is no
steady-state multi-process deployment, and there will not be one at Falcon's scale.

The two-process window is **deploy overlap**: Render boots the replacement instance before
stopping the old one. That window is short, guaranteed on every deploy, and — critically — it is
the window P0-2's SIGTERM flush is being built to write into. P0-2 makes the old process's late
write land where it previously vanished. Without P0-3 that is a strict improvement in one respect
and a new hazard in another, because the new process is holding state loaded before that flush.

So the honest framing is not "we might scale out one day". It is: **P0-2 and P0-3 are one change
split across two briefs, and shipping P0-2 alone makes the deploy window more dangerous, not
less.**

---

# 2 · Repository truth

Verified this pass. Codex's three objections, checked:

| Codex's claim | Verdict |
|---|---|
| The smoke targets nonexistent routes | **Correct.** `/api/org/nodes` does not exist. The tree API is `GET /api/tree` (2201), `POST /api/tree/node` (2207), `PUT /api/tree/node/:nodeId` (2235), `DELETE /api/tree/node/:nodeId` (2273) |
| `iq_store` has no revision and upserts unconditionally | **Correct.** Schema is `store_key` / `store_value` / `updated_at` (`db.js:53-57`); `saveStores` does `ON CONFLICT (store_key) DO UPDATE SET store_value = EXCLUDED.store_value` with no predicate (`db.js:172-176`) |
| Durable units are `store:<name>:<org>` aggregates | **Correct.** `_durableUnits()`, `server.js:195` |

Three further facts Codex did not report, each of which changes a decision:

**2.1 · `manage_tree` is admin/superadmin only** (`server.js:1560-1576`). A coach cannot edit the
tree. The old smoke's "two leaders" scenario is not reachable; the real one is two admins, most
plausibly during onboarding. The corrected smoke uses admins.

**2.2 · `orgUsers.assignedNodeIds` / `leadershipNodeIds` are a derived cache.**
`_syncUserNodeArrays` (`server.js:2409`) writes them on every tree mutation, and
`_backfillUserNodeIds` (`server.js:2433`, called at boot `server.js:17154`) rebuilds them from
`orgNodes` alone, documented *"safe to run repeatedly (always rebuilt fresh)"*. **This resolves
Decision 7 without multi-store CAS** — see §7.

**2.3 · `saveStores` already writes every unit in one transaction** (`db.js:166-180`, `BEGIN` /
`COMMIT`), for exactly this reason: *"A save cycle that touches a conversation and the inquiry it
produced must land together or not at all."* Adding a predicate inside that transaction gives
all-or-nothing multi-unit CAS for free if it is ever needed.

---

# 3 · The finding that reorders the work

**`_saveHashes` is never seeded from what was loaded at boot.**

`const _saveHashes = new Map()` (`server.js:250`). `_reconstruct` loads the durable units and
calls `_applyUnits(rows)` (`server.js:405-411`) without populating it. The save loop writes any
unit whose hash differs from its baseline (`server.js:329`) — and on a fresh process every
baseline is absent, so **the first save cycle rewrites every unit in the database from that
process's boot-time snapshot.**

`scheduleSave()` is called by `issueToken` (`server.js:1533`). So:

> During a deploy, the first person to log in against the new instance causes it to rewrite the
> entire database from state loaded before the old instance stopped serving. Everything the old
> instance accepted in that window is erased, silently, with a 200 already returned.

This is live today, independent of P0-3, and it is the concrete mechanism by which the deploy
window loses data. It is also why P0-3 must not be deferred behind P0-2.

Uniform CAS fixes it as a side effect — every write becomes conditional, so the stale rewrite is
refused rather than applied. Seeding `_saveHashes` at boot is then an egress optimisation rather
than a correctness fix, and it is three lines, so do it in the same change.

---

# 4 · The corrected invariant

Replaces Decision B.

> **IntelliQ may not acknowledge an organisational mutation as accepted unless (a) it was
> computed against the current in-process revision of the object it changes, and (b) PostgreSQL
> has atomically proved it was applied to the current authoritative version of the durable unit
> that holds it.**
>
> A write failing (a) is refused with the current object revision. A write failing (b) is refused,
> the process reloads that unit, and the caller is told to re-read. Neither failure is ever
> reported as success, and neither is ever confused with a database outage.

**Say this and nothing stronger.** P0-3 delivers *object-level semantic* concurrency and
*durable-unit* compare-and-swap. It does **not** deliver object-level durable concurrency: two
admins editing two different nodes in the same org, in two different processes, will conflict.
For a single-instance pilot that costs one spurious 409 per deploy overlap at worst, and a false
conflict is always preferable to a silently accepted loss.

---

# 5 · Decisions

## Decision 1 — concurrency unit

Two, at two layers.

- **Semantic unit:** the node. `orgNodes[code][nodeId].rev`, a monotonic integer, checked in the
  request against the caller's `ifRev`.
- **Durable unit:** the `iq_store` row. `store:orgNodes:<org>`, revisioned by PostgreSQL.

`inquiryStates` is **removed from P0-3 scope** — see Decision 8.

## Decision 2 — database change

**Supersedes "do not touch `db.js`".** The durable boundary is where the guarantee lives.

**Schema.** In `SCHEMA_SQL` (`db.js:52`):

```sql
CREATE TABLE IF NOT EXISTS iq_store (
  store_key   TEXT        PRIMARY KEY,
  store_value JSONB       NOT NULL DEFAULT '{}',
  rev         BIGINT      NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE iq_store ADD COLUMN IF NOT EXISTS rev BIGINT NOT NULL DEFAULT 0;
```

The `ALTER` is required and idempotent: `CREATE TABLE IF NOT EXISTS` does nothing to an existing
table, so without it a live deployment never gains the column. Existing rows deterministically
become revision 0.

**Read.** `loadStores(opts)` gains one option, default behaviour unchanged so existing callers and
`persistence-smoke` are unaffected:

```js
async function loadStores({ withRevisions = false } = {})
// withRevisions: false → { [key]: value }              (today)
// withRevisions: true  → { units: {...}, revisions: {...} }
```

**Write.** `saveStores(units, { expect } = {})` where `expect` is `{ [unitKey]: expectedRev }`.
Returns `{ rows, bytes, conflicts: [unitKey, ...] }`. A non-empty `conflicts` is a **semantic
answer, not an exception** — the distinction is load-bearing for Decision 12.

**All split units are written conditionally.** Not just protected ones. Uniformity is what makes
"no unconditional path survives" true and checkable, and it is what fixes §3. A unit with no entry
in `expect` uses expected revision 0, which is correct only for a unit the process has never seen
— so the server must track revisions for everything it loads.

**The `main` blob is not protected.** `saveMain` keeps its unconditional upsert. It is the
pre-migration restore point (`server.js:416`) and is only written in `dual` mode.

## Decision 3 — creation semantics

One statement covers creation and update:

```sql
INSERT INTO iq_store (store_key, store_value, rev, updated_at)
VALUES ($1, $2::jsonb, 1, NOW())
ON CONFLICT (store_key) DO UPDATE
   SET store_value = EXCLUDED.store_value,
       rev         = iq_store.rev + 1,
       updated_at  = NOW()
 WHERE iq_store.rev = $3
```

| Case | Result |
|---|---|
| absent row, expect 0 | INSERT succeeds, revision 1 |
| present at 14, expect 14 | UPDATE succeeds, revision 15 |
| present at 15, expect 14 | `WHERE` fails, **0 rows**, conflict |
| present at 5, expect 0 (a process that thinks it is creating) | `WHERE` fails, **0 rows**, conflict |

Two processes creating the same unit concurrently: one INSERTs, the other reaches `ON CONFLICT`
with expect 0 against revision 1 and loses. **No divergent accepted rows.**

Count affected rows per statement, not per transaction. Collect every conflicted key, then
`ROLLBACK` the whole transaction if any conflicted — the existing all-or-nothing property
(`db.js:166`) must hold.

## Decision 4 — stale durable conflict recovery

A CAS conflict means **another process holds newer truth**. The recovery law:

1. Classify as semantic conflict. Never `_scheduleRetry()` — see Decision 12.
2. Reload **only the conflicted units** via `loadStores({ withRevisions: true })`, filtered to
   those keys. Do not reload the world; unaffected units are fine.
3. Apply them over the in-memory store and refresh `_unitRevs` and `_saveHashes` for those keys.
4. Rebuild derived caches — `_backfillUserNodeIds()` — because §2.2 is what makes step 2 safe.
5. Fail the specific request with 409. It was computed against state that no longer exists.
6. The client re-reads and decides. Never re-apply on its behalf.

## Decision 5 — acceptance boundary

**The hard question, answered: B, for protected stores only.**

> A mutation to a protected store is accepted when its durable CAS succeeds — not when the route
> mutates process-local state.

Protected routes `await` the CAS before responding. Everything else stays debounced, which is
correct because everything else is effectively single-writer and its loss window is already
covered by P0-2.

**This is the smallest change that keeps P0-2's guarantee true.** P0-2 says an acknowledged
mutation survives termination. If a protected mutation can be acknowledged and then refused by
another process, P0-2 is false for exactly the writes that matter most.

**Cost is bounded and known.** Tree edits happen during onboarding and occasionally after. One
PostgreSQL round trip on a route that already does permission checks and a cache rebuild is not a
latency concern. Do not generalise this to any other route.

## Decision 6 — local mutation ordering

**Snapshot, mutate in place, CAS, restore on conflict.** Not candidate-then-commit.

The routes mutate several objects across two stores through `_syncUserNodeArrays`. Building a
candidate aggregate would mean reimplementing all of `PUT /api/tree/node/:nodeId` against a copy —
more code, and a second version of the mutation logic that can drift from the first.

Snapshotting is cheap and exact: `orgNodes[code]` for one org is small, and the derived user cache
does not need snapshotting because it is reconstructible.

```
snap = structuredClone(orgNodes[code])
apply the mutation exactly as today, then node.rev++
r = await saveProtectedUnit('orgNodes', code)
  ok       → update _unitRevs + _saveHashes → 200
  conflict → orgNodes[code] = snap; reload the unit; _backfillUserNodeIds(); → 409
  throw    → orgNodes[code] = snap; _backfillUserNodeIds(); → 503
```

## Decision 7 — org tree transaction scope

**One protected transaction is one durable unit: `store:orgNodes:<org>`.**

A tree mutation appears to span two units because `_syncUserNodeArrays` writes `orgUsers`. It does
not, because those fields are a **derived cache**, authoritatively reconstructible from `orgNodes`
by `_backfillUserNodeIds` (§2.2). `orgNodes` is the authority; `orgUsers` node arrays follow.

Therefore:
- CAS `orgNodes` only.
- After any reload or rollback of `orgNodes`, call `_backfillUserNodeIds()`.
- **Export `_backfillUserNodeIds`** so the recovery path and the smoke can both reach it.
- Do not CAS `orgUsers`. It has other authoritative fields with other writers, and protecting it
  would make every login conflict with every tree edit.

There is no half-durable tree mutation, because only one unit is durable-authoritative.

If a future change makes a derived field independently authoritative, this decision must be
revisited — `saveStores`'s single transaction makes multi-unit CAS available at that point.

## Decision 8 — inquiryStates: split out as P0-6

**Removed from P0-3. Not solved, and saying otherwise would be worse than leaving it open.**

`inquiryStates` is not written by stale-client PUTs. It is written by evidence ingestion, proposal
application, the contribution lifecycle, forum contribution, and the kernel
(`_admitGroupContributions` → `diagnose.applyProposals`, `server.js:12185-12195`). Three questions
must be answered before any concurrency law is written, and none can be answered by inspection:

1. **Is inquiry state fully replayable from canonical evidence?** If it is, the correct mechanism
   is deterministic replay, not CAS — and CAS would be the wrong tool applied confidently.
2. **What is the protected identity?** The tenant unit is far too coarse: every check-in in the
   org would contend with every other. `(subjectRef, conceptKey)` is plausible and is not a
   durable unit today.
3. **What happens to already-accepted evidence when an ingestion loses a CAS?** Rejecting evidence
   that a person deliberately contributed is a different and worse failure than rejecting a tree
   edit.

Putting a synchronous PostgreSQL round trip inside the evidence ingestion path is also a real
performance decision that nobody has taken.

**Amend the P0 register: P0-6 · inquiry-state concurrency — unadjudicated.** Not a pilot blocker
on current evidence: it is single-process at Falcon scale, and the deploy-overlap exposure is
closed for it by uniform CAS on all split units (Decision 2), which refuses a stale rewrite even
though nothing awaits it. What remains unhandled is the recovery path, and that is P0-6.

## Decision 9 — HTTP contract

Routes, corrected:

| Route | Precondition |
|---|---|
| `GET /api/tree` | none — returns `rev` on every node |
| `PUT /api/tree/node/:nodeId` | `ifRev` **required**, matched against `node.rev` |
| `DELETE /api/tree/node/:nodeId` | `ifRev` **required**, matched against `node.rev` |
| `POST /api/tree/node` | `ifRev` required **only when `parentId` is given**, matched against the parent's `rev` |

Creation has no object to be stale against, but it mutates the parent's `childNodeIds`, so the
parent is the thing the caller must be anchored to. Creating a root node needs no precondition.

**Carry it in the JSON body as `ifRev`**, not `If-Match`. Every mutation in this API is a JSON
body with explicit fields and no route uses ETags; introducing one HTTP-header convention for one
route family is a second idiom for no gain. The existing brief and tests already say `ifRev`.

**The server must never read the current revision on the caller's behalf.** The value comes from
the request or the request is refused.

## Decision 10 — revision exposure

**Expose the object revision. Do not expose the durable revision.**

- `GET /api/tree` returns `rev` on each node. That is the semantic revision, it is what `ifRev`
  is compared against, and clients need it.
- The `iq_store` row revision is a persistence-layer concern. Exposing it would let a client
  depend on storage layout, and would make Option B — the eventual per-object migration — a
  breaking API change.

Two concepts, deliberately not the same number, only one of them public.

## Decision 11 — conflict response

| Situation | Status | Body |
|---|---|---|
| precondition missing on a protected route | **428** | `{ error: 'precondition required', field: 'ifRev' }` |
| `ifRev` does not match the object | **409** | `{ error: 'conflict', currentRev: <n> }` |
| durable CAS refused | **409** | `{ error: 'conflict', reason: 'changed elsewhere' }` |
| database unreachable or threw | **503** | `{ error: 'store unavailable' }` |
| not permitted / wrong org | 401 / 403 / 404 | unchanged |

`currentRev` only. **No organisational contents in a conflict body** — the caller re-reads through
the authorised route, which is already scoped. A conflict response must not become a second,
unscoped read path.

## Decision 12 — retry law

| Path | On semantic CAS conflict |
|---|---|
| user mutation via a protected route | **never retry.** 409, the human decides |
| debounced background save | **never `_scheduleRetry()`.** Reload the conflicted units (Decision 4) and let the next cycle write from current truth |
| shutdown flush | **never retry.** Report loudly — see §6 |
| internal derived writes | out of scope (Decision 8) |

**A CAS conflict must not enter `_scheduleRetry` (`server.js:280`).** That loop exists for
transient database failures and backs off up to twelve times. Feeding it a conflict would retry
the same stale aggregate repeatedly, and if the predicate were ever relaxed it would eventually
overwrite newer truth. The two must be handled by different code paths, and `db.saveStores`
returning `conflicts` rather than throwing is what makes that distinction available.

Automatic retry is only ever safe where the operation can be deterministically replayed against
new state. No path in P0-3 scope qualifies.

---

# 6 · P0-2 interaction

P0-2's `_flushAndClose` must carry expected revisions like any other write, and a CAS conflict
during the final flush is a "cannot persist" — which P0-2's assertion 3 already requires be
reported rather than exited quietly. The two briefs agree without amendment.

**Do not add a force-write path for shutdown.** A shutdown that overwrites newer database state
because the process is stopping is the exact bug P0-3 exists to prevent, dressed as tidiness.

**Ordering, stated honestly.** In deploy overlap, whichever process commits first wins:

- New process saves first, then the old process's flush conflicts → the old process's late
  mutation is refused and reported. It is lost, but **loudly**, with the operator told.
- Old process flushes first, then the new process conflicts → the new process reloads. Correct,
  no loss.

The second is the good case and is made much more likely by seeding `_saveHashes` at boot (§3), so
the new process stops writing units it has not touched. **This residual risk is not fully closed
by P0-3**, and closing it needs deploy-level coordination (drain before boot) that is out of
scope. It is listed in §10.

---

# 7 · Corrected smoke tests, reproduced RED

Both are written, syntax-checked, and run. **Neither is registered in `scripts/test.js`** — register
in the commit that makes them green.

```
node scripts/write-conflict-smoke.js   →   1 passed, 18 failed
node scripts/db-cas-smoke.js           →   1 passed, 13 failed
```

The one passing assertion in each is deliberate and must stay green:
`write-conflict` §1 "GET /api/tree answers the admin" proves the corrected route exists;
`db-cas` §4 "the legacy main blob is left alone" proves the restore point is not collateral damage.

`write-conflict-smoke.js` bails after §1 because `GET /api/tree` returns no `rev`; the remaining
cases run once it does. Its stated total is 19.

Unchanged, re-verified this pass:

```
evidence-durability-smoke   0 passed, 9 failed     (P0-1, untouched)
shutdown-durability-smoke   0 passed, 7 failed     (P0-2, untouched)
pilot-loop-smoke           28 passed, 1 failed     (P0-5, untouched)
```

`db-cas-smoke.js` asserts on `db.js` source shape. That is deliberate and its header says so: the
suite runs with `DB_OPTIONAL=1` and no PostgreSQL, so it cannot execute a real concurrent update.
What it *can* prove is that **no unconditional write path to a split unit remains**, which is a
source property and is the property that fails today. Live semantics are verified once by hand
(§9), not on every run. This is the same discipline `governance-smoke` uses for import boundaries.

---

# 8 · Codex implementation brief

**No architecture choices remain. Everything below is mechanical.**

**Allowed surface:** `db.js`; `server.js` — the schema/load/save region (~245–425), the tree routes
(2201–2295), `_backfillUserNodeIds` export (~2433), and `module.exports`.
**Do not touch:** `ai/*`, `inquiryStates`, any other store's routes, `saveMain`.

### Step 1 — `db.js`

1. Add `rev BIGINT NOT NULL DEFAULT 0` to `SCHEMA_SQL`, plus the idempotent
   `ALTER TABLE iq_store ADD COLUMN IF NOT EXISTS rev BIGINT NOT NULL DEFAULT 0;` (Decision 2).
2. `loadStores({ withRevisions = false } = {})` — default shape unchanged; with the flag, return
   `{ units, revisions }`. Select `rev`.
3. `saveStores(units, { expect } = {})` — replace the unconditional upsert with the statement in
   Decision 3. Track `rowCount` per statement; collect conflicted keys; if any conflicted,
   `ROLLBACK` and return `{ rows: 0, bytes, conflicts }`. Otherwise `COMMIT` and return
   `{ rows, bytes, conflicts: [] }`. **Never throw on a conflict.**
4. Leave `saveMain` exactly as it is.

### Step 2 — `server.js` persistence

5. Add `const _unitRevs = new Map()` beside `_saveHashes` (`:250`).
6. In `_reconstruct` (`:405`), load with `{ withRevisions: true }`; seed `_unitRevs` from
   `revisions` **and** seed `_saveHashes` from the hash of each loaded unit (§3).
7. In `_runSave`, pass `expect` built from `_unitRevs` for every unit in `changed`. On success,
   increment `_unitRevs` for each written key alongside the existing `_saveHashes` update. On
   `conflicts`, run the Decision 4 recovery for those keys and **do not** call `_scheduleRetry`.
   A thrown error keeps today's behaviour.
8. Add `async function _saveProtectedUnit(storeName, code)` — build that one unit via the same
   partitioning `_durableUnits()` uses, `await db.saveStores({ [key]: unit }, { expect })`, and
   return `{ ok }` / `{ conflict: true }` / rethrow. On success update `_unitRevs` and
   `_saveHashes` for that key so the next debounced cycle does not rewrite it.
9. Export `_flushAndClose`-adjacent additions: `_backfillUserNodeIds`, `_saveProtectedUnit`,
   `_unitRevs`.

### Step 3 — object revisions

10. `orgNodes[code][nodeId].rev` — an integer. An object without one reads as `0`; **do not migrate
    the store**, initialise lazily on read.
11. `GET /api/tree` (`:2201`) returns `rev` on every node.

### Step 4 — protected routes

12. `PUT` (`:2235`) and `DELETE` (`:2273`): require `ifRev` → 428 if absent; compare to `node.rev`
    → 409 + `currentRev` if different. `POST` (`:2207`): the same, against the parent's `rev`, only
    when `parentId` is given.
13. Wrap each mutation in the Decision 6 sequence: snapshot `orgNodes[code]`, apply as today, bump
    `node.rev`, `await _saveProtectedUnit('orgNodes', code)`, then 200 / restore+reload+409 /
    restore+503.
14. Replace the `scheduleSave()` call in those three routes. The protected write already persisted.

### Acceptance

- `node scripts/write-conflict-smoke.js` → 19 passed, 0 failed
- `node scripts/db-cas-smoke.js` → 14 passed, 0 failed
- Both registered in `scripts/test.js` in the same commit
- Still green: `persistence-smoke`, `persistence-durability-smoke`, `org-graph-http-smoke`,
  `endpoint-smoke`, `cross-org-isolation-http-smoke`
- Unchanged: `evidence-durability-smoke` 0/9, `shutdown-durability-smoke` 0/7,
  `pilot-loop-smoke` 28/1 — this change must not move them in either direction
- `node scripts/test.js` green

### Prohibited

Raising or shortening the debounce. A global lock. Accepting a write that omits `ifRev`.
Server-side auto-retry of a stale write. Feeding a conflict into `_scheduleRetry`. Extending
protection to `inquiryStates` or any other store. A force-write path for shutdown. Returning org
contents in a conflict body. Touching `saveMain`.

---

# 9 · Migration and verification

Deploy order matters, once:

1. Ship the `db.js` change. The `ALTER` runs in `init()`; existing rows become revision 0.
2. The first save from the running process expects 0, matches, and advances to 1.
3. **Verify by hand, once, against the real database** — this is what `db-cas-smoke` deliberately
   does not attempt:

```sql
SELECT store_key, rev FROM iq_store WHERE store_key LIKE 'store:orgNodes:%';
-- then, in two psql sessions, run the Decision 3 statement with the same expected rev.
-- One reports UPDATE 1. The other reports UPDATE 0. If both report 1, the predicate is wrong.
```

Paste both outputs into the PR. `implemented != tested != proven`.

---

# 10 · Risks and remaining founder judgment

**10.1 · Deploy overlap is narrowed, not closed.** If the new process commits before the old
process's shutdown flush, the old process's last mutations are refused and lost — loudly, with the
operator told, which is a large improvement on silently. Fully closing it needs the old instance
drained before the new one serves, which is a Render configuration decision, not a code change.
**Founder call: accept for the pilot, or investigate Render's drain behaviour before Falcon.**

**10.2 · Conflict granularity is coarser than the API suggests.** Two admins editing two *different*
nodes in two *different* processes will conflict at the durable layer. At one instance and two
admins this is close to unreachable; it is stated so the documentation never claims more than the
implementation provides (§4).

**10.3 · P0-6 is open and unadjudicated.** Inquiry-state concurrency needs its own decision, and it
needs an answer to "is inquiry state replayable from canonical evidence?" that I did not attempt
here. It is not a pilot blocker on current evidence, and it should not be discovered late.

**10.4 · The two P0-1 follow-ups are recorded, not folded in.** Eviction may begin from the legacy
main representation before authoritative split rows finish loading; and cold evidence is absent
from deduplication/correction identity after full eviction. Neither is a P0-3 dependency — I looked
and found no coupling. They belong to P0-1's acceptance and must be raised at pilot-readiness
adjudication rather than lost here.

**10.5 · §3 is the most urgent item in this document and it is not P0-3.** The unseeded
`_saveHashes` full-rewrite is live now, fires on the first login after any deploy, and is three
lines to fix. It is folded into Step 2.6 because uniform CAS is what makes it *safe*, but if any
part of this work ships alone, ship that.

---

# 11 · Implementation record (2026-08-21)

The 14-step contract is implemented on the integration base containing P0-1 and P0-2. The final
local counts are `write-conflict-smoke` 21/0, `db-cas-smoke` 14/0, and the independent startup
boundary test `persistence-cas-boundary-smoke` 4/0. All are registered in the truth layer.

Independent review subsequently completed the §9 write-CAS proof against PostgreSQL 16.13. One
overlapping writer advanced revision 0 to 1; the stale writer blocked, then affected zero rows,
and the accepted value remained. The correction environment still provided no PostgreSQL runtime,
so revision-aware deletion retains a live pre-merge verification item.

Review also found and corrected two holes. `deleteStores` now uses tenant/store-key revision CAS
inside one transaction, returning stale deletions as semantic conflicts. A failed authoritative
split reconstruction now clears partial baselines, marks persistence unavailable, rejects mutating
HTTP requests and protected saves, and permits persistence again only after successful
reconstruction seeds revisions and hashes. Corrected suites: `write-conflict` 21/0, `db-cas` 18/0,
`persistence-cas-boundary` 9/0, and `delete-cas-boundary` 7/0.

Render drain behavior remains a required pre-Falcon infrastructure verification. P0-6 remains
explicitly unresolved.
