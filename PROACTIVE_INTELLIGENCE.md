# PROACTIVE_INTELLIGENCE.md — the Attention Engine

> "I noticed something that may deserve your attention."

IntelliQ's proactive layer is an **Attention Engine**. Attention is not positive or negative; it is
simply *this matters*. The same kernel that finds a risk also finds a recovery, a milestone, and an
opportunity — they are **different projections of the same evidence**, not different systems. Home is
**"Your Attention"**: a balance of what needs action, progress worth celebrating, and opportunities
worth pursuing. Opening IntelliQ should mean *"understand what matters most right now"* — not *"what's
wrong."*

It is a **post-kernel projection**, not a second assistant, not a second reasoning engine, and not an
LLM scanning the database. It takes intelligence the canonical evidence + kernel architecture
**already produces** and surfaces it, deterministically, under one policy, with audience safety and
bounded personalisation.

## Polarity and buckets — the core idea

Every insight carries a **polarity** (what kind of thing it is) that is **independent of its
priority** (how much it matters). A milestone can be high-priority; a risk can be low. Polarity is a
projection of an existing kernel pattern — no new detector, no new reasoning.

| Polarity | Home bucket | Source | Audience |
|---|---|---|---|
| `risk` | **Needs attention** | negative patterns (`momentum_drop`, `withdrawal`, `overload`, `data_gap`, `isolation`, `baseline_shift`, `repeated_concern`, `member_team_divergence`, `invisible_load`, `plateau`) | self + leader (directional) |
| `progress` | **Worth celebrating** | positive patterns the kernel already emits (`recovering`, `quiet_improvement`) | self + leader (directional) |
| `milestone` | **Worth celebrating** | deterministic threshold projection (check-in streak) — counting, not reasoning | self (specific) + leader (numberless) |
| `opportunity` | **Opportunities** | a question derived from a sustained positive pattern | **self only** |
| `neutral` | **Needs attention** | deterministic attention items (`_composeToday`) | self only |

Rules that make this safe:
- **Priority ≠ polarity.** Ranking *within* a bucket is by priority, then confidence — never by
  sentiment. (`ai/proactive._rankCmp`)
- **Each bucket caps at 3**, and an empty bucket is a first-class calm state. All-empty is a valid
  whole-surface result.
- **A leader never receives an `opportunities` bucket about a person.** "Ready for more" or
  "leadership potential" framed to a supporter is a judgement that could drive unfair decisions and
  may rest on evidence the member considers private. Opportunities are self-audience-first.
- **Positive ≠ automatically safe for a leader.** "Recovery has stayed strong for 21 days" *implies a
  prior dip.* Every positive insight goes through the same `audienceSafe` gate; leader milestones are
  directional and numberless by construction.
- **No prediction polarity.** The product's "say pattern/early signal, never prediction" invariant is
  preserved — there is no `prediction` polarity in this layer.

### Cross-domain: correlation, never causation

The kernel's cross-signal `connections` are labelled correlational, never causal. The Attention Engine
inherits that discipline: it may surface *"your sleep and match performance have moved together — want
to look at that?"* (a question), and must never assert *"soccer improved **because** sleep improved."*
The moat is owning the whole story across domains; the trust comes from refusing to fake causality.

Read `PROACTIVE_BASELINE.md` first — it is the Part-1 audit that proves how much of this substrate
already existed (pattern detection, directional states, severity ranking, the Confidence Engine,
outcome measurement) and what this layer actually adds.

## What it is (and is not)

| It IS | It is NOT |
|---|---|
| A projection of existing kernel findings | A second pattern detector or reasoning engine |
| One artifact (`ProactiveInsight`) + one surfacing policy | A separate proactive assistant with its own runtime |
| Deterministic; works with no AI key | An LLM scanning raw data or self-modifying prompts |
| Surface-only; every action is proposal-gated | An autonomous actor that messages, writes, or intervenes |
| Audience-aware (owner vs leader) | A path by which private evidence can reach a leader |

## The pipeline

