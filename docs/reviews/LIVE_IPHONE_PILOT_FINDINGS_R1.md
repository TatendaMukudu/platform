# Live iPhone Pilot Findings R1

Observed on the real Render build from Safari on iPhone during founder rehearsal.

## Must fix before pilot

### 1. Image attachment reaches the conversation shell but not IntelliQ's usable context

Reproduction:
- Attach a readable PNG screenshot (example: Highlanders FC 2026 statistics).
- UI shows the filename IMG_1918.png.
- Ask whether IntelliQ read the image.

Observed response:
- IntelliQ says no image came through / it cannot see or read the image.

Expected:
- Actual image bytes reach the vision gateway.
- Vision returns a bounded visual description.
- The description is bound to the same conversation/material context.
- Later turns can reason from that description with explicit provenance.
- Image-derived material remains external context, not independent empirical evidence.

This is a live end-to-end failure across upload -> vision read -> material binding -> conversation read.

### 2. Current-turn user-reported facts are being rejected as if they were never received

Reproduction:
After the failed image read, type the figures directly in the current message:
- 28 played
- 9 wins
- 15 draws
- 4 losses
- 1.50 PPG
- 0.93 scored per match
- 0.71 conceded per match
- home 5-8-1
- away 4-7-3

Observed:
IntelliQ says the figures are not in anything it has access to and that it cannot use numbers it has not received, even though the numbers are literally in the current turn.

Worse, the same answer then reasons from 15 draws out of 28, contradicting its own refusal.

Expected epistemic behavior:
- Current-turn user-provided facts may be used immediately as user-reported information.
- They are not independently verified merely because the user typed them.
- IntelliQ should say it could not verify the image but can reason from the figures the user just reported, clearly labelled as user-reported.

### 3. Unsupported explanatory leap

In the same answer IntelliQ suggested the issue may be about what happens tactically or mentally in the 10-15 minutes after taking the lead or conceding.

No 10-15 minute data was supplied.

Expected:
- The draw-heavy record can support the descriptive observation that many matches are not losses but are also not wins.
- It does not establish complacency, communication breakdown, tactical causes, mental causes, or a specific time window.
- IntelliQ should ask for the evidence needed to connect those hypotheses to the reported season record.

## UX issues found live

### 4. "What they say they bring" is unclear

Observed Home card:
- Heading: What they say they bring
- Empty state: I don't have a read on this yet.

The phrase is unclear to a normal user.

Preferred direction:
- What you bring
- Empty state: You haven't shared this yet.

### 5. Library empty-state copy leaks internal architecture

The current wording explains that cards are live references rather than copies. The underlying semantics are correct, but the page sounds like an implementation note.

Preferred direction:
- Explain the user benefit, e.g. save/keep conversations, Focuses and resources here so they are easy to find again.
- Keep canonical ownership semantics in the implementation, not in foreground copy.

## Live passes observed

- Mobile layout is generally usable on iPhone.
- Dark theme is legible.
- Focus proposal uses explicit Confirm / Edit and does not auto-create.
- Highs/Lows do not manufacture findings from a single user statement.
- Provider degradation fallback worked honestly.
- Provider later appeared to recover.
- Highs/Lows empty states are plausible with the current record; end-to-end live emergence still needs a deliberate evidence test.

## High / Low live verification still required

Use a real topic with multiple concrete observations.
Expected chain:
conversation / contribution -> governed inquiry/evidence -> valence/direction -> High or Low projection -> /api/objects -> rendered Highs/Lows page.

The live test should prove:
- one unsupported statement does not create a Low;
- multiple governed observations can establish a Low when the evidence points to risk/friction;
- progress/strength can establish a High;
- opportunity/neutral/data-gap do not enter either bucket;
- corrections/withdrawals recompute or remove the standing instead of leaving a stale card.

### 6. Focus capability mismatch: assistant denies a capability the Focus UI exposes

Live iPhone reproduction:
- A Focus was created from the conversation: "Focus more on wins and conceding less".
- In conversation, IntelliQ then said: "I can't add collaborators or change who sees this focus" and "The available actions do not include inviting collaborators to a focus."
- The actual Focus screen exposes "Who can see this" and an audience editor with "Only me", "Whoever leads a group I am in", and "People I choose".
- After audience change, the Focus screen showed a Forum with "9 can read this".

