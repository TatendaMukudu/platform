# Update — Copilot revised + how it survives the move to business

## ✅ Shipped & deployed (`a57abf9`)
Group Copilot reframed per spec — "help the group reach its goals", not monitoring:
- **Signals-first**: computed from participation / activity / mood / goal signals;
  NO message content sent to the AI.
- **Aggregate-only**: suggested actions never name individuals ("3 members less
  active — reach out"), advice not exposure.
- **Dashboard not chatbot**: Health (directional + green/yellow/red), Participation %,
  Goal Progress (directional), Engagement Trend. No scores.
- **AI outputs**: suggested actions, discussion prompts (from goals/traits),
  weekly reflection — all aggregate, via gateway + privacy gate.
- **Consent gate**: lead must ENABLE Copilot; analysis only runs when on. Banner:
  "Group Copilot is active. It helps group leaders understand engagement and
  progress toward group goals." Shown to all only when active.
- New: `PUT /api/groups/:groupId/copilot-settings` (lead enable/disable).

---

## Strategic: will this survive the move to business (Teams/email)?
**Yes — and it gets stronger, BECAUSE we chose signals-first.**

### The trap (correctly spotted)
If the Copilot depended on Platform owning the chat, it would be dead weight in
companies that live in Teams/Outlook. Nobody migrates conversations to us.

### Why we're safe
The Copilot reads **signals, not messages**. Signals are channel-agnostic. The
killer feature is "how is my team doing + what do I do next" — identical for a
coach, pastor, or VP of Sales. Only the SIGNAL SOURCE changes.

| | Sports / club / church (now) | Business (next) |
|---|---|---|
| Signals from | check-ins, app activity, our group chat | Teams/Graph, Outlook, calendar, Slack, project tools, surveys |
| Examples | mood, attendance, message cadence | meeting attendance, response latency, calendar load, task completion |
| Delivery | in Platform | Teams app/tab/bot, Outlook digest, or Platform |

### The principle
Platform is the **alignment layer**, not another comms tool. A normalized Signal
stream feeds the Alignment Layer; the **source is a pluggable adapter**, and the
read is delivered where the leader already works. Our group chat is just adapter #1.

### Enterprise wedge
- Don't fight Teams — sit on top of it: "keep using Teams; we tell you how your
  people track against goals and what to do next."
- Signals-first is also the enterprise privacy answer: metadata is far less
  sensitive and easier to get admin consent for than message content.

### Roadmap implication (Phase 2, reframed)
The signals table = a **channel-agnostic ingestion contract** with source adapters:
- Adapter #1: group chat / check-ins (built).
- Adapter #2: survey/CSV or calendar import (cheap, proves the model).
- Adapter #3: Microsoft Graph (Teams/Outlook) — OAuth + admin consent, metadata-first.

The group-chat work is the beachhead source + reference implementation, not waste.

## Decision
Want me to design Phase 2 as this channel-agnostic Signal ingestion contract
(so the Teams/email future is built-in from the start)?
