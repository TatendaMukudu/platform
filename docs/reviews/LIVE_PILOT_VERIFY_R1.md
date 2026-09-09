# Live pilot verification — round 1

**Observed:** 2026-09-09T21:31:45Z (fetch) through ~22:20Z.
**Branch:** `claude/live-pilot-verify-r1`, cut from the landing candidate.

---

## STOP — READ THIS FIRST

**No deployed verification was possible, and the brief's central question cannot be answered
against a deployed instance from here.** Two independent reasons, both reproduced:

**1. No deployed URL exists in this repository.** Searched every `.md`, `.yaml`, `.yml`, `.json`
and `.js`. The only hits are placeholders — `BASE_URL=https://your-app.onrender.com` in
`ADVISOR_SMOKE.md` and `scripts/advisor-smoke.js`. `render.yaml` names the service
(`intelliq-platform`) but no host.

**2. This sandbox denies all external egress.** Reproduced against both `render.com` and the
hostname inferred from the service name:

```
$ curl https://render.com                              → curl: (56) CONNECT tunnel failed, 403
$ curl https://intelliq-platform.onrender.com/api/health → curl: (56) CONNECT tunnel failed, 403

$ curl "$HTTPS_PROXY/__agentproxy/status"
"recentRelayFailures": [
  { "kind": "connect_rejected", "host": "render.com:443",
    "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)" },
  { "kind": "connect_rejected", "host": "intelliq-platform.onrender.com:443", ... } ]
```

The allowlist covers package registries and Anthropic's own API endpoints. Nothing else.

**3. No provider credential is present.** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`
all unset. So even locally, no reply has ever been written by a real model in this session.

### The separation the brief asked for

| | Status |
|---|---|
| **CODE READY** | **YES** — the landing candidate is green, and both roles were walked end to end in a real browser |
| **DEPLOYED READY** | **UNKNOWN** — nothing about any deployed instance has been observed by anyone, at any point in this project |

Everything below is **LOCAL BROWSER PROVEN** against `claude/pilot-integration-r2` @ `1a6fffe`
(= PR #86 @ `9879dcb` + the integration proof), running as a real Express server in a real
Chromium, against the **real Alma College seed**: 28 players, 3 staff, 54 pieces of evidence,
28 inquiries. That is a different and weaker claim than "it works live", and I will not blur them.

---

## 1. Pinned truth

| Thing | SHA |
|---|---|
| `origin/main` | `5683df3de63d8daa54d345ab39fa262db1908d2e` |
| PR #86 `codex/pilot-experience-r1` | `9879dcb60dcd2a3af150810571e7aafc4256b03c` — open, **CI still never run** |
| `claude/pilot-integration-r2` (landing candidate) | `1a6fffedcb77ceb6e4a4770beca7755440e83936` |
| `claude/pilot-integration-r1` (r1 rehearsal, retained) | `47c1152024c25d2e3ba1c97a0a5bcaf8ba075b2c` |
| Deployed URL | **none documented** |
| Deployed SHA | **UNKNOWN — unobservable from here** |

---

## 2. The composer

**Proven live (browser + server):**

- Asking IntelliQ about an open inquiry returns an answer — `B4`.
- Every turn carries `response.composer` with a boolean `degraded` — **never silently** — `B4b`.
- No provider, model, key or raw error reaches the reader — `B4c` asserts against
  `/anthropic|openai|api[_ ]?key|sk-|status 5\d\d|ECONN/i`.
- With the model unavailable the degraded marker renders **visibly** at 390×844, in words, naming
  nothing internal — `library-browser-check` B8–B9c.
- `/api/health` is honest to an operator, and quotable before a demo:

```json
"composer": { "on": true, "deterministicOnly": false,
  "writes": "off — no language-model key is configured; every reply is written by the deterministic templates" }
