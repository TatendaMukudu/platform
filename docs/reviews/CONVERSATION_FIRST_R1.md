# Conversation-first correction — round 1 report

**STARTING SHA** `b6dfaaa5c18cabd10687366305b961847500d3e1` (fetched from the remote and pinned;
matched the frozen family-test candidate) · **ENDING SHA** _(filled at the end)_
**Branch** `gpt/ab-decision-spine-r1` · **Not merged.**

## 0 · Scope — read this first

**This pass did not complete the brief.** The brief names roughly twenty areas; four landed, and
the one the founder led with is the largest of them. §6 lists what was not attempted, with the
reason for each. Nothing below is claimed as finished that is not.

What landed: **language continuity** (the named priority), the **Composer invitations**, the
**attachment receipt**, and the **Focus heading**. All four were concrete, specified, and
verifiable without a model provider.

---

## 1 · Language continuity — the named priority

### What was actually broken

Measured at `b6dfaaa`, before anything was changed:

```
detect('Ndinofunga kuti tinonyarara kana tabayiwa zvibodzwa')  →  null
detect('Ngicabanga ukuthi siyathula nxa sesifakwe igoli')       →  null
```

**Shona and Ndebele did not exist in this product.** Both are Latin-script, so the script table
cannot see them, and with no entry in the function-word table `detect` returned null — no
language, therefore no directive, therefore an English reply to somebody writing Shona, on every
turn, with nothing in the system noticing it had ignored them. The pilot is in Zimbabwe.

A second, separate defect: the directive read **"do not switch language part-way through"**,
without qualification. That instructed the model to do the opposite of the founder's law. A person
who moves from English to Shona has changed language, not made a mistake.

### What changed

| | |
|---|---|
| `ai/language.js` `STOPWORDS` | `sn` and `nd` added, 40 function words each |
| `ai/language.js` `NAMES` | Shona, Ndebele |
| `ai/language.js` `directive()` | anti-drift scoped to **one reply**; a conversation-level switch is followed; mixing is mirrored rather than forced |

The word lists are chosen **to separate**, which is the founder's explicit warning about closely
related languages. Shona is Shona-group and Ndebele is Nguni, so their function words diverge
sharply even where speakers share vocabulary — `kuti` against `ukuthi`, which never collide under
whole-word matching. Words occurring in both are in **neither** list: a word that scores for both
separates nothing.

**Mixing needed no code.** A mixed sentence scores as a *lean* rather than a confident reading,
`_noteLanguage` declines to record it, and what they were already writing in stands. That
behaviour was already correct; it had simply never been asserted.

### The test matrix

`scripts/language-journey-http-smoke.js` — **41 assertions**, registered in `npm test`.

| The brief asked | Result |
|---|---|
| English / Shona / Ndebele throughout | A1–A4, A8–A9 |
| Not confusing the two | A5–A7, plus **A7b** (the lists share no word at all) and **A7c/A7d** (three distinct sentences each) |
| English → Shona, Shona → English, English → Ndebele | B1–B6 |
| Mixed-language utterances | C1–C5 |
| Attachment, then a non-English turn | D:attachment |
| Focus creation entirely in Shona | D2, D:focus creation |
| Retrieval, audience change, confirmation | D:retrieval, D:audience change, D:confirmation |
| Provider failure and recovery | **E1–E4** |
| One object is one object across languages | F1, F1pre, F2 |
| The English-only note names the right language | G1–G4 |

**What this cannot prove, stated plainly.** Models are off — that is the pilot's real state — so
the suite asserts **the directive that would reach the model** at each boundary, not the prose a
model writes. "Reply in Shona" arriving at every step is the half this codebase owns. That a model
then obeys it is the model's half and is **not tested here**, and no run in this environment can
test it.

---

## 2 · The Composer invitations

One line served every page. The shell composer was hard-wired to Home's words, and because the bar
is deliberately *not* rebuilt on navigation — which is what protects a half-typed sentence — the
placeholder was whatever the first page to render it had asked for. Measured at 390px: Highs,
Lows, Inquiries, Focuses and Library **all read "What's on your mind?"**.

| Page | Now reads |
|---|---|
| Home | What's on your mind? |
| Highs / Lows | Tell me what you've noticed… |
| Inquiries | What are you wondering about? |
| Focuses | What do you want to work on? |
| Library | Ask about what you've kept… |
| Inside any object | Talk to IntelliQ about this… |

Highs and Lows deliberately share one line: noticing something good and noticing something wrong
are the same act. Inside an object there is one line for all four kinds, because the law is one
intelligence in several human-facing forms.

**"What do you want to know?" is gone.** It was the prompt shown *after an attachment* — the exact
moment the product should look least like a search box.

**Two owners, one answer.** A second `_placeholderFor` stood further down the file, and because a
later key wins in an object literal it was the one that ran — so an object thread would have been
handed the bucket page's invitation the moment those keys changed meaning. Removed.

Pinned by **PC-U1–U5**, including the cost of getting it wrong: retargeting must not rebuild the
bar, or an unfinished sentence is thrown away.

---

## 3 · The attachment receipt

It read, from the founder's phone:

> Read 10 parts from IMG_1918.png. It is context for this conversation, not evidence about you or
> your organisation.

Both halves were wrong. **"Read 10 parts" is the parser talking** — how a file was segmented is
machinery, and attaching is meant to be another way of speaking. And **"not evidence" had become
false as a flat claim**: it is not evidence *yet*, the governed route for "use this as evidence"
exists, and a sentence that forecloses something the product supports teaches people not to ask.

It now says `I can see <name>.`

