# Claude pilot crackdown, round 2

A correction pass on `claude/pilot-crackdown-r1`, continuing from `872075f`. Everything below was
reproduced from production code on this branch before anything was changed. Where a report said a
defect was present and it was not, that is recorded too.

## Pinned SHAs

| what | SHA |
| --- | --- |
| `origin/main` at the start and end of this pass (unmoved) | `680516631c5e53b6c86bc5d436a98efe8eea630f` |
| `origin/claude/pilot-crackdown-r1` on arrival | `872075feaa1e8c9a7dd2eac9b72ac387dc703a1a` |
| `origin/claude/pilot-crackdown-r1` on leaving | `5d41db8` |

Three commits: `2daa1c7`, `22abb45`, `5d41db8`.

The push-connectivity check was run before any work started and again after the container was
restarted mid-pass: `git push --dry-run -u origin HEAD:claude/pilot-crackdown-r1` succeeded both
times. `codex/work-pilot-independent-audit-r1` and commit `e69a9ba` do not exist on the remote, so
nothing in this pass depended on them.

## Files changed

| file | what changed |
| --- | --- |
| `ai/metric-record.js` | NEW. The one definition of what a metric is. |
| `ai/composer-actions.js` | The intent guard accepts the family of "create a focus" phrasings. |
| `server.js` | Metric owner converged; `PUT` validates; invite and Add Member ask `edit_members`; `_addTreeNode` extracted; import limits; import commits through the tree's CAS; `ok` means what it says; declared invite address. |
| `js/app.js` | Onboarding controls gated on `edit_members`; invite batch reports failures; Add Member survives a failed placement; metric bulk-add is truthful; the last native input prompt replaced. |
| `index.html` | Two onboarding controls hidden by default; asset stamp `20260910d` to `20260910i`. |
| `scripts/seed-alma.js` | Uses the canonical metric owner; permission grants stored as a map. |
| `scripts/metric-lifecycle-smoke.js` | NEW, registered (28). |
| `scripts/onboard-browser-check.js` | NEW, browser-only (23). |
| `scripts/onboard-invite-smoke.js` | 20 to 49. |
| `scripts/pilot-crackdown-smoke.js` | 52 to 68. |
| `scripts/one-app-smoke.js` | `OA10` rewritten to the decided rule. |
| `scripts/test.js` | Registers the new suite. |

## Verifying the fixes claimed at 872075f

Each was traced from the client control, through the route, to the assertion that covers it.

| claimed fix | production owner | test | verdict |
| --- | --- | --- | --- |
| Dormant-account Add Member dead end | `POST /api/auth/join-invite` activation branch | `OI-A1`–`A5`, behavioural HTTP | holds |
| Email-targeted invite binding | `POST /api/auth/invite` | `OI-B1`–`B3` | holds, but see NEW-1 |
| Quoted CSV parsing | `_parseCSVRows` in `js/app.js` | `PX-G1`–`G3` extract and RUN the real function | holds |
| CSV-preview HTML escaping | `_previewImportFile` | `PX-G5`, `PX-G6` | holds (source-shape) |
| Blank Org Tree node rejection | `_addTreeNode` (was the route body) | `OI-D3` | holds |
| Duplicate Org Tree node rejection | `_addTreeNode` | `OI-D1`, `OI-D2`, `OI-D4` | holds |
| Removal of XLSX claims | picker `accept`, refusal branch | `PX-G7`–`G9` | holds |
| `onboard-invite-smoke` registration and quality | `scripts/test.js` | 26 HTTP calls, 0 `readFileSync` | registered and behavioural |

**CLAUDE FIXES VERIFIED: 8/8.**

## Checkpoint-A findings

### 1. Focus recovery language — CONFIRMED, fixed

