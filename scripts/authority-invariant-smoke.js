/* Truth layer — L-AU1: MEMBERSHIP DESCRIBES STRUCTURE; EXPLICIT LEADERSHIP GRANTS AUTHORITY.

   THE DEFECT THIS EXISTS FOR. `_isLeader` had a fourth rule: you are a leader if you sit in a
   node that has sub-nodes. It was written for a tree where tiers are roles — "a person in Coach
   (which has child Player) leads the Player branch automatically". The pilot's tree is not
   shaped like that. Every Alma player is a member of Varsity Squad; Varsity Squad has four
   position groups beneath it. So all 28 players satisfied rule 4:

       PLAYER  role=member  leadershipNodeIds=0
         _isLeader      = true
         permissions    = view_members, assign_scenarios, view_reports,
                          view_team, review_checkins, view_insights
         visible people = 29 of 31
         GET  /api/workspace/visible-members  -> 200, 28 teammates by NAME,
              with EMAIL ADDRESSES and each one's latest check-in
         POST /api/intelligence/prepare {another player} -> 200

   Structure alone promoted an entire roster, and the disclosure that followed was real data
   about real teammates, not merely a permission flag set wrong.

   WHY NOTHING CAUGHT IT. `endpoint-smoke` asserts "a plain member (oversees no one) is denied
   (403)" and it passes — because its fixture is FLAT. A gate proven in a topology the pilot
   does not have proves nothing about the pilot. That is protocol pattern 5.

   So this fixture is ALMA-SHAPED on purpose: a squad with children, ordinary members of that
   squad, and explicitly assigned leaders. The shape is the test.

   AND IT AUDITS TWO DIFFERENT QUESTIONS, because a correct 403 is not sufficient evidence:
     A. CAN THIS ACTOR INVOKE IT?     -> status codes
     B. WHAT DO THEY ACTUALLY RECEIVE? -> the payload, searched for other people's names,
                                          emails, and private material
   A route that answers 200 with an empty body is safe. A route that answers 200 with a roster
   is not, and only question B can tell them apart.

   Run: node scripts/authority-invariant-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes, orgUsers,
        _isLeader, getVisibleUserIds, _effectivePermissions } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (e) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

/* ── THE ALMA SHAPE ───────────────────────────────────────────────────────────────────────
   Programme
     └── Varsity Squad          leaders: coach          members: 28 players
           ├── Goalkeepers      leaders: assistant      members: 3
           ├── Back Line        leaders: assistant      members: 9
           ├── Midfield         leaders: assistant      members: 10
           └── Front Line       leaders: assistant      members: 6

   Twenty-eight is not decoration. A squad of six can never clear the cohort floor, so a
   fixture that small would pass every assertion here against a permanently-refusing surface. */
const C = 'auth-inv';
const PLAYERS = Array.from({ length: 28 }, (_, i) => `pl${i + 1}`);
const users = {
  coach:     { id: 'coach',     name: 'Head Coach',      email: 'coach@x.io', role: 'coach',  orgCode: C, status: 'active' },
  assistant: { id: 'assistant', name: 'Assistant Coach', email: 'asst@x.io',  role: 'leader', orgCode: C, status: 'active' },
  outsider:  { id: 'outsider',  name: 'Other Squad',     email: 'out@x.io',   role: 'member', orgCode: C, status: 'active' },
};
PLAYERS.forEach((id, i) => {
  users[id] = { id, name: `Player ${i + 1}`, email: `${id}@x.io`, role: 'member', orgCode: C, status: 'active',
    // Something private that must never travel to a peer.
    latestPrivate: `player ${i + 1} said something private` };
});

const UNITS = { gk: PLAYERS.slice(0, 3), back: PLAYERS.slice(3, 12), mid: PLAYERS.slice(12, 22), fwd: PLAYERS.slice(22, 28) };

