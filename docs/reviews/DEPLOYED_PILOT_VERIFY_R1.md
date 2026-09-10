# Deployed pilot verification — round 1

**Observed:** 2026-09-10T04:17:01Z onward.
**Main:** `680516631c5e53b6c86bc5d436a98efe8eea630f` — matches the expected SHA exactly, working
tree clean.
**Render URL given by the founder:** `https://platform-827l.onrender.com`

---

## STOP — THE CENTRAL QUESTION COULD NOT BE ANSWERED

**The deployed instance is unreachable from this session.** Not slow, not erroring — refused at
the network boundary before any request left.

```
$ curl -sS https://platform-827l.onrender.com/api/health
curl: (56) CONNECT tunnel failed, response 403      http_code=000
```

Confirmed at the proxy itself rather than inferred from the failure:

```
$ curl -sS "$HTTPS_PROXY/__agentproxy/status"
recentRelayFailures: [ { "host": "platform-827l.onrender.com:443",
                         "kind": "connect_rejected",
                         "detail": "gateway answered 403 to CONNECT (policy denial ...)" } ]
```

`/root/.ccr/README.md` describes this exact case and gives the instruction I followed:

> **403 / 407 from the proxy** — The destination host is not allowed by your organization's egress
> policy for this session. **Do not retry or route around it — report the blocked host.**

So I did not retry, did not attempt another route, and did not touch any Render configuration.

**The blocked host is `platform-827l.onrender.com:443`.** Lifting it requires an egress-policy
change by someone with that authority; it is not something this session can or should work around.

### The separation this pass exists to keep

| | Status |
|---|---|
| **CODE READY** | **YES** — main @ `6805166`, truth layer green, proven in a real browser at two widths |
| **DEPLOYED READY** | **UNKNOWN** — still nothing about any deployed instance has been observed, by anyone, at any point in this project |

**`DEPLOYED SHA MATCHES MAIN` is UNKNOWN, not NO.** I cannot say the deployment is behind main,
because I cannot see it at all. Reporting "behind" would be a guess wearing a verdict's clothes.

---

## 1. Pinned truth

| Thing | Value |
|---|---|
| Deployed URL | `https://platform-827l.onrender.com` (supplied by the founder; **not documented anywhere in the repo** — searched) |
| Deployed SHA / build | **UNOBSERVABLE** — see below |
| `origin/main` | `680516631c5e53b6c86bc5d436a98efe8eea630f` |
| Main asset stamp | `20260910b`, fingerprint `4c1b1e2604e3` |
| Observation window | 2026-09-10T04:17Z – 04:35Z |

### Two things worth knowing before anyone reads a deploy status

**1. The service name in `render.yaml` does not match the URL.** The blueprint declares
`name: intelliq-platform`, which would default to `intelliq-platform.onrender.com`. The founder's
host is `platform-827l.onrender.com`. Those are different service identities. So **I cannot assume
`render.yaml` governs the live service** — it may be a dashboard-configured service pointing at a
different branch, with different env vars, built from a different commit. Every statement below
about what "should" deploy is conditional on that assumption, which is unverified.

**2. `/api/health` cannot answer "which build is this?"** It reports `ok`, the AI key booleans,
voice/vision capability, composer mode and the time — and **no SHA, version or build id**. That is
a real gap for exactly this kind of pass: even with egress, health alone could not have pinned the
deployed commit. Recorded, not fixed: adding a field is a change, and this brief says not to.

**The test to run the moment egress exists**, in priority order:

```
1.  curl -s https://platform-827l.onrender.com/index.html | grep -o '?v=[0-9a-z]*' | sort -u
    -> must be  ?v=20260910b   (main's stamp; anything else means the deploy is behind)
2.  curl -s https://platform-827l.onrender.com/api/health
    -> composer.writes must read "on — the model writes the reply ..."
       ai.claude must be true
3.  curl -sI https://platform-827l.onrender.com/js/app.js?v=20260910b   -> 200, not 404
```

Step 1 is the deployed-SHA proxy. It is not a commit hash, but the stamp changes with every
shipped asset change and is the strongest build identifier the product currently emits.

