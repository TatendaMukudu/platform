/* Truth layer — PINNED + TEAM-SHARED NOTES over HTTP. Proves the governed boundary: a note
   is private until the AUTHOR shares it; the privacy gate hard-blocks sharing a sensitive
   note; a shared+pinned note reaches teammates IN SCOPE (a sibling branch never sees it — no
   leak) and only through the safe team projection (no sensitivity / private AI reply /
   internal id); pinning needs visibility; and un-sharing takes it back. Boots the real app
   (DB_OPTIONAL). Run: node scripts/notes-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'notea';
/*  root(ceo) ├─ teamA(coachA, member joe)  └─ teamB(coachB)  */
_loadAllStores({
  orgMeta: { [C]: { orgName: 'N', orgMode: 'sports' } },
  orgUsers: { [C]: {
    ceo:    { id: 'ceo',    name: 'Cleo', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['root'] },
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    coachB: { id: 'coachB', name: 'Bev',  role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamB'] },
    joe:    { id: 'joe',    name: 'Joe',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    root:  { nodeId: 'root',  parentId: null,  leaderIds: ['ceo'],    memberIds: [], childNodeIds: ['teamA', 'teamB'] },
    teamA: { nodeId: 'teamA', parentId: 'root', leaderIds: ['coachA'], memberIds: ['joe'] },
    teamB: { nodeId: 'teamB', parentId: 'root', leaderIds: ['coachB'], memberIds: [] },
  } },
  orgNotes: {
    n1: { id: 'n1', orgCode: C, authorId: 'coachA', authorName: 'Alex', content: 'Press off their keeper\'s first touch.', tag: 'Press trap',
          sensitivity: 'normal', createdAt: '2026-07-20T09:00:00Z', aiResponse: 'a private companion reply', teamShared: true, sharedBy: 'coachA', sharedAt: '2026-07-20T09:05:00Z', nodeScope: 'teamA', pinned: true },
    n2: { id: 'n2', orgCode: C, authorId: 'coachA', authorName: 'Alex', content: 'Worried Marcus is struggling at home.', tag: 'Marcus',
          sensitivity: 'sensitive', createdAt: '2026-07-21T09:00:00Z', teamShared: false, pinned: false },
    n3: { id: 'n3', orgCode: C, authorId: 'coachA', authorName: 'Alex', content: 'Try a diamond midfield Saturday.', tag: 'Shape',
          sensitivity: 'normal', createdAt: '2026-07-22T09:00:00Z', teamShared: false, pinned: false },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { ceo: issueToken('ceo', C, 'coach'), coachA: issueToken('coachA', C, 'coach'), coachB: issueToken('coachB', C, 'coach'), joe: issueToken('joe', C, 'member') };
  const H = who => ({ Authorization: `Bearer ${tok[who]}`, 'Content-Type': 'application/json' });
  const pinned = async who => (await fetch(base + '/api/notes/pinned', { headers: H(who) })).json();
  const post = async (who, path) => { const r = await fetch(base + path, { method: 'POST', headers: H(who) }); return { status: r.status, j: await r.json() }; };

  try {
    /* ── 1 · the author sees their own pinned note ── */
    const a = await pinned('coachA');
    ok('1 · the author\'s shelf includes their pinned note', a.ok && (a.pinned || []).some(p => p.id === 'n1' && p.teamShared === true));

    /* ── 2 · a teammate IN SCOPE sees the shared pinned note — safely ── */
    const j = await pinned('joe');
    const jn1 = (j.pinned || []).find(p => p.id === 'n1');
    ok('2 · a teammate in the author\'s scope sees the shared pinned note', !!jn1 && jn1.sharedBy === 'Alex');
    ok('2 · they see only the safe team projection (no sensitivity / private AI reply / author id)', jn1 && !('sensitivity' in jn1) && !('aiResponse' in jn1) && !('authorId' in jn1) && !JSON.stringify(jn1).includes('companion'));

    /* ── 3 · a sibling-branch lead never sees it (no cross-branch leak) ── */
    const b = await pinned('coachB');
    ok('3 · a sibling branch lead\'s shelf does not include the note', !(b.pinned || []).some(p => p.id === 'n1'));
    ok('3 · nothing about it leaks to the sibling branch', !/press trap|keeper|n1/i.test(JSON.stringify(b)));

    /* ── 4 · the privacy gate HARD-BLOCKS sharing a sensitive note ── */
    const blocked = await post('coachA', '/api/notes/n2/share');
    ok('4 · a sensitive note cannot be shared, even by its author', blocked.j.ok === false && blocked.j.blocked === 'sensitive_stays_private');
    const jAfter = await pinned('joe');
    ok('4 · …and it never reaches the team', !(jAfter.pinned || []).some(p => p.id === 'n2') && !/marcus is struggling/i.test(JSON.stringify(jAfter)));

    /* ── 5 · a normal note can be pinned + shared, and then a teammate sees it ── */
    await post('coachA', '/api/notes/n3/pin');
    const sh = await post('coachA', '/api/notes/n3/share');
    ok('5 · the author can share a normal note', sh.j.ok === true && sh.j.shared === true);
    const j3 = await pinned('joe');
    ok('5 · the teammate now sees the newly shared, pinned note', (j3.pinned || []).some(p => p.id === 'n3'));

    /* ── 6 · only the author may share; only a viewer may pin ── */
    const notAuthor = await post('coachB', '/api/notes/n1/share');
    ok('6 · a non-author cannot share someone\'s note (403)', notAuthor.status === 403);
    const cantSee = await post('coachB', '/api/notes/n1/pin');
    ok('6 · a lead who can\'t see a note cannot pin it (403)', cantSee.status === 403);
    const teammatePins = await post('joe', '/api/notes/n1/pin');
    ok('6 · a teammate who CAN see a shared note may pin it to their shelf', teammatePins.j.ok === true);

    /* ── 7 · sharing is reversible — un-share removes team visibility ── */
    const un = await post('coachA', '/api/notes/n1/unshare');
    ok('7 · the author can un-share', un.j.ok === true && un.j.shared === false);
    const jUn = await pinned('joe');
    ok('7 · once un-shared, the teammate no longer sees it', !(jUn.pinned || []).some(p => p.id === 'n1'));

    /* ── 8 · ask IntelliQ about a note — grounded, visibility-gated ── */
    const askBody = (who, id, q) => (async () => {
      const r = await fetch(base + `/api/notes/${id}/ask`, { method: 'POST', headers: H(who), body: JSON.stringify({ question: q }) });
      return { status: r.status, j: await r.json() };
    })();
    // n3 is shared to the team; joe (in scope) may ask, and the answer is grounded in the note.
    const ask = await askBody('joe', 'n3', 'what shape should we try?');
    ok('8 · a teammate can ask about a shared note, grounded in its own words', ask.j.ok && ask.j.grounded === true && /diamond/i.test(ask.j.answer));
    // coachB is out of scope for n3 → cannot ask.
    const askDenied = await askBody('coachB', 'n3', 'what shape?');
    ok('8 · someone who can\'t see the note cannot ask about it (403)', askDenied.status === 403);
    const askEmpty = await askBody('joe', 'n3', '   ');
    ok('8 · an empty question is refused (400)', askEmpty.status === 400);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nnotes-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
