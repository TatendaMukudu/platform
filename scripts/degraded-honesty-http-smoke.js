/* Truth layer — A SUBSTITUTE THAT DOES NOT SAY IT IS ONE.

   The product already knows how to be honest about this. `COMPOSER_DEGRADED` is a closed
   vocabulary of six facts about IntelliQ's OWN state — off, unconfigured, over budget, empty
   output, refused by the grounding cage, thrown — naming no provider, no model, no key and no
   error message, and the client renders exactly one sentence for it in exactly one place. The
   composer has used it since it was written.

   TWO OTHER SURFACES THAT FALL BACK DID NOT. Both caught the failure and substituted stock copy
   with nothing anywhere saying the model had not written it.

     GET /api/workspace/briefing   caught, commented "fall back to no narrative"
                                   -> "Your group looks steady this week — 3/4 active."
     _recordCheckin                caught, commented "keep the deterministic acknowledgement"
                                   -> "Got it — I've added that and folded it into your picture."

   The second is the one that costs something real. A person who has just told IntelliQ they are
   not sleeping receives a warm, specific-sounding sentence that nothing actually read — and they
   cannot tell it from the one they would have got if it had. The first is quieter and still
   wrong: a leader cannot tell a considered briefing from a stock line about their group.

   THE FIX IS THE EXISTING OWNER, NOT A THIRD NOTION OF "DEGRADED". Both report through
   `_degraded()`, both carry it in the field name the client already reads, and the client renders
   the same one sentence. Nothing new was written for either.

   WHAT THE SENTENCE MUST NOT SAY is asserted as hard as what it must: the reason stays on the
   server for the logs, because "the provider rejected the configured key" is ours to act on and
   is not an explanation anybody reading a check-in is owed.

   Run: node scripts/degraded-honesty-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
/* A HOST WITH CREDENTIALS THAT FAIL — not a host with models switched off. "Off" is a different
   state with its own answer, and it is the easy one; this is the pilot's real bad day. */
process.env.ANTHROPIC_API_KEY = 'broken-key-for-degraded-probe';

const gateway = require('../ai/gateway.js');
const THROWN = 'provider unreachable: connection reset by peer';
for (const n of ['complete', 'completeJSON', 'understand', 'transcribe']) {
  gateway[n] = async () => { throw new Error(THROWN); };
}

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _recordCheckin } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'dgh';
_loadAllStores({
  orgMeta: { [O]: { orgName: 'Degraded Org', orgMode: 'sports' } },
  orgUsers: { [O]: {
    m: { id: 'm', name: 'Mel',   email: 'm@d.io', role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['squad'] },
    n: { id: 'n', name: 'Nia',   email: 'n@d.io', role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['squad'] },
    c: { id: 'c', name: 'Coach', email: 'c@d.io', role: 'coach',  orgCode: O, status: 'active', leadershipNodeIds: ['squad'] },
  } },
  orgNodes: { [O]: { squad: { nodeId: 'squad', name: 'Squad', parentId: null, childNodeIds: [],
    memberIds: ['m', 'n'], leaderIds: ['c'], rev: 1 } } },
});
_rebuildEmailIndex();

/* EVERY MACHINE WORD THIS PRODUCT MUST NEVER PUT IN FRONT OF SOMEBODY. The thrown message is in
   the list because it is the one actually in flight during this run — if any surface relays it,
   that is the exact failure, not a hypothetical one.

   ── AND WHY THE HTTP CODES ARE MATCHED DIFFERENTLY ─────────────────────────────────────────
   This checked every word as a raw substring of the whole JSON envelope, which made the numeric
   ones FALSE-POSITIVE ON RANDOM DATA. Ids are random alphanumerics and timestamps are ISO
   strings, so `turn_a500zjfd` or a millisecond field of `.429Z` matched `500` and `429` with
   nothing whatever wrong. Measured: about one generated id in ten thousand contains one of them,
   and a turn payload carries several ids and several timestamps.

   That made DH-E2 — a PRIVACY assertion — intermittently red. It went red once in a full run and
   passed fourteen times standing alone, which is the worst possible property for a leak test: a
   flaky guard gets re-run until it is green, and the day it catches something real it is
   indistinguishable from the noise.

   So the ambiguous numeric codes are matched with digit boundaries, and against the text a person
   actually READS rather than the envelope around it — an id is not prose and was never the thing
   this guards. Everything else keeps whole-payload matching, because `anthropic`, `ECONNREFUSED`,
   `Error:` and the rest never legitimately appear anywhere in a response at all. */
const MACHINE = [THROWN, 'provider', 'ECONNREFUSED', 'ETIMEDOUT', 'anthropic', 'openai',
  'api key', 'apiKey', 'rate limit', 'stack', 'Error:', '[object', 'undefined'];
const HTTP_CODES = ['429', '500'];
/* What a human is shown: the prose, the notes, the messages — never the ids and timestamps that
   carry them. Collected by key name so a new human-facing field is covered without listing it. */