---

## 2. Health / startup — NOT VERIFIED AGAINST THE DEPLOYMENT

Every item in this section requires reaching the host. None could be checked:

| Check | Result |
|---|---|
| app responds | **NOT VERIFIED** — 403 at the proxy |
| health / readiness endpoint | **NOT VERIFIED** (the endpoint exists and is honest in code; unread live) |
| persistence readiness | **NOT VERIFIED** |
| startup / runtime errors | **NOT VERIFIED** — no log access from here either |
| static assets load | **NOT VERIFIED** |
| asset version matches the final stack | **NOT VERIFIED** — main's is `20260910b`; the deployed value is unknown |

No secret was read, printed, or transmitted at any point.

---

## 3. Real model path — NOT VERIFIED, AND NOT VERIFIABLE FROM HERE EITHER

Two independent blocks, both reproduced:

**a. The deployed instance is unreachable** (above).

**b. No provider credential exists in this environment**, so the model path cannot be exercised
even locally:

```
ANTHROPIC_API_KEY: unset      OPENAI_API_KEY: unset
DATABASE_URL:      unset      IQ_COMPOSER:    unset
```

`ai/gateway.js:37` — `const HAVE_CLAUDE = !!process.env.ANTHROPIC_API_KEY;` — so with no key the
composer returns `_degraded('no_model')` and the deterministic path answers. **Every reply produced
in this project's entire history has been written by the deterministic templates.** That is stated
plainly rather than left for someone to discover on 26 September.

What *is* proven, and is a weaker claim: the degraded contract works. Every turn carries
`response.composer.degraded` as a boolean, never silently; the notice renders visibly at 390x844;
and no provider, model, key or raw error reaches the reader. So **if** the live model fails on the
day, the product says so instead of quietly changing character. That is the guard, not the
capability.

**`REAL MODEL COMPOSER: FAIL` below means "not demonstrated", not "demonstrated broken."** Nothing
observed suggests the path is defective — it has simply never been run.

---

## 4. Core live smoke — NOT VERIFIED AGAINST THE DEPLOYMENT

The full walk (Home, Inquiry, ask, Focus, outcome, return Home, lawful attention, "Why this?",
open related object, Library Keep, Forum, graph) **was re-walked in this pass against main's exact
checkout** — `6805166`, not a branch — in a real Chromium at both widths:

```
$ node scripts/stack-browser-check.js
stack-browser-check: 114 passed, 0 failed
```

That is the merged tree behaving correctly. It was **not** walked against
`platform-827l.onrender.com`, and I will not let the first stand in for the second.

No production data was touched: not one request reached the host.

---

## 5. Mobile — LOCAL ONLY

390x844 and 430x932, both walked on main's tree: no overflow, composer usable at 16px (no iOS
zoom), attention card visible, graph points each naming their evidence, Library controls reachable,
and the confirmation flow reachable end to end (mark, confirm, unmark). Deployed: **NOT VERIFIED**.

---

## 6. Voice reality

This section is fully answerable from code on main, and the answer is unchanged.

| Path | Status |
|---|---|
| **Browser dictation** (`SpeechRecognition`) | **WIRED AND REACHABLE.** `js/voice.js` is loaded by `index.html` at the current stamp; `window.IQVoice` is called from two sites; mic controls exist on all three composers (`iq-mic`, `iqt-mic`, `iqf-mic`). Client-side — no audio leaves the device. **Not exercised**: headless Chromium has no speech backend, so this is read, not reproduced. |
| **Server transcription** (`ai.transcribe`) | **DEAD FOR THE PILOT.** Defined at `ai/gateway.js:433`, requires `OPENAI_API_KEY`, and has **no production caller** — the only references are `provider-boundary-smoke` and a comment recording that the Studio which used it was removed. There is no transcribe route. **I do not claim server transcription works.** |
| **Model composer** | A separate path entirely (`ai/gateway.js` → Claude), and unverified for the reason in §3. |

Conflating the first with the second is the specific error this section exists to prevent, and the
distinction holds: dictation is a browser capability that needs no key and no server; transcription
is a server capability with a key requirement and no caller.

