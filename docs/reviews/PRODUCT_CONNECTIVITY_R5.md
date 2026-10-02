# Product connectivity audit — round 5 report

**STARTING SHA** `fb3ea1c` · **THE WORK** landed at `8af5388` and after · **Not merged.**

---

## 0 · Your question, answered first

> Do not assume the invisible Inquiry was an isolated bug. This pass should establish whether
> IntelliQ has a general "writes truth but cannot find it again" problem or whether that defect was
> specific to Inquiry indexing. I want evidence either way for Focuses, Inquiries, Highs and Lows
> at minimum.

**The defect was specific to Inquiry indexing. There is no general connectivity problem.** Every
other consequential Composer action was already connected, and I can now say that as evidence
rather than as an impression.

But the audit did not come back empty. It found **four real defects of adjacent classes**, and one
of them was in our own test suite — an excuse list that had been hiding a genuine product error
since it was written. That one is the most important thing in this report, because it is the same
failure of method that let the Inquiry defect survive two rounds.

### The evidence, for the four you named

| Kind | Written | On its own surface | Reopens to **itself** | Continues | Outsider refused |
|---|---|---|---|---|---|
| **Focus** | yes | yes, by id | yes | yes — asks and answers about it | 404, and absent from the list |
| **Inquiry** | yes | yes, by id (**after the R4 fix**) | yes | yes | 404, and absent from the list |
| **High** | projection | yes | yes | yes | 404 |
| **Low** | projection | yes | yes | yes | 404 |

And the rest of the vocabulary, audited the same way: Library keeps, Library folders, shared group
objects, Forum posts, material attachments, priority marks, focus updates, un-prioritising, focus
outcomes, and disagreements. **All connected.** Two actions — `settle_inquiry` and
`declare_focus_relation` — deliberately **refuse**, and a refusal is a promise too: both say
truthfully what did not happen and leave the record exactly as it was.

---

## 1 · What the audit found

### 1.1 · The one mutation path could answer nothing at all

Every consequential Composer action executes in a single `async` handler, and **nothing caught a
throw inside it.** An unexpected record shape in any of the eighteen branches became an unhandled
rejection: the response was never written, the person who had just pressed Confirm watched a
spinner until their client gave up, and a partial write may already have landed.

Found by driving `disagree_with_inquiry` against an inquiry whose hypothesis was missing a field
the kernel assumes. The evidence record was created. The reply never came.

It now answers, says plainly that nothing was taken as done, and leaves the proposal **retryable**
rather than marking it confirmed. The throw is still logged with its stack and still captured.

### 1.2 · The kernel assumed a field that persisted data need not carry

`newHypothesis` has always set `supportRefs`, so an inquiry grown in-process always has it. One
**restored from storage**, written before that field existed, does not — and the confidence pass
reached `h.supportRefs.map` and threw. A missing list is now read as an empty list, which is what
an empty list already means everywhere else in that file. No confidence moves; nothing is invented.

An error boundary does not make the underlying bug acceptable, so both halves are fixed.

### 1.3 · A question asked from inside an object dead-ended on the free-text bundle

Your §3, exactly: *"Ask: 'What happened when we tried this?' The outcome must reach the existing
learning/read path."*

Standing in a Focus with a recorded outcome and asking what happened answered **"I don't have
enough authorised evidence to answer that yet"** — about a fact printed on the card in front of
them. This is the **seventh** instance of that dead end; the file's own comments record the other
six. The bound object never travelled to the answering path.

It now describes itself from **the same presenter the card renders from**, so the screen and the
reply cannot disagree. Language-free, like the material branch beside it — it does not match the
question, it replaces the dead end — so it works in any language. And a reported outcome carries
the limitation that it is what somebody observed, **not proof the focus caused it**.

It also names where the Focus came from: *"You started it from the question 'How I react after
conceding'."*

### 1.4 · A CDN dependency that threw on every page load — and the excuse that hid it

`js/charts.js` touched `Chart.defaults` at **module load**. On any connection that could not fetch
Chart.js — a filtered network, an installed app with no signal, this build environment — that
assignment threw, **the whole file stopped evaluating**, every chart helper below it ceased to
exist, and a pilot user got an uncaught error on every page load with an empty box where a chart
should be.

**And the pilot browser check had been suppressing it.**

