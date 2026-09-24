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