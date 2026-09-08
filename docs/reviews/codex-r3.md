# Review round 3 — Codex

**Read:** main @ 5683df3de63d8daa54d345ab39fa262db1908d2e; PR #84 starting head @ 6680a7e68d0600f3e8ba5ba930a4aacd66052d7f; corrected code @ 9e208720d73bb9054690cb95a37ec535b784a2e3
**Lane:** Narrow canonical-ownership correction: personal Focus lifecycle, Focus audience resolution, current-origin equivalence, and the control-surface claim.
**Ran:** `git push --dry-run origin HEAD:refs/heads/codex/connectivity-check`; `node scripts/focus-ownership-parity-smoke.js`; `node scripts/composer-actions-smoke.js`; focused dependent suites listed below; `/tmp/focus-mutations.py`; scope-inventory mutation (71 -> 72); `npm test`; `git diff --check`.

## Scope actually covered

I read the final PR #84 integration findings supplied for this correction, `docs/reviews/codex-r2.md`, the direct personal-Focus routes, composer proposal/confirmation branches, `_beginFocusAction`, `_completeFocusAction`, `_recordNoticeFeedback`, Focus projection/read paths, group membership/addressability, `ai/diagnose.js`, `ai/team-state.js`, firming-chart reconstruction, the composer architecture note, and the relevant truth suites.

I did not redesign the composer, add a product capability, change Material/Forum/Library/Inquiry law, alter the cohort floor, or merge. Administration, billing, connectors and unrelated UI were not reviewed beyond the full truth layer.

## Reproduced failures

- **Reproduced by parity fixture:** direct Focus outcome recorded notice feedback and `mem.lastUpdated`; composer outcome did not. The initial parity comparison diverged on feedback/last-update side effects.
- **Reproduced by code path and mutation:** direct create, composer create/update/outcome, and conversation-to-group sharing each owned Focus shape and lifecycle mutations independently. Replacing a composer canonical-owner call made FP1/FP11 red.
- **Reproduced by origin fixture:** current origin counts were locally rebuilt in confidence/projections/chart paths. A missing-ref fallback or same-origin failure made OP1–OP3 disagree.

## Code-reading concerns (not reproduced)

- `contribution.MIN_INDEPENDENT_ORIGINS` and `teamState.MIN_ORIGINS` remain separate constants with the same value. This predates PR #84. Combining them safely would broaden this narrow pass across contribution and disclosure semantics, so it remains documented debt.

## Fixed

- `_createPersonalFocus` is now the sole owner of personal Focus shape, source/address validation, audience application, idempotency, timestamps, Action-loop creation, lastUpdated, audit hook and persistence scheduling. `/api/me/focus`, onboarding/goal/prepared creation, composer `create_focus`, and composer group-discussion promotion call it.
- `_updatePersonalFocus` owns text/target/review-date/audience mutation, update timestamps, lastUpdated, audit hook and persistence. The direct visibility endpoint and composer `update_focus` call it.
- `_recordPersonalFocusOutcome` owns closure, resolved timestamp, `_completeFocusAction`, `_recordNoticeFeedback`, lastUpdated, audit hook and persistence. The direct outcome endpoint and composer outcome confirmation call it.
- `_resolvePersonalFocusAudience` is the one audience owner. It validates group membership/addressability and returns the normalized visibility/participant snapshot. Proposal and confirmation call it independently; confirmation rejects stale snapshots.
- `diagnose.originIdentity`, `currentOriginSignals`, `currentOriginRefs` and `currentOriginCount` now own current origin equivalence. Confidence, personal/team High/Low projections and chart reconstruction use that identity/currentness law.
- `ASSISTANT_RUNTIME.md` now states the accurate invariant: natural-language/model-interpreted consequences use proposal/confirmation; explicit informed controls may call the same canonical domain owner directly.
- `scripts/focus-ownership-parity-smoke.js` adds 15 behavioral/static assertions for direct/composer create, update, outcome, group sharing, source, idempotency, lifecycle, learning, lastUpdated, audience and origin parity.

## Refused / escalated

None. The correction removes duplicate ownership without changing privacy, ontology, epistemic or Forum contribution law.

## Not fixed, and why

- The duplicated origin threshold constants remain as pre-existing debt. Their extraction was not necessary to establish canonical origin identity/counting and was not allowed to delay the high-severity Focus correction.
- Explicit direct controls such as the direct Focus form/outcome selector were not forced through chat. They are unambiguous transports over the canonical capability; doing so would preserve the inaccurate slogan rather than ownership law.

## Mutation map

| Mutation | Assertion that went red |
|---|---|
| Drop target only from composer create | FP1 |
| Remove `_beginFocusAction` from the shared create owner | FP2 and FP10 |
| Disable canonical source validation | FP3 |
| Disable active-text idempotency | FP4 |
| Force composer update to a different audience | FP5 |
| Remove canonical update timestamp/lastUpdated assignment | FP6 |
| Send a different outcome only through composer | FP7 |
| Remove `_recordNoticeFeedback` from canonical outcome | FP8 |
| Break group membership resolution | FP9 |
| Route the direct endpoint through an alias instead of the named shared owner | FP11 |
| Restore the broad all-controls-through-composer claim | FP12 |
| Treat a missing `originRef` as an independent ref | OP1 |
| Replace the High/Low origin owner with a local count | OP2 |
| Count dissent as chart support | OP3 |
| Restore the pre-consolidation scope inventory count | W4 |

Every new assertion was mutated independently. The harness captured stdout and stderr and required the named assertion to print `FAIL`; a generic crash was not counted.

## Touched another lane

- `ASSISTANT_RUNTIME.md`: narrowed the product claim as explicitly required.
- `ai/team-state.js`: projection ownership had to converge on the kernel origin helper.
- `scripts/test.js`: registers the focused parity suite.

## What I could not verify

- No live provider credential was available; this pass changes deterministic capability ownership, not interpretation, and model-off plus normalized proposal paths were exercised.
- I did not exercise Render or mutate production data.

Focused dependent suites: `focus-creation-smoke.js`, `focus-continuity-smoke.js`, `focus-reach-smoke.js`, `focus-action-owner-smoke.js`, `composer-actions-smoke.js`, `team-state-smoke.js`, `highs-lows-smoke.js`, `self-high-low-smoke.js`, `chart-governance-smoke.js`, `origin-correction-smoke.js`, `origin-independence-smoke.js`, `material-reach-http-smoke.js`, `private-evidence-smoke.js`, `forum-smoke.js`, `shelf-http-smoke.js`, `scope-parity-smoke.js`, and `asset-version-smoke.js`.

FOCUS OWNERSHIP:
PASS

CONTROL-SURFACE CLAIM:
ACCURATELY NARROWED

CANONICAL OWNERSHIP:
PASS
