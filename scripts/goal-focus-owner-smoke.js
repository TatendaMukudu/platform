/* Truth layer — D51: a Goal is a Focus, not a second lifecycle.
   Legacy memberGoals retains profile metadata but never stores goal truth. */
process.env.DB_OPTIONAL = '1'; process.env.NODE_ENV = 'test';
const S = require('../server'); let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const C = 'goal-focus', U = 'member';
S._loadAllStores({ orgMeta: { [C]: {} }, orgUsers: { [C]: { [U]: { id: U, name: 'Member', email: 'm@g.test', role: 'member', status: 'active' } } },
  memberGoals: { [`${C}:${U}`]: { goal: 'Improve receiving', identity: 'Calm under pressure', setAt: '2026-01-01T00:00:00.000Z' } } });
S._rebuildEmailIndex();
const focus = S.userAiProfiles[`${C}:${U}`].focuses.find(f => f.kind === 'goal');
ok('F51.1 a legacy personal goal migrates into the canonical Focus lifecycle', focus?.text === 'Improve receiving');
ok('F51.2 the stored memberGoals profile no longer carries a goal copy',
  !Object.prototype.hasOwnProperty.call(S._persistedStores().memberGoals[`${C}:${U}`], 'goal'));
const snapshot = JSON.parse(JSON.stringify(S._persistedStores())); delete S.userAiProfiles[`${C}:${U}`]; delete S.memberGoals?.[`${C}:${U}`]; S._loadAllStores(snapshot);
ok('F51.3 save and reload preserves one canonical goal-shaped Focus',
  S.userAiProfiles[`${C}:${U}`].focuses.filter(f => f.kind === 'goal' && f.text === 'Improve receiving').length === 1);
const server = S.app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`, H = { Authorization: `Bearer ${S.issueToken(U, C, 'member')}`, 'Content-Type': 'application/json' };
  try {
    await fetch(base + '/api/member/goals', { method: 'POST', headers: H, body: JSON.stringify({ goal: 'Improve scanning', identity: 'Aware' }) });
    const body = await fetch(base + `/api/member/goals?memberId=${U}`, { headers: H }).then(r => r.json());
    ok('F51.4 the existing goal HTTP boundary writes and reads the Focus owner',
      S.userAiProfiles[`${C}:${U}`].focuses.some(f => f.kind === 'goal' && f.text === 'Improve scanning')
      && body.goals.identity === 'Aware');
  } catch (e) { fail++; console.error('  FAIL suite threw', e.stack); }
  server.close(() => { console.log(`\ngoal-focus-owner-smoke: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); });
});
