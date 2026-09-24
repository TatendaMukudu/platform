/* Truth layer — ONE SEND IS ONE DURABLE HUMAN TURN.

   LIVE iPHONE BLOCKERS (findings R1 #32 and #13). The founder asked a question in a Focus
   conversation and later found it gone from the visible thread. Separately, a screenshot showed the
   same human message twice around a degraded-provider response.

   Those are the two failure directions of one property, and the property is not "the answer
   arrives". It is that the PERSON'S OWN WORDS survive everything that happens afterwards:

     the provider throwing, timing out, or degrading;
     the deterministic fallback answering instead;
     the object re-rendering, or the person navigating away and back;
     a retry, which must add nothing;
     and the same conversation being reopened later.

   WHY IT CAN BE LOST AT ALL. The human turn was appended to the conversation AFTER the provider
   call — two hundred lines after it, with an unguarded `await` in between. A rejection there
   unwinds the handler, the route answers 500, and the line that records what the person typed is
   never reached. Their message was on screen because the client drew it optimistically; it was
   never anywhere else. That is exactly the shape of "it disappeared from the thread".

   WHAT IS ASSERTED IS ORDER, NOT MERELY PRESENCE. A turn recorded before the model runs is durable
   by construction; one recorded after it is durable only while nothing goes wrong.

   Run: node scripts/durable-turn-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;
const ai = require('../ai/gateway.js');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'dur', NOW = Date.now(), DAY = 86400000;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@d.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
  userAiProfiles: { [`${C}:coach`]: { focuses: [{
    id: 'foc_d', text: 'Concede fewer late goals', status: 'active',
    visibility: 'only_me', createdAt: new Date(NOW - 2 * DAY).toISOString(),
  }] } },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable,
  complete: ai.complete, completeJSON: ai.completeJSON, canUnderstand: ai.canUnderstand };
/* A PROVIDER THAT FAILS THE WAY A NETWORK FAILS: not a polite "unavailable", a rejection out of
   the middle of the call. That is what a dropped connection looks like from here, and it is the
   case the ordering has to survive. */
const breakProvider = () => Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true,
  complete: async () => { throw new Error('ECONNRESET'); },
  completeJSON: async () => { throw new Error('ECONNRESET'); },
});
const healProvider = () => Object.assign(ai, REAL);

