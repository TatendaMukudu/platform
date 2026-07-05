# Update — All remaining logic errors fixed

This closes out the logic-error list. #6, #7, #9, #10 are now done, on top of the
five from the last pass. Nothing on the "runs fine but wrong" list is left open.

## Fixed this pass

**#6 — Mood-decline detection now weighs time, not an arbitrary half-split.**
It used to cut a member's whole check-in history in half by count and compare the
two halves — so a low patch from months ago could still fire an alert today, and a
1-vs-2-point comparison passed as a "trend." Now it compares the **last 14 days**
to the **preceding ~4 weeks**, and requires **≥2 points in each window** before it
will call a decline. Verified: an old-low/now-fine history returns *nothing*, a
genuine recent dip returns *high*, one recent point returns *nothing*.

**#7 — Trajectory no longer flips on noise.**
The label (converging/sustaining/stalled/diverging) rebuilds every 12h and the
model could wobble between them on the same evidence. Added hysteresis: the prior
label is **held unless real new evidence accrued** since the last build (≥3 new
signals), and a real label can never regress to "unknown" on a noisy rebuild. A
leader now sees the direction change because the *person* changed, not because the
model re-rolled.

**#9 — Check-in double-count removed.**
`_memberSignalCount` summed entries under both the id-key and the legacy name-key,
so a member with data under both (or where the keys collide) looked like they had
more evidence than they did — triggering over-eager profile rebuilds. Now it
counts **distinct** check-ins by timestamp. (Also deduped the same way inside the
alert engine.)

**#10 — No more false "unanchored" from a key mismatch.**
Goals live under a stable id-key (onboarding) or a legacy name-key. If a record
was stranded under an unexpected/old key — e.g. after a name change — a member who
*had* goals could read as "unanchored," and the advisor would treat that false
absence as the finding. Added a resolver that checks the id-key, the current
name-key, then recovers any record whose stored name matches. Used everywhere the
"has a goal?" question is asked.

## Full logic-error list — status

| # | Issue | Status |
|---|-------|--------|
| 1 | Memory merged distinct life events | ✅ fixed |
| 2 | Coach-logged data counted as member activity | ✅ fixed |
| 3 | Repetition boost rewarded coach volume | ✅ fixed |
| 4 | "1/1 positive" shown as evidence | ✅ fixed |
| 5 | Cohort of one broke anonymity | ✅ fixed |
| 6 | Mood decline split by count, not time | ✅ fixed |
| 7 | Trajectory flipped on noise | ✅ fixed |
| 8 | Privacy classifier missed keyword-free hardship | ✅ fixed |
| 9 | Check-in double-count | ✅ fixed |
| 10 | False "unanchored" from key mismatch | ✅ fixed |

## Verification
- `node --check` on server.js, js/app.js, js/member-view.js, ai/privacy.js — pass.
- Mood-window logic tested directly against four scenarios (old-low, recent dip,
  single point, low-flat) — all correct.
- Trajectory hysteresis traced: holds on <3 new signals, accepts on ≥3, never
  regresses to "unknown", accepts freely on first build.
- All changes are on the edge/failure path; healthy inputs behave as before.

## What's genuinely left (needs you, not code)
- Live testing on your deploy.
- Turn on embeddings (env vars) for true nearest-neighbour cohorts.
- Microsoft Graph / Google connectors (your app registration).
