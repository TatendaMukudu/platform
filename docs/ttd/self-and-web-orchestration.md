# Self and Web — two-scope orchestration

**Status:** architecture. **Nothing implemented.** No production code changed.
**Stage C** of the autonomous architecture loop. Preceded by `404c9b5` (deterministic Web
intelligence).
**Written against:** `404c9b5`.

**Founder law to formalise:**

> **SELF AND WEB ARE INDEPENDENT REASONING SCOPES THAT MAY SHARE ADMISSIBLE EVIDENCE BUT NEVER
> INHERIT VISIBILITY FROM ONE ANOTHER.**

---

## 1 · Executive finding

> **CORRECTED at Stage 4 (`docs/ttd/self-web-production-trace.md` §8).** This section states that
> `_kernelEvidence`'s two branches are the Self/Web split. That is true of the **door** and
> incomplete as a description of the **product**: the Self *pattern* pipeline
> (`_buildMemberIntelInput`, `server.js:3836`) bypasses that door entirely, reading `orgSignals`,
> `memberCheckins` and assessments at an **organisation** purpose. Consequently **private evidence
> never produces a Self High or Self Low** — only a contentless `careFlag` and a count-based privacy
> reassurance. Laws L-C1 to L-C7 below are unaffected and still hold.


**The law is already implemented, at one door, and it is stricter than the founder's own example.**

`server.js:7758-7759` defines the two scopes as a purpose vocabulary:

```js
const PERSONAL_PURPOSES = ['personal_assistance','personal_memory','personal_planning','outcome_evaluation'];
const ORG_PURPOSES      = ['workspace_shared_reasoning','leader_support','group_reasoning','organisation_reasoning'];
```

`_kernelEvidence` (`:7760`) — described in its own header as *"the ONLY door to kernel reasoning…
PURPOSE-SCOPED: private evidence is excluded BEFORE any unauthorised context is built (never
retrieved then filtered)"* — enforces the split:

```js
if (personal) {
  if (env.visibility === 'private') return !!viewerId && env.ownerRef === viewerId;
  return (env.subjectId === viewerId) || (env.ownerRef === viewerId);
}
// ORGANISATIONAL purposes:
if (env.visibility === 'private') return false;
return env.promoted === true;
```

Three properties fall straight out, and together they *are* the founder's law:

1. **Self and Web are separate admissibility computations**, not one set with a filter.
2. **Nothing reaches Web reasoning by default.** `promoted === true` is an allowlist — evidence must
   have *crossed* the boundary by an explicit act (`_promoteEvidence:6452`, reachable only when
   `orgFacing && !isPrivate && r.promotable`).
3. **Visibility never widens downstream.** `_inheritedVisibility` (`:7795`):
   *"Derived evidence can never be broader than its narrowest input."*

**Finding C-1: the founder's example is stricter in the repository than in the brief.** The brief
says a private statement *"may contribute to"* a broader Web pattern without exposing the statement.
Today it **contributes nothing** — private evidence is excluded from org purposes entirely, so it
cannot even be counted. Verified empirically during the PR #74 review: a member whose evidence was
entirely private contributed zero to `patternCounts` and could not supply the second person needed
to clear the cohort floor.

Whether that should change is a genuine founder decision (**D-C1**, §7). It is the only place in
this stage where proceeding would silently choose a product law, and it is therefore recorded rather
than decided.

---

## 2 · WHAT BELONGS TO EACH SCOPE

| | SELF | WEB / ORG |
|---|---|---|
| **Question** | what legitimately concerns *me* | what organisational reality is legitimately relevant to my position |
| **Admissibility** | `PERSONAL_PURPOSES` branch | `ORG_PURPOSES` branch |
| **Private evidence** | **admitted**, owner only | **never admitted** |
| **Non-private own evidence** | admitted where subject or owner is the viewer | only if `promoted` |
| **Others' evidence** | **never** | only if promoted **and** inside `Web(actor)` |
| **Scope primitive** | `viewerId` / `ownerRef` / `subjectId` | `ai/org-graph.js` node scope |
| **Governance** | ownership | Web ∩ governance ∩ projection |
| **Enforced at** | `_kernelEvidence` personal branch | `_kernelEvidence` org branch **+** `_orgAdmissibleEvidence:9825` |

