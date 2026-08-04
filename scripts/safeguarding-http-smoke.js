/* Truth layer — SAFEGUARDING (HTTP), with the model OFF. Proves the duty of care is wired end
   to end and does NOT depend on the LLM: a crisis message short-circuits the turn (no
   reasoning, no capture card) into a warm, honest response WITH real resources; a flag routes
   to the safeguarding lead; only the lead can see/resolve the queue; ordinary football talk is
   untouched. Boots the real app (DB_OPTIONAL). Run: node scripts/safeguarding-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; // safety must not need a model

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'sg';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Trafford United FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    director: { id: 'director', name: 'Dana Cole', role: 'superadmin', orgCode: C, status: 'active' },
    joe:      { id: 'joe',      name: 'Joe Reed',  role: 'member',     orgCode: C, status: 'active' },
    sam:      { id: 'sam',      name: 'Sam Okafor',role: 'member',     orgCode: C, status: 'active' },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (who) => ({ Authorization: `Bearer ${issueToken(who, C, who === 'director' ? 'superadmin' : 'member')}`, 'Content-Type': 'application/json' });
  const turn = (who, text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H(who), body: JSON.stringify({ text }) }).then(r => r.json());
  const get = (who, p) => fetch(base + p, { headers: H(who) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (who, p, b) => fetch(base + p, { method: 'POST', headers: H(who), body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    /* 1 — a CRISIS message gets the duty-of-care response, with the model off */
    const cr = await turn('joe', 'I want to hurt myself, I feel unsafe at home');
    const r = cr.response || {};
    ok('1 · a crisis is handled (mode: safeguarding), never a dead end or a note card', r.mode === 'safeguarding' && (r.proposedActions || []).length === 0);
    ok('1 · …the person is answered with warmth + real crisis resources', /glad you (told|did)|safeguarding lead|999/i.test(r.responseText) && r.safeguarding && r.safeguarding.resources.some(x => /116 123/.test(x.contact)));
    ok('1 · …and it is transparent that a safe adult was told (escalated)', r.safeguarding.escalated === true);

    /* 2 — the flag routes to the safeguarding lead (default: the superadmin) */
    const q = await get('director', '/api/safeguarding/flags');
    ok('2 · the safeguarding lead sees the flag with who + severity', q.j.ok && q.j.openCount >= 1 && q.j.flags.some(f => f.subjectId === 'joe' && f.severity === 'crisis'));

    /* 3 — SELF-only sensitivity: an ordinary member cannot see the queue */
    ok('3 · a non-lead member cannot read the safeguarding queue (403)', (await get('sam', '/api/safeguarding/flags')).status === 403);

    /* 4 — the lead can resolve a flag (a human closed the loop) */
    const fid = q.j.flags.find(f => f.subjectId === 'joe').id;
    const rv = await post('director', `/api/safeguarding/flags/${fid}/resolve`, { note: 'Spoke with Joe and his parents; support in place.' });
    ok('4 · the lead resolves the flag (human accountability recorded)', rv.j.ok && rv.j.flag.status === 'resolved' && rv.j.flag.resolvedBy === 'director');

    /* 5 — ordinary football talk is NEVER treated as a crisis */
    const norm = await turn('joe', "let's kill the tempo and end the game strongly on Saturday");
    ok('5 · ordinary performance talk is not false-flagged', (norm.response || {}).mode !== 'safeguarding');
    ok('5 · …and it produced no new safeguarding flag', (await get('director', '/api/safeguarding/flags')).j.flags.filter(f => f.status === 'open').length === 0);

    /* 6 — the resources are always available so the app can surface real help */
    ok('6 · crisis resources are readable by anyone (help is never gated)', (await get('sam', '/api/safeguarding/config')).j.resources.length >= 3);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nsafeguarding-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
