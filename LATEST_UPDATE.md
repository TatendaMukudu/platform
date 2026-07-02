# Update — Member profile is now a Data hub

**Merged to main:** `e6f867e` (deploying) · asset `?v=20260621v`

## First, your question: did we already build "remember data"?
Yes — in layers, and this uses them rather than duplicating:
- **Signals** (`orgSignals`) — the universal per-member store. Every input lands
  here: the strength coach's Excel (smart import → metric/sheet signals), what
  another coach said (notes/observations), voice notes, check-ins, assessments.
  Weighted, persistent, queryable. This IS the "keep all data about someone" DB.
- **Behavioral profile** — the AI-synthesised understanding built from signals.
- **Durable keyMemory** — significant facts/events that persist (bereavement case).

The Advisor already reasons from all of it. What was missing was *seeing* it.

## What shipped — a "Data" tab on the member profile
Everything collected about a person, in one place:
- Grouped by source (Assessments, Metrics, Game stats, Spreadsheets, Notes/
  observations, Check-ins, Weekly, Voice/Film…), strongest sources first.
- A **weight dot** per item (strong/medium/weak).
- **"＋ Log data"** right there.
- **Sensitive items shown locked** — "🔒 Private — informs the AI, not shown" —
  so they inform reasoning without exposing detail (privacy law upheld).

So: a strength coach uploads a weights sheet → it appears under **Metrics/
Spreadsheets**; another coach's observation → under **Notes**; a private
disclosure → a **locked** row that still feeds the profile + Advisor. The profile
becomes the person's living record, and it's the same data the AI pulls from.

## No new storage
This is purely a view over the signals framework we already built — the data was
always there and always used; now it's visible and organised.

## Verification
- `node --check js/app.js`. Live: open a member → **Data** tab.

## Still open
- Cross-member similarity ("members like this responded well to…") — embeddings/Postgres.
- Microsoft Graph / Google connectors (need your app registration).
