/* Truth layer — PERSON-SCOPED READ + PATTERNS + SUMMARISE (HTTP). Locks in the fix for the
   live report where the overview named a person ("Tomas has been pulling back") but a direct
   "pull up their profile" dead-ended, "what patterns have you learnt" just replayed the
   overview, and "summarise the org / make sense of the data" hit "not enough authorised
   evidence". A person read draws ONLY from what the reasoner holds about that named person,
   and ONLY if the asker may see them (leak-safe); it never fabricates a dossier. Boots the
   real app (DB_OPTIONAL). Run: node scripts/assistant-person-read-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'pr', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Atlas Robotics', orgMode: 'business' } },
  orgUsers: { [C]: {
    dana:  { id: 'dana',  name: 'Dana Cole',   role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    tomas: { id: 'tomas', name: 'Tomas Vidal',  role: 'member', orgCode: C, status: 'active' },
    other: { id: 'other', name: 'Priya Anand',  role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamB'] },
    remo:  { id: 'remo',  name: 'Remo Fenn',    role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['dana'],  memberIds: ['tomas'] },
    teamB: { nodeId: 'teamB', parentId: null, leaderIds: ['other'], memberIds: ['remo'] },
  } },
  reasonLedger: { [C]: [
    { id: 'tomas::momentum_drop', subjectId: 'tomas', subjectName: 'Tomas Vidal', scope: 'teamA', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk', register: 'support',
      claim: 'Tomas Vidal has been pulling back from their own normal.',
      support: [ { id: 't1', t: d(9), severity: 'medium', basis: 'x' }, { id: 't2', t: d(5), severity: 'medium', basis: 'x' }, { id: 't3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1), whatWouldConfirm: 'x', whatWouldRefute: 'y' },
    { id: 'remo::momentum_drop', subjectId: 'remo', subjectName: 'Remo Fenn', scope: 'teamB', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk', register: 'support',
      claim: 'Remo Fenn has been pulling back from their own normal.',
      support: [ { id: 'r1', t: d(8), severity: 'medium', basis: 'x' }, { id: 'r2', t: d(4), severity: 'high', basis: 'x' }, { id: 'r3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: false, firstSeen: d(8), lastSeen: d(1), whatWouldConfirm: 'x', whatWouldRefute: 'y' },
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const turn = (who, text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: { Authorization: `Bearer ${issueToken(who, C, who === 'tomas' || who === 'remo' ? 'member' : 'coach')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then(r => r.json());
  const s = r => JSON.stringify(r);

  try {
    /* 1 — the exact live failure: overview names Tomas, so a direct profile pull must answer
           from what the reasoner holds about Tomas — never the old dead end. */
    for (const q of ["Can you pull up Tomas Vidal's profile?", 'how is Tomas doing', 'tell me about Tomas']) {
      const r = await turn('dana', q);
      ok(`1 · "${q}" answers with Tomas's grounded read`, /Tomas.*pulling back|pulling back.*Tomas/i.test(s(r)) && !/enough authorised evidence/.test(s(r)));
    }

    /* 2 — LEAK-SAFE: a sibling-branch leader asking about Tomas is declined, never shown his read */
    const leak = await turn('other', 'pull up Tomas Vidal profile');
    ok('2 · a leader outside Tomas\'s area never sees his read', !/pulling back from their own normal/i.test(s(leak)) && /isn'?t in your area/i.test(s(leak)));

    /* 3 — an in-scope person with NOTHING recorded is answered honestly, not invented */
    const empty = await turn('other', 'how is Remo doing');
    ok('3 · Priya (Remo\'s leader) gets Remo\'s real read', /Remo.*pulling back|pulling back.*Remo/i.test(s(empty)));

    /* 4 — "what patterns have you learnt" no longer replays the overview and never dead-ends */
    const pat = await turn('dana', 'what patterns have you learnt');
    ok('4 · a patterns question answers (grounded), never "not enough authorised evidence"', !/enough authorised evidence/.test(s(pat)) && /"(answer|text)":"[^"]+"/.test(s(pat)));

    /* 5 — "summarise the org / make sense of the data" reaches the grounded read, not a dead end */
    for (const q of ['summarise the organisation and document your findings', 'make sense of the data and summarise it']) {
      const r = await turn('dana', q);
      ok(`5 · "${q.slice(0, 32)}…" reaches the grounded read`, !/enough authorised evidence/.test(s(r)) && /"(answer|text)":"[^"]+"/.test(s(r)));
    }

    /* 6 — an UNKNOWN name is never invented: no fabricated profile for someone who isn't here */
    const unknown = await turn('dana', 'pull up Jordan Michaelson profile');
    ok('6 · an unknown name is never fabricated into a profile', !/pulling back/i.test(s(unknown)));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nassistant-person-read-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
