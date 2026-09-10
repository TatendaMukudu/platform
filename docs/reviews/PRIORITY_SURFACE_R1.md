# Priority surfacing — round 1

**Base:** `claude/priority-office-r1` @ `f844c3a2f8f56a7c116e3020a3f6ac9cc695500a`
**Branch:** `claude/priority-surface-r1`
**Ran:** `npm test`, `priority-surface-smoke` (new), `priority-surface-browser-check` (new, real
Chromium at 390x844), the regression sweep below, and 27 mutations.

---

## The finding this pass rests on

**The capability was complete and nobody could reach it.**

The previous pass shipped a working desk, 38 assertions, a closed reason vocabulary and two
routes — and then declared both routes `BACKEND_ONLY` because no screen called them. That entry
was honest about the attention list. It was **wrong about the other one**, and reproducing it is
what found the defect in §"Refused / escalated" below.

So this pass added no intelligence. It added a door, and then went looking for the ways a door
can be fake.

---

## The visible experience

A person opens Home. Where the one card has always been, they now see the thing their record
says is worth a look, chosen by the server:

> **Recovery between games**
> You recorded an outcome for the work on this, and the question itself is still open.
> *Why this?*

Tapping the card opens the canonical inquiry as a thread. Tapping **Why this?** binds the composer
to that object and sends an ordinary turn, so the answer is written by the model from the
authorised record and arrives through the same path as every other reply — degraded notice
included. Under it, at most **two quiet lines**, each one tappable and each naming its own reason.

They can ask why, open it, talk about it, work on it, or ignore it. Nothing was sent, nothing was
created, nothing was settled, nothing changed visibility.

### Why this is not a dashboard

| | |
|---|---|
| **One thing, then two lines.** | `items[0]`, then `items.slice(1, 3)`. There is no path by which a fourth thing renders (`PS-E1`). |
| **It does not count the rest at you.** | No "+7 more", no queue length, no badge (`PS-E2`, `PS-E3`). |
| **It is the same card as everything else.** | A distinct treatment would announce a second kind of thing on the first screen. The only additions are one control and the reason line. |
| **It went INTO the one brief slot, not beside it.** | `#iq-brief` still appears exactly once and this render targets it (`PS-E5`). |
| **It grows with nothing.** | The desk caps at ten; the screen caps at three; the record can hold ten thousand. |
| **There is only one desk.** | `attentionQueue` has exactly one owner in `ai/` (`PS-E6`), and the browser never assembles a list of its own (`PS-E7`). |

**Home is still one question.** When the desk has something, that IS the question. When it has
nothing — which is a real answer, not a failure — the ordinary top-of-record card stands exactly
as before (`PS-C4`).

---

## Who owns what

```
_allObjectsFor(code, userId)      authorise
        ↓
attentionQueue({objects, edges})  decide: eligibility, order, reason code, detail
        ↓
attentionSentence(row)            say the reason plainly            <- new, in the desk
        ↓
GET /api/me/attention             { kind, id, label, why, ref, reason, detail }
        ↓
_renderAttention(items)           render, front to back, unchanged  <- new, in the browser
        ↓
"Why this?"  →  the ordinary composed turn, bound to the object     <- the LLM's half
```

**The browser decides nothing.** It does not sort, score, rank, reverse, filter or re-phrase
(`PS-B1`, `PS-B3`). The order on the screen is the order that arrived. The sentence on the screen
is the server's `why`, escaped and printed (`PS-B2`) — and **no reason code appears anywhere in
the front end at all** (`PS-B4`), which is the strongest form of "the client cannot re-derive
this".

**Where the words live, and why there.** `attentionSentence` sits in `ai/priority-office.js`,
beside the vocabulary it phrases, so a seventh reason code added without a way to say it is
visible in one file rather than discovered on somebody's phone (`PS-A1`). Two owners for one rule
always drift; this repo has spent the month proving it.

### The line between a label and a voice

§3 of the brief forbids deterministic explanatory prose in the assistant's voice, and that is a
real hazard here — this codebase already shipped six paths where a template passed as IntelliQ
having thought about something.

The line drawn is structural, not stylistic:

- **The reason line is a LABEL on a card**, in the same slot the provenance line has always used.
  It states what the desk found and stops. `PS-E4` asserts it never renders inside an assistant
  message bubble, and mutation `S5` — moving it into one — turns that red.
- **The explanation is a composed turn.** "Why this?" produces no special prose path: it sets
  `about` and sends. So it inherits the grounding cage, the sources list, and the degraded notice,
  rather than needing a second copy of any of them.

That last point is proven rather than argued. The browser walk runs with **no model configured**,
so the composer degrades — and `N9b` asserts the existing `iq-degraded` notice actually renders on
screen in that state.

---

## Attention route reachability

