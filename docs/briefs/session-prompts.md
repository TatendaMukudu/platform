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

## 20 · Codex — the answerability screen (READY TO SEND)

Founder decisions **D18** and **D21**, `ttd/founder-decisions-2026-08.md`. Same shape as §19 and
Codex did that one well: three governed routes exist, all correct, none reachable. This is
wiring, not building.

> Confirm the branch first (see THE BRANCH above), run `bash scripts/codex-preflight.sh`, and
> read `docs/INDEX.md`, then `ttd/founder-decisions-2026-08.md` **D18 and D21**.
>
> **Build the answerability screen: what IntelliQ holds about me, who has looked at it, who I
> speak to, and the one exception. The back end exists — do not rewrite it.**
>
> **What already exists, with no caller anywhere:**
>
> - `GET /api/me/data` — the subject access request. Returns the reads held about this person
>   **in their own subject view, never the leader-facing projection**; their private self-model;
>   the notes they authored; and the content-free trail of **who accessed their data and why**.
>   The request is itself logged as a `subject_access` event.
> - `GET /api/me/export` — the complete GDPR Art 15/20 bundle. Self-scoped, password hash
>   stripped. Its own note reads *"This is all the personal data IntelliQ holds about you."*
> - `GET /api/me/audiences` — the audiences this person can choose between, named and explained,
>   built from their real nodes so it never offers one that does not exist for them.
> - `server.js:13192` holds the safeguarding sentence that D21 requires be shown before a person
>   speaks. Use it **verbatim**. Do not rewrite it, soften it, or write your own.
>
> **Scope — one commit:**
>
> 1. A screen with three sections: **what we hold** (`/api/me/data`), **who has looked**
>    (the access trail from the same response), and **who I speak to** (`/api/me/audiences`).
> 2. The safeguarding exception (D21), stated plainly on the audiences section — this is where a
>    person learns the boundary **before** they cross it.
> 3. Download my data — `/api/me/export`, as a file.
> 4. Reachable by **every** person, member and leader alike. This is not a management surface.
> 5. Remove the three routes from `KNOWN_ORPHANS` in `scripts/reachability-smoke.js`. That set is
>    frozen debt and the suite asserts it still describes reality.
>
> **Explicitly NOT in scope — do not build it, do not stub it, do not add a disabled button:**
> withdrawing a piece of evidence. `POST /api/group/:nodeId/withdraw` covers group contributions
> and already has a caller; there is no general route and there must not be one yet. A withdrawal
> that does not recompute and does not tell the people who saw the old picture is worse than none,
> because it looks like it worked. That is founder decision D19 and it is a separate piece of work.
>
> **Constraints:**
>
> - `/api/me/data` returns the person's **own** subject view. Never render it through any
>   leader-facing helper, and never enrich it with anything from another endpoint.
> - The access trail is content-free by design. Do not join it against anything that would give
>   it content.
> - Everything here is self-scoped by the server. Do not add a user parameter, a lookup, or an
>   admin variant. A screen that can show someone else's record is the defect this whole layer
>   exists to prevent.
> - No emojis (`CLAUDE.md`).
>
> **Definition of done:** `npm test` green, plus a suite that fails when the screen is reverted.
> Send a **mutation map** with your report — for each assertion, the one-line production change
> that turns it red. Include one assertion that would go red if the screen were ever made to
> accept a subject other than the caller.
>
> Do not merge, do not open a PR. Push the branch and report per §11.

---

## 21 · Codex — the primitive decides, not the digit (READY TO SEND)

Founder decision **D26**. This is a **live defect**, not new scope: every leader surface is
stripping legitimate performance figures today.

