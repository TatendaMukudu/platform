# Product compression, conversational objects, and forum intelligence

**Status:** architecture exploration. Nothing implemented. Nothing queued ahead of the pilot
blockers.

**Verdict in one line: three of the four things the founder asks for already exist under other
names, one of them has no user interface at all, and the single genuinely new idea — the Evidence
Scout — needs no model and about a hundred lines, because the machine it would run on was built
for connectors and works.**

The one proposal I would refuse as stated is free-topic Forum threads. Not the interaction model —
the anchor. Section D gives a version that keeps the invariant and still feels like iMessage.

---

# 0 · What I checked

Every claim below cites a file and a line. Where I say something does not exist, I searched for it
and the search returned nothing; I say so explicitly rather than implying absence from silence.

Read in full: `ai/forum.js`, `ai/behaviour.js`, `ai/contribution.js`, `ai/privacy.js`,
`ai/primitives.js`, `ai/intake.js`, `ai/proactive.js` (head), `ai/reason.js` (head),
`ai/inquiry.js` (relevant halves), `ai/retrieval.js` (head), `ai/comprehend.js` (head),
`ai/org-learning.js` (head), `lib/evidence.js` (head). Read in region: `server.js` around the
forum routes (12355–12520), the contribution boundary (12130–12235), the connector sync run
(6600–6745), `/api/me/context` (4377–4460), `_proactiveInsights` (4155–4205), the reasoner
heartbeat (10395–10440), messages (14200–14330). Read in region: `js/app.js` navigation
(600–700, 1440–1560), `js/member-view.js` home / inquiries / attention cards / card threads.

---

# A · Current-state map

## A.1 · Highs and Lows are not new objects. They are the buckets.

`ai/behaviour.js:32-35`:

```js
const BUCKET = { risk: 'needs_attention', neutral: 'needs_attention',
                 progress: 'worth_celebrating', milestone: 'worth_celebrating',
                 opportunity: 'opportunities' };
```

**Lows = `needs_attention`. Highs = `worth_celebrating`.** They are already computed, already
ranked within bucket by priority then confidence (`_rankCmp`, `ai/behaviour.js:55`), already
capped at three (`plan(..., { limit: 3 })`, `server.js:4194`), and already have first-class empty
states per bucket per audience (`BUCKET_EMPTY`, `ai/behaviour.js:36`).

Renaming two buckets to Highs and Lows is a string change in one file. Everything the founder
describes as a High or a Low is a `ProactiveInsight` artifact
(`proactive.toInsight`, `ai/proactive.js:244`) carrying `polarity`, `priority`,
`kernelConfidence`, `basis`, `suggestion`, `explore`, `dedupeKey`, `patternType`.

The third bucket, `opportunities`, has no name in the founder's product surface. That is a
decision to make, not a bug — see L.4.

## A.2 · The conversational object already exists, for exactly one of the four.

`js/member-view.js:2865` — `openInsightThread(dedupeKey)`. The comment above it at 2809 states the
design intent in the founder's own terms:

> *"The card EXPANDS IN PLACE into a full thread — it is a conversation waiting to happen, not a
> notification."*

`cardSend` (`js/member-view.js:2900`) posts to `/api/assistant/turn` with its own `conversationId`,
carrying the observation as context, through the same governed runtime as every other turn. The
card opens itself with `Let's talk about this: ${info.headline}` so the user never faces a blank
box, and closes with `resolveInsightThread(key, 'useful')` which feeds the reasoner's response
ledger (`RESPONSES`, `ai/reason.js:43`).

So the proposition *"a High should not merely be a card"* is already true. **A High and a Low are
already explorable continuing contexts.** What is not:

| Object | Explorable today? | Where |
|---|---|---|
| High (`worth_celebrating` insight) | **Yes** — expands into a governed thread | `js/member-view.js:2865` |
| Low (`needs_attention` insight) | **Yes** — same code path | `js/member-view.js:2865` |
| Inquiry | **No** — read-only cards | `js/member-view.js:2686` |
| Forum topic | **No user interface exists at all** | see A.4 |
| A visualisation | **No visualisations exist** | see `expression-and-initiative.md` §4 |
| An IntelliQ claim in prose | Partially — the answer carries `citations` | `server.js:11964` |

The gap is smaller than it looks and differently shaped than the founder assumes. It is not "build
a conversational object model". It is **"apply the one that exists to Inquiries, and give Forum a
front end at all."**

## A.3 · Home is not minimal, but the thing that decides what belongs on it already is.

`behaviour.plan()` already returns `{ empty, message, groups }` and treats emptiness as a
first-class calm result — `ai/behaviour.js:44`:

```js
const CALM = { self: 'Nothing needs your attention right now — you're in a steady place.', … };
```

That is the founder's second Home state, written already, in the right layer, with the right
semantics. Silence is success (`ai/behaviour.js:12`).

The founder's *first* Home state — "IntelliQ has earned the right to ask something" — also exists,
but in a weaker form than the founder wants. `/api/me/context` (`server.js:4377`) computes `ask`
at 4421-4432: a five-branch deterministic ladder over returning / new / rough / rising / steady.
It adapts to the person's situation, which is real. But it is **not** derived from an epistemic
gap — it is a check-in prompt, and it always fires. There is no path where `ask` is null.

That is the honest gap in Home: **IntelliQ always has a question, and the founder wants it to have
one only when curiosity is earned.** The machinery to earn it exists in a different module —
`ai/inquiry.js` builds ranked, critiqued, cost-gated question plans and its module header says
so explicitly:

> *"this module only ever RECOMMENDS … and gets back ranked, critiqued, routed question PLANS — or
> nothing, which is the common, correct answer."*

`ai/inquiry.js:13`. So the correct Home question is an `ai/inquiry` plan, not the `ask` ladder. The
two have never been connected on the member surface.

## A.4 · Forum exists on the server and does not exist for users.

```
grep -rn "forum" js/ index.html   →   no matches
```

`forumThreads` (`server.js:12371`), four routes (12395, 12413, 12441, 12472), a pure policy module
(`ai/forum.js`), and `scripts/forum-smoke.js`. No component, no page, no navigation destination, no
fetch call anywhere in the client.

This changes the framing of the founder's section 5 completely. **There is no Forum architecture to
redesign into a messaging experience. There is a correct kernel boundary with no product on top of
it.** Whatever is built is the first thing users see, and it can be shaped freely — subject to one
constraint, in D.

## A.5 · Three parallel conversation systems, and only one has an evidence door.

