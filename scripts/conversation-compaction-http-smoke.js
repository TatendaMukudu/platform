/* Truth layer — A LONG CONVERSATION IS COMPRESSED, NOT TRUNCATED.

   The store's own comment says: "PRIVATE, PERMANENT chat history — kept until the user deletes
   it." It was not. `CONV_MSG_CAP` was applied as `messages.splice(0, n)` — the oldest messages
   destroyed in place, by the product, with nothing recorded anywhere that it had happened.

   THAT WOULD BE A DOCUMENTATION BUG IF NOTHING POINTED AT THOSE MESSAGES. Something does. A Focus
   pins the exact message ids it came out of (`_personalFocusSource`), and
   GET /api/me/focus/:id/source resolves them LIVE, deliberately, so that editing or deleting the
   conversation changes what the Focus shows. Driven over HTTP at a95f006:

       pin a Focus to the first message of a 501-message thread
       take eight more ordinary turns
       -> the pinned message is gone

   and the route then fell back to `all.slice(-4)` and served FOUR UNRELATED RECENT MESSAGES,
   under the note "Only you can see this. Sharing the focus does not share this conversation", as
   though they were the conversation it came from. The evidence link behind somebody's commitment
   quietly became four arbitrary sentences. `exact: false` was the only signal and no surface is
   obliged to read it.

   THE RULE: A MESSAGE SOMETHING POINTS AT IS NOT SPARE CAPACITY. Eviction takes the oldest
   UNPINNED messages and stops there, and what was dropped is counted and dated on the
   conversation so a thread can say it has been shortened rather than just being shorter. No model
   is involved and none is needed: deterministic code decides what is kept, which is the half of
   the founder's law that must never depend on a provider being reachable.

   AND WHEN THE REFERENCE IS GENUINELY GONE — a conversation shortened on disk before this
   existed, or one the person edited themselves — the answer is that it is gone, not a substitute
   for it.

   Run: node scripts/conversation-compaction-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, assistantConversations } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'cmp';
_loadAllStores({
  orgMeta: { [O]: { orgName: 'Compaction Org', orgMode: 'sports' } },
  orgUsers: { [O]: { m: { id: 'm', name: 'M', email: 'm@c.io', role: 'member', orgCode: O, status: 'active' } } },
  orgNodes: { [O]: {} },
});
_rebuildEmailIndex();

const KEY = `${O}:m`;
/* A REAL LONG THREAD, with the thing that mattered said at the very start — which is the ordinary
   shape of a conversation somebody comes back to, and the exact shape the old cap destroyed. */
