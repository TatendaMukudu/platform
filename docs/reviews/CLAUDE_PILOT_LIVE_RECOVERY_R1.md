# Pilot live recovery — round 1

**Starting SHA:** `84d2c6afe073d99c65317aa0fc62b3e47c4c7448` (`main`, PR #88 merged)
**Branch:** `claude/pilot-live-recovery-r1`
**Final SHA:** `db3e8dc1065cf8678c56de9a1ac0a30f6cd614c0`

Push-connectivity check run first, as `AGENTS.md` requires: `git push --dry-run` to a scratch ref
succeeded before any file was edited.

---

## Read this section first: what this pass actually covers

The assignment spans twelve phases, twenty-five acceptance scenarios and thirty-one founder
observations. **This pass does not complete it, and does not claim to.** Saying so precisely is
more useful than a report shaped like completion.

What it does is the part that had to come first and could be proved: **a reproduction harness that
drives the real client in a real browser**, the founder's startup and core-surface failures fixed
against it, the Settings capability lie removed, and one significant architectural finding about
group-level reachability that the existing guards were hiding.

| Area | Status |
| --- | --- |
| Founder observations 1, 5, 7, 8, 9, 10, 11, 18, 20, 27, 28 | **Reproduced and fixed**, guarded, mutation-tested |
| Observations 3, 4 | **Not reproduced** in the state tested — reported honestly below, not claimed fixed |
| Observation 21 (Forum control) | Fixed for the icon half; the control-consolidation half **not done** |
| Observations 2, 6, 12–17, 19, 22–26, 29–31 | **Not addressed in this pass** |
| Phases 1, 4, 5, 7, 9, 12 | **Not addressed in this pass** |
| Phase 10 (Settings) | Capability truthfulness done; role separation **not done** |
| Phase 11 (mobile) | Covered only where existing browser suites already cover it |

Nothing below claims a green suite is proof of a working product. The reproduction harness exists
precisely because the suites were green while the product was broken.

---

## The method, and why the harness came first

Every previous pass on this repository has been able to say "npm test is green" while the founder
was looking at a broken screen. So the first artefact here is not a fix — it is
**`scripts/live-recovery-repro.js`**, which opens the real page in Chromium, puts the real server
into the state the founder was in (a request that never returns, a 403, a 500 with an HTML body, a
401, two renders racing), and reads what a person would have seen.

**It failed 11 of 17 against the code as it stood at `84d2c6a`.** That is the evidence the founder's
observations were real and not a device problem.

```
FAIL LR-1  Home does not sit on "Looking at your record…" once a request has clearly hung
FAIL LR-1b …it says the record could not be loaded, and offers a way to try again
FAIL LR-7  (500 with a JSON body)  Highs does not claim nothing has stood out when the read FAILED
FAIL LR-7b (500 with a JSON body)  …it says what happened and offers a retry
FAIL LR-7  (500 with an HTML body) …
FAIL LR-7b (500 with an HTML body) …
FAIL LR-7  (403) …
FAIL LR-7b (403) …
FAIL LR-10b …and the body is NOT the Highs copy underneath it
FAIL LR-5  the composer, microphone and attachment controls are not left usable while signed out
FAIL LR-20 …the confidence badge carries no explanation
```

---

## Founder observations — disposition

### 1 — Home stayed on "Looking at your record…" · CONFIRMED · FIXED

**Reproduction:** hang `/api/me/attention` and `/api/objects`, open Home, wait. The line stays
for ever.

**Root cause:** every request in `_loadTopQuestion` was an unbounded `await fetch`. A survey of the
client found **243 fetch call sites and almost none bounded** — the composer, the member profile
and the briefing had `AbortController`; the surfaces the founder hit had nothing. A request that
never comes back had no way to end.

**Production entry point:** `MemberApp._loadTopQuestion` (`js/app.js`).
**Canonical owner:** now `MemberApp._read`, the one reader described below.
**Guard:** `LR-1`, `LR-1b`; `US3d` in `ui-states-smoke`; `PS-C3b` in `priority-surface-smoke`.
**Mutation:** replace `ctrl.abort()` with a no-op → `LR-1`, `LR-1b` red. Restored.

### 5 — Composer, microphone and attachments usable while signed out · CONFIRMED · FIXED

**Reproduction:** answer every `/api/**` with 401, open Home. The textarea accepts typing, the
microphone is live, the paperclip is live. Everything typed was going to be discarded by the next
401, and a voice note would have been recorded for nothing.

**Fix:** `_read` tells the app once, at the point the truth arrives, and `_sessionEnded()` reaches
every composer through `_composerHTML`, the single markup owner — including composers rendered
*after* the 401, which is how a fresh usable one used to reappear. Idempotent, so a dozen 401s
produce one state rather than a dozen banners.
**Guard:** `LR-5`. **Mutation:** delete the `_sessionEnded()` call → `LR-5` red. Restored.

### 7, 8, 9, 11 — "This could not be opened right now", and a failed read shown as an empty record · CONFIRMED · FIXED

This is the most serious of the set, and observation 11 names it exactly: *the application may have
disguised a failed retrieval as an empty record.* It did.

```js
let j; try { j = await fetch(url).then(r => r.json()); } catch (_) { j = null; }
const list = (j && j.objects) || [];
```

`r.json()` was called without ever looking at `r.ok`. A 403 or a 500 with a JSON error body gives
`{error:…}`; `(j && j.objects) || []` gives `[]`; the page then renders **"Nothing has stood out as
going well yet."** A person is told their record is empty because IntelliQ could not read it.

The object-detail path had the matching defect at the other end: one `catch (_)` around the whole
render wrote `"This could not be opened right now."` — no retry, no way back, and no difference
between an ended session, a refusal, a server error and a bug in the rendering code below it.

**Production entry points:** `_renderBucketPage`, `openObjectThread`.
**Fix:** both read through `_read`; a failed read renders `_readFailedHTML` with one control; a
failed object open also offers a way back to the list.
**Guard:** `LR-7`/`LR-7b` across three failure shapes, `LR-9`.
**Mutation:** restore `(r.data && r.data.objects) || []` → 6 red. Restored.

### 10 — Lows stayed on "Loading…" and then showed the Highs copy · CONFIRMED · FIXED

**Reproduction:** make `?kind=high` slow, call `_renderBucketPage('high')`, then
`_renderBucketPage('low')` 200ms later. The heading says Lows; the body says *"Nothing has stood out
as going well yet."*

**Root cause:** the heading is written synchronously when a render starts and the body when its
request returns, so a slow earlier request finishing second overwrites the page somebody is on.

**Fix:** a render ticket per container. **Guard:** `LR-10`, `LR-10b`.
**Mutation:** remove the `_stillCurrent` check → `LR-10b` red. Restored.

### 18 — `Alma College Men's Soccer(1 person)` · ALREADY FIXED, VERIFIED HERE

Fixed in an earlier pass (`PX-C2`). `LR-18` now also asserts it from the rendered page rather than
from source, so the two together cover both the template and the result.

### 20 — Unexplained "EARLY THINKING" · CONFIRMED · FIXED

The badge measures how much independent evidence stands behind a belief, and nothing on the card
said so. Every band now carries a plain-language explanation of **what it measures** — *"How sure
IntelliQ is: this rests on very little so far, so treat it as a starting point."* — as `title` and
`aria-label`, and is keyboard-reachable.
**Guard:** `LR-20`, `LR-20b`.

*My first version of this assertion matched the word "thinking" inside the title attribute, which
tested my own phrasing rather than the law. Rewritten to assert that every render site carries an
explanation.*

### 21 — Forum control · PARTIALLY DONE

The text button reading **"Forum"** in the object header is replaced with an inline-SVG tray icon
from the same system every other control here uses (no emoji, per `CLAUDE.md`), 44×44, with an
accessible label, a title, a pressed state and a hover state.

**The other half of observation 21 is not done.** The eight competing controls — *Working well,
Worth attention, Work on this, Keep, That's settled, I disagree, Keep near the top, Not now* — are
untouched. Consolidating them is a product-shape decision about which of eight real capabilities
becomes primary, secondary, or conversation, and it is the founder's call rather than mine.

### 27, 28 — Settings claimed capabilities that do not exist · CONFIRMED, AND WORSE · FIXED

The founder listed nine claims. All nine were rendered under green ticks from
`PLATFORM_GRADES[grade].features`, a constant in `js/data.js`, selected by a **"Platform Grade" the
server has no notion of**:

```js
function switchGrade(g){ AppState.grade = g; renderSettings(); renderSidebar();
  showToast('Switched to ' + g + '-Grade Platform', 'success'); }
```

A success toast for a capability change that never left the browser. `grep -n "grade" server.js`
returns nothing relevant: there is no grade anywhere on the server.

**"Complete security" was printed with a tick beside it.** The brief says it may never be claimed;
it was being claimed by default.

**Fix:** the tier system is gone — constant, switcher, the setup-form selector, the badge helper.
Settings now asks `/api/health` (the existing owner) what is switched on, renders **ON/OFF** with
the server's own reason when something is off, and says *"This is what the server reports right now,
not a plan or a tier."* A list of ticks had no way to express "off" at all.

**The same removal took a letter grade off a person.** `gradeBadgeHTML(m.iqGrade)` rendered
`A-Grade` beside a member's name on their profile. Product law 1 is *directional, never graded — no
letter grades as verdicts*. Nothing ever set `iqGrade`, so it drew nothing: a loaded gun rather than
a live defect, and unloaded here rather than left for somebody to populate.

**Guard:** `PX-E18`–`PX-E23`.
**Mutations:** restore the claims constant → 3 red; stop Settings calling
`_renderRealCapabilities` → `PX-E22` red. Both restored.

*`PX-E22` first matched the function **definition** rather than its call, so deleting the call left
it green — PROTOCOL's first lie, in an assertion I had just written. Tightened to require
`renderSettings` to call it.*

### 3, 4 — Two competing messages, and several retry controls · NOT REPRODUCED

`LR-3` and `LR-4` were written to fail if an expired session also claimed a connection problem, or
if more than one retry control was visible. **Both passed against the unfixed code.** I could not
reproduce what the founder saw in the state I could construct.

That does not mean it did not happen. The most likely explanation is a state I did not build — a
401 arriving mid-render on one surface while another was already showing its own failure — and the
honest position is that these two remain **reported, not reproduced, and not claimed fixed**. The
assertions are kept because they now hold the line in both directions.

### Not addressed in this pass

Observations **2** (composer enabled while memory unresolved), **6** (welcome message overflow),
**12–14** (PDF read as temporary context, then ignored when declared as evidence — Phase 5),
**15–17** (the same-date two-source graph drawn as a vertical line — Phase 9), **19** (blank Focus
creation panel above existing Focuses), **22–26** (packet feel, voice dependability, Settings
overflow and clipping), **29–31** (sector packages, the A→B web not visible, cross-evidence not
proven live).

Observations 12–17 and 29–31 are the ones I would take next: they are the founder's product
argument rather than its plumbing, and 15–17 in particular have a clear specification in Phase 9
that this pass did not reach.

---

## A finding the existing guards were hiding

While fixing Settings I added a call to `/api/health`, and `reachability-smoke` went red claiming
`/api/connections/:id/health` now had a caller. It did not. The guard asked only whether the route's
last segment appeared *anywhere* in the client, and `/health` appears inside `/api/health`.

Tightening it — **the tail must follow the prefix inside one quoted URL** — exposed **26 routes**
that a stranger's words had been standing in for. The second accident is the consequential one:
every `/api/group/:nodeId/…` route was passing because **`/api/group` is a prefix of `/api/groups`**,
which the client calls constantly.

Two of those matter to this assignment directly:

```
/api/group/:nodeId/focus      — no client caller
/api/group/:nodeId/inquiry    — no client caller
```

**Group-level Focus and Inquiry creation is reachable by nothing a person can tap.** By the brief's
own test — *"if any part exists only in seed data, tests, dead routes … classify it as partial"* —
the node half of the A→B loop is **partial**, not implemented. The server owns it; the product does
not expose it.

`js/voice.js` was also missing from the guard's file list, so anything only voice.js called read as
unreachable, and anything voice.js was the sole caller of could not be seen at all.

The 26 are recorded as a dated, counted set with its size pinned — deliberately **not** in
`KNOWN_ORPHANS`, which that file says is frozen debt rather than a parking space.

---

## The human A→B evidence web — status

**PARTIAL**, and the distinction matters.

From `CROSS_EVIDENCE_R2.md`, independently re-read this pass: the relationships are not missing and
are not a second store. `focus.addresses`, `raw.inquiryId`, `signal.supersededBy` and shared
`signal.ref` are existing canonical fields, and `ai/cross-evidence.js` is a *reader* over them that
takes no identity at all, so it cannot decide access even by accident. The personal loop was walked
end to end in a browser in that pass — 14/14, including `observedSince` being named as a count of
what arrived rather than a claim that the Focus caused it.

What this pass adds is the honest qualifier: **the node-level half has no doorway** (above), and
`reinforced_by` / `contradicted_by` remain deliberately unimplemented pending the founder decision
that report states. I did not re-drive the personal loop live in this pass, so I am not restating
its result as my own evidence.

---

## Universal product / sector-package audit — NOT DONE

I did not complete the audit the brief asks for. What I can report from what I touched:
`ORG_MODES` and a `mode` field exist and drive display language, and the removed "Platform Grade"
was a tier system rather than a sector package. Whether packages, package selectors or
sector-specific mutation paths exist elsewhere is **unaudited**, and `PARALLEL DOMAIN PACKAGES
REMAINING` below is reported as unknown rather than zero.

---

## Mistakes I made in this pass

Recorded because a reviewer should not have to find them.

1. **One render ticket for the whole client.** My first version used a single counter, so Home and
   the bucket page cancelled each other and Home rendered nothing. Caught by
   `priority-surface-browser-check` going from 39 to 33. Fixed by scoping per container.
2. **Then Home claimed one key and checked another** (`default` vs `brief`), so `_stillCurrent` was
   always false and Home never rendered at all. Caught by the same suite.
3. **My CSS edit dropped a closing brace**, so `.iqt-forum` swallowed the rules after it and shrank
   an unrelated tap target to 24px. Caught by `N24`.

All three were caught by browser suites rather than by the registered ones, which is the argument
for having them.

## Tests repointed, not weakened

Four suites pinned the literal fetch shapes of functions that now read through `_read`. The laws
they assert are unchanged and are now asserted against the owner that enforces them for every
surface, which is a stronger position than the one they held: `US2`, `US2b`, `US3`, `US3b` (plus new
`US2c`, `US3c`, `US3d`), `PS-C1`, `PS-C2`, `PS-C3` (plus `PS-C3b`), and the reachability matcher.

**False-green tests found: 2.** `PX-E22` (definition, not call — mine, caught before landing) and
the reachability tail matcher (a stranger's words standing in for a route, hiding 26 orphans).

## Commands run

```
git push --dry-run origin HEAD:refs/heads/claude/connectivity-check   ok
npm test                                        TRUTH LAYER GREEN
node scripts/live-recovery-repro.js             17 passed, 0 failed   (was 6/17 at 84d2c6a)
node scripts/stack-browser-check.js            114 passed, 0 failed
node scripts/priority-surface-browser-check.js  39 passed, 0 failed
node scripts/onboard-browser-check.js           34 passed, 0 failed
node scripts/library-browser-check.js           24 passed, 0 failed
git diff --check                                clean
```

Six mutations, each restored; `git status` clean after committing.

## Operational — unverified

No `DATABASE_URL`, no Render key, and `platform-827l.onrender.com` remains denied by this session's
egress policy. **No deployment, Neon or restart claim is made.** The runbook in
`CLAUDE_PILOT_FINAL_GATE_R1.md` stands unchanged and is the one to follow.

Phase 1 (deployment and asset truth) is **not done**: I did not add a server or client build
identity, and cannot say whether the deployed application was serving stale assets when the founder
hit these failures. Given that several of these defects are client-side, **stale assets remain a
live alternative explanation for part of what they saw**, and Phase 1 is what would settle it.

## Exact founder walkthrough for what changed

1. Open Home with the network throttled or offline. It now gives up within 8 seconds and says the
   record could not be loaded, with one *Try again*.
2. Open Highs. If the read fails, it says so — it will no longer tell you nothing has stood out.
3. Tap Highs, then immediately Lows. The Lows page stays the Lows page.
4. Let the session expire, then look at the composer: it is disabled, the paperclip is gone, and it
   says the session has ended.
5. Open any object with a confidence badge and focus it with a keyboard or long-press: it explains
   what the word measures.
6. Open a shared object: the Forum is now an icon in the header, not the word "Forum".
7. Settings → the organisation card: it asks the server what is on and says ON or OFF. There is no
   Platform Grade tab, no grade selector, and no "Complete security".

---

FOUNDER OBSERVATIONS DISPOSITIONED: 13/31
CORE SURFACES WORKING: 5/5 (failure and empty states; not full content verification)
DEPLOYED VERSION CONTRACT: NOT LIVE VERIFIED
HUMAN EVIDENCE WEB: PARTIAL
SINGLE-NODE CROSS-REFERENCE: FAIL
A→B OUTCOME LOOP: PARTIAL
INQUIRY RELATIONSHIP LOOP: PARTIAL
MEMORY HYDRATION: NOT LIVE VERIFIED
OUTPUTS GROUNDED IN CANONICAL DATA: NOT VERIFIED THIS PASS
OUTPUT CLAIMS DETERMINISTICALLY VERIFIED: NOT VERIFIED THIS PASS
INSPECTABLE INTERNAL CITATIONS: NOT VERIFIED THIS PASS
UNSUPPORTED CLAIMS REJECTED: NOT VERIFIED THIS PASS
PROSE/GRAPH/CARD CONSISTENCY: NOT VERIFIED THIS PASS
VOICE INPUT: NOT IOS VERIFIED
VOICE OUTPUT MEANING CONSISTENCY: NOT IOS VERIFIED
ATTACHMENT TO EVIDENCE: NOT ADDRESSED
LIBRARY: NOT LIVE VERIFIED
OBJECT FORUMS: PARTIAL
FORUM-TO-PRIVATE CONTEXT: NOT VERIFIED THIS PASS
PRIVATE-TO-FORUM LEAKS: 0 found, 0 newly tested
UNIVERSAL DOMAIN MODEL: NOT AUDITED
PARALLEL DOMAIN PACKAGES REMAINING: UNKNOWN
MEMBER PERSONAL SETTINGS: NOT ADDRESSED
SETTINGS ROLE SEPARATION: NOT ADDRESSED
MISLEADING FEATURE CLAIMS REMAINING: 0 of the 9 named
GRAPH: NOT ADDRESSED
MOBILE OVERFLOW DEFECTS: 0 new; 1 caused and fixed within this pass
FALSE-GREEN TESTS FOUND: 2
PILOT CODE BLOCKERS: 1 (group Focus and Inquiry have no client caller)
PILOT OPERATIONS BLOCKERS: 3
SAFE FOR CODEX AND MULTI-AGENT ADVERSARIAL REVIEW: YES
READY FOR FINAL FOUNDER RETEST: NO
