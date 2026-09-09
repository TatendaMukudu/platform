# Pilot closure — blocker fixes, round 1

**Started from:** `main` @ `5683df3de63d8daa54d345ab39fa262db1908d2e`
**Branch:** `claude/pilot-closure-blockers`
**Ending at:** `4cdc2705e49c594bbfe087e2517f959382d2f1dc`
**Ran:** `npm test`, each new suite individually, a 20-mutation harness, and a real Chromium pass
at 390x844 (`scripts/library-browser-check.js`).

All four blockers from `docs/reviews/PILOT_CLOSURE_AUDIT.md` are fixed. PR #84 was not touched,
nothing was merged, and no test was weakened — two existing suites were made *stronger* because
this work changed the law they guard.

The browser pass found a fifth defect that no source-level test could see, and it made the
Material blocker worse than the audit described. It is fixed and pinned. Details under BLOCKER 4.

---

## Files changed

| File | What changed |
|---|---|
| `server.js` | `COMPOSER_DEGRADED` vocabulary + `_degraded()`; the six `_composeTurn` exits return a reason instead of bare `null`; the turn call site propagates it; `response.composer` added |
| `js/app.js` | Old Library client surface removed (108 lines); `todayKeepChat()` replaces it; Today header buttons repointed; folder control added to the shelf row; `iqDegradedNote()` added and rendered on both turn surfaces; Material input guard and accept list corrected |
| `js/attachments.js` | `MATERIAL_KINDS`, `MATERIAL_EXTENSIONS`, `materialAcceptAttr()` — the Material list, derived, separate from the chat list |
| `css/styles.css` | `.shelf-move`, `.shelf-move-label`, `.shelf-move-select` (44px tap target) |
| `css/member.css` | `.iq-degraded` — quiet, not an error |
| `index.html` | Asset cache stamp `20260906a` → `20260909b` |
| `scripts/composer-degraded-http-smoke.js` | **new** — all six composer exits, driven over HTTP |
| `scripts/library-door-smoke.js` | **new** — the folder door and the one Library |
| `scripts/material-accept-smoke.js` | **new** — the picker may only advertise what a parser reads |
| `scripts/library-browser-check.js` | **new** — real Chromium, not in `npm test` (see below) |
| `scripts/composer-visibility-smoke.js` | CV10 strengthened, CV11b added — the law changed, so the guard did |
| `scripts/reachability-smoke.js` | `/api/library/from-chat` moved to `BACKEND_ONLY` with the founder decision as its reason |
| `scripts/test.js` | the three new hermetic suites registered |
| `scripts/.asset-version.lock` | rewritten by `asset-version-smoke` (it owns this file) |

---

## BLOCKER 1 — shelf folders can now hold something

**The defect.** `fileToShelf(kind, id, folderId)` had one call site, which passed two arguments.
The shelf row had two controls: open, and Remove. Folders could be created and named and nothing
could ever be put in one, so every chip read `0` forever.

**The correction.** A `<select>` on each shelf row, rendered whenever folders exist, whose
`onchange` calls `MemberApp.fileToShelf(kind, refId, this.value)`. It shows which folder the item
is in now, and offers "No folder" as the way back out.

**One filing operation, not two.** `POST /api/library/shelf` already treats re-filing as a move
(`ai/shelf.js` `file()` returns `moved`), so filing and moving are the same call to the same
route. No second endpoint, no client-side folder state machine — two descriptions of one rule
always drift, and `library-door-smoke` L6 pins that there is only one.

**Not done, deliberately: the open folder as a default destination.** The brief allowed it "if
minimal and unsurprising", and it is neither. `_shelfFolder` is a filter that survives leaving the
page, so a folder chosen on Tuesday would silently decide where Thursday's Keep lands — a smart
default deciding something the person did not say. `docs/reviews/PROTOCOL.md` names smart defaults
as one of the three back doors inference returns through. The explicit control does the job.

**Verified in a browser:** folder created, item filed into it, count went 0 → 1, folder opened and
showed its contents, item moved back out and stayed on the shelf. B2–B6b.

