# Pilot work plan + market position

**Written:** 2026-08-15, ahead of the 21:00 Codex session.
**Companion to:** `docs/ttd/pilot-readiness-review.md` (the audit these tasks come from).

---

# Part 1 — The 21:00 plan, costed

## The economics we are working against

Two different cost shapes, and the plan should exploit both:

- **Codex is flat-rate.** Its tasks are near-free at the margin. It is bounded by task quota, not
  tokens. Idle Codex capacity is wasted money.
- **Claude is metered, and dominated by *context loading*, not thinking.** A long session is
  expensive because every turn re-reads it. Writing an invariant when context is already warm is
  cheap; re-auditing from cold is not.

The rule that follows: **front-load Claude once, then run Codex in parallel.** One expensive
Claude session should buy several free Codex cycles. Yesterday inverted this — Claude interleaved
with every Codex cycle and re-derived work the arbiter had already settled.

## What each of us is actually good at

| | Claude | Codex |
|---|---|---|
| **Strong** | architecture, deciding, writing invariants, spotting the thing nobody asked about | implementation against a clear test, mechanical fixes, breadth |
| **Weak** | expensive to re-contextualise; over-verifies | needs an unambiguous spec; will not challenge a premise |
| **Must own** | any decision, any invariant, arbitration | any change with a failing test in front of it |

## The session shape for tonight

**One Claude session, ~90 minutes, cold start.** Entry point is the two docs — not this
conversation. Deliverables:

1. Two design calls only I should make (below).
2. Three failing invariants: P0-1, P0-2, P0-3.
3. The closed-loop test P0-4 (mine end to end — it is the pilot verdict).
4. Three Codex briefs, written to be dispatched **in parallel**.

Then Claude stops.

**Three Codex tasks, dispatched together.** They touch different files and cannot conflict:

| Task | File | Conflict risk |
|---|---|---|
| P0-1 evidence retention | `server.js:6034` + cold path | none |
| P0-2 SIGTERM flush | save scheduler | none |
| P0-3 write conflicts | node/inquiry write paths | none |

**One Claude review session, ~15 minutes.** Read the verdict line. Read the diff **only** if a
test fails or the diff touches a file the brief did not name. That rule existed yesterday and I
broke it six times.

**Do not update the TTD register per cycle.** Batch it once at the end.

## The two decisions I must make before Codex starts

Codex will otherwise guess, and both guesses would be architecturally load-bearing.

**D-A · Where does evidence go when it leaves the working set?** Not "raise the cap" — that
defers the same failure. Options: a `cold_evidence` table resolvable by id; the existing durable
unit split extended to per-year units; or an explicit archive that retrieval knows to consult
when a citation misses. Whichever, the invariant is that **a citation always resolves or is
explicitly marked unresolvable** — never silently absent.

**D-B · Which objects get conflict detection?** Not a general framework. The contended set is
small: org nodes, inquiries, group subjects. Everything else is single-writer in practice. Name
those three and stop.

## Estimated cost

Roughly one moderate Claude session plus one short one, against three free Codex tasks. Compare
with yesterday: one very long Claude session, two Codex tasks, and the same amount of work.

---

# Part 2 — Market

## What IntelliQ actually is, without the architecture language

> Every organisation now has software making claims about its people. Nobody can tell you where
> those claims came from, whether they are still true, or whether the person they are about
> agrees. IntelliQ is the layer that makes organisational claims accountable.

That is the sentence. Not "organisational harness" — that is how we talk to each other, not how a
buyer hears value.

## The market, ranked by fit rather than size

**1 · Education — schools and multi-academy trusts. Recommended first market.**

Why it wins:
- **Safeguarding is a statutory duty**, so the budget line already exists. We do not have to
  create a category to get a purchase order.
- `ai/safeguarding.js` is already built, deterministic, works with the model off, and routes to a
  named safeguarding lead. That is the wedge — a thing they *must* do and currently do badly.
- Pastoral care already has the "the child's interest first" ethic. Our refusal to surveil reads
  as professionalism rather than as a missing feature.
- **MATs buy centrally** across 5–30 schools. One relationship, many sites.
- The unanswerable question in every school is *"did that intervention actually help this
  student?"* — which is exactly `outcome-intelligence`.
- Incumbents (CPOMS, MyConcern) are **record-keeping only**. They store concerns; they cannot
  tell you what worked. That is a real gap, not an imagined one.

**2 · Sport — academies and semi-professional clubs.**

The domain packs exist and the founder has real knowledge here, which shortens discovery
enormously. But budgets are small, sales are relationship-led and slow, and the elite end is
already served by Kitman Labs and Smartabase. Good second market, weak first one.

