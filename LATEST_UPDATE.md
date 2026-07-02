# Update — Proactive briefing feed + Biblical worldview for the AI

**Merged to main:** `4596a82` (deploying) · asset `?v=20260621p`

## 1. Proactive "What needs you" feed (`c63ba4e`)
The weighted signal graph becomes **push, not pull** — auto-loads on the leader
dashboard.
- `GET /api/workspace/briefing`: deterministic **alerts** per visible member
  (gone quiet, mood trending down, low mood, dipped result, unanchored) with
  severity + a suggested action; plus an **AI briefing** synthesised from the
  aggregate weighted picture. Cached 2h, refreshable.
- Alerts favour converging patterns (mood decline across check-ins) over one-offs
  — using the weighting we just built. Alert list names members (leader's own
  view); the narrative stays aggregate.
- Dashboard shows a "What needs you" card at the top; each alert → opens the
  member's profile/Advisor.

## 2. Biblical worldview for the AI (`4596a82`)
Your ask: the AI should possess and exercise biblical knowledge, wisdom,
thinking, and values. Built as a **configurable org worldview** (a real vertical,
not a hardcode — secular orgs stay universal).

- `ai/worldview.js`: a substantive **biblical** directive — image of God, fruit
  of the Spirit, servant leadership, perseverance/character, accountability
  spoken in love, forgiveness, stewardship, hope — with "wisdom over quotation"
  and "grace, not condemnation" guardrails. Verses referenced only where they
  genuinely illuminate.
- Injected into the **Advisor, Group Copilot, briefings, note responses,
  check-in insights, and weekly responses** — so the whole AI reasons and
  counsels from it.
- Never overrides the privacy gate or alignment rules; it colours tone/reasoning
  within them.

### 👉 To turn it on for your org
**Settings → Organisation → "AI Worldview & Values" → choose "Biblical —
Christian wisdom & values".** Takes effect immediately across all AI surfaces.
(Default is "Universal" so other orgs are unaffected.)

## Verification
- `node --check` on server.js/app.js; worldview module loads.
- Live check needs an admin login to flip the setting, then any AI surface.

## Still open
- Real AI memory/profile (replace keyword threads) + embeddings.
- Microsoft Graph / Google connectors (need your app registration).
- Scheduled/push briefings + notifications (currently on dashboard open).