---

## BLOCKER 2 — the degraded voice says so

**The defect.** Six exits from `_composeTurn` returned bare `null`, and all six fell through to
deterministic templates written in IntelliQ's ordinary voice. A rejected key, an exhausted budget
and the grounding cage refusing an invented teammate all produced a screen indistinguishable from
IntelliQ having thought about it. `composer.degradeLine()` existed for exactly this and was called
only by its own smoke test — the seventh definition-not-call in this repository.

**The correction, in three parts.**

1. A closed vocabulary: `COMPOSER_DEGRADED = ['disabled','no_model','over_budget','empty',
   'unverified','error']`, and `_degraded(reason)` which coerces anything outside it to `'error'`.
   Every value is a fact about IntelliQ's own state. None names a provider, a model, a key, a rate
   limit or an error message — that detail stays in the logs and the metrics, where it already was.
2. Each of the six exits returns `_degraded('<its own reason>')`. The single combined
   `!IQ_COMPOSER || !ai.enabled() || !_llmBudgetOk(code)` gate was split into three, because "no
   model" and "over budget" want opposite fixes and a marker that cannot tell them apart sends
   whoever is on stage looking for the wrong thing.
3. The response carries `composer: { degraded, reason }`. The client renders one sentence from one
   helper, `iqDegradedNote()`, on both surfaces that show a turn.

**What the person sees:** *"IntelliQ's normal response isn't available right now. This reply was
put together from your record instead — what it says still holds, the wording is just plainer than
usual."*

**What it does not do.** It does not retract the reply. The kernel decided, and a decision is not
made wrong by the model being unavailable to phrase it — so the deterministic fallback stays, as
the brief required. `responseText` is untouched: the marker is a separate field, so no existing
assertion that reads the reply text was disturbed.

**The gate moved.** `IQ_COMPOSER` used to be checked twice — once to decide whether to call
`_composeTurn`, once inside it — so with the flag off the function was never entered and there was
nothing to report. One place decides now.

**Verified in a browser:** with the model unavailable, the turn still answered, the response
carried `degraded: true` over the wire, and the marker rendered *visibly* at 390x844 with no
provider, model, key or error in its text. B8–B9c.

---

## BLOCKER 3 — one Library

**The founder decision, implemented.** The shelf is the Library. The old copy-taking Library is out
of the user-facing product.

- The Today header **Library** button now calls `navigate('notes')`, which routes to
  `_renderNotesPage` → `_renderShelf`. The sidebar entry already pointed there.
- The Today header **Save** button — which called `POST /api/library/from-chat`, flattening a live
  conversation into a second record beside it, then opened the old modal — is now **Keep**, and
  files a *reference* to the conversation through the canonical shelf route. This is the product
  law made literal: keeping does not copy.
- The old client surface is gone: `window.IQLib`, `todayLibraryOpen`, `libLoad`, `libRender`,
  `libDetail`, `libOpen`, `libBack`, `libSelect`, `libNewFolder`, `libNewNote`, `libMove`,
  `libShare`, `libDelete`, `todaySaveChatToLibrary` (108 lines).

**Why client code was removed when the brief said not to delete.** The brief protected the
**routes, the storage and the data**, and all three are untouched — `/api/library`,
`/api/library/from-chat`, `/api/library/:id`, `libraryItems` and every record in them are exactly
as they were. What was removed is the *door*, which is what "leave the old system dark/unreachable
through normal UI" means. It was also forced: `scripts/deadcode-scan.js` is part of `npm test` and
goes red on a function nothing references, and `AGENTS.md` says the answer is to wire it up or
delete it. Leaving the modal orphaned would have turned the suite red, and re-pointing a button at
it to keep it alive would have undone the decision.

`/api/library/from-chat` consequently lost its caller and `reachability-smoke` correctly flagged it
as a new orphan. It is now in `BACKEND_ONLY` carrying the founder decision as its reason, which is
what that allow-list is for.

**No second door.** `library-door-smoke` L2 checks every element labelled `Library` in the client
routes to `navigate('notes')`. There is one, and it does.

