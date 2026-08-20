# Expression, initiative, and the JARVIS principle

**Status:** architecture exploration. Nothing implemented, nothing queued for pilot.
**Verdict: the Expression layer already exists and is called `ai/behaviour.js`. Do not build a
second one. What is genuinely missing is one enum.**

---

# The proposition under test

> IntelliQ does not primarily generate answers. IntelliQ develops understanding and chooses how
> best to express that understanding.

**The first half is already true and structurally enforced. The second half is half-true: the
architecture chooses *whether*, *when*, *to whom* and *in what order* to express — but not *in
what form*.**

---

# 1. The Expression layer exists

`ai/behaviour.js:2-24`. Its own header states the separation the founder is reaching for:

> *"The operating system owns awareness. The assistant owns conversation. The kernel owns truth.
> Privacy owns boundaries. **Behaviour owns delivery.**"*

It already owns:

- grouping understanding into sections
- ordering — *"lead with a win"*
- volume limits
- **silence — "nothing deserves surfacing" is success**
- the assistant's opening message

And the boundary is not a convention. It is **structural**: the file *imports nothing* from the
kernel, evidence, server, AI or the projection's reasoning, and therefore cannot create insights,
change confidence, change audience, increase visibility, bypass privacy, or interpret evidence.
`scripts/governance-smoke.js` enforces that delivery lives only here and that every surface
consumes one pipeline.

That is a stronger guarantee than the founder's proposed layer would have had. Understanding →
Expression → Human is not a design to adopt; it is a description of what runs.

**Answering Q4 directly — should Expression be an architectural boundary?** It already is one,
enforced by import graph rather than by rule. Introducing a second concept called "Expression"
would create a parallel layer competing with `behaviour`, which is the exact failure `orgGoals`
demonstrates elsewhere in this codebase.

---

# 2. Initiative is already graduated — and better named than the proposal

The founder proposes Observe → Express → Suggest → Prepare → Act. Compare what exists:

| Proposed | Implemented | Where |
|---|---|---|
| Observe | reasoner tick forms beliefs internally, surfaces nothing | `ai/reason.js` |
| — | **readiness**: `ripe` / `held` — a thin belief is held back, not shown | `ai/reason.js:_readiness` |
| Express | `register`: `support` / `scout` / `acknowledge` — *what kind of moment this calls for* | `ai/reason.js:_register` |
| — | **timing**: the natural moment a real event creates | `_timing`, `ai/reason.js:346` |
| Suggest | every proposal carries `requiresConfirmation` | `proposalFrom`, `ai/brief.js:35` |
| Prepare | governed artifact render, reversible, unsent | `render-artifact-smoke` |
| Act | explicit human confirmation; no machine write path exists | reviewed previously |
| *(none)* | **silence as success** | `ai/behaviour.js:12` |

The existing model is **richer** than the proposed one in two ways worth keeping:

- **`register`** encodes *what kind of attention this deserves* — a wellbeing risk calls for a
  person-first check-in, a performance risk calls for a focused review. The proposed ladder has
  only volume, not kind.
- **`readiness`** separates "we believe this" from "this has earned attention", which is what
  makes restraint structural rather than a threshold someone tunes.

**Answering Q5 — where does initiative belong?** It is already split correctly across three
places, and that split is load-bearing: the *kernel* decides whether something is believed,
*proactive* decides whether it is safe for an audience, and *behaviour* decides whether it is worth
saying now. Collapsing those into one "initiative" module would put privacy and restraint in the
same file, and the whole reason `behaviour` cannot leak is that it never sees the evidence.

---

# 3. The personal canvas is already implemented, with the right consent semantics

`ai/priority-office.js` takes explicit `prefs.preferredBuckets` and `prefs.pinnedFirst` into
ranking — expression adapts to the person. And `askFirstOffer` does something better than that:

> *"You often look for X first. Want IntelliQ to lead with that when it is available?"*
> — with `requiresConfirmation: true`

That is inferred-from-behaviour preference that **proposes rather than silently reorders**. The
distinction matters more than it looks. An inferred preference applied silently is engagement
optimisation; an inferred preference that asks is assistance. This codebase already picked the
right one.

**Answering Q6 — how do preferences influence expression without influencing truth?** They already
do, structurally: preferences reach `priority-office` and `behaviour`, both of which sit
*downstream* of the kernel and cannot alter confidence, audience or visibility. Truth is computed
before preference is consulted. The ordering of the pipeline is the guarantee.

**The trap worth naming.** If preferences are inferred from behaviour *and* applied silently, you
get engagement optimisation by the back door — the system learns to show what gets clicked. The
existing safeguard is consent, not declaration, and it is sufficient **as long as `askFirstOffer`
remains the only path from inferred preference to changed expression.** That is worth an invariant
later; it is not worth one now.

---

# 4. What is genuinely missing: a representation vocabulary

Everything the system expresses today is **prose**. I searched `behaviour`, `brief` and `proactive`
for `timeline`, `chart`, `graph` — nothing. There is no point in the architecture at which
IntelliQ decides *"this understanding is better as a timeline than a sentence."*

**But the governance pattern for solving it already exists**, one file over. `ai/brief.js:27`:

```js
const OFFERS = { … };                                   // an allow-list
function _offer(action, text) { return { action, text, requiresConfirmation: true }; }
safe: offers.every(o => (o.action in OFFERS) && o.requiresConfirmation === true)
```

A governed vocabulary of trusted primitives, where the intelligence may *select and populate* but
not *invent*, and where `safe` is computed from membership in the allow-list. That is precisely the
founder's "generative freedom inside deterministic boundaries" — **already built, for actions.**

