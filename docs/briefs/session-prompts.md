# Session prompts — copy, paste, go

Short prompts for starting a Claude session on this repository. Each one is deliberately a few
lines: the detail lives in the repo, and pointing at a document costs a fraction of pasting one.

**How these work.** Every prompt below assumes the agent will read `docs/INDEX.md` first — that
page answers what IntelliQ is, what is implemented, what is broken and what must not be built.
Repeating any of that in a prompt is wasted budget.

**Replace anything in `<angle brackets>`.**

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

## 10 · The standing preferences

Worth pasting once into any long session:

> Two things throughout: short summary first, detail below it — I want to be able to read the top
> and stop. And no emojis anywhere, per `CLAUDE.md`.
>
> If you find that something you told me earlier was wrong, say so plainly in one line and move
> on. Do not re-explain it or apologise for it.
