# Founder decisions — August 2026

**Status:** CURRENT — binding. **Branch:** `claude/platform-work-summary-nmb0cm`.
Taken directly by the founder in session. Each is recorded with what it settles, what it costs,
and what it now requires.

**How to use this document.** It is the answer to *"what has the founder actually decided?"* —
the store, so nothing has to be re-derived or re-asked. Read the index, then only the decisions
your task touches. Nothing here is a suggestion: a decision is overridden by the founder, never by
an agent finding it inconvenient.

---

## THE INDEX — thirty-seven decisions, one line each

**The shape of the product**

| | Decision | Read it if you are touching |
|---|---|---|
| **D1** | One home for everyone. The nav opens **buckets** — the existing card feed, filtered — not new lists | any front-end work |
| **D13** | Every object is a thread, and **priority** ranks them all. Never ordered by kind | Home, ranking |
| **D22** | Cold start **is** the inquiry engine. Import, cadence and the no-baseline layers are the three speed levers | the pilot's first fortnight |
| **D24** | `js/app.js` absorbs `js/member-view.js`. This ends with a file **deleted** | the front end. Do it LAST |
| **D31** | IntelliQ **informs**; the nine-route action loop stays dark for the pilot | anything about acting |
| **D33** | The pilot must prove all three: nothing breaks · sustained use · one real thing uncovered | triage, scope cuts |

**Highs, Lows and polarity**

| | Decision | |
|---|---|---|
| **D4** | **High and Low only.** `opportunity` and `milestone` fold into High | the bucketing layer |
| **D5** | A **neutral** change is in neither bucket | `baseline_shift` |
| **D6** | `data_gap` is **our** gap, not a Low about the person | `proactive.js` |
| **D8/D17** | Findings **park** on priority; nothing is ever abandoned. Only the timeline compacts | lifecycle, retention |

**Inquiry**

| | Decision | |
|---|---|---|
| **D3** | Only a **human** closes an inquiry | `diagnose.js` |
| **D9** | It closes two ways — **answered** (becomes evidence) or **dropped**. And it is a thread you speak into | inquiry work |
| **D10** | **Parked is visible**, with its reason | `boundFrontier` |
| **D11** | `exploring / probable / supported / disputed` are kernel state, **never** product language | projection |
| **D12** | The **frontier and the falsifiers** go on screen. Both are already in the payload | the thread |
| **D36** | A challenged finding is **contested**, never deleted | `diagnose.js` |

**Focus**

| | Decision | |
|---|---|---|
| **D2** | Focus works three ways: self, **invited**, assigned. Participants are a new audience shape | `audience.js` |
| **D14** | **Two shapes** — a *room* and a *parallel* focus. The parallel focus **is** assessment | the focus model |
| **D14b** | **No numbers on a person.** Nobody scores anyone — not a leader, not the model | assessment |

**Privacy, scope and answerability**

| | Decision | |
|---|---|---|
| **D7** | **One bucket surface taking a scope, not a role.** A coach is a person with a wider Web | every read path |
| **D15** | Shared-focus words are **admissible but never quoted** outside the participant set | focus, projection |
| **D16** | `@intelliQ` in a room answers from the **intersection** of every participant's scope | the agent |
| **D18** | A person **sees their whole record** and can withdraw from it | `/api/me/*` |
| **D19** | A withdrawal **recomputes and tells** whoever saw the old picture. Closes T-2 | corrections |
| **D20** | Classification keeps its **bias toward over-protection**. A person may not lower their own | `privacy.js` |
| **D21** | The safeguarding exception is stated **before** anyone speaks | onboarding |
| **D26** | **The primitive decides, not the digit.** Only `state` and `relational` lose their figures | leader surfaces |
| **D27** | A **leader is a subject**, under the same floor. Never attributable | upward evidence |
| **D28** | **History follows the person** when they move group | the org graph |
| **D29** | *POST-PILOT.* One identity, several memberships, cross-org sharing by **consent** | identity. Do not start |
| **D32** | Suppression is **visible, within the viewer's own scope** | the Confidence Engine |
| **D37** | Several nodes = the **union of memberships**, never of leaderships | scope composition |

**Voice and capture**

| | Decision | |
|---|---|---|
| **D23** | Numbers are never **composed into** leader text. Superseded in part by D26 | composers |
| **D25** | **The model reads. The kernel writes.** One model call per inbound turn, zero for every card | cost, the agent |
| **D30** | The deterministic voice is **one layer living in four homes**. `ai/voice.js` is the home | the composer |
| **D34** | The voice is **a colleague who noticed** — not an instrument, not a coach | every sentence |
| **D35** | **The conversation is the check-in.** No form. This promotes the curiosity stopping rule to a dependency | capture |

**The laws these created** — `L-D15` · `L-D16` · `L-D19` · `L-D23` · `L-D26` · `L-D27` · `L-D29` ·
`L-D32` · `L-D35` · `L-D37` · `L-OC1`. Each is stated inline with the decision that produced it.

---

## D1 · ONE HOME, FOR EVERYONE

**Decision:** a player and a coach open the same home. The most-needing-an-answer question at the
top, the composer underneath it, and nothing else above the fold. Claude's home is the reference.

**And the founder's own observation, which is the useful part — corrected in their own words:**

> *"They are not lists. They are in the nav, and when you click on them you essentially see what
> we used to have, but in their respective buckets."*

So the four nav entries are **buckets, not lists**, and the distinction is not cosmetic: a *list*
implies a new component to design, and a *bucket* is the card feed that is already on the
leader's Today page, filtered to one kind. Same cards, same renderer, same affordances. The only
change is the filter and the nav entry that applies it.

**What this settles.** No separate member and leader home to design, and **no new list component
to invent** — anyone who writes a second card renderer for the buckets has misread this
decision.

**What it requires.** `js/app.js` and `js/member-view.js` currently render two different homes.
One of them wins. The grain differs by *what a person may see* — which `_kernelEvidence` and
`ai/audience.js` already decide — not by which file rendered it.

---

## D2 · FOCUS WORKS THREE WAYS, AND ONE OF THEM IS NEW

**Decision:**

1. **Self.** You create it yourself in the Focus tab — or IntelliQ offers it mid-conversation
   ("would you like to make this a focus?") and you accept.
2. **Invited.** **Anyone in the organisation can invite anyone else into a focus**, the way you
   start a message thread with more than two people.
3. **Assigned**, as a special case of invited: a coach inviting a player, where declining has a
   different social weight.

The founder's examples, kept because they are the requirement: a psychologist creating a focus
for a player. A chaplain creating one for the Christian players on the team. A group of players
working on something together. A coach and one player on a specific thing.

**This is bigger than the field I had proposed.** `focus.origin { by, at, from, inquiryId }`
records where a focus *came from*. It does not describe **who is in it**.

### What D2 actually requires

| Need | Status |
|---|---|
| `focus.participantIds` | **MISSING.** Previously catalogued as G1 and deferred POST-PILOT. This decision promotes it |
| Invitation state per participant — invited, accepted, declined | **MISSING** |
| `origin.from` gains `'self'` and `'invited'` | small — the field exists |
| A focus whose participants are **not** a node | **NEW SHAPE.** Today a focus is per-person (`userAiProfiles[].focuses`) or per-node (`teamFocuses`). "The Christian players on the team" is neither |
| The audience of a focus | `ai/audience.js` resolves by node. A participant set is a **fourth audience kind** and it is the first one that is not a node |

### The privacy consequence, stated before it bites

A focus with participants **defines its own audience**. That is the first object in IntelliQ whose
readership is a list of people rather than a node.

Two rules follow, and they are not optional:

- **`ai/audience.js` must gain a `focus_participants` kind** whose resolver reads the focus's
  current participant list. Still a reference, still resolved at read time, still narrowing and
  never granting.
- **The cohort floor does not apply to a focus.** A focus is a commitment among named people who
  all know they are in it — not an aggregate claim about a group. Applying the floor would make a
  three-person focus unreadable by its own members, which is nonsense. **But nothing derived FROM
  a set of focuses may be published without the floor**, because that would be an aggregate again.

---

## D3 · AN INQUIRY CLOSES WHEN A HUMAN SAYS SO

**Decision:** the kernel may say an inquiry *looks* settled. Only a person closes it.

