# Latest Update — Leader "My Members" is now a TREE

**Merged to main:** `c697784` (deploying)

You asked: a leader should see only the sub-nodes below it, shown as a tree — not
a flat list. Done.

## Server
- New **`GET /api/workspace/my-tree`** — returns the leader's node tiers BELOW
  them (nodes they explicitly lead + the direct children of their own node),
  each node carrying its visible members, nested. Anyone visible but not in a
  shown node lands in a "Directly under you" bucket.
- Scoped server-side via `getVisibleUserIds` — a leader only ever gets the
  branch beneath them, never sibling/other branches.

## Frontend
- **My Members** now renders a hierarchical **tree**: each sub-node is a branch
  with its members nested under it, subtree counts per node, indented by depth.
- Search filters within the tree (empty branches hide while searching).
- Tapping a member opens their profile (where the Advisor lives).
- Old flat-list renderer removed.

## So for Tyler (in "Coach")
He'll see the **Player** node (and anything below it) as a tree with its members
nested — not a flat list, and nothing from other branches.

## To see it
Fresh load once: **`https://827l.onrender.com/?fresh=1`** (asset version bumped to
`?v=20260621e`).

## Verification
- `node --check` passes on server.js and app.js; single render function.
- Not run live here — needs a leader login to confirm.
