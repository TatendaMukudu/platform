# Conversational command layer and source retention — round 4 report

**STARTING SHA** `12a20513e696d08e68b2481e71e6284ce596b63e` (fetched; clean, on
`gpt/ab-decision-spine-r1`) · **THE WORK** landed at `21fd308` and after · **Not merged.**

---

## 0 · Your regex warning, answered with evidence rather than a promise

You wrote:

> The biggest thing I'd watch in Claude's next report is whether `readCommand` turns into a giant
> pile of English regexes. That would recreate the exact language problem we just fixed at the
> intent layer.

**`readCommand` was not grown. Not one verb was added.** Its vocabulary is still *create focus /
create inquiry / high / low* and nothing else, and `conversational-commands-http-smoke` H1–H4 now
pin that size, so growing it has to be a deliberate act somebody sees in a diff.

What I did instead was trace what the four "conversational X" items in round 3 were actually
blocked on. **The answer was not the vocabulary.** The architecture you describe — the model
understands, deterministic code validates, proposes, confirms and executes — already *is* the
production path, and I proved it rather than asserting it:

```
composerActions.prompt(text, context)   the model gets the BOUNDED action list this context
                                        supports, from available(context)
ai.completeJSON(...)                    the model reads arbitrary language, any language, and
                                        picks a NAME from that list
composerActions.normalize(...)          deterministic: an action not on the list is dropped
composerActions.ground(...)             deterministic: refuses, resolves referents, or asks
POST /turn/:turnId/confirm              the one mutation path, authority re-checked
```

`scripts/conversational-commands-http-smoke.js` stubs **only the provider boundary** and asserts
everything on both sides of it — the same technique `reading-scope-smoke` uses for web search.

- **A1–A3** read the real prompt that would have crossed the wire and assert the model is handed
  `record_focus_outcome`, `discuss_with_group`, `keep_in_library`, `attach_material`,
  `share_to_forum`, `create_inquiry`, `request_research` — and is **not** handed an action this
  context cannot support.
- **B1–B3** do the same for a Shona sentence, with **no Shona pattern anywhere in the repo**.
- **C1–C3** assert what comes back is validated, not obeyed: an invented action is dropped, a real
  action in the wrong context is dropped, and a model dressing a `create_focus` as `shared` does
  **not** widen who can read somebody's Focus.

So "use this as evidence", "ask the team" and "we tried it today" are understood in any language by
the path you want, and the reason they produced nothing was something else entirely.

---

## 1 · What was actually broken: referent binding

Your words: *"The important problem is referent binding. 'This' might mean the attachment in the
current turn, the most recent attachment, a currently discussed observation… Do not guess if
several consequential referents are plausible."*

`attach_material` bound its material argument **only to `context.attachment`** — the file uploaded
in that same turn. A person who attached a report, talked about it for three messages and then said
"use that as evidence" named something the grounding layer could not see. The required argument
stayed empty, the action was dropped, and **nothing was said**. The capability had existed the whole
time and could not be addressed.

The referent pool is now the server's: materials on the bound object or this conversation **that
this reader may actually read**. The rule is exactly the one you stated:

| Situation | Behaviour | Proved by |
|---|---|---|
| exactly one safe referent | resolves | E2 |
| the model named one, and it is in the pool | resolves to that one | E2b |
| **two plausible documents** | **asks, by name** | E7b, E7c |
| they named the file | resolves to the named one, not the other | E7d, E7e |
| an id that is not in the pool | **asks — never substitutes another document** | E4, E4b |
| another person's real material id | nothing, same as a fictional one | E6 |
| …on a Focus they are **both** in, where the pool does look | still nothing — a private material is its owner's | E6b–E6e |

Steps 1 and 3 read no words at all, so a Shona or Ndebele sentence the model understood resolves
exactly as an English one does. The one word-reading step matches a **document's own title**, which
is whatever the person called their file — not a vocabulary this repo ships.

---

## 2 · Three things found underneath it, by driving the journey

### The confirmation could not execute

The executor called `_materialFor` in its `requireObject` form, which asks a **third** question —
*does this document already hang on an object I can see* — and the answer for every composer upload
is no, because it hangs on a conversation. **Confirming answered 404 for the one journey the action
exists to serve.** E3c–E3d now drive the whole thing: upload in a chat, bind to a Focus, say "use
this as evidence", confirm, and assert the Focus really holds it.

