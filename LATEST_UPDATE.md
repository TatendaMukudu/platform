# Update — Data Sources hub (how leaders input & source data)

**Merged to main:** `49ba4e6` (deploying) · asset `?v=20260621j`

## The input model (your question, answered)
Data input is **not** an onboarding step — it's an **always-on Data Sources hub**.
Org goals at signup stay; a leader who appears later just opens the hub and feeds
data. Everything lands on the one Signal contract the AI already reads.

## What shipped — Leader Workspace → "Data Sources"
Three lanes + transparency:

1. **Upload** (works now) — stat sheets, film logs, Word, Excel, CSV, PDF, images.
   Parsed via the app's existing AttachmentHandler → ingested as a signal,
   attached to a **member** or the **whole org**, optional **public** (citable).
   The Advisor reads the content immediately.
2. **Connect** — Microsoft Teams / Google Workspace / Outlook cards. These are the
   declared OAuth slots (metadata, admin-consented). The connector code is the one
   piece that needs your Azure/Google app registration; the UX + contract are ready.
3. **Quick log** (built earlier) — voice / text / metric on the member profile.
4. **Transparency list** — "What IntelliQ can use": `GET /api/signals/recent`
   shows what's already feeding the AI, so the user KNOWS their data is in play
   (sensitive items summarised, never shown).

## How Teams will work (honest)
Teams/Google/Outlook = OAuth connectors via Microsoft Graph / Google APIs. They
sync **signals, not message content** (attendance, cadence, participation), which
is the easy consent + privacy story. They normalise into the SAME signal contract,
so once built they "just appear" in the transparency list and the AI's reasoning.
Until then, the **manual path** (upload exports / log) fully covers it.

## Status
- Built now: hub UI, file upload→signal (Excel/Word/CSV/PDF/image), org/member
  targeting, public flag, transparency list, AI consumption.
- Needs you: Azure/Google app registration to build the live connectors.
- Scale: move signals from the JSON blob to Postgres + embeddings at volume.

Verified at node --check. Live check needs a leader login; uploads use the
browser file picker; voice needs Chrome/Safari speech support.