```

**Proven with the provider boundary stubbed** (`composer-degraded-http-smoke`, 13 + 2):

- `D7` — a reply the composer actually wrote is **not** marked degraded.
- `D7b` — the model's words are what reach the person.
- `D6c` — the reason is drawn from a closed vocabulary of IntelliQ's own states.
- All six exits marked; the `requestedAction` governed shortcut works model-off, which is what
  made the browser Keep flow (`B3pre`–`B3pre4`) possible without a credential.

**NOT proven, and cannot be from here:** that a **real** Anthropic reply is used, reads well, or
survives the grounding cage against real model output. Nobody has seen the product answer with a
real model. That is the single largest unverified thing in this project.

---

## 3. Core user journeys — walked as a player and a coach

`scripts/live-journey-check.js` (new, **not** in `npm test` — it needs a browser, and the truth
layer is deliberately hermetic). **37 passed, 0 failed.**

Player: Ravi Okonkwo. Coach: Gideon Nakamura. Both at 390×844; the player also at 430×932.

| | Journey | Evidence |
|---|---|---|
| A | **HOME** | Greeting + name + the one composer. **All eight legacy panels render at zero height** — "HOME IS ONE QUESTION" is true of the DOM, not just the intent. `A1`, `A2` |
| — | **Dead controls** | **Every inline handler on 8 player routes and 6 coach routes resolved to a real function.** `A3`, `L1` |
| B | **INQUIRY** | Opens as a thread with its verdict row `[Work on this, Keep, That's settled, I disagree, Not now]`, states what it rests on, chart present. Asked IntelliQ about it — answered. `B1`–`B4c` |
| C | **HIGH** | Opens with verdicts, states its basis. `C1`–`C3` |
| D | **LOW** | Same. `D1`–`D3` |
| E | **FOCUS** | Created → **private by default** → visibility changed → outcome recorded → **exactly one focus**, not a second from a duplicate lifecycle owner. `E1`–`E4` |
| F | **FORUM** | Coach opens the governed room; the room states speech is not evidence; a **player in that group can read it too — membership is the access, not rank**; no private text carried in. `F1`–`F4` |
| G | **LIBRARY** | `library-browser-check` **22/22**: Today → Library, governed Keep (press → **nothing filed** → Confirm → filed as a reference), folder created, filed, moved, opened, moved back out. |
| H | **MATERIAL** | Picker present with a non-empty accept list, no PDF, no image, keeps `.pptx`/`.docx`/`.xlsx`/`.csv`. `H1`, `H2` |
| I | **GRAPH** | Coach's squad view: high, low, question and focus all present, **1 thing withheld and named**, `carriesPrivateContent` not set. Firming chart previously rendered live: 2 series sent, **1 line drawn**, threshold present, **dissenting account excluded (3 of 4)**. `I1`–`I2` |
| J | **SETTINGS / NAV** | No navigation label appears twice on one screen. `J1` |

**One thing to know about the coach.** `/api/objects?kind=inquiry` returns **0** for the coach.
That is not a defect — a coach does not read the squad through the member buckets; the squad
arrives through `/api/group/:nodeId/state`, and through that door everything is there. I record it
because "the coach's list is empty" is exactly the shape of a false alarm.

---

## 4. Mobile

| Check | 390×844 | 430×932 |
|---|---|---|
| Horizontal overflow | **none** | **none** |
| Uncaught page errors | none (excluding the blocked Chart.js CDN) | — |
| Sub-44px targets on Home | **4** | 4 |

The four: **Menu 36×36**, **Send 36×40**, **Private 59×36**, **× (dismiss) 36×36**. All are inside
larger touch areas or are secondary. **None is blocking** — the primary path (type, send, open a
card, Keep, confirm) is reachable throughout. Consistent with the carried 29-target debt.

**Composer, measured rather than asserted.** The row is 348px wide: attach 36 + textarea **188** +
mic 44 + send 36. Text is **16px**, which is the line that matters — below it iOS Safari zooms the
page on focus and the app appears to jump. The textarea **grows on a long message: 34px → 120px**,
so nothing typed is hidden.

188px is tight — roughly 20 characters visible at a time on the product's primary input. That is a
real observation for a phone-first product and it is **not a blocker**. Recorded, not fixed:
changing the composer layout is a design decision, not a verification finding.

---

## 5. Voice and provider reality

**These are two different things and were conflated in my own landing audit. Correcting that here.**

- **Browser dictation** — `js/voice.js` uses the browser's `SpeechRecognition`. Entirely
  client-side. **Does not depend on any key.** Present on three composers (`iq-mic`, `iqt-mic`,
  `iqf-mic`). Not exercisable headlessly (Chromium grants no speech engine), so: **code present,
  live behaviour VERIFY ON REAL IPHONE.**
- **Server transcription** — `ai.transcribe()` (OpenAI Whisper). `grep -c "ai.transcribe(" server.js`
  → **0**. It has no caller and no route. It is built and unused.
- **`/api/health` `voice`** — reports `ai.canTranscribe()`, i.e. whether an OpenAI key exists.
  Currently `false`. It reports a capability nothing calls.
- **`OPENAI_API_KEY` absence disables:** `canTranscribe()`, the uncalled `transcribe()`, and the
  **cross-provider fallback** at `ai/gateway.js:278` (Claude fails after retries on a text-only
  prompt → no second provider). It does **not** disable composer prose or attachment interpretation,
  both of which run on `ANTHROPIC_API_KEY` alone.

---

## 6. Citations

- Internal: the deterministic path carries `qa.citations`; the composed path returns `sources` from
  the four retrieval channels. Both render. Mutation `FG5` (strip citations from the turn) turned
  `turn-grounding-smoke` red — the guard bites.
- External: `_sourceList` emits a `url` only for `kind === 'web'` and only for `http:`/`https:`;
  the client renders it as an explicit **"Open external source"** anchor with
  `rel="noopener noreferrer"`. Mutations `P2` (strip the url) and `P3` (allow an unsafe scheme)
  both turned `CA17d` red.
- Unauthorised source text: not exposed. `F4` confirms the forum room carries no private member
  text; `I1c` confirms the squad view sets no private-content flag.
- **"Why are you saying that?"** has a defensible answer on every surface walked: the belief threads
  state their basis (`B3`, `C3`, `D3`), the chart states its own limits, and the squad view names
  what it is withholding.

---

## 7. Failure hunt

I hunted all twelve named defect classes. **Zero product defects were found.**

What I did find was **five defects in my own harness**, each of which first presented as a product
failure. They are recorded because the pattern matters more than the outcome:

| # | Presented as | Actually |
|---|---|---|
| 1 | 40+ dead controls across every screen | `window.MemberApp` is `undefined` — `MemberApp` is a top-level `const`, reachable by bare name from an inline handler but never a window property. **The same confusion that made a real accept attribute render empty, arrived at from the opposite side.** |
| 2 | Every `Recognise` button on the coach's roster dead | My regex matched the *first* call in a compound handler — `event.stopPropagation()`, undefined outside dispatch — not `leaderObserve`, which exists at `js/app.js:6806` |
| 3 | All three belief buckets empty | Wrong route: `/api/objects?kind=` not `/api/objects/:kind` |
| 4 | The player has no High | Correct product behaviour — `seed-alma` SA28 pins that several players said nothing all season. Harness picked the first member, not one with a full record |
| 5 | The coach's squad has 0 highs and 0 lows | The state names them in the **singular** (`high`, `low`, `question`), not as arrays |

**This cuts both ways and I am not going to pretend otherwise.** A harness that needed five
corrections before it told the truth is a harness whose *passes* deserve scepticism too. What
makes the passes above worth something is that the load-bearing ones are independently
mutation-proved elsewhere: 14 integration mutations, 5 Forum/chart/citation mutations, 6 on #86's
experience changes — 25 in total across this and the two prior passes, every one biting its named
assertion.

**One assertion I rewrote rather than quietly relaxed.** My first `K2` required the composer input
to be ≥200px wide — a number I invented on the spot with nothing behind it, against a composer that
measures 188. Moving that threshold silently would be exactly the thing PROTOCOL forbids. It is
removed and named: `K2` now asserts the 16px iOS-zoom line, which has a real consequence, and
`K2b` asserts the box grows. The width is reported as an observation and judged in §4.

---

## 8. Final pilot matrix

| Area | Classification |
|---|---|
| HOME | **LIVE PASS** (local browser) |
| COMPOSER — degraded path | **LIVE PASS** |
| COMPOSER — real model reply | **MUST VERIFY** — never observed, needs a credential |
| INQUIRY | **LIVE PASS** |
| HIGH | **LIVE PASS** |
| LOW | **LIVE PASS** |
| FOCUS | **LIVE PASS** |
| FORUM | **LIVE PASS** |
| LIBRARY | **LIVE PASS** |
| MATERIAL | **LIVE PASS** |
| GRAPH (firming SVG) | **LIVE PASS** |
| GRAPH (Chart.js surfaces) | **CODE PASS / NOT PROVEN** — CDN blocked here |
| CITATIONS | **LIVE PASS** |
| SETTINGS / NAV | **LIVE PASS** |
| MOBILE 390 / 430 | **LIVE PASS**, 4 non-blocking sub-44px targets |
| VOICE dictation | **VERIFY ON REAL IPHONE** — client-side, not headless-testable |
| Server transcription | **SAFE TO DEFER** — built, no caller, no route |
| Composer input width (188px) | **SAFE TO DEFER** — usable, grows, 16px text |
| Recognition strip on Home | **VERIFY LIVE** — not visible for this player; would render for one with recognitions. Founder decision if so |
| Everything deployed | **UNKNOWN** |

### The seven remaining live-verify items — none is code work

1. **Does a deployed instance exist, and at what SHA?** Owner: founder.
2. **`/api/health` on that instance** — confirm `composer.writes` is not the "no key" string.
3. **A real model reply**, seen once by a human. Owner: founder.
4. **Physical iPhone.** [carried OPEN since the first audit]
5. **Chart.js-backed surfaces** in a browser with CDN access.
6. **The recognition strip** for a player who has recognitions.
7. **The four sub-44px targets** under a real thumb.

### What would make me say yes

The code is ready. Two of the seven are the gate: **somebody must open the deployed app once and
see a real model reply.** Neither needs an engineer — they need the URL and the key, both of which
only the founder has.

---

DEPLOYED SHA MATCHES LANDING CANDIDATE: **UNKNOWN**
HOME: **PASS**
COMPOSER: **PASS** (degraded path and plumbing; real-provider prose unproven)
INQUIRY: **PASS**
HIGH: **PASS**
LOW: **PASS**
FOCUS: **PASS**
FORUM: **PASS**
LIBRARY: **PASS**
MATERIAL: **PASS**
GRAPH: **PASS**
CITATIONS: **PASS**
MOBILE: **PASS**
VOICE DICTATION: **NOT SUPPORTED** in this harness — client-side `SpeechRecognition`, code present, unverifiable headlessly
PILOT BLOCKERS FOUND: **0**
LIVE-VERIFY ITEMS REMAINING: **7**
READY FOR REAL PILOT: **NO** — the code is ready and both roles work end to end in a real browser, but nothing deployed has ever been observed and no reply has ever been written by a real model. Both gates are the founder's to open.

Not merged. No product code changed.
