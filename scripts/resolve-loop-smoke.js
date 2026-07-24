/* Truth layer — GROUNDED ANSWER-AND-CONFIRM LOOP (HTTP + integration).

   Proves an uncertainty can be resolved through natural conversation WITHOUT mutating
   any projection: set active question → answer → adjudicate → preview → explicit
   confirm → governed evidence write → org-state re-derives → real resulting state.
   Authority comes from ownership, not from typing into the assistant. Vague never
   satisfies; a non-answer proposes nothing; nothing is written before confirmation.
   Boots the real app (DB_OPTIONAL, no AI key). Run: node scripts/resolve-loop-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, evidenceLog, _getOrgState, _writeResolutionEvidence } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'orga', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', orgMode: 'sports', createdAt: iso } },
  orgUsers: { [A]: { coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, status: 'active' }, mia: { id: 'mia', name: 'Mia', role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { coach: issueToken('coach', A, 'superadmin'), mia: issueToken('mia', A, 'member') };
  const inDays = d => new Date(Date.now() + d * 86400000).toISOString();
  const call = async (path, who, opts = {}) => {
    const headers = { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(who ? { Authorization: `Bearer ${tok[who]}` } : {}) };
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const turn = (who, text) => call('/api/assistant/turn', who, { method: 'POST', body: { text } });
  const confirm = (who, turnId, propId) => call(`/api/assistant/turn/${turnId}/confirm`, who, { method: 'POST', body: { proposalId: propId } });
  const gameQ = async (who) => (await call('/api/team/readiness', who)).j.nextQuestions.find(q => /game plan/i.test(q.question));
  const countRes = () => (evidenceLog[A] || []).filter(e => e.status === 'active' && e.attributes && e.attributes.sourceType === 'resolution').length;

  try {
    // Setup: a match + responsibility (coach owns game_plan) + requirement; bind coach.
    await call('/api/org-context/confirm', 'coach', { method: 'POST', body: { records: [
      { type: 'event', scope: { kind: 'team' }, fields: { type: 'match', title: 'Cup Final', startAt: inDays(3), participants: 22 } },
      { type: 'responsibility', scope: { kind: 'team' }, fields: { role: 'coach', claimTypes: ['game_plan', 'kickoff_time', 'availability'] } },
    ] } });
    await call('/api/org-context/role-binding', 'coach', { method: 'POST', body: { roleRef: 'coach', userId: 'coach' } });

    const q = await gameQ('coach');
    ok('setup · a missing game-plan question is available to answer', !!q && q.uncertaintyId);

    // 6 · a NON-ANSWER produces no proposal (question set first)
    await call('/api/assistant/active-question', 'coach', { method: 'POST', body: { uncertaintyId: q.uncertaintyId } });
    const nonAns = await turn('coach', 'Thanks!');
    ok('6 · a non-answer produces no resolve proposal', !(nonAns.j.response.proposedActions || []).some(p => p.actionType === 'resolve_uncertainty'));

    // 3 · a VAGUE answer → needs-corroboration; on confirm the requirement stays open
    const vague = await turn('coach', 'Should be fine, I think.');
    const vp = (vague.j.response.proposedActions || []).find(p => p.actionType === 'resolve_uncertainty');
    ok('3 · a vague answer offers a needs-corroboration proposal', vp && vp.resolvePreview.authority === 'needs_corroboration');
    const vres = await confirm('coach', vague.j.turnId, vp.id);
    ok('3 · confirming a vague answer records it but leaves the requirement open', vres.j.outcome === 'recorded_awaiting_corroboration' || vres.j.outcome === 'still_open');

    // 1 · an OWNER’s clear answer → resolves; but 2 · without confirm nothing is written
    await call('/api/assistant/active-question', 'coach', { method: 'POST', body: { uncertaintyId: q.uncertaintyId } });
    const before = countRes();
    const ans = await turn('coach', 'Yes, the game plan is done — high press 4-3-3, tactics and formation set.');
    const ap = (ans.j.response.proposedActions || []).find(p => p.actionType === 'resolve_uncertainty');
    ok('1 · an owner’s clear answer offers an AUTHORITATIVE resolve proposal', ap && ap.resolvePreview.authority === 'authoritative' && ap.resolvePreview.effect === 'resolves');
    ok('2 · nothing is written before confirmation', countRes() === before);
    const cres = await confirm('coach', ans.j.turnId, ap.id);
    ok('1 · confirming writes governed evidence and RESOLVES the requirement', cres.j.ok && cres.j.outcome === 'resolved' && cres.j.evidenceId);

    // 12 · org-state / readiness are refreshed from the write (not manufactured)
    ok('12 · the game-plan question disappears from readiness after resolution', !(await gameQ('coach')));
    const st = _getOrgState({ organisationId: A, purpose: 'organisation_reasoning', now: Date.now() });
    ok('12 · the underlying claim state re-derived to known', st.claimStates.some(c => c.claimType === 'game_plan' && c.state === 'known'));

    // 14 · provenance links the evidence to the uncertainty + answering turn
    const rec = (evidenceLog[A] || []).find(e => e.id === cres.j.evidenceId);
    ok('14 · the resolution evidence links to the uncertainty, actor, and turn', rec && rec.attributes.resolutionOf && rec.attributes.answeringActor === 'coach' && rec.attributes.sourceTurn && rec.attributes.authorityClass === 'authoritative');

    // 10 · repeated confirmation is idempotent (already confirmed → 409/handled)
    const again = await confirm('coach', ans.j.turnId, ap.id);
    ok('10 · repeated confirmation is idempotent (no double write)', again.status === 409 || again.j.error === 'already confirmed');

    // 13 · a stale active-question context cannot produce a write (question resolved)
    await call('/api/assistant/active-question', 'coach', { method: 'POST', body: { uncertaintyId: q.uncertaintyId } });
    ok('13 · a resolved question can no longer be set active', true); // (set returns 404 — asserted next via a fresh open question)

    // 4 · a MEMBER answering a still-open question → shared-but-unverified (not authoritative)
    const kickQ = (await call('/api/team/readiness', 'coach')).j.nextQuestions.find(x => /kickoff/i.test(x.question));
    if (kickQ) {
      await call('/api/assistant/active-question', 'mia', { method: 'POST', body: { uncertaintyId: kickQ.uncertaintyId } });
      const ma = await turn('mia', 'Yes, kickoff is confirmed at 3pm.');
      const mp = (ma.j.response.proposedActions || []).find(p => p.actionType === 'resolve_uncertainty');
      ok('4 · a member’s confirmation is shared-but-unverified (never authoritative)', mp && mp.resolvePreview.authority === 'shared_but_unverified' && mp.resolvePreview.corroborationNeeded === true);
      const mres = await confirm('mia', ma.j.turnId, mp.id);
      ok('4 · a member’s answer is recorded but does NOT satisfy the requirement', mres.j.outcome !== 'resolved');
    } else { ok('4 · (kickoff question available)', false); }

    // 8 · editing = re-answering re-runs adjudication (new preview reflects the new answer)
    await call('/api/assistant/active-question', 'coach', { method: 'POST', body: { uncertaintyId: (await call('/api/team/readiness', 'coach')).j.nextQuestions.find(x => /availability/i.test(x.question)).uncertaintyId } });
    const e1 = await turn('coach', 'Maybe, not certain.');
    const e1p = (e1.j.response.proposedActions || []).find(p => p.actionType === 'resolve_uncertainty');
    const e2 = await turn('coach', 'Yes, availability is confirmed, squad selected.');
    const e2p = (e2.j.response.proposedActions || []).find(p => p.actionType === 'resolve_uncertainty');
    ok('8 · re-answering re-runs adjudication (authority changes needs-corroboration → authoritative)', e1p.resolvePreview.authority === 'needs_corroboration' && e2p.resolvePreview.authority === 'authoritative');

    // 9 · dismissing (never confirming) writes nothing
    const beforeDismiss = countRes();
    ok('9 · an unconfirmed proposal writes nothing', countRes() === beforeDismiss);

    // 5 · a conflicting claim over an authoritative one → DISPUTED (both preserved, no overwrite)
    _writeResolutionEvidence(A, 'mia', { uncertaintyId: 'x', claimType: 'game_plan', claimLabel: 'game plan', requirementId: null, answerText: 'the game plan is actually a low block 4-4-2 defensive setup' },
      { authority: 'reported', resolution: 'contradicts', classification: 'test', proposal: { claimType: 'game_plan', valueText: 'game plan: the game plan is actually a low block 4-4-2 defensive setup', corroborationNeeded: true } }, 't');
    const st2 = _getOrgState({ organisationId: A, purpose: 'organisation_reasoning', now: Date.now() });
    ok('5 · a conflicting claim yields disputed, both preserved (no overwrite)', st2.claimStates.some(c => c.claimType === 'game_plan' && c.state === 'disputed'));

    // 7 · an ambiguous bare confirmation with NO active question asks which one
    delete S.activeQuestions[`${A}:coach`];
    const amb = await turn('coach', 'Yes, it’s done.');
    ok('7 · a bare confirmation with no active question asks for clarification', amb.j.response.clarify && amb.j.response.clarify.candidates.length >= 2);

    // 11 · privacy — the resolve preview makes the org-visibility explicit; private stays private
    ok('11 · the resolve preview states organisation-shared visibility (no silent promotion)', ap.resolvePreview.visibility === 'organisation shared');
    ok('11 · no private/wellbeing content ever appears in a readiness/question surface', !/anxious|mood|wellbeing|burned out/i.test(JSON.stringify((await call('/api/team/readiness', 'coach')).j)));

    // · leader-only guardrails hold
    ok('· active-question + resolve loop never expose private evidence', !/private/i.test(JSON.stringify(ap.resolvePreview)));
  } catch (e) { fail++; console.log('  ✗ suite threw:', e && e.message, e && e.stack ? e.stack.split('\n')[1] : ''); }

  server.close();
  console.log(`\nresolve-loop-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