const SAID = 'We tried an extra defender and still conceded in the last ten minutes.';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  /* READ IT BACK THE WAY REOPENING THE FOCUS READS IT: from the store, not from the reply the
     send happened to return. A turn that only exists in that reply is the defect. */
  const readBack = async (convId) => {
    const r = await call('GET', `/api/assistant/conversations/${encodeURIComponent(convId)}`);
    const msgs = (r.j || {}).messages || [];
    return msgs.map(m => ({ role: m.role, text: String(m.text || '') }));
  };

  try {
    console.log('\n  A — A TURN SURVIVES THE PROVIDER FAILING MID-CALL');
    breakProvider();
    const sent = await call('POST', '/api/assistant/turn',
      { text: SAID, about: { kind: 'focus', id: 'foc_d' } });
    /* THE ROUTE MAY ANSWER HOWEVER IT LIKES — deterministically, degraded, or with an error. What
       it may not do is lose the sentence. */
    const convId = (sent.j || {}).conversationId || null;
    ok('DT-A1 the send is accepted rather than erroring the whole turn away', sent.status === 200 && !!convId);
    const afterFail = await readBack(convId);
    ok('DT-A2 the human turn is in the stored conversation, not only in the reply',
      afterFail.some(m => m.role === 'user' && m.text === SAID));
    ok('DT-A3 …exactly once', afterFail.filter(m => m.role === 'user' && m.text === SAID).length === 1);

    console.log('\n  B — AND REOPENING RECONSTRUCTS THE SAME ORDERED CONVERSATION');
    healProvider();
    const reopened = await readBack(convId);
    ok('DT-B1 reopening finds the same human turn', reopened.some(m => m.role === 'user' && m.text === SAID));
    ok('DT-B2 …still exactly once', reopened.filter(m => m.role === 'user' && m.text === SAID).length === 1);
    ok('DT-B3 …and the person speaks before the reply, which is the order they saw',
      (() => {
        const iUser = reopened.findIndex(m => m.role === 'user' && m.text === SAID);
        const iReply = reopened.findIndex((m, k) => m.role === 'assistant' && k > iUser);
        return iUser >= 0 && (iReply === -1 || iReply > iUser);
      })());

    console.log('\n  C — A RETRY ADDS NOTHING');
    /* FINDINGS #13: the same human message visible twice around a degraded response. A retry after
       a failure is the ordinary thing a person or a client does, and it must not double the turn. */
    const before = (await readBack(convId)).filter(m => m.role === 'user' && m.text === SAID).length;
    await call('POST', '/api/assistant/turn',
      { text: SAID, about: { kind: 'focus', id: 'foc_d' }, conversationId: convId, clientTurnId: 'ct_same' });
    await call('POST', '/api/assistant/turn',
      { text: SAID, about: { kind: 'focus', id: 'foc_d' }, conversationId: convId, clientTurnId: 'ct_same' });
    const after = (await readBack(convId)).filter(m => m.role === 'user' && m.text === SAID).length;
    ok('DT-C1 sending the same turn twice under one client id records it once',
      after === before + 1);
    /* AND TWO GENUINELY DIFFERENT SENDS OF THE SAME WORDS ARE STILL TWO TURNS. Deduplicating on
       the text would eat the second one, and people legitimately say the same thing twice. */
    await call('POST', '/api/assistant/turn',
      { text: SAID, about: { kind: 'focus', id: 'foc_d' }, conversationId: convId, clientTurnId: 'ct_other' });
    const after2 = (await readBack(convId)).filter(m => m.role === 'user' && m.text === SAID).length;
    ok('DT-C2 …while a genuinely new send of the same words is recorded as its own turn',
      after2 === after + 1);
    /* AND THE CLIENT ACTUALLY SENDS ONE, or the whole guarantee is unreachable from the product. */
    const ui = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('DT-C3 …and the composer mints one per send, so this is reachable from the product',
      /clientTurnId = 'ct_'/.test(ui) && /clientTurnId,/.test(ui));

    console.log('\n  D — AND THE ORDER IS THE GUARANTEE, NOT A COINCIDENCE');
    /* A turn recorded BEFORE the model runs is durable by construction; one recorded after it is
       durable only while nothing goes wrong. Reading the source for the order is the only way to
       assert the guarantee rather than the symptom — the symptom passes on a good day. */
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function _assistantTurn'));
    const body = fn.slice(0, fn.indexOf('\nfunction ') > 0 ? fn.indexOf('\nfunction ') : 40000);
    /* THE MAIN PATH'S PUSH, NOT THE SAFEGUARDING ONE. The first version searched for the first
       `_conv.messages.push({ role: 'user'` in the handler and found the CRISIS branch, which
       short-circuits the whole turn and records the message before returning — so the assertion
       passed while the ordinary path still recorded after the model. It was green on the wrong
       line. The main push is the one carrying a `clientTurnId`, which the crisis branch has no
       reason to hold. */
    const iUserPush = body.indexOf("clientTurnId: _turnKey } : {})");
    const iAction = body.indexOf('await _composerActionInterpret(');
    const iCompose = body.indexOf('await _composeTurn(');
    ok('DT-D1 the ordinary record and both model calls are in the turn handler',
      iUserPush > 0 && iAction > 0 && iCompose > 0);
    ok('DT-D2 …and the person\'s words are recorded BEFORE anything is asked of a model',
      iUserPush < iAction && iUserPush < iCompose);

  } catch (e) { fail++; console.error('  FAIL durable-turn suite threw:', e && e.stack); }

  healProvider();
  server.close();
  console.log(`\ndurable-turn-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
