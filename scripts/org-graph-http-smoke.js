/* Truth layer — ORG INFORMATION-WEB scoping, wired into org-state (integration). Proves
   that node-scoped evidence flows UP the web (a child's shared game-plan reaches its
   parent leaders and the top, but NOT a sibling branch), that a member sees their own
   node, and — critically — that an org with NO node structure is UNCHANGED (org-wide).
   Boots the real app in-process (DB_OPTIONAL). Run: node scripts/org-graph-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'grapha', N = 'graphn';   // A has a node web; N has no hierarchy
_loadAllStores({
  orgMeta: { [A]: { orgName: 'A', orgMode: 'sports' }, [N]: { orgName: 'N', orgMode: 'sports' } },
  orgUsers: {
    [A]: {
      ceo:         { id: 'ceo',         role: 'coach',  orgCode: A, status: 'active', leadershipNodeIds: ['root'] },
      coachA:      { id: 'coachA',      role: 'coach',  orgCode: A, status: 'active', leadershipNodeIds: ['teamA'] },
      coachB:      { id: 'coachB',      role: 'coach',  orgCode: A, status: 'active', leadershipNodeIds: ['teamB'] },
      trainerLead: { id: 'trainerLead', role: 'coach',  orgCode: A, status: 'active', leadershipNodeIds: ['trainers'] },
      joe:         { id: 'joe',         role: 'member', orgCode: A, status: 'active', assignedNodeIds: ['trainers'] },
    },
    [N]: { boss: { id: 'boss', role: 'coach', orgCode: N, status: 'active' } },
  },
  orgNodes: {
    [A]: {
      root:     { nodeId: 'root',     parentId: null,   leaderIds: ['ceo'],         memberIds: [] },
      teamA:    { nodeId: 'teamA',    parentId: 'root',  leaderIds: ['coachA'],      memberIds: [] },
      teamB:    { nodeId: 'teamB',    parentId: 'root',  leaderIds: ['coachB'],      memberIds: [] },
      trainers: { nodeId: 'trainers', parentId: 'teamA', leaderIds: ['trainerLead'], memberIds: ['joe'] },
    },
  },
});
_rebuildEmailIndex();

// One expected requirement in each org (so org-state has a game_plan claim to resolve).
const reqCfg = { requirements: [{ claimType: 'game_plan', matches: 'game plan|tactics|formation', freshDays: 365 }] };
S.orgStateConfig[A] = reqCfg;
S.orgStateConfig[N] = { requirements: [{ claimType: 'game_plan', matches: 'game plan|tactics|formation', freshDays: 365 }] };

try {
  // joe (a MEMBER of trainers) shares a game plan → org-shared, scoped to 'trainers'.
  const r = S._ingestArtifact(A, 'joe', { format: 'text', content: 'Game plan: high press 4-3-3, tactics and formation set.', sourceName: 'plan', visibility: 'normal', confirmVisibilityIncrease: true });
  const env = (S.evidenceLog[A] || []).find(e => (r.evidenceIds || []).includes(e.id));
  ok('0 · a member\'s org-shared evidence is stamped with their node scope (trainers)', env && env.attributes && env.attributes.nodeScope === 'trainers');

  // boss shares in the node-less org → org-wide (no scope stamped).
  const rn = S._ingestArtifact(N, 'boss', { format: 'text', content: 'Game plan: low block, tactics and formation.', sourceName: 'plan', visibility: 'normal', confirmVisibilityIncrease: true });
  const envN = (S.evidenceLog[N] || []).find(e => (rn.evidenceIds || []).includes(e.id));
  ok('0 · a node-less org stamps NO node scope (evidence stays org-wide)', envN && !(envN.attributes && envN.attributes.nodeScope));

  const claim = (actor, code = A) => { const s = S._getOrgState({ actor, organisationId: code }); const c = (s.claimStates || []).find(x => x.claimType === 'game_plan'); return c ? c.state : null; };

  // Information flows UP the web.
  ok('1 · the sharer (member of trainers) sees their own node\'s game plan (known)', claim('joe') === 'known');
  ok('1 · the trainers lead sees it (known)', claim('trainerLead') === 'known');
  ok('2 · the PARENT team lead sees the child node\'s game plan (up the web → known)', claim('coachA') === 'known');
  ok('2 · the TOP leader sees everything beneath them (known)', claim('ceo') === 'known');

  // Information does NOT leak across branches.
  ok('3 · a sibling branch lead does NOT see the other branch\'s game plan (missing)', claim('coachB') === 'missing');

  // The org-wide derivation path (no actor) sees the whole picture (memory/learning basis).
  ok('4 · the org-wide path (no actor) sees all shared evidence (known)', (() => { const s = S._getOrgState({ organisationId: A }); const c = (s.claimStates || []).find(x => x.claimType === 'game_plan'); return c && c.state === 'known'; })());

  // The node-less org is UNCHANGED — everything org-wide, every leader sees it.
  ok('5 · an org with no node structure is unchanged (leader sees org-wide evidence → known)', claim('boss', N) === 'known');

  // Determinism: repeated scoped reads are stable.
  ok('6 · scoped org-state reads are deterministic (coachB stays missing, coachA stays known)', claim('coachB') === 'missing' && claim('coachA') === 'known');
} catch (e) { fail++; console.log('  ✗ suite threw:', e && e.message); }

console.log(`\norg-graph-http-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
