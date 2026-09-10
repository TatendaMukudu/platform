# Final adversarial release gate — PR #88

An independent verification pass over `claude/pilot-crackdown-r1`, run against the PR head rather
than against the report describing it. Nothing in `CLAUDE_PILOT_CRACKDOWN_R2.md` was taken as
evidence; every claim was re-traced from a production entry point to its owner to its test, and the
tests were attacked with mutations designed for this pass rather than the twenty-seven already
recorded.

The pass found **one pilot-blocking defect that PR #88 itself introduced**, and **five assertions
in PR #88's own suite that could not go red**.

## Pinned

| what | SHA |
| --- | --- |
| `origin/main` | `680516631c5e53b6c86bc5d436a98efe8eea630f` |
| PR #88 head on arrival (matches the expected head) | `057b380d31abd51ac60fe7558cb7a1d5af1128a5` |
| PR #88 head on leaving | `ad80306fd44e8d203721a1d3d7a5f40d3af4b266` |

Push-connectivity check, run first as `AGENTS.md` requires:
`git push --dry-run -u origin HEAD:claude/pilot-crackdown-r1` → `Everything up-to-date`. Push works.

`codex/onboard-pilot-audit-r1` **does** exist on the remote at `d2d64f3`, contrary to what earlier
passes recorded; `CODEX_ONBOARD_PILOT_AUDIT_R1.md` was fetched from it and read in full. The branch
that genuinely does not exist is `codex/work-pilot-independent-audit-r1`.

## GitHub CI

**PRESENT and PASSING.** `.github/workflows/ci.yml` ("Truth Layer") runs `node scripts/test.js` on
every PR into `main`. On PR #88's head `057b380`:

```
check run "node scripts/test.js" — status completed, conclusion SUCCESS
started 2026-09-10T17:59:15Z, completed 18:01:45Z
https://github.com/TatendaMukudu/platform/actions/runs/34511535584/job/102986604053
```

The combined *status* API returns `pending` with zero statuses because this repository uses check
runs rather than commit statuses; the check run is the real signal. Reproduced locally too:
`npm test` → `TRUTH LAYER GREEN`.

**And that is the first finding.** CI was green, `npm test` was green, and the P1 below was present
in the code the whole time. Green did not mean working, because nothing tested the function.

## THE DEFECT PR #88 INTRODUCED

### GATE-1 (P1, pilot-blocking) — a partial CSV import reported "Import failed" over real accounts

**Reproduced**, at the HTTP boundary, then in a real browser.

PR #88 correctly stopped `POST /api/auth/bulk-import` returning `ok: true` over failed rows. It did
not trace that change to the client that consumes it. `js/app.js` `_submitImport` read:

```js
if (!data.ok) throw new Error(data.error || 'Import failed');
```

So the moment the server started telling the truth, the screen started lying in the opposite
direction. A three-row file with one bad address:

```
HTTP 200
ok: false | created: 2 | failed: 1
j.error is: undefined
=> the screen would say: "Import failed"
=> but accounts actually created on the server: g1@x.test, g2@x.test
```

A coach imports a squad, one row has a typo, **two people are given accounts**, and the screen says
the import failed. They are never shown which row was wrong. The roster is never refreshed, because
the throw skipped `loadRealOrgData()`. Re-importing the corrected file then skips those two as
duplicates, so the counts disagree with the coach's own file and nobody can tell what happened.

This is precisely what founder decision 5 forbids — not blanket success, but its mirror: a real
partial success reported as total failure, with the consequences hidden.

**Why it shipped green:** `_submitImport` had **zero test coverage**, registered or browser. The R2
report's regression table nonetheless lists "Onboard, Join links, CSV import — All corrections in
this pass", which overstated what had been checked. Server-side assertion `OI-I1` proved the route
returns `ok:false`; nothing proved anything about the screen that reads it.

**Fixed.** Only a refusal of the whole request (401/403/404/413) throws; a 200 is a per-row report.
The panel now renders "N of M imported · K already existed · J could not be imported", each failed
row with the reason the server gave, and refreshes the roster whatever the per-row outcome.

