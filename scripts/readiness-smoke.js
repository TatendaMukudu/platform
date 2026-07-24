/* Truth layer — TEAM READINESS view-model projection (pure).

   Proves the readiness projection: deterministic focus selection, semantic readiness
   states (never a percentage), structural non-blaming statements, routed questions
   with resolved/unbound targets, disputed preserved, not-yet-due ≠ missing, and calm
   empty states. It is a PROJECTION — it invents no facts and blames no one. Pure — no
   DB, no AI. Run: node scripts/readiness-smoke.js */

const R = require('../ai/readiness');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const now = Date.parse('2026-07-23T09:00:00Z');
const inDays = d => new Date(now + d * 86400000).toISOString();

// A helper to build a minimal org-state-like object with a match + requirements.
function state({ eventInDays = 3, claims = {}, owners = {}, ownerUnresolved = false } = {}) {
  const ev = { id: 'm1', type: 'match', title: 'Cup Final', startAt: inDays(eventInDays), provenance: { kind: 'explicit', source: 'config' } };
  const reqs = Object.keys(claims).map(ct => ({ id: `m1:${ct}`, claimType: ct, expectedOwner: owners[ct] || 'coach', ownerUnresolved, neededBy: inDays(eventInDays - 1) }));
  const claimStates = Object.entries(claims).map(([ct, st]) => ({ requirementId: `m1:${ct}`, claimType: ct, state: st }));
  return { events: [ev], objectives: [], requirements: reqs, claimStates, dependencies: [], decisions: [], limitations: [] };
}

// 1 · focus — a confirmed upcoming event becomes the readiness focus (rule exposed)
{
  const vm = R.project({ state: state({ claims: { game_plan: 'missing' } }), now });
  ok('1 · a confirmed event is the focus', vm.focus && vm.focus.kind === 'event' && vm.focus.title === 'Cup Final');
  ok('1 · the ordering rule is exposed (not opaque)', /soonest upcoming/.test(vm.focus.orderingRule));
}

// 2 · a satisfied requirement moves readiness up; a missing one keeps it constrained
{
  const missing = R.project({ state: state({ claims: { game_plan: 'missing' } }), now });
  ok('2 · a missing requirement → readiness is constrained (not ready)', ['not_ready', 'partially_ready'].includes(missing.readiness.status));
  const known = R.project({ state: state({ claims: { game_plan: 'known' } }), now });
  ok('2 · a satisfied requirement → readiness improves', ['ready', 'partially_ready'].includes(known.readiness.status));
  ok('2 · a missing requirement reads structurally, never as blame', /has not been found/i.test(JSON.stringify(missing.readiness)) && !/failed|unprepared|disengaged|at risk/i.test(JSON.stringify(missing)));
}

// 3 · not-yet-due is NOT missing
{
  const vm = R.project({ state: state({ eventInDays: 20, claims: { game_plan: 'not_yet_due' } }), now });
  ok('3 · a not-yet-due requirement is distinguished from missing', /not due yet/i.test(JSON.stringify(vm.readiness)) && vm.readiness.status !== 'not_ready');
}

// 4 · disputed evidence stays disputed (both preserved, no silent choice)
{
  const vm = R.project({ state: state({ claims: { kickoff_time: 'disputed' } }), now });
  ok('4 · disputed is surfaced and preserved', /conflicts/i.test(JSON.stringify(vm.readiness)) && vm.readiness.constrainedAreas.some(a => /conflict/i.test(a.statement)));
}

