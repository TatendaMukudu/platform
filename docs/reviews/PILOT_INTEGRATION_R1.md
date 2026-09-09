# Pilot integration rehearsal — round 1

**Base:** PR #84 accepted head `6210974351ff5655752fa29f7e978edf2d21eb4a`
**Integrated:** `claude/pilot-closure-blockers` @ `41ca75c`
**Branch:** `claude/pilot-integration-r1`
**Ending SHA:** recorded below, after the report commit.

**Ran:** `npm test` (twice — after the merge and after the new assertions), the twelve named
regression suites individually, a 14-mutation harness, and a real Chromium pass at 390x844.

Nothing merged to `main`. `codex/review-r1` untouched. `claude/pilot-closure-blockers` untouched —
this branch was cut from the PR #84 head and the blocker work was merged *into* it, so the blocker
branch is a read-only input.

---

## Executive result

The combined tree is green and the two Library laws now have one owner each, with the line between
them asserted rather than assumed.

Two files conflicted textually, and neither was interesting: both were the asset cache stamp. The
conflict that mattered — object-level Keep — **auto-merged clean**, which was the dangerous
outcome, because git resolved a semantic conflict silently and correctly. A silently-correct merge
is exactly the kind that regresses unnoticed six weeks later, so the resolution is now pinned by
five assertions, each mutation-proved.

---

## Conflicts encountered, and exactly how each was resolved

### 1. `index.html` — asset cache stamp (textual)

PR #84 carries `v=20260907e`; the blocker branch carries `v=20260909b`. The combined tree contains
assets from **both**, so neither side's stamp describes it. Resolved to a **new** stamp,
`20260909c`, applied to all twelve references. `asset-version-smoke` then recomputed the
fingerprint (`4365165844a6`) and passes.

Taking either side would have shipped a tree whose stamp claims assets that are not the ones on
disk — precisely the failure AV5 exists to catch.

### 2. `scripts/.asset-version.lock` — same cause (textual)

This file is *owned by the suite*, not by either branch. Reset and let `asset-version-smoke`
rewrite it, which it did.

### 3. Object-level Keep — the semantic conflict (auto-merged, then inspected)

`js/app.js` merged with no marker, because the two branches changed **different lines**:

| Surface | PR #84 | blocker branch | merged result |
|---|---|---|---|
| Object-thread verdict row (`js/app.js:11161`) | `beginObjectAction('keep_in_library', ...)` | untouched | **governed** |
| Shelf row folder control (`js/app.js:8939`) | untouched | `fileToShelf(kind, refId, this.value)` | **direct** |
| Today header conversation Keep (`js/app.js:5542`) | did not exist | `todayKeepChat()` → `fileToShelf` | **direct** |

That is the shape the brief asked for, but arriving at it by accident is not the same as holding
it. **Resolved in favour of both laws, and pinned:**

