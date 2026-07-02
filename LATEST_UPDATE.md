# Update — Memory strengthened: durable per-person record + check-ups

**Merged to main:** `0e91997` (deploying) · asset `?v=20260621u`

Exactly what you described: memory is now a **persistent, accumulating record**
per person — significant things are kept "ready to pull," and the AI checks up.

## What's new
- **Durable memory (keyMemory):** the profile synthesis now also extracts
  SIGNIFICANT, lasting facts/events — a family bereavement, an injury, a big
  goal, a role change — and **accumulates** them in a per-member record that
  **survives even after the raw signals age out**. Each item is tagged sensitive
  or not, deduped, and bounded (sensitive kept longest).
- **Continuity:** prior memory is fed back into every rebuild, so the AI keeps
  remembering instead of starting over.
- **Follow-ups (check-ups):** it also notes gentle, safely-phrased things to
  check on later.
- No extra AI cost — all part of the same profile pass.

## How it's used (and kept safe)
- Fed into the **Advisor** as `[strong] Remembered…`: sensitive items **inform
  reasoning only, never exposed**; non-sensitive facts are citable.
- Profile card now shows **"Remembers"**, **"Check in about"** (follow-ups), and
  — when private matters are involved — a confidential note: *"Also informed by N
  private matters, kept confidential, used only to support them."*
- The leader never sees the raw private detail; they see that support is warranted
  and a gentle nudge.

## Your example, served
A player mentions a death in the family in a **private note** → it's remembered,
kept **sensitive**, informs the profile + a gentle follow-up ("a supportive
check-in may help right now") — and the raw detail is never shown to anyone.
It stays in the person's record, ready to inform care over time.

## Verification
- `node --check`. Live check: log a significant note on a member, rebuild the
  profile (↻), and watch it appear under Remembers / Check in about (or as a
  confidential "private matter" if sensitive).

## Still open
- Cross-member similarity ("members like this responded well to…") — embeddings/Postgres.
- Microsoft Graph / Google connectors (need your app registration).