| System | Store | Topic? | Threaded? | Evidence door | Surface |
|---|---|---|---|---|---|
| Assistant turns | conversations | implicit | yes (`conversationId`) | intake → `_noteGroupCandidates` | the composer, card threads |
| Forum | `forumThreads` `server.js:12371` | inquiry-anchored | flat + `replyTo` | `ai/contribution.js` via 12472 | **none** |
| Messages | `orgMessages` `server.js:13366` | **none** | **no** | **none** | Inbox (`_renderInbox`, `js/member-view.js:1381`) |

`orgMessages` is a flat bag keyed by id, with `toType: user|group|org`, an `anonymous` flag, and a
`readBy` array. No thread, no topic, no reply, no lifecycle, no classification, no contribution
path. It is addressed against `orgGroups` (`server.js:13388`) — which is a **second group concept**,
distinct from `orgNodes` (`server.js:12136`), with its own membership arrays and its own feed
endpoint (`/api/groups/:groupId/feed`, 14295) that merges shared notes and messages.

**This is the `orgGoals` failure again**, and the harness review already named the pattern: a
parallel concept with CRUD endpoints that the kernel does not read. `orgGroups`/`orgMessages`
carry conversation that can never become understanding, addressed to a group structure the
inquiry kernel does not know about.

Any Forum work that builds on `orgMessages` inherits the dead end. Any Forum work that builds on
`forumThreads` inherits the boundary. That is the whole decision.

## A.6 · The Evidence Scout already exists — for one source, deterministically, with no model.

`server.js:12145`, called from intake at `server.js:8930`:

```js
function _noteGroupCandidates(code, userId, subjectRefInquiry, props, concept, label) {
  const nodeIds = (user && user.assignedNodeIds) || [];
  for (const p of props) for (const nodeId of nodeIds) {
    const verdict = contribution.classifyScope(p, { nodeId });
    if (verdict.scope !== 'GROUP_CANDIDATE' && verdict.scope !== 'BOTH') continue;
    if (list.some(c => c.evidenceRef === p.id && c.nodeId === nodeId)) continue;   // idempotent
    list.push(contribution.newCandidate({ … originRef: p.originRef, originKind: p.originKind … }));
  }
}
```

Line by line against the founder's section 6B specification:

| Founder's requirement | Already implemented |
|---|---|
| examines authorized contributions | intake proposals, post-authorisation |
| "does anything here matter?" | `contribution.classifyScope` — `ai/contribution.js:82` |
| output is *candidate*, not truth | `status: 'detected'`, `ai/contribution.js:44` |
| carries provenance | `originRef` / `originKind` / `occasion` carried unchanged |
| carries speaker | `contributorId` |
| carries timestamp | `createdAt` |
| carries scope | `scope: GROUP_CANDIDATE \| BOTH` |
| status candidate/unverified | `detected → contributed → admitted \| dismissed \| expired` |
| does not determine causation | `ai/contribution.js` computes no confidence and no hypothesis |
| deduplication | `list.some(c => c.evidenceRef === p.id && c.nodeId === nodeId)` |
| ages out | `CANDIDATE_TTL_MS = 14 days`, `expireCandidates` |
| invisible to everyone else | `/api/group/:nodeId/candidates` returns `c.contributorId === userId` only, 12210 |

**The scout is built. It is pointed at one source.** The forum contribute route (12472) deliberately
does not call it — a forum message becomes a candidate only when its author explicitly posts to
`/contribute`.

And it uses **no model.** `classifyScope` is a regex over the speaker's own words
(`COLLECTIVE`, `ai/contribution.js:68`) whose only power is to refuse:

> *"A model may propose that something concerns the group; without collective language actually
> present in the person's own words, that proposal is declined … It can only ever make the system
> quieter."* — `ai/contribution.js:64`

## A.7 · The incremental cursor model exists, in the connector runtime, with the right semantics.

`server.js:6710-6737`, `_processBatch`:

```js
if (!r.drift) {
  // Commit the cursor ONLY now that the batch has crossed the boundary.
  const hw = _highWater(upserts);
  conn.pendingCursor = hw || conn.pendingCursor || null;
  conn.cursor = conn.pendingCursor; conn.highWater = hw || conn.highWater || null;
}
```

and the run model at 6616:

> *"connection → run created → fetch → raw persisted → mapping applied → identity resolved →
> evidence recorded → cursor committed → run finalized. The cursor is committed ONLY after the
> batch safely crosses the evidence boundary, so a failed run resumes without skipping records
> (and dedupe makes the replay idempotent)."*

Every property the founder's section 7 asks for — process only new material, stamp provenance,
route through the existing boundary, record processing state, stop; and revisit history only
deliberately (`/api/connections/:id/cursor/reset`, 6829, audited) — is implemented and has a smoke
test (`scripts/sync-reliability-smoke.js`).

**The Evidence Scout does not need a cursor design. It needs to reuse this one.**

## A.8 · The heartbeat the scout would ride already exists.

`server.js:10404` `_reasonSweep` on a 30-minute interval (17180), plus `_reasonNudge(code)`
(10413) — event-driven cache invalidation called from connector completion (6722), event creation
(6945), note sharing (13752), withdrawal (13762), check-in (14434). The pattern is: work happens
on the tick; new input drops the cache so the *next read* re-reasons. Cheap, bounded, per-org
isolated.

## A.9 · Message-kind classification partly exists.

`ai/inquiry.js:235-275`, `interpretResponse` already separates:

- `responseKind: 'assertion' | 'observation' | 'interpretation'`
- vague / hedged → `authority: 'needs_corroboration'`, `definite: false`
- negation, and negation-that-contradicts-an-authoritative-record
- affirmation, with authority determined by **who answered**, not that it was typed

The founder's list (question, opinion, observation, joke, speculation, prediction, recollection,
correction, hearsay, factual claim, instruction) is longer. But see H: most of those distinctions
do not need to be made.

## A.10 · What genuinely does not exist

Searched and found nothing:

- **External sightings.** `grep -rn "sighting|external_source|externalSource|web_search|webSearch" ai/ server.js` returns nothing. `retrieval.TRUST_RANK` (`ai/retrieval.js:20`) has `system_of_record | connected | user_reported | unknown | derived` — every tier is internal. There is no evidence class for "the world said this".
- **A "why" endpoint for an insight.** Exactly one `/explain` route exists in 305 routes: `server.js:10122`, for org-memory moments.
- **Any visualisation.** Confirmed again this pass; unchanged from `expression-and-initiative.md` §4.
- **Privacy classification of forum speech.** The post handler (`server.js:12413-12432`) stores `text` and calls nothing from `ai/privacy.js`.
- **A processing cursor over conversation.** The connector cursor is per-connection, not per-thread.

