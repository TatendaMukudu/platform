# Latest Update — B: Leader-Node Detection Fixed

**Branch:** `claude/platform-work-summary-nmb0cm` (committed; not yet merged to main)

## The bug
`leaderIds` on a node was only ever written by **manually editing a node** in the
Org Tree UI. Onboarding sets `supervisorId` (a different hierarchy), which never
granted leadership. So orgs built by onboarding had **empty `leadershipNodeIds`
for everyone** → every leader was treated as a plain member (member-only nav).

## The fix (robust leadership detection)

**Server (`server.js`):**
- `_isLeader(org, user)` — now true if ANY of: leads a node, **supervises ≥1 user
  (legacy supervisor tree)**, or leads a group. Covers all three structures, so
  however the org was built, real leaders are recognized.
- `_effectivePermissions(org, user)` — single source of truth:
  roleDefaults → `LEADER_GRANTS` (if a leader) → explicit overrides. Now used by
  `/api/auth/me`, `_userHasPerm`, AND `requirePermission` so client and server
  can never disagree (previously `_userHasPerm` ignored leader grants — a latent
  bug where member-leaders couldn't see their own subtree server-side).
- `getVisibleUserIds` — for `view_team`, now composes the visible set across all
  three structures: node subtree + supervisor subtree + led-group members.
- `/api/auth/me` now returns `leads: true/false` on the user.

**Leader grants (scoped, NOT org-admin):** view_team, review_checkins,
view_insights, assign_scenarios, view_reports, view_members.
Deliberately excludes manage_* / delete_members / manage_settings / billing, and
`view_analytics` (that's item D — leader metrics — coming next).

**Frontend (`js/auth.js`):**
- `isLeaderNode()` now uses the server `leads` flag (falls back to
  `leadershipNodeIds` for old cached sessions) → the Leader Workspace appears.

## Effect
A leader (node leader, supervisor, or group lead) now sees the **Leader
Workspace** (Dashboard, My People, Assignments, Intelligence) plus a
subtree-scoped People/Reports view — and can actually see their people.

## Verification
- `node --check` passes on server.js and auth.js; symbols wired.
- NOT run live (no DB/API key here). Needs a real login to confirm `leads:true`
  and the nav. The advisor smoke test's visible-members call also exercises this.

## Next
- Merge to main to deploy (awaiting your OK).
- Then **D** (leader Group Metrics/Health) and **C** (add members to my node).
