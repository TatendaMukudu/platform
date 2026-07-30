/* Truth layer — "HOW'S THE TEAM DOING?" (HTTP). Proves the conversational assistant answers
   a team-status question from the REASONER's already-scoped read (the same grounded picture
   the Today voice shows) instead of the old "I don't have enough authorised evidence" dead
   end. Grounded, never invented; a compound message ("feeling a little down, how's the team
   doing?") still offers the personal check-in AND answers the team question. Boots the real
   app (DB_OPTIONAL). Run: node scripts/assistant-team-status-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'askh', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
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
    { id: 'joe::momentum_drop', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk',
      claim: "Joe's momentum has been running below his own normal.",
      support: [ { id: 'j1', t: d(9), severity: 'medium', basis: 'x' }, { id: 'j2', t: d(5), severity: 'medium', basis: 'x' }, { id: 'j3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1), whatWouldConfirm: 'x', whatWouldRefute: 'y' },
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const turn = (who, text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: { Authorization: `Bearer ${issueToken(who, C, orgUsers(who))}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then(r => r.json());
  function orgUsers(id) { return id === 'joe' ? 'member' : 'coach'; }

  try {
    /* 1 — a leader asks how the team is doing → the reasoner's read, not a dead end */
    const r1 = await turn('coachA', "feeling a little down, how's the team doing?");
    const s1 = JSON.stringify(r1);
    ok('1 · the assistant answers a team-status question from the reasoner\'s read', /Joe's momentum has been running below/.test(s1));
    ok('1 · …NOT the old "not enough authorised evidence" dead end', !/enough authorised evidence/.test(s1));

    /* 2 — the compound message still offers the personal check-in (both intents honoured) */
    ok('2 · the personal disclosure still offers to log a check-in / private note', /checkin_log|private_note/.test(s1));

    /* 3 — a team-status question with a calm picture answers honestly (not "no evidence") */
    const r3 = await turn('solo', "how are we doing?");
    const s3 = JSON.stringify(r3);
    ok('3 · a steady team gets an honest read, never "not enough authorised evidence"', !/enough authorised evidence/.test(s3) && /"(answer|text)":"[^"]+"/.test(s3));

    /* 4 — leak-safe: teamB's leader never hears teamA's person in the answer */
    ok('4 · a sibling-branch leader\'s team answer never names another branch\'s person', !/Joe's momentum/.test(s3));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nassistant-team-status-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
