# P0 pilot blockers — decisions and briefs

**Authoritative for:** P0-1, P0-2, P0-3. Codex briefs reference this rather than restating it.
**Companion to:** `docs/ttd/pilot-readiness-review.md`.
**P0-D and P0-5 are briefed in `docs/briefs/p0-d-authority-and-p0-5-origin.md`** — both are pure
`ai/` modules, overlap nothing here, and can run at the same time as any of the three below.

The three briefs touch disjoint files and **can be dispatched in parallel**. See §Parallelism.

## The whole pilot gate, verified on a clean `npm install`

```
evidence-durability-smoke:  0 passed,  9 failed     P0-1
shutdown-durability-smoke:  0 passed,  7 failed     P0-2
write-conflict-smoke:       0 passed,  7 failed     P0-3
authority-truth-smoke:      0 passed, 14 failed     P0-D
pilot-loop-smoke:          28 passed,  1 failed     P0-5
```

Five suites, 38 failing assertions, five files. None of these suites is registered in
`scripts/test.js` yet except `pilot-loop-smoke`; register each one in the commit that makes it
green.

---

# Decision A — Evidence retention

## DECISION

**An asynchronous resolution boundary plus a cold table.** Four parts, in order of importance:

1. **One function through which evidence is fetched by id.** `await _resolveEvidence(code, id)` returns
   `{ envelope, cold: true|false }` or `{ unresolvable: true, reason }`. **It never returns
   `undefined`.** Today evidence is reachable only by scanning `evidenceLog[code]`, so "evicted"
   and "never existed" are indistinguishable to every caller — which is precisely why the bug is
   invisible. The function is asynchronous because bounded-memory cold resolution requires
   PostgreSQL I/O; loading cold history into a process-local shadow map is prohibited.
2. **Eviction writes to cold storage, it does not delete.** A `cold_evidence` table
   (`org_code`, `evidence_id`, nullable `envelope` JSONB, nullable `raw_record` JSONB,
   `archived_at`, nullable `erased_at`), written before the hot copy is removed. The raw record
   moves with its envelope so the immutable provenance root does not stay in an unbounded
   in-memory `rawEvidence` map.
3. **Eviction is one asynchronous operation.** `await _evictWorkingSet(code, ids)` selects only
   tenant-local hot envelopes, archives all selected rows successfully, and only then removes the
   corresponding hot envelopes, raw records and vectors. A failed archive leaves every hot copy
   and vector intact and reports failure.
4. **Erasure reaches both tiers.** `await _eraseEvidence(code, id)` removes tenant-local hot,
   cold content, raw content and vector copies. The cold row becomes a contentless tombstone
   (`envelope = NULL`, `raw_record = NULL`, `erased_at = NOW()`) so an erased id remains
   distinguishable from an id that never existed without retaining personal content. Durable
   beliefs/inquiries keep the evidence id as history; future resolution returns an explicit
   erased/deleted result rather than rewriting the reference.

## WHY

Raising `EVIDENCE_LOG_CAP` defers the identical failure to month eight — it is not a fix, it is a
delay with a number attached.

The resolver is the load-bearing part. It is what makes "left the working set" a different fact
from "gone", and it gives every future by-id path one place to ask. Without it, cold storage is
just a second place data can be missing from. It cannot legitimately be synchronous: `db.js` uses
the asynchronous `pg` API, while keeping all cold rows in memory would defeat the working-set
boundary.

Per-year durable units were considered and rejected: clever, reuses the existing split, but leaves
retrieval scanning an array and still gives callers no way to distinguish absent from archived.

## INVARIANT

> An evidence id that was ever recorded either resolves to its envelope, or resolves to an
> explicit unresolvable answer naming why. Erasure is the only cause of permanent
> unresolvability. Resolution remains true after process restart and is scoped by organisation.

## AUTHORITATIVE SEQUENCE

```
select tenant-local hot candidates
  → archive envelope + raw provenance in one durable cold write
  → confirm archive success
  → remove the corresponding vectors
  → remove hot envelopes and process-local raw records
```

The hot cap is an eventual bound, not permission to lose data. `_recordEvidence` remains
synchronous: when the cap is exceeded it schedules/coalesces `_evictWorkingSet` and returns with
the excess evidence still hot. Archive failure may temporarily leave the working set over cap;
it may never make it under cap by deleting the only resolvable copy. The shutdown work in Brief 2
must await any pending archive task before process exit, or persist the still-hot excess through
the existing store flush so the next process can retry eviction.

## WHAT WE ARE DELIBERATELY NOT BUILDING YET

Tiered storage policies. Automatic re-warming. Search or vector retrieval over the cold set.
Per-year partitioning. Object storage. Any of these before a pilot would be building for a
history the product does not yet have.

---

# Decision B — Optimistic concurrency

## DECISION

**A monotonic integer `rev` per protected object; the client sends `ifRev`; mismatch is a 409.**

- Server increments `rev` on every accepted write and returns it on read.
- A write to a protected object **must** carry `ifRev`. Omitting it is `428 Precondition
  Required` — accepting it by default would leave the hole reachable by dropping one field.
