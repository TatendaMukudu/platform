# Pilot crackdown — rounds 1 and 2

**Base:** `main` @ `680516631c5e53b6c86bc5d436a98efe8eea630f` — fetched and confirmed; **main has
not moved** since the final stack landed.
**Branch:** `claude/pilot-crackdown-r1`

---

## Scope actually covered, stated first

The brief has 43 sections. This pass closed the ones where a defect was **reproduced and fixed**,
and measured the persistence and transfer questions. It did **not** cover everything, and the
sections left open are listed in "Not covered" at the end rather than being quietly implied as
done. Nothing below is claimed on reading alone unless it says so.

---

## Root-cause map — the five live defects, each reproduced before it was touched

| # | What the founder saw | Actual cause | Where |
|---|---|---|---|
| 1 | A question became a Focus | A raw-turn fallback took the person's whole turn as the Focus title whenever the model proposed `create_focus` and supplied none — with no test that the turn expressed any intent | `ai/composer-actions.js` |
| 2 | "1 undefined" x4 in Settings | The seed wrote metrics as **bare strings** into a store whose routes look records up by `metricId` | `scripts/seed-alma.js` vs `server.js` |
| 3 | "Alma College Men's Soccer1" | The reach count rendered as a **bare integer** in a span with no margin, no unit and no delimiter, immediately after the name | `js/app.js`, `css/styles.css` |
| 4 | Native prompts | `prompt()` for naming a Library folder; `window.prompt()` for correcting a proposal | `js/app.js` |
| 5 | "Send personalised email invites" | **No email provider exists anywhere in the repository** — the card promised what the panel beneath it admitted was not happening | `js/app.js` |

### 1. A question is not a commitment

**Reproduced** before any change, across all four object contexts:

```
FOCUS TITLED: "Why is this the thing worth looking at, and what is it resti"  <- Why is this ...?
FOCUS TITLED: "Why this?"                                                     <- Why this?
FOCUS TITLED: "Who can see this?"                                             <- Who can see this?
   ... 7 of 7 questions, in inquiry / focus / high / low
```

Two paths did it. The raw-turn fallback took `current.trim()` as the title; and a second branch
saw the word "this" and lifted the **previous** user turn instead — so "Should I work on this?"
would have titled a Focus with whatever was said before it.

**The fix is the discipline the product already applies everywhere else.** `record_focus_outcome`
refuses "helped" unless the person wrote *helped*; `visibility` refuses to widen unless the person
wrote *share*. `create_focus` was the one consequential action that would accept anything at all.
It now takes wording from the turn only when the turn is not phrased as a question **and** states
an intention to act — and `create_focus` requires lawful wording, so a question produces no
untitled Focus either, just a sentence saying what would start one.

**This reads sentence shape, not sentiment.** It asks whether the sentence is interrogative and
whether it contains a stated intention — the same syntactic test the outcome check makes for a
literal word. It does not classify mood, infer direction, or decide what somebody meant. `PX-A8`
pins that no lexicon of moods or directions is present.

**The control path is exempt, and had to be.** "Work on this" stages the action and then asks what
you want to change; the answer is a bare noun phrase with no marker and no question mark. Pressing
the button *is* the declaration, so `requested: true` bypasses the test — and `PX-A7` proves the
guard is doing real work by showing the same words are refused on the model-proposed path.

### 2. Metrics had two shapes, and only one symptom was visible

The canonical shape is the one `POST /api/metrics` has always written:
`{ metricId, name, source, order, createdAt }`. The seed wrote `['Training Load', 'Availability',
'Minutes', 'Sleep']` into the same store.

That single mismatch caused **three** defects, two of them silent:

1. Settings rendered `m.name` on a string → "1 undefined / 2 undefined / 3 undefined / 4 undefined";
2. `PUT /api/metrics/:metricId` could never match a seeded metric — **none could be renamed**;
3. `deleteMetric` could never match one either — **none could be removed**.

A coach would have found 2 and 3 the first time they tried to tidy the list, in pilot week.

**Fixed at the source, with one owner.** `_metricRecord` is the single definition; the seed, the
write route and the migration all build through it. The id is **derived from the name**, so the
seed and the server produce the identical id (`met_etac7z` for "Training Load" in both) and a
restart never churns identities.

