/* Truth layer — YOURS AND YOUR SQUAD'S, IN ONE LIST.

   Founder, September 2026: "the most high priority thing be it a focus, high, low, inquiry
   should show on home first... which all output SELF AND TEAM info." And when asked how the two
   should sit together: ONE list, each card labelled — because the most important thing should be
   at the top whoever it is about, and two sections would let the squad's most urgent item sit
   below the person's least urgent one.

   Before this the client only ever asked for `scope=self`. Every team object existed, was
   computed, was governed — and was unreachable. A coach opened Highs and saw nothing.

   TWO BUGS A PROBE CAUGHT THAT NO TEST WOULD HAVE, both in the first version of this:

     1. The label was written into `about`. `about` is the THREAD-BINDING KEY — a conversation is
        found by `conversation.about === object.about` — so writing "you" into it would have
        broken every object thread in the app, silently, on every screen.

     2. The label was derived from WHICH BUCKET the object arrived in. A squad focus already
        reaches a member through their own bucket (that is the fix for "the coach set it and no
        player ever saw it"), so every shared focus was labelled "you" — for everybody.

   Both are pinned below, because the next person to touch this will reach for `about` and for
   the bucket, exactly as I did.

   Run: node scripts/self-and-team-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const teamState = require('../ai/team-state.js');
const diagnose = require('../ai/diagnose.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _teamFocuses, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* A SQUAD BIG ENOUGH TO SAY ANYTHING, and the fixture depends on it.

   The first version gave First Team ONE member. The two-sided cohort floor is 5, so the group
   surface withheld everything — and the group half of scope=all contributed nothing to any
   assertion here. Both gates could be deleted and ST7 still passed, because there was nothing
   for a gate to protect. Twelve members, and real group inquiries with enough independent
   origins, so the merge is exercised rather than assumed. */
const C = 'snt';
const SQUAD = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
const users = { coach: { id: 'coach', name: 'Head Coach', email: 'c@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
  out: { id: 'out', name: 'Other Squad', email: 'o@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] } };
SQUAD.forEach((id, i) => { users[id] = { id, name: `Player ${i + 1}`, email: `${id}@x.io`, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] }; });

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: {
    n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: SQUAD, leaderIds: ['coach'] },
    n2: { nodeId: 'n2', name: 'Reserves',   parentId: null, childNodeIds: [], memberIds: ['out'], leaderIds: [] },
  } },
});
_rebuildEmailIndex();
_teamFocuses(C, 'n1').push(teamState.newFocus({
  focusId: 'tf1', nodeId: 'n1', text: 'Press higher in the first 20', by: 'coach', now: Date.now() }));

/* A real GROUP inquiry, built through the PRODUCTION contribution path rather than hand-placed
   into inquiryStates. The hand-built version did not produce a single team object: the team
   surface has its own gates (contributors, independent origins, the two-sided cohort floor) and
   an inquiry that has not come through _admitGroupContributions does not satisfy them. Six
   contributors out of twelve clears the floor in both directions. */