- Mismatch → `409` with `{ error: 'stale_write', currentRev, current }` so the client can re-read
  and show the human what changed.
- **Retries are explicit, never automatic.** An automatic retry re-applies a decision made against
  state the human never saw, which is the original bug wearing a helpful mask.
- Not added to `ai/audit.js`. A rejected stale write is an ordinary error, not a governance event,
  and padding the audit allowlist devalues the chain.

## Scope — a correction to the pilot review

The review named three stores: nodes, inquiries, group subjects. **Group subjects are not a
separate store** — they are keys inside `inquiryStates` (`group:<nodeId>`, proven by
`scripts/persistence-smoke.js` case 11). The protected set is **two**:

| Store | Why it is contended |
|---|---|
| `orgNodes` | two leaders editing team membership or leadership |
| `inquiryStates` | `member:` and `group:` subjects; several people acting on one inquiry |

## WHY

The failure is silent, not loud: the loser is told the write succeeded. That is why it will never
be reported as a bug — it presents to the customer as "IntelliQ forgot", which is fatal for a
product selling an honest record.

`rev` + `ifRev` is the smallest model that detects it. It needs no locks, no transactions, no
coordination, and it works unchanged if the process is ever replicated.

## INVARIANT

> A write computed against stale state is refused, never silently applied. The refusal names the
> current revision so the writer can re-read.

## DEFERRED SCOPE

Every other store. Distributed locks. CRDTs or automatic merge. Cross-object transactions.
Field-level conflict resolution. All of it is unnecessary for one pilot organisation.

---

# Brief 1 — P0-1 · Durable evidence retention

**Problem.** `server.js:6036-6038` FIFO-truncates the evidence log at 8,000 envelopes per org,
destroying the oldest and its `rawEvidence` record. A 100-person org reaches that in ~4 months.
Beliefs then cite ids that no longer resolve, `_retrieveGrounding` silently returns less, and
`_evictEvidenceVector` is never called so the vector index points at deleted evidence.

**Invariant.** Decision A above.

**Failing test.** `node scripts/evidence-durability-smoke.js` — currently **0 passed, 25 failed**.
Six interface assertions fail before the nineteen behavioural cases can run.

The original 0/9 test was architecturally invalid in two places: it called a PostgreSQL-capable
resolver synchronously, and it directly spliced/replaced `evidenceLog[code]`. Those mutations
bypassed archive-before-removal and were satisfiable only by retaining a forbidden shadow copy in
memory. The corrected suite awaits every cold-capable operation and drives eviction through
`_evictWorkingSet` with a process-external fake cold table.

**Allowed surface.** `server.js` (the ingest path around `:6034`, by-id evidence consumers,
erasure/retention integration, exports), `db.js` (the cold table + archive/resolve/erase queries).
Add the table in `init()` alongside the existing schema.

**Prohibited shortcuts.** Raising `EVIDENCE_LOG_CAP`. Making the resolver return `undefined` for
anything. Keeping the full history in memory to satisfy the resolver — the working set must stay
bounded. Splicing before the archive promise resolves. Treating archive failure as successful
eviction. Skipping vector cleanup. Leaving raw provenance in an unbounded process map. Making cold
evidence unreachable by erasure. Querying cold evidence without `org_code` in the key/predicate.

**Acceptance.** `evidence-durability-smoke` green and registered; `persistence-smoke`,
`retrieval-smoke`, `evidence-smoke`, `intake-smoke` still green; `node scripts/test.js` green.

**Do not touch.** `ai/*` — this is a storage boundary, not a kernel change.

## CALLER AND MUTATION AUDIT — VERIFIED 2026-08-21

`_resolveEvidence` does not exist yet, so it has no production callers. Four current by-id reads
must converge on it:

| Current site | Migration | Classification |
|---|---|---|
| `POST /api/evidence/:id/resolve` (`server.js:6407-6420`) | make handler `async`; await resolver; operate on `result.envelope` | trivial await; already an HTTP async-capable boundary |
| `POST /api/evidence/:id/reject` (`server.js:6423-6432`) | same | trivial await |
| `POST /api/evidence/:id/reverse` (`server.js:6436-6446`) | same | trivial await |
| `_inheritedVisibility` (`server.js:7385-7395`) | await every basis id through resolver | synchronous boundary requiring bounded propagation |

The fourth path requires `_inheritedVisibility` and `_recordDerivedEvidence` to become async. Its
single production caller is `GET /api/checkin/:memberId/intelligence`
(`server.js:8070-8100`), whose Express handler can become async and await the derived write. The
direct test callers of `_recordDerivedEvidence` must await it. This is a contained migration, not
a kernel redesign. No `ai/*` module is involved.

Whole-log scans such as `_kernelEvidence` are deliberately **hot working-set queries**, not by-id
resolution. This brief does not add cold search or re-warming: current reasoning uses the bounded
hot set, while audit/reconstruction of a cited id uses `_resolveEvidence`.

Direct working-set mutation has also been audited:

- The destructive volume splice at `server.js:6036-6038` must be replaced by scheduling the
  authoritative eviction boundary.
