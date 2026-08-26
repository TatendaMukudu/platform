# Ontology integration and behavioural decay

**Status:** ratification + architecture options. **Nothing implemented.** No production code changed.
**Stage E** of the autonomous architecture loop. Preceded by `c5971ad` (peer Web semantics).
**Integrates:** `ff56cca` — `docs/ttd/organisational-ontology-investigation.md`.
**Written against:** `c5971ad`.

---

## 1 · Ratified from the ontology audit

The following are promoted from investigation findings to **standing architectural positions**. No
new ontology project is started.

### R-1 · IntelliQ already possesses most ontology benefits

Through evidence envelopes, typed signals, the epistemic ladder
(`ai/diagnose.js:44-48`), observations, hypotheses with `supportRefs`/`challengeRefs`, a typed
relationship vocabulary (`:925`), provenance (`originRef`/`originKind`), contest state, visibility,
correction and supersession.

**Consequence:** any future proposal to "add an ontology" must first say which of these it improves.
A proposal that merely renames them is refused.

### R-2 · No new ontology project, no graph database

Restated from `ff56cca` §11 and reinforced by Stage B §5, which supplied the numeric threshold at
which the question may reopen (**L-B2**: >10,000 nodes per org, or traversal depth >6, or
variable-length paths). Falcon meets none.

### R-3 · The missing joins are foreign keys, not architecture

| Id | Join | Priority | Note |
|---|---|---|---|
| **J1** | `Inquiry → Objective` | PRE-PILOT | = P0-C. Unlocks two Level-1 sweeps |
| **J2** | `Focus → origin { by, from }` | **PILOT BLOCKER** | intent is unrecoverable if records exist first |
| **J3** | `Intervention → Inquiry` | PRE-PILOT | today `reason` is the string literal `'briefing'` (`server.js:4312`) |
| **J4** | `Decision → decidedAt/By/consideredEvidence` | POST-PILOT | harness addendum §4: watch a dozen real decisions first |
| **J5** | `Behaviour → organisational aim` | **DEFERRED** | needs real Falcon capability observations |

**J2 is the only pilot blocker among them**, and only because `origin.by` cannot be back-filled:
whichever way D-W3 (coach-created vs proposed Focus) is decided, it cannot be enforced against
records created without the field.

### R-4 · O-6 stands: no general graph traversal API

> Every query is purpose-scoped and governance-aware. *"Show me the graph around this person"* is
> not a supported query and must never become one.

Stage D strengthens this into a type-level guarantee for comparison scopes (L-P1). The same
discipline should eventually apply to any bearing accessor: it goes through a purpose-scoped
function that applies visibility per record, exactly as `_capabilityObservations`
(`server.js:7988`) does today.

### R-5 · The behavioural law

> **MEMORY MAY BE DURABLE. BEHAVIOURAL INTERPRETATION MUST NOT BECOME PERMANENT IDENTITY.**

Ratified. §2 specifies how.

---

## 2 · O-1 — PERSON-MODEL DECAY

### The defect, restated precisely

`ai/person-model.js:61`:

```js
m[dim][t] = (m[dim][t] || 0) + 1;
```

Monotonic lifetime counters. `_leader()` (`:80`) sorts raw totals and returns the top token once it
clears `FLOOR = 3`. There is no timestamp per observation, no window, no decay, no dormancy.

Consequences, all live today:

1. **A person cannot change.** Fifty `direct` observations in 2026 outrank twenty `gentle` in 2028,
   permanently.
2. **One intense period establishes a dimension forever.** Three observations in a single difficult
   week clear `FLOOR` and never expire.
3. **`interactions` only ever grows**, so `publicProjection` reports lifetime volume as if it were
   current engagement.

The same defect exists in a second place: `_capabilityDims` (`server.js:8009`) counts **all**
capability observations regardless of age and takes the top three. The observations themselves carry
`at` and are sorted by it (`:8002`) — the timestamps are present and then discarded.

### The finding that settles the architecture

**The decay architecture does not need inventing. It is already implemented in the sibling module.**

`ai/self-model.js` — same author, same purpose, same privacy posture — implements the complete
temporal treatment that `person-model.js` lacks:

| Mechanism | `self-model.js` | `person-model.js` |
|---|---|---|
| **distinct-days counting** | `h.days[]`, deduped by `Math.floor(t / DAY)` (`:66-67`) — *"Confidence is the number of DISTINCT DAYS a pattern recurred (a habit, never a one-off)"* | **absent** — raw increments |
| `firstSeen` / `lastSeen` | `:63, :68-69` | **absent** |
| **dormancy** | `dormant = (now - lastSeen) > STALE`, `STALE = 30 * DAY` (`:29`) | **absent** |
| dismissal cooldown | `suppressUntil`, `DISMISS = 14 * DAY` (`:30`) | **absent** |
| **rejection** | `REJECT = 180 * DAY` (`:31`) — *"that's not a thing I do"* | **absent** |
| confidence from recurrence | `_conf(days)` (`:47`) — 6 days clear, 3 emerging | `FLOOR = 3` on raw count |

**Distinct-days counting is the more important half, and it is better than decay.** It prevents one
intense day from establishing a dimension at all, which is the failure mode most likely to mislabel
someone during a hard week. Decay alone would not fix that.

### Options, grounded in repository precedent

The brief says not to select a decay window arbitrarily. None of these is arbitrary — each has an
in-repo precedent.

