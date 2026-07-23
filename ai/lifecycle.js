/* ============================================================
   ai/lifecycle.js — PURE evidence-lifecycle / knowledge-governance primitives

   Reasons about WHAT TO KEEP and WHAT TO LET GO — before anyone asks. Every piece of
   canonical evidence has a useful life that depends on WHAT KIND of thing it is (a
   fixture goes stale in a week; a policy is near-evergreen) and WHO/what vouches for
   it (a system-of-record decays slower than a person's assertion). This module turns
   an evidence envelope + its age into a retention VERDICT (keep / review / retire /
   supersede-candidate) and, crucially, turns a STALE-but-required record into a
   proactive UNCERTAINTY the Inquiry Engine can decide whether to ask about.

   It is PURE: no DB, no AI, no clock of its own (the caller passes `now`). It NEVER
   deletes — it recommends. Provenance is preserved until an authorised person acts.
   The authority tier is supplied by the caller (retrieval.trustTier) so there is ONE
   authority model, not two.
   ============================================================ */

// Expected HALF-LIFE (days) by evidence category — the time for confidence to halve.
// Operational facts decay fast; institutional knowledge is near-evergreen.
const HALF_LIFE_DAYS = Object.freeze({
  schedule: 7, fixture: 7, schedule_change: 7, availability: 7,
  metric: 14, score: 14, result: 14, status: 10,
  meeting_note: 30, decision: 45, plan: 30,
  objective: 180, knowledge: 180, roster: 90,
  procedure: 365, policy: 365, reference: 365,   // evergreen-ish
  default: 90,
});
// Categories whose content stays valid until explicitly changed — they AGE (worth a
// periodic review) but never auto-"expire" into retirement.
const EVERGREEN = new Set(['policy', 'procedure', 'reference', 'objective', 'knowledge']);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = n => Math.round(n * 100) / 100;
const DAY = 86400000;

/* Half-life for this evidence, modulated by authority: a system-of-record record
   holds its value roughly twice as long as a person's report of the same kind. */
function halfLife(category, authorityTier) {
  const base = HALF_LIFE_DAYS[category] || HALF_LIFE_DAYS.default;
  const mult = authorityTier === 'system_of_record' ? 2 : authorityTier === 'user_reported' ? 0.6 : 1;
  return base * mult;
}

const CONF0 = { confirmed: 0.95, high: 0.9, verified: 0.9, medium: 0.7, reported: 0.6, low: 0.4 };

/* Assess ONE evidence envelope. Returns freshness, decayed confidence, and a
   retention VERDICT with human-readable reasons. Deterministic in (envelope, now). */
function assess(env, now = Date.now()) {
  const category = (env && env.attributes && env.attributes.category) || env.type || 'default';
  const tier = env && env.authorityTier ? env.authorityTier : (env && env.source === 'system_of_record' ? 'system_of_record' : (env && (env.source === 'reported' || env.provider === 'user') ? 'user_reported' : 'connected'));
  const ts = env && (env.retrievedAt || env.observedAt);
  const ageDays = ts ? Math.max(0, (now - new Date(ts).getTime()) / DAY) : null;
  const hl = halfLife(category, tier);
  const evergreen = EVERGREEN.has(category);
  const conf0 = CONF0[(env && env.confidence)] != null ? CONF0[env.confidence] : 0.6;
  const decayed = ageDays == null ? conf0 : round(conf0 * Math.pow(2, -ageDays / hl));

  const reasons = [];
  let status, verdict;
  if (env && env.status === 'superseded') { status = 'superseded'; verdict = 'retire'; reasons.push('a newer version exists'); }
  else if (ageDays == null) { status = 'fresh'; verdict = 'keep'; reasons.push('no timestamp — treated as current'); }
  else {
    const r = ageDays / hl;
    // NEVER recommend discarding information that has no replacement — only a
    // SUPERSEDED record (a newer version exists) retires. Stale/expired records are
    // flagged for REVIEW (confirm or refresh with the owner), never silently dropped.
    if (r < 0.5)      { status = 'fresh';   verdict = 'keep'; }
    else if (r < 1)   { status = 'aging';   verdict = 'keep';   reasons.push('past half its useful life'); }
    else if (r < 2)   { status = 'stale';   verdict = 'review'; reasons.push(`${category} record older than its ~${Math.round(hl)}-day half-life`); }
    else              { status = 'expired'; verdict = 'review'; reasons.push(`well past its useful life (${Math.round(ageDays)}d) — confirm or replace`); }
    if (evergreen && (status === 'stale' || status === 'expired')) reasons.push('evergreen — confirm still current, do not auto-retire');
  }
  return { evidenceId: env && env.id, category, authorityTier: tier, ageDays: ageDays == null ? null : round(ageDays),
    halfLifeDays: round(hl), evergreen, confidenceNow: decayed, status, verdict, reasons };
}

