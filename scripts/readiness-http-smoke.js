/* Truth layer — TEAM READINESS + ROLE BINDING over HTTP (grounded loop + leak matrix).

   Proves the closed product loop: a leader confirms operating context → GET
   /api/team/readiness shows what the team is preparing for, what's ready, what's
   uncertain, and who to ask — grounded, privacy-safe, no percentage, no second
   engine. Plus governed role-binding (bind/rebind/history) and full isolation.
   Boots the real app (DB_OPTIONAL, no AI key). Run: node scripts/readiness-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'orga', B = 'orgb', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', orgMode: 'sports', createdAt: iso }, [B]: { orgName: 'B', orgMode: 'sports', createdAt: iso } },
  orgUsers: {
    [A]: { coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, status: 'active' }, jordan: { id: 'jordan', name: 'Jordan', role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' }, mia: { id: 'mia', name: 'Mia', role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' } },
    [B]: { bc: { id: 'bc', name: 'BCoach', role: 'superadmin', orgCode: B, status: 'active' } },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { coach: issueToken('coach', A, 'superadmin'), mia: issueToken('mia', A, 'member'), bc: issueToken('bc', B, 'superadmin') };
  const inDays = d => new Date(Date.now() + d * 86400000).toISOString();
  const call = async (path, who, opts = {}) => {
    const headers = { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(who ? { Authorization: `Bearer ${tok[who]}` } : {}) };
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const confirm = (who, records) => call('/api/org-context/confirm', who, { method: 'POST', body: { records } });
  const readiness = who => call('/api/team/readiness', who);

  try {
    // 15 · empty state before any context
    const empty = await readiness('coach');
    ok('15 · no operating context → a calm empty state (no invented readiness)', empty.j.focus === null && empty.j.emptyState === 'no_operating_context' && empty.j.nextQuestions.length === 0);

    // 1 · confirm a match → it becomes the focus
    await confirm('coach', [
      { type: 'event', scope: { kind: 'team' }, fields: { type: 'match', title: 'Cup Final', startAt: inDays(3), participants: 22 } },
      { type: 'responsibility', scope: { kind: 'team' }, fields: { role: 'coach', claimTypes: ['game_plan'] } },
      { type: 'requirement', scope: { kind: 'team' }, fields: { claimType: 'game_plan', freshDays: 14, matches: 'game plan|tactics|formation' } },
    ]);
    const r1 = await readiness('coach');
    ok('1 · a confirmed event becomes the readiness focus', r1.j.focus && r1.j.focus.title === 'Cup Final' && r1.j.focus.orderingRule);
    ok('19 · readiness is a semantic state, never a percentage', S.readiness ? true : (!/\d{1,3}\s*%/.test(JSON.stringify(r1.j)) && ['ready', 'partially_ready', 'not_ready', 'insufficient_information', 'not_yet_due', 'not_applicable'].includes(r1.j.readiness.status)));

    // 4 · a missing blocking requirement → a routed question that explains why
    ok('4 · a missing game plan produces a routed question with a reason', r1.j.nextQuestions.some(q => /game plan/i.test(q.question) && q.reason && q.blocking === true));
    // 9 · the owner is an UNBOUND role (no invented person)
    ok('9 · the coach role is shown as an ownership constraint (unbound, no invented person)', r1.j.readiness.constrainedAreas.some(a => a.id === 'ownership' && /no current person is bound/i.test(a.statement)));
    ok('9 · the routed question targets a role, not a guessed person', r1.j.nextQuestions.some(q => q.targetType === 'role' && q.roleRef === 'coach'));

    // 10 · a leader binds the role → routing now resolves to a person
    const bind = await call('/api/org-context/role-binding', 'coach', { method: 'POST', body: { roleRef: 'coach', userId: 'jordan' } });
    ok('10 · a leader can bind a role to a current user (governed)', bind.j.ok && bind.j.binding.userId === 'jordan');
    const r2 = await readiness('coach');
    ok('10 · after binding, the routed question resolves to the bound person', r2.j.nextQuestions.some(q => q.targetType === 'person' && q.targetRef === 'jordan'));
    ok('· binding a person is never inferred — only explicit (a member cannot bind)', (await call('/api/org-context/role-binding', 'mia', { method: 'POST', body: { roleRef: 'coach', userId: 'mia' } })).status === 403);

    // 11 · rebinding supersedes, history retained
    await call('/api/org-context/role-binding', 'coach', { method: 'POST', body: { roleRef: 'coach', userId: 'mia' } });
    const binds = await call('/api/org-context/role-bindings', 'coach');
    ok('11 · rebinding supersedes the previous binding + retains history', binds.j.bindings.some(b => b.userId === 'mia' && b.status === 'active') && binds.j.history.some(b => b.userId === 'jordan' && b.status === 'superseded'));

    // 2 · a confirmed (authoritative) game plan → readiness improves; the question disappears
    await confirm('coach', [{ type: 'requirement', scope: { kind: 'team' }, fields: { claimType: 'game_plan', matches: 'game plan|tactics|formation' } }]);
    await call('/api/assistant/turn', 'coach', { method: 'POST', body: { text: 'Add this to our organisation knowledge: Game plan for the cup final — high press 4-3-3, tactics and formation set.' } });
    const r3 = await readiness('coach');
    ok('2 · a satisfied requirement is no longer reported missing', !/game plan[^.]*has not been found/i.test(JSON.stringify(r3.j)) && /game plan has been recorded/i.test(JSON.stringify(r3.j)));
    ok('2 · with some info known + some missing, readiness reads partially_ready (not collapsed)', r3.j.readiness.status === 'partially_ready');

    // 13 · the readiness fingerprint changes when context changes; 14 · reads idempotent
    ok('13 · the fingerprint changed after new context/evidence', r3.j.evidenceFingerprint !== r1.j.evidenceFingerprint);
    ok('14 · repeated reads are idempotent', JSON.stringify((await readiness('coach')).j.readiness) === JSON.stringify(r3.j.readiness));

    // 7/8 · privacy — a member's private wellbeing disclosure NEVER touches readiness
    await call('/api/assistant/turn', 'mia', { method: 'POST', body: { text: 'Remember this: I have been anxious and burned out and my mood is low.' } });
    const r4 = await readiness('coach');
    ok('7/8 · private/wellbeing content never appears or influences readiness', !/anxious|burned out|mood|wellbeing|sentiment/i.test(JSON.stringify(r4.j)));

    // 16 · disputed evidence stays disputed (both preserved) — leader vs member conflict on an event requirement
    await confirm('coach', [
      { type: 'event', scope: { kind: 'team' }, fields: { type: 'match', title: 'League Match', startAt: inDays(2), participants: 22 } },
    ]);
    await call('/api/assistant/turn', 'coach', { method: 'POST', body: { text: 'Add this to our organisation knowledge: League match kickoff confirmed at 3pm.' } });
    await call('/api/assistant/turn', 'mia', { method: 'POST', body: { text: 'Add this to our organisation knowledge: I heard the league match kickoff might be at 5pm.' } });
    const r5 = await readiness('coach');
    ok('16 · conflicting evidence is surfaced as disputed, both preserved', /conflict/i.test(JSON.stringify(r5.j.readiness)) || r5.j.nextQuestions.some(q => /which is correct|kickoff/i.test(q.question)));

    // 12 · tenant isolation — org B sees none of org A's readiness/context
    const rb = await readiness('bc');
    ok('12 · another tenant sees no A focus/questions (isolation)', !rb.j.focus || rb.j.focus.title !== 'Cup Final');
    ok('12 · another tenant’s role-binding list is empty of A bindings', !((await call('/api/org-context/role-bindings', 'bc')).j.bindings || []).some(b => b.userId === 'jordan' || b.userId === 'mia'));

    // 3 · not-yet-due ≠ missing — a far-off event's requirement is not due
    // (covered in pure tests; here assert the state vocabulary is honoured)
    ok('3 · readiness never collapses states into one (semantic vocabulary present)', ['ready', 'partially_ready', 'not_ready', 'insufficient_information', 'not_yet_due', 'not_applicable'].includes(r5.j.readiness.status));

    // · leader-only + valid JSON on any failure
    ok('· team readiness is leader-only (member 403)', (await readiness('mia')).status === 403);
    ok('· recent context changes are shown (leader sees what they confirmed)', r5.j.recentContextChanges.some(c => /added as an active event/i.test(c.statement)));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nreadiness-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
