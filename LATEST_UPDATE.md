# Latest Update — D + C shipped (Leader Workspace complete)

**Branch:** `claude/platform-work-summary-nmb0cm` → merged to **main** (deployed)

The leader-workspace trio (B → D → C) is now done and live.

## B — Leader detection (already deployed earlier)
Leaders are recognized across node leaderIds, the legacy supervisor tree, and
group leads. They now see the Leader Workspace.

## D — Group Health (metrics on your group)
- `GET /api/workspace/group-health` — subtree-scoped via getVisibleUserIds().
- Aggregate: participation (7d/30d), wellbeing (mood + trend), engagement
  (has-goal, set up), state distribution.
- Per-member **directional state** (converging / sustaining / stalled / diverging /
  unanchored / unknown) from mood trajectory + activity + goal — NO per-person score.
- New "📊 Group Health" leader nav page; members ordered by attention need
  (triage, not ranking); each clickable to their profile/Advisor.

## C — Add members to your subtree
- `create-user` now lets a **leader** add a plain **member** under themselves,
  even if the leader's own role is 'member'. New member is **forced into the
  leader's subtree** (supervisorId = creator); leaders cannot create anyone above
  member or place people outside their scope.
- "＋ Add Member" inline form on the My People page (name + email → invite to set
  password); list refreshes on success.

## Guardrails kept
- No leaderboards / no per-person scores (alignment canon).
- Leaders still do NOT get org-wide powers (manage_*, delete_members, settings,
  billing, view_analytics). Everything stays subtree-scoped.

## Verification
- `node --check` passes on server.js, app.js, data.js.
- Not run live here (no DB/API key). Real proof: log in as a leader → see Group
  Health populate and add a member who lands under you.

## Next options
- Run the smoke test / click-through on the live deploy to confirm B/D/C.
- Or proceed to Phase 2 (signals table + dual-write).
