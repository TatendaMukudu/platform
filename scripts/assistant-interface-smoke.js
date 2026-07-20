/* ============================================================
   scripts/assistant-interface-smoke.js — unified MyWorkspace interface (slice 1).

   The interface consumes the existing assistant-turn runtime through ONE composer and
   contextual lenses (a bounded hint, not a separate truth path). No browser harness exists
   here, so UI contracts are proven by HTTP (lens hint, prioritised set, attention, draft
   honesty) + static source guards (one composer/endpoint, one IntelliQ identity, proposal
   cards, check-in UI, attention routing, no reintroduced score judgment, no Studio/Advisor).

   Run:  node scripts/assistant-interface-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs   = require('fs');
const path = require('path');
const srv  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = srv;

const CODE = 'asif';
const iso = new Date().toISOString();
const me = 'me';
_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'IF Co', createdAt: iso } },
  orgUsers: { [CODE]: { [me]: { id: me, name: 'Me', email: 'me@if.co', role: 'member', orgCode: CODE, status: 'active' } } },
});
_rebuildEmailIndex();
const tokMe = issueToken(me, CODE, 'member');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const mv = read('js/member-view.js'), ui = read('js/ui.js'), html = read('index.html'), css = read('css/member.css');

const server = app.listen(0, async () => {
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, opts = {}) => {
    const headers = { Authorization: `Bearer ${tokMe}` }; if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(baseUrl + p, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j };
  };
  const turn = (text, lens) => call('/api/assistant/turn', { method: 'POST', body: { text, lens } });

  try {
    console.log('\n=== Unified MyWorkspace interface ===\n');

    // ── 1. All lenses use the SAME assistant-turn endpoint ─────────────────────
    let allOk = true;
    for (const L of ['today', 'me', 'work', 'notes', 'plans', 'history']) {
      const r = await turn('Schedule a meeting and keep a note for the launch plan.', L);
      if (r.status !== 200 || r.j.lens !== L) allOk = false;
    }
    ok('1. every lens routes through the same /api/assistant/turn endpoint', allOk);
    ok('19. exactly one assistant turn endpoint exists (no per-lens/duplicate assistant routes)',
       (srv._assistantTurn && true) && !/\/api\/assistant\/(today|me|work|notes|plans|history)\b/.test(read('server.js')));

    // ── 4. The lens is a BOUNDED hint — same context, only emphasis changes ────
    const tToday = await turn('Schedule a meeting and note the launch plan.', 'today');
    const tNotes = await turn('Schedule a meeting and note the launch plan.', 'notes');
    ok('4. lens changes context EMPHASIS only — the authorised context (basis) is identical',
       JSON.stringify(tToday.j.context.basisIds) === JSON.stringify(tNotes.j.context.basisIds) && tToday.j.context.purpose === tNotes.j.context.purpose);
    const firstOf = t => (t.j.response.primaryActions[0] || {}).actionType;
    ok('  · the lens re-orders which proposal leads (today→calendar, notes→capture)',
       firstOf(tToday) === 'calendar_draft' && firstOf(tNotes) === 'capture');

    // ── 3. Lens changes do not create separate assistant identities ────────────
    ok('3. lens changes do not create separate assistant identities (one response contract)',
       tToday.j.response && typeof tToday.j.response.responseText === 'string' && !('advisorText' in tToday.j.response));

    // ── 7 / 16. Insight + action in one response; a SMALL prioritised set ──────
    await call('/api/compose', { method: 'POST', body: { text: 'preparing this week', mood: 4 } });
    const t7 = await turn('I want to prepare for the review meeting and keep a plan.', 'today');
    ok('7. one response can carry both an insight and action proposals', typeof t7.j.response.responseText === 'string' && t7.j.response.proposedActions.length >= 1);
    ok('16. a SMALL prioritised proposal set is returned by default (primary ≤ 2, rest behind more)',
       t7.j.response.primaryActions.length <= 2 && Array.isArray(t7.j.response.moreActions));

    // ── 5 / 6. Private by default; work wording not org-shared ─────────────────
    ok('5. personal input defaults to private (only_me)', t7.j.interpretation.suggestedPrivacy.visibility === 'only_me');
    const t6 = await turn('This is a work task — finish the quarterly report.', 'work');
    ok('6. work wording is not organisation-shared (stays only_me until confirmed)',
       t6.j.interpretation.suggestedPrivacy.visibility === 'only_me' && (t6.j.response.proposedActions.find(p => p.actionType === 'capture')?.visibility) === 'only_me');

    // ── 11. Calendar proposal is DRAFT-only, never presented as executed ───────
    const cal = t7.j.response.proposedActions.find(p => p.actionType === 'calendar_draft') || tToday.j.response.proposedActions.find(p => p.actionType === 'calendar_draft');
    ok('11. a calendar proposal is marked draft-only (not executed)', cal && cal.draftOnly === true && cal.requiredApproval === true);

    // ── 9 / 8 / 10. Confirm uses the runtime; nothing persists before; correction ─
    const capProp = t7.j.response.proposedActions.find(p => p.actionType === 'capture');
    const conf = await call(`/api/assistant/turn/${t7.j.turnId}/confirm`, { method: 'POST', body: { proposalId: capProp.id } });
    ok('8/9. proposal confirmation uses the existing runtime confirm path (persists only on confirm)', conf.status === 200 && conf.j.confirmed === 'capture');
    const corr = await call(`/api/assistant/turn/${t7.j.turnId}/correct`, { method: 'POST', body: { proposalId: capProp.id, correction: 'just a note, keep this private' } });
    const insp = await call(`/api/assistant/turn/${t7.j.turnId}`);
    ok('10. a correction updates the proposal but NOT the original message',
       corr.j.applied.includes('purpose→note') && insp.j.turn.rawInput === 'I want to prepare for the review meeting and keep a plan.');

    // ── 13 / 12. Generic check-in fallback; sensitive not resurfaced ───────────
    const tCk = await turn('Please check in with me next week.', 'me');
    ok('13. a generic personalised check-in is offered when the user asks for follow-up', tCk.j.response.proposedActions.some(p => p.actionType === 'checkin_proposal'));
    await call(`/api/assistant/turn/${tCk.j.turnId}/confirm`, { method: 'POST', body: { proposalId: tCk.j.response.proposedActions.find(p => p.actionType === 'checkin_proposal').id } });
    const tCk2 = await turn('Check in with me next week again please.', 'me');
    ok('12. an active check-in topic is not repeatedly resurfaced', !tCk2.j.response.proposedActions.some(p => p.actionType === 'checkin_proposal'));

    // ── 17. Attention projection available (Today) + routes into the assistant ─
    const att = await call('/api/workspace/today');
    ok('17. a small attention set is available via the authorised Today projection', att.status === 200 && Array.isArray(att.j.attention));

    // ── P1(B). Questions are answered by the SAME runtime — /ask and the turn share one path ─
    const askEP  = await call('/api/workspace/ask', { method: 'POST', body: { question: 'what should I focus on?' } });
    const askTurn = await turn('What should I focus on?', 'today');
    ok('P1. asking a question in the unified turn returns a grounded answer (qa) via the one path',
       !!askTurn.j.response.qa && typeof askTurn.j.response.qa.answer === 'string' && askTurn.j.response.qa.answer.length > 0);
    ok('P1. the /api/workspace/ask shim and the unified turn produce the SAME answer (one reasoning impl)',
       askEP.status === 200 && askEP.j.answer === askTurn.j.response.qa.answer && askEP.j.purpose === askTurn.j.response.qa.purpose);
    const askWorkTurn = await turn('What changed for the team project?', 'work');
    ok('P1. a work-scoped question uses a non-personal purpose (private excluded before context)',
       askWorkTurn.j.response.qa?.purpose === 'workspace_shared_reasoning' && askWorkTurn.j.response.qa?.bounded === true);

    // ─────────────── Static frontend guards (no browser harness) ───────────────
    ok('2. ONE persistent composer, wired to the unified runtime, reused across lenses',
       /_renderMyWorkspace/.test(mv) && /iq-composer-input/.test(mv) && (mv.match(/\/api\/assistant\/turn/g) || []).length >= 1 && /wsSetLens/.test(mv) && /_wsLenses/.test(mv));
    ok('2b. the composer container is mounted in the member home (index.html)', /id="iq-myworkspace"/.test(html));
    ok('14. no client-side score judgment is reintroduced (scoreLabel/_scoreLabel stay neutralized)',
       /NEUTRALIZED/.test(ui) && !/Exceptional|Needs Work/.test(mv.slice(mv.indexOf('_scoreLabel(v)'), mv.indexOf('_scoreLabel(v)') + 260)));
    ok('15. no Studio or separate Advisor identity is RENDERED in the unified surface (one IntelliQ voice)',
       (() => { const s = mv.slice(mv.indexOf('UNIFIED MYWORKSPACE'), mv.indexOf('dismissProposal(proposalId)')); return s.length > 200 && !/>\s*(Advisor|Studio|Planning AI|Notes AI|Assessment AI|Check-?in AI)\b/i.test(s) && /IntelliQ/.test(s); })());
    ok('  · lenses are contextual views, not separate chats (one wsSend/one conversation thread)',
       /iq-conversation/.test(mv) && (mv.match(/async wsSend/g) || []).length === 1);
    ok('  · proposal cards expose Confirm / Edit-Correct / Dismiss', /Confirm<\/button>/.test(mv) && /Edit \/ Correct/.test(mv) && /dismissProposal/.test(mv));
    ok('  · a personalised check-in card exposes confirm / change-timing / generalise / reject', /_renderCheckinProposal/.test(mv) && /Change timing/.test(mv) && /Generalise/.test(mv));
    ok('  · attention items route INTO the same assistant conversation', /wsAttentionInto\(text\)\s*\{[^}]*this\.wsSend\(\)/.test(mv));
    ok('  · privacy state is shown (Private / confirm-to-share badges)', /iq-badge-private/.test(mv) && /iq-badge-private/.test(css));
    ok('  · a visibility increase goes through the explicit confirmation mechanism', /confirmVisibilityIncrease/.test(mv));
    ok('  · a small default set with a "More options" affordance', /More options/.test(mv) && /moreActions/.test(mv));

    // ─── Phase 1 (finish the OS): exactly one member composer surface ──────────
    const appjs = read('js/app.js');
    ok('P1. the duplicate app.js MyWorkspace composer is removed (one composer object)',
       !/const\s+MyWorkspace\s*=\s*\{/.test(appjs) && !/window\.MyWorkspace\s*=/.test(appjs) && /\[REMOVED\] MyWorkspace/.test(appjs));
    ok('P1. the second composer input (mw-input) no longer exists in app.js',
       !/id="mw-input"|getElementById\('mw-input'\)/.test(appjs));
    ok('P1. the "MyWorkspace" nav slot routes to the assigned-work surface, not a 2nd composer',
       /page==='assessments'\)\s*\{\s*if\(typeof MemberApp[^}]*_renderAssessments\(\)/.test(appjs) && !/MyWorkspace\.render\(\)/.test(appjs));

    console.log(`\n=== assistant-interface-smoke: ${pass} passed, ${fail} failed ===\n`);
    server.close(() => process.exit(fail ? 1 : 0));
  } catch (e) { console.error(e); server.close(() => process.exit(1)); }
});
