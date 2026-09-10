# Review round 2 — Codex

**Read:** main @ 5683df3de63d8daa54d345ab39fa262db1908d2e; PR #84 original head @ 5e71281c1d02631a29044e10ae3789c94a830057; corrected code head @ 6715fe6a7e07c2f6e6148175c5446f5afaf4ca79 on `codex/review-r1`
**Lane:** Kernel + whether composer, Inquiry, Focus, Forum, Library, Material, graph, High/Low, self and leader surfaces tell the same governed truth.
**Ran:** `git push --dry-run origin HEAD:codex/review-r1`; `node scripts/composer-actions-smoke.js` repeatedly during reproduction and mutations; `node scripts/material-reach-http-smoke.js`; the dependent truth-suite loop listed below; `node scripts/asset-version-smoke.js`; `npm test` twice (first red only on the required asset stamp, final green); `git diff --check`.

Dependent truth-suite loop: `assistant-runtime-smoke.js`, `assistant-chat-http-smoke.js`, `conversation-smoke.js`, `conversation-http-smoke.js`, `focus-creation-smoke.js`, `focus-continuity-smoke.js`, `focus-reach-smoke.js`, `focus-shape-smoke.js`, `inquiry-smoke.js`, `inquiry-http-smoke.js`, `authority-truth-smoke.js`, `forum-smoke.js`, `forum-reach-smoke.js`, `forum-anonymity-smoke.js`, `material-smoke.js`, `material-reach-http-smoke.js`, `library-http-smoke.js`, `privacy-smoke.js`, `privacy-inference-smoke.js`, `private-evidence-smoke.js`, `group-subject-smoke.js`, `origin-correction-smoke.js`, `origin-independence-smoke.js`, `lifecycle-smoke.js`, `stance-continuity-smoke.js`, `chart-governance-smoke.js`, `team-state-smoke.js`, `highs-lows-smoke.js`, `self-high-low-smoke.js`, `seed-alma-smoke.js`, `scope-parity-smoke.js`, `cross-org-isolation-http-smoke.js`, `tenant-authority-smoke.js`, and `provider-boundary-smoke.js`.

## Scope actually covered

- `ai/composer-actions.js`: action allow-list, normalized model output, grounding classifications, audience/material resolution, hostile consequential fields and model-off behavior.
- `server.js`: assistant context binding; proposal construction; confirmation storage and execution; Focus, Inquiry, Forum, Library and Material branches; canonical disagreement evidence; Material reader authorization; graph construction and governance.
- `ai/composer.js`, `ai/material.js`: deterministic external/internal provenance passed to model-facing prose.
- `js/app.js`: exact consequential payload rendered before confirmation.
- `ai/diagnose.js`, `ai/team-state.js`, `ai/chart.js` and their dependent suites: origin counting, contradiction, confidence, thresholds, correction/supersession and High/Low projections.
- Alma player and coach projections through `seed-alma-smoke.js`, `team-state-smoke.js`, `highs-lows-smoke.js`, `self-high-low-smoke.js`, scope/tenant suites, and the composer HTTP fixture built from the Alma store.
- `scripts/composer-actions-smoke.js`: every new runtime assertion, including previously conditional or source-only claims.
- `index.html` and `scripts/.asset-version.lock`: delivery of the corrected confirmation renderer to browsers.

I did not inspect unrelated administration, billing, connector or assessment UX except where `npm test` exercised it. I did not alter production or the Alma seed.

## Reproduced failures

- **P0 Material authorization:** the PR #84 confirmation branch looked up `materialId` directly after authorizing only the target object. A second member could propose and confirm another member's private Material by ID. The new CA14c adversarial case was red until confirmation used `_materialFor`; cross-organisation and revoked-between-proposal-and-confirm cases are now CA14d and CA15c2c.
- **P0 private conversation to shared object:** the original two-turn flow repeated the private-capture packet and could accept model-supplied group/text without disclosing the exact consequence. The behavioral flow now produces no proposal for ambiguous “the team”; a uniquely named governed audience produces a proposal showing exact wording, audience and private exclusions, and only confirmation creates the Focus/Forum.
- **P0 settlement:** PR #84 directly wrote `status = 'settled'` and `resolution = ...` in its composer dispatcher. Against an Inquiry with active self dissent, the surface claimed resolution while the canonical record remained contested. CA12d now checks the whole relevant Inquiry state, not response prose.
- **P0 context/replay:** `opts.about` could retarget a conversation already bound by `conversation.about`; confirmation also accepted replacement overrides. CA7b, CA15d, CA15e and CA15f now execute accessible-A/accessibile-B, changed-object, override and replay attacks.
- **P0 model-authored consequences:** `normalize()` retained model-authored target, review date, visibility, participants and outcome without deterministic grounding. Hostile CA3b reproduced those hidden values entering a Focus proposal.
- **P0 disagreement:** the composer constructed `self:<user>#<proposal>` as an evidence ref without first creating that evidence. CA12c reproduced a dangling ref; CA12c2 reproduced the same-origin/correction consequence.
- **P1 graph:** dissent was plotted on the same rising origin line as support, chart basis was derived from refs already in the chart, and active-only filtering erased correction transitions. CA17a–CA17c now exercise the governed record, tampered ref and correction history.
- **P1 external provenance:** composer-created external Material had no durable provenance consumed by the prose path, allowing organisation-authored wording. CA14b was red until external/private provenance survived storage, retrieval and composition.
- **Delivery:** the first full `npm test` was red at AV5 after `js/app.js` changed without a new shared asset stamp. `20260907e` and fingerprint `8309dd333baa` close the stale-browser path.

## Code-reading concerns (not reproduced)

