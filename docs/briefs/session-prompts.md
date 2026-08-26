# Session prompts — copy, paste, go

Short prompts for starting a Claude session on this repository. Each one is deliberately a few
lines: the detail lives in the repo, and pointing at a document costs a fraction of pasting one.

**How these work.** Every prompt below assumes the agent will read `docs/INDEX.md` first — that
page answers what IntelliQ is, what is implemented, what is broken and what must not be built.
Repeating any of that in a prompt is wasted budget.

**Replace anything in `<angle brackets>`.**

**Prepend this to any prompt that will write code**, whether to Claude or Codex — a branch cut
even twenty minutes stale is how Lane A got implemented twice:

> First: `git fetch origin && git rebase origin/claude/platform-work-summary-nmb0cm`.

---

## 1 · Review a Codex PR

> Independent review of PR `<N>` in `TatendaMukudu/platform`.
>
> Read `docs/INDEX.md` and `docs/briefs/codex-pilot-programme.md` §1 first — those are the laws
> the change must satisfy.
>
> This is REVIEW ONLY. Do not implement fixes, do not merge, do not modify production code or
> tests to obtain green results, and do not start work the PR does not contain.
>
> For every claim the PR body makes, check whether the test that supposedly proves it can
> actually fail — break the production line it covers and confirm the assertion goes red. An
> assertion that stays green is a finding, not a pass.
>
> Give me a verdict: APPROVE, CORRECTIONS REQUIRED, or REJECT — with the corrections numbered,
> each naming the file and the specific defect. Tell me plainly what you could not verify.

---

## 2 · Implement one lane of the work order

> Read `docs/briefs/codex-pilot-programme.md` in full — §0 and §1 before anything else.
>
> Execute Lane `<X>`. Stop when it is done and report per §11.
>
> Follow §1.3 (mutation-test every assertion you add — break the line, confirm red, restore) and
> §1.4 (grep rather than read; line numbers have drifted; run one suite while iterating and
> `npm test` once before committing).
>
> Do not merge, do not open a PR, do not touch any other lane's files. If you find something in
> the document that is wrong, say so — the code is the finding and the document is the defect.

---

## 3 · Adjudicate a new architectural decision

> Architectural adjudication for IntelliQ: `<the question>`.
>
> Read `docs/INDEX.md`, then only the documents it points at for this subject.
>
> ARCHITECTURE ONLY. No production code, no test changes, no PR, no merge.
>
> I want a verdict, not a survey: is this COMPATIBLE with the current architecture, a MATERIAL
> EXTENSION of it, or INCOMPATIBLE — and what specifically would have to change.
>
> Verify every claim against the code, not against the documents. Where a document and the code
> disagree, the code wins and the document is the defect — correct it in place and mark the
> correction. Do not protect earlier work, mine or yours, from being found wrong.
>
> Write the result to `docs/ttd/<name>.md` and commit it.

---

## 4 · R&D investigation — explicitly non-authoritative

> R&D investigation for IntelliQ: `<the question>`.
>
> RESEARCH ONLY. No production code, no test changes, no PR, no merge. Nothing you write here
> is a decision or a reason to build anything — see `docs/rnd/intelliq-rnd-program.md` §0.
>
> Verdict vocabulary: ALREADY IMPLEMENTED · STRONG DIRECTION · PROMISING BUT REQUIRES
> ARCHITECTURAL CHANGE · REJECTED. Say which and why.
>
> Test claims by running code, not by reading it. Mark every finding that came from execution.
> Do not protect the founder's idea from criticism.
>
> Write it to `docs/rnd/<name>.md`. If the bounded part of the finding is real queued work rather
> than research, say so and put it in the queue instead.

---

## 5 · Fix one specific defect

> In `TatendaMukudu/platform`: `<the defect, in one sentence>`.
>
> Read `docs/briefs/codex-pilot-programme.md` §1 for the laws that may not be weakened.
>
> Find it, prove it exists by running something, fix it, and add an assertion that would have
> caught it. Mutation-test the assertion. `npm test` must print TRUTH LAYER GREEN before you
> commit.
>
> If the defect turns out not to exist, say so and stop — do not find something else to fix
> instead.

---

## 6 · Pre-pilot readiness check

> Readiness check for IntelliQ against the pilot.
>
> Read `docs/INDEX.md` and `docs/briefs/codex-pilot-programme.md`.
>
> Tell me, from the code rather than the documents: what is actually implemented, what is claimed
> but unproven, and what would embarrass us in front of a real coach and a real player.
>
> Rank by "what breaks first in front of a user", not by architectural severity. I want the
> shortest honest list, not the most complete one.
>
> No fixes in this session. Findings only.

---

## 7 · Write a Codex work order for new scope

