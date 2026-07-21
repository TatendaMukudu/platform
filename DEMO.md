# IntelliQ — 7-Minute Demo Script

A calm, reliable walkthrough of the product as it ships today. Everything here works **without an AI
key** (deterministic fallbacks) and **without any connected apps**. Rehearse once end-to-end before a
live demo. Target: ~7 minutes, unhurried.

**One-line pitch (say this first):** "IntelliQ is one private assistant for an organisation — a member
thinks with it, it proposes actions, and nothing changes until they confirm. Leaders get support that
only ever uses what they're authorised to see."

---

## Setup (before the call)
- Sign in as the **member demo account** (see RELEASE_CHECKLIST → Demo account). Land on **Home**.
- Have a **second tab** signed in as the **leader/admin demo account** (for the leader-support beat).
- Confirm the seed data loaded: the member has at least one assigned item and a little check-in history.
- Keep the network stable. If it's flaky, read the **Recovery** notes below — the UI degrades gracefully.

---

## The demo (7 beats)

### 1 · Opening — the one surface (0:00–0:45)
- **Goal:** establish "one assistant, private by default."
- **Do:** Land on Home. Point to the greeting + the **hero composer**.
- **Say:** "This is the whole product — one composer. Private by default; nothing is shared unless they
  choose." Point to the empty-state line and the "Private by default" hint under the box.
- **Expect:** greeting, six lenses (Today/Me/Work/Notes/Plans/History), the empty-state prompt + chips.

### 2 · Capture a thought → a confirmable proposal (0:45–2:15)
- **Do:** Type: **"I feel good about this week and want to keep a plan for the launch."** Press Enter.
- **Expect:** a typing indicator, then a grounded reply and one or two **proposal cards** — a
  "Log this as today's check-in?" card (Private badge) and/or a "Save as plan" card.
- **Say:** "It proposes — it doesn't act. Every card shows exactly what will happen, its visibility, and
  it never writes until I confirm."
- **Do:** Click **Confirm** on the check-in card.
- **Expect:** the card becomes "✓ Logged as today's check-in — kept private."

### 3 · Correct, don't argue (2:15–3:00)
- **Do:** Type: **"Actually make that a private note instead."** (or use **Edit / Correct** on a card).
- **Say:** "Corrections change the proposal, never the original message, and never silently learn a
  preference."
- **Expect:** the proposal updates in place; the original message is untouched.

### 4 · Assigned work (3:00–4:15)
- **Do:** Open **MyWorkspace** (the assigned-work nav item). Point to an assigned card — status badge,
  instructions, fields.
- **Say:** "Assigned work lives as records. IntelliQ can help, but it never writes the assessment."
- **Do:** Click **"Ask IntelliQ about this"** on the card.
- **Expect:** it navigates to Home and drops a **work-context chip** on the composer, focused and ready.
- **Do:** Send the prefilled message; show the grounded, released-fields-only answer. (Optionally show a
  returned item's **score + feedback** block.)

### 5 · Leader support — same assistant, authorised context (4:15–5:45)
- **Do:** In the **leader tab**, open a member's profile → the **Ask IntelliQ** tab → **"Ask IntelliQ
  about this member."**
- **Expect:** navigates to the leader's Home; a **member-support subject chip** appears
  ("Member support: \<name\> · answers use only what you're authorised to see").
- **Do:** Send: **"How can I support them?"**
- **Expect:** a grounded, directional read (trajectory in words, never a hidden score); **no** private
  disclosures; an **Exit** control on the chip.
- **Say:** "Same assistant, one identity — but the evidence it can use changes strictly by who's asking
  and why. Private disclosures are never included, not even by implication."

### 6 · Privacy is visible (5:45–6:30)
- **Do:** Back as the member, point to the **Private** badges, the "Confirm to share" badge on anything
  outward, and (briefly) the **Apps** page: each app shows what it reads + a per-app privacy line, and
  nothing connects without an explicit action.
- **Say:** "Visibility is always shown. Increasing an audience needs a second, explicit confirmation."

### 7 · Close (6:30–7:00)
- **Say:** "One assistant, one private relationship, everything confirmable and explainable. That's the
  operating system." Return to Home (the calm empty state) to end.

---

## Fallbacks & recovery

| If this happens | What you'll see | What to do / say |
|---|---|---|
| **Network slow** | Typing indicator, then (after 30s) an error bubble **"That took too long to come back"** with **Try again** | Click **Try again** — the message is preserved. Say: "It fails safe and lets you retry." |
| **AI unavailable / no key** | Responses are the **deterministic** grounded lines (still real kernel output) | Nothing to do — it's designed to work without a key. Don't mention keys. |
| **OAuth disconnected** | Apps page shows **Connect** buttons; nothing is "connected" | Stay on the capture/proposal/leader-support beats — they need no apps. |
| **Empty demo data** | Home shows the **premium empty state** + chips; MyWorkspace shows "Nothing assigned right now." | Use the empty state as the opening: click a chip to seed the composer. |
| **Wrong navigation** | Any unknown destination **fails safe to Home** | Just carry on from Home — the router never leaves a blank screen. |
| **A proposal fails to confirm** | An **inline error** appears in the card (never a blank card) | Click **Confirm** again — the double-submit guard makes it safe. |

---

## Things **never** to click during a live demo
- **Disconnect** on a connected app (breaks the connected-state visuals for the rest of the demo).
- **Turn off** on an Assistant/Contribute permission (changes the privacy story mid-demo).
- Any **destructive** control: delete a note, delete a template, erase-member/GDPR actions.
- **Log data** / raw-signal entry (engineering-flavoured; not part of the story).
- Repeated rapid clicks on **Send/Confirm** — guarded, but don't stress it on stage.

## Known demo risks
- **First AI response latency** on a cold server can be a few seconds — fill the gap with the "it
  proposes, it doesn't act" line while the typing indicator shows.
- **Leader-support requires seeded evidence** for a rich answer; with thin data it will honestly say the
  trajectory is "unknown / unanchored." That's a feature — narrate it as honesty, not emptiness.
- **Mobile:** the lens bar scrolls horizontally on narrow screens (by design). Don't expect all six
  lenses visible at 360px.

## Recovery path (if something goes wrong)
1. Stay calm; the UI never shows a blank screen or a stack trace — it fails to Home or to a retry.
2. If a turn errors, click **Try again** (message preserved).
3. If the page looks stuck, navigate to **Home** — the canonical router re-renders the calm surface.
4. Worst case: refresh the tab and resume from **beat 1** (state is server-side; nothing is lost).
