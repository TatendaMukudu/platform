/* ============================================================
   scripts/assistant-runtime-smoke.js — the unified MyWorkspace assistant runtime (slice 1).

   Proves ONE assistant, ONE composer: input → claim-bounded interpretation → authorised
   context → kernel reasoning → audience-safe response → confirmable action PROPOSALS →
   explicit approval → routing through existing capabilities. Nothing is written to a
   capability store before confirmation; personal input is private by default; visibility
   never increases silently; the raw message is preserved separately from interpretations.

   HTTP end-to-end + static guards for the "no Studio-named architecture" invariant.

   Run:  node scripts/assistant-runtime-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs   = require('fs');
const path = require('path');
const srv  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, workspaceItems, evidenceLog, actionsLog, checkinProposals, assistantTurns } = srv;

const CODE = 'asrt';
const iso = new Date().toISOString();
const boss = 'boss', me = 'me';

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'AR Co', createdAt: iso } },
  orgUsers: { [CODE]: {
    [boss]: { id: boss, name: 'Boss', email: 'boss@ar.co', role: 'admin',  orgCode: CODE, supervisorId: null, status: 'active' },
    [me]:   { id: me,   name: 'Me',   email: 'me@ar.co',   role: 'member', orgCode: CODE, supervisorId: boss, status: 'active' },
  } },
});
_rebuildEmailIndex();
const tokMe   = issueToken(me,   CODE, 'member');
const tokBoss = issueToken(boss, CODE, 'admin');
const wsKey = `${CODE}:${me}`;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const server = app.listen(0, async () => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, tok, opts = {}) => {
    const headers = { ...(opts.headers || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(baseUrl + p, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const turn = (text) => call('/api/assistant/turn', tokMe, { method: 'POST', body: { text } });

  try {
    console.log('\n=== Unified MyWorkspace assistant runtime ===\n');

    // ── 1. One input → grounded insight + action proposal ──────────────────────
    // Seed a little owner context so an insight is available.
    await srv._recordCheckin(CODE, me, { text: 'I want to prepare well this week.', mood: 4 });  // seed via the canonical capability (route retired)
    const t1 = await turn('I need to prepare for the strategy meeting and I want a plan for it.');
    ok('1. one composer input yields BOTH a response and one or more action proposals',
       t1.status === 200 && typeof t1.j.response.responseText === 'string' && t1.j.response.proposedActions.length >= 1);
    const planProp = t1.j.response.proposedActions.find(p => p.actionType === 'capture');
    ok('  · the response distinguishes mode (insight/assist/combined)', ['insight', 'assist', 'combined'].includes(t1.j.response.mode));

    // ── 2 / 3. Private by default; work wording is NOT auto org-visible ─────────
    ok('2. personal composer input defaults to PRIVATE (only_me)', t1.j.interpretation.suggestedPrivacy.visibility === 'only_me');
    const t3 = await turn('This is work — I need to finish the quarterly report.');
    ok('3. work-related wording does NOT become organisation-visible automatically',
       t3.j.interpretation.suggestedPrivacy.visibility === 'only_me' && (t3.j.response.proposedActions.find(p => p.actionType === 'capture')?.visibility) === 'only_me');

    // ── 6 / 7. Original preserved; claims are not facts ────────────────────────
    const insp = await call(`/api/assistant/turn/${t1.j.turnId}`, tokMe);
    ok('6. the original message is preserved separately from interpretations (by ref)',
       insp.j.turn.rawInput === 'I need to prepare for the strategy meeting and I want a plan for it.' && !!insp.j.turn.originalInputRef);
    ok('7. candidate claims do NOT become facts (verifiedFact:false, not canonical yet)',
       t1.j.interpretation.candidateClaims.every(c => c.verifiedFact === false));
    ok('  · no canonical evidence was created by the turn itself', (evidenceLog[CODE] || []).every(e => e.provider !== 'assistant'));

    // ── 5. Sensitive input passes through the shared classifier ────────────────
    const tS = await turn('Honestly I have been struggling to cope and feel overwhelmed at home.');
    ok('5. sensitive input is classified sensitive/private by the shared classifier and kept private',
       tS.j.interpretation.suggestedPrivacy.visibility === 'only_me' && tS.j.interpretation.suggestedPrivacy.sensitivity !== 'normal');

    // ── 8 / 9. Context via authorised readers only; private stays owner-only ───
    ok('8. the assistant retrieves context via authorised readers (basis IDs + purpose retained, owner-only)',
       t1.j.context.purpose === 'personal_assistance' && t1.j.context.visibilityEligibility === 'owner-only' && Array.isArray(t1.j.context.basisIds));
    // A leader-support read of the member must not see the private capture (nothing was captured; and private stays owner-only).
    const leaderState = srv._checkinKernelState(CODE, me, { purpose: 'leader_support', viewerId: boss });
    ok('9. private evidence remains unavailable to leader-support purposes', leaderState.evidence.every(e => e.visibility !== 'private'));

    // ── 10 / 11. Nothing is saved before confirmation ─────────────────────────
    const wsBefore = (workspaceItems[wsKey] || []).length;
    ok('10. a proposed note/plan is NOT saved before confirmation', wsBefore === 0 || !(workspaceItems[wsKey] || []).some(i => /strategy meeting/.test(i.text)));
    ok('11. a proposed plan is not created before confirmation (no plan item yet)',
       !(workspaceItems[wsKey] || []).some(i => i.purpose === 'plan' && /strategy meeting/.test(i.text)));

    // Confirm the capture → NOW it persists through the workspace capability.
    const conf = await call(`/api/assistant/turn/${t1.j.turnId}/confirm`, tokMe, { method: 'POST', body: { proposalId: planProp.id } });
    ok('  · confirming routes the capture through the workspace capability (item created)',
       conf.status === 200 && conf.j.confirmed === 'capture' && (workspaceItems[wsKey] || []).some(i => i.id === conf.j.item.id));
    ok('  · the confirmed capture stayed PRIVATE (only_me)', conf.j.item.visibility === 'only_me');

    // ── 4. Visibility cannot increase without explicit confirmation ────────────
    const t4 = await turn('A quick note to keep for myself.');
    const capP = t4.j.response.proposedActions.find(p => p.actionType === 'capture');
    const blocked = await call(`/api/assistant/turn/${t4.j.turnId}/confirm`, tokMe, { method: 'POST', body: { proposalId: capP.id, overrides: { visibility: 'organization' } } });
    ok('4. visibility cannot increase without an explicit confirmation flag', blocked.status === 409 && /visibility_increase/.test(blocked.j.error));
    const allowed = await call(`/api/assistant/turn/${t4.j.turnId}/confirm`, tokMe, { method: 'POST', body: { proposalId: capP.id, overrides: { visibility: 'organization', confirmVisibilityIncrease: true } } });
    ok('  · an EXPLICIT confirmation is required and honoured', allowed.status === 200 && allowed.j.item.visibility === 'organization');

    // ── 12. Calendar action stays a draft/proposal before confirmation ─────────
    const tCal = await turn('Can you schedule a meeting to review the plan next week?');
    const calP = tCal.j.response.proposedActions.find(p => p.actionType === 'calendar_draft');
    ok('12a. a calendar action is offered as a PROPOSAL, not executed', !!calP && tCal.j.response.proposedActions.every(p => p.requiredApproval === true));
    const calConf = await call(`/api/assistant/turn/${tCal.j.turnId}/confirm`, tokMe, { method: 'POST', body: { proposalId: calP.id } });
    ok('12b. confirming a calendar action DRAFTS it (never auto-executes)',
       calConf.j.confirmed === 'calendar_draft' && (actionsLog[CODE] || []).some(a => a.id === calConf.j.action.id && a.status === 'drafted'));
    ok('17. the calendar action went through the universal action contract (recommend→draft, not executed)',
       (actionsLog[CODE] || []).find(a => a.id === calConf.j.action.id)?.stage === 'draft');

    // ── 13 / 14 / 15. Personalized check-in: basis + expiration; no resurfacing ─
    const tCk = await turn('Can you check in with me after the strategy meeting about my commitment?');
    const ckP = tCk.j.response.proposedActions.find(p => p.actionType === 'checkin_proposal');
    ok('15. a generic/personalised check-in is offered when the user asks for follow-up', !!ckP);
    const ckConf = await call(`/api/assistant/turn/${tCk.j.turnId}/confirm`, tokMe, { method: 'POST', body: { proposalId: ckP.id } });
    ok('13. a personalised check-in retains a basis and an expiration', !!ckConf.j.checkin.triggerAt && !!ckConf.j.checkin.expiresAt);
    const props = await call('/api/assistant/checkin-proposals', tokMe);
    ok('  · the registered check-in is listed with its basis/expiry (self-only)', (props.j.proposals || []).some(p => p.id === ckConf.j.checkin.id && p.why));
    const tCk2 = await turn('Please check in with me after the strategy meeting about my commitment again.');
    ok('14. an active check-in topic is not repeatedly resurfaced',
       !tCk2.j.response.proposedActions.some(p => p.actionType === 'checkin_proposal'));
    // Hardship alone never creates a check-in.
    const tHard = await turn('I feel completely overwhelmed and exhausted.');
    ok('  · a check-in is NOT created solely because hardship was detected', !tHard.j.response.proposedActions.some(p => p.actionType === 'checkin_proposal'));

    // ── 16. Correction changes the proposal, not the original message ──────────
    const t16 = await turn('Draft a plan for the launch.');
    const p16 = t16.j.response.proposedActions.find(p => p.actionType === 'capture');
    const corr = await call(`/api/assistant/turn/${t16.j.turnId}/correct`, tokMe, { method: 'POST', body: { proposalId: p16.id, correction: 'That is just a note, not a plan. Keep this private.' } });
    const insp16 = await call(`/api/assistant/turn/${t16.j.turnId}`, tokMe);
    ok('16. a correction updates the proposal (plan→note, private) WITHOUT altering the original message',
       corr.j.applied.includes('purpose→note') && insp16.j.turn.rawInput === 'Draft a plan for the launch.');

    // ── 18. The response distinguishes evidence, inference and proposal ────────
    ok('18. the response distinguishes grounded claims, inference and proposals',
       Array.isArray(t1.j.response.groundedClaims) && Array.isArray(t1.j.response.inferred) && Array.isArray(t1.j.response.proposedActions) && typeof t1.j.response.privacyNotice === 'string');

    // ── 20. No new Studio-named user-facing architecture ───────────────────────
    const runtimeSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const block = runtimeSrc.slice(runtimeSrc.indexOf('UNIFIED MYWORKSPACE ASSISTANT RUNTIME'), runtimeSrc.indexOf('POST /api/connections/:id/inspect'));
    ok('20. no new Studio-named architecture is introduced (unified assistant, MyWorkspace)',
       !/\/api\/studio|studioTurns|StudioAssistant/.test(block) && /assistant\/turn/.test(runtimeSrc));
    ok('20b. the frontend routes ONE composer through the unified runtime (no separate Me/Plans/Notes chat)',
       /\/api\/assistant\/turn/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'member-view.js'), 'utf8')));

    // ── Auth ───────────────────────────────────────────────────────────────────
    ok('E1. the assistant turn requires auth (401)', (await call('/api/assistant/turn', null, { method: 'POST', body: { text: 'x' } })).status === 401);
    ok('E2. a turn is self-only (another member cannot read it)', (await call(`/api/assistant/turn/${t1.j.turnId}`, tokBoss)).status === 404);

    console.log(`\n=== assistant-runtime-smoke: ${pass} passed, ${fail} failed ===\n`);
    server.close(() => process.exit(fail ? 1 : 0));
  } catch (e) {
    console.error(e);
    server.close(() => process.exit(1));
  }
});
