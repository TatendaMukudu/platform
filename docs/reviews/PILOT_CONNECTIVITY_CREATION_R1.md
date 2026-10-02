# The final narrow pilot connectivity + creation pass

Branch `gpt/ab-decision-spine-r1`, head `156b81f`, baseline `1f63248`. Not merged.

This is the closing report for the pass. It answers the brief's thirty-six points in the
order they were asked, and it is written to be read by somebody who was not here.

---

## Part one — what the investigation found

### 1. The conclusion I was told to challenge was wrong, and it was mine

The brief said: *before building anything, challenge the conclusion that intent machinery is
missing.* I challenged it and it did not survive. `ai/composer-actions.js` has held an
eighteen-action vocabulary for some time — `create_focus`, `create_inquiry`,
`record_focus_outcome` among them — with a governed pipeline behind it that is complete:
allow-list, argument grounding, provenance stamping, confirmation, canonical owner.

What is model-gated is the INTERPRETATION STEP ALONE. With models off, no action is
selected, and the utterance is filed as a generic capture. That is a seam, not an absence.
The earlier report said the machinery was missing. It was not, and the correction is
recorded in `CREATION_OWNER_MAP_R1.md`, in the commit that introduced it, and in the header
of every suite that rests on it.

### 2. What was actually broken

Four things, all of the same shape: **a capability that exists in source, passes hermetic
tests, and produces nothing or something false on a real screen.**

| Defect | Where it lived | What a coach saw |
|---|---|---|
| `create_inquiry` declared for contexts the product never produces | `ai/composer-actions.js` | The action existed and could never be reached in any real turn |
| The group outcome vocabulary was unknown to the composer | `ai/composer-actions.js` grounding | A coach saying "it got better" about a TEAM focus was asked "did it help, not help, or was it mixed?" — the personal words, about a focus whose own screen offers better/no_change/worse/unclear |
| Every confirmed outcome went to the PERSONAL writer | `server.js` confirm dispatcher | Confirming a group outcome returned 400 |
| Creation was model-gated, and the pilot runs models-off | `_composerActionInterpret` | Typing "Create an inquiry into X" did nothing and said nothing |

### 3. The creation model, and who owns it

Adjudicated by the founder as the **narrow command shape**: route a typed instruction through
the EXISTING `requestedAction` branch that pressed controls already use. A small deterministic
parser, no second intent engine, no new owner.

```
MODEL MAY PROPOSE / HUMAN MAY PROPOSE / DETERMINISTIC KERNEL GOVERNS /
AUTHORISED HUMAN CONFIRMS / CANONICAL OWNER WRITES
```

`readCommand` is a pure function. It reads a command or returns null; it never guesses, and a
sentence ending in a question mark is never a command. Critically it does **not** pass
`requested: true` — a pressed control is a declaration of intent, and a regex is not.

Creation owners are unchanged and unduplicated:

| Thing | Who creates it | How a human starts it |
|---|---|---|
| Focus | `_createPersonalFocus` / the group focus route | Directly — it is a commitment, and saying it is what makes it true |
| Inquiry | the inquiry kernel, via the confirm dispatcher | Directly, as their OWN — one person asking is not the group asking |
| High | nobody — it is a PROJECTION | By contributing an observation with `valence: working_well`, with four others |
| Low | nobody — it is a PROJECTION | The same path, pointing the other way |

A High and a Low are not created by asking. The product now says so, in a coach's words,
rather than failing silently.

### 4. The two STOP-AND-REPORT items

Neither was taken. Both are recorded rather than decided:

- **Whether a single person may declare a group High or Low directly.** That would make one
  person's say-so the group's baseline, which is the failure the founder already ruled on
  ("that's like someone sick saying they're fine"). Not built.
- **Whether a typed instruction should carry the same weight as a pressed control.** It does
  not today, and the flag that would change that is deliberately not set.

---

## Part two — the proof

### 5. Everything is driven, nothing is argued

`npm test` green at `156b81f`. The browser check is 88/88 and lives outside `npm test`,
because the truth layer is hermetic and must run with no browser binary.

New this pass:

