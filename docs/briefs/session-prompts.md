# Session prompts — copy, paste, go

Short prompts for starting a Claude session on this repository. Each one is deliberately a few
lines: the detail lives in the repo, and pointing at a document costs a fraction of pasting one.

**How these work.** Every prompt below assumes the agent will read `docs/INDEX.md` first — that
page answers what IntelliQ is, what is implemented, what is broken and what must not be built.
Repeating any of that in a prompt is wasted budget.

## THE BRANCH — prepend this to every prompt that will write code

**All current work lives on `claude/platform-work-summary-nmb0cm`.** Not `work`, not `main`.
`origin/work` and `origin/main` are both weeks behind and are not where anything lands.

This is not a formality. An agent left on `work` re-implemented roughly 3,500 lines of already
existing code — the no-LLM guards, CAS durability, `claimNature`, the person-model temporal
fixes and the whole team-grain surface — because it never saw any of it. Being on the wrong
branch does not fail loudly; it just produces confident duplicate work.

> Before anything else, confirm the branch and say what you found:
>
> ```
> git fetch --prune origin
> git checkout claude/platform-work-summary-nmb0cm
> git reset --hard origin/claude/platform-work-summary-nmb0cm
> git log --oneline -5
> ```
>
> If you were on a different branch, say so and tell me what you had done there before you
> reset — do not silently discard it, and do not silently carry it over either.

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

## 16 · Codex — the curiosity stopping rule

> Confirm the branch first (see THE BRANCH above), then read
> `docs/briefs/codex-pilot-programme.md` §0 and §1.
>
> **The law to implement: IntelliQ must not become an interrogation machine.**
>
> Every interaction currently may open a new first-class inquiry. It should not. The kernel must
> prefer, in this order, before ever creating one:
>
> 1. attach the evidence to an existing inquiry
> 2. update the uncertainty on one
> 3. challenge an existing hypothesis
> 4. create a private candidate
> 5. do nothing
>
> **Enforce the order in the kernel, not in the prompt.** `ai/diagnose.js` already refuses a
> proposed `conclusion`; this is the same shape. A model may propose `create`; the kernel checks
> whether an existing inquiry on that subject could hold it — by concept, alias, or `SAME_AS`
> route — and downgrades to attach if so. Grep `_openFrontier`, `NEW_CONCEPT_CAP`,
> `ACTIVE_FRONTIER_CAP` and the route actions in `server.js`; the routing machinery exists and is
> currently trusted rather than checked.
>
> **The stopping rule, deterministic:**
>
> - A question may only be asked when it is attached to an inquiry with a live `missingSignals`
>   entry. No free-floating questions.
> - The same unknown is not re-asked within a cooling window.
> - An unknown a person did not engage with is marked and not re-asked. Declined means declined.
> - A hard per-conversation cap, so a bad turn cannot produce an interrogation.
>
> Pick the constants, put the reasoning in a comment beside each, and say in your report what you
> picked and why. Where a genuine fork exists, pick the quieter branch.
>
> **Acceptance:** a new suite. At minimum — twenty routine interactions on one subject produce no
> more than the cap in new first-class inquiries; a second remark on an existing concept attaches
> rather than creating; a `create` proposal for something an existing inquiry already covers is
> downgraded by the kernel with the model unchanged; the same unknown is not asked twice inside
> the window; and a declined unknown is never re-asked.
>
> Mutation-test every assertion (§1.3). Do not merge, do not open a PR, do not touch
> `ai/audience.js`, `ai/team-state.js` or any cohort fixture. Push the branch and report per §11.

---

## 17 · Codex — the safeguarding boundary, documentation only

> Confirm the branch first, then read `docs/briefs/codex-pilot-programme.md` §0 and §1.
>
> **DOCUMENTATION ONLY. No production code. No test changes.**
>
> `ai/safeguarding.js` already exists and is already deterministic, two-tier and
> model-independent. Your job is to write down exactly what it guarantees, from the code — not
> to extend it.
>
> Write `docs/ttd/safeguarding-boundary.md` covering:
>
> 1. What exists: both tiers, what triggers each, what each does, what is org-overridable, and
>    where the flag is routed. Quote the code.
> 2. What advance notice a participant currently gets, where they get it, and whether it is
>    shown before they speak or only after something trips. Say plainly if the answer is "only
>    after".
> 3. The line: STEER Education markets identifying students with concerns who show no visible
>    signs. State what IntelliQ does instead, and be honest that this is a narrower promise.
> 4. What is deliberately NOT there — no classifier, no risk score, no diagnostic inference, no
>    inferred mental-health state. Say why, in the architecture's own terms.
> 5. What decisions remain, and mark each as founder or legal rather than engineering.
>
> **Do not invent a threshold. Do not add a pattern. Do not build a classifier. Do not describe
> a capability the code does not have.** If you find the code does less than the documents claim,
> that is the finding — the code is the finding and the document is the defect.
>
> Do not merge, do not open a PR. Push the branch and report per §11.

