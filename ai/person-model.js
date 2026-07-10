/* ============================================================
   ai/person-model.js — the Person Model (continuity = the moat)

   A structured, evidence-weighted understanding of ONE person that compounds
   over time. Council-ratified 2026-07-09. This is NOT LLM fine-tuning — it is
   explicit, inspectable understanding: how they engage, what motivates them,
   what overwhelms them, the coaching that lands.

   Three laws, enforced by construction here:
     1. PRIVACY  — the model stores only categorical tokens from fixed
        vocabularies, NEVER raw text. A disclosure literally cannot be stored,
        so it cannot leak. `publicProjection()` gives the org NOTHING private.
     2. HONESTY  — understanding is confidence-gated: a dimension is only
        asserted once it clears an evidence floor. Below the floor → null.
     3. OWNERSHIP — the model is the person's; it is designed to be shown back
        to them and corrected (see server: self-only /api/user/memory).

   Pure and deterministic — no DB, no AI key. Safe in the truth layer.
   ============================================================ */

'use strict';

// Fixed vocabularies. update() ignores anything not on these lists, which is
// what guarantees "no raw text ever enters the model".
const VOCAB = {
  timing:        ['morning', 'midday', 'evening', 'night'],
  communication: ['brief', 'detailed', 'visual', 'direct', 'gentle'],
  motivators:    ['progress', 'mastery', 'teammates', 'recognition', 'competition', 'purpose'],
  overwhelmers:  ['load', 'uncertainty', 'conflict', 'isolation', 'pressure', 'change'],
  coaching:      ['affirming', 'direct', 'questioning', 'structured', 'autonomy'],
};
const DIMENSIONS = Object.keys(VOCAB);

// Evidence floor: how many observations before we'll assert we "understand"
// a dimension. Same spirit as the Confidence Engine — never claim early.
const FLOOR = 3;

/* A fresh, empty model. */
function blankModel() {
  const m = { version: 1, interactions: 0, updatedAt: null };
  for (const d of DIMENSIONS) m[d] = {};
  return m;
}

function _isValidModel(m) {
  return m && typeof m === 'object' && m.version === 1 && DIMENSIONS.every(d => m[d] && typeof m[d] === 'object');
}

/* update(model, obs) — fold one interaction's observations into the model.
   obs = { timing?, communication?, coaching?: token, motivators?/overwhelmers?: token|token[] }
   Unknown tokens are silently ignored (privacy-by-construction). Returns the
   same model object (mutated) for convenience; callers persist it. */
function update(model, obs = {}) {
  const m = _isValidModel(model) ? model : blankModel();
  let touched = false;

  const bump = (dim, token) => {
    if (typeof token !== 'string') return;
    const t = token.toLowerCase().trim();
    if (!VOCAB[dim].includes(t)) return;      // not in vocabulary → ignored
    m[dim][t] = (m[dim][t] || 0) + 1;
    touched = true;
  };

  for (const d of DIMENSIONS) {
    const v = obs[d];
    if (Array.isArray(v)) v.forEach(tok => bump(d, tok));
    else if (v != null)   bump(d, v);
  }

  if (touched) {
    m.interactions = (m.interactions || 0) + 1;
    m.updatedAt = new Date().toISOString();
  }
  return m;
}

/* The leading token for a dimension IF it clears the evidence floor and is
   actually ahead of the runner-up. Otherwise null (honest: we don't know yet). */
function _leader(counts, floor) {
  const pairs = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  if (!pairs.length) return null;
  const [topTok, topN] = pairs[0];
  if (topN < floor) return null;
  const runnerUp = pairs[1] ? pairs[1][1] : 0;
  if (topN === runnerUp) return null;         // tie → not yet confident
  return { value: topTok, evidence: topN };
}

/* understanding(model) — the confidence-gated summary the Coach may use.
   Only dimensions that clear the floor appear. This is the ONLY thing that
   should shape a person-facing reflection. */
function understanding(model, { floor = FLOOR } = {}) {
  const m = _isValidModel(model) ? model : blankModel();
  const out = {};
  for (const d of DIMENSIONS) {
    const led = _leader(m[d], floor);
    if (led) out[d] = led;
  }
  return out;
}

/* Whether we understand a person at all yet (any evidenced dimension). */
function isEvidenced(model) {
  return Object.keys(understanding(model)).length > 0;
}

/* publicProjection(model) — what PLATFORM (leaders/org) may see. By law: nothing
   private. Only that a model exists and rough engagement volume — never a single
   dimension value, never a token, never text. This is the boundary that keeps
   the model the person's own. */
function publicProjection(model) {
  const m = _isValidModel(model) ? model : blankModel();
  return { hasModel: (m.interactions || 0) > 0, interactions: m.interactions || 0 };
}

module.exports = {
  VOCAB, DIMENSIONS, FLOOR,
  blankModel, update, understanding, isEvidenced, publicProjection,
};
