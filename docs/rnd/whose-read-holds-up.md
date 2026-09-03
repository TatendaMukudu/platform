# Whose read holds up

**Status: R&D note. Not a queue item, not scheduled, not promised to anyone.**
Recorded September 2026, after the ladder shipped. Founder asked for it to be kept.

## The idea in one line

The ladder now records, attributably, what each leader said about a person when it was put to
them. Over a season you can measure **which leaders' reads later turn out to be corroborated,
and in which areas** — by counting, with no model involved.

## Why this became possible this week and not before

Before the ladder there was no moment at which a named leader gave a read on a named belief and
that read was stored as its own origin. Leader opinion lived in briefings, in prose, unattributed
and unanchored. Now:

- a raise is anchored to one inquiry,
- each stop is one leader,
- a stop marked `read` becomes a proposal with `originKind: 'leader_report'` and
  `originRef: 'leader:<id>'`,
- and the kernel goes on to band that inquiry from everything it has.

So for any leader read there is later an answer to "did the belief this was offered about end up
supported, and did it end up pointing the way this person said?" That is a join over data that
already exists. Nothing new has to be collected.

## What it would produce

Not a league table of coaches. Something narrower and more useful:

> Reads from the strength staff on **load and recovery** topics have been corroborated 8 times
> out of 9. Reads from the same staff on **selection confidence** have been corroborated twice
> out of seven.

The unit is **leader × concept area**, because that is the shape of the founder's original
observation: a weight-room coach's evidence about a player is different in kind from a head
coach's, and each is worth more in their own area than outside it.

## The laws it must not break, all of which already exist

- **The two-sided cohort floor (MIN_COHORT = 5).** A count over a small staff names people by
  arithmetic. Nine reads from a staff of two is a report about two identifiable individuals.
  This must clear the floor in both directions or be withheld, exactly as team Highs are.
- **Origins, not people (L-OR1).** One leader is one origin however many times they speak.
- **Derived, never asserted (L-DC1).** "Corroborated" means the kernel later banded the inquiry
  `supported`, not that somebody agreed with them.
- **Contested is a finding.** A read that turned out to disagree with the eventual picture is
  not a wrong read. Two vantages differing is information, and the measure must not train
  leaders to say only the safe thing — which is the failure mode that would make this worse than
  useless.

## The failure mode to design against

A responsiveness or accuracy score attached to a named leader changes behaviour before it
measures it. If passing something on lowers your number, people stop passing things on
honestly; if giving a read that later looks wrong lowers your number, people stop giving reads.
The escalation ladder's value depends on both acts being safe to perform.

So the likely honest form is **self-directed**: shown to the leader about their own reads, as a
calibration aid, the way a forecaster sees their own Brier score. Whether it is ever shown to
anybody else is a founder decision and is NOT taken here.

## Cost to build, roughly

Small. It is a join and two counters over `raises` and `inquiryStates`, plus the cohort floor
that already exists in `ai/team-state.js`. No model, no new store, no new egress. The reason it
is in R&D rather than in the build is the behavioural question above, not the engineering.

## What would have to be decided first

1. Is it ever visible to anyone but the leader it describes?
2. Does a read that diverges from the eventual picture count against anything at all, or is
   divergence only ever recorded as divergence?
3. Does it wait for enough season data to clear the cohort floor honestly, or ship withheld and
   fill in? (The Highs precedent says: ship withheld, and say why it is withheld.)