> Confirm the branch first (see THE BRANCH above), run `bash scripts/codex-preflight.sh`, and
> read `docs/INDEX.md`, then `ttd/founder-decisions-2026-08.md` **D26** and **D23**.
>
> **The defect.** `_stripLeaderNumbers` (`server.js:4208`) deletes **every** percentage and every
> `n/5` from leader-facing text:
>
> ```js
> .replace(/\b\d+(?:\.\d+)?\s*%/g, '')    // "83%"
> ```
>
> It cannot tell `2.1/5 mood` from `83% pass completion`, so it deletes both. It runs over
> `summary`, `whyNow`, `recommendedAction`, `learnedNote` and every `connections[].basis`
> (`server.js:3064` and `4232-4241`). A coach reading *"pass completion is at"* is looking at this
> bug. A product that redacts a striker's conversion rate from their own coach is broken.
>
> **The rule (D26).** What protects a number is **the primitive it was captured under**, never the
> fact that it is a number. `ai/primitives.js:30` defines the vocabulary:
>
> | Primitive | Leader sees the figure |
> |---|---|
> | `outcome`, `capability`, `participation`, `load`, `resource` | **YES** — this is the job |
> | `state` (wellbeing), `relational` (connection) | **NO** — direction words only |
>
> **Scope:**
>
> 1. Make the protection primitive-aware. A leader-facing composer should not be handed a
>    **protected** figure in the first place; `_stripLeaderNumbers` narrows to the `state` and
>    `relational` paths and becomes a backstop rather than the boundary.
> 2. Leave every other privacy behaviour exactly as it is.
>
> **The hard part, and I want a report rather than a guess.** `whyNow`, `recommendedAction` and
> `learnedNote` are already-composed strings by the time they reach the sanitiser — they may not
> carry which primitive each figure came from. **Investigate before you change anything.** If the
> primitive is not available at composition time, say so, tell me what it would take to thread it
> through, and implement the narrowest honest version rather than pattern-matching the text for
> words like "mood". A regex that guesses the primitive from the sentence is the same defect again
> with more steps.
>
> **Constraints — this task's specific way of going wrong is weakening a privacy test to let
> performance numbers through:**
>
> - **Do not weaken, delete or relax any existing assertion.** Not C05, not C06, not the
>   non-interference suite, not the leader-projection suites. If an existing test fails, that is a
>   finding to report, not an obstacle to remove.
> - A `state` figure reaching a leader is a privacy failure and must stay impossible.
> - An aggregate `state` figure over a cohort that satisfies the two-sided floor is a different
>   object from one person's mood. Do not touch that path.
> - No emojis (`CLAUDE.md`).
>
> **Definition of done:** `npm test` green, plus a suite asserting **both** directions over the
> real HTTP response, not the source text:
> - a member's `state` figure never appears on a leader-facing response, and
> - a member's `outcome` or `capability` figure **does**.
>
> The second assertion is the one that would have caught this. Send a **mutation map**: for each
> assertion, the one-line production change that turns it red.
>
> Do not merge, do not open a PR. Push the branch and report per §11.

---

## 22 · Codex — one polarity, across the whole algorithm (READY TO SEND)

Founder decisions **D4, D5, D6** and **D7**. Step 0 of the plan and a prerequisite for everything
after it. Bigger than §19–§21: this touches seven modules.

