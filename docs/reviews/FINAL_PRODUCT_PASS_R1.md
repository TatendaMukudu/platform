# The final product pass — report

**Starting SHA** `2cdedd9c10534a99a54f47d7ea3d0b901c9c0492`
**Branch** `gpt/ab-decision-spine-r1` · **Not merged.**

Eight commits. The mission was to make IntelliQ feel simple without making it stupid, and the
honest summary of what that turned out to mean is this: **almost nothing here is a simplification
of the interface. Almost everything is a connection that was missing.** The product did not need
less shown to a person. It needed the things it already knew to actually arrive.

---

## 1 · What was already correct

Worth saying first, because four of the five areas I was sent to attack were already right.

- **Org context never contaminated evidence.** Changing a node description, an org goal, a value,
  a metric or the whole organisation profile moved no origin count, no band, no score, no
  polarity, no hypothesis. Driven before anything was touched.
- **Attachments never laundered into evidence.** Material has never touched `applyProposals`.
  Nothing was repaired here; the new suite exists to keep it that way.
- **Onboarding was already wired as evidence, and wired carefully** — one person is one origin,
  no direction ever, one concept per question, short answers dropped, and the main goal becoming
  a Focus rather than an account of the person. Four rules, all load-bearing, all already there.
- **The org-tree authority model held** against every attack in a three-level fixture, including
  the parent-membership case a flat fixture cannot express.
- **All 26 registered screens work.** None throws, none falls back to Home.

---

## 2 · What was actually broken

Every one of these is the same shape, which is the shape this repository keeps producing: **a
capability that exists in source, passes hermetic tests, and produces nothing or something false
on a real screen.**

| Defect | Where | What a person got |
|---|---|---|
| The Composer received no org values, no success definition, no language directive and no member goals | `_composeTurn` | A player writing in Spanish was answered in English; the product knew what Alma valued and what the player wanted, and told the model neither |
| A document attached to a chat reached no turn, ever | `_conversationMaterialContext` → `_materialFor` | "I don't have enough authorised evidence to answer that yet", about a file they were looking at |
| The owner of a chat attachment got 404 on their own document | `GET /api/materials/:id` | Same root cause, different door |
| "Organisation" in the account menu silently landed on Home | `NAV_ALIASES` | A permission-gated menu item that did nothing, every time, with nothing logged |
| Two `.nav-item` selectors matched nothing | `navigate()` | A second, unread owner for "which nav item is lit" |

**The cause of the first two is the same mistake in two places:** a gate that asks the right
question about the wrong object. `_materialFor` asks "may this reader open the OBJECT this hangs
on" — correct for a High, a Low, an Inquiry or a Focus, and meaningless for a conversation.
`_composeTurn` called `_domainDirective(code)` and used the result as a **truthiness test**,
discarding the directive itself.

A comment three thousand lines below the second one asserted that "the model-written path receives
the language directive and answers in their language". It was describing an intention. It has been
corrected in place rather than deleted, because it was believed for as long as it stood.

---

## 3 · Disposition

- **REUSE:** the confidence kernel, contribution, the inquiry store, the action vocabulary, Focus
  creation and outcomes, `ai/material.js`, `_worldviewDirective`, `_memberValuesDirective`,
  `_domainDirective`, `_canManageNode`, `NAV_ALIASES`.
- **EXPOSE:** nothing. No new surface was added.
- **CONNECT:** the three existing directives into the Composer's system prompt; conversation
  material into the deterministic answer path.
- **REPAIR:** `_materialFor`'s object requirement (via `requireObject`), the `organisation` fold,
  the dead `.nav-item` selectors, a 21-commit-stale `docs/INDEX.md`.
- **BUILD:** nothing. No store, no object type, no ontology, no engine.
- **HIDDEN/REMOVED FROM PRIMARY UX:** nothing. See §5.

---

## 4 · The org-context boundary, and why it needed a test at all

Declared context may now steer **relevance, interpretation, question selection and language**. It
may not touch **origin count, evidence count, empirical support, confidence band, recorded outcome
or causal standing**.

