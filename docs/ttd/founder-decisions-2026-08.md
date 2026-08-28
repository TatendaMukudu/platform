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

## WHAT THESE TWELVE CHANGE ABOUT THE PLAN

The sequence in `docs/ttd/object-as-conversation.md` §5 still holds, with one insertion.

| # | Step | Changed by |
|---|---|---|
| 0 | **One polarity vocabulary — High and Low**, with a third outcome underneath: neither | D4, plus D5 and D6. Now a prerequisite: self Highs and Lows cannot be derived into a vocabulary that has not been chosen. The bucketing table is: `risk`/`friction` → Low; `progress`/`milestone`/`opportunity`/`strength` → High; `neutral` → neither; `data_gap` → neither, by name |
| 1 | `about` binding on the conversation store | unchanged — **and D9 raises its priority: an inquiry is a thread too, so this is now load-bearing for four object kinds, not three** |
| 2 | Self High/Low, derived from the polarity map | D4 settles the names |
| 3 | **Focus participants and invitation** | **D2 — new step, and the largest of them** |
| 4 | The four buckets and the thread view, one home | D1 — one home, and the bucket IS the existing card feed under a filter. **D7 — one bucket endpoint taking a scope, not a role.** **D10 — parked inquiries render below the live ones with their reason** |
| 5 | Inquiry resolution by a person — **answered or dropped** | D3, extended by **D9**. Depends on 1: answering and dropping happen by speaking into the thread |
| 6 | Fade on stale evidence, **one constant for all four kinds** | **D8, extended by D9 part four.** Depends on 1, because a faded card must still open. A faded inquiry is dormant, never resolved (L-D9) |
| 7 | **Plain-language projection of kernel status** | **D11 — new step.** `exploring / probable / supported / disputed` never reach a screen unprojected |
| 8 | **The frontier and the falsifiers in the thread** | **D12 — new step, and the cheapest of them: both are already in the payload at `server.js:13563-13564`** |
| 9 | **One ranking across all four kinds for home** | **D9 part three.** `/api/inquiry/lead` ranks inquiries today; it needs a value comparable across object types, which does not exist yet |
| 10 | Curiosity in the thread, under the stopping rule | unchanged |

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