**Why this is the right call and not merely the cautious one.** The kernel already refuses to
accept a proposed `conclusion` (`ai/diagnose.js` `MODEL_MAY_PROPOSE`). Auto-closing an inquiry
because confidence crossed a threshold would be the system concluding by the back door — deciding
that a question is answered is exactly the judgement the epistemic ladder reserves for people.

**What it requires.** An inquiry needs a resolution act: who closed it, when, and on what basis.
`inquiry.status` already carries `resolved`; nothing currently writes it deliberately, and there
is no record of who decided.

**And it is the missing half of "inquiry maturity".** The visible arc is: opened → evidence
accumulating → *the kernel says this looks settled* → **a person closes it** → it stays readable
as history.

---

## D4 · HIGH AND LOW ONLY

**Decision:** two buckets. `opportunity` and `milestone` fold into High.

**What this settles.** Three vocabularies (`docs/ttd/layer-map.md` §1) collapse to one.
`ai/behaviour.js` *Worth celebrating / Needs attention / Opportunities* and
`ai/scoped-intelligence-packet.js` *working_well / needs_attention* become aliases of **High** and
**Low**. The underlying `polarity` field is untouched — this is a bucketing and naming change, not
a detection change.

**What it costs, said plainly.** `opportunity` currently has its own bucket in `ai/behaviour.js`,
and folding it into High loses a distinction the code makes today: *something available* is not
the same as *something going well*. The founder has accepted that cost in exchange for two words a
person understands without being taught them.

---

## D5 · A NEUTRAL CHANGE IS NEITHER A HIGH NOR A LOW

**Decision:** a change that is genuinely neither good nor bad appears in the feed and can start a
conversation, but it is **not counted in either bucket**.

**The defect this fixes, in the code's own words.** `ai/proactive.js:72` describes
`baseline_shift` to the person as *"Not good or bad — just different. Worth a moment to notice."*
Its polarity at `ai/proactive.js:39` is `risk`. Under D4 that makes it a **Low** — so the one
pattern that explicitly tells the person it is not bad would be filed under the bucket that means
something needs them.

**What it costs.** A third state to carry through the bucketing layer. Two buckets on screen,
three possible outcomes underneath: High, Low, neither.

**What it protects.** A Low that means *something needs you* stays worth opening. Every neutral
finding routed into it makes the bucket cheaper.

---

## D6 · A GAP IN OUR INFORMATION IS NOT A LOW ABOUT THE PERSON

**Decision:** `data_gap` is not a Low. It is an invitation to say more.

**Why the code was already half-right.** `ai/proactive.js:137` reads *"It's been quiet. No
pressure — whenever you're ready, IntelliQ is here."* The words are already an invitation. Only
the polarity (`risk`, `ai/proactive.js:41`) disagreed, and under D4 the polarity is what decides
the bucket. The wording would have said "no pressure" from inside a bucket labelled Low.

**The principle, stated so it generalises.** *IntelliQ not knowing something is IntelliQ's gap,
not a finding about the person.* Any future pattern whose subject is really our own coverage
belongs to the same rule.

**What it costs.** Genuine disengagement gets quieter. Accepted: the leader-facing wording
(*"They were regular, then went quiet"*) already exists and is unaffected — this is about which
bucket a person's own card lands in, not about removing the signal.

---

## D7 · ONE BUCKET SURFACE, SCOPED — NOT ONE PER ROLE

This is the largest of the eight and it came from the founder rejecting the question rather than
answering it. Both answers are kept verbatim because the reasoning is the requirement:

> *"Remember both team highs lows and people highs lows show up in these buckets. I believe
> people should receive highs lows about themselves as well as team processes etc."*

> *"The coach is an individual as well. He's simply a leader node. He should receive the same
> set-up as a member, except his scope is broader than that of a member. Remember the webs?"*

**Decision, in three parts:**

1. **There is no coach's bucket and no member's bucket.** There is a person's Lows and a person's
   Highs. A coach is a person occupying a leader node.
2. **What differs is the Web, and only the Web.** `getVisibleUserIds` and the edge classes in
   `ttd/peer-web-semantics.md` already decide reach. The bucket query is the same query with a
   different scope set.
3. **Process findings belong in the buckets.** `strength` and `friction` — emitted by
   `ai/process-reflection.js` and `ai/process-observations.js` for routines, handoffs and rituals
   — are Highs and Lows like any other. A person's Lows may contain their own dip *and* a costly
   handoff on their team. That is the founder's *"as well as team processes etc"*.

### The correction this decision rests on

I asked whether to delete `friction` and `strength` on the grounds that nothing emits them. **That
was wrong.** They are absent only from `PATTERN_POLARITY` (`ai/proactive.js:37`), which covers
person-level detected patterns. They are emitted freely by the process layer
(`ai/process-reflection.js:50-51`, `ai/process-observations.js:48-49`), by the reasoner adapters
in `ai/intelligence-feed.js`, and `ai/team-state.js:61` uses `strength` as its `WORKING_WELL`
constant. Deleting them would have removed the process layer's entire vocabulary. The founder's
answer went the other way and is the correct one.

### The line this decision must not be read as crossing

**Scope and detail are two different axes, and D7 moves only one of them.**

> L-D7 · A broader Web means a person sees **more subjects**. It never means they see **more
> detail about any one subject**.

`_sanitizeBriefingForLeader` and the projection layer (L9) apply exactly as before. A coach whose
Web covers thirty people sees thirty people's cards in the form a leader is permitted to see them
— not one person's card in the form that person sees it. `ttd/peer-web-semantics.md` already
settled the general case: *"peer awareness does not equal peer person-level disclosure"*, and the
fix there was a second scope with different powers, never a wider `visibleScope`.

**What it requires.** One bucket endpoint taking a scope, not a role. `js/app.js` and
`js/member-view.js` converge on it (D1). Any test asserting that a leader's bucket differs in
*shape* from a member's is asserting the wrong thing; the difference is in the subject set.

---

## D8 · A HIGH OR LOW FADES WITH ITS EVIDENCE

**Decision:** when the evidence underneath stops being recent, the finding leaves the bucket on
its own and stays readable as history.

**Why this does not contradict D3.** D3 says only a human closes an **inquiry** — because closing
an inquiry is a judgement that a question is answered. A High or a Low is not a judgement; it is a
**report on current evidence**. When the evidence is no longer current, the report is no longer
current, and saying so is not a conclusion. The two rules sit at different points on the epistemic
ladder and both are consistent with `MODEL_MAY_PROPOSE`.

**What it requires.**

| Need | Status |
|---|---|
| A recency window on findings | The detectors already work from recent windows; what is missing is the bucket **honouring** it |
| History survives the fade | Depends on the thread binding (`object-as-conversation.md` G1) — a faded card must still open |
| Nothing silently vanishes mid-action | If a leader has acted on a Low through `/api/intelligence/act`, the fade must not erase the outcome loop's subject |

**The open edge, flagged not decided:** a Low that fades while a coach is actively working on it.
Fading it silently would be wrong. This is a notification question, not a bucketing one, and it
belongs to L9/L10 when we reach them.

---

## D9 · AN INQUIRY CLOSES TWO WAYS — AND IT IS A CONVERSATION LIKE EVERY OTHER OBJECT

**Decision, part one — closing.** Two outcomes, both recorded, both readable afterwards:

1. **Answered.** The person names what we now believe. That statement becomes **evidence, with
   their authority behind it** — not a note on the inquiry.
2. **Dropped.** No longer worth pursuing. Nothing is concluded, and nothing is asserted.

**Why part one is the epistemic ladder working exactly as designed, not an exception to it.**
`ai/diagnose.js:49` — `MODEL_MAY_PROPOSE` admits `observation`, `interpretation`, `hypothesis`
and refuses `conclusion`. It has always refused it *from the model*. A person concluding is the
rung the ladder was reserving. So "answered" is not a new privilege; it is the first thing in the
product that uses the one the architecture already held open.

**Decision, part two — the founder's addition, which is larger than the question I asked:**

> *"Remember you can interact with inquiries and either challenge them or confirm them through
> speaking to them (like the chat for Highs, Lows or Focuses). We can do the same with inquiries
> and add further evidence or help the algorithm more."*

So an inquiry is not a card with two buttons on it. It is a **thread**, like every other object
(`ttd/object-as-conversation.md`), and speaking into that thread is how a person challenges,
confirms, or adds. Answering and dropping are things you say, not controls you press.