**Verified in a browser:** opening Library rendered `#shelf-list` and no `#iq-lib-modal`. B1.

---

## BLOCKER 4 — the Material picker, and the defect underneath it

**The defect as the audit described it.** The Material input borrowed
`AttachmentHandler.ACCEPT_ATTR` — the *chat* list — so it advertised `image/*`, `.pdf`, `.doc` and
`.ppt`, then refused them after the file was chosen.

**The defect as it actually was.** The guard was
`(window.AttachmentHandler && AttachmentHandler.ACCEPT_ATTR) || ''`. `AttachmentHandler` is a
top-level `const` in a classic script, and **a top-level `const` does not become a property of
`window`** — so that expression was `undefined` on every render and the attribute came out
**empty**. An empty `accept` offers *every file on the phone*. The guard produced the exact
opposite of its purpose, and no source-level test could ever have seen it, because the source said
the right thing. It was found by opening the page in Chromium.

This is worth naming as a class: the whole audit was about doors, and this is a door whose *frame*
was wrong. Three of the four blockers were features whose route worked and whose tests passed and
which nobody could reach; this is a fourth, one layer further out.

**The correction.**

- `js/attachments.js` gains `MATERIAL_KINDS`, `MATERIAL_EXTENSIONS` (`.txt .md .csv .docx .xlsx
  .pptx`) and `materialAcceptAttr()`, which derives the attribute from the map so the picker and
  the parser table cannot drift.
- `.doc` and `.ppt` are excluded for a less obvious reason than PDF: they route to the `docx` and
  `pptx` processors, which open a zip, and the legacy binary formats are not zips — they *throw*
  rather than returning empty.
- The guard is now `typeof AttachmentHandler !== 'undefined'`, the idiom the rest of the file
  already uses.
- **The chat path is untouched.** `ACCEPT_ATTR` still offers PDFs and images, because that path
  sends them to the model as document and image blocks and it works. Two capabilities, two lists —
  `material-accept-smoke` M4 pins that the chat list keeps them.

**The assertion is the mapping, not the string.** Every advertised extension is followed to the
kind it routes to, and that kind's processor is required to return `content`. A hardcoded expected
accept-list would have passed while a processor quietly stopped returning text.

**Verified in a browser:** the live element's `accept` is non-empty, contains no `.pdf` and no
`image/*`, and still contains `.pptx`, `.docx`, `.xlsx` and `.csv` — the founder's scouting-deck
case intact. B7–B7c.

---

## Mutations, and which assertions bit

Every mutation breaks a production line, the suite is run reading **stdout and stderr**, and the
verdict is whether the **named** assertion went red. A crash with no FAIL line is reported as CRASH
and never counted. There were none.

| # | Mutation | Assertion that went red |
|---|---|---|
| X1 | drop the third argument from the reachable folder control (the original defect, exactly) | `L5` |
| X2 | put the folder control behind `${false ? ...}` so it can never render | `L5` |
| X3 | send the move to a different field, off the canonical route | `L6` |
| X4 | point the visible Library control back at the retired modal | `L1` |
| X5 | restore a caller for the snapshot route that took a copy | `L3` |
| X6 | advertise `.pdf` as a Material again | `M3` |
| X7 | point the Material input back at the chat accept list | `M5` |
| X19 | restore the `window.AttachmentHandler` guard (always undefined, empty accept) | `M6` |
| X8 | composer-off exit goes silent again | `D1b` |
| X9 | no-model exit goes silent again | `D2` |
| X10 | over-budget exit goes silent again | `D3` |
| X11 | empty-completion exit goes silent again | `D4` |
| X12 | grounding-refusal exit goes silent again | `D5` |
| X13 | thrown-call exit goes silent again | `D6` |
| X14 | mark *every* turn degraded, including ones the model wrote | `D7` |
| X15 + X15b | open the reason vocabulary **and** hand it the thrown provider message | `D6b`, `D6c` |
| X16 | stop rendering the marker on the member workspace | `D8` |
| X17 | stop rendering the marker on Today | `D8` |
| X18 | add a seventh exit returning a bare `null` | `CV11b` |