### It never asked who may attach

`POST /api/materials` has enforced `_mayAttach` since it was written — material on a group object
reaches everybody in that group, so only somebody who **leads** it may attach. Reaching the same
write through a confirmation did not ask at all, which made the composer a second door around the
rule. **Being able to open an object has never been permission to put things on it.** E8 asserts a
member is still *offered* the action (offering is not doing), is refused at the confirmation, that
nothing reached the group object, and that the leader may do the same thing.

### Two documents were both called "Attached material"

The composer door ignored the filename it was handed, while the sibling route two hundred lines
away already did `title || filename || default`. With one file nobody noticed. With two, the
question that asks which one you mean read *"Attached material or Attached material"*, and the
Library listed the same words twice. Found because the disambiguation E7c asked for was useless.

---

## 3 · Source media retention — your decision, implemented

Four properties, each as code rather than as a sentence in a doc.
`scripts/source-retention-http-smoke.js`, **41 assertions.**

**THE AUDIENCE IS INHERITED, NOT DECLARED.** The read route asks `_materialFor` and asks *nothing
else*. That is your rule expressed as an absence: a source has no audience of its own, so there is
no second permission model to drift out of step with the first. Section D proves it with the **same
bytes kept twice**, readable by different people. Section C proves *"a media URL or identifier must
never become an authorization bypass"* — the real id gets another member, the group's leader,
another organisation and an unauthenticated caller exactly nothing (C1–C5).

**RETAINING IS NOT ADMITTING.** No belief moves, the receipt still states the epistemic effect as
none, and the material row still holds no bytes — the context builder hands a model the reading,
never the picture (E1–E3, and `photo-boundary` PH-B6, PH-B7b).

**DELETION REMOVES BYTES AND DOES NOT REWRITE HISTORY.** Only the person who attached it may delete.
The bytes really leave the store. Opening it afterwards answers **410 Gone, not 404** — 404 would
say it never existed and quietly rewrite the history the deletion was not allowed to touch. The
material, its parts, its place on the object and every list that shows it carry **"Source attachment
deleted"** (F1–F11).

**NO DURATION IS INVENTED.** There is no TTL field and no sweeper, and A6 asserts nothing added one.

Section G is the case that would quietly undo all of it: materials deduplicate by checksum, so
re-sending the same picture lands on the same material and **must not** resurrect bytes their owner
deliberately removed.

It reaches a screen. The material view offers the original, offers its owner the deletion, and
renders the tombstone where it was.

### The honest asymmetry, and a question for you

An **image** is the only attachment the server receives as bytes. A document is parsed in the
browser and arrives as text, so there is nothing to keep — and the material says `never_held`
rather than leaving the field empty, because *"there was never one"* and *"somebody deleted it"* are
different facts.

That has a consequence worth your decision: **the only door that retains a source is the composer
door, and the composer door is private by design** (your own law — talking to IntelliQ is not
contributing to the organisation). So every retained source today is a private one. Section D
exercises the shared half against a seeded `visibility: 'object'` material, which drives the real
route and the real authority owner, and the seeding is marked in the file as standing in for an
upload path that does not exist.

**The founder question is in §6.**

---

## 4 · The picker offered formats whose reader had not loaded

Word, PowerPoint and spreadsheets are read in the browser by **JSZip** and **SheetJS**, two CDN
script tags. The list of what the picker advertises was hard-coded and assumed they were there.

They are not always there — a filtered network, an installed PWA with no signal, a stadium. The
picker offered `.docx` anyway and `_processDocx` threw **`JSZip is not defined`** at somebody who had
just chosen a file.

What is offered is now derived from what actually loaded, and a file that gets there anyway (a drag,
a share sheet, a cached page) is refused with a sentence naming what is missing and what still
works. Nothing narrows when the libraries are present.

**And then it found something.** `library-browser-check` B7c had asserted the literal set
`.pptx .docx .xlsx .csv` and passed every time — it was reading an attribute, not a capability. The
moment the attribute became honest, B7c went red, and measuring showed why: **the CDN is unreachable
from the browser in this environment** (`net::ERR_TUNNEL_CONNECTION_FAILED`). Those three formats
have *never once* been readable in any browser check this engagement has run, while the assertion
said they were on offer.

