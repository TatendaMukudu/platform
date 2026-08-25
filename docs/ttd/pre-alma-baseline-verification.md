# Pre-Alma baseline verification

**Status:** CURRENT verification record.  
**Verification date:** 2026-08-25.  
**Production changes made:** none.  
**Starting checkout:** local `work` at `a777cdacdd9231b8ae18a392331c02d2f21a5e11`.  
**Authoritative integration branch inspected:** `claude/platform-work-summary-nmb0cm` at
`37f6ed01d75a52cbf63d73d9526a52c17cbbe6f3`.

This report supersedes historical pass/fail counts where they conflict with the commands recorded
below. It does not supersede the architectural laws or implementation packets indexed by
`docs/INDEX.md`.

---

## 1. EXECUTIVE VERDICT

# PRE-ALMA BASELINE NOT READY

The durable evidence, shutdown, CAS, correction/contest, privacy, action/outcome, and deterministic
kernel substrates are substantial and independently green. The baseline is nevertheless not ready:

1. the authoritative integration branch does not contain the correct P0-D implementation from PR
   #73, and its focused P0-D smoke is RED (`0 passed, 14 failed`);
2. PR #74 is both Git-conflicted against the current integration branch and functionally
   unapproved under the newer adversarial review: the two-sided privacy floor, origin independence,
   derived confidence, derived/allow-listed Web perspective, and a real no-LLM proof remain open;
3. the person model can establish a durable characterisation from three observations on one day;
4. person erasure does not invalidate the two-hour roster cache;
5. live PostgreSQL stale-delete proof could not be executed because this environment has neither
   `DATABASE_URL` nor PostgreSQL client/server binaries; and
6. repository code prevents silent stale overwrite but does not close Render deploy overlap. An old
   instance's already-accepted late mutation can lose the CAS race and be refused loudly, requiring
   operator recovery.

No Alma-specific feature should be started before the six current blocker packets are complete,
P0-D is integrated, the combined stack is green, and the two operational verifications are run.

---

## 2. REPOSITORY STATE

### 2.1 Exact refs

| Ref | SHA / state |
|---|---|
| Initial current branch | local `work` |
| Initial HEAD | `a777cdacdd9231b8ae18a392331c02d2f21a5e11` |
| Initial working tree | clean |
| `origin/main` | `73f22632b02b95176772affef1943fa78abbc38b` |
| development/integration | `origin/claude/platform-work-summary-nmb0cm` = `37f6ed01d75a52cbf63d73d9526a52c17cbbe6f3` |
| report branch | `codex/pre-alma-baseline-verification`, created directly from the integration SHA |

The local starting commit `a777cda` is a consolidated candidate that is not the remote integration
head. It was useful for a combined focused matrix, but it is not an acceptable substitute for PR
ancestry or integration state.

### 2.2 P0 lineage

The integration branch contains the authoritative linear durability lineage:

`dc2279b` (P0-1 contract) → `e345f8f` (P0-1 implementation) → `6be7689` (P0-2) →
`04a4333` (P0-3 corrected CAS) → later architecture/adjudication documents → `37f6ed0`.

`git merge-base --is-ancestor` returned success for both `6be7689` and `04a4333` against the
integration branch.

### 2.3 PR state and ancestry

| PR | Head | Base | Merge base with current base | GitHub state | Finding |
|---|---|---|---|---|---|
| #73, P0-D | `932a0c333960e4bfc4256c7f9a8613acbb64ea10` | `claude/platform-work-summary-nmb0cm` | `942af20034d708a129011440862ab251a34ffdc8` | OPEN, MERGEABLE/CLEAN, no reported checks | Correct implementation, stale base; must be rebased and integrated |
| #74, Web/W-2 | `1c02dc9fbe7c927cb8d51aeb9a13db5e9c3b37d9` | `claude/platform-work-summary-nmb0cm` | `981cae7ed484a65fc790ac2fcd2cc801deb1e184` | OPEN, CONFLICTING/DIRTY, no reported checks | Stale base + documentation conflict + actual correction packets outstanding |