---

# B · UI compression audit

`js/app.js:1478` already renders an empty sidebar:

```js
// The sectioned navigation drawer is retired — the app flows from ONE assistant page.
const nav = document.getElementById('sidebar-nav');
if (nav) nav.innerHTML = '';
```

**So the compression the founder is asking for has already happened once, at the navigation
layer, and was not finished at the page layer.** Thirty destinations remain live in `NAV_ROUTES`
(`js/app.js:635`), each with a renderer, each reachable by `navigate()`, none reachable by a user
who does not know the id. Three are surfaced through the account gear (People / Organisation /
Settings, `js/app.js:1533`).

That is the real current state and it changes the recommendation: this is mostly **deleting
renderers that nothing links to**, not redesigning an information architecture.

| Destination | `PAGE_TITLES` | Human job it does today | Verdict |
|---|---|---|---|
| `home` | Home | The one assistant surface: composer, attention cards, card threads, notes, recognitions, focuses | **KEEP** — but strip; see B.1 |
| `inquiry` | Inquiries | Read-only list of the member's own inquiries, grouped live / landed / contested | **KEEP + MAKE EXPLORABLE** (C) |
| `inbox` | Updates | `orgMessages` list — flat messages, no topic, no thread | **REPLACE** with Forum/Messages (D) |
| `notes` | Notes | Saved memory with tags and sharing | **MERGE** into Home; already duplicated at `_renderMeNotes` |
| `stats` | Progress | The member's own trend view | **MOVE** under Highs — it is the evidence behind a High |
| `checkin` | Check-In | Structured current-state capture | **MERGE** into the composer; `/api/me/context.ask` already asks it |
| `assessments` | MyWorkspace | Assigned work, released feedback, drafts, submissions | **KEEP, separate** — this is real work delivery, not understanding. It is a legitimately different product concept and should say so |
| `apps` | Apps | Connect personal data sources | **HIDE** behind the gear |
| `leader-home` | Home | Leader's Today: who needs attention | **MERGE** into Highs/Lows with a leader audience — `behaviour.plan({audience:'leader'})` already does this |
| `leader-people` | My People | Roster the leader is responsible for | **KEEP** under the gear — it is a directory, not understanding |
| `team-readiness` | Team readiness | Focus → ready → blockers → next questions | **MOVE** into Inquiries — it is literally a projection of uncertainties (`ai/readiness.js:1`) |
| `operating-context` | Operating context | Confirmed org context | **HIDE** behind onboarding; it is a setup artifact |
| `org-memory` | Organisational memory | Recorded derived states over time | **HIDE** — infrastructure for `org-learning`, not a user concept |
| `org-learning` | Observed over time | Longitudinal observations | **MOVE** into Highs — "what recurred" is the raw material of "what works" |
| `org-playbook` | Playbook | What has worked | **MOVE** into Highs (M.3) |
| `operate` | How we operate | Operating rules | **HIDE** behind the gear |
| `leader-groups` | My Groups | `orgGroups` management | **REMOVE** — the parallel group concept (A.5) |
| `data-sources` | Knowledge | Org connectors and documents | **HIDE** behind the gear |
| `assignments` | Assignments | Leader's view of assigned work | **MERGE** into `assessments` |
| `org-health` | Organisation Health | Org-wide rollup | **MERGE** into Highs/Lows at org audience |
| `analytics` | Insights | Charts and aggregates | **REMOVE** — this is the dashboard the product is trying to stop being |
| `scenarios` | Manage Assessments | Assessment authoring | **MERGE** into `assessments` |
| `organisation` | Organisation | Org structure | **KEEP** under the gear |
| `people` | Members | Member admin | **KEEP** under the gear |
| `alerts` | Alerts & Notifications | Alert list + unread badge | **REMOVE** — Lows is this, done properly |
| `reports` | Reports & Stat Sheets | Exports | **HIDE** under the gear |
| `settings` | Platform Settings | Settings, incl. the `goals` tab | **KEEP** under the gear; drop the Org Goals tab with `orgGoals` (already queued P0-A) |
| `dashboard` | Overview Dashboard | Legacy admin dashboard | **REMOVE** |
| `members` | Members & Profiles | Legacy member list | **REMOVE** |

**Count: 5 user-facing surfaces (Home, Highs, Lows, Inquiries, Messages) + Workspace + a gear.**
That is the founder's target, reached mostly by deletion.

## B.1 · What Home should stop rendering

`_renderHome` (`js/member-view.js:309`) calls `_renderMyWorkspace` then `_renderMeContext`, which
renders recognitions, open questions, focuses and notes — while three of its own blocks are already
dead, marked in comments:

- `briefEl.innerHTML = ''` (334) — the greeting moved to `behaviour.opening`
- `notEl.innerHTML = ''` (364) — "things I've noticed" moved to the Attention surface
- prepared-suggestions block removed (376) — moved to the Attention card

**Home has already been half-emptied and the empty containers are still being rendered.** Finishing
that is cleanup, not design.

What remains that is genuinely Home-only: recognitions (someone noticed you), open questions,
active focuses (report an outcome). Of these, **focuses are the one thing that must not move** —
they close the intervention → outcome → learning loop (`focusOutcome`, `js/member-view.js:478`),
which is TTD LAW M1.

---

# C · Conversational-object feasibility

**Yes, and the surface already exists — it just needs to accept a second kind of subject.**

The interaction contract in `openInsightThread` / `cardSend` is three things:

1. a stable key (`dedupeKey`) that identifies the thing being discussed;
2. a short human context string used to open the conversation (`info.headline`);
3. a `conversationId` persisted per key (`_cardThreads`), so the thread continues.

Nothing in that contract is specific to a `ProactiveInsight`. An Inquiry has all three:
`inquiryId`, `topic.label`, and no conversation binding yet.

**This does not flatten the domain objects, and it must not.** The difference between a High and an
Inquiry is not presentational, and the thread has to know which it is opening:

| | High / Low | Inquiry |
|---|---|---|
| What it asserts | *we believe something* | *we do not yet understand something* |
| Where it comes from | `proactive.toInsight` over kernel findings | `diagnose` over admitted evidence |
| Its confidence | `kernelConfidence` word | `confidence.band` + `because` + `alternatives` |
| Its lifecycle | surfaced → dismissed / acted / muted | exploring → probable → supported / disputed / resolved |
| What "done" means | the person acted or muted it | the question was answered or contested |
| Correct first message | "Let's talk about this: `<headline>`" | "What's still unknown here is `<stillUnknown[0]>`" |