**Data already in the database is repaired, not reset.** `_migrateLegacyMetrics` runs once at
startup beside the existing note migration. Proven idempotent: a canonical store returns `0`
repaired and triggers no save; a legacy store is repaired to the seed's exact ids; a second run
changes nothing.

### 3. The count that read as part of the name

```js
${esc(a.label)}${... ? ` <span class="iq-aud-n">${esc(a.reaches)}</span>` : ''}
```
with `.iq-aud-n{opacity:.7;font-variant-numeric:tabular-nums}` — no margin, no unit, no delimiter.

**The number was never wrong; it was never labelled.** And the intended form was already written
down twice: the route producing the field says *"Coaching staff · Men's Soccer (2 people)"*, and
`_pickAudience` two functions below says *"Right now that is 1 person."* This chip was the one copy
that drifted. It now renders `(1 person)` / `(N people)` — the house form.

Deliberately **not** fixed with a margin: that would have left a bare number beside a name, which
is the actual defect. A group genuinely named "Squad 1" still reads correctly.

### 4. Native prompts on the pilot path

Full inventory: **16** native dialogs (`js/app.js` 4 prompt + 11 confirm, `js/tree.js` 1 confirm).

| Site | Classification | Disposition |
|---|---|---|
| `prompt('Name this folder')` | **pilot-facing** | Replaced with the existing `.iq-field` inline row |
| `window.prompt('What should I change?...')` | **pilot-facing** | Replaced with an inline field inside the proposal card |
| `prompt(...role holder...)`, `prompt('What did you do?...')` | leader/admin tooling | Left; not on the member path (`PX-D6` pins that MemberApp calls no `prompt()`) |
| 12 `confirm(...)` | mostly admin/settings destructive actions | Left — a native confirm on a delete is a different and much weaker complaint than a prompt asking for content, and replacing twelve of them is a UI project, not a closure item |

**No second modal system was invented.** Both replacements use `.iq-field` / `.iq-field-input` /
`.iq-proposal-actions`, which the composer, the continuity prompt and the disagree flow already use.

### 5. Email

**Reproduced: nothing sends email.** No `nodemailer`, `sendgrid`, `postmark`, `mailgun`, SES, SMTP
client, queue or send call exists in `server.js`, `db.js`, `package.json` or `js/app.js`.

The card said *"Send personalised email invites"*. The panel it opened said *"(Email delivery is not
yet active — you copy and send the link yourself.)"* The card is what a coach reads first.

**EMAIL DELIVERY ACTUALLY SENDS: NO.** No email system was built for the pilot. The label now
describes what the feature genuinely does — *"Create one invite link per email address"* — and the
panel states it plainly rather than in a parenthetical afterthought. The capability itself is real
and unchanged: it mints one unique invite link per address.

---

## Persistence and memory — measured, not guessed

### The state lifecycle, as it actually runs

```
Neon iq_store rows  ──►  db.loadStores()  ──►  _applyUnits()  ──►  in-memory stores
   'store:<name>:<org>'      one SELECT           replace, not merge
                                                          │
                          scheduleSave() ◄── mutation ─────┘
                                │
                 _durableUnits() → hash each unit → write ONLY changed units (CAS on rev)
```

**The legacy blob is not in the normal path.** It is passed to `_reconstruct` as a **function** and
is called only if there are no split rows at all, or if the split read throws. A healthy start
never pays for it. `PX-F3` pins that, and mutation X17 (awaiting it eagerly) turns it red.

### The measurements, from the real Alma seed

| | |
|---|---|
| Durable units | **16** |
| **Total store, every unit, every org** | **110.2 KB** (112,836 bytes) |
| Largest unit (`inquiryStates:alma-mens-soccer`) | 54.3 KB |
| Next two | `orgSignals` 22.7 KB, `orgUsers` 15.5 KB |
| Per-org partitioning | every unit is `store:<name>:alma-mens-soccer` |

**BYTES PER COLD START: ~110 KB** — one `SELECT ... WHERE store_key LIKE 'store:%'`, 16 rows.
**BYTES PER LOGIN: 0** — login reads in-memory state; no DB read is issued.
**BYTES PER HOME LOAD: 0** — Home reads in-memory state.
**BYTES PER TYPICAL WRITE: the changed unit only.** A focus outcome rewrites
`store:userAiProfiles:<org>` (~1.6 KB); a check-in rewrites its own unit. `PX-F4` pins the
hash-gate and mutation X18 (write everything every cycle) turns it red.