Reproduced through `ai/composer-actions.js` `ground()`: `Create a focus for recovery`, `Set up a
focus for recovery` and `New focus: recovery` were all REJECTED, while `I want to work on
communication` and `Start a focus on set pieces` were accepted. Cause: `_statesIntent` listed
`start a focus` and `make (?:this )?a focus` as two hand-written literals, so the whole
create/set-up/add/new family fell through to the clarification.

Fixed by writing the family once, not by adding the reported phrase. Confirmation is untouched:
the guard decides only whether a title may be taken from the person's own words, and the action
still reaches a confirmation card. Guarded by `PX-A9` (eight phrasings), `PX-A10` (the same words
in a question still start nothing) and `PX-A11` (a sentence merely mentioning "focus").

### 2. Malformed metric inputs — CONFIRMED, fixed

Reproduced over HTTP: creating with `{name:{evil:1}}` returned 200 and stored a metric called
`"[object Object]"`; renaming with the same body returned **HTTP 500**; renaming with `"   "`
returned 200 and stored the empty string; renaming with a number returned 500. `PUT` never went
through `_metricRecord` at all — it had its own copy of the rule, `req.body.name.trim()`.

Validation now lives at the mutation boundary in `ai/metric-record.js`, and create, rename, the
org-approval flow, the seed and the startup migration all converge on it. `PUT` also refuses a
non-numeric `order`. Every hostile body is 400 on both write routes.

The derived id is unchanged: `"Training Load"` is `met_etac7z` before and after, so nothing
already stored changes identity.

### 3. Four false-green areas — all four CONFIRMED, all four now guarded

| area | why it was green | what replaced it |
| --- | --- | --- |
| Seed vs production metric ids | `PX-B5` matched a literal `.map(` in the seed | `ML-C2` BUILDS the demo org and compares ids with the server's derivation |
| Metric rename broken | nothing called `PUT` | `ML-A3`, `ML-A4`, `ML-B2` drive the route |
| Metric deletion broken | nothing called `DELETE` | `ML-A5`, `ML-A6` |
| Proposal-correction disconnected | `PX-D5` matched the route string | it already asserts control + handler + route together; the browser check now opens the real correction box (`stack-browser-check`, 114 green) |

`PX-B5` and `PX-B6` were not deleted. They were narrowed to the one property that is genuinely
about the shape of the repository rather than the behaviour of a request — that exactly one
implementation of metric identity exists — because two copies of a hash cannot be caught by
exercising either one of them.

### 4. Duplicate metric owner — CONFIRMED, worse than reported

Not two owners but **four**: the write route, the org-approval flow (`m_` + a random id and
`String(m)`), the Alma seed (its own djb2), and the startup migration. All four now call
`ai/metric-record.js`. No new service layer; a pure function in `ai/`, beside the kernel modules
the seed already imports.

**A destructive mistake of mine, recorded.** The first draft of this module was written to
`ai/metrics.js`, which already existed as the per-org usage counter and has its own registered
suite. It was overwritten. Caught by `git status` showing `M` rather than untracked, restored from
the index, `metrics-smoke` re-run green, and the new module renamed to `ai/metric-record.js`.

## Onboarding blockers 5 to 9

### 5. Import limits — CONFIRMED, fixed

`POST /api/auth/bulk-import` accepted an array of any length and bcrypt-hashed a password for
every row it kept, synchronously, on the one event loop. Limits, stated in the route that enforces
them: **500 rows**, **120 characters** per name, email and group. The row limit is checked before
the first account is minted; the refusal is 413 and names both the limit and what was sent. A
field that is too long costs that row, not the file. Boundary tested at 501 (refused), 500
(accepted, 500 created) and per-field.

### 6. Invite batch partial failures — CONFIRMED, fixed

`_submitEmailInvites` pushed a result only `if (data.ok)` and swallowed every thrown request in an
empty catch. Nine failures out of ten showed one link and no mention of the nine. Now: a count of
created out of attempted, every failed address with the reason, failed addresses left in the box
and successful ones removed so a resubmit cannot duplicate a link, and every address escaped
before it reaches `innerHTML` (it was interpolated raw). Proven end to end in a browser
(`OB-B1`–`B4`).

