# Diagnosis — "Nothing changed" + Leader Node issues

## 1. The deploy isn't running my work

- Render deploys from **`main`**. `main`'s latest commit is `a73748d Pilot Readiness`.
- All Phase 1 work (Advisor, alignment, privacy gate, smoke test) is on branch
  **`claude/platform-work-summary-nmb0cm`** — 7 commits ahead, **never merged to
  main, never deployed**.
- So "the latest commit" on the live site = Pilot Readiness, NOT my changes.
- Even if deployed, the Advisor shows on the **coach/admin** member-profile view,
  not the **member workspace** ("My Space") shown in the screenshot.

**To see my work live:** merge `claude/platform-work-summary-nmb0cm` → `main`
(or point Render at the branch).

## 2. Real bug: you're treated as a plain member, not a leader node

- The sidebar shows only "MY SPACE" — those are the nav items with NO permission
  requirement (`permission: null`).
- The "Leader Workspace" section (Dashboard, My People, Assignments, Intelligence)
  only renders when `Auth.isLeaderNode()` is true — i.e. when your user record has
  a non-empty `leadershipNodeIds`.
- Yours is empty → app treats you as a member.
- **Likely cause:** you're connected via the `supervisorId` tree but were never
  assigned as a **leader of a node** in `orgNodes`. Leadership keys off node
  `leaderIds`, not the supervisor chain.

**Deeper smell:** two parallel hierarchies exist — `supervisorId` (user tree) and
`orgNodes` (node tree). They can disagree, which is how you become "a leader" in
one and "a member" in the other.

## 3. Should a leader node get every tool but billing?

No — "everything but billing" lets any sub-leader rewrite org metrics, values,
permissions, and the global tree. The right model is a **scoped leader toolset**:

- ✅ My People, Assignments, Intelligence, Reports — scoped to their own subtree
- ✅ Add/onboard members INTO their own node  ← the missing capability you hit
- ❌ Org-wide settings (metrics, values, permissions, global tree, billing) — admin only

Current node-leader grants (server `/api/auth/me`): view_team, review_checkins,
view_insights, assign_scenarios, view_reports, view_members.
**Missing for "add members to my node":** a scoped edit/onboard capability.

## Recommended next steps (pick)

A. **Get my work live** — merge the feature branch to main so Render deploys the
   Advisor + alignment + fixes.
B. **Fix leader-node detection** — make `isLeaderNode` robust (and/or reconcile the
   supervisor vs node hierarchies) so leaders actually see the Leader Workspace.
C. **Add scoped "add member to my node"** for leader nodes.

These are independent; can do any subset.