**LAW 1 — object-level Keep is governed.** A consequence on a governed object you are reading is
proposed and confirmed. Deciding to keep somebody's Low is an act in the neighbourhood of their
record, and the person should see what will happen before it does. Unchanged from #84; now
asserted by `L9` (it uses the governed action) and `L9b` (that verdict row never reaches the shelf
route directly — the door #84 closed).

**LAW 2 — shelf management is direct.** Moving a reference you already made between folders you
already named decides nothing new. Forcing it through conversation would make tidying a shelf a
negotiation, which is not governance — it is friction wearing governance as a coat. Asserted by
`L11`, which requires the shelf row to call `fileToShelf(..., this.value)` **and** requires it not
to call `beginObjectAction`.

**THE INVARIANT — one owner per law.** Both transports end at the same domain owner,
`ai/shelf.js file()`. `L10` asserts the governed confirmation reaches `shelf.file`; `L10b` asserts
its branch writes to the shelf store and never to the retired `_libItems`; `L12` counts the filing
paths and requires **exactly two** — the direct route (`server.js:14419`) and the governed
confirmation (`server.js:17332`). A third would be a second owner, which is the whole thing this
integration exists to prevent.

### 4. The Today conversation Keep — decided on evidence, not preference

This was the one genuine judgement call, and I did not resolve it by taste.

`todayKeepChat()` creates a *new* shelf reference from outside Library, so on the face of it Law 1
should apply. Three facts decided it:

1. **`beginObjectAction` physically cannot run there.** `js/app.js:11956` reads
   `const input = document.getElementById('iq-object-input'); if (!input) return;`. The Today
   surface has `#today-ask`, not `#iq-object-input`. Routing Today through the governed dispatcher
   would produce a **button that silently does nothing** — which is the defect class this entire
   pilot-closure effort was about.
2. **#84's own law permits it.** `ASSISTANT_RUNTIME.md`, as #84 narrowed it and as FP12 pins:
   *"An explicit direct control may call a canonical domain capability directly when its action and
   consequences are already visible and unambiguous."* A button labelled Keep, titled *"Keep this
   conversation in your Library — a reference, not a copy"*, pressed by a person on their own
   conversation, is that control.
3. **It reaches the same owner.** `todayKeepChat` → `fileToShelf` → `POST /api/library/shelf` →
   `shelf.file`. Same room, different door.

Left direct. If the founder wants it governed instead, the work is not a re-point — it is giving
the Today surface a composer the dispatcher can find, which is a feature, not a merge resolution.

### 5. Shelf test conflict — there wasn't one, and that is worth stating

Both branches were reported as changing shelf assertions. In fact only #84 changed
`scripts/shelf-http-smoke.js` (SX11b, to `beginObjectAction('keep_in_library'` +
`requestedAction`); the blocker branch added a *new* suite, `library-door-smoke.js`, and left
`shelf-http-smoke.js` alone. So git had nothing to reconcile, and #84's SX11b stands unmodified.

The reconciliation the brief asked for is therefore **additive**, and it now proves both halves
across the two suites:

- `shelf-http-smoke` SX11b — governed object-level Keep reaches canonical shelf semantics.
- `library-door-smoke` L5, L11 — reachable Library controls file and move an existing reference
  into folders.
- `library-door-smoke` L10, L12 — and both end at the one owner.

---

## Also fixed

`scripts/scope-parity-smoke.js` W4 comment said *"72 -> 71, canonical Focus audience ownership"*.
The historical change is **69 → 71** — the count went **up** by two, and the stated rationale
(consolidation removed a duplicate) describes something that did not happen.

Corrected to name the two references the consolidation actually added:
`server.js:8568 _inNode/_leadsNode` (the single consolidated check, deliberately re-run at
execution time rather than caching proposal authority) and `server.js:8695 getVisibleUserIds`
(pre-existing, renumbered by the insertion above it).

**Comment only.** The assertion, the count `71`, and the architecture are untouched —
`git diff --stat` shows 8 insertions and 3 deletions, all inside a `/* */` block, and the suite
still passes 7/7. I re-verified during the PR #84 review that mutating the count to 72 turns W4
red, so the guard still bites.

---

## Tests

```
npm test  →  ✓ TRUTH LAYER GREEN — all sources parse, all suites pass.   (exit 0)
```

Run twice: once immediately after the merge resolution, once after adding the new assertions.
Zero FAIL lines in either.

| Suite | Result |
|---|---|
| `library-door-smoke` | **21** passed (15 carried + 6 new two-law assertions) |
| `shelf-http-smoke` | 33 passed |
| `shelf-smoke` | 23 passed |
| `composer-actions-smoke` | 41 passed |
| `focus-ownership-parity-smoke` | 23 passed |
| `composer-degraded-http-smoke` | 13 + 2 (spawned composer-off process) |
| `material-accept-smoke` | 14 passed |
| `material-smoke` | 31 passed |
| `material-reach-http-smoke` | 87 passed |
| `origin-correction-smoke` | 51 passed |
| `origin-independence-smoke` | 14 passed |
| `highs-lows-smoke` | 24 passed |
| `self-high-low-smoke` | 5 passed |
| `forum-smoke` | 71 passed |
| `chart-governance-smoke` | 34 passed |
| `composer-visibility-smoke` | 13 passed |
| `scope-parity-smoke` | 7 passed |
| `reachability-smoke` | 9 passed |
| `deadcode-scan` | 12 passed — zero dead functions in the merged tree |
| `asset-version-smoke` | 5 passed |
| `library-browser-check` (not in `npm test`) | **22** passed |

---

## Mutations

Every mutation breaks a production line; the suite is run reading **stdout and stderr**; the
verdict is whether the **named** assertion goes red. A non-zero exit with no FAIL line anywhere is
reported CRASH and never counted. There were none.

### The new two-law assertions

| # | Mutation | Red |
|---|---|---|
| I1 | object-thread Keep bypasses the governed action and calls the shelf route directly | `L9`, `L9b` |
| I2 | the governed Keep stops using the canonical shelf capability | `L10`, `L12` |
| I3 | the governed Keep also writes a copy into the retired item store | `L10b` |
| I4 | ordinary shelf folder management is forced through the conversation | `L5`, `L11` |
| I5 | a third filing path is added to the shelf store — a second owner | `L12` |

### The carried-over blocker assertions, re-proved on the merged tree

| # | Mutation | Red |
|---|---|---|
| I6 | drop the folder argument from the reachable shelf control | `L5`, `L11` |
| I7 | point the visible Library entry point back at the retired modal | `L1`, `L2` |
| I8 | restore a caller for the conversation-snapshot route that took a copy | `L3`, `L3c` |
| I9 | advertise `.pdf` as a Material again | `M2`, `M3` |
| I10 | restore the `window.AttachmentHandler` guard (always-empty accept) | `M6`, `M6b` |
| I11 | the grounding-refusal composer exit goes silent again | `D5` |
| I12 | stop rendering the degraded marker on the member workspace | `D8` |

### PR #84's own laws, re-proved to confirm the merge did not blunt them

| # | Mutation | Red |
|---|---|---|
| I13 | restore the `sig.ref` fallback at `originIdentity` (F1) | `OP1`, `OP4` |
| I14 | remove requested-group membership authorization (F4) | `FP10a` |

**14 of 14 bit the intended assertion.** No crashes, no hangs, none counted that did not print the
named FAIL.

---

## Browser results

Real Chromium at 390x844 — the founder's device class — with a planted session.
**22 passed, 0 failed.**

The Keep step was **rewritten for this integration**. It used to call `fileToShelf` directly as a
harness shortcut; it now presses the real button and walks the governed flow, which is what the
brief asked to see:

| Flow | Result |
|---|---|
| Today → Library | PASS — renders the shelf, no retired modal |
| create a Library folder | PASS — named, chip appears |
| **Keep an object through the governed action** | PASS — the button is wired to `beginObjectAction`… |
| **…pressing it proposes and files nothing** | PASS — shelf still empty after the press |
| **…a Confirm control appears** | PASS |
| **…confirming files it as a reference** | PASS — through the same canonical capability |
| file the item into a folder (direct) | PASS — server holds the folderId, count 0 → 1 |
| move it between folders / back out | PASS — still on the shelf; moving is not removing |
| open the folder | PASS — shows its contents |
| Material picker | PASS — non-empty accept, no PDF or image, keeps `.pptx`/`.docx`/`.xlsx`/`.csv` |
| degraded assistant state | PASS — marker present, **visible**, correct words, no provider/model/key/error |

Model-off is the honest case for the governed Keep, and it works because the typed shortcut travels
as `requestedAction` (`server.js:13661`), so the server validates a **named** action rather than
asking a model to infer one. That also means the flow above is the one the pilot will actually see
if the key is unavailable on the day.

**Two limits, unchanged from the last pass.** The page logs `Chart is not defined` — the Chart.js
CDN is blocked in this sandbox — so nothing about charts was exercised in-browser. And the session
is planted in `localStorage` rather than typed into a login form: this is a rendering and
interaction harness, not an auth test.

---

## Deferred

1. **Two routes duplicate the filing preamble.** `POST /api/library/shelf` and the
   `keep_in_library` confirmation each do folder validation → readability lookup → `shelf.file` →
   push. The *domain* owner is single (`ai/shelf.js`), which is the law and is asserted by `L12`,
   but the route-level preamble is written twice and could drift. Consolidating it is a refactor
   inside #84's architecture, not an integration decision, and it is not pilot-blocking. Recorded.

2. **The Today conversation Keep stays direct.** Reasoned above. If the founder wants it governed,
   that is a feature (give Today a composer the dispatcher can find), not a merge resolution.

3. **`reachability-smoke`'s prefix match remains weak.** `reachable()` tests
   `front.includes('/api/library')`, so the retired `/api/library` and `/api/library/:id` still
   read as reachable purely because `/api/library/shelf` appears in the client. Carried forward
   from `PILOT_CLOSURE_FIXES_R1.md`; tightening it would surface pre-existing orphans and turn the
   suite red on unrelated work.

4. **`ai/composer.js degradeLine()` is still uncalled.** Carried forward. The structured marker was
   the smaller, safer fix; replacing the least honest deterministic template with prose written for
   the case belongs to the next closure pass.

5. **The `tf1` squad focus in the browser fixture is now unreferenced by assertions.** It is
   harmless seed data and removing it would be churn during a rehearsal.

6. **This is a rehearsal, not the landing.** If PR #84's head moves before it merges, this branch
   must be re-cut from the new head and the fourteen mutations re-run. The value here is that the
   conflicts are now known and their resolution is asserted, not that this exact SHA is the one
   that lands.

---

PR84 INTEGRATION: **PASS**
LIBRARY KEEP: **PASS**
SHELF FOLDERS: **PASS**
ONE VOICE: **PASS**
MATERIAL: **PASS**
BROWSER: **PASS**
npm test: **GREEN**

READY TO LAND AFTER PR84: **YES**

Not merged.