**Guarded** behaviourally in a real browser (`OB-D1`–`OB-D6`, which drive the actual `_submitImport`
against the actual route) and hermetically in `npm test` (`PX-E9c`–`PX-E9e`), because the browser
suites are deliberately not in `npm test` and CI would otherwise not catch a regression.

**Mutations:**

| mutation | expected | actual |
| --- | --- | --- |
| restore `if (!data.ok) throw` | partial reads as total failure | 3 red (`OB-D1`, `OB-D2`, `OB-D3`) |
| same, hermetic suite | as above without a browser | 1 red (`PX-E9c`) |
| count drops "of how many" | partial reads as whole | 2 red (`OB-D2`, `OB-D5`) |
| roster refresh removed | created accounts stay invisible | 1 red (`PX-E9e`) |

## FALSE-GREEN ASSERTIONS FOUND IN PR #88

Five assertions existed, passed, and could not go red. Each is now able to.

| # | assertion | the lie | proof | now |
| --- | --- | --- | --- | --- |
| FG-1 | `ML-B4` (metric names are trimmed) | **empty fixture** — no test ever renamed with padding, so the set it inspects never contains the bad case | rename validating `metricName(...)` then storing `req.body.name` raw stayed green | `ML-B3b` renames with `"   Padded Name   "` |
| FG-2 | `PX-A9` (focus-request phrasings) | every phrasing starts the sentence, so anchoring the family to `^` changed nothing | `^`-anchoring the regex stayed green | `PX-A9b` adds four mid-sentence requests |
| FG-3 | `OI-H1`/`H3`/`H4` (imported groups) | behavioural only — they cannot see a **second owner** on the day it is written, only on the day the copies drift | a *faithful* re-implementation of `_addTreeNode` inside the importer stayed green | `PX-B6b`/`PX-B6c`: one place mints a node id, and it is inside the owner |
| FG-4 | "the import commits through `_commitTreeMutation`" | claimed in the R2 report with **no assertion behind it** | deleting the commit stayed green | `OI-H2b` pins the commit's observable consequence: `_backfillUserNodeIds` rebuilds `assignedNodeIds`, which is what every scope computation reads |
| FG-5 | `OB-C6` (Add Member retry) | only ever exercised a retry that **succeeded** | making a failed retry drop its own control stayed green | `OB-E1`–`OB-E4` drive two failed retries then a successful third |

A sixth was mine, introduced and caught inside this pass: `PX-B6b` first counted the literal
`'nd_' + generateId()` including its spaces, so a copy written `'nd_'+generateId()` walked straight
past it — the vacuous-regex lie. Rewritten to match any concatenation of the prefix, then
re-mutated; it bites.

`OI-H7` remains labelled **wiring, not behaviour**, and that labelling is correct: removing
`_serializeTreeMutation` from the import route still changes nothing observable here. What it
protects needs a live store.

## Reverified areas

Every area the gate names, with the mutation that proves the assertion can go red. These are new
mutations, not repeats of the twenty-seven.