function seedLongThread() {
  const msgs = [{ role: 'user', id: 'm_ORIGIN', at: new Date().toISOString(),
    text: 'The thing that actually matters: I cannot sleep before games.' }];
  for (let i = 0; i < 500; i++) {
    msgs.push({ role: i % 2 ? 'assistant' : 'user', id: 'm_f' + i,
      at: new Date().toISOString(), text: 'filler turn ' + i });
  }
  assistantConversations[KEY] = [{ id: 'c1', title: 'Long one', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), messages: msgs }];
}
seedLongThread();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('m', O, 'member')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const conv = () => (assistantConversations[KEY] || []).find(c => c.id === 'c1') || { messages: [] };
  const has = id => conv().messages.some(m => String(m.id) === id);

  try {
    console.log('\n  A — A FOCUS POINTS AT THE MESSAGES IT CAME OUT OF');
    const made = await call('POST', '/api/me/focus', { text: 'Sleep before games',
      sourceConversationId: 'c1', sourceMessageIds: ['m_ORIGIN'] });
    const fid = ((made.j || {}).focus || {}).id;
    ok('CC-A1 the Focus is created and pins the exact message',
      made.status === 200 && ((made.j.focus.source || {}).messageIds || []).join(',') === 'm_ORIGIN');

    const before = await call('GET', `/api/me/focus/${fid}/source`);
    ok('CC-A2 …and the source route returns that message, exactly',
      before.j.exact === true && before.j.messages.length === 1
      && /cannot sleep before games/.test(before.j.messages[0].text));

    console.log('\n  B — AND THE CAP DOES NOT GET TO DESTROY IT');
    const lengthBefore = conv().messages.length;
    ok('CC-B1 the thread starts well over the cap, which is what makes this reachable at all',
      lengthBefore === 501);
    for (let i = 0; i < 8; i++) {
      await call('POST', '/api/assistant/turn', { text: 'another thing ' + i, conversationId: 'c1' });
    }
    ok('CC-B2 the thread is brought down to the cap — compaction still happens, it is not disabled',
      conv().messages.length === 400);
    ok('CC-B3 …and the pinned message is STILL THERE (it was destroyed)',
      has('m_ORIGIN'));
    ok('CC-B4 …while ordinary old messages were the ones evicted, oldest first',
      !has('m_f0') && !has('m_f1'));
    ok('CC-B5 …and the most recent turns are kept, so the thread still reads as itself',
      conv().messages.some(m => /another thing 7/.test(String(m.text || ''))));

    console.log('\n  C — AND THE THREAD SAYS IT HAS BEEN SHORTENED, RATHER THAN JUST BEING SHORTER');
    /* PASSED AS THUNKS, not as values. `ok` catches a throw only from a function it calls; an
       expression evaluated at the call site throws before it ever gets there, which is how a
       mutation run turned three named failures into one crash and lost the rest of the suite. */
    const c = conv();
    ok('CC-C1 what was dropped is counted',
      () => !!c.compacted && c.compacted.dropped > 0);
    ok('CC-C2 …and the count is the real one, not a flag',
      () => c.compacted.dropped === lengthBefore + 16 - 400);
    ok('CC-C3 …and it records how far back the thread now begins',
      () => !!c.compacted.through && Number.isFinite(Date.parse(c.compacted.through)));

    console.log('\n  D — SO THE EVIDENCE BEHIND THE COMMITMENT SURVIVES');
    const after = await call('GET', `/api/me/focus/${fid}/source`);
    ok('CC-D1 the source route still returns the real message',
      after.j.exact === true && after.j.messages.length === 1
      && /cannot sleep before games/.test(after.j.messages[0].text));
    ok('CC-D2 …and not four unrelated recent ones (this was the defect)',
      !after.j.messages.some(m => /another thing/.test(String(m.text || ''))));

    console.log('\n  E — AND WHEN IT REALLY IS GONE, THAT IS WHAT IT SAYS');
    /* A conversation shortened on disk before any of this existed, or one the person edited
       themselves. The stored fact is planted directly because that is where such a record comes
       from; the assertion is about what the route does with it. */
    const live = conv();
    live.messages = live.messages.filter(m => String(m.id) !== 'm_ORIGIN');
    const gone = await call('GET', `/api/me/focus/${fid}/source`);
    ok('CC-E1 it does not serve a substitute (it served four recent messages)',
      gone.status === 200 && gone.j.exact === false && gone.j.messages.length === 0);
    ok('CC-E2 …and says plainly that the part it came from is no longer there',
      /no longer in your history/i.test(String(gone.j.note || '')));
    ok('CC-E3 …while still standing the Focus on its own, which it always could',
      gone.j.available === true && /stands on its own/i.test(String(gone.j.note || '')));

    console.log('\n  F — AND A FOCUS WITH NO SOURCE IS UNAFFECTED');
    /* The honest majority case. A Focus somebody typed on its own has no conversation behind it
       and must not be given one, nor be reported as having lost one. */
    const plain = await call('POST', '/api/me/focus', { text: 'Arrive ten minutes early' });
    const plainSource = await call('GET', `/api/me/focus/${plain.j.focus.id}/source`);
    ok('CC-F1 a Focus created without a conversation reports no source at all',
      plainSource.status === 404 || plainSource.j.available === false);

    console.log('\n  G — AND COMPACTION IS NOT THE MODEL\'S JOB');
    /* The founder's law: deterministic code decides. A compression step that needed a provider
       would take the person's history offline exactly when the provider was. */
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const fn = src.slice(src.indexOf('function _compactConversation('),
      src.indexOf('function _compactConversation(') + 1200);
    ok('CC-G1 the compaction owner calls no model and awaits nothing',
      !/gateway|complete|await|embed/i.test(fn));
    ok('CC-G2 …and the old destroy-in-place splice is gone from the turn path',
      !/_conv\.messages\.splice\(0,/.test(src));

  } catch (e) { fail++; console.error('  FAIL conversation-compaction suite threw:', e && e.stack); }

  server.close();
  console.log(`\nconversation-compaction-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