So the shared surface is the *container* — an expandable pane, a composer, a persisted
`conversationId`, a close action — and the *opening move and the close action differ per type*.
That is one small dispatch, not a unification of domain models.

**The smallest consistent interaction model (answering §15):**

> Any object that can name itself and state its own basis can be opened. Opening it starts a
> governed assistant turn seeded with that object's context. The object decides its opening line
> and what "done" writes back. Nothing else is shared.

**Cost of applying it to Inquiries:** the card render already has `stillUnknown`, `alternatives`,
`confidence.because` and `timeline` (`js/member-view.js:2706-2718`). Adding a "Talk this through"
button that calls the same `cardSend` with an inquiry context is roughly the size of
`openInsightThread` itself.

## C.1 · One thing that must be added, not reused

`resolveInsightThread(key, 'useful')` writes into the reasoner's response ledger — `useful`,
`acted`, `dismissed`, `wrong` (`ai/reason.js:43`), which drive anti-nag cooldowns
(`DISMISS_COOLDOWN`, `WRONG_COOLDOWN`, `ai/reason.js:39-40`).

An Inquiry must **not** reuse those verbs. "Not now" on a belief is suppression. "Not now" on an
open question is not the same act, and if it wrote to the same ledger, dismissing a question would
quietly suppress the belief it was trying to test. The addendum already drew this line —
suppression governs push, contested state governs presentation — and it applies here exactly.

---

# D · Forum interaction map, and the one refusal

## D.1 · The invariant the founder's proposal breaks

`ai/forum.js:35`:

> *"Every Forum discussion is anchored to a real group inquiry. There are deliberately no
> free-floating team threads: an unanchored thread is a place where a topic can accumulate apparent
> importance without ever passing the evidence boundary."*

The founder wants: start a conversation, pick people, give it a topic. That is a free-floating
thread. Enforced at `server.js:12376` — `_forumThread` returns 404 unless an inquiry already exists
for `group:<nodeId>`.

**I would not ship the founder's version as stated.** But I also think the invariant is stated one
level too strong, and the fix is clean.

## D.2 · The invariant is really two invariants, and only one of them needs the anchor

Read what actually guarantees safety today:

1. **Speech cannot become evidence by accumulating.** Guaranteed by `ai/forum.js` containing no
   evidence vocabulary at all — "it contains no reference to evidence, confidence, origins or
   hypotheses, and it cannot produce any" (`ai/forum.js:8`). The post handler touches
   `forumThreads` and nothing else (`server.js:12413`).
2. **A topic cannot accumulate apparent importance.** This is the one the anchor protects — it
   stops a busy thread from *looking* like an inquiry to a human.

Invariant 1 does not depend on the anchor. It depends on the module's shape, and it holds for any
thread whatsoever.

Invariant 2 is a real risk, but the anchor is not the only way to hold it. **The precise property
needed is: a thread must have no door out until a subject exists.** A thread with a topic and no
inquiry is inert *by construction* — there is nothing to contribute *to*.

## D.3 · The proposal: separate the container from the anchor

```
Conversation  =  participants + topic + messages          (created by a human, always inert)
Anchor        =  an optional link to a subject + inquiry   (created when someone contributes)
```

- **Starting a conversation** requires no inquiry. It is speech. `mayRead` / `mayPost` widen from
  node membership to the participant set.
- **Contributing** from a message requires choosing a subject. If the conversation is already
  anchored, that is the anchor. If not, the contributor picks: *my own account*
  (`member:<userId>`), or *a node I belong to* (`group:<nodeId>`). Picking a node is the moment
  `_forumThread`'s current precondition gets checked — and the inquiry gets created or found via
  the existing `_inquiryFor` path (`server.js:12189`).
- **A conversation whose participants are an ad-hoc set of people has no group subject and never
  gets one.** This is the hard limit and it is correct: `group:<nodeId>` requires a node
  (`_groupSubjectRef`, `server.js:12126`), and minting subjects for arbitrary people-sets would
  grow `inquiryStates` without bound and create group beliefs about collections that no leader
  is responsible for. From an ad-hoc conversation you may contribute **your own account to your
  own subject**, or to a node you are in. Nothing else.

That preserves both invariants, gives the founder the iMessage model, and adds one field
(`participants`) plus one nullable field (`anchor`) to `forum.newThread`.

## D.4 · Current versus proposed

| | Today | Proposed |
|---|---|---|
| Create a thread | impossible without a group inquiry | any user, any participants, any topic |
| Participants | node members + node leaders (`_forumAccess`, 12390) | explicit participant set; node membership is one way to populate it |
| Topic | the inquiry's `topic.canonicalConcept` | free text, the user's own words |
| Message | `forum.newMessage`, flat + `replyTo`, cap 500 | unchanged |
| Speech → evidence | author posts to `/contribute` | unchanged, plus a subject choice when unanchored |
| Origin of a contribution | `originForMessage` — echo carries the original's origin | unchanged (but see M.1: it has a bug) |
| Privacy classification | **none at post time** | required — see G.2 |
| Front end | **none** | the build |

## D.5 · What the user never has to understand

`forumThread`, `subjectRef`, `groupCandidates`, `evidenceRef`, `originKind`, `inquiryId`. All of
those already live behind the API. The only concept that must reach the user is the one that
carries a moral weight: **"offer this as my account"** — because it is a deliberate act with
consequences, and hiding it would be the failure `ai/contribution.js:132` exists to prevent
(`'contribution must be deliberate, never automatic'`).

Name it in human words. "Put this on the record" is closer than "contribute".

---

# E · Forum AI map

| Role | Exists? | Where, or what is missing |
|---|---|---|
| **A · Participant** | **Mostly exists, wrong scope** | `/api/assistant/turn` is a full governed turn with retrieval, grounding, citations, privacy gate, language guard. What is missing is a *conversation-scoped* authorisation set: today a turn is scoped to the asker. In a shared thread the answer must be scoped to the **intersection** of what every participant may see, not the asker's own scope. That is a genuinely new authorisation shape, and it is the hardest part of this whole document. See G.3. |
| **B · Scout** | **Exists for one source** | `_noteGroupCandidates` (A.6). Pointing it at forum messages needs: a cursor, privacy classification at post time, and an author-owned candidate. See F. |
| **C · Facilitator** | **The decision machinery exists; the trigger does not** | `readiness` (`ripe`/`held`), `register` (`support`/`scout`/`acknowledge`), `timing`, `_urgency` — all in `ai/reason.js:320-370`, all computed per belief. `ai/behaviour.js` owns whether to say anything and treats silence as success. What does not exist is any notion of a *conversation* having a state worth facilitating (three competing explanations; one disagreement blocking settlement). That is a new deterministic reading over thread + inquiry state. |

