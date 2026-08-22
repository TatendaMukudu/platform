# Continuous TTD review of Claude-authored code

**Reviewer:** Codex worker  
**Review baseline:** repository history through `a6cdaf3` (2026-08-17)  
**Authority:** `docs/ttd/intelliq-ttd-v1.md`, then executable repository truth  
**Scope:** a retrospective review from the first recorded commit plus the repeatable review loop
for every subsequent Claude change  
**Out of scope:** implementing the debts listed below, changing product decisions, or treating
authorship as evidence of correctness

## Verdict

The codebase has a strong deterministic truth layer, and recent work demonstrates the intended
test-driven path from product decision to executable law. The main optimization opportunity is
not more feature code. It is to turn the TTD's remaining `SPECIFIED` and `PARTIAL` laws into the
ordered engineering queue, while making every Claude diff prove that it does not widen those
known gaps.

This is a critique of artifacts, not of an author. The same checks apply to Claude, Codex and
human changes. A green suite proves only the guarantees represented in that suite; it does not
convert a documented partial law into an enforced one.

## What is working and should be preserved

1. **The truth layer is genuinely executable.** `scripts/test.js` syntax-checks the source tree,
   runs each registered suite independently, collects failures and returns a single non-zero
   verdict. This is a better merge arbiter than prose review.
2. **The latest TTD work shows the right delivery shape.** Laws U2, Q2 and the first clause of M2
   progressed through focused implementation, negative cases and runner registration rather than
   through status prose alone.
3. **The code is explicit about epistemic boundaries.** Dedicated tests exist for admissibility,
   evidence origin, correction, private evidence, lifecycle, authority-sensitive HTTP paths and
   model-independent safety. This is the architectural moat and should not be traded for shorter
   implementation time.
4. **The TTD separates desired truth from enforced truth.** Its status vocabulary prevents
   `SPECIFIED`, `PARTIAL` and `ENFORCED` from being treated as synonyms. That distinction is the
   basis of this review loop.

## Findings, in priority order

### P0 — The M2 implementation is lexical and does not prove universality

`ai/packs.js:primitiveForSignal` currently recognizes activity through a finite list of workflow
nouns such as messages, tickets, emails, issues and commits. Its fallback classifies an unknown
signal as participation. The accompanying golden cases repeat the same vocabulary, so code and
test agree without proving the kernel works for an isomorphic stream with unfamiliar labels. A
genuine outcome from a new adapter can therefore be silently demoted to activity. This conflicts
with the domain-agnostic-logic rule even though the focused suite is green.

**Optimization:** move the distinction into explicit primitive/domain-pack metadata and retain a
conservative `unclassified` result when metadata is absent. Add metamorphic cases that rename
sources and labels while preserving metadata, plus an unknown genuine-outcome case that may not
default to participation. Test the semantic contract rather than the current noun list.

### P0 — Evidence admissibility remains the highest-risk unpaid debt

**TTD basis:** E1 is explicitly the highest-priority unenforced law; E2 is partial; E3 is not
enforced.

The current confidence machinery distinguishes independent origins, but evidence class does not
yet constrain what proposition an origin may establish. As a result, well-instrumented occurrence
data can still accumulate epistemic weight against a person's report of their own experience.
Origin independence solves repetition bias, not instrumentation bias.

**Optimization:** implement one deterministic admissibility matrix at the evidence-to-claim
boundary before adding more reasoners or evidence sources. Give each claim a proposition class,
classify each evidence envelope through an allowlist, and make inadmissible evidence context-only.
Do not scatter class checks across composers. Add golden cases in which many calendar/system
records cannot settle a lived-experience claim, while those same records can establish that an
event occurred.

**Merge check until paid:** any change that introduces an origin kind, evidence adapter, claim
type or confidence input must demonstrate that it cannot increase support outside the evidence
class it can establish.

### P0 — Consent and withholding are transparent but not yet controllable

**TTD basis:** P1 property 2 is entirely absent, P5 is specified, P6 is specified and U4 is
specified.

Inspection and rectification routes are valuable, but they do not yet provide the controls the
TTD promises: withholding a source from self-inference, declining attention, consent before a
private contribution is disclosed, and resistance to re-identification in small groups. More
ingestion without these controls increases the privacy surface faster than it increases user
agency.

**Optimization:** build a single consent/attention policy primitive with fail-closed allowlists,
then require retrieval, reasoning, disclosure and delivery to consume its independently computed
decisions. Preserve historical audit facts while excluding withdrawn material from current
inference. Test refusal, revocation, stale consent, unknown consent states, group-size inference
and cross-surface consistency.

**Merge check until paid:** reject new automatic ingestion, aggregation or leader-facing
projection unless its withdrawal, audience and inference behavior are tested at both the pure and
HTTP boundary.

### P1 — The three authorities exist as conventions, not one enforceable model

**TTD basis:** A1 remains partial.

Epistemic, disclosure and action gates exist in different modules, but no common contract proves
that one authority cannot be mistaken for another. This makes every new surface responsible for
remembering the distinction and creates a predictable regression point as the product grows.

