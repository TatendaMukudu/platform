# Founder decision reduction

**Status:** CURRENT. Audit of every outstanding founder decision against ratified direction.
**Stage 1** of the final pre-implementation hardening program. Preceded by `d4fcfef`.
**Written against:** `d4fcfef`.

**Purpose:** stop asking the founder questions whose answers are already encoded in ratified law.

---

## 1 · Headline

**Thirteen decisions reduce to two that genuinely require the founder, and neither blocks any
pre-pilot work.**

| Class | Meaning | Count | Ids |
|---|---|---|---|
| **A** | genuinely requires the founder | **2** | D-W3, D-E2 |
| **B** | already answered by ratified founder direction | **5** | D-W6, D-E3, D-C1, D-O1, D-E1 |
| **C** | repository or safety consequence makes one option dominant | **4** | D-W7, D-W5, D-W4, D-B1 |
| **D** | defer until pilot evidence | **2** | D-P1, D-P2 |
| **E** | obsolete / duplicate | **0** | — |

**Zero decisions block pre-pilot implementation.** Both Class A items are deferred: D-W3's field
lands regardless of the answer, and D-E2 needs a benchmark that is itself post-pilot.

**One reversal.** D-W5's earlier recommendation was wrong because its premise was wrong — see §4.

---

## 2 · The ratified direction used as the test

Quoted from founder statements already accepted into the constitution and adjudications. A decision
is Class B when one of these settles it.

| # | Ratified law |
|---|---|
| **R1** | *"A node reasons across: itself; one organizational level above it; everything structurally beneath it. This is reasoning scope."* |
| **R2** | *"It is NOT blanket permission to inspect every raw/private datum belonging to everyone in that scope."* |
| **R3** | *"Adding a parent node means adding that parent itself. It does NOT recursively expand downward from the parent."* |
| **R4** | *"Player A does NOT automatically receive Player B."* — membership confers no lateral or downward person visibility |
| **R5** | Web scope / governance / kernel / projection are four concepts and must not be collapsed |
| **R6** | *"Self and Web… may share admissible evidence but never inherit visibility from one another."* |
| **R7** | *"Private evidence currently contributes NOTHING to Web reasoning. Do not change that silently."* |
| **R8** | *"No organizational truth may exist only in a model, prompt, embedding, provider store, or generated summary."* |
| **R9** | *"Memory may be durable. Behavioural interpretation must not become permanent identity."* |
| **R10** | *"Models are configuration."* |
| **R11** | *"Do not grant autonomous truth-making authority."* / *"Do not silently expand machine authority."* |
| **R12** | *"Peer awareness does not equal peer person-level disclosure."* |

---

## 3 · CLASS B — already answered

### D-W6 · Does a leader's upward scope include the parent node's own evidence?

**Answered by R1 + R2 + R3.**

R1 says a node **reasons across** one level above. Reasoning across a node means its admissible
material informs reasoning — if it meant node identity alone, "reasons across" would be an empty
phrase. R2 then bounds it: not private data, not raw personal data. R3 bounds it again: the parent
node itself, never the parent's other descendants.

**The precise answer, disambiguating Stage 8's four readings:**

| Reading | Granted? | Why |
|---|---|---|
| A · node identity only | yes, necessarily | trivial consequence |
| B · aggregate parent intelligence | **yes** | R1 — this is what "reasons across" means |
| C · parent **node-scoped** evidence | **yes** | mechanically what `canSee(scope, 'root')` does; this is org-facing material the parent leader stamped to their own node |
| C′ · parent **private/person-level** evidence | **no** | R2, and `_kernelEvidence` excludes private from org purposes regardless |
| D · parent member identities | **no** | R4 — membership confers no person visibility; `getVisibleUserIds` is a separate layer and is unchanged by W-3 |

**Repository consequence:** the one-line W-3 change delivers exactly A+B+C and cannot deliver C′ or D,
because it adds a node id to a set consumed only by `canSee`, which governs node-scoped evidence.
`_primaryNodeScope` (`server.js:9847`) stamps a person's evidence to *their own* led node, so a
sibling leader's material stays in their branch.

**Can implementation proceed? YES.** The mechanical change already satisfies the ratified reading.
**Recommendation: proceed; record the A/B/C-yes, C′/D-no table in the W-3 brief.**

### D-E3 / C7 · Do embeddings join the deterministic switch?

**Answered by R8.** The founder's own enumeration of places truth must not live **names
"embedding" explicitly**. And `ai/gateway.js`'s no-egress promise is that *"an organisation can
GUARANTEE that nothing about their people ever leaves the box"* — embedding a person's text sends
that text to OpenAI.

`ai/embeddings.js:20` — `enabled()` is `!!KEY`, outside `deterministicOnly()`. Two live call sites
(`server.js:8675`, `16821`).

