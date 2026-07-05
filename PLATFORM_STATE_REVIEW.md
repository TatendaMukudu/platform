# Platform — Complete State Review
*Written as a new senior product engineer, day one. Brutally honest. No design decision is protected.*

**One-line verdict:** The *ideas* here are genuinely ahead of the market — a
signal-first, privacy-gated, alignment-oriented "organizational intelligence"
system. The *execution* is a large, unvalidated monolith with real structural
debt and zero live users. You have a Series-A **story** and a demo-grade
**product**. The gap between them is the plan.

---

## 0 · Scale of what exists (context for everything below)

- **98 API endpoints**, **31 front-end pages**, **21 nav items**, **~15 distinct
  AI call sites**, **5 verticals** (school, sports, workplace, military,
  healthcare).
- **~12,000 lines** across two files (`server.js` ~6k, `js/app.js` ~6.6k).
- **Persistence:** a *single JSONB blob* in Neon Postgres, rewritten wholesale on
  a 500ms debounce.
- **Live users:** zero. No production DB or AI key in this environment. Nothing
  has run end-to-end against real data.

That last line is the most important sentence in this document. **You have built
a lot before proving anyone wants it.**

---

## 1 · Current Features

Grouped by area. "Prod-ready?" is my honest read, not aspirational.

### Identity & Org Setup
| Feature | What / Why / Who | Data | Prod-ready |
|---|---|---|---|
| Org setup + describe + AI suggest | Superadmin creates org, describes it, AI proposes values/goals/metrics. Exists so the org's identity anchors all AI. | `orgMeta`, `orgValues`, `orgGoals`, `orgMetrics` | ⚠️ Works, but setup is long and un-tested with a real admin |
| Required org profile | Blocks completion without ≥1 value + ≥1 goal. Guarantees the AI has anchors. | `orgMeta.organizationProfile` | ✅ Solid (verified) |
| Auth (login, invite, join-link, set-password, bulk-import) | Account creation for all roles. | `orgUsers`, `activeSessions`, `emailIndex`, `inviteTokens` | ⚠️ Functional; **not security-audited**; legacy `simpleHash` still present; tokens live in the blob |
| Org tree / nodes | Hierarchical structure of leadership. | `orgNodes` | ⚠️ Powerful but complex; overlaps with groups + legacy `supervisorId` (three parallel hierarchies) |

### Member-facing
| Feature | What / Why / Who | Data | Prod-ready |
|---|---|---|---|
| Onboarding (goals + values) | Member states aims + values. The "engine" of the Alignment Layer. | `memberGoals` | ✅ Required-field logic solid |
| Check-in | Mood (1–5) + free text, AI reflection back. Daily pulse. | `memberCheckins` + emits a Signal | ⚠️ Works; overlaps with Notes |
| Notes (private/shared) | Member/coach writes; AI can respond. | `orgNotes` + Signal | ⚠️ Overlaps with Check-in; the "private vs shared" choice is friction |
| Weekly reflection | Structured weekly prompt + AI synthesis. | `weeklyAssessments` + Signal | ⚠️ Yet another input surface |
| Assessments / Scenarios | AI-run decision scenarios, scored. The original product. | `assignedScenarios`, `memberResults` | ⚠️ Ambitious; scoring rubric opaque; heaviest AI cost |
| Inbox / Messages | Known/anonymous messages to person/group/org. | `orgMessages` (flat map) | ⚠️ Generic; anonymity handling is basic |
| IQComposer | One input toolbar (type/voice/attach) → parses files, ingests signals. | → Signals | ✅ Genuinely nice; **underused** (only mounted in one place) |

