# Product reconciliation audit — High / Low / Inquiry / Focus against repository truth

**Status:** architecture and repository-truth audit. Nothing implemented. Nothing merged.
**Baseline:** P0-D approved at `932a0c3`. P0-1/2/3/D treated as established; this audit found no
contradiction with any of them.

---

# 1 · Verdict

## COMPATIBLE — SMALL MIGRATION

**All four product objects already exist in production.** Not as analogues — as the actual
running implementation, under different names.

| Product object | Production reality | Durable? |
|---|---|---|
| **High** | `behaviour.BUCKET.worth_celebrating` over `proactive.toInsight` artifacts | derived per read |
| **Low** | `behaviour.BUCKET.needs_attention`, same pipeline | derived per read |
| **Inquiry** | `inquiryStates[code][subjectRef]`, `ai/diagnose.js` + `ai/inquiry.js` | yes |
| **Focus** | `mem.focuses` — `server.js:1160`, created `4557`, closed `4583` | **yes** — `userAiProfiles` is in `_persistedStores` (`server.js:184`), so it rides the P0-3 CAS |

**The direct answer to "three migrations or thirty": three, plus one deletion.**

1. Add a participant model — it exists nowhere (§ 10.3)
2. Add the origin foreign key to Focus — the same missing primitive four audits have now found
3. Give High/Low/Inquiry/Focus a navigation surface — 29 destinations exist, none of them these
4. **Delete the leader roster/briefing labels** — this is more pilot-urgent than P0-5

Everything else is hiding, not rebuilding. The backend can stay exactly where it is.

---

# 2 · Current product truth

`js/app.js:1478` already renders an **empty sidebar**: *"The sectioned navigation drawer is
retired — the app flows from ONE assistant page."* Twenty-nine destinations remain live in
`NAV_ROUTES`, reachable only by knowing the id. Three are surfaced via the account gear.

**No destination named High, Low, Inquiry-as-explorable, or Focus exists.** `page-inquiry` exists
and is read-only (`js/member-view.js:2686`).

What a member actually sees: one assistant page with a composer, attention cards that expand into
governed threads, "Your focus" with Helped/Didn't buttons, notes, recognitions.

What a leader actually sees: `/api/intelligence/briefing` and `/api/intelligence/roster` — see §13.

---

# 3 · Target product model

The smallest coherent ontology, expressed in what already exists:

```
HIGH / LOW    a surfaced belief that deserves attention        (derived, ephemeral)
INQUIRY       a subject we do not yet understand               (durable, epistemic)
FOCUS         work we have deliberately chosen to do           (durable, intentional)
```

**The distinction that matters and is already enforced by module boundaries:** Inquiry is
`ai/diagnose.js` accumulating evidence about a subject. Focus is `lib/action.js`'s contract —
`recommend → draft → confirm → execute → observe → evaluate → learn`. Different modules, different
lifecycles, different verbs. **Do not merge them.** The code has not.

Everything else in the founder's list becomes a capability *inside* one of these.

---

# 4 · Current → target map

| Concept | Production | Target | Migration |
|---|---|---|---|
| High / Low | `ai/behaviour.js:32`, `ai/proactive.js:244` | **product object** | rename two bucket labels |
| Inquiry | `inquiryStates`, `ai/diagnose.js` | **product object** | make explorable (§11) |
| Focus | `mem.focuses` | **product object** | grow the record (§10) |
| Assessment | `assessmentTemplates` / `assessmentAssignments` | **capability inside Focus** | none — keep stored as-is |
| Check-in | `memberCheckins`, `_recordCheckin` `server.js:4748` | **capability** — generates evidence | none |
| Reflection | notes + assistant turns | **capability** | none |
| Intervention | `orgInterventions`, `/api/intelligence/act` | **capability inside Focus** | link only |
| Outcome | `/api/intelligence/outcome`, `outcome-intelligence.summarize` | **capability** | none |
| Scenario | `assignedScenarios`, `memberResults` | **capability** — practice | keyed by **name**, not id — real debt |
| Conversation | `assistantConversations` (`wsKey` = `code:userId`) | **capability** | self-scoped by construction |
| Forum | `forumThreads` + 4 routes | **absorb** (§5) | no UI to migrate |
| `orgGroups` / `orgMessages` | `server.js:13776-13777` | **delete** | parallel to `orgNodes`, kernel never reads |
| `orgGoals` / `memberGoals` | `server.js:964` | **delete / fold** | already queued |
| Leader roster / briefing | `server.js:4250` / `4150` | **strip labels** (§13) | pre-pilot |

