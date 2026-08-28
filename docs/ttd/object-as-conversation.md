# Every object is a conversation

**Status:** CURRENT — design, not yet implemented. **Written against:** the branch head that
contains `ai/audience.js`.
**Origin:** founder direction, August 2026, given against the Claude mobile app as the reference
shape.

---

## 1 · THE SHAPE

> Home is the question and the composer. Nav is Inquiries, Focuses, Highs, Lows. Each opens a
> **bucket** — which is the card feed home used to be, filtered to that one kind. Each card opens
> a **thread** — and the thread behaves exactly like a conversation with an assistant that
> already knows why the thing exists.

**The founder's words, kept because they are the specification:** *"they are not lists, they are
in the nav — and when you click on them you essentially see what we used to have, but in their
respective buckets."*

That is a instruction about **reuse, not layout**. The card feed on the leader's Today page is
the rendering. Nothing new is designed; the existing feed is filtered four ways and each way is
given a nav entry. Anyone who builds a new list component has misread this.

Concretely:

| Where | What |
|---|---|
| **Home** | The single most-needing-an-answer question — self **or** team, one ranking — and the composer under it. Nothing else above the fold. |
| **Nav** | Four entries: Inquiries · Focuses · Highs · Lows. Each at both grains. |
| **A bucket** | The card feed as it exists today, filtered to one kind, most-alive first. Same cards, same renderer, same affordances. |
| **An item, never opened** | Opens with IntelliQ explaining itself: what this is, why it is here, and the evidence it rests on. |
| **An item assigned by a coach** | Explains what was said that led to it, summarised, plus the further evidence behind the assignment. |
| **A self-created item** | Explains why *you* created it, and what it rests on. |
| **An item you have used before** | Is a chat. Previous turns scroll up. It remembers. |
| **Throughout** | The agent may reason, surface new evidence, and ask the next best question. |

**The product claim underneath it:** an epistemic object is not a card. It is an ongoing
conversation about something not yet settled, and the card is just its most recent state.

---

## 2 · THE ARCHITECTURAL CALL THAT MAKES THIS SAFE

**A thread is a RENDERING of the object, not a second store.**

The tempting implementation is a chat log per inquiry. That would create a second place
organisational truth lives — the one thing the constitution forbids — and the two would drift the
first time a correction landed in one and not the other.

So:

- **The opening message is COMPOSED FROM THE OBJECT, every time.** Never written once and stored.
  If the evidence changes, the explanation changes, because it was never a copy.
- **Only the human turns and the agent's replies are stored**, in the conversation store that
  already exists.
- **The object remains the truth.** The thread is a view of it plus the exchange about it.

Stated as a law, because it is the way this feature could quietly break the kernel:

> L-OC1 · A conversation about an object may add evidence to that object through the normal
> boundary. It may never hold a claim the object does not.

---

## 3 · WHAT ALREADY EXISTS — more than expected

| Need | Already there |
|---|---|
| A threaded store with per-message provenance | `assistantConversations`: `wsKey → [{ id, title, createdAt, updatedAt, messages:[{ role, text, at, reasoning, register, provenance }] }]` |
| "Why is this here" for an Inquiry | `inquiry.timeline` — *how the understanding changed* — plus `signals`, `hypotheses`, `confidence.because` |
| "Why did I get this Focus" | `focus.origin { by, at, from, inquiryId }` — `from` distinguishes a leader's assignment from a system proposal from your own decision |
| "What does it rest on" | `signals[].ref` resolved through the normal authorised read; the group inquiry already reports `independentOrigins` and `contributors` |
| The next best question | `inquiry.missingSignals` — the collection frontier, already computed |
| The single most-answerable question | `GET /api/inquiry/lead` — one ranking over self and team, already built |
| Who may see any of it | `ai/audience.js` and `_kernelEvidence` |
| Group threads | `forumThreads`, per group inquiry |

**Assessment: this is mostly assembly.** The pieces were built for other reasons and happen to be
exactly the pieces this needs.

---

## 4 · THE GAPS, HONESTLY

### G1 · One missing primitive: binding a thread to an object

`assistantConversations` is keyed by workspace, not by subject. A conversation has no `about`.

**The whole gap is one field:**

```
about: { kind: 'inquiry' | 'focus' | 'high' | 'low', id, subjectRef }
```

Everything else follows: the list is a query, the thread is a filter, memory is what the store
already does.

### G2 · Self High and Low do not exist