**This is mostly already built.** `ai/diagnose.js` already accepts grounded proposals, already
distinguishes support from challenge per hypothesis (`supportRefs` / `challengeRefs`), already
supersedes rather than deletes (`supersede()`, line 485), and already records how the
understanding changed (`_recordTimeline`, line 380). What is missing is the thread binding — the
one field in `object-as-conversation.md` G1 — not a mechanism.

**Decision, part three — inquiries compete for home.**

> *"Inquiries can also appear on home, just like Highs, Lows and Focus questions — whatever needs
> answering most."*

`GET /api/inquiry/lead` already produces one ranking across self and team inquiries. It must now
rank across **all four kinds**. That is an extension of an existing ranking, but it needs a
comparable value across objects of different types, and that comparison does not exist yet.

**Decision, part four — an inquiry with no evidence for six weeks drops out, per D8.**

### The tension in part four, resolved rather than ignored

D3 says **only a human closes an inquiry**. Part four lets one leave on its own. Those are only
consistent if the distinction is held exactly:

> L-D9 · An inquiry that fades has **not been resolved**. It leaves the live set carrying no
> conclusion, and the fade may never write `status: 'resolved'` or record an answer.

Three consequences, none optional:

- **Fading is dormancy, not closure**, and it is reversible: one new signal wakes it.
- **A faded inquiry and a dropped one must be distinguishable in history.** *Nobody had anything
  to add* and *a person decided this no longer matters* are different facts about the
  organisation, and collapsing them loses the more interesting one.
- **Six weeks is the founder's number and is currently a number in a sentence.** It must become
  one named constant, used by Highs, Lows and inquiries alike, in one place — not three literals.

**Related, and already in the code:** `status` today is derived (`_STATUS_FOR`, `ai/diagnose.js:437`)
from confidence band and contradictions, and `'resolved'` is listed at line 346 but **unreachable
— nothing writes it**. D9 is what makes that value real.

---

## D10 · PARKED IS VISIBLE, AND SAYS WHY

**Decision:** a parked inquiry sits below the live ones in the bucket, showing the reason it was
set aside.

**What this exposes.** `diagnose.boundFrontier` (line 1097) already keeps the top `cap` inquiries
active and parks the rest with `parkedBecause: 'other open questions would tell us more right
now'` — automatically, reversibly, and **without telling anyone**. The string was written to be
read and has never been rendered.

**Why showing it is the right call.** The system is already making a judgement about what matters
most. A judgement a person cannot see is a judgement they cannot correct — and correction is the
one thing this architecture is built around.

**What it costs.** The bucket is longer, and a person may disagree with the ranking. That
disagreement is worth having.

---

## D11 · THE STATUS VOCABULARY STAYS INTERNAL

**Decision:** the thread says *"what we have points both ways"* and shows both sides. The word
**disputed** does not appear on screen.

**The specific risk.** `_STATUS_FOR` sets `disputed` the moment admissible evidence contradicts
itself — which on a team inquiry is often two people honestly describing the same week
differently. Rendered as a label, that reads as *the team is in conflict*. Same information,
materially different claim.

**The general rule this establishes for L9:** `exploring · probable · supported · disputed` are
**kernel state, not product language**. Every one of them needs a plain-language projection before
it reaches a person, and `ai/voice.js` is where that belongs.

---

## D12 · THE FRONTIER AND THE FALSIFIERS ARE BOTH ON SCREEN

**Decision:** the thread shows what we think, **what would show it is wrong**, and what is still
unknown.

**This is the missing "maturity", and it is already computed.** Every inquiry carries
`missingSignals` — the collection frontier — and `falsifiers`, *what would show the leading
hypothesis is wrong* (`ai/diagnose.js:343-344`). Both reach the API: `stillUnknown` and
`falsifiers` are both emitted at `server.js:13563-13564`. **Neither appears anywhere in
`js/app.js` or `js/member-view.js`.** Grep returns nothing.

So the visible arc the founder has been asking for — *opened → evidence accumulating → this is
what would change our mind → settled or dropped* — is not missing from the system. It is missing
from the screen.

**Why showing falsifiers is a product claim and not just honesty.** Every competitor's dashboard
tells you what it concluded. Stating what would overturn it is the thing an insight engine cannot
say and a truth-maintenance kernel can. It is the clearest single expression of the difference,
and it costs nothing to render because it is already in the payload.

**The one constraint:** a falsifier is stated as *what would change our mind*, never as a
challenge to the person. Wording goes through `ai/voice.js` like everything else in L9.

---

## D13 · EVERY OBJECT IS A THREAD, AND PRIORITY IS WHAT RANKS THEM

**Decision:** Inquiries, Highs, Lows and Focuses are all threads. There is no card-only object.

**And the rename that matters:** what I had been calling *maturity* the founder calls **priority**,
and priority is what decides the Home screen.

> *"That goes with 'maturity' — or rather 'priority' — and then that's what decides what shows up
> on our Home screen."*

That is the answer to the gap left open in D9 part three. `/api/inquiry/lead` ranks inquiries
against each other; Home needs one ranking across four kinds, and **priority is the currency it
is denominated in**.

**The warning that comes with it.** There are already at least three ranking mechanisms —
`PRIORITIES` in `ai/intelligence-feed.js`, the impact/urgency scoring in `ai/inquiry.js`
(`rankQuestions`, line 721, *value of answering divided by cost to the person*), and the
`valueOf` callback in `diagnose.boundFrontier` (line 1083). This is the polarity problem again,
one layer up: **one concept, three implementations.** Choosing priority as the currency means
picking one of these and making the others feed it, not adding a fourth.

---

## D14 · FOCUS HAS TWO SHAPES — AND THAT IS WHAT REPLACES ASSESSMENT

The founder asked the question back rather than answering it, which was the right move:

> *"How can we take the best of the other world and now implement it in Focus? It's not a
> terrible idea to be assigned a focus by a coach and be able to interact with the focus or thread
> individually."*

**Decision: two shapes, both real.**

| Shape | What it is | Replaces |
|---|---|---|
| **Room focus** | One thread, several people, everyone reads everyone. The chaplain's group, the players working on something together. | forum threads, group work |
| **Parallel focus** | One focus, **one private thread per person**. The coach sees each; the players do not see each other. | the whole assign / submit / return lifecycle |

**The parallel focus is the important one, because it is assessment without assignment.** A coach
sets one focus for twelve players and gets twelve conversations. Nobody was assigned anything;
everybody was invited into their own thread on the same subject.

### What carries over from assessments, and what dies

| From the assessment machinery | Fate |
|---|---|
| Assignment | **Becomes invitation** — D2's third case, where declining carries different social weight |
| Templates and fields | **Survive**, as an optional structure a focus opens with. Not a form to fill; a prompt to start from |
| The individual thread | **Survives** — it is the parallel focus |
| Leader feedback | **Survives** as the leader's words in that person's thread |
| `ai/assessment-view.js` | **Survives, and matters more.** It already separates a generated projection from real individual human feedback from missing context, and detects duplicated placeholder feedback so it is never presented as a person's own note. A thread world needs that more than a card world did |
| **Score** | **DIES.** See below |
| submit / return / status lifecycle | **Dies.** A conversation is not returned |

### D14b · NO NUMBERS ON A PERSON

**Decision: response is words only. Nobody scores a person — not a leader, and not the model.**

I offered "a leader may score, the model may never" as the recommendation. The founder went
further and removed the number entirely.

**What it costs, stated plainly:** comparability over time. A number can be plotted; a paragraph
cannot. A coach tracking twelve players across a season loses the one artifact that made progress
legible at a glance.

**What it buys.** A score is a conclusion about a person wearing the clothes of a measurement.
The epistemic ladder refuses `conclusion` from the model (`ai/diagnose.js:49`) and D3 reserves
closure for people — a leader-issued score would have been the one place a bare conclusion about
a human being entered the record with nothing underneath it. Removing it makes the rule
consistent rather than nearly consistent.

**Note, not an objection:** measurement of *things* is untouched. Primitives, baselines and
detection (L3, L4) all continue. What is refused is a person receiving a mark.

---

## D15 · WHAT IS SAID IN A SHARED FOCUS IS ADMISSIBLE, AND NEVER QUOTED

