/* Truth layer — LEARNING ENGINE Phase B1 over HTTP: governed longitudinal observations.

   Proves: (a) direct org-knowledge capture records an evidence_recorded trigger (not a
   mislabelled temporal_recalculation), surfaced only as a safe public category; (b) the
   client cannot inject trigger metadata; (c) observations derive from the tenant's own
   memory, are leader-only + tenant-isolated + redacted + non-causal; (d) dismissal is
   feedback on the analytical artifact only and does not resurface, while materially-new
   support can. Boots the real app (DB_OPTIONAL, no AI key).
   Run: node scripts/org-learning-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S  = require('../server.js');
const OM = require('../ai/org-memory.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'learna', B = 'learnb', Cc = 'learnc', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', orgMode: 'sports', createdAt: iso }, [B]: { orgName: 'B', orgMode: 'sports', createdAt: iso }, [Cc]: { orgName: 'C', orgMode: 'sports', createdAt: iso } },
  orgUsers: {
    [A]: { coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, status: 'active' }, jordan: { id: 'jordan', name: 'Jordan', role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' } },
    [B]: { bc: { id: 'bc', name: 'BCoach', role: 'superadmin', orgCode: B, status: 'active' }, bp: { id: 'bp', name: 'BP', role: 'member', orgCode: B, supervisorId: 'bc', status: 'active' } },
    [Cc]: { cc: { id: 'cc', name: 'CCoach', role: 'superadmin', orgCode: Cc, status: 'active' }, cp: { id: 'cp', name: 'CP', role: 'member', orgCode: Cc, supervisorId: 'cc', status: 'active' } },
  },
});
_rebuildEmailIndex();

// Seed org C's MEMORY with a compatible timeline where availability is recorded across
// three distinct events (a repeated transition + recurring requirement type), plus one
// reversal (a possible contradiction). Observations derive from THIS history.
const SEM = { orgStateSchemaVersion: 1, projectionRulesVersion: 1, readinessRulesVersion: 1 };
const T0 = Date.parse('2026-02-01T00:00:00Z'), HR = 3600000;
const cl = (rid, st) => ({ requirementId: rid, claimType: 'availability', state: st });
const cmoment = (i, claims, status, trig) => OM.snapshot({
  state: { organisation: { pack: 'sports' }, claimStates: claims },
  readiness: { focus: { kind: 'event', id: 'e', title: 'Season' }, readiness: { status }, nextQuestions: [] },
  fingerprint: 'c' + i, now: T0 + i * HR, trigger: { type: trig || 'evidence_recorded' }, semantics: SEM });
const seedC = () => [
  cmoment(0, [cl('e1:availability', 'missing')], 'not_ready'),
  cmoment(1, [cl('e1:availability', 'known'), cl('e2:availability', 'missing')], 'partially_ready'),
  cmoment(2, [cl('e1:availability', 'known'), cl('e2:availability', 'known'), cl('e3:availability', 'missing')], 'partially_ready'),
  cmoment(3, [cl('e1:availability', 'known'), cl('e2:availability', 'known'), cl('e3:availability', 'known')], 'ready'),
];
S.orgStateHistory[Cc] = seedC();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { coach: issueToken('coach', A, 'superadmin'), jordan: issueToken('jordan', A, 'member'),
    bc: issueToken('bc', B, 'superadmin'), cc: issueToken('cc', Cc, 'superadmin'), cp: issueToken('cp', Cc, 'member') };
  const inDays = d => new Date(Date.now() + d * 86400000).toISOString();
  const call = async (path, who, opts = {}) => {
    const headers = { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(who ? { Authorization: `Bearer ${tok[who]}` } : {}) };
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const observations = (who, q = '') => call('/api/org-learning/observations' + q, who);

  try {
    /* ── TRIGGER INTEGRITY (live, org A) ── */
    await call('/api/org-context/confirm', 'coach', { method: 'POST', body: { records: [
      { type: 'event', scope: { kind: 'team' }, fields: { type: 'match', title: 'Opener', startAt: inDays(3), participants: 22 } },
      { type: 'requirement', scope: { kind: 'team' }, fields: { claimType: 'game_plan', freshDays: 14, matches: 'game plan|tactics|formation' } },
    ] } });
    // Direct governed org-knowledge capture (shared import), with a client-supplied trigger
    // that MUST be ignored (server derives it).
    await call('/api/evidence/import', 'coach', { method: 'POST', body: { format: 'text', content: 'Game plan for the opener: high press 4-3-3, tactics and formation set.', sourceName: 'Playbook', visibility: 'normal', confirmVisibilityIncrease: true, trigger: { type: 'system_rebaseline', actorRef: 'attacker' } } });
    const histA = S.orgStateHistory[A] || [];
    const head = histA[histA.length - 1];
    ok('1 · direct evidence capture records an evidence_recorded trigger (not temporal_recalculation)', head && head.trigger && head.trigger.type === 'evidence_recorded');
    ok('2 · a client-supplied trigger is ignored (server-derived, actor is the leader not the attacker)', head.trigger.actorRef === 'coach' && head.trigger.type !== 'system_rebaseline');
    const tlA = await call('/api/org-memory/timeline', 'coach');
    ok('3 · public memory exposes only the safe trigger category "information was recorded"', tlA.j.entries.some(e => e.snapshot.triggerCategory === 'information was recorded') && !/"type":"evidence_recorded"|attacker|actorRef/.test(JSON.stringify(tlA.j)));

    /* ── OBSERVATION DERIVATION (org C, seeded history) ── */
    const o1 = await observations('cc');
    ok('4 · observations are labelled historical descriptions, not recommendations', o1.j.ok && o1.j.kind === 'historical_descriptions' && /not recommendations/i.test(o1.j.note));
    const rt = (o1.j.observations || []).find(o => o.type === 'repeated_transition');
    ok('4 · a repeated transition (availability recorded across events) is observed', rt && rt.occurrenceCount >= 3 && rt.subjectLabel === 'availability information');
    ok('4 · a recurring requirement type across distinct events is observed', o1.j.observations.some(o => o.type === 'recurring_requirement_type' && o.distinctEvents >= 3));
    ok('5 · no observation uses causal / evaluative language', o1.j.observations.every(o => !/\b(caused|led to|resulted in|because|healthy|unhealthy|effective|ineffective|success|failure|improved)\b/i.test(o.summary)));
    ok('6 · observations never leak requirement ids, actor refs, hashes, or versions', !/e1:availability|e2:|requirementId|actorRef|contentHash|SchemaVersion|RulesVersion|"trigger"/.test(JSON.stringify(o1.j.observations)));

    // detail endpoint
    const det = await call('/api/org-learning/observations/' + encodeURIComponent(rt.fingerprint), 'cc');
    ok('7 · the detail endpoint explains a moment with a "not advice" disclaimer', det.j.ok && det.j.observation && /not a recommendation/i.test(det.j.observation.disclaimer) && det.j.observation.kind === 'historical_description');

    /* ── AUTHORITY / ISOLATION ── */
    ok('8 · observations are leader-only (member 403)', (await observations('cp')).status === 403);
    ok('8 · dismiss is leader-only (member 403)', (await call('/api/org-learning/observations/' + encodeURIComponent(rt.fingerprint) + '/dismiss', 'cp', { method: 'POST' })).status === 403);
    ok('8 · another tenant sees none of C\'s observations (isolation)', !((await observations('bc')).j.observations || []).some(o => o.fingerprint === rt.fingerprint));
    ok('8 · an org with too little history has no observations (insufficient occurrences)', ((await observations('bc')).j.observations || []).length === 0);

    /* ── DISMISSAL ── */
    const dis = await call('/api/org-learning/observations/' + encodeURIComponent(rt.fingerprint) + '/dismiss', 'cc', { method: 'POST' });
    ok('9 · a leader can dismiss an observation (analytical artifact only)', dis.j.ok && dis.j.dismissed === rt.fingerprint);
    const o2 = await observations('cc');
    ok('9 · a dismissed fingerprint does not resurface as active on re-derivation', !(o2.j.observations || []).some(o => o.fingerprint === rt.fingerprint));
    ok('9 · dismissal never deletes memory (the timeline is untouched)', (S.orgStateHistory[Cc] || []).length >= 4);

    /* ── MATERIALLY-NEW SUPPORT can still appear ── */
    S.orgStateHistory[Cc] = seedC().concat([
      cmoment(4, [cl('e1:availability', 'known'), cl('e2:availability', 'known'), cl('e3:availability', 'known'), cl('e4:availability', 'missing')], 'partially_ready'),
      cmoment(5, [cl('e1:availability', 'known'), cl('e2:availability', 'known'), cl('e3:availability', 'known'), cl('e4:availability', 'known')], 'ready'),
    ]);
    const o3 = await observations('cc');
    const rt2 = (o3.j.observations || []).find(o => o.type === 'repeated_transition' && o.occurrenceCount >= 4);
    ok('10 · materially-new support creates a NEW active observation (different fingerprint)', rt2 && rt2.fingerprint !== rt.fingerprint);

    /* ── IDEMPOTENCY ── */
    const before = JSON.stringify((await observations('cc')).j.observations);
    const after = JSON.stringify((await observations('cc')).j.observations);
    ok('11 · repeated reads are idempotent + deterministic', before === after);
    ok('11 · observations persist in the durable orgObservations store', Array.isArray(S.orgObservations[Cc]) && S.orgObservations[Cc].length > 0);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\norg-learning-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
