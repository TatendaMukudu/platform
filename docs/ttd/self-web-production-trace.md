# Self and Web — production call trace

**Status:** CURRENT. Traced call graph with citations, not a summary.
**Stage 4** of the final pre-implementation hardening program. Preceded by `b737fab`.
**Written against:** `b737fab`.

**Corrects `docs/ttd/self-and-web-orchestration.md` (Stage C)** on one material point — see §2.

---

## 1 · Headline

**Stage C identified `_kernelEvidence`'s personal branch as "the Self scope". That is true for
grounded answers and attention items, and false for Self Highs and Lows.**

Traced: the Self pattern pipeline is built from `orgSignals`, `memberCheckins` and
**organisation-purpose** assessment evidence. It never reads the personal branch. Consequently:

> **Private evidence reaches Self intelligence only as (a) a contentless `careFlag` and (b) a
> count-based privacy reassurance. It never produces a Self High or a Self Low.**

The founder's own worked example — private *"I'm nervous receiving under pressure"* → **Self Low** —
**is not delivered today.** Self *Inquiry* and Self *Focus* do work. Self High/Low does not.

This is the same structural cause as G3 (no Web → Self path): **the pattern pipeline is
single-subject and signal-fed, and neither end of the two-scope model is wired to it.**

---

## 2 · THE CALL GRAPH

### 2.1 · Write side

```
POST /api/observe · assistant turn · connector · import
  └─ _ingestAdapterEvidence (server.js:7857)
      └─ evidence envelope → evidenceLog[code]
          ├─ visibility: private | sensitive | normal
          ├─ ownerRef, subjectId, promoted:false
          └─ if (orgFacing && !isPrivate && r.promotable)
              └─ _promoteEvidence (:6452)              ← THE SELF→WEB CROSSING
                  └─ _emitSignalSafe (:14840) → orgSignals[code]
                      └─ env.promoted = true

_recordCheckin (:4748) ──────────────────→ memberCheckins[key]
_confirmOrgContext (:9493) ──────────────→ orgContextRecords[code]
```

**One crossing function.** `_promoteEvidence` is the only writer of `promoted = true`, and it refuses
anything `evidence.promotable()` rejects.

### 2.2 · Read side — the two admissible sets

```
_kernelEvidence (server.js:7760)   "the ONLY door to kernel reasoning"
  ├─ PERSONAL_PURPOSES (:7758)  personal_assistance | personal_memory
  │                             | personal_planning | outcome_evaluation
  │     private     → owner only        (env.ownerRef === viewerId)
  │     non-private → subject or owner is the viewer
  │
  └─ ORG_PURPOSES (:7759)       workspace_shared_reasoning | leader_support
                                | group_reasoning | organisation_reasoning
        private     → NEVER
        non-private → env.promoted === true
```

### 2.3 · Self projection — two tributaries, only one of which is Self-scoped

```
GET /api/proactive/insights (:4480)
  └─ _proactiveInsights(code, viewerId, {audience:'self'})   (:4434)
      │
      ├─ TRIBUTARY 1 — patterns  → Self HIGH / LOW
      │   └─ _buildMemberIntelInput(code, subject, now)      (:3836)
      │       ├─ _memberMoodSeries      ← memberCheckins
      │       ├─ _gatherSignals         ← orgSignals
      │       ├─ _assessmentEvidenceFor(..., purpose:'organisation_reasoning')  (:3876)
      │       ├─ orgNotes / orgMessages ← TIMESTAMPS ONLY, and `n.type !== 'private'`
      │       └─ hasSensitiveContext    ← a CONTENTLESS BOOLEAN (:3869)
      │   └─ intel.detectPatterns + primitives.structuralPatterns
      │   └─ proactive.toInsight(finding, {audience:'self', subjectId: viewerId})
      │   └─ proactive.audienceSafe(ins).ok  (:4452)
      │
      └─ TRIBUTARY 2 — attention → Self ATTENTION ITEMS
          └─ _composeToday(code, viewerId)                    (:8595)
              └─ _kernelEvidence(purpose:'personal_assistance', viewerId)  (:8597)
                  └─ privateEv → a COUNT-BASED reassurance only (:8602-8605)
                     "You marked N things private. They've stayed private."
```

**Tributary 1 — which produces Highs and Lows — never touches the personal branch.** It reads
`orgSignals` (post-promotion), `memberCheckins`, and assessments at an **org** purpose.

**Tributary 2 does read the personal branch**, and uses private evidence for a reassurance and for
commitments/actions — never to derive a pattern.

### 2.4 · Web projection