**Decision:** words spoken in a shared focus become **org-admissible evidence** — they can inform
patterns, confidence and the organisational picture — but **the words themselves never appear
outside the participant set.**

The founder chose "fully org-admissible", then on the chaplain case chose "feeds the picture,
never quoted". Those are not in tension; together they are the sharper rule:

> L-D15 · Admissibility and visibility are separate powers. Evidence from a shared focus may be
> **reasoned over** at org scope. Its **verbatim content** is bounded by the focus's participant
> set, permanently.

**This is the architecture we already have, used correctly.** `_kernelEvidence` decides what may
be reasoned over; the projection layer (L9 — `ai/voice.js`, `_sanitizeBriefingForLeader`) decides
what words a person reads. They were always two layers. D15 is the first decision that depends on
them being two.

**Precedent already in the code:** a group inquiry reports `independentOrigins` and `contributors`
as counts and never as quotes. The safeguarding excerpt is the single deliberate exception, and it
exists precisely because a duty of care outranks confidentiality — which is what makes it an
exception rather than a pattern.

### The attack this must survive, and why it already does

"Admissible but never quoted" is worthless if the derived claim reconstructs the words. A finding
drawn from a three-person chaplain focus, published to the team, **is** a quote with extra steps.

**The two-sided cohort floor already blocks it.** `k >= MIN_COHORT` and `n − k >= MIN_COHORT`,
with `MIN_COHORT = 5`: a claim resting on three contributors cannot be published, and neither can
one resting on all-but-three. No new mechanism is needed — but the floor must be **enforced on
anything derived from focus evidence**, which sharpens D2.

### Amendment to D2

D2 said: *"nothing derived FROM a set of focuses may be published without the floor."* Under D15
that is too narrow. **Corrected:** the floor applies to anything derived from focus evidence,
whether from one focus or many. A single small focus is exactly the dangerous case.

---

## D16 · @intelliQ ANSWERS IN THE NARROWEST SCOPE IN THE ROOM

**Decision:** in a shared focus, IntelliQ answers only from the **intersection** of every
participant's admissible set.

**The problem it solves.** A coach and four players are in a room. The coach types `@intelliQ`.
Answering in the coach's scope would broadcast the coach's wider view into a room of players — a
leak with no one to blame for it, because everybody involved was authorised for their own half.

> L-D16 · A response in a shared thread is admissible only if it would be admissible for **every**
> participant individually. Scope in a room is an intersection, never a union and never the
> asker's.

**What it costs, and what must be said out loud.** A coach asking in a room gets a thinner answer
than the same coach asking alone. If that is silent it reads as the product being weak. **IntelliQ
must say which scope it is answering in** — *"answering with what everyone here can see"* — so the
coach understands the constraint rather than discovering it as a defect.

**Implementation note:** `_kernelEvidence` already computes per-viewer admissible sets. The
intersection is over participants, resolved at read time, exactly like `ai/audience.js`. It
narrows and never grants — the same property every audience rule in this system has.

**And the summoning rule, from the founder:** `@intelliQ` is required only in a focus with more
than one collaborator. In a solo focus the assistant is simply present.

---

## D17 · NOTHING IS ABANDONED. THE TIMELINE COMPACTS

**Decision, and a correction to D8/D9 in the founder's own words:**

> *"Parking an inquiry, not dropping it. In an optimal world Highs, Lows, Inquiries should not be
> abandoned, as they are only advantageous to keep in the event that it happens again and it'll
> help us more with patterns. But if they consume too much memory then we have to be realistic."*

So the six-week rule from D9 is **park, not drop**. Nothing leaves because it got old. Things are
set aside because something else is a higher priority right now, and because a screen holds a
finite number of threads — which is D13's ranking doing its job, not a lifecycle event.

**And when memory does force realism, this is the order:**

| Kept forever | Compacts |
|---|---|
| Evidence — already immutable and superseded rather than deleted | — |
| Authored statements: hypotheses, what a person actually said | — |
| Signals (references into evidence, not copies) | — |
| — | **The timeline.** `_recordTimeline` (`ai/diagnose.js:380`) logs every band change, every status change, every new hypothesis. It grows without bound and is the one structure whose bulk is not meaning |

**Why this is the right thing to shed.** Confidence is a pure function of the signals
(`ai/diagnose.js` — it recomputes, it does not accumulate), so it need never be stored to be
recovered. The timeline is the only part that is genuinely a log. Compact it to its milestones —
*opened, first hypothesis, confidence crossed a band, contradicted, parked, closed* — and the arc
a person reads survives while the noise does not.

**What is not on the table:** deleting evidence, deleting what somebody said, or deleting an
object. The founder's reason is a product reason and it is correct — *"in the event that it
happens again, it'll help us more with patterns."* An organisation that forgets cannot notice a
recurrence, and noticing recurrence is what this system is for.

---

## D18 · A PERSON SEES THEIR WHOLE RECORD, AND CAN WITHDRAW FROM IT

**Decision:** the full record, plus the ability to withdraw any piece so it stops informing
anything. Withdrawal **supersedes rather than deletes** — the fact that something existed
survives, its influence does not.

### The finding that came with this question

**The entire capability is built and unreachable.** Three routes, no caller anywhere:

| Route | What it already does |
|---|---|
| `GET /api/me/export` | The complete GDPR Art 15/20 bundle. Its own note reads *"This is all the personal data IntelliQ holds about you."* Strips the password hash, returns everything else |
| `GET /api/me/data` | The subject access request — the reads held about them in **their own subject view rather than the leader-facing projection**, their private self-model, their own notes, and **the content-free trail of who accessed their data and why**. The request is itself logged as a `subject_access` event, because exercising the right is an access too |
| `GET /api/me/audiences` | The audiences a person can choose between, named and explained, **before they say anything** — built from their real nodes, so it never offers one that does not exist for them |

`POST /api/group/:nodeId/withdraw` — *take back what I contributed* — also exists, and
`_withdrawSignal` (`server.js:6528`) already withdraws a promoted signal while keeping the
evidence intact.

**So the SEEING half of D18 is a wiring task, not a build.** Someone wrote the answerability layer
properly and then never gave it a screen. That is the same failure as the safeguarding queue, and
it is the second time this sweep has found it.

**The WITHDRAWING half is not.** `POST /api/group/:nodeId/withdraw` covers taking back a group
contribution and already has a caller. There is **no general route** for withdrawing a single
piece of evidence about yourself — `_withdrawSignal` is internal, and nothing exposes it. That
half is new backend, and it is entangled with D19: a withdrawal that does not recompute and does
not tell anyone is worse than no withdrawal at all, because it looks like it worked.

**So D18 splits into two pieces of work, and only the first is cheap.**

**Note for the pilot specifically:** with under-18s involved, *"show me everything you hold about
me"* is a question that will be asked by a parent, and the honest answer already exists in one
JSON response.

---

## D19 · A WITHDRAWAL RECOMPUTES, AND WHOEVER SAW THE OLD PICTURE IS TOLD

**Decision:** everything resting on withdrawn evidence recomputes immediately, and anyone who was
shown a finding that has since changed is told that it changed.

**This closes T-2**, the blocker `docs/INDEX.md` names as *"corrections do not reach
already-emitted signals"* — the last of the original set still open.

**Why the second half is the hard half and the important one.** Recomputing is mechanical: the
kernel already recomputes confidence from signals rather than accumulating it, so a withdrawn
signal changes the answer the next time anything asks. What does **not** exist is any memory of
*who was shown what*. A coach who read a card on Tuesday and acts on it on Friday has no way to
learn it stopped being true on Wednesday.

> L-D19 · If a person was shown a finding, and that finding materially changes because evidence
> was withdrawn or corrected, they are told. Silence would let a correction be honoured by the
> kernel and ignored by the organisation.

**What it requires that does not exist:** a record of delivery — which findings reached which
person, when. Nothing in the system currently remembers that a card was read.

**The cost, stated plainly.** This is the most expensive of the twenty-one decisions to build,
and the notification it produces is inherently awkward: *the thing you acted on has changed*. That
awkwardness is the product working. An organisation that cannot be told it was wrong is the thing
this system exists to replace.

---

## D20 · CLASSIFICATION KEEPS ITS BIAS TOWARD OVER-PROTECTION

