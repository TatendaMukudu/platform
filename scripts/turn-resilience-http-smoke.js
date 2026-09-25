/* Truth layer — A WEAK LINK IS NOT A FAILURE, AND A RETRY IS NOT A SECOND TURN.

   LIVE iPHONE (findings R1 #28). The founder's phone had Wi-Fi and cellular and a brief patch of
   weakness, and IntelliQ dropped to the deterministic path and printed the full degradation
   banner. The brief asks for bounded retry with the pending turn preserved, no duplicate human
   turns, and no canonical write that could execute twice.

   READING THE REAL PATH FOUND TWO THINGS, AND NEITHER WAS THE PROVIDER.

   THE MAIN CONVERSATION HAD NO CLIENT TURN ID. The object thread's composer mints one — that is
   what makes a re-send the same turn rather than a second one — and the surface a person uses most
   did not, so the durable-turn guarantee stopped at the object page.

   AND THE TURN WAS NOT IDEMPOTENT EVEN WHERE THE ID EXISTED. `_already` protected the person's own
   words and nothing else: a second POST recomposed the answer, appended a SECOND assistant message
   to the conversation, and ran the intake over the same sentence again. A client that retried a
   dropped connection would have mended the visible half of #13 and left the other half.

   SO THE PROPERTY IS STRONGER THAN "THE SENTENCE IS NOT DOUBLED". It is that sending the same turn
   again produces the same turn: the same id, the same answer, the same proposals to confirm — and
   nothing new anywhere.

   Run: node scripts/turn-resilience-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, assistantConversations } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'res', NOW = Date.now(), DAY = 86400000;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@res.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
  userAiProfiles: { [`${C}:coach`]: { focuses: [{
    id: 'foc_r', text: 'Concede fewer late goals', status: 'active',
    visibility: 'only_me', createdAt: new Date(NOW - 2 * DAY).toISOString(),
  }] } },
});
_rebuildEmailIndex();

const SAID = 'We tried an extra defender and still conceded in the last ten minutes.';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const send = (body) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H,
    body: JSON.stringify(body) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const conv = (id) => (assistantConversations[`${C}:coach`] || []).find(c => c && c.id === id) || { messages: [] };

  try {
    console.log('\n  A — THE SAME SEND, SENT AGAIN, IS THE SAME TURN');
    const first = await send({ text: SAID, about: { kind: 'focus', id: 'foc_r' }, clientTurnId: 'ct_same' });
    const cid = (first.j || {}).conversationId;
    ok('TR-A1 the first send is answered', first.status === 200 && !!cid);
    const again = await send({ text: SAID, about: { kind: 'focus', id: 'foc_r' },
      conversationId: cid, clientTurnId: 'ct_same' });
    ok('TR-A2 …and sending it again is answered too, rather than refused',
      again.status === 200);
    /* THE TURN ID IS THE IDENTITY. A second turnId for one send is the whole defect wearing a
       different name: everything downstream — the direction question, the rating row, the
       intake record — is keyed on it. */
    ok('TR-A3 …with the SAME turn id, because it is the same turn',
      !!((first.j || {}).turnId) && (again.j || {}).turnId === (first.j || {}).turnId);
    ok('TR-A4 …and the same words back',
      String(((again.j || {}).response || {}).responseText || '')
      === String(((first.j || {}).response || {}).responseText || ''));
    /* AND THE PROPOSALS SURVIVE THE REPLAY. A retry that returned the prose and dropped what the
       person could confirm would be a quieter version of losing the turn — they would be told
       something happened and offered no way to act on it. */
    ok('TR-A5 …and whatever it offered to do is still offered',
      JSON.stringify(((again.j || {}).response || {}).proposedActions || [])
      === JSON.stringify(((first.j || {}).response || {}).proposedActions || []));

    console.log('\n  B — AND NOTHING WAS WRITTEN TWICE');
    const msgs = conv(cid).messages || [];
    ok('TR-B1 the person\'s words are in the conversation once',
      msgs.filter(m => m && m.role === 'user' && m.text === SAID).length === 1);
    /* THE HALF `_already` DID NOT COVER. The human turn was already deduplicated; the ANSWER was
       not, so a retry appended a second assistant message under one question. */
    ok('TR-B2 …and so is the answer, which is the half the first fix did not reach',
      msgs.filter(m => m && m.role === 'assistant').length === 1);
    ok('TR-B3 …and the conversation holds exactly the one exchange', msgs.length === 2);

    console.log('\n  C — WHILE A GENUINELY NEW SEND IS A GENUINELY NEW TURN');
    /* THE CONTROL, and it is the assertion that stops all of section A being satisfied by a
       server that answers every repeat from a cache. People say the same thing twice. */
    const other = await send({ text: SAID, about: { kind: 'focus', id: 'foc_r' },
      conversationId: cid, clientTurnId: 'ct_other' });
    ok('TR-C1 the same words under a new id are answered as their own turn',
      other.status === 200 && (other.j || {}).turnId !== (first.j || {}).turnId);
    const after = conv(cid).messages || [];
    ok('TR-C2 …and recorded as their own exchange',
      after.filter(m => m && m.role === 'user' && m.text === SAID).length === 2
      && after.filter(m => m && m.role === 'assistant').length === 2);
    /* AND A SEND WITH NO ID AT ALL STILL WORKS. Nothing about this may become a requirement: an
       older client, or any caller that does not mint one, must keep being answered. */
    const bare = await send({ text: 'And what about the first ten?', conversationId: cid });
    ok('TR-C3 …and a send carrying no id at all is still answered normally',
      bare.status === 200 && String(((bare.j || {}).response || {}).responseText || '').length > 0);

    console.log('\n  D — AND THE REPLAY DOES NOT GROW WITHOUT BOUND');
    /* A cache on a conversation is a store somebody has to be responsible for. This one is three
       deep, oldest dropped, and dies with the conversation it belongs to. */
    for (let i = 0; i < 5; i++) {
      await send({ text: `Turn number ${i}`, conversationId: cid, clientTurnId: `ct_n${i}` });
    }
    const keys = Object.keys(conv(cid).replayOf || {});
    ok('TR-D1 the replay cache keeps only the most recent few sends', keys.length <= 3);
    ok('TR-D2 …and the ones it keeps are the most recent', keys.includes('ct_n4'));
    ok('TR-D3 …and an old one that has fallen out is treated as a new turn rather than erroring',
      (await send({ text: 'Turn number 0', conversationId: cid, clientTurnId: 'ct_n0' })).status === 200);

    console.log('\n  E — AND THE CLIENT ACTUALLY SENDS ONE, FROM BOTH COMPOSERS');
    /* THE VERTICAL SLICE. Everything above is unreachable from the product if the browser does
       not mint an id — and the main conversation, the surface a person uses most, did not. */
    const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const turnFn = ui.slice(ui.indexOf('async assistantTurn('), ui.indexOf('_renderAssistant(j) {'));
    ok('TR-E1 the main conversation mints an id per send, and puts it in the body',
      turnFn.length > 500
      && /const clientTurnId = opts\.clientTurnId\s*\n?\s*\|\| \('ct_'/.test(turnFn)
      && /clientTurnId,/.test(turnFn));
    /* AND THE RETRY KEEPS IT. A retry that minted a fresh id would be a new turn by construction,
       which is the duplicate this whole file exists to prevent — arrived at by the mechanism
       meant to prevent it. */
    ok('TR-E2 …and a retry re-sends under the SAME id rather than minting another',
      /return this\.assistantTurn\(text, targetEl, \{ clientTurnId, attempt: attempt \+ 1 \}\)/.test(turnFn));
    ok('TR-E3 …and the retry is bounded rather than a loop', /attempt < 2/.test(turnFn));
    /* AND ONLY WHEN NOTHING CAME BACK. A 4xx, a 401 and a refusal are ANSWERS; retrying a
       judgement is how a product argues with its own server. The retry sits in the catch, which
       is the transport path, and nowhere near a response that arrived. */
    ok('TR-E4 …and it only retries when no answer arrived at all',
      /catch \(e\) \{[\s\S]{0,600}attempt < 2/.test(turnFn)
      && !/res\.status[\s\S]{0,120}assistantTurn\(text, targetEl/.test(turnFn));
    const objFn = ui.slice(ui.indexOf('async inquirySend()'), ui.indexOf('_toggleInquiryDetail('));
    ok('TR-E5 …and the object thread\'s composer retries the same way',
      /const _send = async \(attempt = 0\)/.test(objFn) && /attempt >= 2/.test(objFn)
      && /clientTurnId,/.test(objFn));

    console.log('\n  F — AND THE DEGRADED NOTE IS SAID ONCE, NOT ONCE A TURN');
    /* Findings #28: "allow silent recovery on the next turn and avoid repeatedly surfacing the
       full degradation banner". Three paragraphs explaining the same fact, each longer than the
       answer above it, turns a temporary state into the loudest thing on the screen. */
    const noteFn = ui.slice(ui.indexOf('function iqDegradedNote('),
      ui.indexOf('function todayBubble('));
    ok('TR-F1 the full sentence is the first one, and after that the note shrinks',
      /const first = !_iqDegradedShown/.test(noteFn) && /first\s*\n?\s*\?/.test(noteFn));
    ok('TR-F2 …but a degraded reply is never left unmarked, which is what the note is for',
      !/return ''/.test(noteFn.replace(/if \(!composer \|\| !composer\.degraded\)[^\n]*\n/, '')));
    ok('TR-F3 …and an ordinary reply resets it, so recovery is silent rather than announced',
      /_iqDegradedShown = false; return ''/.test(noteFn));

  } catch (e) { fail++; console.error('  FAIL turn-resilience suite threw:', e && e.stack); }

  server.close();
  console.log(`\nturn-resilience-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
