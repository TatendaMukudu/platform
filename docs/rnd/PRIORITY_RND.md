# IntelliQ — Priority R&D

**Status:** implementation-priority R&D only. This is intentionally narrower than `intelliq-rnd-program.md`.
**Rule:** items belong here only when the founder has explicitly promoted them from exploration into near-term product work.

## P1 — Conversation navigation for multiple private chats

**Founder decision, September 2026:** now that IntelliQ supports multiple private conversations, users need an effortless way to move between them. The current **New** + **History** controls prove the underlying capability, but discovery/navigation should feel closer to modern conversational products without resurrecting the old sectioned application sidebar.

### Existing capability to reuse

The backend already supports:
- multiple private conversations per user;
- list newest-first;
- reopen and continue a conversation;
- delete own conversation;
- bind a conversation to a High, Low, Inquiry or Focus through `about`;
- keep object/source privacy separate from the conversation;
- permanent-until-user-deletes history.

Do **not** build a second conversation store or copy conversations into Library.

### Desired UX direction

Create a compact conversation-history navigation surface — rail, drawer, sheet or similarly lightweight pattern — that lets a person:
- start a new chat;
- see recent conversations with human-readable titles;
- reopen and continue one;
- understand when a conversation belongs to a High, Low, Inquiry or Focus;
- move between a private chat, its bound object and that object's Forum without confusing those three scopes;
- access older history without turning Home into a dashboard.

This should work especially well on a phone. Desktop may expose a persistent rail; mobile may use a drawer/sheet. The exact visual form is UX work, but the information architecture is now priority.

### Important boundaries

- A private conversation remains private even when its bound object is shared.
- Forum is a separate room with a governed audience; do not render Forum speech as if it were part of the private chat history.
- A bound object may have more than one private conversation over time; the UI should not silently hide that fact behind only the newest matching thread.
- Do not resurrect the retired sectioned product navigation. This is **conversation navigation**, not app-module navigation.
- No duplicated conversation bodies, no parallel truth store, no client-derived permissions.

### Acceptance direction

A normal user should be able to answer, without thinking:
1. “Where are my other chats?”
2. “Which conversation am I in?”
3. “Is this private, or am I in the Forum?”
4. “How do I get back to the High/Low/Inquiry/Focus this conversation is about?”
5. “How do I start fresh without losing this one?”

Before implementation, produce phone + desktop mockups and test the information hierarchy against Coach and player flows.
