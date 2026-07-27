/* Truth layer — GROUNDED CONVERSATION (assessment intake) over HTTP. Proves the governed
   loop: start → answer → preview (no write) → confirm (canonical evidence) → re-derive →
   next/complete; that a vague answer never resolves; that nothing is written before
   confirmation; that ownership is server-derived (another member is refused); that resume
   re-derives (already-known is skipped); that abandoning writes nothing; and that the
   MyWorkspace projection leads with meaning and never shows placeholder feedback as real.
   Boots the real app (DB_OPTIONAL). Run: node scripts/conversation-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'convo', iso = new Date().toISOString();
const twoFields = [{ label: 'What you did', hint: 'the concrete work' }, { label: 'What you learned' }];
const asg = (id, extra = {}) => ({ id, templateId: 'tpl1', title: 'S&C Benchmark', kind: 'general', fields: twoFields,
  assignerId: 'coach', assignerName: 'Coach', assigneeId: 'joe', assigneeName: 'Joe', status: 'assigned', response: {}, feedback: '', score: null, assignedAt: iso, ...extra });
_loadAllStores({
  orgMeta: { [A]: { orgName: 'A', orgMode: 'sports', createdAt: iso } },
  orgUsers: { [A]: {
    coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, status: 'active' },
    joe:   { id: 'joe',   name: 'Joe',   role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' },
    mia:   { id: 'mia',   name: 'Mia',   role: 'member', orgCode: A, supervisorId: 'coach', status: 'active' },
  } },
  assessmentAssignments: { [A]: [
    asg('as1'), asg('as3'), asg('as9'),
    asg('asB', { description: 'Focus on your decision-making under fatigue in the last 20 minutes.', guidance: 'Give one concrete example with the date.' }),
    asg('as4', { status: 'returned', feedback: 'Good detail — keep it up.', score: 74, submittedAt: iso, returnedAt: iso }),
    asg('as5', { status: 'returned', feedback: 'Good detail — keep it up.', score: 69, submittedAt: iso, returnedAt: iso }),
    asg('as6', { status: 'returned', feedback: 'Your left-foot delivery is much sharper — build on that in match play.', score: 82, submittedAt: iso, returnedAt: iso }),
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { joe: issueToken('joe', A, 'member'), mia: issueToken('mia', A, 'member'), coach: issueToken('coach', A, 'superadmin') };
  const call = async (path, who, opts = {}) => {
    const headers = { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(who ? { Authorization: `Bearer ${tok[who]}` } : {}) };
    const r = await fetch(base + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const answers = id => Object.values(S._conversationEvidenceByRef(A, id)).reduce((n, a) => n + a.length, 0);

  try {
    // 1 · start → asks the first missing part (not a blank form)
    const s = await call('/api/conversation/start', 'joe', { method: 'POST', body: { purpose: 'assessment', targetId: 'as1' } });
    ok('1 · start returns an orientation + the first question (no blank form)', s.j.ok && s.j.question && /what you did/i.test(s.j.question.text) && /I'll ask 2/i.test(s.j.orientation));
    const sid = s.j.sessionId;

    // 2 · a vague answer previews but never resolves
    const vague = await call(`/api/conversation/${sid}/answer`, 'joe', { method: 'POST', body: { text: 'not sure, maybe it went okay' } });
    ok('2 · a vague answer previews as tentative (corroboration needed, does not resolve)', vague.j.ok && vague.j.preview && vague.j.preview.corroborationNeeded === true && vague.j.preview.resolvesClaim === false);
    ok('2 · nothing is written before confirmation', answers('as1') === 0);

    // 3 · a substantive answer previews as resolving; confirm writes canonical evidence
    const sub = await call(`/api/conversation/${sid}/answer`, 'joe', { method: 'POST', body: { text: 'I ran the full strength benchmark across three sessions and logged every lift and set.' } });
    ok('3 · a substantive answer previews as resolving the part', sub.j.preview && sub.j.preview.resolvesClaim === true);
    ok('3 · still nothing written until confirm', answers('as1') === 0);
    const conf = await call(`/api/conversation/${sid}/confirm`, 'joe', { method: 'POST', body: { proposalFingerprint: sub.j.preview.proposalFingerprint } });
    ok('3 · confirming writes canonical evidence + re-derives + asks the next part', conf.j.ok && conf.j.recorded === true && answers('as1') === 1 && conf.j.question && /what you learned/i.test(conf.j.question.text));

    // 4 · answer the second part → completion submits through the existing governed path
    const sub2 = await call(`/api/conversation/${sid}/answer`, 'joe', { method: 'POST', body: { text: 'I learned my posterior chain lags under fatigue, so I added extra accessory work.' } });
    const conf2 = await call(`/api/conversation/${sid}/confirm`, 'joe', { method: 'POST', body: { proposalFingerprint: sub2.j.preview.proposalFingerprint } });
    ok('4 · covering all parts completes the session + re-derives the projection', conf2.j.ok && conf2.j.complete === true && conf2.j.projection);
    ok('4 · completion submitted the assignment through the existing path (leader reviews as before)', (S.assessmentAssignments[A].find(a => a.id === 'as1') || {}).status === 'submitted');

    // 5 · an ambiguous answer clarifies without writing (fresh assignment)
    const s9 = await call('/api/conversation/start', 'joe', { method: 'POST', body: { purpose: 'assessment', targetId: 'as9' } });
    const amb = await call(`/api/conversation/${s9.j.sessionId}/answer`, 'joe', { method: 'POST', body: { text: 'what do you mean?' } });
    ok('5 · an ambiguous answer asks for clarification and writes nothing', amb.j.needsClarification === true && answers('as9') === 0);

    // 6 · ownership is server-derived — another member cannot drive this session
    ok('6 · another member cannot start an assessment that is not theirs (403)', (await call('/api/conversation/start', 'mia', { method: 'POST', body: { purpose: 'assessment', targetId: 'as1' } })).status === 403);
    ok('6 · another member cannot answer someone else\'s session (404, not found for them)', (await call(`/api/conversation/${sid}/answer`, 'mia', { method: 'POST', body: { text: 'hi' } })).status === 404);

    // 7 · resume re-derives (already-known part is skipped, not replayed)
    const s3 = await call('/api/conversation/start', 'joe', { method: 'POST', body: { purpose: 'assessment', targetId: 'as3' } });
    const a3 = await call(`/api/conversation/${s3.j.sessionId}/answer`, 'joe', { method: 'POST', body: { text: 'Did a detailed film breakdown of my last two games with timestamps.' } });
    await call(`/api/conversation/${s3.j.sessionId}/confirm`, 'joe', { method: 'POST', body: { proposalFingerprint: a3.j.preview.proposalFingerprint } });
    const resumed = await call(`/api/conversation/${s3.j.sessionId}`, 'joe');
    ok('7 · resume re-derives + skips the already-answered part (asks part two)', resumed.j.ok && resumed.j.question && /what you learned/i.test(resumed.j.question.text) && resumed.j.resolved === 1);
    ok('7 · resume explains WHY the covered part is skipped (member-safe reason)', (resumed.j.alreadyKnown || []).some(k => /what you did/i.test(k.label) && /covered this|already/i.test(k.reason)) && !/authorityClass|contentHash|fingerprint/i.test(JSON.stringify(resumed.j.alreadyKnown)));

    // 8 · abandoning writes no unconfirmed answer
    const s8 = await call('/api/conversation/start', 'joe', { method: 'POST', body: { purpose: 'assessment', targetId: 'as9' } });
    await call(`/api/conversation/${s8.j.sessionId}/answer`, 'joe', { method: 'POST', body: { text: 'A full write-up of my nutrition plan and adherence.' } });
    await call(`/api/conversation/${s8.j.sessionId}/abandon`, 'joe', { method: 'POST' });
    ok('8 · abandoning a session persists no unconfirmed answer', answers('as9') === 0);

    // 9 · MyWorkspace projection — meaning over a bare score, placeholder feedback flagged
    const ws = await call('/api/assessments', 'joe');
    const byId = Object.fromEntries((ws.j.assigned || []).map(a => [a.id, a]));
    ok('9 · each assigned item carries a member-facing projection (statusLabel + summary)', byId.as4 && byId.as4.projection && byId.as4.projection.statusLabel && byId.as4.projection.summary);
    ok('9 · duplicated placeholder feedback is flagged generic + never shown as individual', byId.as4.projection.feedbackKind === 'generic' && byId.as4.projection.humanFeedback === '' && byId.as4.projection.limitations.some(l => /general comment/i.test(l)));
    ok('9 · a genuine individual comment is surfaced as human feedback', byId.as6.projection.feedbackKind === 'human' && /left-foot/.test(byId.as6.projection.humanFeedback));
    ok('9 · the completed as1 projection reads as submitted (interpretation, not a bare score)', byId.as1 && /awaiting review|submitted/i.test(byId.as1.projection.statusLabel));
    ok('9 · the projection exposes no internal fields (authority/fingerprints/confidence)', !/authorityClass|fingerprint|confidence|corroborationNeeded/i.test(JSON.stringify(ws.j.assigned)));

    // 10 · the assistant carries the LEADER'S brief down to the member ("what are they looking for?")
    const brief = await call('/api/assessments/asB/ask', 'joe', { method: 'POST', body: { question: 'what are they looking for?' } });
    ok('10 · the assistant conveys the leader\'s brief to the member (context down the web)', brief.j.ok && brief.j.hasContext === true && /decision-making under fatigue/i.test(brief.j.answer));
    const noBrief = await call('/api/assessments/as9/ask', 'joe', { method: 'POST', body: { question: 'what do they want?' } });
    ok('10 · with no leader brief it stays honest + offers to ask the leader (never invents)', noBrief.j.ok && noBrief.j.routeToLeader === true);
    ok('10 · another member cannot ask about an assessment that is not theirs (403)', (await call('/api/assessments/asB/ask', 'mia', { method: 'POST', body: { question: 'x' } })).status === 403);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nconversation-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
