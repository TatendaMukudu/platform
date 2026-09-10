# Priority closure — round 1

**Base:** `claude/priority-surface-r1` @ `144a9bf8910d045838a6b308da3fdf9c5b94eccf`
**Branch:** `claude/priority-closure-r1`
**Ran:** `npm test`, `priority-closure-smoke` (new), `priority-surface-browser-check` (extended,
real Chromium at 390x844), the regression sweep below, and 22 mutations.

Two founder decisions, both closed.

---

## A. Bound evidence identity

### The architecture, as built

```
BOUND CONTEXT chooses WHAT     _boundEvidence(code, userId, object, claimed)   -> { ref, via }
MODEL may suggest RELATION     one of three words, and nothing else
HUMAN confirms                 the existing proposal dispatcher, unchanged
CANONICAL OWNER writes         _declareFocusRelation, still the only writer
```

The model is never handed an identifier and never authors one. `normalize()` retains `relation`
and **deliberately does not retain `evidenceRef`** — adding it was the obvious one-line fix for the
dead path and is exactly what the law forbids. `ground()` sets `args.evidenceRef` from the
server-resolved binding and from nowhere else, marked `deterministically_resolved`.

The model is told **`evidenceInView: true|false`** — a boolean. Not the ref, not the statement, not
a list. So it knows whether "this evidence" has a referent and cannot know or guess which.

### What counts as bound

Two bindings and no third:

| `via` | What it means |
|---|---|
| `in_view` | the page said which record is on screen, and it resolved inside the object's lawful neighbourhood |
| `sole` | the neighbourhood holds exactly one current record, so "this evidence" has one possible referent |

Anything else returns **null**, and null is not a rule somebody has to remember — it is a missing
capability. `requiresBoundEvidence` on the action means it is not even *offered* when nothing is
bound, so there is nothing for the model to guess with, and the person is asked which they mean.

### The defect this found in my own first attempt

The first version scoped the binding to `self.raw.signals` — the bound object's own records. **A
personal focus carries no records of its own** (`_publicPersonalFocus` has no signals field; its
evidence lives on the thing it addresses). So on the founder's exact example — *"the user is
discussing evidence:e123 in the context of focus:f456"* — nothing could ever bind, and the fix for
the dead path would have been dead in the same place.

Found because mutations `C6` and `C7` both refused to bite: I could not break a binding that never
happened. The scope is now the focus **plus the one object it declares it `addresses`** — an
existing field, the same one the cross-evidence reader traverses, resolved through the same
authorised set. Not "any evidence this reader can see", which would let a page bind an unrelated
record to whatever focus happens to be open.

### The other defect: the writer supersedes the wrong record

`_declareFocusRelation` found the prior call with
`find(r => r.ref === ref && r.by === userId)` — the **oldest** record, which after one change of
mind is already superseded. A third call compared against it, saw a difference that was not there,
superseded an already-superseded record a second time, and pushed a duplicate. Say `unclear` twice
after `supports` and the focus carried **two live `unclear` calls**.

Found by `PC-G5` on the first run. History that gains entries nobody made is not preserved history.
Fixed by excluding superseded records from the search; mutation `C8` reverts it and `PC-G5` and
`PC-L2` both go red.

### The ten tests §A asked for

| # | Asked | Assertion | Mutation |
|---|---|---|---|
| 1 | model cannot supply a different `evidenceRef` | `PC-B1`, and end to end `PC-F9` | `C1` |
| 2 | model cannot supply a different focus | `PC-B3`, `PC-B4`, `PC-F10` | `C2`, `C21` |
| 3 | bound evidence succeeds after confirmation | `PC-F5`–`PC-F10` | `C21` |
| 4 | no bound evidence, no proposal | `PC-D1`, `PC-D3`, `PC-F13`, `PC-F15` | `C4`, `C6`, `C7` |
| 5 | inaccessible evidence cannot be bound | `PC-F3`, `PC-G6`, `PC-F13` | `C6`, `C10` |
| 6 | the three words only | `PC-C1`, `PC-C3`, `PC-A3` | `C3`, `C19` |
| 7 | no write before confirmation | `PC-F7` | `C21` |
| 8 | a confirmed proposal writes exactly once | `PC-F11` | `C8` |
| 9 | replay cannot duplicate or change it | `PC-F12`, `PC-G5` | `C22`, `C8` |
| 10 | changing your mind supersedes | `PC-G4` | `C9` |