| area | verdict | new mutation | red |
| --- | --- | --- | --- |
| Focus recovery language | HOLDS | family requires an article (`Create focus for X` breaks) | `PX-A9` |
| …mid-sentence requests | GAP → FIXED | family anchored to `^` | `PX-A9b` |
| Questions must not create a Focus | HOLDS | (covered; question gate dropped) | `PX-A1/A2/A4/A10` |
| Malformed metric create/rename | HOLDS | `metricName` made "lenient" about numbers | `ML-B2`, `ML-B3`, `ML-D2` |
| Blank/whitespace metric names | HOLDS | as above; plus raw-name store | `ML-B2`, `ML-B3b` |
| Metric lifecycle over real HTTP | HOLDS | the suite drives `GET`/`POST`/`PUT`/`DELETE` directly | — |
| One metric owner, stable ids | HOLDS | (covered) | `ML-C2`–`C4`, `PX-B5`/`B6` |
| Invitation address binding | HOLDS | declared address ignored | `OI-B9`, `OI-B10` |
| Malformed email → no open link | HOLDS | `email !== undefined` relaxed to truthy | `OI-B8` |
| " | HOLDS | address regex weakened to "any non-empty" | `OI-B6`, `OI-B7` |
| `edit_members` across all three doors | HOLDS | **`edit_members` added back to `LEADER_GRANTS`** | `OI-F3`, `OI-F7` |
| " | HOLDS | invite gate typo'd to `view_members` (which a coach has) | `OI-F1`, `OI-F3`, `OI-F4b` |
| Tree position grants nothing | HOLDS | as above | `OI-F3` |
| Quoted CSV parsing | HOLDS | production scanner reverted to `split(',')` | `PX-G1`, `PX-G3` |
| CSV escaping / injection | HOLDS | preview header un-escaped | `PX-G5` |
| Row and field limits | HOLDS | (covered) | `OI-G1`–`G4` |
| Import partial-failure reporting | **DEFECT** | see GATE-1 | `OB-D1`–`D3`, `PX-E9c` |
| Add Member recovery + idempotent retry | HOLDS + GAP FIXED | failed retry drops its control; retry made non-idempotent | `OB-E2`–`E4`, `OB-E5` |
| Imported groups via canonical owner | HOLDS + GAP FIXED | faithful re-implementation; commit removed | `PX-B6b`, `OI-H2b` |
| Seed permission-grant shape | HOLDS | (covered) | `ML-F1`–`F3` |
| Native prompts | ONE REMAINS | see GATE-2 | — |
| Misleading / dead controls | CLEAN | 39 inline handlers in `index.html`, all defined | — |
| False-success UI | ONE FOUND | see GATE-1 | — |
| Mobile overflow | CLEAN | measured at 390x844 and 430x932 | — |
| Auth / readiness races | HOLDS | controls hidden by default, revealed only by permission | `OB-A7`, `OB-A8` |
| Restart / persistence | **NOT VERIFIABLE HERE** | no database, no deployment | — |
| Duplicate canonical owners | 0 | now guarded for tree nodes as well as metrics | `PX-B6b` |

**CLAIMED FIXES VERIFIED: 24/24 areas re-traced.** One area (import partial-failure reporting) was
found broken at the client and is fixed in this pass.

## Findings left for the founder, not silently decided

### GATE-2 (P2) — one native prompt remains, and it asks for something nobody knows

`js/app.js` `trBindPrompt` (Team Readiness, leader surface) opens `prompt()` and asks the operator
to **type a member's user id**:

> "Which member currently holds the "…" role? Enter their user id (routing only — no permissions change)."

Two problems, one of which PR #88's own law already forbids. It is a native browser dialog on a
leader surface — the class closed three times now for Library folders, proposal corrections and
"I acted on this". And it asks for an opaque internal identifier that no coach has any way to know,
which makes the control effectively dead even for somebody determined to use it.

**Not fixed**, deliberately. Fixing it properly means building a member picker, which is past
"narrowly necessary corrections" for a release gate, and the founder may prefer to retire the
control rather than build one. `PX-D6` remains scoped to `MemberApp`, which is why it stays green.

**The decision:** build a picker, or retire role binding for the pilot.

### GATE-3 (informational) — the request-size bound is still the platform's, not the import's

PR #88 added row (500) and field (120) limits, both enforced before the first account is minted.
There is still no import-specific **request-size** limit; the only bound is Express's global
`limit: '25mb'`. With the row limit in place a 25 MB body can no longer become thousands of bcrypt
hashes, so the denial-of-service path the Codex audit identified is closed by the row cap. Recorded
because the gate asked about request limits specifically, and the honest answer is that the row and
field caps carry the protection while the request cap remains platform-wide.

### GATE-4 (informational) — `_importTeamTable` is defined and never called

`server.js:6356`. It reads a pasted table and matches existing members; it creates no accounts and
no nodes, so it is not an authority bypass. Dead code, not a blocker.

## Operational gate

### What can be verified without merging

Verified in this session, on the PR head:

- Every registered suite (`npm test`), and CI's own run of it on `057b380`.
- All four browser suites in a real Chromium: **211 assertions**, all green.
- Route behaviour end to end against an in-process server with disposable two-organisation stores.
- Client behaviour end to end in a real browser, including injected 409s at the tree boundary.

