# Update — Values Lens (presets + custom), evolved from the worldview toggle

**Merged to main:** `59cc4dd` (deploying) · asset `?v=20260621q`

Per our discussion — the biblical toggle became a general **values lens**: an org
either **defines its own values in its own words** or picks a **preset**, and the
AI reasons from them. Bigger idea, same "reason from it, never preach or quote"
framing, and far less brand risk than a single religious switch.

## What changed
- `ai/worldview.js` → `buildDirective(key, customText)`:
  - **none** — universal (default).
  - **biblical** — Christian values, reasoned (no scripture, no quoting).
  - **custom** — wraps the org's *own* stated values in the same guardrails
    (values guide judgement quietly; wording stays plain; no lecturing, quoting,
    or parroting the values text).
- Settings → Organisation → "AI Worldview & Values":
  - Pick a preset → saves immediately.
  - Pick **Custom** → a textarea appears; write your values → Save.
- Server stores `worldviewValues` for custom; all AI surfaces (Advisor, Copilot,
  briefings, notes, check-ins, weekly) use it.

## Why this is better (the honest version)
- Once scripture is stripped, "Christian values" and "be humane/character-first"
  produce nearly the same output — so the real value is letting an org point the
  AI at *its* values. Custom makes that explicit and authentic (no guessing
  someone's theology).
- Future-proofs for any faith/philosophy/ethos without becoming a "worldview
  marketplace," and a secular org gets value from the same machinery.
- Stays opt-in and org-scoped — never Platform's identity.

## To use it for your org
Settings → Organisation → pick **Biblical**, or **Custom** and write your values.

## Verification
- `node --check`; directive-builder tests pass (custom + biblical).
- Live check: set it, then try the Advisor on a tough question and see if the
  tone reflects the values without getting preachy.

## Still open
- Per-group values lens (a Bible study inside a secular org).
- AI memory/profile upgrade (replace keyword threads) + embeddings.
- Microsoft Graph / Google connectors (need your app registration).
