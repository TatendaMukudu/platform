# PROACTIVE_BASELINE.md — verified reality before the proactive layer

**Purpose (Part 1).** Before writing a line of the proactive intelligence layer, audit what
*actually exists in the code* versus what only exists in prose. Every claim below was verified by
reading the named function/endpoint/test — not inferred from architecture docs. Status codes:

- **A — Implemented and operational** (real code, on a live path, covered or trivially exercisable)
- **B — Partially implemented** (real code exists, but incomplete for the proactive goal)
- **C — Contract / documentation only** (named or described, not wired to a live path)
- **D — Missing**

**Headline finding.** The proactive layer is **not** a green field. IntelliQ already detects patterns,
computes directional states, ranks by severity, records interventions, measures their outcomes,
learns per-noticing-type reliability, gates surfacing on that reliability, and renders proactive
"things I noticed" surfaces to both members and leaders — **all deterministic, no AI key required.**
What is genuinely missing is not a second brain; it is a **single inspectable `ProactiveInsight`
artifact, one deterministic surfacing policy applied uniformly (≤3, "nothing needs you" first-class),
a dedicated audience-safety adversarial test suite, and bounded communication preferences.** This
baseline is what keeps us from rebuilding intelligence we already have.

---

## 1. Canonical evidence ingestion — **A**

The kernel reads only claim-bounded canonical evidence, with self-feeding protection.

- `evidenceLog[code]` is the canonical store; `_kernelEvidence(code, { purpose, viewerId, subjectId })`
  is the single gated reader (`server.js`).
- `_canonicalMoodSeries(code, subjectId)` (`server.js:3014`) is the ONE longitudinal check-in mood
  reader — reads canonical `metric`/`mood` envelopes only, never raw check-in rows, never the
  compatibility signal; drops private and non-source evidence.
- `_isSourceEvidence(env)` blocks the lineage source→pattern→recommendation→(recommendation counted
  as new source) — a derived kernel pattern is never counted as fresh evidence of its own pattern.
- `_buildMemberIntelInput(code, u, now)` assembles DERIVED features only (deviations, structural
  patterns, connections, fingerprint) — numbers/directions/booleans, never raw text — before the
  pure engine (`ai/intelligence.js`) ever sees them.

**Tests:** `evidence-smoke.js`, `private-evidence-smoke.js` (18 invariants), `checkin-migration-smoke.js`
(canonical-only, self-feed protection), `reasoning-boundaries-smoke.js`.

## 2. Kernel pattern detection — **A**

One detector, reused everywhere; no second pattern engine exists.

- `intel.detectPatterns(m)` (`ai/intelligence.js`) + universal structural patterns
  `primitives.structuralPatterns(streams, now)` surfaced as `m.structural`.
- Pattern types verified present: `baseline_shift`, `momentum_drop`, `quiet_improvement`,
  `repeated_concern`, `member_team_divergence`, `invisible_load`, `recovering` (self-relative +
  trajectory); `withdrawal`, `data_gap`, `isolation`, `overload`, `plateau` (structural).
- Combined + severity-ranked at every consumer: `[...intel.detectPatterns(m), ...(m.structural||[])]`
  sorted by `{high:0, medium:1, low:2}`.
- `intel.PATTERN_LABEL[type]`, `intel.DEFAULT_ACTION[type]`, `intel.composeBriefingItem(m, findings, learning)`
  produce human labels, a default supportive action, and a briefing item (`whyNow`, `careFlag`,
  `recommendedAction`, `severity`, `patternType`, `connections`).

**The spec's "member_team_divergence" and "repeated_concern":** **A** — both are first-class findings
already emitted by `detectPatterns` via the `repeatedConcern` and `memberTeamDivergence` detectors
(`ai/intelligence.js:131`, `:141`; both in `DETECTORS`, `:184`), with labels/actions in
`PATTERN_LABEL`/`DEFAULT_ACTION`. `member_team_divergence` fires only when both `memberTrajectory`
and `teamTrajectory` are populated and opposed. Nothing to add here.

**Tests:** `intelligence-smoke.js`, `person-model-smoke.js`, `baseline-smoke.js`.

## 3. Kernel directional states — **A**

- `_memberDirection(code, u)` (`server.js:2708`) returns `{ state, note }` over the canonical mood
  series: **converging · sustaining · stalled · diverging · unanchored · unknown**. Anchored to
  goal presence + recency + recent-vs-earlier mood delta. Explicitly **not** a sortable score.
- `_trajectoryFromMood(series, now)` → `up|down|flat|null`; team trajectory via pooled peer mood.
  Exposed as `memberTrajectory` on the intel input and carried post-kernel as a **directional word,
  never a score**.

**Tests:** `checkin-migration-smoke.js`, `advisor-migration-smoke.js` (trajectory in words, never a
hidden score — privacy-critical).

## 4. Priority / severity scoring — **A**

- Findings ranked by severity everywhere (`SEVR`/`SEV` maps). Leader briefing keeps a `top` slice
  (15); member `_composeToday` caps at **3**. → the inconsistent caps were the surfacing-policy gap
  the proactive layer resolves with ONE policy, not a missing capability.
- `careFlag` marks items that need a human, not automation.
- Confidence Engine suppression gate applied before an item is shown (see §8).

## 5. Intervention recording — **A**

- Store: `orgInterventions[code]`. Create: `POST /api/intelliq/intervention`. Carries `patternType`,
  `action`, `targetMember(Id)`, `createdAt`, `completedAt`, `status`.
- Category learning: `_categorizeAction(action)` buckets the action for stats.
- Consequential by design: an intervention is a leader action, already gated behind an explicit
  endpoint — consistent with "surface freely, act only on confirmation."