None left open in the corrected paths. The graph's independent basis is the canonical Inquiry signal record rather than chart-provided refs; composer-created disagreement signals additionally resolve to canonical evidence envelopes. Alma's older seeded Inquiry signals are canonical seed records but do not all have evidence-log envelopes, so this pass did not invent a migration or a second provenance ontology.

## Fixed

- Material attach/read/context/chart paths now use the canonical reader gate; private, cross-tenant, nonexistent and revoked access fail closed with the same 404 shape. Attachment remains a reference and has no epistemic effect.
- Composer uploads are owner-private external Material. Equal bytes do not reuse another person's private row. Existing lawful object-scoped document reuse remains intact (`material-reach-http-smoke: 87/0`).
- A bound conversation cannot be silently retargeted by page context. Mismatch asks for a lawful context switch instead of proposing an action.
- Proposal state is stored under actor + organisation, binds conversation/object/action/frozen arguments/resolved Material and participant snapshot, hashes relevant object state, rejects client overrides, rejects changed object/audience/access, and executes at most once.
- Consequential model fields are classified as user-stated, deterministically resolved or model-suggested. Unsupported target/date/outcome/visibility/group/participants/Material fields are stripped or cause clarification; suggested wording is disclosed exactly.
- Shared Focus/Forum proposals disclose exact wording, exact audience and that private conversation/other attachments remain private. Ambiguous groups ask. Forum opening creates no evidence or corroboration.
- Empirical Inquiry settlement through the composer now refuses rather than inventing truth. Existing operational arrangement owner adjudication remains on its canonical boundary and `authority-truth-smoke.js` remains 34/0.
- Disagreement creates private canonical evidence first, then applies its real ref. Changed wording supersedes the prior same-origin account; history remains and active origin count remains one.
- Firming charts exclude dissent from supporting-origin rise, count each origin once, use the kernel threshold, reject refs outside an independently built record basis, and show correction transitions without adding support.
- External source prose explicitly says it is outside reading, may be relevant, and is not evidence that the claim is happening here.
- Confirmation cards render the exact consequential payload, and the shared asset stamp ensures the corrected renderer reaches the browser.
- `scripts/composer-actions-smoke.js` increased from PR #84's 23 assertions to 41 behavioral assertions; the formerly conditional context test is now forced to run.

## Refused / escalated

None. No ontology, privacy or epistemic law needed to change. The correction applies the laws already present in the repository.

## Not fixed, and why

- No fuzzy/semantic duplicate-Focus detector was added. The canonical dispatcher already deduplicates exact active Focus wording. Treating paraphrases as identical would require model or similarity output to decide identity and is not an ordinary safe correction under the declared-direction/evidence laws.
- No composer-specific operational settlement path was invented. Personal Inquiries are empirical; operational arrangements continue to use the existing active-question owner adjudication boundary.

## Mutation map

| Mutation | Assertion that went red |
|---|---|
| Disable bound/page context mismatch | CA7b |
| Disable private Material owner guard | CA15c2b |
| Accept confirmation overrides | CA15e |
| Disable group membership snapshot comparison | CA15c3 |
| Disable object revision hash comparison | CA15d |
| Restore synthetic disagreement ref | CA12c and CA12c2 |
| Change empirical-settlement refusal from 409 to success | CA12d |
| Retain model target/date without user grounding | CA3b |
| Include dissent in firming history | CA17a |
| Drop superseded correction history before chart construction | CA17c |
| Store composer upload as internal provenance | CA14b |
| Change `js/app.js` without changing shared asset stamp | AV5 |

One attempted mutation replaced canonical Material lookup with an unsafe direct lookup. Its nonexistent cross-tenant fixture threw/hung before an assertion, so it is deliberately not counted as mutation proof; the owner guard mutation above produced a clean named red assertion.

## Touched another lane

- `js/app.js`: required to show exact shared wording, audience, Material and private exclusions before confirmation.
- `index.html`, `scripts/.asset-version.lock`: required by the repository's browser-delivery law after changing `js/app.js`.
- `ai/composer.js`: wording fix required so external Material cannot be presented as organisation-authored knowledge.

## What I could not verify

- The current environment has `playwright-core` but not the Chromium binary expected by `scripts/mobile-inspect.js`; I did not rerun PR #84's prior 390x844 browser flow. The existing PR browser evidence remains untouched, but this report does not claim fresh browser verification.
- No live model-provider credential was available. Deterministic model-off behavior, hostile normalized model output and real HTTP execution were verified; live-provider interpretation quality was not.
- I did not exercise the deployed Render instance or mutate production data.
- GitHub Truth Layer run 760 completed successfully on report head `72052d79c76e81b0e0f93e567a358227853594f9`.

Completion checklist:

- [x] Material authorization independent and fail-closed
- [x] No private conversation leakage through shared Focus/Forum
- [x] Exact shared text + exact audience shown before visibility expands
- [x] Settlement goes through canonical lawful boundary
- [x] Contested empirical truth not falsely flattened
- [x] Conversation context cannot silently retarget
- [x] Confirmation bound to frozen server payload
- [x] Stale confirmation invalidated
- [x] Model cannot hide invented consequential arguments
- [x] No invented target/date/outcome/visibility/audience
- [x] Disagreement evidence ref resolves canonically
- [x] Same-origin repetition not corroboration
- [x] Graph basis independently resolved
- [x] Dissent not shown as support
- [x] Corrections preserve truthful history
- [x] External Material remains external/non-evidence
- [x] Alma demo remains honest
- [x] New/relied-upon assertions mutation-tested
- [x] Narrow suites green
- [x] `npm test` green
- [x] Branch pushed
- [x] CI green if available
