/* Truth layer — THE DEGRADED VOICE (HTTP, all six exits).

   FOUNDER LAW: deterministic code decides, the LLM writes the user-facing prose, deterministic
   code verifies it. The hole this suite closes is what happens when the middle clause does not
   run. Six paths through _composeTurn end without a written reply — the composer is off, no
   model is configured, the org is over budget, the model returned nothing usable, the grounding
   cage refused what it wrote, or the call threw — and every one of them used to fall through to
   the same deterministic templates, in IntelliQ's ordinary voice, with nothing anywhere saying
   the reply had changed hands. The product did not fail. It changed character mid-conversation
   and carried on, which on a demo stage is worse than failing.

   WHY THIS IS BEHAVIOURAL AND NOT A SOURCE SCAN. A regex over server.js proving each exit
   *contains* `_degraded(...)` is the first lie in docs/reviews/PROTOCOL.md — it matches a
   definition and says nothing about whether the value reaches a reply. So every case below
   drives the real POST /api/assistant/turn and reads response.composer off the wire. The
   provider boundary is steered by replacing ai.enabled / ai.budgetAvailable / ai.complete on the
   gateway module object, which is the same object server.js holds — no fake server, no fake
   route, the real handler all the way down.

   IQ_COMPOSER is read once at module load, so the disabled case cannot share a process with the
   other five. This file runs the five in-process and re-spawns itself with the flag off for the
   sixth, rather than pretending the flag-off path is covered by reading the source.

   Run: node scripts/composer-degraded-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const CHILD = process.env.IQ_DEGRADED_CHILD === '1';
// The parent runs the composer ON. The child it spawns runs with the flag absent.
if (!CHILD) process.env.IQ_COMPOSER = '1';

const ai = require('../ai/gateway.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. A mutation that makes the turn
   handler throw must print FAIL rather than killing the run before any line is printed. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'dgr';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    ash: { id: 'ash', name: 'Ashton Mbeki', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    // On the roster and deliberately never in any authorised context, so the grounding cage has
    // a real name to refuse rather than a fabricated test string it would ignore.
    rio: { id: 'rio', name: 'Rodrigo Salvatierra', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', parentId: null, leaderIds: [], memberIds: ['ash', 'rio'] } } },
});
_rebuildEmailIndex();

/* The real provider boundary, kept so every case can put it back. Restoring between cases is
   what stops one case's stub silently carrying the next case's verdict. */