PR #74's Git conflict is presently the reserved §19 block in
`docs/ttd/web-semantics-and-continuous-intelligence.md`; production hunks merge mechanically in a
three-way preview. Resolving that documentation conflict alone would **not** make #74 correct.

### 2.4 Documentation precedence contradictions

The current `docs/INDEX.md` correctly names six blockers and calls PR #74 uncorrected. Its statement
that P0-D is “implemented/landed” describes the implementation artifact but conflicts with GitHub
integration truth: PR #73 is still open, and the integration branch's focused authority smoke is
RED. For release planning, Git ancestry and executable behavior win.

Historical `docs/briefs/p0-pilot-blockers.md`, `docs/ttd/pilot-readiness-review.md`, and their old
RED counts are superseded for blocker classification by `docs/INDEX.md` and
`docs/ttd/pilot-blocker-challenge-and-packets.md`.

---

## 3. VERIFIED CLOSED WORK

| Area | Classification | Evidence |
|---|---|---|
| P0-1 hot/cold evidence durability | **CLOSED**, with follow-up debt | `db.js` cold evidence boundary; `server.js` archive-before-removal; `evidence-durability-smoke` 25/0 and boundaries 8/0 |
| P0-2 graceful shutdown | **CLOSED in code** | `server.js` SIGTERM/SIGINT → listener drain → evidence maintenance → fail-loud flush; shutdown suites 7/0 + 7/0 |
| P0-3 object and durable concurrency | **IMPLEMENTED — LIVE VERIFICATION REMAINS** | tree `ifRev`, tenant serialization, SQL CAS write/delete, readiness; write conflict 21/0, DB CAS 21/0, delete boundary 7/0 |
| Durable persistence/restart | **CLOSED in DB-free truth layer** | persistence 28/0 and persistence durability 61/0 |
| Correction history and contest | **CLOSED at evidence/belief layer** | lifecycle 19/0, origin-correction 51/0, contest 27/0, contest HTTP 11/0 |
| Private evidence exclusion | **CLOSED for tested production boundaries** | privacy 18/0 and private evidence 18/0 |
| Independent-origin rule in canonical evidence/inquiry | **CLOSED at contribution/inquiry boundary** | origin-correction 51/0, forum 69/0; Web accumulator remains open (B3) |
| Organizational action/outcome learning | **CLOSED for current intervention path** | endpoint 217/0 plus outcome-ranking/outcome-intelligence suites in canonical truth layer |
| P0-D implementation artifact | **APPROVED, NOT INTEGRATED** | PR #73 focused matrix and full truth layer green |

---

## 4. REMAINING PILOT BLOCKERS

The six-item set below is the current ratified blocker set in
`docs/ttd/pilot-blocker-challenge-and-packets.md`. P0-D integration and operational proofs are listed
as release gates because they are integration/verification actions, not seventh/eighth production
features.

### B1 — real no-LLM production proof

- **Severity:** blocker (verification dependency).
- **Production behavior:** deterministic substrate exists, but the current eight-assertion suite
  proves only the High/Low HTTP slice and zero model calls. Six assertions are fixture readback,
  compare unrelated endpoints, or are vacuously true without keys.
- **Reproduction:** inspect/run `scripts/no-llm-harness-smoke.js`; it reports 8/0 even when the
  Inquiry/Focus/provenance assertions do not traverse a production mutation/read boundary.
- **Files/tests:** `ai/gateway.js`, `scripts/no-llm-harness-smoke.js`; replacement contract
  `docs/briefs/no-llm-capability-matrix.md`, Packet 1.
- **Contract:** ratified.
- **Scope:** **MEDIUM** (20 mutation-tested assertions; production change only if RED exposes one).

### B2 — two-sided Web cohort privacy floor

- **Severity:** privacy blocker.
- **Production behavior:** `_webIntelligence` checks only `k >= 2`. When `k == n`, or when
  `n-k < MIN_COHORT`, the aggregate identifies the affected people by elimination; rollup counts
  compound the disclosure.
- **Reproduction:** two visible members, both declining, produces a Web Low even though the
  complement is zero.
- **Files/tests:** `server.js` briefing/Web accumulator; missing `privacy-inference-smoke.js`;
  `docs/ttd/privacy-inference-attacks.md`, Packet 2.