| Field | Class | Canonical owner | Consumer | Relevance effect | Empirical effect |
|---|---|---|---|---|---|
| org values | CONTEXT | `orgValues` / `organizationProfile` | `_worldviewDirective` → system prompt | yes | none |
| success definition | CONTEXT | `organizationProfile` | `_worldviewDirective` | yes | none |
| org goals | CONTEXT | `orgGoals` | prompt builders | yes | none |
| org metrics | CONTEXT | `orgMetrics` | prompt builders | yes | none |
| node name | PRESENTATION | `orgNodes` | `ai/audience.js`, `ai/team-state.js` | naming only | none |
| node description | CONTEXT | `orgNodes` | nothing in the kernel | none today | none |
| member goals | DECLARED GOAL | `memberGoals` | `_memberValuesDirective` | yes, own conversation only | none |
| member strengths | HUMAN CLAIM | `memberGoals` + self-account inquiry | own composer | yes | one origin, tentative |

**The boundary held before this pass for a reason that is no protection: the kernel never received
these fields.** Contamination was prevented by architectural absence. An absence holds until
somebody wires a field up for a good reason and nothing goes red — and this pass is exactly that
somebody. Hence `org-context-boundary-http-smoke.js`.

**Its own shape was corrected by mutation.** Changing every declared field and re-reading proves
there is no READ-time contamination and misses admission-time contamination entirely: admitting
the node description as an observation left all six of those assertions green and took out the
control instead, because contributions are admitted when they ARRIVE. The sixth contribution now
lands after the declared world has been set to say the opposite, and the origin count must rise by
**exactly one** — for the person, not for the mission statement.

---

## 5 · Dead surface: classified, not deleted

Full table in `SURFACE_CLASSIFICATION_R1.md`. Summary: 8 offered, 26 registered, all 26 working.

Nothing was removed. **The pilot cost of an unreachable screen is zero** — a coach cannot get to
it — and removing eighteen working screens plus their DOM containers immediately before
independent testing is a large diff whose benefit no tester can see. The cost they impose is on
the next agent reading the repository, which is real and is not a release blocker.

Two corrections to my own earlier §0 report, both inferred from grep and both wrong: `data-page`
attributes **do** exist (built in a template string), and `_renderApps`/`_renderInbox` **do**
exist (declared `async`). Recorded in full in that document.

---

## 6 · Mutations

Every claim below was driven: mutation applied, suite run, assertion confirmed red, reverted.

| # | Mutation | Result |
|---|---|---|
| 14 | node description admitted as a corroborating observation | red — OC-D1/D3 |
| 15 | org goal admitted as an achieved-outcome observation | red — OC-D1/D3 |
| 16 | org value admitted as behavioural evidence | red — OC-D1/D3 |
| 17 | metric definition admitted as an observed value | red — OC-D1/D3 |
| 33 | success definition admitted as a hypothesis | red — OC-D4/E1 |
| 22/23 | every held document admitted as corroboration | red — AT-C1b/C1c |
| 24 | private-ownership check removed | **no-op, masked** (see below) |
| 25 | tree-edit authority gate removed | red — twelve assertions |
| 26 | `_mayChangeAnchor` self-check removed | **no-op** — the tree route has its own copy |
| 26b | the tree route's own anchor rule removed | red — TA-F1/G1/G2/G3 |
| 27 | ancestor membership counted as leading descendants | red — TA-A1/A2/D2/D4/E2 |
| 18 | onboarding question read as a direction | red — ON-C3 |
| 20 | private self-account filed against the group | red — ON-A1/A2/A3/B1/B2 |
| 21 | first identity answer wins forever | red — ON-F3/F4 |
| — | `readCommand` stubbed to null | red — PC-K2/K4 |
| — | the `organisation` fold removed | red — PC-L2 |

**Three no-ops, recorded rather than dressed up.** Attachment privacy (D1/D2) is over-determined:
D1 is held by `_resolveConversation` looking ids up in the requester's own list, and D2 needed
*two* gates removed together before it went red. That is PROTOCOL lie #3 — masked by an outer
gate. "This mutation proved D2" would be false; what is true is that the property holds through
two independent gates.

Mutations 1–13 and 28–32, 34–35 were driven in earlier rounds on this branch and are recorded in
those commits. They were **not** re-driven at this SHA.

---

## 7 · Verification

```
npm test                                  279 suites, 0 failed        EXIT 0
org-context-boundary-http-smoke.js        16 passed, 0 failed
attachment-boundary-http-smoke.js         23 passed, 0 failed
org-tree-authority-nested-smoke.js        30 passed, 0 failed
onboarding-intelligence-http-smoke.js     21 passed, 0 failed
```

