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
the mutation went red. The final state is 66 applied, 66 red, tree verified clean after each.

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

## False greens found this pass — six, all mine

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
- **CI ON EXACT HEAD:** stated below as the run that was actually observed.

---

FOUNDER OBSERVATIONS DISPOSITIONED: 21/31
AUDIT CATEGORIES DISPOSITIONED: 25/25
HUMAN EVIDENCE WEB: PASS
SINGLE-NODE CROSS-REFERENCE: PASS
FORUM ONE-WAY CONTEXT: PASS
OUTPUT MANIFEST CONSISTENCY: PARTIAL
VOICE INPUT: PASS
VOICE OUTPUT: PARTIAL
FALSE-GREEN TESTS FOUND THIS PASS: 6
PILOT CODE BLOCKERS: 0
PILOT OPERATIONS BLOCKERS: 3
GITHUB CI ON EXACT HEAD: PENDING
SAFE TO MERGE: NO
READY FOR FINAL FOUNDER PHONE/RESTART RETEST: NO