> New scope: `<what we want>`.
>
> Produce a Codex work order in the shape of `docs/briefs/codex-pilot-programme.md`: numbered
> lanes, each with its files, its contract, its acceptance tests, and what it must not touch.
> Include a conflict matrix and a single-agent run order.
>
> Every lane must be executable without asking me a question. Where a genuine fork exists, pick
> the more conservative branch and note it.
>
> Keep §0 (TTD is law, R&D has none) and §1 (the eight laws, the prohibitions, the definition of
> done, cost discipline) — reference them rather than restating them.
>
> Documentation only in this session. No production code.

---

## 8 · Explain a subsystem in plain language

> Explain `<the thing>` in IntelliQ to me in plain language.
>
> Short summary first, detail below it. No jargon in the summary. If a term is unavoidable,
> define it the first time in one clause.
>
> Tell me what it does, what it refuses to do and why, what is genuinely broken about it, and
> what would happen if we removed it. Use a concrete example with a real name from the demo data
> rather than an abstract one.
>
> No code changes.

---

## 9 · Catch up after a gap

> Catch me up on `TatendaMukudu/platform`.
>
> Read `docs/INDEX.md`, then list the open PRs and tell me which ones I have not had reviewed.
>
> Short summary first: what has landed, what is open, what is blocking the pilot, what is
> waiting on me. Detail below it.
>
> Do not start any work in this session.

---

## 10 · Review a Codex PR by mutation (the strong version)

Use this instead of #1 when the PR claims to have fixed something important.

> Independent review of PR `<N>` in `TatendaMukudu/platform`. REVIEW ONLY — no fixes, no merge,
> no modifying production code or tests to get green.
>
> Read `docs/INDEX.md` and `docs/briefs/codex-pilot-programme.md` §1 first.
>
> Method, in this order. Do not skip to the code.
>
> 1. Check the branch out in a worktree so my branch is untouched.
> 2. Run `npm test`. Green is the starting point, not the finding.
> 3. For each claim in the PR body, find the assertion that supposedly proves it, then
>    **break the production line it covers and confirm it goes red.** Restore. An assertion that
>    stays green is the finding.
> 4. Specifically hunt the two failure modes we keep hitting: an assertion comparing two
>    DIFFERENT endpoints (which can never converge), and an assertion checking for a value that
>    could never have appeared in that payload anyway. Prove it by running the assertion against
>    an org with zero data — if it still passes, it proves nothing.
> 5. Check whether anything was REMOVED. Diff for deleted functions and orphaned routes: grep
>    every server route the PR touches for a caller in the front end.
> 6. Test whether it merges cleanly onto my branch, and whether the merged result is green.
>
> Verdict: APPROVE, CORRECTIONS REQUIRED, or REJECT. Corrections numbered, each naming the file
> and the specific defect, each with the mutation that exposed it. Say plainly what you could not
> verify.

---

## 11 · Merge and reconcile two Codex PRs

> PRs `<A>` and `<B>` in `TatendaMukudu/platform` both target my branch and overlap.
>
> Review both by mutation (see prompt 10), then merge both into
> `claude/platform-work-summary-nmb0cm` — not into main.
>
> Where they conflict, pick the stronger implementation on evidence and say why in the merge
> commit. Do not split the difference to avoid choosing.
>
> If merging one breaks a test the other wrote, that is a design conflict, not a bug. Tell me what
> the disagreement actually is before resolving it, and if you resolve it, split the assertion
> into the property that must hold and the design decision it was bundled with — never weaken it.
>
> `npm test` must print TRUTH LAYER GREEN before you push.

---

## 12 · Audit the suite for assertions that cannot fail

> In `TatendaMukudu/platform`, find every assertion that is green by construction.
>
> For each suite in `scripts/test.js`, take the assertions that carry the most weight and break
> the production line each one covers. Anything that stays green goes on the list.
>
> Known patterns to hunt: fixture readback with no HTTP request; comparing two different
> endpoints; asserting a value that could never appear in that payload; `typeof x === 'function'`;
> anything with `&& false` in it; and a route asserted to exist with nothing asserting it has a
> caller.
>
> Report the list. Do not fix anything in this session — I want to see the size of it first.

---

## 13 · Rehearse the pilot end to end

> Run `scripts/pilot-rehearsal.js` in `TatendaMukudu/platform` and show me the transcript.
>
> Then tell me, as a coach would experience it: is this any good? Where does it read as thin,
> confusing, or like the system nagging? Where would a real coach stop trusting it?
>
> Be blunt. An honest "the screen is empty at step 5" is worth more to me than a pass.
>
> No fixes in this session.

---

## 14 · Close superseded PRs

> In `TatendaMukudu/platform`, tell me which open PRs are now superseded by what has already
> merged into `claude/platform-work-summary-nmb0cm`.
>
> For each: the number, whether its content actually landed, and whether anything in it would be
> LOST by closing it. Do not close anything yet — give me the list and I will decide.

---

## 15 · The standing preferences

Worth pasting once into any long session:

> Two things throughout: short summary first, detail below it — I want to be able to read the top
> and stop. And no emojis anywhere, per `CLAUDE.md`.
>
> If you find that something you told me earlier was wrong, say so plainly in one line and move
> on. Do not re-explain it or apologise for it.