### So where did 4.6 GB come from?

**It cannot be the current code, and the arithmetic says so.** At 110 KB per cold start, 4.6 GB is
**~42,000 cold starts** — implausible for a one-person pilot.

The repository records the answer in its own comment at the startup path:

> *"Reading 21 MB on every cold start to delete it a moment later is what put the database at 86%
> of its monthly network allowance."*

At **21 MB** per cold start, 4.6 GB is **~220 cold starts plus writes** — entirely plausible for
the period before split persistence landed. **The 4.6 GB is a spent historical bill on a monthly
counter, incurred by the blob era, and Neon's allowance resets monthly.**

**I could not confirm this against Neon.** There is no `DATABASE_URL` in this environment and the
deployed host is refused by the egress policy, so no live byte counter, row count or `pg_column_size`
was read. What is measured above is what the code will transfer, computed from the real seed.

### Projected 30-user pilot month

Assumptions stated so they can be argued with: 30 users, 20 working days, 2 logins/day each,
6 Home opens, 4 object opens, 2 writes; 40 cold starts/day (Render free-tier spin-down is
aggressive); 4 deploys.

| | |
|---|---|
| Cold starts | 40/day x 110 KB x 30 days = **132 MB** |
| Writes | 30 users x 2 writes x 20 days x ~10 KB = **12 MB** |
| Reads after start | **0** — served from memory |
| **PROJECTED MONTHLY TRANSFER** | **~150 MB** |

**Against a 5 GB allowance that is about 3%.** **TRANSFER BLOCKER: NO**, on the measured shape of
the current code. The founder's instruction not to solve this by buying a bigger plan is the right
call: there is nothing left to buy headroom for.

### The honest weakness in the current design

`loadStores()` reads **every unit for every organisation** — `WHERE store_key LIKE 'store:%'`, no
org filter. For one pilot org at 110 KB that is not a cost problem, and I did **not** rebuild it
into lazy per-org hydration: that is a real architectural change with cross-org and readiness
consequences, and at 110 KB it would be optimising something that is not costing anything.
**WHOLE-PLATFORM HYDRATION REQUIRED: YES**, stated rather than hidden, with `PX-F5`/`PX-F6` pinning
the total at under 512 KB so that if it ever stops being small, a test goes red before a bill does.

---

## Mutation map

**18 mutations, 18 bit, 0 crashes.** stdout and stderr both read; a non-zero exit with no printed
`FAIL` is a crash and never a bite.

| # | Mutation | Red |
|---|---|---|
| X1 | remove the question guard entirely | `PX-A1`, `PX-A2`, `PX-A3`, `PX-A4`, `PX-A7` |
| X2 | keep the intent marker, ignore the question mark | `PX-A1`, `PX-A2`, `PX-A4` |
| X3 | remove the control-path exemption | `PX-A6` |
| X4 | let the antecedent branch ignore the guard | `PX-A4` |
| X5 | stop requiring lawful wording for a Focus | `PX-A2` |
| X6 | drop the clarification, leaving silence | `PX-A3` |
| X7 | make metric ids random | `PX-B2`, `PX-B9` |
| X8 | overwrite an existing metric id | `PX-B3` |
| X9 | seed bare strings again | `PX-B5`, `PX-F8` |
| X10 | render `m.name` again | `PX-B7` |
| X11 | bare integer beside the name again | `PX-C1`, `PX-C2` |
| X12 | restore the folder prompt | `PX-D1`, `PX-D6` |
| X13 | remove the inline field's container | `PX-D3` |
| X14 | restore the correction prompt | `PX-D4` |
| X15 | promise to send email again | `PX-E2`, `PX-E3` |
| X16 | split persistence stops being the default | `PX-F1` |
| X17 | load the legacy blob eagerly | `PX-F3` |
| X18 | write every unit every save | `PX-F4` |

### Four of my own assertions matched my own comments

