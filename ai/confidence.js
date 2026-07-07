/* ============================================================
   ai/confidence.js — the Confidence Engine

   "A system that knows WHERE it is reliable is more trustworthy than a smarter one
   that doesn't." This tracks, per kind of noticing, whether the humans it served
   found it useful — and reports that honestly. It never claims reliability it
   hasn't earned: below a feedback floor it says "calibrating", full stop.

   It gates proactivity two ways:
     • label   — every surfaced noticing carries an honest reliability label.
     • suppress — a kind of noticing that has earned enough feedback AND been mostly
                  unhelpful is quietly stood down (stop nagging about it here).

   Pure + evidence-based. Tally shape: { useful, dismiss } (and optionally
   positive/negative from outcomes). No models, no guessing.
   ============================================================ */

const MIN_FEEDBACK = 4;   // below this we do not claim reliability — we're calibrating

function reliability(tally) {
  const t = tally || {};
  const good  = (t.useful || 0) + (t.positive || 0);
  const bad   = (t.dismiss || 0) + (t.negative || 0);
  const total = good + bad;
  if (total < MIN_FEEDBACK) {
    return { tier: 'calibrating', score: null, total, basis: `still calibrating (${total}/${MIN_FEEDBACK} responses)` };
  }
  const score = good / total;
  const tier = score >= 0.7 ? 'reliable' : score >= 0.45 ? 'promising' : 'unproven';
  return { tier, score: Math.round(score * 100), total, basis: `${good}/${total} found useful` };
}

/* Should a noticing of this kind still be surfaced here? Suppress only once it has
   earned enough feedback and proven mostly unhelpful — never on thin evidence. */
function shouldSurface(rel) {
  if (rel && rel.tier === 'unproven' && rel.total >= 6) return false;
  return true;
}

/* Honest, human label for a reliability read. */
function label(rel) {
  if (!rel || rel.tier === 'calibrating') return 'calibrating';
  return rel.tier === 'reliable' ? 'reliable here'
       : rel.tier === 'promising' ? 'promising here'
       : 'unproven here';
}

module.exports = { reliability, shouldSurface, label, MIN_FEEDBACK };