**Privacy consequence of leaving it out:** the no-egress guarantee is false as advertised.
**Product consequence of joining:** semantic retrieval degrades to keyword in no-egress mode only.
Per L-B1 an embedding may never be cited, so **nothing citable is lost** — only recall.

**Can implementation proceed? YES.** Recommendation: join the switch; state the degradation in the
no-LLM registry line. This was previously listed as blocking; **it is not** — R8 settles it.

### D-C1 · May private evidence count toward a Web aggregate?

**Answered by R7**, restated by the founder in the current program: *"Current founder direction says
private evidence currently contributes NOTHING to Web reasoning. Do not change that silently."*

That is a ratification of the status quo, not an open question. Consent-based aggregation remains a
**post-pilot product idea**, not a pilot decision.

**Can implementation proceed? YES** — no change required. Recommendation: keep current law; keep the
consent option on the post-pilot list.

### D-O1 · Is a dormant behavioural dimension quiet or forgotten?

**Answered by R9.** *Memory may be durable* rules out deletion; *interpretation must not become
permanent identity* rules out continued surfacing. **Quiet is the only reading satisfying both.**

`ai/self-model.js:29` already implements exactly this for habits — dormant, retained, not surfaced.

**Can implementation proceed? YES.** Person-controlled erase remains a possible additive feature and
blocks nothing; it is not a precondition.

### D-E1 · Is a local T1 model a pilot selling point?

**Answered by R10.** *"Models are configuration"* means the router must accept a local provider as a
config entry and nothing more is required. Building local infrastructure is on the explicit non-goal
list (*"do not make Falcon wait for local-model infrastructure"*).

**Can implementation proceed? YES** — design the interface, build nothing.

---

## 4 · CLASS C — one option dominant

### D-W5 · May a plain member see people in descendant nodes? — **PREMISE WAS WRONG**

**Correction to `docs/briefs/w3-w4-implementation-contract.md` §3.7 and `docs/INDEX.md` §7.**

Both documents state the divergence as *"a plain member of a node sees the people in all descendant
nodes."* **That is false.** Verified at `d4fcfef`:

- `server.js:1781` — the `member` role default is `view_team: false`.
- Rule 3(a2) (`server.js:2810-2814`) sits inside `if (_userHasPerm(…, 'view_team'))`.
- Therefore **3(a2) never fires for a plain member.**

`_effectivePermissions` (`:2636`) = role defaults ⊕ `LEADER_GRANTS` if `_isLeader` ⊕ explicit
overrides. `LEADER_GRANTS.view_team = true` (`:2591`). So the holders are: superadmin, admin, coach,
any member-role person who leads a node, and anyone with an explicit grant.

**The real divergence is narrower and sharper.** Rule 3(a2) keys on `getUserNodeIds` (`:2654`),
which returns nodes where the user is a member **or** a leader. So for a `view_team` holder, it
grants the people under **every node they merely belong to** — including nodes they do not lead.

**Concrete leak:** a coach who leads `Soccer` and is also listed as a *member* of `Sport` receives,
through 3(a2), every person under `Sport` — including `Rugby`. That is lateral person-level access
across a sibling branch, which **R4 and branch isolation forbid**.

**And the code contradicts its own comment.** The comment says *"Hierarchy **leadership** — for any
node this user **belongs to**…"*. It names leadership and keys on membership. Rule (a) already
handles the leadership case correctly. That mismatch is the defect.

| Option | Repository consequence | Product | Privacy | Pilot |
|---|---|---|---|---|
| **A · key 3(a2) on leadership** (match its comment and R4) | (a2) becomes a subset of (a) — effectively removable | membership stops implying oversight | **closes the lateral leak** | a `view_team` holder loses people they see today |
| **B · keep membership-keyed, document as deliberate governance** | unchanged | senior-node membership implies oversight — a real org pattern | **leak persists** and is now blessed | no change |
| **C · restrict to nodes the user belongs to that have no leader** | narrow | oversight only where nobody leads | closes most of it | fiddly |

**Recommendation: A**, with the caveat that it changes live behaviour and therefore needs the parity
harness first to enumerate exactly who loses what. R4 is ratified and B contradicts it; blessing a
leak because it exists is the one move the four-layer separation (R5) does not license — R5 permits
governance to *differ* from Web deliberately, not to differ *by accident*.

**This reverses the earlier recommendation** ("keep as documented governance widening"), which rested
on the false premise that this was about plain members and therefore a broad, intentional grant. It
is neither broad nor evidently intentional.

**Does it block W-4? NO.** It defines one row of the parity harness's expected-difference table. The
harness ships first and enumerates the affected actors; the decision follows the data.

### D-W7 · Is `top_leader` structural or coverage-based?

