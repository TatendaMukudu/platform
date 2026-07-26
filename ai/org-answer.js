/* ============================================================
   ai/org-answer.js — PURE scoped organisational answering

   A leader or member asks an ordinary organisational question in free text. This turns it
   into a grounded answer over the ALREADY-SCOPED org-state the caller passes in — so the
   answer is bounded by the asker's branch of the information web (they never see a sibling
   branch), grounded in confirmed evidence (never invented), honest about its limits, and
   ROUTED to the right owner when it cannot be answered from what's in scope.

   It is NOT a new reasoning engine and NOT a free-form generator: intent detection is a
   small, explicit matcher (structural routing, not reasoning), and every answer is composed
   from the scoped org-state's own claims/requirements/events. Determinism means it works
   with no AI key; an LLM may later re-phrase the grounded payload, never invent it.

   Discipline: PURE — imports nothing, deterministic, no LLM. Privacy/scope are enforced by
   the caller passing an already-scoped state (private evidence never reaches org-state).
   Member-safe output: labels + states, never raw evidence, ids, or authority metadata.
   ============================================================ */

const INTENTS = Object.freeze(['readiness', 'outstanding', 'ownership', 'focus', 'claim_status', 'unknown']);
const norm = s => String(s == null ? '' : s).toLowerCase();
const labelOf = ct => String(ct || 'requirement').replace(/_/g, ' ');
const STATE_WORD = { known: 'recorded', missing: 'not yet recorded', stale: 'out of date', disputed: 'in conflict', not_yet_due: 'not due yet', not_applicable: 'not applicable' };

/* ── Intent — an explicit matcher over a small, documented set. Order matters (most
   specific first). This is routing, not reasoning; it never fabricates an answer. ── */
