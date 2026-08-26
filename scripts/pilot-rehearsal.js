#!/usr/bin/env node
/* A production-route rehearsal, not a fixture smoke. It prints the exact coach-facing
   text because a green status code cannot tell us whether the pilot screen is useful. */
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.ANTHROPIC_API_KEY = 'pilot-rehearsal-sentinel';
process.env.IQ_COMPOSER = '1';

const gateway = require('../ai/gateway');
const diagnose = require('../ai/diagnose');
const originalCompleteJSON = gateway.completeJSON;
const originalComplete = gateway.complete;
gateway.complete = async () => 'I can help you work through what is recorded.';
let intakeCall = 0;
gateway.completeJSON = async opts => {
  if (opts && opts.system === diagnose.INTAKE_PROMPT) {
    const utterance = String(opts.user || '').split('THEY JUST SAID:').pop().trim();
    const collective = /\b(we|our|team)\b/i.test(utterance);
    const working = /\b(support|helping)\b/i.test(utterance);
    const concept = working ? 'peer_support' : 'role_clarity';
    return {
      worthInquiry: true,
      proposals: [{
        id: `rehearsal_observation_${++intakeCall}`,
        level: 'observation',
        text: working ? 'peer support is helping' : 'roles are unclear after changes',
        sourceSpan: utterance,
        domainConcept: concept,
        concerns: collective ? 'group' : 'self',
        originRef: `rehearsal_origin_${intakeCall}`,
        originKind: 'direct_observation',
        authority: 'self_report',
        specificity: 0.8,
      }],
      concepts: [{ concept, relationship: 'NEW', reason: 'a distinct reported experience' }],
      unknowns: [{ concept, question: working ? 'Does that support hold under pressure?' : 'Which role changes are still unclear?', burden: 0.2 }],
    };
  }
  if (opts && Array.isArray(opts.schema) && opts.schema.includes('prompts')) return { prompts: [] };
  if (opts && Array.isArray(opts.schema) && opts.schema.includes('reply')) return { reply: 'I can help you work through what is recorded.' };
  return {};
};

const S = require('../server');
let passed = 0;
const check = (name, condition) => {
  if (!condition) throw new Error(`REHEARSAL FAILED: ${name}`);
  passed++;
  console.log(`PASS ${name}`);
};
const textOf = body => String(body?.response?.responseText || body?.responseText || body?.reply || body?.answer || '');
const printCoach = (label, value) => {
  console.log(`\n--- COACH TRANSCRIPT · ${label} ---`);
  console.log(String(value || '[empty screen]'));
};

