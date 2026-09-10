/* Truth layer — THE SHELF OVER HTTP. Founder: "make library like chat gpt? In which you can open
   and name folders store focuses, highs and lows of your choice there? So that it's easier to
   come back and navigate your work if you are looking for something specific?"

   The pure module proves the rules. This proves they are the rules the SERVER runs, against the
   app's real access gate and two real squads — because the failure this feature invites is a
   folder that quietly becomes a second answer to who may see what, and a fixture with one user
   could never catch it. Boots the real app (DB_OPTIONAL).
   Run: node scripts/shelf-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const teamState = require('../ai/team-state.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _teamFocuses, orgNodes, shelfFilings, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'shf';
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const users = {
  coach: { id: 'coach', name: 'Head Coach', email: 'c@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
  out:   { id: 'out',   name: 'Other Squad', email: 'o@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
};
SQUAD.forEach((id, i) => { users[id] = { id, name: `Player ${i + 1}`, email: `${id}@x.io`, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] }; });

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: {
    n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: SQUAD, leaderIds: ['coach'] },
    n2: { nodeId: 'n2', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: [] },
  } },
  /* An inquiry of p1's own, so the shelf is exercised against something PERSONAL as well as
     against something the squad shares — the two arrive through different buckets. */
  inquiryStates: { [C]: { 'member:p1': { q1: {
    inquiryId: 'q1', topic: { label: 'Recovery between games' }, signals: [{ id: 'sig1', at: Date.now() }],
    hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [],
  } } } },
});
_rebuildEmailIndex();
_teamFocuses(C, 'n1').push(teamState.newFocus({
  focusId: 'tf1', nodeId: 'n1', text: 'Saturday away — the press', by: 'coach', now: Date.now() }));

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const T = {}; Object.keys(users).forEach(id => { T[id] = issueToken(id, C, users[id].role); });
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const req = (m, u, t, b) => fetch(base + u, { method: m, headers: H(t), body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const get = (u, t) => req('GET', u, t);
  const post = (u, t, b) => req('POST', u, t, b);
  const del = (u, t) => req('DELETE', u, t);

  try {
    /* ── SX1-SX3: a folder, and something in it. ── */
    const f = await post('/api/library/folders', T.p1, { name: 'Saturday' });
    const FID = f.j.folder.id;
    ok('SX1 a person names their own folder', f.status === 200 && f.j.folder.name === 'Saturday');

    const filed = await post('/api/library/shelf', T.p1, { kind: 'focus', id: 'tf1', folderId: FID });
    ok('SX2 they file the squad focus into it', filed.status === 200 && filed.j.filed.kind === 'focus' && filed.j.filed.refId === 'tf1');
    ok('SX2b …and are told plainly that this points at it rather than copying it, because "saved to Library" is exactly the phrase that makes somebody believe a copy was taken',
      /not a copy/i.test(filed.j.note || '') && /does not change who can see it/i.test(filed.j.note || ''));

    const shelf1 = await get('/api/library/shelf', T.p1);
    const row = (shelf1.j.items || []).find(i => i.refId === 'tf1');
    ok('SX3 it comes back with the object\'s LIVE title, read from the object rather than from anything the shelf wrote down',
      !!row && /Saturday away/.test(row.label));
    ok('SX3b …and the stored record holds no title at all, so there is nothing here that could go stale or outlive access to it',
      shelfFilings[C].every(x => !('label' in x) && !('title' in x) && !('text' in x)));
    ok('SX3c …addressed exactly as the rest of the app addresses it, so the row and a card on Home open the same thread',
      row.about === 'focus:tf1');
    ok('SX3d …and the folder reports it', (shelf1.j.folders || []).find(x => x.id === FID).count === 1);

    /* ── SX4: FILING SAYS NOTHING ABOUT THE THING FILED (L-SH3). ──
       The kernel must not be able to tell this happened. Filing a low is not agreement with it,
       and a product that counted it as one would be reading meaning into a navigation gesture —
       which is the same mistake as reading somebody's words for confidence. */
    const kernelBefore = JSON.stringify(inquiryStates[C]);
    await post('/api/library/shelf', T.p1, { kind: 'inquiry', id: 'q1', folderId: FID });
    ok('SX4 FILING SAYS NOTHING ABOUT THE THING FILED — the kernel is byte-for-byte unchanged, because wanting to find something again is not agreement with it, not evidence and not a direction',
      JSON.stringify(inquiryStates[C]) === kernelBefore);
    ok('SX4b …and the reply carries no agreement, direction or vote for anybody to start rendering',
      !/direction|agree|vote|confidence/i.test(JSON.stringify(filed.j)));
    ok('SX4c a personal inquiry files as readily as the squad\'s focus — the two arrive through different buckets and the shelf must not favour either',
      ((await get('/api/library/shelf', T.p1)).j.items || []).some(i => i.kind === 'inquiry' && i.refId === 'q1'));

    /* ── SX5: THE EXISTENCE ORACLE. ──
       Checking readability on the way IN as well as on the way out. Storing a reference the gate
       would drop anyway is harmless to read — but a route that accepts real ids and refuses
       invented ones answers "does this exist?" for anybody willing to ask it repeatedly. */
    const stranger = await post('/api/library/shelf', T.out, { kind: 'focus', id: 'tf1' });
    ok('SX5 somebody on another squad cannot file the First Team\'s focus — a route that accepts real ids and refuses invented ones is an existence oracle',
      stranger.status === 404);
    ok('SX5b …and is refused identically for a focus that never existed, so the two cases are indistinguishable from outside',
      (await post('/api/library/shelf', T.out, { kind: 'focus', id: 'nope' })).status === 404 &&
      JSON.stringify((await post('/api/library/shelf', T.out, { kind: 'focus', id: 'nope' })).j) === JSON.stringify(stranger.j));
    ok('SX5c an invented KIND is refused in words rather than filed against nothing',
      (await post('/api/library/shelf', T.p1, { kind: 'salary', id: 'x' })).status === 400);

    /* ── SX6: THE ONE THAT MATTERS. A shelf is not a key. ──
       p1 filed the squad focus while they were in the squad. They leave. The focus is still
       there, still filed, and must now be invisible to them — because access is decided at READ
       time by the object's own gate, and never by the fact that somebody once bookmarked it. */
    orgNodes[C].n1.memberIds = SQUAD.filter(id => id !== 'p1');
    const after = await get('/api/library/shelf', T.p1);
    ok('SX6 FILING CONFERS NO ACCESS — a player who leaves the squad loses the focus off their shelf, because the gate is asked at read time and a bookmark has never been a key',
      !(after.j.items || []).some(i => i.refId === 'tf1'));
    ok('SX6b …silently, with no placeholder row and no trace of it in the payload, because "1 item unavailable" discloses the thing it is hiding',
      !JSON.stringify(after.j).includes('tf1') && !/unavailable|no longer|hidden/i.test(JSON.stringify(after.j)));
    ok('SX6c …and the folder\'s COUNT drops with it — a count of what was filed rather than what resolved reports the existence of exactly what the gate withheld',
      (after.j.folders || []).find(x => x.id === FID).count === 1);
    ok('SX6d …while their own inquiry, which they never lost, is still there — which is what proves the line above is a gate and not a blanket refusal',
      (after.j.items || []).some(i => i.refId === 'q1'));

    /* And it comes back when access does, because nothing was deleted — the filing was never
       the thing, so it survives the round trip untouched. */
    orgNodes[C].n1.memberIds = SQUAD;
    ok('SX6e …and it returns the moment they are back in the squad, because the reference was never removed and never held the focus in the first place',
      ((await get('/api/library/shelf', T.p1)).j.items || []).some(i => i.refId === 'tf1'));

    /* ── SX7: conversations, which are the ChatGPT half of the request. ── */
    const turn = await post('/api/assistant/turn', T.p1, { text: 'how should we press on Saturday' });
    const convId = turn.j && turn.j.conversationId;
    const conv = await post('/api/library/shelf', T.p1, { kind: 'conversation', id: convId });
    ok('SX7 a conversation files onto the shelf — a reference to the live thread, not the flattened transcript the old Library kept beside it',
      !!convId && conv.status === 200);
    ok('SX7b …and nobody else can file it, because a conversation is read through the workspace key that is theirs by construction',
      (await post('/api/library/shelf', T.p2, { kind: 'conversation', id: convId })).status === 404);

    /* ── SX8: moving, and pressing the button twice. ── */
    const f2 = await post('/api/library/folders', T.p1, { name: 'Set pieces' });
    const moved = await post('/api/library/shelf', T.p1, { kind: 'focus', id: 'tf1', folderId: f2.j.folder.id });
    ok('SX8 filing something already on the shelf MOVES it rather than making a second row, which is also what makes the control safe to press twice on a slow phone',
      moved.j.moved === true &&
      ((await get('/api/library/shelf', T.p1)).j.items || []).filter(i => i.refId === 'tf1').length === 1);
    ok('SX8b …into a folder that must be the filer\'s own',
      (await post('/api/library/shelf', T.p1, { kind: 'inquiry', id: 'q1', folderId: 'fld_someone_else' })).status === 400);

    /* ── SX9: a folder is personal, and deleting one keeps its contents. ── */
    ok('SX9 a folder is personal — nobody else sees it',
      ((await get('/api/library/shelf', T.p2)).j.folders || []).every(x => x.id !== FID));
    ok('SX9b …and one person\'s shelf is not another\'s',
      ((await get('/api/library/shelf', T.p2)).j.items || []).length === 0);
    await del('/api/library/folders/' + FID, T.p1);
    ok('SX9c deleting a folder leaves what was in it LOOSE rather than taking it with them — deleting a folder has never been a way to lose track of your work',
      ((await get('/api/library/shelf', T.p1)).j.items || []).some(i => i.refId === 'q1'));

    /* ── SX10: taking something off the shelf deletes nothing. ── */
    const mineNow = (await get('/api/library/shelf', T.p1)).j.items.find(i => i.refId === 'q1');
    const removed = await del('/api/library/shelf/' + mineNow.id, T.p1);
    ok('SX10 taking something off the shelf removes the bookmark and says so — the entry never held the thing, so there is nothing here that could delete it',
      removed.status === 200 && /Nothing was deleted/i.test(removed.j.note || ''));
    ok('SX10b …and the inquiry itself is untouched, still in the kernel and still on their objects list',
      !!inquiryStates[C]['member:p1'].q1 &&
      ((await get('/api/objects?kind=inquiry&scope=self', T.p1)).j.objects || []).some(o => String(o.id) === 'q1'));
    ok('SX10c …and nobody can unfile somebody else\'s entry',
      (await del('/api/library/shelf/' + ((await get('/api/library/shelf', T.p1)).j.items[0] || {}).id, T.p2)).status === 404);

    /* ── SX11: THE CALL SITES. A shelf nothing files into is not a feature. ── */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('SX11 the Library page reads the SHELF rather than the old notes list',
      /fetch\('\/api\/library\/shelf/.test(src) && /MemberApp\._renderShelf\(/.test(src));
    ok('SX11b …something can actually be filed from a card, which is the half that makes the shelf fill up at all',
      /beginObjectAction\('keep_in_library'/.test(src) &&
      /requestedAction: this\._pendingComposerAction/.test(src));
    /* SX11c — BOTH HALVES, because the handler and the control live in different files and
       either one alone is a feature nobody can reach: a button wired to nothing, or a function
       nothing presses. */
    const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
    ok('SX11c …and a folder can be made from the page it is used on — the control in the markup AND the handler behind it, because either alone is unreachable',
      /onclick="MemberApp\.newShelfFolder\(\)"/.test(html) && /async newShelfFolder\(\)/.test(src));
    ok('SX11e …and the page the nav opens is the shelf, with the notes composer that made copies gone from it',
      /id="shelf-list"/.test(html) && !/id="note-content"/.test(html) && !/MemberApp\.submitNote\(\)/.test(html));
    /* SX11d — anchored to the CALL and not to the definition. Four assertions in this codebase
       have already passed on a function that existed and was never invoked. */
    /* SX11d — ANCHORED TO THE NAV'S OWN ENTRY POINT, and it had to be. The first version matched
       `this._renderShelf();` anywhere in the file, which openShelfFolder also contains — so
       deleting the call the ROUTER makes left it green, and the Library page would have opened
       to whatever was there before with the suite reporting the feature reachable. Four
       assertions in this codebase have now passed on a call that was not the one under test. */
    ok('SX11d …and the Library nav actually renders the shelf — matched at the router\'s own entry point, because the same call appears elsewhere in the file and matching it alone proves nothing',
      /_renderNotesPage\(\) \{\s*await this\._renderShelf\(\);\s*\}/.test(src) &&
      /notes:\s*\(\) => \{ if \(typeof MemberApp !== 'undefined'\) MemberApp\._renderNotesPage\(\); \}/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nshelf-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
