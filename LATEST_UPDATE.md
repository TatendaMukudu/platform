# Update — Logic-error pass (the "runs fine but wrong" bugs)

You asked what *logical* errors the algorithm could have — the dangerous kind
that never crash, they just hand a coach a confident wrong answer. I mapped them
and fixed the clear-cut ones. Two design-judgment items are left for a deliberate
pass (below).

## Fixed

**#1 — Durable memory was collapsing distinct life events into one.**
The dedupe merged two facts sharing ≥50% of their words. "father passed away" and
"mother passed away" share 2/3 → they were fused, and the second was silently
dropped. Now it only merges on high overlap (≥70%) measured against the *larger*
phrase, so distinct events stay as separate memories. Verified: the two
bereavements now stay apart; true restatements ("…passed away" → "…passed away
yesterday") still merge.

**#2 — "Activity" counted data logged *about* a member as activity *by* them.**
A coach uploading a stat sheet made a disengaged athlete look "active this week,"
suppressing the exact "gone quiet for 14 days" alert the feature exists to raise.
Now only the member's *own* inputs (check-ins + things they logged, `createdBy ===
them`) count as engagement.

**#3 — The "repetition" weight boost rewarded how much the coach typed.**
Three coach notes were treated as "repeated behaviour" and, with the recency bump,
a soft note could be promoted to "[strong]" and outrank a real assessment result.
Now: repetition counts only the member's *own* repeated inputs, and the strength
label reflects the source's *true* weight — recency/repetition still push things up
the ordering, but can no longer dress a note up as a hard outcome.

**#4/#5 — "What helped similar members" over-claimed.**
It could show a single outcome as "1/1 positive" like it was evidence, and a
"cohort" of one identifiable person (breaking the anonymity promise). Now: a
minimum sample of 2 before any result is shown, a minimum cohort of 2 before any
cohort/shared-pattern framing is returned, and a visible "early signal — treat as
a hint, not proof" caveat when outcomes are still thin.

**#8 — The privacy classifier was a single point of failure.**
It caught sensitive *topics* by keyword but missed first-person hardship with no
keyword ("I've been struggling, can't cope", a breakup, money worries) — which
then became quotable. Added a conservative SENSITIVE tier for personal/emotional
disclosure (bias: when unsure, informs-only, never quotable) and closed a family
gap ("passed away", "sibling"). Tuned to avoid false positives — "brotherhood"
and performance notes stay citable. Verified with a spread of test phrases.

## Left for a deliberate pass (product-judgment, not clear bugs)

- **#6 mood-decline detection** splits check-ins by count, not time, so an old low
  patch vs a fine present can mis-fire on small samples. Needs a real
  recency-weighted window — worth doing with you.
- **#7 trajectory has no hysteresis** — the label can flip on noise between 12h
  rebuilds. Wants a "don't change unless the evidence really moved" rule.
- **#9 check-in double-count** and **#10 goal key-mismatch → false 'unanchored'**
  are minor data-plumbing edges; low blast radius, easy to fold into #6/#7.

## Verification
- `node --check` on server.js, js/app.js, js/member-view.js, ai/privacy.js — all pass.
- Classifier behaviour tested directly (bereavement→restricted, hardship→sensitive,
  brotherhood/PR→normal). Memory-merge logic traced against the exact family case.
- All changes are on the failure/edge path; healthy inputs behave as before.
