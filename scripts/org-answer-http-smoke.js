/* Truth layer — SCOPED ORGANISATIONAL ANSWERING over HTTP. Proves the SAME question gives a
   branch-appropriate answer: a child's shared game-plan makes it "recorded" for its parent
   lead but still "outstanding" for a sibling branch lead (who never learns the other branch
   already has it); a member is answered within their own scope; unanswerable questions route
   to a lead instead of guessing; a node-less org answers org-wide. Reuses _getOrgState's
   web scope + org-graph routing (one reasoning path). Run: node scripts/org-answer-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'aska', N = 'askn';
_loadAllStores({
  orgMeta: { [A]: { orgName: 'A', orgMode: 'sports' }, [N]: { orgName: 'N', orgMode: 'sports' } },
  orgUsers: {
    [A]: {
      ceo:    { id: 'ceo',    name: 'Chris',  role: 'coach',  orgCode: A, status: 'active', leadershipNodeIds: ['root'] },
      coachA: { id: 'coachA', name: 'Alex',   role: 'coach',  orgCode: A, status: 'active', leadershipNodeIds: ['teamA'] },
      coachB: { id: 'coachB', name: 'Bev',    role: 'coach',  orgCode: A, status: 'active', leadershipNodeIds: ['teamB'] },
      tl:     { id: 'tl',     name: 'Tara',   role: 'coach',  orgCode: A, status: 'active', leadershipNodeIds: ['trainers'] },
      joe:    { id: 'joe',    name: 'Joe',    role: 'member', orgCode: A, status: 'active', assignedNodeIds: ['trainers'] },
    },
    [N]: { boss: { id: 'boss', name: 'Boss', role: 'coach', orgCode: N, status: 'active' } },
  },
  orgNodes: {
    [A]: {
      root:     { nodeId: 'root',     parentId: null,   leaderIds: ['ceo'],    memberIds: [] },
      teamA:    { nodeId: 'teamA',    parentId: 'root',  leaderIds: ['coachA'], memberIds: [] },
      teamB:    { nodeId: 'teamB',    parentId: 'root',  leaderIds: ['coachB'], memberIds: [] },
      trainers: { nodeId: 'trainers', parentId: 'teamA', leaderIds: ['tl'],     memberIds: ['joe'] },
    },
  },
});
_rebuildEmailIndex();
const reqCfg = { requirements: [{ claimType: 'game_plan', matches: 'game plan|tactics|formation', freshDays: 365 }] };
S.orgStateConfig[A] = reqCfg;
S.orgStateConfig[N] = { requirements: [{ claimType: 'game_plan', matches: 'game plan|tactics|formation', freshDays: 365 }] };
// joe (member of trainers) shares a game plan → scoped to 'trainers'.
S._ingestArtifact(A, 'joe', { format: 'text', content: 'Game plan: high press 4-3-3, tactics and formation set.', sourceName: 'plan', visibility: 'normal', confirmVisibilityIncrease: true });

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { ceo: issueToken('ceo', A, 'coach'), coachA: issueToken('coachA', A, 'coach'), coachB: issueToken('coachB', A, 'coach'), joe: issueToken('joe', A, 'member'), boss: issueToken('boss', N, 'coach') };
  const ask = (who, question, code) => (async () => {
    const r = await fetch(base + '/api/org/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok[who]}` }, body: JSON.stringify({ question }) });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  })();

  try {
    // 1 · the SAME question, scoped differently per branch
    const aOut = await ask('coachA', 'what is still outstanding?');
    ok('1 · the parent lead sees the child\'s game plan as recorded → nothing outstanding', aOut.j.ok && aOut.j.answerable && /nothing is outstanding/i.test(aOut.j.answer));
    const bOut = await ask('coachB', 'what is still outstanding?');
    ok('1 · a sibling branch lead still sees the game plan as outstanding (branch-scoped)', bOut.j.answerable && /game plan/i.test(bOut.j.answer));
    ok('1 · the sibling lead NEVER learns the other branch already recorded it (no leak)', !/trainers|already|recorded it|team a|high press/i.test(JSON.stringify(bOut.j)));

    // 2 · a member is answered within their own scope
    const joeStatus = await ask('joe', 'is the game plan done?');
    ok('2 · a member sees their own node\'s game plan as recorded', /recorded/i.test(joeStatus.j.answer) && joeStatus.j.answerable);

    // 3 · ownership + status intents
    ok('3 · ownership names the responsible role', /owned by the coach/i.test((await ask('coachA', 'who owns the game plan?')).j.answer));
    ok('3 · the top leader sees the whole org (game plan recorded)', /recorded/i.test((await ask('ceo', 'is the game plan sorted?')).j.answer));

    // 4 · routing when it can't answer (never guesses); honesty on empty question
    const unknown = await ask('coachB', 'what should our marketing budget be?');
    ok('4 · an unanswerable question routes to a lead instead of guessing', unknown.j.answerable === false && !!unknown.j.routeTo);
    ok('4 · an empty question is refused', (await ask('coachA', '')).status === 400);

    // 5 · a node-less org answers org-wide with no crash
    const nOut = await ask('boss', 'what is outstanding?', N);
    ok('5 · a node-less org answers without error (org-wide)', nOut.j.ok && typeof nOut.j.answer === 'string');

    // 6 · no leaks: answers never expose ids, node scopes, or authority internals
    ok('6 · answers never expose requirement ids, node scopes, or authority metadata', !/requirementId|nodeScope|authorityClass|"id":|e1:/.test(JSON.stringify([aOut.j, bOut.j, joeStatus.j])));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\norg-answer-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
