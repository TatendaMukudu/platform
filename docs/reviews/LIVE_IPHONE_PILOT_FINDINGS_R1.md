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
### 31. Focus recorded-events graph is not useful at one moment

Live iPhone reproduction shows `Recorded events` with a single blue point, a large amount of empty space, and explanatory copy that correctly says this is one moment rather than change over time.

The epistemic refusal is correct; the visualization is not.

Required fix:
- do not render a trend/chart surface when there is only one meaningful recorded moment;
- render a compact event/timeline/readout instead;
- only introduce a line/trend chart when there are enough ordered observations for change over time to be meaningful;
- chart semantics must come from the canonical event series, never decorative interpolation;
- reduce vertical space so the Focus conversation remains primary.

Classification: **PILOT UX FIX — replace one-point pseudo-chart with compact event state.**

### 32. A user turn/question can disappear from the visible Focus conversation

Founder reports asking a prior question in the Focus conversation and later finding that it had disappeared from the visible thread.

Required investigation:
- prove one send creates one durable human turn before any provider/model response is attempted;
- provider failure, deterministic fallback, object re-render, navigation, and retry must never remove the human turn;
- reopening the Focus must reconstruct the same ordered conversation;
- if multiple object-bound conversations exist, the UI must not silently switch to another thread and make a recent turn appear lost;
- add browser proof for send -> provider failure/degradation -> reload/reopen -> human turn still present.

Classification: **PILOT BLOCKER UNTIL REPRODUCED/CLOSED — possible durable conversation loss or thread-switching bug.**

### 33. Focus sharing must support named individuals and ad-hoc selected audiences, not only org-allocated groups

Founder requirement:
- a Focus may be shared with one specific person;
- it may also be shared with several specific people who do not constitute an allocated org-tree group;
- this must coexist with sharing to authoritative org groups / parent groups.

Current product already exposes `People I choose`; preserve that canonical audience mechanism rather than inventing a second truth store.

Required product model:
- `Only me` = private;
- `People I choose` = explicit selected-person audience, one or many current authorised contacts;
- `Org group(s)` = one or more authoritative groups/nodes the user is permitted to address;
- an ad-hoc selected-person audience is readership/collaboration only; it does not become a new empirical subject or org-tree node;
- Forum availability follows actual current readership (2+ authorised readers), not whether the audience came from a formal org group;
- removing a selected person revokes that person's object and Forum access on the next read;
- relationship/contact status alone never grants readership.

Composer enhancement:
- when IntelliQ asks whether to share, the choice UI may offer both named people and eligible org groups;
- named people can be multi-selected to form the existing selected-person audience;
- eligible groups should be derived from live authoritative membership/parent relationships;
- confirmation must show exactly who/groups will gain access before the canonical audience write.

Classification: **RATIFIED PRODUCT REQUIREMENT — use existing selected audience + org audience machinery, no new ad-hoc-group ontology.**

### 34. Focus suggestion answer can collapse/truncate in the rendered card

Live screenshot after `Can you give me suggestions on how to win and concede less?` shows an IntelliQ answer card rendered only as `There's nothing rec...` while the source control remains visible.

This may be a response-generation issue, clipping/height issue, or interrupted provider/fallback render.

Required investigation:
- distinguish server response truncation from client rendering/clipping;
- never render a visibly incomplete sentence as a completed assistant turn;
- if provider/network interrupts a response, show a bounded retry/recovery state rather than committing a fragment as the final answer;
- source disclosure must remain attached to the complete answer it supports.

Classification: **PILOT UX/RELIABILITY BUG — incomplete assistant turn visible as final output.**
### 35. Keep `Who can see this` as the pilot sharing control

Founder decision:
- keep the existing `Who can see this` control on Highs, Lows, Inquiries and Focuses for the pilot;
- this remains the simplest reliable way to share objects while the conversational sharing UX is still being worked out;
- do not remove or hide this control in favor of an unfinished Composer-only sharing flow.

Required behavior:
- `Who can see this` must use the same canonical audience owner across all four object kinds;
- it must support private, selected people, and eligible org-group audiences where already supported;
- changing audience must update Forum availability/readership immediately and revoke access when narrowed;
- no duplicate editor instances on repeated taps.