**Not verifiable in this session, and not claimed:**

| claim | why not |
| --- | --- |
| Live Neon reads/writes | `DATABASE_URL` absent from this environment |
| Restart durability | no database to restart |
| Deployed behaviour on Render | `RENDER_API_KEY` absent, **and** `platform-827l.onrender.com:443` is denied by this session's egress policy (`connect_rejected`, recorded by the agent proxy). Reported, not routed around |

**LIVE NEON VERIFIED: NO. LIVE RESTART DURABILITY VERIFIED: NO.**

### Runbook — deployment, restart and durability

Do not run any of this without deploy authority and credentials already in hand. Nothing here was
executed in this session.

**Preconditions**

1. `DATABASE_URL` points at the pilot Neon branch; `IQ_PLATFORM_KEY` is set (it gates the stored-row
   half of the telemetry below); `PERSISTENCE_MODE` is unset or `split`.
2. Take a Neon branch snapshot **before** anything else. Everything below is reversible only
   through that snapshot.

**Step 1 — baseline before deploying**

```
GET /api/health
GET /api/admin/persistence            # superadmin session, or x-platform-key: $IQ_PLATFORM_KEY
```

Record `mode` (expect `split`), `debounceMs` (expect `1500`), `inMemory.units`, `inMemory.bytes`,
`saves.*` and, with the platform key, `storedRows` — which is `pg_column_size(store_value)` per
`iq_store` row, straight from Postgres. Save the JSON; it is the before-image.

Expected shape for a seeded Alma, measured locally in this pass: **16 durable units, 113,383 bytes**,
largest `store:inquiryStates:alma-mens-soccer` at 55,612 bytes.

**Step 2 — demo-data durability across a restart**

1. Note `orgMeta`, one inquiry id, one focus id, and the org's member count from the UI.
2. Make one small, identifiable write (rename a metric to a marker string). Wait past the 1.5 s
   debounce, then confirm `saves.cycles` incremented and `saves.bytesWritten` grew by roughly the
   size of that one unit, **not** the whole store.
3. Restart the Render service (Manual Deploy → Restart, not a redeploy).
4. Re-read `/api/admin/persistence`. `inMemory.units` and `inMemory.bytes` should match step 1
   within the size of the marker write.
5. Confirm the marker survived, and that the inquiry, focus and member count are unchanged.
6. **Durability is proven only if the marker is present after the restart.** A matching unit count
   with a missing marker means the last write never left the process — a debounce lost on shutdown,
   which is a different and worse failure than a bad read.

**Step 3 — measuring transfer with real telemetry**

Per-cycle, from `/api/admin/persistence`:

- `saves.bytesSerialised` — bytes hashed to decide what changed.
- `saves.bytesWritten` — bytes that actually left the process. **This is the bandwidth number.**
- `saves.writtenShare` — the ratio. If it approaches 1, split persistence has silently degraded to
  whole-store writes and the Neon bill scales with the store rather than the change.
- `saves.noopCycles` — must dominate when the app is idle.

Server-side, per row:

```sql
SELECT store_key, pg_column_size(store_value) AS bytes, rev, updated_at
  FROM iq_store ORDER BY bytes DESC LIMIT 20;
```

Cross-check against Neon's own compute/storage metrics for the same window. Two independent numbers
that agree are evidence; one number is an assumption.

**Step 4 — the Alma permission check, before onboarding**

This is the one that will stop the pilot dead if it is skipped. Measured against the seeded
organisation in this pass:

```
ALMA operators who may onboard: Gideon Nakamura (superadmin)
total people in the seeded org: 31 | may onboard: 1
```

**Exactly one person of thirty-one can add anyone.** That is founder decision 4 working as written —
the head coach is covered by `superadmin`, and nobody else has `edit_members`, including the
assistant coach and the athletic trainer.

Before onboarding day, for each person who will actually add members or send invitation links:

```
GET /api/auth/me     (as that person)
→ permissions.edit_members must be true
```

