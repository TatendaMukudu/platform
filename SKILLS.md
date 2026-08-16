# SKILLS.md — how to write code in IntelliQ / Platform

Addressed to **Codex**, written by Claude before a handover. `AGENTS.md` says
*what* the contract is — the laws, the branch, the division of labour. This
file says **how to write the code**: the habits that make a change cheap to
live with a year later.

Where this file disagrees with `AGENTS.md` or `TESTING.md`, they win.

---

## 0. The standard: simple yet durable

**Durable** means the code still tells the truth after someone who never read
this file changes it. **Simple** means the smallest construction that can be
proven.

The expensive code is not the long code. It is the code that requires you to
*remember something* — that this prompt must forbid prediction, that this
endpoint must scope by org, that this projection must stay contentless. Every
one of those is a debt that comes due when the person who remembered it is
gone. That person is about to be gone.

Three questions before you write a line:

1. **Can this be proven with plain `node`, no DB and no API key?** If yes, it
   must live in `ai/` as a pure module. The truth layer is hermetic on purpose
   and that is the single most valuable property this repo has.
2. **Is there exactly one place this rule lives?** If the answer is two, you
   have already written the bug; it just has not happened yet.
3. **When it breaks, does the suite go red — or does a person read something
   about themselves that is not true?** The second is the only genuinely
   unacceptable outcome here.

---

## 1. The pattern that matters most: the model phrases, the core grounds

This is the architectural decision the whole product rests on, and it is the
one most easily eroded by a well-meaning change.

**The deterministic core decides what is true. The LLM only phrases it.** Every
model edge must have a deterministic floor to fall back to, and the fallback
must be *safe on its own* — a real sentence a person can read, not an error.

The guard fleet exists because of exactly this: `ai/language-guard.js` rejects
any model-phrased text that predicts or diagnoses, and the caller keeps the
deterministic line. It is deliberately aggressive: a false positive costs a
slightly plainer sentence, while under-blocking costs a person being told what
will happen to them.

So, when you add an LLM edge:

- Compute the honest deterministic answer **first**. It must stand alone.
- Send the model the *grounded* facts, never the raw sensitive content.
- Run the model's output back through the guard. Reject, do not repair.
- Add the smoke that **attacks** it (predictive phrasings must be caught) and
  **defends** it (the system's own deterministic output must pass, so the guard
  never rejects its own safe floor). `language-guard-smoke.js` is the shape.

A model edge with no floor is not a feature; it is an outage and a false claim
waiting for an API to have a bad day.

---

## 2. The privacy law is absolute, and it is structural

Sensitive and hardship information **may inform** reasoning and must **never**
be revealed, quoted or surfaced. This is not enforced by being careful. It is
enforced by construction:

- Engine items carry **no raw text fields**. If you add one, LAW 7 goes red,
  and it should.
- Sensitive context is a **contentless flag** (`careFlag: boolean`), never a
  string.
- `publicProjection` is what Platform sees of a person. It leaks nothing.
- Identity comes from **the session, never the request body**. This was a real
  cross-org isolation defect once (`5a22952`); do not reintroduce the class.

If a feature seems to need raw text to cross a boundary, the feature is wrong,
not the law. Say so rather than widening the gate.

---

## 3. The habits that cost nothing now and save everything later

**Pure module, then wire.** Logic goes in `ai/` with no `require` of `db.js`,
no network, no environment. `server.js` fetches and calls it. That seam is why
the suite runs anywhere in seconds.

**Unknown stays unknown, and visible.** Below the feedback floor, confidence
says *calibrating* — it does not produce a reliability number. Thin data gets
an honest "still learning", not a plausible score. Never surface `NaN` or
`undefined` to a human; LAW 4 exists because it happened.

**One owner per rule.** A second place that classifies sensitivity, or checks
org scope, or decides whether text is safe to show, is a fork that will drift.
Route through the existing gate.

**A guard you have not watched fail is a guard you are assuming.** Break it
once, confirm the red, restore it, and say in the commit message that you did.

**Fix a bug, add a golden case.** Into `scripts/eval.js` or the relevant smoke,
permanently, in the same commit. A defect that can silently return is a defect
you did not fix.

