# Update — Group Copilot (first slice) shipped

**Merged to main:** `4a5571a` (deploying) · asset `?v=20260621g`

A Teams-style Copilot for group leads, built on what we already have (group chat
+ AI gateway + privacy gate + group goals/traits).

## What it does
- **Lead opens a group** (Leader Workspace → My Groups → "💬 Open · Copilot",
  or the admin Groups view) → taps **"Get a read"**.
- Copilot returns: a **health summary** (how the group is tracking vs its goals),
  **suggested prompts/feedback** the lead can post, and **who may need a nudge**.
- Server: `GET /api/groups/:groupId/copilot` — lead-only; reads group
  goals/traits + shared feed + member activity through the gateway + privacy gate.

## Consent-first (the legal/ethical part)
- A visible **"🤖 IntelliQ Copilot is in this group"** banner shows to EVERYONE,
  never silent.
- Copilot is **lead-gated** and **advises the lead only** — it summarises themes
  and never quotes/attributes a member's words back to others.
- Member private content **informs but is never disclosed** (privacy gate).

## How it connects
- Uses the **group goals/traits** (shipped earlier) as the "what good looks like".
- This is the on-ramp to **Phase 2**: group messages become signals the Copilot
  (and the longitudinal memory) reason over.

## To see it
Fresh load once: `https://827l.onrender.com/?fresh=1`. Be a **lead** of a group
(set in Members → Groups), open it, hit "Get a read".

## Verification
- `node --check` passes on server.js and app.js.
- Not run live here (no DB/API key) — needs a real lead login.

## Natural next steps
- WhatsApp-style real-time group chat UI (richer conversation for the Copilot).
- Copilot "assist in conversation" (draft a reply / meeting feedback) inline.
- Phase 2 signals so the Copilot's reads compound over time.