So the missing piece is not a layer and not a framework. It is the same pattern applied to a second
vocabulary:

```js
const EXPRESSIONS = ['observation','question','comparison','timeline','trend',
                     'contradiction','provenance','silence'];
```

…with the same discipline: the model may choose a member and populate its typed slots; deterministic
code owns what data may fill them, what claims may be made, and how it renders.

**Answering Q8 — how does IntelliQ choose?** The selection input already exists and is
computed: `polarity`, `severity`, `confidence`, `readiness`, `register`, `limitations`,
`contested` state, and evidence count. A *deterministic* selector over those fields covers most
real cases — several signals over time is a trend, two conflicting accounts is a contradiction,
thin evidence is a question. **A model is not required for the first version, and starting
deterministic is how the vocabulary earns its members.**

---

# 5. Where I would challenge the founder

**5.1 · The risk is not aesthetic, it is epistemic.** A representation choice *is* a claim.
Choosing to show a trend asserts there is a trend; choosing a comparison asserts the two things are
comparable. So representation must be governed by the same rules as text — `ai/language-guard.js`
must apply to a chart's title, and a timeline of superseded evidence must show the supersession.
The founder framed expression as presentation. It is not; it is assertion with a different surface.

**5.2 · "Nothing at all" is the hardest primitive and it already works.** `ai/behaviour.js:12`
treats silence as success. Any expression vocabulary must keep `silence` as a first-class member
rather than a fallback, or the system will drift toward always having something to show — which is
how every attention product decays.

**5.3 · The JARVIS analogy imports a failure mode.** JARVIS has no epistemic humility; he is
confidently right because a screenwriter says so. IntelliQ's value is the opposite — it is useful
*because* it says "I don't know" and "this is contested". Take the interaction ideal (don't operate
features, be understood) and reject the confidence posture entirely.

**5.4 · The strongest argument against doing this now.** Expression work is visible, satisfying and
demo-able. It is precisely the kind of work that feels like progress and delays a pilot. You have a
pilot queue with four blockers and a college waiting. **Falcon will tell you which expressions
matter.** Building a representation vocabulary before watching one real headmaster fail to
understand one real answer is guessing with extra steps — and the pilot readiness review already
found that the cost of guessing without users is bugs that take four months to appear.

---

# 6. The ten questions, answered

| | |
|---|---|
| 1 · Which stages exist? | Evidence, Memory, Inquiry, Understanding, Expression, Action, Outcome — **all of them** |
| 2 · Under different names? | **Expression = `ai/behaviour.js`**; Memory = evidence log + inquiry state + playbook + person model; Action = interventions |
| 3 · Genuinely missing? | Only **representation choice**. Not a stage — a field |
| 4 · Should Expression be a boundary? | **It already is**, enforced by import graph. Do not create a second |
| 5 · Where does initiative live? | Correctly split across kernel / proactive / behaviour. Do not merge |
| 6 · Preferences vs truth? | Already safe — preferences sit downstream of the kernel; pipeline order is the guarantee |
| 7 · Traceability of an expression? | **PARTIAL.** Beliefs carry `why` and basis; a non-text expression would need to carry the same, and that is the invariant to write when the vocabulary is built |
| 8 · How to choose a form? | Deterministic selector over `polarity/severity/confidence/readiness/register/contested`. No model needed initially |
| 9 · What must stay deterministic? | Which data may be used, which claims may be made, privacy, provenance, confidence, audience, available actions, silence |
| 10 · What may be generative? | Selecting a member of the vocabulary, populating its typed slots, and phrasing — all inside the language guard |

---

# 7. Register

| Capability | Status |
|---|---|
| Expression as a structurally enforced boundary | **ENFORCED** — `ai/behaviour.js`, `governance-smoke` |
| Silence as a first-class outcome | **ENFORCED** — `ai/behaviour.js:12` |
| Graduated initiative (readiness / register / timing) | **ENFORCED** — `ai/reason.js`, `proactive-smoke` |
| Every proposal confirmation-gated | **ENFORCED** |
| Governed vocabulary pattern for actions | **ENFORCED** — `ai/brief.js:27` |
| Preference-aware expression that asks rather than reorders | **ENFORCED** — `priority-office.askFirstOffer` |
| Preferences cannot alter truth | **ENFORCED** by pipeline order |
| Representation vocabulary (timeline / comparison / trend …) | **OPEN** |
| Non-text expressions carry basis and provenance | **OPEN** |
| Inferred preference may only change expression via consent | **PARTIAL** — true today, unguarded by test |

---

# 8. P0 / P1 / P2

**P0 — nothing.** No part of this is required for Falcon Pilot #001, and I would resist any framing
that makes it so.

**P1 — after Falcon has produced real answers a real person read.** A representation vocabulary as
an allow-list, deterministic selector first, `silence` as a member, `language-guard` applied to
every populated field.

**P2.** Model-assisted selection. Richer primitives. Anything resembling generative UI.

**Never.** Personality filler, simulated emotion, engagement optimisation, or inferred preference
applied without consent.

---

# The honest summary

The founder asked whether IntelliQ needs an expression layer. It has one, it is structurally
enforced, it already treats silence as success, and the governance pattern for extending it is
already in use one file away.

What is missing is a list of shapes and a selector — a day of work, whose contents nobody can
correctly guess yet.

The proposition holds. *"IntelliQ develops understanding and chooses how to express it"* is already
three-quarters true: it chooses whether, when, to whom, in what order, and whether to stay quiet.
It just always chooses prose.

Falcon will say which shape it wanted.
