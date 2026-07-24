/* ============================================================
   ai/readiness.js — PURE Team-Readiness view-model projection

   Turns the organisation-state projection (+ its uncertainties, the Inquiry Engine's
   ranked questions, role bindings, and confirmed-context history) into ONE deliberately
   shaped, audience-safe view model that answers, in order:
     1. What are we preparing for?      (focus)
     2. What appears ready?             (readiness + supported areas)
     3. What could prevent readiness?   (constrained areas + limitations)
     4. What should happen next?        (routed questions)

   It is a PROJECTION, not a second reasoning engine: it selects / groups / orders /
   redacts / phrases deterministically. It NEVER invents operational facts, NEVER
   emits a readiness percentage, NEVER blames a person, and NEVER surfaces private
   evidence. Deterministic templates mean it works with NO AI key. PURE: no DB/AI/IO.
   ============================================================ */

const DAY = 86400000;
const STATES = Object.freeze(['ready', 'partially_ready', 'not_ready', 'insufficient_information', 'not_yet_due', 'not_applicable']);
const parse = t => { if (!t) return null; const ms = new Date(t).getTime(); return Number.isFinite(ms) ? ms : null; };
const fmtDate = t => { const ms = parse(t); return ms ? new Date(ms).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : 'an unspecified time'; };

/* ── FOCUS — deterministic ordering; the rule is exposed, never opaque judgement. ──
   Prefer the SOONEST upcoming, authoritatively-confirmed event; else the highest-
   priority active objective. Ties broken by earliest date then id (stable). */
const PRIORITY = { critical: 0, high: 1, normal: 2, low: 3 };
function selectFocus(state, now) {
  const events = (state.events || []).filter(e => e.startAt).map(e => ({ ...e, _ms: parse(e.startAt) }))
    .filter(e => e._ms != null);
  const upcoming = events.filter(e => e._ms >= now).sort((a, b) => (a._ms - b._ms) || (a.id < b.id ? -1 : 1));
  if (upcoming.length) {
    const f = upcoming[0];
    return { kind: 'event', id: f.id, title: f.title, type: f.type, at: f.startAt, provenance: f.provenance || null,
      orderingRule: 'soonest upcoming confirmed event', alternatives: upcoming.length - 1 };
  }
  const objs = (state.objectives || []).filter(o => (o.status || 'active') === 'active')
    .sort((a, b) => (PRIORITY[a.priority] ?? 2) - (PRIORITY[b.priority] ?? 2) || ((parse(a.targetAt) || Infinity) - (parse(b.targetAt) || Infinity)) || (a.id < b.id ? -1 : 1));
  if (objs.length) {
    const o = objs[0];
    return { kind: 'objective', id: o.id, title: o.title, priority: o.priority, at: o.targetAt, provenance: o.provenance || null,
      orderingRule: 'highest-priority active objective', alternatives: objs.length - 1 };
  }
  return null;
}

/* Requirements + claim states attached to the focus (requirement ids are `${eventId}:${claim}`). */
function focusRequirements(state, focus) {
  const reqs = (state.requirements || []).filter(r => String(r.id || '').split(':')[0] === focus.id);
  const csByReq = Object.fromEntries((state.claimStates || []).map(c => [c.requirementId, c]));
  return reqs.map(r => ({ req: r, cs: csByReq[r.id] || { state: 'insufficient_information' } }));
}

/* Resolve an owner reference to a bound person, else report it as an unbound role. */
function resolveOwner(ownerRef, roleBindings, now) {
  if (!ownerRef) return { targetType: 'leader', targetRef: null, bound: false, roleRef: null };
  const b = (roleBindings || []).find(x => x.status === 'active' && x.roleRef === ownerRef &&
    (!x.effectiveFrom || parse(x.effectiveFrom) <= now) && (!x.effectiveTo || parse(x.effectiveTo) > now));
  if (b) return { targetType: 'person', targetRef: b.userId, bound: true, roleRef: ownerRef };
  // Heuristic: a short token with no spaces that isn't a known role reads as a role ref.
  return { targetType: 'role', targetRef: ownerRef, bound: false, roleRef: ownerRef };
}

/* ── Deterministic statement templates by claim state. Never blaming, always structural. ── */
function claimStatement(claimLabel, cs) {
  switch (cs.state) {
    case 'known':       return `A current ${claimLabel} has been recorded.`;
    case 'missing':     return `A current ${claimLabel} has not been found.`;
    case 'stale':       return `The latest ${claimLabel} is older than the permitted freshness period.`;
    case 'disputed':    return `The available evidence for ${claimLabel} conflicts; both records are preserved.`;
    case 'not_yet_due': return `${claimLabel[0].toUpperCase() + claimLabel.slice(1)} is not due yet.`;
    case 'unsupported': return `${claimLabel[0].toUpperCase() + claimLabel.slice(1)} has no supporting evidence yet.`;
    default:            return `${claimLabel[0].toUpperCase() + claimLabel.slice(1)} is not yet established.`;
  }
}
const claimLabelOf = ct => String(ct || 'requirement').replace(/_/g, ' ');

