# High / Low / Inquiry / Focus — object contract, and the Focus implementation brief

**Status:** CURRENT implementation brief. **Nothing implemented.**
**Stages 5 and 6** of the final pre-implementation hardening program. Preceded by `b459a10`.
**Written against:** `b459a10`. Field lists read from the code, not from prior documents.

---

## PART 1 — THE OBJECT MATRIX (Stage 5)

### 1.1 · Four objects, two perspectives, **no new object types**

| | **HIGH** | **LOW** | **INQUIRY** | **FOCUS** |
|---|---|---|---|---|
| **Derived or durable** | **derived** | **derived** | **durable** | **durable** |
| Self or Web | both | both | both | both |
| Subject | person (self) / none (web) | same | `member:<id>` or `group:<nodeId>` | person or group |
| Owner | n/a — projection | n/a | the subject | **the person the work is for** |
| Origin | the belief it projects | same | the concept + `provenance[]` | **MISSING — J2** |
| Scope | cohort nodeIds (web) | same | node, for group inquiries | **MISSING** |
| Participants | n/a | n/a | contributors, implicit | **MISSING — G1** |
| Visibility | inherited from basis | same | inherited | derived from subject + participants |
| Audience | `self` \| `leader` | same | reader-dependent | owner + participants |
| Perspective | **derive from subjectRef** (L-C5) | same | from `subjectRef` | from `subjectRef` |
| Evidence relationship | projects a belief; no basis rendered to a leader | same | `signals[]` — **refs only, never content** | **MISSING** — `evidenceRefs` |
| Correction behaviour | recomputed on read; withdraws | same | `supersede` + timeline entry | **none today** |
| Contest behaviour | n/a | n/a | `status: 'disputed'`, first-class | **none today** |
| Outcome relationship | may cite an outcome | same | resolution | `outcome: helped\|no\|mixed` |
| Who may create | nobody — computed | nobody | intake (self) / `_admitGroupContributions` (group) | **only via `/api/me/prepared/act`** |
| Who may close | n/a | n/a | resolution or refutation | the owner |
| Who may contribute | n/a | n/a | anyone admissible, through `ai/contribution.js` | **nobody — single-writer** |

### 1.2 · The rule that keeps it four objects

> **L-OB1.** Perspective is **derived from `subjectRef` at projection time**, never stored. A
> `subjectRef` naming the reader yields `self`; a group ref or an absent subject on an aggregate
> yields `web`. There are four objects and eight *views*, and the views are computed.

Storing perspective is what creates eight types. PR #74 currently accepts `perspective` as an input
(`ai/proactive.js:215`), which is the first step down that road and is why C4 item 3 requires
deriving it.

### 1.3 · What already exists

**Inquiry is complete.** `newInquiry` (`ai/diagnose.js:320`) carries `inquiryId`, `subjectRef`,
`canonicalMeaning`, `displayLabel`, `aliases[]`, `parentId`, `provenance[]`, `topic`, `polarity`,
`hypotheses[]`, `leadingHypothesisId`, `signals[]`, `missingSignals[]`, `falsifiers[]`,
`confidence{score,band,because}`, `status`, `timeline[]`, `createdAt`, `lastUpdatedAt`.

It needs **one** field: `servesObjectiveId` (**J1**). Everything else the matrix asks for is present.

**High and Low need nothing.** They are `polarity → BUCKET → behaviour.plan`. Creating a store for
either would be a regression.

**Focus is the unfinished object.** Today, in full:

```js
{ id, text, type, status, outcome, createdAt, resolvedAt }
```

Seven fields, one of which is free text. It runs the whole loop and remembers nothing about why.

### 1.4 · Missing-field classification

| Field | Object | Class | Why |
|---|---|---|---|
| `origin { by, from }` | Focus | **PILOT BLOCKER** | intent is unrecoverable once records exist |
| `subjectRef` | Focus | **PRE-PILOT** | required for L-OB1 to derive perspective |
| `servesObjectiveId` | Inquiry | **PRE-PILOT** | J1; unlocks two Level-1 sweeps |
| `scopeNodeId` | Focus | POST-PILOT | needed for group/org Focus |
| `participants[]` | Focus | POST-PILOT | G1; needed for shared Focus |
| `evidenceRefs[]` | Focus | POST-PILOT | links work to what prompted it |
| `ownerId` / `createdBy` | Focus | **PRE-PILOT** | two distinct people once a coach can propose |
| `interventionRefs[]` | Focus | POST-PILOT | J3-adjacent |
| `progress[]` | Focus | NOT NEEDED for pilot | `status` + `outcome` suffice |
| `goal` | Focus | NOT NEEDED | `text` carries it |

**Three pre-pilot fields, one of them a blocker.** Everything else waits.