**Test 1, walked end to end (`PC-F8`/`PC-F9`).** A caller states `evidenceRef: 'only1'` and
`focusId: 'f_other'` in the action's own arguments while the turn is bound to `ev1`. The proposal
is made, confirmed — and what gets written is `ev1`, on the bound focus. The public projection of a
proposal deliberately carries no payload, so the written record is the evidence: the only
observation that cannot be satisfied by a proposal that looks right and does something else.

---

## B. The personal attention override

**One owner: `_setPersonalPriority`.** No new object, no new store, no Priority kind
(`PC-K3`, `PC-K5`). `mem.prioritised` already existed and was already read by the Priority Office in
two places; what it never had was anything that could write it, so the top of the ranking law
— *"a human said so, and nothing outranks that"* — could not fire for anybody.

**The vocabulary is `true` / `false`.** The route takes one boolean and cannot express anything
else; there is no level, no weight, no rank, no AI-authored value (`PC-E3`, `PC-H6`). A missing
field is refused rather than read as "off" (`PC-J4`) — guessing which way somebody meant a toggle
is how a mark gets removed by accident.

**Two named actions, not one with a boolean argument.** An action whose meaning depends on an
argument the model may omit has a default, and the default here would be switching something *on*
in somebody's record. `prioritise_object` and `unprioritise_object` take **no arguments at all**
(`PC-E1`, `PC-E2`); the target is the object the turn is bound to.

### Does an explicit command need confirmation?

The founder asked me to determine this from existing law rather than invent an exception. The law
is already in the code and is exactly bimodal — `PC-E5` now pins it:

> **Every action that writes requires confirmation. Every action that reads does not.**
> The four `confirmation: false` actions are `inspect_inquiry`, `show_evidence`,
> `request_research`, `navigate_to_object` — all reads. Everything else confirms.

And the control surface says the same thing in `beginObjectAction`: *"Buttons do not own mutations.
They stage the same typed request the model may propose and put it through the composer; the server
still resolves the object and confirmation still crosses the one dispatcher."* `keep_in_library` is
the closest analogue — private, reversible, creates no copy — and it confirms.

**So: confirmation, both from the composer and from the button.** No exception was invented, and
`PC-E5` will go red if anybody carves one later. The browser walk proves it is real: `N29` asserts
that clicking the control has marked **nothing** yet, and only after `N30`'s confirmation does
`N31` see it.

### Privacy

- Written to the actor's own memory. Nobody else's list moves (`PC-I3`, `PC-I5`).
- **No visibility change**: `shared` and `forumAvailable` are unchanged (`PC-I2`), and `N37` checks
  the same thing through the screen after a full mark-and-unmark cycle.
- A reader cannot mark an object they cannot open — 404, never an existence oracle (`PC-I4`).
- The reason says the **person** marked it, in the sentence (`You marked this as important.`) and
  in the detail (`byYou: true`), so it can never read as the organisation having decided
  (`PC-H5`). Mutation `C14` — rewriting it as *"The club has flagged this as a priority 1 item"* —
  turns `PC-H5` and `PC-H6` red.
- Unmarking returns the list to what the record alone says (`PC-J2`, `N36`).

### A third defect: the writer asserted its own success

`_setPersonalPriority` returned `prioritised: want` — an echo of what was asked for. Mutation `C18`
removed the unmark and the function still answered *"prioritised: false, done"*. That is the same
class of bug as a hardcoded `safe: true` (AGENTS.md, epistemic invariant 1: *a module may never
assert its own safety*). It now reads back what is actually stored.

---

## C, D. The Priority Office and Home