`PX-A8` went red against the word "mood" inside a sentence promising not to read moods; `PX-E1`
and `PX-E2` matched a comment quoting the old email claim verbatim; `PX-B7` failed against three
*correct* `${m.name}` call sites elsewhere in the file. All four were rewritten to read decommented
source and to scope to the function under test. This is the fifth pass running that harness prose
has produced a false failure, which is why it is recorded rather than quietly fixed.

### Two existing tests were rewritten rather than trusted

- **`SX11c`** required `async newShelfFolder()` — the *keyword*, not the behaviour — so it went red
  when the opener became synchronous. The law it states is that the door exists. Rewritten to
  assert all **three** parts (control in markup, handler behind it, container for the field) plus
  the route call: strictly stronger than before, and it would now catch an inline field with no
  container.
- **`library-browser-check` B2** created a folder by accepting a **native dialog**. It now presses
  New folder, types into the field and presses Create — what a person does. It also asserts no
  dialog appeared. The old version could not have caught a field that never rendered.

---

## Test results

```
npm test  →  ✓ TRUTH LAYER GREEN — all sources parse, all suites pass.   (exit 0)
```

| Suite | | Suite | |
|---|---|---|---|
| `pilot-crackdown-smoke` (**new**) | 40 | `persistence-durability-smoke` | 61 |
| `stack-browser-check` (2 widths) | 114 | `persistence-smoke` | 28 |
| `library-browser-check` | 24 | `db-cas-smoke` | 21 |
| `priority-closure-smoke` | 68 | `boot-bandwidth-smoke` | 12 |
| `priority-surface-smoke` | 46 | `shutdown-durability-smoke` | 7 |
| `composer-actions-smoke` | 45 | `shutdown-boundary-smoke` | 7 |
| `cross-evidence-smoke` | 39 | `persistence-cas-boundary-smoke` | 9 |
| `priority-office-attention-smoke` | 38 | `delete-cas-boundary-smoke` | 7 |
| `shelf-http-smoke` | 33 | `reachability-smoke` / `deadcode-scan` | 11 / 12 |
| `stack-ownership-smoke` | 27 | `asset-version-smoke` / `docs-status-smoke` | 5 / 17 |

Asset stamp bumped `20260910b` → **`20260910c`** (client assets changed).

---

## NOT COVERED — the sections this pass did not close

Listed because a 43-section brief silently half-answered is worse than one honestly bounded.

- **§1 demo durability, §32 restart harness** — not built. The seed-on-boot path (`SEED_ALMA=1`,
  skips when the org exists) reads as idempotent, but I did **not** prove restart durability
  against a real database, because there is none in this environment. **DEMO RESEED REQUIRED:
  UNKNOWN.** This is the highest-value remaining item.
- **§6, §7 first-open failures and retry law** — **not diagnosed.** "Your record could not be
  loaded" and "This could not be opened right now" are the founder's most user-visible complaints
  and I did not reach them. They need the deployed instance's status codes and timings, which are
  unreachable from here; a local reproduction against a cold process would be the next best thing
  and was not attempted.
- **§10, §11 Focus history graph and duplicated content** — not investigated.
- **§14, §15 Settings role separation, Platform Grade audit** — **not done.** Developer controls
  (Run LLM self-test, Load demo organisation, load-cost diagnostics) remain coach-visible, and the
  Platform Grade / Active Features claims ("Behavioral trend analysis", "Wellness alerts") are
  **not audited against real behaviour**. This is the largest untouched section and it carries a
  real risk: a claim implying profiling that does not exist.
- **§16 Settings navigation bug, §18 terminology label, §19 mobile Settings** — not addressed.
- **§20–§25 Members, org tree, add member, join links, spreadsheet import** — **not audited
  behaviourally.** Only §22 (email) was proven, and it was proven negative.
- **§36 projection** — modelled from measured unit sizes, not from live telemetry.

---

## Round 2 — disposition of the independent Codex audits

### One of the two audits does not exist

`codex/work-pilot-independent-audit-r1` **is not on the remote**, and commit `e69a9ba` is not a
valid object in this repository:

```
$ git fetch origin codex/work-pilot-independent-audit-r1
fatal: couldn't find remote ref codex/work-pilot-independent-audit-r1
$ git cat-file -t e69a9ba
fatal: Not a valid object name e69a9ba
```