**Optimization:** define a small authority decision contract that returns separate computed
decisions and reasons for `believe`, `disclose` and `act`. Existing specialist gates should remain
the decision inputs; the shared contract should coordinate rather than flatten them. Add a matrix
test proving every combination, especially “may know, may not disclose” and “may disclose, may not
act.” Never accept model-authored authority fields.

### P1 — Unknown handling is local rather than guaranteed at composition

**TTD basis:** E7 and U3 remain partial; Q1 is partial.

Several modules degrade honestly when evidence is thin, but the TTD records no general rule at
the final composition boundary. Local honesty can therefore be undone by a later composer that
turns tentative evidence into confident prose or a diagnosis before a question.

**Optimization:** add one final deterministic claim ledger/gate used by every human-facing
composer. Unsupported claims should become a bounded “not known yet” response plus a non-leading
question or null action. Test empty, stale, contested, class-inadmissible and model-fabricated
inputs across member and leader audiences.

### P1 — Constitutional refusal is not a complete product path

**TTD basis:** C1 is partial and C2 is specified but unenforced.

One operating-context path rejects prohibited content, but refusal is not represented as a shared
event with a reason, compliant alternative and audit record. A silent or inconsistent refusal is
hard to distinguish from failure and encourages callers to find an unguarded route.

**Optimization:** represent constitutional refusal as a content-free deterministic result and
audit event. Route it through the same response contract on every protected operation. Test that
configuration, role and model output cannot override it, and that recording the refusal never
records the prohibited content.

### P2 — Outcome semantics are only half normalized

**TTD basis:** M2 remains partial because the second clause is not enforced; L2 is partial.

The new activity/outcome boundary correctly prevents counts from becoming outcomes by default.
The remaining risk is semantic flattening: an outcome can still be stored or compared without a
complete definition of “better,” baseline and context. Learning then appears more portable and
causal than the evidence warrants.

**Optimization:** require outcome definitions to identify kind, baseline/comparator, observation
window and organization-defined success meaning before they can support improvement claims.
Retain failed and contradictory interventions with their context. Add cases where identical
numeric movement means improvement in one governed definition and not in another.

### P2 — Lifecycle changes can still change knowledge silently

**TTD basis:** O6 is partial and S2 is partial.

The repository has good lifecycle primitives and historical preservation, but the TTD still
records gaps around mutation effects and narrowly governed exceptions. Any new state is dangerous
if old gates enumerate bad states rather than allowlisting known-good ones.

**Optimization:** for every new lifecycle status, first add a failing test that it contributes
nothing to retrieval, confidence, disclosure or action until explicitly admitted. Require an
audit reason for transitions that alter current epistemic state. Apply the same treatment to
safety exceptions: narrow trigger, bounded disclosure, no action authority and content-free
audit.

The recent U2 implementation also illustrates the structural gap: epistemic and lifecycle state
still share a single belief `status`, with `contested` taking precedence over `dormant`. The system
cannot represent both facts at once. Review cases must cover the cross-product of
open/contested/resolved and active/dormant/retired rather than only serial transitions.

### P2 — U2's enforcement status is broader than its tested surface

U2 requires downstream reasoning to disclose that a belief is contested, but the TTD explicitly
records `/api/brief` as untested while marking the complete law `ENFORCED`. The contest HTTP suite
likewise notes that a brief-only regression would be invisible to its selected surfaces.

**Optimization:** inventory every human-readable belief consumer and add a common contract test,
or narrow the law/status claim to the surfaces actually proved. Until one of those happens, U2
should be represented as partial rather than allowing a green subset to stand for the whole
boundary.

### P3 — Documentation about the truth layer has drifted

`TESTING.md` lists a small early subset of suites and product laws, while `scripts/test.js` now
registers a much larger system. This does not weaken runtime enforcement, but it weakens reviewer
orientation and makes a prose-only review more likely to miss newer boundaries.

**Optimization:** generate a suite inventory from the runner or reduce `TESTING.md` to stable
testing principles plus a link to `scripts/test.js`. Do not manually maintain two exhaustive
lists. The TTD itself should retain law status, because desired and enforced truth must remain
visible together.

Three newly registered suites also retain header notes saying `NOT REGISTERED` even though
`scripts/test.js` runs them. Add a lightweight consistency scan for stale registration claims,
authoritative dates, assertion totals and fragile line-number citations. This is not cosmetic:
the TTD's central promise is that its enforcement claims match executable repository truth.

### P3 — Worker bootstrap contains an avoidable stale-file dependency

`.claude/agents/worker.md` tells workers to read `PERSISTENCE.md` before changing anything. The
file currently exists, but the instruction is global even for work unrelated to persistence and
does not identify `AGENTS.md` and the TTD as the ordered review authorities in its initial read
list. This makes the bounded worker slower and leaves the product-truth document implicit.

**Optimization:** make the mandatory order `AGENTS.md` → relevant TTD laws → touched module
headers; require `PERSISTENCE.md` only for persistence/state work. This preserves necessary
context without front-loading unrelated documents.

