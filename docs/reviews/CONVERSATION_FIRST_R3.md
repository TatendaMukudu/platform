# Conversation-first correction — round 3 report

**STARTING SHA** `544582795f04837330d620d52e4eb3eed96b159b` (fetched; clean, no divergence, on
`gpt/ab-decision-spine-r1`) · **THE WORK** landed at `f8b1b8a` · **Not merged.**

## 0 · What this pass did, and what it did not

You gave me the source-media retention decision and said not to spend the whole pass on it. **I
spent none of it on retention.** The pass went entirely to the conversational half, because one
missing piece turned out to be blocking almost all of it at once. Retention is implemented **not at
all** and is the first thing the next pass should take.

That is a prioritisation I made; it is stated here rather than buried in §6.

---

## 1 · One sentence was blocking everything

The previous two reports listed conversational Focus creation, referential acceptance, High→Focus,
Low→Inquiry, Inquiry→Focus, outcomes, evidence promotion, Forum entry and Library retrieval as
separate unfinished items. **They were not separate.** Tracing `ai/composer-actions.js` first, as
instructed, found that every canonical owner already exists:

| Action | Contexts it already accepts |
|---|---|
| `create_focus` | inquiry, high, low, focus, conversation, **and none** |
| `create_inquiry` | conversation, focus, high, low, none |
| `record_focus_outcome` | focus |
| `attach_material` | inquiry, high, low, focus |
| `keep_in_library` | inquiry, high, low, focus, conversation, material |
| `discuss_with_group`, `share_to_forum` | the Forum path |
| `request_research` | inquiry, high, low, focus |

And `readCommand` already turned *"create a focus about X"* into a governed proposal,
deterministically, with no model.

**What did not exist was the shortest sentence in the language.** A consequential action is
proposed and then confirmed, and confirming meant pressing a button carrying the proposal's id.
*"Yeah"* names no id. So a person who read the card and said yes **in words** fell through to be
answered as if they had made a new remark, and the thing they had just agreed to never happened.

One missing sentence, and every journey above was unreachable by talking.

---

## 2 · What was built

`readAcceptance` and `resolveAcceptance` in `ai/composer-actions.js` — pure, deterministic, no
model — plus resolution in `_assistantTurn` and one client branch.

**Nothing new executes anything.** Resolution says *which* proposal was meant. The confirmation
still goes through `POST /api/assistant/turn/:turnId/confirm`: the same single mutation path, the
same frozen payload, the same re-checked authority. A second way to execute an action would be the
dangerous version of this, and there is not one — **G1–G3 assert exactly that**: saying yes writes
nothing until the confirmation goes through that route.

### The half that makes it safe

| Situation | Behaviour |
|---|---|
| one proposal + "yeah" | resolves |
| **two proposals + "yeah"** | **asks which — does not guess** |
| "the second one" | resolves to the second |
| **"the fourth one" of two** | **asks — does not clamp to the nearest** |
| "yes, I was worried about that and we go quiet after conceding" | **not a confirmation** — it is talking |
| "yes?" | **not a confirmation** — a question is never an answer |
| "not now" | declines, rather than falling through to be answered |
| "yeah" after an unrelated turn | **does not reach back** for an older offer |

The message must be the acceptance end to end, and under 40 characters. "yes" inside a sentence is
a person talking.

---

## 3 · The journeys this makes reachable, proved

`scripts/conversational-journey-http-smoke.js` — **29 assertions**, registered in `npm test`,
models off throughout.

- **Conversational Focus creation** — an ordinary sentence produces a proposal, nothing is written,
  "yeah" resolves it, confirming reaches the governed owner, the Focus exists and carries the
  person's own words (A1–A6).
- **Low → Inquiry** — "create an inquiry about why we go quiet", then "do that" (C1–C2).
- **Inside an object → Focus** — the same words from inside a Focus context reach the same owner
  and create **one more** Focus, not a duplicate of the one being stood in (D1–D3).