- **Contract:** ratified.
- **Scope:** **SMALL**.

### B3 — Web counts people rather than independent origins and asserts confidence

- **Severity:** epistemic blocker.
- **Production behavior:** `patternCounts[f.type]++` counts member findings. Retellings of one origin
  can surface an aggregate. `_webIntelligence` hardcodes `confidence:'emerging'` and severity rather
  than deriving them from constituents.
- **Reproduction:** several people/one `originRef` can clear the Web floor; the existing W-1 suite
  does not carry origin provenance through the accumulator.
- **Files/tests:** `server.js` briefing accumulator, `ai/contribution.js::shouldOpenGroupInquiry`,
  `scripts/web-intelligence-smoke.js`; Packet 3.
- **Contract:** ratified.
- **Scope:** **MEDIUM**.

### B4 — Web perspective is caller-selected and projection is not allow-listed

- **Severity:** privacy blocker.
- **Production behavior:** `toInsight` trusts `opts.perspective`; `audienceSafe` rejects only
  `subjectId`. Other identity vectors (`authorId`, `assigneeRef`, and future fields) can pass.
- **Reproduction:** construct a Web item carrying an unnamed identity field; the current guard
  returns safe.
- **Files/tests:** `ai/proactive.js`, `scripts/proactive-smoke.js`; Packet 4.
- **Contract:** ratified.
- **Scope:** **SMALL**.

### B5 — person-model burstiness

- **Severity:** safety/correctness blocker for a voluntary pilot involving young adults.
- **Production behavior:** `ai/person-model.js` uses `FLOOR = 3` observations, not distinct days;
  three observations in one day can establish a durable characterisation with no temporal dormancy
  equivalent to `ai/self-model.js::STALE`.
- **Reproduction:** the ratified temporal contract's PM-1 mutation; no
  `person-model-temporal-smoke.js` exists yet.
- **Files/tests:** `ai/person-model.js`, `ai/self-model.js`, existing `person-model-smoke.js` 18/0;
  `docs/briefs/person-model-temporal-contract.md`, Packet 5.
- **Contract:** ratified.
- **Scope:** **MEDIUM**.

### B6 — erasure leaves cached identity

- **Severity:** privacy/erasure blocker.
- **Production behavior:** `_removePerson` erases stores but does not invalidate `rosterCache`, whose
  entries include id/name/role for up to `BRIEFING_TTL` (two hours).
- **Reproduction:** populate roster, erase a person, read roster without refresh; cached name remains.
- **Files/tests:** `server.js::_removePerson`, `rosterCache`; missing
  `graph-invalidation-smoke.js`; `docs/briefs/web-final-contract.md`, Packet 6.
- **Contract:** ratified.
- **Scope:** **SMALL**.

### Release gates, not new feature packets

1. **Integrate PR #73 on the current development base** and run the combined truth layer.
2. **Live PostgreSQL CAS + stale-delete proof** against the exact integrated `db.js`.
3. **Render drain/deploy-overlap rehearsal/configuration verification** with logs and an accepted
   mutation during the overlap window.

---

## 5. PR #73 VERDICT — P0-D

# P0-D: APPROVE

Verified directly at `932a0c3`:

- exact and token-derived empirical identities take precedence over responsibility provenance;
- curated operational claims remain operational and owner authority remains meaningful;
- unknown claims fail closed to empirical unless genuine active org-context arrangement provenance
  exists;
- empirical answers remain non-authoritative and require corroboration regardless of role;
- open personal reflection may complete but remains `shared_but_unverified`;
- correction, contest, supersession, privacy, and org-state satisfaction behavior remain intact.

Focused results at the PR head: authority 34/0; inquiry 51/0; conversation 39/0; org-state 34/0;
readiness 19/0; contest 27/0; origin-correction 51/0; privacy 18/0; private-evidence 18/0.
Production-boundary dependants also passed: org-context HTTP 18/0, readiness HTTP 21/0,
conversation HTTP 22/0, Inquiry HTTP 6/0, and epistemic invariants 16/0. `npm test` was GREEN.

