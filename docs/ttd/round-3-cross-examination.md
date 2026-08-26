# TTD Round 3 — adversarial cross-examination

> **SUPERSEDED.** Answered in full by `docs/ttd/intelliq-ttd-v1.md`, which this audit produced.
> Retained as history. Do not cite it as current law.

**From:** Claude (architecture)
**Verdict: NOT READY — FOUNDER DECISIONS REQUIRED.** Four blocking questions, listed at the end.
Everything else can be written now or discovered with users.

Every architectural claim below cites the code that supports it. Where I could not verify a
claim by opening the implementation, it is marked UNKNOWN rather than guessed — I asserted an
architectural gap without checking earlier in this project and was wrong, so the standard here
is a file and a line or nothing.

---

# Part A — Challenge

Seven issues that materially affect the product. I have not padded this list; several candidate
truths survived scrutiny unchanged and are not mentioned.

## A1. The evidence law systematically favours the organisation over the individual

**This is the most serious issue in the model, and it is invisible in the current framing.**

`ai/diagnose.js:deriveConfidence` counts independent origins (`originRef`), which is the right
anti-repetition rule. But consider the founder's own Round 2 Q4 case:

- Employee says: "My manager never gives me feedback." → **one origin**, self-report.
- Calendar shows 1:1s, Slack shows conversations, manager confirms. → **three or more origins**,
  two of them machine-generated.

The organisation *structurally generates more machine-evidence than an individual generates
testimony*. Connectors, calendars, ticket systems and chat logs all emit corroborating records
continuously; a person's account of their own experience emits one signal. So a rule that counts
origins will, over time and across every disputed case, systematically resolve against the
individual — not because the organisation is more truthful but because it is better
instrumented.

That is "evidence becomes majority rule" arriving through the back door, and it lands hardest on
exactly the people the product says it protects.