```
GET /api/intelligence/briefing (:4177)
  └─ members = getVisibleUserIds(code, userId)               ← GOVERNANCE, person-level
      └─ per member: _buildMemberIntelInput  ← THE SAME FUNCTION as Self
          └─ intel.detectPatterns + structural
              └─ patternCounts[type]++                        (:4215)
                  └─ _webIntelligence(patternCounts, …)       (:4154)
                      └─ proactive.toInsight({audience:'leader', perspective:'web'})
                          └─ audienceSafe

GET /api/intelligence/packet (:10105)
  └─ _intelligencePacket (:10058)
      └─ scopedPacket.buildPacket({actor, nodes, feed, questions})  (:10096)
          └─ actorScope → orgGraph.visibleScope                ← WEB, node-level
          └─ canUseItem → graph.canSee | subject checks

_getOrgState (:9945)
  └─ _visibleScopeFor (:9836) → orgGraph.visibleNodesFor       ← WEB
      └─ _orgAdmissibleEvidence (:9825) → orgGraph.canSee
```

**Two scope authorities on the Web side**, as GW-1 records: `getVisibleUserIds` for the briefing,
`orgGraph` for the packet and org-state.

### 2.5 · Inquiry and Focus writes

| Object | Write site | Model? | Scope |
|---|---|---|---|
| Self Inquiry | `_intakeTurn` (:9175) → `inquiryStates[code]['member:<id>']` (:9351) | **REQUIRED** — returns early if `!ai.enabled()` | Self |
| Group Inquiry | `_admitGroupContributions` (:12588) → `inquiryStates[code]['group:<nodeId>']` (:12602) | **none** | Web |
| Focus create | `/api/me/prepared/act` (:4838) → `mem.focuses.unshift` | none | Self |
| Focus outcome | `/api/me/focus/outcome` (:4865) → `_recordNoticeFeedback` | none | Self → org learning |

### 2.6 · Corrections and outcomes

```
correction  → diagnose.supersede (:485) → status change → _inheritedVisibility (:7795)
              → derived artifacts inherit the MOST RESTRICTIVE basis visibility
outcome     → orgInterventions[].recordedOutcome → outcomeIntel.summarize
              → Wilson lower bound → efficacy ranking
feedback    → _recordNoticeFeedback → noticeFeedback → confidence.reliability
              → shouldSurface gate on BOTH tributaries
```

---

## 3 · THE TRACE ANSWERS

| Question | Answer |
|---|---|
| Where is Self selected? | `_kernelEvidence` personal branch (`:7768`) — **but only Tributary 2 uses it** |
| Where is Web selected? | `_kernelEvidence` org branch (`:7773`) + `orgGraph.canSee` (`:9830`) + `getVisibleUserIds` (`:4165`) |
| Where is private evidence excluded? | `:7773` — `if (env.visibility === 'private') return false`, **before** context assembly |
| Where could it re-enter? | **Nowhere via evidence.** Three residual channels: `hasSensitiveContext` (contentless, correct); `_composeToday`'s private **count** (self-audience only, correct); and `orgSignals` if `_promoteEvidence` were ever called on a private envelope — currently impossible, guarded twice |
| Where does audience differ from perspective? | `proactive.toInsight` (`:215`) — `audience` is who reads, `perspective` is what it is about. PR #74 accepts `perspective` from the caller; C4 requires deriving it |
| Where does subject differ from scope? | `subjectId` is a person; `scope` is a nodeId. `canUseItem` (`scoped-intelligence-packet.js:51`) branches on which is present |
| Where are Inquiry writes? | `:9351` (Self, model-required) and `:12602` (group, deterministic) |
| Where are Focus writes? | `:4846` (create) and `:4870` (outcome) |
| Where are outcomes fed back? | `_recordNoticeFeedback` → `confidence.reliability` → `shouldSurface` |
| Where are corrections propagated? | `diagnose.supersede` + `_inheritedVisibility`; **not** to `orgSignals` already emitted — see §5 |

---

## 4 · CROSSING ANALYSIS

### SELF → WEB

| Question | Answer |
|---|---|
| Can personal evidence contribute today? | **Yes, if promoted.** `_promoteEvidence` (`:6452`) is the deliberate act; it emits a signal and sets `promoted = true` |
| Should *shared* personal evidence contribute? | **Yes — it already does.** This is the designed path |
| Can *private* evidence contribute anonymously? | **No.** Excluded at `:7773` and refused by `evidence.promotable`. Verified empirically: a private-only member contributes nothing to `patternCounts` |
| Is that ratified? | **Yes** — R7. *"Private evidence currently contributes NOTHING to Web reasoning. Do not change that silently."* Unchanged here |

### WEB → SELF

**No path exists.** `_proactiveInsights` always sets `subjectId` to a person (`:4449`); it has no
branch that produces an aggregate. **The absence is structural, not an oversight of routing.**

---

## 5 · TWO DEFECTS FOUND BY THE TRACE

### T-1 · Self High/Low cannot see the person's own private evidence

**Severity: product gap, not a safety gap.** The founder's example does not work.

`_buildMemberIntelInput` reads `orgSignals`, which contain only **promoted** material, and
assessments at `organisation_reasoning`. A person's private capture therefore cannot produce a Self
Low **about themselves**, even though they are the only audience.

This is *safe* — it errs toward non-disclosure — but it is **wrong**, because Self scope explicitly
includes *"their own evidence; private evidence; personal conversations"* (ratified). The person is
being denied intelligence about their own private material.