**Integration action:** rebase/cherry-pick the three P0-D commits onto current development, resolve
only genuine drift, and run the combined matrix. Do not interpret the PR's clean GitHub merge status
as proof that its stale base plus current development is behaviorally green.

---

## 6. PR #74 VERDICT — WEB INTELLIGENCE

# PR #74: CORRECTIONS REQUIRED

### What is correct

The branch removes roster `topLabel`/behavioral status, emits cohort-shaped Web High/Low artifacts,
strips `subjectId` when `perspective:'web'`, gates leader endpoints, excludes private canonical mood,
and performs no model call in the tested High/Low HTTP path. At its own head: Web 7/0, no-LLM 8/0,
privacy 18/0, private evidence 18/0, org graph 18/0, proactive 78/0, and full `npm test` GREEN.

### Why it is not approved or mergeable

- **A — actual defects:** B1-B4 above. The newer adversarial documents explicitly supersede the
  original self-reported W-1/W-2 acceptance. In particular, `k>=2` is not a two-sided privacy floor,
  people are not origins, confidence/severity are asserted, `perspective` is caller-selected, and
  `audienceSafe` is a deny-list of one identity field.
- **B/C — topology/stale base:** head merge-base is `981cae7`, while development is `37f6ed0`.
- **E — GitHub state:** OPEN, `CONFLICTING`/`DIRTY`, with no reported checks.
- **Conflict:** the actual three-way textual conflict is the intentionally reserved §19
  documentation block. It is mechanical, but resolving it does not resolve A.
- **D — unresolved P0 dependency:** none. P0-5/P0-6 are not required to correct #74.

**Required integration action:** execute Packets 1→2→3→4 serially on the PR branch, rebase onto
current development, preserve the later §20+ adjudications while filling reserved §19, rerun the
adversarial and full suites, then re-review. Do not merge the current head.

---

## 7. P0-3 LIVE DATABASE VERDICT

# LIVE P0-3 PROOF BLOCKED BY ENVIRONMENT

- `DATABASE_URL`: unset.
- `psql`: unavailable.
- local `postgres`: unavailable.
- `node scripts/db-cas-live.js`: executed and **BLOCKED BY ENVIRONMENT** (exit 2):
  `db-cas-live: DATABASE_URL is required`; no mock result is presented as live proof.

The permanent live harness covers create at expected 0, update 1→2, stale update rejection, current
revision deletion, stale positive revision non-resurrection, and expected-zero recreation. The
DB-free SQL/API suites are green. What remains before Alma is a real PostgreSQL run against the exact
integrated commit **plus an overlapping stale-delete case**:

1. readers A and B observe revision N;
2. A updates to N+1;
3. B issues `deleteStores` with expected N;
4. B receives semantic conflict/zero deletion;
5. A's value and revision N+1 remain intact;
6. correct expected N+1 deletion succeeds;
7. record `SELECT version()` and complete output.

---

## 8. RENDER / DEPLOY VERDICT

# CODE HARDENED; OPERATIONAL GUARANTEE UNVERIFIED

### Code guarantee

- SIGTERM and SIGINT converge on `_gracefulShutdown`.
- shutdown refuses new work, closes the listener and waits for accepted requests;
- evidence maintenance completes before final persistence;
- final persistence is CAS-protected and fail-loud; there is no shutdown force overwrite;
- failed authoritative reconstruction marks persistence unavailable and mutating requests return
  503;
- stale writes/deletes cannot overwrite or destroy newer durable rows.

### What code does not guarantee

The adjudicated race remains: if a new instance commits a durable unit before the old instance's
shutdown flush, the old flush conflicts. Its already-accepted late mutation is not silently
written over newer truth, but it is refused and lost from durable state, shutdown exits nonzero,
and an operator must reconcile it. CAS safety is therefore not mutation-preservation.

### Repository configuration finding

`render.yaml` specifies build/start and environment variables only. It carries no repository-owned
proof of request-drain ordering, single-instance handoff, pre-stop sequencing, or deploy rehearsal.
No Render operational test/log artifact was found. External Render documentation could not be
queried from this environment (web tool authorization failure), so no platform behavior is inferred.

### Before Alma

