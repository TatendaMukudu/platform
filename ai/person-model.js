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
const { STALE, REJECT } = require('./self-model');
const DAY = 86400000;

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
    const at = Number.isFinite(Number(obs.at)) ? Number(obs.at) : Date.now();
    const day = Math.floor(at / DAY);
    const prior = m[dim][t];
    const rec = prior && typeof prior === 'object'
      ? prior : { days: [], firstSeen: null, lastSeen: null };
    if (!rec.days.includes(day)) rec.days.push(day);
    rec.days.sort((a, b) => a - b);
    rec.firstSeen = rec.firstSeen == null ? at : Math.min(rec.firstSeen, at);
    rec.lastSeen = rec.lastSeen == null ? at : Math.max(rec.lastSeen, at);
    m[dim][t] = rec;
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

function correct(model, { dimension, token, at = Date.now() } = {}) {
  const m = _isValidModel(model) ? model : blankModel();
  const rec = m[dimension]?.[String(token || '').toLowerCase().trim()];
  if (rec && typeof rec === 'object') rec.rejectedUntil = at + REJECT;
  return m;
}

/* The leading token for a dimension IF it clears the evidence floor and is
   actually ahead of the runner-up. Otherwise null (honest: we don't know yet). */
function _leader(counts, floor, now) {
  const pairs = Object.entries(counts || {}).map(([token, rec]) => {
    if (!rec || typeof rec !== 'object') return null; // old count shape: history with unknown time
    if (!Number.isFinite(rec.lastSeen) || now - rec.lastSeen > STALE) return null;
    if (Number.isFinite(rec.rejectedUntil) && now < rec.rejectedUntil) return null;
    return [token, Array.isArray(rec.days) ? rec.days.length : 0, rec];
  }).filter(Boolean).sort((a, b) => b[1] - a[1]);
  if (!pairs.length) return null;
  const [topTok, topN, rec] = pairs[0];
  if (topN < floor) return null;
  const runnerUp = pairs[1] ? pairs[1][1] : 0;
  if (topN === runnerUp) return null;         // tie → not yet confident
  return { value: topTok, evidence: topN, firstSeen: rec.firstSeen, lastSeen: rec.lastSeen };
}

/* understanding(model) — the confidence-gated summary the Coach may use.
   Only dimensions that clear the floor appear. This is the ONLY thing that
   should shape a person-facing reflection. */
function understanding(model, { floor = FLOOR, now = Date.now() } = {}) {
  const m = _isValidModel(model) ? model : blankModel();
  const out = {};
  for (const d of DIMENSIONS) {
    const led = _leader(m[d], floor, now);
    if (led) out[d] = led;
  }
  return out;
}

/* Whether we understand a person at all yet (any evidenced dimension). */
function isEvidenced(model, opts) {
  return Object.keys(understanding(model, opts)).length > 0;
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
  correct,
};