This is a product-capability contradiction. The assistant's capability model is stale relative to the real Focus owner.

Required fix:
- The assistant must know that Focus audience/participants are governed capabilities.
- It may propose or guide audience changes only through the canonical Focus audience owner and confirmation path.
- It must not claim a supported capability is unavailable.
- Do not create a parallel collaborator system.

Classification: **LIVE BLOCKER — assistant capability model and canonical Focus audience owner disagree.**

### 7. Unrelated calendar proposal surfaced while handling Focus collaboration

During the same flow IntelliQ proposed a "Draft a calendar hold (nothing scheduled yet)" action while the visible issue was Focus sharing/collaboration.

This is a relevance/intent-routing defect. A scheduling proposal should not pre-empt the user's active Focus-management intent merely because meeting/scheduling language is nearby.

Required fix:
- active object intent should dominate generic action proposal routing;
- calendar proposals require a clear scheduling request;
- no unrelated action card should appear during a Focus audience operation.

Classification: **REASONING / ACTION-ROUTING BUG.**

### 8. "Who can see this" audience editor duplicates itself on mobile

Live iPhone screenshot shows the Focus audience editor rendered three times in one scroll:
- repeated "WHO CAN SEE THIS"
- repeated visibility choices
- repeated Save / Cancel controls.

This is a real rendered-state defect, not cosmetic polish.

Required fix:
- exactly one live audience editor per Focus page;
- repeated taps/open calls must be idempotent and must not append duplicate editors;
- browser proof should double-tap/open repeatedly and assert one editor and one save target.

Classification: **PILOT UX BLOCKER.**

### 9. Focus outcome/relationship reading contradicts the Focus content

The Focus screen shows:
- title: "Focus more on wins and conceding less"
- status: being worked on

But the lower reading says:
"Still open: this focus does not say what it was started to work on; no outcome has been recorded yet."

The second clause may be true; the first is false on its face. The Focus clearly states what it is working on.

Required fix:
- outcome/loop reader must distinguish "no origin/source Inquiry link" from "no declared work";
- a Focus created directly from a conversation may have a clear B/commitment without an Inquiry origin;
- do not translate missing canonical relation into missing human intent.

Classification: **SEMANTIC READER BUG.**

### 10. Focus evidence/chart surface is visually under-explained

The live Focus page shows "Recorded events" followed by a lone blue point. The surrounding note says everything is from one moment and not a change over time, but the visualization still reads as an unexplained graph.

This is not necessarily false, but it is weak UX for a pilot.

Required direction:
- if one point has no meaningful trend, prefer a compact event/readout over a chart-like surface;
- never make one point look like a time-series finding;
- preserve the existing refusal to invent a line/trend.

Classification: **UX ISSUE — simplify rather than add charting.**

### 11. Focus page copy leaks internal epistemic architecture

Live copy:
"No outside reading here — no concept to search on — there is nothing here that is not somebody's own words."

The underlying rule is sound: a directly-created Focus may not have a canonical concept safe for external search. The wording is implementation-facing and confusing.

Preferred direction:
- say the useful thing, e.g. "No external sources are linked to this Focus yet."
- keep the reason (no governed concept/query basis) in inspectable provenance/debug detail, not foreground UI.

Classification: **UX WORDING ISSUE.**

### 19. Forum Ask IntelliQ calls a malformed live endpoint

Live iPhone reproduction on a Focus Forum:
- Forum opens correctly.
- Posting to the room works.
- Tapping "Ask IntelliQ about this" returns:
  "Unknown API endpoint: POST /group//forum/foc_rkvv6fnb/ask"

The path contains a missing group/node segment: /group//forum/...

This is not provider quality; it is a client/server routing/binding defect on the live production path.

Required fix:
- Forum payload must carry the canonical node/group id for the object/room.
- The Ask control must build the route from the same forum-access object that opened the room, never from guessed or optional UI state.
- For Focus Forums, ensure the route uses the correct node id and object id/kind combination expected by the canonical server owner.
- If the room is not group-backed, the UI must not draw an Ask control that points at a group-only endpoint.
- Add a real browser test that opens a Focus Forum from the Focus page, taps Ask IntelliQ, and proves a private answer renders without adding a room message.
- Mutation proof should blank the node id and require the gate to fail.