`docs/reviews/CODEX_PILOT_CRACKDOWN_CHECKPOINT_A.md` exists on **no** fetched branch. Nothing from
Checkpoint A is disposed of below, because nothing from it could be read. If it was pushed
somewhere else, or under another name, it needs re-pointing.

`codex/onboard-pilot-audit-r1` @ `d2d64f3` was read in full and every finding is dispositioned.

### Every finding, reproduced first

Codex's report is an assertion until it fails on this branch. All six were re-run here before
anything was changed; five reproduced exactly, and the reproductions are the basis for the fixes.

| # | Finding | Reproduced? | Disposition |
|---|---|---|---|
| **PB-1** | Add Member creates an account its invite cannot activate | **YES** — 200, `passwordSet:false`, then 400 "An account with this email already exists", account dormant forever | **FIXED** |
| **PB-2** | XLSX import is UI only | **YES** — picker accepted `.xlsx`; `_previewImportFile` calls `file.text()`, never `XLSX.read` or `arrayBuffer` | **INTERFACE MADE TRUTHFUL**; implementation is an open decision |
| **PB-3** | Quoted CSV is column-shifted | **YES** — `"Lovelace, Ada",ada@example.com,member` parsed as `{name:"Lovelace", email:"Ada", role:"ada@example.com"}` | **FIXED** |
| **PB-4** | Invite is not bound to the entered email | **YES** — invite stored no email; registering a *different* address returned 200 | **FIXED** |
| **PB-5** | Invite authority depends on node leadership | **YES** — admin without leadership 403, with leadership 200 | **NOT CHANGED — founder decision** |
| **PB-6** | Tree create not retry-safe; blank name stored | **YES** — two identical creates made two nodes; `"   "` stored a node with an empty name | **FIXED** |
| *(read-only)* | CSV preview interpolates cells into `innerHTML` unescaped | **REPRODUCED** — Codex marked this Read; a cell of `<img src=x onerror=...>` parses and is interpolated raw into an admin's browser | **FIXED** |

### PB-1 and PB-4 were two halves of one defect, and fixing them together closed a hole

`invite-info` already returned `invite.email` ("prefill if invite was email-targeted") and
`join-invite` already fell back to it. **Only the writer was missing** — `/api/auth/invite` stored
the address as `label`, presentation metadata, so the binding those two routes were written for
never existed. That is why a targeted link could be redeemed by anyone under any address.

So the fix completes an existing design rather than adding one:

1. An invite whose label **is an email address** now stores `email` and is bound to it. A label
   that is not an address ("First Team intake") binds nothing, so a general join link is unchanged.
2. A bound invite redeemed under a different address is **403**.
3. `join-invite` **activates** an existing dormant account when the invite names that address —
   instead of the dead-end refusal.

**Activation is safe precisely because the binding now exists.** It requires the invite to name the
address, the account to be in the same organisation, and `passwordSet === false`. An account that
has ever had a password is untouched and still gets the duplicate refusal, so this can never become
a takeover route. No ontology was decided: the account, the token and the set-password semantics
all already existed; the step joining them did not.

**The message on the screen — "Share this link so they can set their password" — is now true.** It
was not before.

### Two findings are product decisions, and are recorded rather than invented around

**XLSX import.** Not implemented, and implementing a workbook reader is a product decision. The
interface is now truthful instead: the picker offers `.csv` only, the card says "Upload a CSV
file", the panel says Excel workbooks are not read yet and to save as CSV, and a workbook dropped
in anyway is **refused with a sentence** rather than silently parsed as text and corrupted.

> **Open decision:** implement XLSX import (the repository already has an attachment-side XLSX
> processor that onboarding does not use), or leave CSV as the supported format for the pilot.

**Email delivery.** Independently confirmed: no provider, client, queue, SDK or send call in
`server.js`, `db.js`, `package.json` or `js/app.js`. `/api/auth/invite` stores a token, logs the
URL and returns it. **EMAIL DELIVERY ACTUALLY SENDS: NO** — unchanged from round 1, where the card
was already corrected to "Create one invite link per email address".

> **Open decision:** build email delivery, or keep link-sharing as the pilot's onboarding method.
> Nothing was built for the pilot, per instruction.

