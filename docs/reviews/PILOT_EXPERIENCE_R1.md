# Pilot experience — Codex round 1

**Read:** PR #84 accepted head `6210974351ff5655752fa29f7e978edf2d21eb4a`
**Lane:** `codex/pilot-experience-r1`
**Ran:** focused chart, composer, material, asset, ownership, Forum, Library and full truth-layer suites listed below.

## Scope actually covered

This was a narrow experience pass over `ai/chart.js`, the object-thread and source rendering in
`js/app.js`, the assistant source/context and Forum dispatch paths in `server.js`, and their
existing smoke suites. I traced the pilot doors for Inquiry, High, Low and Focus through object
thread, composer proposal, confirmation, Forum, Library shelf and material reads. I did not
redesign Home, alter ontology or policy, build voice/autonomy/document synthesis, retire the
legacy Library, or modify Claude's pilot-closure branch.

`docs/reviews/PILOT_CLOSURE_AUDIT.md` was not present at the accepted PR head, so I read its
repository version at `b04460a`. `docs/reviews/PILOT_CLOSURE_FIXES_R1.md` was not present in any
local or fetched repository commit and therefore could not be read.

## Reproduced failures

### External sources were not usable citations

**Reproduced by HTTP/renderer-path inspection and mutation.** Web results entered `_sourceList`
with a URL, but that field was discarded and the source drawer rendered only text. A pilot user
could see that an answer came from the web but could not open the cited source.

### Group High/Low context was not admitted to the composer Forum action

**Reproduced in the real assistant-turn and confirmation HTTP path.** The Forum endpoint and
object-thread door supported governed group objects, but composer context only regarded Inquiry
and Focus as Forum-capable. A group High therefore lost the action before dispatch.

### The firming graph exposed two kernel series at once

**Reproduced in the production renderer.** The chart shipped an origin-count line and the
kernel's evidence-band line together, with labels such as “independent origins”. That was true
but made the pilot graph explain the ontology rather than the evidence.

## Code-reading concerns (not reproduced)

No additional pilot blocker was found in this bounded pass. The old copied-item Library remains
separate pre-existing product debt and was not changed. I did not treat the known mobile
tap-target inventory as a new finding.

## Fixed

- The pilot firming view now plots one line: separate supporting accounts over time. The
  threshold and repetition rule remain derived and visible; dissent, corrections, the governed
  basis and the hidden evidence-band series remain in the server chart contract.
- Web citations now retain only validated HTTP(S) URLs and render an explicit external-source
  link. Unsafe schemes are discarded. Internal source chips continue to use the reader-scoped
  governed basis and do not gain raw private source content.
- Inquiry, High, Low and Focus contexts now use the same governed Forum proposal where a real
  group node or multi-participant Focus exists. Confirmation re-resolves the live object and
  audience; no visibility expansion or contribution is implicit.
- The shared browser asset stamp was advanced so the changed renderer cannot be hidden by a
  stale mobile cache.

## Graph classification

| Graph | Pilot decision | Reason |
|---|---|---|
| Firming | SIMPLIFY | One supporting-account line over time is enough initially; explanation carries threshold, repetition, dissent and correction meaning. |
| Material timeline | KEEP | It plots observation time only and is already privacy/cohort governed. |
| Material spread | KEEP | It answers which authored parts landed, with honest zeroes, cohort floor and no identities or scores. |
| Additional ontology/R&D charts | REMOVE FROM PILOT / R&D | None were added. A chart without one immediate user question should not enter the pilot. |

## Control classification

| Control | Classification | Result |
|---|---|---|
| Ask IntelliQ / contextual material questions | COMPOSER-PRIMARY | Natural language remains the primary contextual control. |
| Work on this / discuss with group | COMPOSER-PRIMARY | They enter governed proposal and confirmation because wording or audience is consequential. |
| Keep / settle / disagree | KEEP | These are discoverable object actions and already converge on governed capability boundaries. |
| Not now / More options | SECONDARY | Useful escape/progressive disclosure, not a competing workflow. |
| Duplicate generic Focus packet | REMOVE | Already removed in PR #84; no replacement packet was added. |

## End-to-end pilot flow audit

- **Inquiry:** object opens with governed basis; composer, Keep, Work on this, settle,
  disagreement and lawful Forum actions are reachable.
- **High/Low:** object opens with its evidence basis; composer, Keep, Work on this,
  disagreement and lawful group Forum actions are reachable.
- **Focus:** object opens live; contextual composer, Library reference, material, lawful Forum
  and outcome paths retain their canonical owners.
- **Material:** reader-authorised material enters composer context, external provenance stays
  visibly external, and it does not become internal evidence.
- **Library:** Keep resolves a live reference; filing grants no access and no copy is made.
- **Forum:** opening a room writes speech only. Deliberate contribution remains a separate
  governed action.

## Mutation map

| Mutation | Assertion that went red |
|---|---|
| Restored both firming series to the production renderer | `CA17` |
| Removed URL retention from `_sourceList` | `CA17d` |
| Removed `high` from composer Forum-capable object kinds | `CA15a3` |

All three mutations exited non-zero with the named `FAIL` line; production files were restored
before the final runs.

## Touched another lane

None. The changes are confined to this requested pilot-experience branch. `server.js` and
`js/app.js` are shared files, but only the source projection, object context, Forum confirmation
resolution and pilot renderer were changed.

## Verification

- `node scripts/chart-governance-smoke.js` — 34 passed, 0 failed.
- `node scripts/composer-actions-smoke.js` — 45 passed, 0 failed.
- `node scripts/material-reach-http-smoke.js` — 87 passed, 0 failed.
- `node scripts/asset-version-smoke.js` — 5 passed, 0 failed.
- `npm test` — GREEN after the asset stamp correction.

## What I could not verify

No Chromium/Chrome executable exists in this environment, so I could not perform or capture a
real-device 390×844 browser pass. The production Render instance was not mutated. Live-provider
wording quality was not exercised without provider credentials; the deterministic model-facing,
HTTP, authority, persistence and renderer contracts were exercised instead.

GRAPHS: PASS

INTERNAL CITATIONS: PASS

EXTERNAL CITATIONS: PASS

FORUM AVAILABILITY: PASS

INQUIRY FLOW: PASS

HIGH/LOW FLOW: PASS

FOCUS FLOW: PASS

COMPOSER EXPERIENCE: PASS

npm test: GREEN

PILOT EXPERIENCE BLOCKERS REMAINING: 0