Classification: **LIVE PILOT BLOCKER — Forum Ask IntelliQ unreachable due malformed endpoint.**

### 20. Forum anonymity UI contradicts itself

Live Forum copy says:
"Everyone here is anonymous, including to coaches."

But each visible message is prefixed with "YOU".

This may be intended to identify the current user's own messages locally, but the screen currently reads as:
- room promises anonymity;
- message UI visibly attributes identity.

Required product decision/implementation:
- if "YOU" is client-only self-recognition and never visible to other readers, make that explicit in implementation/tests and ensure other readers see an anonymous label;
- if messages are truly anonymous to everyone including coaches, do not expose author identity server-side to room readers;
- preserve moderation/audit requirements separately from room presentation if needed;
- browser proof should compare the same Forum message from author and another reader.

Classification: **NEEDS PROOF / UX-POLICY CONSISTENCY ISSUE.**

### 21. Forum Ask error leaks raw route text to the user

The live UI displays:
"Unknown API endpoint: POST /group//forum/foc_rkvv6fnb/ask"

Even when a backend route fails, a normal user should not see internal route/method details.

Required fix:
- log exact route details for diagnostics;
- render a concise user-facing failure such as "IntelliQ couldn't answer this just now. Nothing was posted.";
- preserve the private/no-room-write guarantee on failure.

Classification: **PILOT UX / ERROR-HANDLING BUG.**
### 28. Network resilience threshold is too eager

Live iPhone observation:
- device still had Wi‑Fi and cellular connectivity, but weaker Wi‑Fi / brief network degradation caused IntelliQ to drop into deterministic fallback and show the 'normal response isn't available' banner.
- this is honest but too eager for ordinary mobile conditions.

Required reliability direction:
- tolerate transient latency and brief network loss before declaring provider unavailable;
- distinguish client connectivity, Render/network latency, provider timeout, and provider hard failure;
- use bounded retry/backoff for idempotent model reads;
- preserve the pending turn while reconnecting;
- avoid duplicate human turns on retry;
- only fall back to deterministic response after a short, explicit timeout budget rather than the first weak-network symptom;
- if fallback is used, allow silent recovery on the next turn and avoid repeatedly surfacing the full degradation banner;
- cache/reuse already-authorized context locally/server-side enough that a weak connection does not force a total conversational reset;
- never queue canonical writes that could execute twice after reconnect; writes still require idempotency keys / canonical confirmation.

Classification: **PILOT RELIABILITY ISSUE — degradation policy is honest but too sensitive for real mobile networks.**

### 29. Cross-account Forum anonymity presentation confirmed live

Founder posted from one account and opened the same Forum from a second player account.
Result:
- the second account could read the post;
- the original author's identity was not shown;
- the author-only `YOU` marker is therefore local presentation rather than identity leakage to other readers.

Classification: **PASS — live cross-account anonymity presentation confirmed.**
## Consolidated pre-pilot fix direction

These are the founder-observed fixes from the live iPhone rehearsal and should be treated as the current pre-pilot closure list. Do not redesign stable product law while fixing them.

### Must fix before pilot

1. **Image attachment end to end**
   - real image bytes must reach the vision gateway;
   - resulting visual description must bind to the same conversation/material context;
   - later turns must be able to reason from it;
   - image-derived material remains described/observed context, not independent empirical truth.

2. **Current-turn provenance**
   - text in the user's current message is immediately available as user-reported information;
   - attachment verification failure must not erase text the user explicitly typed;
   - assistant may reason from it while clearly distinguishing reported vs independently verified.

3. **Reasoning restraint**
   - do not infer tactical, mental, causal or time-window explanations that the record does not support;
   - separate observed/reported facts from hypotheses;
   - avoid evaluative upgrades such as calling a short self-reported run 'real form' without broader support.

4. **Assistant capability model vs actual Focus owner**
   - assistant must not deny Focus audience/collaboration capabilities that the Focus UI actually supports;
   - all audience changes continue through the canonical Focus audience owner and confirmation path;
   - no parallel collaborator system.

5. **Forum Ask IntelliQ**
   - repair malformed/missing node binding on Focus Forums;
   - private answer must come from the Forum/object governed projection only;
   - nothing is posted to the room automatically;
   - do not leak raw route/method errors to users.