(async () => {
  S._loadAllStores({});
  const server = S.app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, token, body) => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  const waitFor = async fn => {
    for (let i = 0; i < 60; i++) {
      const value = await fn();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return null;
  };

  try {
    console.log('PILOT REHEARSAL — empty store to learned outcome');
    console.log('Calendar note: the HTTP turn boundary has no observedAt parameter; “days” below are compressed stages in one run.');

    // STEP 1 — the organization is created entirely through its public setup/tree/member routes.
    let r = await call('POST', '/api/auth/setup-org', null, {
      orgName: 'Pilot Rehearsal Cooperative', orgMode: 'universal', adminName: 'Casey Coach',
      email: 'coach@rehearsal.test', password: 'rehearsal-pass',
    });
    const code = r.body.orgCode, coachId = r.body.userId, coachToken = r.body.token;
    const parent = await call('POST', '/api/tree/node', coachToken, { name: 'Programme' });
    const parentId = parent.body.node.nodeId;
    const team = await call('POST', '/api/tree/node', coachToken, { name: 'Team', parentId, ifRev: 0 });
    const teamId = team.body.node.nodeId;
    const members = [];
    for (let i = 1; i <= 12; i++) {
      const made = await call('POST', '/api/auth/create-user', coachToken, {
        name: `Member ${i}`, email: `member${i}@rehearsal.test`, role: 'member', password: 'member-pass', supervisorId: coachId,
      });
      members.push({ id: made.body.user.id, token: made.body.token || S.issueToken(made.body.user.id, code, 'member'), name: `Member ${i}` });
    }
    r = await call('PUT', `/api/tree/node/${teamId}`, coachToken, {
      ifRev: 0, memberIds: members.map(m => m.id), leaderIds: [coachId],
    });
    check('1 · production routes create one parent, one led team and twelve members', r.status === 200 && r.body.node.memberIds.length === 12);

    // STEP 2 — staged member conversations. The intake model is replaceable; grounding,
    // ownership, scope and contribution remain production kernel decisions.
    const turns = [
      [0, 'Day 1 — our roles are unclear after the schedule changes.'],
      [1, 'Day 8 — our roles are unclear after the schedule changes.'],
      [2, 'Day 8 — I am personally nervous about tomorrow.'],
      [3, 'Day 15 — our peer support is helping after difficult sessions.'],
      [4, 'Day 15 — our peer support is helping after difficult sessions.'],
      [5, 'Day 15 — our travel routine is unclear.'],
    ];
    for (const [index, message] of turns) {
      const response = await call('POST', '/api/assistant/turn', members[index].token, { text: message });
      console.log(`MEMBER ${index + 1}: ${message}`);
      console.log(`INTELLIQ: ${textOf(response.body) || '[no conversational text returned]'}`);
    }
    const candidates = [];
    for (let i = 0; i < 6; i++) {
      const found = await waitFor(async () => {
        const got = await call('GET', `/api/group/${teamId}/candidates`, members[i].token);
        return got.body.candidates?.[0] || null;
      });
      candidates[i] = found;
    }
    check('2 · collective talk creates private candidates while personal talk does not', !!candidates[0] && !!candidates[1] && !candidates[2]);

    // STEP 3/4 — deliberate contribution, refusal and withdrawal; only independent
    // contributed origins open the group Inquiry.
    await call('POST', `/api/group/${teamId}/contribute`, members[0].token, { candidateId: candidates[0].candidateId, valence: 'worth_attention' });
    const opened = await call('POST', `/api/group/${teamId}/contribute`, members[1].token, { candidateId: candidates[1].candidateId, valence: 'worth_attention' });
    await call('POST', `/api/group/${teamId}/candidates/${candidates[3].candidateId}/dismiss`, members[3].token, {});
    await call('POST', `/api/group/${teamId}/contribute`, members[5].token, { candidateId: candidates[5].candidateId, valence: 'unsure' });
    await call('POST', `/api/group/${teamId}/withdraw`, members[5].token, { candidateId: candidates[5].candidateId, reason: 'I no longer stand behind this as a team claim.' });
    r = await call('GET', `/api/group/${teamId}/inquiry`, coachToken);
    const inquiry = r.body.inquiries?.find(item => item.topic?.canonicalConcept === 'role_clarity');
    check('3–4 · refusal and withdrawal stay inert while two independent contributions open an Inquiry', opened.body.groupInquiry === 'open' && inquiry?.independentOrigins === 2);

    // STEP 5 — literal coach-facing output.
    const lead = await call('GET', '/api/inquiry/lead', coachToken);
    const state = await call('GET', `/api/group/${teamId}/state`, coachToken);
    const briefing = await call('GET', '/api/intelligence/briefing?refresh=1', coachToken);
    const assistant = await call('POST', '/api/assistant/turn', coachToken, { text: 'How is the team doing?' });
    printCoach('open inquiry', lead.body.lead?.question || '[empty screen]');
    printCoach('team state', [state.body.high?.claim, state.body.low?.claim, state.body.question?.question, state.body.statement].filter(Boolean).join('\n') || '[empty screen]');
    printCoach('leader briefing', [briefing.body.summary, ...(briefing.body.items || []).map(item => `${item.headline}: ${item.body}`)].filter(Boolean).join('\n') || '[empty screen]');
    printCoach('assistant', textOf(assistant.body) || '[empty screen]');
    check('5 · coach sees a grounded Low and no individual is named', state.body.low?.basis?.independentOrigins === 2 && !members.some(m => JSON.stringify({ lead: lead.body, state: state.body, briefing: briefing.body, assistant: assistant.body }).includes(m.name)));

    // STEP 6 — team Focus created from the open Inquiry and closed with an outcome.
    const focusMade = await call('POST', `/api/group/${teamId}/focus`, coachToken, {
      text: 'Clarify changed roles before the next shared session.', fromInquiryId: inquiry.inquiryId,
    });
    const focusId = focusMade.body.focus.focusId;
    const withFocus = await call('GET', `/api/group/${teamId}/state`, coachToken);
    printCoach('focus before outcome', `${withFocus.body.focus?.text || '[empty focus]'}\nIntelliQ: ${withFocus.body.statement || '[empty statement]'}`);
    const focusOutcome = await call('POST', `/api/group/${teamId}/focus/${focusId}/outcome`, coachToken, {
      result: 'better', note: 'Role questions became more specific.',
    });
    check('6 · Inquiry-origin Focus persists its specific uncertainty and outcome', focusMade.body.focus.origin.inquiryId === inquiry.inquiryId && /don't yet know|not yet|nothing has come back/i.test(withFocus.body.statement) && focusOutcome.body.focus.outcome.result === 'better');

    // STEP 7 — the governed person-action loop reaches Learn.
    const proposed = await call('POST', '/api/actions/propose', coachToken, { capability: 'intervention', subjectId: members[6].id });
    const actionId = proposed.body.action.id;
    await call('POST', `/api/actions/${actionId}/draft`, coachToken, {});
    await call('POST', `/api/actions/${actionId}/approve`, coachToken, {});
    await call('POST', `/api/actions/${actionId}/execute`, coachToken, {});
    await call('POST', `/api/actions/${actionId}/observe`, coachToken, { outcome: 'helped' });
    const evaluated = await call('POST', `/api/actions/${actionId}/evaluate`, coachToken, {});
    printCoach('person action outcome', evaluated.body.action?.evaluation?.summary || evaluated.body.action?.evaluation?.result || '[no human-readable evaluation]');
    check('7 · one governed person action reaches evaluated Learn state', evaluated.body.action?.status === 'evaluated' && evaluated.body.action?.stage === 'learn');

    // STEP 8 — erase a contributor, then immediately repeat every coach read.
    const removedName = members[0].name;
    const erased = await call('DELETE', `/api/auth/users/${members[0].id}?deleteData=true`, coachToken);
    const afterLead = await call('GET', '/api/inquiry/lead', coachToken);
    const afterState = await call('GET', `/api/group/${teamId}/state`, coachToken);
    const afterBrief = await call('GET', '/api/intelligence/briefing?refresh=1', coachToken);
    const afterRoster = await call('GET', '/api/intelligence/roster', coachToken);
    printCoach('after erasure · inquiry', afterLead.body.lead?.question || '[empty screen]');
    printCoach('after erasure · team state', [afterState.body.low?.claim, afterState.body.question?.question, afterState.body.statement].filter(Boolean).join('\n') || '[empty screen]');
    printCoach('after erasure · briefing', afterBrief.body.summary || '[empty screen]');
    const reads = JSON.stringify([afterLead.body, afterState.body, afterBrief.body, afterRoster.body]);
    check('8 · erasure is immediate in every coach read while the group keeps the contributed finding', erased.status === 200 && !reads.includes(JSON.stringify(removedName)) && afterState.body.low?.about === state.body.low?.about);

    console.log(`\nPILOT REHEARSAL COMPLETE — ${passed}/7 checks passed`);
  } finally {
    gateway.completeJSON = originalCompleteJSON;
    gateway.complete = originalComplete;
    server.close();
  }
})().catch(error => {
  gateway.completeJSON = originalCompleteJSON;
  gateway.complete = originalComplete;
  console.error(error.stack || error.message);
  process.exit(1);
});
