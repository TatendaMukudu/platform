# Round 8 — independent pilot correction, product-law and live-mobile pass

**Branch** `codex/pilot-recovery-gate-r7` · **Draft PR** #90
**Starting SHA** `99a654409c7f57be7ed8d73c50592538a4c7bea8` (the audited head named in the brief)
**Final SHA** `35cae5c`
**Verdict** **SAFE TO MERGE: NO** — see §9. Nothing was merged or deployed.

PR #90 contains PR #89's wider delta and must not be merged independently. Nothing on
`claude/platform-work-summary-nmb0cm`, `claude/pilot-live-recovery-r1`, PR #89 or `main` was
touched. Every push went to `codex/pilot-recovery-gate-r7`.

---

## 1. The state of the branch when this pass started

`cdf2a79`, the head handed over, **was red**. CI run 867 failed. Three suites were already
broken before anything in this pass was written:

| suite | assertion | why |
|---|---|---|
| `assistant-answer-hijack-http-smoke` | "someone else's is not yours to remove (403)" | token minted for `ghost`, a user id in no store |
| `member-chat-threading-http-smoke` | "another member cannot open it (self-only)" | same, `ghost` |
| `google-connector-http-smoke` | "a person who never consented cannot pull" | same, `nobody` |

All three were the same false-green shape. Since R7.1 resolves a session against the account it
names, those requests are answered 401 and never reach the rule being asserted — so each test had
been passing for a reason unrelated to its own subject, and then failing for one. Each fixture now
contains a real second person. Fixed in R8.1; CI runs 868, 869, 870, and every run since, are green.

---

## 2. What was found, by area

Eight of the brief's thirteen areas were completed. Each was reproduced or refuted against the
then-current head, fixed at a canonical owner, and given a registered behavioural guard plus
mutations that make that guard fail.

### R8.1 — org-tree authority (`81ee8d8`)

A complete privilege escalation with **no administrator anywhere in the chain**. `_isLeader` asked
"is this person *in* a node that has children" — `getUserNodeIds` returns nodes somebody *belongs*
to — so the shape of the tree **above** an ordinary member made them a leader, granting
LEADER_GRANTS: the member directory, other people's check-ins, insights, reports. Driven over HTTP:

```
/api/auth/me            -> view_members, view_team, review_checkins, view_insights
POST /api/groups/create -> 200, a new node written into the org tree
PUT  /api/groups/beta   -> 200, an unrelated subtree's leaders set to the caller
```

`/api/groups/*` writes `orgNodes` through `_upsertGroupNode` behind that bare `_isLeader`, while
`/api/tree/*` — the same store — required `manage_tree`. Two doors into one structure with two
locks, and the weaker one decided. In the browser, `js/tree.js` rendered the action row with
`${canManage || true ? …}`, so every person was offered "Assign People" on every node and got a 403.

**Fix — one owner.** `_canManageNode(code, actorId, nodeId)`: superadmin, or `manage_tree`, or an
assigned leader over that node and its descendants, downward only; fail-closed on an absent or
suspended actor. Both route families and the browser ask it. `_mayChangeAnchor` answers the
separate question of who may move a *placement*, refusing `actor === subject` before authority is
considered — so a leader may staff their department without promoting themselves inside it, and a
delegated `manage_tree` grant is not a ladder.

### R8.2 — generic organisation ontology (`0e09556`)

Two numbers in `ai/org-state.js`, inside the one function that turns state into what a person is
shown, were keyed to football:

```js
const priority = ev && ev.type === 'match' ? 0.8 : 0.5;
const leadDays = /kickoff|availability|game_plan/.test(req.claimType) ? 2 : 1;
```

Driven through the **universal** pack — an organisation that declares no `match` event type at all
— the identical situation scored 0.710 as a `deadline` and 0.770 as a `match`. A school's exam and
a business's launch could not reach the band a fixture reached, and any organisation could raise
its own scores by choosing a football word. The second line was not merely domain-specific but
**wrong**: the sports pack declares `kickoff_time.leadDays: 1` and the regex overrode its own pack
with 2.

