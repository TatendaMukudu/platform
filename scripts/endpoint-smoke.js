/* Truth layer — ENDPOINT AUTHORIZATION + the Individual Experience surface.

   Boots the real Express app in-process (DB_OPTIONAL=1, no Postgres, no AI key),
   seeds two members + a leader in memory, and drives the HTTP endpoints to prove
   the access-control class stays closed and the "Me" context works. This is the
   HTTP-level guard the pure suites can't provide — it exercises requireAuth,
   session-identity, permissions, scope, and the composer end to end.

   Run:  node scripts/endpoint-smoke.js   (part of `npm test`) */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _purgeExpired } = require('../server.js');

const CODE = 'testco';
const iso  = new Date().toISOString();
const coachId = 'coach1', aId = 'mA', bId = 'mB';

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'Test Co', createdAt: iso } },
  orgUsers: { [CODE]: {
    [coachId]: { id: coachId, name: 'Coach', email: 'coach@t.co', role: 'superadmin', orgCode: CODE, supervisorId: null, status: 'active' },
    [aId]:     { id: aId, name: 'Member A', email: 'a@t.co', role: 'member', orgCode: CODE, supervisorId: coachId, status: 'active' },
    [bId]:     { id: bId, name: 'Member B', email: 'b@t.co', role: 'member', orgCode: CODE, supervisorId: coachId, status: 'active' },
  } },
  memberCheckins: { [`${CODE}:${aId}`]: [{ memberName: 'Member A', text: 'normal week', mood: 4, date: '01/01/2026', ts: iso }] },
  orgNotes: {
    noteB: { id: 'noteB', noteId: 'noteB', orgCode: CODE, authorId: bId, authorName: 'Member B', type: 'private', content: 'B private secret', createdAt: iso },
    noteA: { id: 'noteA', noteId: 'noteA', orgCode: CODE, authorId: aId, authorName: 'Member A', type: 'private', content: 'A private', createdAt: iso },
  },
  userAiProfiles: { [`${CODE}:${aId}`]: { openThreads: [{ id: 't1', text: 'A open thread', resolved: false, date: '2026-01-01' }], recentThemes: [], priorFollowUps: [], lastUpdated: iso } },
});
_rebuildEmailIndex();

