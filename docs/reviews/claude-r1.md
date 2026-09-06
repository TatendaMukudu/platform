# Review round 1 — Claude

**Read:** `main` @ `5683df3` (protocol and lane briefs), working tree at `5683df3` plus the
AGENTS.md amendment in PR #85.
**Lane:** the client, and the thing a person actually touches.
**Ran:** `node scripts/demo-walkthrough.js` (new), `node scripts/card-coherence-smoke.js` (new),
`npm test`, and nine mutations across two suites.

Everything below was found by **driving a real Chromium at 390x844 against the seeded Alma
organisation**, signed in as the coach, the demo player, and a player who said nothing all
season. That was the point of the lane: everything merged on 6 September had been asserted
through HTTP read paths and a headless harness, and nothing had been opened in a browser.

Three of the four findings were invisible to every existing assertion in the truth layer.

---

## Scope actually covered

`js/app.js`, `index.html`, `ai/present.js`, `ai/voice.js`, `ai/team-state.js` (read only),
`js/auth.js` (read only), and the six surfaces Home / Highs / Lows / Inquiries / Focuses /
Library for three different people. Screenshots in `docs/shots/r1/`.

**Not looked at:** voice and the microphone (no touch device, and shrinking a viewport is not a
keyboard), the object thread and the composer in depth, the Library shelf's remove and
move controls, tap-target re-measurement, and anything on a real iOS Safari. The 29 tap-target
findings from the September pass are **not** re-measured and remain open.

---

## Reproduced failures

### 1. A card said two different things about how sure it was. (fixed)

On the coach's Home, against the seeded demo:

```
Defending set pieces
EARLY THINKING
I'm confident about this one.
```

A badge and a sentence contradicting each other about the same belief, on the first screen a
coach sees, in a product whose entire claim is that its confidence is calibrated.

**Cause.** A card is composed by two independent readers of the same object.
`ai/voice.explainObject` reads `raw.band || raw.confidence.band`. `ai/present.inquiryCard` read
`raw.confidence.band` and defaulted to `tentative`. A kernel inquiry carries
`confidence: { band }`; a team-state projection — what `openQuestion` returns for a squad's open
question — carries a **flat** `band` and no confidence object. So the sentence saw `supported`,
the badge saw its own default, and only one of them had a default to hide behind.

Neither reader was wrong about its own field. Nothing in the truth layer caught it because every
existing assertion checks one reader at a time.

### 2. The squad view was a room with no door. (fixed)

`leader-home` renders the group at its own grain: the squad's High, its Low, the open question,
the focus, and the findings the cohort floor is **withholding**. It is the most distinctive
surface in the product. Driven in a browser it produces exactly what it should:

> Varsity Squad · 28 players
> **HIGH** the midweek recovery session is what is protecting the Thursday session — six people, six independent sources
> Would change our mind: a normal Thursday in a week the session was cancelled.
> **LOW** late returns cost the squad more in the following days than the travel itself — seven people, seven independent sources
> **INQUIRY** is it the first contact or the second ball?
> **FOCUS** Near post is the first contact — one man attacks the ball, nobody ball-watches
> **Not shown yet: Defending set pieces — too few people have spoken about it to say so without pointing at individuals.**

**And a coach had no way to reach it.** `leader-home` was in `NAV_ROUTES` and in no navigation.
The only ways in were three legacy route aliases and one dot inside a briefing. The nav is Chat,
Inquiries, Focuses, Highs, Lows, Library, Org tree, and Settings for a superadmin.

`_renderTeamState()` is called from Home, finds no `#team-state` container there, and returns at
`if (!box) return` — silently, correctly, by design, because a group strip that fails to load
must not take down a leader's home. `/api/group/:id/state` was never requested by the page at
all.

**I nearly fixed this the wrong way.** The obvious move is to put the strip on Home. The Home
template forbids it in as many words — *"HOME IS ONE QUESTION. Founder decision, September 2026
... Nothing else may ever appear here."* So the fix is a door, not a relocation.