/* Reconcile a set of ACTIVE assessments: flag REDUNDANT records (same topic, same
   authority, near-identical) as merge candidates, and stale-but-owned records as
   review candidates. Does not act — recommends. `topicKey(env)` groups by subject. */
function reconcile(items, opts = {}) {
  const tokens = opts.tokens || (t => (String(t || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 3));
  const overlap = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.min(a.size, b.size); };
  const metas = (items || []).map(x => ({ ...x, toks: new Set(tokens(`${x.label || ''} ${x.text || ''}`)) }));
  const redundant = [];
  for (let i = 0; i < metas.length; i++) for (let j = i + 1; j < metas.length; j++) {
    const A = metas[i], B = metas[j];
    if (A.authorityTier !== B.authorityTier) continue;             // a conflict across authority is the Inquiry Engine's job, not a merge
    if (overlap(A.toks, B.toks) >= 0.7) redundant.push({ keep: A.evidenceId, mergeCandidate: B.evidenceId, overlap: round(overlap(A.toks, B.toks)) });
  }
  return { redundant };
}

/* Turn a STALE, still-REQUIRED assessment into an uncertainty the Inquiry Engine can
   weigh — the proactive "is this still current?" question, routed to its owner. Only
   review-verdict items with a resolution owner become uncertainties (fresh ones and
   ownerless ones do not generate questions). Returns null otherwise. */
function toUncertainty(assessment, ctx = {}) {
  if (!assessment || (assessment.verdict !== 'review' && assessment.status !== 'stale')) return null;
  if (!ctx.owner) return null;
  return {
    id: `stale_${assessment.evidenceId}`, type: 'stale',
    claim: (ctx.label || assessment.category || 'a shared record').slice(0, 120),
    requiredFor: ctx.requiredFor || ['a shared record staying correct'],
    observedBaseline: `our ${assessment.category} record is ~${Math.round(assessment.ageDays || 0)} days old`,
    impact: ctx.impact || (assessment.evergreen ? 'low' : 'medium'),
    urgency: ctx.urgency || 'low',
    resolutionOwner: ctx.owner, ownerAuthoritative: ctx.ownerAuthoritative === true,
    privacyClass: ctx.privacyClass || 'team-shared',
    lastAskedAt: ctx.lastAskedAt || null,
  };
}

/* A one-line hygiene rollup for a whole knowledge base (counts + top recommendations).
   The "what to keep / what to let go" summary — recommendation-only. */
function summarise(assessments) {
  const by = { fresh: 0, aging: 0, stale: 0, expired: 0, superseded: 0 };
  const retire = [], review = [];
  for (const a of (assessments || [])) {
    by[a.status] = (by[a.status] || 0) + 1;
    if (a.verdict === 'retire') retire.push(a.evidenceId);
    else if (a.verdict === 'review') review.push(a.evidenceId);
  }
  return { total: (assessments || []).length, counts: by, retireCandidates: retire, reviewCandidates: review };
}

module.exports = { HALF_LIFE_DAYS, EVERGREEN, halfLife, assess, reconcile, toUncertainty, summarise };