**Decision:** the sensitivity bias in `ai/privacy.js` stays exactly where it is. A person may not
lower their own classification.

**What that means concretely.** `family`, `mother`, `father`, `death`, `injury` are RESTRICTED, so
*"my dad can't drive me to training"* is restricted. `stress`, `worried`, `relationship`, `quit`,
`alone` are SENSITIVE, so *"I'm worried about Saturday"* is sensitive. Both are over-classified in
the literal sense, and both stay that way.

**The reasoning the code already gives, and the founder confirmed:** over-protecting costs only
the ability to **quote**. Under-protecting breaks the product law. Those two errors are not
comparable and should not be traded off as if they were.

**Why "let the person lower it themselves" was refused, and this is the part worth writing down:**
consent given under observation is not consent. A player asked by a coach to unlock something they
said has not made a free choice, and a setting that permits it makes the coach's asking possible.
Removing the control removes the pressure.

**And D15 makes the cost smaller than it was.** Quoting across a focus boundary is already
forbidden. Over-classification now costs less than it did when the question was first written into
the code.

---

## D21 · THE SAFEGUARDING EXCEPTION IS STATED BEFORE ANYONE SPEAKS

**Decision:** a plain statement at sign-up — everything you say is private, with one exception,
and here is exactly what it is. The in-the-moment message stays as it is.

**What exists.** `safeguarding.composeResponse` already tells the person at the moment it happens:
*"I'm not keeping this to myself: I've let your safeguarding lead know so a real person can be
there for you."* That is the right message and it is not changing.

**What does not exist.** Any notice **before** they speak. `server.js:13192` holds the sentence
that should be shown — *"If something you tell IntelliQ suggests you are at risk of harm, a
safeguarding lead is told. That is the one case where safety comes before privacy, and it is
decided by a fixed rule rather than by a model."* — and it is not shown at sign-up.

**Why after-the-fact notice alone is not enough.** A person who learns the boundary only when they
cross it learns it at the worst possible moment, and learns it as a betrayal rather than as a
rule they had already accepted. The sentence is already written and already true.

**The objection, recorded because it is real:** telling people up front makes some of them guard
what they say. That cost is accepted. A rule people do not know about is not a safeguarding policy;
it is surveillance with a good motive.

**Interaction with D18:** `GET /api/me/audiences` explains a person's audiences *before they say
anything*, and is unreachable. The advance safeguarding notice belongs on the same surface. One
screen answers both.

---

## D22 · COLD START IS THE INQUIRY ENGINE — AND PRIORITY OUTRANKS KIND, ALWAYS

**Decision, part one:** on day one Home opens with **Inquiries**. At zero evidence every claim the
organisation needs is a `MISSING_REQUIRED` uncertainty, which is precisely what `ai/inquiry.js`
computes. The cold start is not an empty state; it is the one moment the inquiry layer is doing
its loudest work.

**Decision, part two — the founder's extension, and it generalises D13:**

> *"But even after — if an inquiry holds more priority than a High or Low or Focus question, it
> takes precedence after that period."*

So Home is **never** ordered by kind. Not in week one, not in month six. One priority ranking over
all four object types, permanently. There is no "inquiries phase" that ends.

### The founder's question: how do we get useful faster than a fortnight?

**First, a correction to my own premise.** I said structural patterns — withdrawal, isolation,
overload, plateau — would fire without history. **They do not.** Every one of them goes through
`baseline.shift`, `_declined` or `_rose` (`ai/primitives.js:97-140`). There is no person-level
pattern in this system that works without a baseline. The two-week floor is real and it applies to
the whole detection layer.

**Second, the threshold must not move.** `MIN_POINTS = 5` is what makes median-and-MAD meaningful.
At three points one bad day moves the "normal" and the system manufactures false Lows. Lowering it
makes IntelliQ wrong faster, not useful faster — and a pilot's first week of false negatives is
survivable in a way its first week of false accusations is not.

**Three levers that are real, in order of size:**

| Lever | Why it works | Status |
|---|---|---|
| **Import what the club already has** | `MIN_POINTS` counts observations, not weeks. Five weeks of an existing attendance register is five points **on day one**. `ai/adapters.js` turns any source into the universal per-member shape, and *"a new source needs an adapter here and nothing else in the kernel"* | **`POST /api/signals/import` and `/api/signals/import-csv` both exist and are BOTH ORPHANED.** The largest cold-start lever in the product has no caller |
| **Cadence, not threshold** | Five observations at weekly check-in is five *weeks*. At daily, it is five *days*. Nothing in the kernel changes — only how often a person is asked | Front-load the first fortnight. A product decision, no code |
| **The layers that genuinely need no history** | Group inquiries count **contributions and independent origins**, not history — a team inquiry with five contributors on day three is a real finding. Org-structure facts (who has no leader, an unconfigured safeguarding lead, coverage gaps) are computable immediately | Partly built |

**The honest summary:** the fortnight is a property of self-relative measurement and cannot be
engineered away. It can be **skipped** by importing history, **shortened** by asking more often,
and **covered** by the two layers that never needed a baseline.

---

## D23 · NUMBERS ARE NEVER COMPOSED INTO LEADER TEXT

> **SUPERSEDED IN PART BY D26.** The mechanism below stands — the boundary moves to the composer.
> **Which** numbers it applies to was wrong, and D26 corrects it: the primitive decides, not the
> digit. Read D26 before acting on this.

**Decision:** leader-facing composition is not given a member's **protected** numbers in the first
place. `_stripLeaderNumbers` stays, as a backstop, and stops being the boundary.

**Why the current arrangement failed.** `_stripLeaderNumbers` (`server.js:4208`) is a regex over an
already-composed sentence — it deletes `(100%)`, `2.1/5`, `83%`. It can only remove what it
recognises, and it only protects a surface that remembers to call it. `/api/intelligence/watch`
did not, and nothing went red until a browser pass looked at the page.

> L-D23 · A leader-facing composer must not receive a member's raw figures. Removing something
> after composition means the composer had it, and the next composer will too.

**What it costs.** A pass over every leader-facing composer, changing what is passed in rather
than what is filtered out. Larger than keeping the filter, and it is the difference between a rule
and a habit.

**Worth adding alongside, not instead:** an assertion per leader-facing endpoint that the numbers
are absent from the **actual HTTP response**. The existing regression for this reads `server.js` as
text; that catches a reversion of the exact line and does not cross the HTTP boundary.

---

## D24 · ONE FRONT END — `js/app.js` ABSORBS `js/member-view.js`

**Decision:** one file. `js/member-view.js` (3,496 lines) is absorbed into `js/app.js` (7,887
lines) and deleted.

**Why absorption and not a shared module.** A shared module leaves two homes in existence, and two
things that render the same object drift the first time one is edited alone. That is exactly how
the polarity vocabulary came to exist three times. **This change should end with a file deleted,
not a file added.**

**What makes it tractable rather than reckless:** D7 already did the hard thinking. What is left
after D7 is not a role difference at all — it is a scope difference, and scope is computed on the
server by `getVisibleUserIds` and `_kernelEvidence`. The front end does not need to know which
kind of person it is rendering for.

**The risk, named:** this is the single largest change on the plan, it touches the only two files
a user actually sees, and it has no natural halfway point. It should not be attempted in the same
commit as anything else, and it must come **after** the object model settles — otherwise it is
converging two files onto a target that is still moving.

---

## D25 · THE MODEL READS. THE KERNEL WRITES.

The founder's answer was a real hesitation, and it deserves a real resolution:

> *"I would like to say deterministic by default… but that's tough, because how does it
> effectively communicate with users?"*

**Decision: split by direction, not by surface.**

| Direction | Who does it | Why |
|---|---|---|
| **Inbound** — understanding what a person actually said, in their own words, and turning it into claims, intents and evidence | **The model.** `ai/comprehend.js`, `ai/intake.js` | This genuinely requires language understanding. No table of phrasings will ever parse what a seventeen-year-old types at 11pm |
| **Outbound** — saying what we know, why we think it, what would change our mind | **The kernel.** `ai/voice.js` | The facts are already structured. Composing them needs arrangement, not invention — and invention is the failure mode |