## 6. Outcome observation — **A**

- `_measureInterventionOutcome(code, intv)` (`server.js:10495`) enforces a 7-day minimum wait,
  requires enough pre/post points, and observes mood delta, engagement (check-in frequency) delta,
  and weekly-participation delta over 21d/21d windows.

**Caveat (tech debt, documented):** the weekly/assessment arm still reads the canonicalised
`memberResults` MIRROR — a leader analytics loop, not the assistant truth path. Mood/engagement arms
read canonical check-ins. Noted in PHASE1_COMPLETION.md.

## 7. Outcome evaluation — **A**

- Same function computes `overallOutcome` (positive/negative/neutral), `confidence` (high/medium/low),
  `likelyDrivers[]` (rule-based over mood×engagement), and `outcomeSummary`.
- Exposed via `GET /api/intelliq/intervention-analysis` and the measure endpoint, recomputed on read.

## 8. Confidence updates / learned reliability — **A** (already an outcome-learning loop)

- Store: `noticeFeedback[code] = { noticingType → { useful, dismiss } }` — "the Confidence Engine's
  memory" (`server.js:2989`).
- Engine: `ai/confidence.js` — `reliability(tally)` (MIN_FEEDBACK=4; calibrating/unproven/promising/
  reliable), `shouldSurface(rel)` (stands down an *unproven* type after ≥6 responses), `label(rel)`.
- Wiring: `_reliabilityByType(code)` feeds the leader briefing, which suppresses low-reliability types
  and labels the rest. Feedback intake: `_recordNoticeFeedback` + `POST /api/intelligence/notice-feedback`,
  fed by the leader lens, the member "not helpful" control, and the prepared-suggestion outcome loop.

**This is the observe→evaluate→learn loop, at the *noticing-type* grain.** The proactive layer bridges
it to a *specific surfaced insight* + a bounded *recipient*.

## 9. Learned preference storage — **B**

- Exists: per-noticing-**type**, **org-wide** reliability (`noticeFeedback`).
- Missing for the spec: **per-recipient** communication preferences (Part 8) → **D**; **per-insight**
  suppression (Part 10, member control is type-grain today).

## 10. Deterministic response generation (no AI key) — **A**

- `/api/me/context` is explicitly "Fully deterministic from the kernel — no AI key required, so it
  always works" (`server.js:3652`): `noticed[]`, `questions[]`, `prepared[]`, `returning`, `quietDays`.
- `_composeToday(code, userId)` — deterministic attention items, capped 3, de-duped.
- The leader briefing narrative is AI-enrichable but not AI-dependent — list/counts/momentum/labels
  are deterministic; only a 2–3 sentence aggregate calls `ai.complete` and is optional.

**Gap (Part 9):** the deterministic lines existed but were scattered. The proactive layer consolidates
one `PATTERN → deterministic message` table (`ai/proactive.MESSAGES`) with tests.

## 11. LLM-assisted adaptation — **A (bounded, correct)**

- AI is used only post-kernel, for phrasing, and only as enrichment. No LLM scans the database; every
  proactive input is a DERIVED feature or canonical envelope.

## 12. Proactive presentation surfaces — **A** (member + leader, live)

- **Member:** `/api/me/context` → `me-noticed`/`me-questions`/`me-prepared`; attention on Home via
  `_composeToday` / `_loadAttention`; `_dismissNoticing(type)` → notice-feedback.
- **Leader:** Platform Intelligence Loop briefing, notice-feedback, intervention record + analysis.

---

## What the proactive layer ADDED (nothing rebuilt) — status after this sprint

| # | Item | Baseline | Delivered |
|---|------|----------|-----------|
| 1 | **`ProactiveInsight` artifact** — one inspectable object unifying member/leader/attention | **D** | `ai/proactive.toInsight` — a post-kernel projection, no new engine |
| 2 | **One deterministic surfacing policy** — ≤3, "nothing needs you" first-class, uniform | **B** | `ai/proactive.surface` — both surfaces consume it |
| 3 | **Audience-safety adversarial suite** — implication-leakage | Advisor tested only | `ai/proactive.audienceSafe` + `proactive-smoke.js` tests 7–10, 14–15 |
| 4 | **Per-pattern deterministic message table** (Part 9) | scattered | `ai/proactive.MESSAGES` (self + leader, every pattern) |
| 5 | **Communication preferences** — bounded, never protected traits | **D** | `normalizePreferences` allow-list + `/api/proactive/preferences` |
| 6 | **Per-insight feedback/suppression** | type-grain only | `insightSuppression` + `/api/proactive/insights/:id/feedback` |
| 7 | **Outcome learning tied to a surfaced insight** | type-grain reliability exists | insight feedback bridges to `_recordNoticeFeedback` (see OUTCOME_LEARNING.md) |

(`member_team_divergence` / `repeated_concern` were already first-class emitted findings — no work.)

## Invariants this baseline confirms are enforced (not weakened)

- Surface freely, **act only on confirmation** — every ProactiveInsight suggestion is proposal-gated
  (`requiresConfirmation:true`); the layer surfaces, never executes.
- Private member evidence never reaches a leader — enforced pre-kernel by `_kernelEvidence` purpose
  scoping and, in the proactive layer, post-kernel by `audienceSafe` (leader form strips numbers,
  quotes, and basis).
- No second truth path / no raw-DB LLM scan — one detector, one evidence reader, AI post-kernel only.
- Works with no AI key — `ai/proactive.MESSAGES` are static; `/api/proactive/insights` is deterministic.