**Two independent gates guard Web reasoning** — `promoted` (did this cross the boundary?) and
`canSee` (is it in my territory?). Self has one. That asymmetry is correct: Self is bounded by
identity, Web by structure.

---

## 3 · THE CROSSING LAWS

### L-C1 · Self → Web requires a deliberate, attributable act

> Evidence enters Web reasoning only by **promotion** — never by inference, aggregation, membership
> or elapsed time. Promotion is refused for anything private (`_promoteEvidence:6452` via
> `evidence.promotable`), and the crossing preserves origin intact.

Already true, and `ai/contribution.js:242` states the epistemic half: *"Contribution is a change of
audience, not a change of what the evidence is based on."* Membership is not consent —
`_noteGroupCandidates` (`server.js:12556`) records a *private noticing* and publishes nothing.

### L-C2 · Web → Self requires entitlement, not relevance

> Organisational intelligence reaches a person only where they are entitled to receive it.
> Relevance is necessary and not sufficient. A Web High about a cohort a person belongs to may reach
> them; the evidence composing it does not travel with it.

**Gap:** there is currently **no Web → Self path at all**. Every insight is subject-scoped to one
person (`constitution` §2.1, gap **G3**). A player cannot today learn *"the team's recovery
consistency improved"*. This is the largest product gap in the two-scope model and the one the
founder's §4 asks for.

### L-C3 · Derived visibility is monotonically narrowing

> A derived artifact inherits the **most restrictive** visibility of any basis it rests on, and no
> downstream step may widen it.