**Why this answers the hesitation rather than dodging it.** The founder's worry is about
communication, and communication is mostly an *inbound* problem. A person must be able to say
anything and be understood. What comes back does not need to be creative; it needs to be true,
specific, and about them — and `ai/voice.js` already composes warm sentences from given facts with
stable, seeded variety so the same state always reads the same way.

**Where the model may still phrase an outbound sentence**, and the conditions, all of which exist:

- only from facts the kernel supplied,
- only through `ai/language-guard.js`, which is *deliberately aggressive* — anything predictive or
  diagnostic is rejected and the deterministic sentence is shown instead,
- and a rejection is silent, because the fallback is a good sentence rather than an error.

**What this buys on cost, which the founder has asked about repeatedly.** One model call per
inbound turn. **Zero** for every card, every bucket, every briefing, every High, every Low, every
weekly digest. The expensive surfaces are the ones nobody types into, and under D25 none of them
cost anything.

**And it is already the shape of the system.** `ai/voice.js` is pure and imports nothing.
`ai/language-guard.js` exists specifically for *"the LLM edges"*. The no-LLM floor suite already
proves the product works with the model off. D25 does not introduce this architecture; it names it
so nobody quietly reverses it by adding a model call to a card renderer.

---

## D26 · THE PRIMITIVE DECIDES, NOT THE DIGIT

The founder challenged D23 and was right:

> *"What if those numbers are stats or sales or something? It can't output them? And remember we
> will encounter many organisations which will prioritise performance — because wellbeing doesn't
> win you games. It helps."*

**Decision:** a leader may see the figure for `outcome`, `capability`, `participation`, `load` and
`resource`. Only `state` (wellbeing) and `relational` (connection) become direction words.

> L-D26 · What protects a number is the **primitive it was captured under**, never the fact that
> it is a number. Goals, sales, attendance, minutes and budget are the job. Mood and connection
> are not.

### This is a live defect, not a hypothetical

`_stripLeaderNumbers` (`server.js:4208`) removes **any** percentage:

```js
.replace(/\b\d+(?:\.\d+)?\s*%/g, '')    // "83%"
```

It cannot distinguish `2.1/5 mood` from `83% pass completion`, so it deletes both. It is applied
to `summary`, `whyNow`, `recommendedAction`, `learnedNote` and every `connections[].basis` — so
**every leader surface in the product is already stripping legitimate performance data today.**
A coach reading "pass completion is at" is looking at this bug.

### What this does to the positioning, said plainly

**IntelliQ is not a wellbeing product that tolerates performance.** It is a performance system
whose distinctive claim is that it handles the private layer correctly. The founder's sentence is
the market truth: *wellbeing doesn't win you games — it helps.* An organisation buying this is
buying better decisions about performance; the reason it can be trusted with the private half is
the moat, not the pitch.

**A product that redacted a striker's conversion rate from their own coach would be broken**, and
we would have shipped it.

### What it requires

The composers need the primitive alongside the value, which L3 already attaches
(`ai/primitives.js` tags every measurement with its primitive and its direction). The gate becomes
`primitive === 'state' || primitive === 'relational'` at composition time, and
`_stripLeaderNumbers` narrows to those two paths as a backstop rather than running over every
leader-facing string.

**Unchanged:** an aggregate `state` figure over a cohort that satisfies the two-sided floor is a
different object from one person's mood, and the floor already governs it.

---

## D27 · A LEADER IS A SUBJECT, UNDER THE SAME FLOOR AS EVERYONE

**Decision:** a member's words may become evidence about a leader. A claim about a leader surfaces
only once the two-sided cohort floor is satisfied — the same floor that protects everybody.

**Why this is the symmetrical answer and not the risky one.** The alternative — leaders are never
subjects — means the system is structurally incapable of noticing that the problem is the coach.
That is not neutrality; it is a designed blind spot, and every organisation that has ever needed
this product has had one.

**What already protects it, with nothing new built:**

- **The two-sided floor** (`MIN_COHORT = 5`): one annoyed player is never a finding, and neither
  is all-but-five agreeing.
- **Origin counting, not contributor counting.** `MIN_INDEPENDENT_ORIGINS` and the `ECHO` verdict
  already refuse to treat one person saying the same thing three times, or three people
  paraphrasing one conversation, as independent corroboration. Without this, a single loud voice
  would manufacture a finding about their coach.

**The new obligation, and it is the whole risk of D27:**

> L-D27 · A finding about a leader must never be attributable to the people who contributed to it.
> Not by name, not by count small enough to identify, not by phrasing that reveals who spoke.

Retaliation is the failure mode. The floor makes the finding statistical; the projection layer
must keep it that way. **Where does it go?** To that leader's own leader, and to the leader
themselves — not to their team, which would hand them the list of who to ask.

**Open, and flagged rather than decided:** whether a leader sees a finding about themselves at the
same moment their manager does. That is a fairness question, not an architecture one.

---

## D28 · HISTORY FOLLOWS THE PERSON

**Decision:** when someone moves group — under-16s to under-18s, one department to another — their
baseline, patterns and threads move with them. **It is their record, not the group's.** What
changes is who may see it: the old leader loses access, the new leader gains it, from the moment
of the move.

**Why this is right and not merely convenient.** A baseline is *this person's own normal*. Reset it
and you have thrown away the only thing that makes a deviation meaningful — and you re-trigger the
two-week cold start (D22) on somebody who has been in the organisation for two years.

**Most of this already works.** `ai/audience.js` resolves audience as a **reference** — `{ kind,
nodeId }` resolved at read time, never a stored list. So a person changing node changes what
resolves, automatically, with no migration. The design anticipated this.

**What does not work, and it is D19 again.** The old leader loses *access* the moment the move
happens. They do not lose what they were *shown* last week. Nothing in the system remembers that a
card was delivered, so nothing can be reconciled after a move. The same missing record of delivery
blocks D19, D27's retaliation guard and this.

**Stated honestly:** access ends at the boundary; memory does not, and no software fixes that. What
we owe is that the system stops feeding it, immediately, which the audience reference already does.

---

## D29 · ONE PERSON, SEVERAL MEMBERSHIPS — AND SHARING IS THE PERSON'S TO GIVE

**Decision:** a person is one identity with separate memberships. Each organisation sees only its
own evidence. **The person may choose to let one organisation see something from another**, and
nobody else may make that choice for them.

**What stands in the way, precisely.** `emailIndex` (`server.js:1151`) maps one lowercase email to
exactly one `{ orgCode, userId }`, it is rebuilt from `orgUsers` at startup, and registration
rejects a duplicate outright: *"An account with this email already exists."* A player at a club who
is also at a school **cannot currently exist**. That is not an oversight — it is tenant isolation
enforced at the identity layer.

### This is the one decision that touches a law, and it must be built as an exception

Tenant isolation is a constitutional invariant. D29 does not repeal it:

> L-D29 · Cross-organisation visibility is a **narrow, explicit, person-initiated, revocable
> grant** over named evidence. It is never a widening of the tenant boundary, never a default,
> never inheritable, and never grantable by an administrator of either organisation.

Three properties that follow, none negotiable:

- **The grant is a reference, resolved at read time** — the same shape as every audience in the
  system, so revoking it takes effect immediately and everywhere.
- **It narrows, never grants.** A grant may expose evidence the receiving org could otherwise not
  see; it may never expose evidence the *granting* org holds about **other people**.
- **Both sides are told.** A school seeing something from a club must know it came from a club,
  and the club must know it was shared.

### Sequencing, stated so nobody starts it early

**POST-PILOT.** The membership split alone touches identity, registration, session, the email
index and every `orgCode`-keyed store in the system — and the consent surface on top of it is the
first disclosure mechanism that crosses a tenant boundary. The pilot does not need it. Doing it
badly under time pressure would compromise the one property the product cannot lose.

**What the pilot should do instead:** nothing, and know why. If a pilot participant is genuinely in
two organisations, they hold two accounts, and we write that down as a known limitation rather than
rushing the fix.

---

## D30 · THE DETERMINISTIC VOICE IS THREE FUNCTIONS TODAY, AND SHOULD BE ONE LAYER

The founder asked, after D25: *"So when does the deterministic voice come in then?"* The honest
answer required checking, and it corrects the impression D25 gives.

**What `ai/voice.js` actually exports:**

```js
module.exports = { greeting, leaderOpening, memberOpening, _pick, _num };
```

