# Claude — review round 1

**Read `docs/reviews/PROTOCOL.md` first and follow it exactly.**

Work on branch `claude/review-r1` off current `main`. Do not merge.

---

## My lane: the client, and the thing a person actually touches

I take this lane because it is the gap I have been reporting and not closing. Everything merged
on 6 September was asserted through HTTP read paths and a headless harness. **Nothing has been
opened in a browser or on a device.** Two agents reviewing server logic while nobody looks at
the screen is how a pilot arrives with a working backend and an app nobody can use.

**The client**
- `js/app.js`, `index.html`, `css/styles.css`, `css/member.css`.
- `scripts/ui-states-smoke.js`, `scripts/typography-smoke.js`, `scripts/css-token-smoke.js`,
  `scripts/frontend-smoke.js`, `scripts/mobile-inspect.js`.

**End to end, as a person**
- Drive the real app in Chromium at 390x844 against the seeded Alma organisation, signed in as
  `coach@alma.edu` and as `player@alma.edu`, and walk every surface: Home, Highs, Lows,
  Inquiries, Focuses, Library, the object thread, the composer, voice.
- Capture each state. Compare what the screen says against what the API returned. A surface that
  renders a refusal as an absence, or an absence as a reassurance, is the failure mode this
  product cannot afford.

**The four states, everywhere**
- Loading, failed, empty, populated. These have collapsed into two before, twice, in two
  different places, and each time the product told somebody their records did not exist because
  the request for them did not come back.

---

## Specific things to go at

1. **The Library shelf, rendered.** I built it and have never seen it. Folder chips, counts,
   rows, the remove control, the empty states (both of them: an empty folder is not an empty
   library), "Keep" on the object thread. Does `openFromShelf` actually land on the right thread
   for all six kinds? I route `material` to `focus` and `conversation` to Home, and I am not
   confident either is right.

2. **The Highs and Lows buckets with real data in them.** The seed now puts two Highs and two
   Lows in front of the demo player. Do two cards of the same kind render sensibly? Does the
   card say which road decided it — evidence or the person's call — in a way a player would
   understand, or only in a way I understand?

3. **The coach's withheld finding.** "There is one thing I can't put in front of you yet." Does
   that reach the screen at all? It is the single most distinctive thing this product does and I
   have only ever seen it in a JSON payload.

4. **Voice, on a real touch device if possible.** Filled STOP, composer ring, pulsing dot. The
   whole change was about being able to *tell* at a glance, and I verified it by regex.

5. **The 29 tap-target findings.** Re-measure. Some are inside larger touch areas and fine;
   confirm which, and fix the ones that are not.

6. **`_renderShelf` and the router.** `_renderNotesPage` now calls it. The nav item is still
   keyed `notes` and labelled `Library`. Check nothing else in the router or the deep-link path
   still expects the notes composer to exist.

---

## What I must not do

- Not re-litigate server laws. Those are Codex's and Astra's lanes. If I find something there,
  report it and leave it, unless it is breaking the screen.
- Not "improve" copy that is deliberate. The empty states, the refusal wording and the stance
  openers are all load-bearing sentences that took a decision to arrive at.
- Not fix a rendering problem by weakening what the server discloses.

## What I must be honest about

I wrote almost all of this code and all of its tests. My blind spots are already in the
assertions. The one useful thing I can do that the others cannot is **look at it**, so the bar
for this pass is a screenshot, not a regex.

---

## Deliverable

- Fixes on `claude/review-r1`, each with an assertion and a mutation that proves it.
- `docs/reviews/claude-r1.md` in the exact format the protocol specifies, with screenshots in
  `docs/shots/r1/`.
- `npm test` green on the branch.
- Do not merge.
