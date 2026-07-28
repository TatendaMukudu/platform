/* Truth layer — the SELF-MODEL over HTTP. Proves the boundary: observing only records
   allow-listed patterns (surveillance is quietly ignored); an established habit surfaces as
   a proposal-gated accommodation; accept applies it (returns the setting) and stops
   proposing; reject stands it down; feedback is validated; and one person's self-model is
   PRIVATE — another user never sees it. Boots the real app (DB_OPTIONAL).
   Run: node scripts/self-model-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'selfa', DAY = 86400000, today = Math.floor(Date.now() / DAY);
const dayNums = [today - 1, today - 2, today - 4];

_loadAllStores({
  orgMeta: { [C]: { orgName: 'S', orgMode: 'sports' } },
  orgUsers: { [C]: {
    userA: { id: 'userA', name: 'Ada', role: 'coach', orgCode: C, status: 'active' },
    userB: { id: 'userB', name: 'Ben', role: 'coach', orgCode: C, status: 'active' },
  } },
  // Ada already has two established habits (3 distinct recent days each).
  selfModelLedger: {
    [`${C}:userA`]: [
      { id: "opens_view:Marcus's graph", pattern: 'opens_view', label: "Marcus's graph", days: dayNums, firstSeen: dayNums[2] * DAY, lastSeen: dayNums[0] * DAY },
      { id: 'own_work_first:', pattern: 'own_work_first', label: '', days: dayNums, firstSeen: dayNums[2] * DAY, lastSeen: dayNums[0] * DAY },
    ],
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { userA: issueToken('userA', C, 'coach'), userB: issueToken('userB', C, 'coach') };
  const H = who => ({ Authorization: `Bearer ${tok[who]}`, 'Content-Type': 'application/json' });
  const patterns = async who => (await fetch(base + '/api/self/patterns', { headers: H(who) })).json();
  const observe = async (who, body) => (await fetch(base + '/api/self/observe', { method: 'POST', headers: H(who), body: JSON.stringify(body) })).json();
  const feedback = async (who, id, response) => { const r = await fetch(base + `/api/self/${encodeURIComponent(id)}/feedback`, { method: 'POST', headers: H(who), body: JSON.stringify({ response }) }); return { status: r.status, j: await r.json() }; };

  try {
    /* ── 1 · established habits surface as proposal-gated accommodations ── */
    const a = await patterns('userA');
    const p = (a.proposals || []).find(x => x.habitId === "opens_view:Marcus's graph");
    ok('1 · an established habit is offered as an accommodation, naming it', a.ok && p && p.requiresConfirmation === true && /Marcus's graph/.test(p.text));
    ok('1 · the person can see everything it has learned about them (transparency)', (a.learned || []).length === 2);

    /* ── 2 · observing only learns allow-listed patterns ── */
    ok('2 · a non-learnable pattern is quietly ignored', (await observe('userA', { pattern: 'keystroke_timing', label: 'x' })).ignored === true);
    ok('2 · an allow-listed observation is accepted', (await observe('userA', { pattern: 'readiness_first' })).ok === true);

    /* ── 3 · accept applies the accommodation (returns the setting) and stops proposing ── */
    const acc = await feedback('userA', "opens_view:Marcus's graph", 'accept');
    ok('3 · accepting returns the setting to apply', acc.j.ok === true && acc.j.setting === 'pin_view');
    const a2 = await patterns('userA');
    ok('3 · an accepted habit is no longer proposed (but still shown as accepted)', !(a2.proposals || []).some(x => x.habitId === "opens_view:Marcus's graph") && (a2.learned || []).some(l => l.status === 'accepted'));

    /* ── 4 · reject stands a habit down ── */
    await feedback('userA', 'own_work_first:', 'reject');
    ok('4 · a rejected habit is no longer proposed', !((await patterns('userA')).proposals || []).some(x => x.habitId === 'own_work_first:'));

    /* ── 5 · feedback is validated ── */
    ok('5 · an invalid response is refused (400)', (await feedback('userA', 'own_work_first:', 'lol')).status === 400);
    ok('5 · feedback on an unknown habit is a 404', (await feedback('userA', 'nope:nope', 'accept')).status === 404);

    /* ── 6 · a self-model is PRIVATE — another user never sees it ── */
    const b = await patterns('userB');
    ok('6 · a different person sees none of Ada\'s habits', b.ok && (b.proposals || []).length === 0 && (b.learned || []).length === 0);
    ok('6 · nothing about Ada leaks to Ben', !/Marcus|userA|Ada/i.test(JSON.stringify(b)));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nself-model-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
