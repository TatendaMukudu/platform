# Composer privacy correction — report

**STARTING SHA** `4995d788b9be6a59bfc7cd9a060d34ffacf9c94e` (fetched from the remote and pinned;
matched the expected `4995d78`) · **ENDING SHA** _(filled at the end)_
**Branch** `gpt/ab-decision-spine-r1` · **Not merged.**

One correction, not a pass. Nothing was designed, added or reorganised.

---

## 1 · The exact control removed

| | |
|---|---|
| **Element** | `<button class="iq-vis" id="iq-vis">` — a "Private \| Public" pill on `.iq-composer-hint`, the row directly beneath the generic Composer |
| **Handler** | `MemberApp.toggleVisibility()` — flipped the label, `aria-pressed`, and an `is-shared` class |
| **State** | `MemberApp._wsShare` |
| **Where it reached** | **Nowhere.** Not in `assistantTurn`'s request body; no other reader anywhere in the client or the server |
| **Styling** | `.iq-vis`, `.iq-vis.is-shared`, `.iq-vis:focus-visible` in `css/styles.css` |

It was removed rather than wired up, on the founder's law: **talking to IntelliQ is not contributing
to the organisation.** Wiring it would have been worse than leaving it dead — a global public
*mode* means somebody who shares one sentence has silently changed the audience of every sentence
after it, and the moment they forget is the moment it matters.

**What replaces it is a statement, not a control**, because there is nothing here to choose:

```
Private to you      Who can see what I say here?
```

Deleting the pill and saying nothing was the other option, and it was rejected: on a row whose
whole subject is who can read you, silence is its own small dishonesty. The link was already there
and is untouched.

---

## 2 · The governed sharing paths, all preserved

Nothing below was modified. Each is asserted, not merely inspected.

| Path | What it does | Held by |
|---|---|---|
| `share_to_forum` action | names the audience and its size, shows the exact words, allows editing, requires Confirm, and refuses on a changed audience (409) | `forum-share-browser-check` 13/0 |
| Object audience control | `openAudience(kind, id)` on a High, Low, Inquiry or Focus thread — only on something that is yours | **PC-T5/T6** |
| `POST /api/me/focus/:id/visibility` | widen to shared, narrow back, with a sentence naming who that now means | **G1–G5** |
| `/api/me/audiences` | the vocabulary a governed share names its readers from | **F4/F5** |
| Forum contribute | the message's **own author**, once — a declared echo carries the echoed origin | **F1–F3** |

The distinction now holds in one direction only, which is the correct one: what the room has said
may inform a private conversation (**E1–E3**); nothing private reaches the room (**C3/C4**).

---

## 3 · Regression coverage

`scripts/composer-privacy-law-http-smoke.js` — **48 assertions**, registered in `npm test`, run
with `IQ_DETERMINISTIC_ONLY=1` throughout, plus **PC-T1–T6** in `pilot-coach-browser-check`.

| # | The founder asked | Where it is proved |
|---|---|---|
| 1 | ordinary turn stays private | A1–A2, and the coach sees none of it in D1–D3 |
| 2 | no fake Private/Public control is shown | B1–B6 (source) · **PC-T1–T4 (rendered, four pages)** |
| 3 | private conversation does not reach Forum | C1–C4, on a room that genuinely exists |
| 4 | …nor leader/team intelligence | D1–D4 across four leader-facing routes, plus another squad's leader |
| 5 | authorised Forum info may still reach the Composer | E1–E3 |
| 6 | governed contribution/audience flows still work | F1–F5 |
| 7 | High/Low/Inquiry/Focus audience controls intact | G1–G7 · **PC-T5/T6** |
| 8 | attachments follow the same law | H1–H3 |
| 9 | navigation does not change privacy | I1–I3, one turn from each of five pages |
| 10 | provider-down does not change it | J1–J3, and every assertion above ran models-off |

**Section K is the control.** Every "did not leak" assertion would pass against a server that
returns nothing to anybody, so K1/K2 prove the coach's surfaces are live and do carry the group's
real work.

