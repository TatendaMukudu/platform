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

## WHAT THESE EIGHT CHANGE ABOUT THE PLAN

The sequence in `docs/ttd/object-as-conversation.md` §5 still holds, with one insertion.

| # | Step | Changed by |
|---|---|---|
| 0 | **One polarity vocabulary — High and Low**, with a third outcome underneath: neither | D4, plus D5 and D6. Now a prerequisite: self Highs and Lows cannot be derived into a vocabulary that has not been chosen. The bucketing table is: `risk`/`friction` → Low; `progress`/`milestone`/`opportunity`/`strength` → High; `neutral` → neither; `data_gap` → neither, by name |
| 1 | `about` binding on the conversation store | unchanged |
| 2 | Self High/Low, derived from the polarity map | D4 settles the names |
| 3 | **Focus participants and invitation** | **D2 — new step, and the largest of them** |
| 4 | The four buckets and the thread view, one home | D1 — one home, and the bucket IS the existing card feed under a filter. **D7 — one bucket endpoint taking a scope, not a role** |
| 5 | Inquiry resolution by a person | D3 |
| 6 | Fade on stale evidence | **D8 — new step. Depends on 1, because a faded card must still open** |
| 7 | Curiosity in the thread, under the stopping rule | unchanged |

**D2 is the one to be careful with.** It introduces the first object whose audience is a set of
people rather than a node, and the first `ai/audience.js` kind that does not resolve through
`orgNodes`. That is a real extension of the privacy model — narrow, defensible, and not to be
done casually alongside a UI change.