The founder already spotted the specific instance ("the existence of meetings does not prove
meaningful feedback occurred") but treated it as a one-off. It is structural. Two candidate
principles, and one must be chosen:

- **Different evidence classes answer different questions.** A calendar entry is admissible
  evidence that a meeting *occurred* and is *not* evidence about its *quality*. Machine evidence
  establishes occurrence; only a participant can speak to experience. These are not competing
  accounts of one fact and must never be totalled against each other.
- **Lived experience is not outvoted by instrumentation.** Where a self-report about one's own
  experience conflicts with inferred organisational data, the result is a *contested finding*,
  never a resolution against the person.

Without one of these written down, the epistemics quietly become "whoever has more sensors
wins."

## A2. Anonymised organisational learning re-identifies people in small teams

The model says private knowledge may become organisational learning once anonymised, and that
identity disclosure and knowledge promotion are separate questions. Both are right in principle.

In a team of six, "someone on this team performs better with written instructions than verbal"
is not anonymous. With two or three contributing signals it is often trivially re-identifiable,
especially by the manager, who knows the team. The promotion mechanism therefore leaks precisely
where the product's users mostly live — small teams.

`ai/diagnose.js:UNKNOWN_ORIGIN_CAP` shows the codebase already reasons in terms of "how many
independent origins does this rest on", so the machinery to express a threshold exists. What is
missing is a **k-anonymity floor for promotion**: a minimum number of independent contributing
origins, drawn from a minimum number of distinct people, below which a lesson cannot be promoted
even anonymised. That number is a product decision (Q1 below), not an implementation detail.

## A3. "Never feel watched" and connector-based behavioural inference are in direct tension

Round 1 Q6: "Never in a million years." Round 1 Q5: IntelliQ "can also learn through data and
connectors if they don't record things manually." Round 2 Q2 has IntelliQ learning that John's
Slack communication drops two weeks before performance declines.

That *is* monitoring. Benign in intent, individual-first in routing, but a system watching Slack
to infer a person's trajectory is doing the thing the word describes. The founder's instinct is
sound; the stated principle does not survive contact with the mechanism.

The distinction that actually holds is not *whether* behaviour is observed but three properties
that can be stated and enforced:

1. **The subject can see everything derived about them** — already partly real; `ai/audit.js:34`
   has a `belief_contest` event, so contest is a first-class audited action.
2. **The subject can switch a source off** for inference about themselves, and the system keeps
   working with less confidence rather than punishing the refusal.
3. **No derived intelligence about a person reaches anyone else without the subject's act.**

"IntelliQ is not surveillance" is a slogan until it is those three. Note property 2 is the one
with no evidence in the code, and it is the one that makes the other two more than decoration —
inspection without the ability to withdraw is a transparency theatre.

## A4. "Both entitled to their own opinion" contradicts the evidence constitution

Round 1 Q7 — when a manager and IntelliQ disagree, the founder said it is a grey area and both
are entitled to their opinion. That answer is out of keeping with everything else in the model.

IntelliQ is not entitled to an opinion. It holds claims, each with provenance, confidence and
uncertainty (candidate truths 9–12). A manager's disagreement is *new evidence* — a reported
observation from a well-placed source — and the honest outcome is a **contested finding** that
records both accounts, not a shrug that leaves a reader unable to tell what the system now
believes.

The vocabulary already exists: `ai/conversation.js:25` defines `CLAIM_STATES` including
`'disputed'`, and `:58` resolves to disputed when "two definite answers of different authority
AND different content" appear. The code is *ahead* of the stated product model here. The TTD
should adopt what the code already does.

## A5. Safety escalation is currently automatic, and the model says it should be governed

The founder wants tightly governed exceptions: trigger conditions, evidence thresholds, human
involvement, authorised recipients, minimum disclosure, auditability.

What exists (`ai/safeguarding.js:1-19`) is deterministic, two-tier, honest about the trade
("Safety outranks confidentiality here — and we say so, rather than promising a privacy we would
not keep"), and correctly independent of the LLM. It is good work and errs toward sensitivity
deliberately.

But CRISIS "routes a flag to the org's safeguarding lead" on **pattern match alone**. There is no
confidence threshold, no human-in-the-loop before disclosure, and the recipient is a role rather
than a named accountable person. The gap between "governed exception" and "regex triggers
disclosure" is the entire distance the founder says must not be crossed.

I want to be careful here: erring toward sensitivity on self-harm is defensible and I am not
arguing for a slower path to help. The question is narrower — **what is disclosed, to whom, and
does a human authorise it** — not whether to act.

## A6. "Individual first" is implemented as rendering, not as sequencing or consent

`ai/proactive.js` has `render.self` and `render.leader` variants with `audienceSafe()` ensuring a
leader-audience insight "carries ONLY a directional signal" with no private specifics
(`:11-22`, `:371-374`). That is genuinely good and it is real.

But it answers "what may each audience see", not "who is told first and who decides". The
founder's model is a *workflow*: John learns, John investigates, John chooses whether anyone else
is involved. What exists produces both renderings from one pass. Nothing in the code gives John a
window in which the leader rendering is withheld pending his decision.

These are different products. The rendering model is privacy-preserving disclosure; the founder
described *individual consent as a gate*. Only the first is built.

## A7. "Growth" is still undefined where it matters most, and paternalism has no off-switch

Two smaller but real issues:

**The activity/output/outcome/improvement taxonomy does not exist in code.** I searched
`ai/outcome-intelligence.js` for it; there is no such distinction. The module records
intervention → outcome pairs with `improved/steady/worsened/unclear`, which is outcome tracking,
not the four-level distinction the model calls for. Without it, "activity alone is not success"
is a sentence rather than a rule, and an organisation that defines success as ticket volume will
get exactly what it asked for.

**There is no way for a person to decline help.** If IntelliQ approaches John and John wants to
be left alone, nothing in the model says what happens. A system that keeps checking in on someone
who has said no is not supportive, and "the person benefits first" turns into "the person is the
first to be managed." Round 2 Q2 has the agent "checking in appropriately" indefinitely, with
"appropriately" undefined.

---

# Part B — Alignment against the code

| # | Candidate truth | Verdict | Evidence |
|---|---|---|---|
| 3 | Signal is the smallest observation | **ALIGNED** | `ai/diagnose.js` — signals carry `ref`, `status`, `originRef`, `originKind`; `SIGNAL_STATUSES` at `:190` |
| 4 | Inquiry is the main reasoning container | **ALIGNED** | `ai/diagnose.js:newInquiry`, `applyProposals`, `frontierFor`; `inquiryStates` partitioned per org in `server.js` |
| 9 | Every claim requires provenance | **ALIGNED** | `ORIGIN_KINDS` `ai/diagnose.js:163-170`; `originOf`/`normaliseOrigin` `:452-458`; unknown origin is the conservative default |
| 12 | Confidence and uncertainty visible | **ALIGNED** | `deriveConfidence` returns `{score, band, because}` — `because` is a human-readable justification array, `:205-240` |
| 14/16 | Corrections preserve history, visibly | **ALIGNED** | `supersede()` `:485-491` returns a NEW signal, keeps `supersededBy/At/Reason`; `:380-386` summarises what was corrected |
| 20 | Refuses surveillance as a business model | **ALIGNED** | `ai/org-context.js:12-14` hard-blocks private/wellbeing/surveillance content from becoming operating rules — refusal is structural, not policy |
| 21/22 | LLM is not the source of truth; works without it | **ALIGNED** | `ai/gateway.js:58` `deterministicOnly()`; `:137` "No-egress backstop: refuse to call any model in deterministic-only mode"; `ai/safeguarding.js:3` safety never depends on the LLM |
| 7 | Private knowledge does not auto-promote | **ALIGNED** | `ai/contribution.js` — the entire module exists for this; "Membership is not consent, and it is not relevance either" `:14` |
| 17 | Users can inspect and challenge models about themselves | **PARTIALLY ALIGNED** | `ai/audit.js:34` `'belief_contest'` is an audited event, so the right exists. What I could not find is the consequence — whether a contest reopens an inquiry or merely logs. See Q4 |
| 8 | Can disagree with humans, is not an oracle | **PARTIALLY ALIGNED** | `ai/conversation.js:25,58` has `disputed` as a first-class claim state. But the *product model* says "both entitled to an opinion" — the code is ahead of the stated truth (A4) |
| 6 | The person benefits first | **PARTIALLY ALIGNED** | `ai/proactive.js:11-22` `audienceSafe()`, `render.self`/`render.leader`. Disclosure is audience-scoped, but there is no consent gate or sequencing (A6) |
| 13 | Actions followed by measurement | **PARTIALLY ALIGNED** | `ai/outcome-intelligence.js` records intervention→outcome and now ranks by efficacy (PR #58). No activity/output/outcome/improvement taxonomy exists (A7) |
| 19 | Internal and external evidence contextualised | **PARTIALLY ALIGNED** | `retrieval.trustTier({provider, source})` in `_retrieveGrounding` tiers by source. Whether external research is weighed *against* internal outcome history is UNKNOWN — I did not find that path |
| 23 | Organisational truth established at onboarding | **PARTIALLY ALIGNED** | `ai/org-context.js` extracts objectives, responsibilities, requirements, rhythms — and **never auto-confirms**, a human does. That is the mechanism. Mission/values/vocabulary as a *constitution* is not the same thing as operating context |
| 15 | Learning must remain contextual | **PARTIALLY ALIGNED** | `ai/org-playbook.js` has candidate→entry promotion with `confidenceAtConfirmation`. Cross-context transfer with an explicit similarity test (the Jane case) — **NOT IMPLEMENTED** |
| 5 | Ask before judging | **NOT IMPLEMENTED** | `ai/diagnose.js` has `frontierFor`/`nextNeed`/`rankQuestions`, so question generation exists. A *rule* that a change must produce a question before a diagnosis — I found none |
| 18 | Knowledge sharing requires consent | **NOT IMPLEMENTED** | `ai/contribution.js:81` explicitly "Returns { scope, reason, groupLanguage } — **never a permission**". The Jane workflow (ask a third party before revealing their solution) does not exist |
| 24 | Org goals cannot override IntelliQ's constitution | **NOT IMPLEMENTED** | `ai/org-context.js` blocks surveillance content specifically, which is one instance. There is no general precedence rule and no adjudication path (Q3) |
| — | Safety escalation is governed | **CONTRADICTS** | `ai/safeguarding.js` routes a safeguarding-lead flag on pattern match, with no confidence threshold and no human authorisation before disclosure (A5) |
| 2 | Growth over activity | **NOT IMPLEMENTED** | No activity/output/outcome/improvement distinction anywhere in `ai/` |
| — | Personal development portability | **NOT IMPLEMENTED** | Founder marked OPEN; nothing in code. Correctly deferred |

**Overall:** the epistemic kernel is in better shape than the product model claims, and the
consent/governance layer is in worse shape. Provenance, corrections, confidence, origin
independence and LLM-independence are real and tested. Consent, adjudication, escalation
governance and the growth taxonomy are largely aspirational.

---

# Part C — Questions

Only questions where A versus B produces a different product.

### Q1 — MUST DECIDE. When individual evidence and organisational instrumentation conflict, what happens?

*Why it matters:* this is A1, and it is the question the whole privacy stance rests on. The
organisation is better instrumented than any individual, so any rule that totals evidence
resolves against people systematically.

- **(a) Separate domains** — machine evidence establishes *occurrence*, only participants speak
  to *experience*, and the two are never totalled. Produces a system that can say "the meetings
  happened and the feedback did not land" and treat that as coherent rather than contradictory.
- **(b) Contested finding by default** — any conflict between self-report and inference is
  recorded as contested and triggers an inquiry, never a resolution.
- **(c) Weight of evidence** — most origins wins. Simplest, and it makes IntelliQ an instrument
  of management by default whatever the marketing says.

My reading of everything you have said is that you want (a) with (b) as the fallback. But it has
never been stated, and (c) is what the code does today.

### Q2 — MUST DECIDE. What is the minimum for a lesson to be promoted anonymously?

*Why it matters:* A2. Below some threshold, "anonymised organisational learning" is a
description of one identifiable person, and your users are in small teams.

- **(a) A k-floor** — e.g. no promotion below N independent origins across M distinct people.
  Safe, and slows organisational learning in exactly the small teams that most need it.
- **(b) Consent-gated always** — anyone whose signals contributed must agree. Strongest right,
  highest friction, and effectively ends passive organisational learning.
- **(c) Anonymised freely above triviality** — fastest learning, and re-identification in a team
  of six is a matter of course.

The numbers in (a) are yours, not mine — they encode how much organisational learning you are
willing to trade for how much re-identification risk.

### Q3 — MUST DECIDE. When the Organisational Constitution conflicts with IntelliQ's, who adjudicates and what happens?

*Why it matters:* you have said org truth cannot override IntelliQ truth. Nothing says who
decides that a conflict exists, or what the product does next. This is your open question 14, and
it cannot stay open — it determines whether the constitution is enforceable or decorative.

- **(a) Deterministic refusal** — specific prohibited categories are hard-blocked in code, as
  `ai/org-context.js` already does for surveillance content. Enforceable, narrow, extensible only
  by shipping code.
- **(b) Escalation to a named human at IntelliQ** — flexible, judgement-based, does not scale and
  makes you the arbiter of customers' internal politics.
- **(c) Refuse the customer** — you have already said you would for surveillance. Is that the
  general mechanism or the extreme case?

Note (a) is the only one that survives you not being in the room.

### Q4 — MUST DECIDE. What must a contest actually do?

*Why it matters:* `ai/audit.js:34` logs `belief_contest`. Whether a contest merely *annotates* a
belief or *suspends* it is the difference between a right and a comment box, and it is the single
most load-bearing user-facing promise in the model.

- **(a) Contest suspends** — the belief stops grounding answers about that person until resolved.
  Strongest right; a person can silence a true finding by objecting.
- **(b) Contest annotates and reopens** — the belief becomes a contested finding, still visible
  with the objection attached, and an inquiry opens. Honest; the person cannot remove it.
- **(c) Contest is new evidence only** — logged, weighed, no state change. Weakest; closest to
  today.

### Q5 — CAN REMAIN OPEN. Can a person decline IntelliQ's attention, and what persists if they do?

A7. Needs answering before launch, not before TTD v1 — but if the answer is "no", the
individual-first principle is hollow, so decide it before anyone uses the product in anger.

### Q6 — CAN REMAIN OPEN. What is the activity / output / outcome / improvement taxonomy?

You have named the four levels. The definitions can be written during implementation provided the
TTD states that the distinction is mandatory and that an organisation may not define success
purely as activity.

### Q7 — DISCOVER WITH USERS. The five concepts, the home screen, and the first invitation.

Ask, Inquiries, Growth, People, Forum — and "What are you trying to improve?" You have already
said these are undecided, and they are genuinely a discovery problem. One caution: you named
Inquiries as the concept that proves someone understands the product (Round 1 Q12). If that is
true, the navigation should make Inquiries unavoidable, and a search-box home screen makes it
optional.

---

# Part D — Where I disagree with the proposed TTD structure

The sixteen-section structure is good and I would adopt most of it, with three changes.

**1. Sections 2 and 3 should be one section with a precedence rule between them.** Splitting
IntelliQ Constitution and Organisational Constitution into separate chapters invites them to be
read separately, which is exactly the failure mode. What matters is the *boundary*: what org
truth may set, what it may never set, and what happens on conflict (Q3). Write it as one chapter
called Constitutional Layers, with the precedence rule as its spine.

**2. Add a section the list is missing: Evidence Classes and What Each Can Establish.** This is
A1, and it is not covered by "Evidence/epistemic rules" as listed, which reads as being about
confidence and provenance. The rule that a calendar entry establishes occurrence and not quality
is a different kind of statement, and its absence is the biggest hole in the current model.

**3. Sections 14 and 16 should merge.** A "Decided / Open / Discover register" and "Executable
invariants/tests" are the same artifact at two levels of maturity: a decision becomes an
invariant becomes a test. Keeping them apart is how a decision gets made and never enforced —
which is exactly what happened with product law 2 and the language guard, where the law was
written and the test was never added, so the implementation breached it silently for months.

Otherwise the ordering is right, and Purpose first is correct.

One structural warning. This document, the TTD, will become the thing agents cite as authority.
I asserted a false architectural claim earlier in this project and it propagated into three files
before anyone checked it. **A TTD that cannot be checked against the code is a more dangerous
artifact than no TTD**, because it is more confidently wrong. Every product law in it should
carry either a citation to enforcing code or an explicit "not yet enforced" marker. Section 16
should be the place that mapping lives.

---

# Verdict

**NOT READY — FOUNDER DECISIONS REQUIRED.**

Blocking: **Q1** (evidence-class asymmetry), **Q2** (anonymity floor), **Q3** (constitutional
precedence and adjudication), **Q4** (what a contest does).

Those four are blocking because each one changes what the product *is*, and because three of the
four are currently implemented in a direction the founder has not chosen. Everything else in the
model is either settled, safely deferrable, or genuinely a user-discovery question.

Once those four are answered, TTD v1 can be written, and I would write Q1 and Q4 as executable
invariants in the same pass — they are testable, and a product law without a test has already
proven it does not hold here.