function classifyQuestion(text) {
  const q = norm(text);
  if (!q.trim()) return { intent: 'unknown' };
  if (/\bwho\b.*(owns|responsible|handles|should|leads)|owner of|responsible for|who'?s (doing|on)/.test(q)) return { intent: 'ownership' };
  if (/\b(ready|readiness|prepared|on track|good to go|set for)\b/.test(q)) return { intent: 'readiness' };
  if (/\b(missing|outstanding|left to do|still need|to ?do|gaps?|blocked|blockers?|not done|remaining|what'?s left)\b/.test(q)) return { intent: 'outstanding' };
  if (/\b(preparing for|focus|coming up|next (event|match|game|meeting)|what'?s next)\b/.test(q)) return { intent: 'focus' };
  if (/\b(is|are|has|have|status of|done|confirmed|sorted|in place)\b/.test(q)) return { intent: 'claim_status' };
  return { intent: 'unknown' };
}

/* Match a claimType referenced in the question against those present in scope. */
function _matchClaim(question, requirements) {
  const q = norm(question);
  let best = null, bestLen = 0;
  for (const r of (requirements || [])) {
    const words = labelOf(r.claimType);
    if (q.includes(words) && words.length > bestLen) { best = r; bestLen = words.length; }
  }
  return best;
}
const _stateOf = (claimStates, requirementId) => (claimStates || []).find(c => c.requirementId === requirementId);

/* ── answer — the grounded response over scoped state, or a route to an owner. Inputs:
   { question, state (scoped org-state), areaLabel, nodeLeader:{present,label}, now }. ── */
function answer({ question = '', state = {}, areaLabel = 'your area', nodeLeader = null, now = Date.now() } = {}) {
  const { intent } = classifyQuestion(question);
  const reqs = state.requirements || [];
  const claimStates = state.claimStates || [];
  const events = state.events || [];
  const limitations = [`Based only on what's confirmed in ${areaLabel}.`];
  const routeWhenStuck = (why) => ({ answerable: false, intent, answer: routePhrase(nodeLeader, why, areaLabel),
    basis: [], limitations, routeTo: routeTarget(nodeLeader, why) });

  // Nothing in scope at all → be honest + route, never guess.
  if (!reqs.length && !events.length) return routeWhenStuck('there is nothing recorded in your area yet');

  if (intent === 'focus') {
    const upcoming = events.filter(e => e.startAt).map(e => ({ e, ms: Date.parse(e.startAt) })).filter(x => Number.isFinite(x.ms) && x.ms >= now).sort((a, b) => a.ms - b.ms)[0];
    if (!upcoming) return { answerable: false, intent, answer: `There's no upcoming event confirmed in ${areaLabel} right now.`, basis: [], limitations, routeTo: null };
    return { answerable: true, intent, answer: `${areaLabel[0].toUpperCase() + areaLabel.slice(1)} is preparing for ${upcoming.e.title || upcoming.e.type}.`,
      basis: [{ kind: 'event', title: upcoming.e.title || upcoming.e.type }], limitations, routeTo: null };
  }

  if (intent === 'ownership') {
    const r = _matchClaim(question, reqs);
    if (!r) return routeWhenStuck('I couldn\'t tell which responsibility you mean');
    if (r.ownerUnresolved || !r.expectedOwner) return { answerable: false, intent, answer: `No one is currently assigned to ${labelOf(r.claimType)} in ${areaLabel}.`, basis: [{ kind: 'requirement', claimType: labelOf(r.claimType), state: (_stateOf(claimStates, r.id) || {}).state }], limitations, routeTo: routeTarget(nodeLeader, 'ownership is unassigned') };
    return { answerable: true, intent, answer: `${labelOf(r.claimType)} is owned by the ${labelOf(r.expectedOwner)}${r.ownerBasis === 'direct_owner' ? '' : ' role'}.`, basis: [{ kind: 'requirement', claimType: labelOf(r.claimType) }], limitations, routeTo: null };
  }

  if (intent === 'claim_status') {
    const r = _matchClaim(question, reqs);
    if (!r) return routeWhenStuck('I couldn\'t match that to something tracked in your area');
    const cs = _stateOf(claimStates, r.id) || { state: 'missing' };
    return { answerable: true, intent, answer: `${labelOf(r.claimType)[0].toUpperCase() + labelOf(r.claimType).slice(1)} is ${STATE_WORD[cs.state] || cs.state}.`,
      basis: [{ kind: 'claim', claimType: labelOf(r.claimType), state: cs.state }], limitations, routeTo: cs.state === 'missing' || cs.state === 'stale' ? routeTarget(nodeLeader, 'this needs an answer') : null };
  }

  // readiness + outstanding both summarise the open claims in scope.
  const open = [];
  for (const r of reqs) {
    const cs = _stateOf(claimStates, r.id);
    if (cs && ['missing', 'stale', 'disputed'].includes(cs.state)) open.push({ claimType: labelOf(r.claimType), state: cs.state });
  }
  const known = claimStates.filter(c => c.state === 'known').length;

  if (intent === 'outstanding') {
    if (!open.length) return { answerable: true, intent, answer: `Nothing is outstanding in ${areaLabel} — everything tracked is recorded.`, basis: [], limitations, routeTo: null };
    return { answerable: true, intent, answer: `Outstanding in ${areaLabel}: ${open.map(o => `${o.claimType} (${STATE_WORD[o.state] || o.state})`).join('; ')}.`,
      basis: open.map(o => ({ kind: 'claim', claimType: o.claimType, state: o.state })), limitations, routeTo: routeTarget(nodeLeader, 'these need answers') };
  }

  if (intent === 'readiness') {
    if (!open.length) return { answerable: true, intent, answer: `Everything IntelliQ can check in ${areaLabel} is in place.`, basis: [], limitations, routeTo: null };
    return { answerable: true, intent, answer: `${areaLabel[0].toUpperCase() + areaLabel.slice(1)} has ${known} thing${known === 1 ? '' : 's'} recorded, but ${open.length} still need${open.length === 1 ? 's' : ''} attention: ${open.map(o => o.claimType).join(', ')}.`,
      basis: open.map(o => ({ kind: 'claim', claimType: o.claimType, state: o.state })), limitations, routeTo: routeTarget(nodeLeader, 'to close these out') };
  }

  // unknown intent → don't pretend; route or defer.
  return routeWhenStuck('that\'s not something I can answer from your area\'s records');
}

function routeTarget(nodeLeader, why) {
  if (nodeLeader && nodeLeader.present) return { to: nodeLeader.label || 'your area lead', why };
  return null;
}
function routePhrase(nodeLeader, why, areaLabel) {
  const base = `I don't have enough in ${areaLabel} to answer that — ${why}.`;
  if (nodeLeader && nodeLeader.present) return `${base} The best person to ask is ${nodeLeader.label || 'your area lead'}.`;
  return base;
}

module.exports = { INTENTS, classifyQuestion, answer };