const _humanText = (obj) => {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string' && /text|message|note|answer|reason|summary|label|headline|claim|because|title/i.test(k)) out.push(val);
        else walk(val);
      }
    }
  };
  walk(obj);
  return out.join('\n');
};
const leaks = obj => MACHINE.filter(w => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  .test(JSON.stringify(obj == null ? '' : obj)))
  .concat(HTTP_CODES.filter(c => new RegExp(`(^|[^0-9])${c}([^0-9]|$)`).test(_humanText(obj))));

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, O, who === 'c' ? 'coach' : 'member')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    console.log('\n  A — THE PROVIDER REALLY IS FAILING, WHICH IS WHAT MAKES THE REST REACHABLE');
    let threw = false;
    try { await gateway.complete({ system: 'x', user: 'y' }); } catch (_) { threw = true; }
    ok('DH-A1 every model entry point throws in this fixture',
      threw);
    ok('DH-A2 …and a key IS configured, so this is "unreachable" rather than "switched off"',
      !!process.env.ANTHROPIC_API_KEY);

    console.log('\n  B — A LEADER\'S BRIEFING SAYS IT WAS NOT WRITTEN BY THE MODEL');
    const brief = await call('GET', '/api/workspace/briefing', undefined, 'c');
    ok('DH-B1 the briefing still answers — a failing provider is not an outage of the product',
      brief.status === 200 && !!String((brief.j || {}).briefing || '').trim());
    ok('DH-B2 …and now reports that the model did not write it (it reported nothing)',
      !!(brief.j || {}).composer && !!brief.j.composer.degraded);
    ok('DH-B3 …through the vocabulary the product already owns, not a new one',
      () => S.COMPOSER_DEGRADED === undefined
        ? ['disabled', 'no_model', 'over_budget', 'empty', 'unverified', 'error'].includes(brief.j.composer.degraded)
        : S.COMPOSER_DEGRADED.includes(brief.j.composer.degraded));
    ok('DH-B4 …and the deterministic sentence is still a real reading of the group, not an apology',
      /\d/.test(String(brief.j.briefing)) || /attention|steady/i.test(String(brief.j.briefing)));

    console.log('\n  C — AND SO DOES A CHECK-IN, WHICH IS WHERE IT ACTUALLY COSTS SOMETHING');
    /* A person has just said something difficult. The stock acknowledgement is warm and sounds
       specific; without a marker it is indistinguishable from one that was actually read. */
    const rec = await _recordCheckin(O, 'm',
      { text: 'I have not been sleeping well and it is really affecting my training', mood: 2 });
    ok('DH-C1 the check-in is still recorded — nothing about the person\'s record depends on a model',
      rec.ok === true && !!rec.checkinId);
    ok('DH-C2 …and they still get an acknowledgement rather than silence',
      !!String(rec.acknowledgement || '').trim());
    ok('DH-C3 …which now says it is the plainer one (it did not)',
      !!rec.composer && !!rec.composer.degraded);

    console.log('\n  D — AND NONE OF IT PUTS A MACHINE\'S WORDS IN FRONT OF A PERSON');
    ok('DH-D1 the briefing leaks nothing about the provider, the key or the error',
      leaks(brief.j).length === 0);
    ok('DH-D2 …and neither does the check-in',
      leaks(rec).length === 0);
    ok('DH-D3 …and specifically not the message actually thrown during this run',
      !JSON.stringify(brief.j).includes(THROWN) && !JSON.stringify(rec).includes(THROWN));
    ok('DH-D4 …because the reason is coarse by construction — six words, none of them a provider\'s',
      () => ['disabled', 'no_model', 'over_budget', 'empty', 'unverified', 'error']
        .includes(rec.composer.degraded));

    console.log('\n  E — AND AN ORDINARY TURN IS STILL ANSWERED, NOT ERRORED');
    const turn = await call('POST', '/api/assistant/turn',
      { text: 'How has the team been doing over the last two weeks?' }, 'm');
    ok('DH-E1 a question is answered on the deterministic path',
      turn.status === 200 && !!String(((turn.j || {}).response || {}).responseText || '').trim());
    ok('DH-E2 …and that answer leaks nothing either',
      leaks(turn.j).length === 0);
    ok('DH-E3 …and the turn reports its own degraded state, as it always did',
      !!((turn.j || {}).response || {}).composer);

    console.log('\n  F — ONE SENTENCE, ONE PLACE, AND BOTH NEW SURFACES USE IT');
    const fs = require('fs'), path = require('path');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const bare = appJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('DH-F1 there is exactly ONE definition of the degraded sentence in the client',
      (bare.match(/function iqDegradedNote\(/g) || []).length === 1);
    ok('DH-F2 …and exactly one wording of it',
      (bare.match(/IntelliQ's normal response isn't available right now/g) || []).length === 1);
    ok('DH-F3 …and the check-in outcome now renders it, which it did not',
      /iqDegradedNote\(o\.composer\)/.test(bare));
    ok('DH-F4 …and the sentence says nothing about a provider, a model or a key',
      leaks((bare.match(/IntelliQ's normal response[^`<]*/) || [''])[0]).length === 0);

    console.log('\n  G — AND WHEN THE MODEL WORKS, NONE OF THIS APPEARS');
    /* Otherwise "always degraded" would pass every assertion above and be a worse product than
       the silence it replaced.

       AND IT MUST NOT NEED ASKING TWICE. The briefing is cached for two hours, and the degraded
       one was cached like any other — so one failed call pinned the stock sentence in front of a
       leader for the rest of the morning, long after the provider had recovered. `refresh=1`
       bypassed it, which an operator knows and a coach does not. This is the ordinary request,
       deliberately: no refresh parameter, nothing the reader has to know to do. */
    for (const n of ['complete', 'completeJSON']) gateway[n] = async () => 'A real considered sentence about the week.';
    const good = await call('GET', '/api/workspace/briefing', undefined, 'c');
    ok('DH-G1 the very next ordinary request, after recovery, is the considered one',
      good.status === 200 && !good.j.composer);
    const goodRec = await _recordCheckin(O, 'n', { text: 'Training went well this week and I felt strong', mood: 4 });
    ok('DH-G2 …and so does a check-in',
      goodRec.ok === true && !goodRec.composer);
    ok('DH-G3 …and the model\'s own words are what the person actually receives',
      /real considered sentence/i.test(String(good.j.briefing || '')));

  } catch (e) { fail++; console.error('  FAIL degraded-honesty suite threw:', e && e.stack); }

  server.close();
  console.log(`\ndegraded-honesty-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
