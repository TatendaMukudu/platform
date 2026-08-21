/* Truth layer — P0-3 one tenant tree cannot publish overlapping candidates. */
'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';

const db = require('../db.js');
let releaseFirst;
const firstGate = new Promise(resolve => { releaseFirst = resolve; });
const candidates = [];
db.saveStores = async units => {
  candidates.push(JSON.parse(JSON.stringify(units)));
  if (candidates.length === 1) await firstGate;
  return { rows: Object.keys(units).length, bytes: 0, conflicts: [] };
};
db.deleteStores = async () => ({ rows: 0, conflicts: [] });

const S = require('../server.js');
const C = 'treequeue';
S._loadAllStores({
  orgMeta: { [C]: { orgName: 'Tree Queue', orgMode: 'universal' } },
  orgUsers: { [C]: {
    admin: { id: 'admin', role: 'admin', orgCode: C, status: 'active' },
    a: { id: 'a', role: 'member', orgCode: C, status: 'active' },
    b: { id: 'b', role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    one: { nodeId: 'one', memberIds: [], leaderIds: [], childNodeIds: [], rev: 0 },
    two: { nodeId: 'two', memberIds: [], leaderIds: [], childNodeIds: [], rev: 0 },
  } },
});

let pass = 0, fail = 0;
const ok = (name, condition) => {
  if (condition) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
};

(async () => {
  console.log('tree-mutation-serialization-smoke — P0-3 candidate isolation\n');
  const server = S.app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = S.issueToken('admin', C, 'admin');
  const write = (id, member) => fetch(`${base}/api/tree/node/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ifRev: 0, memberIds: [member] }),
  });

  const first = write('one', 'a');
  while (!candidates.length) await new Promise(resolve => setImmediate(resolve));
  const second = write('two', 'b');
  await new Promise(resolve => setImmediate(resolve));
  ok('a second mutation waits until the first durable decision settles', candidates.length === 1);
  ok('the first durable candidate contains no later unaccepted mutation',
    candidates[0][`store:orgNodes:${C}`][C].two.memberIds.length === 0);

  releaseFirst();
  const [one, two] = await Promise.all([first, second]);
  ok('both independently current mutations can be accepted in order', one.status === 200 && two.status === 200);
  ok('the second candidate starts from the first accepted state',
    candidates.length === 2 &&
    candidates[1][`store:orgNodes:${C}`][C].one.memberIds.includes('a') &&
    candidates[1][`store:orgNodes:${C}`][C].two.memberIds.includes('b'));

  await new Promise(resolve => server.close(resolve));
  console.log(`\ntree-mutation-serialization-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.log('  FAIL unexpected exception:', err && err.message);
  process.exit(1);
});