### Leader-facing
| Feature | What / Why / Who | Data | Prod-ready |
|---|---|---|---|
| Visible-members / My Members (tree) | Scoped roster of who a leader can see. | derived | ✅ Visibility logic is the strongest part of the codebase |
| Briefing ("who needs you") | AI + rule alerts: who to reach out to this week. | `leaderBriefingCache` | ⚠️ Good concept; alerts are heuristic |
| Group Health | Quantitative subtree metrics. | derived | ⚠️ Overlaps with Briefing + Intelligence |
| Group Copilot | Consent-gated, aggregate, signals-first coach for a group lead. | `orgGroups[].copilotEnabled` | ⚠️ Well-designed philosophically; unproven |
| My Groups (aims/traits) | Lead sets group goals/traits (the "team" frame). | `orgGroups[].goals/traits` | ✅ Clean |
| Data Sources | Upload/import + see what feeds the AI. | → Signals | ⚠️ Import is impressive (vision/PDF); connectors are stubs |
| Individual Advisor | Ask AI about ONE member; alignment briefing. | `advisorThreads` | ⚠️ The flagship. Strong design, needs live proof |

### Intelligence / Learning
| Feature | What / Why / Who | Data | Prod-ready |
|---|---|---|---|
| Patterns / Predictions | Rule-based risk patterns + linear-slope "predictions". | derived from `_aggregateOrgData` | ❌ **Marketed as ML, is heuristics.** "Mood may reach 2.1/5 in 2 weeks" from a slope is fragile and could mislead |
| Interventions + effectiveness | Log a coach action → outcome → learning. | `orgInterventions` | ⚠️ Backend exists; loop not closed in UI |
| Cross-member "similar" cohort | Anonymous "what helped people like them." | derived (+ dormant embeddings) | ⚠️ v1 works with the guards I added; needs data volume |
| Behavioral profile + durable memory | Longitudinal per-person understanding + significant-fact memory. | `userAiProfiles` | ⚠️ Sophisticated; the differentiator; unproven at scale |

**Blunt takeaway on Section 1:** roughly a third of these features are *generic*
(check-ins, notes, messaging, dashboards, alerts) and exist in every engagement
tool. The differentiated third (Advisor, Signals, durable memory, Alignment) is
where all the value is — and it's the least proven.

---

## 2 · User Journeys

### Organization Admin (Superadmin)
1. Sets up org → describes it → approves AI-suggested values/goals/metrics
   (**required**). 2. Builds the tree / nodes, or imports members in bulk.
3. Invites people (email/link). 4. Configures metrics, values, goals,
   permissions. 5. Daily: sees org-wide dashboards, alerts, reports, Intelligence.
**Reality:** the admin faces ~20 nav items and a multi-step setup. This is the
heaviest, least-tested journey. A real admin would likely get lost in setup.

### Leader (Lead node)
1. Logs in → lands on a member-style Home. 2. Discovers a separate "Leader
Workspace" (13 items). 3. Uses My Members → opens a profile → Advisor / Data /
Insights tabs. 4. Sets group aims, enables Copilot. 5. Daily: *should* start at
the Briefing, but it's one of four competing surfaces.
**Reality:** the leader has a **split identity** (member + leader nav
simultaneously) and four surfaces answering "who needs me?" This is the biggest
day-one confusion.

### Member
1. Accepts invite → sets password → onboarding (goal + value, required).
2. Home. 3. Checks in / writes notes / does weekly reflection / completes
assessments / messages. 4. Sees Progress.
**Reality:** clean-ish, but **two doors for one job** (Check-in vs Notes) and no
single "everything about me" view. The member does the most *input* and gets the
least *reflection back*.

---

## 3 · AI Systems (there are too many, and they overlap)

There are **~15 AI call sites**. Only ~5 route through the `ai/gateway.js` (tiered
model, retries, downshift, JSON validation). **The rest bypass the gateway and
hard-code Haiku** — this is real debt: inconsistent quality, cost, and error
handling.

