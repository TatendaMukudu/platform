/* Truth layer — MEMBER CHAT THREADING (HTTP). Fix 2, step 1: a member's plain chat now threads
   into ONE saved conversation across turns (the same runtime + endpoints the leader uses), and
   is retrievable from history. Proves a member is not on a weaker, memory-less path. A scoped
   work-item / member-support turn stays a one-off (not mixed into the personal thread) — that
   contract is enforced client-side; here we pin the personal-chat threading the member relies on.
   Boots the real app (DB_OPTIONAL). Run: node scripts/member-chat-threading-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'mct';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Demo Athletic Club', orgMode: 'sports' } },
  orgUsers: { [C]: { maya: { id: 'maya', name: 'Maya Chen', role: 'member', orgCode: C, status: 'active' } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('maya', C, 'member');
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const turn = (body) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H, body: JSON.stringify(body) }).then(r => r.json());
  const get  = (p) => fetch(base + p, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());

  try {
    /* 1 — first turn opens a conversation and returns its id */
    const r1 = await turn({ text: 'I want to get better at time management' });
    const cid = r1 && r1.conversationId;
    ok('1 · a member turn opens a threaded conversation (returns conversationId)', !!cid);

    /* 2 — the next turn, carrying that id, continues the SAME conversation */
    const r2 = await turn({ text: 'and my defending too', conversationId: cid });
    ok('2 · a follow-up with the id stays in the SAME conversation', r2 && r2.conversationId === cid);

    /* 3 — history lists exactly that one conversation for the member */
    const hist = await get('/api/assistant/conversations');
    const conv = (hist.conversations || []).find(c => c.id === cid);
    ok('3 · the conversation is retrievable from the member\'s own history', !!conv && (conv.messageCount || 0) >= 2);

    /* 4 — opening it returns both of the member's messages, in order */
    const full = await get('/api/assistant/conversations/' + encodeURIComponent(cid));
    const userMsgs = (full.messages || []).filter(m => m.role === 'user').map(m => m.text);
    ok('4 · both turns are remembered in the thread', full.ok
      && userMsgs.some(t => /time management/i.test(t))
      && userMsgs.some(t => /defending/i.test(t)));

    /* 5 — a DIFFERENT member cannot see Maya's conversation (self-only history) */
    const otherTok = issueToken('ghost', C, 'member');
    const other = await fetch(base + '/api/assistant/conversations/' + encodeURIComponent(cid), { headers: { Authorization: `Bearer ${otherTok}` } });
    ok('5 · another member cannot open it (self-only)', other.status === 403 || other.status === 404);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nmember-chat-threading-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