---

# 5 · Forum verdict — ABSORB

**Forum has no user interface.** `grep -rn "forum" js/ index.html` → no matches. Four routes, a
pure policy module, a smoke test, zero client calls. There is nothing to migrate and no user to
disappoint.

Decomposed into capabilities and rehoused:

| Capability | Belongs in | Exists? |
|---|---|---|
| participant invitation | **Focus** (and Inquiry) | **nowhere** — see §10.3 |
| multi-person conversation | Focus, Inquiry | forum threads are the only multi-person store |
| contribution provenance | **both** — already object-agnostic | `ai/contribution.js`, keep verbatim |
| deliberation ≠ evidence | **both** | `ai/forum.js:8` — the *principle* must survive |
| echo/origin assignment | wherever contributions come from | `ai/forum.js:146` — buggy, see §6 |
| tombstones | Focus, Inquiry | `forum.removeMessage` — small, reusable |
| threading (`replyTo`) | Focus | trivial |
| notifications | already exists elsewhere | delivery layer |

**Answer to the central question: Forum taught us people need to collaborate around Inquiry and
Focus.** A generic Forum product object is not needed. But two things must be carried across
verbatim rather than reinvented:

1. **The inertness principle.** `ai/forum.js` contains no evidence vocabulary *by construction*, so
   ten people agreeing changes nothing. Whatever holds conversation inside a Focus must have the
   same property, or the guarantee is lost the moment the module is replaced.
2. **The authorship rule.** `mayContributeMessage` — *"only the author may offer their own
   statement as evidence"*, with leadership explicitly granting no exception (`ai/forum.js:127`).
   In a coach-created Focus this rule is more load-bearing, not less.

Recommendation: **retire `forumThreads` as a store, keep `ai/forum.js` as the policy module** that
Focus/Inquiry conversation reuses. The pure module is the asset; the store is not.

---

# 6 · P0-5 verdict — **B · VALID LAW, WRONG OBJECT**

The law and the defect are in **two different files**, and only one is Forum-specific.

**The law — `ai/contribution.js:192-230`.** `MIN_INDEPENDENT_ORIGINS`, `shouldOpenGroupInquiry`, and
an explicit `ECHO` rule: *"5 people, but 1 independent origin — repetition, not corroboration."* It
counts origins on contributions and **does not know or care where they came from.** It is already
object-agnostic and already correct. It survives Forum's retirement untouched.

**The defect — `ai/forum.js:146` `originForMessage`.** It treats a message as an echo only
`if (echoesMessage.contributedOrigin)`, which the caller resolves from a candidate lookup — so it
is only populated when the echoed message was *already contributed*. In the ordinary sequence
(discuss → agree → contribute) the echo is minted as an independent `direct_observation`. This is
the *feeder*, not the law.

**So:**
- Implementing P0-5 against `ai/forum.js` today is work on a feeder for a UI that does not exist.
- The invariant is **constitutional and must survive**: *a contribution that restates another
  person's account must carry the original's origin, marked reported, so agreement can never
  become corroboration.*
- When Focus/Inquiry gain conversation, they need an origin feeder, and it must be written
  correctly the first time — the same bug in a shipped surface is the "confident room manufactures
  organisational certainty" failure reaching real users.

