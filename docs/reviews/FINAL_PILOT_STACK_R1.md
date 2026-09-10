# Final pilot stack — round 1

**Branch:** `claude/final-pilot-stack-r1`
**Ran:** `npm test`, the full focused battery below, 20 sampled cross-layer mutations, and a real
Chromium walk at **two** phone widths.

---

## Input SHAs, and the ending SHA

| Layer | Branch | SHA |
|---|---|---|
| 0 | **PR #86 head** (`codex/pilot-experience-r1`) | `9879dcb60dcd2a3af150810571e7aafc4256b03c` |
| 1 | `claude/pilot-integration-r2` | `1a6fffedcb77ceb6e4a4770beca7755440e83936` |
| 2 | `claude/cross-evidence-r2` | `94c868341a219fec18b9f2d4876582cae23dfec4` |
| 3 | `claude/priority-office-r1` | `f844c3a2f8f56a7c116e3020a3f6ac9cc695500a` |
| 4 | `claude/priority-surface-r1` | `144a9bf8910d045838a6b308da3fdf9c5b94eccf` |
| 5 | `claude/priority-closure-r1` | `5c765a6144e9b7af868609ae3e856a53a00a3d46` |

PR #86's head was read from GitHub, not from my own notes: still open, `mergeable_state: clean`,
head unchanged at `9879dcb`.

---

## Conflict map — there were none, and that is a finding rather than luck

Every layer was cut from the head of the one before it, so the five branches are **already one
linear chain rooted at PR #86's exact head**:

```
9879dcb  PR #86
  └─ 1a6fffe  pilot-integration-r2   (+6)
       └─ 94c8683  cross-evidence-r2  (+1)
            └─ f844c3a  priority-office-r1  (+1)
                 └─ 144a9bf  priority-surface-r1  (+1)
                      └─ 5c765a6  priority-closure-r1  (+1)
```

`git merge-base --is-ancestor` confirms each link. So the integration is a **fast-forward**: the
branch was created at `5c765a6` and its tree is byte-identical to `claude/priority-closure-r1`.
Zero conflicts, zero cherry-picks, **ancestry fully preserved** — which is the strongest form of
the founder's "preserve commit ancestry where possible".

**Containment is not survival, so I checked survival separately.** Of the 28 files PR #86 touched,
none is missing and none was reverted; nine are byte-identical and the rest were extended by later
layers. PR #86's own mutation-proven assertions (`CA17`, `CA17d`, `CA15a3`) still hold — `CA15a3`
was re-broken in this pass and went red (mutation M18r).

**Ending SHA:** see the commit at the end of this branch; the tree is `5c765a6` plus this pass's
two new suites, one registration line and this report.

---

## 1. Ownership map — one owner per law

Verified by **counting writers across the whole tree**, not the slices I already suspected:
`server.js`, `db.js`, every `ai/*.js` and every `lib/*.js`, with comments stripped so prose cannot
move the number. Pinned as `scripts/stack-ownership-smoke.js` (**27 assertions**, now in `npm test`)
rather than left as prose in a report nobody re-runs.

| Law | Owner | Writers |
|---|---|---|
| Focus create | `_createPersonalFocus` (`server.js`) | 1 |
| Focus outcome (personal) | `_recordPersonalFocusOutcome` | 1 |
| Focus outcome (team) | `ai/team-state.js` | 1, and the server never reaches into it |
| Focus relation declaration | `_declareFocusRelation` | 1, reached by 2 doors |
| Personal priority mark/unmark | `_setPersonalPriority` | 1, reached by 2 doors |
| Library shelf filing | `ai/shelf.js` `file()` | 1 rule owner, called twice — see below |
| Independent-origin identity | `ai/diagnose.js` `currentOriginCount` | 1; the Priority Office takes it as a parameter |
| Cross-evidence retrieval | `ai/cross-evidence.js` | 1 each for `edges`, `neighbourhood`, `loop` |
| Priority Office candidates | `ai/priority-office.js` `attentionQueue` | 1, plus the vocabulary and its wording |