Classification: **RATIFIED PILOT UX DECISION — preserve direct audience control on all object pages.**

### 36. Inquiry/object detail pages still leak legacy profile taxonomy

Live iPhone screenshots show Inquiry detail and related object surfaces still rendering profile-era labels such as:
- `What they say they bring`
- `What it looks like when they are not at their best`
- `Where they are trying to get to`
- `What else they wanted known`
- `Where they want to get better`

These labels are not object-specific intelligence. They read like a generic profile questionnaire and make an Inquiry feel like a profile dump rather than one question being worked through.

Required fix:
- remove these legacy taxonomy cards from High/Low/Inquiry/Focus detail unless the card is directly relevant to the current object's evidence/question;
- object pages should follow one simple grammar: object title/status -> concise current read -> what supports/contradicts it -> what is still unknown -> private conversation -> Forum/audience where available;
- profile/background context may be used by IntelliQ internally and surfaced only when it materially explains the current object.

Classification: **PILOT UX BLOCKER — object detail is polluted by irrelevant legacy profile cards.**

### 37. `I don't have a read on this yet` conflicts with a populated working hypothesis on the same card

Live Inquiry example:
- header says `Where they are trying to get to`;
- card immediately says `I don't have a read on this yet.`;
- same card then says `Someone suggested: the stated need to work harder is driven by fear of losing current momentum...`;
- then `Nothing supports this yet` and a `STILL WORKING OUT` question.

This is internally contradictory. The system does have a candidate read/hypothesis; what it lacks is support/confirmation.

Required fix:
- separate states explicitly:
  - no read yet = genuinely nothing proposed/inferred;
  - working hypothesis = a candidate explanation exists but is unsupported/unconfirmed;
  - supported read = evidence has crossed the relevant threshold;
- never display `I don't have a read on this yet` above a non-empty hypothesis;
- if a hypothesis exists, say something like `One possibility we're still testing:` followed by the hypothesis and the unresolved question.

Classification: **SEMANTIC + UX BUG — epistemic state labels contradict the content.**

### 38. `Still working out` is useful, but should be scoped to the actual Inquiry

`STILL WORKING OUT` is directionally good because it exposes uncertainty, but current rendering often follows generic profile sections instead of the current Inquiry itself.

Required direction:
- keep the concept of `Still working out`;
- move it into the Inquiry's own concise summary block;
- show at most the highest-information unresolved question(s) for that Inquiry;
- avoid repeating generic profile unknowns that are not needed to resolve the current object.

Classification: **KEEP THE CONCEPT, SIMPLIFY THE SURFACE.**
### 39. High/Low/Inquiry/Focus list cards need one uniform summary grammar

Live iPhone screenshot shows inconsistent Focus list cards:
- one Focus card includes a long body/explanation plus `STILL WORKING OUT`;
- another Focus that has received substantial work shows only the title/status with no concise summary;
- the same inconsistency exists across Highs, Lows and Inquiries.

Founder decision:
- High, Low, Inquiry and Focus list cards should use one consistent summary grammar;
- card density should reflect the object's current state, not arbitrary creation path or legacy field availability;
- an object with more work/history should not look emptier than a less-developed one.

Required list-card grammar:
- title;
- status/standing;
- one concise current read or summary when available;
- one concise `Still working out` / next unresolved question when applicable;
- optional Forum/readership indicator;
- no long profile-style prose on some cards while peer cards are blank.

Do not force filler text. If there is genuinely no summary yet, show a plain honest empty state, but use the same structure across all four object kinds.

Classification: **PILOT UX CONSISTENCY FIX — unify object-list cards across High/Low/Inquiry/Focus.**

## Recovered live findings from the rehearsal

### 12. Composer placeholder text is clipped on Highs, Lows and Library

Live iPhone screenshots show the bottom composer placeholder truncated/cut off on multiple pages, including Highs, Lows, Library and at least one Focuses surface.

Required fix:
- fix the shared composer shell rather than page-specific patches;
- reserve width for attachment, mic and send controls;
- placeholder should fit, wrap intentionally, or use shorter page-specific copy;
- verify at real iPhone width.

Classification: **PILOT UX BUG — shared composer sizing/overflow.**

### 13. Duplicate current-turn submission visible during provider degradation

