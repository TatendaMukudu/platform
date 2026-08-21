/* Truth layer — INQUIRY / EPISTEMIC-PLANNING ENGINE (pure).

   Proves the reasoning layer that decides WHETHER to ask before asking. Questions are
   ACTIONS: the engine only recommends an ask when the answer would change a real
   decision, the owner can answer it, it is privacy-safe, non-leading, non-duplicative,
   and not answerable without asking. It optimises for organisational health, not data
   collection. Pure — no DB, no AI. Run: node scripts/inquiry-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const IQ = require('../ai/inquiry');
const { UNCERTAINTY } = IQ;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

// A worthwhile, well-routed operational uncertainty (missing required fact, real owner).
const goodOp = {
  id: 'u_meeting', type: UNCERTAINTY.MISSING_REQUIRED,
  claim: "Saturday's team meeting start time", requiredFor: ['player preparation', 'calendar coordination'],
  impact: 'high', urgency: 'high', resolutionOwner: 'team-coach', ownerAuthoritative: true, privacyClass: 'team-shared',
};

// 1 · a high-value, well-routed, answerable question clears the gate
{
  const v = IQ.questionValue(goodOp);
  ok('1 · a real, well-routed operational question scores high', v >= 0.5);
  ok('1 · its critic passes (answerable, actionable, non-leading, owned)', IQ.critique(goodOp).ok);
  ok('1 · it survives the health guard', !IQ.healthGuard(goodOp).rejected);
}

// 2 · never ask what we can answer ourselves (derive) or read from a system of record
{
  const derivable = { ...goodOp, id: 'u_d', derivable: true };
  const sor       = { ...goodOp, id: 'u_s', systemOfRecord: 'calendar' };
  ok('2 · a derivable uncertainty is not worth asking a person', IQ.questionValue(derivable) < 0.2 && !IQ.critique(derivable).ok);
  ok('2 · a system-of-record answer routes to the record, not a person', IQ.route(sor).method === 'inspect_system_of_record');
  const plan = IQ.planInquiries([derivable, sor]);
  ok('2 · the planner asks NEITHER (answerable without asking)', plan.plans.length === 0 && plan.rejected.length === 2);
}

// 3 · no reliable owner ⇒ do not ask (escalate to a human to route)
{
  const orphan = { ...goodOp, id: 'u_o', resolutionOwner: null };
  ok('3 · an ownerless question fails the critic', !IQ.critique(orphan).ok);
  ok('3 · routing escalates rather than guessing a target', IQ.route(orphan).method === 'escalate');
}

// 4 · leading / accusatory questions are blocked; observation-first phrasing is used
{
  const hyp = {
    id: 'u_att', type: UNCERTAINTY.UNSUPPORTED_HYPOTHESIS,
    claim: 'the recent attendance dip', observedBaseline: 'Attendance has been below its three-week baseline',
    requiredFor: ['planning'], impact: 'medium', urgency: 'medium', resolutionOwner: 'coordinator', ownerAuthoritative: true,
    hypotheses: [{ separatedBy: 'schedule_changed', probeCost: 0.15 }, { separatedBy: 'schedule_changed' }, { separatedBy: 'injuries' }],
  };
  const phrased = IQ.phraseQuestion(hyp);
  ok('4 · phrasing states the observation, not a cause', /below its three-week baseline/i.test(phrased) && !/why has|motivation/i.test(phrased));
  ok('4 · a leading "why has motivation dropped" is blocked', !IQ.critique(hyp, 'Why has the team lost motivation?').ok);
  ok('4 · the neutral phrasing passes the critic', IQ.critique(hyp, phrased).ok);
  // hypothesis discrimination: pick the single probe that separates the most, cheapest
  const d = IQ.discriminate(hyp);
  ok('4 · discrimination picks the most-separating, lowest-cost probe', d && d.key === 'schedule_changed' && d.separates === 2);
}

// 5 · HEALTH GUARD — organisational health over data collection
{
  const priv = { id: 'u_p', type: UNCERTAINTY.UNSUPPORTED_HYPOTHESIS, claim: 'why a member seems low', privacyClass: 'sensitive', impact: 'high', urgency: 'high', resolutionOwner: 'coach', ownerAuthoritative: true };
  ok('5 · a private/emotional disclosure never becomes a management ask', IQ.healthGuard(priv).rejected && IQ.healthGuard(priv).reason === 'private_or_sensitive_disclosure');

  const perf = { id: 'u_perf', type: UNCERTAINTY.MISSING_REQUIRED, claim: 'explain their performance — why are they behind', subjectId: 'm1', impact: 'high', urgency: 'high', resolutionOwner: 'coach', ownerAuthoritative: true };
  ok('5 · never single out an individual for an underperformance explanation', IQ.healthGuard(perf).rejected && IQ.healthGuard(perf).reason === 'targets_individual_performance');

  const loyalty = { id: 'u_l', type: UNCERTAINTY.MISSING_REQUIRED, claim: 'why aren’t you responding after hours — commitment', impact: 'medium', urgency: 'low', resolutionOwner: 'lead', ownerAuthoritative: true };
  ok('5 · wellbeing/effort is never used as a performance proxy', IQ.healthGuard(loyalty).rejected && IQ.healthGuard(loyalty).reason === 'wellbeing_used_as_performance_proxy');

  ok('5 · the planner drops every harmful uncertainty', IQ.planInquiries([priv, perf, loyalty]).plans.length === 0);
}

// 6 · CONTRADICTION — resolve, don't bury; ask the owner, non-leading
{
  const contra = {
    id: 'u_kick', type: UNCERTAINTY.CONTRADICTION, claim: 'the cup final kickoff time',
    currentBeliefs: [{ value: '3pm', authority: 'coach', confidence: 0.82 }, { value: '5pm', authority: 'member', confidence: 0.45 }],
    requiredFor: ['player preparation'], impact: 'high', urgency: 'high', resolutionOwner: 'team-coach', ownerAuthoritative: true,
  };
  ok('6 · a contradiction is worth resolving', IQ.questionValue(contra) >= 0.4);
  ok('6 · it is phrased as "which is correct", not an accusation', /which is correct/i.test(IQ.phraseQuestion(contra)) && /3pm.*5pm|5pm.*3pm/i.test(IQ.phraseQuestion(contra)));
  ok('6 · near-equal beliefs would score even higher information gain',
     IQ.infoGain({ ...contra, currentBeliefs: [{ confidence: 0.6 }, { confidence: 0.58 }] }) > IQ.infoGain(contra));
}

// 7 · DUPLICATION / cadence — never re-ask what was just asked
{
  const asked = { ...goodOp, id: 'u_recent', lastAskedAt: new Date().toISOString() };
  ok('7 · a recently-asked question is blocked', !IQ.critique(asked).ok);
  ok('7 · duplication tanks its value', IQ.questionValue(asked) < IQ.questionValue(goodOp));
}

// 8 · THE PLANNER — restraint, ranking, dedup, recommendation-only
{
  const worthy2 = { id: 'u_dep', type: UNCERTAINTY.BLOCKED_DEPENDENCY, claim: 'whether Saturday transport is confirmed', requiredFor: ['availability'], impact: 'high', urgency: 'high', resolutionOwner: 'operations', ownerAuthoritative: true };
  const weak    = { id: 'u_weak', type: UNCERTAINTY.MISSING_REQUIRED, claim: 'a nice-to-have preference', impact: 'low', urgency: 'none', resolutionOwner: 'lead' };
  const out = IQ.planInquiries([goodOp, worthy2, weak, { ...goodOp, id: 'u_dupe' }], { maxAsks: 5 });
  ok('8 · only decision-relevant asks are planned (weak one dropped)', out.plans.every(p => p.uncertaintyId !== 'u_weak'));
  ok('8 · a near-duplicate is deduped', out.plans.filter(p => /meeting start time/i.test(p.question)).length === 1);
  ok('8 · plans are ranked by ask-worthiness', out.plans.every((p, i, a) => i === 0 || a[i - 1].askWorthiness >= p.askWorthiness));
  ok('8 · every plan is recommendation-only (nothing is sent)', out.plans.every(p => p.status === 'recommended'));
  ok('8 · volume is capped (restraint is a feature)', IQ.planInquiries([goodOp, worthy2, { ...worthy2, id: 'x1', claim: 'confirm the kit order' }, { ...worthy2, id: 'x2', claim: 'confirm the pitch booking' }], { maxAsks: 2 }).plans.length === 2);
}

// 9 · ANSWER ADJUDICATION — an answer is not automatically truth
{
  const owner = IQ.adjudicateAnswer({ answer: 'Yes, transport has been confirmed.', isOwner: true, claimType: 'transport_confirmation', claimLabel: 'transport' });
  ok('9 · an OWNER’s clear confirmation resolves + is authoritative', owner.resolution === 'resolves' && owner.authority === 'authoritative' && owner.proposal && owner.proposal.corroborationNeeded === false);
  const member = IQ.adjudicateAnswer({ answer: 'Yes, it’s confirmed.', isMember: true, claimType: 'transport_confirmation', claimLabel: 'transport' });
  ok('9 · a member’s confirmation is shared-but-unverified (needs corroboration)', member.authority === 'shared_but_unverified' && member.proposal.corroborationNeeded === true);
  const vague = IQ.adjudicateAnswer({ answer: 'Should be fine, I think.', isOwner: true, claimType: 'transport_confirmation', claimLabel: 'transport' });
  ok('9 · a vague answer never satisfies — needs corroboration, does not resolve', vague.authority === 'needs_corroboration' && vague.resolution !== 'resolves' && vague.proposal.corroborationNeeded === true);
  const nonAns = IQ.adjudicateAnswer({ answer: 'Thanks!', isOwner: true, claimType: 'transport_confirmation' });
  ok('9 · a non-answer produces NO proposal', nonAns.responseKind === 'non_answer' && nonAns.proposal === null);
  const clar = IQ.adjudicateAnswer({ answer: 'What do you mean by transport?', isOwner: true, claimType: 'transport_confirmation' });
  ok('9 · a question back is a clarification, no proposal', clar.responseKind === 'clarification' && clar.proposal === null);
  const conflict = IQ.adjudicateAnswer({ answer: 'No, transport is not confirmed.', isOwner: true, claimType: 'transport_confirmation', claimLabel: 'transport', hasExistingAuthoritative: true });
  ok('9 · a negation against an authoritative record is a contradiction (both preserved)', conflict.resolution === 'contradicts' && conflict.proposal);
}

// 10 · THE GOVERNING PRINCIPLE — endless missing info does NOT mean endless asking
{
  const trivia = Array.from({ length: 20 }, (_, i) => ({ id: 'triv_' + i, type: UNCERTAINTY.MISSING_REQUIRED, claim: 'some absent detail ' + i, impact: 'none', urgency: 'none', resolutionOwner: 'lead' }));
  ok('10 · a sea of low-impact gaps produces zero asks', IQ.planInquiries(trivia).plans.length === 0);
}

// ── HTTP: recommendation-only endpoint over REAL derivation + the privacy boundary ──
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, evidenceLog } = S;
const A = 'orga', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', createdAt: iso } },
  orgUsers: { [A]: {
    coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, supervisorId: null,   status: 'active' },
    mia:   { id: 'mia',   name: 'Mia',   role: 'member',     orgCode: A, supervisorId: 'coach', status: 'active' },
  } },
});
_rebuildEmailIndex();

const { orgStateConfig } = S;

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { coach: issueToken('coach', A, 'superadmin'), mia: issueToken('mia', A, 'member') };
  const inDays = d => new Date(Date.now() + d * 86400000).toISOString();
  const turn = (who, text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok[who]}` }, body: JSON.stringify({ text }) }).then(r => r.json());
  const recs = (who) => fetch(base + '/api/inquiry/recommendations', { headers: { Authorization: `Bearer ${tok[who]}` } }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const orgstate = (who) => fetch(base + '/api/org-state', { headers: { Authorization: `Bearer ${tok[who]}` } }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  try {
    // SCENARIO 2 — an upcoming match (explicit org config) with a KICKOFF CONFLICT.
    orgStateConfig[A] = { pack: 'sports', events: [{ id: 'cupfinal', type: 'match', title: 'Cup Final', startAt: inDays(3), participants: 22, owner: 'coach' }] };
    await turn('coach', 'Add this to our organisation knowledge: Cup final kickoff confirmed at 3pm.');
    await turn('mia',   'Add this to our organisation knowledge: I heard the cup final kickoff might be at 5pm.');
    // a PRIVATE, sensitive disclosure — must NEVER become a leader-facing question
    await turn('mia',   'Remember this: I have been feeling low and anxious about my place in the team this month.');

    const r = await recs('coach');
    ok('11 · a contradiction on an upcoming event surfaces a recommendation', r.status === 200 && r.j.recommendations.some(x => /kickoff|which is correct/i.test(x.question)));
    ok('11 · a missing game plan for the match also surfaces', r.j.recommendations.some(x => /game plan/i.test(x.question)));
    ok('11 · the endpoint is recommendation-only (nothing is sent)', r.j.mode === 'recommendation_only');
    ok('11 · a member’s PRIVATE disclosure never appears as an inquiry', !/anxious|feeling low|my place in the team|low and anxious/i.test(JSON.stringify(r.j)));
    ok('11 · recommendations route to the owner, not a broadcast', r.j.recommendations.every(x => x.owner && x.method === 'ask_owner'));

    const m = await recs('mia');
    ok('11 · inquiry recommendations are leaders-only (member 403)', m.status === 403);

    // 11b · ORG-STATE diagnostic — derived structure, no private, leader-only
    const os = await orgstate('coach');
    ok('11b · org-state derives the event + requirements + readiness', os.status === 200 && os.j.events.some(e => e.id === 'cupfinal') && os.j.requirements.some(rq => rq.claimType === 'game_plan') && os.j.readiness.some(rd => rd.status === 'at_risk'));
    ok('11b · the disputed kickoff is a claim state, not a silent supersede', os.j.claimStates.some(c => c.claimType === 'kickoff_time' && c.state === 'disputed'));
    ok('11b · org-state never exposes raw evidence text or private content', !/anxious|feeling low|3pm|5pm/i.test(JSON.stringify(os.j)));
    ok('11b · org-state is leaders-only', (await orgstate('mia')).status === 403);

    // 11c · REQUIREMENT SATISFIED — an authoritative game plan makes the ask disappear
    await turn('coach', 'Add this to our organisation knowledge: Game plan for the cup final: high press 4-3-3, tactics and formation set, squad availability confirmed.');
    const r2 = await recs('coach');
    ok('11c · once satisfied, the game-plan recommendation disappears deterministically', !r2.j.recommendations.some(x => /game plan/i.test(x.question)));

    // 11d · CACHE INVALIDATION after a new import — recommendations reflect the change
    const before = (await orgstate('coach')).j.claimStates.find(c => c.claimType === 'game_plan');
    ok('11d · cache invalidated after import (game_plan now known)', before && before.state === 'known');

    // 11e · MALFORMED evidence resilience + valid JSON on any projection hiccup
    (evidenceLog[A] = evidenceLog[A] || []).push({ id: 'bad_os', orgCode: A, status: 'active', provider: 'import', source: 'reported', type: 'document', visibility: 'normal', promoted: true, ownerRef: 'coach' /* no attributes, no valueText */ });
    const osBad = await orgstate('coach');
    ok('11e · a malformed evidence row never breaks the projection', osBad.status === 200 && osBad.j.ok === true);
    const recBad = await recs('coach');
    ok('11e · recommendations still return valid JSON with a malformed row', recBad.status === 200 && Array.isArray(recBad.j.recommendations));
    evidenceLog[A] = evidenceLog[A].filter(e => e.id !== 'bad_os');

    // 12 · KNOWLEDGE HEALTH — the "what to keep / what to let go" view, recommendation-only,
    //   private evidence excluded.
    const kh = await fetch(base + '/api/knowledge/health', { headers: { Authorization: `Bearer ${tok.coach}` } }).then(r => r.json());
    ok('12 · knowledge-health returns a freshness rollup', kh.ok && typeof kh.total === 'number' && kh.counts);
    ok('12 · it is recommendation-only (never deletes)', kh.mode === 'recommendation_only');
    ok('12 · it never exposes a member’s private disclosure', !/anxious|feeling low|my place in the team/i.test(JSON.stringify(kh)));
    const khm = await fetch(base + '/api/knowledge/health', { headers: { Authorization: `Bearer ${tok.mia}` } });
    ok('12 · knowledge-health is leaders-only (member 403)', khm.status === 403);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }
  server.close();
  console.log(`\ninquiry-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
