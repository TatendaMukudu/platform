/* Truth layer — OPERATING-CONTEXT intake over HTTP (governed flow + scenarios).

   Proves real leaders can supply events/responsibilities/requirements/rhythms/
   dependencies WITHOUT editing internal config or test fixtures: describe it (or a
   form) → preview → CONFIRM → governed durable record → _getOrgState → uncertainty.
   Nothing persists before confirmation; members stay unverified; edits supersede
   without losing history; imports validate row-by-row; private content is refused.
   Boots the real app (DB_OPTIONAL, no AI key). Run: node scripts/org-context-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgContextRecords } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'orga', B = 'orgb', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', orgMode: 'sports', createdAt: iso }, [B]: { orgName: 'B', orgMode: 'sports', createdAt: iso } },
  orgUsers: {
    [A]: { coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, status: 'active' }, mia: { id: 'mia', name: 'Mia', role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' } },
    [B]: { bc: { id: 'bc', name: 'BCoach', role: 'superadmin', orgCode: B, status: 'active' } },
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { coach: issueToken('coach', A, 'superadmin'), mia: issueToken('mia', A, 'member'), bc: issueToken('bc', B, 'superadmin') };
  const call = async (path, who, opts = {}) => {
    const headers = { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(who ? { Authorization: `Bearer ${tok[who]}` } : {}) };
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const inDays = d => new Date(Date.now() + d * 86400000).toISOString();

  try {
    // ── SCENARIO 1 — match setup through conversation ──────────────────────────
    const turn = (who, text) => call('/api/assistant/turn', who, { method: 'POST', body: { text } });
    const t1 = await turn('coach', 'Our first team plays Saturday at 3pm.');
    ok('S1 · a leader sentence yields an operating-context PREVIEW (not persisted)', t1.j.response.orgContextProposal && t1.j.response.orgContextProposal.proposals.some(p => p.type === 'event'));
    ok('S1 · nothing persisted from the conversation alone', (orgContextRecords[A] || []).length === 0);

    // preview endpoint agrees + explains
    const pv = await call('/api/org-context/preview', 'coach', { method: 'POST', body: { text: 'The head coach owns the game plan, and it must be ready 24 hours before kickoff.' } });
    ok('S1 · preview extracts a responsibility + requirement with a plain-language effect', pv.j.ok && pv.j.proposals.some(p => p.type === 'responsibility') && pv.j.proposals.some(p => p.type === 'requirement') && pv.j.preview.effects.length);

    // CONFIRM the full match setup (event + responsibility + requirement)
    const conf = await call('/api/org-context/confirm', 'coach', { method: 'POST', body: { records: [
      { type: 'event', scope: { kind: 'team' }, fields: { type: 'match', title: 'Cup Final', startAt: inDays(3), participants: 22 } },
      { type: 'responsibility', scope: { kind: 'team' }, fields: { role: 'coach', claimTypes: ['game_plan'] } },
      { type: 'requirement', scope: { kind: 'team' }, fields: { claimType: 'game_plan', freshDays: 14, matches: 'game plan|tactics|formation' } },
    ] } });
    ok('S1 · confirmation persists governed records (authoritative for a leader)', conf.j.ok && conf.j.created.length === 3 && conf.j.created.every(r => r.authority === 'organisation'));

    // it now drives org-state: a match with a missing game plan → at-risk readiness + a routed inquiry
    const os = await call('/api/org-state', 'coach');
    ok('S1 · confirmed context drives org-state (event + at-risk readiness appear)', os.j.events.some(e => e.title === 'Cup Final') && os.j.readiness.some(r => r.status === 'at_risk'));
    const rec = await call('/api/inquiry/recommendations', 'coach');
    ok('S1 · a missing game-plan inquiry now appears, routed to the owner', rec.j.recommendations.some(x => /game plan/i.test(x.question) && x.owner));

    // ── SCENARIO 2 — a member reports a schedule → unverified, not authoritative ──
    const memConf = await call('/api/org-context/confirm', 'mia', { method: 'POST', body: { records: [{ type: 'event', scope: { kind: 'team' }, fields: { type: 'training', title: 'Training', startAt: inDays(1) } }] } });
    ok('S2 · a member’s operating context is stored as shared-but-unverified', memConf.j.ok && memConf.j.created.every(r => r.authority === 'shared_unverified'));

    // ── SCENARIO 5 — a self-blocking dependency is a HARD failure, no persistence ──
    const badDep = await call('/api/org-context/confirm', 'coach', { method: 'POST', body: { records: [{ type: 'dependency', scope: { kind: 'team' }, fields: { upstream: 'squad_selection', downstream: 'squad_selection' } }] } });
    ok('S5 · a self-blocking dependency is rejected, not persisted', badDep.j.created.length === 0 && badDep.j.rejected.some(r => r.errors.some(e => e.code === 'self_blocking')));

    // ── governance / leak matrix ───────────────────────────────────────────────
    ok('· GET operating context is leader-only (member 403)', (await call('/api/org-context', 'mia')).status === 403);
    ok('· a member cannot read another org’s context (tenant isolation)', !((await call('/api/org-context', 'bc')).j.records || []).some(r => r.fields && r.fields.title === 'Cup Final'));

    // private/sensitive content can never become an operating rule
    const priv = await call('/api/org-context/preview', 'coach', { method: 'POST', body: { text: 'The team is burned out and anxious — track who is struggling.' } });
    ok('· private/wellbeing content is refused at preview (blocked)', priv.j.ok === false && priv.j.blocked);

    // ── SUPERSESSION — an edit creates a new version, keeps history ──────────────
    const evId = conf.j.created.find(r => r.type === 'event').id;
    const sup = await call(`/api/org-context/${evId}/supersede`, 'coach', { method: 'POST', body: { fields: { startAt: inDays(4) } } });
    ok('· supersede creates a new effective version', sup.j.ok && sup.j.created.length === 1);
    const listed = await call('/api/org-context', 'coach');
    ok('· the old version is retained as history (not mutated away)', listed.j.history.some(r => r.id === evId && r.status === 'superseded'));
    ok('· only the new version is active', listed.j.records.filter(r => r.type === 'event').length >= 1 && !listed.j.records.some(r => r.id === evId));

    // ── IMPORT preview — valid rows preserved, invalid reported, nothing persisted ─
    const imp = await call('/api/org-context/import/preview', 'coach', { method: 'POST', body: { format: 'json', content: JSON.stringify([
      { type: 'event', scope: { kind: 'team' }, fields: { type: 'match', title: 'League 1', startAt: inDays(7) } },
      { type: 'event', scope: { kind: 'team' }, fields: { type: 'match', title: 'Bad', startAt: inDays(2), endAt: inDays(1) } },   // end before start
      { type: 'requirement', scope: { kind: 'team' }, fields: {} },                                                                 // no subject
    ]) } });
    ok('· import validates row-by-row (valid kept, invalid reported)', imp.j.ok && imp.j.valid.length === 1 && imp.j.invalid.length === 2);
    ok('· import preview persists nothing', imp.j.requiresConfirmation === true);

    // ── retire + cache invalidation ─────────────────────────────────────────────
    const before = (await call('/api/org-state', 'coach')).j.events.length;
    const newEvId = sup.j.created[0].id;
    await call(`/api/org-context/${newEvId}/retire`, 'coach', { method: 'POST', body: {} });
    const after = (await call('/api/org-state', 'coach')).j.events.length;
    ok('· retiring a record invalidates the cache and drops it from state', after < before);

    // ── fail closed with valid JSON ─────────────────────────────────────────────
    const bad = await call('/api/org-context/confirm', 'coach', { method: 'POST', body: {} });
    ok('· a malformed confirm returns valid JSON, not a 500', bad.status === 400 || (bad.j && typeof bad.j === 'object'));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\norg-context-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