**Recommendation:** do not implement P0-5 now. Restate it as **P0-5′ — contribution-origin
preservation at the Focus/Inquiry contribution boundary**, and make `pilot-loop-smoke` §4 assert
against whatever supplies origins on the new path rather than against `forum.originForMessage`
specifically. Until then the suite legitimately stays 28/1, and the failing assertion is an
accurate record of an unfixed law, not noise.

---

# 7 · Assessment verdict — SURVIVES AS CAPABILITY, STORAGE UNCHANGED

**Actively used, fully wired, and the most sophisticated measurement machinery in the product.**

```
leader creates template  → assessmentTemplates[code]                 server.js:978
  assigns                → POST /api/assessments/assign              5391  (criteria SNAPSHOTTED + versioned)
  member submits         → POST /api/assessments/:id/submit          5463
  leader returns         → POST /api/assessments/:id/return          5718  (feedback + score 0..100)
  → _canonicaliseAssessment: assessor · rubric · scale · feedback · submissionId as canonical evidence
```

Two properties must not be lost to vocabulary compression:

- **The naked score was deliberately retired** from the signal stream (`server.js:5733`): *"no
  assessment value re-enters a stream."* Consumers read the whole object via
  `_assessmentEvidenceFor`.
- **`ai/assessment-view.js` refuses to lead with a score**, distinguishes a generated projection
  from real human feedback, and detects placeholder feedback repeated across members.

**Verdict:** the hypothesis holds. Assessment becomes *measurement inside a Focus or Inquiry*.
**No storage migration.** An assessment stays an `assessmentAssignment` internally and is presented
as a Focus baseline or checkpoint. One caution from the Lab audit stands: a **leader-assigned,
scored** assessment appearing inside a personal Focus turns the Focus into a performance file. Self
and invited assessments belong there; leader-assigned org assessments do not.

Genuinely missing: nothing compares assessment N to assessment 1 on the same rubric. That is the
progress primitive, and it is P1.

---

# 8 · Reflection / check-in verdict — CAPABILITY, NOT OBJECTS

`memberCheckins` (`server.js:181`, recorded at `4748`) takes `{ text, mood 1-5 }`, measures the gap
since last activity, and feeds the kernel. Notes are `orgNotes` (`13776`). Conversations are
`assistantConversations`, keyed `code:userId` — **self-scoped by construction**.

None of these is a product object today and none needs to become one. They are three ways of
producing the same thing: evidence, which becomes beliefs, which become Highs and Lows.

**The Home experience the founder wants is closer than it looks.** `behaviour.plan()` already
returns `{ empty, message, groups }` and treats silence as success with a written calm line
(`ai/behaviour.js:44`). The gap is that `/api/me/context` computes `ask` from a five-branch ladder
that **always fires** — there is no path where Home has no question. The correct source for "one
useful question" is `ai/inquiry.js`, whose header says it *"gets back ranked, critiqued, routed
question PLANS — or nothing, which is the common, correct answer."* **Those two have never been
connected.** That is the single change that produces "Nothing for today."

No bureaucracy of forms is required. There is no form.

---

# 9 · Intervention / outcome verdict — CAPABILITY INSIDE FOCUS

All of it exists and none of it should be rebuilt:

- `orgInterventions` + `POST /api/intelligence/act` (`server.js:4297`) — ties the action to the
  pattern so the loop can learn per-pattern
- `POST /api/intelligence/outcome` (`4324`) — `positive | neutral | negative`
- `outcome-intelligence.summarize` — ranks by **what worked**, not what was done most; phrases
  historically (*"was followed by"*) with `limitations: ['not_causal']`
- `mem.focuses` outcome — `helped | no | mixed` → `_recordNoticeFeedback` → the Confidence Engine
  stops surfacing unhelpful noticing types

**Two parallel outcome loops exist** — one leader-owned per-person (`orgInterventions`), one
self-owned (`mem.focuses`). Both are correct for their audience. Under the target model they are
the same capability at different scopes, and a Focus should be able to hold either. **No migration
required for the pilot**; unifying them is post-pilot.

