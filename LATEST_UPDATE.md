# Update — Bug-hunt pass (pre-testing review)

You asked me to check for bugs before you're back in California to test. I did a
full static review of everything we built this session — backend endpoints,
permission/visibility model, the signal layer, memory/profile, the advisor
context builder, group copilot, briefing, embeddings/pgvector, persistence, and
the frontend wiring. Here's the honest result.

## Bugs found & fixed (2)

Both were the **same class**: a write that reported success even when the server
call failed — so you'd be told it saved, lose your text, and (worse) sometimes
get locked out of retrying.

1. **Note save could falsely say "Note saved ✓"** (`js/member-view.js`).
   If the POST failed (e.g. session expired → 401, or a 500), the code fell back
   to an empty object, cleared your textarea, and showed the success toast — so
   the note was gone and you thought it saved. Now a failed save throws, keeps
   your text in the box, and shows "Could not save note."

2. **Weekly reflection submit had the same false-success — and it was worse**
   (`js/member-view.js`). On a failed submit it still marked the week complete in
   local storage and hid the button, so you couldn't resubmit that week. Now a
   failed submit shows the error and lets you try again; the week is only marked
   complete on a real success.

## Reviewed and clean (no changes needed)

- **Permission / visibility** — `_isLeader`, `getVisibleUserIds`, and the profile
  endpoints are consistent: a lead sees only their branch below; admins/superadmin
  see all. The three leadership structures (nodes, supervisor tree, groups) all
  compose correctly.
- **Onboarding required-fields gate** — front and back match (goal + ≥1 value for
  members; ≥1 value + ≥1 goal for orgs). The login "repair" path correctly
  bypasses validation ONLY for users who already finished onboarding (durable
  local flag), so existing users can't get locked out and new users can't skip it.
- **Privacy model** — sensitive items inform the AI but the profile endpoint only
  exposes a count ("informed by N private matters"), never the detail. The
  last-line `redact()` defence is in place on advisor answers and profiles.
- **Signal layer** — ingest/gather/weights are sound; weighting caps noise so a
  one-off note never outweighs results. Fire-and-forget embedding can't throw
  (gated + `.catch`).
- **Async endpoints** — advisor, profile, similar, briefing, copilot, import all
  guard nulls and wrap AI calls in try/catch with clean fallbacks. AI gateway
  handles both `user` and vision `messages` paths and downshifts if the reason
  model is unavailable.
- **Persistence** — every new store (`userAiProfiles`, `advisorThreads`,
  `orgSignals`) is both saved and hydrated on load. pgvector startup is fully
  non-fatal.

## One thing I left alone (by design, flagging it)

The coach quick check-in shows "Check-in saved" optimistically even if the call
fails (localStorage set up front, catch also says "saved"). That's a deliberate
low-stakes optimistic pattern and pre-dates this session, so I didn't change it.
Say the word if you'd rather it surface real errors too.

## Verification

- `node --check` on `server.js` and `js/member-view.js` after the edits — both pass.
- The fixes are behavioural on the failure path only; the success path is
  unchanged, so nothing that works today changes.

## Still open (needs you, not code)

- Live testing on your deploy (California) — this pass makes that smoother but
  isn't a substitute for it.
- Turn on embeddings (env vars) if/when you want true nearest-neighbour cohorts.
- Microsoft Graph / Google connectors (need your app registration).