**Two writers for Focus outcome is correct and is asserted as such.** Personal and team focus are
different objects at different grains — the documented two-products-one-kernel split — and the
assertion additionally pins that the team writer stays inside `ai/team-state.js`.

**One structural duplication, recorded rather than asserted away.** Shelf filing has one *rule*
owner (`ai/shelf.js`), but the *persistence sequence* around it — validate folder, call `file()`,
push if added — is written out at both doors instead of behind one server function, which is what
priority and the relation both do. The two are **currently identical, including the readability
gate**, and a new assertion pins that both doors carry it, so a divergence would now be caught.
Collapsing them is a refactor, and a refactor is not an integration.

---

## 2. The full human loop, walked

One player, the seeded Alma record, a real Chromium. Every step below is an assertion in
`scripts/stack-browser-check.js` or one of the HTTP suites.

| Step | What was proven |
|---|---|
| **Inquiry** | the open question is in the record and opens as a thread bound by `kind:id` |
| **inspect evidence** | provenance in a sentence; the private statement never reached the screen |
| **create Focus** | through the canonical owner, recording *what it addresses* |
| **ask why the Focus exists** | answerable from the record, in words rather than ids |
| **work / discuss** | Forum availability is stated by the server, not guessed by the page |
| **record outcome** | through `_recordPersonalFocusOutcome`, one writer |
| **ask what changed** | `observedSince` — a **count of records observed since**, never a claim |
| **mark priority** | staged as a verdict, marked *nothing* until confirmed, then first in the list |
| **unmark** | ordering returns to what the record alone says |
| **return Home** | one card, the still-open question, no badge and no number |
| **a lawful attention item** | `unresolved_after_focus_outcome`, said in plain words |
| **ask "why this?"** | a composed turn bound to the object, with the degraded notice when no model |
| **open the canonical object** | `openObjectThread(kind, id)` — the same door every surface uses |

**No copied truth** — nothing on the way to any screen carries a statement or a copy of an object.
**No prediction** and **no causation inflation** — asserted on the reply text and on the loop
payload, and mutation M7 (counting records from *before* the outcome as movement since) turns
`CE-G3` red.

---

## 3. The relation law

| Claim | Assertion | Mutation |
|---|---|---|
| bound context chooses evidence identity | `PC-B1`, `PC-F5`, `PC-F9` | M10, M11 |
| bound context chooses Focus identity | `PC-B3`, `PC-B4`, `PC-F10` | M11 |
| model cannot replace either | `PC-B1`, `PC-B3` + end-to-end smuggle `PC-F8`/`PC-F9` | M10 |
| only `supports` / `undermines` / `unclear` | `PC-C1`, `PC-C3`, `PC-A3` | — |
| confirmation required | `PC-F6`, `PC-F7`, `PC-E5` | — |
| changed relation supersedes the LIVE one | `PC-G4`, `PC-G5` | M12 |
| history remains | `PC-G4`, `PC-L2` | M12 |
| inaccessible evidence cannot be bound | `PC-F3`, `PC-F13`, `PC-G6` | M11 |

The smuggle test is the one that matters: a caller states a different `evidenceRef` and `focusId`
in the action's own arguments while the turn is bound elsewhere; the proposal is made, confirmed,
and **what gets written is the bound evidence on the bound focus**.

---

## 4. Priority Office

