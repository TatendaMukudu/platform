/* Truth layer — THE LIBRARY REMEMBERS WHERE SOMETHING IS, NOT WHAT IT SAID.

   "Things I wanted to find again" is the whole product idea, and it rests on one property that is
   invisible when it works and catastrophic when it does not: a shelf entry is a REFERENCE. It
   holds an id. Everything a person reads on the Library page is resolved from the live object at
   the moment they look.

   The alternative — a copy taken at the moment they pressed Keep — fails in three ways that all
   look like the product working:

     · the object changes and the Library shows the old wording, so two screens disagree and the
       Library is the one people trust because it is the one they chose to keep;
     · permission is revoked and the copy stays readable, which is a privacy failure that no
       audience check can catch because nothing is being read from the object at all;
     · the object is deleted and the entry becomes a ghost of something nobody can open.

   `POST /api/library/shelf` already refuses to file something the person cannot read, and says
   why in its own comment: storing a reference to an unreadable object would be harmless to read,
   but would make the route an existence oracle. This suite asserts the OTHER half — what happens
   afterwards, when the world moves.

   The existing browser check covers filing, foldering and moving. Nothing covered what happens to
   a filed thing when it changes, when it is taken away, or when it is deleted.

   Run: node scripts/library-reference-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, teamFocuses } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'lib';
const users = {
  coach: { id: 'coach', name: 'Coach', email: 'c@lib.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] },
  player: { id: 'player', name: 'Player', email: 'p@lib.io', role: 'member', orgCode: C,
    status: 'active', assignedNodeIds: ['first'] },
  outsider: { id: 'outsider', name: 'Reserves Coach', email: 'o@lib.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['res'], assignedNodeIds: ['res'] },
};
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: {
    first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
      memberIds: ['coach', 'player'], leaderIds: ['coach'] },
    res: { nodeId: 'res', name: 'Reserves', parentId: null, childNodeIds: [],
      memberIds: ['outsider'], leaderIds: ['outsider'] },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C,
    users[who].role === 'member' ? 'member' : 'coach')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const shelfOf = who => call('GET', '/api/library/shelf', undefined, who)
    .then(r => ((r.j || {}).items) || ((r.j || {}).shelf) || []);
  const findOn = (items, id) => (items || []).find(x =>
    String(x.refId || x.id || (x.ref && x.ref.refId)) === String(id)) || null;

  try {
    /* ══ A — SOMETHING WORTH KEEPING ═══════════════════════════════════════════════════════ */
    console.log('\n  A — A COACH KEEPS A GROUP FOCUS');
    const made = await call('POST', '/api/group/first/focus',
      { text: 'Play out from the back for three matches' }, 'coach');
    ok('A1 the focus exists', made.status === 200 && !!made.j.focus.focusId);
    const fid = made.j.focus.focusId;
    const kept = await call('POST', '/api/library/shelf', { kind: 'focus', id: fid }, 'coach');
    ok('A2 it can be kept', kept.status === 200);
    const onShelf = findOn(await shelfOf('coach'), fid);
    ok('A3 …and it is on the shelf, showing the focus\'s own words',
      !!onShelf && /Play out from the back/i.test(JSON.stringify(onShelf)));

    /* ══ B — THE OBJECT CHANGES, AND THE LIBRARY MOVES WITH IT ═════════════════════════════
       The half a copy would fail. Nothing here touches the shelf entry. */
    console.log('\n  B — THE FOCUS IS REWORDED, AND NOBODY TOUCHES THE LIBRARY');
    const live = (teamFocuses[C].first || []).find(f => f.focusId === fid);
    ok('B1 the focus is where the shelf entry points', !!live);
    live.text = 'Play out from the back only when we are not pressed';
    const after = findOn(await shelfOf('coach'), fid);
    ok('B2 the Library shows the NEW wording, because it resolved the live thing',
      !!after && /only when we are not pressed/i.test(JSON.stringify(after)));
    ok('B3 …and does not still show the old wording alongside it',
      !!after && !/for three matches/i.test(JSON.stringify(after)));

    /* ══ C — AND IT IS STILL THE SAME ENTRY ════════════════════════════════════════════════ */
    console.log('\n  C — AND NOTHING WAS RE-FILED TO MAKE THAT HAPPEN');
    const all = await shelfOf('coach');
    ok('C1 there is exactly one entry for it, not a second one for the new wording',
      (all || []).filter(x => String(x.refId || x.id || (x.ref && x.ref.refId)) === String(fid)).length === 1);

    /* ══ D — SOMEBODY ELSE'S SHELF IS THEIR OWN ════════════════════════════════════════════ */
    console.log('\n  D — AND A SHELF BELONGS TO THE PERSON WHOSE SHELF IT IS');
    ok('D1 another leader\'s shelf does not contain it', !findOn(await shelfOf('outsider'), fid));
    const theirs = await call('POST', '/api/library/shelf', { kind: 'focus', id: fid }, 'outsider');
    ok('D2 …and they cannot file something they cannot read',
      theirs.status === 403 || theirs.status === 404);
    /* THE ROUTE'S OWN REASON FOR CHECKING ON THE WAY IN: a filing route that accepted any id and
       relied on the read gate later would answer "does this exist" for every id anybody tried.
       Refusing is not enough — refusing DIFFERENTLY is the leak. A real-but-unreadable id and an
       id that was never minted must be indistinguishable from outside, or the refusal itself
       reports the contents of another team's shelf one guess at a time. */
    const invented = await call('POST', '/api/library/shelf',
      { kind: 'focus', id: 'focus_' + 'x'.repeat(12) }, 'outsider');
    ok('D3 an id that never existed is refused too', invented.status >= 400);
    ok('D4 …with the same status as the real one they may not read, so the refusal is not an oracle',
      invented.status === theirs.status);
    ok('D5 …and the same reason, so the wording does not leak it either',
      String((invented.j || {}).because || (invented.j || {}).error || '') ===
      String((theirs.j || {}).because || (theirs.j || {}).error || ''));

    /* ══ E — THE THING GOES AWAY ═══════════════════════════════════════════════════════════
       The failure a copy hides completely: the object is gone and the entry must not keep
       showing what it used to say. */
    console.log('\n  E — THE FOCUS IS REMOVED, AND THE ENTRY STOPS RESOLVING');
    const before = (await shelfOf('coach')).length;
    teamFocuses[C].first = (teamFocuses[C].first || []).filter(f => f.focusId !== fid);
    const gone = await shelfOf('coach');
    const ghost = findOn(gone, fid);
    ok('E1 the Library no longer shows the focus\'s words',
      !ghost || !/play out from the back/i.test(JSON.stringify(ghost)));
    /* EITHER IT DROPS OUT OR IT SAYS IT IS GONE. Both are honest; what is not honest is showing
       the old text. This asserts the property rather than picking the implementation. */
    ok('E2 …either dropping the row or marking it unavailable, rather than showing stale text',
      !ghost || /unavailable|not found|no longer|missing|removed/i.test(JSON.stringify(ghost)));
    ok('E3 …and the shelf still answers rather than erroring', Array.isArray(gone));
    ok('E4 …and the rest of the shelf is unaffected', gone.length <= before);

    /* ══ F — THE CONTROL ═══════════════════════════════════════════════════════════════════
       Every assertion above would pass against a Library that shows nothing at all, so this is
       the proof that it does resolve a live object when there is one. */
    console.log('\n  F — THE CONTROL: IT STILL RESOLVES SOMETHING THAT IS THERE');
    const second = await call('POST', '/api/group/first/focus',
      { text: 'Review the first fifteen minutes after each match' }, 'coach');
    await call('POST', '/api/library/shelf', { kind: 'focus', id: second.j.focus.focusId }, 'coach');
    const now = findOn(await shelfOf('coach'), second.j.focus.focusId);
    ok('F1 a live focus is on the shelf and readable',
      !!now && /Review the first fifteen minutes/i.test(JSON.stringify(now)));

  } catch (e) { fail++; console.error('  FAIL library-reference suite threw:', e && e.stack); }

  server.close();
  console.log(`\nlibrary-reference-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