| System | Inputs | Output | Memory | Via gateway? |
|---|---|---|---|---|
| **Individual Advisor** | member's weighted signals + goals + team + org values, through privacy gate | alignment answer / briefing | reads durable profile | ✅ (reason tier) |
| **Behavioral Profile builder** | same context + prior memory | narrative + tendencies + durable facts + trajectory | writes `userAiProfiles` | ✅ |
| **Group Copilot** | group signals (counts/trends, no content) + aims | aggregate actions/prompts/reflection | none | ✅ |
| **Leader Briefing** | aggregate alerts | 2–4 sentence brief | cached | ✅ |
| **Smart Import** | text or image/PDF (vision) | per-member structured data | none | ✅ |
| **Reflection assistant** | check-in text + org context | conversational reflection | none | ❌ Haiku inline |
| **Scenario facilitator + scorer** | scenario config + member responses | live scenario + score | none | ❌ Haiku inline |
| **Coach debrief / draft-scenario / org-describe / metric-suggest / weekly-synthesis / org-insights / intervention-analysis** | various | various | none | ❌ Haiku inline |

**Why they overlap (honest answer):** they were built at different times without a
unifying "one brain, many lenses" refactor. The Advisor, Behavioral Profile,
Reflection, and Copilot all reason over overlapping context with different
prompts. **This should consolidate** into: one context builder + one gateway +
role/purpose lenses. Right now it's five brains.

- **Prompts:** strong and opinionated (directional language, no scores, privacy
  gate, alignment doctrine). This is genuinely good prompt engineering.
- **Confidence:** the model self-selects trajectory words with light grounding.
  There is **no calibration** — "diverging" from Haiku is treated the same whether
  from 2 signals or 200. (I added hysteresis + signal-basis, which helps.)
- **Limitations:** no evals, no regression tests on prompts, no human-in-loop
  review surface, most calls on the cheapest model, nothing measured against
  real outcomes yet.

---

## 4 · Signals

The **best idea in the product.** One normalized shape for every input.

- **Types (source registry):** checkin, note, assessment, weekly, voice, film,
  metric, sheet, gamestats, document, external, + integration stubs (teams,
  google, outlook).
- **Created by:** every input endpoint calls `_emitSignalSafe` (never throws), OR
  direct ingest (`/api/signals/ingest`), OR smart import (vision).
- **Stored:** `orgSignals[code] = [signal]` — id, ts, source, modality,
  subjectType (member/group/org), subjectId, valueNum/valueText/data,
  **sensitivity** (auto-classified), **weight** (base + tier), createdBy.
- **Weighting:** STRONG (results/metrics/stats/sheets=3) > MEDIUM (notes/checkins/
  reflections=2) > WEAK (external/messages=1). Effective weight adds recency +
  the member's *own* repetition (I fixed the coach-inflation bug).
- **How the Advisor interprets them:** ranks by effective weight, caps weak noise,
  routes private ones to "informs-only," tags `[strong]`/`[minor]`, and reasons
  over a pattern-across-signals rather than any single point.

**Honest gap:** signals are currently a **mirror**, not the source of truth — the
canonical data still lives in the six legacy stores. The spine is built but the
body still runs on the old skeleton.

---

## 5 · Alignment Layer

The conceptual core, and a genuine differentiator.

- **Member aims = the engine** (intrinsic goals; what actually drives growth).
- **Team context = the shared middle** (group emphasis/culture).
- **Org values = the guardrails** (ethical boundaries/identity).
- **Not a hierarchy.** Optimize for the member's goals, pursued within org
  guardrails, integrated with team context.
- **Directional, never scored:** converging / sustaining / stalled / diverging /
  unanchored / unknown.
- **Conflict doctrine** is encoded in the prompt (integrate member↔team; org value
  wins vs team but as a culture issue; anchored-to-nothing = highest care).

**How it connects:** `_buildAdvisorContext` assembles all three frames + signals +
memory; `_worldviewDirective` injects the org's own values; `_memberValuesDirective`
injects the member's; the Advisor reasons across them. **This is the most
intellectually differentiated thing you have.** It is also entirely unproven with
real humans — the risk is it reads as profound in a demo and vague in practice.

---

## 6 · Data Model & Technical Debt