**PB-5, invite authority.** Reproduced and deliberately unchanged. The route requires
`_isLeader(...)` while the join-link listing accepts admin/superadmin or `manage_settings` — two
gates giving different answers to one question. Which is correct is an authority-model decision,
and `L-AU1` (membership describes structure; explicit leadership grants authority) argues both ways
depending on whether onboarding is a structural or a leadership act.

> **Open decision:** is minting an invite something any org admin may do, or only somebody who
> currently leads a node?

### Assertions added, and mutation-proven

`scripts/onboard-invite-smoke.js` (**new**, 20 assertions, registered in `npm test`) and nine
additions to `pilot-crackdown-smoke` (now 49).

**20 mutations run; 18 bit, 1 crashed, and 1 could not be isolated.** Three of the first-run misses
were my own mutations being no-ops or aimed at the wrong guard, and correcting them was the useful
part:

| # | Mutation | Red |
|---|---|---|
| Y1 | invite stops binding the email | `OI-A3`, `OI-A4`, `OI-A5`, `OI-B1`, `OI-B2` |
| Y2 | remove the bound-email check | `OI-B1`, `OI-B2` |
| Y3 | remove activation, restoring the dead end | `OI-A3`, `OI-A4`, `OI-A5` |
| Y4 | activation stops requiring a dormant account | `OI-C1` |
| Y6b | activation stops requiring the invite to name the address | `OI-C3` |
| Y7 | tree create no longer retry-safe | `OI-D1`, `OI-D2` |
| Y8 | validate the name before trimming again | `OI-D3` |
| Y9 | duplicate rule ignores the parent | `OI-D4` |
| Y10b | scanner stops honouring quotes around a comma | `PX-G1` |
| Y11 | quoted fields not recognised at all | `PX-G1`, `PX-G3` |
| Y12 | drop the doubled-quote rule | `PX-G3` |
| Y13 / Y14 | preview cells / headers unescaped | `PX-G5` |
| Y15 | parse error interpolated raw | `PX-G6` |
| Y16 | picker advertises XLSX again | `PX-G7` |
| Y17 | workbook parsed as text again | `PX-G8` |

**A mutation found a law nobody had asserted.** Removing `invite.email === emailNorm` from the
activation guard left every assertion green — the others are held by the dormancy and organisation
checks. What that clause alone protects is that a **general** join link, which anybody may hold,
cannot be used to claim a dormant account by typing its address. `OI-C3` now pins it, and `Y6b`
proves it bites.

**One guard could not be isolated, and that is recorded rather than forced.** The explicit
`existing.orgCode === code` clause is redundant: `users[existing.userId]` is already scoped to the
session organisation, so a cross-org account fails that lookup first. `OI-C2` is genuinely held —
by the lookup. The extra clause is belt-and-braces and no valid mutation isolates it.

### Ownership consolidated

- **One activation path.** `join-invite` is now the single route that turns a dormant account into
  a usable one. `/api/auth/set-password`'s token path still exists for somebody who is already
  signed in and has never set a password; it was never reachable by an added member, because it
  needs a Bearer session they cannot obtain.
- **One CSV reader.** `_parseCSVRows` scans; `_parseCSV` shapes rows from it. The old inline
  `line.split(',')` is gone.
- **One duplicate rule for tree nodes.** Same name under the same parent returns the existing node
  with `already: true`; the same name under a different parent is a different unit and is allowed.

### Not covered from this audit

- The **import size and row bounds** Codex raised (only the 25 MB JSON ceiling protects a request
  that could ask for thousands of sequential bcrypt hashes). **Not addressed** — real, and a
  denial-of-service boundary rather than a pilot-journey defect.
- **Invite-by-email partial failure reporting** (the client suppresses per-address errors and shows
  only successful links). **Not addressed.**
- Add Member's **account-first / tree-second** transaction, which can report failure after the
  account exists. **Not addressed**; Codex marked it Read and did not reproduce it either.
- Import group names **auto-create tree nodes outside the CAS boundary**. **Not addressed.**

---

MAIN BASE SHA: **680516631c5e53b6c86bc5d436a98efe8eea630f**
ENDING SHA: *(the commit at the head of `claude/pilot-crackdown-r1`)*