The largest genuine gap. There is **no self-grain High/Low concept anywhere in the code**. Team
Highs and Lows come from contributed group inquiries and detected group patterns. The Self layer
has beliefs, patterns and insights — but nothing named or shaped as a High or a Low.

**FOUNDER DECISION TAKEN, August 2026: derive them from the polarity map, exactly as the team
ones are derived.** Not declared by the person — projected from the polarity that
`ai/proactive.js` `PATTERN_POLARITY` already assigns to every detected pattern.

This is smaller than it first appeared. `docs/ttd/layer-map.md` §1 shows the bucketing already
exists three times over: `ai/behaviour.js` calls it *Worth celebrating / Needs attention*,
`ai/scoped-intelligence-packet.js` calls it *working_well / needs_attention*, and
`ai/team-state.js` calls it *High / Low*. Self Highs and Lows are the third name applied to the
first two, not a new engine.

**So the work is a rename and a projection, and it comes with an obligation:** pick ONE
vocabulary and make the others aliases of it. Leaving three parallel bucketings is how this
became confusing in the first place.

### G3 · Nav is flat

Every leader route currently resolves to `leader-home`. Four buckets means four routes and a
**filter argument to the feed that already renders**, plus one new renderer — the thread. Not
two renderers each: the bucket renderer already exists and is in production on Today. The work
spans both view files (`js/app.js` for leaders, `js/member-view.js` for members). This is the
bulk of the work and none of it is deep.

**The failure mode to name in advance:** writing a second card renderer for the buckets. Two
renderers for the same card is how the polarity vocabulary ended up existing three times.

### G4 · The opening message must not become an assertion

"Explaining itself with evidence" is exactly where a model would like to state a conclusion.

The composition must obey the ladder that already exists: the leading hypothesis is stated **as a
hypothesis with its band**, the evidence is counted rather than characterised, and what is still
unknown is named. `MODEL_MAY_PROPOSE` already excludes `conclusion`; this surface must not become
the exception.

### G5 · The stopping rule is a prerequisite, not a follow-on

A thread that asks the next best question every time a person opens it is an interrogation. The
curiosity stopping rule (`session-prompts.md` §16) must land **before** this ships, not after.

---

## 5 · IMPLEMENTATION SEQUENCE

Four steps, each independently shippable and each testable.

| # | Step | Depends on |
|---|---|---|
| **1** | `about` on the conversation store, plus `GET /api/objects/:kind` (the list) and `GET /api/objects/:kind/:id/thread` (the thread). The thread's opening message is composed, never stored. | — |
| **2** | Self High/Low, derived from existing self patterns (G2 option a) | founder decision |
| **3** | The four nav buckets — the existing feed, filtered — and the thread view, leader and member | 1, 2 |
| **4** | Curiosity in the thread — next best question, under the stopping rule | §16 stopping rule |

**Do not start at 3.** The bucket and thread views are the visible part and the temptation is to
build them first against placeholder data, which is how a second store gets created by accident.

---

## 6 · WHAT THIS IS NOT

- **Not a second truth store.** See §2.
- **Not a chat log per object.** The opening message is composed from the object each time.
- **Not a licence to conclude.** §4 G4.
- **Not a reason to relax the audience or cohort rules.** A thread about a group object is still
  a group read: the two-sided floor and the audience reference apply unchanged, and a person
  opening a thread gains nothing they could not already see.

---

## 6b · THE FRONT-END DESIGN, IN FULL

**Founder direction, August 2026:** *"I wanted a minimalistic, simplistic view, because good
products are often simple."* Correct, and the discipline below is what makes it stay simple.

### The whole product is a chat with four filing cabinets

- **Home is ONE thing** — greeting, the single highest-priority question (self or team, one
  ranking, D13), and the composer. Nothing else above the fold. No summary, no counts, no badge.
- **Nav is four buckets** — Inquiries · Focuses · Highs · Lows. The existing card feed, filtered
  (D1). No new component.
- **Every card opens as a conversation** (D9, D13).

### Three levels, and the third is not UI

| | What | Why |
|---|---|---|
| **1 · The card** | One sentence, plain language, stated as a claim. How sure we are, in words | *"Attendance in the U18s has dropped from its usual. I think exams are competing for time — fairly confident."* |
| **2 · The thread** | Why it is here · what it rests on, **counts not quotes** · what is still unknown · what would change our mind. Then the conversation | Everything in this row already exists in the payload |
| **3 · —** | **There is no level 3.** If they want more they ask, and the agent answers | The discipline: whenever tempted to add a panel, make it something the agent can say instead |

