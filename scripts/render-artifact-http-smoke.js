/* Truth layer — GOVERNED RENDER/PRESENT (HTTP). Proves the output interface is wired and safe:
   POST /api/artifact/render returns a confirm-gated DRAFT (nothing is sent), composed from the
   reader's own scoped, grounded data (leak-safe); with no model it degrades to a truthful plain
   draft drawn straight from the recorded read — never a fabricated figure. Boots the real app
   (DB_OPTIONAL). Run: node scripts/render-artifact-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; // force the deterministic draft path

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'ra', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Trafford United FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Pablo', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    joe:    { id: 'joe',    name: 'Joe',   role: 'member', orgCode: C, status: 'active' },
    solo:   { id: 'solo',   name: 'Sol',   role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamB'] },
  } },
  orgNodes: { [C]: {
    teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['joe'] },
    teamB: { nodeId: 'teamB', parentId: null, leaderIds: ['solo'],  memberIds: [] },
  } },
  reasonLedger: { [C]: [
    { id: 'joe::momentum_drop', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk', register: 'support',
      claim: "Joe's momentum has been running below his own normal.",
      support: [ { id: 'j1', t: d(9), severity: 'medium', basis: 'x' }, { id: 'j2', t: d(5), severity: 'medium', basis: 'x' }, { id: 'j3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1), whatWouldConfirm: 'x', whatWouldRefute: 'y' },
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const render = (who, body) => fetch(base + '/api/artifact/render', { method: 'POST', headers: { Authorization: `Bearer ${issueToken(who, C, who === 'joe' ? 'member' : 'coach')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

  try {
    /* 1 — a summary draft is composed from the leader's own grounded read */
    const r = await render('coachA', { format: 'summary', intent: 'summarise where my team is' });
    ok('1 · a draft is returned and is confirm-gated (nothing is sent)', r.ok && r.draft && r.confirmationRequired === true && r.delivered === false);
    ok('1 · the draft is drawn from the recorded read (names the grounded claim)', /Joe's momentum has been running below/.test(r.draft.body));

    /* 2 — with no model it degrades honestly to a truthful factual draft */
    ok('2 · no model → honest deterministic draft, never a fabricated figure', r.enabled === false && /plain, factual|straight from your data/i.test(r.note || ''));

    /* 3 — email format carries a subject line */
    const e = await render('coachA', { format: 'email', intent: 'email the parents an update' });
    ok('3 · an email draft carries a subject line', e.draft && /^Subject:/m.test(e.draft.body));
    ok('3 · …and is still only a draft (delivered:false — outbound stays policy-gated)', e.delivered === false && e.confirmationRequired === true);

    /* 4 — LEAK-SAFE: a sibling-branch leader's draft never contains another branch's person */
    const leak = await render('solo', { format: 'summary', intent: 'summary' });
    ok('4 · a sibling-branch leader\'s draft never names another branch\'s person', !/Joe's momentum/.test(JSON.stringify(leak)));

    /* 5 — an unknown format falls back to summary (never errors) */
    const bad = await render('coachA', { format: 'hologram' });
    ok('5 · an unsupported format falls back to a summary draft (no crash)', bad.ok && bad.draft && bad.draft.format === 'summary');
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nrender-artifact-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
