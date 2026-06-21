# Update — Universal Input Layer baked in

**Merged to main:** `03821cb` (deploying) · asset `?v=20260621i`

Your thesis — **more input → stronger output** — is now a real architectural
contract, additive and ready to navigate around.

## What's in now
**One Signal contract for any data, any modality.**
- Normalized Signal: `{ source, modality, subjectType (member/group/org),
  subjectId, category, label, valueNum, valueText, data, sensitivity, public }`.
- Modalities: text · number · voice transcript · sheet row · event · file · feed.
- **Source registry** (pluggable): check-in, note, voice, film, metric, sheet,
  game stats, document, external feed — plus **Teams / Google / Outlook** declared
  as future OAuth integrations so the rest of the system already accounts for them.

**APIs**
- `POST /api/signals/ingest` — single or batch; scoped (self, or a member/group
  you can see/lead); auto-classifies sensitivity; `public:true` = AI may cite.
- `GET /api/signals`, `GET /api/signals/sources` — sensitive text redacted for
  non-leaders.

**AI consumption (input → output now)**
- The Advisor already reasons over ingested signals: public/normal = citable,
  sensitive = inform-only (privacy gate). So "your strength coach logged these
  numbers / public game stats" flows straight into the advice.

**Frontend proof (multi-modality)**
- "＋ Log data" on a member profile: **Observation** (text), **Metric**
  (label + value, optional *public*), and **🎤 Voice** (browser speech-to-text →
  transcript). All land as signals.

## How this answers the business/Teams question
The Signal contract is **channel-agnostic**. Today's adapters: voice, metric,
note, check-in. Tomorrow's: TeamBuilder-style sheet imports, public game feeds,
and the big ones — **Microsoft Graph (Teams/Outlook)** and **Google Workspace** —
plug into the SAME `ingest` contract. No rework; just new adapters.

## Honest status / next adapters
- Built now: in-app voice/text/metric + the contract + AI consumption.
- Cheap next: CSV/Excel row import (SheetJS already in the app) → bulk signals;
  public game-stats feed.
- Bigger (need OAuth + your app registration): Microsoft Graph, Google. The
  contract is ready for them.
- Scale: move `orgSignals` from the JSONB blob to a Postgres table + embeddings
  (the original Phase 2/3 step) once volume grows.

Verified at `node --check`; live confirmation needs a real login (voice needs a
browser that supports speech recognition — Chrome/Safari).