MEMORY MODEL UNDERSTOOD: **PASS**
WHOLE-PLATFORM HYDRATION REQUIRED: **YES** (all orgs load at start; 110 KB total, deliberately not
rebuilt — see "the honest weakness")
PER-ORG / BOUNDED STATE: **PASS** (every unit is per-org; writes are per-unit)
SPLIT PERSISTENCE ACTIVE: **PASS** (default, and mutation-proven)
LEGACY BLOB NORMAL PATH: **NO**
DATA SURVIVES RESTART: **NOT VERIFIED** (no database in this environment)
DEMO RESEED REQUIRED: **UNKNOWN** (not provable from here)
DEMO SEED IDEMPOTENT: **PASS on the metric path** (proven); **NOT VERIFIED end to end**

NEON USAGE EXPLAINED: **YES** — historical, from the 21 MB blob era; ~220 cold starts at 21 MB
reaches 4.6 GB, where 42,000 would be needed at today's 110 KB
BYTES PER COLD START: **~110 KB**
BYTES PER LOGIN: **0** (served from memory)
BYTES PER HOME LOAD: **0** (served from memory)
BYTES PER TYPICAL WRITE: **the changed unit only** (~1.6 KB for a focus outcome)
PROJECTED 30-USER MONTHLY TRANSFER: **~150 MB** (~3% of the 5 GB allowance)
TRANSFER BLOCKER: **NO**

FIRST-OPEN HOME: **NOT VERIFIED**
FIRST-OPEN HIGH: **NOT VERIFIED**
FIRST-OPEN LOW: **NOT VERIFIED**
AUTH/READINESS RACE: **NOT VERIFIED**
TRANSIENT RETRY: **NOT VERIFIED**

QUESTION->FOCUS BUG: **PASS** (reproduced, fixed, 6 mutations)
FOCUS AUDIENCE LABELS: **PASS** (reproduced, fixed at source, 1 mutation)
FOCUS EMPTY HISTORY: **NOT ADDRESSED**
FOCUS DUPLICATION: **NOT ADDRESSED**

LIBRARY: **PASS** (24/24 in a real browser, driven through the real controls)
NATIVE PROMPTS REMAINING ON PILOT PATH: **0** (2 remain in leader/admin tooling; 12 `confirm()`
remain, mostly on admin destructive actions)

SETTINGS NAVIGATION: **NOT ADDRESSED**
METRICS: **PASS** (reproduced, fixed at source + migration, 4 mutations)
COACH/DEV SEPARATION: **NOT ADDRESSED**
MISLEADING CAPABILITY CLAIMS REMAINING: **UNKNOWN — not audited.** One was found and fixed (email);
the Platform Grade / Active Features claims were not examined
MOBILE SETTINGS: **NOT ADDRESSED**

MEMBERS: **PARTIAL** (add/activate/invite/tree audited and fixed; bulk-import bounds not addressed)
ORG TREE: **PASS** (was FAIL: retry duplication and blank names, both fixed)
ADD MEMBER: **PASS** (was FAIL: reproduced dead-end account, fixed and mutation-proven)
JOIN LINK: **PASS** (unbound links unchanged; targeted links now bound)
SPREADSHEET IMPORT: **PARTIAL** (CSV fixed including quoted fields and the injection surface; XLSX is an open decision and the interface no longer claims it)
EMAIL DELIVERY ACTUALLY SENDS: **NO** (proven: no provider, no client, no send path)

HOME / PRIORITY: **PASS** (preserved; 114/114 at both widths)
GOVERNED DISCUSSION: **PASS** (preserved; the native Edit prompt on that path is gone)
MODEL LIVE PATH: **NOT VERIFIED** (no credential in this environment, no reachable instance)

MOBILE 390x844: **PASS**
MOBILE 430x932: **PASS**

npm test: **GREEN**

PILOT CODE BLOCKERS: **1** — the first-open failures (§6/§7). They are the defect a coach meets
before anything else, and this pass did not reach them.
PILOT OPERATIONS BLOCKERS: **2** — unchanged from the deployment pass: the instance is unreachable
under the current egress policy, and no reply has ever been written by a live model.

READY FOR FOUNDER LIVE RETEST: **YES** — for the five defects fixed here, which are worth
retesting on the phone as soon as this is deployed. **NOT** a claim that the pilot is ready: §6/§7
and §14/§15 are untouched and both matter.

Not merged. Not deployed.
