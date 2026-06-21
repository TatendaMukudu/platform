# Update — Signal Weighting (your anti-noise warning, built)

**Merged to main:** `bff2db4` (deploying) · asset `?v=20260621n`

You called it: "everything is a signal" must not become "everything is equally
important." Weighting is now in, using your tiers.

## The model
- **STRONG (3):** assessment results, metrics, game stats, stat sheets — hard
  outcomes.
- **MEDIUM (2):** reflections, notes, check-ins, film/voice/documents.
- **WEAK (1):** one-off external events / messages / comments.

Stamped on every signal at ingest (`weight` + `weightNum`).

## How the AI uses it
- **Effective weight = base + repetition + recency.** A recurring source
  ("repeated behaviour") and recent items get boosted — so a pattern outranks a
  single strong data point, exactly as you framed it.
- The Advisor **ranks signals by effective weight**, includes all strong/medium,
  and **caps weak one-offs at 3** so reasoning stays signal-rich, not noisy.
- Context lines are tagged `[strong]` / `[minor]`, and the Advisor is instructed:
  *"weigh the evidence — a pattern across signals beats any single data point;
  never build a judgement on one stray note."*

## You can see it
The Data Sources "What IntelliQ can use" list now shows a **weight dot**
(green = strong, amber = medium, grey = weak) next to each signal.

## Why this matters (your framing)
This is what keeps the **longitudinal behaviour graph** meaningful: a low-mood
check-in + a stressed reflection + dropping performance + fewer messages is a
*pattern* (medium signals converging) the AI now weighs as significant — while a
single off-hand note stays minor.

## Still open
- Proactive briefings + alerts (turn this weighted graph into push insight).
- Real AI memory/profile (replace keyword threads) + embeddings for cross-member
  patterns.
- Microsoft Graph / Google connectors (need your app registration).

Verified at node --check.