---

# 10 · Focus model

## 10.1 · What exists

```js
{ id, text, type, status: 'active'|'done', outcome, createdAt, resolvedAt }
```

Created only by approving a prepared suggestion (`server.js:4557`). Durable via `userAiProfiles`.
Self-scoped: `_getMemory(code, userId)`.

## 10.2 · What the target requires

| Capability | Exists | Gap |
|---|---|---|
| self-created | **no** — only via approving a suggestion | one route: `POST /api/me/focus` |
| IntelliQ-proposed, person-accepts | **yes** | none |
| coach-created / proposed for a player | no | needs ownership + consent |
| shared / group / organisational | no | needs scope |
| participants | **no** | §10.3 |
| origin (which High/Low/Inquiry) | **no** | one field — `dedupeKey` is already stable |
| what has been tried | scattered across 3 stores | reference, not copy |
| measurement | assessments exist | link |
| outcome | **yes** | none |
| closure | **yes** (`status: done`) | none |
| privacy scope | **no** — focuses have no visibility field | needed for anything non-self |

## 10.3 · Participants — the one genuinely absent primitive

I searched. **No product object in IntelliQ has a participant list.** The `participants` field on
events is a *number* (`ai/org-state.js:325` divides it by 25). Forum uses node membership, not a
set. Assessments have an assigner and an assignee — two roles, not participants.

So the founder's five Focus scenarios all reduce to the same missing thing, and it must be designed
once. Minimum shape:

```
owner        exactly one, always the person the Focus is about (or the node for org Focus)
participants explicit, invited, revocable; default empty
scope        self | shared | group:<nodeId> | org
visibility   derived from scope, never wider than the owner chose
```

**The rules that must come from existing law, not be invented:**
- invitation is **explicit** — `ai/contribution.js:132`, *"must be deliberate, never automatic"*
- an invited coach may observe and contribute **their own** account only — `ai/forum.js:127`
- a coach-*proposed* Focus is a proposal requiring the person's acceptance, exactly as
  `mem.focuses` already works — a coach must not be able to create work *on* someone silently
- leaving removes future access, not past knowledge; participant history stays visible

**Founder decision required** on coach-created group Focus — see §20.

---

# 11 · Inquiry model — what stays distinct

Inquiry is epistemic; Focus is intentional. The separation is already structural:

| | Inquiry | Focus |
|---|---|---|
| Module | `ai/diagnose.js`, `ai/inquiry.js` | `lib/action.js` contract |
| States | `exploring → probable → supported \| disputed \| resolved` | `active → done` + `helped \| no \| mixed` |
| Carries | signals, hypotheses, confidence bands, `because`, `stillUnknown`, `alternatives`, `timeline`, contest | intent, attempts, participants, outcome |
| Close means | answered or contested | it helped, or it didn't |
| Implies action | **no** | **yes** |

**Do not merge them, and do not share close verbs.** The Lab audit already found this: dismissing a
question is not suppressing a belief, and reusing `ai/reason.js`'s `RESPONSES` for Inquiry would
make "not now" on a question silently mute the belief it was testing.

`ai/inquiry.js` also already has `UNCERTAINTY.UNSUPPORTED_HYPOTHESIS` — *"competing explanations,
none confirmed"* — which is exactly the case where a Focus (an experiment) beats another question.
That is the Inquiry → Focus edge, and it is one new member of an existing enum.

---

# 12 · High / Low model — already primitives

```js
const BUCKET = { risk: 'needs_attention', neutral: 'needs_attention',
                 progress: 'worth_celebrating', milestone: 'worth_celebrating',
                 opportunity: 'opportunities' };
```

Already ranked within bucket, capped at three, with per-audience empty states. Already **explorable**
— `openInsightThread` (`js/member-view.js:2865`) expands a card into a governed assistant thread,
with the comment: *"it is a conversation waiting to happen, not a notification."*