`/api/me/attention` came **off** the `BACKEND_ONLY` list. `reachability-smoke` now carries a named
check for it, in the same section as the leader outcome loop and for the same reason — that loop
went unreachable silently once already:

```
PASS the Priority Office reaches a screen: Home fetches the attention list and renders it
```

It asserts **both halves**: a `fetch` and a `_renderAttention` that consumes its answer. A fetch
whose result is dropped is not a door, and an assertion that only looks for the fetch would not
know the difference.

That check is source-level, so the browser walk carries the real proof: `N2` finds an actual
`.iq-att-primary` element in the live DOM, containing the actual open question from the actual
record.

---

## Object context binding

A surfaced item is a **reference**, never a copy.

- The row carries `kind` and `id` as separate fields; the client is handed them rather than
  parsing `kind:id` itself (`PS-D2`), because a client that parses a ref owns a second copy of the
  ref format, and two formats for one identity is two identities.
- Tapping opens `openObjectThread(kind, id)` — the same thread door every other surface uses
  (`PS-D1`, and `N13`/`N14` in the browser, which confirm the thread binds to `inquiry`/`q1`).
- **Nothing on the way to the screen carries a statement, evidence text or a copy of the object**
  (`PS-D3`).
- "Why this?" writes nothing: no POST, no proposal, no confirmation in the act of asking
  (`PS-D5`).

---

## Privacy proof

The order is unchanged and structural: authorise, then rank, then label from the same authorised
set. The client receives only the already-authorised result.

- `PS-G1` — a reader from another squad gets a list naming none of it. Not filtered; never present.
- `PS-G2` — **every row a reader is shown is one that reader can actually open.** A list is not a
  capability, and this is the assertion that says so. It replaced a weaker one; see below.
- `PS-G3` — an unauthenticated caller gets 401.
- `PS-G4` — opening an object lifted from another reader's list is refused **at the object door**.
  The read gate runs again; the attention list grants nothing.
- `PS-F6` / `N12` — no evidence statement travels in a surfaced row, and none reached the screen.
- Mutation `S13` (build the list without the gate) turns `PS-G1` **and** `PS-G2` red. `S23`
  (remove `requireAuth`) turns all three red.

---

## Browser results — a real Chromium at 390x844

`scripts/priority-surface-browser-check.js`, on a real record, as a real player. **29 / 29.**
Not in `npm test`: it needs a browser binary and the truth layer is deliberately hermetic.

| Journey | Walked |
|---|---|
| **A** — open Home, something is surfaced, ask why | `N1`–`N12`: the element exists, names the real question, says why in plain words, is not an assistant bubble, and asking why puts the question in the thread above a real answer bound to `inquiry:q1` |
| **A** (cont.) — inspect the inquiry, work on it | `N13`, `N14`: the canonical object opens, bound by kind and id |
| **B** — record an outcome, return Home | `N15`–`N17`: the still-open question is what comes back; the outcome is readable off the loop; what came after is stated as **observed**, never as caused |
| **C** — new independent evidence | `N18`–`N20`: an independent account raises it and says so checkably; three more records from **one** account already present raise nothing |
| **D** — correction / supersession | `N21`: an inquiry whose only new record corrects an old one is **not** surfaced as fresh support |
| **UI quality** | `N22`–`N26`: no horizontal scroll, gutters both sides, a real tap target, the composer still at 16px so iOS does not zoom, and no page errors of the product's own |
| **Nothing was done** | `N27`: the surfaced inquiry is still open. Surfacing settled nothing |

**One page error is excluded, by name and with its reason.** `index.html` loads Chart.js from a
CDN and this run has no network, so `Chart is not defined` fires at load on every page in the
product, on this branch and on its base alike. Counting it would report a harness limitation as a
product failure — the exact class of false finding that has cost this project more time than any
real bug. The exclusion is a named regex with the reason beside it so it cannot quietly grow.

---

## Mutations

**27, and 27 bit.** Each breaks a production line and requires the **named** assertion to go red;
stdout and stderr both read; a non-zero exit with no `FAIL` line is treated as a crash and never
counted as a bite.

