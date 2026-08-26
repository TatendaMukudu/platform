# Person-model temporal correction — implementation contract

**Status:** CURRENT implementation brief. **Nothing implemented.**
**Stage 7** of the final pre-implementation hardening program. Preceded by `acf4c9b`.
**Written against:** `acf4c9b`. The defect below was **executed**, not reasoned about.

**Governing law (ratified):**

> **MEMORY MAY BE DURABLE. BEHAVIOURAL INTERPRETATION MUST NOT BECOME PERMANENT IDENTITY.**

---

## 1 · The defect, proven

Run against `ai/person-model.js` at `acf4c9b`:

```
after 50 observations of 'direct' (2026) then 20 of 'gentle' (2028):
  understanding: {"value":"direct","evidence":50}
  raw counts   : {"direct":50,"gentle":20}

after 3 observations in a single difficult day:
  understanding: {"value":"pressure","evidence":3}
```

**Two distinct failures, and the second is the more damaging.**

### D-1 · A person cannot change

`m[dim][t] = (m[dim][t] || 0) + 1` (`:61`) is a monotonic lifetime counter. `_leader()` (`:80`)
sorts raw totals. Two years and a genuine behavioural change later, the model still reports the 2026
reading, and reports it with *more* evidence than the current one.

### D-2 · One bad week becomes a permanent characterisation

There is **no per-observation timestamp**. The model stores `{ token: count }` per dimension plus a
model-level `updatedAt`. Three observations clear `FLOOR = 3` regardless of whether they arrived
across three months or three hours of one difficult afternoon.

**D-2 is worse than D-1** because it is how a person gets mislabelled in the first place, and because
no decay function fixes it — decay ages a count, it does not ask whether the count represents a
habit or an episode.

### D-3 · The same defect, second site

`_capabilityDims` (`server.js:8004-8019`) counts **all** capability observations and takes the top
three. Its source `_capabilityObservations` (`:7988`) reads `at` and **sorts by it** (`:8002`) — then
`_capabilityDims` discards the ordering. The timestamps are present and thrown away.

### D-4 · What is *not* broken

- `publicProjection` (`:112`) leaks nothing — `{hasModel, interactions}` only.
- The vocabulary guard (`:26-32`) means raw text cannot enter, so no amount of staleness leaks
  content.
- `ai/self-model.js` is **correct** and is the template (§3).

---

## 2 · The distinction the fix must preserve

> **L-PM1 (proposed).** Historical behavioural **evidence** and current behavioural **inference** are
> different objects with different lifetimes. Evidence is durable and never deleted by ageing.
> Inference is a read over evidence within a window, and must expire when the window closes.

Concretely: the fifty 2026 `direct` observations remain true history. What must not survive is the
*assertion* "this person communicates directly", made in 2028 on 2026 evidence.

This is exactly the ratified law, and it rules out the two tempting shortcuts:

- **deleting old counts** — violates "memory may be durable";
- **decaying counts into a weighted score** — destroys the distinction, because a weighted number is
  neither evidence nor a legible inference, and cannot be shown to the person as "we have seen this
  on six separate days".

---

## 3 · The correction, taken from the sibling module

**No new window is chosen.** `ai/self-model.js` already implements the complete treatment, for the
same kind of data, with the same privacy posture:

| Mechanism | `self-model.js` | `person-model.js` |
|---|---|---|
| **distinct-days** | `h.days[]` deduped by `Math.floor(t / DAY)` (`:66-67`) — *"Confidence is the number of DISTINCT DAYS a pattern recurred (a habit, never a one-off)"* | **absent** |
| `firstSeen` / `lastSeen` | `:63`, `:68-69` | **absent** |
| **dormancy** | `(now - lastSeen) > STALE`, `STALE = 30 * DAY` (`:29`) | **absent** |
| dismissal | `suppressUntil`, `DISMISS = 14 * DAY` (`:30`) | **absent** |
| rejection | `REJECT = 180 * DAY` (`:31`) | **absent** |
| confidence from recurrence | `_conf(days)` — 6 clear, 3 emerging (`:47`) | `FLOOR = 3` on a raw count |

> **Recommendation: port distinct-days counting and dormancy from `ai/self-model.js`.**

Distinct-days fixes **D-2**, which decay alone cannot. Dormancy fixes **D-1**. Together they need
**no new constant** — `STALE = 30 * DAY` is already ratified next door — and they make two sibling
modules consistent where they currently diverge for no stated reason.

### The record shape

```js
// before
m[dim] = { direct: 50, gentle: 20 }

// after
m[dim] = {
  direct: { days: [19723, 19725, …], firstSeen: <ms>, lastSeen: <ms> },
  gentle: { days: […],               firstSeen: <ms>, lastSeen: <ms> }
}
```

`days` is an array of day-indices, deduped exactly as `self-model.js:66` does. The count is
`days.length`. **Nothing is deleted; the shape simply stops pretending an episode is a habit.**

### Reading

```js
_leader(counts, floor, now):
  candidates = entries
    .filter(([, v]) => (now - v.lastSeen) <= STALE)     // dormant → excluded, retained
    .map(([tok, v]) => [tok, v.days.length])
    .sort(desc)
  if (!candidates.length)          return null
  if (top < floor)                 return null
  if (top === runnerUp)            return null          // existing tie rule, unchanged
  return { value, evidence: top, lastSeen, firstSeen }
```