6. **Canonical standing agreement for High/Low**
   - assistant language and High/Low projection must read the same standing owner;
   - if canonical Low threshold is not met, the assistant must not say the record now 'counts as something worth attention';
   - if threshold is met, the Low must appear end to end.

7. **Focus outcome/attempt capture**
   - preserve user-reported attempts immediately as speech;
   - once scoped/confirmed to the active Focus, record the tactic and reported result through the canonical outcome/attempt owner;
   - do not silently lose an attempt while clarifying.

8. **No-op Focus updates**
   - do not surface 'Revise this focus' when the proposed canonical state is unchanged;
   - interpretation/history changes do not require a fake write proposal.

9. **Shared composer mobile layout**
   - fix clipped placeholders on Highs, Lows, Library and other shared-composer pages;
   - keep one canonical composer but ensure text does not disappear behind attachment/mic/send controls.

10. **Focus composer reachability**
    - private Focus composer must remain persistently reachable on mobile after long responses/history;
    - do not make users scroll through the whole object page to continue the conversation.

11. **Audience editor idempotence**
    - exactly one 'Who can see this' editor per Focus;
    - repeated taps/open calls must not append duplicates.

12. **Network resilience**
    - do not fall back on the first brief network/provider wobble;
    - bounded retry/backoff for idempotent model reads;
    - preserve pending turn across reconnect;
    - no duplicate human turns or canonical writes on retry;
    - deterministic fallback remains the final safe path, not the first response to weak mobile connectivity.

### Pilot UX tightening

- Replace unclear personal-card wording such as 'What they say they bring' / 'What else they wanted known' with direct first/second-person language.
- Simplify Library copy; foreground user benefit, not canonical-reference architecture.
- Review Library product value: if it is manual saved items, make Keep obvious and surface useful/recent resources; attached materials need a discoverable home if Library is meant to be the resource surface.
- Replace one-point chart-like Focus visuals with a simple event/readout when no trend exists.
- Replace implementation-facing copy such as 'no concept to search on' with plain user-facing language.
- Reduce repeated cohort-unavailable notices unless the user actually asks for cohort intelligence.
- Keep response style concise: minimum useful answer first, one strong clarifying question, fewer classification/meta restatements.
- Preserve Forum anonymity behavior already proven cross-account: author may see local 'YOU', other readers must not receive identity.

## Candidate enhancement — conversational Forum sharing

Founder idea: while speaking privately in the Composer, IntelliQ may ask whether the user wants to share the emerging object/topic to a Forum. If the user says yes, present only audiences the user is already authorised to address — for example direct parent groups and/or the groups the user currently belongs to, by human-readable name.

Product constraints:
- this must be a thin conversational front-end over the existing canonical audience/share owner, not a new Forum/audience system;
- default remains private;
- nothing becomes shared until the user explicitly chooses an eligible group/audience and confirms;
- membership/parent options must be derived live from the authoritative org tree, including people who belong to more than one group or have multiple direct parents;
- do not infer a single parent;
- do not expose groups the user cannot address;
- sharing must not change the empirical subject or standing of High/Low/Inquiry/Focus;
- Forum creation/readership continues to follow governed audience law.

Pilot recommendation:
- **Do not build a new sharing architecture.**
- If this can be implemented as a small Composer proposal that simply calls the existing audience selector/confirmation machinery and lists already-authorised groups, it is acceptable as a low-risk polish item.
- If it requires new membership semantics, parent-resolution law, new write routes, or a parallel Forum creation flow, defer it until immediately after the pilot.

### 30. Remove standalone Attach material button from Focus pages

Founder live decision:
- remove the standalone `Attach material` control from Focus/object pages;
- users already have the attachment control in the Composer;
- attaching through the Composer is the clearer interaction because the material arrives in conversational context instead of as a separate page-level action.

Required implementation:
- remove/hide the standalone Focus `Attach material` button and any redundant page-level attachment affordance;
- preserve the canonical attachment/material owner behind the Composer path;
- do not remove the underlying material capability;
- ensure Composer attachments can still bind material to the currently open Focus/object;
- add browser proof that an attachment sent from the Focus Composer is bound to that Focus and survives reopen/reload;
- keep only one obvious attachment entry point on the page.

Classification: **RATIFIED PILOT UX CHANGE — simplify to Composer-only attachment entry.**