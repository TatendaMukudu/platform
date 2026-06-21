# Latest Update — Why the dashboard didn't change (two fixes)

**Merged to main:** `d0ab73d` (deploying on Render now)

"Pushed but the leader dashboard looks the same" had two compounding causes — both now fixed.

## 1. The browser was running the OLD JavaScript
`js/*.js` / css / html were served with default caching, so after a Render
redeploy the browser kept the stale bundle (very common on mobile Safari).
- Now sent with `Cache-Control: no-cache` (cheap — uses etag revalidation).
- Added a `?v=` query to local script tags so THIS deploy is force-fetched.

## 2. A returning session never re-checked leadership
When you're already logged in, the app booted straight from cached localStorage
and **never called `getMe()`** — so the new `leads` flag (from B) was never
fetched and the Leader Workspace stayed hidden.
- The restore path now refreshes `leads` + permissions + role from
  `/api/auth/me` before building the nav (merging only those fields so it can't
  wipe your onboarding state).

## What to do on your phone (one time)
The old files are still cached from before this fix, so do ONE of these once:
- Fully close the browser tab and reopen the site, **or**
- Log out and log back in.

After that you should see the **Leader Workspace** (Dashboard, My People,
Intelligence, Group Health) — and future deploys will refresh automatically.

## If it STILL shows member-only nav after that
Then it's not a code/cache problem — it means the data has **no leadership link
for your account** (you don't lead a node, supervise anyone, or lead a group).
That's fixable; tell me and I'll help check:
- What is your account's role? (member / coach / admin)
- Does anyone report to you / are you assigned as a node or group leader?

I can then either assign you as a leader of your group, or adjust your role.

## Verification
- `node --check` passes on server.js and app.js.
- Not run live here (no DB/API key) — needs your reload to confirm.
