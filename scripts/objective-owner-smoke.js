/* Truth layer — D50: Objective lives in orgContextRecords.
   The legacy orgGoals name is one compatibility view, never stored truth.
   Changes supersede, preserving the prior objective. */
process.env.DB_OPTIONAL = '1'; process.env.NODE_ENV = 'test';
const S = require('../server');
let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) { pass++; console.log('  PASS', name); } else { fail++; console.error('  FAIL', name); } };
const C = 'objective-owner';
S._loadAllStores({ orgMeta: { [C]: { orgName: 'Objective Owner' } },
  orgUsers: { [C]: { admin: { id: 'admin', role: 'superadmin', status: 'active', orgCode: C, email: 'a@o.test' } } },
  orgGoals: { [C]: [{ goalId: 'legacy-goal', text: 'Develop leadership', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }] } });
S._rebuildEmailIndex();
ok('F50.1 legacy orgGoals migrate into an active objective record',
  S.orgContextRecords[C].some(r => r.id === 'legacy-goal' && r.type === 'objective' && r.fields.title === 'Develop leadership'));
S.orgGoals[C][0].text = 'Develop shared leadership';
ok('F50.2 a legacy write supersedes rather than overwrites the objective',
  S.orgContextRecords[C].length === 2 && S.orgContextRecords[C][0].status === 'superseded'
  && S.orgContextRecords[C][1].supersedes === 'legacy-goal' && S.orgGoals[C][0].text === 'Develop shared leadership');
const snapshot = JSON.parse(JSON.stringify(S._persistedStores()));
ok('F50.3 only the canonical orgContextRecords owner is persisted',
  !('orgGoals' in snapshot) && snapshot.orgContextRecords[C].length === 2);
delete S.orgContextRecords[C]; S._loadAllStores(snapshot); S.orgGoals[C][0].text = 'Develop leadership everywhere';
ok('F50.4 after save and reload the legacy name still writes through by supersession',
  S.orgContextRecords[C].length === 3 && S.orgGoals[C][0].text === 'Develop leadership everywhere');
const server = S.app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${S.issueToken('admin', C, 'superadmin')}`, 'Content-Type': 'application/json' };
  try {
    const made = await fetch(base + '/api/goals', { method: 'POST', headers: H, body: JSON.stringify({ text: 'Win sustainably' }) }).then(r => r.json());
    const prior = made.goal.goalId;
    const changed = await fetch(base + `/api/goals/${prior}`, { method: 'PUT', headers: H, body: JSON.stringify({ text: 'Compete sustainably' }) }).then(r => r.json());
    ok('F50.5 the existing HTTP boundary writes and supersedes canonical objectives',
      changed.ok === true && changed.goal.text === 'Compete sustainably'
      && S.orgContextRecords[C].some(r => r.id === prior && r.status === 'superseded'));
  } catch (e) { fail++; console.error('  FAIL suite threw', e.stack); }
  server.close(() => { console.log(`\nobjective-owner-smoke: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); });
});