> Confirm the branch first (see THE BRANCH above), run `bash scripts/codex-preflight.sh`, then read
> `docs/INDEX.md`, `ttd/layer-map.md` §1 and §3, and `ttd/founder-decisions-2026-08.md` **D4, D5,
> D6, D7**.
>
> **One concept — is this good or does it need work — is implemented FIVE times under five
> vocabularies. Consolidate it into one owner. Do not add a sixth.**
>
> **Where it lives today:**
>
> | Module | What it does |
> |---|---|
> | `ai/intelligence-feed.js:29` | `POLARITIES` — the frozen 7-value vocabulary. The nearest thing to an owner |
> | `ai/proactive.js:37` | `PATTERN_POLARITY` — person patterns → `risk` / `progress` only |
> | `ai/behaviour.js` | **Three** buckets: *Needs attention · Worth celebrating · Opportunities*. Puts `neutral` in needs-attention |
> | `ai/scoped-intelligence-packet.js:77-78` | **Two** buckets: `needs_attention` / `working_well`. Puts `opportunity` in working_well |
> | `ai/team-state.js:61,401-402` | **Two**: High / Low, with `WORKING_WELL: 'strength'` |
> | `ai/process-reflection.js:50-51`, `ai/process-observations.js:48-49` | **Emits** `strength` / `friction` for routines and handoffs |
> | `ai/diagnose.js:339` | **A FIFTH vocabulary**: `'strength' \| 'difficulty' \| 'condition' \| 'neutral'`. `difficulty` and `condition` are not in `POLARITIES` at all |
>
> **The target, from D4/D5/D6 — this is the whole specification:**
>
> | Polarity | Bucket |
> |---|---|
> | `risk`, `friction` | **Low** |
> | `progress`, `milestone`, `opportunity`, `strength` | **High** |
> | `neutral` | **neither** — appears in the feed, counted in no bucket (D5) |
> | `data_gap`, **by pattern name whatever its polarity** | **neither** (D6) — our gap, not theirs |
>
> **Scope:**
>
> 1. **One pure module owns this** — `ai/polarity.js`. It owns the vocabulary, the bucket function,
>    and the two names. Pure: no IO, no model, imports nothing but what it must.
> 2. Every module above **imports it**. `behaviour.js`, `scoped-intelligence-packet.js` and
>    `team-state.js` keep their public field names if callers depend on them, but the *decision*
>    comes from one place. No module computes a bucket itself.
> 3. `data_gap` is an override by pattern name, not a polarity mapping. Keep that distinction
>    visible in the code — it is a different kind of rule and will confuse the next reader if it is
>    folded into the table.
>
> **Two things to REPORT rather than decide:**
>
> - **`ai/diagnose.js`'s `difficulty` and `condition`.** `difficulty` plausibly maps to Low.
>   `condition` has no obvious home — it may not be a polarity at all. **Do not guess.** Tell me
>   what they are used for and what you think, and leave `diagnose.js` alone until I answer.
> - **`ai/behaviour.js` puts `neutral` in needs-attention today.** Under D5 that changes, and it
>   will change what a leader sees. Say which surfaces move.
>
> **Constraints — the specific way this task goes wrong is a "unification" that quietly changes
> what someone sees:**
>
> - **Do not weaken, delete or relax any existing assertion.** A failing test is a finding to
>   report, not an obstacle to remove. If a suite fails because a bucket legitimately moved under
>   D4/D5/D6, **widen the fixture, never the assertion**, and say so explicitly in your report.
> - Do not change detection, severity, confidence, or any threshold. This is bucketing and naming
>   only — the underlying `polarity` field is untouched.
> - Do not change what any endpoint returns in shape. Field names stay unless you say otherwise.
> - `ai/team-state.js`'s cohort floor and every disclosure rule are out of scope and must not move.
> - No emojis (`CLAUDE.md`).
>
> **Definition of done:** `npm test` green, plus a suite that proves there is exactly ONE bucketing
> decision — including an assertion that fails if any module reintroduces its own. Send a
> **mutation map**: for each assertion, the one-line production change that turns it red.
>
> **Adjacent, do not fix it here, just note if you see it:** `fallbackPrimitives` in
> `ai/intelligence.js` is a new pattern→primitive table living alongside `PATTERN_POLARITY`,
> `PATTERN_LABEL` and `STRUCTURE_LABEL`. Same family of problem, separate piece of work.
>
> Do not merge, do not open a PR. Push the branch and report per §11.

---

## 23 · Codex — what was shown to whom (READY TO SEND)

**The single missing thing that four founder decisions need** — D19, D27, D28 and D40. Build it
once. Pilot-blocking under D33 bar one. Touches none of the modules §22 is changing.

