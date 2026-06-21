# Update — Smart Import (AI auto-attributes data to members)

**Merged to main:** `8f337e1` (deploying) · asset `?v=20260621k`

## What it does
Upload a stat sheet, scouting doc, or any file → the AI reads it, figures out
**which members it's about**, and files the right data under each one. "Anything
about a member in a doc gets used and attributed."

- Stat sheet with a Name column + metric columns → per-member **metric** signals
  (Squat 1RM, 40-yd time, etc.).
- A Word/PDF/notes doc that mentions players → a concise **note** signal filed
  under each mentioned member.
- Everything then flows into the Advisor / Copilot automatically.

## How it works
- `POST /api/signals/import` sends the extracted file content + the requester's
  **visible roster** to the AI (gateway, reason tier, privacy gate).
- AI returns per-member `{ metrics[], note }`; server **fuzzy-matches** names to
  userIds and ingests signals — **scope-safe** (never attributes outside the
  people you can see) and faithful (won't invent numbers).
- Returns **matched** (who got what) and **unmatched** (names it couldn't place)
  so nothing is silently dropped.

## UX
Data Sources → Upload now defaults to **"🧠 Auto-detect members (smart import)"**.
"Whole organization" and "specific member" remain for when you want the raw file
kept as one source. Optional **public** flag carries through to imported metrics.

## Status / notes
- Works now for text-extractable files (Excel, CSV, Word, txt). Image/PDF upload
  still attaches as a document (smart-extract from scanned PDFs/images is a
  follow-up — would route through Claude vision).
- Quality depends on the file having recognisable member names. Unmatched names
  are reported so you can fix naming or assign manually.
- Verified at node --check; live check needs a leader login + a real file.

## Natural next steps
- Image/PDF smart extract (vision) for scanned stat sheets.
- Column-mapping preview ("this column = 40-yd dash") before import.
- Microsoft Graph / Google connectors (need your app registration).