A live screenshot showed the exact same human message twice around a degraded-provider response.

Required investigation:
- determine whether this was an intentional second send or retry/replay;
- one send must create one durable human turn;
- repeated taps, provider fallback, reload and recovery must not duplicate the human turn.

Classification: **NEEDS REPRO — potential duplicate-send blocker.**

### 14. Focus outcome conversation does not record the user's reported failed tactic

User reported trying an extra defender and still conceding. The assistant clarified scope, but the Focus later still showed no outcome.

Required behavior:
- preserve the statement immediately as user-reported speech;
- do not silently promote it to canonical outcome without confirmation;
- once scoped to the current Focus, record tactic + reported result through the canonical outcome/attempt owner.

Classification: **LIVE SEMANTIC / WORKFLOW GAP.**

### 15. Model-generated response uses unsupported causal framing again

Live response bundled complacency, going ahead, communication breakdown and conceding into one explanatory hypothesis without clean evidence for every link.

Required behavior:
- separate observations from hypotheses;
- do not imply causality from aggregate stats or loosely related speech;
- ask what evidence would discriminate between competing explanations.

Classification: **REASONING QUALITY BUG — causal bundling.**

### 16. Low does not appear despite assistant saying the record now warrants attention

Live contradiction:
- assistant said there was enough to count as something worth attention;
- Lows page still said nothing needs attention.

Required fix:
- assistant prose and High/Low projection must read the same canonical standing owner;
- if threshold is not met, use language such as worth investigating / still a hypothesis;
- if threshold is met, the Low must appear end to end.

Classification: **PILOT BLOCKER — prose standing and canonical Low disagree.**

### 17. `Revise this focus` proposal appears when canonical Focus wording is unchanged

A proposal card offered to revise the Focus while presenting the same wording.

Required fix:
- suppress no-op update proposals when old and new canonical Focus state are equivalent;
- interpretation/history changes should not masquerade as a write.

Classification: **ACTION QUALITY BUG — no-op write proposal.**

### 18. Home cards still contain unclear legacy wording

Live Home screens show third-person/profile-era labels such as `What else they wanted known`.

Required direction:
- use direct first/second-person language for the current viewer;
- simplify empty states;
- remove profile-questionnaire wording from general Home/object surfaces.

Classification: **UX WORDING ISSUE.**

### 22. Focus conversation composer is effectively off-screen after long responses

On live iPhone Focus pages, the user must scroll through long object/history content to reach the private composer.

Required direction:
- keep one canonical Focus composer persistently reachable on mobile;
- long intelligence/history content must not bury the primary conversational affordance.

Classification: **PILOT UX BLOCKER — core interaction accessibility.**

### 23. Library is functionally empty/useless in live player flow

Player account shows an effectively empty Library despite active Focuses, conversations and attached material elsewhere.

Required product/UX review:
- decide whether Library is manual saved-items, a resource/file surface, or both;
- make Keep discoverable if manual;
- surface useful/recent resources;
- give attached materials a discoverable home if Library owns resources;
- remove implementation-facing copy.

Classification: **PILOT UX / PRODUCT GAP.**

### 24. Player-account Forum anonymity presentation is proven cross-account

Founder posted from one account and opened the same Forum from a second player account. The second account could read the post but did not see the original author's identity; the author-only `YOU` marker is local presentation.

Classification: **PASS — live anonymity presentation confirmed.**

### 25. Repeated anonymous-cohort refusal is noisy on personal conversations

The product repeatedly shows `Not enough people for a picture that stays anonymous — no cohort.`

Privacy behavior is correct, but the repeated full-card refusal is noisy.

Preferred direction:
- show it when cohort intelligence is explicitly requested;
- otherwise collapse/omit repetitive cohort-unavailable notices.

Classification: **UX NOISE / SIMPLICITY ISSUE.**

### 26. Player response overstates user-reported form

User reported scoring twice in the last three games. IntelliQ called that `real form`.

Required behavior:
- preserve provenance: `you've reported scoring twice in your last three games`;
- do not upgrade a short self-reported run into a settled performance finding without broader support.

Classification: **REASONING QUALITY / PROVENANCE TONE ISSUE.**

### 27. Focus/player response contains templated/meta phrasing