```
canonical evidence ──▶ _buildMemberIntelInput (DERIVED features only)
                           │
                           ▼
   intel.detectPatterns(m) + m.structural   ← the ONE kernel detector (unchanged)
                           │
                           ▼   (server: _proactiveInsights)
     Confidence Engine gate: confidence.shouldSurface(reliabilityByType[type])
                           │
                           ▼
        ai/proactive.toInsight(finding, { audience })   ← POST-KERNEL PROJECTION
                           │
                           ▼
        ai/proactive.audienceSafe(insight)              ← defence in depth
                           │
                           ▼
     applyPreferences (self only)  →  ai/proactive.surface (≤3, empty valid)
                           │
                           ▼
      /api/proactive/insights (self)  ·  /api/proactive/insights/leader/:id (authorised)
                           │
                           ▼
        Home / MyWorkspace attention surface  (member-view _loadAttention)
```

No new detection happens anywhere in this chain. `toInsight` never reaches a conclusion the kernel did
not already reach — it re-expresses an existing finding for a specific audience.

## The `ProactiveInsight` artifact (`ai/proactive.toInsight`)

One inspectable object. Fields:

| Field | Meaning |
|---|---|
| `id` | Stable, deterministic (`pi_` + hash of `dedupeKey`) — dedupe/suppression are stable across renders |
| `dedupeKey` | `subjectId:patternType:audience` |
| `patternType` | The kernel pattern (or attention kind) — unchanged from the detector |
| `audience` | `self` (the person about themselves) or `leader` (an authorised supporter) |
| `subjectId` / `subjectLabel` | Who it's about; `you` for self, the name for a leader |
| `polarity` | `risk` / `progress` / `milestone` / `opportunity` / `neutral` — a projection of the pattern |
| `priority` | `high` / `medium` / `low` — how much it matters, **independent of polarity** |
| `bucket` | `needs_attention` / `worth_celebrating` / `opportunities` — derived from polarity |
| `severity` | `high` / `medium` / `low` — **from the kernel finding**, not re-derived |
| `kernelConfidence` | The kernel's own confidence word |
| `reliabilityLabel` | The Confidence Engine's honest label (`reliable here` / `promising here` / `calibrating` …) |
| `headline` / `body` | The rendered, audience-safe message |
| `suggestion` | `{ text, requiresConfirmation:true, proposalType }` — **never auto-run** |
| `basis` | Internal, privacy-safe evidence strings — **stripped to `[]` for a leader**, kept for the owner |
| `careFlag` | Contentless "there may be private context" nudge |
| `surfacedAt` | ISO timestamp |

## The surfacing policy (`ai/proactive.attention`)

Deterministic and uniform across both surfaces. Groups insights into the three Home buckets and
returns `{ empty, message, groups: { needs_attention, worth_celebrating, opportunities } }` (a leader
gets no `opportunities`):

- **Rank within a bucket** by priority (independent of polarity), then kernel confidence, then a stable
  id tiebreak.
- **Cap each bucket at 3.** More than three competing things is noise, not attention.
- **Empty is first-class.** Each bucket carries `empty` + a calm message; all-empty returns
  `{ empty:true }` for the whole surface — never an error, never an empty-looking bug.
- **De-duplicate** by `dedupeKey` (same subject+pattern+audience surfaces once, keeping the highest
  priority).
- **Suppress** anything the viewer muted (`insightSuppression`).

(`ai/proactive.surface` — the flat, single-list version — is retained for callers that want an
ungrouped top-N and for the older tests.)

## Audience safety (`ai/proactive.audienceSafe`) — the privacy invariant

A leader must never learn a member's private evidence — not directly, by quotation, by number, by a
named dimension, by timing, or by an implied disclosure. The projection enforces this **by
construction**, and `audienceSafe` proves it on the rendered fields:

- **Leader audience:** the message comes from the `leader` column of the message table — directional,
  care-first, generic. `basis` is stripped to `[]`. `audienceSafe` rejects any leader insight that
  contains a score (`x/5`, `n%`), a long verbatim quote, an exposed basis, or an unconfirmed action.
- **Private-implying patterns** (e.g. `baseline_shift`) degrade to a curious, no-assumptions nudge +
  `careFlag` — they never name the dimension that moved.
- **Protected-trait language** (race, religion, health/diagnosis, pregnancy, immigration, …) is
  forbidden in **any** rendered field, for any audience.

The adversarial tests (`proactive-smoke.js` 7–10, 14–15) attack this with private-loaded bases and
assert nothing leaks, including on **real seeded data** through the HTTP endpoint.

