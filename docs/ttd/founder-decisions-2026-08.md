# Founder decisions — August 2026

**Status:** CURRENT — binding. **Branch:** `claude/platform-work-summary-nmb0cm`.
Taken directly by the founder in session. Each is recorded with what it settles, what it costs,
and what it now requires.

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

## WHAT THESE TWENTY-ONE CHANGE ABOUT THE PLAN

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
| 10 | Curiosity in the thread, under the stopping rule | unchanged |
| 11 | **The answerability screen — your record, your audiences, the safeguarding exception** | **D18 and D21.** Wiring, not building: `/api/me/data`, `/api/me/export`, `/api/me/audiences` all exist with no caller |
| 12 | **Withdrawal recomputes, and whoever saw the old picture is told** | **D19 — closes T-2, and the most expensive item here.** Needs a record of what was shown to whom, which does not exist |

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