> Confirm the branch first (see THE BRANCH above), run `bash scripts/codex-preflight.sh`, then read
> `docs/INDEX.md` and `ttd/founder-decisions-2026-08.md` **D19**, then D27, D28 and D40.
>
> **The gap.** Nothing in IntelliQ remembers that a finding was shown to a person. So when
> evidence is withdrawn, when a person leaves, or when a correction lands, the kernel updates
> and **the organisation is never told** — a coach who read a card on Tuesday acts on it on Friday
> having never learned it stopped being true on Wednesday. `docs/INDEX.md` calls this **T-2**.
>
> **Build the RECORD only. Not the notification, not the recomputation, not any UI.**
>
> **Use the audit log — do not create a parallel store.** `auditLog` (`server.js:10018`) is already
> hash-chained, content-free by construction, capped at `AUDIT_CAP`, durable through
> `scheduleSave()`, and **deliberately preserved when a user is deleted** (`server.js:2073`). It is
> the right substrate and a second store would be the fifth parallel thing this sweep has found.
>
> **Scope:**
>
> 1. Extend the audit entry so it can carry **which findings were shown**, not only which subjects
>    were touched. `_audit(code, { actor, action, subjectIds, basis })` today records *"this leader
>    viewed a briefing about these people"*. It needs to record *"...and these were the findings
>    they saw."*
> 2. **References, never content.** A finding id or dedupe key. No headline, no basis text, no
>    numbers. The audit log's content-free guarantee is what makes it safe to keep after deletion,
>    and it must survive this change intact.
> 3. Record at the points where a finding actually reaches a person:
>    `GET /api/intelligence/briefing`, `GET /api/intelligence/watch`,
>    `POST /api/intelligence/prepare`, and the member's own surfaces.
> 4. `ai/audit.js` `record()` gates on a known action and builds the hash chain. Make the new field
>    pass that gate **without weakening the gate** and without breaking chain verification.
>
> **An honest limitation to state in your report rather than paper over:** an API response is not
> proof a human read anything. This records *emission*, which is the best available proxy. Name it
> that way in the code comment so nobody later mistakes it for read-receipt.
>
> **Explicitly NOT in scope:** notifying anyone, recomputing anything, changing any API response
> shape, any front end. D19's notification is the next piece of work and depends on this one.
>
> **Constraints:**
>
> - **Do not weaken, delete or relax any existing assertion.** A failing test is a finding to
>   report, not an obstacle to remove.
> - The audit log stays **content-free**. If your change puts a member's words or figures into it,
>   that is the defect, not the feature.
> - Do not change what any endpoint returns.
> - Respect `AUDIT_CAP`. This log is written on every briefing fetch; it must not grow unbounded.
> - No emojis (`CLAUDE.md`).
>
> **Definition of done:** `npm test` green, plus a suite that proves, over the real HTTP boundary:
> - fetching a leader briefing writes an audit entry naming the finding references it emitted,
> - **no finding text, headline, basis or number appears anywhere in the audit log**,
> - the hash chain still verifies after the change,
> - the cap still applies.
>
> The second assertion is the one that matters most. Send a **mutation map**: for each assertion,
> the one-line production change that turns it red.
>
> Do not merge, do not open a PR. Push the branch and report per §11.

---

## 24 · Codex — a finding about a leader is never attributable (READY TO SEND)

Founder decisions **D27** and **D38**. Pilot-blocking under D33 bar one.

> Branch first (see THE BRANCH above), run `bash scripts/codex-preflight.sh`, read `docs/INDEX.md`
> and `ttd/founder-decisions-2026-08.md` **D27**, **D38**.
>
> **D27 makes a leader a legitimate subject of evidence — a squad can say training has been
> disorganised for three weeks. D38 makes contribution anonymous by default. The risk is
> retaliation, and the guard does not exist yet.**
>
> **The law to enforce:**
>
> > A finding whose subject is a leader must never be attributable to the people who contributed
> > to it — not by name, not by a count small enough to identify, not by phrasing that reveals who
> > spoke.
>
> **Already built, do not rebuild:** the two-sided cohort floor (`ai/team-state.js cohortFloor`,
> `MIN_COHORT = 5`), `MIN_INDEPENDENT_ORIGINS` and the `ECHO` verdict, and
> `contribution.contributorVisibility`.
>
> **Scope:**
> 1. A projection guard for a leader-subject finding: no contributor ids, no contributor names, no
>    exact contributor count, and no verbatim contributed text.
> 2. **Routing.** It goes to that leader's own leader, and to the leader themselves. **Never to
>    their own team** — that hands them the list of who to ask.
> 3. Fail closed: if the subject's leader status cannot be determined, treat it as a leader
>    finding and apply the guard.
>
> **Report, do not decide:** whether the leader sees it at the same moment their manager does.
> That is flagged as open in D27 and is the founder's call.
>
> **Constraints:** do not weaken any existing assertion; do not change the floor; do not change
> what a non-leader finding looks like; no emojis.
>
> **Done:** `npm test` green plus a suite over the real HTTP boundary proving a leader-subject
> finding carries no contributor identity, no exact count, and does not reach the subject's own
> team. Send a **mutation map**.
>
> Do not merge, do not open a PR. Push the branch and report per §11.

