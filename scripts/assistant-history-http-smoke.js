/* Truth layer — PRIVATE CHAT HISTORY + MULTI-TURN MEMORY (HTTP). Proves the assistant now
   remembers FOR the user, owned BY the user: turns thread into a conversation, the thread is
   listable and retrievable, a follow-up carries the SAME conversationId (memory), history is
   SELF-ONLY (one user can't read or delete another's), and a user can delete their own thread
   (private & permanent until then). None of it becomes org data. Boots the real app
   (DB_OPTIONAL). Run: node scripts/assistant-history-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'hist';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Trafford United FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Pablo', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    joe:    { id: 'joe',    name: 'Joe',   role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: { teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['joe'] } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (who) => ({ Authorization: `Bearer ${issueToken(who, C, who === 'joe' ? 'member' : 'coach')}`, 'Content-Type': 'application/json' });
  const turn = (who, text, conversationId) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H(who), body: JSON.stringify({ text, conversationId }) }).then(r => r.json());
  const get = (who, path) => fetch(base + path, { headers: H(who) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const del = (who, path) => fetch(base + path, { method: 'DELETE', headers: H(who) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    /* 1 — a first turn opens a conversation and returns its id */
    const t1 = await turn('coachA', 'What is a good warm-up structure?');
    const conv = t1.conversationId;
    ok('1 · a turn returns a conversationId (a thread is opened)', typeof conv === 'string' && conv.length > 0);

    /* 2 — a follow-up on the SAME id stays in the SAME thread (memory) */
    const t2 = await turn('coachA', 'and for a rainy day?', conv);
    ok('2 · a follow-up carries the same conversationId (continuity)', t2.conversationId === conv);

    /* 3 — the thread is listable, self-only, newest-first */
    const list = await get('coachA', '/api/assistant/conversations');
    ok('3 · the conversation is listed for its owner', list.j.ok && list.j.conversations.some(c => c.id === conv && c.messageCount >= 4));

    /* 4 — the full thread reads back both turns, in order, with the provenance channel */
    const full = await get('coachA', `/api/assistant/conversations/${conv}`);
    const roles = (full.j.messages || []).map(m => m.role);
    ok('4 · the thread reads back user+assistant messages in order', full.j.ok && roles.slice(0, 2).join(',') === 'user,assistant' && full.j.messages.length >= 4);
    ok('4 · each assistant message carries the provenance channel (for the two-register UI)', full.j.messages.filter(m => m.role === 'assistant').every(m => Array.isArray(m.provenance)));

    /* 5 — SELF-ONLY: another user can neither read nor delete this thread */
    ok('5 · another user cannot read the thread (404)', (await get('joe', `/api/assistant/conversations/${conv}`)).status === 404);
    ok('5 · another user\'s own list does not contain it', (await get('joe', '/api/assistant/conversations')).j.conversations.every(c => c.id !== conv));
    ok('5 · another user cannot delete it (404)', (await del('joe', `/api/assistant/conversations/${conv}`)).status === 404);

    /* 6 — the owner can delete their own thread (private & permanent until they choose) */
    ok('6 · the owner deletes their own thread', (await del('coachA', `/api/assistant/conversations/${conv}`)).j.deleted === conv);
    ok('6 · …and it is gone from their list afterwards', (await get('coachA', '/api/assistant/conversations')).j.conversations.every(c => c.id !== conv));

    /* 7 — a new turn with no id starts a FRESH thread (not appended to a random one) */
    const t3 = await turn('coachA', 'Totally new topic.');
    ok('7 · a turn with no conversationId opens a new thread', t3.conversationId && t3.conversationId !== conv);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nassistant-history-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
