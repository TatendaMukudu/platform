# Latest Update — Merged to main + Leader Workspace plan

## ✅ A. Merged to main (deployed)

- `main` fast-forwarded `a73748d` (Pilot Readiness) → `85747ef` (all 11 commits).
- Pushed to origin/main → Render will auto-redeploy.
- Now LIVE after deploy: Individual Advisor (alignment-aware), privacy gate,
  AI gateway, role lenses, smoke test, all docs.
- **Caveat:** the Advisor appears on the COACH/ADMIN member-profile view, not the
  member "My Space" workspace. And this deploy does NOT fix leader-node detection
  (that's separate code — item B below).

## Leader metrics — confirmed gap

- Node leaders currently get `view_insights` → the AI "Intelligence" page (patterns)
  scoped to their subtree.
- They do NOT get `view_analytics` → the quantitative Insights dashboards +
  Organisation Health. So leaders see the AI narrative but no group metrics.
- **Decision:** leaders should get metrics on their group — but as aggregate
  **Group Health + directional per-member trajectories**, NOT a ranked scoreboard
  (per the alignment "no leaderboard" law).

## Next work (Leader Workspace fix — pick order)

- **B. Leader-node detection** — make `isLeaderNode` reliable; reconcile the
  supervisor-tree vs orgNodes-leader mismatch so leaders actually see the
  Leader Workspace. (Blocks everything else.)
- **D. Group Metrics / Group Health** — subtree-scoped metrics for leaders
  (participation, mood trend, engagement, completion, who's drifting). Depends on B.
- **C. Add/onboard members to my node** — scoped create capability for leaders.

Recommended order: **B → D → C.**
