# P0 pilot blockers — decisions and briefs

**Authoritative for:** P0-1 and P0-2.
**P0-3 IS SUPERSEDED.** Decision B and Brief 3 below are retained for history and **must not be
implemented**. Codex correctly refused them: the smoke targeted routes that do not exist, the
writers used a role that cannot edit the tree, and process-local revisions cannot detect the
cross-process overwrite that P0-2's shutdown flush makes reachable on every deploy. The live
contract is **`docs/briefs/p0-3-adjudication.md`**.
**Companion to:** `docs/ttd/pilot-readiness-review.md`.
**P0-D and P0-5 are briefed in `docs/briefs/p0-d-authority-and-p0-5-origin.md`** — both are pure
`ai/` modules, overlap nothing here, and can run at the same time as any of the three below.

The briefs touch disjoint files and **can be dispatched in parallel**. See §Parallelism.

## Adjudication RED baseline (re-run 2026-08-21 before implementation)

```
evidence-durability-smoke:  0 passed,  9 failed     P0-1
shutdown-durability-smoke:  0 passed,  7 failed     P0-2
write-conflict-smoke:       1 passed, 18 failed     P0-3   (rewritten — real routes, two layers)
db-cas-smoke:               1 passed, 13 failed     P0-3   (new — the durable CAS contract)
authority-truth-smoke:      0 passed, 14 failed     P0-D
pilot-loop-smoke:          28 passed,  1 failed     P0-5
```

Six suites, 62 failing assertions. The two passing assertions inside the P0-3 suites are
deliberate and must stay green — they pin the corrected route and the legacy restore point.

## P0-3 implementation result (2026-08-21)

The corrected two-layer contract is implemented on the P0-1/P0-2 integration base. Same-process
tree edits use object `rev` plus caller-supplied `ifRev`; PostgreSQL protects every split
`store:<name>:<org>` unit with an atomic revision predicate. Tree `POST`/`PUT`/`DELETE` operations
cross that durable boundary before returning success, while other writes retain the debounce.

Reconstruction now loads durable revisions and seeds both `_unitRevs` and `_saveHashes`, so an
ordinary login cannot classify an unchanged boot snapshot as dirty. Shutdown uses the same CAS
writer and fails loudly on a semantic conflict. The actual production routes remain `/api/tree`,
and `manage_tree` authorization remains unchanged. `orgUsers` node arrays remain a derived cache,
rebuilt from authoritative `orgNodes` after commit or recovery.

Final local results: `write-conflict-smoke` **21 passed, 0 failed**, `db-cas-smoke` **14 passed,
0 failed**, and `persistence-cas-boundary-smoke` **4 passed, 0 failed**. All three are registered
in `scripts/test.js`. The adjudication's stated total of 19 for `write-conflict-smoke` was stale;
the unchanged corrected file contains 21 assertions.

Live two-session PostgreSQL verification remains a deployment check because this environment has
no `DATABASE_URL`, PostgreSQL client, or local PostgreSQL server. It must be performed before
merge/deploy using §9 of `p0-3-adjudication.md`; source-shape tests do not substitute for it.

P0-6 inquiry semantic recovery remains unadjudicated. Uniform durable-unit CAS prevents a stale
process from overwriting the unit, but no inquiry replay or merge policy was introduced. Before
the Falcon pilot, infrastructure must also verify Render's drain behavior during deploy overlap.

## P0-6 — inquiry-state concurrency · UNADJUDICATED

Split out of P0-3 by `docs/briefs/p0-3-adjudication.md` §Decision 8. `inquiryStates` is written by
evidence ingestion and the kernel, not by stale-client PUTs, and whether it is replayable from
canonical evidence is unverified. **Not a pilot blocker on current evidence** — single process at
Falcon scale, and uniform CAS closes its deploy-overlap exposure. What is open is the recovery
path. Do not claim inquiry concurrency is protected; no assertion covers it.

The P0-1, P0-2, and corrected P0-3 suites are now registered in `scripts/test.js`. Other RED
blocker suites remain unregistered until their own implementation makes them green.

---

# Decision A — Evidence retention

## DECISION

**A resolution boundary plus a cold table.** Three parts, in order of importance:

1. **One function through which evidence is fetched by id.** `_resolveEvidence(code, id)` returns
   `{ envelope, cold: true|false }` or `{ unresolvable: true, reason }`. **It never returns
   `undefined`.** Today evidence is reachable only by scanning `evidenceLog[code]`, so "evicted"
   and "never existed" are indistinguishable to every caller — which is precisely why the bug is
   invisible.
2. **Eviction writes to cold storage, it does not delete.** A `cold_evidence` table
   (`org_code`, `evidence_id`, `envelope` JSONB, `archived_at`), written before the splice.
3. **Eviction cleans the vector index.** `_evictEvidenceVector` is called for every evicted id.

## WHY

Raising `EVIDENCE_LOG_CAP` defers the identical failure to month eight — it is not a fix, it is a
delay with a number attached.

The resolver is the load-bearing part and it is roughly twenty lines. It is what makes "left the
working set" a different fact from "gone", and it gives every future retrieval path one place to
ask. Without it, cold storage is just a second place data can be missing from.

Per-year durable units were considered and rejected: clever, reuses the existing split, but leaves
retrieval scanning an array and still gives callers no way to distinguish absent from archived.

## INVARIANT

> An evidence id that was ever recorded either resolves to its envelope, or resolves to an
> explicit unresolvable answer naming why. Erasure is the only cause of permanent
> unresolvability.

## WHAT WE ARE DELIBERATELY NOT BUILDING YET

Tiered storage policies. Automatic re-warming. Search or vector retrieval over the cold set.
Per-year partitioning. Object storage. Any of these before a pilot would be building for a
history the product does not yet have.

---

# Decision B — Optimistic concurrency  ·  SUPERSEDED

> **Do not implement.** Replaced by `docs/briefs/p0-3-adjudication.md`. Retained for history.
> It specifies process-local revisions only, which cannot detect cross-process overwrite, and
> names `inquiryStates` in scope, which is now P0-6.

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

**Failing test.** `node scripts/evidence-durability-smoke.js` — currently **0 passed, 9 failed**.
It stops at the first case because `_resolveEvidence` does not exist; the remaining eight run once
it does.

**Allowed surface.** `server.js` (the ingest path around `:6034`, exports), `db.js` (the cold
table + its two queries). Add the table in `init()` alongside the existing schema.

**Prohibited shortcuts.** Raising `EVIDENCE_LOG_CAP`. Making the resolver return `undefined` for
anything. Keeping the full history in memory to satisfy the resolver — the working set must stay
bounded. Skipping vector cleanup. Making cold evidence unreachable by erasure.

**Acceptance.** `evidence-durability-smoke` green and registered; `persistence-smoke`,
`retrieval-smoke`, `evidence-smoke`, `intake-smoke` still green; `node scripts/test.js` green.

**Do not touch.** `ai/*` — this is a storage boundary, not a kernel change.

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

# Brief 3 — P0-3 · Optimistic concurrency on shared objects  ·  SUPERSEDED

> **Do not implement.** Replaced by `docs/briefs/p0-3-adjudication.md` §8. Its routes
> (`/api/org/nodes`) do not exist, its writers are coaches (who lack `manage_tree`), and it
> forbids touching `db.js` — where the guarantee actually has to live.

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
