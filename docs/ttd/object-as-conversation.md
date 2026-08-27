# Every object is a conversation

**Status:** CURRENT — design, not yet implemented. **Written against:** the branch head that
contains `ai/audience.js`.
**Origin:** founder direction, August 2026, given against the Claude mobile app as the reference
shape.

---

## 1 · THE SHAPE

> Home is the question and the composer. Nav is Inquiries, Focuses, Highs, Lows. Each opens a
> list. Each item opens a **thread** — and the thread behaves exactly like a conversation with
> an assistant that already knows why the thing exists.

Concretely:

| Where | What |
|---|---|
| **Home** | The single most-needing-an-answer question — self **or** team, one ranking — and the composer under it. Nothing else above the fold. |
| **Nav** | Four lists: Inquiries · Focuses · Highs · Lows. Each at both grains. |
| **A list** | The objects of that kind this person may see, most-alive first. |
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

Two options, and this is a founder decision:

- **(a) Derive them.** A self High/Low is a projection of an existing self pattern, using the
  polarity map that already exists. Cheap, consistent, and adds no new store.
- **(b) Declare them.** The person names their own High or Low, as contributors already declare
  valence at the group boundary. Truer to "valence is a human judgement", but it asks more of a
  person before they have anything to say.

**(a) is the smaller step and does not preclude (b).** Recommendation: derive first.

### G3 · Nav is flat

Every leader route currently resolves to `leader-home`. Four lists means four routes, two
renderers each (list and thread), at both grains, in two view files (`js/app.js` for leaders,
`js/member-view.js` for members). This is the bulk of the work and none of it is deep.

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
| **3** | The four nav lists and the thread view, leader and member | 1, 2 |
| **4** | Curiosity in the thread — next best question, under the stopping rule | §16 stopping rule |

**Do not start at 3.** The list and thread views are the visible part and the temptation is to
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

## 7 · THE ONE-LINE VERSION

> IntelliQ already knows why every object exists and what it rests on. This work makes it say so,
> in the place a person would naturally ask.
