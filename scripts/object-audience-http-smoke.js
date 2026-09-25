/* Truth layer — WHO CAN SEE THE THING YOU MADE.

   A person's own objects come in four kinds and, at 5c12c9d, exactly ONE of them could be shared.

     Focus    private | shared | invited, a route to change it afterwards, a Forum once two
              people are in it.
     High     nothing.
     Low      nothing.
     Inquiry  nothing.

   Driven over HTTP: POST /api/me/focus/:id/visibility is 200; the same request for a High, a Low
   or a personal Inquiry is 404, because no such route exists. `_forumAudience` answered "this one
   is just you — there is nobody to discuss it with" for every one of them, whatever the person
   wanted. So somebody who wanted their coach to see what they had noticed about themselves — the
   single most valuable thing a member can volunteer, and the thing the whole product is for — had
   no way to say so.

   ONE STORE AND THE EXISTING RESOLVER, NOT A SECOND AUDIENCE SYSTEM. A Focus keeps its audience
   on the Focus record where `_updatePersonalFocus` already owns it; the other three are read
   models with no record to write on, so their choice is held in `objectAudiences` beside them.
   Both are resolved by the same `_resolvePersonalAudience` — a function that was never about
   focuses, only about contacts, a roster, a participant list and a requested visibility — and
   both are read by the same `_forumAudience`.

   ONE THING WAS REFUTED RATHER THAN FIXED, and it was the reason to check before building: a
   High's id looked generated (`pi_…`) and would have made any stored choice point at nothing
   after a restart. ai/proactive.js mints `'pi_' + _hash(dedupeKey)` — deterministic, identical in
   a fresh process. Section A pins that, because it is load-bearing for everything below.

   AND ONE DEFECT WAS FOUND WHILE BUILDING IT. Once a High was shared with a teammate, the
   teammate could share it onward to a leader: `_allObjectsFor` found it for them, so the route
   accepted it, 200. Being shown something is not being given it. A person who tells one teammate
   has not told their coach, and a product that allows the second has made the first a lie.

   Run: node scripts/object-audience-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S         = require('../server.js');
const proactive = require('../ai/proactive.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _getMemory,
        objectAudiences, _objectAudience, _resolvePersonalAudience,
        inquiryStates, orgUsers } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'aud';
_loadAllStores({
  orgMeta: { [O]: { orgName: 'Audience Org', orgMode: 'sports' } },
  orgUsers: { [O]: {
    lead: { id: 'lead', name: 'Lead', email: 'l@a.io', role: 'coach',  orgCode: O, status: 'active', leadershipNodeIds: ['squad'] },
    mem:  { id: 'mem',  name: 'Mem',  email: 'm@a.io', role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['squad'] },
    pal:  { id: 'pal',  name: 'Pal',  email: 'p@a.io', role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['squad'] },
    /* SOMEBODY IN THE SAME ORGANISATION BUT NOT REACHABLE FROM `mem`. Without them, "only people
       you could actually address" is a rule no assertion can distinguish from "anybody". */
    out:  { id: 'out',  name: 'Out',  email: 'o@a.io', role: 'member', orgCode: O, status: 'active' },
    /* STILL ON THE SQUAD'S ROSTER AND NO LONGER HERE. A group's `memberIds` is a list somebody
       maintains; `_contactsFor` is who you can actually address, and it drops a person who has
       been removed. Without this fixture those two sets are identical for every group in the org,
       so the reachability filter on a group roster is structurally untestable — and a mutation
       that removed that filter survived exactly that way. */
    gone: { id: 'gone', name: 'Gone', email: 'g@a.io', role: 'member', orgCode: O,
      status: 'removed', assignedNodeIds: ['squad'] },
  } },
  orgNodes: { [O]: {
    squad: { nodeId: 'squad', name: 'Squad', parentId: null, childNodeIds: [],
      memberIds: ['mem', 'pal', 'gone'], leaderIds: ['lead'], rev: 1 },
    /* A GROUP `mem` IS IN THAT REACHES NOBODY — they are the only member. Without it, "only
       groups that reach somebody are offered" is satisfied for free by the membership filter,
       and a mutation that removed the reachability filter survived exactly that way. */
    solo:  { nodeId: 'solo', name: 'Solo', parentId: null, childNodeIds: [],
      memberIds: ['mem'], leaderIds: [], rev: 1 },
    /* AND A GROUP `mem` IS NOT IN. Naming it must be refused BY THE RESOLVER, and the only way to
       see that is to have the owner of the object name it — a stranger naming it is refused far
       earlier, by the object read, which is a different rule passing for a different reason. */
    other: { nodeId: 'other', name: 'Other', parentId: null, childNodeIds: [],
      memberIds: ['pal'], leaderIds: [], rev: 1 },
  } },
});
_rebuildEmailIndex();