Live responses contain classification-style restatements such as `You're expressing a concern about...` that feel like internal interpretation templates leaking into the final answer.

Required direction:
- minimum useful answer first;
- fewer meta/classification restatements;
- one strong clarifying question rather than stacked interpretations.

Classification: **UX / RESPONSE QUALITY ISSUE.**

### 40. One-point pseudo-chart issue applies to Highs, Lows, Inquiries and Focuses

Founder correction:
- do not treat the one-point `Recorded events` problem as Focus-specific;
- audit the shared High / Low / Inquiry / Focus detail renderer and any per-kind variants for the same pseudo-chart behavior.

Required fix:
- all four object kinds must use the same visualization rule;
- one meaningful recorded moment => compact event/readout, not a chart;
- two or more ordered observations still do not automatically justify a trend line unless the semantics support change over time;
- only render a trend/chart when there is enough ordered evidence for the visual claim to be honest;
- never use decorative interpolation or imply movement from a single point;
- keep the object page vertically compact so conversation stays primary.

Classification: **PILOT UX CONSISTENCY FIX — shared chart/event rule across all four object kinds.**

### 41. Recheck external-source behavior across Highs, Lows, Inquiries and Focuses

Live iPhone surfaces currently show phrases such as:
- `No outside reading here — no concept to search on...`
- source counts such as `1 source` / `3 sources`,
while the actual provenance and usefulness of those sources are not always obvious.

Required audit:
- trace exactly what `sources` means on each object kind and on assistant messages;
- distinguish internal record/evidence, user-provided material, and external/web knowledge;
- external sources must never be presented as local empirical proof;
- source counts must open to inspectable source detail;
- if no external source was actually used, do not imply that one was;
- if an object has no governed query/concept suitable for outside reading, say that plainly without implementation jargon;
- preserve the requirement that IntelliQ messages expose compact inspectable sources at the bottom.

Classification: **PILOT PROVENANCE AUDIT — source labels and source counts must mean one thing consistently.**

### 42. Recheck suggestion generation for Focuses

Founder request:
- specifically re-audit how IntelliQ produces suggestions/options for a Focus after the live iPhone finding where `Can you give me suggestions on how to win and concede less?` yielded a collapsed/incomplete answer and weak grounding.

Required behavior:
- suggestions must be grounded in the current Focus, its attempts/outcomes, available internal evidence, prior relevant organizational learning, and cited external knowledge when genuinely used;
- external knowledge may inform an option but must be clearly sourced and must not masquerade as local proof;
- do not generate a recommendation/winner merely because the user asked for suggestions;
- offer a small set of justified options when evidence is sufficient;
- include uncertainty/why each option is being surfaced;
- do not recycle a failed tactic without explaining what changed;
- if the record is too weak, say what is missing rather than inventing tactical advice;
- no option may auto-create or auto-revise a Focus; human confirmation remains required;
- ensure the deterministic path and model path follow the same policy;
- add realistic live/browser cases for: no evidence, one failed tactic, multiple attempts, user-reported stats, external-source-backed option, and provider degradation/recovery.

Classification: **PILOT REASONING + PROVENANCE RECHECK — Focus suggestions must be useful, grounded and source-honest.**
### 43. Inquiry conversation still bleeds into unrelated team-draw context

Live iPhone reproduction on Titi's personal Inquiry (`Where they are trying to get to`) shows object-bound conversation drifting into a separate team-draws topic:
- `You're asking what's known about why there have been many draws this season...`
- subsequent answers ask whether the user is analysing this with the First Team group.

Required fix:
- object-bound conversation must keep the current object as the primary subject;
- related context may be consulted but must not silently replace the active subject;
- a topic switch should require an explicit user transition or a clearly signposted branch;
- add browser proof that unrelated recent/team topics cannot hijack a personal Inquiry thread.

Classification: **PILOT REASONING BUG — object/topic binding is not strict enough.**

### 44. Direct epistemic question can still receive an evasive/non-classifying answer

Live prompt: `Does the record actually support that, or is that just a hypothesis?`
Observed response: `That is the same part of the record I just showed you...`

Required behavior:
- answer the classification directly first: supported / unsupported / hypothesis / unknown;
- then explain why and cite the relevant record/source;
- do not dodge a binary epistemic question with navigation-style copy.