Verify in a staging Render service, with timestamps and logs: when the replacement starts accepting
traffic relative to old-instance SIGTERM; drain duration; whether in-flight HTTP completes; exit-code
handling; rollback/alerting on a fail-loud CAS conflict; and operator recovery of an acknowledged
old-instance mutation. Configure/choose a deployment procedure that drains and flushes the old
instance before the new one may mutate the same units, or explicitly stop deploys during active use.

---

## 9. TEST MATRIX

### 9.1 Canonical truth layers

| Command / checkout | Result |
|---|---|
| `npm test` on local consolidated candidate `a777cda` | **PASSED**, truth layer GREEN; note P0-D and pilot-loop were not registered there |
| `npm test` on PR #73 head `932a0c3` | **PASSED**, truth layer GREEN |
| `npm test` on PR #74 head `1c02dc9` | **PASSED**, truth layer GREEN |
| `npm test` on integration head `37f6ed0` | **PASSED**, truth layer GREEN; does not contain/register PR #73/#74 suites |

A green aggregate does not close unregistered RED. That distinction is the central integration
finding.

### 9.2 Focused matrix on the consolidated candidate

| Command | Result |
|---|---|
| `node scripts/evidence-durability-smoke.js` | PASSED 25/0 |
| `node scripts/evidence-durability-boundaries-smoke.js` | PASSED 8/0 |
| `node scripts/shutdown-durability-smoke.js` | PASSED 7/0 |
| `node scripts/shutdown-boundary-smoke.js` | PASSED 7/0 |
| `node scripts/persistence-smoke.js` | PASSED 28/0 |
| `node scripts/persistence-durability-smoke.js` | PASSED 61/0 |
| `node scripts/write-conflict-smoke.js` | PASSED 21/0 |
| `node scripts/db-cas-smoke.js` | PASSED 21/0 |
| `node scripts/persistence-cas-boundary-smoke.js` | PASSED 9/0 |
| `node scripts/delete-cas-boundary-smoke.js` | PASSED 7/0 |
| `node scripts/tree-mutation-serialization-smoke.js` | PASSED 4/0 |
| `node scripts/authority-truth-smoke.js` | **FAILED 0/14** (correct P0-D branch absent) |
| `node scripts/privacy-smoke.js` | PASSED 18/0 |
| `node scripts/private-evidence-smoke.js` | PASSED 18/0 |
| `node scripts/web-intelligence-smoke.js` | PASSED 7/0, but superseded/adversarially insufficient |
| `node scripts/no-llm-harness-smoke.js` | PASSED 8/0, but six assertions are non-proofs |
| `node scripts/inquiry-smoke.js` | PASSED 51/0 |
| `node scripts/inquiry-http-smoke.js` | PASSED 6/0 |
| `node scripts/conversation-smoke.js` | PASSED 39/0 |
| `node scripts/conversation-http-smoke.js` | PASSED 22/0 |
| `node scripts/forum-smoke.js` | PASSED 69/0 |
| `node scripts/pilot-loop-smoke.js` | **FAILED 28/1**, historical Forum echo-origin case |
| `node scripts/org-state-smoke.js` | PASSED 34/0 |
| `node scripts/org-graph-smoke.js` | PASSED 18/0 |
| `node scripts/readiness-smoke.js` | PASSED 19/0 |
| `node scripts/lifecycle-smoke.js` | PASSED 19/0 |
| `node scripts/origin-correction-smoke.js` | PASSED 51/0 |
| `node scripts/contest-smoke.js` | PASSED 27/0 |
| `node scripts/contest-http-smoke.js` | PASSED 11/0 |
| `node scripts/person-model-smoke.js` | PASSED 18/0, does not cover temporal/bursty law |
| `node scripts/endpoint-smoke.js` | PASSED 217/0 |
| `node scripts/db-cas-live.js` | BLOCKED BY ENVIRONMENT, exit 2: `DATABASE_URL is required` |

The registered frontend suite reported its Chromium self-skip during prior candidate execution;
there is no browser screenshot or visual-regression proof in this verification.

---

## 10. END-TO-END PILOT PATH