Three properties preserved from today: the floor, the tie rule, and returning `null` rather than
guessing.

---

## 4 · TEST CONTRACT

`scripts/person-model-temporal-smoke.js` (new). Every case is a timeline, not a count.

| Id | Case | Setup | Assert | Fails today? |
|---|---|---|---|---|
| **PM-1** | **bursty observation** | 5 observations of `pressure`, all within one day | `understanding().overwhelmers === undefined` | **YES** — asserts `pressure` |
| **PM-2** | **genuine habit** | 5 observations of `pressure` across 5 distinct days | asserted, `evidence: 5` | passes |
| **PM-3** | **long dormancy** | 50 `direct` days ending 400 days ago | `understanding().communication === undefined` | **YES** |
| **PM-4** | **recent change** | 50 `direct` days (2 years ago) + 20 `gentle` days (recent) | asserted value is `gentle` | **YES** — returns `direct` |
| **PM-5** | **mixed live evidence** | 10 `direct` + 10 `gentle`, both recent | `null` — the tie rule holds | passes |
| **PM-6** | **old high-volume vs new low-volume** | 50 old `direct` days + 4 recent `gentle` days | `gentle` | **YES** |
| **PM-7** | **history is retained** | after PM-3, the raw record still contains the 50 days | present | n/a — new |
| **PM-8** | **reactivation** | after PM-3, one fresh `direct` observation | the dimension returns with its **full** history, not a count of 1 | n/a — new |
| **PM-9** | **correction** | a dimension the person disputes | excluded from `understanding()`, retained in the record | **YES** — no mechanism |
| **PM-10** | **contest** | two sources disagree on a dimension | neither asserted | passes via the tie rule |
| **PM-11** | **`publicProjection` unchanged** | any of the above | `{hasModel, interactions}` only, no dimension | passes; must not regress |
| **PM-12** | **capability dims are recency-aware** | 10 old + 3 recent observations at `server.js:8009` | recent dominate | **YES** — D-3 |

**PM-8 is the one that proves L-PM1.** Reactivation restoring the full history — rather than starting
from one — is what distinguishes "durable memory, expired inference" from "we forgot".

**PM-9 needs a mechanism that does not exist.** `self-model.js` has `REJECT = 180 * DAY` for *"that's
not a thing I do"*. Porting it is in scope; a bespoke correction path is not.

---

## 5 · IMPLEMENTATION PACKET

**Title:** person-model temporal correction (O-1)
**Why now:** a live defect — a 2026 reading outranks a 2028 one, permanently, and one difficult day
establishes a dimension.
**Authoritative law:** ratified R9; L-PM1 above.

**Starting repository truth**
- `ai/person-model.js:61` — monotonic counter, no per-observation time
- `ai/person-model.js:80` — `_leader` sorts raw totals
- `ai/self-model.js:29,66-69` — the template
- `server.js:8004-8019` — `_capabilityDims` discards `at`

**Files to inspect:** `ai/person-model.js`, `ai/self-model.js`, `server.js:7988-8019`, every caller of
`person-model.understanding`.
**Files expected to change:** `ai/person-model.js`, `server.js:8009`,
`scripts/person-model-temporal-smoke.js` (new), `scripts/test.js` (registry).

**RED test:** PM-1, PM-3, PM-4, PM-6, PM-12 — five failures before any change.
**Adversarial RED:** PM-8 — a naive dormancy fix that *drops* dormant entries passes PM-3 and fails
PM-8. Reactivation must restore the full history.

**Implementation constraint**
- Reuse `STALE` from `ai/self-model.js`; **do not introduce a new constant**.
- **No weighted or decayed scores.** `evidence` must remain a legible count of distinct days.
- Migration: an old-shape `{token: number}` reads as `{days: [], firstSeen: null, lastSeen: null}`
  and is treated as **dormant** — historical, not asserted. Do not synthesise timestamps.

**Non-goals:** deleting history; a person-facing erase surface (D-O1, additive later); changing
`FLOOR`; touching `publicProjection`; a correction UI.

**Regression suites:** `person-model-smoke` (if present), `proactive-smoke`, `endpoint-smoke`,
full `npm test`.

**Stop conditions**
- Any consumer reads `m[dim][token]` as a number directly — report the list before changing shape.
- `publicProjection` output changes in any way.
- The migration would require inventing a timestamp for existing data.

**Definition of done:** PM-1 through PM-12 green; `npm test` green; no new temporal constant; the
old-shape migration is read-only and asserts nothing.

**Commit boundary:** one commit for `ai/person-model.js` + its suite; a **second** for
`_capabilityDims` (D-3), because it has different consumers and a different blast radius.

**Dependencies:** none. Independent of PR #74, W-3 and Focus.

---

## 6 · Founder decision — unchanged, non-blocking

**D-O1** — is a dormant dimension *quiet* or *forgotten*? **Answered by R9** (Stage 1, Class B):
"memory may be durable" rules out deletion, "interpretation must not become permanent identity" rules
out surfacing. **Quiet is the only reading satisfying both**, and it is what `self-model.js` already
does.

A person-controlled erase remains a possible additive feature. It blocks nothing: both readings keep
the record and differ only in who may remove it.