```js
const HARNESS_ONLY = [/^Chart is not defined$/];
```

It was never a harness artifact. That line is why `PC-F4 nothing on this journey threw in the
browser` stayed green about a journey that really was throwing. **The list is now empty**, and
keeping it empty is the assertion: an error on that journey fails the check, whatever it is.

Charts degrade honestly and say where the picture would have been, because an empty box teaches
somebody the data is missing when it is the library that is.

I want to be direct about this one. You asked whether our tests prove mutation without proving
connectivity. Here they did something worse: **a test named an inconvenient truth a harness
artifact and looked away.** That is the same method failure as the Inquiry, arriving from the
opposite direction.

---

## 2 · The product-promise gate

`scripts/product-promise-http-smoke.js` — **97 assertions**, registered in `npm test`, models off.

It refuses as proof exactly what let the Inquiry defect stay green:

| Not proof | Because |
|---|---|
| a 200 | the Inquiry route returned one, and answered "Inquiry opened" |
| a row in persistence | the inquiry really was in `inquiryStates` the whole time |
| prose on a screen | the person's own echoed sentence contains the word |
| a card rendering | it must render **the same canonical id that was written** |

**Every assertion is about an id or a reader's actual behaviour. None searches response prose for a
word.**

For each consequential action: PROMISE → CANONICAL TRUTH → HUMAN DOOR → REOPEN → CONTINUE, plus
*nothing is written before the confirmation* and *somebody outside the audience finds nothing*.

Two things the gate asserts that are easy to miss:

- **Relationship is not readership.** Attaching a private document to an object does not hand it to
  that object's readers (H8).
- **The loop reads from both ends.** K proves the Focus remembers the question; **N proves the
  question remembers the Focus** — a loop readable from one end only is a loop the person standing
  at the other end cannot see (N1–N3). And the Inquiry does not disappear because a Focus now
  exists, with no duplicate created to hang it off (K5, K6, N4, N5).

### Sixteen mutations, all caught, each verified to have applied

| # | Mutation | Caught by |
|---|---|---|
| Q1 | the Focus list drops focuses created by confirmation | A4, A5, A9 |
| Q2 | the thread door opens onto a different id | A6, A7, C5, C6, D2, D6, F4, K5 |
| Q3 | **the Inquiry door closes again (the round-4 defect, restored)** | C4, C5, C6, C7 |
| Q4 | the outcome is reported against the wrong Focus | B3 |
| Q5 | the Library keep files a copy rather than a reference | E4, E5, E7 |
| Q6 | the shared object is not actually shared | F3 |
| Q7 | object threads stop checking the reader | A10, C9, D2b, F5 |
| Q8 | the Forum post lands in a room nobody named | G3 |
| Q9 | the material is attached to nothing | H6 |
| Q10 | the confirmation stops telling the Focus what it addresses | K2, K3, K4, K7 |
| Q11 | the relationship is written but `/related` drops it | K3 |
| Q12 | `/related` renames the edge, so the card links elsewhere | K3 |
| Q13 | the outcome is on the record but the card stops showing it | B4, B7, B8 |
| Q14 | "Taken off your priorities" leaves the mark | M9 |
| Q15 | a person's call settles an empirical question | M11 |
| Q16 | the loop is readable from the Focus only | N1, N2, N3 |

**Four of my first attempts were bad mutations** — Q8 and Q10 changed an unused variable and
inserted an unreachable no-op, and Q11 and Q12 hit `_crossEvidenceContext` when `/related` uses a
different reader. Each was redone against the real path. A mutation that does not change behaviour
proves nothing, and saying so is cheaper than believing the green.

---

## 3 · The hollow-control audit (your §5)

Walked all nine pilot pages in a real browser at 390px, enumerated every visible consequential
control, and resolved what each one calls **the way an inline handler resolves it** — through the
global lexical environment, not `window`, because `MemberApp` is a top-level `const` and checking
`window[...]` reports the entire product as broken.

```
home 10 · high 8 · low 8 · inquiry 9 · focus 9 · notes 9 · forum 10 · library 10 · settings 10
                                                            all resolve · page errors: 0
```

**No hollow controls.** The only door-without-capability was the chart one in §1.4, and it is fixed.

---

## 4 · Completion accounting