## E.1 · The facilitator's three examples, checked against what exists

- *"Three different explanations have emerged. Would it help if I compared the evidence for each?"*
  — Inquiries already carry `alternatives` with per-alternative bands
  (`js/member-view.js:2714`). The comparison is computable today. The trigger is not.
- *"This conversation may help answer an open inquiry. Would you like to contribute the permitted
  parts?"* — this is the Scout's output rendered as an offer. It needs no facilitator at all.
- *"There is one disagreement preventing this from settling. Want me to show it?"* — inquiry status
  `disputed` already exists and is already grouped as "Contested" in the UI
  (`js/member-view.js:2702`). Computable today.

**So two of the three are the Scout and the Inquiry surface wearing a different hat.** The
facilitator as a distinct capability is thinner than it looks, which is a reason to build it last
and a reason not to give it its own module.

## E.2 · The constraint that must be written down before any of this is built

The founder says "do not allow the AI to dominate human conversation merely because it can generate
responses." That is right, and the existing architecture gives a stronger version of it for free:
**IntelliQ may speak in a thread only when invited, or when `behaviour` would have surfaced the same
thing anyway.** A facilitator offer is subject to `plan()`'s volume cap and to the same suppression
set (`insightSuppression`, `server.js:4193`) as everything else. If it is not worth a card on Home,
it is not worth interrupting a conversation.

That is one line of policy and it costs nothing to enforce, because both paths already go through
`behaviour.plan`.

---

# F · Evidence Scout architecture

The smallest safe mechanism. Every component below is an existing one, named.

## F.1 · Shape

```
new forum message
  → (post time)  privacy.classifyText          → sensitivity stored ON the message
  → (tick)       cursor: messages after processedThrough, visible, not restricted
  → (per author) build a proposal-shaped record from the author's own message
  → contribution.classifyScope                 → GROUP_CANDIDATE | BOTH | drop
  → contribution.newCandidate                  → status 'detected', owned by the author
  → dedupe on (evidenceRef, nodeId)            → idempotent replay
  → commit cursor ONLY after the batch is recorded
  → the author sees it in /api/group/:nodeId/candidates; nobody else ever does
```

## F.2 · Component by component

**Triggering.** `_reasonNudge(code)` from the forum post handler, same as note-sharing does at
`server.js:13752`. Work happens on the 30-minute `_reasonSweep` (17180) or the next read. No new
timer.

**Cursor / checkpointing.** Per thread: `thread.processedThrough = <messageId>` plus
`thread.processedAt`. Commit **after** candidates are pushed, mirroring `_processBatch`
(`server.js:6726`). A crash re-processes a window; dedupe makes that free.

**Extraction.** *No model in v1.* `classifyScope` needs `{ sourceSpan, concerns, level }`. The
message text is the `sourceSpan`; `level: 'observation'`; `concerns` unset. With `concerns` unset,
`classifyScope` returns `SELF_ONLY` at `ai/contribution.js:111` — deliberately, because
"silence must not publish". So a purely deterministic v1 produces **zero candidates**, which is
useless.

That is the real design question and it has a clean answer: **the collective-language regex is the
proposal.** Set `concerns: 'group'` when `COLLECTIVE.test(text)` and let `classifyScope` decide.
The regex is then doing exactly what it was built to do — it cannot invent group relevance, only
confirm that the speaker used collective language in their own words. A model can be added later
to propose `concerns` more precisely; it can only ever make the system quieter, never louder,
because `classifyScope` still refuses without collective language.

**Provenance.** `originRef: 'forum_' + messageId`, `originKind: 'direct_observation'` — from
`forum.originForMessage` (`ai/forum.js:146`), unchanged. Echo handling stays as it is (and stays
broken until P0-5 lands; see M.1).

**Privacy.** The gate, and the thing I would not ship without. See G.2.

**Routing.** Nothing new. `contribution.newCandidate` → the author's own candidate list →
`/contribute` → `_admitGroupContributions` → `shouldOpenGroupInquiry` → `applyProposals`.

**Deduplication.** `(evidenceRef, nodeId)` as at `server.js:12157`. `evidenceRef` is the
`messageId`, which is stable across edits — so **editing a message does not create a second
candidate**, which is correct and matches the existing rule that editing speech never rewrites
evidence (`server.js:12434`).

**Reprocessing.** Only on: a message edit before it was contributed (recompute in place, same key);
a new inquiry making an older window newly relevant (a deliberate, audited reset, exactly like
`/api/connections/:id/cursor/reset`, 6829); a scope change (participants added). Never on a tick.

**Cost controls.** Zero model calls in v1. If a model is added: one call per *batch of new messages
per thread per tick*, never per message, never over history. Bounded by the same daily LLM rate
store already in place (`_llmRateStore`, `server.js:11002`).

**Failure behaviour.** Scout failure must be silent and total for that thread: no candidate, cursor
not committed, retried next tick. A candidate is a suggestion; losing one costs nothing. Never
partial-commit a batch. Wrap per thread, not per org, so one malformed thread cannot stop the
sweep — the same discipline `_reasonSweep` already uses (`server.js:10408`).

## F.3 · What the scout must never do, restated as testable properties

1. Never produce a candidate for anyone but the message's author.
2. Never produce a candidate from a message classified `sensitive` or `restricted`.
3. Never produce a candidate visible to anyone but its owner before contribution.
4. Never mint an origin — origin comes from `forum.originForMessage`.
5. Never call `applyProposals`, `deriveConfidence`, or touch `inquiryStates`.
6. Never advance the cursor past a message it failed on.

Those are six assertions. They are the test I would write before any of this is briefed.

---

# G · Privacy threat analysis

## G.1 · What is already enforced

- **Classification exists** — `privacy.classifyText` (`ai/privacy.js:51`), three tiers, with a
  restricted-topic regex covering counselling, medical, mental health, self-harm, bereavement,
  family (`ai/privacy.js:26`) and a sensitive regex covering first-person hardship
  (`ai/privacy.js:40`), biased deliberately toward over-protection.
- **Private informs, never reveals** — `buildContextBlock` structurally separates citable from
  private-informing context before it reaches a model (`ai/privacy.js:78`); `redact` strips
  verbatim runs ≥16 chars as a last line of defence (94).
- **Membership is not consent** — `mayContribute` requires `inNode` **and** ownership **and**
  `explicit` (`ai/contribution.js:121-133`).