### 7. Add Member partial transaction — CONFIRMED, fixed

Two writes, no transaction. The tree step used to `throw`, replacing the whole panel with "The
organisation tree changed. Reload and try again." The account had already been created, no invite
link had been minted, and filling the form in again hit "An account with this email already
exists" — the dormant-account dead end reached through a compare-and-set conflict.

No database atomicity is faked. Prevalidation: the node picker is only offered to somebody holding
`manage_tree`. The placement failure is reported as itself, the account and link are still shown,
and the placement is offered again on its own — idempotent, because a member id already present is
left alone, and it re-reads the tree first since a stale revision is what causes the conflict. The
toast says "placement still pending" rather than "added".

Failure injection: `OB-C1`–`C8` inject a 409 at `/api/tree/node/` in a real browser, then let the
retry succeed and confirm the server holds the membership **exactly once**.

### 8. Imported group creation outside canonical CAS — CONFIRMED, fixed

The importer assigned straight into `orgNodes[code]` with a bare `generateId()`: no `rev`, no
`parentId`, no `childNodeIds`, no duplicate check, outside the serialisation and compare-and-set
the tree route uses. `_addTreeNode` is extracted from that route and is now the one place a node
comes into existence; the import snapshots once and commits through `_commitTreeMutation` as a
unit. Authorization, tenant scoping, the duplicate rule and idempotency are preserved.
`OI-H1`–`H6` cover shape, case-insensitive reuse, two simultaneous imports naming one new group,
and a re-import that touches nothing.

### 9. Invitation authority — CONFIRMED and INVERTED, fixed

Three doors, two rules. `bulk-import` asked `edit_members`. Add Member and invite asked
`_isLeader`, a DETECTOR that returns true for anyone who merely sits in a node with a sub-node
beneath it. Measured before the change:

```
a member sitting in a parent node, never appointed, no edit_members
    invite 200 · create-user 200 · bulk-import 403
a member explicitly granted edit_members, who leads nothing
    invite 403 · create-user 403 · bulk-import reached the handler
```

The person the organisation had authorised was refused at two doors out of three. All three ask
`edit_members` now, and so does the screen: the Add Member control and the Onboard tab are hidden
for anyone without it, hidden by default so a slow `/me` cannot flash an offer it cannot honour,
and the tab redirects to the tree if reached by a stale link.

Required tests, all present: `OI-F1` (holds the permission, leads nothing, may invite), `OI-F3`
(tree position alone confers nothing), `OI-F6` (cross-tenant still refused — the org is the
session), `OI-F5` (no inviting above your own level), `OI-F7` (all three doors, one owner), plus
`OB-A1`–`A11` proving the screen and the server agree in a real browser.

**Consequence worth naming:** a coach can no longer invite unless the organisation grants them
`edit_members`. This follows directly from the founder decision. Alma's head coach is a
`superadmin` and bypasses every check, so the pilot is unaffected; an assistant coach who needs to
add people will need the grant.

## New real defects found in this pass

**NEW-1 (P1, fixed). A typo minted an open invite link.** Found by driving the real page in
Chromium; invisible to every server-side assertion, including the ones written for invite binding
in the previous round. Binding was INFERRED by running a regex over `label`, and the Invite by
Email panel sends the typed address as the label. So `also bad` failed to look like an address and
became a **general join link, redeemable by anyone holding it**, from the one screen whose purpose
is a link per named person. Three pasted lines produced three links and three reported successes.
The address is now declared in its own `email` field: present and malformed is a 400, absent still
means an open link, which is what Generate Join Link is for. Two other callers
(`copyMemberInviteLink`, `regenerateMemberInvite`) fell back to `label: email || userId`, a user id
being not an address — same hazard, same fix.

