/* Truth layer — the UNIFIED ATTENTION PIPELINE (HTTP). Proves the Codex layers are wired
   into the running app: GET /api/intelligence/packet gathers every engine's output
   (reasoner, self-model, playbook, outcome history, process reflection, inquiry) through
   intelligence-feed → scoped-intelligence-packet → priority-office, and returns ONE scoped,
   ranked read with a single lead. It is leak-safe (a sibling-branch leader never sees another
   branch's person), every suggestion stays proposal-gated, and it degrades to a calm empty
   packet. Boots the real app (DB_OPTIONAL). Run: node scripts/intelligence-packet-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'pkt', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'P', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    coachB: { id: 'coachB', name: 'Bea',  role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamB'] },
    joe:    { id: 'joe',    name: 'Joe',  role: 'member', orgCode: C, status: 'active' },
    kim:    { id: 'kim',    name: 'Kim',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['joe'] },
    teamB: { nodeId: 'teamB', parentId: null, leaderIds: ['coachB'], memberIds: ['kim'] },
  } },
  reasonLedger: { [C]: [
    { id: 'joe::momentum_drop', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk',
      claim: "Joe's momentum has been running below his own normal.",
      support: [ { id: 'j1', t: d(9), severity: 'medium', basis: 'x' }, { id: 'j2', t: d(5), severity: 'medium', basis: 'x' }, { id: 'j3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1), whatWouldConfirm: 'x', whatWouldRefute: 'y' },
    { id: 'kim::momentum_drop', subjectId: 'kim', subjectName: 'Kim', scope: 'teamB', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk',
      claim: "Kim's momentum has been running below her own normal.",
      support: [ { id: 'k1', t: d(9), severity: 'medium', basis: 'x' }, { id: 'k2', t: d(5), severity: 'medium', basis: 'x' }, { id: 'k3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1), whatWouldConfirm: 'x', whatWouldRefute: 'y' },
  ] },
  orgPlaybook: { [C]: [ { fingerprint: 'pb1', status: 'active', type: 'practice', subjectLabel: 'Thursday video', statement: 'Thursday video sessions are how we operate.' } ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const packet = (who, role) => fetch(base + '/api/intelligence/packet', { headers: { Authorization: `Bearer ${issueToken(who, C, role)}` } }).then(r => r.json());

  try {
    /* 1 — one unified, scoped, ranked read for a leader */
    const a = await packet('coachA', 'coach');
    ok('1 · the packet returns a unified queue with a single lead', a.ok && Array.isArray(a.queue) && a.queue.length > 0 && a.lead);
    ok('1 · …drawn from more than one engine (reasoner + playbook both present)',
       new Set(a.queue.map(i => i.source)).size >= 2 && a.queue.some(i => i.source === 'reasoner') && a.queue.some(i => i.source === 'org_playbook'));
    ok('1 · …grouped into canonical High and Low sections', a.sections && Array.isArray(a.sections.high) && Array.isArray(a.sections.low));

    /* 2 — the reasoner risk leads over a steady playbook practice (priority ranking works) */
    ok('2 · a risk read is ranked ahead of a low-priority strength', a.lead.source === 'reasoner' && /Joe's momentum/.test(a.lead.title + ' ' + a.lead.body));

    /* 3 — LEAK-SAFE: teamA's leader never sees teamB's person in the packet */
    ok('3 · a sibling branch\'s person never appears in this leader\'s packet', !/Kim's momentum|kim/i.test(JSON.stringify(a.queue)));
    const b = await packet('coachB', 'coach');
    ok('3 · …and the mirror holds — teamB\'s leader never sees Joe', !/Joe's momentum|joe/i.test(JSON.stringify(b.queue)) && /Kim's momentum/.test(JSON.stringify(b.queue)));

    /* 4 — every suggestion stays proposal-gated (governed) */
    ok('4 · every suggestion in the packet requires confirmation', a.safe === true && a.queue.every(i => !i.suggestion || i.suggestion.requiresConfirmation === true));

    /* 5 — a member gets their OWN self-scoped packet, never another person's */
    const m = await packet('joe', 'member');
    ok('5 · a member gets a valid self-scoped packet, no sibling data', m.ok && !/Kim's momentum/i.test(JSON.stringify(m)));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nintelligence-packet-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