/* ── AREAS — grouped around universal operational primitives (labels may be packed). ── */
function buildAreas(state, focus, fr, roleBindings, now) {
  const areas = [];
  const add = (id, label, st, statement, basis = [], limitations = [], provenance = null) => areas.push({ id, label, state: st, statement, basis, limitations, provenance });

  // Schedule & milestones
  add('schedule', 'Schedule and milestones', 'ready',
    `${focus.kind === 'event' ? (focus.title || 'The event') : 'The objective'} is scheduled for ${fmtDate(focus.at)}.`,
    [{ kind: focus.kind, id: focus.id }], [], focus.provenance);

  // Required information — one area, summarising the claim states.
  if (fr.length) {
    const byState = fr.reduce((m, x) => { (m[x.cs.state] = m[x.cs.state] || []).push(x); return m; }, {});
    const worst = ['missing', 'disputed', 'stale', 'unsupported', 'insufficient_information', 'not_yet_due', 'known'].find(s => byState[s]);
    const st = worst === 'known' ? 'ready' : worst === 'not_yet_due' ? 'not_yet_due'
      : (byState.known ? 'partially_ready' : (worst === 'insufficient_information' ? 'insufficient_information' : 'not_ready'));
    const statement = fr.map(x => claimStatement(claimLabelOf(x.req.claimType), x.cs)).join(' ');
    add('required_information', 'Required information', st, statement,
      fr.map(x => ({ requirementId: x.req.id, claimType: x.req.claimType, claimState: x.cs.state })),
      byState.disputed ? ['Some evidence conflicts and has not been reconciled.'] : []);
  }

  // Ownership — resolved / unbound role / unresolved.
  const owners = [...new Set(fr.map(x => x.req.expectedOwner).filter(Boolean))];
  const unresolved = fr.some(x => x.req.ownerUnresolved);
  if (owners.length || unresolved) {
    const resolved = owners.map(o => ({ ownerRef: o, ...resolveOwner(o, roleBindings, now) }));
    const unbound = resolved.filter(r => r.targetType === 'role' && !r.bound);
    const st = unresolved ? 'not_ready' : unbound.length ? 'partially_ready' : 'ready';
    const statement = unresolved ? 'Ownership has not been assigned for one or more requirements.'
      : unbound.length ? `${unbound.map(u => claimLabelOf(u.roleRef)).join(', ')} owns this responsibility, but no current person is bound to that role.`
      : 'Ownership is assigned and bound to a current person.';
    add('ownership', 'Ownership', st, statement, resolved.map(r => ({ ownerRef: r.ownerRef, bound: r.bound, targetType: r.targetType })),
      unbound.length ? ['A routed question cannot reach a person until the role is bound.'] : []);
  }

  // Dependencies
  const deps = (state.dependencies || []);
  if (deps.length) add('dependencies', 'Dependencies',
    'partially_ready', deps.map(d => `${claimLabelOf(d.upstream)} must be resolved before ${claimLabelOf(d.downstream)}.`).join(' '),
    deps.map(d => ({ upstream: d.upstream, downstream: d.downstream })));

  // Decisions
  const decisions = (state.decisions || []).filter(d => d.status !== 'decided');
  if (decisions.length) add('decisions', 'Decisions', 'not_ready',
    decisions.map(d => `A decision is open: ${d.question}.`).join(' '), decisions.map(d => ({ id: d.id })));

  // Objective clarity (only when the focus is an objective)
  if (focus.kind === 'objective') add('objective_clarity', 'Objective clarity',
    focus.provenance ? 'ready' : 'insufficient_information',
    focus.title ? `The objective "${focus.title}" is confirmed.` : 'No confirmed objective is set.', [{ objectiveId: focus.id }]);

  return areas;
}

/* Overall readiness = the least-ready meaningful area, with not-yet-due / insufficient
   distinguished (never collapsed). */
function overallState(areas) {
  const meaningful = areas.filter(a => a.state !== 'not_applicable');
  if (!meaningful.length) return 'insufficient_information';
  if (meaningful.some(a => a.state === 'not_ready')) return 'not_ready';
  if (meaningful.some(a => a.state === 'insufficient_information') && !meaningful.some(a => a.state === 'ready' || a.state === 'partially_ready')) return 'insufficient_information';
  if (meaningful.some(a => a.state === 'partially_ready' || a.state === 'insufficient_information')) return 'partially_ready';
  if (meaningful.every(a => a.state === 'not_yet_due')) return 'not_yet_due';
  return 'ready';
}
function readinessSummary(focus, st, areas) {
  const constrained = areas.filter(a => ['not_ready', 'partially_ready', 'insufficient_information'].includes(a.state));
  const subj = focus.kind === 'event' ? (focus.title || 'the event') : (focus.title || 'the objective');
  if (st === 'ready') return `Everything IntelliQ can check for ${subj} is in place.`;
  if (st === 'not_yet_due') return `Preparation for ${subj} is on track; nothing is due yet.`;
  if (st === 'insufficient_information') return `There isn't enough confirmed information yet to assess readiness for ${subj}.`;
  return `${subj} has a confirmed ${focus.kind === 'event' ? 'date' : 'target'}, but ${constrained.map(a => a.label.toLowerCase()).join(' and ') || 'some areas'} still need attention.`;
}