- **A leader cannot publish a member's words** — enforced twice, in
  `contribution.mayContribute` (129) and again in `forum.mayContributeMessage`
  (`ai/forum.js:127`): *"only the author may offer their own statement as evidence"*.
- **The group holds a claim and a reference, never the text** — `toGroupProposal` sets
  `sourceSpan: null`, `verbatim: false` (`ai/contribution.js:246-268`). This is why "no private
  text can reach a group read" is structural.
- **A candidate is invisible to everyone including the leader** — `server.js:12219`.
- **A leader-audience insight carries no evidence basis** — `ai/proactive.js:273` empties `basis`,
  and `audienceSafe` re-checks it at 303.
- **The reasoner never receives raw text** and structurally cannot quote one (`ai/reason.js:22`).

That is a strong stack. The threats below are the ones it does not cover.

## G.2 · Threat 1 — forum speech is unclassified, and the Scout would read it

`server.js:12413-12432` stores `text` with no call into `ai/privacy.js`. Today that is harmless:
nothing reads forum text except the humans in the thread, and contribution is a deliberate act by
the author who knows what they wrote.

**Add the Scout and it stops being harmless.** A member writes *"I've been struggling since my dad
died, I don't think I can make Saturday"* in a team thread. `COLLECTIVE` does not match, so
`classifyScope` refuses — this specific sentence is safe by luck, not by design. Change it to
*"we've all been finding Saturdays hard, I've been struggling since my dad died"* and the collective
test passes, and the scout offers to put it forward. The author still has to accept. But **the
system has now suggested that a bereavement disclosure become team material** — and a suggestion at
a vulnerable moment is a form of pressure.

**Required before any Scout ships:** classify at post time, store the tier on the message, and have
the scout skip `sensitive` and `restricted` entirely. Cost: one function call in the post handler
and one filter in the scout. This is the single most important line in this document.

## G.3 · Threat 2 — the Participant's answer scope

A turn today is scoped to the asker. In a shared thread, an answer visible to five people scoped to
one person's authorisation leaks by construction — not through a bug, through the design being for
a different situation.

The correct rule is the **intersection**: an answer posted into a conversation may only rest on
evidence every participant is authorised to see. That is strictly narrower than any individual
scope, so it fails closed. It is also more expensive to compute and will often produce a thin
answer. That is the correct trade, and the honest surface for it is IntelliQ saying so: *"there is
more I could say to you privately about this."*

I would not build the Participant before the Scout for exactly this reason: the Scout's privacy
model is a filter, the Participant's is a new authorisation primitive.

## G.4 · Threat 3 — the sensitive-professional conversation

The founder's example: a private conversation with a health or wellness professional must not become
organisational evidence.

Today: `classifyText` maps `source: 'counselor' | 'trainer' | 'medical'` to `RESTRICTED`
(`ai/privacy.js:54`) and the topic regex catches most of the vocabulary. Private evidence has its
own smoke test (`scripts/private-evidence-smoke.js`) and safeguarding has its own module and route
set (`ai/safeguarding.js`, `server.js:12745`).

What does **not** exist is a *conversation-level* sensitivity. Everything is per-message and per-text.
A thread that is inherently restricted — because of who is in it, not what was said — has no way to
declare that. The founder is right that this matters, and the answer is small: **a conversation
carries a sensitivity floor, and no message in it can classify below that floor.** One field, checked
in one place.

## G.5 · Threat 4 — aggregate disclosure

The founder allows that "the organization might, under legitimate governance, receive an appropriate
aggregate". There is no aggregation-over-private-evidence path today, and I would keep it that way
until a pilot org asks for it with a named legitimate purpose. Aggregates of small groups are
re-identifiable, and a squad is a small group. This is a place to do nothing deliberately.

## G.6 · The founder's strongest point, and it is not covered

> *"Privacy must be obvious to users, not merely correct in code."*

This is correct and currently false. The privacy model is excellent and **invisible**. The only
places a user is told anything are two API `note` strings they will never read
(`server.js:12405`, `12224`).

The cheapest honest fix is at the moment of consequence: when a user is offered the chance to put
something on the record, show them exactly what crosses — *the claim, not your words; your name, or
not; here is what the group will see.* `toGroupProposal` already computes precisely that object.
Rendering it is a UI change against data that already exists.

---

# H · Evidence semantics: conversation without automatic truth

The chain the founder proposes already exists and already has these names:

```
message                    ai/forum.js — inert, no evidence vocabulary
  → candidate              ai/contribution.js:140 — private, inert, expires
  → contributed            a deliberate act by the author, ai/contribution.js:132
  → admitted               only if shouldOpenGroupInquiry passes, :194
  → proposal               toGroupProposal, :242 — claim + reference, never words
  → kernel                 diagnose.applyProposals — the same path everything uses
```

**`message → truth` is not merely forbidden, it is unrepresentable**: there is no function anywhere
that takes a message and returns a signal.

## H.1 · The founder's eleven message kinds — and why nine of them do not need distinguishing

question, opinion, observation, joke, speculation, prediction, recollection, correction, hearsay,
factual claim, instruction.

The system does not need to identify these. It needs exactly one thing to be true: **anything that
is not a first-hand observation must fail to become one.** The existing gates deliver that without
classification:

| Kind | Why it already fails to become group evidence |
|---|---|
| joke, chit-chat, question | no collective language, or the author never contributes it |
| opinion, speculation, prediction | `classifyScope` refuses anything with `level !== 'observation'` (`ai/contribution.js:92`) |
| hearsay | `originForMessage` marks a declared echo `reported` and reuses the original origin (`ai/forum.js:146`); `shouldOpenGroupInquiry` counts **origins, not contributors** (`:203`) |
| recollection | enters as an observation with the speaker's own origin — which is what it is |
| correction | has its own lifecycle: `withdrawalProposal` (`:276`) and `diagnose.supersede` |
| instruction | `capture.detectCommand` (`ai/capture.js:36`) routes it as a save command, not evidence |
| factual claim | enters as an observation, authority determined by role — and this is P0-D |

**The one genuinely missing distinction is hearsay that is not declared.** `originForMessage` relies
on the author pointing at the message they are echoing (`ai/forum.js:141`: *"The author says which"*).
An author who restates a rumour without flagging it produces a fresh origin. The file argues this is
the honest place for the decision, and I agree — guessing from wording would either invent
independence or destroy it. But it is a known, accepted hole and it should be written into the TTD
register as such rather than left implicit.

## H.2 · The smallest missing boundary