Implemented (`_inheritedVisibility:7795`) and tested (`private-evidence-smoke §12`: *"a pattern
derived from private evidence inherits PRIVATE visibility + owner"*).

### L-C4 · Aggregation is not a laundering route

> An aggregate is not exempt from L-C3. Counting private evidence into a cohort statistic and
> publishing only the count is still a disclosure of that evidence's existence, at a resolution
> determined by cohort size. Aggregates therefore obey **both** the disclosure floors
> (`constitution` §13 / `web-semantics` §23) **and** the visibility ceiling.

This is the law that makes D-C1 a real decision rather than an obvious yes.

---

## 4 · THE FOUR OBJECTS IN TWO PERSPECTIVES

**No new storage.** The perspective is derived from fields that already exist.

| Field | Already exists | Carries |
|---|---|---|
| `subjectRef` | `inquiryStates` key — `member:<id>` \| `group:<nodeId>` | **who/what it is about** |
| `visibility` | evidence envelope | private / sensitive / normal |
| `promoted` | evidence envelope | has it crossed to Web |
| `ownerRef` | evidence envelope | whose it is |
| `purpose` | `_kernelEvidence` argument | which scope is asking |
| `scope` (nodeId) | feed items, notes | Web territory |
| `audience` | `ai/proactive.js:214` | who is reading |
| `perspective` | added by PR #74 | what it is about |

### Derivation rule

> **L-C5 (proposed).** `perspective = 'self'` when `subjectRef` identifies the reader;
> `perspective = 'web'` when `subjectRef` is a group **or** absent and the artifact is an aggregate.
> Perspective is **derived at projection time from `subjectRef`**, never stored, and never set by a
> producer.

| Object | SELF | ORG / WEB | Storage change |
|---|---|---|---|
| **High** | polarity `progress`, `subjectRef = member:me` | aggregate, no `subjectId`, cohort ≥ floor | **none** — derived |
| **Low** | polarity `risk`, `subjectRef = member:me` | aggregate, origin-counted (§22) | **none** — derived |
| **Inquiry** | `inquiryStates[code]['member:<id>']` | `inquiryStates[code]['group:<nodeId>']` | **none — both exist today** |
| **Focus** | `mem.focuses` on `userAiProfiles` | needs `scopeNodeId` + `participantIds` | **fields only** (G1, GW-9) |

**Three of four need nothing.** Focus needs two fields on a record that already persists. The
"eight storage objects" the brief warns against are not merely avoidable — they would duplicate
information the subjectRef already carries.

---

## 5 · THE SPECIFIC CROSSING QUESTIONS

### May a Self Inquiry contribute to an Org Inquiry?

**Yes, and the path exists.** `_noteGroupCandidates` (`server.js:12556`) notices that personal
evidence may concern a group and records a **private candidate** — invisible to everyone, counting
toward nothing. The person may later contribute it deliberately via `ai/contribution.js`, which
preserves `originRef`. `shouldOpenGroupInquiry` then applies the origin rule.

Two properties worth stating because they are easy to lose:

- **One candidate per node, never merged** (`:12562`): *"a member in two squads produces a candidate
  per squad, because the remark may concern one and not the other."*
- **A candidate is not evidence.** `groupCandidates` exists precisely so a noticing contributes to
  no confidence (`server.js:11456-11462`).

### May an Org Inquiry trigger a Self question?

**Structurally yes, currently no.** `inquiry.planInquiries` (`ai/inquiry.js:285`) already routes a
question to an owner and refuses to ask what it could derive itself; `healthGuard` (`:172`) rejects
anything private or sensitive. What is missing is the Web → Self delivery path (G3).

> **L-C6 (proposed).** An Org Inquiry may ask a person a question about **their own** situation. It
> may never disclose the org-level evidence that motivated the question, and the person's answer
> enters Self scope — reaching Web only by ordinary promotion.

That last clause matters: without it, an org question becomes a mechanism for extracting personal
evidence into org scope by asking.

### May a Self Focus contribute outcome evidence to aggregate learning?

**Yes, and this is the cleanest crossing in the product.** `/api/me/focus/outcome` records
`helped | no | mixed` and feeds `_recordNoticeFeedback` → the Confidence Engine, which is org-level
learning about *which kinds of noticing help here* — carrying **no content, no subject, no text**.

> **L-C7 (proposed).** Outcome signals may cross Self → Web without promotion **when they carry no
> subject and no content** — a verdict about a pattern type, not about a person. This is the one
> permitted content-free crossing, and its safety comes from what it structurally cannot contain.

This is worth naming as a template: *the safest crossing is one whose payload cannot identify
anyone by construction.* The same shape should govern any future Focus-participation aggregate.

---

## 6 · WORKED EXAMPLE — the founder's own case

**Input.** Private: *"I'm nervous receiving under pressure."*

| Step | Today | Law |
|---|---|---|
| Enters as evidence | `visibility: 'private'`, `ownerRef` = player | — |
| Self Low / Self Inquiry / Self Focus | **yes** — personal branch admits it | L-C1 |
| Visible to coach | **no** — org branch returns `false` before context is built | L-C1 |
| Derived personal pattern | inherits `private` + owner | L-C3 |
| Counts toward an Org Low | **no — excluded entirely** | **D-C1** |
| Org Low from *other* promoted evidence | **yes**, if ≥2 independent origins and cohort ≥ floor | §22, §23 |
| Player learns the Org Low | **no path exists** | **G3** |

Two of seven rows are open questions rather than settled law, and both are already registered.

**Self High / Org High.** *"Your scanning indicators have improved"* is Self (subject = reader).
*"Participants in this Focus are showing improvement"* is Web (aggregate, no subject) and requires
`participantIds` (G1) plus a rate floor of n≥4 (`web-semantics` §23). **The kernel may know both;
the audience may legitimately see only one** — which is exactly `_kernelEvidence` computing two
admissible sets from one evidence log.

---

## 7 · FOUNDER DECISION

### D-C1 · May private evidence count toward a Web aggregate without being disclosed?

**Scenario.** Six players privately report anxiety about receiving under pressure. No one has
promoted anything. Today the Web sees nothing: `patternCounts` is empty, no Org Low forms, and the
unit's most consistent problem is invisible to the person responsible for fixing it.

**Option A — keep the current law.** Private evidence is excluded from org purposes entirely.
*For:* the strongest possible promise, trivially explainable to a school, already implemented and
tested. *Against:* IntelliQ can be blind to a real, widespread problem precisely because it is
sensitive enough that people kept it private.

**Option B — private evidence may contribute to a count, never to content.** A private item
increments `independentOrigins` for a cohort statistic but can never be cited, quoted, attributed or
inspected. Requires: cohort ≥ `MIN_COHORT`, ≥2 independent origins, and a rate floor of n≥4 before
any magnitude is stated.
*For:* the founder's stated intent; the aggregate is genuinely non-identifying at n≥4.
*Against:* it breaks L-C3's monotonic ceiling, and at small n an aggregate plus a roster is a
re-identification vector — the exact failure the PR #74 review demonstrated live.

**Option C — consented contribution.** Private evidence contributes only when its owner has
explicitly allowed anonymous aggregation, per item or as a standing preference.
*For:* preserves the promise and the capability; consent is the honest resolution of a genuine
tension. *Against:* a consent surface to build, and consent rates may be low enough that B's
capability is not actually delivered.

**Recommendation: C, deferred until after the pilot; A until then.**
A is already implemented and safe. C is the right end state because it resolves the tension rather
than trading one side away, but it needs a consent UI and a real cohort to be worth anything. B
should be rejected outright — it is the option that quietly weakens the promise, and its
re-identification risk at Falcon's cohort sizes has already been demonstrated.

**Blocks:** nothing in the pilot. Shapes: G3 (member org intelligence) and any future
Focus-participation aggregate.

**Note for the founder:** this is the one decision in Stage C where proceeding would silently choose
a product law, so it is stopped at and recorded rather than assumed.

---

## 8 · MINIMUM VIABLE ADOPTION

| # | Change | Effect | Blocked by |
|---|---|---|---|
| **C1** | Derive `perspective` from `subjectRef` rather than accepting it from a producer (L-C5) | closes the PR #74 laundering gap at the source | — |
| **C2** | Web → Self delivery for aggregates (G3) | the missing half of the two-scope model | §22 + §23 contracts |
| **C3** | `scopeNodeId` + `participantIds` on Focus | Org/Shared Focus becomes representable | G1 |
| **C4** | Assert the two-scope law as an executable invariant | it is enforced but not arbitrated | — |

**C4 first.** The law is currently a property of one function's control flow. A test that seeds one
private and one promoted item, then asserts the two admissible sets differ exactly as specified,
turns an implementation detail into an arbitrated law — which is what the TTD status vocabulary
requires before anything may be marked ENFORCED.

---

## 9 · TESTS TO WRITE

| Id | Invariant | Fails today? |
|---|---|---|
| T-C1 | Private evidence is absent from every `ORG_PURPOSES` admissible set | no — must not regress |
| T-C2 | Non-promoted, non-private evidence is absent from org purposes | no — must not regress |
| T-C3 | A derived artifact's visibility equals the most restrictive of its basis | no — `private-evidence-smoke §12` |
| T-C4 | An org-purpose read never widens after a Self-scope read of the same evidence in the same process | **untested** |
| T-C5 | A `perspective: 'web'` artifact has no `subjectId`, derived not accepted | **yes** (C1) |
| T-C6 | An Org Inquiry question delivered to a person discloses no org-level evidence | n/a — not built |
| T-C7 | A Focus outcome crossing carries no subject and no content | **untested**, currently true |

T-C4 and T-C7 are the two worth writing immediately: both are currently true and neither is
arbitrated, which is precisely how a correct property silently regresses.