Classification: **PILOT REASONING QUALITY BUG — support-vs-hypothesis answer must be explicit.**

### 45. Assistant still tells users to record Highs/Lows

Live response asks whether the user is `interested in recording some Highs or Lows to give me actual evidence`.

This violates product law. Humans contribute observations/accounts/evidence; High/Low are governed standings produced by the canonical owner.

Required fix:
- remove any model/deterministic phrasing that asks users to create/record a High or Low;
- ask for the underlying observation/account instead;
- if the record later crosses standing thresholds, High/Low may surface canonically.

Classification: **PILOT SEMANTIC BUG — stale create-High/Low framing remains.**

### 46. `What could we try?` on Inquiry still fails to provide useful bounded options

Live prompt: `What could we try?`
Observed response declines to offer options, says it `ran out of room in one answer`, then asks broad follow-up questions.

Required behavior:
- if evidence is genuinely insufficient, say exactly what missing fact blocks action and ask the single highest-information question;
- if enough context exists, provide a small bounded option set with rationale/uncertainty;
- never mention internal answer-length limitations such as `ran out of room`;
- keep Inquiry and Focus suggestion policy consistent with canonical readiness state.

Classification: **PILOT UX/REASONING BUG — weak suggestion path and internal-limit leakage.**

### 47. Incomplete assistant sentence is still visible as a final answer

Live screenshot shows an assistant turn ending `Or are you ready to c` with controls/source count rendered beneath it as if complete.

Required fix:
- a truncated/partial sentence must never be committed/rendered as a finished assistant turn;
- detect incomplete provider/model output and retry or show an explicit recovery state;
- do not attach source controls to a fragment as though it were final.

Classification: **PILOT RELIABILITY BLOCKER — fragment-finalization bug persists live.**

### 48. Legacy third-person Inquiry label still present

Live Inquiry list/detail still uses `Where they are trying to get to` on the current user's own personal Inquiry.

Required direction:
- replace remaining third-person/profile-era labels on personal object surfaces with direct object-specific language;
- preserve the underlying primitive/data; this is presentation cleanup only.

Classification: **PILOT UX CLEANUP — legacy label still visible.**
### 49. Focus suggestion path lets attachment extraction dominate the answer

Live iPhone Focus test:
- user asked `What could we try next?`;
- response opened with a long raw visual/material extraction from `IMG_1918.png` (`Team header section`, logo, table position, fixture text, etc.) before addressing the Focus;
- the answer then fell back to asking what the user is actually worried about losing.

Required fix:
- attachment/material context should inform the answer, not be dumped verbatim into the answer unless the user asks to inspect/summarise the material;
- Focus suggestion responses should lead with the Focus-specific answer/question;
- keep source provenance inspectable at the bottom rather than narrating the whole extraction;
- do not let OCR/vision description crowd out the governed object context.

Classification: **PILOT UX/REASONING BUG — material extraction is leaking into final prose and overwhelming the Focus.**

### 50. Provider fallback occurs on strong local connectivity

Founder reproduced `IntelliQ's normal response isn't available right now...` while connected to Alma WiFi with usable cellular backup. This means the fallback cannot be assumed to be caused by weak client connectivity.

Required investigation:
- distinguish client network reachability from provider/backend failure, timeout, rate limit, cold start and upstream error;
- retry/backoff should be based on the actual failure class, not generic `network weak` assumptions;
- preserve one durable user turn and one response path;
- if deterministic fallback is used, the UI should not imply the person's network is at fault;
- log/trace the exact degraded reason internally so live pilot failures can be diagnosed.

Classification: **PILOT RELIABILITY BUG — degraded-mode trigger is too coarse / provider failure not distinguished from network.**

### 51. High/Low live tests currently unavailable because no canonical High/Low exists

Founder currently has no canonical Highs or Lows on the live account, so High/Low object-conversation rehearsal cannot be honestly performed without manufacturing state.

Decision:
- do not fabricate a High/Low solely to satisfy the test;
- rely on the existing canonical standing/browser proofs for merge readiness;
- if a real High/Low emerges before pilot, run the same object-bound questions (`why`, `what supports this`, `what remains uncertain`, `what could we try/do`) on it.

Classification: **NO DEFECT — live test unavailable due to truthful empty state.**