**Not a product decision.** Nobody ratified "top_leader means sees every node"; it is an artifact of
`visibleNodes.length === g.byId.size` (`ai/scoped-intelligence-packet.js:41`). Measured: under W-3 a
two-tier org promotes every node leader to `top_leader`.

**Dominant option:** structural — leads a parentless node. It is the only definition stable under
W-3, correct in a one-node org, and correct with multiple roots.

**Can implementation proceed? YES.**

### D-W4 · May the worker open a group Inquiry unprompted?

**Dominated by R11.** Opening a group Inquiry is visible to that group. Propose-only requires **no
expansion of machine authority** and is therefore the option consistent with *"do not silently
expand machine authority."*

Note the kernel's authority is unchanged either way: `shouldOpenGroupInquiry`
(`ai/contribution.js:194`) already has three deterministic opening rules, two of which need no
human. Only the *worker's licence to exercise them unprompted* is withheld.

**Can implementation proceed? YES** — propose-only. Revisit with pilot data on leader agreement rates.

### D-B1 · May a sweep tell someone their Focus rests on a refuted Inquiry?

No law is at stake; `ai/behaviour.js` already governs surfacing volume and treats silence as success.
**Dominant option:** surface it, phrased as an offer to revisit. Withholding it wastes the person's
effort, which is the opposite of the product's purpose.

**Can implementation proceed? YES** — and the *computation* is unblocked regardless; only the
surfacing copy depends on this.

---

## 5 · CLASS A — genuinely requires the founder

### D-W3 · Coach-created versus coach-proposed personal Focus

**Genuinely open.** P0-D already prevents the coach's *rationale* from becoming empirical truth about
the player, so the epistemic half is settled. What remains is **agency**: may a coach place work on a
player's plate without the player accepting it?

| Option | Product consequence | Privacy | Pilot |
|---|---|---|---|
| **A · coach may create directly** | matches how coaching works; the player is told, not asked | a Focus about a person is visible to them; no disclosure risk | simplest |
| **B · coach may only propose; player accepts** | the player owns their development plan | same | needs an acceptance surface |
| **C · create directly, player may decline or close** | coach momentum, player agency | same | needs a decline action |

**Recommendation: C**, but this is a values question about the coach-player relationship at Falcon,
not an architectural one, and it should be answered by someone who knows that relationship.

**Blocks nothing.** `origin.by` must be recorded regardless of the answer — indeed *because* the
answer is open, since it cannot be enforced retroactively against records created without the field.

### D-E2 · Acceptable quality floor for a cheap model on member-facing text

**Genuinely open, and deferred.** Requires the crappy-model benchmark (Stage 14), which is itself
post-pilot. Only the founder can say what phrasing is acceptable to put in front of a Falcon player.

**Blocks:** E4 re-tiering, which is post-pilot. **Blocks nothing pre-pilot.**

---

## 6 · CLASS D — defer to pilot evidence

### D-P1 · How many peer nodes must a comparison aggregate span?
### D-P2 · Is a node leader's identifiability a person-level disclosure?

Both belong to the comparison Web, classified **SCALE** in the consolidated queue and confirmed
deferred in Stage 16. Falcon's value is within-branch intelligence. Neither blocks anything.

Retain the recommendations (≥3 peers plus leave-one-out stability; no-naming rule) as defaults for
whenever the capability is built.

---

## 7 · Reduced decision set — what to actually ask

| Ask now | Nothing |
|---|---|
| **Ask before post-pilot re-tiering** | D-E2 |
| **Ask before building Focus participation** | D-W3 |
| **Ask when a second organisation exists** | D-P1, D-P2 |

Everything else is settled by ratified direction or dominated by repository consequence.

**The one item needing founder *awareness* rather than a decision:** D-W5's lateral leak. It is a
correctness finding, not a choice — but it changes who can see whom, so it should be surfaced rather
than fixed silently.

---

## 8 · Corrections issued by this stage

| # | Document | Claim | Correction |
|---|---|---|---|
| 1 | `briefs/w3-w4-implementation-contract.md` §3.7 | *"a plain member … sees the people in all descendant nodes"* | **False.** `member` role has `view_team: false`; 3(a2) never fires for a plain member. The real divergence is that any `view_team` holder sees people under every node they *belong to*, including sibling branches |
| 2 | `INDEX.md` §7 | D-W5 *"keep as documented governance widening"* | **Reversed.** The premise was wrong; the behaviour contradicts R4 and its own comment |
| 3 | `INDEX.md` §7 | *"Two of thirteen block current work: D-W5 and D-E3"* | **Neither blocks.** D-E3 is answered by R8; D-W5 defines a parity-harness row rather than gating it |
| 4 | `INDEX.md` §7 | thirteen open decisions | **Two open**, both deferred |