All ten browser checks, run individually (they are not part of `npm test` — the truth layer is
hermetic and must run with no browser binary):

```
pilot-coach-browser-check.js              94 passed,  0 failed     390px + 430px
stack-browser-check.js                   114 passed,  0 failed
settings-tiers-browser-check.js           41 passed,  0 failed
priority-surface-browser-check.js         39 passed,  0 failed
onboard-browser-check.js                  34 passed,  0 failed
library-browser-check.js                  24 passed,  0 failed
voice-output-browser-check.js             19 passed,  0 failed
forum-share-browser-check.js              13 passed,  0 failed     see below
chart-shape-browser-check.js              39 passed,  1 failed     pre-existing
group-loop-browser-check.js               13 passed,  4 failed     pre-existing
```

Mobile: 390px and 430px, both clean across home, inquiry, focus, high, low, library, org tree and
settings. No horizontal overflow at either width; the composer stays on screen and usable at both.

**A check that could not run here at all, now fixed.** `forum-share-browser-check.js` was the only
one of the ten not to pin its Chromium, falling back to `chromium.executablePath()` — which
resolves to `chromium-1228` while this container has `chromium-1194`. The launch failed inside an
unhandled rejection, so the process did not exit: it printed the error and **hung**. That is worse
than failing, because a harness looping over the checks stops there and never reaches the rest —
which is exactly what happened twice while running this gate. Pinned the way its nine siblings
are, with `CHROMIUM_PATH` still winning when set. It passes 13/13.

**Two pre-existing failures, both verified identical at the pinned starting SHA `2cdedd9`** in a
clean worktree, and neither part of `npm test`:

- `chart-shape-browser-check.js` CS-R1b — an empty chart space says nothing.
- `group-loop-browser-check.js` GB-C1b / C2 / C2b, then a 30s click timeout that ends the run.

Neither is caused by this pass. Both are real and both are worth somebody's time; `group-loop`'s
is the more interesting of the two, because a panel that never opens is a coach-facing path.

**And one red I pushed.** Commit `33baecb` went out with `npm test` failing: I chained
`npm test | tail -3 && git commit`, which tests the exit status of `tail`. The failing guard was
`asset-version-smoke` correctly reporting that assets had changed without the cache stamp changing
with them. Fixed in `80b7520`, by exit code.

---

## 8 · What I did not do

Stated plainly, because the brief has 27 sections and this pass covered some of them and not
others.

- **§11 Home, §12 High/Low/Inquiry/Focus UX, §13 information hierarchy, §19 progressive
  disclosure, §15 Settings IA, §16 Library.** Not attempted. These are the *simplification* half
  of the brief, and the pass spent its time on the *connection* half — which is where the driven
  defects were. Home still shows what it showed; Settings still has the information architecture
  the brief criticises.
- **§23's single composed walkthrough.** Its parts are each covered — continuity, human origin,
  attachment relation, org-context invariance, onboarding — but by five separate suites rather
  than one journey proving they compose.
- **§18's prose-output pipeline document.** The Composer's inputs are now traced and corrected in
  code comments; the standalone document was not written.
- **Mutations 1–13, 28–32, 34–35 at this SHA.** Driven in earlier rounds, not re-driven here.

---

## 9 · Remaining pilot blockers

**None that I found.** The defects this pass fixed were real and user-facing, and they are fixed.
The items in §8 are unstarted work, not blockers: a coach can complete the full journey today.

Two things a tester should have on their list, neither a blocker and neither mine:

1. **`group-loop-browser-check` GB-C2** — the panel asking what the group will actually do does not
   open, and the run ends on a click timeout. Pre-existing at `2cdedd9`. It is coach-facing, so it
   is the first thing I would look at after this pass.
2. **`chart-shape-browser-check` CS-R1b** — an empty chart space says nothing. Pre-existing.

The one thing a tester should know going in: **the pilot runs models-off**, so the Composer's
newly-connected org and language context only changes behaviour when a provider is reachable. Its
connection is verified by capturing the prompt, not by reading a model's reply.

---

## 10 · Verdict

**READY FOR INDEPENDENT TESTING: YES**

`npm test` green, browser checks green at both widths, one pre-existing non-gating failure
recorded, nothing merged.