---

## 25 · Codex — a withdrawal tells whoever saw the old picture (READY TO SEND)

Founder decision **D19**, closing **T-2**. Pilot-blocking. **Depends on §23, which has landed** —
`finding_view` audit entries now record which findings were emitted to whom.

> Branch first (see THE BRANCH above), run `bash scripts/codex-preflight.sh`, read `docs/INDEX.md`
> and `ttd/founder-decisions-2026-08.md` **D19**, then **D40**.
>
> **The gap.** The kernel recomputes correctly when evidence is withdrawn. Nobody is told. A coach
> who read a card on Tuesday acts on it on Friday having never learned it stopped being true on
> Wednesday. `docs/INDEX.md` calls this **T-2** and it is the last original blocker still open.
>
> **The record now exists** — `finding_view` entries in the audit log name which findings reached
> which person (`scripts/finding-emission-audit-smoke.js`). This work uses it.
>
> **Scope:**
> 1. When evidence is withdrawn, superseded or corrected, determine which previously-emitted
>    findings **materially changed** — gone, or moved bucket, or dropped a confidence band.
> 2. For each, find who was shown it, from the emission record.
> 3. Tell them, through the delivery layer that already exists (`ai/delivery.js`, `deliveryPrefs`).
>
> **Also covered by the same mechanism (D40):** a person leaving recomputes team findings, and a
> finding whose cohort floor only held because of them **drops**. Whoever saw it is owed the same
> notice. Build one path, not two.
>
> **Constraints:**
> - The notice says a finding **changed**; it never restates the withdrawn content. Nothing that
>   was withdrawn may appear in the message that says it was withdrawn.
> - Respect `deliveryPrefs` and the existing opt-in. This is not a new channel.
> - Do not weaken any existing assertion. Do not change the audit log's content-free guarantee.
> - No emojis.
>
> **Done:** `npm test` green plus a suite proving that withdrawing evidence behind an emitted
> finding produces a notice to the person who saw it, **and that the notice contains none of the
> withdrawn content**. The second assertion is the one that matters. Send a **mutation map**.
>
> Do not merge, do not open a PR. Push the branch and report per §11.

---

## 26 · Codex — self Highs and Lows (READY TO SEND, after §24/§25)

Founder decisions **D4, D5, D6**; `object-as-conversation.md` §4 **G2**. Unblocked now that §22
gave polarity one owner — self Highs and Lows could not be derived into a vocabulary that had not
been chosen.

> Branch first, run `bash scripts/codex-preflight.sh`, read `docs/INDEX.md` and
> `ttd/founder-decisions-2026-08.md` **D4, D5, D6**.
>
> **There is no self-grain High or Low anywhere in the code.** Team Highs and Lows come from
> contributed group inquiries and detected group patterns. The Self layer has beliefs, patterns
> and insights — but nothing named or shaped as a High or a Low.
>
> **This is a projection, not an engine.** Do not write a detector. The polarity is already
> assigned (`ai/proactive.js` `PATTERN_POLARITY`), the buckets are already owned
> (`ai/intelligence-feed.js` `bucketOf` — §22), and the person's own insights are already produced
> by `_proactiveInsights(code, userId, { audience: 'self' })`. Bucket what exists.
>
> Scope: a person's own Highs and Lows, self-only, derived by passing their own insights through
> the ONE bucket owner. `neutral` lands in neither bucket (D5); `data_gap` lands in neither
> whatever its polarity, because it is our gap and not theirs (D6).
>
> Constraints: no new detection, no new thresholds, no second bucket table (`governance-smoke`
> asserts there is exactly one and it is mutation-tested). Self-scoped — a leader must never reach
> this path. Do not weaken any existing assertion. No emojis.
>
> Done: `npm test` green plus a suite proving a `neutral` self finding appears in neither bucket,
> a `data_gap` appears in neither, and no leader can read another person's self Highs and Lows.
> Send a **mutation map**. Do not merge, do not open a PR.