Not a classifier. **A privacy tier on a message** (G.2), so that the scout can refuse before it
reasons. Everything else in §8 is already solved.

---

# I · External-sighting semantics

Nothing exists (A.10). The design constraint is stated exactly right by the founder and I would
formalise it as:

**An external sighting is not evidence about the organisation. It is context about the world, and it
may only ever appear alongside an organisational belief, never inside its basis.**

Concretely, against what exists:

- A new trust tier is wrong. `TRUST_RANK` (`ai/retrieval.js:20`) ranks *authority over an
  organisational fact*; an external source has none, and giving it `unknown` or `0` would still put
  it on the same axis. **External material needs a different axis, not a lower rung.**
- It must never reach `deriveConfidence`. Confidence is computed from independent origins about
  *this* organisation (`ai/diagnose.js`). A citation from the literature is not an origin, and one
  line admitting it there would silently convert reading into corroboration.
- It must never reach `shouldOpenGroupInquiry`. A group inquiry asserts something is worth
  understanding *about this group* — the world's opinion cannot open one.
- It can legitimately do two things: **suggest a hypothesis** (`inquiry.buildUncertainty` already
  carries `hypotheses`, `ai/inquiry.js:48`) and **suggest a question worth asking**. Both are
  proposals, both already proposal-gated.

The founder's example expression is exactly right and is already expressible under
`ai/language-guard.js`:

> *"There is a potentially relevant external pattern, but current organisational evidence does not
> establish that the schedule change caused this decline."*

That sentence describes and does not claim causation — which is the guard's whole test.

**P2 at the earliest.** It is the most attractive item in this document and the one with the least
pilot value.

---

# J · "Why?" grounding audit

| Thing IntelliQ says | Can it show its basis? | Evidence |
|---|---|---|
| Inquiry | **Yes, and well** — `confidence.because`, `stillUnknown`, `alternatives` with bands, and a `timeline` of how it changed | `js/member-view.js:2706-2718` |
| Assistant prose answer | **Yes** — `citations`, `cites`, `limitations`, `confidence`, `bounded`, and a grounding artifact | `server.js:11964`, `9182` |
| Extractive answer (no model) | **Yes, by construction** — sentences lifted only from authorised passages, each tied to its evidence | `ai/retrieval.js:14` |
| Belief in the reasoner's agenda | **Yes** — `why` and `challenge` (what would refute it) | `server.js:_reasonAgendaSafe` |
| High / Low (self audience) | **Computed but not rendered.** `basis` is on the artifact (`ai/proactive.js:273`); the card renders `headline`, `body`, `explore`, `suggestion` and never `basis` | `js/member-view.js:2814-2818` |
| High / Low (leader audience) | **No, deliberately and correctly** — `basis` is emptied for leaders and `audienceSafe` re-checks | `ai/proactive.js:273`, `303` |
| Outcome / playbook claim | **Yes** — `limitations` includes `not_causal` | `scripts/pilot-loop-smoke.js` §6 |
| A visualisation | n/a — none exist | |

## J.1 · The one real gap, and it is small

**A self-audience High or Low computes its own basis and throws it away at render time.** The user
can open a thread and *ask* why, and the assistant will answer from retrieval — but the artifact's
own `basis` array, the honest privacy-safe evidence strings the kernel produced, never reaches the
screen.

That is a one-line render change on data already in the payload, and it is the highest
value-per-character item in this entire document.

## J.2 · The founder's five-way answer, mapped

| Founder's category | Where it comes from | Status |
|---|---|---|
| What I observed | insight `basis`, inquiry `confidence.because` | exists, unrendered for insights |
| What you told me | `citations` over the person's own evidence | exists |
| What others contributed | contribution provenance — `contributedBy`, `contributorVisibility` | exists on the proposal (`ai/contribution.js:264-266`), never surfaced |
| External context | — | **does not exist** (I) |
| What I don't know | `stillUnknown`, `alternatives`, `limitations` | exists, and is genuinely good |
| Confidence without false precision | bands only, never a score | enforced — `pilot-loop-smoke` §5 asserts it |

Four of six exist. One is rendered nowhere. One is P2.

---

# K · Product surface proposal

Based only on what exists or is a small delta from it.

**Home.** One question or silence.
- The question comes from `ai/inquiry`'s ranked plans, not the `ask` ladder — so "no question" is
  reachable, which is the point (A.3).
- Silence uses `behaviour._calm`, which already exists and already says the right thing.
- Keep, below the fold: active focuses (closes the outcome loop), recognitions (the human reason to
  open the app). Everything else in `_renderMeContext` goes.
- The composer stays. It is the one input.

**Highs.** `behaviour.plan().groups.worth_celebrating`. Each card explorable — already is. Each card
shows its `basis` — one-line change (J.1). Over time this is where the playbook and "what works"
land (`ai/org-playbook.js`, `ai/org-learning.js`), because that is what a High *becomes*.

**Lows.** `behaviour.plan().groups.needs_attention`. Same card, same thread, same feedback verbs.
This absorbs `alerts` entirely.

**Inquiries.** The existing page plus the existing thread affordance (C), with its own close
semantics (C.1). `team-readiness` folds in here, since it is a projection of uncertainties.

**Messages.** The new build (D). Conversations with participants and a topic; contribution to a
subject as a deliberate act; the scout offering the author their own noticings.

**Workspace.** Assigned work stays a separate concept and should be named as one. It is delivery,
not understanding, and merging it into this model would blur both.

**The gear.** People, Organisation, Settings, Knowledge, Apps, Reports. Already the pattern
(`js/app.js:1533`).

**Indicators.** The founder's "meaningful state change you have not seen" is computable today:
`mem.lastSeen` already exists and is already used to count new signals since last visit
(`server.js:4386-4392`). The rule must be *state change*, not *volume* — a new High, a Low that
worsened, an inquiry that became contested. Never "3 new messages".

---

# L · Where I would challenge the founder

**L.1 · Two of your five tabs are one query with a filter, and that is a warning.** Highs and Lows
are `behaviour.plan()` split by polarity. If they are two destinations, a user with two Highs and
zero Lows sees an empty tab — and empty tabs teach people to stop opening things. The bucket labels
already work as *sections on one surface*, which is what `behaviour.plan` returns and what
`js/member-view.js:2822` already renders. **Consider whether Highs and Lows are tabs or sections.**
I lean strongly to sections until a real user says otherwise.