**Two structural facts that constrain the product:**

1. **Highs and Lows are derived, not stored.** `_proactiveInsights` recomputes them on every read
   (`server.js:4155`). Only `insightSuppression` (mute list) and `noticeFeedback` (counters) persist.
2. **Their thread binding lives in browser `localStorage`** (`_cardThreadsLoad`,
   `js/member-view.js:2854`), and `assistantConversations` is keyed `code:userId`.

**Consequence:** a High or Low cannot carry participants or a shared conversation. Promotion to a
durable object is what makes collaboration possible — and that object is Focus. This is the
`conversation-as-capability` finding, and it means the founder's own sequence (High/Low → *Work on
this* → Focus → *Invite coach*) is the only ordering the architecture permits.

The third bucket, `opportunities`, has no name in the target model. **Founder decision** — §20.

---

# 13 · Privacy findings — the most pilot-urgent item in this audit

Confirmed live at HEAD. Both endpoints are fetched by `js/app.js`.

**`/api/intelligence/roster`** (`server.js:4250`, fetched `js/app.js:7059`) returns, for **every
visible member**:

```js
{ id, name, status: 'attention'|'improving'|'steady'|'no-data', topLabel, lastActiveDays }
```

`topLabel` is `intel.PATTERN_LABEL[urgent.type]` (`server.js:4279`) — *Momentum dropping*, *Pulling
away from the team*, *Carrying invisible load*, *Gone quiet*, *Overload risk*.

**`/api/intelligence/briefing`** (`4150`, fetched `js/app.js:6632`) returns up to **15** named
individuals with `{ memberId, name, severity, patterns[{type,label,basis,confidence}], whyNow,
evidence[], recommendedAction }`. The `basis` strings are the individual's own evidence in plain
English.

Both gated on `view_team` **or** `view_insights`. Both cached.

**Neither passes through `proactive.audienceSafe`**, which is the projection that empties `basis`
for leader audiences on the *other* leader path (`/api/proactive/insights/leader/:subjectId`,
`server.js:4500`). **Two leader paths, opposite privacy postures, only one governed.**

**This conflicts directly with the target model.** In High/Low/Inquiry/Focus, a leader's view of a
person is a Focus they were invited into. A standing behavioural status board on everyone they lead
is a fifth, unnamed object that the compression is supposed to remove.

**Pre-pilot blocker.** Not because of a bug — because Falcon's headmaster will otherwise open a
named list of pupils labelled *Gone quiet*. Fix is a deletion plus routing briefing through
`audienceSafe`.

---

# 14 · P0-6 status — **PRE-SCALE BLOCKER, NOT PILOT BLOCKER**

Unchanged by this audit, and the compressed model slightly *reduces* its urgency.

`inquiryStates` is written by evidence ingestion and the kernel, not by stale-client PUTs. At
Falcon scale there is one process. Uniform durable CAS (P0-3) already refuses a stale cross-process
overwrite. What remains open is the *recovery* path after a conflict, and whether inquiry state is
replayable from canonical evidence — still unverified.

The compressed model does not add inquiry writers. Focus is a different store
(`userAiProfiles`). If Focus gains participants it becomes multi-writer and joins the P0-3
protected set — **that is a new P0-3 scope question, not a P0-6 one**, and it should be flagged when
participants are briefed.

---

# 15 · Data migration — minimum required

**Almost none.**

| | Required? |
|---|---|
| Database migration | **no** |
| One-time transformation | **no** |
| Compatibility adapter | **no** |
| Dual-read / dual-write | **no** |
| New fields on existing records | **yes** — `origin`, `participants`, `scope` on `mem.focuses`, all optional, absent = today's behaviour |

Everything else is presentation. An assessment stays an assessment. An intervention stays an
intervention. A check-in stays a check-in. **The product vocabulary changes; the storage does not.**

