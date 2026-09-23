/* Truth layer — A PERSON'S OWN CHATS ABOUT ONE OBJECT, AND WHOSE THEY ARE.

   PRIORITY R&D P1, and gap 4 of the High/Low/Inquiry/Forum audit: the product supports several
   private conversations about the same object, and the object thread opened the most recently
   updated one and said nothing about the rest.

   That default is right. Being the whole answer was not. Somebody who talked about a Low in March
   and again in June saw only June, with nothing on screen saying March existed — the product
   deciding, silently, which of their own conversations they meant. Reproduced on the real path:
   two conversations bound to one inquiry, `/api/assistant/conversations?about=…` returning both,
   and the thread returning one with no sign of the other.

   NO SECOND STORE, WHICH IS THE POINT. The conversations were always there; what was missing was
   the thread saying so. The list is read from `assistantConversations[_wsKey(code, userId)]` —
   the same array, through the same per-person key the thread already used — and carries ids and
   labels only. Bodies stay behind `/api/assistant/conversations/:id`, which already gates them.

   THE PROPERTY THAT MATTERS MOST IS SECTION C. Two people may hold separate private chats about
   one SHARED object. Neither may see the other's, and the per-person key is what makes that
   structural rather than a filter somebody has to remember: a conversation that is not in your
   workspace is not in the array before any filtering starts. Asserted from both ends, including
   a direct request for the other person's conversation id.

   Run: node scripts/object-conversations-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const gateway = require('../ai/gateway.js');
gateway.enabled = () => true;
gateway.deterministicOnly = () => false;
gateway.completeJSON = async () => ({ actions: [], intent: 'asked_about', needsClarification: null });
gateway.complete = async () => 'Understood.';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'ocv', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['me', 'p2', 'p3', 'p4', 'p5'];
const SIG = (w, n) => ({ kind: 'observation', status: 'active', source: w, originRef: `o_${w}_${n}`,
  at: NOW - 3 * DAY, turnId: `t_${w}_${n}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${w}_${n}`, contributedBy: w, text: 'we go quiet after conceding' });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [C]: Object.fromEntries(SQUAD.map((id, i) => [id,
    { id, name: `Player ${i + 1}`, email: `${id}@o.io`, role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['n'], profileComplete: true }])) },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: SQUAD, leaderIds: [] } } },
  /* A GROUP inquiry, so the object is genuinely readable by more than one person — which is what
     makes section C a real test rather than two people looking at different objects. */
  inquiryStates: { [C]: { 'group:n': { m: {
    inquiryId: 'q1', subjectRef: 'group:n', topic: { canonicalConcept: 'f.quiet', label: 'Going quiet' },
    status: 'exploring',
    hypotheses: [{ id: 'h1', statement: 'we stop talking', supportRefs: SQUAD.map((w, i) => `ev_${w}_${i}`),
      challengeRefs: [], confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW }],
    leadingHypothesisId: 'h1', signals: SQUAD.map((w, i) => SIG(w, i)),
    confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
    missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW } } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, 'member')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, w = 'me') => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const about = { kind: 'inquiry', id: 'q1' };
  const thread = (w = 'me') => call('GET', '/api/objects/inquiry/q1/thread?scope=group:n', undefined, w);

  try {
    console.log('\n  A — TWO CHATS ABOUT ONE OBJECT, AND BOTH ARE FINDABLE');
    const t1 = await call('POST', '/api/assistant/turn', { text: 'First thoughts on this', about });
    const c1 = String((t1.j || {}).conversationId || '');
    const t2 = await call('POST', '/api/assistant/turn',
      { text: 'Coming back to this weeks later', about, newConversation: true });
    const c2 = String((t2.j || {}).conversationId || '');
    ok('OC-A1 a person can hold two separate conversations about one object',
      !!c1 && !!c2 && c1 !== c2);
    const th = await thread();
    ok('OC-A2 the thread still opens the most recent one, which is the right default',
      ((th.j || {}).conversation || {}).id === c2);
    /* THE DEFECT. The thread returned one conversation and nothing said the other existed. */
    const list = ((th.j || {}).conversations) || [];
    ok('OC-A3 …and now says the other one exists rather than deciding silently',
      list.length === 2 && list.some(c => c.id === c1) && list.some(c => c.id === c2));
    ok('OC-A4 …marking which is open, so "which am I in" is answerable',
      list.filter(c => c.current).length === 1 && (list.find(c => c.current) || {}).id === c2);
    ok('OC-A5 …newest first, so the order is the one a person expects',
      (list[0] || {}).id === c2);
    /* IDS AND LABELS ONLY. Carrying the bodies here would copy every transcript into every object
       read, and the transcript route already exists and already gates them. */
    ok('OC-A6 …carrying no message bodies, because a switcher is not a second transcript store',
      list.every(c => !('messages' in c) && !('preview' in c)));

    console.log('\n  B — AND ONE CHAT IS STILL JUST ONE CHAT');
    /* The control. Without it, "the list has both" could pass on a product that lists something
       for everybody, and the UI hides the row precisely when there is nothing to choose. */
    const solo = await call('POST', '/api/assistant/turn',
      { text: 'A thought with no object', about: { kind: 'inquiry', id: 'q1' } }, 'p3');
    ok('OC-B1 somebody with a single conversation gets a single entry, not an empty switcher',
      (((await thread('p3')).j || {}).conversations || []).length === 1);

    console.log('\n  C — AND THEY ARE YOURS, ON AN OBJECT YOU BOTH READ');
    const otherTh = await thread('p2');
    const otherList = ((otherTh.j || {}).conversations) || [];
    ok('OC-C1 the other member reads the same object', otherTh.status === 200);
    ok('OC-C2 …and sees none of this person\'s conversations in their own list',
      !otherList.some(c => c.id === c1 || c.id === c2));
    /* HOLDING THE ID IS NOT ACCESS. The list is scoped by construction; this proves the
       transcript route refuses the id directly too, which is the door that actually carries
       words. */
    ok('OC-C3 …and cannot open one by holding its id',
      (await call('GET', `/api/assistant/conversations/${c1}`, undefined, 'p2')).status === 404);
    ok('OC-C4 …while its owner can', (await call('GET', `/api/assistant/conversations/${c1}`)).status === 200);
    /* AND THE OBJECT IS STILL SHARED. If C2 passed because p2 could not see the object at all,
       it would be proving the wrong thing. */
    ok('OC-C5 …and this is a genuinely shared object rather than two separate ones',
      String(((otherTh.j || {}).about) || '') === String((th.j || {}).about || 'x'));

    console.log('\n  D — AND THE SWITCHER REACHES A SCREEN');
    const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('OC-D1 the thread renders the other chats', /iqt-convs/.test(ui) && /data\.conversations/.test(ui));
    ok('OC-D2 …only when there is more than one, so one chat adds no chrome',
      /\(data\.conversations \|\| \[\]\)\.length > 1/.test(ui));
    ok('OC-D3 …and opening one goes through the gated transcript route, not a local copy',
      /openObjectConversation\(kind, objectId, conversationId\)/.test(ui)
      && /\/api\/assistant\/conversations\/' \+ encodeURIComponent\(conversationId\)/.test(ui));
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
    ok('OC-D4 …and at phone width the row wraps rather than running off the side',
      /\.iqt-convs\{[^}]*flex-wrap:wrap/.test(css));
    ok('OC-D5 …with a tap target big enough to hit',
      /\.iqt-conv\{[^}]*min-height:3[0-9]px/.test(css));

  } catch (e) { fail++; console.error('  FAIL object-conversations suite threw:', e && e.stack); }

  server.close();
  console.log(`\nobject-conversations-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