Separately, `ai/org-context.js` titled a business's product launch **"Default"** — a machine word,
in the one sentence a person reads before confirming — called a school's event a `match`, spliced
"first team" into everybody's titles, and extracted nothing at all from "Parents evening on
Thursday at 6pm", a school's commonest occasion.

**Fix.** Both numbers come from the pack, most specific first. The kernel decides a universal
*kind* — performance, preparation, gathering, milestone — and the org's resolved vocabulary supplies
the word; the title echoes the noun the person actually used.

**Deliberate behaviour change:** a sports kickoff at three days out moves from `high` urgency to
`medium`, because 1 is what the pack states.

### R8.3 — Focus identity (`5c12c9d`)

`_objectBucket` ran all four object kinds through `voice.explainObject` and
`present.inquiryCard`. Right for an inquiry, a high and a low — each is something IntelliQ
*believes* from evidence. A Focus is not a belief. A member typed "Work on my first touch" and got:

```
standing: "Early thinking"   status: "Looking into this"   band: "tentative"
claim:    "My read is that Work on my first touch. Not sure yet."
```

The product hedging about whether somebody meant what they had typed, one second after they typed
it. Two more findings fell out: `newFocus` stored `reviewAt: 0` for every Focus set without a date
(`Number(null)` is 0, which is finite), hidden because `normalizeFocus` reads it back through
`|| null` — the stored record and its own wire shape disagreed. And a personal Focus recorded its
outcome as the bare string `'helped'` while a group Focus records an object, so `_proactiveInsights`
— which asks `f.outcome.result` over personal focuses — **had never once fired**: the person who
did the rarest thing in the product, recording how their own commitment actually went, was never
told it worked.

**Identity itself audited sound and left alone**, pinned as law so a later tidy-up does not unify
two id spaces that correctly stay apart.

### R8.4 — audience selection (`a95f006`)

Exactly one of four kinds could be shared. `POST /api/me/focus/:id/visibility` is 200; the same
request for a High, a Low or a personal Inquiry is 404, because no such route existed. So somebody
who wanted their coach to see what they had noticed about themselves — the thing the product is
*for* — had no way to say so.

**Fix — one store and the existing resolver.** A Focus keeps its audience on the Focus record;
the other three are read models, so their choice sits in `objectAudiences` beside them. Both are
resolved by the same `_resolvePersonalAudience` and read by the same `_forumAudience`.

One claim **refuted** rather than fixed, and the reason to check first: a High's id looked
generated and would have made any stored choice point at nothing after a restart —
`ai/proactive.js` mints `'pi_' + _hash(dedupeKey)`, deterministic in a fresh process.

One defect **found while building**: once a High was shared with a teammate, the teammate could
share it **onward** to a leader, 200. Being shown something is not being given it.

### R8.5 — conversation compression (`1c3a5a0`)

The store's own comment says "PRIVATE, PERMANENT chat history — kept until the user deletes it".
It was not: `CONV_MSG_CAP` was applied as `messages.splice(0, n)`. That would be a documentation
bug if nothing pointed at those messages. A Focus pins the exact message ids it came from, and
`GET /api/me/focus/:id/source` resolves them live by design. Driven: pin a Focus to the first
message of a 501-message thread, take eight ordinary turns, and the pinned message is gone — and
the route then served **four unrelated recent messages** under the note "Sharing the focus does not
share this conversation", as though they were the conversation it came from.

**Fix.** A message something points at is not spare capacity. Eviction takes the oldest *unpinned*
messages; what was dropped is counted and dated. No model involved, and none needed.

### R8.8 — language continuity (`e48e749`)

No notion of language anywhere — `ai/report.js` hard-codes `lang="en"` and nothing else ever asked.
A person writing in Spanish was answered in English every turn with nothing having noticed.

**Fix, split along the founder's law.** *Which* language is a decision, so it is deterministic
(`ai/language.js`, requires nothing, awaits nothing, fails closed to null). The *words* are prose,
so the model is told which language, through the one `_domainDirective` every AI entry point
already makes. And the deterministic copy is English and now **says so**, because a bounded product
that explains itself is usable and a silent one looks broken.