### 3. Every player in the pilot organisation is a leader. (NOT fixed — escalated)

Found while checking that the new nav item was correctly gated. It is gated on
`Auth.isLeaderNode()`, and that is **true for a plain player with no leadership nodes at all**.

```
SEEDED PLAYER  role=member  leadershipNodeIds=0
  server _isLeader -> true
  /api/auth/me leads = true
  permissions = ["view_members","assign_scenarios","view_reports",
                 "view_team","review_checkins","view_insights"]
  200   /api/admin/checkin-reconciliation   <-- 200 for a PLAYER
```

**Cause.** `_isLeader` rule 4, `_leadsViaHierarchy`: *"A user leads via hierarchy if any node
they belong to (member or leader) has at least one sub-node beneath it."* Every Alma player is a
member of Varsity Squad, and Varsity Squad has the four position groups beneath it. So all 28
players satisfy rule 4, `_effectivePermissions` adds `LEADER_GRANTS` to every one of them, and a
`view_insights`-gated admin route answers 200.

The rule is documented and reasonable for the tree shape it was written for — *"a person in
'Coach' (which has child 'Player') leads the Player branch automatically"*. It assumes tiers are
roles. In a squad tree, where everybody is a member of the squad **and** of a position group,
every member sits in a node with sub-nodes.

`endpoint-smoke` asserts *"a plain member (oversees no one) is denied (403)"* and it passes —
because its fixture is flat. That is protocol pattern 5: a gate proven in a tree shape the pilot
does not have.

**This is the most serious thing I found and I have not fixed it.** It changes who holds
authority across the whole product, which is squarely what the protocol says to escalate.

### 4. The app loads four external hosts and this environment blocks all of them. (not fixed)

`cdn.jsdelivr.net` (chart.js, jszip), `cdn.sheetjs.com` (xlsx), `fonts.googleapis.com`. Every
page in the walkthrough logged `ERR_TUNNEL_CONNECTION_FAILED`. The app renders correctly without
them here, so degradation is graceful for what I exercised — but I did not test attachment
parsing, which is what jszip and xlsx are for. Worth knowing before a pilot on a college network.

---

## Code-reading concerns (not reproduced)

- `chart.js` is loaded from a CDN on every page load. `ai/chart.js` and the object-thread chart
  render inline SVG, with a comment saying so deliberately. I did not establish whether anything
  still uses the library. If nothing does, it is a CDN dependency on every page for no reason.
- `renderIntelligence` and `renderToday` both render `#lead-inquiry` and `#team-state`. Two
  pages writing the same two containers is the condition that made finding 2's assertions lie
  (see the mutation map). I did not check whether both pages are still reachable.

---

## Fixed

| What | Where | Assertion | Mutation that proves it |
|---|---|---|---|
| The two readers of a card's band now read the same union, in one place | `ai/present.js` `inquiryCard` | `CC1` x8, `CC2b`, `CC2c` | Q1 restores the defect |
| A missing band still reads as the weakest one | `ai/present.js` | `CC3`, `CC3b` | Q2 makes it confident |
| The squad view is in the navigation, for whoever leads a node | `js/app.js` `_NAV_EXTRA` | `CC5`, `CC5b` | R1 removes it, R2 widens it |
| Home is still one question | (nothing changed — pinned) | `CC5c` | R3 puts the strip on Home |
| The page the route renders holds the container and calls the renderer | (nothing changed — pinned) | `CC5e`, `CC5f` | R4, R5 |

New suite: `scripts/card-coherence-smoke.js`, 20 assertions, registered in `scripts/test.js`.
New tool: `scripts/demo-walkthrough.js` — drives the seeded org in a browser as three people and
**compares the screen against the API**, reporting where they disagree. Not in `npm test`; it
needs a browser binary.

## Refused / escalated

**Finding 3 — `_isLeader` rule 4.** Every member of a node that has sub-nodes is granted
`LEADER_GRANTS`. In the pilot's own org shape that is all 28 players.

