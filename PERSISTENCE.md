# Persistence

How IntelliQ stores state, what a write costs, and how to verify both in production.

## The model

State lives in memory as ~64 plain objects. It is persisted as **durable units** — one Postgres
row per store, per organisation.

| Class | Key | Examples |
|---|---|---|
| Global | `store:<name>` | `inviteTokens`, `pendingInvites`, `activeSessions` |
| Org-scoped | `store:<name>:<orgCode>` | `store:orgUsers:trafford`, `store:inquiryStates:trafford` |
| Derived | *not persisted* | `emailIndex` (rebuilt from `orgUsers` at boot) |
| Unclassified | `store:<name>:_` | a top-level key belonging to no known org |

Partitioning asks whether a top-level key **is** an org — directly (`trafford`) or as a composite
prefix (`trafford:ashton`) — checked against `orgMeta` rather than a hardcoded per-store list. A
store added later partitions correctly with nothing to update.

### Why not annotate the call sites

The obvious design is `markDirty({ scope, store })` at each of the ~197 `scheduleSave()` sites.
That is 197 chances to name the wrong store and lose data, with no test that naturally catches
it. Instead each save cycle serialises every unit, hashes it, and writes only what moved. Hashing
what a unit actually serialises to cannot be wrong about what changed, and `scheduleSave()` keeps
meaning "something happened" rather than "persistence topology, please".

### Guarantees

- One writer at a time. A save arriving mid-write marks the run in flight dirty; it never starts a
  second transaction.
- All units in a cycle commit in one transaction, so a conversation and the inquiry it produced
  cannot land half-applied.
- The hash baseline advances **only after the commit**. A failed write stays dirty and retries on a
  capped backoff (`SAVE_RETRY_MS`, default 5s, doubling to 60s).
- A unit that disappears from memory is **deleted**, not left as a ghost row.
- An unclassified key is **persisted first and reported second** (see below).

## Modes

`PERSISTENCE_MODE` selects what is authoritative:

| Mode | Writes | Boot reads | Cost |
|---|---|---|---|
| `split` *(default)* | durable units | units if any exist, else the blob | what changed |
| `dual` | units **and** the `main` blob | same as split | full blob every cycle |
| `main` | the `main` blob only | the blob | full blob every cycle |

On boot the legacy blob loads first, because on the very first boot after migration it is the only
thing that exists. **If any split rows exist they replace it rather than merging over it** — a
merge would resurrect an org deleted after the migration, since `main` still remembers it.

### Rollback, stated honestly

`main` is left untouched at migration time and is **a frozen pre-migration snapshot, not a live
replica.** Rolling back `split` → `main` restores the state as of the migration and **loses every
mutation made after it.** That is the normal property of a migration, and it is the reason `dual`
exists — but `dual` recreates exactly the full-blob egress this work removed, so use it only for a
deliberately short verification window, never as a steady state.

Do not delete the `main` row.

## Verifying in production

### Size of the legacy blob

```sql
SELECT pg_size_pretty(pg_column_size(store_value)) AS blob_size,
       pg_column_size(store_value) AS blob_bytes,
       updated_at
  FROM iq_store
 WHERE store_key = 'main';
```

### Largest split rows

```sql
SELECT store_key,
       pg_size_pretty(pg_column_size(store_value)) AS size,
       pg_column_size(store_value) AS bytes,
       updated_at
  FROM iq_store
 WHERE store_key LIKE 'store:%'
 ORDER BY pg_column_size(store_value) DESC
 LIMIT 20;
```

The same numbers are available in-process via `db.storeSizes(limit)`.

### Save behaviour

`GET /api/admin/persistence` (org superadmin, or platform owner via `x-platform-key`) answers the
one question the repository never could: **does a write now cost what changed?**

```jsonc
{
  "mode": "split", "debounceMs": 1500,
  "saves": {
    "cycles": 412, "noopCycles": 180,    // cycles that wrote nothing
    "bytesSerialised": 181000000,        // bytes held and hashed
    "bytesWritten": 402000,              // bytes that actually left the process
    "writtenShare": 0.00222,             // ← the headline ratio
    "unitsWritten": 480, "deletes": 3,
    "queued": 12,                        // saves coalesced into a run in flight
    "retries": 0, "failures": 0,
    "avgMs": 14, "maxMs": 210,
    "largestUnit": { "key": "store:orgSignals:trafford", "bytes": 156000 }
  },
  "lastSave": { "units": 2, "bytes": 900, "serialised": 451000, "ms": 11 },
  "inMemory": { "units": 19, "bytes": 451000 },
  "largestUnits": [ /* … */ ],
  "unclassified": [ /* … */ ],
  "storedRows": [ /* platform owner only — real Postgres row sizes */ ]
}
```

`writtenShare` is the architectural hypothesis as a number. Low is the whole point.

Set `SAVE_TRACE=1` for a per-cycle line:

```
[save] 2 unit(s) 0.9 KB written of 440.6 KB held, 11ms — store:inquiryStates:trafford, store:assistantConversations:trafford
```

### Classification anomalies

The `:_` catch-all is what makes "no key can silently vanish" structurally true, so it stays. The
risk it carries is the opposite one — a real classification mistake living there forever, costing a
full-store rewrite on every save and never being noticed. So unclassified keys are reported in
`unclassified` (store, key, reason, count, first seen) and logged once outside production. Never
fatal: refusing to persist something we merely failed to classify would trade a visible cost for
invisible data loss, which is the wrong way round.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PERSISTENCE_MODE` | `split` | `split` \| `dual` \| `main` |
| `SAVE_DEBOUNCE_MS` | `1500` | quiet period before a save cycle runs |
| `SAVE_RETRY_MS` | `5000` | backoff base after a failed write (caps at 12x) |
| `SAVE_TRACE` | off | `1` logs every save cycle |
| `SIGNAL_CHUNK_SIZE` | `100` | maximum signal records per durable row (minimum 25) |

## High-volume stores

`orgSignals` and `memberCheckins` previously accounted for roughly 87% of persisted weight. The
generic per-org split still made one signal append rewrite the org's complete signal history and
one check-in rewrite every member's check-ins. They retain their existing in-memory shapes but now
use finer durable units:

- `orgSignals` uses stable, ordered chunks, so an append rewrites only the final bounded chunk.
- `memberCheckins` uses one top-level member key per row, so one person's check-in never rewrites
  another person's history.

The first save after deploying this topology writes the new rows and removes the superseded
per-org rows. If both shapes exist after an interrupted migration, reconstruction treats the new
shards as authoritative and never loads both. The legacy `main` recovery row remains untouched.

Reconstruction also seeds the persisted hash baseline. Without that baseline, the first ordinary
save after every deploy uploaded every split row again even when almost nothing had changed.

## Tests

- `scripts/persistence-smoke.js` — the boundary: classification loses nothing, an unchanged save
  writes nothing, one org never rewrites another, single-writer, deletion, failure/retry.
- `scripts/persistence-durability-smoke.js` — restart durability through the real `_reconstruct`
  path: intelligence continuity, audit continuity, safeguarding continuity, deletion never undone
  by the stale blob, and erasure actually erasing.
