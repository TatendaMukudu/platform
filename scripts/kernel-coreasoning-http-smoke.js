/* Truth layer — KERNEL CO-REASONING (HTTP). Proves the co-reasoning surface is wired and
   SAFE end to end: it returns a DE-IDENTIFIED aggregate picture (counts + structure) that
   names no individual even though the ledger is full of named beliefs; with no model it
   degrades honestly (the deterministic aggregates are always there, hypotheses need the
   engine); and it is insights/admin-gated. Boots the real app (DB_OPTIONAL).
   Run: node scripts/kernel-coreasoning-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; // force the honest-degrade path

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'kc', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
const users = { boss: { id: 'boss', name: 'Dana Cole', role: 'superadmin', orgCode: C, status: 'active' } };
const nodes = { top: { nodeId: 'top', parentId: null, leaderIds: ['boss'], memberIds: [] } };
const ledger = [];
// Six people, each with a momentum_drop belief — a real repeated pattern, all NAMED in the raw ledger.
const names = ['Tomas Vidal', 'Joe Reed', 'Sam Okafor', 'Priya Anand', 'Leo Marsh', 'Ada Kern'];
names.forEach((nm, i) => {
  const id = 'u' + i;
  users[id] = { id, name: nm, role: 'member', orgCode: C, status: 'active' };
  nodes.top.memberIds.push(id);
  ledger.push({ id: id + '::momentum_drop', subjectId: id, subjectName: nm, scope: 'top', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk', register: 'support',
    claim: `${nm} has been pulling back from their own normal.`,
    support: [ { id: 'a', t: d(6), severity: 'medium', basis: 'x' }, { id: 'b', t: d(2), severity: 'high', basis: 'x' } ],
    counter: [], careFlag: false, firstSeen: d(6), lastSeen: d(2), whatWouldConfirm: 'x', whatWouldRefute: 'y' });
});
users.mia = { id: 'mia', name: 'Mia Stone', role: 'member', orgCode: C, status: 'active' };
nodes.top.memberIds.push('mia');

_loadAllStores({ orgMeta: { [C]: { orgName: 'Atlas Robotics', orgMode: 'business' } }, orgUsers: { [C]: users }, orgNodes: { [C]: nodes }, reasonLedger: { [C]: ledger } });
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (who) => fetch(base + '/api/kernel/coreasoning', { headers: { Authorization: `Bearer ${issueToken(who, C, users[who].role)}` } });

  try {
    const r = await (await get('boss')).json();
    const s = JSON.stringify(r);

    /* 1 — the aggregate picture is derived and counts the repeated pattern */
    ok('1 · aggregates count the pattern kind (momentum_drop × 6)', r.aggregates && r.aggregates.kinds && r.aggregates.kinds.momentum_drop === 6);
    ok('1 · aggregates carry org structure (a team + role counts)', r.aggregates.structure && r.aggregates.structure.teams >= 1 && r.aggregates.structure.roles && r.aggregates.structure.roles.member === 7);
    ok('1 · the repeat surfaces as a confirmed, de-identified pattern', (r.aggregates.confirmedPatterns || []).some(p => p.id === 'pat_momentum_drop' && /across 6 people/.test(p.summary)));

    /* 2 — DE-IDENTIFIED: the co-reasoning payload names NO individual, though the ledger does */
    ok('2 · the response names no individual (Tomas/Joe/Sam… never appear)', !/Tomas|Joe|Sam|Priya|Leo|Ada|Mia|Vidal|Reed|Okafor/.test(s));

    /* 3 — with no model it degrades honestly: aggregates present, hypotheses need the engine */
    ok('3 · no model → enabled:false with an honest note (never fabricates a hypothesis)', r.enabled === false && r.hypotheses.length === 0 && /switched on|needs the reasoning engine/i.test(r.note || ''));

    /* 4 — insights/admin-gated: a plain member cannot read it */
    ok('4 · a plain member cannot read the co-reasoning surface (403)', (await get('mia')).status === 403);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nkernel-coreasoning-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
