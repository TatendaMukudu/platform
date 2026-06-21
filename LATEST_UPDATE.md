# Latest Update — D: Leader Group Health (metrics on your group)

**Branch:** `claude/platform-work-summary-nmb0cm` (B already on main; D committed here)

## What D adds
A new **Group Health** page in the Leader Workspace — subtree-scoped metrics on
a leader's own people. Framed in the alignment canon: aggregate health + per-member
**directional states**, NOT a ranked scoreboard.

**Server (`server.js`):**
- `GET /api/workspace/group-health` (view_insights / review_checkins) — scoped to
  `getVisibleUserIds()` (the leader's subtree).
- Returns: participation (active 7d / 30d), wellbeing (mood 7d/30d + trend),
  engagement (has-goal, account set up), state distribution, and a per-member list.
- `_memberDirection()` classifies each member as converging / sustaining / stalled /
  diverging / **unanchored** (no goal) / unknown — from mood trajectory + activity +
  goal presence. No numeric score per person.

**Frontend (`index.html`, `js/data.js`, `js/app.js`, `css/styles.css`):**
- Leader-only nav item "📊 Group Health".
- `renderGroupHealth()` — headline stats, participation/engagement bars, wellbeing
  trend, a state-distribution row, and a member list ordered **by attention need**
  (diverging first) — a triage list, not a ranking. Each member is clickable →
  opens their profile (where the Advisor lives).

## Guardrail honored
"If a screen lets you sort people by a number, the screen is wrong." Members show a
**direction + short note**, never a score. Sorting is by state (triage), not value.
`view_analytics` is still NOT granted to leaders — this is purpose-built for them.

## Verification
- `node --check` passes on server.js, app.js, data.js; all wiring confirmed.
- Not run live (no DB/API key here).

## Next
- **C** — add/onboard members into a leader's own node (scoped create), then merge
  D + C to main to deploy.