### R8.9 — human-facing fallback (`5891c82`)

`COMPOSER_DEGRADED` already exists: a closed vocabulary of facts about IntelliQ's own state, one
client sentence, one place. Two surfaces that fall back did not use it. The check-in is the one
that costs something — a person who has just said they are not sleeping receives a warm,
specific-sounding acknowledgement that nothing actually read, and cannot tell it from one that did.

A third finding fell out of testing the **recovery** path: the briefing is cached for two hours and
the degraded one was cached like any other, so one failed call pinned the stock sentence in front
of a leader for the rest of the morning, long after the provider recovered.

### R8.12 — super-admin participation (`35cae5c`)

Mostly **refuted**: the server has always treated the super-admin as a person, and every ordinary
action already worked. The *client* erased them in two places for a reason that was not true —
`js/app.js` filtered them from the People list while asserting "visible-members already strips
superadmin", which it does not. So the founder could be on a squad, talk to people and appear in a
teammate's contacts, yet not appear in the People list, so nobody could assign them to the node
they were already in.

Also in that commit: the startup log said "Restored 0 active session(s) **from Postgres**" on boots
with no Postgres at all.

---

## 3. Authorization, before and after

| question | before | after | owner |
|---|---|---|---|
| may this person manage this node? | `_isLeader` (leads *anything*), or `manage_tree`, or `canManage \|\| true` in the browser | `_canManageNode` — superadmin, `manage_tree`, or assigned leader downward; fail-closed on an absent actor | `_canManageNode` |
| may they change a *placement*? | not asked | `_mayChangeAnchor` — never your own, by any route | `_mayChangeAnchor` |
| may they create a top-level node? | any "leader" | administrator only | `_canManageNode(code, actor, null)` |
| may they delete the node that anchors them? | yes | no | tree DELETE guard |
| may they reparent a node? | authority over the node only | authority over where it is **and** where it is going | tree PUT guard |
| who may see my High / Low / Inquiry? | nobody, ever — no route existed | private, shared (leaders), or named people | `_resolvePersonalAudience` + `objectAudiences` |
| may somebody re-share what was shared with them? | yes, 200 | no | audience route ownership check |
| is a super-admin a person in the org? | server yes, client no | yes, both | `getVisibleUserIds` |

---

## 4. Tests

Ten registered suites added across rounds 7 and 8; **267 registered suites green** at `35cae5c`.

| suite | assertions |
|---|---|
| `org-tree-authority-http-smoke` | 53 |
| `object-audience-http-smoke` | 43 |
| `focus-identity-http-smoke` | 37 |
| `language-continuity-http-smoke` | 33 |
| `org-ontology-neutrality-http-smoke` | 25 |
| `degraded-honesty-http-smoke` | 23 |
| `superadmin-participation-http-smoke` | 19 |
| `conversation-compaction-http-smoke` | 18 |

Every refusal that mutates a store is asserted against a byte-for-byte snapshot of that store,
because a 403 that still wrote and a 403 that did not are the same three digits.

### Mutations

