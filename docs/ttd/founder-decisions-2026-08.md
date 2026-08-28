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

## WHAT THESE FOUR CHANGE ABOUT THE PLAN

The sequence in `docs/ttd/object-as-conversation.md` §5 still holds, with one insertion.

| # | Step | Changed by |
|---|---|---|
| 0 | **One polarity vocabulary — High and Low** | D4. Now a prerequisite: self Highs and Lows cannot be derived into a vocabulary that has not been chosen |
| 1 | `about` binding on the conversation store | unchanged |
| 2 | Self High/Low, derived from the polarity map | D4 settles the names |
| 3 | **Focus participants and invitation** | **D2 — new step, and the largest of them** |
| 4 | The four buckets and the thread view, one home | D1 — one home, and the bucket IS the existing card feed under a filter |
| 5 | Inquiry resolution by a person | D3 |
| 6 | Curiosity in the thread, under the stopping rule | unchanged |

**D2 is the one to be careful with.** It introduces the first object whose audience is a set of
people rather than a node, and the first `ai/audience.js` kind that does not resolve through
`orgNodes`. That is a real extension of the privacy model — narrow, defensible, and not to be
done casually alongside a UI change.