**The law is untouched and was not weakened by removing a sentence about it.** Material still never
reaches `applyProposals`. `material-accept-smoke` **M9** pinned the removed sentence verbatim and
went red; it was rewritten rather than deleted, because it asserted *a sentence* where the law is a
*behaviour*. It now fails if the client contributes, proposes or posts evidence on the person's
behalf — verified by making it do so — which a string match on a card could never have caught.

---

## 4 · The Focus heading

A Focus card used the **entire raw paragraph** as its title, so on a phone the heading was the
paragraph.

`present.focusLead` takes a **lead, never a summary**. Turning *"I think I'm doing well
communicating, but I want to get much better at organizing everyone when we're under pressure"*
into *"Communicate better under pressure"* is a language task, and language is the model's half.
Deterministic code attempting it would be inventing a claim about what somebody meant — and models
are off for the pilot, which is exactly when a fabricated heading would do the most damage.

Every word in the heading is a word the person wrote, in the order they wrote it. `full` carries
their text untouched; `leadIsWhole` says whether anything was left out, and the thread shows their
own words underneath only when it was.

```
"Speak first on the bus home"                    → whole, unchanged
"I think I'm doing well communicating, but…"     → "I think I'm doing well communicating"
"Communicate better under pressure. I keep…"     → "Communicate better under pressure"
```

Taking the *first* clause boundary turned "Stay involved and help organise the team during
difficult moments…" into **"Stay involved"** — a fragment. It takes the last boundary that fits.

---

## 5 · Verification

```
npm test        284 suites, 284 green, 0 failed        EXIT 0
```

| Browser gate | Result |
|---|---|
| pilot-coach (390px + 430px) | **125 / 0** |
| stack | 114 / 0 |
| group-loop | 55 / 0 |
| settings-tiers | 45 / 0 |
| priority-surface | 39 / 0 |
| onboard | 34 / 0 |
| library | 30 / 0 |
| voice-output | 19 / 0 |
| forum-share | 13 / 0 |

**Mutations — twelve, all caught**, each substitution verified to have actually applied first:

| Mutation | Caught by |
|---|---|
| Shona removed from the detector (the `b6dfaaa` state) | 17 assertions |
| Ndebele given a Shona function word | **A7b** |
| the directive stops naming the language | 10 assertions |
| the anti-drift clause dropped | LC-C2, LC-C2b |
| the mixed-language clause dropped | C5, LC-C2c |
| a non-confident reading may overwrite the stored language | C2, C3, C5 |
| every room reverts to one shared invitation | PC-U1, U2, U5 |
| the placeholder stops following the page | PC-U1, U2, U5 |
| a room goes back to asking what you want to KNOW | PC-U1, U3, U5 |
| the client contributes on upload | **M9** |
| the Private/Public toggle reinstated | PC-T1, PC-T3 |
| the object audience control hidden | PC-T5, PC-T6 |

### Assertions found vacuous this pass

- **LC-C2** claimed the directive "tells it not to switch part-way through" and kept passing after
  the law was inverted, because the new text still contains "do not switch back to English". A
  pattern that survives the change that falsified its sentence is PROTOCOL lie #1. Split into
  three, in the words that carry them.
- **A7/A7b** — the sn/nd discrimination rested on two sentences, and moving a Shona word into the
  Ndebele list left everything green. Replaced with list-disjointness plus three sentences each.
- **F1** compared two empty arrays: `/api/objects` requires a `kind` and 400s without one. **F1pre**
  exists so it cannot happen quietly again. The same omission was repaired in
  `composer-privacy-law-http-smoke`, which was searching three leader surfaces while claiming four.
- **PC-S3** asserted the *old* law ("the same words everywhere"). Rewritten to the part that was
  always the point rather than deleted.

---

## 6 · What was NOT done, and why

None of this was attempted. It is not blocked by anything discovered here; it is simply not done.

| Area | Why not |
|---|---|
| **Conversational Focus creation** — IntelliQ reasoning about the request, proposing a narrowing, accepting "Agreed" | Needs a live model to be meaningful. Every path in this environment runs models-off, so the reasoning half could be built but never demonstrated. |
| **Suggestions with external sources / web / YouTube** | Not audited and not built. The brief is right that existing suggestion code proves nothing; that audit is a pass of its own, and building sourced external retrieval is a larger one. |
| **Referential conversation** — "yeah", "the first one", "not that one" | A binding suite from an earlier pass covers part of this; it was **not** re-audited against the new conversational surface. |
| **Library conversational retrieval and the over-explaining copy** | Untouched. |
| **High/Low/Inquiry → Focus conversational transitions** | Untouched. |
| **Forum routing from conversation** | Untouched. |
| **The full A→B conversational journey, and the acceptance walkthrough** | Requires all of the above plus a provider. |
| **Media / evidence / Library retention audit** | The brief says audit rather than invent, and it was not audited. No retention policy was invented. |

**Nothing was weakened** to get here: tenant isolation, privacy, audience authority, admissibility,
provenance, evidence identity, confidence semantics, Focus and Inquiry identity, Forum
directionality and model-read/kernel-write are all as they were at `b6dfaaa`.

**No product law was invented.** The one law-shaped decision in this pass — that a deterministic
heading may take a lead but must never fabricate a summary — follows directly from the existing
founder law that language is the model's half.

---

## 7 · Verdict

Language continuity is done and proved as far as a models-off environment can prove it: Shona and
Ndebele exist, are told apart, survive every boundary in the loop, and survive a provider dropping
and returning. That was the founder's named priority and it was a genuine hard failure — the two
languages of the pilot's own country could not be detected at all.

The three surface corrections are done and pinned on rendered screens.

**The conversational-intelligence half of the brief is not started.** It is the larger half, most
of it needs a live provider to be worth anything, and reporting it as anything other than
untouched would be the kind of claim this repository exists to prevent.
