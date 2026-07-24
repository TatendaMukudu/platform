/* Truth layer — LEARNING ENGINE Phase B2 over HTTP: candidate practices + the GOVERNED
   playbook. Proves candidates are derived from the tenant's own observations (weighed for
   and against, with a confidence band), that the engine NEVER writes the playbook — only a
   leader's confirm does — that confirm/dismiss are governed + idempotent, and that
   everything is leader-only, tenant-isolated, redacted, and non-causal.
   Boots the real app (DB_OPTIONAL, no AI key). Run: node scripts/org-playbook-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S  = require('../server.js');
const OM = require('../ai/org-memory.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'pba', B = 'pbb', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', orgMode: 'sports', createdAt: iso }, [B]: { orgName: 'B', orgMode: 'sports', createdAt: iso } },
  orgUsers: {
    [A]: { coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, status: 'active' }, jo: { id: 'jo', name: 'Jo', role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' } },
    [B]: { bc: { id: 'bc', name: 'BC', role: 'superadmin', orgCode: B, status: 'active' }, bp: { id: 'bp', name: 'BP', role: 'member', orgCode: B, supervisorId: 'bc', status: 'active' } },
  },
});
_rebuildEmailIndex();

// Seed org A's MEMORY: availability recorded across three distinct events (a strong,
// uncontradicted, multi-event repeated transition → a well_supported candidate).
const SEM = { orgStateSchemaVersion: 1, projectionRulesVersion: 1, readinessRulesVersion: 1 };
const T0 = Date.parse('2026-03-01T00:00:00Z'), HR = 3600000;
const cl = (rid, st) => ({ requirementId: rid, claimType: 'availability', state: st });
const m = (i, claims, status) => OM.snapshot({
  state: { organisation: { pack: 'sports' }, claimStates: claims },
  readiness: { focus: { kind: 'event', id: 'e', title: 'Season' }, readiness: { status }, nextQuestions: [] },
  fingerprint: 'p' + i, now: T0 + i * HR, trigger: { type: 'evidence_recorded' }, semantics: SEM });
S.orgStateHistory[A] = [
  m(0, [cl('e1:availability', 'missing')], 'not_ready'),
  m(1, [cl('e1:availability', 'known'), cl('e2:availability', 'missing')], 'partially_ready'),
  m(2, [cl('e1:availability', 'known'), cl('e2:availability', 'known'), cl('e3:availability', 'missing')], 'partially_ready'),
  m(3, [cl('e1:availability', 'known'), cl('e2:availability', 'known'), cl('e3:availability', 'known')], 'ready'),
];

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { coach: issueToken('coach', A, 'superadmin'), jo: issueToken('jo', A, 'member'), bc: issueToken('bc', B, 'superadmin') };
  const call = async (path, who, opts = {}) => {
    const headers = { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(who ? { Authorization: `Bearer ${tok[who]}` } : {}) };
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const candidates = who => call('/api/org-playbook/candidates', who);
  const playbook = who => call('/api/org-playbook', who);

  try {
    /* ── CANDIDATES ── */
    const c1 = await candidates('coach');
    ok('1 · proposed practices are labelled + carry the "you confirm" governance note', c1.j.ok && c1.j.kind === 'proposed_practices' && /until you confirm/i.test(c1.j.note));
    const cand = (c1.j.candidates || []).find(c => c.type === 'repeated_transition');
    ok('1 · a strong repeated pattern becomes a candidate practice', !!cand && cand.subjectLabel === 'availability information');
    ok('2 · a candidate is weighed for AND against with a qualitative confidence band', cand.confidenceLabel === 'Well supported' && cand.counterEvidence.supporting >= 3 && cand.counterEvidence.contradicting === 0 && !/0\.\d|[0-9]{1,3}%/.test(cand.confidenceLabel));
    ok('2 · a candidate leaks no versions, actor/record/requirement ids, or raw internals', !/RulesVersion|SchemaVersion|requirementId|e1:availability|actorRef|identityKey/.test(JSON.stringify(cand)));
    ok('3 · candidate text is never causal, advisory, or evaluative', !/\b(caused|led to|because|should|recommend|healthy|effective|success|failure|improved)\b/i.test(JSON.stringify(c1.j.candidates)));

    /* ── AUTHORITY / ISOLATION ── */
    ok('4 · candidates are leader-only (member 403)', (await candidates('jo')).status === 403);
    ok('4 · the playbook is leader-only (member 403)', (await playbook('jo')).status === 403);
    ok('4 · confirm is leader-only (member 403)', (await call('/api/org-playbook/candidates/' + cand.fingerprint + '/confirm', 'jo', { method: 'POST' })).status === 403);
    ok('4 · another tenant sees none of A\'s candidates (isolation)', !((await candidates('bc')).j.candidates || []).some(c => c.fingerprint === cand.fingerprint));

    /* ── GOVERNED CONFIRMATION — the ONLY path into the playbook ── */
    const empty = await playbook('coach');
    ok('5 · nothing is in the playbook until a leader confirms', (empty.j.entries || []).length === 0);
    const conf = await call('/api/org-playbook/candidates/' + cand.fingerprint + '/confirm', 'coach', { method: 'POST' });
    ok('5 · a leader can confirm a candidate into the playbook', conf.j.ok && conf.j.entry && conf.j.entry.statement === cand.statement);
    const pb = await playbook('coach');
    ok('5 · the confirmed practice now appears in the playbook', (pb.j.entries || []).some(e => e.statement === cand.statement && e.confidenceLabel === 'Well supported'));
    ok('5 · a confirmed candidate no longer appears in the proposals list', !((await candidates('coach')).j.candidates || []).some(c => c.fingerprint === cand.fingerprint));
    ok('6 · the playbook entry never exposes the confirming actor id', !/confirmedBy|"coach"/.test(JSON.stringify(pb.j.entries)));

    /* ── IDEMPOTENCY + injection resistance ── */
    await call('/api/org-playbook/candidates/' + cand.fingerprint + '/confirm', 'coach', { method: 'POST' });
    ok('7 · re-confirming does not duplicate the playbook entry (idempotent)', (S.orgPlaybook[A] || []).filter(e => e.status === 'active').length === 1);
    ok('7 · confirming an unknown fingerprint is rejected (client cannot inject a practice)', (await call('/api/org-playbook/candidates/not-a-real-fp/confirm', 'coach', { method: 'POST' })).status === 404);

    /* ── DISMISS ── */
    // Extend history so a NEW candidate (4th occurrence, new fingerprint) is proposed, then set it aside.
    S.orgStateHistory[A] = S.orgStateHistory[A].concat([
      m(4, [cl('e1:availability', 'known'), cl('e2:availability', 'known'), cl('e3:availability', 'known'), cl('e4:availability', 'missing')], 'partially_ready'),
      m(5, [cl('e1:availability', 'known'), cl('e2:availability', 'known'), cl('e3:availability', 'known'), cl('e4:availability', 'known')], 'ready'),
    ]);
    const c2 = await candidates('coach');
    const fresh = (c2.j.candidates || []).find(c => c.type === 'repeated_transition');
    ok('8 · materially-new support proposes a fresh candidate to review', !!fresh && fresh.fingerprint !== cand.fingerprint);
    const dis = await call('/api/org-playbook/candidates/' + fresh.fingerprint + '/dismiss', 'coach', { method: 'POST' });
    ok('8 · a leader can set a proposal aside', dis.j.ok && dis.j.dismissed === fresh.fingerprint);
    ok('8 · a set-aside candidate no longer appears and never entered the playbook', !((await candidates('coach')).j.candidates || []).some(c => c.fingerprint === fresh.fingerprint) && !(S.orgPlaybook[A] || []).some(e => e.candidateFingerprint === fresh.fingerprint));

    /* ── DURABILITY ── */
    ok('9 · confirmed practices persist in the durable orgPlaybook store', Array.isArray(S.orgPlaybook[A]) && S.orgPlaybook[A].length === 1);
    ok('9 · confirming never mutated memory (the timeline is untouched)', (S.orgStateHistory[A] || []).length === 6);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\norg-playbook-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