---

## 19 · Codex — the safeguarding lead's screen (READY TO SEND)

The next code task named in `docs/INDEX.md`. Self-contained, needs no founder decision, and the
backend is finished — three routes exist with **no front-end caller anywhere**. A crisis flag is
currently routed to a named safe adult who has no screen to see it on.

> Confirm the branch first (see THE BRANCH above), run `bash scripts/codex-preflight.sh`, and
> read `docs/INDEX.md` before anything else.
>
> **Build the safeguarding lead's queue in the front end. Back end is done — do not rewrite it.**
>
> **What already exists, exactly:**
>
> - `GET /api/safeguarding/flags` — lead or superadmin only, 403 otherwise, and the read is
>   itself audited. Returns `{ ok, isLead, flags, openCount }`, newest first.
> - `POST /api/safeguarding/flags/:id/resolve` — body `{ note }`, truncated to 500 chars. Sets
>   `status`, `resolvedBy`, `resolvedAt`, `resolutionNote`. Audited.
> - `GET /api/safeguarding/config` — readable by anyone. Returns `{ resources, isLead }`. The
>   lead's identity is deliberately **not** exposed to members.
> - A flag is `{ id, subjectId, subjectName, severity, category, excerpt, at, status, leadId,
>   resolvedBy, resolvedAt, resolutionNote }`. `excerpt` is the member's own words, capped at 300
>   characters by `_recordSafeguardingFlag`.
> - `_isSgLead(code, userId)` — the configured `orgMeta[code].safeguardingLeadId`, else the org's
>   active superadmin.
>
> **Scope — one commit:**
>
> 1. A queue screen: open flags first, then resolved. Per flag: who, when, severity, category,
>    the excerpt, and the resources from `/api/safeguarding/config`.
> 2. Resolve, with an optional note.
> 3. A nav entry that appears only when `isLead` is true. Treat this as **convenience, not a
>    boundary** — the server already 403s, and the screen must degrade correctly if a
>    non-lead reaches it by URL.
> 4. Remove the three routes from `KNOWN_ORPHANS` in `scripts/reachability-smoke.js`. That set is
>    frozen debt and the suite asserts it still describes reality — leaving them in **fails the
>    suite**, which is the point.
>
> **Constraints, each of which is a way this could go wrong:**
>
> - The excerpt reaches the lead and **nobody else**. Not a leader briefing, not the team surface,
>   not `_kernelEvidence` under `ORG_PURPOSES`, not an inquiry signal. Do not widen a single
>   read path to make the screen easier to build.
> - **No classifier, no risk score, no re-ranking.** Render `severity` as the deterministic
>   detector set it. If you find yourself sorting by anything you computed, stop.
> - The cohort floor does not apply here and must not be invoked — a flag is about one named
>   person and is not an aggregate claim.
> - Do not change `ai/safeguarding.js`, the detector, or any threshold.
>
> **One finding you will hit, and I want it reported rather than silently fixed:**
> `orgMeta[code].safeguardingLeadId` is **read in two places and written nowhere** — there is no
> route and no UI that designates the lead, so today every org falls back to its superadmin. Say
> so in your report. A superadmin-only setter is welcome as a **separate second commit**, not
> folded into the screen.
>
> **Definition of done:** `npm test` green, plus a new suite that fails when the screen is
> reverted. Give me a **mutation map** with your report — for each assertion you add, the
> one-line production change that turns it red. An assertion with no such line is not proving
> anything.
>
> Do not merge, do not open a PR. Push the branch and report per §11.

---

## 18 · The standing preferences

Worth pasting once into any long session:

> Two things throughout: short summary first, detail below it — I want to be able to read the top
> and stop. And no emojis anywhere, per `CLAUDE.md`.
>
> If you find that something you told me earlier was wrong, say so plainly in one line and move
> on. Do not re-explain it or apologise for it.