**NEW-2 (P2, fixed). Seed permission grants were the wrong shape.** `userPermissions` stored
ARRAYS where `_effectivePermissions` spreads an object, so `['manage_settings', …]` spread to
`{0:'manage_settings', …}` and granted nothing at all. Masked because the only holder is a
superadmin, who bypasses every check. Two of the three names were not permissions either — the
roster permission is `edit_members`; `manage_people` and `view_org` do not exist anywhere in the
server. Same class as the metric shape: two shapes in one store.

**NEW-3 (P2, fixed). `bulk-import` returned `ok: true` however many rows failed.** A client had no
way to distinguish a clean import from one where every row was refused.

**NEW-4 (P3, fixed). The metric bulk-add counted only successes** and toasted "success" whatever
happened — the same blanket-success pattern as the invite batch, found while checking for mutation
residue.

**NEW-5 (P2, fixed). The last native input prompt on a pilot surface.** "I acted on this" on a
Priority Office card opened `prompt()` to collect a sentence that became a stored record — the same
defect closed last round for Library folders and proposal corrections, and the reason `PX-D6` had
to be scoped to `MemberApp` to pass.

**NEW REAL DEFECTS FOUND: 5.**

## False-green tests corrected

| test | how it lied | now |
| --- | --- | --- |
| `PX-B5` | matched a `.map(` in the seed; passed while rename returned 500 | asserts no id is minted outside the owner; behaviour moved to `ML-*` |
| `PX-B6` | matched a literal line in `server.js` | asserts no second djb2 was copied out |
| `PX-E5` (as first written by me) | matched `failures.push(` at a **second call site** — the catch branch — so deleting the refusal branch stayed green | both branches pinned separately (`PX-E5`, `PX-E5b`) |
| `OA10` | asserted that leading a node sufficed to mint an invite — the rule the founder changed | replaced by the stronger pair: the permission decides, the tree position does not (`OA10`, `OA10b`, `OA10c`) |
| `PX-E17` (as first written by me) | handed `ok()` a **Promise**, which is truthy whatever it resolves to — a green that could never go red | moved to the async suite as `ML-F1`–`F3` |

**FALSE-GREEN TESTS FIXED: 5/5.**

## Mutations

Twenty-seven isolated behavioural mutations, each restored immediately after the run. No mutation
remains in the tree; `git status` is clean and the residue scan for every mutated string returns
only the legitimate owners.

| # | mutation | expected | actual reds |
| --- | --- | --- | --- |
| M1 | `metricName` coerces again | hostile bodies stored | 5 (`ML-B2` ×3, `ML-B3`, `ML-B4`) |
| M2 | `PUT` keeps its own copy of the rule | 500 on rename | 9 |
| M3 | `order` unchecked | a string in the sort key | 1 (`ML-B5`) |
| M4 | id minted at random | seed and server diverge | 3 (`ML-C2`–`C4`) |
| M5 | seed re-forks its id rule | same | 2 (`ML-C2`, `ML-C4`) |
| M6 | migration never repairs | legacy strings unusable | 2 (`ML-A1`, then throws) |
| M7 | focus-request family removed | plain requests refused | 1 (`PX-A9`) |
| M8 | guard widened to any mention of "focus" | over-accepts | 1 (`PX-A11`) |
| M9 | question check dropped | questions become focuses | 4 (`PX-A1`, `A2`, `A4`, `A10`) |
| M10 | a second djb2 copied into the seed | two identity owners | 2 (`PX-B5`, `PX-B6`) |
| M11 | an id minted outside the owner | same | 1 (`PX-B5`) |
| M12 | row limit removed | unbounded import | 2 (`OI-G1`, `G2`) |
| M13 | limit off by one (499) | boundary wrong | 2 (`OI-G2`, `G3`) |
| M14 | field-length cap removed | 4 MB name stored | 1 (`OI-G4`) |
| M15 | importer re-forks its node writer | groups outside CAS | 5 (`OI-H1`, `H3`, `H4`, `H5`, …) |
| M16 | `_serializeTreeMutation` removed from import | — | **0 — see gap below** |
| M17 | blanket `ok: true` restored | partial reads as whole | 1 (`OI-I1`) |
| M18 | invite authority back to `requireAuth` | tree position grants | 2 (`OI-F3`, `OI-E1`) |
| M19 | create-user back to `requireAuth` | — | **0 — masked, see below** |
| M19b | same, after adding the coach case | middleware isolated | 2 (`OI-F4b`, `F4c`) |
| M20 | add-member bypass back to `_isLeader` | position grants | 1 (`OI-F2`) |
| M21 | batch drops refused rows | failures invisible | **0 — second call site, see below** |
| M21b | same, after splitting the assertion | refusals lost | 1 (`PX-E5`) |
| M21c | batch swallows thrown requests | network failures lost | 1 (`PX-E5b`) |
| M22 | failed placement throws away the account | dead end returns | 1 (`PX-E10`) |
| M23 | retry no longer idempotent | double membership | 1 (`PX-E14`) |
| M24 | seed stores grants as an array | grants silently void | 3 (`ML-F1`–`F3`) |
| M25 | declared address no longer validated | typo mints a link | 3 (`OI-B6`–`B8`) |
| M26 | declared address ignored | back to inference | 2 (`OI-B9`, `B10`) |
| M27 | native prompt restored | browser interrupts | 1 (`PX-D6b`) |