Nothing in the desk changed except the detail on one reason. A marked object ranks first because
`explicitly_prioritised` is already first in the declared order — no score, no number
(`PC-H4`, `PC-H6`). The Priority Office **only reads** the marker and cannot write one (`PC-K4`).

Home is untouched. `N33` and `N34` confirm on a real phone-sized screen that a personally
prioritised item shows in the existing one-card surface, with no badge, no rank number, no
percentage, and still at most three things. No pin board, no priority screen, no new panel.

---

## E. "Since last looked"

Not solved, as instructed, and `mem.lastSeen` was **not** used as a substitute — the render race
identified in the previous pass is unchanged. Neither founder decision needed it. The honest
limitation stands exactly as written in `PRIORITY_SURFACE_R1.md`: the three "since you last looked"
reasons need a per-object read receipt, which is a founder decision nobody has made.

---

## Touched another lane — a guard that was passing 18 routes nothing calls

While declaring the new route I found `reachability-smoke`'s matcher was
`front.includes(route.split(':')[0])` — it truncated a route at its first parameter and looked for
the **prefix**. So `/api/objects/:kind/:id/priority` was "reachable" because something else fetches
something under `/api/objects`, and so was every route sharing a prefix with a route anybody calls.

**Reproduced**, then verified one route at a time: seventeen pre-existing routes had no caller and
were passing this guard, and **two of them were built in the last fortnight by me** —
`/api/objects/:kind/:id/related` from the cross-evidence pass, which I had reported as reachable.

The matcher now requires the literal tail as well. The seventeen are recorded in a **separate,
dated `PREFIX_HOLE_ORPHANS` set** — not in `KNOWN_ORPHANS`, which is frozen debt from the September
sweep and must not become a parking space. Keeping them apart keeps two facts distinguishable: what
the sweep found, and what the guard itself was hiding. The list is pinned by count as well as by
predicate, so it may shrink and cannot grow (`the prefix-hole list still describes reality`).

Deciding what to do with those seventeen is its own piece of work and is not a side effect of
fixing a regex.

---

## Mutations

**22, and 22 bit.** Two laws needed **two edits** to break — the model can only smuggle an id if
`normalize` retains it *and* `ground` reads it — so the harness applies companion edits and restores
all of them. A non-zero exit with no `FAIL` line is a crash and never counted.

| # | Mutation | Red |
|---|---|---|
| C1 | let `ground` read the model's `evidenceRef` (+ retain it) | `PC-B1`, `PC-F9`, `PC-F10` |
| C2 | let a focus identifier survive grounding (+ retain it) | `PC-B3` |
| C3 | accept any word as a relation | `PC-C1`, `PC-C2` |
| C4 | offer the action with nothing bound | `PC-D3` |
| C5 | tell the model WHICH evidence is in view | `PC-D4` |
| C6 | bind from anything the reader can see | `PC-F13`, `PC-F14` |
| C7 | pick the first record when several are in scope | `PC-F15` |
| C8 | supersede the oldest call instead of the standing one | `PC-G5`, `PC-L2` |
| C9 | overwrite an earlier call instead of superseding | `PC-G4` |
| C10 | drop the readability gate on the evidence | `PC-G6` |
| C11 | mark without resolving the object through the gate | `PC-I4`, `PC-J5` |
| C12 | read a missing `prioritised` field as "off" | `PC-J4` |
| C13 | drop `byYou` from the reason detail | `PC-H5` |
| C14 | make the mark read as the organisation's, with a level | `PC-H5`, `PC-H6` |
| C15 | let a priority mark write without confirmation | `PC-E4`, `PC-E5` |
| C16 | add a priority level to the vocabulary | `PC-E3` |
| C17 | remove the human label from a confirm card | `PC-E6` |
| C18 | make unmarking a no-op | `PC-J1`, `PC-J2`, `PC-J3` |
| C19 | add a fourth relation word | `PC-A1`, `PC-C1`, `PC-C2` |
| C20 | stop reporting the mark to its owner | `PC-I1` |
| C21 | write a different evidence ref in the confirm branch | `PC-F9`, `PC-F10` |
| C22 | remove the replay guard | `PC-F12` |

