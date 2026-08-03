/* Truth layer — THE CHAT ACTUALLY WORKS (HTTP). Locks in the fixes for the "why isn't chat
   working" report: an org/team question is never met with a bare "not enough authorised
   evidence" dead end when the reasoner has a read (outstanding / who needs support / are we
   ready / tell me about the org all answer from the grounded read); a greeting gets a warm,
   human reply; and a PURE question is never met with "save as note / log a check-in" cards —
   while a genuine disclosure ("feeling flat") still offers the check-in. Boots the real app
   (DB_OPTIONAL). Run: node scripts/assistant-chat-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'chat', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Trafford United FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    boss: { id: 'boss', name: 'Alex', role: 'superadmin', orgCode: C, status: 'active' },
    joe:  { id: 'joe',  name: 'Joe',  role: 'member',     orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: { teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['boss'], memberIds: ['joe'] } } },
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
  const tok = issueToken('boss', C, 'superadmin');
  const turn = (text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then(r => r.json());
  const cards = r => ((r.response && r.response.proposedActions) || []).map(p => p.actionType);
  const reply = r => (r.response && r.response.responseText) || '';

  try {
    /* 1 — the questions that dead-ended live now answer from the reasoner's read */
    for (const q of ['what\'s outstanding', 'who needs support right now', 'tell me about the organisation', 'are we ready for the weekend', 'how is the organization doing']) {
      const r = await turn(q);
      ok(`1 · "${q}" answers from the read, no dead end`, !/enough authorised evidence/.test(reply(r)) && reply(r).length > 20);
    }

    /* 2 — a greeting gets a warm, human reply (not a flat "Noted." and not a dead end) */
    const hi = await turn('hi');
    ok('2 · "hi" gets a warm greeting with a way in', /morning|afternoon|evening|hello|hi\b/i.test(reply(hi)) && /would you like/i.test(reply(hi)));
    ok('2 · …and a greeting offers no "save as note" / check-in cards', !cards(hi).includes('capture') && !cards(hi).includes('checkin_log'));

    /* 3 — a PURE question never gets "save as note" / "log a check-in" cards */
    const pq = await turn("what's outstanding");
    ok('3 · a pure question offers no note / check-in card', !cards(pq).includes('capture') && !cards(pq).includes('checkin_log'));

    /* 4 — a genuine DISCLOSURE still offers the check-in (we didn't over-suppress) */
    const disc = await turn('feeling a bit flat today, not sure why');
    ok('4 · a personal disclosure still offers to log a check-in', cards(disc).includes('checkin_log') || /check-in/i.test(reply(disc)));

    /* 5 — a genuine knowledge question with no evidence still says so honestly (no fabrication) */
    const kn = await turn('what is the capital of France');
    ok('5 · an off-topic knowledge question is answered honestly, never fabricated', /enough authorised evidence|don'?t (?:have|know)|can'?t/i.test(reply(kn)));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nassistant-chat-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
