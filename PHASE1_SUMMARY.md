# Phase 1 — AI Gateway, Privacy Gate, Role Lenses, Individual Advisor

**Branch:** `claude/platform-work-summary-nmb0cm` · **Commit:** `f09922d`

Scope was held exactly as set: **no migration, current behavior preserved.** Additive only.

## What shipped

### New `ai/` layer (centralizes Claude usage — no more scattered calls)
- **`ai/gateway.js`** — one entry point. `micro`/`reason` model tiers (env-overridable), retry + backoff, and a graceful **downshift to Haiku** if the configured reasoning model isn't on the account, plus tolerant JSON parsing.
- **`ai/privacy.js`** — the **Privacy Gate** as a product law. `classifyText` → normal/sensitive/restricted; a two-tier context builder that structurally separates *citable* from *private-informing*; the `GATE_DIRECTIVE` ("inform, never reveal" with the exact good/bad example); and a `redact()` last-line defense that strips verbatim private spans from output.
- **`ai/lenses.js`** — role lenses (head coach / assistant / trainer / teacher / admin) that shape *what kind* of answer each requester gets.

### Individual Advisor AI (existing data only)
- `POST /api/advisor/:memberId/ask` — reasons over check-ins, weeklies, assessments, memory, notes, interventions, patterns, and predictions. Permission- and subtree-scoped (`view_insights`/`review_checkins`). Private content informs but never leaks; the answer is run through redaction before return.
- `GET /api/advisor/:memberId/threads` — prior Q&A, persisted via the new `advisorThreads` store.

### Write-time sensitivity tagging
- `POST /api/notes` — private/medical/family/counselor/trainer content is tagged at creation so the gate can act on it.

## Verification
- `ai` modules load; `server.js` passes `node --check`.
- Privacy/lens pure-function tests pass: classification, tier separation, **redaction blocks a leaked "mother in hospital" span**, and lenses differ by role.

**Couldn't boot here:** a live end-to-end advisor call needs `DATABASE_URL` + `ANTHROPIC_API_KEY` (neither is in this container). The endpoint reuses already-proven helpers (`getVisibleUserIds`, `_aggregateOrgData`, the data keys), so risk is low — but a real call against the deploy is the honest last check.

## Two notes
- The `reason` tier defaults to **`claude-sonnet-4-6`**. If the account/key is Haiku-only, set `AI_MODEL_REASON=claude-haiku-4-5-20251001` in the env — otherwise the gateway auto-downshifts on first failure anyway.
- Committed `package-lock.json` (was untracked) for reproducible installs.

## Next options
- Wire a minimal **frontend surface** ("Ask the Advisor" box on the member profile in `index.html`/`app.js`) to exercise it in the real app, or
- Pause Phase 1 here.