| Suite | Count | What it is for |
|---|---|---|
| `composer-creation-http-smoke.js` | 32 | The model may name an action; a title it supplied is `model_suggested` and one the person said is `user_stated`; a QUESTION never becomes a proposal |
| `composer-binding-http-smoke.js` | 20 | WHICH thing it happens to — the load-bearing half |
| `intelligence-continuity-http-smoke.js` | 29 | One understanding, several faces, none contradicting the others |
| `human-origin-http-smoke.js` | 33 | A human may start it, and starting it proves only that they did |
| `pilot-coach-browser-check.js` §K | 8 | The newest path, on a phone, with no model |

### 6. Four assertions were wrong, and the mutations found them

This is the part worth reading. Every one of these PASSED before it was corrected.

- **HO-D1** pinned `independentOrigins` across a repeated explanation — a number that cannot
  move either way, because a hypothesis never joins the observation origin count. It would
  have passed whether or not repetition were handled at all. It now asserts the real owner:
  `applyProposals` matching an existing hypothesis by NORMALISED statement, driven with the
  sentence retyped in different clothes.
- **HO-B2** claimed the direction came from the contributors rather than from their words,
  while asserting only that two inquiries existed. It now asserts the polarities are OPPOSITE.
- **HO-A6** could not tell a kernel band from a headcount: with five contributors, both land
  on `supported`. Section A3 adds the case that separates them — five voices carrying TWO
  origins, three of them relaying what the other two saw.
- **PC-K2** looked for the word "inquiry" in the page text, which the coach's own echoed
  sentence supplies. It passed with the parser stubbed to return null — it was asserting that
  a coach can type. It now reads the rendered approval control.

### 7. The mutations that bite, and the four that did not

Biting, against the production owners:

| Mutation | Takes out |
|---|---|
| A leader's explanation born at `supported` | HO-C2/C4/C5/C6/C9/D2/E3/E5/E6 |
| Removing the hypothesis dedupe | HO-D1 |
| Running a commitment through the epistemic ladder | HO-E2 |
| Crediting a good outcome as support for the explanation | HO-E5/E6 |
| Reading polarity out of the wording | HO-B1/B2 |
| Counting tellings rather than origins | HO-A7 |
| `create_inquiry` with `confirmation: false` | HO-F2 |
| Stubbing `readCommand` to return null | PC-K2/K4 |

No-ops, recorded rather than quietly dropped: diagnose's reported origin SHAPE does not feed
the score; making a person an origin does not close the A8 gap alone; an unestablished report
counting in full is inert where every origin is established; and neutralising independence OR
directness alone leaves A8 standing, because that gap is over-determined — only both together
take it out. The suite says so in the assertion's own comment.

### 8. The fixture was wrong first and the kernel was right

The first run of `human-origin-http-smoke.js` produced no candidates at all. `classifyScope`
refuses group relevance unless the COLLECTIVE LANGUAGE is in the person's own words, and
"training is loud now" has none. That is the law working. The fixture was changed, not the
check.

### 9. Mutation #16 has no target

The attack was "the voice path bypasses confirmation." There is no voice path to bypass it
with. `js/voice.js` makes **zero** network calls: it writes a transcript into the composer's
textarea and nothing else. Voice is dictation, and everything after it is the path a typed
sentence takes — which section F and section K already drive. The attack surface is absent by
construction rather than defended.

---

## Part three — the honest limits

1. **Models were off throughout.** That is the pilot's real state, and it is the right state
   to test in, but it means the model-gated interpretation seam is exercised by a stub in
   `composer-creation-http-smoke.js` rather than by a provider.
2. **The parser is narrow on purpose.** It reads a small set of verbs and four nouns. A coach
   who phrases it differently gets the generic capture, which is safe and unhelpful. Widening
   it is a product decision, not a defect.
3. **A8 is over-determined.** It asserts the product of two laws. A7 pins the origin count on
   its own; there is no assertion that isolates directness.
4. **Nothing here proves the pilot will go well.** It proves the paths do what they say on a
   390px screen with no model reachable. That is a different and much smaller claim.

---

## Freeze

Product capability work is frozen as instructed. What remains is verification, repair of
ordinary defects, and the founder's own decisions on the two items above.