**Three functions, and all three produce salutations.** Every caller is an opening line
(`server.js:9020`, `12423`, `14871`, `14913`). D25 said *the kernel writes* — and the kernel's
writing capability today is a greeting generator.

### But the deterministic voice is much bigger than that. It is just not in `voice.js`

| Where | What it holds |
|---|---|
| `ai/proactive.js` `MESSAGES` | **30 headline/body/suggestion sets** — a fixed, human-written pair for every pattern, at both audiences. This is the largest body of deterministic prose in the product |
| `ai/primitives.js` `STRUCTURE_LABEL` | The plain names: *Pulling back · Gone quiet · Becoming isolated · Overload risk · Plateau* |
| `ai/assessment-view.js` | Member-facing composition, plus the generic-feedback detector |
| `ai/voice.js` | Greetings |

**So this is the polarity problem a third time: one concept, four homes.** The deterministic voice
exists and is substantial; nobody has ever called it one layer, so nobody maintains it as one.

### Decision

**`ai/voice.js` is the home.** The scattered tables consolidate into it, and it gains the one thing
none of them do: **composing an object's explanation** — what this is, why it is here, what it
rests on, what is still unknown, and what would change our mind (D12).

**When it comes in, concretely:**

| Surface | Voice |
|---|---|
| Every card, bucket, briefing, digest, High, Low | **Deterministic. Always.** Zero model calls |
| The **opening message** of every thread (D9, D13) | **Deterministic**, composed fresh from the object each time — never stored (`object-as-conversation.md` §2) |
| The record on the answerability screen (D18) | **Deterministic** — this is the JSON-dump finding, and it is the same job |
| Understanding an inbound turn | **The model** |
| A reply inside a thread | **The model**, from kernel-supplied facts, through `ai/language-guard.js` |

**Sequencing note:** the founder chose to solve the answerability screen's raw-JSON problem as part
of the thread work rather than separately, because a composed explanation is one problem. D30 is
the layer both of them land on.

---

## D31 · IntelliQ INFORMS. FOR THE PILOT, IT DOES NOT ACT

**Decision:** the action layer stays dark for the pilot.

**What is being left switched off, so nobody thinks it is missing.** Nine routes implementing a
complete loop — `propose · draft · approve · reject · execute · observe · evaluate` — with policy
evaluation and a DENY rule that hard-blocks execution *even after human approval*. It is built, it
is tested, and it has no caller.

**The reasoning, which is the point:** a system that acts on a wrong belief does damage that a
system which merely reports one does not. The pilot exists to find out whether the beliefs are
right. Acting on them before that answer exists inverts the order of the experiment.

**Not a permanent judgement.** The loop is well made and the policy engine is the right shape.
This is a sequencing decision: earn the trust, then spend it.

---

## D32 · SUPPRESSION IS VISIBLE — WITHIN THE VIEWER'S OWN SCOPE

**Decision, in the founder's words:**

> *"Tell everyone what it's stopped surfacing ONLY WITHIN THEIR SCOPE or web. Only within what
> they have access to."*

**What is being disclosed.** The Confidence Engine (`ai/confidence.js`) already suppresses an
entire *kind* of noticing once it has earned six pieces of feedback in that organisation and
proven mostly unhelpful (`shouldSurface`: `tier === 'unproven' && total >= 6`). It is live, it is
silent, and nobody has ever been told.

**Why telling people matters.** Learning from an organisation without telling it is precisely what
we criticise other products for. A finding that stops appearing is indistinguishable from a
finding that stopped happening, and those are very different facts about a team.

**And the founder's constraint is the interesting half — this is D7 applied to suppression:**

> L-D32 · What a person may learn about what IntelliQ has stopped saying is bounded by the same
> scope as what they may see it say. Suppression transparency is scoped, never global.

So a member sees what has been suppressed in their own web; a leader sees it across theirs; nobody
learns what a sibling branch has tuned out. The disclosure inherits `getVisibleUserIds` and
`ai/audience.js` unchanged — no new mechanism, and no new leak.

**The objection, recorded:** visibility invites gaming, since a group that dislikes a finding now
knows how to switch it off. Mitigated by the floor of six and by the fact that the suppression is
per *kind*, not per person — and accepted, because the alternative is a silent editor.

---

## D33 · WHAT THE PILOT HAS TO PROVE

The founder refused to choose one and gave the hierarchy instead, which is more useful:

> *"All three. I don't want anything breaking. Getting things wrong logic-wise, sure — that's why
> we are doing a pilot and that's why software always has updates. Sustained use confirms that the
> algorithm does the right thing, because why would I be talking to a random AI anyway unless I
> truly believed it knew me, knew my team and my environment and was genuinely helping. And the
> first one explains itself. If we can uncover at least one thing, then we are proving our
> thesis."*

**Read as three different kinds of claim, because they fail differently:**

| | Bar | What failing it means |
|---|---|---|
| **Nothing breaks** | No leak, no false accusation, no safeguarding failure, no privacy complaint | **Disqualifying.** The moat did not hold. Not recoverable by iteration |
| **Sustained use** | People keep speaking to it across the whole period | **The evidence for the reasoning.** The founder's argument: nobody keeps talking to an AI unless they believe it knows them. Use is not a vanity metric here — it is the proxy for whether the picture is true |
| **One real thing uncovered** | An inquiry the org could not answer alone, evidence from several people, closed by a human who learned something | **The thesis.** One is enough |

**The distinction the founder drew and it should govern how we triage bugs:** *getting things wrong
logic-wise is expected; breaking is not.* A wrong hypothesis is the system working — it will be
challenged, superseded, and the timeline will show it changed. A leaked figure is not a wrong
hypothesis; it is a broken promise, and no update repairs the fact that somebody read it.

**What this means for the remaining build order.** Everything that protects bar one comes before
anything that improves bars two and three. D26 (the primitive decides), D23 (numbers never
composed in), D19 (withdrawal recomputes and tells) and D27's attribution guard are pilot-blocking
in a way that the buckets and threads are not.

---

## D34 · THE VOICE IS A COLLEAGUE WHO NOTICED

**Decision:** warm, direct, first person, no hedging theatre. Someone on your side who happened to
see something — not an instrument, and not a coach with a view.

> *"Your load is up and your sleep is down. Worth a look?"*

**The two it is not, and why each was rejected:**

- **Not a neutral instrument.** *"Load: up. Sleep: down. These moved together."* is defensible and
  unreadable. A product nobody wants to open protects nobody.
- **Not a coach.** *"That combination usually catches up with people — I'd ease off this week"* is
  the most useful sentence and the one the epistemic ladder forbids. It predicts, and
  `ai/language-guard.js` would reject it — correctly.

**What this means concretely for D30's composer:**

| Do | Do not |
|---|---|
| First person. *"I noticed"*, not *"it has been observed"* | Hedge decoratively. *"It may possibly be the case that perhaps"* reads as evasion, not care |
| State the two facts and their relation | State a cause. They moved together; we do not know why |
| End with a question the person can actually answer | End with advice |
| Say what would change our mind (D12) | Say what will happen (`language-guard` rejects it anyway) |

**The line between warm and presumptuous:** a colleague who noticed does not tell you what it
means for you. It tells you what it saw and asks. Every message that ends in an instruction has
crossed into the coach voice.

---

## D35 · THE CONVERSATION IS THE CHECK-IN

**Decision:** there is no form. You talk to IntelliQ when you have something to say; it asks when
it needs something. Capture is a by-product of the conversation.

**Why this coheres with D22 rather than contradicting it.** I had offered "a short daily prompt"
as the fast route to a baseline — five days instead of five weeks. Removing the form appears to
remove that lever. It does not, because **the inquiry frontier is the prompt.** D22 already put
Inquiries at the top of Home on day one; at zero evidence every claim is a `MISSING_REQUIRED`
uncertainty, and asking is what the layer does. IntelliQ asks more in the first fortnight because
it needs more, not because a schedule fired.

**The consequence, and it is the risk of D35:**

> L-D35 · When conversation is the only capture mechanism, every unanswered question is pressure
> to ask again. The curiosity stopping rule is therefore not a refinement — it is what stops the
> capture mechanism becoming an interrogation.

`briefs/session-prompts.md` §16 is written and unrun. **D35 promotes it from a nicety to a
dependency**, and it must land before the thread work ships, exactly as
`object-as-conversation.md` G5 already warned.

