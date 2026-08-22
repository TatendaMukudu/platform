/* Truth layer — GROUNDED CONVERSATION ENGINE + member ASSESSMENT PROJECTION (pure).
   Proves the reusable intake: required claims from a definition, grounded classification
   (already-known skips a question, stale asks a refresh, vague never resolves), next-question
   selection, adjudication composed with the EXISTING adjudicateAnswer (member stays
   reported, owner authoritative, vague → corroboration), governed proposals (never a
   projection mutation), and completion. Plus the member projection: interpretation over a
   bare score, and placeholder/duplicate feedback never shown as real individual feedback.
   No DB / AI / IO. Run: node scripts/conversation-smoke.js */

const C = require('../ai/conversation.js');
const V = require('../ai/assessment-view.js');
const { adjudicateAnswer } = require('../ai/inquiry.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const NOW = Date.parse('2026-03-01T00:00:00Z');
const DAY = 86400000;
const def = { version: 1, fields: [{ label: 'What you did', hint: 'the concrete work' }, { label: 'What you learned' }] };

/* ── 1 · required claims ── */
const req = C.requiredClaims(def);
ok('1 · each defined field becomes one open required claim', req.length === 2 && req[0].ref === 'what_you_did' && req[0].kind === 'open');

/* ── 2 · classification is grounded in existing answers ── */
const cls = (ev) => C.classifyClaims(req, { evidenceByRef: ev, now: NOW });
ok('2 · no evidence → missing', cls({})[0].state === 'missing');
ok('2 · a fresh recorded answer (open) → already_known', cls({ what_you_did: [{ at: new Date(NOW - DAY).toISOString(), authority: 'reported', definite: true, corroborationNeeded: false, contentHash: 'a' }] })[0].state === 'already_known');
ok('2 · an old answer past freshness → stale', cls({ what_you_did: [{ at: new Date(NOW - 60 * DAY).toISOString(), authority: 'reported', definite: true, corroborationNeeded: false, contentHash: 'a' }] })[0].state === 'stale');
ok('2 · only a hedged answer → partially_known (not resolved)', cls({ what_you_did: [{ at: new Date(NOW).toISOString(), authority: 'needs_corroboration', definite: false, corroborationNeeded: true, contentHash: 'a' }] })[0].state === 'partially_known');
ok('2 · two definite answers, different authority + content → disputed', cls({ what_you_did: [{ at: new Date(NOW).toISOString(), authority: 'authoritative', definite: true, contentHash: 'a' }, { at: new Date(NOW).toISOString(), authority: 'reported', definite: true, contentHash: 'b' }] })[0].state === 'disputed');
// A FACTUAL claim needs authoritative evidence; a member's reported answer leaves it partially_known.
const factualReq = C.requiredClaims({ fields: [{ ref: 'kickoff_time', label: 'Kickoff time', kind: 'factual' }] });
ok('2 · a factual claim with only a reported answer stays partially_known (authority matters)', C.classifyClaims(factualReq, { evidenceByRef: { kickoff_time: [{ at: new Date(NOW).toISOString(), authority: 'reported', definite: true, contentHash: 'a' }] }, now: NOW })[0].state === 'partially_known');

/* ── 3 · plan + orientation ── */
const plan = C.buildPlan({ definition: def, now: NOW, purpose: 'assessment', subjectRef: 'joe' });
ok('3 · plan orients with what is known vs open + a deterministic fingerprint', plan.openClaims.length === 2 && /2 short question/i.test(plan.orientation) && plan.planFingerprint === C.buildPlan({ definition: def, now: NOW, purpose: 'assessment', subjectRef: 'joe' }).planFingerprint);
// already-known claim skips a question
const planKnown = C.buildPlan({ definition: def, now: NOW, subjectRef: 'joe', evidenceByRef: { what_you_did: [{ at: new Date(NOW).toISOString(), authority: 'reported', definite: true, contentHash: 'a' }] } });
ok('3 · an already-known claim is not asked again', !planKnown.openClaims.some(c => c.ref === 'what_you_did'));

/* ── 4 · next-question selection ── */
const q1 = C.nextQuestion(plan);
ok('4 · the next question targets the first open claim, concretely phrased', q1.claimRef === 'what_you_did' && /tell me about/i.test(q1.question));
ok('4 · an asked claim is not repeated', C.nextQuestion(plan, { askedRefs: ['what_you_did'] }).claimRef === 'what_you_did'.replace('what_you_did', 'what_you_learned'));
ok('4 · a stale claim asks a REFRESH question ("still current?")', /still current/i.test(C.nextQuestion(planStale()).question));
function planStale() { return C.buildPlan({ definition: def, now: NOW, subjectRef: 'joe', evidenceByRef: { what_you_did: [{ at: new Date(NOW - 90 * DAY).toISOString(), authority: 'reported', definite: true, contentHash: 'a' }], what_you_learned: [{ at: new Date(NOW).toISOString(), authority: 'reported', definite: true, contentHash: 'b' }] } }); }

/* ── 5 · adjudication composes with the EXISTING adjudicateAnswer ── */
const claim = req[0];
const adjOpen = (answer, opts = {}) => C.adjudicate({ answer, claim, actorIsOwner: true, actorIsMember: true, adjudicateAnswer, ...opts });
ok('5 · an empty / acknowledgement answer never satisfies (no proposal)', adjOpen('thanks').outcome === 'unrelated' && !adjOpen('thanks').proposal);
ok('5 · a question back is ambiguous (clarify, no write)', adjOpen('what do you mean?').outcome === 'ambiguous' && !adjOpen('what do you mean?').proposal);
const substantive = adjOpen('I ran the full strength benchmark across three sessions and logged every lift.');
ok('5 · a substantive open answer → answered + a proposal (owner of own reflection)', substantive.outcome === 'answered' && !!substantive.proposal);
const vague = adjOpen('I think it maybe went okay, not sure really.');
ok('5 · a vague answer → requires_corroboration (recorded, not resolved)', vague.outcome === 'requires_corroboration' && vague.proposal.corroborationNeeded === true);
ok('5 · marking not-applicable is a clean answered proposal', adjOpen('', { notApplicable: true }).proposal.notApplicable === true);

/* ── 6 · resolvesClaim — open vs factual authority ── */
ok('6 · a substantive open answer RESOLVES its claim', C.resolvesClaim(claim, substantive) === true);
ok('6 · a vague answer does NOT resolve its claim', C.resolvesClaim(claim, vague) === false);
const fc = factualReq[0];
ok('6 · a member (non-owner) factual answer stays reported → does NOT resolve', C.resolvesClaim(fc, C.adjudicate({ answer: 'yes it is confirmed', claim: fc, actorIsOwner: false, actorIsMember: true, adjudicateAnswer })) === false);
ok('6 · an owner factual answer becomes authoritative → resolves', C.resolvesClaim(fc, C.adjudicate({ answer: 'yes it is confirmed', claim: fc, actorIsOwner: true, adjudicateAnswer })) === true);

/* ── 7 · governed proposal (never a projection mutation) ── */
const prop = C.proposalFrom(substantive, { claim, subjectRef: 'joe', sessionId: 's1', resolves: true });
ok('7 · a proposal describes a governed WRITE (record_answer) with a stable fingerprint', prop.kind === 'record_answer' && prop.claimRef === 'what_you_did' && prop.resolvesClaim === true && typeof prop.fingerprint === 'string');
ok('7 · no proposal is produced for an ambiguous answer', C.proposalFrom(adjOpen('huh?'), { claim, sessionId: 's1' }) === null);

/* ── 8 · completion ── */
const openClaims = C.classifyClaims(req, { evidenceByRef: {}, now: NOW });
ok('8 · a plan with missing claims is NOT complete', C.completion(openClaims).complete === false);
const doneClaims = req.map((c, i) => ({ ...c, state: i === 0 ? 'already_known' : 'partially_known' }));
ok('8 · complete when nothing is still missing/stale (partial counts as handled, with a limitation)', C.completion(doneClaims).complete === true && C.completion(doneClaims).limitations.length === 1);

/* ── 8b · EXPLAINABILITY — why a claim was skipped / is still asked (member-safe) ── */
const ex = C.explainClaims(planKnown, { now: NOW });
ok('8b · a known claim carries a plain reason for NOT being asked', ex.known.some(k => k.label === 'What you did' && /covered this today|already/i.test(k.reason)));
ok('8b · an open claim carries a reason for still being asked', ex.open.some(o => o.label === 'What you learned' && /needs an answer|still/i.test(o.reason)));
ok('8b · explanations leak no authority / hashes / internal refs', !/authority|contentHash|corroboration|"ref"|fingerprint/i.test(JSON.stringify(ex)));

/* ── 9 · MEMBER PROJECTION — interpretation over a bare score ── */
ok('9 · placeholder feedback is detected (empty, generic, and duplicated)', V.isPlaceholderFeedback('') && V.isPlaceholderFeedback('Good detail — keep it up.') && V.isPlaceholderFeedback('Nice work', ['Nice work', 'Nice work']));
ok('9 · a real, specific comment is NOT a placeholder', V.isPlaceholderFeedback('Your Q3 rebound numbers jumped after the footwork drills — do more of that.') === false);

const notStarted = V.project({ title: 'S&C Benchmark', status: 'assigned', requiredCount: 2, answeredCount: 0 });
ok('9 · a not-started assessment leads with "how it works", not a blank form', notStarted.statusLabel === 'Not started' && /ask a few short questions|only asks for what/i.test(notStarted.summary + notStarted.nextActions.join()));

const inProgress = V.project({ title: 'S&C Benchmark', status: 'assigned', requiredCount: 2, answeredCount: 1, partialCount: 1 });
ok('9 · an in-progress assessment shows coverage + a continue action', inProgress.statusLabel === 'In progress' && /1 of 2/.test(inProgress.summary) && inProgress.nextActions.some(a => /continue the conversation/i.test(a)));

// Returned with a real score → leads with meaning; the number supports.
const developing = V.project({ title: 'IDP check-in', status: 'returned', requiredCount: 2, answeredCount: 2, score: 50, scoreMax: 100 });
ok('9 · a reviewed "developing" result leads with interpretation + a concrete next step', developing.statusLabel === 'Developing' && developing.optionalScore.show === true && developing.nextActions.some(a => /recent, concrete example|what .good. looks like/i.test(a)));

// Placeholder feedback on a returned card is NOT shown as real feedback.
const generic = V.project({ title: 'IDP check-in', status: 'returned', requiredCount: 2, answeredCount: 2, score: 74, scoreMax: 100, feedback: 'Good detail — keep it up.' });
ok('9 · duplicate/generic feedback is flagged generic + never surfaced as individual', generic.feedbackKind === 'generic' && generic.humanFeedback === '' && generic.limitations.some(l => /general comment/i.test(l)));
const human = V.project({ title: 'IDP', status: 'returned', requiredCount: 2, answeredCount: 2, score: 80, scoreMax: 100, feedback: 'Your passing range improved noticeably this month — keep building on the left side.' });
ok('9 · a genuine individual comment is surfaced as human feedback', human.feedbackKind === 'human' && /passing range/.test(human.humanFeedback));
ok('9 · the projection never leaks internal fields (authority, fingerprints, confidence)', !/authority|fingerprint|confidence|corroborationNeeded/i.test(JSON.stringify(developing)));

/* ── 11 · the assistant answers about an assessment from the LEADER'S carried-down context ── */
const withCtx = V.answerAboutAssessment({ question: 'what are they looking for?', brief: 'Focus on decision-making under fatigue in the last 20 minutes.', leaderName: 'Coach Alex' });
ok('11 · with a leader brief, the assistant conveys the leader\'s own intent', withCtx.hasContext === true && /Coach Alex is looking for/i.test(withCtx.answer) && /decision-making under fatigue/i.test(withCtx.answer));
const howQ = V.answerAboutAssessment({ question: 'how should I approach it?', brief: 'Cover your training week.', guidance: 'Use bullet points with specific dates.', leaderName: 'Coach' });
ok('11 · a "how" question also surfaces the leader\'s guidance', /bullet points/i.test(howQ.answer));
const noCtx = V.answerAboutAssessment({ question: 'what do they want?', brief: '', fields: [{ label: 'Your response' }], leaderName: 'Coach' });
ok('11 · with no leader context, it is honest + offers to ask the leader (never invents)', noCtx.hasContext === false && noCtx.routeToLeader === true && /check with them/i.test(noCtx.answer));

console.log(`\nconversation-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