B7c now asserts the invariant — **offered is exactly readable** — which holds with the libraries
cached and without them, and the reader state is printed so a future reader can tell a regression
from a box with no internet.

---

## 5 · A confirmed inquiry was invisible on every surface

Typing *"create an inquiry into why substitutes feel disconnected"* on a phone, then **"yeah"**,
produced a real record and the answer *"Inquiry opened as an unsettled question."*

It then appeared on **no screen, at any scope** — not `self`, not `all`, not the group, not Home.

`_objectBucket` skips an inquiry with no signals. That is right for one the machine derived; an
empty shell is noise. It could not tell that apart from a question a person had just asked and
confirmed, which is the ordinary state of a brand-new inquiry. **So the confirmation was telling the
truth about a write nobody could see.**

The distinction is recorded rather than guessed: `openedBy` is set only by the governed confirmation
path, and it is the only thing that changes. The inquiry stays unsettled, carries no confidence and
invents no answer — its card reads *"I don't have a read on this yet."* C3c/C3d are the control in
the other direction: an empty inquiry nobody opened is **still** not on their screen.

**Round 3's C2 stopped at a 200 and missed this for two rounds.** That is my error, and the reason
it surfaced now is that the pass drove the coach's phone instead of reading the handler.

---

## 6 · Founder decisions I did not take

Two, both flagged rather than acted on, under your standing *"if a finding materially changes
ontology, privacy law, epistemic law or fundamental web semantics, do not fix it."*

### 6.1 · Does confirming `attach_material` change who can read the document?

A composer upload is `visibility: 'private'` — yours: *talking to IntelliQ is not contributing to the
organisation*. `attach_material` adds a **reference** from that private material to an object, and
the confirmation says *"Attached by reference."* It does **not** change visibility.

So today: a coach photographs the tactics board while talking about the squad Focus, says "use this
as evidence", confirms — and **nobody else on that Focus can open it.** The word "attach" promises
something the audience model does not deliver.

Three readings, and the choice is yours:

1. **The confirmation IS the deliberate act**, so confirming should promote the material to the
   object's audience. Most useful; it is a privacy-law change and I will not make it unasked.
2. **It is correct as it stands** — a private conversation stays private, and contributing a
   document to a group is `POST /api/materials`, a different, explicit door. Then the *word* should
   change: the card should say it is being kept against this Focus for you, not "attached".
3. **Offer the audience on the confirmation card**, the way `share_to_forum` previews its room.

### 6.2 · Vendor JSZip and SheetJS, or drop the formats?

§4 made the product honest about this; it did not make it work. On a network without that CDN —
which includes this build environment and plausibly a stadium — .docx, .pptx and .xlsx are simply
not available. The durable answers are: **vendor the libraries locally** (roughly a megabyte of
third-party minified code committed to the repo — a supply-chain decision that is yours, not mine),
**parse server-side**, or **accept plain text and CSV only** for the pilot. I did none of them.

---

## 7 · Completion accounting, in your four classes

| Item | Status |
|---|---|
| Conversational evidence promotion — "use this as evidence" | **DONE** — referent binding, ambiguity, authority, and the governed write (E1–E8f) |
| Conversational Forum entry — "ask the team" | **DONE** — reaches `discuss_with_group`, carries the person's own words, refuses a group they are not in (F1–F2) |
| Conversational outcome recording — "we tried it and it helped" | **DONE** — and the outcome word stays the **person's**: a model proposing "helped" about a sentence that does not say it records nothing and asks in the vocabulary that Focus's own screen offers (G1–G4) |
| Conversational Library keep/retrieval | **DONE** for keep (B3, via the model path with a Shona sentence). **Retrieval by talking: NOT DONE** — no action in the vocabulary returns a list |
| Referent binding, "do not guess" | **DONE** (E4, E6, E7) |
| Understanding stays with the model, execution stays deterministic | **DONE** — `readCommand` unchanged and pinned (H1–H4); the whole chain proved with the provider stubbed |
| Source media retention law | **DONE** for what the server receives (images). **Documents: NOT APPLICABLE** — the server never holds the original, stated as `never_held` |
| Authorized re-read, inherited audience, tombstone, no duration | **DONE** (41 assertions, 8 mutations) |
| Hollow DOCX/XLSX/PPTX CDN dependency | **HONEST, NOT FIXED** — the product no longer advertises what it cannot read; whether the capability should exist offline is **§6.2, a founder decision** |
| Inquiry visible after conversational creation | **DONE** — and it was broken (§5) |
| High/Low/Inquiry → Focus by talking | **DONE** (round 3 C, D; re-verified) |
| Full A→B journey | **DONE** (pre-existing `ab-loop-closure`, green) |
| Founder-style mobile acceptance walkthrough | **DONE** — PC-K3b–K3e drive "yeah" at 390px through the rendered client, assert the write goes through the **one** confirmation route, and assert the object exists afterwards |
| Sourced external suggestions end-to-end | **PROVIDER VERIFICATION REQUIRED** — transport and citations proven in round 2; the conversational shape is unbuilt |
| Attachment + authorised-memory **reasoning** | **PROVIDER VERIFICATION REQUIRED** — context assembly proven; the reasoning needs a live model |
| `attach_material` and the object's audience | **BLOCKED BY FOUNDER DECISION** — §6.1 |
| Offline Office parsing | **BLOCKED BY FOUNDER DECISION** — §6.2 |