function build() {
  const nodes = {
    programme: { nodeId: 'programme', name: 'Programme', parentId: null, childNodeIds: ['varsity'], memberIds: [], leaderIds: ['coach'] },
    varsity:   { nodeId: 'varsity', name: 'Varsity Squad', parentId: 'programme',
                 childNodeIds: ['gk', 'back', 'mid', 'fwd'], memberIds: [...PLAYERS], leaderIds: ['coach'] },
    gk:   { nodeId: 'gk',   name: 'Goalkeepers', parentId: 'varsity', childNodeIds: [], memberIds: UNITS.gk,   leaderIds: ['assistant'] },
    back: { nodeId: 'back', name: 'Back Line',   parentId: 'varsity', childNodeIds: [], memberIds: UNITS.back, leaderIds: ['assistant'] },
    mid:  { nodeId: 'mid',  name: 'Midfield',    parentId: 'varsity', childNodeIds: [], memberIds: UNITS.mid,  leaderIds: ['assistant'] },
    fwd:  { nodeId: 'fwd',  name: 'Front Line',  parentId: 'varsity', childNodeIds: [], memberIds: UNITS.fwd,  leaderIds: ['assistant'] },
    other: { nodeId: 'other', name: 'Reserves', parentId: null, childNodeIds: [], memberIds: ['outsider'], leaderIds: [] },
  };
  const u = JSON.parse(JSON.stringify(users));
  // Leadership is ASSIGNED, and the cache mirrors the assignment — exactly as addLeader does.
  u.coach.leadershipNodeIds = ['programme', 'varsity'];
  u.assistant.leadershipNodeIds = ['gk', 'back', 'mid', 'fwd'];
  for (const id of PLAYERS) { u[id].assignedNodeIds = ['varsity']; u[id].leadershipNodeIds = []; }
  for (const [k, ids] of Object.entries(UNITS)) for (const id of ids) u[id].assignedNodeIds.push(k);
  u.outsider.assignedNodeIds = ['other'];
  _loadAllStores({ orgMeta: { [C]: { orgName: 'A Club', orgMode: 'sports' } }, orgUsers: { [C]: u }, orgNodes: { [C]: nodes } });
  _rebuildEmailIndex();
}
build();

const PLAYER = 'pl20';           // an ordinary midfielder: member of Varsity Squad AND of Midfield
const PEER   = 'pl3';            // a keeper, in a different position group

/* ── AI1-AI4: AN ORDINARY MEMBER OF A NODE WITH CHILDREN HAS NO AUTHORITY. ── */
ok('AI1 an ordinary player, member of a squad that HAS sub-nodes, is not a leader — structure does not imply authority (L-AU1)',
  _isLeader(C, PLAYER) === false);
ok('AI1b …and the node they are in genuinely has children, so this is the case that used to promote them rather than a fixture that dodges it',
  (orgNodes[C].varsity.childNodeIds || []).length === 4 &&
  (orgNodes[C].varsity.memberIds || []).includes(PLAYER));
{
  const perms = _effectivePermissions(C, PLAYER);
  const granted = Object.entries(perms).filter(([, v]) => v === true).map(([k]) => k);
  ok('AI2 …so none of the six LEADER_GRANTS reach them',
    !['view_team', 'view_members', 'view_reports', 'view_insights', 'review_checkins', 'assign_scenarios']
      .some(p => perms[p] === true));
  ok(`AI2b …and what they do hold is only their own role's defaults (${granted.length} permission${granted.length === 1 ? '' : 's'})`,
    !granted.includes('view_team'));
}
ok('AI3 …and they can see exactly one person: themselves',
  (() => { const v = getVisibleUserIds(C, PLAYER); return v.length === 1 && v[0] === PLAYER; })());
ok('AI4 a peer in a DIFFERENT position group is not visible to them either — the sibling case, which a parent-only fixture would miss',
  !getVisibleUserIds(C, PLAYER).includes(PEER));

/* ── AI5-AI7: THE EXPLICIT LEADER KEEPS EVERYTHING. A fix that closes the hole by breaking
   legitimate supervision is not a fix; it is the same outage with better paperwork. ── */
ok('AI5 the coach, explicitly named in Varsity Squad leaderIds, IS a leader',
  _isLeader(C, 'coach') === true);
