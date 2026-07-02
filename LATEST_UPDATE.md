# Update — Cross-member intelligence (v1) + profile-visibility confirmed

**Merged to main:** `5bac721` (deploying) · asset `?v=20260621w`

## Profile visibility (your rule) — already enforced
- Behavioral profile + Data tab (`/api/signals`) both gate on
  `getVisibleUserIds(...).includes(memberId)` → a **lead node only sees members
  in its branch below it**.
- **Admins/superadmins see everyone** (bypass via edit_members/superadmin).
- Members have no `view_insights`, so they can't open profiles; and out-of-scope
  members never load in a leader's lists.
If you saw a case that violates this, point me at it and I'll fix that path.

## Cross-member intelligence — v1 (works now, on existing data)
"Members on a similar path, and what's helped them."
- `GET /api/member/:id/similar`: builds a **cohort** sharing this member's risk
  patterns / declining trajectory, then aggregates which **intervention types had
  positive outcomes** for that cohort (falls back to org-wide when the cohort has
  little history). **Anonymous** — no other member is ever named. Scope-gated.
- Advisor tab shows a **"🔗 Similar patterns"** card: cohort size + what's tended
  to help (e.g. "Private conversation · 3/4 positive"), with an honest empty state
  until enough outcomes accrue.

## The scale upgrade (embeddings + Postgres) — scoped, needs provisioning
The v1 uses rule-based pattern overlap. The full version:
1. **Postgres `signals` + `member_profiles` tables** with **pgvector** (move off
   the single JSONB blob for these).
2. **Embed** each member's behavioral profile (+ key signals) via an embeddings
   API → store the vector.
3. **Similarity = nearest-neighbour** on the profile embedding (ivfflat index) →
   far better "who is genuinely similar" than shared-pattern matching.
4. Recommendations ranked by **measured effectiveness for nearest neighbours**,
   optionally **cross-org** (anonymised, opt-in) — the compounding moat.
This needs: the DB provisioned + an embeddings provider key. Say the word and I'll
build the migration + adapter behind the same endpoints (UI won't change).

## Verification
- `node --check`. Live: open a member with shared risk patterns → the card
  appears; sparse orgs see the honest "not enough history yet" state.

## Still open
- Embeddings/Postgres migration (above) — the scale version of this + memory.
- Microsoft Graph / Google connectors (need your app registration).