If it is false, an admin grants `edit_members` through People → Permissions. If the head coach is
the only operator, nothing needs granting. Verify by having that person open the Org Tree page and
confirming the **Onboard** tab and **+ Add Member** are visible — they are hidden for anyone
without the permission, so their absence is the symptom.

## Founder decisions, as applied at this head

1. **CSV only.** No XLSX claim anywhere; a workbook is refused with a sentence. Re-checked.
2. **Copy/share links, no email.** No provider, client, queue or send call exists. Re-checked.
3. **`edit_members` at all three doors.** Verified by two new mutations, including restoring
   `edit_members` to `LEADER_GRANTS`, which goes red.
4. **Head coach via superadmin, others need `edit_members`.** Measured: 1 of 31. See step 4.
5. **Honest partial success.** One violation found (GATE-1) and fixed; the invite batch, the metric
   bulk-add and Add Member were re-verified and hold.

## What this pass could not verify

- Anything requiring a live database, a live restart, or the deployed instance. No credentials, and
  the host is blocked by egress policy.
- Concurrency under a real store: the tree serializer on the import route remains wiring-only.
- Clipboard behaviour, real device input, and anything requiring a physical phone.
- Whether the 500-row and 120-character limits are the right numbers for Alma. They are enforced and
  tested; whether they fit the squad is a founder judgement.

## Commands run

```
git push --dry-run -u origin HEAD:claude/pilot-crackdown-r1     Everything up-to-date
git fetch origin main claude/pilot-crackdown-r1 codex/onboard-pilot-audit-r1
npm test                                     TRUTH LAYER GREEN
node scripts/metric-lifecycle-smoke.js       29 passed, 0 failed
node scripts/onboard-invite-smoke.js         50 passed, 0 failed
node scripts/pilot-crackdown-smoke.js        74 passed, 0 failed
node scripts/one-app-smoke.js                16 passed, 0 failed
node scripts/metrics-smoke.js                 5 passed, 0 failed
node scripts/shelf-http-smoke.js             33 passed, 0 failed
node scripts/composer-actions-smoke.js       45 passed, 0 failed
node scripts/asset-version-smoke.js           5 passed, 0 failed
node scripts/stack-browser-check.js         114 passed, 0 failed
node scripts/onboard-browser-check.js        34 passed, 0 failed
node scripts/priority-surface-browser-check.js 39 passed, 0 failed
node scripts/library-browser-check.js        24 passed, 0 failed
git diff --check                             clean
```

Eighteen mutations were performed in this pass, each restored immediately; `git diff --stat` shows
only the intended changes and no mutation residue. Chromium was available at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` and was used; browser coverage is claimed
because it ran, not inferred from source.

---

# Round 2 — Codex inline findings on PR #88

The first pass of this gate said "every server law held" against the mutations it designed. That
was true and it was not sufficient: an independent reviewer left five inline comments on the PR,
each naming a specific code path, and four of them described defects the mutations in this gate had
not been shaped to find. All four reproduce. The fifth had already been found and fixed here.

Re-pinned before starting: `origin/main` `6805166…`, PR head `2cc2ec0568f45a6706800b681cd6a4537e46d05b`,
working tree clean, `git push --dry-run` → `Everything up-to-date`.

**Where the first pass fell short.** Its mutations attacked the laws the branch had *written down*.
Codex read the code for laws nobody had written down yet — a role ceiling that stopped halfway
through the flow, a rollback that covered one store and not the other, an identity scheme with no
uniqueness rule, and a gate installed on the path the model does not take. Mutation testing proves
an assertion can fail; it cannot invent the assertion that was never made.

## Disposition

| # | finding | result |
| --- | --- | --- |
| 1 | dormant privileged-account activation | **CONFIRMED — P1, privilege escalation. Fixed.** |
| 2 | bulk-import CAS conflict after account creation | **CONFIRMED — P1. Fixed.** |
| 3 | duplicate metric IDs | **CONFIRMED — P2, all four scenarios. Fixed.** |
| 4 | model-supplied Focus text bypass | **CONFIRMED — P2. Fixed.** |
| 5 | partial import unusable by the client | **CONFIRMED — already fixed at `ad80306`, before the comment was read.** Re-verified at this head. |

**CONFIRMED: 5. REFUTED WITH EVIDENCE: 0.** Nothing Codex reported was wrong.

---

### 1 — A member invite could activate a dormant superadmin. CONFIRMED (P1)

**Entry point:** `POST /api/auth/join-invite`. **Canonical owner:** the activation branch in
`server.js`, which is the only place a dormant account is handed over.

**Reproduced**, end to end, as a complete privilege escalation:

```
admin mints role=superadmin                       -> 403 "You cannot invite someone above your own level."
admin mints role=member, aimed at a DORMANT
  superadmin's address                            -> 200