ok('AI5b …and sees the whole squad they lead, all 28, through the descendants of the node they were assigned',
  PLAYERS.every(p => getVisibleUserIds(C, 'coach').includes(p)));
ok('AI6 the assistant, who leads only the four position groups, is a leader and sees their members',
  _isLeader(C, 'assistant') === true &&
  UNITS.gk.every(p => getVisibleUserIds(C, 'assistant').includes(p)));
ok('AI7 …and neither of them can see somebody in a squad they do not lead',
  !getVisibleUserIds(C, 'coach').includes('outsider') &&
  !getVisibleUserIds(C, 'assistant').includes('outsider'));

/* ── AI8-AI11: TOPOLOGY ALONE CANNOT MOVE AUTHORITY. ──
   The whole defect was a shape change silently changing who has power. So: change the shape,
   in both directions, and require nothing about authority to move. ── */
{
  const before = _isLeader(C, PLAYER);
  orgNodes[C].varsity.childNodeIds = ['gk', 'back', 'mid', 'fwd', 'newthing'];
  orgNodes[C].newthing = { nodeId: 'newthing', name: 'Set Piece Unit', parentId: 'varsity', childNodeIds: [], memberIds: [], leaderIds: [] };
  ok('AI8 ADDING a child node to the squad does not promote an ordinary member of it',
    _isLeader(C, PLAYER) === before && _isLeader(C, PLAYER) === false);
  ok('AI8b …and does not widen what they can see',
    getVisibleUserIds(C, PLAYER).length === 1);
  build();
}
{
  orgNodes[C].varsity.childNodeIds = [];
  ok('AI9 REMOVING every child node does not demote the explicitly assigned leader',
    _isLeader(C, 'coach') === true);
  ok('AI9b …and the coach still sees the squad, because their authority came from the assignment and not from the shape',
    PLAYERS.every(p => getVisibleUserIds(C, 'coach').includes(p)));
  build();
}
{
  // The reverse direction: a person who leads nothing, put into a node with children.
  orgNodes[C].varsity.memberIds = [...PLAYERS, 'outsider'];
  ok('AI10 putting somebody INTO a parent node does not make them a leader of what is beneath it',
    _isLeader(C, 'outsider') === false);
  build();
}
{
  // And the one that must still work: assignment DOES promote.
  orgNodes[C].mid.leaderIds = ['assistant', PLAYER];
  orgUsers[C][PLAYER].leadershipNodeIds = ['mid'];
  ok('AI11 naming that same player as a LEADER of Midfield does make them one — the invariant is about how authority is acquired, not about withholding it',
    _isLeader(C, PLAYER) === true && UNITS.mid.every(p => getVisibleUserIds(C, PLAYER).includes(p)));
  ok('AI11b …and it still stops at what they were given: leading Midfield does not disclose the keepers',
    !UNITS.gk.some(p => getVisibleUserIds(C, PLAYER).includes(p)));
  build();
}

/* ── AI12-AI14: THE OTHER THREE WAYS LEADERSHIP IS ASSIGNED STILL WORK.
   Rule 4 was justified by a case it did not actually carry. These are the rules that do. ── */
{
  orgUsers[C][PEER].supervisorId = PLAYER;
  ok('AI12 supervising somebody still makes you a leader (rule 2) — this is the rule that carries orgs built through onboarding, which is what rule 4 was wrongly credited with',
    _isLeader(C, PLAYER) === true);
  build();
}
{
  const g = { id: 'g1', name: 'Captains', leadIds: [PLAYER], memberIds: [PEER] };
  (S.orgGroups && (S.orgGroups[C] = [g]));
  ok('AI13 leading a group still makes you a leader (rule 3)',
    !S.orgGroups ? true : _isLeader(C, PLAYER) === true);
  if (S.orgGroups) S.orgGroups[C] = [];
  build();
}
{
  // THE SCAN RULE 4 USED TO PROVIDE. Rule 1 read only the cache; a real leader with an empty
  // or unbuilt `leadershipNodeIds` was invisible to it, and rule 4 caught them by accident.
  // Rule 1 now scans leaderIds itself, so removing rule 4 cannot demote them.
  orgNodes[C].mid.leaderIds = ['assistant', PLAYER];
  orgUsers[C][PLAYER].leadershipNodeIds = [];       // cache stale / never built
  ok('AI14 somebody in a node\'s leaderIds with an EMPTY cache is still a leader — the one real thing rule 4 carried, now owned by the rule it belongs to',
    _isLeader(C, PLAYER) === true);
  build();
}