---

## 7. The eight live-only items, classified

From `FINAL_PILOT_STACK_R1.md`. No new blockers invented.

| # | Item | Class | Why |
|---|---|---|---|
| 1 | No live model has run against this stack | **BLOCKED BY ENVIRONMENT** | No credential here, no egress to the instance. The single highest-value item a person with dashboard access can close, and it takes minutes: open the app, ask one ordinary question, confirm no degraded notice appears |
| 2 | Nothing deployed / instance behind | **BLOCKED BY ENVIRONMENT** | Host not on the egress allowlist. The three commands in §1 close it |
| 3 | `in_view` evidence binding has no screen | **NOT REQUIRED FOR PILOT** | The `sole` binding is live, so the declared relation works today. A per-record picker is UI work, not law |
| 4 | "Since you last looked" needs a read receipt | **NOT REQUIRED FOR PILOT** | A deferred founder decision. The reasons that fire without it include the strongest one — work closed out, question still open |
| 5 | Priority ordering proven with one marked object | **NOT REQUIRED FOR PILOT** | The comparator is a declared list, not a score; more marks exercise the same code path |
| 6 | Emulated viewports, not devices | **NOT REQUIRED FOR PILOT** | Two widths in real Chromium. A five-minute check on the founder's own phone would close it properly and is worth doing before the day |
| 7 | One reader, one squad; no concurrency | **NOT REQUIRED FOR PILOT** | Durable writes go through CAS, guarded by `db-cas-smoke` and `write-conflict-smoke`. Simultaneous end-to-end use is untested, but the squad is 28 people on one day, not a load event |
| 8 | `OPENAI_API_KEY` gating unexercised | **NOT REQUIRED FOR PILOT** | It gates only `canTranscribe`, the uncalled `transcribe`, and a cross-provider fallback. Server transcription is not a pilot capability |

**MUST FIX: none.** Nothing in this pass found a defect. Items 1 and 2 are unverified, which is a
different thing and is why they are blockers rather than fixes.

---

## What I could not verify

- **Everything about the deployed instance**, including whether it exists, what it runs, whether
  it has a model key, and whether it has a database. The 403 is the whole of what was observed.
- **Whether `render.yaml` governs the live service at all** — the names differ (§1).
- **Whether a deploy was triggered by the merge** at 04:08Z. If the service auto-deploys from main
  it would have; that is an assumption, not an observation.
- **Browser dictation end to end** — read and traced, never spoken into.
- **Any log** from the deployed host. No log access exists from this session.

---

DEPLOYED SHA MATCHES MAIN: **UNKNOWN**
APP RESPONDS: **FAIL** (unreachable — 403 at the egress proxy, never reached the host)
REAL MODEL COMPOSER: **FAIL** (not demonstrated; no credential and no reachable instance)
HOME: **FAIL** (deployed: not verified)
INQUIRY: **FAIL** (deployed: not verified)
FOCUS: **FAIL** (deployed: not verified)
PRIORITY SURFACE: **FAIL** (deployed: not verified)
LIBRARY: **FAIL** (deployed: not verified)
FORUM: **FAIL** (deployed: not verified)
GRAPH: **FAIL** (deployed: not verified)
MOBILE: **FAIL** (deployed: not verified — local at both widths passes)
VOICE DICTATION: **NOT VERIFIED** (wired and reachable in code; never spoken into)

LIVE PILOT BLOCKERS: **2** — both verification blockers, neither a known defect:
1. the deployed instance is unreachable from any session under the current egress policy;
2. no reply has ever been written by a real model.

READY FOR 26 SEPTEMBER PILOT: **NO** — on evidence, not on doubt. The code is ready and proven;
what is missing is that **nobody has ever seen the deployed system run**. "Ready" would be a claim
about a system no one has observed, and the eight FAILs above are all the same single fact
reported once per surface, not eight separate problems.

Both blockers are closable by a person with Render dashboard access in well under an hour, using
the three commands in §1 and one ordinary question typed into the live composer.
