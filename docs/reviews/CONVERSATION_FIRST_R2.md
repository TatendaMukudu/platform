# Conversation-first correction — round 2 report

**STARTING SHA** `e4d647ab645066ff15b7501622c13c4b98b75dd4` (fetched; clean tree, no divergence,
on `gpt/ab-decision-spine-r1`) · **THE WORK** landed at `390a1ea`; this report follows it · **Not merged.**

## 0 · Completion accounting

Every item the round-1 report left open, classified as instructed. **"Models are off" is not used
as a reason anywhere below.**

| Item | Status | Where it stands |
|---|---|---|
| Multilingual architecture is general, not an allowlist | **DONE** | §1 — measured, fixed, mutation-tested |
| Attachment stops filing a receipt | **DONE** | §2 |
| External research exists in production, with sources | **DONE — and my last report was wrong** | §3 |
| Which attachment types actually reach reasoning | **DONE (audit)** | §4 |
| What happens to original media | **BLOCKED BY A DECISION THAT IS YOURS** | §5 |
| Suggestions end-to-end (candidate → accept → Focus) | **PROVIDER VERIFICATION REQUIRED** | §3, §6 |
| Conversational Focus creation | **NOT DONE** | §6 |
| Referential conversation ("yeah", "the first one") | **NOT DONE** (existing machinery traced, not re-proved) | §6 |
| Library conversational retrieval | **NOT DONE** | §6 |
| High/Low/Inquiry → Focus transitions | **NOT DONE** | §6 |
| Forum entered conversationally | **NOT DONE** | §6 |
| Full A→B conversational journey | **NOT DONE** | §6 |
| Founder-style mobile acceptance journey | **NOT DONE** | §6 |

---

## 1 · Multilingual: an architecture, not a list

You were right, and the measurement is unambiguous. **With the Shona and Ndebele lists in place**,
at `e4d647a`:

| Language | Directive emitted |
|---|---|
| Swahili, Xhosa, Turkish, Indonesian, Vietnamese | **none — answered in English** |
| Zulu | emitted, but **identified as Ndebele** |
| Shona, Ndebele, Spanish, Arabic, Mandarin | correct |

Two things follow. Adding five more lists fixes five more languages and leaves the sixth broken.
And the table is *bad at the job it was given* — it reads Zulu as Ndebele, which is the same
close-language confusion it was extended to avoid.

### The fix is the ownership boundary

`directive(null)` used to return `''`, and nothing means the model answers in English. It now
returns:

> LANGUAGE — answer this person in the language they are writing in. Work out which language that
> is from their own words; do not default to English. …

**That sentence is correct for every language the model supports, including ones nobody has thought
about, and needs no code change when the next one arrives.** Identifying a language is something a
language model does well; a stopword table does it badly.

The named form is kept for the two things one message cannot give a model: **continuity** (somebody
writes "ok" and must not be dropped back to English) and **pilot protection** for Shona and
Ndebele, where this was found. A known English speaker still adds nothing, so the ordinary path
costs no tokens.

Three clauses you named are now carried by **both** forms, so they cannot drift apart:

- an explicit request for another language is honoured, and persists;
- the language of an **attached document** does not decide the reply language;
- nor does the language of a **cited source**, and a source must not be implied to have been
  written in the language it is explained in.

**Shona and Ndebele remain mandatory regression tests**, as instructed — 51 assertions in
`language-journey-http-smoke`, including section H, which asserts the *property* and names no
language in its expected output so it keeps holding for languages nobody has listed.

**Four mutations, all caught**: the unknown case going silent again; the English-default
prohibition dropped; the explicit-request clause dropped; the attachment/source clause dropped. A
fifth broke the parse and was **rejected as invalid rather than counted as a pass**.

---

## 2 · The attachment receipt is gone

The file already appears in the thread as **the person's own message** — that is what attaching is.
A second bubble from IntelliQ confirming arrival is the product narrating its plumbing, first as
*"Read 10 parts from IMG_1918.png"*, then as *"I can see IMG_1918.png"*. Both are receipts.

On success the waiting bubble is **removed**. It stays while an upload is in flight — a phone on a
stadium connection needs to see something is happening — and it stays on failure, where the error
and its retry are the only way back. Pinned by **M10/M10b/M10c**, mutation-verified.

---

## 3 · External research — and a correction

**My round-1 report said this was "not audited and not built". That was wrong.** It is built,
reachable, and already under test.

| Piece | Where |
|---|---|
| Provider capability | `ai/gateway.js` — `canSearchWeb`, `searchWeb`, Anthropic server-side `web_search_20260209` |
| Query composition | `ai/websearch.deriveQuery` — built from **owned vocabulary**; there is no parameter to pass raw user text in |
| Refusal | the route refuses a query *the server did not compose* (500) |
| Sources | `citationsFrom` keeps `{ title, url, page_age }`, deduped by URL |
| Epistemic boundary | a server-composed note: what it is about, what it is **not** about, and that it changes no confidence and counts as no account |
| Audit | `_audit(..., action: 'web_reading')` |
| Reachable | `GET /api/objects/:kind/:id/reading`, called by `_renderReading` inside the object thread |
| Action | `request_research`, contexts inquiry/high/low/focus |
| Tested | `reading-scope-smoke.js`, in `npm test`, with a **stubbed provider boundary capturing every query sent** |

