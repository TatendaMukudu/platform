# Pilot landing audit — round 1

**Observed:** 2026-09-09T19:51:38Z (fetch), analysis through ~20:40Z.
**Branch:** `claude/pilot-landing-audit-r1`, cut from `origin/main`.
**Method:** every claim below is either *reproduced* (a command was run, output quoted) or
*read* (traced in source, not executed). Where a suite was mutated, the mutation and the
assertion that went red are named. No remote branch was altered; disposable merges were done
with `git merge-tree --write-tree` and in a throwaway worktree that has been removed.

---

## Headline

**The landing is one PR, not four, and it is not the one everybody has been reviewing.**

PR **#86** appeared today and **strictly contains PR #84** — `git merge-base --is-ancestor`
confirms it, and #86 is exactly one commit ahead. Landing #86 lands #84. Reviewing and merging
them as separate items would merge the same work twice.

The second finding is that **the stale PR backlog is not merely stale — two of them would
actively regress current law if landed.** Not "add nothing"; regress. Evidence below.

The third is that the combined tree everyone actually wants — **#86 + the pilot blockers — is
GREEN**, with the same two trivial asset-stamp conflicts the last rehearsal found, and 18/18 in a
real browser.

---

## PART 1 — Current truth

| Thing | SHA / state |
|---|---|
| `origin/main` | `5683df3de63d8daa54d345ab39fa262db1908d2e` |
| **PR #86** `codex/pilot-experience-r1` | `9879dcb60dcd2a3af150810571e7aafc4256b03c` — open, **CI never ran** (`total_count: 0`, pending) |
| **PR #84** `codex/review-r1` | `6210974351ff5655752fa29f7e978edf2d21eb4a` — open, **CI success** (run `34324119715`, 07:31:17Z) |
| **PR #85** `claude/platform-work-summary-nmb0cm` | `b04460ae2e18a3a99404e3d3c61a18e6c35df047` — open |
| `claude/pilot-closure-blockers` | `41ca75cdd2acd861ef38ca3421fc92a9765562c9` — no PR |
| `claude/pilot-integration-r1` | `47c1152024c25d2e3ba1c97a0a5bcaf8ba075b2c` — no PR |
| `gpt/cross-evidence-pilot` | `9782f7f411ca9675959e6701369d0e4ae2ed1563` — **branch only, no PR**, 8 commits |

**Codex's integration rehearsal is PR #86** (`codex/pilot-experience-r1`, created 17:16Z today).
It is not a rehearsal of my integration — it is a continuation of #84.

**16 open PRs:** 86, 85, 84, 81, 75, 74, 73, 67, 66, 65, 64, 63, 62, 59, 58, 12.

**Correction to my own method, recorded because it nearly produced a wrong report.** My first
net-effect script treated `git merge-tree --write-tree --messages` as succeeding whenever it
printed a tree hash. It prints one even when the merge conflicts. Six branches were briefly
scored as clean small deltas when they in fact conflict. Redone with the **exit status** as the
authority; every number below comes from the corrected run.

---

## PART 2 — Open PR archaeology

Net effect measured by merging each branch into **current main** in a throwaway index and diffing
the result against main — not the three-dot diff, not commit counts.

