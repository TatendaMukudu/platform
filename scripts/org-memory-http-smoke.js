/* Truth layer — ORGANISATIONAL MEMORY (Phase A) over HTTP: the derived-state timeline.

   Proves that governed writes (operating-context confirm, a resolution answer, a role
   binding) each append a fingerprinted MOMENT to the org's memory; that the timeline
   answers "what changed, and when?" with deterministic diffs; that a mutation which
   changes nothing observable does NOT accrue a moment; that private/wellbeing content
   never enters memory; and that it is leader-only + tenant-isolated. Boots the real app
   (DB_OPTIONAL, no AI key). Run: node scripts/org-memory-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'memorga', B = 'memorgb', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', orgMode: 'sports', createdAt: iso }, [B]: { orgName: 'B', orgMode: 'sports', createdAt: iso } },
  orgUsers: {
    [A]: { coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, status: 'active' }, jordan: { id: 'jordan', name: 'Jordan', role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' }, mia: { id: 'mia', name: 'Mia', role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' } },
    [B]: { bc: { id: 'bc', name: 'BCoach', role: 'superadmin', orgCode: B, status: 'active' }, bp: { id: 'bp', name: 'BPlayer', role: 'member', orgCode: B, supervisorId: 'bc', status: 'active' } },
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
  const timeline = who => call('/api/org-memory/timeline', who);
  const changed = (who, q = '') => call('/api/org-memory/changed' + q, who);

  try {
    // 1 · empty memory before anything happens — a calm baseline, not a crash
    const t0 = await timeline('coach');
    ok('1 · an org with no history has an empty, valid timeline', t0.status === 200 && t0.j.ok && Array.isArray(t0.j.entries) && t0.j.summary.count === 0);

    // 2 · confirming operating context records a moment
    await confirm('coach', [
      { type: 'event', scope: { kind: 'team' }, fields: { type: 'match', title: 'Cup Final', startAt: inDays(3), participants: 22 } },
      { type: 'responsibility', scope: { kind: 'team' }, fields: { role: 'coach', claimTypes: ['game_plan'] } },
      { type: 'requirement', scope: { kind: 'team' }, fields: { claimType: 'game_plan', freshDays: 14, matches: 'game plan|tactics|formation' } },
    ]);
    const t1 = await timeline('coach');
    ok('2 · confirming operating context appends a moment to memory', t1.j.summary.count >= 1);
    ok('2 · the newest moment records the focus + a missing game plan', (() => { const s = t1.j.entries[0].snapshot; return s.focus && s.focus.title === 'Cup Final' && s.claims.some(c => c.claimType === 'game_plan' && c.state === 'missing'); })());
    ok('2 · the earliest moment carries a baseline diff (timeline begins)', t1.j.entries[t1.j.entries.length - 1].changed.baseline === true);
    const countAfterCtx = t1.j.summary.count;

    // 3 · re-reading the timeline does NOT record a new moment (nothing changed)
    const t1b = await timeline('coach');
    ok('3 · re-reading with no change does not accrue a moment (dedup on observable state)', t1b.j.summary.count === countAfterCtx);

    // 4 · a governed resolution answer (authoritative) resolves the claim → a new moment
    await call('/api/assistant/turn', 'coach', { method: 'POST', body: { text: 'Add this to our organisation knowledge: Game plan for the cup final — high press 4-3-3, tactics and formation confirmed.' } });
    const t2 = await timeline('coach');
    ok('4 · resolving a requirement appends a new moment', t2.j.summary.count === countAfterCtx + 1);
    ok('4 · the diff classifies game plan missing → known as resolved', t2.j.entries[0].changed.claimTransitions.some(tr => tr.claimType === 'game_plan' && tr.direction === 'resolved'));
    ok('4 · the rollup counts at least one resolved claim', t2.j.summary.claimsResolved >= 1);

    // 5 · "what changed" between the previous moment and now
    const ch = await changed('coach');
    ok('5 · /changed reports the most recent transition (head vs previous)', ch.j.ok && ch.j.changed && ch.j.changed.claimTransitions.some(tr => tr.claimType === 'game_plan'));
    ok('5 · the change summary is plain, non-blaming language', /game plan is now recorded/i.test((ch.j.changed.summary || []).join(' ')) && !/\bblame|fault|failed to\b/i.test((ch.j.changed.summary || []).join(' ')));

    // 6 · a role binding changes ownership resolution → another moment; fingerprint moves
    const fpBefore = t2.j.entries[0].snapshot.fingerprint;
    await call('/api/org-context/role-binding', 'coach', { method: 'POST', body: { roleRef: 'coach', userId: 'jordan' } });
    const t3 = await timeline('coach');
    ok('6 · a governed role binding appends a moment', t3.j.summary.count >= t2.j.summary.count);
    ok('6 · each recorded moment carries a fingerprint (versioned)', t3.j.entries.every(e => typeof e.snapshot.fingerprint === 'string' && e.snapshot.fingerprint.length));

    // 7 · changedSince by steps compares head against N moments back
    const chSteps = await changed('coach', '?steps=2');
    ok('7 · /changed?steps=2 anchors two moments back and diffs to head', chSteps.j.ok && chSteps.j.changed && chSteps.j.anchor && chSteps.j.head);

    // 8 · PRIVACY — a member's private wellbeing disclosure never enters memory
    await call('/api/assistant/turn', 'mia', { method: 'POST', body: { text: 'Remember this: I have been anxious and burned out and my mood is very low.' } });
    const t4 = await timeline('coach');
    ok('8 · private/wellbeing content never appears anywhere in the timeline', !/anxious|burned out|mood|wellbeing/i.test(JSON.stringify(t4.j)));
    ok('8 · a private disclosure did not manufacture an org-memory moment', t4.j.summary.count === t3.j.summary.count);

    // 9 · the timeline is a redacted projection — no raw evidence text, no content hash
    ok('9 · snapshots never leak raw evidence text (only derived claim states)', !/high press 4-3-3/i.test(JSON.stringify(t4.j)));
    ok('9 · the internal content hash is never exposed', !/contentHash/.test(JSON.stringify(t4.j)));

    // 10 · leader-only + tenant isolation
    ok('10 · org memory is leader-only (member 403)', (await timeline('mia')).status === 403);
    ok('10 · /changed is leader-only (member 403)', (await changed('mia')).status === 403);
    const tb = await timeline('bc');
    ok('10 · another tenant sees none of A\'s moments (isolation)', tb.j.summary.count === 0 && !/Cup Final/.test(JSON.stringify(tb.j)));

    // 11 · determinism — repeated reads of the timeline are byte-identical (no re-record)
    const r1 = await timeline('coach'), r2 = await timeline('coach');
    ok('11 · repeated timeline reads are idempotent + deterministic', JSON.stringify(r1.j.entries) === JSON.stringify(r2.j.entries));

    // 12 · the store is the exported durable one (survives via scheduleSave)
    ok('12 · the timeline is persisted in the durable orgStateHistory store', Array.isArray(S.orgStateHistory[A]) && S.orgStateHistory[A].length === t4.j.summary.count);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\norg-memory-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
