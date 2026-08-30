# The final architecture programme — five lanes, one run

**Status:** CURRENT — the work order that finishes IntelliQ's architecture, front and back.
**Branch:** `claude/platform-work-summary-nmb0cm`. **Written:** August 2026.

**After these five lanes there is no architectural work left.** What remains is a live database,
a staging deploy, and real people — none of which is code.

---

## 0 · HOW TO RUN THIS

**Run the lanes in order. Commit each one separately. Report after each — do not batch.**

| Rule | Why |
|---|---|
| `npm test` must print **TRUTH LAYER GREEN** before every commit | it is the arbiter, not a formality |
| **Mutation-test every assertion you add** — break the production line, confirm red, restore | an assertion that stays green when the code is broken proves nothing, and this has been the single most common defect in this repository |
| **Do not weaken, delete or relax any existing assertion** | a failing test is a finding to report, not an obstacle to remove |
| **If a lane contradicts an existing assertion or a founder decision, STOP and report** | this has already happened once and stopping was the right call: D40 contradicted itself, Codex refused to weaken the test, and the DECISION was corrected rather than the suite |
| Do not start a lane while the previous one has anything red | |
| Do not merge. Do not open a PR. Push the branch | |
| **No emojis** anywhere — `CLAUDE.md` | |

**Read first, once:** `docs/INDEX.md` · `ttd/founder-decisions-2026-08.md` (49 binding decisions,
indexed at the top — read the index, then only what a lane touches).

### Conflict matrix

| | A | B | C | D | E |
|---|---|---|---|---|---|
| **A** nav buckets | — | none | none | none | E rewrites A's files |
| **B** one voice | none | — | B and C both touch `ai/` — do B first | none | none |
| **C** stopping rule | none | after B | — | none | none |
| **D** world-model | none | none | none | — | none |
| **E** one home | **after A** | none | none | none | — |

**D writes no production code and can be run at any point, including first.**

---

## LANE A · THE FOUR NAV BUCKETS

Founder decision **D1**; `ttd/object-as-conversation.md` §1 and §6c.

**The founder's words are the specification:**

> *"They are not lists, they are in the nav — and when you click on them you essentially see what
> we used to have, but in their respective buckets."*

**This is REUSE, not layout.** The card feed already renders. Four nav entries —
**Inquiries · Focuses · Highs · Lows** — each showing that feed filtered to one kind.

> **Anyone who writes a second card renderer has misread this.** Two renderers for one card is how
> the polarity vocabulary came to exist five times.

1. Four nav entries, at both grains. Each opens the **existing** feed, filtered.
2. Ordered by **priority, never by kind** (D13, D48). Premature is not a reason to hide something;
   maturity is an outcome, not a filter.
3. **Parked items below the live ones, with the reason.** `parkedBecause` already exists in
   `diagnose.boundFrontier` and has never been rendered (D10). Showing it is how a person can
   disagree with the ranking.
4. **No count badges.** A badge reading "12 Lows" builds the same inbox anxiety as twenty cards on
   a screen (D48). Names only.
5. Each card opens a thread. §27 built that for **inquiries only**
   (`GET /api/inquiry/:id/thread`). **Focus, High and Low still need their thread route** — and
   L-OC1 applies to every one of them: **the opening is composed from the object on every read and
   never stored.**

**Constraints:** no second card renderer · no new list component · no colour carries meaning
(D14b, the no-dashboard rule) · render text the kernel composed, never assemble prose from raw
fields.

**Done:** a suite proving each bucket contains only its own kind, ordering is by priority rather
than kind, parked items render with their reason, and each new thread route composes its opening
on every read without writing it to `assistantConversations`.

---

## LANE B · ONE VOICE

Founder decision **D30**, second half. Backend only.

**The deterministic voice lives in four homes and is maintained as one by nobody.** `ai/voice.js`
owns `explainObject` and the provenance chip. But **30 headline/body/suggestion sets still sit in
`ai/proactive.js` `MESSAGES`**, the plain pattern names in `ai/primitives.js` `STRUCTURE_LABEL`,
and `ai/assessment-view.js` composes its own.

Consolidate them into `ai/voice.js`. `proactive.js` keeps producing artifacts; **it stops owning
prose.**