**Architecture:** one JSONB blob (`iq_store` key `main`) holding ~20 in-memory
objects, rewritten wholesale on a 500ms debounce.

**Entities:** Orgs (`orgMeta`) → Users (`orgUsers`) → Nodes (`orgNodes`) /
Groups (`orgGroups`); plus per-person `memberGoals`, `memberCheckins`,
`memberResults`, `weeklyAssessments`, `orgNotes`, `userAiProfiles`,
`orgInterventions`, `orgSignals`, `advisorThreads`.

**The debt, ranked:**
1. **🔴 Dual keying (ID vs name).** Data keyed by `userKey` (id) *and*
   `memberKey` (name). Root cause of the bugs already fixed. Every read has to try
   both. **Highest-leverage cleanup.**
2. **🔴 Single-blob persistence.** The entire org serialized/written on every
   change. Last-write-wins (concurrency risk), no per-entity queries, unbounded
   row growth, full rewrite cost scales with org size. Fine for a demo, **will not
   survive real multi-org load.**
3. **🔴 Three parallel hierarchies** (nodes + legacy `supervisorId` + groups). The
   visibility code heroically unifies them, but it's fragile.
4. **🟠 Six stores + signals as partial mirror** — no single source of truth per
   person.
5. **🟠 Most AI bypasses the gateway** (hard-coded Haiku).
6. **🟠 Tokens/sessions in the same blob**; legacy `simpleHash`; no security audit.
7. **🟡 No automated test suite / CI** (one live-only smoke script).
8. **🟡 6k-line files, vanilla JS frontend** — maintainability ceiling approaching.
9. **🟡 Rule-based "predictions" presented as intelligence.**

Difficulty: #1 medium (mechanical migration + backfill), #2 large (real schema),
#3 medium-large, #5 medium, #6 medium (security pass), #7 medium.

---

## 7 · Privacy Model

Genuinely sophisticated — **a real wedge**, and better than most funded HR-AI.

- **Tiers:** normal (citable) · sensitive (informs-only) · restricted
  (informs-only, cleared roles only) · public.
- **Four layers:** classify at write → structurally separate citable vs
  private-informing → `GATE_DIRECTIVE` (reason, never reveal) → `redact()`
  last-line strip.
- **Who sees what:** superadmin = all; `edit_members` = all; leader = own subtree
  (nodes + supervisor tree + led groups); member = self. Profile endpoints require
  `view_insights`/`review_checkins`.
- **What AI sees but cannot reveal:** private notes, weekly text, counselor/
  medical/family disclosures, sensitive durable memories. Leaders see a *count*
  ("informed by N private matters"), never the detail.
- **Hardening I added:** a conservative SENSITIVE tier so keyword-free hardship
  ("I've been struggling") can't slip through as quotable.

**Residual risk:** the classifier is still a **single keyword-based point of
failure**; a determined edge case could misroute. Long term this wants a
model-based classifier + audit log. But as a *stance*, this is a strength to lead
with.

---

## 8 · UX

- **Polished:** the profile modal (tabs), IQComposer, the Advisor panel, the
  visibility/tree logic, the directional-language framing.
- **Unfinished / rough:** 31 pages with overlapping purpose; five analytics-ish
  surfaces; **"Intelligence" appears twice** in admin nav; connectors that look
  live but are stubs; the intervention loop not closed in UI.
- **Where users get confused:** (a) leader's split member/leader identity; (b)
  Check-in vs Notes; (c) four "how's my team" surfaces; (d) which of Insights /
  Intelligence / Org Health / Group Health to open. This is the #1 UX debt and
  the cheapest to fix.

---

## 9 · Technical Debt — consolidated list
Covered in §6. Summary by size:
- **Small:** duplicate nav labels; IQComposer only mounted once; inconsistent
  toasts; no favicon/loading polish.