// 5 · routed questions come from ranked inquiry plans; blocking ranks first
{
  const uncertainties = [
    { id: 'miss_m1:game_plan', type: 'missing_required', affects: { type: 'event', id: 'm1' } },
    { id: 'stale_m1:availability', type: 'stale', affects: { type: 'event', id: 'm1' } },
  ];
  const plans = [
    { question: 'Has the game plan for the match been confirmed?', why: 'Needed for prep.', owner: 'coach', uncertaintyId: 'miss_m1:game_plan', uncertaintyType: 'missing_required', askWorthiness: 0.7 },
    { question: 'Is the availability review still current?', why: 'Freshness.', owner: 'coach', uncertaintyId: 'stale_m1:availability', uncertaintyType: 'stale', askWorthiness: 0.4 },
  ];
  const vm = R.project({ state: state({ claims: { game_plan: 'missing', availability: 'stale' } }), uncertainties, inquiryPlans: plans, now });
  ok('5 · routed questions are surfaced with reasons + targets', vm.nextQuestions.length === 2 && vm.nextQuestions[0].reason && vm.nextQuestions[0].targetType);
  ok('5 · a blocking (missing) question is marked blocking', vm.nextQuestions[0].blocking === true);
  ok('5 · each question explains WHY + relates to the event', vm.nextQuestions.every(q => q.reason && q.relatedEventId === 'm1'));
  ok('5 · the list is capped for actionability (≤3)', R.project({ state: state({ claims: { a: 'missing', b: 'missing', c: 'missing', d: 'missing' } }), inquiryPlans: new Array(6).fill(plans[0]), uncertainties, now }).nextQuestions.length <= 3);
}

// 6 · role resolution — bound person vs unbound role (never invents a person)
{
  const bindings = [{ status: 'active', roleRef: 'coach', userId: 'u_jordan', effectiveFrom: inDays(-5) }];
  const bound = R.resolveOwner('coach', bindings, now);
  ok('6 · a bound role resolves to the current person', bound.targetType === 'person' && bound.targetRef === 'u_jordan');
  const unbound = R.resolveOwner('coach', [], now);
  ok('6 · an unbound role stays a role (no invented person)', unbound.targetType === 'role' && unbound.bound === false);
  const vm = R.project({ state: state({ claims: { game_plan: 'missing' } }), roleBindings: [], now });
  ok('6 · an unbound owner surfaces as an ownership constraint', vm.readiness.constrainedAreas.some(a => a.id === 'ownership' && /no current person is bound/i.test(a.statement)));
}

// 7 · NEVER a readiness percentage
{
  const vm = R.project({ state: state({ claims: { game_plan: 'missing', availability: 'known' } }), now });
  ok('7 · the view model carries a semantic state, never a percentage', R.STATES.includes(vm.readiness.status) && !/\d{1,3}\s*%/.test(JSON.stringify(vm)));
}

// 8 · empty states — no context vs no active event vs insufficient
{
  const none = R.project({ state: { events: [], objectives: [], limitations: [] }, contextRecords: [], now });
  ok('8 · no operating context → calm empty state, no invented readiness', none.focus === null && none.emptyState === 'no_operating_context' && /does not yet have a confirmed/i.test(none.readiness.summary));
  const pastOnly = R.project({ state: { events: [{ id: 'old', title: 'Past', startAt: inDays(-3) }], objectives: [], limitations: [] }, contextRecords: [{ type: 'event', status: 'active', confirmedAt: iso() }], now });
  ok('8 · context but no upcoming event → distinct empty state', pastOnly.emptyState === 'no_active_objective_or_event');
}
function iso() { return new Date(now).toISOString(); }

// 9 · recent context changes are deterministic (from records, not narrative)
{
  const records = [
    { type: 'event', status: 'active', fields: { title: 'Cup Final' }, confirmedAt: inDays(-1) },
    { type: 'responsibility', status: 'active', fields: { role: 'coach', claimTypes: ['game_plan'] }, confirmedAt: inDays(-2) },
  ];
  const vm = R.project({ state: state({ claims: { game_plan: 'missing' } }), contextRecords: records, now });
  ok('9 · recent context changes are listed from durable records', vm.recentContextChanges.some(c => /added as an active event/i.test(c.statement)) && vm.recentContextChanges.some(c => /responsibility/i.test(c.statement)));
}

// 10 · privacy — nothing private/wellbeing can appear (projection only reads org state)
{
  const vm = R.project({ state: state({ claims: { game_plan: 'missing' } }), now });
  ok('10 · no wellbeing/mood/sentiment terms in the readiness view', !/mood|anxious|wellbeing|sentiment|engagement|burned out|disengaged/i.test(JSON.stringify(vm)));
}

console.log(`\nreadiness-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
