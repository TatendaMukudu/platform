/* ============================================================
   ai/org-state.js — PURE organisational-state projection

   A DERIVED, inspectable projection over ALREADY-ADMISSIBLE evidence + explicit org
   configuration + domain-pack rules. It is NOT a second source of truth — canonical
   evidence remains the provenance-bearing substrate; this module only reads what the
   caller has already authorised and computes structure: objectives, events,
   decisions, responsibilities, dependencies, expected-information REQUIREMENTS, claim
   states, and readiness — each carrying provenance (which evidence/rule produced it,
   its confidence, whether it is explicit/derived/provisional).

   It exists so the Inquiry Engine can reason about WHY missing/conflicting information
   matters, WHO owns it, WHEN it becomes urgent, and WHAT it affects — impact, urgency
   and ownership are DERIVED here from named, bounded, tested factors, never assigned
   ad hoc downstream.

   PURE: imports nothing (no server, UI, storage, network). Time comes from `now`.
   PRIVACY: it only ever sees the evidence the caller passes in. Callers MUST pass
   organisation-admissible evidence only — private evidence must never reach here.
   ============================================================ */

const DAY = 86400000;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = n => Math.round(n * 100) / 100;

/* ── Named, bounded weights (documented + tested — never unexplained constants) ── */
// Impact = weighted blend of factors, each normalised to [0,1]. Weights sum-normalise.
// Base impact = weighted blend of OPERATIONAL factors (weights sum to 1). Safety is
// NOT in the base: it is an override booster (see deriveImpact) so a real safety/
// wellbeing concern can DOMINATE, while its ABSENCE never penalises an operational one.
const IMPACT_WEIGHTS = Object.freeze({
  dependents: 0.28,        // how many downstream items/people depend on this
  proximity: 0.28,         // closeness to the event/decision it feeds
  priority: 0.22,          // the objective/event priority
  irreversibility: 0.12,   // how hard the consequence is to undo
  scope: 0.10,             // breadth of people/work affected
});
const IMPACT_BUCKETS = [[0.8, 'critical'], [0.58, 'high'], [0.33, 'medium'], [0.14, 'low'], [0, 'none']];
const URGENCY_BUCKETS = [[0.8, 'immediate'], [0.58, 'high'], [0.33, 'medium'], [0.12, 'low'], [0, 'none']];
const bucket = (score, table) => (table.find(([t]) => score >= t) || [0, 'none'])[1];

/* ── Domain packs — RULE PROVIDERS, not alternate engines. A pack declares event
   types, the information each requires, default lead times, responsibility roles, and
   claim matchers. The universal primitives + Inquiry Engine never change per pack. ── */