**3 · Professional services.** Genuine pain ("what worked on similar engagements") and higher
budgets, but no statutory hook, so it is a pure category-creation sale. Later.

**4 · Enterprise HR analytics.** Biggest market, worst fit. Those buyers want precisely the
surveillance we refuse. Every deal becomes an argument about our principles. **Avoid.**

## Pricing

**Per person, per year, banded. Not per-seat-per-month** — a seat price fights adoption, and this
product is worthless if half the organisation is not in it.

| Segment | Price | 300-person org |
|---|---|---|
| Education | £15–25 / pupil / yr | ~£6k |
| Sport / professional | £60–120 / person / yr | ~£25k |
| Minimum contract | £5,000 | — |

Reference points: CPOMS and MyConcern sit around £1–3k per school per year for record-keeping
alone. Pricing at 2–3× that is defensible **only** because we answer a question they cannot —
what helped. Athlete-management systems run £20k–100k, but for the professional tier.

**The pilot: charge, and charge small.** £2–3k for three months. Never free. A free pilot has no
internal champion, no urgency, and teaches you nothing about willingness to pay. A small paid
pilot tells you more in a month than a free one does in a year.

**The uncomfortable arithmetic.** At ~£6k ACV in education you need roughly 80 customers for
£500k ARR. That is a long grind. Three ways out, in order of realism: sell to MATs so one
relationship carries 10 schools; move up-market to sport/professional at 4× the price; or price
on outcomes rather than seats once you can prove them. **Do not solve this before the pilot** —
but know that the seat price is the constraint on the whole business.

## The investor pitch

**Problem.** AI is now generating claims about people inside organisations at scale, and none of
it is accountable. No provenance, no correction path, no right of reply. Meanwhile the EU AI Act
and GDPR Art. 22 are making automated inference about workers a liability rather than an asset.

**Insight.** Everyone is building the reasoning layer. Nobody is building the layer underneath it
that decides what may be reasoned *over* — and that is the hard part, because it is deterministic
work that AI cannot shortcut.

**Product.** An organisational record where every claim carries its provenance, corrections
supersede rather than erase, the person a claim is about can inspect and contest it, and evidence
never crosses a privacy boundary it was not given. The LLM reasons over that record; it never
becomes it. Turn the model off and the system still works — that is a test we can run on stage.

**Why now.** Compliance pressure is arriving at the same moment as AI-generated organisational
claims. The category is being created by regulation, not by vendors.

**Why us.** Eighteen months of deterministic kernel work that a prompt-wrapper competitor cannot
retrofit. It is enforced in code and covered by ~130 executable invariants. Our competitors would
have to rebuild from the bottom.

**Traction — be honest.** Pre-pilot. That is the weakness and it should be named first, before
they find it.

## What is good

- The kernel is a genuine moat, and it is the *unfashionable* half — which is why nobody else
  built it.
- Privacy is structural, not policy. `ai/forum.js` cannot create evidence because it contains no
  reference to evidence. That is very hard to argue with in a procurement conversation.
- Safeguarding gives a statutory wedge into a budget that already exists.
- The invariant discipline is real. "Show me your tests" is a demo we win.

## What will fail

Ordered by how much it should worry us.

**1 · Breadth before a customer.** 28,752 lines, ~130 suites, zero users. The evidence cap that
only bites after four months survived because nothing has ever run for four months. This is the
central risk and everything else is downstream of it.

**2 · The problem is real but nobody shops for it.** "Accountable organisational claims" is not a
search term. Selling it means education-selling — slow, expensive, and brutal for a solo founder.
This is why the safeguarding wedge matters: sell the thing with a budget line, let the kernel
accumulate value underneath.

**3 · The buyer for ethics is not the budget holder.** People/HR wants insight, Legal/DPO wants
safety, neither owns the line item. In education, safeguarding collapses this — one person owns
both. Another reason education goes first.

**4 · The refusal costs deals.** Every time a customer asks "can we also see X" and we say no, we
may lose. That is the price of the principle and it is not zero. Worth paying, but budget for it
in the funnel.

**5 · Price ceiling.** £6k ACV needs volume the founder cannot personally sell.

**6 · Team.** One founder and two AI agents. Investors will ask. The honest answer is that the
repo demonstrates unusual throughput — but it is still the first question.

## Does it look like we will fail?

**Not on engineering.** The engineering is well ahead of where it needs to be, which is itself
the diagnosis.

The realistic failure is a beautiful kernel nobody asked for, running out of runway before the
loop closes on one real organisation. The mitigation is not technical: fix four blockers, stop
building, and put it in front of one school or one academy that already has a safeguarding
budget and an unanswerable question about what actually helps.

The pilot's job is not to validate the architecture. It is to tell us which fifth of what we
built matters.
