# Update — Group Goals/Traits shipped + Group Copilot vision

## ✅ Shipped & deployed (`2a39f05`)
Group-level **goals & traits**, editable only by a group's **leads**:
- Membership ≠ leadership — a plain member can LEAD an org-wide group (e.g. a
  Bible study) and set its goals, while only belonging to other groups.
- `PUT /api/groups/:groupId/aims` — lead-of-group (or admin) only.
- Leader Workspace → **My Groups**: edit goals/traits for groups you lead;
  read-only for groups you're only in; org values offered as quick-add traits.

This is the alignment **TEAM frame** made real at the group level.

---

## Vision: Groups as WhatsApp + an AI Copilot (Teams-style)
Groups become living spaces (chat) with an embedded Copilot that helps the lead.

**Already in place to build on:**
- Group chat/feed (`/api/groups/:groupId/feed`, messages incl. anonymous).
- AI gateway + privacy gate + Advisor (a Group Copilot = the Advisor pointed at
  a group instead of one person).
- Group goals/traits (just shipped) = what "good" looks like for the group.

**Copilot would:** summarize discussion, flag disengagement, draft prompts /
feedback for the lead, check activity against the group's goals — informing the
lead, never exposing members' private content.

### Non-negotiables (legal/ethical — monitoring conversations)
- Visible **"🤖 Copilot is in this group"** banner — never silent.
- Lead enables it; members are told; consent notice on join.
- Reasons over the group to advise the lead; never quotes a member to others.
- Sensitive content informs only, never disclosed; clean off switch.

### Suggested first slice (small, safe, real)
A **Group Copilot panel** for the lead: (1) short health/engagement read,
(2) 2–3 suggested prompts/feedback, (3) "who might need a nudge" — through the
privacy gate, with the AI-present banner. Reuses gateway + privacy gate +
group aims. Meeting feedback / deeper monitoring come later.

This is also the on-ramp to **Phase 2**: group messages become signals.

## Decision needed
Build the first-slice Group Copilot panel next? And confirm the consent/banner
model is how you want it.
