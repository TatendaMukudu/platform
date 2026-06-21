# Latest Update — Org Tree buttons + how to make someone a leader

**Merged to main:** `e2d2927` (deploying)

## The buttons are wired, not toys
Verified in code:
- **Assign People** has a blue **Leader** checkbox → writes node `leaderIds` →
  grants the Leader Workspace. This is the path to making someone a leader.
- + Child / + Sibling / Manage / Move all open editors that call the backend
  (`/api/tree/node`).
- People → Org Tree loads nodes via `OrgTree.load()` before rendering.

## Why they looked dead: stale cached index.html
My no-cache fix only applies once Safari fetches a FRESH index.html — and it was
serving the cached one (old JS). Break the cache ONCE:

**Open:**  `https://827l.onrender.com/?fresh=1`

(or Settings → Safari → Clear History and Website Data, or use a Private tab).
After that, future deploys refresh automatically.

## How to make Tyler a leader
From the screenshot, Tyler is a MEMBER of the "Coach" node — not a leader of
anything, so he's correctly shown member nav. To promote him:

1. People → **Org Tree**
2. On the node he should lead (e.g. **Player** or **Coach**) → **👥 Assign People**
3. Tick the **blue "Leader"** box next to **Tyler Mukudu** → **Save**
4. Tyler **logs out and back in** → Leader Workspace + Group Health appear.

## Also fixed
- Tree action buttons now show a "Tree still loading — refresh" toast instead of
  silently doing nothing when node data isn't loaded yet.
- Asset version bumped to `?v=20260621c`.

## If buttons STILL do nothing after a Private-tab load
Then it's a real bug, not cache. Tell me what happens when you tap (e.g. nothing
at all vs. a flash) and I'll dig in.