### Assertions that could not go red, and were rewritten

- **`PC-E6` was satisfied by a substring.** It asked `map.includes(type + ':')`, and
  `unprioritise_object:` **contains** `prioritise_object:` — so deleting the prioritise label left
  it green. Anchored to a real key boundary.
- **`PC-F3` was testing the wrong thing.** It checked that another *user's* evidence does not bind
  — but the authorisation gate already stops that, so the mutation was a no-op against it. The law
  that needed testing is same-reader, different-object: `PC-F13` now uses a record the reader **can**
  see which belongs elsewhere, and `C6` bites it.
- **`PC-J1` tested an echo, not an effect** — see the third defect above. Fixed in the production
  code rather than in the assertion.
- **`PC-G1` was made vacuous by my own suite ordering** once the confirm block landed before it.
  The direct-door block now runs against its own second focus, so no count means two things.

---

## What I could not verify

- **No model ran.** Every proposal in this pass was raised through `requestedAction`, which is
  deterministic. So what is proven is that the *plumbing* gives the model exactly one word and no
  identifier — **not** that a live model phrases the offer well, or that it picks the right one of
  the three. The grounding cage's behaviour on the new context block is unverified with a key.
- **`in_view` has no screen sending it yet.** The turn accepts `evidenceRef` and it is proven end
  to end over HTTP, but no view lists individual records for a person to select, so in the product
  today the live binding is `sole`. Building an evidence view is the remaining UI work for this
  decision; it is not a law question.
- **One reader, one squad, seeded records.** No concurrency, no second device, and nothing at
  pilot scale. In particular, two tabs confirming the same proposal are guarded by the existing
  409, but simultaneous marks on different objects were not exercised.
- **The seventeen prefix-hole orphans were verified by search, not by running each route.** I
  confirmed nothing in the front end mentions their final segment; I did not confirm each is
  genuinely unused by some path I did not think of.
- **Not deployed.** CODE READY. Nothing here has run on Render.

## Also touched

- `index.html` — cache stamp `20260910a` → `20260910b`, because `js/app.js` changed and
  `asset-version-smoke` correctly went red.

---

## Test results

```
npm test  →  ✓ TRUTH LAYER GREEN — all sources parse, all suites pass.   (exit 0)
```

| Suite | Result |
|---|---|
| `priority-closure-smoke` (**new**, registered in `npm test`) | **68** passed |
| `priority-surface-browser-check` (extended, real Chromium 390x844) | **39** passed |
| `priority-surface-smoke` | 46 |
| `priority-office-attention-smoke` | 38 |
| `cross-evidence-smoke` | 39 |
| `composer-actions-smoke` / `composer-visibility-smoke` | 45 / 13 |
| `turn-grounding-smoke` | 28 |
| `forum-smoke` | 71 |
| `focus-ownership-parity-smoke` / `focus-continuity-smoke` | 23 / 44 |
| `highs-lows-smoke` | 24 |
| `origin-correction-smoke` / `origin-independence-smoke` | 51 / 14 |
| `epistemic-invariants-smoke` | 16 |
| `reachability-smoke` / `deadcode-scan` | 11 / 12 |

---

BOUND EVIDENCE IDENTITY: **PASS**
DECLARED RELATION REACHABLE: **PASS**
HUMAN CONFIRMATION: **PASS**
ONE PRIORITY OWNER: **PASS**
NO PRIORITY SCORE: **PASS**
PRIORITY PRIVACY: **PASS**
COMPOSER PRIORITY: **PASS**
HOME SURFACE: **PASS**
A->B->NEXT: **PASS**
npm test: **GREEN**

PILOT PRIORITY CAPABILITY COMPLETE: **YES** — with one stated limit. The priority override is
complete and driven from a screen end to end. The declared relation is complete as law and as
plumbing, and live in the product through the `sole` binding; the `in_view` binding waits on an
evidence view, which is UI work, not a decision.

Not merged.
