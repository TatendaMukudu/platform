# Latest Update — Safe Hardening Pass

**Merged to main:** `163c451` (deploying)

You asked to make the code more robust ("throw exceptions everywhere"). The
robust version of that is to *catch* at the boundaries and fail gracefully, not
literally throw — so that's what this does.

## Server (`server.js`)
- **Process crash guards** — `unhandledRejection` / `uncaughtException` now log
  loudly instead of taking the whole server down and signing everyone out.
- **Global API error handler** — any error thrown in a route, or a malformed JSON
  body, returns clean JSON (400/500) instead of crashing or leaking a stack trace.
- **/api 404** — unknown endpoints return JSON, not the SPA HTML page.
- **Real bug fixed:** request body limit was Express's default **100 KB**, which
  silently rejects base64 image/PDF attachments. Raised to **25 MB**.

## Frontend
- Already had global handlers (`window.onerror` + `unhandledrejection`) that show
  a recovery overlay — verified, kept as-is.
- (Earlier) Org Tree action buttons now toast "Tree still loading — refresh"
  instead of silently doing nothing.

## What this means
A single bad input or async bug in one request can no longer crash the server or
blank the app. Errors surface as messages/logs instead of silent failures.

## Verification
- `node --check server.js` passes; error handlers registered after all routes.
- Not run live here (no DB/API key) — deploys on Render.

## Still pending your call
- The **"People" → "Members"** rename: you didn't pick a scope yet. Tell me
  "nav + titles only" or "all visible labels" and I'll do it. (Left untouched
  for now to avoid a botched global rename.)
