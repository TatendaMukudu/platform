/* Truth layer — THE LIBRARY (HTTP). One organised home: personal folders holding items (notes,
   saved chats, artifacts), each PRIVATE by default and SHAREABLE by explicit choice. Proves:
   folders are personal; a note files into a folder; the chat→library bridge snapshots one of
   MY conversations (and only mine); PRIVATE items are owner-only while SHARED items are visible
   to teammates; only the owner can move/delete; deleting a folder unfiles its items (never
   deletes them). A shared item is VISIBLE — never a silent belief. Boots the real app
   (DB_OPTIONAL). Run: node scripts/library-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'lib';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Trafford United FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Pablo', role: 'coach',  orgCode: C, status: 'active' },
    joe:    { id: 'joe',    name: 'Joe',   role: 'member', orgCode: C, status: 'active' },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (who) => ({ Authorization: `Bearer ${issueToken(who, C, who === 'joe' ? 'member' : 'coach')}`, 'Content-Type': 'application/json' });
  const api = (who, method, path, body) => fetch(base + path, { method, headers: H(who), body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    /* 1 — a personal folder */
    const f = await api('coachA', 'POST', '/api/library/folders', { name: 'Set pieces' });
    const fid = f.j.folder.id;
    ok('1 · a user creates a personal folder', f.j.ok && fid && f.j.folder.name === 'Set pieces');
    ok('1 · a folder is personal — another user does not see it', (await api('joe', 'GET', '/api/library/folders')).j.folders.every(x => x.id !== fid));

    /* 2 — a private note filed into the folder */
    const n = await api('coachA', 'POST', '/api/library', { type: 'note', title: 'Corner routine', body: 'Near-post flick to the back stick.', folderId: fid });
    const nid = n.j.item.id;
    ok('2 · a note files into the folder, private by default', n.j.ok && n.j.item.visibility === 'private' && n.j.item.folderId === fid);
    ok('2 · the folder now reports its item', (await api('coachA', 'GET', '/api/library/folders')).j.folders.find(x => x.id === fid).itemCount === 1);

    /* 3 — PRIVATE is owner-only; another user cannot see it */
    ok('3 · a private item is invisible to another user', (await api('joe', 'GET', '/api/library?scope=all')).j.items.every(x => x.id !== nid));

    /* 4 — sharing makes it visible to teammates (but it's a VISIBILITY change, not a belief) */
    await api('coachA', 'PATCH', '/api/library/' + nid, { visibility: 'shared' });
    const joeSees = await api('joe', 'GET', '/api/library?scope=shared');
    ok('4 · a shared item becomes visible to a teammate', joeSees.j.items.some(x => x.id === nid && x.mine === false));
    ok('4 · …but a teammate cannot edit or delete it (owner-only)', (await api('joe', 'PATCH', '/api/library/' + nid, { title: 'hijack' })).status === 404 && (await api('joe', 'DELETE', '/api/library/' + nid)).status === 404);

    /* 5 — the chat→library bridge snapshots one of MY conversations, and only mine */
    const turn = await api('coachA', 'POST', '/api/assistant/turn', { text: 'What is a good warm-up?' });
    const convId = turn.j.conversationId;
    const saved = await api('coachA', 'POST', '/api/library/from-chat', { conversationId: convId, title: 'Warm-up chat', folderId: fid });
    ok('5 · a chat is saved into the Library as a keepable record', saved.j.ok && saved.j.item.type === 'chat' && /warm-up/i.test(saved.j.item.body || ''));
    ok('5 · you cannot save someone else\'s conversation (self-only)', (await api('joe', 'POST', '/api/library/from-chat', { conversationId: convId })).status === 404);

    /* 6 — deleting a folder UNFILES its items (never deletes them) */
    await api('coachA', 'DELETE', '/api/library/folders/' + fid);
    const after = await api('coachA', 'GET', '/api/library?scope=mine');
    ok('6 · deleting a folder keeps its items (now unfiled)', after.j.items.some(x => x.id === nid && x.folderId === null));

    /* 7 — the owner can delete their own item */
    ok('7 · the owner deletes their own item', (await api('coachA', 'DELETE', '/api/library/' + nid)).j.deleted === nid);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nlibrary-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
