#!/usr/bin/env node
'use strict';

/* Truth layer — THE THREAD BINDING (`ttd/object-as-conversation.md` G1).

   The one field the whole object-as-conversation design waits on, and the bottleneck five
   founder decisions resolve to (D9, D10, D12, D13, and the readable half of D8/D17).
   `assistantConversations` was keyed by workspace only, so a conversation had no subject: one
   flat pile, and nothing could be "the thread about this inquiry".

   THE PROPERTY THAT MAKES IT SAFE: the binding is a LABEL ON YOUR OWN THREAD, never a claim of
   access. It is deliberately not validated against the object store — validating would leak
   existence, and the conversations are already self-only by construction, so a label cannot
   widen a read. These assertions defend that, and defend the filter against the classic failure
   where an unparseable scope silently falls back to "everything".

   Run: node scripts/thread-binding-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
const S = require('../server');

let passed = 0, failed = 0;
const check = (n, c) => { if (c) { passed++; console.log('  PASS', n); } else { failed++; console.log('  FAIL', n); } };

const CODE = 'g1';
S._loadAllStores({
  orgMeta: { [CODE]: { orgName: 'G1 Test' } },
  orgUsers: { [CODE]: {
    a: { id: 'a', name: 'Ann', email: 'a@g1.test', role: 'member', status: 'active', orgCode: CODE },
    b: { id: 'b', name: 'Ben', email: 'b@g1.test', role: 'member', status: 'active', orgCode: CODE },
  } },
  assistantConversations: {
    [`${CODE}:a`]: [
      { id: 'c_one', title: 'About attendance', about: 'inquiry:i_1', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z', messages: [{ role: 'user', text: 'the bus timetable changed', at: '2026-08-02T00:00:00Z' }] },
      { id: 'c_two', title: 'Something else', about: 'focus:f_9', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-03T00:00:00Z', messages: [] },
      { id: 'c_three', title: 'Unbound chat', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-04T00:00:00Z', messages: [] },
    ],
    [`${CODE}:b`]: [
      { id: 'c_ben', title: "Ben's thread", about: 'inquiry:i_1', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-05T00:00:00Z', messages: [] },
    ],
  },
});
S._rebuildEmailIndex();

const server = S.app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path, id) => {
    const r = await fetch(base + path, { headers: { Authorization: `Bearer ${S.issueToken(id, CODE, 'member')}` } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  try {
    // G1-1 — the whole point: a thread can be about an object, and that reaches the caller.
    const all = await get('/api/assistant/conversations', 'a');
    const bound = (all.body.conversations || []).find(c => c.id === 'c_one');
    check('G1-1 a conversation carries what it is about', all.status === 200 && bound && bound.about === 'inquiry:i_1');

    // G1-2 — the list is a QUERY, not a second store. This is what makes "open the inquiry and
    // see the conversation you already had about it" possible without duplicating anything.
    const one = await get('/api/assistant/conversations?about=inquiry:i_1', 'a');
    const ids = (one.body.conversations || []).map(c => c.id);
    check('G1-2 filtering by object returns only that object\'s thread',
      one.status === 200 && ids.length === 1 && ids[0] === 'c_one');

    // G1-3 — THE FILTER FAILURE THAT MATTERS. An unparseable scope must return nothing, never
    // fall back to everything. Silently widening a scope is how a scoped read becomes unscoped.
    const bad = await get('/api/assistant/conversations?about=not-a-kind:zzz', 'a');
    check('G1-3 an unparseable object ref filters to NOTHING, it does not fall back to everything',
      bad.status === 200 && (bad.body.conversations || []).length === 0);

    // G1-4 — a binding grants nothing. Ann and Ben both have a thread about the same inquiry;
    // neither may see the other's, because these routes were already self-only and a label
    // cannot widen a read.
    const ann = await get('/api/assistant/conversations?about=inquiry:i_1', 'a');
    const ben = await get('/api/assistant/conversations?about=inquiry:i_1', 'b');
    const annIds = (ann.body.conversations || []).map(c => c.id);
    const benIds = (ben.body.conversations || []).map(c => c.id);
    check('G1-4 two people bound to the SAME object still cannot see each other\'s thread',
      annIds.length === 1 && annIds[0] === 'c_one' && benIds.length === 1 && benIds[0] === 'c_ben');

    // G1-5 — unbound threads are not lost. A person who just talks still has their history.
    check('G1-5 an unbound conversation still appears in the unfiltered list',
      (all.body.conversations || []).some(c => c.id === 'c_three' && c.about === null));

    // G1-6 — the binding is visible when the thread is opened, so a UI can say what it is about.
    const thread = await get('/api/assistant/conversations/c_one', 'a');
    check('G1-6 opening a thread says what it is about',
      thread.status === 200 && thread.body.conversation && thread.body.conversation.about === 'inquiry:i_1');
  } catch (e) {
    failed++; console.log('  FAIL suite threw:', e && e.message);
  }

  console.log(`\nthread-binding-http-smoke: ${passed} passed, ${failed} failed\n`);
  server.close();
  process.exit(failed ? 1 : 0);
});
