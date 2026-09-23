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


## P2 — Ratified pilot UI direction

**Founder decision, September 2026:** the current light, colorful, minimal mockup direction is the target UX direction for the pilot-facing product. This is not a request to redesign truth, authority, evidence, or object semantics. It is a presentation/interaction convergence task over the existing owners.

### Global navigation

- Use a compact **three-line hamburger at top-left** as the primary product navigation control.
- Keep the IntelliQ wordmark beside it.
- The dropdown/drawer should expose the product destinations with their symbols: Home, Highs, Lows, Inquiries, Focuses, Forum, Conversations/History, Library/Playbooks, Team/Organization, Settings as appropriate to authority.
- Remove the old persistent bottom navigation.
- High and Low navigation icons should use the same uniform navy/neutral stroke treatment as the other nav icons. The crooked/upward and crooked/downward arrow shapes remain, but **green/red belong to content meaning, not global navigation chrome**.
- Personal/account controls belong behind the user/avatar menu rather than occupying a first-class "You" destination in the main product nav.

### Uniform object pages

High, Low, Inquiry and Focus detail pages should share one learnable page grammar:
- compact object badge/type;
- title;
- status/update context;
- short summary;
- a small set of contextual insight cards;
- private conversation with IntelliQ;
- Forum entry when the object has a governed multi-reader audience;
- Composer at the bottom.

The object kinds should differ in **information**, not in basic interaction mechanics. Inquiry is the current reference structure. Focus may additionally surface target/B, review timing, participants, current experiment/attempts, previous attempts and outcomes because those are real Focus semantics.

Keep the experience **simple, colorful, insightful and intelligent**. Avoid dashboards that expose architecture or make the human operate a state machine.

### Forum naming and access

Use the product term **Forum** consistently. Do not label the doorway "Discuss with collaborators" or "Discuss with participants".

Any High, Low, Inquiry or Focus that has a governed Forum should expose a clear **Forum** access point.

Any Forum should expose **Ask IntelliQ**. IntelliQ may participate as a bounded facilitator/reasoning participant using only evidence/context available to that Forum audience. Invoking IntelliQ must not widen readership or import private conversation into the Forum.

### Forum authorship

Forum contribution identity is a per-message choice:
- anonymous by default where the configured Forum permits anonymity;
- the author may deliberately post under their identity for that message;
- do not silently persist a prior public/anonymous choice as consent for a later message unless the UI makes the current state unmistakable.

Identity choice changes attribution, not evidence standing. A Forum post remains speech until separately admitted through the governed evidence/contribution path.

### Reactions / likes

Forum reactions may be useful as a **social signal and candidate input** to understanding, but they are not empirical corroboration by themselves.

Do not turn likes into independent evidence origins, confidence inflation, or automatic High/Low standing. R&D may later study whether reactions are useful as a prioritisation, resonance or "worth investigating" signal.

### Audio playback

Where IntelliQ or a human message can be listened to, use a consistent media control:
- triangle **Play** when idle;
- **Pause** while playing;
- resume from the same point where practical.

Avoid separate speaker-icon semantics that vary by surface. The same playback control should appear consistently in private conversations, object summaries where audio is available, and Forum messages where permitted.

### Theme

Support the same design language in:
- **light mode** as the default pilot experience;
- the original IntelliQ **navy/dark mode** as the dark alternative.

The information architecture, spacing, accents and object semantics stay the same between themes.

### Imagery budget decision

**No automatic contextual image generation for the pilot.**

Do not spend model/image-generation budget decorating Highs, Lows, Inquiries, Focuses, Forum or Home. Revisit generated or approved organization-owned imagery only post-pilot, as recorded in `docs/rnd/intelliq-rnd-program.md`.

### Implementation boundary

This priority item is UX convergence, not permission to:
- create parallel truth stores;
- change High/Low/Inquiry epistemic law;
- change Focus ownership/lifecycle;
- widen Forum audiences;
- turn reactions into evidence;
- copy private chat into Forum;
- rebuild conversations instead of using the existing store.

Before broad implementation, preserve the existing browser/privacy gates and add focused rendered checks for the new navigation, consistent object-page grammar, Forum entry, Ask IntelliQ, authorship choice and play/pause controls.