admin redeems it with a password they choose      -> 200, activated: true, role: superadmin
that session mints a superadmin invite            -> 200   ESCALATED
that session reads /api/admin/persistence         -> 200   ESCALATED
```

The same worked against a dormant plain admin. The guard asked three questions — same address, same
organisation, still dormant — and never the fourth: *is this invite entitled to this account's
role?* The ceiling was enforced where invites are **minted** and discarded where an account is
**handed over**, so the whole ladder could be climbed by aiming a permitted invite at an account
nobody was permitted to invite.

This is `AGENTS.md`'s seventh epistemic invariant — fail closed — broken in the direction that
matters most.

**Fix.** An invite may only activate an account whose role is at or below the role the invite was
minted for, using the ladder the mint-time ceiling already uses. The refusal is silent: it falls
through to the ordinary duplicate-address answer rather than saying "that address belongs to a
privileged dormant account", which would turn the route into an oracle for finding one.

**Guards** (`scripts/onboard-invite-smoke.js`): `OI-C4` a member invite cannot activate a dormant
superadmin; `OI-C5` nor a dormant admin, so the ceiling holds at every rung; `OI-C6` the refusal
names no roles; `OI-C7` a member invite still activates a dormant **member**, which is what the
branch exists for; `OI-C8` an **admin** invite still activates a dormant admin — this is a ceiling,
not a ban.

**Mutations:** removing the ceiling → `OI-C4`, `OI-C5`, `OI-C6` red. Inverting the comparison →
the same three red. Both restored.

---

### 2 — An import that lost the tree left accounts behind. CONFIRMED (P1)

**Entry point:** `POST /api/auth/bulk-import`. **Canonical owner:** `_commitTreeMutation`, which
owns the tree's compare-and-set and knows nothing about accounts.

**Reproduced** by stubbing `db.saveStores` to report a conflict on the `orgNodes` unit — the real
durable boundary, injected before `server.js` is required so it is the one the server holds:

```
HTTP 409, body {"error":"conflict","reason":"changed elsewhere"}
accounts left in orgUsers : a1@cas.test, b2@cas.test
emailIndex entries left   : a1@cas.test, b2@cas.test
tree nodes after rollback : (none)
their assignedNodeIds     : [[],[]]