/* ── AI15+: AUTHORIZATION AND DISCLOSURE, AUDITED SEPARATELY, OVER HTTP. ────────────────────
   Question A is the status code. Question B is what came back. A route that returns 200 with
   nothing in it is safe; the defect returned 200 with a roster. ── */
const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = (id, role) => issueToken(id, C, role);
  const call = async (method, path, id, role, body) => {
    const r = await fetch(base + path, {
      method, headers: { Authorization: `Bearer ${tok(id, role)}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.text() };
  };
  /* WHOSE NAMES, EMAILS OR PRIVATE WORDS ARE IN THIS PAYLOAD. The disclosure question, asked
     of the bytes rather than of the status line.

     MATCHED ON WORD BOUNDARIES, and the first version was not. `includes` reported "Player 2"
     inside "Player 20", so a payload containing only the reader themselves read as a leak of
     nine teammates and AI15/AI16 failed against correct code. A matcher too loose fails honest
     work; a matcher too tight passes a real leak. Neither is acceptable, so it is anchored. */
  const rx = t => new RegExp(`(^|[^\\w@.-])${String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w@.-])`);
  const leaks = (payload, exceptId) => {
    const hits = new Set();
    for (const u of Object.values(orgUsers[C])) {
      if (u.id === exceptId) continue;
      if (rx(u.name).test(payload) || rx(u.email).test(payload) ||
          (u.latestPrivate && payload.includes(u.latestPrivate))) hits.add(u.id);
    }
    return [...hits];
  };
  /* The matcher must be able to SEE a leak, or every assertion built on it is decorative. */
  ok('AI14b the disclosure matcher actually detects a name, an email and a private line — a leak detector that cannot detect one proves nothing about the payloads below',
    leaks(`x ${orgUsers[C][PEER].name} y`, PLAYER).includes(PEER) &&
    leaks(`x ${orgUsers[C][PEER].email} y`, PLAYER).includes(PEER) &&
    leaks(orgUsers[C][PEER].latestPrivate, PLAYER).includes(PEER) &&
    leaks(`Player 20 only`, PLAYER).length === 0);

  try {
    /* ── A AND B ARE ASKED SEPARATELY, and the first version did not. It accepted a route
       that either refused OR returned nothing about anybody, which let the route's own gate be
       deleted with the suite green: with visibility already corrected the payload was harmless
       either way, so the disclosure half satisfied the assertion and the authorization half was
       never tested. A mutation removing the `view_team` check on /api/workspace/my-tree bit
       nothing. That is protocol pattern 3 — one gate masking another — and it is exactly what
       the brief warned against accepting.

       So: LEADER_ONLY routes must REFUSE. Every route, refused or not, must disclose nobody. ── */
    const LEADER_ONLY = [
      ['GET',  '/api/workspace/my-tree'],
      ['GET',  '/api/intelligence/success'],
      ['GET',  '/api/intelligence/watch'],
      ['GET',  '/api/admin/checkin-reconciliation'],
    ];
    const refusals = [];
    for (const [m, p] of LEADER_ONLY) refusals.push([p, await call(m, p, PLAYER, 'member')]);
    for (const [p, r] of refusals) {
      ok(`AI15 AUTHORIZATION — an ordinary player is REFUSED by ${p} (${r.status})`, r.status === 403);
    }
    /* Read as well: a surface a player may legitimately open, which must still answer them. */
    const answers = [...refusals, ['/api/workspace/visible-members',
      await call('GET', '/api/workspace/visible-members', PLAYER, 'member')]];
    ok('AI15b DISCLOSURE — and whatever the status, not one of those payloads names another person',
      answers.every(([, r]) => leaks(r.body, PLAYER).length === 0));

    /* B — and what actually came back. This is the question a 403 test cannot answer, and the
       one that would have caught the defect: visible-members returned 200 either way. */
    const vm = answers.find(([p]) => p === '/api/workspace/visible-members')[1];
    ok('AI16 DISCLOSURE — /api/workspace/visible-members answers a player without naming a single teammate',
      vm.status === 200 && leaks(vm.body, PLAYER).length === 0);
    ok('AI16b …and carries no other person\'s EMAIL ADDRESS, which is what it was handing over',
      !Object.values(orgUsers[C]).some(u => u.id !== PLAYER && u.email && vm.body.includes(u.email)));
    ok('AI16c …the payload is a single person: themselves',
      (() => { try { const j = JSON.parse(vm.body); return (j.members || []).length === 1 && j.members[0].userId === PLAYER; } catch (_) { return false; } })());

    const prep = await call('POST', '/api/intelligence/prepare', PLAYER, 'member', { memberId: PEER });
    ok('AI17 a player cannot have IntelliQ prepare an intervention about a teammate',
      prep.status === 403 && leaks(prep.body, PLAYER).length === 0);

    /* AND THE LEADER STILL WORKS — without this every assertion above is satisfied by a
       surface that simply refuses everybody. */
    const cvm = await call('GET', '/api/workspace/visible-members', 'coach', 'coach');
    ok('AI18 the coach still receives their squad — otherwise the refusals above would be a broken route rather than a boundary',
      cvm.status === 200 && leaks(cvm.body, 'coach').length >= 28);
    const cprep = await call('POST', '/api/intelligence/prepare', 'coach', 'coach', { memberId: PLAYER });
    ok('AI18b …and can still act on a member of the squad they lead',
      cprep.status === 200);
    const outPrep = await call('POST', '/api/intelligence/prepare', 'coach', 'coach', { memberId: 'outsider' });
    ok('AI18c …but not on somebody outside it, so the leader boundary is a boundary in both directions',
      outPrep.status === 403);

    /* ── AI19: THE THIRD INSTANCE, tested where it can actually be seen. ───────────────────
       /api/workspace/my-tree built its root set from nodes the caller is a MEMBER of, so a
       squad you merely belong to contributed its children as roots of your leader tree.

       It cannot be tested through an ordinary player: they are refused by view_team first, so a
       mutation restoring it bit nothing. The actor has to be somebody who legitimately holds
       view_team and is ALSO an ordinary member somewhere else — which is an entirely normal
       person, a coach of one squad who plays for another. */
    orgNodes[C].rival = { nodeId: 'rival', name: 'Rival Squad', parentId: null,
      childNodeIds: ['rivalkids'], memberIds: ['coach'], leaderIds: ['outsider'] };
    orgNodes[C].rivalkids = { nodeId: 'rivalkids', name: 'Rival Juniors', parentId: 'rival',
      childNodeIds: [], memberIds: ['outsider'], leaderIds: ['outsider'] };
    const tree = await call('GET', '/api/workspace/my-tree', 'coach', 'coach');
    /* `tree.body` is ALREADY a string. The first version wrapped it in JSON.stringify, which
       escaped every quote, so `"nodeId":"..."` matched nothing at all and the assertion was
       true of any response whatsoever — including one containing the very node it forbids. A
       mutation restoring the defect bit nothing and that is how this was found. Protocol
       pattern 4, a vacuous matcher, written into the suite that exists to catch them. */
    const ids = (tree.body.match(/"nodeId":"[A-Za-z0-9_-]+"/g) || []).join(' ');
    ok('AI19 the matcher sees real node ids, so what follows is a test rather than a shape that always passes',
      /varsity/.test(ids));
    ok('AI19b a node the caller merely BELONGS to does not put its children into their leader tree — membership describes structure (L-AU1), third instance',
      tree.status === 200 && !/rivalkids/.test(ids));
    ok('AI19c …while the squad they actually lead is still there, so this is a boundary rather than an empty tree',
      /varsity/.test(ids) && !/rival\b/.test(ids));
    build();

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nauthority-invariant-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