**L.2 · "Nothing should feel dead" and "silence is success" are in tension, and you have not said
which wins.** A system where everything is explorable invites exploration; a system that treats
silence as success discourages it. `askFirstOffer`'s consent semantics
(`ai/priority-office.js`) resolve this correctly for preferences — IntelliQ proposes, the human
decides. Apply the same rule here: everything *can* be opened, nothing *asks* to be opened. That is
a real constraint on the indicator dots in section 3, and it is the one that stops them becoming
notifications.

**L.3 · The Forum is the largest unbuilt thing in this document and you have described it as a
redesign.** There is no front end (A.4). Participants, topics, ad-hoc threads, message-level
privacy, the participant AI's intersection scope, and the scout are, together, the biggest single
piece of work proposed here — larger than all four P0 pilot blockers combined. Naming it as
compression is how it ends up underestimated.

**L.4 · You dropped a bucket without saying so.** `opportunities` exists, is self-audience-only, and
is deliberately never shown to a leader (`ai/behaviour.js:78`). Highs / Lows / Inquiries has no home
for it. Either it folds into Highs — losing the leader-invisibility guarantee unless that is
re-enforced at the new boundary — or it is retired. **This is a decision, and it needs to be made
explicitly rather than by omission.**

**L.5 · The scout is the first thing IntelliQ does to people rather than for them, and it arrives at
their worst moments.** Every other proactive path surfaces something the kernel derived from
structured signals. The scout reads what someone *said*, in front of colleagues, and offers to make
it organisational. Even refused, the offer is a message: *we were reading, and we thought this was
the kind of thing you might want on the record.* G.2 is the mitigation. It is not optional, and I
would not brief the scout without the privacy tier landing in the same change.

**L.6 · The strongest argument against all of it, again.** This document describes at minimum three
weeks of work. `docs/briefs/p0-pilot-blockers.md` describes four defects that lose acknowledged
writes on every deploy, silently overwrite one leader's changes with another's, and destroy evidence
at 8,000 envelopes. **A pilot that loses a headmaster's edit is over. A pilot with prose-only
expression and no Forum is a pilot.** Falcon will tell you which of the sections above mattered, and
it will tell you for free.

**L.7 · One thing you are right about that the code does not reflect.** *"Privacy must be obvious to
users, not merely correct in code."* The privacy architecture here is the best part of this codebase
and users cannot see any of it (G.6). That is a genuine product failure hiding behind a genuine
engineering success, and it is worth more than most of the features in this document.

---

# M · Implementation sequencing

## M.0 · Ahead of everything here, unchanged

`P0-1` evidence durability · `P0-2` shutdown durability · `P0-3` optimistic concurrency ·
`P0-D` authority on empirical claims · `P0-5` the forum echo-origin defect.

**Nothing in this document precedes those.** Two items below are near-free and can ride along; the
rest waits.

## M.1 · P0-5 gets more urgent because of this document

`ai/forum.js:146` treats an echo as an independent origin when the original has not yet been
contributed — found by `scripts/pilot-loop-smoke.js` §4, currently 28/29. Today that is a latent
defect in a feature with no UI. **The moment Forum has a front end, it is the mechanism by which a
confident room manufactures organisational certainty** — the exact failure `ai/contribution.js:184`
was written to prevent. It should be fixed before any Forum work begins, not merely before the
pilot.

## M.2 · Before first demo (cheap, high value, no new concepts)

1. **Render `basis` on self-audience High/Low cards.** One line. Already computed, already
   privacy-safe, already excluded for leaders (J.1).
2. **Finish emptying Home.** Delete the three already-dead render blocks
   (`js/member-view.js:334, 364, 376`) and the containers they write to (B.1).
3. **Rename the buckets to Highs and Lows** in `BUCKET_LABEL` — and decide L.4.

Estimate: under a day, and it makes the demo look like the product the founder described.

## M.3 · Between demo and first pilot

4. **Inquiries become explorable.** Reuse `openInsightThread`'s container with inquiry-specific
   opening and close semantics (C, C.1). Do **not** reuse the reasoner's response verbs.
5. **Retire the parallel group concept.** `orgGroups` / `orgMessages` / `leader-groups` /
   `/api/groups/:groupId/feed`. Same treatment as `orgGoals` — and it should be sequenced with it,
   since both are "CRUD the kernel does not read" (A.5).
6. **Classify forum speech at post time.** `privacy.classifyText` in the post handler; store the
   tier. Prerequisite for anything in M.4, and worth doing regardless (G.2).
7. **Delete the destinations marked REMOVE in B.** Nothing links to them.

## M.4 · Learn during the pilot — build only what Falcon asks for

8. **Forum front end**, in the smallest possible form: threads on existing node inquiries, read and
   post, and the explicit "put this on the record" act with its consequence shown (G.6). **Not**
   ad-hoc participants, **not** free topics, **not** the AI in the thread. Watch whether anyone
   uses it before widening the container (D.3).
9. **The Evidence Scout**, only if step 8 shows people saying things they never put on the record.
   Deterministic, no model, six invariants (F.3), privacy tier mandatory.
10. **Conversation sensitivity floor** (G.4), if a sensitive thread type actually appears.

## M.5 · P1 and beyond

- Facilitator (E) — after the scout, and only two of its three examples are new.
- Participant AI in threads (E, G.3) — needs the intersection-scope primitive; the most dangerous
  item here.
- Ad-hoc participants and free topics (D.3) — after node-anchored threads have earned it.
- External sightings (I) — P2. Attractive, low pilot value, needs a new axis not a new tier.
- Representation vocabulary — unchanged from `expression-and-initiative.md` §8: P1, after Falcon.

---

# The honest summary

The founder asked how much of a large product direction can be reached by compressing what exists.
The answer is: more than expected in three places, and less than expected in one.

**Highs and Lows already exist, are already explorable, already cap at three, and already know how
to say nothing.** Renaming them is a string change. Making them show their reasoning is one line.

**The Evidence Scout already exists**, deterministically, with dedupe, expiry, ownership and
provenance — pointed at a different source. The cursor machinery it needs was built for connectors
and commits only after the evidence boundary is crossed. Neither needs inventing.

**Home is already half-compressed** and is rendering empty containers left behind by the last
compression.

**And the Forum is not a redesign. It is unbuilt.** Four routes, a good kernel boundary, a smoke
test, and zero lines of interface. Ad-hoc participants and free topics also break a deliberate
invariant — recoverably, by separating the conversation from its anchor and letting the contributor
choose a subject at the door, but recoverably is not the same as freely.

The proposition holds. The machinery can disappear behind something that feels like opening a
conversation, because most of the machinery was built to be invisible in the first place.

But the four defects in `docs/briefs/p0-pilot-blockers.md` are still there, and a headmaster who
loses an edit will not care how few tabs there are.