---

## 27 · Codex — the thread view (READY TO SEND, after §26)

`ttd/object-as-conversation.md` §2, §6c; founder decisions **D9, D12, D13, D36**.

> Branch first, run `bash scripts/codex-preflight.sh`, read `ttd/object-as-conversation.md`
> **§2, §6c** and `ttd/founder-decisions-2026-08.md` **D9, D12, D36**.
>
> **Both halves already exist.** The binding: `about` on the conversation store, with
> `GET /api/assistant/conversations?about=inquiry:i_1` (`thread-binding-http-smoke`). The
> sentences: `ai/voice.explainObject` (`voice-composer-smoke`). This assembles them into the
> screen in §6c.
>
> **THE LAW THIS COULD BREAK, and it is the whole risk:**
>
> > L-OC1 · The opening explanation is **COMPOSED FROM THE OBJECT, EVERY TIME**, and never
> > stored. Only the human turns and the agent's replies are stored. A conversation may add
> > evidence to an object through the normal boundary; it may never hold a claim the object does
> > not.
>
> Storing the opening message would create a second place organisational truth lives, and the two
> would drift the first time a correction landed in one and not the other. If you find yourself
> writing it into `assistantConversations`, stop.
>
> Scope: an object opens to the four blocks from §6c — the claim, *why I think that*, *what I
> still don't know*, *what would change my mind* — then the conversation, then the composer. Four
> headings, that is the whole design. **No buttons:** an inquiry is closed by saying so (D9) and
> challenged by saying so (D36). One overflow with exactly two items (*Mark answered · Set aside*)
> is the only permitted control.
>
> Constraints: render text the kernel composed, never assemble prose from raw fields
> (`reachability-smoke` asserts this for the lead question already). No colour carries meaning —
> D14b and the no-dashboard rule. No emojis.
>
> Done: `npm test` green plus a suite proving the opening message is composed on every read and
> appears nowhere in the conversation store. Send a **mutation map**. Do not merge, no PR.

---

## 28 · Codex — world-model reconciliation (DOCUMENTATION ONLY, back of the queue)

**Supersedes the earlier ontology-only §28.** The brief now lives in the repository rather than in
a chat box, so it is read with the rest of the context and never re-pasted:
`docs/briefs/world-model-reconciliation.md`.

**Explicitly last.** It is read-only, it lands in R&D where nothing is a reason to build, and the
pilot needs a deployed product before a richer world model. **But its central bet has been right
five times out of five in this repository** — see §0 of the brief — so it is worth running
properly once the blocking work is done.

> Branch first (see THE BRANCH above), run `bash scripts/codex-preflight.sh`.
>
> **PHASE 1 IS READ-ONLY. No production code. No test changes. No new files except the report.**
>
> Read `docs/briefs/world-model-reconciliation.md` **in full** and execute it exactly. It carries
> its own constraints, its three gap tests, the mandatory ontology and polarity reconciliations,
> the duplication audit, the invariants, and the implementation gate.
>
> Before anything else, read the prior art it names — `ttd/organisational-ontology-investigation.md`
> and `ttd/ontology-integration-and-decay.md` — and say what they already settled. **If your
> finding contradicts either, that contradiction IS the finding.** Also read
> `ttd/founder-decisions-2026-08.md`: several questions in the brief are already settled there
> (D2, D5, D14, D14b, D15, D25, D38, D42).
>
> Write `docs/ttd/world-model-reconciliation-findings.md`. Finish with the ontology verdict AND the
> implementation gate letter. **On C or D, STOP.**
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
