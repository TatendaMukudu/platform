# The layer map — what is right, what is duplicated, what is missing

**Status:** CURRENT. **Written against:** the branch head that contains `ai/audience.js`.
**Why it exists:** the founder asked, plainly, "now I don't know what's right and what's wrong."
This answers that from the code rather than from any earlier description of it.

---

## 0 · THE ONE-LINE ANSWER

**The founder's instinct is correct: this is rearranging, not building.**

Highs and Lows are not a new concept. The layer that decides "this is going well" versus "this
needs work" has existed since long before either word was used. It exists **three times**, under
three different names, all reading the same field.

---

## 1 · THE PROOF — three names, one field

Every finding in this system carries a `polarity`. The vocabulary is fixed
(`ai/intelligence-feed.js`):

```
risk · progress · milestone · opportunity · friction · strength · neutral
```

Three separate modules bucket that same field, and each names its buckets differently:

| Module | Bucketing | Names it uses |
|---|---|---|
| `ai/behaviour.js` | risk, neutral → one bucket; progress, milestone → another; opportunity → a third | **Needs attention · Worth celebrating · Opportunities** |
| `ai/scoped-intelligence-packet.js` | risk, friction → one; progress, strength, milestone, opportunity → another | **needs_attention · working_well** |
| `ai/team-state.js` | worth_attention → Low; working_well → High | **High · Low** |
| `ai/process-reflection.js` · `ai/process-observations.js` | a fourth producer, not a fourth bucketing: it **emits** `strength` and `friction` for routines, handoffs and rituals | **strength · friction** |

**Note added after the founder interview:** `strength` and `friction` are absent from
`PATTERN_POLARITY` (`ai/proactive.js:37`) because that table covers *person* patterns only. They
are alive and load-bearing in the process layer. Anyone auditing polarity from `PATTERN_POLARITY`
alone will conclude they are dead values. They are not.

So:

> **High = worth_celebrating = working_well.
> Low = needs_attention = worth_attention.**

They are the same thing. The team surface did not invent them; it renamed them and applied
disclosure floors.

**And the three do not agree with each other.** `behaviour` puts `neutral` in *needs attention*
and gives `opportunity` its own bucket; `scoped-intelligence-packet` puts `opportunity` in
*working well*; `team-state` has no `opportunity` concept at all. Three bucketings, three
boundaries, one underlying field.

**That is the real finding.** Not a missing engine — an unresolved vocabulary.

---

## 2 · THE LAYERS, IN ORDER

Read top to bottom: this is the path a sentence takes from a person to a screen.

### L1 · CAPTURE — what a person said or a system recorded
`ai/capture.js` · `ai/intake.js` · `ai/adapters.js` · `ai/connectors.js` · `lib/evidence.js`

Turns anything — a message, an import, a check-in, an assessment — into one **evidence envelope**
with a subject, an owner, a visibility, an origin and a timestamp. One shape for everything.

**Status: right.** This is the strongest layer in the system.

### L2 · ADMISSIBILITY — what may be reasoned over, for whom
`_kernelEvidence` in `server.js` · `ai/admissibility.js` · `ai/privacy.js` · `ai/audience.js`

Computes **two different admissible sets from one log** — yours, and the organisation's — and does
it *before* any context is assembled. Private evidence is never retrieved and then filtered.

**Status: right, and it is the moat.** Most competitors filter output; this filters input.

### L3 · PRIMITIVES — what kind of thing a number is
`ai/primitives.js` · `ai/baseline.js` · `ai/packs.js`

A measurement is tagged `participation`, `state`, `capability`, `load`, `outcome`, `relational` or
`resource`, plus which direction is good. The kernel never knows "soccer" or "maths".

**Status: right.** Recently fixed so canonical evidence enters on its declared primitive rather
than on whether its label happened to match `/mood/i`.

### L4 · DETECTION — has something changed
`ai/intelligence.js` · `ai/primitives.js` `structuralPatterns` · `ai/baseline.js`

Compares a stream against **its own history**, never against other people. Median and MAD, so one
bad day cannot move it. Produces findings with a type, a severity and a confidence.

**Status: right.** Needs five prior observations before anything fires — a real constraint on a
pilot starting from empty, not a bug.

### L5 · POLARITY — is this good or does it need work
`ai/proactive.js` `PATTERN_POLARITY` · `ai/intelligence-feed.js` `POLARITIES`