- **Medium:** unify IDs (#1); route all AI through the gateway (#5); security pass
  on auth (#6); add a test suite (#7); consolidate the 5 AI brains.
- **Large:** move off the single-blob to a real relational schema (#2); unify the
  three hierarchies (#3); replace heuristic "predictions" with something honest.

---

## 10 · Product Critique (as an outsider)

**Innovative:** signals-as-universal-input; directional-not-scored philosophy;
the privacy gate; the Alignment Layer; durable humane memory (remembering a
bereavement *without* exposing it). This cluster is genuinely rare.

**Generic:** check-ins, notes, messaging, dashboards, alerts, "AI insights."
Every competitor has these. They dilute the story.

**What investors would like:** the narrative ("software that *understands*
organizations, not just records them"), the signal-moat thesis (compounding data
advantage over time), multi-vertical TAM, privacy-as-wedge, and a founder with an
unusually clear design philosophy.

**What customers would love:** "tell me how to help *this* person," "who needs me
today," and the system remembering the human context with care. That's the
emotional core.

**Where it's weak:** unvalidated (zero users); over-built (98 endpoints before
product-market fit); no integrations that actually work; predictions that
overclaim; a data model that won't scale; and **too many features for the story
it's telling.**

**Missing pieces:** real integrations (Teams/Slack/Google), notifications/email,
mobile, working billing, data export/reporting, an evals harness for the AI, and —
critically — **proof it changes behavior.**

---

## 11 · Vision Gap

**Vision:** "human performance intelligence" — software that understands people
and organizations over time, across verticals.

- **Achieved:** the *substrate* — signals, privacy, alignment, per-person memory,
  role-aware AI, multi-vertical scaffolding. That's a real foundation, and most
  startups don't have this much conceptual spine.
- **Remaining:** everything that makes it *understand* rather than *record* —
  cross-team pattern detection, causal momentum explanations, intervention
  simulation, the living-system view. Today the AI *reacts* to a person; the
  vision is a system that *anticipates* across the org.
- **Highest leverage missing pieces:** (1) **live users + evidence it works** —
  nothing else matters without this; (2) **ID/data unification** — unlocks
  everything downstream; (3) **closing the intervention→outcome→learning loop** —
  turns the data moat from theoretical into real.

---

## 12 · Simplification (per your Phase-2 lens: "one fewer decision")

- **Notes:** stop asking private-vs-shared and where to file it — infer
  sensitivity (the classifier already does) and destination from content.
- **Check-in vs Notes:** collapse into one input box. The system decides what it
  is.
- **Assessments:** stop making leaders hand-configure scenarios — generate from
  org context + the member's trajectory.
- **Leader nav:** one Dashboard that *surfaces* who needs attention — remove the
  four-surface hunt.
- **Onboarding:** infer likely goals/values from role + org and let the member
  confirm, rather than fill blank fields.
- **Metrics/values setup:** the AI already suggests — default to accepting, make
  editing the exception.
- **Can disappear entirely:** the separate "Group Health," "Org Health," and
  "Intelligence" pages can become sections of one surface, not destinations.

**Principle to hold (yours, and it's the right one):** *every feature must make
the product simpler, make the AI smarter, or create an experience available
nowhere else.* By that test, cut or merge: Notes-vs-Checkin, the duplicate
analytics pages, and the heuristic predictions.

---

## 13 · "I've Never Seen Software Do That" — 25 ideas only possible because Platform captures signals continuously over time

*Longitudinal + cross-entity + privacy-safe is the unlock. These lean on time, not chat.*

1. **Momentum autopsy** — "Your team's momentum dropped 3 weeks ago. Here are the
   4 signals, in order, that preceded it." Retrospective, evidence-linked.
2. **Intervention pre-mortem** — before a manager reassigns/benches someone,
   simulate the likely trajectory impact from cohort history.
3. **Silent-struggle radar** — surface the person quietly diverging *before* they
   or anyone says a word (the anti-squeaky-wheel).
4. **Stated-vs-lived values gap** — org *says* it values X; signals show it
   *rewards* Y. Show the drift between the values on the wall and the behavior.
5. **Quiet-win surfacer** — someone improving steadily with no fanfare; nudge the
   leader to recognize them *before* they feel invisible.
6. **Relationship lift graph** — infer from co-timed signals who raises whose
   performance/mood. "These two lift each other — pair them."
7. **Time-machine profile** — scrub a person's trajectory over months like video;
   see the exact inflection points and what surrounded them.
8. **Invisible-mentor match** — match a struggling member to a peer who overcame
   the *same* pattern, anonymously brokered.
9. **Momentum weather forecast** — "Converging now, but a storm risk in ~2 weeks
   based on the pattern forming" — team-level, directional, honest about
   uncertainty.
10. **Language-shift detection** — how a person/team's language drifts over time
    (hope → resignation) *without ever quoting* the private text.
11. **Onboarding echo** — compare a new hire's first-30-day signal shape to
    historical thrivers vs leavers; intervene early.
12. **Signal-triggered check-ins** — the system asks the *right* question at the
    *right* moment because signals shifted — not on a calendar.
13. **The empathy brief** — 60 seconds before a 1:1: "come in warm today" —
    informed by sensitive signals, never revealing them.
14. **Contagion mapping** — watch a mood/behavior spread through a team over time
    from signal timing; catch a negative cascade at signal #2, not #20.
15. **Goal-reality gap tracker** — continuously measure the distance between a
    stated aim and the behavioral trajectory, directionally, per person.
16. **Decision-making evolution** — across months of scenarios, show how a
    person's *judgment* matured, not just their scores.
17. **Invisible-load detector** — who's quietly carrying the team (helping others
    in the signals) and heading for depletion.
18. **Member↔team divergence alert** — the moment an individual's direction starts
    pulling away from the group's, early and gently.
19. **The "you're becoming" mirror** (member-facing) — reflect back who they're
    trending toward becoming, in *their own* values' language, from their own
    signals.
20. **Cross-org anonymized playbook** — "Teams like yours that recovered momentum
    did these three things" — a compounding, privacy-safe benchmark.
21. **Intervention A/B memory** — across the org, which approach to the *same*
    problem-pattern worked better — learned continuously, never reset.
22. **Team chemistry over time** — visualize cohesion rising/falling around real
    events (a loss, a reorg, a departure).
23. **Pre-burnout runway** — not a risk score, a *runway*: "at the current signal
    trajectory, this person has ~N weeks before the pattern that preceded past
    burnouts" — framed as care.
24. **Narrative annual review** — auto-drafted from a year of signals: not
    ratings, a *story* of how this person grew, in their values' terms — the
    review no manager has time to write.
25. **Organizational memory that outlives people** — when a leader leaves, the
    accumulated, privacy-safe understanding of their team stays. The org stops
    losing its context every time someone quits.

**The throughline:** #1, #3, #9, #14, #23 are the "stop and stare" set —
detecting the invisible, before humans can, from months of signal. That is the
product no one else can copy without your data over time. **Everything in Phase 3
should ladder to one of those.**

---

## Closing: on your three phases

Your Phase 1 → 2 → 3 (Polish → Simplify → Magic) is correct, with one hard edit:

**Phase 1 is smaller than you think, and it isn't done by polishing code — it's
done by getting the thing in front of 3 real coaches/leaders and watching them
use it.** You have polished a product no human has touched. The highest-leverage
"bug" right now is the absence of a single real user. Do the ID unification and
the nav simplification *because they unblock a real pilot* — not for their own
sake.

Then Phase 3's magic (#1–#25) is only defensible **after** you have months of
real signals. The moat isn't the features — it's the accumulated, privacy-safe,
longitudinal understanding. Ship the substrate, get real data flowing, and the
magic becomes possible *and* uncopyable.

Your design principle — *simpler, smarter, or unavailable-elsewhere* — is the
right filter. Apply it ruthlessly and this becomes a much smaller, much sharper
product than the 98-endpoint version that exists today. **Cut toward the story.**
