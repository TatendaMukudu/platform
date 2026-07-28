/* Truth layer — the GROUNDED REPORT over HTTP. Proves the artifact endpoint assembles a
   real report from the reasoner + confirmed playbook, renders print-ready HTML whose every
   line shows its source, carries the honesty footer, and is leader-gated. Boots the real app
   (DB_OPTIONAL). Run: node scripts/report-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'repa', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'R', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    joe:    { id: 'joe',    name: 'Joe',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['joe'] },
  } },
  reasonLedger: { [C]: [
    { id: 'joe::momentum_drop', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk',
      claim: "Joe's momentum has been running below his own normal.",
      support: [ { id: 'j1', t: d(9), severity: 'medium', basis: 'x' }, { id: 'j2', t: d(5), severity: 'medium', basis: 'x' }, { id: 'j3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1),
      whatWouldConfirm: 'more of the same', whatWouldRefute: 'a return toward normal' },
  ] },
  orgPlaybook: { [C]: [
    { fingerprint: 'pb1', status: 'active', statement: 'Thursday video sessions are how we operate.', confirmedBy: 'coachA' },
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { coachA: issueToken('coachA', C, 'coach'), joe: issueToken('joe', C, 'member') };
  const get = async who => { const r = await fetch(base + '/api/report/team', { headers: { Authorization: `Bearer ${tok[who]}` } }); return { status: r.status, ct: r.headers.get('content-type') || '', body: await r.text() }; };

  try {
    const rpt = await get('coachA');
    /* ── 1 · it's a self-contained HTML document ── */
    ok('1 · the report is served as a self-contained HTML document', rpt.status === 200 && /text\/html/.test(rpt.ct) && /^<!doctype html>/i.test(rpt.body) && !/https?:\/\//.test(rpt.body));

    /* ── 2 · grounded from the reasoner — the belief AND its source appear ── */
    ok('2 · a reasoner belief is rendered as a grounded fact', /Joe's momentum has been running below/.test(rpt.body) && /reasoner · emerging/.test(rpt.body));

    /* ── 3 · grounded from the confirmed playbook ── */
    ok('3 · a confirmed practice appears with its source', /Thursday video sessions/.test(rpt.body) && /playbook · confirmed practice/.test(rpt.body));

    /* ── 4 · the honesty footer is present ── */
    ok('4 · the report states nothing is invented or predicted', /nothing here is invented or predicted/.test(rpt.body));

    /* ── 5 · leader-gated ── */
    const member = await get('joe');
    ok('5 · a plain member cannot pull the team report (403)', member.status === 403);
    ok('5 · …and gets no team content in the refusal', !/Joe's momentum|Thursday video/.test(member.body));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nreport-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