**Consolidate, do not sprawl.** Strengthening the kernel beats adding a page.
This repo already carries fifty-odd markdown files at its root, most of them
snapshots of a moment nobody will read again — that is what sprawl looks like
after the fact. Prefer editing the file that already covers it.

**A dependency is a permanent liability.** The runtime dependencies here are
five. Prefer forty lines you can read to a package you cannot.

**Comments say why, at the top of the module.** Not what, line by line. Every
serious module here opens with a banner block explaining the decision it
encodes and what it deliberately does not do. That block is what stops the next
person from "simplifying" the rule away. Keep writing them.

---

## 4. What "simple" is not

- **Not clever.** A regex nobody can read is not simple; it is short.
- **Not fewer files.** `server.js` is already a monolith; adding to it is not
  simplification. New logic that can be pure belongs in `ai/`.
- **Not skipping the smoke.** The smoke is the part that makes it durable.
- **Not a config flag instead of a decision.** A flag is two codepaths and a
  question you did not answer.
- **Not an abstraction with one caller.** Abstract on the third use.

---

## 5. This repo specifically

```bash
npm test        # syntax-check every source + run every suite. One verdict.
```

No DB and no API key needed — and it must stay that way. If a change makes the
suite require infrastructure, the change is in the wrong layer.

The suite syntax-checks `ai/`, `scripts/`, `js/`, `server.js` and `db.js`, then
runs the smoke fleet, `eval.js` and `invariants.js`. **Green before anything
merges**, no matter who wrote it. CI enforces it on every push and PR.

`scripts/invariants.js` is the executable spec of *what IntelliQ is allowed to
say* — read it first; it is short and each law was learned by getting something
wrong. `TESTING.md` says what each suite guards and why.

Where things live: the map in `AGENTS.md` §4. The cognitive spine is
`ai/agents.js` — Observe, Remember, Connect, **Reason** (backstage, may use
sensitive signals), **Coach** (the only external face), Learn. Reasoning is
never surfaced raw. Coaching is what a human ever sees.

The kernel is **domain-agnostic in logic, domain-parameterised in metadata**.
No logic, yes parameters. If you find yourself writing an `if (sport === …)`,
it belongs in `ai/packs.js` as data instead.

---

## 6. When you are not sure

Do not guess, and do not pick the reading that is easier to build.

- **A factual disagreement:** write the test that decides it. It settles the
  question permanently, which a chat message never does.
- **A product question:** it belongs to the founder. Comment on the `rfc`
  issue tracking `COUNCIL_BRIEF_2026-07-09.md` with the question stated
  precisely enough to be answered yes or no.

**A weigh-in that is not in the repo did not happen.** A commit or a PR comment
— not a chat window. That holds for input relayed from a human or from a model
with no repo access: capture it as a comment so it is durable and visible.

---

## 7. Handover: where things stand

`main` is at `51b3cd9` — "Stop showing inquiries that hold nothing" (#50). The
recent line of work is the inquiry layer: refs rather than copies, competing
hypotheses, the collection frontier wired, and the semantic intake kernel
feeding it. The composer flip (`c99b0ed`) is the reference implementation of §1
above — read it before adding a model edge.

Deploy: the dev branch fast-forwards to `main` to release. Open a PR only when
asked. Never push to a branch you were not asked to; GitHub scope is limited to
`tatendamukudu/platform`.

---

## 8. What I will check when I am back

Stated in advance so it is a shared standard and not a surprise audit:

1. `npm test` green, run by me, compared against what the reports claim.
2. Every model edge with a deterministic floor that stands alone, and a smoke
   that both attacks and defends it.
3. No raw text field on anything crossing the person-to-org boundary.
4. Every fixed bug carrying the golden case that pins it.
5. New logic in `ai/` and pure, not appended to `server.js`.
6. One law from `invariants.js` picked at random, and an honest attempt to
   break it. If it breaks, that is the finding.

Disagreement with any of the above is welcome, and it belongs in the repo. The
tests settle ties — not seniority, not confidence, not who wrote it.