| Transition | Verdict | Repository truth |
|---|---|---|
| Player authenticates | **WORKS** | session/token and endpoint HTTP suites |
| Private reflection/check-in | **WORKS** | canonical private evidence; check-in migration/private evidence suites |
| Evidence persists | **WORKS** in DB-free restart proof; live DB verification remains | persistence durability and evidence durability |
| Relevant Self reasoning occurs | **PARTIAL** | private evidence informs personal canonical context, but Self High/Low pipeline is blind to private evidence (T-1) |
| Inquiry may emerge | **PARTIAL** | personal semantic Inquiry requires model; deterministic group Inquiry/candidates exist |
| Server/process restart | **WORKS** in truth layer | reconstructed evidence and Inquiry stores remain coherent |
| Player returns to coherent evidence + Inquiry | **WORKS** in persistence tests | stable stored state; live deployment proof remains |
| Correction/contest | **PARTIAL** | evidence/belief history works; already-emitted `orgSignal` is not retracted (T-2) |
| Coach cannot retrieve private material | **WORKS** at tested boundaries | private evidence and advisor/privacy matrices |
| Safe organizational pattern emerges | **UNSAFE in current PR #74** | detection works; projection fails B2-B4 |
| Intervention/action recorded | **WORKS** | policy/action/intervention HTTP paths |
| Outcome observed | **WORKS** | recorded/measured outcome path |
| Learning persists | **WORKS** for intervention outcome memory | persistence + outcome intelligence; no claim of weekly player recap |

The chain is therefore **PARTIAL**, not pilot-safe end to end. Its critical unsafe transition is the
Web projection, not evidence capture or outcome learning.

---

## 11. CURRENT BLOCKER REGISTER RECONCILIATION

| Item | Classification | Reason |
|---|---|---|
| P0-1 evidence durability | **CLOSED** | hot/cold archive, resolution and erasure green |
| P0-1 cold dedup/correction identity | **NON-BLOCKING DEBT** | fully cold envelopes are outside current hot identity scan |
| P0-1 concurrent cold-envelope mutation | **NON-BLOCKING DEBT** | no dedicated CAS/serialization contract at envelope level |
| P0-1 legacy-main eviction ordering | **NON-BLOCKING DEBT** | recorded migration ordering risk; not reproduced as current pilot blocker |
| P0-2 graceful shutdown | **CLOSED** | code/test boundary green |
| P0-3 concurrency/CAS | **IMPLEMENTED — VERIFICATION REMAINS** | DB-free green; live stale-delete and Render handoff remain |
| P0-D authority/truth | **IMPLEMENTED — INTEGRATION REMAINS** | PR #73 approved; integration branch RED focused test |
| Historical P0-5 Forum echo feeder | **SUPERSEDED as pilot blocker** | old pilot-loop remains 28/1; Forum UI feeder is not pilot-critical |
| P0-5′ object-agnostic cross-turn origin preservation | **NON-BLOCKING DEBT / POST-PILOT CONTRACT** | ratified `p0-5-prime-origin-contract.md`, not implemented |
| P0-6 Inquiry semantic recovery | **OPEN — UNADJUDICATED / RESEARCH** | uniform CAS prevents overwrite; semantic replay/recovery unresolved, currently not pilot-blocking |
| Web intelligence/privacy | **OPEN — CONTRACT EXISTS** | B1-B4, Packets 1-4 |
| Person-model burstiness/decay | **OPEN — CONTRACT EXISTS** | B5/Packet 5; distinct-days blocks, long dormancy is pre-pilot debt |
| Erasure cache invalidation | **OPEN — CONTRACT EXISTS** | B6/Packet 6 |
| Canonical independent-origin/corroboration | **CLOSED** | origin/correction and group inquiry green |
| Web independent-origin aggregation | **OPEN — CONTRACT EXISTS** | B3 |
| Deterministic/no-LLM runtime capability | **IMPLEMENTED — VERIFICATION REMAINS** | capability exists; current proof inadequate |
| Correction propagation into emitted signals (T-2) | **NON-BLOCKING DEBT / PRE-PILOT WATCH** | correction works upstream; stale signal may continue influencing patterns |
| W-3 scope and W-4 parity | **NON-BLOCKING PRE-PILOT WORK** | ratified, deliberately not part of W-1/W-2 |
| Render overlap | **IMPLEMENTED — OPERATIONAL VERIFICATION REMAINS** | fail-loud CAS, not lossless handoff |