**The voice is "a colleague who noticed" (D34)** — warm, first person, no hedging theatre, and it
never ends in an instruction. A sentence that tells somebody what to do has become the coach
voice, and `ai/language-guard.js` would reject it as a prediction anyway.

**Constraints:** **every existing message must survive byte-identical unless you say otherwise and
why** — this is a move, not a rewrite. `ai/voice.js` stays **pure**: no IO, no model,
deterministic, and the same state always reads the same way.

**Done:** an assertion that no module outside `ai/voice.js` authors person-facing prose for a
pattern — the same shape as `governance-smoke`'s single-owner check for polarity, and
mutation-tested the same way.

---

## LANE C · THE CURIOSITY STOPPING RULE

`briefs/session-prompts.md` **§16**, written and never run. **D35 promoted it from a refinement to
a dependency:**

> With conversation as the only capture mechanism, every unanswered question is pressure to ask
> again. **The stopping rule is what keeps capture from becoming interrogation.**

Execute §16 as written. It gates the step after this programme — the thread asking the next best
question — so it must land before any curiosity ships.

---

## LANE D · WORLD-MODEL RECONCILIATION *(READ-ONLY)*

**PHASE 1 IS READ-ONLY. No production code. No test changes. No new files except the report.**

Read `docs/briefs/world-model-reconciliation.md` **in full** and execute it exactly. It carries its
own constraints, three gap tests, the mandatory ontology and polarity reconciliations, the
duplication audit across thirty concepts, the invariants, and the implementation gate.

**Before anything else** read the prior art it names — `ttd/organisational-ontology-investigation.md`
and `ttd/ontology-integration-and-decay.md` — and say what they already settled. **If a finding
contradicts either, that contradiction IS the finding.**

Write `docs/ttd/world-model-reconciliation-findings.md`. Finish with the ontology verdict **and**
the implementation gate letter. **On C or D, STOP** — those require founder adjudication.

**Its central bet has been confirmed six times in this repository** (see §0 of the brief): the
safeguarding queue, the answerability layer, `/api/self/patterns`, `falsifiers`, the import
routes, and self Highs and Lows all turned out to be already built. **Start from the prior that it
exists, and make the investigation prove otherwise.**

---

## LANE E · ONE HOME — `js/app.js` ABSORBS `js/member-view.js`

Founder decision **D24**. **LAST, and only after A–D are green.**

`js/app.js` is ~7,900 lines and `js/member-view.js` ~3,500. **One home means ONE FILE, and this
change must end with `js/member-view.js` DELETED** — not with a third file added. A shared module
leaves two homes in existence and they drift the first time one is edited alone.

**What makes it tractable:** D7 already did the thinking. **There is no role difference left** —
only a **scope** difference, and scope is computed on the server by `getVisibleUserIds` and
`_kernelEvidence`. The front end does not need to know which kind of person it is rendering for.
Any test asserting that a leader's surface differs in *shape* from a member's is asserting the
wrong thing; the difference is the subject set.

**Constraints:** no behaviour changes in the same commit as the move · every currently-reachable
route stays reachable (`reachability-smoke` will catch it) · the four buckets from Lane A survive
intact.

**Done:** `npm test` green, `js/member-view.js` no longer exists, `reachability-smoke` still passes.

> **If partway through this looks like it will not land cleanly, STOP and report.** A half-merged
> front end is worse than two coherent files, and there is no deadline that makes it otherwise.

---

## 1 · WHAT THIS PROGRAMME IS NOT

- **Not licence to build an Objective, Goal, Trait or Focus subsystem.** Lane D decides whether any
  of those need to exist at all. Building one first is precisely the duplication the brief exists
  to prevent.
- **Not licence to add a dashboard**, a score on a person (D14b), a colour that carries meaning
  (D14b), or a second store of anything.
- **Not licence to widen a scope, lower a floor, or relax an audience rule** to make a lane land.

## 2 · REPORT, PER LANE

Lane · what changed · the mutation map (each assertion, and the one-line production change that
turns it red) · what you could not verify · anything you found that contradicts a document, since
**the code is the finding and the document is the defect**.