### The four moments that show the kernel, each one line

Not features — sentences. The kernel becomes visible through what the text is allowed to contain.

1. **"What would change my mind."** `falsifiers`, already at `server.js:13564`. A system that
   regenerates a summary each time has no stable belief to falsify. No competitor can write this
   line.
2. **"Who can see this?"** next to the composer — `GET /api/evidence/:id/audience` answers it
   deterministically. A player asking *can my coach see this* and getting a real answer instead of
   a privacy policy is the most trust-building second in the product.
3. **Confidence with its reasons.** `confidence.because` is already an array of plain reasons.
   *"Fairly confident — three people, two independent sources, over four weeks."* Origin counting,
   made visible.
4. **The timeline** — *"here is how my understanding of this changed."* Belief revision made
   visible. The most differentiated thing in the system, and it currently has no pixels.

Plus **contested** (D36) shown as a state with both sides, not as an error. That is the moment a
person realises they were taken seriously.

### What must NOT be built

> **No dashboard. None.** No charts of people, no red/amber/green on humans, no engagement
> metrics, no leaderboards, no scores (D14b).

A dashboard asserts that the numbers speak for themselves, which is exactly what a truth
maintenance system denies. Every competitor leads with one; building one would make us look like
them while discarding the only thing that makes us different.

**If a number is shown it is about a THING** — attendance, pass completion, session load (D26).
Never a mark on a person.

---

## 6c · THE SCREENS

Mobile-first, one column, text-first. No cards inside cards, no side panels, no tabs within tabs.
One accent colour. If a screen needs a scrollbar to make sense, it is wrong.

### Home — one object, one composer, one trust link

```
  ≡                              Tatenda

  Evening, Tatenda.                          <- ai/voice.js greeting

  Attendance in the U18s has dropped         <- the single highest-priority object,
  from its usual. I think exams are             any kind (D13, D48)
  competing for time.

  Fairly confident — three people,           <- confidence.because, as English
  two independent sources, four weeks

  Open >

  +--------------------------------------+
  |  Ask IntelliQ anything…         [->] |
  +--------------------------------------+

  Who can see what I say here?             <- GET /api/evidence/:id/audience
```

### Nav — names, NO COUNT BADGES

```
  Inquiries · Focuses · Highs · Lows
  ----------------------------------
  My data & privacy
```

A badge reading "12 Lows" builds the same inbox anxiety as twenty cards on a screen, in miniature
(founder, D48). Names only.

### A bucket — live first, then parked WITH THE REASON

```
  Lows

  [ Attendance is below its usual · Fairly confident ]
  [ The Monday handoff keeps costing the team time · Emerging ]

  Set aside for now
  [ Sleep is down from your normal ·
    "other open questions would tell us more right now" ]
```

That parked reason is `boundFrontier`'s `parkedBecause`, written to be read and never rendered
(D10). Showing it is how a person can disagree with the ranking.

### A thread — FOUR HEADINGS, and that is the whole design

```
  < Lows

  Attendance in the U18s has dropped from its usual.
  I think exams are competing for time. Fairly confident.

  Why I think that
    Three people said it independently, over four weeks.   <- independentOrigins, COUNTS not quotes

  What I still don't know
    Whether the players who dropped off are the ones        <- missingSignals (stillUnknown)
    sitting exams.

  What would change my mind
    If attendance stays low after exams finish.             <- falsifiers

  ---------------------------------------------------------
  [ conversation turns scroll here ]
  +--------------------------------------+
  |  Add what you know…             [->] |
  +--------------------------------------+
```

**Composed fresh from the object every time, never stored** (§2). **No buttons:** an inquiry is
closed by saying so (D9) and challenged by saying so (D36).

**The one concession to discoverability:** a single overflow with exactly two items — *Mark
answered · Set aside*. Nobody guesses they can close a thing by talking about it. If we want zero
controls instead, the fallback is the agent asking *"do you want to call this answered?"* when it
looks settled — which is D3 behaving correctly anyway.

### Contested — a state, never an error

```
  Contested
  You said this isn't right — the bus timetable changed. That's on
  the record, and it's pulled my confidence down. Both accounts are kept.
```

No warning colour. *"Both accounts are kept"* is the moment a person learns this system does not
overwrite them, and it is worth more than any feature.

---

## 7 · THE ONE-LINE VERSION

> IntelliQ already knows why every object exists and what it rests on. This work makes it say so,
> in the place a person would naturally ask.
