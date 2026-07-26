/* ============================================================
   ai/conversation.js — PURE grounded conversation engine (intake, not a chatbot)

   Generalises the answer-and-confirm loop into ONE reusable dialogue: determine what is
   already known → identify what is still required → ask the smallest useful question →
   adjudicate the answer → shape a governed write proposal → (caller confirms) → re-derive.

   It serves assessments and structured check-ins now, and is shaped to serve readiness
   uncertainties and ordinary organisational questions later — WITHOUT a second reasoning
   path. It is coordination logic only: it plans, classifies, selects, and adjudicates; it
   NEVER writes, mutates a projection, or becomes a source of truth. The durable truth is
   confirmed canonical evidence; a session is only conversational progress.

   Discipline: PURE — imports nothing. Deterministic. No LLM. The existing adjudication
   (ai/inquiry.adjudicateAnswer) is INJECTED, so this module composes with the one set of
   authority/visibility rules rather than reinventing them. Callers apply governance.
   ============================================================ */

const SCHEMA_VERSION = 1;
const DAY = 86400000;
function _hash(str) { let h = 5381; const s = String(str); for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(36); }
const norm = s => String(s == null ? '' : s).trim();
const refOf = label => norm(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'claim';

const CLAIM_STATES = Object.freeze(['already_known', 'missing', 'stale', 'disputed', 'unsupported', 'partially_known', 'not_applicable']);
const OUTCOMES = Object.freeze(['answered', 'partially_answered', 'ambiguous', 'unrelated', 'contradiction', 'requires_corroboration', 'already_known', 'unsafe_visibility_increase']);

/* ── REQUIRED CLAIMS — the information a purpose needs. For an assessment/check-in, each
   defined field is one required claim. `kind:'open'` = a reflection/response that any
   substantive answer satisfies (a member's own submission); `kind:'factual'` = a yes/no/
   status claim where the existing adjudication's authority rules decide satisfaction. ── */
function requiredClaims(definition = {}) {
  const fields = Array.isArray(definition.fields) && definition.fields.length ? definition.fields
    : [{ label: 'Your response', hint: '' }];
  const freshDays = Number.isFinite(definition.freshDays) ? definition.freshDays : (definition.purpose === 'checkin' ? 1 : 30);
  return fields.map((f, i) => ({
    ref: refOf(f.ref || f.label || `field_${i + 1}`),
    label: norm(f.label) || `Field ${i + 1}`,
    hint: norm(f.hint),
    kind: f.kind === 'factual' ? 'factual' : 'open',
    freshDays: Number.isFinite(f.freshDays) ? f.freshDays : freshDays,
    order: i,
  }));
}

/* ── CLASSIFY — where each required claim stands, given the admissible answers already on
   record for it. `evidenceByRef[ref]` is an array of prior answers, each:
   { at, authority, corroborationNeeded, definite, contentHash }. Never reads raw text. ── */
function classifyClaims(claims, { evidenceByRef = {}, now = Date.now() } = {}) {
  return claims.map(c => {
    const evs = (evidenceByRef[c.ref] || []).slice().sort((a, b) => (Date.parse(b.at || 0) || 0) - (Date.parse(a.at || 0) || 0));
    if (evs.some(e => e.notApplicable)) return { ...c, state: 'not_applicable', evidence: [] };
    if (!evs.length) return { ...c, state: 'missing', evidence: [] };
    const definite = evs.filter(e => e.definite !== false && e.corroborationNeeded !== true);
    // Disputed: two definite answers of different authority AND different content.
    const auths = new Set(definite.map(e => e.authority));
    const hashes = new Set(definite.map(e => e.contentHash));
    if (definite.length >= 2 && auths.size >= 2 && hashes.size >= 2) return { ...c, state: 'disputed', evidence: evs.slice(0, 4) };
    // Adequate authority for THIS claim kind: open self-report needs any report; factual needs authoritative.
    const adequate = definite.filter(e => c.kind === 'open' ? true : e.authority === 'authoritative');
    if (!adequate.length) {
      // Only hedged/placeholder answers exist → provided but not resolved.
      return { ...c, state: 'partially_known', evidence: evs.slice(0, 4) };
    }
    const freshest = adequate[0];
    const ageDays = (now - (Date.parse(freshest.at || 0) || now)) / DAY;
    if (ageDays > c.freshDays) return { ...c, state: 'stale', ageDays: Math.round(ageDays), evidence: [freshest] };
    return { ...c, state: 'already_known', evidence: [freshest] };
  });
}

/* ── PLAN — orient the conversation: what is required, what is already resolved, what is
   still open (missing/stale/disputed), plus a deterministic fingerprint. ── */
function buildPlan({ definition = {}, claims = null, evidenceByRef = {}, now = Date.now(), purpose = 'assessment', subjectRef = null } = {}) {
  const req = claims || requiredClaims({ ...definition, purpose });
  const classified = classifyClaims(req, { evidenceByRef, now });
  const isOpen = st => ['missing', 'stale', 'disputed'].includes(st);
  const openClaims = classified.filter(c => isOpen(c.state));
  const resolvedClaims = classified.filter(c => c.state === 'already_known');
  const planFingerprint = _hash(JSON.stringify([SCHEMA_VERSION, purpose, subjectRef, req.map(c => c.ref).sort(), definition.version || 0]));
  return { planFingerprint, purpose, subjectRef, requiredClaims: req, claims: classified, openClaims, resolvedClaims,
    orientation: _orientation(purpose, classified) };
}
function _orientation(purpose, claims) {
  const known = claims.filter(c => c.state === 'already_known').length;
  const open = claims.filter(c => ['missing', 'stale', 'disputed'].includes(c.state)).length;
  if (!open) return purpose === 'checkin' ? 'Your check-in is already up to date from what you have shared.' : 'Everything needed is already on record — the result can be derived without more questions.';
  const noun = purpose === 'checkin' ? 'check-in' : 'assessment';
  return known
    ? `Picking up your ${noun}: ${known} thing${known === 1 ? '' : 's'} already recorded, ${open} still to cover.`
    : `Starting your ${noun}: I'll ask ${open} short question${open === 1 ? '' : 's'} to capture what's needed.`;
}

/* ── NEXT QUESTION — the smallest useful ask: the next OPEN claim, concrete before broad,
   never a claim already answered with sufficient authority + freshness, never a semantic
   repeat of one already asked (`askedRefs`). Returns null when nothing is left to ask. ── */
function nextQuestion(plan, { askedRefs = [] } = {}) {
  const asked = new Set(askedRefs);
  const rank = { missing: 0, stale: 1, disputed: 2 };
  const candidates = plan.openClaims.filter(c => !asked.has(c.ref))
    .sort((a, b) => (rank[a.state] - rank[b.state]) || (a.order - b.order) || a.ref.localeCompare(b.ref));
  const c = candidates[0];
  if (!c) return null;
  const q = _questionFor(c, plan.purpose);
  return { claimRef: c.ref, claimKind: c.kind, state: c.state, question: q, fingerprint: _hash(plan.planFingerprint + '|' + c.ref + '|' + q) };
}
function _questionFor(c, purpose) {
  if (c.state === 'stale') return `Is “${c.label}” still current? ${c.hint || ''}`.trim();
  if (c.state === 'disputed') return `There are conflicting notes on “${c.label}”. What's correct? ${c.hint || ''}`.trim();
  const base = c.hint ? `${c.label} — ${c.hint}` : c.label;
  return purpose === 'checkin' ? `${base}?`.replace(/\?\?$/, '?') : `Tell me about: ${base}.`;
}

/* ── ADJUDICATE — compose with the injected adjudicateAnswer (the ONE authority/rules
   engine) and map to a conversation outcome. An empty/acknowledgement/question-back never
   satisfies. A hedged answer records but does NOT resolve (partially_answered). A
   substantive answer resolves an OPEN claim; a factual claim follows the authority rules. ── */
function adjudicate({ answer, claim, actorIsOwner = false, actorIsLeader = false, actorIsMember = true, hasExistingAuthoritative = false, notApplicable = false, adjudicateAnswer }) {
  if (typeof adjudicateAnswer !== 'function') throw new Error('adjudicate requires the injected adjudicateAnswer');
  if (notApplicable) return { outcome: 'answered', notApplicable: true, proposal: { claimRef: claim.ref, valueText: `${claim.label}: not applicable`, notApplicable: true, corroborationNeeded: false, definite: true, authority: 'reported' }, limitations: [], classification: 'marked_not_applicable' };
  const adj = adjudicateAnswer({ answer, isOwner: actorIsOwner, isLeader: actorIsLeader, isMember: actorIsMember, claimLabel: claim.label, claimType: claim.ref, hasExistingAuthoritative });
  const map = { non_answer: 'unrelated', clarification: 'ambiguous' };
  let outcome = map[adj.responseKind];
  if (!outcome) {
    if (adj.resolution === 'contradicts') outcome = 'contradiction';
    else if (adj.authority === 'needs_corroboration' || adj.proposal && adj.proposal.corroborationNeeded) outcome = 'requires_corroboration';
    else if (adj.resolution === 'resolves' || adj.resolution === 'partially_resolves') outcome = 'answered';
    else outcome = 'ambiguous';
  }
  // An OPEN reflection claim is satisfied by any substantive answer; a hedged one is
  // recorded but flagged and does NOT resolve.
  const proposal = adj.proposal ? {
    claimRef: claim.ref, valueText: adj.proposal.valueText, notApplicable: false,
    corroborationNeeded: adj.proposal.corroborationNeeded === true, definite: adj.proposal.definite !== false,
    authority: adj.authority,
  } : null;
  return { outcome, notApplicable: false, proposal, authority: adj.authority, confidence: adj.confidence,
    limitations: adj.limitations || [], classification: adj.classification };
}

/* Whether an adjudicated answer RESOLVES its claim (vs merely records it). */
function resolvesClaim(claim, adjudication) {
  if (adjudication.outcome === 'answered') {
    if (claim.kind === 'factual') return adjudication.authority === 'authoritative';
    return true;                                   // open reflection: a substantive answer resolves it
  }
  return false;                                    // requires_corroboration / ambiguous / unrelated / contradiction → not resolved
}

/* ── PROPOSED WRITE — a governed proposal, never a projection mutation. Only produced when
   the adjudication yielded a proposal (answered / requires_corroboration / not-applicable). ── */
function proposalFrom(adjudication, { claim, subjectRef, visibilityClass = 'normal', sessionId = '', resolves = false } = {}) {
  if (!adjudication || !adjudication.proposal) return null;
  const p = adjudication.proposal;
  return {
    kind: 'record_answer', claimRef: claim.ref, claimLabel: claim.label,
    valueText: p.valueText, subjectRef: subjectRef || null,
    visibility: visibilityClass, authorityClass: p.authority, corroborationNeeded: p.corroborationNeeded,
    notApplicable: p.notApplicable === true, resolvesClaim: resolves,
    fingerprint: _hash(sessionId + '|' + claim.ref + '|' + _hash(p.valueText || '') + '|' + p.authority),
  };
}

/* ── COMPLETION — the session is done when no required claim is still missing/stale/
   disputed (resolved, partially_known, or not_applicable all count as "handled"). Reports
   which claims are only partially covered so the outcome can be honest about limitations. ── */
function completion(claims) {
  const stillOpen = claims.filter(c => ['missing', 'stale', 'disputed'].includes(c.state));
  const partial = claims.filter(c => c.state === 'partially_known');
  if (stillOpen.length) return { complete: false, reason: 'open_claims_remaining', open: stillOpen.map(c => c.ref) };
  const limitations = partial.length ? [`${partial.length} response${partial.length === 1 ? '' : 's'} recorded but not firmly confirmed`] : [];
  return { complete: true, reason: partial.length ? 'complete_with_partial' : 'all_resolved', partial: partial.map(c => c.ref), limitations };
}

/* ── EXPLAINABILITY — why a claim was skipped or is still being asked, in plain, member-
   safe language. Derived from the SAME classification that drives the questions, so "why
   didn't you ask me that?" is answered honestly (never a fabricated rationale). No authority
   metadata, ids, or raw text — only the claim label + a reason + a relative time. ── */
function _relTime(at, now) {
  const t = Date.parse(at || 0);
  if (!Number.isFinite(t)) return '';
  const days = Math.floor((now - t) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `about ${Math.round(days / 7)} weeks ago`;
  return `on ${new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
function explainClaims(plan, { now = Date.now() } = {}) {
  const known = [], open = [];
  for (const c of (plan.claims || [])) {
    const when = (c.evidence && c.evidence[0] && c.evidence[0].at) ? _relTime(c.evidence[0].at, now) : '';
    if (c.state === 'already_known') known.push({ label: c.label, reason: when ? `You covered this ${when}, and nothing suggests it has changed — so I'm not asking again.` : 'You have already covered this, so I\'m not asking again.' });
    else if (c.state === 'not_applicable') known.push({ label: c.label, reason: 'You marked this as not applicable.' });
    else if (c.state === 'stale') open.push({ label: c.label, reason: when ? `Your last answer was ${when}, so I'll check it's still current.` : 'Your last answer may be out of date.' });
    else if (c.state === 'partially_known') open.push({ label: c.label, reason: 'You gave a tentative answer — worth firming up.' });
    else if (c.state === 'disputed') open.push({ label: c.label, reason: 'There are conflicting notes on this, so I need the correct one.' });
    else open.push({ label: c.label, reason: 'This still needs an answer.' });
  }
  return { known, open };
}

module.exports = {
  SCHEMA_VERSION, CLAIM_STATES, OUTCOMES,
  requiredClaims, classifyClaims, buildPlan, nextQuestion, adjudicate, resolvesClaim, proposalFrom, completion,
  explainClaims, _refOf: refOf,
};