| Claim | Assertion | Mutation |
|---|---|---|
| server owns eligibility, order and reason | `PS-B1`–`PS-B4`, `PS-F4` | M9, M15 |
| the browser does not recalculate priority | `PS-B1`, `PS-B3`; no reason code exists in the front end | M15, M16 |
| same-origin repetition cannot inflate | `PO-C1`, `PS-H3` | M1r |
| a corrected record does not vote as current | `PO-D1`, `PS-I1` | M2r3 |
| explicit personal priority outranks the rest | `PC-H4` | M13 |
| unprioritising restores normal ordering | `PC-J2`, browser | M13 |
| personal priority changes no visibility | `PC-I2`, browser | — |
| nobody is scored | `PS-A5`, `PC-H5` | M14 |
| no numeric priority exists | `PS-A3`, `PC-E3`, `PC-H6` | M14 |
| no deterministic prediction exists | `PS-A4`, `PC-H6` | M14 |

---

## 5. Existing pilot closure, re-proven on the combined tree

| Surface | Result |
|---|---|
| governed object-thread Keep | `library-door-smoke` 21 |
| direct shelf folder management | `shelf-http-smoke` 33, `shelf-smoke` 23 |
| one visible Library | browser walk, both widths |
| Material picker honesty | `material-accept-smoke` 14, `material-reach-http-smoke` 87 |
| degraded assistant state | `composer-degraded-http-smoke` 13 + the browser walk, which runs with no key |
| simple firming graph | `chart-governance-smoke` 34 |
| external source links | `composer-smoke` 32 |
| High/Low Forum availability | `forum-smoke` 71, `composer-actions-smoke` 45 (`CA15a3`) |
| Home one-question law | `priority-surface-smoke` 46, browser |
| mobile composer behaviour | browser, both widths — 16px, no zoom, fits with a gutter |

---

## 6. The seventeen parameterised routes

Carried forward from `PREFIX_HOLE_ORPHANS`, dated 10 September 2026. Every one is **guarded** — my
first classification script reported "NO-AUTH-WRAPPER" for all seventeen, which was a broken regex,
not a finding, and I checked the declarations directly before writing anything down.

| Routes | Guard | Class | Why |
|---|---|---|---|
| `connections/:id/{cursor/reset,health,inspect,pause,resume}` | `manage_settings` | **A** | connector operator tooling; never a member journey |
| `evidence/:id/{reject,reverse}` | `manage_settings` | **A** | operator evidence governance; a member corrects through supersession |
| `mappings/:id/{activate,approve,edit,reject}`, `mappings/:provider/rollback` | `manage_settings` | **C** | genuinely orphaned *as a subsystem* — `mappings/awaiting`, the list an approval screen would read, is already recorded debt. Connectors are not in the pilot |
| `notes/:noteId/{pin,unpin,share,unshare}` | `requireAuth` | **D** | obsolete under LIB-2: the shelf is the canonical Library. `share` also runs a **second access model** (`noteGov.canShareToTeam` + node scope) beside the governed audiences — already recorded in PROTOCOL §7 as a pending founder decision. Their unreachability is currently what keeps that second rule out of use |
| `org-context/:id/supersede` | `requireAuth` | **C** | its siblings are already recorded debt; admin-time, not a pilot journey |

**Blockers: 0.** A Class C blocks only if it sits on a pilot journey; none of the seventeen appears
in Home, Inquiry, High, Low, Focus, Forum, Library, Material, graph or the priority surface. No fake
callers were created, and none of the seventeen was "fixed" to satisfy a test.

**The `notes/share` group is the one worth a decision** — not because it is broken, but because
giving it a door would put a second access rule in front of people.

---

## 7. Mutation map — sampled from every layer

**20 laws sampled, 20 bite, 0 crashes.** stdout and stderr both read; a non-zero exit with no
printed `FAIL` is reported as a crash and never as a bite.