### The injection test

**A3/A4** post a turn asserting `visibility: 'public'`, `share: true`, `_wsShare: true`,
`audience: 'node_members'`, `shareToForum: true`. The route reads none of them. This is what stops
the mode being reintroduced from a client, which matters more than the button's absence.

---

## 4 · Mutations

Six against the production owners. Each substitution was verified to have actually applied before
its result was believed — a mutation that silently fails to apply reads exactly like a passing one.

| Mutation | Caught by |
|---|---|
| M1 the Private/Public toggle is put back on the composer | B1, B5 · **PC-T1, PC-T3** |
| M2 no toggle, but the turn body starts carrying a visibility key | B4 |
| M3 the server honours an injected visibility field as group evidence | A5, A7, D4, H3 |
| M4 the object audience route is removed | G3, G4, G5 |
| M5 the Forum-to-composer direction is severed | E2, F1, F2, K2 |
| M6 the composer stops saying anything about privacy at all | B5 · **PC-T3** |
| M-B the object audience control is hidden on the thread | **PC-T5, PC-T6** |

### Three assertions this file shipped vacuous, and the mutation that found them

**M3 initially passed.** Wiring the injected field to file the words as **group evidence** left
every assertion green.

The reason is worth recording. A candidate stores `evidenceRef` and `originRef` and **never the
raw words** — that is the *evidence is referenced, never copied* law working exactly as designed.
So `A5`, `D4` and `H3`, which searched the candidate store for the private sentence, were
searching for something that **structurally cannot be there**. They could not have failed for any
product. All three now count candidates by contributor, with **A6** as the control proving the
count can move.

This is the worst version of the defect rather than the mildest: nothing reaches a coach's routes
until a candidate is *contributed*, so a leak sitting in the candidate store would never appear on
any screen.

Two more were caught before they shipped: **F1** was written as `!!mine || true` — a bare `true`
wearing a sentence — and **B4** first searched all of `js/app.js` for `_wsShare`, which failed
against the comment explaining the removal, a check that cannot tell an explanation from a live
wire. **B4pre** now proves B4 is reading the actual request body; it caught itself on the first run
by failing while B4 passed.

---

## 5 · Verification

```
npm test        283 suites, 283 green, 0 failed        EXIT 0
```

| Browser gate | Result |
|---|---|
| pilot-coach (390px + 430px) | **120 / 0** (114 + the six PC-T assertions) |
| stack | 114 / 0 |
| group-loop | 55 / 0 |
| library | 30 / 0 |
| settings-tiers | 45 / 0 |
| forum-share | 13 / 0 — the governed share path, unchanged and still green |

**One incident worth recording.** The container restarted while a mutation was applied, and the
mutation script's revert never ran — `js/app.js` was left on disk **with the toggle reinstated and
the honest note deleted**. Caught by checking `git status` before doing anything else, and restored
from the last commit. The lesson this pass keeps re-teaching held: everything was committed before
mutating, so nothing was lost. Every mutation after that point verified the working tree afterwards
rather than assuming the revert had run.

**Files changed since `4995d78`** (excluding the asset-stamp lock):

```
 css/styles.css                             |  17 +-
 js/app.js                                  |  52 +--
 scripts/composer-privacy-law-http-smoke.js | 354 +++++
 scripts/pilot-coach-browser-check.js       |  77 +++
 scripts/test.js                            |   1 +
```

Two source files. One removes a control and its styling; the other three are the proof it stays
removed and that nothing legitimate went with it.

---

## 6 · What was not touched

Settings, Library, Org Tree, cards, multimodal reasoning, Forum mechanics, and Composer layout —
none were modified. The composer's height, position, placeholder, attachment path and shell
behaviour are exactly as they were at `4995d78`. `css/styles.css` changed only in the block that
styled the removed pill.

**FROZEN.** No further product work. The next thing that should find a problem in IntelliQ is a
person using it.