const tokCoach = issueToken(coachId, CODE, 'superadmin');
const tokA     = issueToken(aId, CODE, 'member');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

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
    // ── requireAuth ──────────────────────────────────────────────────────────
    ok('me/context requires auth (401 without a token)', (await call('/api/me/context', null)).status === 401);
    ok('org-tree requires auth (401 without a token)',   (await call('/api/auth/org-tree', null)).status === 401);

    // ── the "Me" context surface works for the member ────────────────────────
    const ctx = await call('/api/me/context', tokA);
    ok('me/context returns the proactive open-state', ctx.status === 200 && ctx.j?.ok === true && typeof ctx.j.opening === 'string');

    // ── Person Model / memory is self-only (governance) ──────────────────────
    const mem = await call('/api/user/memory', tokA);
    ok('user/memory returns the caller\'s OWN model', mem.status === 200 && (mem.j?.memory?.openThreads || []).some(t => t.id === 't1'));
    const spoof = await call('/api/user/memory?userId=' + bId, tokA);
    ok('user/memory ignores a spoofed userId (self-only, no cross-read)',
       spoof.status === 200 && (spoof.j?.memory?.openThreads || []).some(t => t.id === 't1'));

    // ── notes IDOR closed — session identity, not the query requesterId ──────
    const notes = await call('/api/notes?requesterId=' + bId, tokA);
    const leaked = (notes.j?.notes || []).some(n => n.content === 'B private secret');
    ok('notes cannot read another member\'s private note via requesterId (IDOR closed)', notes.status === 200 && !leaked);

    // ── permission gates on leader-facing member data ───────────────────────
    ok('org-checkins denies a plain member (403)',  (await call('/api/platform/org-checkins', tokA)).status === 403);
    ok('org-checkins allows a leader (200)',         (await call('/api/platform/org-checkins', tokCoach)).status === 200);
    ok('member-results denies A reading B (403)',    (await call('/api/platform/member-results?memberName=Member%20B', tokA)).status === 403);
    ok('member-results allows the leader (200)',     (await call('/api/platform/member-results?memberName=Member%20B', tokCoach)).status === 200);

    // ── leader check-in text is privacy-filtered (sensitive redacted) ───────
    // (Seed a hardship check-in for A; the leader sees engagement, never the words.)
    const compHardship = await call('/api/compose', tokA, { method: 'POST', body: { text: 'I have been really struggling to cope this week.' } });
    ok('compose accepts input and acknowledges', compHardship.status === 200 && compHardship.j?.ok === true);
    const oc = await call('/api/platform/org-checkins', tokCoach);
    const aEntries = oc.j?.checkins?.['Member A'] || [];
    const hardship = aEntries.find(e => e.private === true);
    ok('a hardship check-in is redacted from the leader view (text null, private true)',
       !!hardship && hardship.text === null);
    ok('a neutral check-in stays visible to the leader',
       aEntries.some(e => e.private === false && typeof e.text === 'string'));

    // ── Phase 4: approve → execute → observe → learn loop (self-scoped) ──────
    const appr = await call('/api/me/prepared/act', tokA, { method: 'POST', body: { text: 'A small, supportive focus this week.', type: 'momentum_drop', decision: 'approve' } });
    ok('approving a prepared suggestion creates an active focus',
       appr.status === 200 && appr.j?.ok === true && (appr.j.focuses || []).length >= 1);
    const focusId = (appr.j.focuses || [])[0]?.id;
    const ctx2 = await call('/api/me/context', tokA);
    ok('the approved focus appears in the Me context', (ctx2.j?.focuses || []).some(f => f.id === focusId));
    const out = await call('/api/me/focus/outcome', tokA, { method: 'POST', body: { focusId, outcome: 'helped' } });
    ok('reporting an outcome closes the loop (Observe → Learn)', out.status === 200 && out.j?.ok === true);
    const ctx3 = await call('/api/me/context', tokA);
    ok('a resolved focus leaves the active list', !(ctx3.j?.focuses || []).some(f => f.id === focusId));
    ok('outcome + focus endpoints reject a bad payload (400)',
       (await call('/api/me/focus/outcome', tokA, { method: 'POST', body: { focusId: 'nope', outcome: 'weird' } })).status === 400);

    // ── GDPR: self-service data export (Art 15/20) ──────────────────────────
    const exp = await call('/api/me/export', tokA);
    ok('me/export returns the caller\'s own data bundle', exp.status === 200 && exp.j?.profile?.id === aId && Array.isArray(exp.j.checkins));
    ok('me/export never leaks the password hash', exp.status === 200 && !('passwordHash' in (exp.j.profile || {})));

    // ── GDPR: erasure fully deletes personal data (Art 17) ──────────────────
    // A has check-ins + signals + memory from the compose calls above. Delete
    // with data, then prove nothing about A survives in a leader's view.
    const del = await call(`/api/auth/users/${aId}?deleteData=true`, tokCoach, { method: 'DELETE' });
    ok('admin can erase a member with their data', del.status === 200);
    const ocAfter = await call('/api/platform/org-checkins', tokCoach);
    ok('erased member has NO check-ins left anywhere', !('Member A' in (ocAfter.j?.checkins || {})));
    // A's token is still valid but the user record is gone → me/export 404s.
    ok('erased member has no exportable data left', (await call('/api/me/export', tokA)).status === 404);

    // ── Observation / recognition (works even if the subject never logs in) ──
    // Re-seed a fresh member B is gone; use coach → B? B still exists. Coach recognises B.
    const recSubject = bId;
    const rec1 = await call('/api/observe', tokCoach, { method: 'POST', body: { subjectId: recSubject, kind: 'recognition', text: 'Great work leading the review today.' } });
    ok('a leader can record recognition about a member', rec1.status === 200 && rec1.j?.ok === true);
    // The recognition surfaces to the subject in their Me context.
    const tokB = issueToken(bId, CODE, 'member');
    const ctxB = await call('/api/me/context', tokB);
    ok('recognition surfaces to the subject ("you were noticed")',
       (ctxB.j?.recognitions || []).some(r => /great work/i.test(r.text)));
    // A peer (member) may recognise, but may NOT file a concern about a peer.
    const peerRec = await call('/api/observe', tokB, { method: 'POST', body: { subjectId: coachId, kind: 'recognition', text: 'Thanks for the support this week.' } });
    ok('a peer/member can record recognition (open to anyone)', peerRec.status === 200);
    // A peer CAN raise a welfare concern — accepted, but handled as a private,
    // low-weight, reporter-protected safeguarding flag (not a public accusation).
    const peerConcern = await call('/api/observe', tokB, { method: 'POST', body: { subjectId: coachId, kind: 'concern', text: 'seems really down lately' } });
    ok('a peer CAN raise a welfare concern (accepted, not blocked)', peerConcern.status === 200 && peerConcern.j?.weight === 'low');
    ok('a peer concern is routed privately (reporter thanked, not exposed)', /privately|responsible/i.test(peerConcern.j?.routed || ''));
    // The concern must NOT surface to its subject (the coach) as recognition, and
    // must NOT appear in the subject's own data export (reporter protection).
    const coachCtx = await call('/api/me/context', tokCoach);
    ok('a peer concern never shows to its subject as recognition', !(coachCtx.j?.recognitions || []).some(r => /down lately/i.test(r.text)));
    const coachExport = await call('/api/me/export', tokCoach);
    const leakedConcern = (coachExport.j?.signals || []).some(s => (s.valueText || '').match(/down lately/i));
    ok('a peer welfare report is excluded from the subject\'s export (GDPR Art 15(4))', !leakedConcern);
    // A peer still cannot file a neutral "note" (that stays leader-only).
    ok('a peer still cannot file a neutral note (leader-only)',
       (await call('/api/observe', tokB, { method: 'POST', body: { subjectId: coachId, kind: 'note', text: 'x' } })).status === 403);

    // ── Consent ledger + external app connector (GDPR: informed + revocable) ──
    ok('connecting an app WITHOUT consent is refused',
       (await call('/api/me/connect', tokB, { method: 'POST', body: { source: 'health' } })).status === 403);
    const grant = await call('/api/me/consent', tokB, { method: 'POST', body: { scope: 'external:health', granted: true } });
    ok('the person can grant consent for a source', grant.status === 200 && grant.j?.granted === true);
    ok('connecting AFTER consent succeeds',
       (await call('/api/me/connect', tokB, { method: 'POST', body: { source: 'health' } })).status === 200);
    const pull = await call('/api/me/sources/pull', tokB, { method: 'POST', body: { source: 'health', data: [
      { date: '2026-07-01', sleepHours: 6, steps: 8000 }, { date: '2026-07-02', sleepHours: 5, steps: 3000 } ] } });
    ok('a connected+consented source draws data into signals', pull.status === 200 && pull.j?.imported >= 2);
    // Withdraw consent → source disconnects and can no longer draw.
    await call('/api/me/consent', tokB, { method: 'POST', body: { scope: 'external:health', granted: false } });
    const srcs = await call('/api/me/sources', tokB);
    ok('withdrawing consent disconnects the source', !(srcs.j?.sources || []).find(s => s.id === 'health')?.connected);
    ok('after withdrawal, drawing is refused again',
       (await call('/api/me/sources/pull', tokB, { method: 'POST', body: { source: 'health', data: [] } })).status === 403);

    // ── Assistant tier: a SEPARATE consent, reported distinctly from insight ──
    const srcs0 = await call('/api/me/sources', tokB);
    const cal0 = (srcs0.j?.sources || []).find(s => s.id === 'calendar');
    ok('a connector exposes a distinct assistant tier (its own scope)',
       !!cal0?.assist && cal0.assist.scope === 'external:calendar:assist' && cal0.assistConsented === false);
    await call('/api/me/consent', tokB, { method: 'POST', body: { scope: 'external:calendar:assist', granted: true } });
    const srcs1 = await call('/api/me/sources', tokB);
    const cal1 = (srcs1.j?.sources || []).find(s => s.id === 'calendar');
    ok('granting the assistant tier is tracked separately from insight',
       cal1?.assistConsented === true && cal1?.consented === false);
    ok('connectors carry a category so different industries can group their apps',
       (srcs1.j?.sources || []).every(s => typeof s.category === 'string' && s.category));

    // ── Oversight roll-up: scoped to a leader's range, aggregate percentages ──
    const divCoach = await call('/api/org/divisions', tokCoach);
    ok('a leader gets the oversight roll-up scoped to their range', divCoach.status === 200 && divCoach.j?.range && typeof divCoach.j.range.needsAttention === 'number');
    ok('a plain member (oversees no one) is denied (403)', (await call('/api/org/divisions', tokB)).status === 403);
    ok('the roll-up is aggregate-only (no names / raw text)',
       !/valueText|passwordHash/.test(JSON.stringify(divCoach.j || {})));

    // ── Assistant: draft → approve (consent-gated) → execute ────────────────
    const draft = await call('/api/me/actions', tokCoach, { method: 'POST', body: { action: 'schedule_meeting', params: { title: '1:1 with the team', durationMins: 30 } } });
    ok('IntelliQ can draft an action (nothing sent yet)', draft.status === 200 && draft.j?.action?.needsConsent === true);
    const actId = draft.j.action.id;
    ok('approving WITHOUT write consent is refused', (await call(`/api/me/actions/${actId}/approve`, tokCoach, { method: 'POST' })).status === 403);
    await call('/api/me/consent', tokCoach, { method: 'POST', body: { scope: 'external:calendar:write', granted: true } });
    const done = await call(`/api/me/actions/${actId}/approve`, tokCoach, { method: 'POST' });
    ok('approving WITH consent executes the action', done.status === 200 && done.j?.status === 'done');

    // ── Data retention: old personal data is purged, recent is kept (GDPR) ────
    const oldTs    = new Date(Date.now() - 800 * 86400000).toISOString(); // > 730d
    const freshTs  = new Date().toISOString();
    _loadAllStores({ orgSignals: { [CODE]: [
      { subjectId: bId, label: 'old', valueNum: 1, ts: oldTs },
      { subjectId: bId, label: 'fresh', valueNum: 1, ts: freshTs },
    ] } });
    const purged = _purgeExpired();
    ok('retention purges data past the window (>=1 old record removed)', purged >= 1);
    const expB = await call('/api/me/export', tokB);
    const sigLabels = (expB.j?.signals || []).map(s => s.label);
    ok('retention keeps recent data and drops only the expired',
       sigLabels.includes('fresh') && !sigLabels.includes('old'));

    // ── Assessments: leader creates → assigns → member fills → leader returns ─
    ok('a member cannot create an assessment template (403)',
       (await call('/api/assessments/templates', tokB, { method: 'POST', body: { title: 'x' } })).status === 403);
    const tpl = await call('/api/assessments/templates', tokCoach, { method: 'POST', body: {
      title: 'Match film breakdown', kind: 'film', description: 'Break down the match the way we discussed.',
      fields: [{ label: 'Key moments', hint: '3-5 clips' }, { label: 'What you saw', hint: '' }] } });
    ok('a leader creates an assessment template', tpl.status === 200 && tpl.j?.template?.id);
    const tplId = tpl.j.template.id;
    ok('a member cannot assign to others (403)',
       (await call('/api/assessments/assign', tokB, { method: 'POST', body: { templateId: tplId, assigneeIds: [coachId] } })).status === 403);
    const asg = await call('/api/assessments/assign', tokCoach, { method: 'POST', body: { templateId: tplId, assigneeIds: [bId] } });
    ok('a leader assigns the assessment to a member in range', asg.status === 200 && (asg.j?.assigned || []).length === 1);
    const asgId = asg.j.assigned[0].id;
    const bList = await call('/api/assessments', tokB);
    ok('the assignee sees it in their queue (status assigned)',
       (bList.j?.assigned || []).some(a => a.id === asgId && a.status === 'assigned'));
    ok('a non-assignee cannot submit someone else\'s assessment (403)',
       (await call(`/api/assessments/${asgId}/submit`, tokCoach, { method: 'POST', body: { response: {} } })).status === 403);
    const sub = await call(`/api/assessments/${asgId}/submit`, tokB, { method: 'POST', body: { response: { 'Key moments': '3 clips', 'What you saw': 'good spacing' }, note: 'done' } });
    ok('the assignee fills and returns it (status submitted)', sub.status === 200 && sub.j?.assignment?.status === 'submitted');
    const ret = await call(`/api/assessments/${asgId}/return`, tokCoach, { method: 'POST', body: { feedback: 'Strong work', score: 82 } });
    ok('the leader reviews it back with feedback + score', ret.status === 200 && ret.j?.assignment?.status === 'returned' && ret.j.assignment.score === 82);
    const expScore = await call('/api/me/export', tokB);
    ok('a returned score becomes a citable signal in the member\'s record',
       (expScore.j?.signals || []).some(s => /Assessment score/.test(s.label) && s.valueNum === 82));
    // Tutorials
    ok('a member cannot pin a tutorial (403)',
       (await call('/api/tutorials', tokB, { method: 'POST', body: { title: 'x' } })).status === 403);
    const tut = await call('/api/tutorials', tokCoach, { method: 'POST', body: { title: 'How to break down film', body: 'Step 1...', kind: 'film' } });
    ok('a leader pins a tutorial', tut.status === 200 && tut.j?.tutorial?.id);
    const bList2 = await call('/api/assessments', tokB);
    ok('a pinned tutorial is visible to everyone for reference',
       (bList2.j?.tutorials || []).some(t => /break down film/i.test(t.title)));

    // ── LLM self-test: admin-gated, reports status (no key in test mode) ─────
    ok('a plain member cannot run the LLM self-test (403)',
       (await call('/api/admin/llm-selftest', tokB, { method: 'POST' })).status === 403);
    const llm = await call('/api/admin/llm-selftest', tokCoach, { method: 'POST' });
    ok('an admin can run the LLM self-test and gets a status report',
       llm.status === 200 && llm.j?.ok === true && typeof llm.j.status?.enabled === 'boolean');
    ok('with no key, the self-test reports deterministic-fallback mode (no crash)',
       llm.j?.status?.enabled === false && Array.isArray(llm.j.results) && typeof llm.j.note === 'string');

  } catch (e) {
    fail++; console.log('  ✗ threw:', e.message);
  } finally {
    server.close();
    console.log(`\nendpoint-smoke: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