## The continuous review loop

Run this loop against **every Claude-authored commit from the repository root**, including the
first commit when reconstructing history. Review commits in chronological order so later fixes do
not hide the original defect pattern.

### 1. Establish the diff and its claimed boundary

```bash
git log --reverse --author='Claude' --format='%H%x09%an%x09%s'
git show --stat --format=fuller <commit>

# Inspect the complete change against every parent. For the initial commit, --root compares
# against an empty tree. Do not add path filters here: they can hide part of the change.
parents=$(git rev-list --parents -n 1 <commit>)
set -- $parents
commit=$1
shift
if [ "$#" -eq 0 ]; then
  git diff-tree --root --no-commit-id -r -p "$commit"
else
  for parent in "$@"; do
    git diff --find-renames --find-copies "$parent" "$commit"
  done
fi
```

Write down the capability changed, the people/data affected, and the TTD laws touched. If no law
appears relevant, explicitly record why; silence is not a scope decision. Begin with the complete
diff above, including configuration, dependencies, assets, migrations and documentation. Narrow
to relevant paths only during the focused review passes, after the complete boundary is known.

### 2. Start with an adversarial case, not the happy path

For each changed boundary, ask:

- What input is private, stale, superseded, contested, cross-organization or unknown?
- Can repeated reports masquerade as independent origins?
- Can evidence establish more than its class permits?
- Can relevance be mistaken for authorization?
- Can a model-authored field decide permission, identity, confidence, safety or state?
- Can disclosure authority be mistaken for action authority?
- Does a refusal, correction or withdrawal preserve history without continuing to count?
- What happens when the model, database, node, mapping or status is absent or unrecognized?

The first test added should encode the most damaging plausible violation. Run it red before the
implementation when practical; preserve it as the regression case.

### 3. Review in four passes

1. **Structural privacy:** raw content movement, subject and organization scope, consent,
   provenance and audit.
2. **Epistemic integrity:** admissibility, independent origins, confidence, contestation,
   lifecycle and unknown handling.
3. **Human consequence:** self-relative language, non-prediction, non-causal wording, first
   beneficiary and authority separation.
4. **Operational integrity:** persistence, idempotency, fail-closed defaults, deterministic
   degradation and registration in the one test runner.

For domain-neutral kernel changes, add a fifth universality pass: rename the domain, source and
surface vocabulary while keeping the typed metadata constant. Behavior must remain isomorphic.

Record findings as `P0` (privacy/constitutional/data-integrity breach), `P1` (incorrect belief or
authority), `P2` (learning/operational weakness) or `P3` (maintainability/drift). A finding closes
only with an executable regression case or an explicit founder decision recorded in the TTD.

### 4. Run the arbiter and inspect what it does not prove

```bash
npm test
git diff --check
```

Run `npm test` twice when shared kernel behavior changes, per the worker contract. Then state the
remaining untested assumptions. “Green” is the merge condition, not a claim that every TTD law is
enforced.

### 5. Keep the TTD honest

Update a law to `ENFORCED` only when the implementation and executable test both exist. Cite the
actual decision boundary and the test that attacks it. If implementation exposes a new product
decision, mark it `OPEN`; do not let code silently settle it. If a cited path or line has drifted,
correct the citation in the same change.

## Definition of done for each loop iteration

- The diff has a named TTD impact and review priority.
- A defect fix has a permanent regression case; a capability has positive and negative cases.
- Privacy, authority, origin, lifecycle and unknown-state boundaries were considered explicitly.
- New suites are registered in `scripts/test.js`; unregistered tests do not count as enforcement.
- `npm test` is green, and any environmental skip is reported as a skip rather than a pass.
- The TTD status is unchanged or updated with both code and test evidence.
- The review records what was verified separately from what remains believed or untested.

## Recommended first implementation sequence

1. E1/E2/E3: evidence-class admissibility and instrumentation-bias cases.
2. P1/P5/P6/U4: withholding, attention and disclosure consent as one fail-closed policy family.
3. A1: explicit separation of epistemic, disclosure and action authority.
4. E7/U3/Q1/C2: unknown/refusal behavior at the shared composition boundary.
5. M2/L2/O6/S2: outcome definitions, contextual learning, lifecycle effects and narrow safety
   exceptions.

This order minimizes compounding risk: it constrains what the system may believe before adding
more sources, constrains what it may disclose or do before adding more surfaces, and only then
expands what it learns.

## Commands used for this review

```bash
git push --dry-run origin HEAD:refs/heads/codex/connectivity-check
git log --oneline --decorate -30
git shortlog -sne --all
rg -n '^### LAW|^\*\*STATUS' docs/ttd/intelliq-ttd-v1.md
sed -n '1,230p' scripts/test.js
rg -n -i '\b(ttd|tdd|test[- ]driven|truth layer|claude)\b' .
```

Repository truth supersedes this critique. If a finding conflicts with an executable guarantee,
the test and implementation win, and this file should be corrected.