---

## 12. NON-BLOCKING DEBT

- T-1 richer Self High/Low from the owner's private evidence: current behavior fails safe but provides
  less Self value.
- T-2 correction propagation from superseded evidence to already-emitted compatibility signals.
- P0-5′ origin identity across model-mediated turns/object boundaries.
- P0-6 Inquiry semantic replay/recovery.
- P0-1 cold deduplication/correction identity, concurrent cold mutation, legacy-main ordering.
- W-3 parent Web rule, graph invalidation beyond erasure, W-4 parity/migration.
- Token-denominated model budget/cost telemetry and gateway-central budget enforcement.
- Accessibility, mobile/browser rehearsal, structured logging, and staging live-model privacy checks.
- Focus/object foreign keys and provenance fields identified in Packets 7-10; none should be bundled
  into the six blockers except the explicitly named conditions.

---

## 13. ALMA FEATURE SUBSTRATE (NO IMPLEMENTATION)

| Discussed capability | State | Existing substrate / missing edge |
|---|---|---|
| Inquiry maturity | **PARTIAL** | durable `inquiryStates`, uncertainties, routing, conversation outcome and HTTP reads exist; maturity UX/semantic recovery do not |
| Self Learn | **PARTIAL** | `userAiProfiles`, person model, memory and inspect/export paths exist; temporal correction and a dedicated Learn UI do not |
| Self-created Focus | **PARTIAL** | owner can approve a prepared suggestion into `mem.focuses`; no direct “I want to work on X” creation path |
| Collaborative Focus | **ABSENT** | Focus has no participant/privacy edge or invitation lifecycle |
| Participation/privacy edges | **PARTIAL** | Web/node scope and private evidence gates exist; Focus participant-specific authorization is absent |
| Outcome learning | **EXISTS** | interventions, measured outcomes, efficacy ranking and persisted learning |
| Weekly player learning recap | **PARTIAL** | weekly reflection submission/history and org synthesis exist; no governed player learning recap product |
| PWA/mobile | **PARTIAL** | service-worker/push hooks and responsive UI exist; Chromium/mobile/visual verification is missing |
| Model cost telemetry | **PARTIAL** | `_llmBudgetOk` and model tier configuration exist; checks are caller-scattered and telemetry is not token-denominated |

No item in this table was changed.

---

## 14. NEXT IMPLEMENTATION ORDER TO PRE-ALMA BASELINE GREEN

Shortest dependency-correct sequence, without Alma features:

1. **Integrate PR #73** onto current development; run P0-D focused and full truth layers.
2. **PR #74 Packet 1** — replace the theatrical no-LLM suite with the 20-case production proof.
3. **PR #74 Packet 2** — two-sided payload-level privacy floor.
4. **PR #74 Packet 3** — count independent origins and derive confidence/severity.
5. **PR #74 Packet 4** — derive perspective and allow-list Web artifacts; rebase and re-review #74.
6. In parallel after step 1: **Packet 5** person-model distinct-days and **Packet 6** erasure/cache
   invalidation.
7. Integrate the corrected branches into one development head; run `npm test`, every focused matrix
   command above, the six negative Falcon rehearsal assertions, and browser smoke in an environment
   with Chromium.
8. Run **live PostgreSQL** CAS plus overlapping stale-delete verification against that exact SHA.
9. Run the **Render deploy-overlap rehearsal**, choose/configure lossless drain ordering, and record
   logs/operator recovery.
10. Freeze the verified baseline. Only then plan Alma-specific product slices.

Packets 7-10 from the current register are pre-pilot improvements, not prerequisites for the
**baseline-green** verdict unless Alma chooses no-egress mode or adds coach-created Focus.

---

## 15. FINAL DELIVERY FACTS

- No production source was modified.
- No PR was merged.
- No blocker was fixed.
- This report is the only repository change.
- Final verdict remains **PRE-ALMA BASELINE NOT READY**.
