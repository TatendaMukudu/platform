/* Truth layer — ORGANISATIONAL-STATE PROJECTION (pure).

   Proves the derived org-state projection: objectives/events/decisions/requirements,
   ordered ownership resolution, deterministic impact & urgency from named factors,
   claim states (known/missing/stale/disputed/not-yet-due), readiness with blocking
   reasons + provenance, and state→uncertainties. It is a PROJECTION over admissible
   evidence — no domain-specific hard-coding leaks into the universal primitives.
   Pure — no DB, no AI. Run: node scripts/org-state-smoke.js */

const OS = require('../ai/org-state');
const { CLAIM } = OS;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const now = Date.parse('2026-07-23T09:00:00Z');
const inDays = d => new Date(now + d * 86400000).toISOString();
const daysAgo = d => new Date(now - d * 86400000).toISOString();
const evi = (o) => ({ id: o.id, status: 'active', provider: 'import', visibility: 'normal', promoted: true,
  source: o.source || 'reported', label: o.label || '', valueText: o.valueText || o.label || '',
  retrievedAt: o.retrievedAt || daysAgo(0), observedAt: o.observedAt || daysAgo(0),
  attributes: { category: o.category, contentHash: o.hash, ...(o.attributes || {}) } });

// 1 · primitive normalisation + provenance kind
{
  const o = OS.objective({ id: 'o1', title: 'Reach the cup final', priority: 'high' });
  ok('1 · objective normalises with explicit provenance', o.kind === 'objective' && o.provenance.kind === 'explicit' && o.priority === 'high');
  const e = OS.event({ id: 'm1', type: 'match', startAt: inDays(3) });
  ok('1 · event normalises', e.kind === 'event' && e.type === 'match');
}

// 2 · ownership resolution ORDER (direct → role → source-role → fallback → unresolved)
{
  const sports = OS.resolvePack('sports');
  const direct = OS.resolveOwner({ requirement: OS.requirement({ claimType: 'game_plan', expectedOwner: 'coach-jo' }), event: OS.event({ owner: null }), responsibilities: [], pack: sports, config: {} });
  ok('2 · a direct owner wins first', direct.owner === 'coach-jo' && direct.basis === 'direct_owner');
  const role = OS.resolveOwner({ requirement: OS.requirement({ claimType: 'game_plan' }), event: OS.event({}), responsibilities: [OS.responsibility({ subject: 'coach', type: 'owns' })], pack: sports, config: {} });
  ok('2 · a role responsibility resolves when no direct owner', role.owner === 'coach' && role.basis === 'role_responsibility');
  const fallback = OS.resolveOwner({ requirement: OS.requirement({ claimType: 'unknown_thing' }), event: OS.event({}), responsibilities: [], pack: sports, config: { fallbackOwner: 'ops' } });
  ok('2 · a configured fallback is used before giving up', fallback.owner === 'ops' && fallback.basis === 'configured_fallback');
  const unresolved = OS.resolveOwner({ requirement: OS.requirement({ claimType: 'unknown_thing' }), event: OS.event({}), responsibilities: [], pack: sports, config: {} });
  ok('2 · missing ownership is UNRESOLVED, never the nearest leader', unresolved.unresolved === true && unresolved.owner === null);
}

// 3 · deterministic IMPACT from named factors (documented weights)
{
  const low  = OS.deriveImpact({ dependents: 0.1, proximity: 0.1, priority: 0.2, irreversibility: 0.2, scope: 0.1, safety: 0 });
  const high = OS.deriveImpact({ dependents: 0.9, proximity: 0.9, priority: 0.8, irreversibility: 0.8, scope: 0.7, safety: 0 });
  ok('3 · impact rises deterministically with the factors', high.score > low.score && ['high', 'critical'].includes(high.label) && ['none', 'low'].includes(low.label));
  ok('3 · a safety/wellbeing factor can dominate impact', OS.deriveImpact({ safety: 1 }).label !== 'none' && OS.deriveImpact({ safety: 1 }).score >= 0.3);
  ok('3 · impact is a labelled bucket + inspectable factors', high.factors && typeof high.factors.proximity === 'number');
}