| # | Layer | Mutation | Red in |
|---|---|---|---|
| M1r | #84/#86 origin law | repetition becomes corroboration | `PO-C1`, `PO-C2` |
| M2r3 | #84/#86 origin law | a superseded record votes as current | `focus-ownership-parity` (see below) |
| M3r2 | Focus authority | the outcome owner stops closing the focus | `FP8` |
| M4 | Library two-law split | filing stores a snapshot beside the reference | `shelf-smoke` |
| M5 | Library door | the object-thread Keep loses its governed action | `L9` |
| M6 | cross-evidence privacy | resolve the object without the gate | `CE-H2`, `CE-H3` |
| M7 | A→B outcome relation | count records from *before* the outcome | `CE-G3` |
| M8r | priority reason vocabulary | a live call site emits an invented code | `PO-F1`, `PO-F2` |
| M9 | priority reason | say it in code rather than words | `PS-F4`, `PS-H2` |
| M10 | bound evidence identity | let the model name the evidence | `PC-B1`, `PC-F9` |
| M11 | bound evidence identity | write a different ref in the confirm branch | `PC-F9`, `PC-F10` |
| M12 | relation history | overwrite instead of superseding | `PC-G4`, `PC-L2` |
| M13 | personal priority owner | unmarking becomes a no-op | `PC-J1`, `PC-J2` |
| M14 | personal priority | the mark reads as the organisation's, with a level | `PC-H5`, `PC-H6` |
| M15 | Home priority rendering | the browser re-sorts what the server ranked | `PS-B1`, `PS-B3` |
| M16 | Home priority rendering | the render is put behind a dead branch | `PS-C2`, `PS-C3` |
| M17 | one owner per law | a second writer for the priority mark appears | `stack-ownership` |
| M18r | Forum | a group High loses lawful Forum availability | `CA15a3`, `CA15a4` |
| M19 | Material honesty | the accept list is emitted empty | `M6` |
| M20 | graph governance | a point's value stops being computed from its refs | `CG7` |

### Four laws are guarded by a suite whose name does not say so

My first run recorded six misses. **Five were my targeting, not a coverage hole**, and finding that
out was the useful part:

- **M1/M2 (origin law)** — neither `origin-correction-smoke` nor `origin-independence-smoke` calls
  `currentOriginCount` **at all**. The independent-origin count is guarded by
  `priority-office-attention-smoke` and `focus-ownership-parity-smoke`.
- **M2r3 (a superseded record voting)** — `origin-correction-smoke`, the suite *named for
  corrections*, stays green. The law is caught at `npm test` level by
  `focus-ownership-parity-smoke`.
- **M4 (a stored copy on the shelf)** — `shelf-http-smoke` asserts the reply *says* "not a copy"
  but never inspects the stored record; the law is caught by the pure `shelf-smoke`.
- **M18 (Forum)** — the assertion is `CA15a3` in `composer-actions-smoke`, not in `forum-smoke`.

Every one of these laws **is** guarded, so none is a hole. But four load-bearing laws are guarded
*incidentally* rather than by the suite whose name a reader would reach for, and the sixth miss
(M3) was a genuine no-op of mine — a guard on `opts.via` that nothing ever sets. Recorded here
rather than fixed: renaming or re-homing four suites is not an integration.

---

## 8. Browser — 390x844 and 430x932

`scripts/stack-browser-check.js`, both widths, one pass each: **114 passed, 0 failed.**
Plus `priority-surface-browser-check` **39** and `library-browser-check` **22**.

Walked at both sizes: Home, the priority surface, "Why this?", Inquiry thread, priority mark and
unmark through the screen, High, Low, Focus, Library, Material picker, Forum availability, the
graph, and the A→B→NEXT loop. Checked at every screen: sideways scroll, elements cut off at the
edge, dead inline handlers, duplicate navigation, and false success states.

### The first run reported 26 failures. All 26 were my harness.

This is the fourth pass in a row where that has happened, so it is worth naming precisely:

1. **`event.preventDefault` flagged as dead.** `event` is the implicit parameter inside an inline
   handler and exists nowhere else; scanning from outside one, it looks undefined. Three false
   failures on every screen.
2. **`.notif-panel` flagged as overflowing.** It is a drawer parked at `translateX(100%)` by
   design. An element wholly outside the viewport is not cut off; the check now requires an element
   to *begin* on screen and *end* off it.