Maps a finding type to whether it is positive or needs attention. Deterministic, a fixed table,
no model.

**Status: right, and it is the layer Highs and Lows come out of.** See §1.

### L6 · BUCKETING AND NAMING — what to call it on screen
`ai/behaviour.js` · `ai/scoped-intelligence-packet.js` · `ai/team-state.js`

**Status: DUPLICATED THREE TIMES.** This is the only genuinely confused layer in the system, and
it is a naming problem rather than a logic problem.

### L7 · INQUIRY — what we are still working out
`ai/diagnose.js` · `ai/inquiry.js` · `ai/contribution.js`

Hypotheses with support and challenge, confidence computed from evidence rather than asserted,
supersession instead of deletion, a timeline of how the understanding changed, and a frontier of
what is still unknown. Refuses to accept a proposed `conclusion`.

**Status: right, and it is the heart of the product.** Founder note, accurate: inquiries were
working on Render; what remains is maturity, not correctness.

### L8 · SCOPE AND DISCLOSURE — who may see it
`ai/org-graph.js` · `getVisibleUserIds` · `ai/team-state.js` `cohortFloor` · `ai/audience.js`

Who is in which group, who leads what, and the two-sided cohort floor at five.

**Status: right, recently hardened.** One known wrinkle: three parallel scope mechanisms exist and
`scope-parity-smoke` now enumerates where they disagree. Not urgent.

### L9 · PROJECTION — the words a person reads
`ai/proactive.js` `toInsight` · `_sanitizeBriefingForLeader` · `ai/voice.js` · `ai/report.js`

Turns a governed finding into a sentence, strips a member's numbers from a leader's view, and
checks the result against a frozen allow-list.

**Status: right, but per-surface.** Every leader-facing endpoint must apply it individually, and
one (`/api/intelligence/watch`) had never been through it until a browser pass found it. Assert
per surface, not per function.

### L10 · DELIVERY — where it appears
`js/app.js` · `js/member-view.js` · `ai/delivery.js`

**Status: the weakest layer, and the one the founder is reacting to.** The backend objects are
coherent; the front end scatters them across two files and several pages, with three vocabularies
from L6 showing through.

---

## 3 · WHAT IS ACTUALLY WRONG

Three things. All of them are in L6 and L10.

1. **Three vocabularies for one polarity.** Pick one. `High` and `Low` are the founder's words and
   the product's words; the others should become aliases of them, not parallel systems.
   **SETTLED — `ttd/founder-decisions-2026-08.md` D4.**
2. **`opportunity` has no agreed home.** Its own bucket in one module, a High in another, absent
   from the third. Decide once. **SETTLED — D4: it folds into High.**
3. **The front end does not reflect the object model.** The backend has Inquiry, Focus, High, Low
   at two grains. The front end has Today, Team, and a scatter of cards. That gap is the whole of
   `docs/ttd/object-as-conversation.md`. **Now also governed by D7: one bucket surface taking a
   scope, not one surface per role.**

**The full bucketing table, after D4 through D7 — this is the single source for L6:**

| Polarity | Bucket |
|---|---|
| `risk`, `friction` | **Low** |
| `progress`, `milestone`, `opportunity`, `strength` | **High** |
| `neutral` | **neither** — visible in the feed, counted in no bucket (D5) |
| `data_gap` (by pattern name, whatever its polarity) | **neither** — it is our gap, not theirs (D6) |

---

## 4 · WHAT IS ACTUALLY MISSING

Shorter than expected.

- **Self High/Low as a named projection.** The polarity is there, the detection is there, the
  bucketing is there under a different name. **Founder decision taken: derive them from the
  polarity map, exactly as the team ones are.** This is a rename plus a projection, not an engine.
- **A thread bound to an object** — one field on the conversation store.
- **Inquiry maturity** — the founder's own word. The inquiry works; what it lacks is the visible
  arc from opened, through evidence accumulating, to settled or abandoned.

---

## 5 · WHAT THIS MEANS

The system is not confused. **One layer is named three ways, and the front end has not caught up
with the object model.** Everything under that is coherent and most of it is tested.

The work is: pick one vocabulary, project self Highs and Lows from the polarity that already
exists, bind threads to objects, and let the front end show the four objects the backend already
holds.

**None of that is new architecture.** The founder's read is correct.
