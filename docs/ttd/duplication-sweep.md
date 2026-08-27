# The duplication sweep — what exists twice, and what is hiding

**Status:** CURRENT. **Written against:** the branch head that contains `ttd/layer-map.md`.
**Why:** the founder's read — *"I've repeated myself many times about some things and we've either
duplicated them or they are hiding somewhere in software."*

**Verdict: both are true, and the hiding is the bigger of the two.**

**92 of 298 routes have no caller in the front end.** Twenty-eight of those have no test either.
Meanwhile six concepts exist more than once.

---

## PART A · WHAT EXISTS MORE THAN ONCE

### A1 · Polarity bucketing — THREE times

Fully documented in `ttd/layer-map.md` §1. One `polarity` field, three modules bucketing it under
three names with three different boundaries.

**High = worth_celebrating = working_well. Low = needs_attention = worth_attention.**

**Action: pick one vocabulary — High and Low — and make the others aliases.** Not a rewrite; a
rename plus deleting two bucket maps.

### A2 · Groups — TWO concepts

| Store | Shape | Used by |
|---|---|---|
| `orgNodes` | `{ nodeId, name, parentId, childNodeIds, memberIds, **leaderIds** }` | the Web, scope, team surface, group inquiry, everything current |
| `orgGroups` | `{ id, name, memberIds, **leadIds**, goals, traits }` | `renderLeaderGroups`, `/api/groups`, the older "Groups" page |

Two group models with **near-identical fields and different spellings of the same one**
(`leaderIds` vs `leadIds`). `_removePerson` has to clean both — its own comment says so:

> `orgNodes memberIds/leaderIds · orgGroups memberIds/leadIds`

**This is the clearest duplication in the codebase.** `orgNodes` is the real one: it carries the
hierarchy, the scope rules, the cohort floors and the inquiry subject. `orgGroups` carries goals
and traits, which is the only thing it has that `orgNodes` lacks.

**Action:** move goals and traits onto `orgNodes`, retire `orgGroups`. Not urgent for the pilot,
but every new feature that touches "a group" has to decide which one, and that is how this
compounds.

### A3 · Scope — THREE mechanisms

`orgGraph` · `getVisibleUserIds` · `_inNode`/`_leadsNode`, across 71 audited call sites.

**Already known, already measured.** `scripts/scope-parity-smoke.js` enumerates where they
disagree. No action before the pilot; the harness exists so a later migration is safe.

### A4 · Conversation stores — FIVE, but only two overlap

| Store | What it is | Verdict |
|---|---|---|
| `assistantConversations` | the real chat, with per-message provenance | **keep — this is the one** |
| `conversationSessions` | a structured claim/adjudication session | distinct purpose, keep |
| `forumThreads` | group deliberation anchored to a group inquiry | distinct purpose, keep |
| `advisorThreads` | `{ memberId, requesterId, question, answer, evidence }` | **overlaps `assistantConversations`** |
| `studioThreads` | 2 writes, **0 reads** | **deliberately archived**, comment at `server.js:5365` says so — not a defect |

**Action:** only `advisorThreads` is a genuine question, and it is small. Leave it.

### A5 · Focus — TWO stores, TWO constructors

- `userAiProfiles[code:userId].focuses` — a person's own, built **inline** at `server.js:4981`
- `teamFocuses[code][nodeId]` — a group's, built through `teamState.newFocus`

Two grains is correct. **Two constructors is not.** The team one derives `origin.from` from
whether an inquiry was supplied; the self one does not carry origin at all.

**Action, and it is small: route the self focus through `teamState.newFocus` too.** One definition
of what a Focus is. This matters more now that self Highs and Lows are being derived, because the
self surface is about to get the same four objects the team surface has.

### A6 · Evidence — legacy and canonical, mid-migration

`orgSignals` (legacy) and `evidenceLog` (canonical) both live. The migration is **declared in
comments and partially done** — "built from canonical evidence, never the legacy signal" appears
at several call sites, meaning some paths moved and some did not.