## Deterministic messages — no AI key required (`ai/proactive.MESSAGES`)

Every kernel pattern has a static `{ headline, body, suggestion }` for **both** audiences. No model is
consulted to produce a proactive insight. An unknown pattern degrades to a safe fallback, never a
crash. This is what lets the whole layer work in a no-key pilot (see `DEMO.md`).

## The proactive opening — the assistant greets from the artifacts

The defining interaction: *before you ask, the OS has already organised your world into what deserves
your attention.* The assistant opens the conversation by **consuming** the Attention artifacts — it
never generates observations.

- `ai/proactive.composeOpening(grouped, { audience, name, now })` — a **deterministic** greeting
  assembled from the *same* `_proactiveInsights` output. Time-aware ("Good morning, Mia."), it **leads
  with a win** when there is one (emotional balance is the point), then needs-attention, then
  opportunity, and ends with an invitation to explore. No AI, ever. Empty is a calm, valid opening —
  never an alarm, never a void.
- `GET /api/assistant/opening` — grounded, numberless, audience-safe. Home renders the greeting above
  "Your Attention".
- **Explore prompts** — every insight carries a per-polarity `explore` line so *wins and risks both
  start conversations*: reinforcing for a win ("what helped create this? worth protecting what's
  working"), supportive and **non-alarmist** for a risk ("explore what changed — or who could support
  you?"). Explore prompts never diagnose, predict, or assume a cause.

The invariant: **the assistant consumes Attention artifacts, it does not generate them.** The opening
is pure assembly over verified insights — the tests assert every surfaced item is one of the input
artifacts (no fabrication) and that a leader opening leaks no number, quote, or basis.

## Surface, never act

Every `suggestion` is `requiresConfirmation: true`. Clicking a suggestion in the UI **prefills the one
composer** — it is a prompt, not an execution. Anything consequential (a check-in log, a plan, a
leader intervention) still flows through the existing **proposal → confirm → execute** pipeline with
its visibility rules. The proactive layer has no write path of its own.

## Endpoints

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/proactive/insights` | any member | Their own surfaced insights (self audience) |
| GET | `/api/proactive/insights/leader/:subjectId` | authorised supporter | Directional, care-first insights about a member (`view_insights` or `review_checkins` + in scope) |
| POST | `/api/proactive/insights/:id/feedback` | any member | `useful` / `not_useful` (teach the Confidence Engine) · `mute` (suppress this insight for this viewer) |
| GET/PUT | `/api/proactive/preferences` | any member | Bounded communication preferences |

## Communication preferences — bounded (see COMMUNICATION_PREFERENCES.md)

A fixed allow-list: `length` (standard/brief), `tone` (warm/plain), `cadence`
(as_it_happens/daily/weekly). `normalizePreferences` drops everything else, so a protected trait is
**structurally impossible** to store. Nothing is ever inferred. Preferences change *how* an insight
reads, never *what* is surfaced.

## Outcome learning (see OUTCOME_LEARNING.md)

`useful`/`not_useful` on a surfaced insight feed the existing Confidence Engine at the pattern-type
grain (`_recordNoticeFeedback` → `noticeFeedback`). Over time a pattern type that proves unhelpful in
an org is **stood down** (`confidence.shouldSurface`), so the layer gets quieter where it isn't
earning attention — observe → evaluate → learn, closing on the surfaced insight.

## Tests

`scripts/proactive-smoke.js` — 65 assertions, registered in the truth layer (`scripts/test.js`),
hermetic (no DB, no AI key): artifact shape + stable id, surfacing cap + empty-valid + ranking +
dedupe, per-pattern deterministic messages, adversarial audience safety (incl. real seeded data over
HTTP), proposal-gating, bounded preferences, feedback + suppression, Confidence-Engine suppression,
endpoint authorization, **polarity mapping, bucket grouping, priority-independent ranking, milestone
determinism + leader-safety, opportunity-as-question, and leader-has-no-opportunities**.

## Files

- `ai/proactive.js` — the pure layer (projection, policy, safety, preferences).
- `server.js` — `_proactiveInsights` + endpoints + stores (`proactivePrefs`, `insightSuppression`).
- `js/member-view.js` / `css/member.css` — the Home attention surface renders the insight set.
- `PROACTIVE_BASELINE.md` — the Part-1 verified audit.