the retry an operator makes: created 0, skipped 2, still no group, still unplaced
```

Worse than the comment claimed. Two real accounts, in no unit, invisible to every scope
computation — and **permanently unrecoverable through this route**, because the retry skips them by
email before it would have placed them. `scheduleSave()` never ran either, so whether they survived
a restart depended on an unrelated later save happening to catch them.

The R2 comment at that line asserted the accounts "are reported honestly below". They are not: the
`return` happens before anything is reported. A comment claiming a behaviour the code does not have
is worse than no comment.

**Fix.** The import is atomic at the tree boundary. Every account this request minted is recorded
as it goes and un-minted if the commit fails — accounts, email index, and the scope backfill. The
409 stands, and it is now literally true that nothing was imported, so the retry does exactly what
the operator expects. Rolling back is available precisely because these accounts are seconds old
and nothing can reference them yet.

**New registered suite** `scripts/import-conflict-smoke.js` (12): `IC-A1`–`A4` nothing minted
survives a refused import; `IC-A5`–`A8` the retry therefore creates both people, makes the group
once, places them, and their **scope** knows it; `IC-B1`–`B2` an import with no group column is
untouched by a contended tree; `IC-C1`–`C2` the rollback removes only what that request minted,
never anybody already in the roster.

**Mutations:** rollback removed → 5 red. Accounts rolled back but the email index left behind → 4
red. Nothing recorded as minted → 5 red. All restored.

---

### 3 — Two metrics could share one identity. CONFIRMED (P2)

**Entry point:** `POST` / `PUT` / `DELETE /api/metrics`. **Canonical owner:** `ai/metric-record.js`.

**Reproduced** over HTTP — all four scenarios the finding asks about:

```
"Sleep" created twice     -> two records, both met_1fxyk9o
deleting either one       -> BOTH vanish (the delete filters by id)
rename away, recreate     -> "Rest Quality" and a new "Sleep" holding one id
rename one of a pair      -> `find` matched the FIRST record, so the WRONG one was renamed
```

**Fix, at the one owner**, keeping derived ids and changing no stored identity:

- **Creating a name that exists returns the record that exists** (`already: true`), the same answer
  the Org Tree gives a repeated create. Compared case-insensitively, because "Sleep" and "sleep"
  are one metric to everybody except a hash.
- **Renaming onto another record's name is refused** (409), so the collision cannot come back
  through the door the create route now closes.
- **The derived id is checked for freedom too.** A rename deliberately keeps the record's original
  id, so after "Sleep" → "Rest Quality" there is a record holding `met_<hash of Sleep>` whose name
  is no longer Sleep; recreating "Sleep" then collided with it even though the names differ. The
  derived id stays the first choice — seeded ids are untouched — and only when it is already taken
  does a deterministic suffix step in.
- **The migration now treats a duplicate as damage** and dedupes, first occurrence winning, so a
  store already holding collisions becomes addressable without renumbering anything that survives.

**Guards** (`scripts/metric-lifecycle-smoke.js`): `ML-G1`–`G9` cover all four scenarios, the
case/padding variants, id uniqueness across the store, the refused rename, renaming a record to its
own name, and the repair of a store that already held a duplicate.

**Mutations:** duplicate names allowed → 3 red. Id-collision check removed → 3 red. Rename allowed
to collide → 1 red. Migration stops treating duplicates as damage → 1 red. All restored.

---

### 4 — The question gate sat on the path the model does not take. CONFIRMED (P2)

**Entry point:** `ai/composer-actions.js` `ground()`, on the model-proposed path through
`normalize()`. **Canonical owner:** `_mayTakeWording`.

**Reproduced** by driving `normalize()` with a model reply that carries text, as the real path does:

```
"How can I improve recovery?"  + model text "improve recovery"  -> STAGED  (source: user_stated)
"Why is this the thing worth looking at…?"                      -> STAGED
"Should I work on this?"                                        -> STAGED
"What changed?"                                                 -> STAGED
```

`raw.text` was copied into `args` **above** the gate, so the three carefully guarded fallbacks below
only ever ran when the model supplied nothing. The guard was installed in the one place the model
never had to pass through. And the first case was labelled `user_stated`, because "improve
recovery" is a substring of a question that only asked *about* recovery — the provenance said the
person had asked for a Focus they had merely enquired about.

**Every PX-A assertion written in earlier passes used `arguments: {}`**, so the whole suite
exercised the fallback path and none of it touched this one. That is a sixth false green, and it is
the reason this survived two adversarial passes.

**Fix.** `create_focus` — the action that manufactures a commitment — takes model-supplied text only
when the turn passes the same gate the fallbacks pass. Everything else is unchanged: `create_inquiry`
opens a question rather than a promise, `discuss_with_group` reaches a confirmation card naming the
group, and a pressed control still declares intent by itself.

**Guards** (`scripts/pilot-crackdown-smoke.js`): `PX-A12` questions do not stage a Focus even when
the model titles one; `PX-A13` the action is dropped rather than staged untitled, in every object
context; `PX-A14` a stated intention still takes the model's title; `PX-A15` a pressed control still
does; `PX-A16` `create_inquiry` is deliberately **not** narrowed, asserted so that narrowing it
later is a decision somebody makes on purpose.

`PX-A16`'s first draft used an inquiry context, where `create_inquiry` is not offered at all — it
would have passed against a surface that refuses everything, PROTOCOL's empty-fixture lie. It now
asserts availability first and runs on a Focus.

**Mutations:** gate removed from model text → `PX-A12`, `PX-A13` red. Gate over-applied to every
action → `PX-A16` red. Both restored.

**And the fix surfaced a real false negative.** `composer-actions-smoke` went red on `CA3b`, because
"Make that my focus" was refused: `my` and `that` were not in the determiner list. The assertion was
right and the product was wrong, so the phrase family was widened rather than the test relaxed —
`PROTOCOL` §1. Over-acceptance re-checked: "My focus has been all over the place", "That focus is
finished" and "Should I make this a focus?" are all still refused. Pinned by `PX-A9c`; removing the
possessives turns `CA3b` and `PX-A9c` red.

---

### 5 — Partial import unusable by the client. CONFIRMED, already fixed

This is `GATE-1` above, found by this gate at `ad80306` before the comment was read. Re-verified at
this head: `OB-D1`–`OB-D6` and `PX-E9c`–`PX-E9e` all green, and a 409 now says plainly that nothing
was imported — which finding 2's rollback is what makes true.

---

## Founder decision applied — Team Readiness role binding retired

The control opened a native prompt asking the operator to type a member's **user id**, which nobody
has any way of knowing: the last native input prompt in the product, and a control with no path to
a correct answer.

The button and `trBindPrompt` are both **removed**, not hidden. No handler is left referenced, so
nothing renders an offer it cannot honour. `POST /api/org-context/role-binding` and `_bindRole` are
**untouched** — a real confirmed mutation with history that other code reads bindings from. Only the
doorway that could not be walked through is gone. No member picker was built.

**Guards:** `PX-D6d` the control and its prompt are gone from the source; `PX-D6e` no dead handler
remains; `PX-D6f` the route still exists, so nothing reading bindings broke; `PX-D6g` **no native
input prompt survives anywhere in the client**, on any surface, comments stripped.

**Mutation:** restoring the control → `PX-D6d`, `PX-D6e` red. Restored.

## Verification at this head

```
npm test                                     TRUTH LAYER GREEN
node scripts/import-conflict-smoke.js         12 passed, 0 failed   (new, registered)
node scripts/onboard-invite-smoke.js          55 passed, 0 failed
node scripts/metric-lifecycle-smoke.js        38 passed, 0 failed
node scripts/pilot-crackdown-smoke.js         85 passed, 0 failed
node scripts/composer-actions-smoke.js        45 passed, 0 failed
node scripts/stack-browser-check.js          114 passed, 0 failed
node scripts/onboard-browser-check.js         34 passed, 0 failed
node scripts/priority-surface-browser-check.js 39 passed, 0 failed
node scripts/library-browser-check.js         24 passed, 0 failed
git diff --check                              clean
```

Fourteen further mutations in this round, each restored; `git diff --stat` shows only the intended
changes and no residue.

## What this round could not verify

Unchanged from the first pass, and still the honest limits: no `DATABASE_URL`, no Render key, and
`platform-827l.onrender.com:443` denied by this session's egress policy. **LIVE NEON VERIFIED: NO.
LIVE RESTART DURABILITY VERIFIED: NO.** The runbook above stands.

One thing this round adds to that list: the conflict in finding 2 was **injected**, not observed
against a real contended Postgres. The rollback is proven against the boundary the server holds; it
is not proven against a live store under genuine concurrency.

## Verdict

Four defects that two adversarial passes had missed, one of them a full privilege escalation from
admin to superadmin. None was found by mutating the laws this branch had written down, because none
of them had a law written down to mutate — which is the argument for a second reader rather than a
second pass by the same one.

All five are fixed, each with a behavioural guard on the production path and a mutation that turns
it red. The remaining blockers are operational and unchanged.

---

CODEX INLINE FINDINGS DISPOSITIONED: 4/4
CONFIRMED: 5
REFUTED WITH EVIDENCE: 0
PILOT CODE BLOCKERS: 0
PILOT OPERATIONS BLOCKERS: 3
SAFE TO MERGE: YES
READY FOR FINAL FOUNDER RETEST: YES