3. **The Library reported broken.** The route id is `notes` (the nav label is "Library"); I walked
   `navigate('library')`, which does not exist, so nothing rendered. Renaming the route in an
   integration pass is a change nobody asked for, so it is stated instead.

Each was diagnosed and the check corrected — not suppressed. **Zero product defects were found in
the browser.**

---

## 9. Regression

```
npm test  →  ✓ TRUTH LAYER GREEN — all sources parse, all suites pass.   (exit 0)
```

No asset stamp bump was needed: this pass changed no shipped asset (`js/`, `css/`, `index.html`
untouched), and `asset-version-smoke` is green on the existing stamp. **No stale-commit or
documentation guard was weakened** — `docs-status-smoke` (17) and `asset-version-smoke` (5) both
pass as they stand.

| Suite | | Suite | |
|---|---|---|---|
| `stack-ownership-smoke` (**new**) | 27 | `forum-smoke` | 71 |
| `stack-browser-check` (**new**, 2 widths) | 114 | `material-reach-http-smoke` | 87 |
| `priority-closure-smoke` | 68 | `chart-governance-smoke` | 34 |
| `priority-surface-smoke` | 46 | `shelf-http-smoke` / `shelf-smoke` | 33 / 23 |
| `priority-office-attention-smoke` | 38 | `composer-smoke` | 32 |
| `cross-evidence-smoke` | 39 | `library-door-smoke` | 21 |
| `composer-actions-smoke` | 45 | `material-accept-smoke` | 14 |
| `focus-ownership-parity-smoke` | 23 | `composer-degraded-http-smoke` | 13 + 1 |
| `origin-correction-smoke` | 51 | `private-evidence-smoke` | 18 |

---

## Live-provider and deployment items still unproven

These are **not code blockers**. Each needs a running provider or a deployed instance, and none can
be closed from here.

1. **No live model has ever run against this stack.** Every proposal in these passes was raised
   deterministically. What is proven is that the plumbing hands the model reason codes and one
   relation word and no identifiers — **not** that a live model phrases any of it well, and not
   how the grounding cage behaves on the new attention and connection context blocks.
2. **Not deployed.** This is CODE READY. Nothing here has run on Render, and the deployed instance
   is behind this candidate.
3. **`in_view` evidence binding has no screen.** Proven end to end over HTTP; no view lists
   individual records for a person to select, so in the product today the live binding is `sole`.
4. **"Since you last looked" needs the read-receipt decision.** Three of the six attention reasons
   cannot fire on Home until it is made. `mem.lastSeen` is deliberately not used as a substitute.
5. **`explicitly_prioritised`'s ordering was proven with one marked object**, not against a person
   who has marked many.
6. **Emulated viewports, not devices.** Two widths in Chromium; no iOS Safari, no real hardware.
7. **One reader, one squad, seeded records.** No concurrency, no second device, nothing at pilot
   scale.
8. **`OPENAI_API_KEY` gating is unexercised live** — it gates `canTranscribe`, the uncalled
   `transcribe`, and the cross-provider fallback only.

---

ONE OWNER PER LAW: **PASS**
CROSS-EVIDENCE: **PASS**
A->B LOOP: **PASS**
PRIORITY OFFICE: **PASS**
PRIORITY SURFACE: **PASS**
LIBRARY: **PASS**
FORUM: **PASS**
MATERIAL: **PASS**
GRAPH: **PASS**
MOBILE: **PASS**
npm test: **GREEN**

PILOT CODE BLOCKERS: **0**
LIVE-ONLY ITEMS REMAINING: **8**

READY TO LAND AS FINAL PILOT STACK: **YES** — as the code candidate. The eight items above are
live-provider and deployment work, and the first two of them are the ones that decide whether the
pilot reads well on the day, not whether it is correct.

Not merged.