Thirty-two mutations were run against production owners. All but three turned their suite red.
The three that survived were **no-ops** (PROTOCOL lie #9) — each blocked by a second, redundant
guard rather than by a gap in the suite. Rather than leave the redundancy unproven, an assertion
was added in each case for the law the redundancy hides (`OA-F4/F5`, `LC-A2`, `FI-D8`), after which
the mutation turns red.

### False greens corrected — eight, none weakened

1. `onboard-invite` **OI-F3** asserted `_isLeader(sitter) === true` — the defect stated as a
   premise, so fixing the detector turned it red and the only way back to green was to restore the
   escalation. PROTOCOL lie #6.
2–4. Three suites minting tokens for users present in no store (§1).
5. `org-context-smoke` asserted `ev.fields.type === 'match'` with no vocabulary supplied — pinning
   a football noun as the kernel's answer for every organisation.
6. `no-llm-floor` A13/A14 and `focus-ownership-parity` FP7 pinned the bare-string outcome shape.
7. `stack-ownership-smoke` pinned the one-line formatting of an assignment rather than the rule.
8. `LC-C4/C5` in my own new suite matched `"LANGUAGE —"`, which `ai/packs.js` also emits, so it was
   reading the vocabulary directive and would have passed whatever the language directive did
   (PROTOCOL lie #4); `LC-A2` proved an evidence floor with inputs that contain no function words
   and return null however low the floor is set.

Two of my own suites also passed assertions as evaluated expressions rather than thunks, so under
mutation they threw before `ok` could catch them and turned named failures into a crash. A crash is
not a pass and is not a legible failure either.

---

## 5. Deferred, named rather than skipped

- **Areas 6, 7, 10, 11, 13** — composer and mobile UX; file-versus-URL context binding; humanizing
  Home, evidence, inquiry and privacy surfaces; personal learning and profile synthesis; Library and
  live-object UX. Not started.
- **Two silent model substitutions remain**, in the assessment drafting routes (`server.js` ~6950,
  ~7055). Assessments were taken out of the pilot in September 2026 and their pages cut, so neither
  is reachable from any surface a pilot user sees. Touching a retired subsystem is its own work.
- **`/api/workspace/briefing` is recorded debt** in `reachability-smoke` — it has no front-end
  caller — so its new `composer` field is correct and will render when one exists.
- **Section C of `superadmin-participation-http-smoke` reads source text**, because those two lists
  render from state the test process does not hold. It catches the regression that would actually
  happen, and was confirmed to by mutation; it would not catch a rewrite expressing the same filter
  differently. Stated in the suite itself.

---

## 6. What was deliberately not built

- No second org-truth store, Focus, proposal, audience, attachment or truth system. Area 4 in
  particular reuses `_resolvePersonalAudience` and `_forumAudience` rather than adding a parallel
  one, and R8.9 reuses `COMPOSER_DEGRADED` rather than inventing a third notion of "degraded".
- No sport ontology was moved into the kernel; it was moved **out**, into pack declarations.
- No privacy or evidence law was weakened to simplify a surface. R8.4 added a sharing capability and
  simultaneously closed an onward-sharing hole found while building it.
- No model output mutates canonical structure without confirmation.

---

## 7. Live verification — what was and was not done

**Everything here was driven over HTTP against the real routes in this container.** That is the
strongest claim this pass can make and it is the one made.

**Not performed, and not claimed:**

- No browser. No Playwright run, no screenshot, no rendered page.
- No iPhone, no mobile device of any kind.
- No Render deployment, restart or check.
- No Neon or any Postgres. `DATABASE_URL` is absent; `db.js:43` builds its pool only when it is set,
  and the pool was verified null by loading the module. Local Postgres is not running.
- No live language-model provider. Every model-dependent assertion runs with models off or with a
  deliberately failing provider.
- No audio in or out.

The eighteen browser flows the brief asks for therefore **remain outstanding**. `docs/reviews/
FOUNDER_PHONE_RESTART_SCRIPT.md` (written in Round 6) is the script for running them on a real
device; it has not been executed.

---

## 8. Safety of the reproductions

No shared, Neon, Render, pilot or persistent environment was touched. Every reproduction ran
against in-process memory fixtures in this container. The destructive `seed-alma` reproduction from
Round 7 was re-checked: the pool is null, so it replaced nothing outside the test process. No
recovery is needed.

---

## 9. Verdict

**SAFE TO MERGE: NO.**

Not because of anything in this delta — the branch is green, every change is guarded, and every
guard is mutation-tested. Three reasons stand:

1. **PR #90 carries PR #89's wider delta** and must not be merged independently, as instructed.
2. **The brief's own gate requires live proofs** — real browser, real device, real deployment —
   and none were performed. Section 7 says exactly what was and was not done.
3. **Five of thirteen areas are unexamined.** Shipping eight and calling the pass complete would
   misrepresent the state of the product.

What the delta *is* safe to do is continue on. Nothing here needs undoing to proceed.