| PR | Branch | Merge vs main | Intended capability | Already on main? | Unique surviving delta | Verdict |
|---|---|---|---|---|---|---|
| **86** | `codex/pilot-experience-r1` | CLEAN, 28 files, +1947/−346 | pilot evidence + discussion experience; **contains all of #84** | no | the whole thing | **LAND** |
| **85** | `claude/platform-work-summary-nmb0cm` | CLEAN, 3 files, +782 | AGENTS.md report carve-out + audit docs | no | docs only | **LAND** |
| **84** | `codex/review-r1` | CLEAN, 24 files | canonical Focus ownership + origin law | no | — | **ABSORBED BY #86 — CLOSE** |
| 81 | `codex/ci-history-checkout` | CONFLICT (ci.yml) | `fetch-depth: 0` for docs ancestry | **YES** — `.github/workflows/ci.yml:28` | none | **SUPERSEDED — CLOSE** |
| 75 | `codex/pre-alma-baseline-verification` | CLEAN, +484 | August baseline verification record | n/a (doc) | a doc superseded by five later reviews | **HISTORICAL — CLOSE** |
| 74 | `codex/web-intelligence-no-llm` | CONFLICT (6 files) | Web intelligence with no model | `scripts/web-intelligence-smoke.js` **on main**; `no-llm-harness-smoke.js` **absent** | one 20-line suite, **whose fixture is obsolete** | **SALVAGE (rewrite) — CLOSE** |
| 73 | `codex/p0-d-authority-truth` | CONFLICT (`ai/primitives.js`) | authority ≠ empirical truth | **YES** — `scripts/authority-truth-smoke.js` | **negative** — see below | **SUPERSEDED — CLOSE** |
| 67 | `codex/ttd-continuous-review` | CLEAN, +327 | TTD critique doc | n/a (doc) | a doc | **HISTORICAL — CLOSE** |
| 66 | `codex/pre-review-smoke-worker` | CLEAN, +42 | `.claude/agents/smoke-tester.md` | no (`worker.md` only) | 42 lines of agent config | **SALVAGE SMALL DELTA** (optional tooling) |
| 65 | `codex/render-bandwidth` | CONFLICT (`server.js`) | bound persistence bandwidth | **YES** — `server.js:312,322` bandwidth instrumentation; both persistence suites on main | not separated (branch is 232 behind) | **SUPERSEDED — CLOSE** |
| 64 | `codex/constitutional-refusal` | CONFLICT (4 files) | explain and record refusals | `ai/refusal.js` **absent** | **25 lines, loads clean** on main | **SALVAGE SMALL DELTA — CLOSE PR** |
| 63 | `codex/midnight-ideas` | CLEAN, +263 | idea-to-evidence holding space | n/a (doc) | an ideas doc | **HISTORICAL — CLOSE** (→ R&D) |
| 62 | `codex/evidence-class` | CONFLICT (`ai/diagnose.js`) | governed evidence-class boundary | `ai/evidence-class.js` **absent** | **70 lines, loads clean** on main | **SALVAGE SMALL DELTA — CLOSE PR** |
| 59 | `codex/contest-state` | CONFLICT (2 files) | durable contest state | **YES** — `contest-smoke.js`, `contest-http-smoke.js` on main | not separated (241 behind) | **SUPERSEDED — CLOSE** |
| 58 | `codex/d1-d2-decisions` | CONFLICT (2 files) | person-prediction boundary | **YES** — `ai/language-guard.js` on main | **negative** — see below | **SUPERSEDED — CLOSE** |
| 12 | `codex/outcome-priority-office` | **CANNOT AUTO-MERGE**, 278 behind | scoped outcome-aware feed | **YES** — `ai/outcome-intelligence.js` + its suite on main | none separable | **HISTORICAL — CLOSE** |

### The two PRs that would REGRESS law

This is the finding that matters most in Part 2, and it is the reason "just merge the small ones"
is the wrong instinct.

**#73 would reintroduce a duplicated label table and drop primitive tagging.** Reproduced with
`git diff origin/main:ai/primitives.js origin/codex/p0-d-authority-truth:ai/primitives.js`:

```diff
-const STRUCTURE_LABEL = require('./voice').STRUCTURE_LABEL;
+const STRUCTURE_LABEL = { withdrawal: 'Pulling back', data_gap: 'Gone quiet', ... };
...
-      basis: `...`, confidence: s.shift.confidence,
-      primitives: [PRIMITIVE.PARTICIPATION] }));
+      basis: `...`, confidence: s.shift.confidence }));
```

Main owns the labels in one place (`ai/voice.js`) and carries `primitives:` on every pattern. The
branch is the **older** shape. Landing it is not a no-op; it is a regression to two descriptions
of one rule.

**#58 would WEAKEN the no-prediction guard.** Reproduced on `ai/language-guard.js`:

```diff
-const PERSON_FUTURE = /...(?:(?:[Tt]his|[Tt]he|[Tt]hat|[Yy]our|[Oo]ur|[Aa]n?)\s+)?(?:player|member|...)|[A-Z][a-z]+)\s+(?:will|won't|will\s+not)\s+(?:quit|...|disengage|withdraw|struggle)\b/;
+const PERSON_FUTURE = /...[Tt]his\s+(?:player|member|...)|[A-Z][a-z]+)\s+(?:will|won't|will\s+not)\s+(?:quit|...|recover)\b/;
```

Main covers more subject forms (*the / that / your / our / a* player) and three more verbs
(`disengage`, `withdraw`, `struggle`). The branch's regex is strictly narrower. Product law 2 —
*honest language, no deterministic "will quit" claims* — is guarded better on main today.