**Three mutations did not bite, and none was left alone.**

- **M19** — reverting `create-user`'s middleware left everything green, because the inner role
  ceiling refused the test's member-role actor anyway. A COACH is the case that separates them:
  level 3 creating a level-4 member clears the ceiling, so only the permission can stop them.
  `OI-F4b`/`F4c` added; M19b bites.
- **M21** — the assertion matched `failures.push(` at a second call site. Split into two.
- **M16** — removing the tree serializer from the import route changes nothing observable here,
  because the duplicate check inside the canonical owner is what holds `OI-H4`/`H5`. What the
  serializer protects is the compare-and-set in `_commitTreeMutation` under a live store, which
  this harness does not have. `OI-H7` is therefore labelled in its own text as a WIRING check, not
  behavioural proof. **This is a stated gap, not a guarded law.**

## Commands run

```
git push --dry-run -u origin HEAD:claude/pilot-crackdown-r1     (twice: start, and after restart)
node scripts/metric-lifecycle-smoke.js        28 passed, 0 failed
node scripts/onboard-invite-smoke.js          49 passed, 0 failed
node scripts/pilot-crackdown-smoke.js         68 passed, 0 failed
node scripts/one-app-smoke.js                 16 passed, 0 failed
node scripts/metrics-smoke.js                  5 passed, 0 failed
node scripts/asset-version-smoke.js            5 passed, 0 failed
npm test                                      TRUTH LAYER GREEN
git diff --check                              clean
node scripts/stack-browser-check.js          114 passed, 0 failed
node scripts/onboard-browser-check.js         23 passed, 0 failed
node scripts/priority-surface-browser-check.js 39 passed, 0 failed
node scripts/library-browser-check.js         24 passed, 0 failed
```

`npm test` was run green after each of the three commits. Working tree clean after committing.

## Full pilot regression audit

