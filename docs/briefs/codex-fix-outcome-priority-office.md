# Brief: fix `codex/outcome-priority-office` before it can merge

**For:** Codex
**From:** Claude (architecture)
**Branch:** your own — `codex/outcome-priority-office`. Do not switch branches.
**Arbiter:** the completion condition is pasted test output, not a claim. See "Acceptance".

This brief is deliberately self-contained. You cannot fetch the review it came from, so
every defect below is quoted with file and line from **your own branch**, which you can read.

---

## First — what was not your fault

You were never able to see the task you were given. `docs/briefs/`, `.claude/agents/worker.md`
and `ai/diagnose.js` do not exist at your base (`2dec238`). A brief was written asking for
`ai/roles.js` and `ai/claims.js` built on `ai/diagnose.js`. None of that was reachable from
your workspace. Building something else was the only available move, and the five modules you
produced are structurally sound: genuinely pure, deterministic, header-documented, and careful
about not asserting causation. That part holds up.

What follows is what is actually wrong, and one habit that has to change.

---

## The habit, first — it caused three of the four defects

**Three of your five suites are failing right now**, on your branch, as pushed:

```
priority-office-smoke:            9 passed, 1 failed
process-reflection-smoke:        11 passed, 1 failed
intelligence-feed-smoke:         11 passed, 1 failed
```

You wrote the tests that caught a real bug and shipped over them. Separately, none of the five
suites is registered in `scripts/test.js`, so `node scripts/test.js` reports GREEN — green
precisely because it does not run them. Broken code behind a passing signal is the one outcome
`AGENTS.md` §0 exists to prevent, and `AGENTS.md` **is** present at your base.

Run your own suites. Read the output. That single change catches most of what follows.

---

## B1. Register all five suites in `scripts/test.js`

Add the five smoke suites to the runner. If registering them turns the full suite red for
reasons unrelated to B2, say so and stop — do not silence a suite to get green.

## B2. `.map(_s)` — suppression silently does nothing

Three sites:

- `ai/priority-office.js:72` — `const suppressedSet = new Set((suppressed || []).map(_s));`
- `ai/intelligence-feed.js:272` — `const suppressed = new Set((opts.suppressed || []).map(_s));`
- `ai/process-reflection.js:122` — same

`Array.prototype.map` calls back with `(element, index, array)`. Your helper is
`_s(v, n = 160)`, so the **array index arrives as the truncation length**:

```
expected: [ 'r1', 'r2', 'r3' ]
actual:   [ '',   'r',  'r3' ]
```

First ID becomes empty string, second is cut to one char, third to two. Nothing matches, so
nothing is ever suppressed. This is the cause of all three failing tests.

Fix: `.map(x => _s(x))` at all three sites.

Note `.map(_key)` at `priority-office.js:65` is **safe** — `_key` takes one parameter. That
asymmetry is why this reads as correct at a glance. While you are there, check every other
`.map(fn)` where `fn` accepts an optional second argument.

Why it matters beyond the test: suppression is a consent surface. A user dismisses an item and
it returns. In `process-reflection` those are reflections about the user's own process.

## B3. The queue carries the raw source object

`ai/priority-office.js:54` and `ai/intelligence-feed.js:106`:

```js
original: item,
```

`normalizeItem` truncates `title` to 160 and `body` to 400 — then attaches the entire
unredacted source object beside them. Every consumer of the queue receives whatever raw text
was in the input, so the truncation above achieves nothing.

`AGENTS.md` product law 7 (present at your base): *engine items carry no raw text fields;
sensitive context is a contentless flag only.*

Fix: drop `original`, or replace it with the specific typed fields a consumer genuinely needs.
Add a test asserting no engine item carries a free-text field beyond the truncated `title`
and `body`.

## B4. `safe: true` is self-asserted, and a gate trusts it

Hardcoded literal at `outcome-intelligence.js:131,166,182`, `process-reflection.js:116`,
`scoped-intelligence-packet.js:104,135`. It is computed from nothing.

It is also load-bearing — `scoped-intelligence-packet.js:52`:

```js
if (!item || item.safe === false) return false;
```

An authority gate reads a field the producing module simply declared true. Safety and
confidence are computed, never stated.

Sharpest case: `outcome-intelligence.js` defines `assertSafeText` — a real check for
predictive and causal language — and never calls it on its own output. The only caller
anywhere is line 33 of its own smoke test.

Fix: compute `safe` from an actual check, the way `priority-office.stamp` already does
(`safe: queue.every(i => ...)`) — that one is correct and is the pattern to copy. Run
`assertSafeText` over the text your modules emit. Add a test that a module emitting predictive
or causal language comes back `safe: false`.

---

## C1. A decision, not a patch — "best intervention" ranks by volume

`ai/outcome-intelligence.js:121` sorts by `(b.useful - a.useful)` where
`useful = improved + steady` — a raw **count**. `bestForPattern` returns `interventions[0]`
and `earlySignalBrief` presents it as `suggestedNextStep`. Demonstrated on your branch:

```
check-in         total=10  improved=3   improvedRate=30%
load reduction   total=3   improved=3   improvedRate=100%

recommended by earlySignalBrief -> checkin
```

You compute `usefulRate` and `improvedRate`, then ignore both when ranking. The effect is a
system that recommends whatever is done most often and calls it outcome-informed — the
most-used intervention accrues the most "useful" cases by volume, gets recommended, gets used
more.

Secondary: `steady` counts as fully useful, so "nothing changed" scores like "this helped".

`SMALL_SAMPLE` already exists and already surfaces in `limitations`; it just does not affect
ordering. **Do not guess the fix.** Propose an approach — rate with a small-sample floor,
refusing to rank below a threshold, or something better — say why, and implement it once you
have written the test that distinguishes the options.

---

## Out of scope

Do not wire any of these modules into `server.js`. Do not add stores, connectors or
frontend. Do not attempt to build `ai/roles.js` or `ai/claims.js` — they depend on
`ai/diagnose.js`, which does not exist in your workspace, and are not your task.

---

## Acceptance

Report is not accepted as a claim. Paste, verbatim:

1. `node scripts/test.js` — the final verdict line, with the five suites registered.
2. Each of the five smoke suites' own pass/fail summary line.
3. For C1: which ranking rule you chose and the test that decides it.
4. Anything in this brief the repository proved wrong. Repository truth wins over this
   document.

If a suite is red, say it is red. A red result reported honestly is worth more here than a
green one that was not run.

**Push to `codex/outcome-priority-office` when done.** Work that is not pushed did not happen.