**What it costs, said plainly.** Baselines build unevenly — a talkative person gets a normal in a
week, a quiet one may never get one. That is honest: we know less about people who tell us less,
and a system that pretended otherwise would be inventing. The `data_gap` pattern already names
this case, and D6 already ruled it is not a Low about them.

---

## D36 · A CHALLENGED FINDING IS CONTESTED, NOT DELETED

**Decision, in the founder's words:**

> *"They say so and it becomes challenge evidence, and that thread is not removed but marked as
> contested until proven otherwise."*

**The word is already in the code.** `ai/diagnose.js:646` sets `h.status = 'contested'` for
*genuine disagreement, unresolved*. The founder named the existing state without being shown it,
which is a good sign the model matches how a person actually thinks about this.

**What happens, mechanically, and all of it exists:**

1. The person's account enters as a signal that **challenges** the hypothesis — `challengeRefs`,
   not `supportRefs`.
2. Confidence falls, because contradiction pulls it down hard (`ai/diagnose.js:135`).
3. The finding is **marked contested and stays visible**. Nothing is deleted; `supersede()` keeps
   the superseded record.
4. The timeline records that the understanding changed and why.

**Why "until proven otherwise" is the important half.** Contested is not a resting state — it is a
question. It resolves when evidence accumulates on one side, or when a person closes it (D3, D9).
A finding that sits contested forever is one nobody is answering, and D22's priority ranking should
treat that as interesting rather than settled.

**And the rejected alternative matters.** "The person says so and it is removed" is the intuitive
answer and it breaks the product: a system that deletes what it is told to delete cannot notice a
pattern somebody consistently denies — which is precisely the pattern most worth noticing. Keeping
it contested preserves both the person's account **and** the system's, and lets evidence decide.

---

## D37 · SEVERAL NODES MEANS THE UNION OF WHAT EACH GRANTS

**Decision:** a person's Web is the union of what each of their nodes grants.
`user.assignedNodeIds` and `user.leadershipNodeIds` are already arrays (`server.js:2418`), so this
is a confirmation of the existing shape, not a change to it.

**Why union is right.** Being in the leadership group genuinely should widen what you see. Treating
each node as its own world would make one person three separate records and destroy the single
baseline that D28 just protected.

### The precision this needs, or it breaks a law

**Branch isolation is asserted in three modules** — `ai/org-routing.js:16` and `:79`,
`ai/org-answer.js:6` — and executably at `scripts/org-graph-smoke.js:33` and `:44`: *a sibling
branch's items never appear.* A naive union across two sibling nodes would hand one person a view
across both branches, which is exactly what those three modules forbid.

> L-D37 · Union composes **memberships**, never **leaderships**. Being a member of two sibling
> nodes gives a person each node's member-level view. It never composes into a leader's rollup
> across branches, and it never grants evidence access to a branch they do not lead.

**Stated the other way round:** the union is over what each node grants *this person in that node's
own right*. A member seat in two places is two member seats. It is not a wider seat.

**And membership is still a reference.** `ai/audience.js` resolves at read time, so adding somebody
to a node changes what they see immediately and removing them revokes it immediately — including
across the union. Nothing is stored, so nothing goes stale.

---

## WHAT THESE THIRTY-SEVEN CHANGE ABOUT THE PLAN

The sequence in `docs/ttd/object-as-conversation.md` §5 still holds, with one insertion.

| # | Step | Changed by |
|---|---|---|
| 0 | **One polarity vocabulary — High and Low**, with a third outcome underneath: neither | D4, plus D5 and D6. Now a prerequisite: self Highs and Lows cannot be derived into a vocabulary that has not been chosen. The bucketing table is: `risk`/`friction` → Low; `progress`/`milestone`/`opportunity`/`strength` → High; `neutral` → neither; `data_gap` → neither, by name |
| 1 | `about` binding on the conversation store | unchanged — **and D9 raises its priority: an inquiry is a thread too, so this is now load-bearing for four object kinds, not three** |
| 2 | Self High/Low, derived from the polarity map | D4 settles the names |
| 3 | **Focus participants and invitation — in two shapes, room and parallel** | **D2, now much larger under D14.** The parallel focus is what retires assign/submit/return/score. **D15** governs what its words may do; **D16** governs what `@intelliQ` may answer in a room |
| 4 | The four buckets and the thread view, one home | D1 — one home, and the bucket IS the existing card feed under a filter. **D7 — one bucket endpoint taking a scope, not a role.** **D10 — parked inquiries render below the live ones with their reason** |
| 5 | Inquiry resolution by a person — **answered or dropped** | D3, extended by **D9**. Depends on 1: answering and dropping happen by speaking into the thread |
| 6 | **Park on priority, not fade on age** | **D8 and D9 part four, both corrected by D17.** Nothing is abandoned. Depends on 1, because a parked object must still open. A parked inquiry is dormant, never resolved (L-D9) |
| 7 | **Plain-language projection of kernel status** | **D11 — new step.** `exploring / probable / supported / disputed` never reach a screen unprojected |
| 8 | **The frontier and the falsifiers in the thread** | **D12 — new step, and the cheapest of them: both are already in the payload at `server.js:13563-13564`** |
| 9 | **One priority, ranking all four kinds, deciding Home** | **D9 part three, named by D13.** `/api/inquiry/lead` ranks inquiries today. Three ranking mechanisms already exist — pick one and make the others feed it, do not add a fourth |
| 10 | **Curiosity in the thread, under the stopping rule** | **PROMOTED by D35.** With conversation as the only capture mechanism, the stopping rule is what keeps capture from becoming interrogation. `session-prompts.md` §16, written and unrun — it must land before the thread work ships |
| 11 | **The answerability screen — your record, your audiences, the safeguarding exception** | **D18 and D21.** Wiring, not building: `/api/me/data`, `/api/me/export`, `/api/me/audiences` all exist with no caller |
| 12 | **Withdrawal recomputes, and whoever saw the old picture is told** | **D19 — closes T-2, and the most expensive item here.** Needs a record of what was shown to whom, which does not exist |
| 13 | **Import, so the pilot does not start at zero** | **D22.** `/api/signals/import` and `/api/signals/import-csv` exist and are orphaned. The single largest cold-start lever, and it is wiring |
| 14 | **The primitive decides which numbers a leader sees** | **D23 as corrected by D26 — and this one is a live defect, not new work.** Performance figures are being stripped from leader surfaces today |
| 15 | **`js/app.js` absorbs `js/member-view.js`** | **D24.** Largest change on the plan, no halfway point, and it must come LAST — after the object model stops moving |
| 16 | Leaders as subjects, under the floor | **D27.** The floor and origin counting already exist; the projection guard against attribution does not |
| — | **POST-PILOT: one identity, several memberships, cross-org consent** | **D29.** Touches tenant isolation. Explicitly not pilot work, and not to be started early |

### D33 splits this list in two

**Pilot-blocking (bar one — "nothing breaks"):** D26 the primitive decides · D23 numbers never
composed in · D19 withdrawal recomputes and tells · D27's attribution guard · D21 advance notice.
These protect a promise, and a broken promise is not repaired by an update.

**Everything else is bars two and three** — better product, not a broken one. If time runs out,
it runs out here.

### The single thread running through the unbuilt half

**A record of what was shown to whom does not exist**, and four separate decisions need it:
**D19** (tell whoever saw a finding that changed), **D27** (never attribute a finding about a
leader), **D28** (reconcile after a person moves group), and the awkward half of **D8/D17**
(something you acted on has been parked). Building it once serves all four. Building it four times
is how this repository got three polarity vocabularies.

**D2 is the one to be careful with.** It introduces the first object whose audience is a set of
people rather than a node, and the first `ai/audience.js` kind that does not resolve through
`orgNodes`. That is a real extension of the privacy model — narrow, defensible, and not to be
done casually alongside a UI change.

**Step 1 is now the bottleneck.** Five of the twelve decisions — D9 in three of its four parts,
D10, D12 and the readable-history halves of D8 — all resolve to *the object opens as a thread*.
Nothing above it can be finished without it, and it remains one field.

**Step 8 is the cheapest thing on this list.** The falsifiers and the frontier are computed,
governed, and already serialised onto the response. Rendering them is a front-end change against
a payload that exists today.