// 4 · deterministic URGENCY from time-to-needed-by + overdue
{
  const soon = OS.deriveUrgency({ neededByMs: now + 0.5 * 86400000, leadDays: 1, now });
  const far  = OS.deriveUrgency({ neededByMs: now + 20 * 86400000, leadDays: 1, now });
  const over = OS.deriveUrgency({ overdueDays: 5, cadenceDays: 7, now });
  ok('4 · a deadline inside lead time is urgent', ['high', 'immediate'].includes(soon.label));
  ok('4 · a distant deadline is not urgent', ['none', 'low'].includes(far.label));
  ok('4 · an overdue item is urgent, basis=overdue', ['high', 'immediate'].includes(over.label) && over.basis === 'overdue');
  ok('4 · no deadline ⇒ low urgency (no manufactured urgency)', OS.deriveUrgency({ now }).label === 'low');
}

// 5 · claim states — known / missing / stale / disputed / not-yet-due
{
  const sports = OS.resolvePack('sports');
  const packReq = sports.requirements.kickoff_time;
  const evMatch = OS.event({ id: 'm', type: 'match', startAt: inDays(3) });
  const missing = OS.classifyClaim({ req: OS.requirement({ claimType: 'kickoff_time', neededBy: inDays(2) }), event: evMatch, evidence: [], now, packReq });
  ok('5 · no evidence near the deadline ⇒ missing', missing.state === CLAIM.MISSING);
  const known = OS.classifyClaim({ req: OS.requirement({ claimType: 'kickoff_time', neededBy: inDays(2) }), event: evMatch, evidence: [evi({ id: 'k', label: 'Kickoff is at 3pm', source: 'system_of_record' })], now, packReq });
  ok('5 · fresh matching evidence ⇒ known', known.state === CLAIM.KNOWN);
  const stale = OS.classifyClaim({ req: OS.requirement({ claimType: 'kickoff_time', neededBy: inDays(2) }), event: evMatch, evidence: [evi({ id: 's', label: 'Kickoff is at 3pm', source: 'reported', retrievedAt: daysAgo(90) })], now, packReq });
  ok('5 · matching but old evidence ⇒ stale', stale.state === CLAIM.STALE);
  const disputed = OS.classifyClaim({ req: OS.requirement({ claimType: 'kickoff_time', neededBy: inDays(2) }), event: evMatch, evidence: [evi({ id: 'a', label: 'Kickoff at 3pm', source: 'system_of_record', hash: 'h1' }), evi({ id: 'b', label: 'Kickoff at 5pm', source: 'reported', hash: 'h2' })], now, packReq });
  ok('5 · two conflicting admissible claims ⇒ disputed (both preserved)', disputed.state === CLAIM.DISPUTED && disputed.evidenceIds.length === 2);
  const notDue = OS.classifyClaim({ req: OS.requirement({ claimType: 'kickoff_time', neededBy: inDays(30) }), event: OS.event({ id: 'far', type: 'match', startAt: inDays(30) }), evidence: [], now, packReq });
  ok('5 · a far-off requirement ⇒ not_yet_due, not missing', notDue.state === CLAIM.NOT_YET_DUE);
}

// 6 · SCENARIO 1 — a match approaches with no game plan
{
  const state = OS.deriveOrgState({
    now, organisation: { id: 'club' }, structure: { responsibilities: [OS.responsibility({ subject: 'coach', type: 'owns' })] },
    configuration: { pack: 'sports', events: [OS.event({ id: 'cupfinal', type: 'match', title: 'Cup Final', startAt: inDays(3), participants: 22, owner: 'coach' })] },
    evidence: [evi({ id: 'kt', label: 'Kickoff time confirmed at 3pm', source: 'system_of_record' })],   // kickoff known, game_plan absent
  });
  const gp = state.requirements.find(r => r.claimType === 'game_plan');
  const gpState = state.claimStates.find(c => c.claimType === 'game_plan');
  const ready = state.readiness.find(r => r.subjectId === 'cupfinal');
  ok('6 · the upcoming match yields a game_plan requirement owned by the coach', gp && gp.expectedOwner === 'coach' && gp.neededBy);
  ok('6 · the game plan is MISSING', gpState && gpState.state === CLAIM.MISSING);
  ok('6 · readiness is at_risk with game_plan blocking (reasons exposed)', ready && ready.status === 'at_risk' && ready.blockingRequirements.includes('game_plan'));
  const unc = OS.stateToUncertainties(state);
  const miss = unc.find(u => u.type === 'missing_required' && /game plan/i.test(u.claim));
  ok('6 · an actionable uncertainty is generated, routed to the coach', miss && miss.resolutionOwner === 'coach' && miss.affects.id === 'cupfinal');
  ok('6 · its impact & urgency are DERIVED (with basis), not constant', miss.impactBasis && miss.urgencyBasis && ['medium', 'high', 'critical'].includes(miss.impact));
}