/* Map the Inquiry Engine's ranked plans → routed questions (target resolved via bindings). */
function mapQuestions(inquiryPlans, uncertainties, roleBindings, now, cap = 3) {
  const uById = Object.fromEntries((uncertainties || []).map(u => [u.id, u]));
  return (inquiryPlans || []).slice(0, cap).map(p => {
    const u = uById[p.uncertaintyId] || {};
    const tgt = resolveOwner(p.owner, roleBindings, now);
    const blocking = ['missing_required', 'blocked_dependency', 'contradiction'].includes(p.uncertaintyType);
    return { question: p.question, reason: p.why, targetType: tgt.targetType, targetRef: tgt.targetRef,
      roleRef: tgt.bound ? null : tgt.roleRef, blocking,
      relatedEventId: u.affects && u.affects.type === 'event' ? u.affects.id : null,
      relatedRequirementId: (p.uncertaintyId || '').replace(/^(miss_|stale_|contra_|owner_)/, '') || null,
      provenance: { source: 'inquiry_engine', uncertaintyType: p.uncertaintyType, askWorthiness: p.askWorthiness } };
  });
}

/* Deterministic, plain-language history of confirmed-context changes (most recent first). */
function formatChanges(records, now, limit = 5) {
  const label = r => { const f = r.fields || {};
    if (r.type === 'event') return `${f.title || f.type || 'An event'} was added as an active event.`;
    if (r.type === 'responsibility') return `${(f.role || f.subject || 'A role')} was assigned responsibility for ${(f.claimTypes || []).join(', ').replace(/_/g, ' ') || 'work'}.`;
    if (r.type === 'requirement') return `A preparation requirement (${String(f.claimType || '').replace(/_/g, ' ')}) was added.`;
    if (r.type === 'rhythm') return `${f.process || 'A recurring process'} is now part of the operating rhythm.`;
    if (r.type === 'dependency') return `A dependency (${String(f.upstream || '').replace(/_/g, ' ')} → ${String(f.downstream || '').replace(/_/g, ' ')}) was added.`;
    return 'An operating record was added.'; };
  return (records || []).slice().sort((a, b) => String(b.confirmedAt || b.createdAt || '').localeCompare(String(a.confirmedAt || a.createdAt || '')))
    .slice(0, limit).map(r => ({ at: r.confirmedAt || r.createdAt || null,
      statement: r.status === 'superseded' ? 'A previous operating record was superseded.' : r.status === 'retired' ? 'An operating record was retired.' : label(r) }));
}

/* ── THE PROJECTION. ── */
function project({ state = {}, uncertainties = [], inquiryPlans = [], contextRecords = [], roleBindings = [], now = Date.now(), orgId = null } = {}) {
  const focus = selectFocus(state, now);
  const recentContextChanges = formatChanges(contextRecords, now);
  const evidenceFingerprint = state._cache ? null : null;
  if (!focus) {
    const hasAnyContext = (contextRecords || []).some(r => r.status === 'active');
    return { generatedAt: new Date(now).toISOString(), orgId, focus: null,
      readiness: { status: 'insufficient_information', summary: 'IntelliQ does not yet have a confirmed objective or upcoming event to assess readiness against.', supportedAreas: [], constrainedAreas: [], limitations: state.limitations || [] },
      nextQuestions: [], recentContextChanges,
      emptyState: hasAnyContext ? 'no_active_objective_or_event' : 'no_operating_context' };
  }
  const fr = focusRequirements(state, focus);
  const areas = buildAreas(state, focus, fr, roleBindings, now);
  const status = overallState(areas);
  const supportedAreas = areas.filter(a => a.state === 'ready' || a.state === 'not_yet_due');
  const constrainedAreas = areas.filter(a => !['ready', 'not_yet_due', 'not_applicable'].includes(a.state));
  const limitations = [...new Set([...(state.limitations || []), ...areas.flatMap(a => a.limitations || [])])];
  return {
    generatedAt: new Date(now).toISOString(), orgId,
    focus: { kind: focus.kind, id: focus.id, title: focus.title, type: focus.type || null, at: focus.at || null,
      orderingRule: focus.orderingRule, otherActive: focus.alternatives, provenance: focus.provenance ? { kind: focus.provenance.kind, source: focus.provenance.source } : null },
    readiness: { status, summary: readinessSummary(focus, status, areas), supportedAreas, constrainedAreas, limitations },
    nextQuestions: mapQuestions(inquiryPlans, uncertainties, roleBindings, now),
    recentContextChanges,
    emptyState: null,
  };
}

module.exports = { STATES, project, selectFocus, buildAreas, overallState, mapQuestions, formatChanges, resolveOwner, claimStatement };
