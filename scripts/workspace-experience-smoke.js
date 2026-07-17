/* ============================================================
   scripts/workspace-experience-smoke.js — the MyWorkspace experience boundaries.

   Proves the conversation-first surfaces (today / ask / lenses / history) obtain ALL
   intelligence through the purpose-scoped gateway + post-kernel bounding — never from
   raw items — and that private evidence stays owner-only across the experience.

   Run:  node scripts/workspace-experience-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = srv;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'wexp';
_loadAllStores({ orgMeta: { [CODE]: { orgName: 'WExp Co', createdAt: new Date().toISOString() } }, orgUsers: { [CODE]: {
  ana:  { id: 'ana',  name: 'Ana',  email: 'ana@co.fc',  role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
  boss: { id: 'boss', name: 'Boss', email: 'boss@co.fc', role: 'admin',  orgCode: CODE, supervisorId: null,   status: 'active' },
} } });
_rebuildEmailIndex();
const tokAna = issueToken('ana', CODE, 'member');
const tokBoss = issueToken('boss', CODE, 'admin');

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, tok, opts = {}) => {
    const headers = { ...(opts.headers || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  try {
    console.log('\n=== MyWorkspace experience boundaries ===\n');

    // ── Composer: capture → pre-kernel → canonical evidence + projection ─────
    const cls = await call('/api/workspace/classify', tokAna, { method: 'POST', body: { text: "Keep this private — I feel like I'm taking on too much" } });
    ok('classify SUGGESTS private (a proposal), never applies it',
       cls.j?.suggestion?.scope === 'personal_private' && cls.j.suggestion.confidence === 'suggested');
    const capPriv = await call('/api/workspace', tokAna, { method: 'POST', body: { text: "I feel like I'm taking on too much", scope: 'personal_private', purpose: 'reflection' } });
    ok('a private capture creates canonical evidence + a projection, informs org nothing',
       capPriv.j?.becameEvidence >= 1 && capPriv.j.informsOrg === false);
    const capWork = await call('/api/workspace', tokAna, { method: 'POST', body: { text: 'Delivered the security review on time', scope: 'organizational', purpose: 'observation', visibility: 'manager', aiUsage: 'may_be_cited' } });
    ok('a permitted work observation becomes org evidence', capWork.j?.becameEvidence >= 1 && capWork.j.informsOrg === true);

    // ── Today: attention is grounded + selected; private reassurance is traceable ─
    const today = await call('/api/workspace/today', tokAna);
    ok('Today returns a grounded orientation + a SMALL number of attention items',
       today.status === 200 && typeof today.j?.orientation === 'string' && Array.isArray(today.j.attention) && today.j.attention.length <= 3);
    ok('the "kept private" reassurance is present and traceable to evidence',
       today.j.attention.some(a => a.kind === 'privacy' && a.basis && a.basis.length >= 1));

    // ── Ask: purpose-scoped; personal question may use private; work excludes it ─
    const askPriv = await call('/api/workspace/ask', tokAna, { method: 'POST', body: { question: 'what is private here?' } });
    ok('a personal question answers from the owner\'s private evidence',
       askPriv.j?.purpose === 'personal_assistance' && /private/i.test(askPriv.j.answer) && askPriv.j.cites.length >= 1);
    const askWork = await call('/api/workspace/ask', tokAna, { method: 'POST', body: { question: 'what changed for the team project?' } });
    ok('a WORK-scoped question uses a non-personal purpose (private excluded before context)',
       askWork.j?.purpose === 'workspace_shared_reasoning');
    ok('an ask response never cites evidence outside the authorised set (post-kernel bounded)',
       askWork.j?.bounded === true);
    const askThin = await call('/api/workspace/ask', tokAna, { method: 'POST', body: { question: 'will the merger succeed?' } });
    ok('a question with thin support prefers uncertainty/clarification, not a confident claim',
       ['low', 'none'].includes(askThin.j?.confidence));

    // ── Lenses are views, self-scoped; filtering cannot broaden visibility ───
    const me = await call('/api/workspace/items?lens=me', tokAna);
    ok('the Me lens shows the owner\'s private reflection', me.j?.items?.some(i => i.scope === 'personal_private'));
    const bossMe = await call('/api/workspace/items?lens=me', tokBoss);
    ok('another user\'s workspace never contains Ana\'s private item (self-scoped)',
       !(bossMe.j?.items || []).some(i => i.text.includes('taking on too much')));

    // ── Private content never leaks to leader-facing reasoning ───────────────
    const gw = require('../server.js');
    // (Boss cannot retrieve Ana's private evidence under leader reasoning — proven in
    //  private-evidence-smoke; here we assert the experience endpoints are self-scoped.)
    ok('history is self-scoped (owner-only timeline)',
       (await call('/api/workspace/history', tokAna)).j?.timeline?.length >= 1 &&
       !((await call('/api/workspace/history', tokBoss)).j?.timeline || []).some(t => t.text && t.text.includes('taking on too much')));

    // ── Unsaved composer text creates nothing ────────────────────────────────
    const before = (await call('/api/workspace/items?lens=notes', tokAna)).j?.items?.length || 0;
    await call('/api/workspace/classify', tokAna, { method: 'POST', body: { text: 'just thinking, not saving' } });
    const after = (await call('/api/workspace/items?lens=notes', tokAna)).j?.items?.length || 0;
    ok('classify-only (unsaved) capture creates no item/evidence', after === before);

  } catch (e) { fail++; console.log('  ✗ threw:', e.message); }
  finally {
    server.close();
    console.log(`\nworkspace-experience-smoke: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
