# OUTCOME_LEARNING.md — how the proactive layer learns

IntelliQ learns *where it is reliable* — honestly, from evidence, at the grain of a **kind of
noticing** — and gets quieter where it isn't earning attention. This is not reinforcement learning,
not a model that trains on people, and not a hidden reward function. It is a transparent tally.

## The loop

```
observe  →  a ProactiveInsight is surfaced (a kernel pattern, projected)
evaluate →  the human responds: useful · not_useful · mute  (or a leader intervention is measured)
learn    →  the Confidence Engine updates its per-pattern-type reliability
adapt    →  surfacing + labelling change: unproven types are stood down, honest labels attached
```

## Two layers of learning (both pre-existing; the proactive layer bridges to them)

### 1. Per-pattern-type reliability — the Confidence Engine (`ai/confidence.js`)

- Store: `noticeFeedback[code] = { patternType → { useful, dismiss } }` — "the Confidence Engine's
  memory."
- `reliability(tally)`: below `MIN_FEEDBACK` (4) it says **`calibrating`** and claims nothing.
  Above it: `reliable` (≥70% useful) / `promising` (≥45%) / `unproven`.
- `shouldSurface(rel)`: a type that has earned enough feedback (≥6) **and** proven mostly unhelpful
  is **stood down** in that org — it stops surfacing. Never suppressed on thin evidence.
- `label(rel)`: every surfaced insight carries an honest reliability label; the UI shows it (except
  `calibrating`, which is left unlabelled to avoid noise).

**How the proactive layer feeds it:** `POST /api/proactive/insights/:id/feedback` with `useful` /
`not_useful` calls `_recordNoticeFeedback(code, patternType, useful|dismiss)` — the *same* learning
loop the leader lens and the member "not helpful" control already use. So a thumbs-down on a surfaced
insight is a real signal that, over time, quiets that pattern type where it isn't landing.

### 2. Per-insight suppression — the mute (`insightSuppression`)

- `mute` on an insight records its `dedupeKey` in `insightSuppression["code:userId"]`.
- The surfacing policy drops muted insights for **that viewer only**. This is instance-grain and
  personal — distinct from the org-wide, type-grain reliability above.

### 3. Intervention outcomes (leader loop, pre-existing) — `_measureInterventionOutcome`

When a leader records and completes an intervention, IntelliQ measures what actually happened (mood
delta, engagement delta, weekly-participation delta) after a 7-day minimum wait, classifies the
outcome, and surfaces likely drivers. `composeBriefingItem` uses this org's own measured outcomes to
prefer a recommended action that has *tended to help here* (only after ≥2 measured outcomes, never
overwriting the care-first default). This is the deeper, slower outcome signal; the proactive
feedback loop above is the fast one.

## What it deliberately does NOT do

- **No training on individuals.** Learning is a per-pattern-type tally per org — never a per-person
  model, never a protected-trait signal.
- **No hidden reward.** The only signals are explicit human feedback (`useful`/`not_useful`/`mute`)
  and measured intervention outcomes. Both are inspectable stores.
- **No silent behaviour change.** Suppression is honest ("stood down here"); reliability is labelled;
  nothing changes what evidence is admissible or what the kernel concludes.
- **No self-modifying prompts.** The message table is static code, not a learned artifact.

## Honest limits

- Reliability is **org-scoped and type-grained** — it says "this *kind* of noticing has/hasn't earned
  trust here," not "this person is/isn't reliable."
- Below the feedback floor the layer says `calibrating` and surfaces normally — it does not guess.
- The intervention-outcome arm still reads the canonicalised `memberResults` mirror for the
  weekly-participation dimension (documented tech debt in `PHASE1_COMPLETION.md`); the mood and
  engagement dimensions read canonical check-ins.

## Where to look

- `ai/confidence.js` — the engine.
- `server.js`: `noticeFeedback`, `_reliabilityByType`, `_recordNoticeFeedback`,
  `_proactiveInsights` (gate + label), `insightSuppression`, `_measureInterventionOutcome`.
- `scripts/proactive-smoke.js` tests 16 & 18 — feedback records a dismiss; a proven-unhelpful type is
  suppressed.
