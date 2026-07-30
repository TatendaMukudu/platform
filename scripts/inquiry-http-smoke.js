/* Truth layer — AUTONOMOUS INQUIRY (HTTP). Proves the system proactively ASKS its own
   governed questions instead of quietly reasoning off going-stale knowledge: an expired
   shared record surfaces a non-leading "is this still current?" question routed to its
   owner, while a merely-aging record stays QUIET (never-nag). Leader-gated + scoped; a
   "not now" dismissal stands the question down (cooldown) so it's never repeated.
   Boots the real app (DB_OPTIONAL). Run: node scripts/inquiry-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'inqh', DAY = 86400000;
const expired = new Date(Date.now() - 800 * DAY).toISOString();  // well past its useful life
const aging   = new Date(Date.now() - 40 * DAY).toISOString();   // past half-life but not expired

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'I', orgMode: 'business' } },
  orgUsers: { [C]: {
    boss: { id: 'boss', name: 'Bo',  role: 'superadmin', orgCode: C, status: 'active' },
    ana:  { id: 'ana',  name: 'Ana', role: 'member',     orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: { t: { nodeId: 't', parentId: null, leaderIds: ['boss'], memberIds: ['ana'] } } },
  evidenceLog: { [C]: [
    { id: 'e1', org: C, status: 'active', type: 'goal',       attributes: { category: 'goal' },       subjectId: 'ana', label: 'Ana Q3 objective', value: 'grow', confidence: 'medium', observedAt: expired, retrievedAt: expired, source: 'reported', provider: 'user' },
    { id: 'e2', org: C, status: 'active', type: 'assessment', attributes: { category: 'assessment' }, subjectId: 'ana', label: 'Skills review',   value: '3',    confidence: 'high',   observedAt: aging,   retrievedAt: aging,   source: 'reported', provider: 'user' },
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const bossTok = issueToken('boss', C, 'superadmin');
  const anaTok  = issueToken('ana', C, 'member');
  const pending = (tok) => fetch(base + '/api/inquiry/pending', { headers: { Authorization: `Bearer ${tok}` } });

  try {
    /* 1 — the system proactively surfaces a governed question about knowledge going stale */
    const p1 = await (await pending(bossTok)).json();
    ok('1 · the system raises a proactive question of its own', p1.ok && p1.count === 1);
    const q = (p1.questions || [])[0] || {};
    ok('1 · …a non-leading "still current?" confirm, routed to the record\'s owner', /still current/i.test(q.question) && q.owner === 'Ana');

    /* 2 — NEVER-NAG: a merely-aging record does NOT become a question (only the expired one did) */
    ok('2 · a record that is aging but not expired stays quiet (never nag)', p1.count === 1 && q.id === 'stale_e1');

    /* 3 — leader-gated: a plain member is not asked to arbitrate the org's knowledge */
    ok('3 · a plain member cannot pull the proactive questions (403)', (await pending(anaTok)).status === 403);

    /* 4 — "not now" stands the question down (cooldown) so it's never repeated */
    const dis = await (await fetch(base + `/api/inquiry/${q.id}/dismiss`, { method: 'POST', headers: { Authorization: `Bearer ${bossTok}`, 'Content-Type': 'application/json' }, body: '{}' })).json();
    ok('4 · dismissing records a cooldown', dis.ok && dis.dismissed === q.id && new Date(dis.until).getTime() > Date.now());
    const p2 = await (await pending(bossTok)).json();
    ok('4 · …and the dismissed question no longer surfaces (no nagging)', p2.ok && !(p2.questions || []).some(x => x.id === q.id));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\ninquiry-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