- `_purgeExpired` at `server.js:452-481` is policy erasure, not eviction. It must become async or
  delegate each expired envelope to an async tenant-scoped erasure batch so cold rows and vectors
  are also removed.
- `_deleteImport` and source/workspace deletions change lifecycle status and evict vectors; they do
  not erase historical envelopes and therefore must not be rewritten as cold eviction.
- Test-only array mutation in `turn-grounding-smoke.js` and `inquiry-smoke.js` is fixture cleanup,
  not a production storage path.

`_removePerson(..., deleteData=true)` currently removes many personal stores but does not remove
canonical evidence about/by the person. Cold storage makes that existing Art 17 gap more serious.
Implementation must either route matching hot/cold evidence through a tenant-scoped subject
erasure helper in this blocker or record it as a separately failing privacy blocker before pilot;
it may not claim erasure completeness while cold personal rows remain.

---

# Brief 2 — P0-2 · Shutdown durability

**Problem.** `SAVE_DEBOUNCE_MS` is 1500 (`server.js:273`) and there is **no `SIGTERM`, `SIGINT` or
`beforeExit` handler anywhere** — `grep "process.on(" server.js db.js` returns only
`unhandledRejection` and `uncaughtException`. Every deploy discards whatever is in the debounce
window, plus any batch waiting on the retry backoff (`:283`), after the API returned 200.

**Invariant.** Once the API has acknowledged a mutation, graceful termination cannot silently
discard it. A flush that cannot persist reports failure rather than exiting quietly.

**Failing test.** `node scripts/shutdown-durability-smoke.js` — currently **0 passed, 7 failed**.

**Allowed surface.** `server.js` save scheduler and process lifecycle. Export the shutdown routine
as `_flushAndClose` so it is testable without killing the test process.

**Prohibited shortcuts.** Shortening the debounce (it does not close the window, it narrows it).
Fire-and-forget — the flush must await the write. Exiting 0 after a failed flush. Rewriting every
store on shutdown; `persistence-smoke` proves a mutation must cost only what it changed.

**Acceptance.** `shutdown-durability-smoke` green and registered; `persistence-smoke` and
`persistence-durability-smoke` still green; full suite green.

**Do not touch.** `db.js`, `ai/*`.

---

# Brief 3 — P0-3 · Optimistic concurrency on shared objects

**Problem.** Shared objects are mutated in place with no version and no conflict detection. Two
leaders editing one node: the second write erases the first, both see success, nothing records the
loss.

**Invariant.** Decision B above. Protected set: `orgNodes` and `inquiryStates` only.

**Failing test.** `node scripts/write-conflict-smoke.js` — currently **0 passed, 7 failed**.

**Allowed surface.** `server.js` — the read and write endpoints for those two stores, and `rev`
initialisation for existing objects (an object without `rev` is `rev: 0` on first read; do not
migrate the store).

**Prohibited shortcuts.** A global lock. Accepting a write that omits `ifRev`. Auto-retrying a
stale write server-side. Extending protection to other stores — that is deliberately deferred and
broadening it here costs review time we do not have.

**Acceptance.** `write-conflict-smoke` green and registered; `org-graph-http-smoke`,
`inquiry-http-smoke`, `group-subject-smoke` still green; full suite green.

**Do not touch.** `ai/*`, `db.js`.

---

# Parallelism

| Brief | Files | Overlap |
|---|---|---|
| P0-1 | `server.js` ingest + exports, `db.js` | `server.js` |
| P0-2 | `server.js` save scheduler + lifecycle | `server.js` |
| P0-3 | `server.js` node/inquiry endpoints | `server.js` |

All three touch `server.js`, but in **three widely separated regions** — ~line 6034, ~line 273–390,
and the org/inquiry endpoints past line 10000. Git merges these cleanly in practice.

**Only the `module.exports` block is genuinely shared.** All three add exports to it.

**Mitigation:** dispatch P0-1 and P0-2 together; dispatch P0-3 after either one merges. Or accept
a trivial exports-block conflict and resolve it in one line. Both are fine; the second is faster.

---

# P0-5 — found by the pilot gate, not yet briefed

`scripts/pilot-loop-smoke.js` is **28 passed, 1 failed**, and the failure is a real defect in the
product's most distinctive claim.

`ai/forum.js:originForMessage` treats a message as an echo only
`if (echoesMessage.contributedOrigin)`. The caller (`server.js:12491-12492`) resolves that from a
candidate lookup, so it is only populated when the echoed message has **already been contributed**
and its candidate has not expired. In the ordinary sequence — people discuss, agree, then
contribute — the echo is minted as an independent `direct_observation` with its own `originRef`.

That is the "five teammates repeating the captain" case `ai/diagnose.js:218-224` exists to
prevent, reachable through the forum, which is exactly where a room agrees with itself.

Small fix, high value, in the flagship claim.

**Now briefed** — see `docs/briefs/p0-d-authority-and-p0-5-origin.md`, Brief 5. It turned out to
touch only `ai/forum.js` and one call site, so it does not need to wait for the batch above; it
can be dispatched immediately and merges cleanly against all three.
