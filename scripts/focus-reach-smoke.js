/* Truth layer — A FOCUS HAS TO REACH THE PEOPLE IT IS FOR.

   Founder: "I created a group focus from the coach and I can't see it on the players."

   They were right, and the cause was one line. `_objectBucket` at scope=self read exactly one
   place — the person's OWN userAiProfiles focuses — so a coach could set a focus for the squad
   and not a single member of that squad would ever see it. The focus existed, the route worked,
   the coach's own screen showed it. It simply never travelled.

   That is the same shape as every other defect this month: a surface reading one substrate
   while the thing it is meant to show lives in another. Setting a focus FOR a group is what
   makes it the group's; a read that ignores that is not showing the person what is true.

   And the second half, from the same message: "you should be able to invite specific players if
   you want, not just make public to the entire group... think iMessage, and who a user can see
   in their org kinda like contacts." Public and private are two settings, and the one everybody
   actually wants is the third: these people. So a focus can name participants, and names are
   checked against a CONTACTS scope that is deliberately not the readability scope —

     ADDRESSABLE — a name, a role, the group you share. Enough to pick somebody out of a list.
     READABLE    — getVisibleUserIds, untouched, under which a plain member sees only themselves.

   Being able to type someone's name into an invite has never implied being able to read their
   record. Merging the two would turn a contact picker into a disclosure, so the suite pins the
   gap between them as hard as it pins the feature.

   Run: node scripts/focus-reach-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const teamState = require('../ai/team-state.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _teamFocuses, getVisibleUserIds } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'frh';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Head Coach',  email: 'c@x.io',  role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
    p1:    { id: 'p1',    name: 'Player One',  email: 'p1@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    p2:    { id: 'p2',    name: 'Player Two',  email: 'p2@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    out:   { id: 'out',   name: 'Other Squad', email: 'o@x.io',  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
  } },
  orgNodes: { [C]: {
    n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['p1', 'p2'], leaderIds: ['coach'] },
    n2: { nodeId: 'n2', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'],      leaderIds: [] },
  } },
});
_rebuildEmailIndex();
_teamFocuses(C, 'n1').push(teamState.newFocus({
  focusId: 'tf_1', nodeId: 'n1', text: 'Press higher in the first 20', by: 'coach', now: Date.now() }));

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(r => r.json());
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) }).then(r => r.json());
  const titles = async t => ((await get('/api/objects?kind=focus&scope=self', t)).objects || [])
    .map(o => (o.present && o.present.summary && o.present.summary.title) || o.id);

  const coachT = issueToken('coach', C, 'coach');
  const p1T    = issueToken('p1', C, 'member');
  const p2T    = issueToken('p2', C, 'member');
  const outT   = issueToken('out', C, 'member');

  try {
    /* ── FR1-FR3: the reported bug. ── */
    const seenByPlayer = await titles(p1T);
    ok('FR1 A SQUAD FOCUS REACHES THE SQUAD — the coach set it and the player can see it',
      seenByPlayer.some(t => /Press higher/i.test(t)));
    ok('FR2 …the coach still sees their own', (await titles(coachT)).some(t => /Press higher/i.test(t)));
    ok('FR3 …and a player in a DIFFERENT group does not — a group focus is the group\'s, not the org\'s',
      !(await titles(outT)).some(t => /Press higher/i.test(t)));

    /* ── FR4-FR6: contacts. Who you can address. ── */
    const c1 = await get('/api/contacts', p1T);
    const names = (c1.contacts || []).map(c => c.name);
    ok('FR4 a plain member has contacts at all — they had none before, so inviting anybody was impossible',
      names.length === 2 && names.includes('Player Two') && names.includes('Head Coach'));
    ok('FR5 …bounded by the tree: somebody in another squad is not in them',
      !names.includes('Other Squad'));
    ok('FR6 …and a contact is a NAME and a ROLE, never anything about the person',
      (c1.contacts || []).every(c => Object.keys(c).sort().join(',') === 'id,name,role,with'));

    /* ── FR7: THE LINE. Addressable is not readable, and widening one must never widen the
       other. This is the assertion that stops a contact picker becoming a disclosure. ── */
    const readable = getVisibleUserIds(C, 'p1');
    ok('FR7 being able to ADDRESS somebody does not make their record readable — a plain member still reads only themselves',
      readable.length === 1 && readable[0] === 'p1');

    /* ── FR8-FR11: inviting specific people. ── */
    const inv = await post('/api/me/focus', p1T, { text: 'Extra finishing on Tuesdays', participants: ['p2'] });
    ok('FR8 a focus can name the people it is with — the third setting, between private and the whole squad',
      inv.ok === true && inv.focus.visibility === 'invited' &&
      inv.focus.participants.includes('p1') && inv.focus.participants.includes('p2'));
    ok('FR9 …and it says who, by name, rather than reporting a setting',
      /Player Two/.test(inv.note || ''));
    ok('FR10 …the invited person actually sees it',
      (await titles(p2T)).some(t => /Extra finishing/i.test(t)));
    ok('FR11 …and nobody else does',
      !(await titles(outT)).some(t => /Extra finishing/i.test(t)) &&
      !(await titles(coachT)).some(t => /Extra finishing/i.test(t)));

    /* ── FR12: an invite cannot be used to reach somebody you are not alongside — which also
       means it cannot be used to probe whether a given id exists. ── */
    const reach = await post('/api/me/focus', p1T, { text: 'Reach across squads', participants: ['out'] });
    ok('FR12 naming somebody outside your contacts is dropped rather than honoured — an invite is not a way to discover people',
      reach.ok === true && reach.focus.visibility === 'private' &&
      reach.focus.participants.length === 1 && reach.focus.participants[0] === 'p1');

    /* ── FR13: a private focus is still private. The new paths must not have widened the old
       one on their way past. ── */
    const priv = await post('/api/me/focus', p1T, { text: 'Something just for me' });
    ok('FR13 a focus with nobody named is still private to its owner',
      priv.focus.visibility === 'private' &&
      !(await titles(p2T)).some(t => /just for me/i.test(t)) &&
      !(await titles(coachT)).some(t => /just for me/i.test(t)));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nfocus-reach-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