| # | Mutation | Red |
|---|---|---|
| S1 | put the render behind `if (false)` | `PS-C2` |
| S2 | sort the arrived list in the browser | `PS-B1`, `PS-B3` |
| S3 | phrase a reason code client-side | `PS-B2`, `PS-B4` |
| S4 | render the whole queue | `PS-E1` |
| S4b | add "+N more" | `PS-E2` |
| S5 | render the reason as an assistant bubble | `PS-E4` |
| S6 | drop the object binding from "Why this?" | `PS-D4` |
| S7 | open something other than the canonical object | `PS-D1` |
| S8 | send the raw reason code as the sentence | `PS-F4`, `PS-H2`, `PS-J3` |
| S9 | stop sending the canonical id | `PS-F2`, `PS-J4` |
| S10 | let a reason predict | `PS-A4`, `PS-J3` |
| S11 | invent a sentence for an unknown code | `PS-A6` |
| S12 | let a missing count reach a person | `PS-A7` |
| S13 | build the list without the authorisation gate | `PS-G1`, `PS-G2` |
| S14 | make a reason score a person | `PS-A3`, `PS-A4`, `PS-A5` |
| S15 | remove a reason's sentence | `PS-A1` |
| S16 | put a rank badge on the card | `PS-E3` |
| S17 | carry a statement into the row | `PS-D3` |
| S18 | make "Why this?" write something | `PS-D5` |
| S19 | add a second `attentionQueue` owner | `PS-E6` |
| S20 | let the fallback fetch attention too | `PS-E7` |
| S21 | add a score field to every row | `PS-F5` |
| S22 | carry the evidence statements in the response | `PS-F6` |
| S23 | remove `requireAuth` | `PS-G1`, `PS-G2`, `PS-G3` |
| S24 | make the note claim something was done | `PS-J5` |
| S25 | fetch the object routes instead of the desk | `PS-C1` |
| S26 | drop the fallback card | `PS-C4` |

### Four assertions could not go red, and were rewritten

Every one of these is a PROTOCOL lie found in my own new work, by mutation rather than by review.

1. **`PS-B1` was testing a comment.** It went red against the word "ranked" inside a sentence
   explaining that nothing is ranked — an assertion a comment could break, and equally one a
   comment could satisfy. Anything asserting behaviour now reads decommented source.