const now = Date.now();
S.groupCandidates[C] = SQUAD.slice(0, 6).map((id, k) => ({
  candidateId: `gc${k}`, nodeId: 'n1', concept: 'soccer.press', label: 'Pressing after a turnover',
  contributorId: id, contributorRole: 'member', status: 'contributed',
  originKind: 'self_report', originRef: `g_o${k}`, evidenceRef: `g_e${k}`,
  valence: 'working_well', specificity: 0.7, directness: 'direct', authority: 'self_report',
  contributedAt: now - (6 - k) * 86400000,
}));
S._admitGroupContributions(C, 'n1', 'soccer.press', { now });

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(r => r.json());
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) }).then(r => r.json());

  const coachT = issueToken('coach', C, 'coach');
  const p1T = issueToken('p1', C, 'member');
  const outT = issueToken('out', C, 'member');

  try {
    await post('/api/me/focus', p1T, { text: 'Something of my own' });

    const mine = (await get('/api/objects?kind=focus&scope=all', p1T)).objects || [];
    ok('ST1 one list holds a person\'s own AND their squad\'s',
      mine.some(o => /Something of my own/i.test((o.present || {}).summary?.title || '')) &&
      mine.some(o => /Press higher/i.test((o.present || {}).summary?.title || '')));

    const own = mine.find(o => /Something of my own/i.test((o.present || {}).summary?.title || ''));
    const squad = mine.find(o => /Press higher/i.test((o.present || {}).summary?.title || ''));
    ok('ST2 each card says whose it is, so one list needs no headings',
      own.whose === 'you' && squad.whose === 'First Team');

    /* ST3 — THE BUG THE PROBE CAUGHT. A squad focus reaches a member through their OWN bucket,
       so a label derived from the source marks it "you". It has to come from the object. */
    ok('ST3 a squad focus is labelled with the SQUAD even though it arrived through the person\'s own bucket — the label comes from the object, never from where it was read',
      squad.whose === 'First Team' && squad.whoseNodeId === 'n1');
    const coachSees = (await get('/api/objects?kind=focus&scope=all', coachT)).objects || [];
    ok('ST3b …and the same holds for the coach who set it, who would otherwise see their own squad focus marked as personal',
      coachSees.length === 1 && coachSees[0].whose === 'First Team');

    /* ST4 — THE OTHER ONE. `about` binds a thread to its conversation. A label written into it
       breaks every object thread in the app, on every screen, without an error anywhere. */
    ok('ST4 `about` IS UNTOUCHED — it is the thread-binding key, not a label, and a conversation is found by matching it exactly',
      own.about === `focus:${own.id}` && squad.about === 'focus:tf1');
    const thread = await get(`/api/objects/focus/${own.id}/thread?scope=self`, p1T);
    ok('ST4b …and opening the thread still works, which is what would have broken silently',
      thread.ok === true && thread.about === own.about);

    /* ST5-ST6: one list, ranked, no repeats. */
    const ids = mine.map(o => `${o.kind}:${o.id}`);
    ok('ST5 nothing appears twice — a squad focus reachable two ways is still one card',
      ids.length === new Set(ids).size);
    const scores = mine.map(o => o.score || 0);
    ok('ST6 the list is ranked across BOTH, so the top of the list is the top of the list',
      scores.every((v, i) => i === 0 || scores[i - 1] >= v));

    /* ── ST6b: THE GROUP BRANCH ACTUALLY CONTRIBUTES. A team High exists only at group scope —
       a team focus reaches a member through their own bucket, so focuses alone cannot tell you
       whether the merge does anything. This is the object that can only have come from it. ── */
    const highs = (await get('/api/objects?kind=high&scope=all', p1T)).objects || [];
    ok('ST6b a TEAM High reaches the person through the merge — it exists only at group scope, so nothing else could have put it here',
      highs.some(o => /Pressing after a turnover/i.test((o.present || {}).summary?.title || '') && o.whose === 'First Team'));
    ok('ST6c …and it is absent from scope=self, which is what made a coach\'s Highs empty',
      !((await get('/api/objects?kind=high&scope=self', p1T)).objects || [])
        .some(o => /Pressing after a turnover/i.test((o.present || {}).summary?.title || '')));

    /* ST7: THE GATE IS UNMOVED. Merging must not reach around a scope check. */
    const outsider = (await get('/api/objects?kind=high&scope=all', outT)).objects || [];
    /* TWO GATES, MUTUALLY REDUNDANT, both kept. The merge loop checks _mayReadGroup before
       reading a node and _objectBucket checks it again — so deleting either ALONE changes no
       answer any request can produce, and only removing BOTH turns this red. That is the right
       shape for a privacy check and the wrong shape to leave undocumented, because a future
       reader deleting "the redundant one" would not learn from a green suite which one was
       load-bearing. Neither is; together they are. */
    ok('ST7 somebody in another squad gets NONE of this one\'s team findings — the merge reads each group through the same gate a per-group read uses, and skips what it may not see',
      !outsider.some(o => /Pressing after a turnover/i.test((o.present || {}).summary?.title || '')));
    ok('ST7b …not its focuses either',
      !((await get('/api/objects?kind=focus&scope=all', outT)).objects || [])
        .some(o => /Press higher/i.test((o.present || {}).summary?.title || '')));
    ok('ST7c …and scope=self still means self, so the new scope added a view rather than widening an old one',
      ((await get('/api/objects?kind=focus&scope=self', outT)).objects || []).length === 0);

    /* ST8: THE CALL SITE. The route existing is not the coach seeing anything. */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('ST8 the buckets ask for scope=all — this is the whole defect: the objects were always there and the client never asked',
      /kind=\$\{encodeURIComponent\(kind\)\}&scope=all/.test(src));
    ok('ST8b …and so does the one object on Home', /kind=\$\{k\}&scope=all/.test(src));
    ok('ST8c …and the card renders the label from `whose`, never from `about`',
      /item\.whose && item\.whose !== 'you'/.test(src) && !/item\.about/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nself-and-team-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