The decision is not mine because rule 4 exists for a real reason: orgs built through onboarding
set `supervisorId` and never `leaderIds`, so without it those orgs have no recognised leaders at
all. Three options, none free:

1. **Rule 4 counts only nodes you LEAD, not nodes you are a member of.** Closes it exactly.
   Cost: onboarding-built orgs go back to having no leaders until somebody is named one.
2. **Rule 4 stays, but `LEADER_GRANTS` is not applied through it** — hierarchy leadership
   affects navigation and framing, not permissions. Smaller blast radius; leaves two meanings of
   "leader" in the codebase, which is the condition every drift in this repo has started from.
3. **Leave it, and make the pilot's tree flat** — no position groups under Varsity Squad. Cheap
   and it makes the demo worse.

My read is (1) with a migration that names the existing supervisors as node leaders, but this
changes authority truth and it is yours to call.

## Not fixed, and why

- The 29 tap-target findings: not re-measured. Out of time, not out of scope.
- The CDN dependencies: I do not know which are still used, and removing a live one to find out
  is not a review.
- The nav gate I added is `Auth.isLeaderNode()`, which finding 3 shows is currently true for
  everyone in this org. **The gate is correct in intent and meaningless in practice until
  finding 3 is decided.** I deliberately did not swap it for a different check, because that
  would paper over the real defect with a second one. Stated here rather than left to be
  discovered. A player reaching the squad card is not itself a disclosure problem — the founder's
  own ruling (MR17) is that a player reads the same squad report, and `/api/group/:id/state`
  governs it server-side either way.

## Mutation map

| Mutation | Assertion that went red |
|---|---|
| Q1 present reads only the nested band (restores the defect) | CC1 flat x4 |
| Q2 a missing band becomes a confident one | CC3, CC3b |
| Q3 openQuestion drops the band on the way out | CC2, CC2c |
| Q4 the badge vocabulary drifts from the sentence vocabulary | CC1 probable x2 |
| R1 remove the squad from the nav | CC5, CC5b |
| R2 offer the squad view to everybody | CC5, CC5b |
| R3 put the strip on Home | CC5c |
| R4 the leader page stops calling the renderer | CC5f |
| R5 the container is removed from that page | CC5e |

**Two of these bit nothing on the first attempt, and both were my fault.** `CC5d`/`CC5e`
originally matched the container and the call *anywhere* in `app.js` — and both appear twice,
once in `renderToday` and once in `renderIntelligence`. Deleting either from the page the route
actually renders left the assertions green against the other copy, and the squad surface would
have been unreachable with the suite passing.

That is protocol pattern 2, and the **sixth** time this exact shape has shipped in this
repository. It was caught only because the mutation was run. The assertions now extract the body
of the function the route names and match inside it.

## Touched another lane

`ai/present.js` is Astra's lane (the kernel and the surfaces). The change is two lines in
`inquiryCard`'s band resolution, and I made it because the defect was a rendering contradiction
I found on screen. Flagged so the conflict is expected.

Finding 3 is Codex's lane (route authority). I did not change anything there.

## What I could not verify

- **Nothing on a real device.** Chromium at 390x844 with `isMobile` is a good proxy and is not
  an iPhone. Voice, the keyboard, and touch targets all need the real thing.
- **The Library shelf's controls.** I saw the page render; I did not exercise New folder, Keep,
  Remove, or opening a row for each of the six kinds. `openFromShelf` routes `material` to
  `focus` and `conversation` to Home and I still do not know whether either is right.
- **Whether finding 3 exposes data**, as opposed to permissions. One admin route answered 200;
  the four other leader-shaped paths I tried returned 404 because they do not exist under those
  names. I did not hunt for the routes those six permissions actually gate. Codex should.
- **The external CDNs** were blocked throughout, so anything depending on them was never
  exercised — including attachment parsing.
- **My own new suite** proves what it asserts and nothing about the surfaces it does not touch.
  Twenty assertions is not a client review; it is four findings pinned.