---

## PART 2 — THE FOCUS IMPLEMENTATION CONTRACT (Stage 6)

### 2.1 · The storage decision, and it is not the obvious one

**Focus must move out of `userAiProfiles` before it becomes multi-writer.**

`userAiProfiles` is keyed `` `${orgCode}:${userId}` ``. `_durableUnits` (`server.js:212`) partitions
on the org prefix, so **every user profile in an organisation shares one durable unit**:
`store:userAiProfiles:<org>`.

Consequences:

1. **Today** — a Focus write already contends, under P0-3 CAS, with every unrelated profile write in
   the same org. Tolerable: writes are rare and the CAS retries.
2. **With participants** — a shared Focus would live inside *one participant's* profile. The other
   participants would write into a blob they do not own, and the object's identity would depend on
   whose profile happened to hold it. That is wrong independently of concurrency.

> **L-F0 (proposed).** A Focus with more than one writer must not be stored inside any one
> participant's record. Shared Focus lives in `orgFocuses[code]` — org-partitioned like every other
> store, riding the same durable-unit CAS, with the owner as a **field** rather than as the storage
> location.

**Sequencing consequence:** the `origin` field (the pilot blocker) can land in `mem.focuses` today
with no move. The **move** is required only when participants arrive, and should happen *in the same
change* as participants — never after, because migrating live shared objects is worse than migrating
private ones.

### 2.2 · The record

```
Focus {
  id, text, type, status, outcome, createdAt, resolvedAt,   // exist today

  origin: {                        // NEW — PILOT BLOCKER (J2, G2)
    by:   'self' | 'coach' | 'leader' | 'system',
    from: null | { kind: 'inquiry' | 'high' | 'low' | 'assessment', ref: string }
  },
  ownerId,                         // NEW — PRE-PILOT; the person the work is FOR
  createdBy,                       // NEW — PRE-PILOT; may differ from ownerId
  subjectRef,                      // NEW — PRE-PILOT; 'member:<id>' | 'group:<nodeId>'

  scopeNodeId,                     // POST-PILOT; null = personal
  participants: [ { userId, role, invitedBy, invitedAt,
                    state: 'invited'|'accepted'|'declined'|'left', respondedAt } ],
  evidenceRefs: [],                // POST-PILOT
  interventionRefs: []             // POST-PILOT
}
```

**Two axes, not seven enum values.** The founder's candidate list (`SELF_CREATED`, `COACH_CREATED`,
`INQUIRY_DERIVED`, …) conflates *who acted* with *what prompted it*, which makes "coach-created from
an Inquiry" unrepresentable. `{by, from}` represents all seven and their combinations.

**`participants` is a list of objects, not ids.** A bare `participantIds: []` cannot express
invitation, acceptance, decline or departure, and would force those states into a parallel structure.

### 2.3 · The lifecycle

| Transition | Who | Precondition | Record |
|---|---|---|---|
| personal create | owner | — | `origin.by='self'`, `ownerId=createdBy` |
| coach **propose** | coach | coach may see the owner (GATE) | `origin.by='coach'`, `status='proposed'` |
| coach **create** | coach | **D-W3** — open | `origin.by='coach'`, `status='active'` |
| accept a proposal | owner only | `status==='proposed'` | `status='active'`, `acceptedAt` |
| decline a proposal | owner only | `status==='proposed'` | `status='declined'` — **kept, not deleted** |
| invite a participant | owner or creator | invitee exists in the org | `participants[] += {state:'invited'}` |
| accept invitation | the invitee only | invited | `state='accepted'` |
| decline invitation | the invitee only | invited | `state='declined'` |
| leave | the participant only | accepted | `state='left'`, `respondedAt` — **history preserved** |
| remove a participant | owner or creator | — | `state='left'`, `removedBy` |
| close | owner only | active | `status='done'`, `resolvedAt` |
| record outcome | owner only | done | `outcome`, then `_recordNoticeFeedback` |

**Nothing is deleted.** `declined` and `left` are states, so a Focus that a person left still records
that they were once part of it — which is what makes the outcome interpretable later.

### 2.4 · THE PARTICIPATION LAW — the one that must not bend

> **L-F1 (ratified, restated).** Focus participation grants access to **that Focus object and the
> records legitimately exposed through it**. It adds **no node** to the participant's Web, grants no
> sibling, ancestor or descendant visibility, and does not survive the participant leaving or the
> Focus closing.

A physio invited into a player's Focus gains: the Focus text, its status, its participant list, its
outcome, and any evidence explicitly attached to it. They gain **nothing** about the player's node,
their other Focuses, their Inquiries, their check-ins, or any other member of their squad.