**So sources do remain attached**, as title + URL + publication age, and external reading is
structurally prevented from becoming internal evidence.

**What is NOT proved**: that a real provider returns useful results for a real question, and the
conversational shape you described ("one thing worth trying… here's why… want to try it?"). The
transport and the epistemic boundary are done; the conversation around it is not. **PROVIDER
VERIFICATION REQUIRED**, plus product work on the presentation.

There is **no YouTube-specific path**. Video would arrive only as a URL among web results.

---

## 4 · Which attachment types actually reach reasoning

| Type | Picker offers | Parser | Produces text | Reaches reasoning |
|---|---|---|---|---|
| `.txt` / `.md` | yes | in-browser | yes | **yes** |
| `.csv` | yes | in-browser | yes | **yes** |
| `.docx` | yes | **JSZip — third-party CDN** | yes *if the CDN loaded* | **conditional** |
| `.xlsx` | yes | **SheetJS — third-party CDN** | yes *if the CDN loaded* | **conditional** |
| `.pptx` | yes | **JSZip — third-party CDN** | yes *if the CDN loaded* | **conditional** |
| images (jpeg/png/webp/gif) | yes | none — server vision | a **description**, not the image | **yes, with a vision model** |
| `.pdf` | **no** | `_processPDF` exists, returns bytes and `claudeMsg: null` | **no** | **no** |
| HEIC (default iPhone photo) | no | none | no | no |

**Three of the six offered types depend on scripts fetched at runtime** from
`cdn.jsdelivr.net` and `cdn.sheetjs.com` (`index.html:54,56`; `js/attachments.js:136,158,181` call
the bare globals `JSZip` / `XLSX`). If those do not load, the picker still offers `.docx`, `.xlsx`
and `.pptx` and the parse throws. That is the hollow-control shape this codebase keeps finding,
one layer further out. *(Established from source and from observed proxy rejections in this
environment; a rendered probe timed out on the blocked CDNs, which is itself the symptom.)*

**PDF correction:** an earlier report of mine listed PDF among supported Composer types. It is not.
It has a processor, but that processor produces no text, and the Composer picker does not offer it.

---

## 5 · Original media — a decision that is yours

Traced, and the code already admits it: **`server.js:19176` returns `imageRetained: false`.**

An image is base64-uploaded, read **once** through `ai.understand`, converted to a text
description, and the bytes are discarded. `material.segment` takes only text. Nothing anywhere
persists the pixels.

**So your worked example is real:** if the description omitted the home record, *"What was their
home record again?"* is unanswerable — the screenshot that contained the answer is gone.

**This is the stop-and-ask.** Retaining inspectable source media is simultaneously a storage
decision (image bytes in a store that today holds only text), a privacy decision (a photograph may
contain faces, minors, documents and bystanders that no audience rule currently governs), and a
retention decision (how long, whose deletion removes it, what happens to evidence derived from it
when it goes). **No retention policy was invented.** The exact decision:

> May IntelliQ store original uploaded image bytes so they can be re-read later; under whose
> audience rule; for how long; and when a person deletes the image, what becomes of evidence and
> learning already derived from it?

---

## 6 · Not done

| Item | Why |
|---|---|
| Conversational Focus creation | Not attempted. The deterministic half — a `create_focus` proposal reaching the governed owner with confirmation — exists in `ai/composer-actions.js` and was **not** re-proved end-to-end this pass. |
| Referential conversation | `composer-binding-http-smoke` from an earlier pass covers ambiguity and refusal-to-guess; it was traced but **not re-driven** against the conversational surface. |
| Library retrieval, High/Low/Inquiry→Focus, Forum entry, full A→B, mobile acceptance journey | Not attempted. |

These are honest NOT DONE, not blocked. They are the remaining bulk of the brief.

---

## 7 · Verification

```
npm test        284 suites, 284 green, 0 failed        EXIT 0
```

| Browser gate | Result |
|---|---|
| pilot-coach (390px + 430px) | 125 / 0 |
| stack | 114 / 0 |
| library | 30 / 0 |
| forum-share | 13 / 0 |

**Nothing weakened.** Tenant isolation, privacy, audience authority, admissibility, provenance,
correction and supersession, evidence identity, confidence semantics, causality restraint, Focus
and Inquiry identity, Forum directionality, model-read/kernel-write and durability are as they were
at `e4d647a`.

**No product law invented.** The one candidate — image retention — is escalated in §5 rather than
decided.