const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete };
const restore = () => Object.assign(ai, REAL);

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok  = issueToken('ash', C, 'member');
  const turn = text => fetch(base + '/api/assistant/turn', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(r => r.json()).catch(() => null);

  const composerOf = r => (r && r.response && r.response.composer) || null;
  const replyOf    = r => (r && r.response && r.response.responseText) || '';
  const ASK = 'How have I been getting on with my finishing lately?';

  if (CHILD) {
    /* ── EXIT 1 of 6 — THE COMPOSER IS OFF ──────────────────────────────────────────────
       Not an error, and still not IntelliQ's normal voice. The flag being off is a deployment
       fact the person holding the phone has no way to know, and before this the only difference
       it made on screen was that the prose got duller. */
    restore();
    const r = await turn(ASK);
    const c = composerOf(r);
    ok('D1 with IQ_COMPOSER off the turn still answers — the kernel decided, and a decision is not withdrawn because the model was not there to phrase it',
      !!r && r.ok !== false && replyOf(r).length > 0);
    ok('D1b …and says so: composer.degraded is true with reason "disabled", rather than deterministic prose passing itself off as the model\'s',
      !!c && c.degraded === true && c.reason === 'disabled');

    server.close();
    console.log(`\ncomposer-degraded-http-smoke (composer off): ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }

  /* ── EXIT 2 of 6 — NO MODEL CONFIGURED ────────────────────────────────────────────────
     The commonest way a demo goes quiet: a key that is absent or rejected. */
  {
    restore();
    ai.enabled = () => false;
    const c = composerOf(await turn(ASK));
    ok('D2 no model configured is reported as degraded, with its own reason',
      !!c && c.degraded === true && c.reason === 'no_model');
  }

  /* ── EXIT 3 of 6 — OVER BUDGET ────────────────────────────────────────────────────────
     A model that exists and is not available to this org. Distinct from D2 because the two want
     opposite fixes, and a marker that could not tell them apart would send whoever is on stage
     looking for the wrong thing. */
  {
    restore();
    ai.enabled = () => true;
    ai.budgetAvailable = () => false;
    const c = composerOf(await turn(ASK));
    ok('D3 an org over its LLM budget is degraded for a DIFFERENT reason than an absent model',
      !!c && c.degraded === true && c.reason === 'over_budget');
  }

  /* ── EXIT 4 of 6 — THE MODEL RETURNED NOTHING USABLE ──────────────────────────────── */
  {
    restore();
    ai.enabled = () => true;
    ai.budgetAvailable = () => true;
    ai.complete = async () => '';
    const c = composerOf(await turn(ASK));
    ok('D4 an empty completion degrades rather than shipping an empty reply or a silent template',
      !!c && c.degraded === true && c.reason === 'empty');
  }

  /* ── EXIT 5 of 6 — THE GROUNDING CAGE REFUSED IT ──────────────────────────────────────
     The cage doing its job is the one exit that is GOOD news, and it produced exactly the same
     screen as the four failures. It still must not read as an ordinary reply. */
  {
    restore();
    ai.enabled = () => true;
    ai.budgetAvailable = () => true;
    ai.complete = async () => 'You have been sharper than Rodrigo Salvatierra in front of goal all month.';
    const r = await turn(ASK);
    const c = composerOf(r);
    ok('D5 a reply that invents an organisational specific is refused, and the refusal is degraded rather than silent',
      !!c && c.degraded === true && c.reason === 'unverified');
    ok('D5b …and not one word of what the model wrote reaches the person',
      !/Rodrigo Salvatierra/.test(replyOf(r)));
  }

  /* ── EXIT 6 of 6 — THE CALL THREW ─────────────────────────────────────────────────────
     A rejected model id, an auth failure and a rate limit all arrive here. */
  {
    restore();
    ai.enabled = () => true;
    ai.budgetAvailable = () => true;
    ai.complete = async () => { throw new Error('upstream 401 sk-live-DO-NOT-SHOW-THIS'); };
    const r = await turn(ASK);
    const c = composerOf(r);
    ok('D6 a thrown provider call degrades instead of quietly reverting to templates',
      !!c && c.degraded === true && c.reason === 'error');
    /* THE CLOSED VOCABULARY IS WHAT MAKES THIS SAFE, so the assertion is on the vocabulary and
       not only on this one reply. Checking the text alone passed against a `_degraded` that
       accepted anything, because nothing in the current code path happens to hand it the
       provider's message — an assertion that holds by luck rather than by rule. `reason` must be
       one of the six IntelliQ states, whatever the caller passes. */
    ok('D6b …and NOTHING of the provider\'s error reaches the reply',
      !/401|sk-live|upstream/i.test(replyOf(r) + JSON.stringify(c)));
    ok('D6c …because the reason is drawn from a CLOSED vocabulary of IntelliQ\'s own states, not from anything a provider said',
      !!c && ['disabled', 'no_model', 'over_budget', 'empty', 'unverified', 'error'].includes(c.reason));
  }

  /* ── THE OTHER HALF OF THE LAW: a reply the model DID write is not marked degraded. ──
     Without this the suite would pass with `degraded: true` hardcoded on every turn, which is
     PROTOCOL lie #6 — an assertion that defends the bug. */
  {
    restore();
    ai.enabled = () => true;
    ai.budgetAvailable = () => true;
    ai.complete = async () => 'You have kept at it. Tell me what the last few chances actually felt like and we can work from there.';
    const r = await turn(ASK);
    const c = composerOf(r);
    ok('D7 a reply the composer actually wrote is NOT marked degraded',
      !!c && c.degraded === false && c.reason === null);
    ok('D7b …and it is the model\'s words that reach the person',
      /what the last few chances actually felt like/.test(replyOf(r)));
  }

  /* ── THE CLIENT END. A structured marker nothing renders is a marker nobody sees — the same
     failure as no marker at all, which is the whole subject of this suite. Asserted against the
     RENDER SITES rather than the helper's declaration: PROTOCOL lie #1 is a test that matches a
     function nothing calls, and this repo has produced it seven times. */
  {
    const fs = require('fs');
    const appJs = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const calls = (appJs.match(/iqDegradedNote\(/g) || []).length;
    ok('D8 the client renders the marker on BOTH surfaces that show a turn — the member workspace and Today',
      calls >= 3 && /iqDegradedNote\(res\.composer\)/.test(appJs) && /iqDegradedNote\(r\.composer\)/.test(appJs));
    ok('D8b …and what it renders tells the person the normal response is unavailable, in words, not a code',
      /normal response isn't available right now/.test(appJs));
    ok('D8c …without naming a provider, a model, a key or an error — the reason stays on the server',
      !/provider|api key|rate limit|anthropic|openai/i.test(
        (appJs.match(/function iqDegradedNote[\s\S]*?\n}/) || [''])[0]));
  }

  restore();
  server.close();
  const label = 'composer-degraded-http-smoke';
  if (fail) {
    console.log(`\n${label}: ${pass} passed, ${fail} failed\n`);
    process.exit(1);
  }
  /* The flag-off case cannot run in this process — IQ_COMPOSER was read at require time. Spawn
     it rather than leave one of the six exits asserted by reading the source. */
  const { spawnSync } = require('child_process');
  const child = spawnSync(process.execPath, [__filename], {
    stdio: 'inherit',
    env: { ...process.env, IQ_COMPOSER: '', IQ_DEGRADED_CHILD: '1' },
  });
  const childFailed = child.status !== 0;
  console.log(`\n${label}: ${pass} passed, ${fail} failed (plus the composer-off case above)\n`);
  process.exit(childFailed ? 1 : 0);
});