> **L-F2.** A coach-created Focus records the coach's statement at the **coach's** evidence class. It
> does not become empirical truth about the player. **P0-D precedence is unchanged**: an empirical
> claim remains empirical regardless of who created the Focus containing it.

> **L-F3.** Participation is read from the **explicit** `participants[]` list and nowhere else.
> Inferring participation from message authorship, evidence attachment, or co-membership would make
> *reading* into a *grant*.

### 2.5 · THE OBJECT-BRIDGE TEST SUITE

The suite that makes L-F1 executable. Every assertion is a *negative* — what participation must
**not** yield.

| Id | Invariant | Method |
|---|---|---|
| **B-1** | After accepting an invitation, `visibleNodesFor(nodes, physio)` is **byte-identical** to before | snapshot before/after |
| **B-2** | `getVisibleUserIds(code, physio)` is unchanged by participation | snapshot |
| **B-3** | The physio's `_orgAdmissibleEvidence` set is unchanged | snapshot |
| **B-4** | The physio can read the Focus | positive control — without it B-1..3 pass vacuously |
| **B-5** | The physio cannot read the player's other Focuses | direct fetch ⇒ 403/absent |
| **B-6** | The physio cannot read the player's Inquiries | ⇒ 403/absent |
| **B-7** | The physio gains no sibling participant's records | ⇒ absent |
| **B-8** | After `state='left'`, Focus access is revoked | fetch ⇒ 403 |
| **B-9** | After the Focus closes, access is revoked for non-owners | ⇒ 403 |
| **B-10** | A Focus aggregate over participants obeys the **two-sided floor** (L-PR1) | one-participant Focus ⇒ no aggregate |
| **B-11** | Participation across a tenant boundary is refused | cross-org invite ⇒ 400/403 |
| **B-12** | Participation confers no **routing** target — `routeTarget` unchanged | snapshot |

**B-4 is the one people forget.** Without a positive control the whole suite passes on a broken
implementation that grants nothing at all.

**B-10 matters more than it looks.** A Focus with one participant plus its owner is `n = 2`; any
outcome aggregate over it names both. The two-sided floor applies to participant sets exactly as it
applies to node cohorts.

### 2.6 · Where P0-3 CAS applies

| Write | Store | Unit | Contention |
|---|---|---|---|
| personal Focus create/close | `userAiProfiles` | `store:userAiProfiles:<org>` | already shared org-wide; tolerable |
| shared Focus create/close | **`orgFocuses`** (new) | `store:orgFocuses:<org>` | owner + participants |
| invitation response | **`orgFocuses`** | same | **two actors, one object — genuine CAS need** |
| outcome | `orgFocuses` | same | owner only |

> **L-F4.** Every participant-state transition is a compare-and-set on the Focus record. Two people
> accepting simultaneously must both succeed; a stale `state` transition must be refused, not merged.

`orgFocuses[code]` inherits `_durableUnits` partitioning and the P0-3 CAS automatically — the store
must simply be added to `_persistedStores` (`server.js:184`). **No new persistence machinery.**

### 2.7 · Implementation packets

#### F-A · `origin` on Focus — **PILOT BLOCKER**

- **Files:** `server.js:4846` (create), `:1265` (`_getMemory` shape)
- **RED:** a new Focus without `origin` fails a schema assertion; an existing Focus without it reads
  safely as `origin: {by:'self', from:null}` **only when it predates the change** — not as a default
  for new writes
- **Adversarial:** a Focus created through any other path also carries `origin`; assert by enumerating
  every writer of `mem.focuses`
- **Non-goals:** the coach path, participants, the store move
- **Done:** every new Focus carries `{by, from}`; no back-fill attempted

#### F-B · `ownerId` / `createdBy` / `subjectRef` — PRE-PILOT

- **RED:** `ownerId !== createdBy` is representable; `subjectRef` derives perspective per L-OB1
- **Non-goals:** allowing them to differ in the UI yet

#### F-C · `orgFocuses` + participants — POST-PILOT, **one change, not two**

- **Files:** new store in `_persistedStores`; create/close/invite/respond endpoints
- **RED:** the twelve bridge invariants B-1..B-12, **written before the store exists**
- **Adversarial:** B-1..B-3 must be snapshot comparisons, not "the physio cannot see X" spot checks —
  a spot check misses a widening the author did not anticipate
- **Stop if:** any bridge invariant cannot be expressed as a before/after snapshot

### 2.8 · Founder decision — unchanged, still non-blocking

**D-W3** — may a coach create a Focus directly, or only propose one? The `origin.by` field lands
regardless; the lifecycle table above supports all three answers without restructuring. Recommended:
create directly with a decline action (option C), but this is a values question about the
coach-player relationship at Falcon.