const PACKS = Object.freeze({
  universal: {
    events: {
      meeting:  { requires: ['meeting_time', 'meeting_owner'], leadDays: 1, ownerRole: 'admin' },
      deadline: { requires: ['completion_status'], leadDays: 1, ownerRole: 'admin' },
      default:  { requires: [], leadDays: 1, ownerRole: 'admin' },
    },
    requirements: {
      meeting_time:      { freshDays: 30, sensitivity: 'team-shared', matches: /\b(time|when|starts?|begins?|schedule)\b/i },
      meeting_owner:     { freshDays: 90, sensitivity: 'team-shared', matches: /\b(owner|chair|lead|organiser|organizer)\b/i },
      completion_status: { freshDays: 14, sensitivity: 'team-shared', matches: /\b(done|complete|submitted|status|finished)\b/i },
    },
    responsibilities: { admin: ['meeting_owner', 'meeting_time', 'completion_status'] },
  },
  sports: {
    events: {
      match:    { requires: ['kickoff_time', 'game_plan', 'availability'], leadDays: 2, ownerRole: 'coach' },
      training: { requires: ['session_time'], leadDays: 1, ownerRole: 'coach' },
      default:  { requires: [], leadDays: 1, ownerRole: 'coach' },
    },
    requirements: {
      kickoff_time: { freshDays: 30, sensitivity: 'team-shared', leadDays: 1, matches: /\b(kick[ -]?off|kickoff|start time|starts? at)\b/i },
      game_plan:    { freshDays: 14, sensitivity: 'team-shared', leadDays: 2, matches: /\b(game plan|tactic|formation|line[ -]?up|press|shape|set[ -]?piece)\b/i },
      availability: { freshDays: 7,  sensitivity: 'team-shared', leadDays: 2, matches: /\b(availab|who'?s (?:in|out)|selected|squad|injur)\b/i },
      session_time: { freshDays: 14, sensitivity: 'team-shared', leadDays: 1, matches: /\b(session|training) (?:time|at|starts?)\b/i },
    },
    responsibilities: { coach: ['game_plan', 'kickoff_time', 'session_time', 'availability'] },
  },
});
function resolvePack(name) { return PACKS[name] || PACKS.universal; }

/* ── Provenance stamp for every derived element. ── */
function prov({ source, rule, confidence = 0.6, kind = 'derived', evidenceIds = [] }) {
  return { source, rule: rule || null, confidence, kind, evidenceIds: (evidenceIds || []).slice(0, 8) };
}

/* ── Primitive normalisers (defaults + provenance). ── */
function objective(o = {}) {
  return { kind: 'objective', id: o.id || null, title: String(o.title || '').slice(0, 200), scope: o.scope || 'org',
    owner: o.owner || null, status: o.status || 'active', priority: o.priority || 'normal',
    startAt: o.startAt || null, targetAt: o.targetAt || null, successCriteria: o.successCriteria || null,
    evidenceRefs: (o.evidenceRefs || []).slice(0, 12), provenance: o.provenance || prov({ source: 'config', kind: 'explicit', confidence: 0.9 }) };
}
function event(e = {}) {
  return { kind: 'event', id: e.id || null, type: e.type || 'default', title: String(e.title || '').slice(0, 200),
    startAt: e.startAt || null, endAt: e.endAt || null, scope: e.scope || 'team', owner: e.owner || null,
    participants: e.participants || null, dependencies: (e.dependencies || []).slice(0, 12),
    evidenceRefs: (e.evidenceRefs || []).slice(0, 12), provenance: e.provenance || prov({ source: 'config', kind: 'explicit', confidence: 0.9 }) };
}
function decision(d = {}) {
  return { kind: 'decision', id: d.id || null, question: String(d.question || '').slice(0, 240), owner: d.owner || null,
    requiredBy: d.requiredBy || null, requiredInputs: (d.requiredInputs || []).slice(0, 12), status: d.status || 'open',
    decisionClaim: d.decisionClaim || null, provenance: d.provenance || prov({ source: 'config', kind: 'explicit', confidence: 0.9 }) };
}
function responsibility(r = {}) {
  return { kind: 'responsibility', subject: r.subject || null, type: r.type || 'owns', scope: r.scope || 'org',
    effectiveFrom: r.effectiveFrom || null, effectiveTo: r.effectiveTo || null,
    provenance: r.provenance || prov({ source: 'structure', kind: 'explicit', confidence: 0.8 }), confidence: r.confidence != null ? r.confidence : 0.8 };
}
function dependency(d = {}) {
  return { kind: 'dependency', upstream: d.upstream || null, downstream: d.downstream || null, type: d.type || 'blocks',
    requiredState: d.requiredState || 'known', deadlineAt: d.deadlineAt || null, leadDays: d.leadDays != null ? d.leadDays : 0,
    impactIfUnresolved: d.impactIfUnresolved || 'medium', provenance: d.provenance || prov({ source: 'config', kind: 'explicit' }) };
}
function requirement(r = {}) {
  return { kind: 'requirement', id: r.id || null, claimType: r.claimType || null, scope: r.scope || 'team',
    expectedOwner: r.expectedOwner || null, neededBy: r.neededBy || null, freshDays: r.freshDays != null ? r.freshDays : 30,
    purpose: r.purpose || null, sensitivity: r.sensitivity || 'team-shared', forSubjectType: r.forSubjectType || null,
    forSubjectId: r.forSubjectId || null, consequenceIfAbsent: r.consequenceIfAbsent || 'a decision or event is under-prepared',
    provenance: r.provenance || prov({ source: 'pack', kind: 'derived' }) };
}
function operatingRhythm(o = {}) {
  return { kind: 'operating_rhythm', id: o.id || null, process: o.process || null, cadenceDays: o.cadenceDays || null,
    participants: o.participants || null, expectedOutput: o.expectedOutput || null, owner: o.owner || null,
    lastOutputAt: o.lastOutputAt || null, provenance: o.provenance || prov({ source: 'config', kind: 'explicit' }) };
}

const CLAIM = Object.freeze({ KNOWN: 'known', MISSING: 'missing', STALE: 'stale', DISPUTED: 'disputed',
  UNSUPPORTED: 'unsupported', SUPERSEDED: 'superseded', NOT_YET_DUE: 'not_yet_due', NOT_APPLICABLE: 'not_applicable' });

const parseTime = t => { if (!t) return null; const ms = new Date(t).getTime(); return Number.isFinite(ms) ? ms : null; };
const evText = e => `${e.label || ''} ${e.valueText || ''}`;
const evAuthority = e => (e.source === 'system_of_record' ? 'system_of_record' : (e.source === 'reported' || e.provider === 'user' ? 'user_reported' : 'connected'));

/* ── OWNERSHIP RESOLUTION — explicit, inspectable, ordered. Never silently assigns the
   nearest leader. An unresolved owner is a first-class result (blocks autonomous ask). ── */
function resolveOwner({ requirement, event, decision, responsibilities, pack, config }) {
  // 1 · a direct owner on the item.
  const direct = (event && event.owner) || (decision && decision.owner) || (requirement && requirement.expectedOwner);
  if (direct) return { owner: direct, basis: 'direct_owner', confidence: 0.9, unresolved: false };
  // 2 · role responsibility within scope.
  const ct = requirement && requirement.claimType;
  if (ct) {
    const resp = (responsibilities || []).find(r => (pack.responsibilities[r.subject] || []).includes(ct));
    if (resp) return { owner: resp.subject, basis: 'role_responsibility', confidence: resp.confidence || 0.7, unresolved: false };
    // 3 · authoritative source type for the claim (pack default owner role for the event type).
    const roleForClaim = Object.keys(pack.responsibilities || {}).find(role => (pack.responsibilities[role] || []).includes(ct));
    if (roleForClaim) return { owner: roleForClaim, basis: 'authoritative_source_role', confidence: 0.6, unresolved: false };
  }
  // 4 · configured fallback owner.
  if (config && config.fallbackOwner) return { owner: config.fallbackOwner, basis: 'configured_fallback', confidence: 0.4, unresolved: false };
  // 5 · unresolved — first-class uncertainty; do NOT target a leader.
  return { owner: null, basis: 'unresolved', confidence: 0, unresolved: true };
}

/* ── DETERMINISTIC IMPACT — a weighted blend of named factors → a labelled bucket. ── */
function deriveImpact(factors = {}) {
  const f = {
    dependents: clamp(factors.dependents || 0, 0, 1),
    proximity: clamp(factors.proximity || 0, 0, 1),
    priority: clamp(factors.priority || 0, 0, 1),
    irreversibility: clamp(factors.irreversibility != null ? factors.irreversibility : 0.5, 0, 1),
    scope: clamp(factors.scope || 0, 0, 1),
    safety: clamp(factors.safety || 0, 0, 1),
  };
  let base = 0, wsum = 0;
  for (const k of Object.keys(IMPACT_WEIGHTS)) { base += IMPACT_WEIGHTS[k] * f[k]; wsum += IMPACT_WEIGHTS[k]; }
  base = base / wsum;
  // Safety/wellbeing OVERRIDES upward: a real concern dominates; its absence never
  // drags an operational impact down.
  const score = round(clamp(Math.max(base, f.safety), 0, 1));
  return { label: bucket(score, IMPACT_BUCKETS), score, factors: f };
}

/* ── DETERMINISTIC URGENCY — from required-by proximity, lead time, and overdue. ── */
function deriveUrgency({ neededByMs, leadDays = 1, now, overdueDays = 0, cadenceDays = null }) {
  if (overdueDays > 0) return { label: bucket(clamp(0.6 + overdueDays / (Math.max(1, cadenceDays || 7)) * 0.4, 0.6, 1), URGENCY_BUCKETS), score: round(clamp(0.6 + overdueDays / 7 * 0.4, 0.6, 1)), basis: 'overdue' };
  if (!neededByMs) return { label: 'low', score: 0.2, basis: 'no_deadline' };
  const daysToNeeded = (neededByMs - now) / DAY;
  const lead = Math.max(0.5, leadDays);
  // Within lead time ⇒ act now; up to 2× lead ⇒ soon; beyond ⇒ low; past ⇒ immediate.
  let score;
  if (daysToNeeded <= 0) score = 1;
  else if (daysToNeeded <= lead) score = 0.9;
  else if (daysToNeeded <= 2 * lead) score = 0.6;
  else if (daysToNeeded <= 4 * lead) score = 0.35;
  else score = 0.15;
  return { label: bucket(score, URGENCY_BUCKETS), score: round(score), basis: 'time_to_needed_by', daysToNeeded: round(daysToNeeded) };
}

/* ── Match admissible evidence to a requirement's claimType; classify its state. ── */
function classifyClaim({ req, event, evidence, now, packReq }) {
  const matcher = packReq && packReq.matches;
  const scopeOk = e => !req.forSubjectId || e.subjectId === req.forSubjectId;
  const candidates = (evidence || []).filter(e => e.status === 'active' && scopeOk(e) && matcher && matcher.test(evText(e)));
  const neededByMs = req.neededBy ? parseTime(req.neededBy) : (event && event.startAt ? parseTime(event.startAt) - (packReq && packReq.leadDays || req.freshDays ? (packReq && packReq.leadDays || 1) * DAY : 0) : null);

  if (!candidates.length) {
    // Not due yet vs genuinely missing.
    if (neededByMs && (neededByMs - now) > (packReq && packReq.leadDays || 1) * DAY * 2) return { state: CLAIM.NOT_YET_DUE, evidenceIds: [], neededByMs };
    return { state: CLAIM.MISSING, evidenceIds: [], neededByMs };
  }
  // Disputed: >=2 DEFINITE admissible claims (not hedges/placeholders) with different
  // authority AND different content. A "needs corroboration" hedge is a placeholder,
  // not a competing truth, so it never manufactures a dispute (e.g. a person's own
  // "should be fine" followed by their authoritative confirmation is NOT a conflict).
  const disputing = candidates.filter(e => !(e.attributes && e.attributes.definite === false));
  const auths = new Set(disputing.map(evAuthority));
  const hashes = new Set(disputing.map(e => (e.attributes && e.attributes.contentHash) || (e.valueText || '')));
  if (disputing.length >= 2 && auths.size >= 2 && hashes.size >= 2)
    return { state: CLAIM.DISPUTED, evidenceIds: disputing.map(e => e.id).slice(0, 6), neededByMs, beliefs: disputing.map(e => ({ value: String(e.valueText || '').slice(0, 80), authority: evAuthority(e) === 'system_of_record' ? 'organisation' : 'member', confidence: evAuthority(e) === 'system_of_record' ? 0.82 : 0.45, evidenceId: e.id })) };
  // A claim explicitly flagged as needing corroboration does NOT satisfy the
  // requirement — a vague/reported answer is stored but the requirement stays open.
  const satisfying = candidates.filter(e => !(e.attributes && e.attributes.corroborationNeeded === true));
  if (!satisfying.length) return { state: CLAIM.MISSING, evidenceIds: candidates.map(e => e.id).slice(0, 4), neededByMs, awaitingCorroboration: true };
  // Stale: the freshest satisfying candidate is past its freshness window.
  const freshest = satisfying.reduce((a, b) => (parseTime(b.retrievedAt || b.observedAt) || 0) > (parseTime(a.retrievedAt || a.observedAt) || 0) ? b : a);
  const ageDays = (now - (parseTime(freshest.retrievedAt || freshest.observedAt) || now)) / DAY;
  if (packReq && packReq.freshDays && ageDays > packReq.freshDays) return { state: CLAIM.STALE, evidenceIds: [freshest.id], neededByMs, ageDays: round(ageDays) };
  return { state: CLAIM.KNOWN, evidenceIds: [freshest.id], neededByMs };
}

/* ══ THE PROJECTION ══════════════════════════════════════════════════════════════
   Deterministic, inspectable. Consumes admissible evidence + structure + config +
   pack, produces the normalised state with provenance + limitations. ══════════════ */
function deriveOrgState({ now = Date.now(), organisation = {}, structure = {}, configuration = {}, evidence = [] } = {}) {
  const pack = resolvePack(configuration.pack || organisation.pack || 'universal');
  const limitations = [];
  const provenance = [];
  const responsibilities = (structure.responsibilities || []).map(responsibility);

  // 1 · Objectives / events / decisions / rhythms — explicit config first (highest trust),
  //     then evidence-DERIVED events (provisional) where the pack knows the type.
  const objectives = (configuration.objectives || []).map(objective);
  const decisions  = (configuration.decisions || []).map(decision);
  const rhythms    = (configuration.rhythms || []).map(operatingRhythm);
  const events = (configuration.events || []).map(event);

  // Evidence-derived events: an admissible record categorised as an event type with a
  // parseable date. Marked provisional (kind:'derived') — never as trusted as config.
  const EVENT_CATS = { match: 'match', fixture: 'match', game: 'match', meeting: 'meeting', training: 'training', session: 'training', event: 'default' };
  for (const e of evidence) {
    if (e.status !== 'active') continue;
    if (e.attributes && e.attributes.sourceType === 'resolution') continue;   // an answer to a question is never an event
    const cat = (e.attributes && e.attributes.category) || '';
    // Derive an event ONLY from an explicit event CATEGORY — never by keyword-matching
    // arbitrary text ("game plan" contains "game" but is not a match).
    const type = pack.events[cat] ? cat : (pack.events[EVENT_CATS[cat]] ? EVENT_CATS[cat] : null);
    if (!type || !pack.events[type]) continue;
    const when = parseTime(e.attributes && e.attributes.eventAt) || parseTime(e.observedAt) || null;
    if (!when || events.some(ev => ev.evidenceRefs.includes(e.id))) continue;
    events.push(event({ id: 'evt_' + e.id, type, title: e.label || type, startAt: new Date(when).toISOString(), scope: 'team',
      evidenceRefs: [e.id], provenance: prov({ source: 'evidence', rule: 'event_from_category:' + type, kind: 'provisional', confidence: 0.5, evidenceIds: [e.id] }) }));
  }
  if (evidence.some(e => e.status === 'active') && !events.length && !objectives.length) limitations.push('no explicit objectives/events configured — state is thin');

  // 2 · REQUIREMENTS — expected information each event/decision needs, from pack rules.
  const requirements = [];
  const readiness = [];
  const claimStates = [];
  for (const ev of events) {
    const rule = pack.events[ev.type] || pack.events.default;
    const blocking = [];
    for (const ct of (rule.requires || [])) {
      const packReq = pack.requirements[ct] || {};
      const leadDays = packReq.leadDays || rule.leadDays || 1;
      const neededBy = ev.startAt ? new Date(parseTime(ev.startAt) - leadDays * DAY).toISOString() : null;
      const own = resolveOwner({ requirement: requirement({ claimType: ct, expectedOwner: null }), event: ev, responsibilities, pack, config: configuration });
      const req = requirement({ id: `${ev.id}:${ct}`, claimType: ct, scope: ev.scope, expectedOwner: own.owner, neededBy,
        freshDays: packReq.freshDays, sensitivity: packReq.sensitivity, purpose: 'organisation_readiness',
        consequenceIfAbsent: `${ev.type} "${ev.title}" is under-prepared`,
        provenance: prov({ source: 'pack', rule: `requires:${ev.type}->${ct}`, kind: 'derived', confidence: 0.7, evidenceIds: ev.evidenceRefs }) });
      req.ownerBasis = own.basis; req.ownerUnresolved = own.unresolved;
      requirements.push(req);
      const cls = classifyClaim({ req, event: ev, evidence, now, packReq });
      claimStates.push({ requirementId: req.id, claimType: ct, state: cls.state, evidenceIds: cls.evidenceIds || [], neededBy, beliefs: cls.beliefs || null, ageDays: cls.ageDays || null,
        provenance: prov({ source: cls.evidenceIds && cls.evidenceIds.length ? 'evidence' : 'derived', rule: 'claim_state:' + cls.state, kind: 'derived', confidence: 0.7, evidenceIds: cls.evidenceIds || [] }) });
      if ([CLAIM.MISSING, CLAIM.STALE, CLAIM.DISPUTED].includes(cls.state)) blocking.push({ claimType: ct, state: cls.state, requirementId: req.id });
    }
    // 3 · READINESS — blocking reasons + provenance, never a bare percentage.
    const startMs = parseTime(ev.startAt);
    const proximity = startMs ? clamp(1 - Math.max(0, (startMs - now) / DAY) / 14, 0, 1) : 0.3;
    readiness.push({ subjectType: 'event', subjectId: ev.id, title: ev.title, type: ev.type,
      status: blocking.length ? (proximity > 0.6 ? 'at_risk' : 'incomplete') : 'ready',
      blockingRequirements: blocking.map(b => b.claimType), blocking, startAt: ev.startAt,
      confidence: round(0.6 + 0.3 * (blocking.length ? 1 : 0)),
      provenance: prov({ source: 'derived', rule: 'readiness_from_requirements', kind: 'derived', confidence: 0.7, evidenceIds: ev.evidenceRefs }) });
    provenance.push({ element: 'event:' + ev.id, from: ev.provenance });
  }

  // 2b · EXPLICIT requirements the organisation declares directly (highest trust) —
  //      the pack is not the only source of expected information. Ownership resolves
  //      through the same ordered rules; an unresolved owner stays first-class.
  for (const rc of (configuration.requirements || [])) {
    const own = resolveOwner({ requirement: requirement(rc), event: null, responsibilities, pack, config: configuration });
    const req = requirement({ ...rc, id: rc.id || 'req_' + (rc.claimType || 'x'), expectedOwner: own.owner,
      provenance: prov({ source: 'config', rule: 'explicit_requirement', kind: 'explicit', confidence: 0.9 }) });
    req.ownerBasis = own.basis; req.ownerUnresolved = own.unresolved;
    requirements.push(req);
    const packReq = pack.requirements[rc.claimType] || { matches: rc.matches ? new RegExp(rc.matches, 'i') : null, freshDays: rc.freshDays, leadDays: rc.leadDays };
    const cls = classifyClaim({ req, event: null, evidence, now, packReq });
    claimStates.push({ requirementId: req.id, claimType: rc.claimType, state: cls.state, evidenceIds: cls.evidenceIds || [], neededBy: rc.neededBy || null, beliefs: cls.beliefs || null, ageDays: cls.ageDays || null,
      provenance: prov({ source: cls.evidenceIds && cls.evidenceIds.length ? 'evidence' : 'derived', rule: 'claim_state:' + cls.state, kind: 'derived', confidence: 0.7, evidenceIds: cls.evidenceIds || [] }) });
  }

  return { now, organisation: { id: organisation.id || null, pack: configuration.pack || organisation.pack || 'universal' },
    objectives, events, decisions, responsibilities, dependencies: (configuration.dependencies || []).map(dependency),
    requirements, claimStates, readiness, rhythms, provenance, limitations };
}

/* ── STATE → UNCERTAINTIES — the ONE place uncertainties are generated, from derived
   state with DERIVED impact/urgency/ownership. The server passes these to the Inquiry
   Engine unchanged. Only org-admissible evidence is ever referenced. ── */
function stateToUncertainties(state, opts = {}) {
  const now = state.now || Date.now();
  const out = [];
  const eventById = Object.fromEntries((state.events || []).map(e => [e.id, e]));
  for (const cs of (state.claimStates || [])) {
    const req = (state.requirements || []).find(r => r.id === cs.requirementId);
    if (!req) continue;
    const ev = eventById[cs.requirementId.split(':')[0]] || null;
    const dependentsN = ev && ev.participants ? clamp(ev.participants / 25, 0.2, 1) : 0.5;
    const startMs = ev && ev.startAt ? parseTime(ev.startAt) : (cs.neededBy ? parseTime(cs.neededBy) : null);
    const proximity = startMs ? clamp(1 - Math.max(0, (startMs - now) / DAY) / 14, 0, 1) : 0.3;
    const priority = ev && ev.type === 'match' ? 0.8 : 0.5;
    const impact = deriveImpact({ dependents: dependentsN, proximity, priority, irreversibility: 0.6, scope: 0.6, safety: 0 });
    const leadDays = req.provenance && /kickoff|availability|game_plan/.test(req.claimType) ? 2 : 1;
    const urgency = deriveUrgency({ neededByMs: cs.neededBy ? parseTime(cs.neededBy) : startMs, leadDays, now });

    const base = { affects: ev ? { type: 'event', id: ev.id, title: ev.title } : null,
      claimType: req.claimType, requirementId: req.id,
      impact: impact.label, urgency: urgency.label, impactBasis: impact, urgencyBasis: urgency,
      requiredBy: cs.neededBy, resolutionOwner: req.expectedOwner, ownerBasis: req.ownerBasis, ownerAuthoritative: req.ownerBasis === 'direct_owner' || req.ownerBasis === 'role_responsibility',
      privacyClass: req.sensitivity, requiredFor: [req.consequenceIfAbsent], limitations: [] };

    if (req.ownerUnresolved) { out.push({ ...base, id: 'owner_' + req.id, type: 'unresolved_owner', claim: `who owns ${req.claimType.replace(/_/g, ' ')}`, resolutionOwner: null, canChangeDecision: false, limitations: ['no owner could be resolved — asking is blocked until ownership is set'] }); continue; }

    if (cs.state === CLAIM.MISSING) out.push({ ...base, id: 'miss_' + req.id, type: 'missing_required', claim: `${req.claimType.replace(/_/g, ' ')}${ev ? ` for ${ev.title}` : ''}`, canChangeDecision: true });
    else if (cs.state === CLAIM.STALE) out.push({ ...base, id: 'stale_' + req.id, type: 'stale', claim: `${req.claimType.replace(/_/g, ' ')}${ev ? ` for ${ev.title}` : ''}`, observedBaseline: `our record is ~${Math.round(cs.ageDays || 0)} days old`, canChangeDecision: true });
    else if (cs.state === CLAIM.DISPUTED) out.push({ ...base, id: 'contra_' + req.id, type: 'contradiction', claim: `${req.claimType.replace(/_/g, ' ')}${ev ? ` for ${ev.title}` : ''}`, currentBeliefs: cs.beliefs || [], canChangeDecision: true });
  }
  // Readiness rollup: an at-risk event with blockers is itself an actionable signal.
  return out;
}

module.exports = {
  IMPACT_WEIGHTS, IMPACT_BUCKETS, URGENCY_BUCKETS, PACKS, CLAIM,
  objective, event, decision, responsibility, dependency, requirement, operatingRhythm, prov,
  resolvePack, resolveOwner, deriveImpact, deriveUrgency, classifyClaim, deriveOrgState, stateToUncertainties,
};