**Action: none before the pilot.** Both work. Worth finishing after.

---

## PART B · WHAT IS BUILT AND HIDING

**298 routes. 92 have no front-end caller. 28 have neither a caller nor a test.**

Some are legitimately backend-only — webhooks, OAuth callbacks, health, admin tooling. The rest
are **features that were built and never surfaced**, which is exactly the founder's suspicion.

### B1 · The ones that matter most

| Route(s) | What it is | Why it matters |
|---|---|---|
| `/api/safeguarding/flags` · `/flags/:id/resolve` · `/config` | The safeguarding lead's queue | **A flag is routed to a safeguarding lead who has no screen to see it on.** For a pilot with young people this is the most serious item in this document |
| `/api/self/patterns` · `/self/observe` · `/self/:habitId/feedback` | The self-pattern layer | This is where self Highs and Lows come from. Built, invisible |
| `/api/actions/*` (nine routes) | propose → draft → approve → execute → observe → evaluate | The full intervention lifecycle, tested end to end, largely unreachable |
| `/api/me/export` · `/api/me/data` | A person's own data, export and access | A GDPR-shaped capability with no button |
| `/api/proactive/preferences` | How a person wants to be spoken to | Built, bounded, never offered |
| `/api/weekly/member` · `/weekly/org` · `/weekly/synthesis` | A whole weekly layer | No caller, no test |
| `/api/signals/import` · `/import-csv` · `/recent` · `/sources` | The signals import path | No caller, no test |
| `/api/inquiry/recommendations` | What to ask next | Directly relevant to the stopping rule |
| `/api/report/person/:userId` | A person report | No caller |
| `/api/notes/pinned` · `/api/org-state` · `/api/kernel/coreasoning` | Various | No caller |

### B2 · Why the scanner missed all of it

`scripts/deadcode-scan.js` reports **zero dead functions** and is correct. It checks *functions*.

An orphaned **route** is a live function — the handler is referenced by `app.get(...)`, so it
looks alive to a function-level scanner while being unreachable to a user. That is precisely how
`/api/intelligence/act` lost its caller without a single test going red.

**Action, and it is the highest-value item here: extend the scanner to routes.** Every
`app.<verb>('/api/...')` should be either called by the front end, called by a test, or on a
declared allow-list of backend-only routes with a stated reason.

That single check turns "what's hiding" from an archaeology exercise into a standing assertion.

---

## PART C · WHAT IS ACTUALLY MISSING

Distinct from duplicated and from hidden. Short list.

1. **Self High/Low as a named projection** — decision taken, derive from the polarity map.
2. **A thread bound to an object** — one field, `about: { kind, id, subjectRef }`.
3. **Inquiry maturity** — the visible arc from opened, through evidence accumulating, to settled
   or abandoned.
4. **A safeguarding lead screen** — see B1. The backend is done.
5. **The front end reflecting the object model** — `ttd/object-as-conversation.md`.

---

## PART D · RECOMMENDED ORDER

| # | Action | Size | Why now |
|---|---|---|---|
| 1 | Route-reachability check in the scanner | small | Makes every other finding here a standing assertion instead of a one-off |
| 2 | Safeguarding lead screen | medium | The backend exists; a routed flag nobody can see is a pilot risk |
| 3 | One polarity vocabulary — High and Low win | small | Prerequisite for self Highs and Lows |
| 4 | Self Focus through `teamState.newFocus` | small | One definition of a Focus before the self surface grows |
| 5 | Self High/Low derived | medium | Founder decision taken |
| 6 | `about` binding, then the nav and threads | large | `object-as-conversation.md` §5 |
| 7 | Retire `orgGroups` into `orgNodes` | medium | Post-pilot. Not urgent, but it compounds |

**Items 1 and 2 are the ones to do before anything else.** The first prevents this document from
being needed again; the second is a live safety gap with a finished backend behind it.
