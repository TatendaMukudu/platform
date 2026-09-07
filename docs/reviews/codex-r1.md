# Review round 1 — Codex

**Read:** main @ 5683df3de63d8daa54d345ab39fa262db1908d2e
**Lane:** Boundary and substrate, extended at the founder's request to the composer, Focus, Inquiry, Library, material, Forum, graph, and mobile call paths.
**Ran:** `git push --dry-run origin HEAD:refs/heads/codex/connectivity-check`; `node scripts/composer-actions-smoke.js`; `node scripts/assistant-runtime-smoke.js`; `node scripts/assistant-interface-smoke.js`; `node scripts/object-conversation-screen-http-smoke.js`; `node scripts/focus-creation-smoke.js`; `node scripts/focus-continuity-smoke.js`; `node scripts/shelf-http-smoke.js`; `node scripts/material-reach-http-smoke.js`; `node scripts/forum-reach-smoke.js`; `node scripts/chart-governance-smoke.js`; `node scripts/scope-parity-smoke.js`; `node scripts/message-history-smoke.js`; `node scripts/asset-version-smoke.js`; `node scripts/mobile-inspect.js --check`; `npm test`.

## Scope actually covered

I traced the main assistant turn, object conversation, proposal confirmation, Focus lifecycle,
Inquiry state, shelf/reference, material, Forum, governed graph, and relevant client rendering
paths in `server.js`, `js/app.js`, `ai/gateway.js`, `ai/chart.js`, `ai/forum.js`,
`ai/contribution.js`, `ai/diagnose.js`, `ai/focus.js`, `ai/inquiry.js`, `ai/material.js`,
`ai/shelf.js`, the related smoke suites, and the architecture documents named in the task.
I also inspected recent commits touching those paths. I did not audit unrelated administration,
billing, connectors, or organisation setup routes beyond the protection supplied by the full
truth layer.

## Reproduced failures

- **Reproduced:** the assistant could repeat the same private-capture paragraph after the user
  rejected private handling because the second turn had no typed semantic action and the
  deterministic fallback concatenated the same proposal copy. Before the fix,
  `node scripts/composer-actions-smoke.js` reported `FAIL CA15 consecutive turns cannot repeat
  the same canned conversational packet`. This prevents a person from moving naturally from a
  private thought to a governed team discussion.
- **Reproduced:** object action buttons bypassed a shared composer-action boundary.
  `node scripts/composer-actions-smoke.js` initially reported `FAIL CA16 object buttons are
  shortcuts into the assistant action path`. This made Focus, Inquiry, Forum, and Library
  operations separate packet/form workflows.

## Code-reading concerns (not reproduced)

- The legacy `/api/library/from-chat` snapshot path and legacy shared Library note flag remain
  the already-recorded founder decisions in the protocol; this change does not extend them.
- The central dispatcher is intentionally an allowlist, but each future action still needs an
  endpoint-level authority mutation and a biting test. Schema registration alone is not a
  capability.

## Fixed

- Added one model-facing, allowlisted action vocabulary and normalized proposal boundary in
  `ai/composer-actions.js`; CA1–CA3 bite when semantic normalization, context availability, or
  non-invention guidance is removed.
- Added explicit surface/object context and a central deterministic dispatcher in `server.js`;
  CA4–CA12d prove proposal-before-mutation, live Library references, Focus lifecycle updates,
  disagreement, and owner settlement.
- Routed material uploads through composer context without promoting external material to
  internal evidence; CA13–CA14 bite if the endpoint or epistemic effect is changed.
- Prevented duplicate deterministic conversational packets and routed a rejected private path
  toward a confirmed, permission-bounded group discussion; CA15–CA15b bite when either guard
  is removed.
- Routed object buttons through the same typed assistant path, explained the governed graph,
  and compacted the phone composer; CA16–CA18 bite when those production lines are reverted.

## Refused / escalated

- I did not retire the legacy Library snapshot route or define shared-folder semantics. Both
  alter already-escalated storage/access semantics and require the founder's decision.

## Not fixed, and why

- No additional product-wide mobile redesign was attempted; the task explicitly bounded the
  work to the composer/action workflows.
- Natural-language interpretation was not replaced with regex fallbacks when the model is off.
  That is deliberate fail-safe behaviour, not an omitted convenience.

## Mutation map

| Mutation | Assertion that went red |
|---|---|
| Remove semantic `discuss_with_group` normalization | CA1 |
| Permit `settle_inquiry` outside Inquiry context | CA2 |
| Remove the prompt's non-invention rule | CA3 |
| Drop `requestedAction` at the HTTP boundary | CA4 |
| Mutate shelf or Focus state while merely proposing | CA5 / CA10 |
| Disable Keep, folder, live lookup, or shelf deduplication | CA6–CA9 |
| Disable Focus create/update or invent a target | CA11–CA12b |
| Remove dissent origin/state or change settlement outcome | CA12c / CA12d |
| Break attachment routing or give material an epistemic effect | CA13 / CA14 |
| Remove duplicate-response or governed-group dispatch guards | CA15 / CA15b |
| Restore legacy object-button handlers | CA16, FC20, OC4, SX11b |
| Remove graph explanation or enlarge the mobile composer | CA17 / CA18 |
| Restore the previous scope-inventory count | W4 inventory |

The mutation harness treated either a printed `FAIL` or a non-zero process exit as red and
captured both stdout and stderr.

## Touched another lane

I changed `js/app.js`, `css/member.css`, `css/styles.css`, and `index.html` because the founder
explicitly required button convergence, graph legibility, and mobile composer cleanup. I also
updated Focus, object-conversation, shelf, scope, and asset smoke suites so they assert the new
production call sites rather than legacy definitions.

## What I could not verify

- Chromium could not be installed: Playwright downloads were rejected with HTTP 403 and the
  available Ubuntu package is only a Snap launcher. `node scripts/mobile-inspect.js --check`
  therefore reported that `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` does not exist.
  I could not honestly complete a browser/device screenshot pass.
- No model provider credentials were available. Model-off behaviour and the actual HTTP,
  dispatcher, persistence, and normalized-model-output paths were exercised, but not a live
  provider's interpretation quality.
- I did not test the deployed Render instance or alter production/demo data.
