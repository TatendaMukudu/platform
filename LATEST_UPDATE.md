# Update — AI memory/profile upgrade (real understanding, not keywords)

**Merged to main:** `599e566` (deploying) · asset `?v=20260621t`

The biggest intelligence upgrade: memory goes from keyword threads to an
**AI-synthesised behavioral profile** per member.

## What it is
For each member, IntelliQ now builds an evolving **behavioral understanding**:
- a **narrative** (2–4 sentences: who they are behaviourally, where they're trending),
- **tendencies** (how they respond), **driven by** (motivators), **watch for**
  (early signs), and a **trajectory** (converging / sustaining / stalled /
  diverging / unanchored / unknown).

## How it's built (and kept safe)
- Synthesised from the member's **weighted evidence** (signals, check-ins,
  weeklies, assessments, notes, interventions) — strong/repeated evidence beats
  one-offs.
- Runs **through the privacy gate** + the org's and the member's own values
  lenses. Sensitive detail *informs* it but is never exposed; any verbatim
  private span is redacted. So the stored narrative is safe to show leaders.
- Directional language, never scores.

## Kept fresh, not expensive
- Cached on the member's memory record. Rebuilt only when **stale (>12h)** or when
  **≥5 new signals** arrive. A "↻" button forces a rebuild.

## Where you see it
- **"What IntelliQ understands" card** at the top of the member's Advisor tab —
  narrative + trajectory badge + tendency/motivator/watch-for chips.
- The **Advisor now leads with this understanding**, so its answers reason from a
  synthesised picture, not just raw context.
- `GET /api/member/:memberId/profile` powers it (visible scope + view_insights).

## Note
Keyword capture still runs as raw material; the synthesised profile is the
primary understanding now surfaced and reasoned from.

## Verification
- `node --check`. Live check: open a member with some history → the card fills
  in; ask the Advisor and the answer should reflect the understanding.

## Still open
- Cross-member similarity ("members like this responded well to…") — needs
  embeddings/Postgres.
- Microsoft Graph / Google connectors (need your app registration).