| Item | Status |
|---|---|
| Audit every confirmed object for connectivity | **DONE** — all 18 Composer actions driven end to end |
| Focuses: created, visible, opens to itself, history connected, source relationship, audience, continues, outcome recordable, outsider refused | **DONE** (A1–A10, B1–B8, K1–K7) |
| Focus creation from conversation, Inquiry, High, Low | **DONE** for conversation and Inquiry (A, K). **High/Low as a Focus origin: NOT SEPARATELY ASSERTED** — `create_focus` lists them as contexts and the code path is identical, but no assertion drives it from a High or a Low |
| Focus creation from an accepted suggestion | **DONE** (round 3 acceptance + this gate) |
| Inquiries: visible, opens, same canonical thing, question preserved, no invented confidence, scope obeyed | **DONE** (C1–C9) |
| **The invisible-confirmed-Inquiry defect** | **DONE** in R4; **pinned by Q3** so closing that door again turns the gate red |
| Highs: on their surface, open, origin preserved, not upgraded to proven truth | **DONE** (D1–D2b) |
| Lows: same, and a human-contributed account stays an attributed concern | **DONE** (D3–D7) |
| Evidence: canonical owner, provenance, scope, material relationship, authorised readers only | **DONE** (H1–H8) |
| Evidence after the source is deleted | **DONE** in R4's retention suite (tombstone, 410, history intact) |
| Outcomes: belong to the intended Focus, survive reopen, reach the learning path, not causal proof | **DONE** (B1–B8) |
| Forum: correct object, authorised audience, private conversation not exposed, relationship survives, unauthorised refused, reopens from the Forum surface | **DONE** (F1–F7, G1–G6) |
| Library: real reference not a copy, appears, reopens, retrieval | **DONE** (E1–E9) |
| Materials: upload → availability → retained source → authorised re-read → relationship → promotion → retrieval → deletion | **DONE** across R4 retention + this gate (H1–H8) |
| Relationship does not broaden readership | **DONE** (H8) |
| Writes without a door, across the whole schema | **DONE** — none found beyond the Inquiry; §1.1–§1.3 are the defects found instead |
| Doors without capability | **DONE** — one found (charts), fixed; no hollow controls otherwise |
| Persistence beyond one request | **PARTIAL** — serialisation asserted (L1–L3). **A real restart boundary needs a database this environment does not have**; classified as infrastructure-dependent, as you asked |
| Cross-object identity through the A→B loop | **DONE** (K, N) |
| A product-promise gate | **DONE** — 97 assertions, 16 mutations |
| **"What have we learned?" unbound** | **NOT DONE** — see §5 |
| Server-side Office parsing / vendoring | **BLOCKED BY FOUNDER DECISION** — R4 §6.2, and §1.4 is more evidence for it |
| Source readership (`attach_material` and the object's audience) | **BLOCKED BY FOUNDER DECISION** — R4 §6.1 |

---

## 5 · The one thing I chose not to build

**"What have we learned?" asked from Home still dead-ends.** Bound to an object it now works —
*"On 'How I react after conceding': I don't have a read on this yet. That rests on 5 independent
origins. Still open: does speaking first change it?"* — because the bound fix is language-free and
applies to all four kinds.

Unbound, it would need either a **personal learning read model that does not exist**, or an English
question cue added to `_teamQuestionLens`. I did not add the cue. You warned in round 4 about
exactly that shape, and one more English phrase to reach a summary that has no owner yet would be
the wrong half of the work. **The missing piece is the read model, not the phrase.** It is a clean
next item.

---

## 6 · Verification

```
npm test        290 registered entries, all green                EXIT 0
```

| Browser gate | Result |
|---|---|
| pilot-coach (390px + 430px) | **129 / 0**, with the excuse list **empty** |
| stack | 114 / 0 |
| group-loop | 55 / 0 |
| library | 32 / 0 |
| forum-share | 13 / 0 |

**Nothing weakened.** Tenant isolation, privacy, audience authority, admissibility, provenance,
evidence identity, confidence semantics, Focus and Inquiry identity, Forum directionality and
model-read/kernel-write are as they were at `fb3ea1c`. The changes that touch law-adjacent code
either **tighten** it (the confirm boundary refuses rather than half-completing) or **normalise a
missing field to its own meaning** (an absent `supportRefs` is an empty one).

**No product law invented.** The two decisions still waiting are R4 §6.1 and §6.2, and they remain
yours.