| surface | verdict |
| --- | --- |
| Startup, first open | Server boots, migrations idempotent (`ML-E1`), no crash on legacy shapes. |
| Persistence, restart | Split by default, units not blobs, saves cost what changed (`PX-F1`–`F4`). Not verified against a live Neon instance. |
| Demo data durability | Seed builds, ids stable across re-seed (`ML-C3`), permission grants now the right shape. |
| Neon transfer assumptions | **Not independently verified** — see limitations. |
| Home, Inquiry, High, Low, Focus | 114 browser assertions at two phone widths, green. |
| Priority Office | Green, and one native prompt removed (NEW-5). |
| Forum, Library, Material | `library-browser-check` 24 green; `shelf-http-smoke` green. |
| Members, Org Tree | Retry-safe, blank names refused, one node owner. |
| Onboard, Join links, CSV import | All corrections in this pass; 23 browser assertions. |
| Settings | Metric lifecycle green over HTTP. |
| Coach/developer role separation | Changed by decision 9; consequence stated above. |
| Misleading or dead controls | Onboarding controls now match the server. `stack-browser-check` scans every `onclick` for a handler that does not exist: none. |
| Native prompts | The last input prompt is gone. `confirm()` remains on destructive admin actions — a deliberate line drawn last round, not a defect. |
| Mobile overflow | Measured at 390x844 and 430x932: no sideways scroll, nothing cut off. |
| False-success states | Four found and closed (blockers 6, 7, NEW-3, NEW-4). |
| Auth/readiness races | Onboarding controls hidden by default so a slow `/me` cannot flash them. |
| Stale/dead routes | `reachability-smoke` green with its dated prefix-hole set. |
| Duplicate canonical owners | Metric identity: four to one. Tree node creation: two to one. Invitation authority: two rules to one. |

## Founder decisions applied

- CSV only. No XLSX implemented or advertised; a workbook chosen anyway is refused with a sentence.
- Invitations are generated links. No email is sent, and nothing in the repository can send one.
- The interface says so plainly: "IntelliQ does not send the email. Share each link with the person
  yourself."
- Invitation authority is the canonical `edit_members` permission at all three doors, and tree
  position confers nothing.
- Tenant isolation, CAS rules, privacy law and canonical ownership preserved — the import now goes
  through more of the CAS boundary than it did before, not less.

## Items not independently verifiable

- **Neon transfer and live restart behaviour.** No live `DATABASE_URL` was used in this pass. Every
  persistence claim here rests on the split-persistence shape and measured unit sizes, which is
  static reasoning, not proof of a live transfer. Classified as not independently verified.
- **The deployed Render instance.** Not exercised in this pass; the last live verification is
  `DEPLOYED_PILOT_VERIFY_R1.md` against an older SHA. **CODE READY is not DEPLOYED READY.**
- **The missing Codex branch.** `codex/work-pilot-independent-audit-r1` / `e69a9ba` never reached
  GitHub, so the checkpoint-A findings were reproduced from production code rather than read.

## Browser and Neon limitations

Chromium **was** available and used: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, launched
with `--no-sandbox`. Four browser suites ran, 200 assertions total, all green, and one of them
found NEW-1. Chart.js is excluded by name in these harnesses because it loads from a CDN this run
cannot reach; the exclusion is by exact message so it cannot quietly grow.

No live Neon credentials were present. Nothing here proves a live transfer, a live restart, or a
live cold start.

## Remaining code blockers

None reproduced. Two items are open but are not blockers:

1. The import route's tree serializer is wired, not behaviourally guarded (M16 above). It is
   correct as written and matches the tree route; what is missing is a test that can only be built
   against a live store.
2. `confirm()` remains on destructive admin actions. Deliberate, and unchanged from the line drawn
   in round 1.

## Remaining operational blockers

1. **Deploy and re-verify.** These corrections are on a branch. Nothing here has run on Render.
2. **Grant `edit_members` to whoever will add people at Alma**, if that is not the head coach. The
   head coach is a superadmin and is unaffected; anyone else now needs the grant, by design.
3. **Neon transfer under real use** remains unmeasured against the live instance.

---

CLAUDE FIXES VERIFIED: 8/8
NEW REAL DEFECTS FOUND: 5
FALSE-GREEN TESTS FIXED: 5/5
PILOT CODE BLOCKERS: 0
PILOT OPERATIONS BLOCKERS: 3
DUPLICATE OWNERS: 0
READY FOR FINAL FOUNDER RETEST: YES