---

## 8 · Verification

```
npm test            289 registered entries, all green, 7105 assertions      EXIT 0
```

| Browser gate | Result |
|---|---|
| pilot-coach (390px + 430px) | **129 / 0** |
| stack | 114 / 0 |
| group-loop | 55 / 0 |
| library | **32 / 0** |
| forum-share | 13 / 0 |

### Fifteen mutations, all caught, each verified to have applied

| # | Mutation | Caught by |
|---|---|---|
| M1 | the referent pool reverts to this turn's attachment only | E2, E2b, E2c, E3 |
| M2 | with two plausible documents, guess the most recent | E7b, E7c |
| M3 | an unresolvable id falls through to whatever is lying around | E4, E4b |
| M4 | the pool skips the readability check | E6d, E6e |
| M5 | the executor demands the document already hang on an object | E3c, E3d, E8d, E8f |
| M6 | the confirmation stops asking who may attach | E8d, E8e |
| M7 | the upload goes back to ignoring the filename | E2c, E7c, E7d, E7e |
| M8 | the card names the file only when it is this turn's upload | E2b, E2c, E7e |
| N1 | the source read stops asking who may read the material | C1, C2, C3, D3, D5 |
| N2 | a deleted source answers 404 | F4, G3 |
| N3 | deletion also erases the material's record of it | F4, F5, F8, F10, G2, G3 |
| N4 | anybody who can read it can delete the original | F1, F1b |
| N5 | a resend restores bytes the owner deleted | G2, G3 |
| N6 | an expiry is added to the retained source | A6 |
| N7 | the original is served from a shared cache | B4 |
| N8 | the bytes are not actually removed on delete | F3 |
| O1–O4 | the picker goes back to a hard-coded list; the reader check always says yes | N2, N2b, N3b, N4, N4b |
| P1–P3 | the bucket hides an opened inquiry / stops recording who opened it / shows every empty one | C3, C3c |

### Two of my own assertions were vacuous and were found by mutation

- **M4 survived on its first run.** The readability filter in the referent pool was never exercised,
  because no case put another person's material where the pool looks. E6b–E6e now do: a document of
  hers on a Focus **they are both in**. M4 then failed.
- **P3 survived on its first run.** Nothing asserted that a *derived* empty inquiry stays hidden, so
  widening the filter all the way back open passed everything. C3c/C3d are the control, and C3d
  asserts the row is really in the store so C3c is testing a filter rather than an absence.
- **N4 in `material-accept` passed for the wrong reason** — the harness restored the globals while
  the async processor was still suspended, so the error it caught was not the one a coach saw. The
  swap is now awaited before it is undone.

**Nothing weakened.** Tenant isolation, privacy, audience authority, admissibility, provenance,
evidence identity, confidence semantics, Focus and Inquiry identity, Forum directionality and
model-read/kernel-write are as they were at `12a2051`. Two changes **tightened** authority
(`_mayAttach` at the confirmation; `_materialFor` on the source read).

**No product law invented.** The two places where one would have to be are §6.1 and §6.2, and they
are yours.