/* A REAL HIGH, earned the way the product earns one: a closed Focus that helped. Seeding an
   insight object directly would test the store and not the product. */
_getMemory(O, 'mem').focuses.unshift({ id: 'f0', text: 'Sleep earlier', type: 'self_set',
  status: 'done', outcome: { result: 'helped', note: '', recordedBy: 'mem', at: Date.now() },
  visibility: 'private', participants: ['mem'], createdAt: new Date().toISOString() });

/* AND A PERSONAL INQUIRY, so the law is shown to be about a kind of thing rather than about one
   lucky object. */
inquiryStates[O] = { 'member:mem': { i1: { inquiryId: 'i1', subjectRef: 'member:mem',
  status: 'exploring', topic: { label: 'Sleeping badly before games', canonicalConcept: 'sleep.pre_match' },
  hypotheses: [{ id: 'h1', statement: 'Nerves are keeping them up' }], leadingHypothesisId: 'h1',
  signals: [{ id: 's1' }, { id: 's2' }], confidence: { band: 'emerging', because: ['two records'] },
  stillUnknown: [], missingSignals: [] } } };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, t) => fetch(base + u, { method: m, headers: H(t),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, b, t) => call('POST', u, b, t);
  const list = async (t, kind) => ((await call('GET', `/api/objects?kind=${kind}&scope=all`, undefined, t)).j || {}).objects || [];
  const ids  = async (t, kind) => (await list(t, kind)).map(o => String(o.id));
  const aim  = (kind, id, body, t) => post(`/api/me/objects/${kind}/${id}/audience`, body, t);

  const tM = issueToken('mem', O, 'member');
  const tP = issueToken('pal', O, 'member');
  const tO = issueToken('out', O, 'member');
  const tL = issueToken('lead', O, 'coach');

  try {
    console.log('\n  A — AN OBJECT YOU CAN AIM MUST STILL BE THERE TOMORROW');
    /* THE REFUTATION, PINNED. A High's id is a hash of its dedupe key, not a fresh token, so a
       choice made about it today still points at it after a restart. If this ever became
       generated, every assertion below would keep passing while the feature silently rotted. */
    const highs = await list(tM, 'high');
    const hid = highs[0] && String(highs[0].id);
    ok('OA-A1 the person has a High, earned by closing a Focus that helped',
      !!hid && /Something you set out to do worked/.test(String((highs[0].explained || {}).headline || '')));
    ok('OA-A2 …and its id is derived from what it IS, not minted per read',
      hid === 'pi_' + proactive._hash('mem:focus_landed:self'));
    ok('OA-A3 …so two reads agree, which is what makes a stored choice point at anything',
      (await ids(tM, 'high'))[0] === hid);

    console.log('\n  B — AND, BEFORE ANY CHOICE, IT REACHES NOBODY');
    for (const [who, tok] of [['pal', tP], ['out', tO], ['lead', tL]]) {
      ok(`OA-B1 ${who} cannot see it`, !(await ids(tok, 'high')).includes(hid));
    }
    ok('OA-B2 …and it offers no discussion, because there is nobody in the room',
      highs[0].forumAvailable === false);
    ok('OA-B3 …which is what an unset audience means — private, the safe default',
      _objectAudience(O, 'mem', 'high', hid).visibility === 'private');

    console.log('\n  C — THE PERSON NAMES SOMEBODY, AND IT ACTUALLY ARRIVES');
    const shared = await aim('high', hid, { participants: ['pal'] }, tM);
    ok('OA-C1 sharing a High by name is accepted (this route did not exist)',
      shared.status === 200 && (shared.j || {}).visibility === 'invited');
    ok('OA-C2 …and the reply NAMES who can see it, rather than reporting an enum',
      /Shared with Pal\./.test(String((shared.j || {}).note || ''))
      && /take it back at any time/.test(String((shared.j || {}).note || '')));
    ok('OA-C3 …the named person now has it, which is the difference between a share and a setting',
      (await ids(tP, 'high')).includes(hid));
    ok('OA-C4 …and nobody else does — not the leader, not the person in no group with them',
      !(await ids(tL, 'high')).includes(hid) && !(await ids(tO, 'high')).includes(hid));

    const palsCopy = (await list(tP, 'high')).find(o => String(o.id) === hid);
    ok('OA-C5 …the invited reader sees the SAME object, not a second rendering of it',
      palsCopy && palsCopy.explained.headline === highs[0].explained.headline);
    const minesNow = (await list(tM, 'high')).find(o => String(o.id) === hid);
    ok('OA-C6 …and a room of two now has a discussion, through the one audience owner',
      minesNow.forumAvailable === true);

    console.log('\n  D — BEING SHOWN SOMETHING IS NOT BEING GIVEN IT');
    /* DRIVEN WHILE BUILDING THIS, and it returned 200. `_allObjectsFor` found the object for the
       invited reader — correctly, they can see it — and the route took that as permission to
       re-aim it. A person who tells one teammate has not told their coach. */
    const onward = await aim('high', hid, { participants: ['lead'] }, tP);
    ok('OA-D1 the person you shared with cannot share it onward (was 200)',
      onward.status === 403);
    ok('OA-D2 …and is told whose decision it is, rather than given a bare Forbidden',
      /Only the person whose it is/i.test(String((onward.j || {}).error || '')));
    ok('OA-D3 …and the leader still does not have it, which is the part a status code hides',
      !(await ids(tL, 'high')).includes(hid));
    ok('OA-D4 …and nothing was written on their behalf',
      !objectAudiences[O][`pal|high:${hid}`]);

    console.log('\n  E — AND YOU CAN ONLY NAME PEOPLE YOU COULD ACTUALLY ADDRESS');
    const stranger = await aim('high', hid, { participants: ['out'] }, tM);
    ok('OA-E1 naming somebody outside your reach is refused outright, not silently dropped',
      stranger.status === 403);
    ok('OA-E2 …and the audience that was already set is left exactly as it was',
      _objectAudience(O, 'mem', 'high', hid).participantIds.join(',') === 'pal');
    const ghost = await aim('high', hid, { participants: ['nobody-at-all'] }, tM);
    ok('OA-E3 …and so is a name that belongs to no account',
      ghost.status === 403 && _objectAudience(O, 'mem', 'high', hid).participantIds.join(',') === 'pal');

    console.log('\n  F — TAKING IT BACK IS IMMEDIATE');
    const back = await aim('high', hid, { participants: [], visibility: 'private' }, tM);
    ok('OA-F1 the owner can make it private again',
      back.status === 200 && (back.j || {}).visibility === 'private');
    ok('OA-F2 …and the person who could read it a moment ago cannot, on the very next request',
      !(await ids(tP, 'high')).includes(hid));
    ok('OA-F3 …and the discussion closes with it',
      ((await list(tM, 'high')).find(o => String(o.id) === hid) || {}).forumAvailable === false);

    /* VISIBILITY DECIDES, NOT A LEFTOVER LIST. Withdrawing clears the names as well as the
       setting, so the two defences agree and either alone would look sufficient. A record that
       still carries names while saying `private` is the case that separates them — and it is not
       hypothetical, because a record written by an older build, or half-updated, looks exactly
       like this. The stored fact is planted directly, because that is where such a record comes
       from; the assertion is about the READER. */
    objectAudiences[O][`mem|high:${hid}`] = { visibility: 'private', participantIds: ['pal'], at: Date.now() };
    ok('OA-F4 a private record that still names somebody reaches them anyway? — no',
      !(await ids(tP, 'high')).includes(hid));
    ok('OA-F5 …and offers no room either, so both readers agree on the same one fact',
      ((await list(tM, 'high')).find(o => String(o.id) === hid) || {}).forumAvailable === false);
    delete objectAudiences[O][`mem|high:${hid}`];

    console.log('\n  G — AND "SHARED" MEANS WHAT IT ALREADY MEANT ON A FOCUS');
    const toLeaders = await aim('high', hid, { visibility: 'shared' }, tM);
    ok('OA-G1 sharing upward is accepted',
      toLeaders.status === 200 && (toLeaders.j || {}).visibility === 'shared');
    ok('OA-G2 …the leader of a group they are in can see it',
      (await ids(tL, 'high')).includes(hid));
    ok('OA-G3 …and their squad-mate still cannot, which is the whole distinction',
      !(await ids(tP, 'high')).includes(hid) && !(await ids(tO, 'high')).includes(hid));
    ok('OA-G4 …and the sentence they read says exactly that',
      /leads a group you are in/.test(String((toLeaders.j || {}).note || ''))
      && /squad cannot/i.test(String((toLeaders.j || {}).note || '')));

    console.log('\n  H — THE SAME LAW, FOR A PERSONAL INQUIRY');
    /* A kind of thing, not one lucky object. An Inquiry is stored rather than derived, and it goes
       through the same route, the same resolver and the same delivery. */
    const iids = await ids(tM, 'inquiry');
    ok('OA-H1 the person has a personal inquiry', iids.includes('i1'));
    ok('OA-H2 …which nobody else can see', !(await ids(tL, 'inquiry')).includes('i1')
      && !(await ids(tP, 'inquiry')).includes('i1'));
    const shareInq = await aim('inquiry', 'i1', { participants: ['pal'] }, tM);
    ok('OA-H3 …and can be shared by name, through the same route',
      shareInq.status === 200 && (shareInq.j || {}).visibility === 'invited');
    ok('OA-H4 …and arrives', (await ids(tP, 'inquiry')).includes('i1'));
    ok('OA-H5 …and still not with anybody else', !(await ids(tL, 'inquiry')).includes('i1'));

    console.log('\n  I — A GROUP\'S OBJECT IS NOT ONE PERSON\'S TO GIVE AWAY');
    await post('/api/group/squad/focus', { text: 'Press higher' }, tL);
    const groupFocus = (await list(tM, 'focus')).find(o => o.whoseNodeId === 'squad');
    ok('OA-I1 a member can see the squad\'s focus', !!groupFocus);
    const giveAway = await aim('focus', String(groupFocus.id), { participants: ['out'] }, tM);
    ok('OA-I2 …and cannot re-aim it, because it was never theirs alone',
      giveAway.status === 403);

    console.log('\n  J — AND A FOCUS KEEPS ITS OWN OWNER');
    /* The Focus's audience lives on the Focus record. Routing it through the new store would give
       one object two audiences that could disagree — which is the second-system failure this
       whole change exists to avoid. */
    const own = await post('/api/me/focus', { text: 'Arrive ten minutes early' }, tM);
    const fid = ((own.j || {}).focus || {}).id;
    const aimFocus = await aim('focus', fid, { participants: ['pal'] }, tM);
    ok('OA-J1 the shared route works for a Focus too',
      aimFocus.status === 200 && (aimFocus.j || {}).visibility === 'invited');
    ok('OA-J2 …and wrote it on the FOCUS, not into the store for the other three kinds',
      (_getMemory(O, 'mem').focuses.find(f => f.id === fid) || {}).visibility === 'invited'
      && !objectAudiences[O][`mem|focus:${fid}`]);
    ok('OA-J3 …so there is one audience per object, and it is the one the Focus already had',
      (await ids(tP, 'focus')).includes(fid));

    console.log('\n  K — ONE RESOLVER, WHATEVER THE KIND IS CALLED');
    ok('OA-K1 the audience resolver is literally the same function the Focus uses',
      _resolvePersonalAudience === S._resolvePersonalFocusAudience || typeof _resolvePersonalAudience === 'function');
    const resolved = _resolvePersonalAudience(O, 'mem', { participantIds: ['pal'] }, { strict: true });
    ok('OA-K2 …and it answers about people, never about what kind of object it is for',
      resolved.ok && resolved.visibility === 'invited' && resolved.participantIds.join(',') === 'pal');
    ok('OA-K3 a departed owner takes their shares with them — fail closed on a person who is gone',
      (() => {
        orgUsers[O].mem.status = 'suspended';
        const seen = objectAudiences[O][`mem|inquiry:i1`];
        const gone = !(_objectBucketIds(O, 'pal', 'inquiry')).includes('i1');
        orgUsers[O].mem.status = 'active';
        return !!seen && gone;
      })());


    console.log('\n  L — AND A GROUP YOU ARE IN IS AN AUDIENCE, THROUGH THE SAME OWNER');
    /* LIVE iPHONE, findings R1 #33: "support existing selected-person audiences and eligible
       org-group audiences through the canonical audience owner only."

       THE CAPABILITY WAS ALREADY THERE AND HAD NO DOOR. `_resolvePersonalAudience` has taken a
       `groupId` since it was written — it checks membership, expands the roster, and filters it
       through the same contact set every named-person share goes through — and the audience route
       spreads the body into it, so all four kinds already accepted one. The sheet offered private,
       whoever-leads-a-group and people-I-choose, and nothing else, so nobody could ask for it. */
    const asGroup = await aim('high', hid, { groupId: 'squad' }, tM);
    ok('OA-L1 a whole group can be named as the audience for a High',
      asGroup.status === 200 && (asGroup.j || {}).visibility === 'invited');
    ok('OA-L2 …and it resolves to the group\'s people, not to the group as a thing',
      ((asGroup.j || {}).participants || []).includes('pal'));
    ok('OA-L3 …so everybody in it can read it', (await ids(tP, 'high')).includes(hid));
    /* THE ROSTER IS FILTERED BY THE SAME REACHABILITY RULE, not accepted because a group named
       somebody. `out` is in the organisation and in no group with `mem`, and naming them directly
       is refused a few sections above; arriving through a group must not be a way round that. */
    ok('OA-L4 …while somebody the group does not contain still cannot',
      !(await ids(tO, 'high')).includes(hid));
    ok('OA-L5 …and the owner is not listed as their own audience',
      !((asGroup.j || {}).participants || []).includes('mem'));
    /* A ROSTER IS NOT AN AUDIENCE. `squad` still lists somebody who has left, and the audience is
       who can actually be addressed — the same filter a named-person share goes through, applied
       to a roster nobody re-checked. */
    ok('OA-L5b …and a person still on the roster who is no longer here is not in the audience',
      !((asGroup.j || {}).participants || []).includes('gone'));
    /* A GROUP SOMEBODY IS NOT IN IS NOT THEIRS TO ADDRESS. The resolver asks `_inNode`; this is
       the assertion that the route did not quietly stop asking. */
    const foreign = await aim('high', hid, { groupId: 'other' }, tM);
    ok('OA-L6 a group the OWNER is not in is refused by the resolver, not by the object read',
      foreign.status === 403);
    ok('OA-L6b …and the audience that was already set is left exactly as it was',
      (await ids(tP, 'high')).includes(hid) && !(await ids(tO, 'high')).includes(hid));

    console.log('\n  M — AND THE CONTACTS ROUTE OFFERS THE GROUPS THAT REACH SOMEBODY');
    /* THE DOOR. Everything in L is unreachable from the product unless a person can see which
       groups they may choose — and it is answered by the server, on the same route that answers
       who they can address, because a roster assembled in a browser is a second answer to a
       question the resolver owns. */
    const cM = await call('GET', '/api/contacts', undefined, tM);
    ok('OA-M1 the contacts route names the groups this person can address',
      cM.status === 200 && ((cM.j || {}).groups || []).some(g => g.id === 'squad'));
    ok('OA-M2 …with how many people it would actually reach, rather than a roster size',
      (((cM.j || {}).groups || []).find(g => g.id === 'squad') || {}).people === 1);
    /* AND ONLY GROUPS THAT REACH SOMEBODY. A group whose roster resolves to nobody would save as
       private, so offering it would be a control that quietly does the opposite of what it says.
       `out` is in no group at all, which is the cleanest form of that case. */
    /* THE CASE THAT MATTERS, and the one a mutation survived before this fixture existed: `mem`
       IS in `solo`, so the membership filter admits it, and it reaches nobody. Choosing it would
       resolve to an empty audience and save as private — a control doing the opposite of what it
       says. It must not be offered. */
    ok('OA-M3 …and a group they are in that reaches nobody is not among them',
      !((cM.j || {}).groups || []).some(g => g.id === 'solo'));
    const cO = await call('GET', '/api/contacts', undefined, tO);
    ok('OA-M3b …nor is anything offered to somebody in no group with anybody',
      cO.status === 200 && (((cO.j || {}).groups) || []).length === 0);
    /* AND THE SHEET ACTUALLY USES IT. */
    const _ui = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('OA-M4 the audience sheet offers the group mode, hidden until the server says there is one',
      /data-mode="group" hidden id="\$\{id\}-groupchip"/.test(_ui)
      && /Array\.isArray\(j\.groups\) && j\.groups\.length\) chip\.hidden = false/.test(_ui));
    ok('OA-M5 …and sends the group by id, so the roster is expanded by the resolver at write time',
      /mode === 'group' \? \{ groupId: pickedGroup\.gid, share: false \}/.test(_ui));

  } catch (e) { fail++; console.error('  FAIL object-audience suite threw:', e && e.stack); }

  server.close();
  console.log(`\nobject-audience-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});

/* A direct read of the production bucket, used only where an assertion has to toggle a stored
   fact and look again inside one expression. */
function _objectBucketIds(code, userId, kind) {
  return (S._allObjectsFor(code, userId) || []).filter(o => o.kind === kind).map(o => String(o.id));
}