**Minimum fix (not implemented):** give `_buildMemberIntelInput` an optional `purpose` argument. For
`audience: 'self'`, pass `personal_assistance` with `viewerId = subjectId`; for the briefing, keep
`organisation_reasoning`. **One argument, two call sites**, and the existing `_kernelEvidence` gate
does the rest.

**Adversarial requirement:** a test must prove the leader briefing does **not** change when a member
adds private evidence, and the member's own Self read **does**. Without both halves, the fix could
silently widen the Web side, since the two share the function.

### T-2 · Corrections do not propagate to already-emitted signals

`_promoteEvidence` copies `value`, `valueText` and `label` into an `orgSignal` (`:6454-6462`). When
the source envelope is later superseded or deleted, **the signal is not revisited**. `_gatherSignals`
reads `orgSignals`, so a corrected observation can continue to influence patterns.

**Severity: pre-pilot correctness.** Bounded by the fact that the signal carries
`data.source.evidence_id` (`:6461`), so the join exists — nothing needs to be invented, only
followed. Recorded as a new gap.

---

## 6 · THE MINIMUM SAFE WEB → SELF PATH

Designed, **not implemented**. Delivers the founder's requirement that a member is not limited to
self-help.

### The shape

A **fourth** artifact class alongside self-High, self-Low and attention: a **Web read** the member
receives *because they are inside the cohort it describes*.

```
memberWebIntelligence(code, viewerId)
  1. cohortNodes = orgGraph.visibleNodesFor(nodes, viewerId)      ← the member's own Web
  2. for each node: aggregate over members of that node
       reusing _webIntelligence's accumulator (post-C2: origins, not people)
  3. apply the TWO-SIDED floor (L-PR1) with n = node membership
  4. toInsight({ audience:'self', perspective:'web' })            ← both fields set
  5. audienceSafe allow-list (post-C4)
  6. behaviour.plan → bucket, cap, calm empty state
```

### The four laws it must satisfy

> **L-WS1.** A member receives a Web artifact only for a cohort **they belong to**. Never a sibling
> cohort, never a parent-only cohort. Their Web bounds which aggregates exist for them.

> **L-WS2.** A member-facing Web artifact carries **no subject and no basis**, exactly as the leader
> form does. `perspective: 'web'` with `audience: 'self'` is a *narrower* artifact than the leader's,
> never a wider one — this is the case C4 item 2 exists to close.

> **L-WS3.** The two-sided floor applies with `n` = the cohort's membership, and the member **counts
> toward `n` but not toward their own privacy protection**. A cohort of two where the member is one
> of them tells them about exactly one other person, so `n - k >= MIN_COHORT` must be evaluated
> excluding the reader.

> **L-WS4.** An Org Inquiry may ask a member a question about **their own** situation and must not
> disclose the org-level evidence that motivated it. The answer enters **Self** scope and reaches Web
> only by ordinary promotion.

L-WS3 is the non-obvious one. It is the complement attack applied from inside the cohort: the reader
already knows their own status, so their own membership provides no anonymity. **The effective
population for a member-facing aggregate is `n - 1`.**

### Per-object delivery

| Object | Member-facing form | Blocked by |
|---|---|---|
| **ORG HIGH** | *"Recovery consistency has improved across your squad."* | C1-C4, then L-WS1-3 |
| **ORG LOW** | *"Attendance has declined across your squad for four weeks."* | same |
| **ORG INQUIRY** | *"Something about how your squad prepares isn't understood — would you add your view?"* | L-WS4 + a contribution surface |
| **SHARED FOCUS** | *"Three people in your squad are working on this — join?"* | G1 participants |

**None is a pilot blocker.** All are POST-PILOT (queue item 28, G3). The design exists so that when
it is built it is mechanical.

---

## 7 · NEW GAPS RAISED

| Id | Gap | Severity | Fix size |
|---|---|---|---|
| **T-1** | Self High/Low cannot see the reader's own private evidence | PRE-PILOT — a ratified Self-scope property is unmet | one optional argument, two call sites |
| **T-2** | Corrections do not propagate to emitted `orgSignals` | PRE-PILOT correctness | follow `data.source.evidence_id`, already present |

Both should join the consolidated queue. Neither is a pilot **blocker**: T-1 errs toward
non-disclosure, and T-2 requires a correction to have occurred, which is rare in a short pilot but
not impossible.

---

## 8 · CORRECTION TO STAGE C

`docs/ttd/self-and-web-orchestration.md` §1 states that `_kernelEvidence`'s two branches *are* the
Self/Web split. **True for the door; incomplete as a description of the product.**

The Self **pattern** pipeline bypasses that door entirely, reading `orgSignals` and
`memberCheckins`. Stage C's laws (L-C1 to L-C7) are all still correct — the crossings behave as
described. What was wrong was the implication that Self intelligence is *built from* the Self
admissible set. Only Tributary 2 is.
