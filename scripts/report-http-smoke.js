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
  const get = async (who, path = '/api/report/team') => { const r = await fetch(base + path, { headers: { Authorization: `Bearer ${tok[who]}` } }); return { status: r.status, ct: r.headers.get('content-type') || '', cd: r.headers.get('content-disposition') || '', body: await r.text() }; };

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

    /* ── 6 · the CSV EXPORT — the same grounded intelligence as a downloadable spreadsheet ── */
    const csv = await get('coachA', '/api/report/team.csv');
    ok('6 · the .csv path serves a CSV download (attachment, text/csv)', csv.status === 200 && /text\/csv/.test(csv.ct) && /attachment; filename=.*\.csv/.test(csv.cd));
    ok('6 · it carries the SAME grounded facts, each with its source', /Joe's momentum has been running below/.test(csv.body) && /reasoner · emerging/.test(csv.body) && /Section,Fact,Source/.test(csv.body));
    ok('6 · ?format=csv on the base path works too (assistant offer link)', /text\/csv/.test((await get('coachA', '/api/report/team?format=csv')).ct));
    ok('6 · the CSV export is leader-gated exactly like the report', (await get('joe', '/api/report/team.csv')).status === 403);

    /* ── 7 · the per-person DEVELOPMENT RECORD — the artifact a coach hands a player ── */
    const rec = await get('coachA', '/api/report/person/joe');
    ok('7 · a leader who can see the person gets their grounded record', rec.status === 200 && /text\/html/.test(rec.ct) && /Development record — Joe/.test(rec.body));
    ok('7 · …grounded from the reasoner, with the source shown', /Joe's momentum/.test(rec.body) && /reasoner ·/.test(rec.body) && /nothing here is invented or predicted/.test(rec.body));
    const recCsv = await get('coachA', '/api/report/person/joe.csv');
    ok('7 · …and exports as a CSV download too', recCsv.status === 200 && /text\/csv/.test(recCsv.ct) && /attachment; filename=.*record\.csv/.test(recCsv.cd) && /Section,Fact,Source/.test(recCsv.body));
    const own = await get('joe', '/api/report/person/joe');
    ok('7 · a person can pull their OWN development record (self access)', own.status === 200 && /Development record — Joe/.test(own.body));
    const pry = await get('joe', '/api/report/person/coachA');
    ok('7 · a member cannot pull a record for someone they can\'t see (403)', pry.status === 403 && !/momentum|Thursday video/.test(pry.body));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nreport-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
