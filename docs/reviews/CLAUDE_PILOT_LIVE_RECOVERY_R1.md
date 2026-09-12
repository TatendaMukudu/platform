# Pilot live recovery — round 1

**Starting SHA:** `84d2c6afe073d99c65317aa0fc62b3e47c4c7448` (`main`, PR #88 merged)
**Branch:** `claude/pilot-live-recovery-r1`
**Round 1 final SHA:** `0b72b87b1792947ac0a6568f24bcaaa00272f343`
**Round 2 (correction pass) starting SHA:** `58e1c68f1867bdcba8434c287117a99962ba261b`
**Round 2 final SHA:** `46c4604` (this report), code at `1898dc0`
**Pull request:** https://github.com/TatendaMukudu/platform/pull/89 — open, not merged.

> **Round 2 begins at the heading "Correction pass — round 2" near the end of this document.**
> Everything above it is round 1 and is left as written, including what it said it had not done.

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

---

# Correction pass — round 2

**From** `58e1c68` **to** `1898dc0`. Push-connectivity check run first; `npm test` run before any
change; every finding below reproduced through its production path before it was touched.

## What this round covers, and what it does not

Round 1 dispositioned 13 of 31 observations. **This round adds the CI fix, Phase 1 and Phase 2 in
full, and leaves the rest explicitly undone.** The 25-category table below marks every category,
including the ones nobody has touched, because a report that only lists work performed is how a
gap survives three passes.

**FOUNDER OBSERVATIONS DISPOSITIONED: 15/31.** Two more than round 1 — observations 2 and 23 are
partly addressed by the readiness contract and the voice fixes respectively, and are marked PARTIAL
rather than done.

## CI — fixed first, as instructed

`docs-status-smoke` failed on `58e1c68`: the index was 21 commits behind a threshold of 20.

**A detail worth keeping:** it passes locally at 20 and fails in CI at 21 because GitHub's
`pull_request` event tests the **merge commit**, which adds one. Any PR sitting within one commit
of the threshold will pass locally and fail in CI. The threshold was not touched.

The index was genuinely stale, so it is re-stamped **and rewritten**: a new §10 records the four
pilot rounds, where each canonical owner now lives, the suites added, and the two group routes with
no client caller. Re-stamping without content would have satisfied the guard while defeating its
stated purpose.

## The test that was editing the repository

`asset-version-smoke` wrote its lock file whenever it was satisfied, so **`npm test` mutated the
working tree**. Two costs, and the second is the one that matters: a run left a dirty tree and a
lock change could ride into an unrelated commit without anybody choosing it; and a test whose
result depends on how many times it has been run is the opposite of a guard.

It now only compares. Recording is `npm run stamp:record` — a deliberate step, so the person
bumping the stamp is the person who records it.

**Proven, not asserted:** the hash of `git status --porcelain` before and after a full `npm test`
is now identical.

## Phase 1 — build identity · DONE

Round 1 closed by admitting stale assets could not be ruled out, because nothing in the product
could answer the question.

| Fact | Where it comes from | Why separate |
| --- | --- | --- |
| `commit` | Render's env, or `git rev-parse` at boot, or `"unknown"` | "unknown" is honest and is **not** a claim of a match |
| `startedAt` + `startId` | once per process | distinguishes a restart from a service you left running |
| `assetStamp` | read from `index.html` **on disk at boot** | the server's view of which client it is handing out; hard-coding it would let it drift |
| `readiness` | process / storesLoaded / durableStore, answered separately | the brief's rule: do not report ready before the stores are loaded |

**Readiness cannot default to true.** `ready` is derived from a timestamp that is `null` until a
load actually happens. Before any load: `storesLoaded: false, ready: false, process: true`.

**The client reads its own stamp from the script tag the browser really loaded** — not a constant,
which would only ever report what the source says rather than what arrived — and compares it with
the server's. Different means an old cached shell talking to a newer server. It says so in one
line, offers **one** reload that clears caches and unregisters the worker, and **does not reload
itself**: a page that reloads itself is how a reload loop starts, and the founder was already
looking at a page that would not settle. Two unknowns are treated as unknown, not as a mismatch.

Visible to any authenticated user in Settings, deliberately: *"is this device running the build I
just deployed?"* has to be answerable while standing in front of the device.

**The full SHA is not in the public payload.** `endpoint-smoke` caught it, correctly — a
40-character opaque alphanumeric is the shape of a leaked key. Seven characters is what you compare
by eye; the full one stays behind the superadmin persistence diagnostic.

**Service worker audited:** network-first for GETs, never caches `/api/`, drops every non-current
cache on activate, `skipWaiting` + `clients.claim`. Guards `BI-E1`–`BI-E4`.

**Guards:** `scripts/build-identity-smoke.js` (28, registered) + `LR-B1`–`LR-B6` in a real browser.
**Mutations:** readiness defaulting to true → `BI-B1` red; served stamp hard-coded → `BI-A7` red;
client reporting a baked-in stamp → `BI-D1` red *(after tightening — see false greens)*.

## Phase 2 — one terminal session state · DONE

The gate was right that `_read` was not a boundary. Every **write** answered the same fact locally:

| Surface | What it did with a 401 | Now |
| --- | --- | --- |
| composer POST | returned `{reason:'auth'}` to its own caller | `_classifyWrite` |
| attachment upload | became "I couldn't save that", inside one card | `_classifyWrite` |
| card thread | reported "I couldn't reach IntelliQ" — a *connection* problem | `_classifyWrite` |
| Forum write | swallowed everything in `catch (_) {}` | `_classifyWrite` |
| `_sessionEnded` | selected `.iq-composer` only | every write surface + voice |

**The Forum one was losing messages, not just mishandling auth.** It cleared the box first, fired
the POST, and checked nothing. A refusal, an ended session or a dropped connection lost what
somebody had just written, silently. The text is not cleared until it is sent; a failure gives it
back and says which kind it was.

**The microphone was a real defect in `js/voice.js`,** not only a missing disable. `rec.onresult`
had no session guard. `cancel()` aborts the recogniser, but abort is a *request* to the browser's
engine, not a guarantee nothing further is delivered — and the handler wrote whatever arrived.
Measured directly with the guard removed, a late result lands as `"a late sentence"` in a composer
on a page that has already told the person to sign in. The session registry is the authority now,
and `IQVoice.cancelAll()` ends every live session from one call, because `_sessionEnded` cannot
know which surfaces are listening.

**Guards:** `LR-S1`–`LR-S6` — three write surfaces, the message-loss case, and the late transcript.
**Mutations:** composer answering locally → 2 red; card thread dropped from the surface list → 1
red; voice guard removed → 1 red *(after correction — see false greens)*.

## Two false greens found this pass, both mine

| # | Assertion | The lie | Now |
| --- | --- | --- | --- |
| FG-3 | `BI-D1` (client reads its loaded stamp) | matched a `querySelector` line that **survived the mutation but was no longer used** — PROTOCOL lie #1 | reads the whole function body and refuses to find a literal stamp in it |
| FG-4 | `LR-S6` (no late transcript) | read the textarea **200 ms after** the write; something between put the box back, so the mutation stayed green | reads at the instant of the write, and requires the handler to exist so it cannot pass against a recogniser that was never wired |

FG-4 is the more instructive: the law was right and the *instant* was wrong. It was found by
measuring the mutation by hand rather than trusting the green, which is the only reason it is in
this table instead of shipping.

**And one process failure of mine:** a mutation run was killed by a timeout with the voice guard
still removed. It was restored by hand and re-verified. The rule is to check the tree rather than
assume the harness finished.

## The 25 audit categories

| # | Category | Result | Evidence / where it stands |
| --- | --- | --- | --- |
| 1 | Startup / build identity / readiness / stale assets | **DONE** | `build-identity-smoke` (28) + `LR-B1`–`B6`; 3 mutations |
| 2 | Auth terminal state, all write surfaces | **DONE** | `LR-S1`–`S6`; 3 mutations; Forum message-loss closed |
| 3 | Home and memory | **PARTIAL** | Home bounded and honest (round 1); **bounded memory hydration before composer readiness NOT built** |
| 4 | Highs | **PARTIAL** | failure/empty states correct; content semantics not re-verified |
| 5 | Lows | **PARTIAL** | as Highs; the race is fixed and guarded |
| 6 | Inquiries | **PARTIAL** | open/failure paths correct; relationship display not addressed |
| 7 | Focuses | **NOT DONE** | creation panel, "Early thinking" explained only |
| 8 | Human A→B loop | **PARTIAL** | personal loop exists (`ai/cross-evidence.js`, 14/14 in an earlier pass, **not re-driven here**) |
| 9 | Single-node cross-reference | **FAIL** | **open blocker — see below** |
| 10 | Human/node-scoped external web reading | **NOT DONE** | `/api/objects/:kind/:id/reading` and `ai/websearch.js` not audited this pass |
| 11 | Evidence manifest / deterministic output verification | **NOT DONE** | `verifyGrounding()` not strengthened |
| 12 | Prose / card / graph / voice consistency | **NOT DONE** | no shared manifest built |
| 13 | Universal non-sector architecture | **NOT AUDITED** | `ai/packs.js` supplies vocabulary; whether it forks behaviour is unverified |
| 14 | Object Forums | **PARTIAL** | icon done (round 1); availability-from-current-audience not re-verified |
| 15 | One-way Forum→private context | **NOT DONE** | bounded reader not built |
| 16 | Private→Forum non-flow | **NOT VERIFIED** | believed impossible; not tested this pass |
| 17 | Voice input | **PARTIAL** | cancellation, late-transcript and session coupling fixed and guarded; permission/unsupported states not re-verified |
| 18 | Voice output | **NOT DONE** | read-aloud still silently no-ops where unsupported |
| 19 | Attachments / Material / Library | **NOT DONE** | the PDF classification flow is unbuilt; observations 12–14 stand |
| 20 | Mobile conversation-first UI | **NOT DONE** | object thread is still the long packet; 8 competing controls remain |
| 21 | Personal vs organisation Settings | **NOT DONE** | members still have no personal Settings destination |
| 22 | Capability truth | **PARTIAL** | tier fiction removed (round 1); `/api/health` mapping still conflates browser mic with server transcription |
| 23 | Demo / fake claims | **DONE** | Platform Grade, nine "Active Features", "Complete security", letter grades all removed and guarded |
| 24 | CI and false-green coverage | **DONE** | CI fixed; test purity proven; 2 false greens found and corrected |
| 25 | Live persistence / restart / deployment | **NOT VERIFIABLE HERE** | no credentials, host denied by egress policy |

## The open pilot code blocker

**`/api/group/:nodeId/focus` and `/api/group/:nodeId/inquiry` still have no client caller.**

Reproduced by `reachability-smoke` with the tightened matcher (round 1). The routes themselves are
well built — leader-gated via `_leadsNode`, the named origin Inquiry is verified to belong to that
group before it can be claimed, and both use the shared constructor in `ai/team-state.js`. What is
missing is a tappable way in.

**I did not build it in this pass, deliberately.** A group Focus needs an audience decision, a
confirmation path and a Forum consequence, and a partly-wired entry point would be a new misleading
control — precisely the class of defect this engagement exists to remove. It is recorded here as
the founder's call rather than decided quietly.

Until it exists, **the node half of the A→B loop is unreachable through the UI**, and
`SINGLE-NODE CROSS-REFERENCE` is FAIL rather than PARTIAL.

## Commands run

```
git push --dry-run origin HEAD:refs/heads/claude/connectivity-check   ok
npm test                                        TRUTH LAYER GREEN
node scripts/build-identity-smoke.js            28 passed, 0 failed   (new, registered)
node scripts/live-recovery-repro.js             35 passed, 0 failed   (was 17 at 58e1c68)
node scripts/stack-browser-check.js            114 passed, 0 failed
node scripts/priority-surface-browser-check.js  39 passed, 0 failed
node scripts/onboard-browser-check.js           34 passed, 0 failed
node scripts/library-browser-check.js           24 passed, 0 failed
git diff --check                                clean
git status hash before/after npm test           identical
```

Six mutations this round, each restored and verified in the tree by hand.

## Founder retest script

Because none of the operational claims can be made from here, these are the steps that would settle
them. Nothing below was performed.

1. **Build identity.** Open Settings on the phone. Compare the seven-character server build against
   the PR head. Compare *"This device is running assets X; the server is serving Y"* — they should
   match. If they differ, tap **Load the new version** and confirm they match afterwards.
2. **Stale rollover.** Leave a tab open. Deploy. Return to the tab: it should say it is running an
   older version and offer one reload. It must not reload by itself, and must not loop.
3. **Mid-session expiry.** Sign in, start typing, then invalidate the session. Expect: one sign-in
   message, a disabled composer, no microphone, no paperclip, and — if you were dictating — no
   transcript appearing afterwards.
4. **Forum message safety.** Post to a Forum with the network off. Your text must still be in the
   box.
5. **Home hydration.** Open Home on a slow connection. It must resolve or say it could not, within
   about eight seconds, with one **Try again**.
6. **A→B, personal.** Record a Low, form an Inquiry from it, start a Focus addressing it, record an
   outcome, then ask what changed. **The group equivalent is not reachable — see the blocker.**
7. **Restart.** Restart the service; re-check records, memory and any uploaded material. Compare
   `startedAt` before and after: it must move.

## CI on the exact head — confirmed

```
check run "node scripts/test.js" on e628cab
started 2026-09-11T08:05:02Z, completed 08:07:44Z, conclusion SUCCESS
https://github.com/TatendaMukudu/platform/actions/runs/34577425780/job/103192969949
```

**A correction against myself.** While waiting for this I polled the check-runs API repeatedly and
was served `in_progress` for roughly twenty minutes, and reported it as "still running, not
claimed". The run had in fact finished in 2m42s — its normal duration — and the API was returning a
stale status to my polling. The caution was right (do not claim a pass you have not seen) but the
inference drawn from it — that the job might be hung — was wrong. Recorded because a reviewer
reading the earlier line would otherwise be looking for a CI problem that never existed.

## Still not verified by anybody

Live Neon, restart durability, deployed build identity, real provider configuration, and real
iPhone/Safari behaviour. No `DATABASE_URL`, no Render key, and `platform-827l.onrender.com` is
denied by this session's egress policy. Chromium at 390×844 and 430×932 is **not** iOS Safari.

---

FOUNDER OBSERVATIONS DISPOSITIONED: 15/31
AUDIT CATEGORIES DISPOSITIONED: 25/25
HUMAN EVIDENCE WEB: PARTIAL
SINGLE-NODE CROSS-REFERENCE: FAIL
FORUM ONE-WAY CONTEXT: FAIL
OUTPUT MANIFEST CONSISTENCY: FAIL
VOICE INPUT: PARTIAL
VOICE OUTPUT: FAIL
FALSE-GREEN TESTS FOUND THIS PASS: 2
PILOT CODE BLOCKERS: 1
PILOT OPERATIONS BLOCKERS: 3
GITHUB CI ON EXACT HEAD: PASS
SAFE TO MERGE: NO
READY FOR FINAL FOUNDER PHONE/RESTART RETEST: NO

---

# Round 3 — the founder recovery list, finished

**Round 3 starting SHA:** `295a63c`
**Round 3 final SHA:** this report's commit; code at `a1d8c18`
**Branch:** `claude/pilot-live-recovery-r1` · **PR #89 — open, not merged.**

Round 2 closed at **15 of 31 observations** with the node half of the A→B loop named as an open
blocker I had declined to build. This round fixes the four unresolved Codex review comments and
then finishes items A through I.

Twelve commits. `npm test` **GREEN** (246 registered suites). Eight browser suites, **386
assertions**, all green.

**Sixty-six mutations** run against the production line across the nine work items. Six of them
came back **green**, which is the useful half of the number: every one was a weakness in a test I
had just written, each is named under *False greens* below, and each was rewritten and re-run until
the mutation went red. The final state is 66 applied, 66 red, tree verified clean after each. The
**seventh** false green under that heading was not found by a mutation at all — it was found by CI
going red on a tree `npm test` called green, which is the only way that particular defect can be
found, because it is a disagreement between two machines rather than a hole in one assertion.

---

## First: the four Codex review comments

### Codex 1 — effective composer capability · CONFIRMED · FIXED

**Reproduction.** `IQ_COMPOSER=1` with no model key produced
`{"on":true,...,"writes":"off — no language-model key is configured"}`, and the Settings row read
`composer.on` — the host flag alone — so it rendered a green **ON** beside the same payload
saying every reply came from the deterministic templates. The reason line read `composer.why`,
**which did not exist in the payload**, so every off state printed the same hard-coded fallback —
including to somebody whose actual cause was deterministic-only mode, a deliberate no-egress
guarantee misreported as a missing key.

**Production entry point.** `GET /api/health` → `js/app.js _renderRealCapabilities`.
**Canonical owner.** `composer.effective` (the AND of every switch) and `composer.why`, both in
`server.js`'s health block.

**The fifth state needed a fact the server did not have.** `ai.enabled()` reads the *claim* that a
key is configured; nothing read whether a provider ever answered. A revoked key or blocked egress
left the product telling its owner the model was writing for as long as the string stayed in the
environment. `ai/gateway.js` now records what the last real call **observed** — set only when a
completion has exhausted every retry and both providers, cleared only by a success and never by a
timer, and deliberately **not** set by no-egress, missing attribution or an exhausted budget, which
are three different causes that would otherwise arrive as one word.

| | |
|---|---|
| **Registered guard** | `capability-truth-smoke.js` (38) — all five states |
| **Browser guard** | `live-recovery-repro` LR-C0–C5b — the five states as *rendered* |
| **Mutation** | M1 (effective = flag alone), M2 (panel reads `comp.on`), M3 (`why` removed), M4 (provider branch dropped), M5 (no-egress folded into the fault), M8 (live record handed out); BM1, BM2 in the browser — **all red** |
| **Unverified** | No real provider key in this environment. The fault recorder was exercised by a genuinely failing call, not by a revoked key on a live host. |

### Codex 2 — confidence explanation · CONFIRMED · FIXED

**Reproduction.** The badge tooltip was a seven-entry lookup **in the browser, keyed on the band**,
and its text for `supported`, `strong` and `clear` was *"several separate accounts point the same
way"*. Three shapes make that false, and the first is not an edge case: three reports of
**unestablished origin** band as `supported` with `independentOrigins === 0` — reproduced in
`present-smoke` PR25b. One origin retold by four is capped at 0.55 rather than refused, so it sits
in a band the tooltip described as several accounts. And a **contested** picture — real
disagreement, the most informative state the system has — was described as everything pointing the
same way.

**Production entry point.** `js/app.js _CONFIDENCE_WHY` → the two `iq-inq-band` render sites.
**Canonical owner.** `ai/diagnose.js deriveConfidence` now returns the counts it computed the score
from; `ai/present.js confidenceWhy` composes the sentence from that shape and nothing else. The
band is not consulted: two different bands over the same evidence read identically, and one band
over two opposite shapes does not.

| | |
|---|---|
| **Registered guard** | `present-smoke` +17 (37) — six evidence shapes through the **real** `deriveConfidence`, not hand-written confidence objects |
| **Browser guard** | `live-recovery-repro` LR-20c/d, LR-D0–D5 — band held constant across two opposite shapes, title and aria-label read off the DOM |
| **Mutation** | CM1 (band decides), CM2 (unknown counts as independent), CM3 (retelling reads as corroboration), CM4 (dissent ignored), CM5 (no shape returned), CM6 (card drops it) — **all red** |
| **Unverified** | The six shapes are synthetic signal sets. No live org's real evidence was banded through this. |

### Codex 3 — bound Settings health · CONFIRMED · FIXED

The panel fetched `/api/health` with a bare `fetch`: no timeout, no abort, no 401 handling. It now
reads through `MemberApp._read`, and so does the build line beneath it — one networking system in
the panel rather than two. A failed read renders the shared banner **over** the panel, so a retry
cannot stack them. No raw `/api/health` fetch survives anywhere in the client.

| | |
|---|---|
| **Registered guard** | `capability-truth-smoke` CT-C5–C9 |
| **Browser guard** | `live-recovery-repro` LR-C6–C10 — offline, malformed, 401, three failed reads leaving exactly one banner with no stale rows, and the retry control a person taps |
| **Mutation** | M7 (raw fetch restored), BM-panel (constant in place of the read) — **red** |

### Codex 4 — `_read` timeout through body parsing · CONFIRMED · FIXED

`fetch` resolves on the response **headers**. The timer was cleared the instant it did, so a body
stalling mid-transfer — the ordinary shape of a dropped mobile connection, which already has the
headers — was unbounded again one line below the fix. The timer now spans the body parse and is
cleared in `finally`, once, on every exit including a throw. A body aborted mid-transfer reports as
a **timeout**, never as a malformed record.

| | |
|---|---|
| **Registered guard** | `capability-truth-smoke` CT-D0–D4 |
| **Browser guard** | `live-recovery-repro` LR-C11–C11c — a **harness-only** same-origin endpoint writes its headers, opens the body and never ends it, because no route interceptor can express that (Playwright's fulfil sends a complete body or nothing) |
| **Mutation** | M6 and **BM3** — with the timer cleared on headers, the read **never came back at all** |

---

## The 31 founder observations — complete disposition

Rounds 1 and 2 dispositioned 15. This round takes the remaining 16. Every row states its
reproduction, entry point, owner, result, guards, mutation result, and what is still unverified.

### 2 — Composer enabled while memory unresolved · CONDITION REPRODUCED · NOT FIXED · **founder decision**

Driven through the real `POST /api/assistant/turn` with the provider boundary stubbed, in three
memory states:

```
no conversation history at all   composer.degraded false   37-character composed reply
conversationId that does not exist   composer.degraded false   same
an empty conversation record     composer.degraded false   same
```

**The condition the founder described is real and I reproduced it.** The composer is gated on
`IQ_COMPOSER`, a key, egress and the provider — and on nothing about memory. It composes a reply
with no history, with an unresolvable id, and with an empty conversation.

**I have not fixed it, and I do not think I should decide it.** Whether IntelliQ should speak
before it has resolved what it remembers is a product judgement about when the system is entitled
to talk, not a defect with a right answer — a first turn legitimately has no memory and must still
answer, and an unresolvable id after a redeploy is a different case that may deserve to be said out
loud. Gating one without the other is the kind of change that looks small and alters what the
product is. **Written up for the founder rather than guessed at.**

### 6 — Welcome message overflow · NOT ADDRESSED

Not reproduced and not fixed. `typography-smoke` covers the iOS 16px input floor and the scale, not
this. Recorded as outstanding.

### 12, 13, 14 — PDF read as temporary context, then ignored as evidence · CONFIRMED · FIXED (item G)

**Reproduction.** A file attached, read for context, and then with no way to say what it *was*.
`materials` carried a hard-coded `provenance: 'internal'` and nothing distinguished "a scouting deck
to read from" from "a claim about this squad".

**Canonical owner.** `ai/material.js` L-MT6 — three classes, and the founder's rule that **user
assertion alone is not authoritative evidence**. Organisation evidence needs **permission**
(somebody entitled to speak for the group, or anybody could upload a document asserting what the
squad is like), **provenance** (a stated source — the same rule the citation gate applies to the
outside world), and **confirmation** (deliberate, separate from attaching, because consequential
things must never be side effects of an upload). A failed request is **downgraded**, not refused:
refusing loses the file, silence lets an assertion become a fact.

**A real defect this found.** The "nothing readable came out of that file" check was `text.trim()`,
and `String.prototype.trim` strips **whitespace** — a NUL is not whitespace. A corrupt binary (a
`.pptx` that failed to parse, an image renamed to `.txt`) arrived as control characters, survived
the check intact, and became a real material with a **control-character heading** in a coach's
attachment list. Found by attaching one.

**How much was actually read** is now reported: characters, sections, and whether either cap was
hit. A forty-slide deck yielding four sections means the file went wrong, and silence about that is
how somebody comes to believe IntelliQ has read a document it has four paragraphs of.

| | |
|---|---|
| **Registered guard** | `material-classification-smoke.js` (43) — every combination of the three requirements, because a conjunction is exactly the shape that passes its own tests while one term is quietly ignored |
| **Browser guard** | none. The classification card is asserted at source; it is **not** driven in a browser. See *Still unverified*. |
| **Mutation** | GM1 (assertion suffices — the founder's named failure), GM2 (no source), GM3 (no confirmation), GM4 (no downgrade), GM5 (inherited permission), GM6 (`trim()` only), GM7 (extraction hidden) — **all red** |
| **Unverified** | Real `.pptx`/`.docx`/`.pdf` parsing on a phone. `AttachmentHandler` runs in the browser and was not exercised with real binaries this pass. Mobile file selection is **not** verified. |

### 15, 16, 17 — the same-date two-source graph drawn as a vertical line · CONFIRMED · FIXED (item E)

**Reproduction.** Two accounts recorded at one timestamp. `px()` collapses a zero-width time range
to the middle of the axis, so every point lands on one x and the `<path>` between them goes
straight up. That is not a degenerate trend — it is a picture of an **infinite rate of change**,
produced by the least information the chart can hold.

**Canonical owner.** `ai/chart.js` L-CH6. The shape is derived from the points, declared on the
series, and **re-derived by the gate**, which refuses a declaration that disagrees with its own
data — the same treatment L-CH2 gives a count. A series with **no** declared shape is refused too:
an undeclared shape is the renderer's guess, and the renderer's guess is what drew the line.
"Distinct" is by **timestamp, not by day**: two things four hours apart are two moments and the
record can say which came first; whether that means anything is the reader's judgement, not a
renderer's to make by silently rounding.

**A bug in my own first version**, caught by my own CG19h: `_num` is
`Number.isFinite(Number(v)) ? Number(v) : null`, and `Number(null)` is `0` — a perfectly finite
number. So a spread's `at: null` came back as timestamp zero, every categorical series read as
having one distinct moment, and bars were made to carry a caveat about a time axis they do not have.

| | |
|---|---|
| **Registered guard** | `chart-governance-smoke` +19 (53) |
| **Browser guard** | `chart-shape-browser-check.js` (40) at **390px and 430px** — asserts the *condition* still holds (the points genuinely do share one x) and the *line* still does not, so it proves the fix rather than the absence of the input |
| **Mutation** | EM1 restores the original defect (`isTrend = true`) and the browser check goes **red at both widths**; EM2–EM6 also red |
| **Unverified** | Not seen on a real iPhone. Chromium at those widths is not iOS Safari. |

### 19 — Blank Focus creation panel above existing Focuses · NOT REPRODUCED · **not driven in a browser**

Read at source and checked against a live read: the make control is conditional on
`_bucketCopy.focus.make`, the empty state is a separate branch, and `GET /api/objects?scope=self`
returns zero focuses for a fresh member. Nothing in that path produces a blank panel *above* a
populated list.

**But I did not open the Focus page in a browser with several focuses in it**, which is the exact
state the founder described, so this is "not reproduced at source" rather than "not reproduced".
Left open.

### 21 — Forum control · PARTIAL (round 2) → **DONE** (item C)

**Reproduction.** `forumAvailable` was computed in **three places with three rules**, and they had
already drifted — the composer context accepted a group `subjectRef` and accepted participants on
*any* kind where the thread route did neither, so the same object could have a Forum in
conversation and none on its own screen. And **none of the three counted people**: all asked "is
there a node", so a node with one member on its roster offered a room with nobody in it.

**Canonical owner.** `server.js _forumAudience` — the founder's rule, counting **current readable
members**, resolved on every read from the roster as it stands now. Nothing is cached and no
membership list is stored, which is what makes a removal revoke the room on the very next request
and bring it back when they return.

**The icon no longer claims `aria-pressed`.** That attribute makes a button a **toggle** and a
screen reader announces it as one — "Open discussion, toggle button, not pressed" — for a control
that opens a room, has no on or off, and never had anything set it to true. Removed rather than
corrected: the honest value of an attribute that does not apply is its absence.

**A defect the suite found while I was writing it.** `_objectBucket`'s group branch read
`state.focuses`, which `ai/team-state.js` has never returned — it returns the active `focus` and the
closed `history`. So `state.focuses || []` iterated nothing on every call and **a group's Focus was
never in the object bucket at all**: no thread, no conversation, no attached material, no chart, no
forum icon, no A→B loop, because every one of those surfaces resolves its object through that
bucket. Nothing failed, because `|| []` is a perfectly valid instruction to iterate nothing — the
same shape as the undefined CSS token and the `hidden` container.

| | |
|---|---|
| **Registered guard** | `forum-audience-smoke.js` (42) |
| **Browser guard** | icon shape, label and 44px target asserted at source (FA-G1–G5); **not** driven in a browser this pass |
| **Mutation** | FM1–FM8 — **all red**, including FM8 which reproduces the group-focus defect |
| **Unverified** | The 44px target is asserted from the stylesheet, not measured in a browser. |

### 22, 23 — Packet feel, voice dependability · CONFIRMED (voice) · FIXED (item F)

Three things get called "voice" and they share nothing but the word: **server transcription** (an
OpenAI key on the host), **the browser microphone** (SpeechRecognition on this device), **reading
aloud** (speechSynthesis on this device). Settings reported one from another. Three rows now, each
answered by the thing that actually knows.

**Reading aloud failed silently** — the comment said so outright: *"if the browser cannot do it, the
button simply does nothing"*. A control that does nothing when tapped is the defect class this
engagement exists to remove. **And it spoke less than the screen showed**: a reply sits above its
sources and somebody listening got the claim without them. Reading a claim aloud and leaving its
qualification behind is the one asymmetry between the channels that matters, because a spoken
sentence carries more confidence than a written one.

**A live microphone now dies on navigation.** A recogniser is bound to a textarea **by id**, and
navigating replaces the page that textarea was on. Session end already cancelled; ordinary
navigation did not, and navigation is the common case.

"Packet feel" (22) is a judgement about the product rather than a defect. **Not addressed.**

| | |
|---|---|
| **Registered guard** | `voice-input-smoke` 31 → 60 |
| **Browser guard** | `settings-tiers-browser-check` ST-D0–D0d runs a fourth session with `SpeechRecognition` **deleted** — a real device class — and proves the row reads OFF with its reason while reading-aloud still reads ON |
| **Mutation** | VM1–VM5 — **all red** (two only after I fixed my own false greens; see below) |
| **Unverified** | No real speech was spoken. iOS Safari's SpeechRecognition differs from Chromium's and is **not** covered. |

### 24, 25, 26 — Settings overflow and clipping · PARTIAL (item H)

The **structure** is fixed: three tiers, three audiences. Settings was superadmin-**only**, so an
ordinary member had nowhere to answer "can this phone use its microphone" or "which build am I
running" — the second being the question the founder needed answerable while holding the device.
And the one page mixed a club's configuration with host diagnostics, so the screen that sets display
language also carried a button that **deletes an organisation**.

**Overflow and clipping themselves are not fixed.** Splitting the page removes most of what was
overflowing, but I did not measure the surviving panels for clipping at 390px. Recorded as partial.

| | |
|---|---|
| **Registered guard** | `one-app-smoke` 16 → 20 (OA7–OA7e) |
| **Browser guard** | `settings-tiers-browser-check.js` (26) — four sessions, four contexts, 390px |
| **Mutation** | HM1–HM5 — **all red** (HM5 only after strengthening; see below) |
| **Unverified** | Clipping and overflow at 390px on the surviving panels. Not measured. |

### 29, 30, 31 — Sector packages · the A→B web not visible · cross-evidence not proven live

**30 and 31 are FIXED (item A).** `/api/group/:nodeId/inquiry`, `/api/group/:nodeId/focus` and its
`/outcome` were three routes, fully built and fully governed, **reachable by nothing a person could
tap**. `reachability-smoke` recorded them by name for two passes. The team card — which had shown a
group's High, Low, Inquiry and Focus for weeks and led nowhere — now opens the group; a leader sets
a focus **out of** an inquiry (so `origin.from === 'inquiry'` is true rather than decorative, which
is what stops outcome learning crediting the system for a coach's own idea), records what came of
it, and the loop **reopens**. `/api/objects/:kind/:id/related` is fetched and rendered.

**The door in at the bottom was worse.** `#me-group` carries a `hidden` attribute, the stylesheet
has `[hidden]{display:none!important}`, and nothing ever removed it — so `_renderGroupNoticings` ran
on every Home render and drew its cards into an element with `display:none` and
`offsetParent:null`. **Verified in Chromium, not argued from source.** Offering a noticing is the
only way a member's observation becomes material the group can reason about, and a group inquiry
opens only when two *independent* people have done it. So no member could ever offer, and **no group
inquiry could ever open from the product**. The group half of the loop had no door at either end.

**29 (sector packages) is NOT DONE.** Unaudited, as in round 2.

| | |
|---|---|
| **Registered guard** | `group-loop-smoke.js` (37) — authorisation matrix with both tenants holding an inquiry of the **same id**, the shape that catches an org-blind lookup |
| **Browser guard** | `group-loop-browser-check.js` (46) — the whole walk at 390px, plus what a member sees in a **separate context** rather than a token swap in the same tab |
| **Mutation** | the four A→B reachability guards; `team-state-smoke` 13 rewritten and verified red against the original defect |
| **Unverified** | Sector packages entirely. Not audited. |

---

## Items A–I

| Item | Result |
|---|---|
| **A** reachable human A→B loop | **DONE** — both halves, both ends |
| **B** human-scoped external web reading | **DONE** — the gap was the client hard-coding `scope=self`, so reading was unreachable at group grain for everybody including the group's own leader |
| **C** object Forums, one canonical availability owner | **DONE** |
| **D** shared output manifest | **DONE** — `ai/manifest.js`, five channels, one record |
| **E** graph semantics | **DONE** |
| **F** voice | **DONE** for the laws; iOS Safari unverified |
| **G** attachments and Library | **DONE** for classification and extraction reporting; mobile file selection unverified |
| **H** Settings role separation | **DONE** for structure; overflow/clipping unmeasured |
| **I** CI and verification | this section |

### D — the shared output contract, in a sentence

One answer leaves through five doors and each decided for itself what it could carry.
`verifyGrounding` checked prose against a **blob of context text** by substring; the chart gate
checked refs; the citation gate checked its own sources; voice checked **nothing at all**. Four
verifiers, four vocabularies, no way to ask whether the thing a person is being told is the thing
we approved.

The founder's instruction was explicit — *do not rely only on keyword checks* — and asking "does
this number appear anywhere in the context?" **is** a keyword check that almost any small number
passes, because a bundle full of timestamps and ids contains most small numbers somewhere. A
manifest lists the numbers, dates and names **this claim** may state.

All nine named mutations are driven, plus **L-MF5**, which no other channel checks: voice may not
**drop** the claim carrying the uncertainty, because a spoken sentence sounds more certain than a
written one and the qualification is the first thing a summariser cuts — while an honest
*rephrasing* still passes, or the gate would refuse every real reading.

**A hole in my own first version**, found by running the verifier against its examples rather than
reading it: the patterns matched digits, so *"Four separate accounts point the same way"* sailed
through while *"4 separate accounts"* was refused. A model writes small counts as words most of the
time — so the check was failing in the common case and passing in the rare one. A check that
recognises one spelling of a thing recognises the spelling, not the thing.

---

## False greens found this pass — seven, all mine

Recorded because a reviewer should not have to find them.

1. **`CT-A5e` contained a dead no-op.** It assigned `gateway.complete` and immediately restored it,
   proving nothing. Rewritten to stub the real provider boundary (`client.messages.create`) so a
   genuine success clears the fault record.
2. **`CT-B4` never tested the copy it claimed to.** It reset the record and asserted null. Now it
   grabs the record, mutates what it was handed, and re-reads.
3. **The first capability browser phase reported green against nothing.** The row selector failed on
   leading whitespace, so every row list was empty — and every *negative* assertion ("no reason is
   printed", "never rendered as a missing key") is satisfied for free by the empty string. `LR-C0`
   exists because of that: the row must be **found** to be judged.
4. **`V24b` matched its own comment.** It tested `/cannot read text aloud/` against the **raw**
   source, so the comment explaining the defect satisfied it whatever the code did — and its
   negative half looked for `return;` while the mutation wrote `return false;`. Two independent
   reasons to pass, neither of them the law. It now requires every `return` in the function body to
   be preceded by a `say()`.
5. **`VM5` removed the voice session guard and `voice-input-smoke` stayed green.** The law was only
   ever defended in the **browser** suite, so the hermetic layer could not see it go. A law defended
   in one place travels only as far as that place gets run. `V31a–e` now drive it hermetically.
6. **Three reading-scope mutations survived**, all because I tested *structure* where the law is
   *behaviour*: `BM2` short-circuited the egress assertion with `false &&` and my regex still
   matched the call; `BM3` showed uncited prose and I had no behavioural test at all; `BM6` made the
   origin lookup subject-blind and **my collision fixture declared the correct subject first**, so
   `find()` returned the right object anyway. The decoy is declared first now.
7. **`docs-status-smoke` was green locally and red in CI on the same tree**, which is the one shape
   that makes every other green in this report worth less: the check anybody runs before pushing
   could not predict the check that gates the merge. It counted the `pull_request` event's
   **synthetic merge commit** as work the index had not seen, so its answer was one higher in CI
   than on the machine it was being read from, and the threshold happened to sit in that gap. It now
   counts `--no-merges`. Found by the failure, not by reading, and detailed under the CI verdict
   line below.

Two more in the same class, caught and fixed: **`HM5`** (the device row hard-coded to `true` looked
identical in a Chromium that *has* speech recognition — a fourth session with the API deleted now
catches it) and **`ST-A8b`** (I forged a `POST` to `/api/values`, but the write is a `PUT`, so
Express answered 404 and my assertion reported a missing gate **that was never missing** — a test
naming the wrong route reports a hole in the product where the hole is in the test).

## Tests rewritten, not weakened — five

Each was a **proxy** that held while the law failed, or that pinned a design the founder has since
changed. Every one is stated here rather than quietly re-spelled.

- **`PX-E22`** pinned the literal `fetch('/api/health')` as a proxy for "the panel asks the server
  at render time". Twice: first when the panel moved to the bounded reader, then when Settings split
  into tiers and the call became guarded. Now asserts the law in two halves and requires the read to
  be **inside** the panel, which the original never did.
- **`team-state-smoke` 13** asserted `id="me-group"` exists and a zero-arg `_renderGroupNoticings()`
  is called. **Both were true throughout the defect** — the container was `display:none`. It now
  requires the mount container to exist **and not be hidden**. Verified red against the original
  code; the old one could not be.
- **`OA7`** pinned `Auth.isSuperAdmin()` on the Settings nav entry — right for the design it was
  written against, wrong for the one the founder chose. Inverts exactly as `OA6` already did for the
  org tree, and now checks the **inner** gating too.
- **`WS12`** pinned `/reading?scope=self` and would have **directly contradicted** the new
  reading-scope suite — one asserting the hard-coded scope is present, the other that it is gone.
  The older assertion was pinning the bug.
- **`reachability-smoke`'s tail-hole list had no shrink check**, unlike the other two debt lists, so
  a route on it could gain a caller and nothing would notice. It has one now, and four routes came
  off the bill.

## Mistakes I made, recorded

- I wrote the group roster into **`_myGroups`**, which already means the `/api/groups`
  message-recipient list (`{id,name}`) rather than org nodes (`{nodeId,role}`). It would have left
  the message group selector rendering `value="undefined"` for every option. Renamed `_myNodes`.
- My first textarea wore `iq-field` — the **wrapper** class — instead of the shared
  `iq-field-input` shell. `focus-shape-smoke` was right to count it as a thirty-third stray.
- I called `_audit` with action `'forum_post'`, which is not in `ai/audit.js`'s allow-list, so
  `record()` refused it and the call was a **silent no-op that read like a record being kept**.
  Removed rather than widening that vocabulary: the trail is "who accessed whose personal data", and
  somebody choosing to speak in a room they are already in is not an access of anybody's data.
- My first `_forumContext` guessed a composite thread key. The real keys are the inquiry's own id
  (node rooms) and `focus:<id>` — a guess would have read nothing and returned "no forum" for every
  room that exists, which is the quietest possible failure.
- `V30` sliced from `_micFor` to `_threadTurn`, which appears **earlier** in the file. The slice was
  negative and the length guard turned a vacuous pass into a visible failure, which is what it is
  for.

---

## Commands run

```
git status --porcelain          # clean, md5 d41d8cd9… BEFORE npm test
npm test                        # GREEN — 246 registered suites
git status --porcelain          # clean, md5 d41d8cd9… AFTER npm test — identical
git diff --check                # clean
```

Eight browser suites, all green, **386 assertions**:

```
live-recovery-repro             63    group-loop-browser-check        46
chart-shape-browser-check       40    settings-tiers-browser-check    26
priority-surface-browser-check  39    stack-browser-check            114
onboard-browser-check           34    library-browser-check           24
```

Sixty-six mutations across nine work items, each applied to the **production** line, confirmed red,
restored, and the tree verified clean afterwards:

```
M1-M8    capability panel + provider fault      8    FM1-FM8   forum audience        8
BM1-BM3  capability, in a browser               3    EM1-EM6   chart shape           6
CM1-CM6  confidence explanation                 6    VM1-VM5   voice                 5
(A)      PX-E22 constant; team-state 13         2    HM1-HM5   settings tiers        5
BM1-BM6  reading scope                          6    GM1-GM7   material class        7
DM1-DM10 output manifest                       10
```

## Still not verified by anybody

Unchanged from round 2, and I am not claiming any of it:

- **Live Neon, restart durability, deployed build identity.** No `DATABASE_URL`, no Render key.
- **Real provider configuration.** No model key; the provider-fault recorder was exercised by a
  genuinely failing call, not by a revoked key on a live host.
- **Real iPhone / Safari.** Chromium at 390×844 and 430×932 is **not** iOS Safari. Voice in
  particular differs.
- **Mobile file selection and real binary parsing** (item G).
- **Settings overflow and clipping at 390px** on the surviving panels (observations 24–26).
- **Sector packages** (observation 29). Unaudited.
- Observations **2**, **6** and **19** could not be reproduced; **22** ("packet feel") is a product
  judgement rather than a defect and was not addressed.

---

## How each verdict line below was reached

- **21/31.** Rounds 1–2 closed 15 (1, 3, 4, 5, 7, 8, 9, 10, 11, 18, 20, 21-partial, 27, 28). This
  round closes **12, 13, 14, 15, 16, 17, 21, 30, 31** and adds **2** as a reproduced condition
  written up for founder decision. **19** is not reproduced at source but was not opened in a
  browser. **6, 22, 24, 25, 26, 29** remain: 24–26 are structurally addressed but their overflow
  and clipping are unmeasured, so they are **not** counted.
- **HUMAN EVIDENCE WEB: PASS.** Both halves walk, at both ends, in a browser.
- **SINGLE-NODE CROSS-REFERENCE: PASS.** `/related` is fetched and rendered; the loop is asserted
  hermetically and in a browser, with the causal caveat unconditional.
- **FORUM ONE-WAY CONTEXT: PASS.** One availability owner counting current readable members;
  Forum → private bounded to the same object with no author; private → Forum only through an
  explicit action with an audience preview and a confirmation.
- **OUTPUT MANIFEST CONSISTENCY: PARTIAL.** The manifest exists, is verified on five channels, and
  is wired into the composer's prose path, where it runs **before** the older `verifyGrounding`
  cage — both must pass, and either refusing degrades the turn; the order decides only which
  violation gets logged. The card, graph, citation and voice channels are proven **against the
  module**, not yet routed through it in production — `_chartHTML`, `_msgActions` and `_speak`
  still verify by their own older gates.
- **VOICE INPUT: PASS** for the laws, hermetically and at source. **VOICE OUTPUT: PARTIAL** — it no
  longer fails silently and carries the source disclosure, but it is not yet verified against the
  manifest and has never been heard on iOS.
- **PILOT CODE BLOCKERS: 0.** The round-2 blocker (the group loop having no doorway) is closed.
- **PILOT OPERATIONS BLOCKERS: 3.** No `DATABASE_URL`, no Render key, no model key — unchanged, and
  none of them is a code problem.
- **CI ON EXACT HEAD: PASS.** Truth Layer run **800**
  (<https://github.com/TatendaMukudu/platform/actions/runs/34655002948>), `head_sha`
  **8e47510bd4677793e71b7bf211dfc443a4778f5b**, conclusion **success**, one job
  (`node scripts/test.js`), 2m32s. Run **798** on `f7d3551`
  (<https://github.com/TatendaMukudu/platform/actions/runs/34653760109>) was the first green on this
  branch's head, 2m53s. Both read from the Actions **run** API rather than from check-runs — a
  previous pass reported this branch's CI as hung on the strength of a check-runs response still
  saying `in_progress` after the run had finished, so the run record is the one that decides.

  **Between them, run 799 went red, and it is the most useful thing in this section.** The commit it
  ran on changed documentation and nothing else, `npm test` was green on it, and CI
  failed: `docs-status-smoke`, which asserts `docs/INDEX.md` is not more than twenty commits behind
  HEAD. The event is `pull_request`, so what GitHub runs is a **synthetic merge commit** of this
  branch into the base rather than this branch's head — one extra commit. The count was therefore
  **20 locally and 21 in CI**, and the threshold sat exactly in that gap: green on the machine
  anybody checks it from, red on the machine that gates the merge, with no change between them
  worth failing over. A measure that disagrees with itself by a constant depending on where it runs
  is a coin flip at its own boundary, and a local green that cannot predict CI is the same false
  comfort as a green suite over a broken product.

  Both halves fixed, and neither is the threshold. `docs-status-smoke` now counts with
  `--no-merges`, which removes the harness's own construction and **not** the work: proven by
  building a real merge of a divergent base and counting both ways — 22 with merges, 21 without, so
  the merge commit stops counting while the base-branch commit it carries is still counted. And the
  guard was *right on the substance*: `docs/INDEX.md` was written against `58e1c68` and genuinely
  had not seen this branch, still recording thirteen observations dispositioned and still stating
  that the group Focus and Inquiry routes have no client caller — which item A closed. The index is
  rewritten against the current head, not nudged past the limit. The staleness guard was re-driven
  at 25 commits behind and goes red, so it has not been defanged.

  This line names the head as it stood when the run was observed; the commit that writes the line
  down cannot contain its own identifier, so its run is reported on the pull request instead.

---

FOUNDER OBSERVATIONS DISPOSITIONED: 21/31
AUDIT CATEGORIES DISPOSITIONED: 25/25
HUMAN EVIDENCE WEB: PASS
SINGLE-NODE CROSS-REFERENCE: PASS
FORUM ONE-WAY CONTEXT: PASS
OUTPUT MANIFEST CONSISTENCY: PARTIAL
VOICE INPUT: PASS
VOICE OUTPUT: PARTIAL
FALSE-GREEN TESTS FOUND THIS PASS: 7
PILOT CODE BLOCKERS: 0
PILOT OPERATIONS BLOCKERS: 3
GITHUB CI ON EXACT HEAD: PASS
SAFE TO MERGE: NO
READY FOR FINAL FOUNDER PHONE/RESTART RETEST: NO

---

# Round 4 — the independent gate's eight items

**Round 4 starting SHA:** `c7fb104`
**Branch:** `claude/pilot-live-recovery-r1` · **PR #89 — open, not merged.**

The independent gate accepted eight of round 3's claims and refused the rest, with a specific and
correct objection: *a verifier nothing calls on the way to a screen is a verifier that will be
correct about an answer nobody was shown.* Seven items were returned for independent disposition.

`npm test` **GREEN** — 250 registered suites. Eight browser suites, **387 assertions**, all green.
Working tree byte-identical before and after the run. `git diff --check` clean.

**Twenty-eight mutations** applied to the production line, all ending red. Three of them
(**M1, M5, M7**) survive every behavioural assertion and are red only on a structural one; that is
stated where it is true rather than blurred, and the reason is given below. Two (**M41, M42**)
first *crashed* the suite rather than failing it — PROTOCOL lie #8, in my own harness — and the
harness was fixed so a missing handler now produces a FAIL naming the actual defect.

## Three dead capabilities, all previously reported PASS

The round-3 report said the Forum-informs-this-object rule worked and that the composer was handed
its cross-evidence connections. Both were false, and I had read that code twice.

| What | Where | Why nothing failed |
|---|---|---|
| `_forumContext` returned null on **every** call | `server.js` | It parsed `_turnAbout(about)` and read `a.kind`. `_turnAbout` returns `{headline, body}` — it has never returned a kind. |
| `_crossEvidenceContext` returned null on **every** call | `server.js` | The same line, the same mistake, in the function beside it. |
| The card's Forum indicator could never be true | `js/app.js` | It read `item.shared` and `item.participants`; the objects projection strips `raw` and never sets `shared`. |

A reader that returns null is indistinguishable from "there was nothing to add". That is the third
time this engagement has found a correct mechanism with no door, and the first two were found the
same way: by driving it rather than reading it.

---

## Item 1 — SHARED OUTPUT MANIFEST · **DONE (runtime)**

| | |
|---|---|
| **Production entry points** | `POST /api/assistant/turn`; `GET /api/objects/:kind/:id/thread`; `GET /api/objects/:kind/:id/chart` |
| **Canonical owner** | `ai/manifest.js` — `manifest()`, `approve()`; `_speechFor` and `_objectManifest` in `server.js` |
| **Reproduction** | Drove all three routes and read every channel off the wire (`output-channels-http-smoke`). |
| **Registered tests** | `output-manifest-smoke` (49 → 69), `output-channels-http-smoke` (26, new) |
| **Mutations** | M1–M11, all red |
| **Verdict** | **CONFIRMED** for prose, citations, voice and the object card+graph. |

`approve()` is the runtime gate: every channel an answer leaves by, checked against one manifest in
one place, plus agreement between them **by claim id** — the channels are meant to read
differently, so comparing their words would pass everything or fail everything, while comparing
what they rest on asks the question that matters. It returns the approved result or a refusal,
never a partly approved answer, because a caller handed "the prose was fine" ships the prose.

**The spoken channel moved to the server.** It was assembled in the browser from the message text
plus a source count the browser counted itself — a second author for one answer, on the one channel
nothing verified. `_speechFor` composes it once, beside the prose, in an order that is the point:
the answer, then what it cannot show, then what it rests on, because a listener cannot skim back.

**Four laws added, each from a hole the wiring found.** L-MF6's second direction (an external claim
whose approved source is *not shown* is refused — nothing on screen distinguishes an answer resting
on a page you were given from one resting on a page you were not). **L-MF7**, a graph may not
outrun its sentence: the points being individually approved does not approve the *line*, so the
movement is a claim named on the series and derived from the record's own dated facts rather than
from the builder that drew the picture. **L-MF8**, one answer, every door, one call. And voice now
loses the **limitations** as well as the uncertainty.

Two more found by running it: `sources` was not in the countable vocabulary, so "this rests on N
sources" — a count about this organisation's record — went unchecked; and an empty moments list read
as "no constraint", the fail-**open** shape AGENTS.md invariant 7 forbids.

**What is honest about M1/M5/M7.** Dropping the voice channel from the composer's `approve` call
(M1), the chart route's gate (M5), and the thread route's card channel (M7) each survive every
behavioural assertion in this repository, because **no live fixture can make those channels
violate**: the spoken rendering is derived from the approved prose by appending approved material,
and every plotted moment comes from a record fact. They are gates against the next change to
`_speechFor` or to a chart builder, and ai/manifest.js is driven against exactly those cases at the
module. Their presence is pinned structurally and their behaviour at the module; the report says
which is which rather than claiming behavioural coverage it does not have.

**Counterexample the brief names, driven:** prose correct while the voice is still reading the
*previous* answer — each channel verifying alone, the answer refused anyway (`OM-I7a`); and prose
correct while the graph is overconfident, the same approved points drawn as a movement nobody
claimed (`OM-I7b`).

**Not done:** the card channel's claim approves its own figures, exactly as the belief claims do on
the prose path — both are kernel-authored, so "the card invented a figure" is not a live risk the
way it is for a model. What the manifest adds for the card is that its spoken rendering and its
picture must agree with it.

## Item 2 — HUMAN A→B LOOP, THE REAL MEMBER PATH · **CONFIRMED**

| | |
|---|---|
| **Production entry point** | `POST /api/assistant/turn` → `_intakeTurn` → `_noteGroupCandidates` |
| **Canonical owner** | `ai/contribution.js`; `/api/group/:nodeId/candidates`, `/contribute`, `/focus`, `/focus/:id/outcome` |
| **Reproduction** | Nine-step walk from the personal composer to a closed group Focus. |
| **Registered tests** | `member-contribution-http-smoke` (40, new); `group-loop-browser-check` (47, no seeded candidate) |
| **Mutations** | M20 candidate wiring, M21 the explicit-contribution gate, M22 origins-as-contributors — all red |

`ai.completeJSON` is the one seam, because that is where a model reads an utterance; the grounding,
the scope classifier, the candidate store and every route after it are real. Driven: noticing
without publishing; nobody else seeing it, leader included; a reference carrying its origin; one
voice failing to open the inquiry; **two people relaying one origin refused as ECHO**; two
independent origins opening it; no private sentence anywhere in the group projection; a Focus with
`origin.from === 'inquiry'`; an outcome including the honest `unclear`; the closed focus kept and
the loop reopening.

**A defect the seeded fixture was hiding.** The intake contract never asks a model for a `label`
(read `INTAKE_PROMPT`), so a candidate's label was always the raw canonical key — the member's only
way into the group loop offered them **"football.press_shape"** to contribute. The seeded candidate
carried a human sentence, which is exactly how a browser check stays green about a screen nobody
could use.

## Item 3 — OBJECT FORUMS AND PRIVACY · **CONFIRMED**, after three fixes

| | |
|---|---|
| **Production entry points** | thread route; `/api/forum/:kind/:objectId`; `/api/group/:nodeId/forum/:inquiryId`; `POST /api/assistant/turn` |
| **Canonical owner** | `_forumAudience` (availability) and `_forumContext` (one-way read) |
| **Registered tests** | `forum-audience-smoke` (42 → 80) |
| **Mutations** | M30–M33, all red |

All four kinds now driven — a group High, Low, Inquiry and Focus on a three-person node; the same
four on a **one-person** node; the same four personal — plus a kind that is not one of the four and
an object with no kind at all, both failing closed. Cross-object, cross-tenant, and a member
removed from the node getting nothing **on the very next read** and it coming back when they
return. Speech is not evidence: posting reports `epistemicEffect: 'none'` and leaves the inquiry
byte-for-byte unchanged; somebody else cannot offer your words; its author can, only through the
same contribution boundary. `FA-L` drives the real turn and reads what the model was handed.

The three fixes are the table at the top of this round. The icon decision is applied: the card's
literal word "Forum" is now the same inline SVG as the control on the object's own screen, with its
meaning carried accessibly and no tap target of its own.

**Kept deliberately:** the `<h1>Forum</h1>` heading *inside* the room. The founder's instruction is
about button text where the icon decision applies; a heading telling somebody which room they are
in is not a control, and removing it would leave the page unlabelled.

## Item 4 — VOICE · **PARTIAL**

| | |
|---|---|
| **Canonical owners** | `js/voice.js` session registry (input); `_speechFor` + `MemberApp._speak` / `_voiceControl` (output) |
| **Registered tests** | `voice-input-smoke` (60 → 74) — the production methods lifted out of `js/app.js` and **executed** against a stubbed `speechSynthesis` |
| **Mutations** | M40 session guard, M41 speaking state, M42 error-after-start — all red |

Input: V31 proved a late result after **cancel**, which was the working case. The founder's actual
defect was `cancelAll` — what sign-out and every navigation call — and V31f–h now drive it.

Output: states are `unsupported`, `starting`, `speaking`, `stopped`, `interrupted`, `error`, each
with words; a control that cannot work is not drawn and the reason is drawn in its place; pressing
it again stops it and it can be started again; a newer utterance replaces an older one and the row
it replaced says so.

**PARTIAL, and why:** reading aloud has never been heard on iOS, or on any real device. What is
proven is the state machine and the refusals; nothing here says Safari speaks.

## Item 5 — ATTACHMENTS AND LIBRARY · **CONFIRMED**

| | |
|---|---|
| **Canonical owner** | `AttachmentHandler.MATERIAL_EXTENSIONS` / `materialAcceptAttr()` |
| **Registered tests** | `material-accept-smoke` (14 → 26) |
| **Mutations** | M50 the hand-written list, M51 the unbounded upload, M52 the missing retry — all red |

The shared composer's paperclip was a **third** accept list on a path that is unambiguously the
Material path: it offered `.json` and `.markdown` (no parser entry), `.doc` (routes to the docx
processor, which opens a zip — a legacy binary is not a zip), and `.pdf` (returns bytes), while
omitting `.pptx` and `.xlsx`, the two formats the capability exists for. Derived now.

The upload had **no ceiling** — the one write in `js/app.js` that was not bounded. 30s, cleared in
`finally`, a timeout that says "nothing was saved", and a retry, because the picker is cleared
before the request.

Unchanged and restated: a file attached in conversation is named as **context**, never as evidence,
and promotion stays a separate deliberate act through `POST /api/materials/:id/classification`.

**Not verified:** mobile file selection on a real device. Chromium is not a phone picker.

## Item 6 — READINESS AND OPERATIONS · **CONFIRMED**

| | |
|---|---|
| **Canonical owner** | `_readiness()` in `server.js`; `/api/health` |
| **Registered tests** | `readiness-levels-smoke` (20, new) |
| **Mutations** | M60 durability ignoring configuration, M61 `ready` collapsing into durability — both red |

Found while writing it: **`durableStore` reported TRUE in memory-only mode.**
`_persistenceReady.ready` is the save path's question — may this process attempt a write — and is
deliberately true with `DB_OPTIONAL`. Reporting that as durable told a reader writes survive a
restart on a host where nothing does. A store that is not configured is not durable however
willingly this process writes to it.

`persistenceConfigured` is now its own field. `ready` stays stores-loaded **on purpose** — a request
served correctly from memory is a served request — and the law is that the two never collapse into
one field. Levels 4 and 5 are answered by the gateway and the build stamp, the only things that
know.

## Item 7 — UNIVERSALITY · **CONFIRMED**

| | |
|---|---|
| **Canonical owner** | `ai/packs.js` |
| **Registered tests** | `cross-domain-smoke` (31, new) |
| **Mutations** | M70 a vertical pack appearing, M71 a domain adding a concept — both red |

Four organisations — sports, education, business, nonprofit, plus universal as a control — same
people, same node shape, byte-identical signals, driven through the real group inquiry route. The
band, score, independent origins, contributor count, contested flag and signal count are identical
across all five. The four vocabularies name the **same set of concepts**; only the words differ.

`PACKS` holds one pack and `resolvePack` returns it whatever it is handed. The server has **exactly
one** comparison against a domain id and it selects a word, not a behaviour; that count is pinned,
and the scan of every other `ai/*.js` is proven against a planted fork rather than trusted for its
silence.

---

## Still not verified by anybody, round 4

- **Live Neon, restart durability, deployed build identity, Render behaviour.** No `DATABASE_URL`,
  no Render key. `readiness-levels-smoke` asserts the health payload never *claims* any of them.
- **Real provider configuration.** No model key. Every composed-reply assertion in this round runs
  against a stubbed `ai.complete` / `ai.completeJSON`; what is proven is what the product does with
  a written reply, not what a real model writes.
- **Real iPhone / Safari.** Chromium at 390×844 and 430×932 is not iOS Safari. **Reading aloud has
  never been heard.**
- **Mobile file selection and real binary parsing.**
- **Settings overflow and clipping at 390px** (observations 24–26) — structurally addressed,
  unmeasured.
- **Sector packages** (observation 29) is now audited as code (item 7); nobody has used one.
- Observations **6, 22** remain as they were.

## Commands run, round 4

```
npm test                                    GREEN, 250 registered suites
git diff --check                            clean
md5sum $(git ls-files) | md5sum             identical before and after npm test
node scripts/<eight browser suites>.js      387 assertions, 0 failed
28 mutations, stdout AND stderr read        28 red
```

**CI, read from the Actions RUN api rather than from check-runs** — a pass on this branch once
reported CI as hung on the strength of a check-runs response still saying `in_progress` after the
run had finished, so the run record is what decides. **Runs 802–809, one per item commit, every
one green.** The last of them is run **809**
(<https://github.com/TatendaMukudu/platform/actions/runs/34676477324>) on
`778667acc7cf038923e50c3da46216576901a109`, 3m05s, one job. The event is `pull_request`, so what
GitHub runs is the synthetic merge of this branch into the base rather than the branch head
standing alone. This line names the head as it stood when the run was observed; the commit that
writes the line down cannot contain its own identifier, so its run is reported on the pull request
instead.

---

FOUNDER OBSERVATIONS DISPOSITIONED: 21/31
AUDIT CATEGORIES DISPOSITIONED: 25/25
GATE ITEM 1 — OUTPUT MANIFEST: DONE (runtime wiring, three channels degraded on refusal)
GATE ITEM 2 — A→B MEMBER CONTRIBUTION: CONFIRMED
GATE ITEM 3 — FORUM SEMANTICS: CONFIRMED
GATE ITEM 4 — VOICE INPUT: CONFIRMED · VOICE OUTPUT: PARTIAL
GATE ITEM 5 — ATTACHMENTS AND LIBRARY: CONFIRMED
GATE ITEM 6 — READINESS LEVELS: CONFIRMED
GATE ITEM 7 — UNIVERSALITY: CONFIRMED
DEAD CAPABILITIES FOUND THIS ROUND: 3
MUTATIONS THIS ROUND: 28 applied, 28 red
PILOT CODE BLOCKERS: 0
PILOT OPERATIONS BLOCKERS: 3
GITHUB CI ON EXACT HEAD: PASS
SAFE TO MERGE: NO
READY FOR FINAL FOUNDER PHONE/RESTART RETEST: NO

---

# Round 5 — merge-readiness: the dead capabilities driven, voice finished, and the first real database

**Round 5 starting SHA:** `8f0b9c6`
**Branch:** `claude/pilot-live-recovery-r1` · **PR #89 — open, not merged.**

Round 4 *corrected* three dead capabilities and *drove* none of them. A fix with no test that bites
is a fix waiting to be undone — and it was the absence of a driving test that let all three die
unnoticed in the first place. This round drives them, finishes voice output, and runs the product
against a real database for the first time in its history.

`npm test` **GREEN** — 252 registered suites. Nine browser suites, **409 assertions**, all green.
Working tree byte-identical before and after the run. `git diff --check` clean.
**Seventeen mutations** applied; sixteen red, and the seventeenth is recorded below rather than
counted as a pass.

---

## 1 · The three dead capabilities, driven

### `_crossEvidenceContext` · **CONFIRMED**

| | |
|---|---|
| **Production entry point** | `POST /api/assistant/turn`, bound to an object |
| **Canonical owner** | `_crossEvidenceContext` → `ai/cross-evidence.js` |
| **Reproduction** | `ai.complete` replaced with a capture; the real turn runs; every assertion is about the string the model was handed. |
| **Registered test** | `cross-evidence-context-http-smoke` (21, new) |
| **Mutations** | M80 the old `_turnAbout` read · M81 the `connections:` line · M82 the outcome · M84 the authorised set — **all red** |

Driven: the relationship named correctly (*"this was started to work on an inquiry: Recovery
between fixtures"*), the outcome the person recorded, what has arrived **since** as a count, and the
causal refusal in the same block as the data. Half the file is what must *not* be there — no private
sentence, no unrelated object of the reader's own, none of another person's, no other tenant, nobody
else named.

**A second defect under the first.** `focus.outcome` is a record — `{result, note, by, at}` — and
`ai/cross-evidence.js` read `raw.outcome || null` and clipped it to twenty characters, so the model
was handed **"the person recorded the outcome of this focus as: `[object Object]`"**. The field was
present, the sentence was well formed, and the only thing wrong with it was that it said nothing.

**Mutation M83 survived, and the suite now says why.** Removing `if (!self) return null` changed
nothing any assertion could see, because that check is not the gate: every edge is derived over
`_allObjectsFor(code, userId)`, the reader's *own* authorised set, so another person's object has no
edges to find. M84 mutates the authorised set instead and CE-D1 goes red. A reader of that file
should know which line is load-bearing.

### `_forumContext` · **CONFIRMED**, all four kinds

| | |
|---|---|
| **Production entry points** | `POST /api/assistant/turn`; `/api/group/:nodeId/forum/:inquiryId`; `/api/forum/:kind/:objectId` |
| **Registered test** | `forum-context-http-smoke` (46, new) |
| **Mutations** | M90 the reader · M91 the room key · M92 the caller · M93 the membership re-check — **all red** |

A group **High**, a group **Low**, the lead **Inquiry** and a group **Focus**, each with a
distinctive sentence posted into its own room through the routes a person uses. Each turn carries
its own room's words and none of the other three. A member removed from the node is handed nothing
**on the very next turn**, and it returns when they do. Another tenant fails closed at the object.

**An empty room is not a failed read**: a room nobody has spoken in answers 200 with no messages, a
room that does not exist answers with an error, and a room somebody may not read is refused rather
than returned empty.

**Twelve members, five contributors**, and the numbers are the point — the cohort floor is
**two-sided**, so a squad of six can never surface a High at all and every assertion about one would
pass against a permanently refusing surface. My first fixture was exactly that.

### The Forum indicator · **CONFIRMED**, and it found a third disagreement

| | |
|---|---|
| **Production entry point** | `GET /api/objects?kind=…&scope=…` — the projection the cards are built from |
| **Registered tests** | `forum-context-http-smoke` §F; `forum-audience-smoke` §K; `group-loop-browser-check` §I (browser) |
| **Mutations** | M94 the node read off the scope · M95 the projection dropping availability — **both red** |

Driving the projection found that a group High, Low or Inquiry reported `forumAvailable: false` on
the **list** while its own **screen** reported true: `ai/team-state.js`'s projection carries neither
a `nodeId` nor a group `subjectRef`, and the thread route was injecting the node from its scope
while the list route was not. Every bucket item carries `scope`, so the **owner** reads it and no
caller has to remember to inject anything.

The browser guard **fails if the card list is empty**, because every negative assertion below it is
satisfied for free by an empty screen — which is how the last browser hole passed. A squad object
carries the indicator as an inline SVG with an accessible name; the coach's own personal focus
carries none; the literal word "Forum" is nowhere on the cards. The room's own `<h1>` heading stays:
it is a heading, not a control.

---

## 2 · Voice output · **COMPLETE IN CODE, UNHEARD ON ANY DEVICE**

| | |
|---|---|
| **Canonical owner** | **`js/voice-output.js` (`window.IQVoiceOut`)** — new |
| **Registered test** | `voice-input-smoke` (74 → 83), loading the module rather than slicing app.js |
| **Browser test** | `voice-output-browser-check` (16, new) — five states by tapping a real button at 390px |
| **Mutations** | M100 interrupt · M101 the unsupported branch · M102 the swallowed throw · M103 `onerror` · M104 `stop`'s announcement — **all red** |

The state machine lived inside `js/app.js`, beside the row that renders the button — which is how it
came to *compose* the spoken sentence in the first place. Moving it out removes the place where a
second author for one answer can grow back. `app.js` now holds no `SpeechSynthesisUtterance`, no
state table and no handler.

**The law that makes the rest true, now asserted:** the owner never *reads* text out of the page —
no `innerText`, no `textContent` read, no `querySelector` for a message. The only thing it writes
into the page is a **state**, into the live region the row already carries.

**A new answer now stops the old one.** Asking a second question while the first reply was still
being spoken left the old answer finishing over the new one on screen. And the Settings row
"Reading replies aloud" now asks `IQVoiceOut.isSupported()` instead of testing the globals itself —
a second implementation of a question the owner already answers.

**Two things the browser found that the hermetic layer could not.** `window.speechSynthesis = {…}`
fails **silently** in Chromium (it is a read-only accessor), so my first stub left the native engine
in place and I read the resulting throw as a product defect. And **mutation M102 survived the
hermetic suite** — making the catch swallow a synchronous engine refusal — because the stub never
threw. That is the VM5 lesson exactly: a law defended in one place travels only as far as that place
gets run. V28c/V28d drive it hermetically now.

**PARTIAL for the founder's purposes, and it is the only thing keeping this item from DONE:**
reading aloud has still never been **heard**, on iOS or anywhere else.

---

## 3 · Live verification — what was run, and what could not be

The instruction was explicit: *do not convert a simulated Chromium result into live verification*,
and *state exactly which item is missing*. Here is the state of this container, checked rather than
assumed:

```
DATABASE_URL       absent          RENDER_API_KEY   absent
ANTHROPIC_API_KEY  absent          RENDER_SERVICE_ID absent
OPENAI_API_KEY     absent          a real iPhone    not attachable to a container
curl https://intelliq-platform.onrender.com/api/health  →  egress denied by the proxy (403)
```

| Founder's item | Status | Missing |
|---|---|---|
| **A · Build and deployment** | **NOT RUN** | Render credentials and a reachable deployed instance. Nothing here says anything about the deployed commit, the browser-loaded asset stamp against a live server, or a stale service worker. |
| **B · Neon persistence** | **PARTIAL — real PostgreSQL, not Neon** | A Neon `DATABASE_URL`. See below. |
| **C · Provider and composer** | **PARTIAL** | A provider key. The *unavailable* and *deterministic-only* behaviours were driven; a real provider responding was not. |
| **D · Real pilot flows** | **PARTIAL** | A deployed instance and a human. The account chain was driven on real persistence; the conversational and Forum flows were driven only against in-memory instances. |
| **E · Real device** | **NOT RUN** | An actual iPhone. Chromium at 390×844 is not iOS Safari, and no assertion in this repository claims otherwise. |

### What *was* run: a real PostgreSQL 16, and it found a production defect

`scripts/durable-restart-check.js` (**32 assertions**, opt-in, needs `DATABASE_URL`) starts the
**real server as a child process** against a **real PostgreSQL 16**, creates an organisation and
accounts through the ordinary routes, **kills the process**, boots a second one against the same
database, and looks for all of it.

> **Ran:** `DATABASE_URL=postgres://postgres@127.0.0.1:5432/intelliq node scripts/durable-restart-check.js`
> — PostgreSQL 16.13 in this container, SSL enabled with a self-signed certificate because
> `db.js` requires SSL. **32 passed, 0 failed.**

**THE DEFECT.** Every suite in this repository runs `DB_OPTIONAL=1`, whose load goes through
`_loadAllStores` — which set `_storesLoadedAt`. The **authoritative split path**, the one every real
deployment takes the moment it has saved anything, calls `_applyUnits` and never set it. So a
completely healthy instance, serving every request correctly, reported **`storesLoaded: false` and
`ready: false` forever**. Nothing failed; the product worked and told its operator it was not ready,
which is a readiness probe nobody can believe and therefore a readiness probe nobody reads. There is
one `_markStoresLoaded()` now and both load paths call it. Mutation **M110** removes the split call
and goes red in both layers.

**A real concurrent CAS conflict**, which a single process can never produce because its writes are
serialised: two processes, one database, one durable unit, two simultaneous account creations. Both
callers were accepted — the CAS is about the *write* — and after a restart **one of the two
survived**. That is a lost update, not a torn one: the org is whole, every account has an id, a name
and a role, and no password hash leaves the tree.

**Pilot onboarding on real persistence, across a restart:** a leader issues an invite, the service is
**restarted**, the invite is still activatable, the new account signs in to the right organisation
with the role the invite carried, a member cannot reach an administrative write, and they can sign in
again from scratch. **No secrets** in any payload or in the service log.

**What this is not, and the distinction is not a technicality.** A local PostgreSQL in the same
container has no network partition, no connection ceiling, no cold start, no pooler and no
managed-service failure modes. It is **not Neon** and **not Render**, and it says nothing about the
deployed build or the pilot instance.

---

## 4 · Operations findings for the founder

1. **Two instances writing the same organisation at once can lose an account creation.** Observed,
   not inferred: one of two concurrent creations survived. This matters on a rolling deploy or a
   second dyno. The data stays coherent; an update is lost. **Founder/operator decision:** run one
   instance for the pilot, or accept the loss window.
2. **The action row's tap target is 36px**, not the 44px this product uses for primary controls —
   the whole row (copy, useful, not useful, read aloud) has always been 36. The voice control is
   asserted to be *no smaller than its siblings*; changing the row is a product decision about that
   row, and it is recorded here rather than silently normalised by a test written to match it.
3. **`db.js` requires SSL unconditionally.** Correct for Neon; it means a self-hosted PostgreSQL
   without TLS cannot be used at all. Noted, not changed.

---

## 5 · Commands run, round 5

```
npm test                                          GREEN, 252 registered suites
git diff --check                                  clean
md5sum $(git ls-files) | md5sum                   identical before and after npm test
node scripts/<nine browser suites>.js             409 assertions, 0 failed
DATABASE_URL=… node scripts/durable-restart-check.js   32 assertions, 0 failed (real PostgreSQL 16)
17 mutations, stdout AND stderr read              16 red; M83 recorded, not counted
```

---

## 6 · Why this still says NO

The merge gate the founder set has five conditions. Three are met and two are not:

| Condition | Met? |
|---|---|
| The three dead capabilities behaviourally proven | **YES** — driven through production paths, mutations red |
| Voice output complete, or explicitly deferred by the founder | **CODE COMPLETE, NOT HEARD.** Needs the founder's acceptance, which is not mine to give |
| Live Neon / restart / deployment checks pass | **NO** — no Neon, no Render. A real PostgreSQL is not the same claim |
| Real pilot onboarding works | **PARTIAL** — the account chain, on real persistence, with no browser and no device |
| No pilot code or operations blocker remains | **NO** — three operations blockers stand, all credential-shaped |

---

FOUNDER OBSERVATIONS DISPOSITIONED: 21/31
DEAD CAPABILITY 1 — CROSS-EVIDENCE CONTEXT: CONFIRMED (driven, 4 mutations red)
DEAD CAPABILITY 2 — FORUM CONTEXT, ALL FOUR KINDS: CONFIRMED (driven, 4 mutations red)
DEAD CAPABILITY 3 — FORUM INDICATOR ON THE CARD: CONFIRMED (driven, 2 mutations red, browser guard)
VOICE OUTPUT: CODE COMPLETE — ONE OWNER, 5 MUTATIONS RED — NEVER HEARD ON A DEVICE
DURABLE PERSISTENCE: PARTIAL — REAL POSTGRESQL, NOT NEON (32 assertions, 1 production defect fixed)
BUILD AND DEPLOYMENT: NOT RUN — NO RENDER CREDENTIALS, NO REACHABLE INSTANCE
PROVIDER RESPONDING: NOT RUN — NO PROVIDER KEY
REAL DEVICE: NOT RUN — NO IPHONE
DEFECTS FOUND THIS ROUND: 4 (outcome as [object Object]; card/screen availability disagreement; storesLoaded never set on the authoritative path; a new answer not stopping the old utterance)
MUTATIONS THIS ROUND: 17 applied, 16 red, 1 recorded as a non-gate
PILOT CODE BLOCKERS: 0
PILOT OPERATIONS BLOCKERS: 3
GITHUB CI ON EXACT HEAD: PENDING
SAFE TO MERGE: NO
READY FOR FINAL FOUNDER PHONE/RESTART RETEST: NO

---

# Round 6 — the independent gate's seven items

**Audited head:** `9a0d3f3` · **Worked from:** `52ac115` → `747bd35` and beyond
**Branch:** `claude/pilot-live-recovery-r1` · **PR #89 — open, not merged.**

The gate audited `9a0d3f3`, which is three commits behind where this round started, so every item
below was **reproduced or refuted against the CURRENT head** rather than against the head that was
read. Two of the gate's findings had already been fixed in `91f3159` and are recorded as such.

What makes this round different from the last two: **five of the seven items were found by pressing
a button, not by reading code** — and two of them were defended by assertions in this repository
that had encoded the defect as the expected answer.

---

## The ledger

| Item | Verdict | Production entry | Guard | Mutations |
|---|---|---|---|---|
| **P1 · output verifier approves the wrong claim's number** | **CONFIRMED → FIXED** | `POST /api/assistant/turn` | `manifest-claim-binding-http-smoke` (13, new) · `output-manifest-smoke` §J (69→83) | M130–M133 red |
| **P1 · graph gate pinned only by a source check** | **CONFIRMED → FIXED** | `GET /api/objects/:kind/:id/chart` | `output-channels-http-smoke` §F (26→44) | M140–M142 red |
| **P1 · cross-route "one manifest" unproven** | **CONFIRMED → PROVEN** | thread + chart routes, same object | `output-channels-http-smoke` §F | M142 red |
| **P1 · group Focus A→B shape mismatch** | **CONFIRMED → FIXED** (three defects) | `POST /api/group/:nodeId/focus`, `/outcome`, `/api/assistant/turn` | `group-focus-loop-http-smoke` (29, new) | M150–M154 red |
| **P1/P2 · singleton Focus fixture satisfied by an empty list** | **CONFIRMED → FIXED** | `GET /api/objects?kind=focus&scope=group:…` | `forum-context-http-smoke` §F (46→53) | M161 red |
| **P1/P2 · `_forumAudience` ignores active status** | **CONFIRMED as fail-open · REFUTED as reachable** | `_forumAudience` | `forum-audience-smoke` §H7 (80→85) · `forum-context-http-smoke` FC-F2e | M160 red |
| **P1/P2 · private→Forum only source-checked** | **CONFIRMED → DRIVEN** (and a dead capability found) | `POST /api/assistant/turn/:turnId/confirm` | `forum-share-http-smoke` (27, new) | M171–M174 red; M170 a non-gate |
| **P2 · voice-output parity on the fallback** | **CONFIRMED → FIXED** | `POST /api/assistant/turn`, degraded path | `output-channels-http-smoke` §G | M180, M181 red |
| **P2 · a new answer may not stop the utterance** | **ALREADY FIXED at current head** (`91f3159`), guard strengthened | the real renderer, in a browser | `voice-output-browser-check` §D2 (16→19) | M182 red |
| **P2 · attachment "Nothing was saved" and retry** | **CONFIRMED → FIXED** (both halves) | `POST /api/assistant/attachments` | `attachment-retry-http-smoke` (26, new) | M190, M193 red; M191/M192 non-gates |
| **P2 · Settings partial grant** | **CONFIRMED → FIXED** | Settings → Organisation, and the real endpoints | `settings-tiers-browser-check` §D2 (31→39) | M200 red |
| **P2 · `providerReachable` on an untried provider** | **CONFIRMED → FIXED** | `GET /api/health` | `capability-truth-smoke` (37→39) | M201, M202 red |
| **P2 · voice-input label means browser support** | **CONFIRMED → FIXED** | Settings → You | `settings-tiers-browser-check` §D1 | M203, M204 red |

---

## 1 · The crossed figure — the sharpest counterexample this verifier has been given

Reproduced exactly as written. Two approved claims — *"Two separate accounts concern recovery"* and
*"Three separate accounts concern attendance"* — and the prose *"Three separate accounts concern
recovery."* returned `ok: true`.

Every word approved. Every figure approved. Both halves in the record. And the sentence false,
because `verify` had pooled every claim's numbers into one set and could no longer tell which claim
a figure came from. **A membership test cannot see a swap.** It is the same class as a stale
channel: nothing invented, and the relation between true things wrong.

**L-MF2b.** A figure carries the words around it — the rest of its **clause**, which is what says
what it is a count of — and it is refused when the text's own context points more clearly at a
claim that did not approve it than at any claim that did. A **comparison**, not a threshold, and
that is what keeps it usable: an honest rephrasing loses coverage against every claim equally and
so accuses nobody, while a crossing loses it against exactly one. A figure with no context — *"this
rests on 3 sources"* — has nothing to be about and falls back to the membership test.

The clause and not the sentence: *"two accounts concern recovery, and three concern attendance"* is
one sentence about two things, and read whole its context binds neither. **My first version used
the sentence and mutation M132 survived the entire suite** until OM-J2f was added.

Driven through the real composer route: the model writes the crossing, the turn degrades with
`unverified`, and the crossed sentence reaches no channel written or spoken. Both directions. The
three sentences a threshold would wrongly refuse still go out.

## 2 · The graph gate, fired through the real route

Round 4 left this as a source check with an honest note that no fixture could make the chart route
refuse. The gate was right that this is not enough.

**Why no fixture could.** The chart route reads the moments the record holds and the points the
picture plots from the same object through one owner, so no arrangement of signals makes them
disagree. The condition the gate exists to catch is a **builder that computes a timestamp** rather
than reading one, and no builder in this repository does.

**So the builder is made to.** `ai/chart.js buildFirming` is replaced at the module boundary — the
same instrument the provider boundary already uses — for one call, shifting one plotted moment by
**one millisecond**. The value, refs, shape and key are untouched, so `governChart` passes it and
the picture is drawn from real evidence at a moment the record does not have. One millisecond
because a gate that only catches an obviously wrong date catches nothing: a builder that rounds,
buckets or re-stamps is off by a little. The route returns `chart: null`,
`violations: ['graph_time_not_in_record']` and a sentence; with the builder honest again the
identical picture comes back.

**Cross-route:** a new account written onto the object moves the card's source count and the
picture's moments together, and every moment the picture plots is one the card's own manifest
vouches for.

## 3 · The group Focus loop — three defects, one of them under the other two

Two owners had two field names for one fact:

```
ai/team-state.js  newFocus()   writes  origin.inquiryId   and  outcome.at
ai/cross-evidence.js           read    raw.addresses      and  raw.resolvedAt
```

So every group Focus produced `edges: []`, `addresses: null`, `observedSince: null` — no
relationship at all on the half of the product where the A→B loop is the point.

**Why round 5's suite did not catch it** is the more useful half: its fixture was a **personal**
Focus written by hand in the personal shape. A suite covering two shapes has to contain two shapes.
PROTOCOL lie #5, and it was mine.

**A third defect under those two, found by driving rather than reading.** A group object is a
**projection** and carries no signals, so `loop()`'s post-outcome evidence count was structurally
zero for every group Focus — the turn told the model *"nothing has been recorded on that thing since
the outcome"* while two accounts sat in the record. That is not a fact about the world; it is a
reader that cannot see. `_objectsWithEvidenceFor` joins each projection back to the evidence its own
canonical record holds, for objects the reader was **already** cleared to see, and CE-D4 asserts it
adds not one object to that set.

The reader reads both shapes and **rewrites neither** — `origin.inquiryId` stays team-state's field,
and the edge carries basis `focus.origin.inquiryId` rather than borrowing the personal one.

## 4 · The Forum, both directions

**The vacuous assertion first**, because it hid the rest. The singleton-Focus case read a node with
no `teamFocuses` row, so the list came back **empty** — and `[].every(...)` is true, as is
`rows.length === 0 ||` anything. Both assertions passed against a screen with nothing on it. The
focus is seeded now, its card is **required** to exist, and then a second member joins and the icon
has to appear — because *"never true"* and *"true only with two"* are the same assertion until
something makes it true.

**`_forumAudience` counted accounts that exist** while eleven other readers in this codebase ask
about `status`. That fails **open**. `_personPresent` is the one predicate now, and the rule is
"not marked otherwise" rather than "marked active" — an account written before the field existed
still counts, or every room in an older organisation empties. **Classified honestly: no route in the
product writes a non-active status onto an account** (`_removePerson` deletes the record and strips
the rosters), so this is a rule made consistent with the other eleven readers, not a live defect
reproduced through a product path.

**And a dead capability, found by pressing the button.** `ai/composer-actions.js` states that the
share's wording is the person's and editable on the card; the confirm handler reads
`overrides.text` and its own comment says the same; and a **blanket guard above it rejected every
override first**. So the edit box could not post, and a capability described in two comments was
exercised by nothing. The exception is now one **field** on one **action**, allow-listed by name.

**Which gate is load-bearing**, recorded because a mutation found out: M170 makes the share
handler's membership re-check unconditionally true and **survives**. The object is resolved through
`_allObjectsFor`, so a person removed from the squad cannot resolve the object their proposal was
bound to and the route answers 404 before the handler runs. FS-C1 names a status and a reason
instead of accepting `403 || 404`.

## 5 · What is spoken keeps every caveat what is written shows

`_speechFor` clipped limitations at three, silently. The obvious cost is that a listener cannot see
the caveats under the answer. **The cost that would actually have arrived** is stranger:
`ai/manifest.js` requires every limitation to survive into the voice channel, so a fourth would not
have been quietly dropped on the composed path — it would have **refused the whole turn**, and the
reader would have seen a degraded answer with nothing saying why. Two rules about one thing,
disagreeing, with today's only producer topping out at exactly three.

Both owners driven together: `_speechFor` with four limitations, put through
`manifest.verify('voice')`. A clipped rendering is refused by that same gate, naming what it lost.

**A fixture of mine failed honestly first:** my fourth limitation was *"this rests on what was said,
not what was measured"*, whose only distinctive word outside the sentence is "measured" — and
"rests" appears in the source-disclosure line every rendering ends with, so the substance test found
half of it and called it present. The assertion that a clipped rendering is refused **passed a
clipped rendering**. A negative assertion needs a fixture whose absence is detectable.

## 6 · An upload whose answer never arrived

The card said **"That took too long to send. Nothing was saved."** It cannot know that: an aborted
fetch says nothing about what the server did with the bytes it already had. Telling somebody their
work was lost when it was not is the sentence that makes them do it over — **and doing it over was
the other half.** The material was already safe (deduplicated by checksum, owner, private
visibility); the **conversation** was not, so three identical attempts produced three threads, each
holding the same document.

Reconciled from state the server already holds rather than a new key the client must mint: the
checksum that identifies the document also identifies the thread the earlier attempt created for it.
A `conversationId` the client does send always wins. The card now says what is true — it could not
be **confirmed** — and then the thing that makes Try again safe, which is a property of the server
rather than a hope.

**Which gate holds the cross-person case:** neither of the two ownership checks. Removing either, or
both at once, changes nothing — conversations are stored per person, so looking up somebody else's
id in this person's list finds nothing. ATR-F5 hands a person another's conversation id outright.

## 7 · Settings and capability truth

**The tab is not the control.** `SETTINGS_TAB_ACCESS.org` opens for any of four permissions, and
every connection card inside calls routes gated on `manage_settings` alone — so `manage_metrics`
and nothing else saw the cards, pressed the buttons, and collected 403s from a screen that had just
offered the work. Each card that needs `manage_settings` is replaced by the **reason**, not by
nothing. Driven in a browser at 390px **and** against the real endpoints from that session's own
token, because a check on either alone is what let this through — the routes were right the whole
time.

**`providerReachable` reported an untried provider as reachable.** `!providerFault` turned "no
failure recorded" into a claim, so a host with no key — where no completion is ever attempted —
said the provider was reachable with no observation behind it. Three states now: `unknown`,
`reachable`, `unavailable`, each an observation or the honest absence of one.

**And the suite had encoded the defect as correct.** CT-A5 asserted `providerReachable === true`
**before any call**, under the heading *"nothing claims the provider is unreachable"* — the right
instinct aimed at the wrong risk. PROTOCOL lie #6, and it is why a green capability suite sat over
this for a round.

**The voice-input label** said "Speaking instead of typing: ON" on browser capability alone, so
somebody who had declined the microphone was told they could do a thing that would not work. The
label names what was checked, and the microphone note is shown on the **ON** row as well as the OFF
one — the state that needed explaining was the ON one, and a panel that only explains its negatives
leaves its most misleading answer bare.

---

## Mistakes of mine this round, recorded rather than quietly fixed

1. **The clause boundary.** My first L-MF2b used the sentence; M132 survived the whole suite. OM-J2f
   exists because of it.
2. **A negative assertion that passed its own negative.** The fourth limitation shared words with
   the sentence every rendering already ends with (§5).
3. **An assertion that could not tell code from the prose about it.** Twice in one round: the
   comment explaining why *"Nothing was saved"* went away quotes that sentence, so searching for it
   found the explanation. Both sites decomment before matching now.
4. **An assertion demanding the opposite of the product's law.** I required every forum message to
   carry an `authorId`; `ai/forum.js` projects `authorId: null` to everybody, leader and admin
   included. My version would have demanded the product leak what that surface exists to protect.
5. **A mutation harness that corrupted the tree.** A fixed backup path shared between two concurrent
   runs: one run's mutation became another's "original", and the restore wrote a mutated line back
   into `js/app.js`. Caught by reading the file rather than trusting the harness. The harness now
   uses a unique path per invocation.
6. **A no-op mutation that looked like a mutation.** M154's first form concatenated the objects of a
   user who did not exist in that fixture, so it changed the text and nothing else. PROTOCOL lie #9.
7. **A positive assertion against a route that proves nothing.** ST-D2i first read `/api/metrics`,
   which is `requireAuth` — every signed-in person can. It is the **write** that asks for
   `manage_metrics`.

## Mutations recorded as non-gates, not counted as passes

| Mutation | Why it survives |
|---|---|
| M170 the share handler's membership re-check | The object is resolved through `_allObjectsFor` first; a removed member gets 404 before the handler runs |
| M191 / M191b / M191c the attachment reconciliation's ownership checks | Conversations are stored per person; `_resolveConversation` cannot find another person's id in this person's list |
| M192 reconciliation running when a conversationId is given | `b.conversationId || _priorConvId` — the named one still wins, so it is a behavioural no-op |