**The general principle these two establish:** a branch 185–278 commits behind holds *older*
copies of every file it touches. Any file main has since evolved will regress on merge. The only
safe salvage from this backlog is a file **main does not have at all**.

### Salvage candidates, tested rather than assumed

Three files exist only on old branches. I copied each into the current tree, ran it, and deleted
it. Nothing was committed.

- **`ai/refusal.js`** (#64, 25 lines) — loads clean, exports `fromPolicyDenial`. Viable.
- **`ai/evidence-class.js`** (#62, 70 lines) — loads clean, exports 8 symbols including
  `canEstablish`, `partitionSupport`. Viable.
- **`scripts/no-llm-harness-smoke.js`** (#74, 20 lines) — **runs, 7 passed 1 failed.** The failure
  is `leader receives a deterministic Web High/Low`.

That one failure needed settling rather than reporting. It is **not** a defect on main: the
harness fixture is a **two-person squad**, and the two-sided cohort floor (`MIN_COHORT = 5`,
k ≥ 5 **and** n−k ≥ 5) means a squad of two can never clear it. That is PROTOCOL lie #5 — an
unrepresentative fixture — written in August before the floor became two-sided. Main does produce
Highs and Lows deterministically: `seed-alma-smoke` is **39/39 green on main**, and `SA23`
specifically proves it by *undeclaring* the directions and calls and watching both buckets empty.

So the #74 salvage is real but **not free**: it needs a new fixture, which is authoring work, not
a cherry-pick.

`scripts/prediction-boundary-smoke.js` and `scripts/contest-durability-smoke.js` — named in
earlier reports as salvageable — **do not exist on those branches**. Verified with
`git cat-file -e`. Two earlier reports (including one of mine) listed them; both were wrong.

### `gpt/cross-evidence-pilot` — a branch with no PR

8 commits, merges CLEAN, 6 files, +545: `ai/evidence-neighborhood.js`,
`ai/scoped-intelligence-packet.js`, `ai/intelligence-feed.js`, two new suites and a brief. This is
cross-document synthesis, which the founder's own brief places in R&D. It has no PR and is not
part of any landing sequence. **R&D — do not land for the pilot.**

---

## PART 3 — Landing sequence

### Dependency graph

```
main 5683df3
  │
  ├── #86 codex/pilot-experience-r1  9879dcb   ⊃  #84 codex/review-r1 6210974
  │        (one commit on top of #84's head — merge-base --is-ancestor confirms)
  │
  ├── claude/pilot-closure-blockers  41ca75c   (4 pilot blockers + 3 new suites)
  │
  ├── claude/pilot-integration-r1    47c1152   = #84 + blockers, ALREADY REHEARSED
  │        ⚠ based on #84's head, NOT #86's — MUST BE RE-CUT
  │
  └── #85 claude/platform-work-summary-nmb0cm  b04460a  (docs only, independent)
```

### Step 1 — Land #86 (which lands #84)

- **Base required:** `main` @ `5683df3`. Merges CLEAN.
- **Conflict surface:** none against main.
- **Mandatory first:** **run CI.** #86 has *never been checked* (`total_count: 0`). #84's head is
  green; #86 is #84 plus one unverified commit touching `ai/chart.js`, `server.js` and `js/app.js`.
  Do not merge an unverified superset of a verified PR.
- **Tests to rerun:** full `npm test`, plus by name — `chart-governance-smoke`,
  `composer-actions-smoke`, `material-reach-http-smoke`, `focus-ownership-parity-smoke`,
  `shelf-http-smoke`, `scope-parity-smoke`.
- **Mutations to rerun:** the six PR #84 final-proof mutations (F1 `originIdentity` fallback,
  F2 status filter, F3a/F3b `mem.lastUpdated`, F4a/F4b audience guards). I re-proved all six at
  #84's head; #86's extra commit touches `ai/chart.js` and `server.js`, so they must be re-proved
  at #86's head.
- **Browser:** the full `library-browser-check` flow.
- **Rebase/re-cut:** not required.
- **Then:** close #84 as absorbed. Do not merge it separately.

### Step 2 — Re-cut the integration branch onto #86, then land it

- **Base required:** #86's merge commit on main. **A re-cut is MANDATORY** —
  `claude/pilot-integration-r1` is based on `6210974` and would carry a stale base.
- **Conflict surface — measured, not guessed.** I merged `claude/pilot-closure-blockers` into
  `codex/pilot-experience-r1` in a throwaway worktree. Exactly two conflicts, both the asset cache
  stamp:
  - `index.html` (#86 carries `v=20260907e`, blockers carry `v=20260909b`)
  - `scripts/.asset-version.lock`

  `js/app.js` **auto-merges** — #86's hunks sit at ~11404–11910 (object thread / material), the
  blocker hunks at 5542, 8939 and the material accept line. Resolution: a **new** stamp for the
  combined tree (neither side's describes it), and let `asset-version-smoke` rewrite the lock.
- **Reproduced result: `npm test` on that combined tree is GREEN (exit 0, zero FAIL lines).**
- **Browser:** `library-browser-check` **18/18** on the combined tree.
- **Carry forward from `claude/pilot-integration-r1`, not from the blocker branch:** the six
  two-law assertions (`L9`–`L12`) and the **governed-Keep browser flow** (`B3pre`–`B3pre4`). The
  combined tree I built scored 18/18 rather than 22/22 precisely because it was built from the
  blocker branch, which predates those. Re-cutting from the *integration* branch keeps them.
- **Mutations to rerun:** the 14-mutation integration set.

### Step 3 — Land #85 (docs)

- **Base required:** anything. Independent, clean, 3 files, docs only.
- **Conflict surface:** none. **Tests:** `docs-status-smoke`, `npm test`.
- Land last, or first — it does not interact.

### Not in the sequence

Everything else. No older PR has a delta that survives contact with current main, and two would
regress it.

---

## PART 4 — Pilot journey matrix

Audited against the best combined tree available (**#86 + blockers**, built and run for this
audit). "Reproduced" means run in a real Chromium at 390×844 or through a suite.

| # | Journey | Verdict | Evidence |
|---|---|---|---|
| A | **HOME** | **PASS**, one live-verify | Reproduced in browser: greeting + name visible; **all nine** legacy slots (`me-briefing`, `me-recognition`, `me-noticed`, `me-questions`, `me-prepared`, `home-stat-row`, `home-focus`, `home-insight`, `home-weekly-prompt`) render with zero height. "HOME IS ONE QUESTION" holds. **Live-verify:** `me-recognition` is the one slot not marked `hidden`, so it *would* render if `d.recognitions` were non-empty. Unproven whether it fires in the pilot. |
| B | **INQUIRY** | **PASS** | Routes complete; `inquiryCard` band union correct; verdict row now enters the typed composer dispatcher. `composer-actions-smoke` 41/41. |
| C | **HIGH** | **PASS** | Four gates hold. `highs-lows-smoke` 24, `self-high-low-smoke` 5. `seed-alma-smoke` SA24 shows a real High with its basis. |
| D | **LOW** | **PASS** | Same gates; Ruling 2 enforced at the route (a withdrawn call cannot clear an evidenced Low). |
| E | **FOCUS** | **PASS** | Canonical ownership: every lifecycle mutation in `server.js` sits inside the three owners; the confirm handler has zero `mem.focuses`. `focus-ownership-parity-smoke` 23/23. |
| F | **FORUM** | **PASS** | Membership enforced through one predicate; speech is not evidence (`epistemicEffect: 'none'`). `forum-smoke` 71/71, and three privacy mutations bit (below). |
| G | **LIBRARY** | **PASS** | Reproduced end-to-end in browser: folder created, item filed, count 0→1, folder opened, item moved back out and still present. Two laws, one owner, pinned by `L9`–`L12`. |
| H | **MATERIAL / ATTACHMENT** | **PASS** | Picker advertises only what a parser reads; PDF/image excluded; `.pptx`/`.docx`/`.xlsx`/`.csv` kept. `material-smoke` 31, `material-reach-http-smoke` 87. |
| I | **GRAPH** | **PASS (code)** / **VERIFY LIVE** | `chart-governance-smoke` 34/34 and the governor mutation turns **14 assertions** red. **But no chart has ever been rendered in a browser** — the Chart.js CDN is blocked in this sandbox (`[page error] Chart is not defined`). Readability on a 390px screen is unproven. |
| J | **SETTINGS / NAVIGATION** | **PASS** | Reproduced: 3 visible `navigate()` entries on the member home, **zero duplicate labels**, no dead destinations. `reachability-smoke` 9/9 — no new orphans. `deadcode-scan` 12/12 — zero dead functions. |
| K | **MOBILE 390×844** | **VERIFY LIVE** | Reproduced: **no horizontal overflow** (`bodyW 390 === vw 390`). **4 sub-44px tap targets on Home** (36×36, 36×40, 59×36 "Private", 36×36 "×"). Consistent with the known 29-target debt; not re-measured across every screen, and never touched by a human thumb on a physical device. |

**No journey is MUST FIX.** Nothing found in this pass is a button that does nothing, a route with
no door, a duplicate control, a stale copy-taking surface, deterministic prose posing as the
assistant, a missing citation, a privacy leak, or dead navigation. Those were the four blockers,
and they are fixed.

---

## PART 5 — Live / deployment readiness

`render.yaml`: `buildCommand: npm install`, `startCommand: node server.js`, `PORT=3000`,
`ANTHROPIC_API_KEY` and `DATABASE_URL` as unsynced secrets, **`IQ_COMPOSER: "1"`**.
`GET /api/health` reports `ai.enabled`, which keys are present, deterministic-only mode, and a
plain-English reason when the composer is off — good operator surface.

| Level | What is proven |
|---|---|
| **CODE PROVEN** | `npm test` GREEN on main, on #84's head, on `claude/pilot-integration-r1`, and on the **#86 + blockers** tree built for this audit. `deadcode-scan` 12/12, `reachability-smoke` 9/9. |
| **LOCAL BROWSER PROVEN** | Real Chromium at 390×844: Library end-to-end, governed Keep propose→confirm, Material picker, degraded marker rendered and **visible**, Home slot visibility, nav duplicates, tap-target sizes, horizontal overflow. |
| **CI PROVEN** | **#84 only** — run `34324119715`, `node scripts/test.js`, conclusion `success`, 07:29:42→07:31:17Z at head `6210974`. |
| **DEPLOYED PROVEN** | **NOTHING.** No deployed URL is documented in `render.yaml`, `LIVE_SETUP.md` or `README.md`, and I did not probe any host. |
| **LIVE MODEL PROVEN** | **NOTHING.** No provider credential in this environment. Every composer path was exercised model-off or with the provider boundary stubbed. |
| **NOT YET PROVEN** | #86 CI (never run). Deployed `/api/health`. Whether `ANTHROPIC_API_KEY` is actually set on the host. Charts in any browser. Physical-device behaviour. Postgres-backed persistence (all suites run `DB_OPTIONAL=1`). |

**One configuration gap worth naming.** `render.yaml` declares **no `OPENAI_API_KEY`**
(`grep -c` → 0), but `/api/health` reports `voice: ai.canTranscribe()`, which is OpenAI Whisper.
Voice notes will be **off in the deployed environment** unless the key is set in the dashboard.
Not a blocker — it is a capability that will silently not be there. Owner: founder, one dashboard
setting, or accept voice-off for the pilot.

---

## PART 6 — False-green audit

Across this session I have mutation-tested Library (8), Focus authority (2), origin counting (4),
composer degraded mode (8) and Material (3) — **25 mutations, all bit**. The three high-risk areas
the brief names that I had **not** mutated were Forum privacy, graphs and citations. Done now, on
the combined tree:

| # | Mutation | Result |
|---|---|---|
| FG1 | `forum.mayRead` returns `true` for everyone | **BIT** — `forum-smoke` 2 red |
| FG2 | `forum.mayPost` returns `true` for everyone | **BIT** — `forum-smoke` 2 red |
| FG3 | `mayEdit` drops the author check (edit anyone's speech) | **BIT** — `forum-smoke` 1 red |
| FG4 | `governChart` approves everything | **BIT** — `chart-governance-smoke` **14 red** |
| FG5 | strip `citations` from the turn response | **BIT** — `turn-grounding-smoke` 1 red |

**No false green found in the sampled areas.** Two observations worth recording:

1. **Forum privacy rests on one suite.** With the read gate wide open, `forum-reach-smoke` and
   `forum-anonymity-smoke` stayed **green** — they test other things. The law is guarded, but by
   `forum-smoke` alone. Not a defect; a single point of guard on a privacy law.
2. **`governChart` is the strongest-guarded thing in the sample** — one mutation, fourteen red
   assertions.

**Confirmed false-green found elsewhere in this audit:** the `no-llm-harness-smoke.js` fixture on
PR #74 — a two-person squad against a five-per-side cohort floor (PROTOCOL lie #5). It fails on
main for a reason that has nothing to do with main.

**Corrected claims from earlier reports, including my own:** `prediction-boundary-smoke.js` and
`contest-durability-smoke.js` were listed as salvageable in prior reviews. Neither exists on the
branches cited. Verified with `git cat-file -e`.

---

## PART 7 — Finite pilot closure

### MUST LAND (3 items, in this order)

1. **PR #86** — after CI runs green on it for the first time. Absorbs #84.
2. **The re-cut integration branch** — `claude/pilot-integration-r1` re-cut onto #86, carrying
   `L9`–`L12` and the governed-Keep browser flow. Two asset-stamp conflicts, both trivial.
3. **PR #85** — docs, independent, land any time.

### MUST VERIFY (7 items — none is code work)

1. **Run CI on #86.** It has never been checked. Owner: whoever merges.
2. **Deployed `/api/health`** — confirm `ai.enabled: true` and the composer is genuinely on before
   26 September. Owner: founder.
3. **Charts in a real browser.** Never rendered — the CDN is blocked here. Owner: founder or a
   session with network access to `cdn.jsdelivr.net`.
4. **Physical iPhone pass.** Owner: founder. [carried OPEN since the first audit]
5. **The 29 tap targets, re-measured.** 4 confirmed sub-44px on Home. Owner: Claude or Codex.
   [carried OPEN]
6. **`me-recognition` on Home** with a person who has recognitions — is there a second thing on
   Home? If yes, founder decision. Owner: founder.
7. **`OPENAI_API_KEY`** — set it in the Render dashboard or accept voice notes off. Owner: founder.

### SAFE TO DEFER (unchanged, carried forward)

The route-level filing preamble duplicated across two transports; `reachability-smoke`'s weak
prefix match; `composer.degradeLine()` still uncalled; the retired Library's dead CSS; the unused
`tf1` fixture; move-bumps-to-top on the shelf.

### CLOSE THESE PRS (14)

**Absorbed:** #84.
**Superseded — the capability is on main:** #81, #73, #65, #59, #58, #12.
**Historical — documents:** #75, #67, #63.
**Close after lifting the file into an R&D note:** #74 (`no-llm-harness-smoke.js`, fixture needs
rewriting), #64 (`ai/refusal.js`), #62 (`ai/evidence-class.js`), #66
(`.claude/agents/smoke-tester.md`).

### R&D — NOT PILOT

`gpt/cross-evidence-pilot` (cross-document synthesis, no PR). `docs/ideas/MIDNIGHT_IDEAS.md` from
#63. The three salvaged modules. Ambient audio, autonomous proactive agent, new ontology,
automatic Forum creation, advanced analytics — none is required for the pilot to function and none
appears in any landing step above.

---

## What I could not verify

- **Anything deployed.** No URL documented; no host probed.
- **Anything with a live model.** No credential in this environment.
- **#86's one commit in depth.** I confirmed it contains #84, measured its conflict surface,
  merged it with the blockers and ran the full suite and the browser flow green. I did **not**
  review its 216 insertions line by line — that is a review, and it has not had one, which is
  the same reason its CI must run.
- **Charts rendered.** CDN blocked.
- **PRs #65, #59, #12 delta-by-delta.** Each is 232–278 commits behind and conflicts; I
  established their capability is on main and stopped there rather than reconstructing three
  obsolete merges.
- **Postgres persistence.** Every suite runs `DB_OPTIONAL=1`.

---

PR84: **READY** (green CI at head — but land it *via #86*, not separately)
INTEGRATION BRANCH: **NOT READY** — must be re-cut onto #86; the rehearsal itself passed
PILOT CODE BLOCKERS: **0**
PILOT LIVE-VERIFY ITEMS: **7**
OPEN PRS TO CLOSE: **14**
OPEN PRS WITH UNIQUE VALUE: **2** (#86, #85)

SAFE LANDING ORDER:
**1. CI on #86 → merge #86 (closes #84 as absorbed) → 2. re-cut `claude/pilot-integration-r1` onto the new main, resolve the two asset-stamp conflicts with a fresh stamp, rerun `npm test` + the 14 integration mutations + the browser flow, merge → 3. merge #85 → 4. close the other 13 PRs.**

PILOT CLOSURE IS FINITE: **YES**

Not merged. No product code changed in this pass.