2. **`PS-C2` matched a call that could never execute** (lie #1). It looked for
   `_renderAttention(att.items)` anywhere in the function and stayed green with the branch above
   it changed to `if (false)`. It now asserts the guard and the call as one expression.
3. **`PS-G2` stood on a fixture that could not show the failure** (lie #5). It checked that two
   particular labels were absent from another reader's list — but neither of those inquiries
   produces an attention row for *anybody* (one is same-origin repetition, the other a
   correction), so it held against a surface that could never have shown them. Rewritten to the
   law: **every row a reader is shown is one that reader can open**, verified over HTTP.
4. **`PS-D3` was scoped to the wrong half of the render path.** It watched `_renderAttention` and
   stayed green while a `statement` field was added one function up in `_attentionRow` — which is
   where a copy of the evidence would actually get in.

---

## Refused / escalated — the founder decision this pass will not make

### The model-suggested declared relation does not work, and I wrote down that it did

**Reproduced.** `ai/composer-actions.js` `normalize()` retains a fixed list of argument keys —
`text, target, reviewOn, visibility, outcome, because, folderName, folderId, materialId, groupId`
— and `ground()` rebuilds `args` from scratch over the same set. Neither includes `relation` or
`evidenceRef`:

```
$ node repro-relation-door.js
normalize kept: [{"type":"declare_focus_relation","arguments":{}, ...}]
ground kept:   [{"type":"declare_focus_relation","arguments":{}, ...}]
relation survived?    false
evidenceRef survived? false
```

So a proposal reaches the confirm branch carrying neither value, and `_declareFocusRelation`
refuses it with a 400. The direct route works. The model-suggested half — the one the founder's
sentence describes — **cannot complete a single time.**

`PO-K8`/`PO-K9`/`PO-K10` did not catch this because all three assert **source text and registry
shape**: that the confirm branch calls the canonical owner, that the action is registered with
`confirmation: true`, that the vocabulary check is at the writer. Every one of those is true.
None of them sends a proposal through and confirms it. **Registration is not reachability**, and
I wrote the opposite into `reachability-smoke`'s `BACKEND_ONLY` reason last pass. That entry is
corrected on this branch and now says what is actually true.

**Why I have not fixed it.** Completing the path requires the model to name **one specific piece
of evidence**. Today it is shown the object's kind, id and label and nothing else, so to choose
between three signals it would need identifiers *and* something human enough to tell them apart —
and the only human-enough thing a signal carries is its statement. Putting evidence statements
into the action-interpretation prompt is a **disclosure decision**, not a UI question, and the
composer's whole design is that evidence is referenced and never copied.

Half-fixing it is worse than leaving it. A door that completes only when a focus happens to have
exactly one piece of evidence would look reachable, pass a test, and fail in front of a person —
which is the precise failure this entire pass exists to stop.

> **The decision, as small as it goes:** when IntelliQ offers *"this may support what you're
> working on — mark it that way?"*, what may the model be shown in order to know which piece of
> evidence "this" is? Three options, in ascending disclosure:
>
> 1. **Nothing new.** The offer is only ever made about evidence the person themselves just named,
>    resolved from their own words. Smallest, and it fires rarely.
> 2. **Refs and shapes only** — `{ ref, at, origin, direction, dissents }`, no statement. The model
>    can distinguish records but cannot read them. Consistent with every other retrieval boundary
>    in the product.
> 3. **Refs plus statements.** Best offers, and it puts a person's own words into a second prompt.
>
> Option 2 looks right to me and needs no new ontology, but it is a disclosure boundary and the
> brief says to stop rather than choose.

Until then the direct route stays `BACKEND_ONLY` with the true reason written out, per §6's
explicit instruction.

### `explicitly_prioritised` is a reason nothing can trigger

**Reproduced by search.** `mem.prioritised` is **read** in two places (`server.js:10266`,
`server.js:16976`) and **written nowhere in the codebase.** The top of the ranking law — *"a human
marked it; nothing outranks somebody saying so"* — cannot fire for anyone.

Not fixed here, deliberately: a "this matters to me" control is new product surface on the first
screen, and §"do not create a dashboard" / "no tiny unexplained badges" is exactly the pressure
that makes it easy to add badly. It blocks nothing — the other five reasons work, and `PS-A1`
still requires the code to have a sentence ready for when it has a writer.

---

## What I could not verify

- **"Since you last looked" does not fire on Home.** `contradiction_added`,
  `new_independent_evidence` and `related_state_changed` all require a `seen` timestamp. Home
  sends no `?since=`, so today it surfaces only `unresolved_after_focus_outcome`,
  `outcome_missing` and (once it has a writer) `explicitly_prioritised`. Journeys **C** and **D**
  are therefore walked against the route with `?since=` — the canonical contract — not against
  Home. I did not wire it, and the reason is specific: `mem.lastSeen` exists, but `/api/me/context`
  **overwrites it on the very render Home is doing**, so reading it there is a race whose outcome
  decides whether the product notices something. A per-object read receipt is the honest
  requirement and it is a founder decision the previous pass already deferred. This is the first
  thing I would do next.
- **No model ran.** The browser walk had no key configured, so what was verified is that
  "Why this?" reaches the composer and degrades correctly. **The quality of composed prose about
  an attention item is unverified**, and the grounding cage's behaviour on this new context block
  is unverified with a live model.
- **One reader, one squad, one seeded record.** No concurrency, no second device, no long record,
  and nothing at the scale the pilot will actually produce.
- **The fallback path is untouched and still merges four object lists client-side by a
  server-supplied score.** That is pre-existing, out of scope for this pass, and I did not fix it —
  `PS-B1` is scoped to the attention render and says so, rather than implying more than it checks.
- **Not deployed.** This is CODE READY. Nothing here has run on Render.

## Touched another lane

- `index.html` — the cache stamp moved `20260909e` → `20260910a`. `asset-version-smoke` went red
  because I changed `js/app.js` and `css/member.css`; the guard was right and the fix is the
  stamp, not the guard.
- `docs/INDEX.md` — `docs-status-smoke` went red at 21 commits behind a threshold of 20. Re-stamped
  against `f844c3a` and given two rows for the laws this branch and the last one added. The
  threshold was not touched.

---

## Test results

```
npm test  →  ✓ TRUTH LAYER GREEN — all sources parse, all suites pass.   (exit 0)
```

| Suite | Result |
|---|---|
| `priority-surface-smoke` (**new**, registered in `npm test`) | **46** passed |
| `priority-surface-browser-check` (**new**, real Chromium 390x844, not in `npm test`) | **29** passed |
| `priority-office-attention-smoke` | 38 |
| `cross-evidence-smoke` | 39 |
| `composer-actions-smoke` | 45 |
| `turn-grounding-smoke` | 28 |
| `focus-ownership-parity-smoke` / `focus-continuity-smoke` | 23 / 44 |
| `highs-lows-smoke` | 24 |
| `origin-correction-smoke` / `origin-independence-smoke` | 51 / 14 |
| `epistemic-invariants-smoke` | 16 |
| `reachability-smoke` / `deadcode-scan` | 10 / 12 |
| `asset-version-smoke` / `docs-status-smoke` | 5 / 17 |

---

PRIORITY OFFICE REACHABLE: **PASS**
HOME STILL ONE QUESTION: **PASS**
SERVER OWNS PRIORITY: **PASS**
LLM OWNS PROSE: **PASS**
CANONICAL OBJECT BINDING: **PASS**
PRIVACY: **PASS**
A->B->NEXT USER FLOW: **PASS**
MOBILE: **PASS**
npm test: **GREEN**

READY FOR PILOT PROACTIVE SURFACING: **YES** — with one stated limit. What reaches Home today are
the reasons that are true regardless of when you last looked; the three "since you last looked"
reasons need the read-receipt decision above before they can surface there. The declared-relation
door remains backend-only, with the disclosure decision named rather than guessed.

Not merged.