**19 of 19 bit.** X15 and X15b are recorded as one paired mutation because each half alone is
genuinely harmless — opening the vocabulary matters only if something passes provider text into it,
and passing provider text matters only if the vocabulary is open. Applied together, `D6b` and `D6c`
both went red. Reported separately would have been a false negative; reported as a single mutation,
it is the honest description of the regression.

### Two assertions I had to fix because a mutation would not bite

Both were mine, both were caught by the harness, and both are recorded because they are instances
of families already in `PROTOCOL.md`.

**X2 did not bite the first time.** `L5` searched the `_renderShelf` body for the `onchange`
handler. Parking the control behind `${false ? ...}` left the markup in the file, so the assertion
stayed green against a control that could never render — **text is not reachability** (lie #9).
`L5` now matches the control *together with the condition it sits behind*, so disabling it is red.

**X15 did not bite the first time, and the mutation was the problem.** `D6b` asserted the reply
carried no provider text. Opening `_degraded` alone changed nothing, because nothing in the code
path hands it a provider message — a no-op mutation (lie #9 again, from the other side). But the
attempt exposed that `D6b` held *by luck rather than by rule*, so `D6c` was added: `reason` must be
one of the six IntelliQ states whatever the caller passes. That is the assertion the closed
vocabulary actually deserves.

---

## Test results

```
npm test  →  ✓ TRUTH LAYER GREEN — all sources parse, all suites pass.   (exit 0)
```

| Suite | Result |
|---|---|
| `composer-degraded-http-smoke` (new) | 14 passed, 0 failed (12 in-process + 2 in the spawned composer-off process) |
| `library-door-smoke` (new) | 15 passed, 0 failed |
| `material-accept-smoke` (new) | 14 passed, 0 failed |
| `composer-visibility-smoke` (strengthened) | 13 passed, 0 failed |
| `reachability-smoke` | 9 passed, 0 failed |
| `shelf-smoke`, `shelf-http-smoke` | unchanged, still green |
| `deadcode-scan` | 12 passed — zero dead functions after the Library removal |
| `library-browser-check` (new, not in `npm test`) | **18 passed, 0 failed** |

### Two existing suites went red, correctly, and were made stronger — not weakened

**`composer-visibility-smoke` CV10.** It counted `return null;` occurrences inside `_composeTurn`
to define "an exit", and asserted `exits >= 3` specifically so that CV11 could not become vacuous.
Replacing every `null` with `_degraded(...)` took the count to zero — and CV10 caught it, which is
exactly what it was written to do. The fix was to re-express it against the **new, stronger** law:
an exit is a `_degraded(...)`, there must be at least six, every one must still increment a
counter, and `CV11b` now additionally forbids any bare `null` return. Mutation X18 confirms it.

**`asset-version-smoke` AV5.** `js/` and `css/` changed, so the cache stamp had to change with
them. Bumped `20260906a` → `20260909b`. The guard is right: shipping a change nobody's browser can
load should be a failing build.

**`reachability-smoke`.** Flagged `/api/library/from-chat` as a new orphan the moment its caller
was removed. Added to `BACKEND_ONLY` with the founder decision written out as its reason — that
list exists for routes that legitimately have no front-end caller, and every entry must carry a
reason or the suite fails.

---

## Browser verification

**Browser tooling exists and was used.** `playwright-core` is a devDependency and Chromium is at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. `scripts/library-browser-check.js` drives a
real browser at 390x844 — the founder's device class — with a planted session, reusing the harness
shape `scripts/mobile-inspect.js` already established.

It is **not** in `npm test`, for the same reason `mobile-inspect` is not: the truth layer is
deliberately hermetic and must run with no browser binary. It is the other kind of evidence.

Every flow the brief asked for was exercised live:

| Flow | Result |
|---|---|
| open Library from the Today header | PASS — renders the shelf, no old modal |
| create a folder | PASS — named, chip appears |
| put an item into the folder | PASS — server holds the folderId, count 0 → 1 |
| move it | PASS — moved back out through the same control, still on the shelf |
| open the folder | PASS — shows its contents |
| degraded response rendering | PASS — marker present, **visible**, correct words, no leak |
| the Material file picker | PASS — after fixing the defect the browser found |

**Two limits of this pass, stated plainly.** The page logs `Chart is not defined` — the Chart.js
CDN is blocked in this sandbox — so nothing about charts was exercised in-browser. And the session
is planted in `localStorage` rather than typed into a login form: this is a rendering and
interaction harness, not an auth test.

---

## Discovered and deliberately deferred

1. **`reachability-smoke`'s prefix match is weak.** `reachable()` tests
   `front.includes('/api/library')`, so `/api/library` and `/api/library/:id` still read as
   reachable purely because `/api/library/shelf` appears in the client. They no longer have
   callers. Tightening the check to an exact match would very likely surface a batch of
   pre-existing orphans and turn the suite red on work unrelated to this pass. Recorded rather
   than done.

2. **One-voice cleanup: nothing was low-risk enough to change.** The brief allowed a tiny
   correction if a deterministic sentence bypassed the Composer during model-ON operation. There
   is none. The turn fallback at `server.js` is reached only when the composer did *not* run,
   which is now marked. The remaining deterministic prose — `ai/voice.js` (47 literals),
   `ai/present.js`, `ai/stance.js`, `ai/proactive.js`, `ai/behaviour.js` — is card furniture,
   framing and labels: structure, not the assistant's reply. Moving it behind the model would put
   text that must be identical every time behind something that varies. It should stay
   deterministic, and that is a finding rather than a deferral.

3. **The `.iq-hidden-file` inputs elsewhere still advertise `.json` and `.markdown`**, which
   `AttachmentHandler.ACCEPTED` does not map — a picked `.json` throws `Unsupported file type`.
   Same family as BLOCKER 4, different surfaces (`kn-file`, `iq-attach-input`), none of them the
   Material path. Not pilot-blocking.

4. **The old Library's CSS (`.lib-*`) is now unused.** Roughly thirty rules. Harmless, and
   deleting stylesheet rules in pilot week buys nothing.

5. **`ai/composer.js degradeLine()` is still uncalled.** BLOCKER 2 was solved with a structured
   marker, which is the smaller and safer change the brief asked for. `degradeLine` is the
   *second* option — replacing the least honest deterministic template with prose written for the
   case — and it belongs in the next closure pass, not in a week where the deterministic fallback
   must keep working exactly as it does.

6. **Moving an item between folders bumps it to the top of the shelf.** `ai/shelf.js file()` sets
   `existing.at` on a move, and `view()` sorts by `at` descending. Arguably correct (a move is a
   filing act) and it is existing, tested behaviour — `shelf-smoke` SH3 pins it. Not changed.

---

## Confirmation

**PR #84 was not touched.** Nothing in this branch reads from, writes to, or depends on
`codex/review-r1`. `ai/diagnose.js` was not modified. The origin-shaping duplication I noted at
`server.js` `/api/me/calls` and `/api/me/call` — which is what #84 centralises — was left exactly
as it is.

**Nothing was merged.** The branch is `claude/pilot-closure-blockers`, off `5683df3`.

**No test was weakened.** Two suites were made stronger because this work changed the law they
guard; both changes are described above, and mutation X18 proves the strengthened one can go red.

---

LIBRARY: **PASS**
SHELF FOLDERS: **PASS**
ONE VOICE DEGRADED MODE: **PASS**
MATERIAL PICKER: **PASS**
npm test: **GREEN**

PILOT BLOCKERS REMAINING: **0**

The six verification items from `PILOT_CLOSURE_AUDIT.md` are a separate list and are not closed by
this pass. Four of them — real-device behaviour on a physical iPhone, the 29 tap targets, whether
the ownership finding is exposure or only permissions, and the recognition strip on Home — remain
explicitly OPEN. Two are now partly answered: the shelf folder controls were exercised in a real
browser at phone size, and the degraded path was rendered and read on that same screen, but neither
has been touched by a human thumb on a physical device.
