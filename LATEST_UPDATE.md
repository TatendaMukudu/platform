# Update — Smart Import via Vision (scanned sheets & PDFs)

**Merged to main:** `17ed99f` (deploying) · asset `?v=20260621l`

## What it adds
Smart import now works on **images and PDFs**, not just text files. Upload a
photo of a stat sheet, a scanned strength report, or a PDF table → Claude
**reads the image**, extracts the per-member rows/metrics, and files them under
the right members — same scope-safe attribution as the text path.

- `POST /api/signals/import` now accepts `media:{kind:'image'|'pdf', mediaType,
  data(base64)}` in addition to `content` text.
- Sends a multimodal message (vision/document block) via the AI gateway; reuses
  the same roster-matching + ingest, so nothing is attributed outside your scope.
- UI: choosing "🧠 Auto-detect members" and uploading an image/PDF shows a
  "Scanning…" state and reports who got what + unmatched names.

## Now covered end to end
- Excel / CSV / Word / text → smart import (text).
- **Image / PDF / scans → smart import (vision).** ← new
- Voice / metric / observation → quick log.
- Whole-file attach (org or one member) → plain upload.
All land on the one Signal contract the Advisor & Group Copilot read.

## Notes
- Uses the `reason` tier (Sonnet, auto-downshifts to Haiku) — both support vision;
  PDF document blocks supported. Large files OK (25 MB body limit).
- Quality depends on legibility + recognisable names; unmatched names are
  reported so you can correct.
- Verified at node --check; live check needs a leader login + a real image/PDF.

## Remaining big rocks
- Microsoft Graph (Teams/Outlook) + Google connectors — need your app
  registration; contract is ready.
- Move signals from JSON blob → Postgres + embeddings at volume.
