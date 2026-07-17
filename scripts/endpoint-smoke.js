/* Truth layer — ENDPOINT AUTHORIZATION + the Individual Experience surface.

   Boots the real Express app in-process (DB_OPTIONAL=1, no Postgres, no AI key),
   seeds two members + a leader in memory, and drives the HTTP endpoints to prove
   the access-control class stays closed and the "Me" context works. This is the
   HTTP-level guard the pure suites can't provide — it exercises requireAuth,
   session-identity, permissions, scope, and the composer end to end.

   Run:  node scripts/endpoint-smoke.js   (part of `npm test`) */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _purgeExpired, orgMappings } = require('../server.js');

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
    // ── public health (no auth) reports AI wiring as booleans, no secrets ──────
    const health = await call('/api/health', null);
    ok('health is public and reports AI status without leaking secrets',
       health.status === 200 && health.j?.ok === true && typeof health.j.ai?.enabled === 'boolean' && typeof health.j.ai?.claude === 'boolean' &&
       !/sk-[A-Za-z0-9]|"[A-Za-z0-9_-]{25,}"/.test(JSON.stringify(health.j)));

    // ── requireAuth ──────────────────────────────────────────────────────────
    ok('me/context requires auth (401 without a token)', (await call('/api/me/context', null)).status === 401);
    ok('org-tree requires auth (401 without a token)',   (await call('/api/auth/org-tree', null)).status === 401);

    // ── the "Me" context surface works for the member ────────────────────────
    const ctx = await call('/api/me/context', tokA);
    ok('me/context returns the proactive open-state', ctx.status === 200 && ctx.j?.ok === true && typeof ctx.j.opening === 'string');
    ok('me/context carries an adaptive check-in question + returning flag',
       typeof ctx.j?.ask === 'string' && ctx.j.ask.length > 0 && typeof ctx.j.returning === 'boolean');

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

    // ── Contribute tier (the distillation membrane) — four safeguards ───────
    // Safeguard 1: separate, explicit permission — refused without its own scope.
    ok('contributing WITHOUT the contribute consent is refused (separate permission)',
       (await call('/api/me/sources/contribute', tokB, { method: 'POST', body: { source: 'fitness', data: [{ date: '2026-07-01' }] } })).status === 403);
    await call('/api/me/consent', tokB, { method: 'POST', body: { scope: 'external:fitness:contribute', granted: true } });
    const cont = await call('/api/me/sources/contribute', tokB, { method: 'POST', body: { source: 'fitness', data: [
      { date: '2026-07-01', note: 'felt strong, PB on squat' }, { date: '2026-07-01' }, { date: '2026-07-02' } ] } });
    ok('with consent, contribute distills raw into numbers for the record', cont.status === 200 && cont.j?.contributed >= 1);
    // Safeguard 2: numbers cross, content never — the returned audit has no text.
    ok('contribute returns only numbers (no raw content crosses the membrane)',
       (cont.j?.crossed || []).length > 0 && (cont.j.crossed).every(x => Number.isFinite(x.valueNum) && !('note' in x) && !('text' in x)));
    // Safeguard 3: visible audit — the person can see exactly what crossed.
    const audit = await call('/api/me/contributions', tokB);
    ok('the person can list exactly what crossed (visible audit)',
       audit.status === 200 && (audit.j?.contributions || []).some(x => Number.isFinite(x.valueNum)));
    ok('the audit exposes numbers only — never note/subject/content fields',
       (audit.j?.contributions || []).every(x => !('note' in x) && !('valueText' in x) && !('content' in x)));
    // Safeguard 3b: revocable — turning it off blocks further contribution.
    await call('/api/me/consent', tokB, { method: 'POST', body: { scope: 'external:fitness:contribute', granted: false } });
    ok('turning Contribute off blocks further crossing (revocable)',
       (await call('/api/me/sources/contribute', tokB, { method: 'POST', body: { source: 'fitness', data: [{ date: '2026-07-03' }] } })).status === 403);
    // Safeguard 4: org-safe — contributed data is not third-party sensitive text.
    const contSrcs = await call('/api/me/sources', tokB);
    ok('contribute consent is tracked distinctly from insight and assist',
       (contSrcs.j?.sources || []).find(s => s.id === 'fitness')?.contributeConsented === false);

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
    // Agentic builder: a plain-language goal drafts a real assessment (fallback w/o key).
    ok('a member cannot use the agentic assessment builder (403)',
       (await call('/api/assessments/draft', tokB, { method: 'POST', body: { goal: 'x' } })).status === 403);
    const adraft = await call('/api/assessments/draft', tokCoach, { method: 'POST', body: { goal: 'a weekly review that helps a new hire reflect on wins and blockers' } });
    ok('the builder drafts a real assessment from a plain-language goal',
       adraft.status === 200 && adraft.j?.draft?.title && Array.isArray(adraft.j.draft.fields) && adraft.j.draft.fields.length >= 1);
    // Planning agent — reasons over the team, returns insight + plan + allocation + sequence.
    ok('a member cannot use the planning agent (403)',
       (await call('/api/assessments/plan', tokB, { method: 'POST', body: { goal: 'x' } })).status === 403);
    const plan = await call('/api/assessments/plan', tokCoach, { method: 'POST', body: { goal: 'strengthen the group\'s weakest area this week, playing to strengths' } });
    ok('the planning agent returns insight + a plan + an order',
       plan.status === 200 && typeof plan.j?.insight === 'string' && plan.j?.plan?.title && Array.isArray(plan.j.sequence) && plan.j.sequence.length >= 1);
    ok('allocation only ever names real people on the team (never invented)',
       Array.isArray(plan.j?.allocation) && plan.j.allocation.every(a => a.name === 'Member B' || a.name === 'Coach'));
    // Conversational builder — reasons back, grounded in the team data.
    const planChat = await call('/api/assessments/plan/chat', tokCoach, { method: 'POST', body: { message: 'I want to run a high-intensity session for everyone this week.' } });
    ok('the builder reasons back conversationally (partner, not a form)',
       planChat.status === 200 && typeof planChat.j?.reply === 'string' && planChat.j.reply.length > 0);
    ok('a member cannot use the conversational builder (403)',
       (await call('/api/assessments/plan/chat', tokB, { method: 'POST', body: { message: 'hi' } })).status === 403);
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
    // Interactive assignment — the assignee can discuss it with the agent (before submitting).
    const chat = await call(`/api/assessments/${asgId}/discuss`, tokB, { method: 'POST', body: { message: 'How should I approach this?' } });
    ok('the assignee can discuss the assignment with IntelliQ (interactive)',
       chat.status === 200 && typeof chat.j?.reply === 'string' && chat.j.reply.length > 0);
    const strangerChat = await call(`/api/assessments/${asgId}/discuss`, tokA, { method: 'POST', body: { message: 'hi' } });
    ok('an unrelated person cannot discuss the assignment', strangerChat.status === 403 || strangerChat.status === 404);
    const sub = await call(`/api/assessments/${asgId}/submit`, tokB, { method: 'POST', body: { response: { 'What went well': 'clear progress', 'What was hard': 'time pressure' }, note: 'done' } });
    ok('the assignee fills and returns it (status submitted)', sub.status === 200 && sub.j?.assignment?.status === 'submitted');
    // IntelliQ reads the responses and proposes a summary + reasoning score (leader edits).
    const summ = await call(`/api/assessments/${asgId}/summarize`, tokCoach, { method: 'POST' });
    ok('IntelliQ summarises the responses and suggests a score for the leader',
       summ.status === 200 && summ.j?.ok === true && typeof summ.j.summary === 'string');
    ok('a plain member cannot summarise someone\'s assignment (403)',
       (await call(`/api/assessments/${asgId}/summarize`, tokB, { method: 'POST' })).status === 403);
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

    // ── Proactive early-warning: leader-scoped, contentless, splits emerging/now ──
    const watch = await call('/api/intelligence/watch', tokCoach);
    ok('a leader gets the proactive watch surface (emerging / attention / rising)',
       watch.status === 200 && watch.j?.ok === true && Array.isArray(watch.j.emerging) && Array.isArray(watch.j.attention) && typeof watch.j.scanned === 'number');
    ok('the watch surface never leaks raw content (contentless)',
       !/valueText|passwordHash|"content"/.test(JSON.stringify(watch.j || {})));
    ok('a plain member cannot see the proactive watch (403)',
       (await call('/api/intelligence/watch', tokB)).status === 403);

    // ── Prepared interventions: draft → approve → it lands in the person's queue ──
    const prep = await call('/api/intelligence/prepare', tokCoach, { method: 'POST', body: { memberId: bId, kind: 'support' } });
    ok('a leader can have IntelliQ PREPARE a supportive step (drafted, not sent)',
       prep.status === 200 && prep.j?.draft?.title && typeof prep.j.draft.message === 'string');
    ok('preparing a step for someone outside your range is refused',
       (await call('/api/intelligence/prepare', tokB, { method: 'POST', body: { memberId: coachId } })).status === 403);
    const deliver = await call('/api/intelligence/deliver', tokCoach, { method: 'POST', body: { memberId: bId, title: prep.j.draft.title, description: prep.j.draft.description, fields: prep.j.draft.fields } });
    ok('approving delivers it as a real assignment in the person\'s queue', deliver.status === 200 && deliver.j?.assignment?.assigneeId === bId);
    const bQueue = await call('/api/assessments', tokB);
    ok('the delivered step actually appears for the person',
       (bQueue.j?.assigned || []).some(a => a.id === deliver.j.assignment.id && a.status === 'assigned'));

    // ── Success patterns: what's working + replicate it across the team ─────
    const success = await call('/api/intelligence/success', tokCoach);
    ok('a leader gets the success-pattern surface (rising + common factors)',
       success.status === 200 && Array.isArray(success.j?.rising) && Array.isArray(success.j?.commonFactors));
    ok('the success surface never leaks raw content (contentless)',
       !/valueText|passwordHash|"content"/.test(JSON.stringify(success.j || {})));
    const repl = await call('/api/intelligence/prepare', tokCoach, { method: 'POST', body: { kind: 'replicate', factor: 'clear communication', sourceName: 'Member B' } });
    ok('IntelliQ drafts a team-wide "replicate what works" step', repl.status === 200 && repl.j?.toTeam === true && repl.j?.draft?.title);
    const teamSend = await call('/api/intelligence/deliver', tokCoach, { method: 'POST', body: { toTeam: true, title: repl.j.draft.title, description: repl.j.draft.description, fields: repl.j.draft.fields } });
    ok('approving sends the replicate step to the whole team', teamSend.status === 200 && teamSend.j?.sent >= 1);

    // ── Proactive PLAN drafting + the "want me to…" prompts on the briefing ──
    const teamPlan = await call('/api/intelligence/prepare', tokCoach, { method: 'POST', body: { kind: 'plan', theme: 'a busy week ahead' } });
    ok('IntelliQ drafts a forward-looking team plan around a theme', teamPlan.status === 200 && teamPlan.j?.toTeam === true && teamPlan.j?.draft?.title && typeof teamPlan.j.draft.message === 'string');
    ok('a plain member cannot ask IntelliQ to draft a plan (403)',
       (await call('/api/intelligence/prepare', tokB, { method: 'POST', body: { kind: 'plan', theme: 'x' } })).status === 403);
    const brief = await call('/api/intelligence/briefing', tokCoach);
    ok('the leader briefing carries proactive prompts (want me to…)',
       brief.status === 200 && Array.isArray(brief.j?.prompts));
    ok('every prompt is actionable (has text + a CTA action) and contentless',
       (brief.j?.prompts || []).every(p => typeof p.text === 'string' && p.cta && typeof p.cta.action === 'string') &&
       !/valueText|passwordHash|"content"/.test(JSON.stringify(brief.j?.prompts || [])));

    // ── Assessment-learning loop: which assessments precede improvement/decline ──
    const working = await call('/api/intelligence/whats-working', tokCoach);
    ok('a leader gets the assessment-outcome report (working / revisit)',
       working.status === 200 && working.j?.ok === true && Array.isArray(working.j.working) && Array.isArray(working.j.revisit) && typeof working.j.total === 'number');
    ok('the returned assessment is counted as an outcome (total >= 1)', working.j?.total >= 1);
    ok('the outcome report is grounded and contentless (no raw text/secrets)',
       !/valueText|passwordHash|"content"/.test(JSON.stringify(working.j || {})));
    ok('a plain member cannot see the assessment-outcome report (403)',
       (await call('/api/intelligence/whats-working', tokB)).status === 403);
    // Discoveries — how the org learns (leader-gated, contentless).
    const disc = await call('/api/intelligence/discoveries', tokCoach);
    ok('a leader gets the discoveries surface (how the org learns)',
       disc.status === 200 && disc.j?.ok === true && Array.isArray(disc.j.discoveries) && typeof disc.j.note === 'string');
    ok('discoveries are scoped (organisation vs team) to who the leader manages',
       disc.j?.scope === 'organisation' || disc.j?.scope === 'team');
    ok('discoveries never leak raw content', !/passwordHash|valueText|"content":/.test(JSON.stringify(disc.j || {})));
    ok('a plain member cannot see discoveries (403)',
       (await call('/api/intelligence/discoveries', tokB)).status === 403);
    // Per-member nudges ride along with the individual profile the leader sees.
    const prof = await call(`/api/member/${bId}/profile`, tokCoach);
    ok('the individual profile carries assessment nudges (repeat/revisit)',
       prof.status === 200 && Array.isArray(prof.j?.assessmentNudges));

    // ── The Studio: conversation-first space, media + planning feed the kernel ──
    ok('the Studio requires auth (401 without a token)', (await call('/api/studio', null)).status === 401);
    const studio0 = await call('/api/studio', tokB);
    ok('the Studio returns the caller\'s space (opening, assigned, pins, plans)',
       studio0.status === 200 && studio0.j?.ok === true && Array.isArray(studio0.j.assigned) && Array.isArray(studio0.j.plans) && typeof studio0.j.canTranscribe === 'boolean');
    ok('the Studio carries a proactive field (remembers where you left off)', 'proactive' in (studio0.j || {}));
    // Assessment templates carry their track record (avg outcome / uses / last used).
    const tplList = await call('/api/assessments', tokCoach);
    const seededTpl = (tplList.j?.templates || []).find(t => Number.isFinite(t.uses));
    ok('assessment templates expose a track record (uses / avgOutcome / lastUsed / verdict)',
       tplList.status === 200 && seededTpl && 'avgOutcome' in seededTpl && 'lastUsed' in seededTpl && 'verdict' in seededTpl);
    ok('templates carry an evidence label + playbook stage', seededTpl && typeof seededTpl.evidence === 'string' && typeof seededTpl.stage === 'string');
    // Lifecycle curation — a leader archives a template; a member cannot.
    const someTplId = (tplList.j?.templates || [])[0]?.id;
    ok('a leader can move a template to a playbook stage (archive)',
       someTplId && (await call(`/api/assessments/templates/${someTplId}/stage`, tokCoach, { method: 'POST', body: { stage: 'archived' } })).j?.stage === 'archived');
    ok('an invalid stage is refused (400)',
       someTplId && (await call(`/api/assessments/templates/${someTplId}/stage`, tokCoach, { method: 'POST', body: { stage: 'nope' } })).status === 400);
    ok('a plain member cannot curate the playbook (403)',
       someTplId && (await call(`/api/assessments/templates/${someTplId}/stage`, tokB, { method: 'POST', body: { stage: 'active' } })).status === 403);
    const schat = await call('/api/studio/chat', tokB, { method: 'POST', body: { message: 'I want to plan a calmer week and get one hard thing done.', savePlan: true } });
    ok('talking in the Studio returns a reply and saves the plan', schat.status === 200 && typeof schat.j?.reply === 'string' && schat.j.planSaved === true);
    ok('an empty Studio message is refused (400)', (await call('/api/studio/chat', tokB, { method: 'POST', body: {} })).status === 400);
    const studio1 = await call('/api/studio', tokB);
    const planId = (studio1.j?.plans || [])[0]?.id;
    ok('the saved plan now shows in the Studio, and prior turns persist',
       (studio1.j?.plans || []).length >= 1 && (studio1.j?.messages || []).length >= 2);
    ok('a Studio input becomes a private kernel signal (planning counts)',
       (await call('/api/me/export', tokB)).j?.signals?.some(s => s.source === 'studio'));
    ok('marking a plan done clears it from the open list',
       planId && (await call('/api/studio/plan/' + planId, tokB, { method: 'POST', body: { done: true } })).status === 200 &&
       !((await call('/api/studio', tokB)).j?.plans || []).some(p => p.id === planId));
    ok('voice transcription degrades honestly with no key (503, not a fake transcript)',
       (await call('/api/studio/transcribe', tokB, { method: 'POST', body: { audio: 'AAAA', mimetype: 'audio/webm' } })).status === 503);
    // "Our strength is data in" — a spreadsheet/stat block is deciphered into real
    // numeric signals WITHOUT any AI key (deterministic extraction), never thrown away.
    const csv = Buffer.from('metric,value\nsprint distance,2.1\npasses,45\nturnovers,3\n').toString('base64');
    const withFile = await call('/api/studio/chat', tokB, { method: 'POST', body: { message: 'Here are this week\'s numbers', media: { name: 'week.csv', kind: 'csv' }, attachment: { name: 'week.csv', mimetype: 'text/csv', data: csv } } });
    ok('attaching a spreadsheet returns a reply confirming the numbers were captured',
       withFile.status === 200 && typeof withFile.j?.reply === 'string' && /pulled\s+\d+\s+number/i.test(withFile.j.reply));
    ok('extracted numbers become real metric signals the kernel can reason over',
       (await call('/api/me/export', tokB)).j?.signals?.some(s => s.source === 'metric' && s.data?.extracted && Number.isFinite(s.valueNum)));
    // Named team-import: a leader uploads a roster table → each row maps to a member.
    const roster = Buffer.from('email,sprint,passes\nb@t.co,7.2,44\ncoach@t.co,9.1,60\nnobody@x.co,5,5\n').toString('base64');
    const imp = await call('/api/studio/chat', tokCoach, { method: 'POST', body: { message: 'team GPS export', media: { name: 'squad.csv', kind: 'csv' }, attachment: { name: 'squad.csv', mimetype: 'text/csv', data: roster } } });
    ok('a leader\'s team spreadsheet imports per-person and reports matched/unmatched',
       imp.status === 200 && imp.j?.imported && imp.j.imported.importedMembers >= 2 && imp.j.imported.totalMetrics >= 4 && (imp.j.imported.unmatched || []).length === 1);
    ok('imported team metrics land on the RIGHT member\'s record',
       (await call('/api/me/export', tokB)).j?.signals?.some(s => s.source === 'metric' && /sprint|passes/i.test(s.label || '') && s.data?.imported));
    // Office: Excel and Word are read with no dependencies (unit round-trip).
    const office = require('../lib/office');
    const zip = (ents) => { const L=[],C=[]; let o=0; for(const[n,d]of ents){const nb=Buffer.from(n),db=Buffer.isBuffer(d)?d:Buffer.from(d);const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt32LE(db.length,18);lh.writeUInt32LE(db.length,22);lh.writeUInt16LE(nb.length,26);L.push(Buffer.concat([lh,nb,db]));const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt32LE(db.length,20);cd.writeUInt32LE(db.length,24);cd.writeUInt16LE(nb.length,28);cd.writeUInt32LE(o,42);C.push(Buffer.concat([cd,nb]));o+=lh.length+nb.length+db.length;} const cdB=Buffer.concat(C),lB=Buffer.concat(L);const e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(ents.length,8);e.writeUInt16LE(ents.length,10);e.writeUInt32LE(cdB.length,12);e.writeUInt32LE(lB.length,16);return Buffer.concat([lB,cdB,e]); };
    const xlsx = zip([['xl/sharedStrings.xml','<sst><si><t>passes</t></si></sst>'],['xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2"><v>45</v></c></row></sheetData></worksheet>']]);
    ok('Excel (.xlsx) is read with no dependencies', /passes[\s\S]*45/.test(office.xlsxToText(xlsx) || ''));
    const docx = zip([['word/document.xml','<w:document><w:body><w:p><w:r><w:t>Recovery plan</w:t></w:r></w:p></w:body></w:document>']]);
    ok('Word (.docx) is read with no dependencies', /Recovery plan/.test(office.docxToText(docx) || ''));

    // ── Universal ingest: one authenticated pipe any app can push data to ──
    ok('a plain member cannot mint an org ingest token (403)',
       (await call('/api/org/ingest-token', tokB, { method: 'POST' })).status === 403);
    const mint = await call('/api/org/ingest-token', tokCoach, { method: 'POST' });
    ok('an admin can mint an ingest token', mint.status === 200 && typeof mint.j?.token === 'string' && mint.j.token.startsWith('iq_ingest_'));
    ok('ingest is refused without a valid token (401)',
       (await call('/api/ingest', null, { method: 'POST', body: { records: [{ email: 'b@t.co', label: 'X', value: 5 }] } })).status === 401);
    const ing = await call('/api/ingest', null, { method: 'POST', headers: { Authorization: 'Bearer ' + mint.j.token }, body: { records: [
      { email: 'b@t.co', label: 'Soreness', value: 7, date: '2026-07-20' },
      { email: 'nobody@t.co', label: 'X', value: 3 },
      { email: 'b@t.co', label: 'NoNumber', value: 'abc' } ] } });
    ok('a valid token ingests numeric records and reports matched/unmatched',
       ing.status === 200 && ing.j?.imported === 1 && ing.j?.unmatched === 1);
    const expIng = await call('/api/me/export', tokB);
    ok('ingested data lands in the person\'s record as a signal',
       (expIng.j?.signals || []).some(s => s.label === 'Soreness' && s.valueNum === 7));
    // The universal mapper: a WIDE row in any shape (person + several numbers) works.
    const wide = await call('/api/ingest', null, { method: 'POST', headers: { Authorization: 'Bearer ' + mint.j.token }, body: { source: 'anyapp', records: [{ email: 'b@t.co', sprint: 7.4, passes: 51, turnovers: 2 }] } });
    ok('the universal mapper deciphers ANY shape (a wide row → several signals)',
       wide.status === 200 && wide.j?.imported === 3 && wide.j?.people === 1);
    ok('mapped numbers land as signals under their own field names',
       (await call('/api/me/export', tokB)).j?.signals?.some(s => /sprint|passes|turnovers/i.test(s.label || '') && s.source === 'anyapp'));
    ok('ingested signals carry provenance (source provider + retrieved_at)',
       (await call('/api/me/export', tokB)).j?.signals?.some(s => s.source === 'anyapp' && s.data?.source?.provider && s.data.source.retrieved_at));
    // Identity resolution surfaces confidence — an ambiguous name is skipped, never merged.
    const amb = await call('/api/ingest', null, { method: 'POST', headers: { Authorization: 'Bearer ' + mint.j.token }, body: { source: 'anyapp', records: [{ email: 'b@t.co', rpe: 6 }, { name: 'Nobody Real', rpe: 5 }] } });
    ok('unresolved people are reported, not silently written',
       amb.status === 200 && amb.j?.unmatched >= 1 && amb.j?.matched >= 1);
    // The capability contract is published.
    const man = await call('/api/connectors/manifest', tokCoach);
    ok('the connector manifest publishes the capability contract',
       man.status === 200 && Array.isArray(man.j?.primitives) && man.j.primitives.includes('observation') && man.j?.capabilities?.read?.includes('calendar.read') && man.j?.connectors?.strava);
    ok('the manifest also publishes the evidence contract (types + confidence + lifecycle)',
       Array.isArray(man.j?.evidenceTypes) && man.j.evidenceTypes.includes('metric') && man.j?.confidenceStates?.includes('unmatched') && man.j?.lifecycleStates?.includes('superseded'));

    // ── Canonical evidence layer: every record crosses the envelope boundary ──
    const evAll = await call('/api/evidence', tokCoach);
    ok('the evidence audit trail is admin-visible and summarised',
       evAll.status === 200 && evAll.j?.summary && typeof evAll.j.summary.total === 'number' && Array.isArray(evAll.j.evidence));
    ok('a plain member cannot read the evidence audit trail (403)',
       (await call('/api/evidence', tokB)).status === 403);
    ok('every promoted signal traces back to a stored envelope (id + confidence + rawRef)',
       evAll.j.evidence.some(e => e.provider === 'anyapp' && e.subjectId === bId && e.rawRef && (e.confidence === 'confirmed' || e.confidence === 'probable') && e.promoted === true));
    ok('the promoted signal carries the evidence id in its provenance',
       (await call('/api/me/export', tokB)).j?.signals?.some(s => s.source === 'anyapp' && s.data?.source?.evidence_id));
    // Unmatched people are STORED (auditable, re-resolvable) but never promoted.
    const evUnmatched = await call('/api/evidence?confidence=unmatched', tokCoach);
    ok('unmatched evidence is retained for audit but not promoted to a signal',
       evUnmatched.j?.evidence?.length >= 1 && evUnmatched.j.evidence.every(e => e.promoted === false && !e.subjectId));
    // Deduplication: an identical re-send collapses (webhook retry / overlapping sync).
    const dup1 = await call('/api/ingest', null, { method: 'POST', headers: { Authorization: 'Bearer ' + mint.j.token }, body: { source: 'dedup', records: [{ email: 'b@t.co', label: 'DedupTest', value: 42, date: '2026-07-22' }] } });
    const dup2 = await call('/api/ingest', null, { method: 'POST', headers: { Authorization: 'Bearer ' + mint.j.token }, body: { source: 'dedup', records: [{ email: 'b@t.co', label: 'DedupTest', value: 42, date: '2026-07-22' }] } });
    ok('the first send imports; an identical re-send is deduped (imported 0)',
       dup1.j?.imported === 1 && dup2.j?.imported === 0 && dup2.j?.duplicates >= 1);

    // ── Identity review queue + resolution lifecycle ──────────────────────────
    // Ingest a record for a name that doesn't exist → it lands as unmatched.
    await call('/api/ingest', null, { method: 'POST', headers: { Authorization: 'Bearer ' + mint.j.token }, body: { source: 'roster', records: [{ email: 'ghost@t.co', label: 'MysteryLoad', value: 55, date: '2026-05-01' }] } });
    const review = await call('/api/identity/review', tokCoach);
    ok('the identity review queue is admin-visible with the four buckets',
       review.status === 200 && review.j?.counts && Array.isArray(review.j.unmatched) && review.j.unmatched.some(e => e.subjectRef === 'ghost@t.co'));
    ok('a plain member cannot see the identity review queue (403)',
       (await call('/api/identity/review', tokB)).status === 403);
    const ghost = review.j.unmatched.find(e => e.subjectRef === 'ghost@t.co');
    ok('a plain member cannot resolve evidence (403)',
       (await call(`/api/evidence/${ghost.id}/resolve`, tokB, { method: 'POST', body: { subjectId: bId } })).status === 403);
    // Admin confirms the person → resolve + promote once, preserving observed time.
    const resolved = await call(`/api/evidence/${ghost.id}/resolve`, tokCoach, { method: 'POST', body: { subjectId: bId } });
    ok('an admin can confirm a subject and it promotes to a signal',
       resolved.status === 200 && resolved.j?.promoted === true && resolved.j.subjectId === bId);
    ok('the late-promoted signal keeps its ORIGINAL observed date (no false alert)',
       (await call('/api/me/export', tokB)).j?.signals?.some(s => s.label === 'MysteryLoad' && String(s.ts).startsWith('2026-05-01')));
    ok('resolving an already-promoted envelope again is refused (promote-once)',
       (await call(`/api/evidence/${ghost.id}/resolve`, tokCoach, { method: 'POST', body: { subjectId: bId } })).status === 409);
    // Reversal removes the emitted signal and returns the envelope to unmatched.
    const reversed = await call(`/api/evidence/${ghost.id}/reverse`, tokCoach, { method: 'POST', body: { reason: 'wrong person' } });
    ok('an admin can reverse a resolution (real: the signal is removed)',
       reversed.status === 200 && !(await call('/api/me/export', tokB)).j?.signals?.some(s => s.label === 'MysteryLoad'));

    // ── Mapping approval lifecycle (interpretation boundary) ──────────────────
    // Seed a proposed mapping directly (a connector run would create one on hold).
    (orgMappings[CODE] = orgMappings[CODE] || []).push({
      id: 'map_test1', org: CODE, provider: 'vendorX', connector: 'vendorX', sourceObject: 'vendorX',
      schemaFingerprint: 'abc', schemaFields: ['email', 'load'], schemaTypes: { email: 'str', load: 'num' },
      subjectField: 'email', dateField: 'date', eventField: null,
      fields: [{ from: 'load', primitive: 'metric', evidenceType: 'metric', label: 'Load', unit: 'au', transform: { scale: 2 }, include: true }],
      requiredFields: ['email', 'load'], optionalFields: ['date'], identityStrategy: 'email', visibilityDefault: 'normal',
      proposedBy: 'system', approvedBy: null, approvedAt: null,
      testSample: [{ email: 'b@t.co', load: 5, date: '2026-06-01' }], expectedOutput: null,
      version: 1, status: 'proposed', createdAt: new Date().toISOString(), audit: [],
    });
    ok('a plain member cannot see the mapping registry (403)', (await call('/api/mappings', tokB)).status === 403);
    const mList = await call('/api/mappings', tokCoach);
    ok('the mapping version history is admin-visible', mList.status === 200 && mList.j.mappings.some(m => m.id === 'map_test1'));
    const awaiting = await call('/api/mappings/awaiting', tokCoach);
    ok('the awaiting-review queue lists the proposed mapping', awaiting.j?.mappings?.some(m => m.id === 'map_test1' && m.status === 'proposed'));
    const prev = await call('/api/mappings/map_test1/preview', tokCoach, { method: 'POST', body: {} });
    ok('preview transforms the sample deterministically (load 5 × scale 2 → 10)',
       prev.status === 200 && prev.j?.preview?.samples?.[0]?.output?.[0]?.value === 10);
    ok('a plain member cannot approve a mapping (403)', (await call('/api/mappings/map_test1/approve', tokB, { method: 'POST' })).status === 403);
    ok('an admin can approve a proposed mapping', (await call('/api/mappings/map_test1/approve', tokCoach, { method: 'POST' })).j?.mapping?.status === 'approved');
    ok('an admin can activate an approved mapping', (await call('/api/mappings/map_test1/activate', tokCoach, { method: 'POST' })).j?.mapping?.status === 'active');
    const edited = await call('/api/mappings/map_test1/edit', tokCoach, { method: 'POST', body: { patch: { visibilityDefault: 'sensitive' } } });
    ok('editing an active mapping forks a NEW draft version (immutability)',
       edited.j?.mapping?.status === 'draft' && edited.j.mapping.version === 2 && edited.j.mapping.id !== 'map_test1');

    // ── Connections: connect to anything with a URL (admin-gated, SSRF-guarded) ──
    ok('a plain member cannot create a connection (403)',
       (await call('/api/connections', tokB, { method: 'POST', body: { url: 'https://example.com/data' } })).status === 403);
    ok('a private/internal URL is refused (SSRF guard)',
       (await call('/api/connections', tokCoach, { method: 'POST', body: { name: 'x', url: 'http://169.254.169.254/latest' } })).status === 400);
    const conn = await call('/api/connections', tokCoach, { method: 'POST', body: { name: 'GPS vendor', url: 'https://example.com/api/gps', scheduleHours: 12, source: 'gps' } });
    ok('an admin can create a connection to any public URL', conn.status === 200 && conn.j?.connection?.id && conn.j.connection.scheduleHours === 12);
    ok('connections list never leaks the auth header VALUES (keys only)',
       (await call('/api/connections', tokCoach)).j?.connections?.some(c => c.id === conn.j.connection.id) &&
       !/authorization"?\s*:\s*"?Bearer/i.test(JSON.stringify((await call('/api/connections', tokCoach)).j || {})));
    const runConn = await call(`/api/connections/${conn.j.connection.id}/run`, tokCoach, { method: 'POST' });
    ok('running a connection reports a status (reachability handled gracefully)',
       runConn.status === 200 && typeof runConn.j?.connection?.lastStatus === 'string');

    // ── Sync reliability: health, run history, controls, dead-letter, webhooks ──
    const cid = conn.j.connection.id;
    const connHealth = await call(`/api/connections/${cid}/health`, tokCoach);
    ok('a connection exposes a health status + reason + staleness',
       connHealth.status === 200 && typeof connHealth.j?.health?.status === 'string' && typeof connHealth.j?.health?.reason === 'string' && !!connHealth.j?.staleness);
    ok('a plain member cannot see connection health (403)', (await call(`/api/connections/${cid}/health`, tokB)).status === 403);
    ok('run history is recorded and admin-visible',
       (await call(`/api/connections/${cid}/runs`, tokCoach)).j?.runs?.length >= 1);
    const connPaused = await call(`/api/connections/${cid}/pause`, tokCoach, { method: 'POST', body: { reason: 'maintenance' } });
    ok('an admin can pause a connection → health becomes paused',
       connPaused.j?.connection?.health === 'paused' && connPaused.j.connection.paused === true);
    ok('a paused connection does not run', (await call(`/api/connections/${cid}/run`, tokCoach, { method: 'POST' })).j?.result?.skipped === true);
    ok('an admin can resume a connection', (await call(`/api/connections/${cid}/resume`, tokCoach, { method: 'POST' })).j?.connection?.paused === false);
    ok('an admin can reset the cursor (audited)', (await call(`/api/connections/${cid}/cursor/reset`, tokCoach, { method: 'POST' })).status === 200);
    ok('a plain member cannot view the dead-letter queue (403)', (await call('/api/failures', tokB)).status === 403);
    ok('the dead-letter queue is admin-visible + org-scoped', (await call('/api/failures', tokCoach)).status === 200);
    // Webhooks: challenge echo, dedupe, and same-path processing (no secret set → open).
    const whChallenge = await call(`/api/webhooks/${CODE}/${cid}`, null, { method: 'POST', body: { type: 'url_verification', challenge: 'echo123' } });
    ok('a webhook verification challenge is echoed back', whChallenge.j?.challenge === 'echo123');
    const wh1 = await call(`/api/webhooks/${CODE}/${cid}`, null, { method: 'POST', headers: { 'X-Delivery-Id': 'dlv1' }, body: { records: [{ email: 'b@t.co', x: 1 }] } });
    const wh2 = await call(`/api/webhooks/${CODE}/${cid}`, null, { method: 'POST', headers: { 'X-Delivery-Id': 'dlv1' }, body: { records: [{ email: 'b@t.co', x: 1 }] } });
    ok('a duplicate webhook delivery id is ignored (idempotent)', wh1.j?.received === true && wh2.j?.duplicate === true);
    ok('an unknown webhook connection is rejected', (await call(`/api/webhooks/${CODE}/conn_nope`, null, { method: 'POST', body: {} })).status === 404);

    ok('a plain member cannot delete a connection (403)',
       (await call(`/api/connections/${conn.j.connection.id}`, tokB, { method: 'DELETE' })).status === 403);
    ok('an admin can delete a connection',
       (await call(`/api/connections/${conn.j.connection.id}`, tokCoach, { method: 'DELETE' })).status === 200);

    // ── OAuth2: one generic flow for Strava / Google / Microsoft / Hudl / Fitbit ──
    const cat = await call('/api/oauth/catalog', tokCoach);
    ok('the OAuth catalog lists real providers + a redirect URI',
       cat.status === 200 && Array.isArray(cat.j?.catalog) && cat.j.catalog.some(p => p.key === 'strava') && typeof cat.j.redirectUri === 'string');
    ok('a plain member cannot see the OAuth catalog (403)', (await call('/api/oauth/catalog', tokB)).status === 403);
    ok('connecting before the app is registered is refused with a clear message',
       (await call('/api/oauth/strava/start', tokCoach, { method: 'POST' })).status === 400);
    const setApp = await call('/api/oauth/app', tokCoach, { method: 'POST', body: { provider: 'strava', clientId: 'cid123', clientSecret: 'secret456' } });
    ok('an admin registers a provider\'s client id/secret', setApp.status === 200 && setApp.j?.configured === true);
    const start = await call('/api/oauth/strava/start', tokCoach, { method: 'POST' });
    ok('starting the flow returns a real provider login URL (client_id + state)',
       start.status === 200 && /strava\.com\/oauth\/authorize/.test(start.j?.authorizeUrl || '') && /client_id=cid123/.test(start.j.authorizeUrl) && /state=/.test(start.j.authorizeUrl));
    ok('the catalog now shows Strava as configured',
       (await call('/api/oauth/catalog', tokCoach)).j?.catalog?.some(p => p.key === 'strava' && p.configured === true));
    ok('client secrets are never returned by the catalog',
       !/secret456/.test(JSON.stringify((await call('/api/oauth/catalog', tokCoach)).j || {})));
    const cb = await call('/api/oauth/callback?state=bogus&code=x', null);
    ok('the OAuth callback rejects an unknown state (expired link)', cb.status === 400);

    // ── Domain packs: adaptive display language (kernel stays universal) ─────
    const meDom = await call('/api/auth/me', tokB);
    ok('auth/me carries a resolved domain vocabulary (person/group words)',
       meDom.status === 200 && meDom.j?.domain && typeof meDom.j.domain.vocab?.person === 'string' && typeof meDom.j.domain.vocab?.group === 'string');
    const domCat = await call('/api/org/domain', tokCoach);
    ok('domain catalog lists the packs with sample words',
       domCat.status === 200 && Array.isArray(domCat.j?.catalog) && domCat.j.catalog.some(p => p.id === 'sports') && domCat.j.catalog.every(p => p.sample?.person));
    ok('a plain member cannot change the org display language (403)',
       (await call('/api/org/domain', tokB, { method: 'POST', body: { pack: 'sports' } })).status === 403);
    const setDom = await call('/api/org/domain', tokCoach, { method: 'POST', body: { pack: 'sports' } });
    ok('an admin can select a domain pack and it renders in that vocabulary',
       setDom.status === 200 && setDom.j?.current?.id === 'sports' && setDom.j.current.vocab.person === 'player' && setDom.j.current.vocab.group === 'team');
    const afterSet = await call('/api/auth/me', tokB);
    ok('the chosen pack now flows through auth/me to every user',
       afterSet.j?.domain?.id === 'sports' && afterSet.j.domain.vocab.people === 'players');
    const setCustom = await call('/api/org/domain', tokCoach, { method: 'POST', body: { pack: 'education', vocab: { person: 'scholar' } } });
    ok('a custom word overrides the pack default (org is never boxed in)',
       setCustom.j?.current?.id === 'education' && setCustom.j.current.vocab.person === 'scholar' && setCustom.j.current.vocab.group === 'class');
    // A generated surface carries the vocabulary audit stamp AND, with no AI key,
    // its deterministic copy already speaks the pack's language (never hard-coded).
    await call('/api/org/domain', tokCoach, { method: 'POST', body: { pack: 'education' } });
    const briefDom = await call('/api/intelligence/briefing?refresh=1', tokCoach);
    ok('generated output is stamped with the vocabulary context (prompt audit)',
       briefDom.j?.domain?.pack === 'education' && typeof briefDom.j.domain.vocabVersion === 'string');
    ok('deterministic (no-AI) briefing copy uses the pack vocabulary (class/student), not generic nouns',
       /class|student/i.test(String(briefDom.j?.summary || '')) && !/\bgroup\b/i.test(String(briefDom.j?.summary || '')));

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