| Option | Mechanism | Precedent | Assessment |
|---|---|---|---|
| **A · Dormancy only** | mark a dimension dormant when `now - lastSeen > STALE`; dormant dimensions are excluded from `understanding()` but retained | `self-model.js:29` (30d), `reason.js:38` (21d) | Simplest. Fixes "a person cannot change" but not "one intense week". |
| **B · Distinct-days + dormancy** | count distinct days rather than events; then A | `self-model.js:66` + `:29` | **Recommended.** Fixes both failure modes, copies a ratified design, and needs no new constant beyond reusing `STALE`. |
| **C · Sliding window** | count only observations within a trailing window | `baseline.js:24-25` (14d recent / 90d baseline), `intelligence.js:26-27` (14/42) | Discards history rather than ageing it. Conflicts with "memory may be durable". |
| **D · Exponential half-life** | weight each observation by `0.5^(age/halfLife)` | **none in repo** | Would introduce the first continuous decay function in the codebase. More expressive, less inspectable, and it makes `FLOOR` meaningless (a weighted count is not a count). |
| **E · Supersession** | a contradicting observation supersedes an older one | `diagnose.js:485` | Wrong shape: behaviour is not a claim that can be wrong, it is an observation that can be old. |

### Recommendation

> **Option B — distinct-days counting plus dormancy, ported from `ai/self-model.js`.**

Rationale: it is the only option that fixes both failure modes, it introduces **no new constant and
no new idiom**, and it makes two sibling modules consistent where they are currently divergent for
no stated reason. The window is not chosen arbitrarily — it is `self-model.js`'s already-ratified
`STALE = 30 * DAY`, applied to the module that should have had it.

**Reject D** despite its elegance: a weighted count cannot be shown to a person as *"we have seen
this on six separate days"*, and `ai/person-model.js`'s stated design law is that the model is *"the
person's; it is designed to be shown back to them and corrected"* (`:13-14`). Inspectability is a
product requirement here, not a preference.

### Scope of the fix

| Site | Change |
|---|---|
| `ai/person-model.js` `update()` | record distinct days per token; carry `firstSeen`/`lastSeen` |
| `ai/person-model.js` `_leader()` | rank by distinct-day count; skip dormant |
| `ai/person-model.js` `publicProjection()` | report *recent* interactions, not lifetime |
| `server.js:8009` `_capabilityDims` | weight or window by `at`, which it already reads and discards |
| any bearing (J5, later) | carry `observedWindow` from the outset |

### The remaining founder decision

**Whether a dormant dimension is forgotten or merely quiet** is a product judgement, not an
architectural one — recorded as D-O1 (§4). The repository precedent (`self-model.js`) keeps dormant
habits in the ledger and excludes them from surfacing, which is *quiet*, not *forgotten*. That
matches "memory may be durable" and is the recommended reading, but the founder may want a genuine
right-to-be-forgotten horizon on behavioural interpretation specifically.

---

## 3 · TRACKING

Gap register entries, folded into `intelliq-constitution.md` §13 at the next hygiene pass (Stage H):

| Id | Gap | Priority | Completion criterion |
|---|---|---|---|
| **J1** | Inquiry → Objective | PRE-PILOT | an inquiry names the objective that produced it |
| **J2** | Focus → origin | **PILOT BLOCKER** | every new Focus records `origin.by` and `origin.from` |
| **J3** | Intervention → Inquiry | PRE-PILOT | `respondsToInquiryId` replaces the `'briefing'` literal |
| **J4** | Decision as history | POST-PILOT | a decision records decider, date and evidence considered |
| **J5** | Behaviour → aim | DEFERRED | a bearing is testable as a hypothesis |
| **O-1** | Person-model decay | PRE-PILOT | a 2026 dimension does not outrank a 2028 one; one intense week does not establish a dimension |

---

## 4 · FOUNDER DECISION

### D-O1 · Is a dormant behavioural dimension quiet or forgotten?

**Scenario.** A player was observed as `overwhelmed by uncertainty` throughout a difficult 2026
season. By 2028 nothing has been observed on that dimension for eighteen months.

- **Option A — quiet.** The dimension is retained, excluded from `understanding()` and from anything
  surfaced, but remains in the ledger and would reactivate on fresh evidence.
  *Precedent:* `self-model.js` treats dormant habits this way. *For:* consistent with "memory may be
  durable"; reactivation is faster and better-evidenced. *Against:* the organisation still holds a
  record of an interpretation the person may consider long past.
- **Option B — forgotten.** After a horizon, the dimension is deleted outright.
  *For:* the strongest possible expression of "behavioural interpretation must not become permanent
  identity"; the cleanest thing to tell a school. *Against:* discards genuine longitudinal signal,
  and a returning pattern looks new when it is not — which is itself worth knowing.
- **Option C — quiet, with a person-controlled erase.** Dormant by default; the person may delete a
  dimension permanently from their own model.
  *For:* matches the module's stated law that the model is the person's and is designed to be shown
  back and corrected; puts the durable-vs-forgotten choice with the only person entitled to make it.
  *Against:* needs a surface.

**Recommendation: C, with A as the default until the surface exists.** A is already the repository
precedent and is safe; C is the correct end state because `person-model.js`'s own header already
commits to the model being the person's to correct — erase is the natural extension of correction,
not a new principle.

**Blocks:** nothing in the pilot. O-1's implementation can proceed on A and adopt C later without
rework, because both keep the record and differ only in who may remove it.
