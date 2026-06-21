# Latest Update — Hierarchy Leadership (fixes "coach sees nothing")

**Merged to main:** `84d0148` (deploying)

## The real problem with the structure
Your tree is tiered: **Management → Coach → Player**. Tyler is a *member of* the
"Coach" node — but being a member of a node never made you a *leader*. Leadership
only came from being explicitly ticked as a node leader, supervising someone, or
leading a group. So Tyler was correctly (but unintuitively) treated as a member.

## The fix: a tier above another tier = leadership
- **`_leadsViaHierarchy`** — if any node you belong to has sub-nodes beneath it,
  you lead that branch. So a person in "Coach" (which has child "Player")
  automatically leads the Player tier. No separate "mark as leader" step.
- **Visibility** now flows down the tiers: you see the people in the DESCENDANT
  nodes of your node (the tiers below). Your own-node peers are NOT exposed —
  only the levels beneath you.
- Explicit "Leader" assignment and supervisor/group leadership still work too.

## What Tyler should see now
After deploy + a fresh load, Tyler (in "Coach") gets the **Leader Workspace**
(Dashboard, My Members, Intelligence, Group Health) scoped to the Player tier
below him.

## Important: Tyler must load fresh code once
On Tyler's device: open **`https://827l.onrender.com/?fresh=1`** (or log out and
back in). His returning session then re-checks leadership and the workspace
appears.

## Note on the model
This makes node TIERS mean leadership (higher tier leads lower). If you ever want
two peers in the same tier where neither leads the other, keep them in sibling
nodes with no parent/child relationship.

## Verification
- `node --check server.js` passes.
- Not run live here — needs Tyler's fresh login to confirm.