- **Governed gates intact** — a proposal executes at most once (409), and another person cannot
  confirm it with the id alone (404). An id is not an authorisation (F1–F3).

---

## 4 · Completion accounting

| Item | Status |
|---|---|
| Referential acceptance ("yeah", "do that", "the first one", ordinals, decline) | **DONE** |
| Conversational Focus creation | **DONE** |
| Low → Inquiry, Inquiry/High/Low → Focus by talking | **DONE** for the create path |
| Governed confirmation preserved, no second mutation path | **DONE** |
| Universal multilingual ownership (round 2) | **DONE**, preserved |
| Attachment receipt removed (round 2) | **DONE**, preserved |
| External research exists, sources attached (round 2) | **DONE** (audit), preserved |
| **Source media retention** (your decision) | **NOT DONE** — §0. Nothing was implemented. |
| Conversational outcome recording | **NOT DONE** — `record_focus_outcome` exists and is now reachable by the same pattern, but no assertion drives it |
| Conversational evidence promotion ("use this as evidence") | **NOT DONE** — not in `readCommand`'s vocabulary, so it produces no proposal to accept |
| Conversational Forum entry ("ask the team") | **NOT DONE** — `discuss_with_group` exists; no phrase maps to it |
| Conversational Library retrieval | **NOT DONE** |
| Sourced external suggestions end-to-end | **PROVIDER VERIFICATION REQUIRED** — transport and citations proven in round 2; the conversational shape is unbuilt |
| Attachment + authorized-memory reasoning | **PROVIDER VERIFICATION REQUIRED** for the reasoning; the context assembly was proven in an earlier pass |
| Hollow DOCX/XLSX/PPTX CDN dependency | **NOT DONE** — audited in round 2, unfixed |
| PDF honesty | **DONE** (audit) — it is not offered and produces no text; correctly classified unsupported |
| Full A→B journey, mobile acceptance walkthrough | **NOT DONE** |

**The concrete technical reason for the four "conversational X" NOT DONEs is the same and is
small:** `readCommand`'s vocabulary covers *create focus / create inquiry / high / low* only.
"Use this as evidence", "ask the team", "we tried it and it worked" and "find that PowerPoint" map
to no deterministic reading, so no proposal is offered, so there is nothing for acceptance to
resolve. Extending that vocabulary is the same shape of work as this pass and is now unblocked by
it.

---

## 5 · Verification

```
npm test        285 suites, 285 green, 0 failed        EXIT 0
```

| Browser gate | Result |
|---|---|
| pilot-coach (390px + 430px) | 125 / 0 |
| stack | 114 / 0 |
| group-loop | 55 / 0 |
| library | 30 / 0 |
| forum-share | 13 / 0 |

**Five mutations, all caught**, each verified to have applied:

| Mutation | Caught by |
|---|---|
| a bare yes against several proposals guesses the first | B1, B2 |
| an out-of-range ordinal clamps instead of asking | B4 |
| the whole-message anchor is dropped, so "yes" inside a sentence confirms | B5, C2 |
| acceptance reaches back past the last turn | **E2 — after section E was repaired** |
| saying yes executes directly instead of only resolving | A4, A5, A6, C2 |

### A vacuous section, found by mutation

**Section E proved nothing on its first write.** Its intervening sentence — *"Actually let me think
about the left side for a minute"* — produced its own `capture` proposal, so the most recent turn
had something pending either way and the reach-back mutation stayed green. It uses a plain question
now, which offers nothing, and **E1b asserts that the intervening turn is empty** so the section
cannot silently stop testing the reach-back again.

**Nothing weakened.** Tenant isolation, privacy, audience authority, admissibility, provenance,
evidence identity, confidence semantics, Focus and Inquiry identity, Forum directionality and
model-read/kernel-write are as they were at `5445827`.

**No product law invented.**
