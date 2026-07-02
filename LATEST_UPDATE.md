# Update — Stripped the presets: AI reasons from the org's OWN values

**Merged to main:** `38b4f02` (deploying) · asset `?v=20260621r`

You called it: the org already enters its values, so there shouldn't be a
separate worldview toggle. Done.

## What changed
- **Removed** the worldview presets (biblical/custom), the "AI Worldview" setting,
  its endpoints and storage, and `ai/worldview.js`.
- **New `ai/values.js`**: the AI builds its reasoning lens straight from
  `orgValues` — the values the org enters at setup and edits in **Settings →
  Values**. Empty when none are set.
- Still wired into every AI surface: Advisor, Group Copilot, briefings, notes,
  check-ins, weekly.
- Same guardrails: the values shape HOW it reasons, never the wording — no
  quoting, lecturing, or parroting.

## Effect
Whatever an org lists as its values drives the AI's perspective:
- A faith org listing "faith, grace, service, integrity" → grace-shaped, humane
  guidance, no religious special-casing, no preaching.
- A club listing "discipline, accountability, effort over ego" → the AI reasons
  from that.
One universal mechanism, entirely org-driven.

## Where values live
- Captured with the org profile at setup, and editable any time in
  **Settings → Values**. (Settings → Organisation now just links there.)

## Verification
- No residual worldview references; `node --check`; directive builder tested.
- Live check: set/adjust values, then try the Advisor and feel the shift.

## Still open
- Per-group values (a group can lean on its own values on top of the org's).
- AI memory/profile upgrade (replace keyword threads) + embeddings.
- Microsoft Graph / Google connectors (need your app registration).