Two stores should be **deleted** rather than migrated, because nothing reads them into the kernel:
`orgGroups` / `orgMessages` (`server.js:13776-13777`) and `orgGoals` / `memberGoals`. Both are the
"CRUD the kernel never reads" pattern.

One real debt, not a migration: **scenarios are keyed by member *name*** (`memberKey(code,
resolvedName)`, `server.js:14618`). If scenarios become the practice capability inside Focus, that
key has to become an id. Post-pilot unless Focus uses scenarios at pilot.

---

# 16 · Delete / keep / hide / migrate

| Concept | Classification |
|---|---|
| **High / Low** | KEEP — PRODUCT OBJECT (rename buckets) |
| **Inquiry** | KEEP — PRODUCT OBJECT |
| **Focus** | KEEP — PRODUCT OBJECT (grow the record) |
| Assessment | KEEP — INTERNAL CAPABILITY (measurement in Focus/Inquiry) |
| Reflection | KEEP — INTERNAL CAPABILITY |
| Check-in | KEEP — INTERNAL CAPABILITY |
| Intervention | KEEP — INTERNAL CAPABILITY (an attempt inside a Focus) |
| Outcome / what worked | KEEP — INTERNAL CAPABILITY |
| Conversation | KEEP — INTERNAL CAPABILITY |
| Signals / attention items | KEEP — INTERNAL CAPABILITY |
| Scenario (practice) | KEEP — INTERNAL CAPABILITY; **name-keying is post-pilot debt** |
| `ai/forum.js` policy module | KEEP — INTERNAL CAPABILITY (reused by Focus/Inquiry) |
| `forumThreads` store + 4 routes | DEPRECATE AFTER PILOT (no UI, nothing to break) |
| Plan / development plan | DEPRECATE AFTER PILOT (superseded by Focus) |
| **Leader roster labels** | **MIGRATE BEFORE PILOT** — §13 |
| **Leader briefing basis** | **MIGRATE BEFORE PILOT** — route through `audienceSafe` |
| `orgGroups` / `orgMessages` | DELETE |
| `orgGoals` / `memberGoals` | DELETE (fold into Focus text) |
| Legacy nav destinations (`dashboard`, `members`, `analytics`, `alerts`, `leader-groups`) | DELETE |

---

# 17 · Pre-pilot blockers

Genuine only. Cleanup preferences are in §18.

1. **P0-1, P0-2, P0-3, P0-D** — established; P0-D approved, merge pending.
2. **Leader roster / briefing privacy** (§13). A named behavioural status board on pupils is a
   pilot-safety issue, not a tidiness issue.
3. **`POST /api/me/focus`** — without it a person cannot start work in their own words, and Focus
   is not a product object, only a suggestion sink. One route.
4. **Focus origin field** — without it the product cannot answer *"why does this Focus exist?"*,
   which is the question the whole loop is for. One field.

**Not blockers:** Forum, P0-5 as written, participants, assessments-in-Focus, navigation,
`orgGroups` deletion, scenario name-keying.

---

# 18 · Post-pilot debt

Forum store retirement · participants and shared/group/org Focus · scenario re-keying ·
`orgGroups`/`orgMessages`/`orgGoals` deletion · legacy nav deletion · reassessment comparison
(the progress primitive) · unifying the two outcome loops · P0-6 recovery · the `Object.freeze` on
a Set noted in the P0-D review · P0-5′ once Focus/Inquiry conversation ships.

---

# 19 · Codex implementation plan

Each task independently reviewable. **Not implemented.** Ordered by pilot value.

**Task 1 — Strip the leader surveillance surface.**
Remove `topLabel` and per-person `status` from `/api/intelligence/roster`. Route
`/api/intelligence/briefing` items through `proactive.toInsight({ audience: 'leader' })` +
`audienceSafe`. Leader keeps a roster of who they lead; loses the behavioural labels.
Test first: `leadership-privacy-smoke` asserting no leader route returns a name paired with a
behavioural label or an evidence basis string. **It will fail today — that is the point.**