// 7 · SCENARIO 2 — kickoff time conflict
{
  const state = OS.deriveOrgState({
    now, organisation: { id: 'club' }, structure: { responsibilities: [OS.responsibility({ subject: 'coach' })] },
    configuration: { pack: 'sports', events: [OS.event({ id: 'm2', type: 'match', title: 'League Match', startAt: inDays(2), participants: 22, owner: 'coach' })] },
    evidence: [evi({ id: 'c1', label: 'Kickoff at 3pm', source: 'system_of_record', hash: 'x' }), evi({ id: 'c2', label: 'Kickoff at 5pm', source: 'reported', hash: 'y' })],
  });
  const cs = state.claimStates.find(c => c.claimType === 'kickoff_time');
  ok('7 · the conflict is marked disputed, both claims preserved', cs.state === CLAIM.DISPUTED && cs.evidenceIds.length === 2);
  const unc = OS.stateToUncertainties(state).find(u => u.type === 'contradiction');
  ok('7 · a contradiction uncertainty preserves both beliefs (authority-ordered)', unc && unc.currentBeliefs.length === 2 && unc.currentBeliefs.some(b => b.authority === 'organisation'));
  ok('7 · urgency derives from event proximity (2 days ⇒ urgent)', ['high', 'immediate'].includes(unc.urgency));
  ok('7 · it does not auto-supersede either claim (recommend only)', cs.evidenceIds.length === 2);
}

// 8 · SCENARIO 4 — missing owner surfaces ownership uncertainty (no arbitrary leader)
{
  const state = OS.deriveOrgState({
    now, organisation: { id: 'club' }, structure: { responsibilities: [] },
    // An explicitly-required fact the pack does NOT own and nobody is assigned to.
    configuration: { pack: 'sports', requirements: [{ claimType: 'transport_confirmation', neededBy: inDays(2), matches: 'transport|coach travel|bus' }] },
    evidence: [],
  });
  const unc = OS.stateToUncertainties(state);
  ok('8 · an unresolved owner becomes an ownership uncertainty', unc.some(u => u.type === 'unresolved_owner'));
  ok('8 · ownership uncertainty targets NO leader and blocks the ask', unc.filter(u => u.type === 'unresolved_owner').every(u => u.resolutionOwner === null));
}

// 9 · SCENARIO 5 — requirement satisfied ⇒ uncertainty disappears deterministically
{
  const cfg = { pack: 'sports', events: [OS.event({ id: 'm4', type: 'match', title: 'Semi', startAt: inDays(3), participants: 22, owner: 'coach' })] };
  const resp = { responsibilities: [OS.responsibility({ subject: 'coach' })] };
  const before = OS.stateToUncertainties(OS.deriveOrgState({ now, structure: resp, configuration: cfg, evidence: [] }));
  ok('9 · before: game_plan missing ⇒ an uncertainty exists', before.some(u => /game plan/i.test(u.claim)));
  const after = OS.stateToUncertainties(OS.deriveOrgState({ now, structure: resp, configuration: cfg,
    evidence: [evi({ id: 'gp', label: 'Game plan: high press 4-3-3, tactics and formation set', source: 'system_of_record' }),
               evi({ id: 'kt2', label: 'Kickoff at 3pm start time', source: 'system_of_record' }),
               evi({ id: 'av', label: 'Availability squad selected, nobody injured', source: 'system_of_record' })] }));
  ok('9 · after authoritative evidence arrives ⇒ the game_plan uncertainty is gone', !after.some(u => /game plan/i.test(u.claim)));
}

// 10 · provenance preservation + no domain-specific hard-coding in universal primitives
{
  const state = OS.deriveOrgState({ now, configuration: { pack: 'universal', events: [OS.event({ id: 'mtg', type: 'meeting', title: 'Board meeting', startAt: inDays(1) })] }, structure: { responsibilities: [OS.responsibility({ subject: 'admin' })] }, evidence: [] });
  ok('10 · derived requirements carry provenance (source + rule + kind)', state.requirements.every(r => r.provenance && r.provenance.source && r.provenance.kind));
  ok('10 · the universal pack is domain-neutral (no sports terms)', JSON.stringify(OS.PACKS.universal).search(/kickoff|game plan|fixture|\btraining\b/i) === -1);
  ok('10 · state carries an inspectable limitations list', Array.isArray(state.limitations));
}

console.log(`\norg-state-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