**Task 2 — `POST /api/me/focus`.**
Create a Focus from the user's own words. `{ text, origin?, originKind? }`. Self-scoped, durable,
reuses the existing outcome route unchanged.

**Task 3 — Focus origin.**
`originRef` (the insight `dedupeKey`, already stable) + `originKind: high|low|inquiry|self`. Record
it on both creation paths. Render *"this came from…"*.

**Task 4 — Home says nothing when there is nothing.**
Connect `ai/inquiry.js` question plans to `/api/me/context.ask` so `ask` can be null, and let
`behaviour._calm` carry the empty state.

**Task 5 — Rename the buckets.** `worth_celebrating` → Highs, `needs_attention` → Lows in
`BUCKET_LABEL`. Decide `opportunities` first (§20).

**Task 6 — Inquiry becomes explorable.** Reuse the `openInsightThread` container with an
inquiry-specific opening line and close action. **Do not reuse the reasoner's response verbs.**

**Task 7 — Delete the dead.** `orgGroups`, `orgMessages`, `orgGoals`, and the REMOVE-classified nav
destinations.

Tasks 1–4 are the pilot. 5–7 are cheap and can follow.

---

# 20 · Founder decisions required

**D1 · Does the leader keep any standing per-person view?**
*Scenario:* a Falcon head of year opens IntelliQ. Today they see every pupil labelled. Under the
target they see organisational signals and any Focus they were invited into.
- **(a)** No standing per-person view; leaders see people only through an invited Focus or the
  governed `/api/proactive/insights/leader/:subjectId` when they already have a concern. **Recommended.**
- (b) Keep a roster of names with no labels — who I lead, last active only.
- (c) Keep labels behind a stricter permission.
*Tradeoff:* (a) is the product thesis and removes the most useful thing a leader has today. (c)
keeps the surveillance surface and makes the compression untrue.

**D2 · Can a coach create a Focus *for* a player, or only propose one?**
- **(a)** Propose only; the player accepts, exactly as `mem.focuses` already works. **Recommended.**
- (b) Coach creates directly for operational team work; player-topic Focuses require acceptance.
- (c) Coach creates freely within their node.
*Tradeoff:* (a) is consistent with every existing consent boundary. (c) makes Focus a task-assignment
system, which is the thing the founder said Lab must not become.

**D3 · What happens to `opportunities`?**
The third bucket is self-audience-only and deliberately never shown to a leader
(`ai/behaviour.js:78`). High/Low/Inquiry/Focus has no home for it.
- **(a)** Fold into Highs, re-enforcing leader-invisibility at the new boundary. **Recommended.**
- (b) Retire it.
- (c) Keep a third bucket unnamed in the product.

**D4 · Do leader-assigned assessments appear inside a personal Focus?**
- **(a)** No. Self and invited assessments only; leader-assigned org assessments stay in Workspace.
  **Recommended.**
- (b) Yes, read-only.
*Tradeoff:* (b) makes a personal development record contain the organisation's scored judgements —
the performance-file failure.

**D5 · Is P0-5 restated as P0-5′ now, or left failing?**
- **(a)** Restate now as contribution-origin preservation at the Focus/Inquiry boundary; leave
  `pilot-loop-smoke` at 28/1 as an honest record. **Recommended.**
- (b) Fix `forum.originForMessage` anyway to get a green suite.
*Tradeoff:* (b) costs credits on a feeder for a UI that does not exist, and the green suite would
be less honest than the failing one.

---

# The short version

Four product objects, four production implementations, all already there. Focus is durable and
already runs the loop. High and Low are already explorable. Inquiry is the one that needs a UI
affordance it does not have.

**Three additions and one deletion stand between the current repository and the pilot product**, and
the deletion — the leader roster labels — matters more for pilot safety than the failing Forum
assertion everyone has been watching.

Nothing needs migrating in storage. The backend stays sophisticated; the vocabulary stops being.
