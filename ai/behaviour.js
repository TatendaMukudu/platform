/* ============================================================
   ai/behaviour.js — the Attention Behaviour layer (pure delivery policy)

   "The operating system owns awareness. The assistant owns conversation. The
    kernel owns truth. Privacy owns boundaries. Behaviour owns delivery."

   This layer decides HOW attention is delivered — never WHAT is true, and never
   WHO may see it. It is the single, canonical place responsible for:
     • grouping insights into Home's sections
     • ordering ("lead with a win")
     • volume limits (how much to show)
     • empty-state / SILENCE behaviour ("nothing deserves surfacing" is success)
     • the assistant's opening message

   NON-NEGOTIABLE BOUNDARY — enforced structurally by this file importing NOTHING
   from the kernel, evidence, server, AI, or the projection's reasoning. It cannot:
     • create insights            • change confidence
     • change audience            • increase visibility
     • bypass privacy             • perform reasoning
     • interpret evidence
   Privacy is entirely upstream: the PROJECTION (ai/proactive) decides visibility
   and audience-safety; BEHAVIOUR only arranges already-safe artifacts. It consumes
   verified ProactiveInsight artifacts; it never generates them.
   ============================================================ */

const polarity = require('./intelligence-feed');

// Ordering constants — delivery concerns, so they live here (not in projection).
const SEV_RANK  = { high: 0, medium: 1, low: 2 };
const CONF_RANK = { clear: 0, confirmed: 0, emerging: 1, medium: 1, tentative: 2, low: 2, calibrating: 2 };

// High/Low membership belongs to the feed's one polarity owner. Behaviour only decides
// ordering, volume and empty-state copy inside those two product buckets.
const BUCKET = polarity.POLARITY_BUCKET;
const BUCKET_LABEL = { high: 'High', low: 'Low' };
const BUCKET_EMPTY = {
  high: { self: 'No High to surface right now.', leader: 'No High to surface right now.' },
  low:  { self: 'Nothing needs your attention right now.', leader: 'Nothing needs your attention right now.' },
};

// SILENCE copy — the absence of attention is a confident, intentional state, not a
// void. ONE canonical line per audience, so every surface says the same calm thing.
const CALM = {
  self:   'Nothing needs your attention right now — you’re in a steady place.',
  leader: 'Nothing needs your attention right now — all steady across your people.',
};
function _calm(audience) { return CALM[audience] || CALM.self; }

/* The bucket an insight is delivered into — derived from its polarity. */
function bucketOf(insight) { return polarity.bucketOf(insight); }

/* Rank WITHIN a bucket by PRIORITY (independent of polarity), then confidence,
   then a stable id — so a milestone can outrank a low risk, and vice versa. */
function _rankCmp(a, b) {
  const s = (SEV_RANK[a.priority] ?? 3) - (SEV_RANK[b.priority] ?? 3);
  if (s) return s;
  const c = (CONF_RANK[a.kernelConfidence] ?? 3) - (CONF_RANK[b.kernelConfidence] ?? 3);
  if (c) return c;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/* ── plan() — the canonical grouping / ordering / volume / silence decision ────
   Groups verified insights into Home's buckets, ranks within each, caps volume,
   and returns first-class empty states. Neutral findings remain in the feed but enter
   neither bucket; opportunity and milestone are Highs under D4.
   Returns { empty, message, groups: { bucket: { label, empty, message, insights } } }.
   Each surfaced insight is annotated with its delivered `bucket`. Pure. */
function plan(insights, opts = {}) {
  const audience = opts.audience === 'leader' ? 'leader' : 'self';
  const limit = Number.isInteger(opts.limit) ? opts.limit : 3;
  const suppressed = opts.suppressed instanceof Set ? opts.suppressed
                   : new Set(Array.isArray(opts.suppressed) ? opts.suppressed : []);
  const order = polarity.BUCKETS;
  const groups = {};
  let total = 0;
  for (const b of order) {
    const seen = new Set();
    const ranked = (insights || [])
      .filter(i => i && bucketOf(i) === b)
      .filter(i => !suppressed.has(i.dedupeKey) && !suppressed.has(i.id))
      .filter(i => (seen.has(i.dedupeKey) ? false : (seen.add(i.dedupeKey), true)))
      .sort(_rankCmp)
      .slice(0, Math.max(0, limit))
      .map(i => ({ ...i, bucket: b }));
    total += ranked.length;
    const emptyMsg = (BUCKET_EMPTY[b] && BUCKET_EMPTY[b][audience]) || '';
    groups[b] = { label: BUCKET_LABEL[b], empty: ranked.length === 0, message: ranked.length ? null : emptyMsg, insights: ranked };
  }
  return {
    empty: total === 0,
    message: total === 0 ? _calm(audience, opts.now) : null,
    groups,
  };
}

/* ── opening() — the assistant's proactive opening, assembled from a plan ───────
   The assistant CONSUMES the plan (verified artifacts) to open a conversation; it
   never generates observations. Time-aware greeting, LEADS with a win when there
   is one (emotional balance), then needs-attention, then opportunity, plus an
   invitation to explore. Empty is a calm, valid opening — never an alarm. Pure. */
function opening(planned, opts = {}) {
  const audience = opts.audience === 'leader' ? 'leader' : 'self';
  const name = opts.name ? String(opts.name).split(' ')[0] : '';
  const hour = new Date(Number.isFinite(opts.now) ? opts.now : Date.now()).getHours();
  const tod  = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const hello = name ? `${tod}, ${name}.` : `${tod}.`;

  if (!planned || planned.empty) {
    return { empty: true, greeting: `${hello} ${planned && planned.message ? planned.message : _calm(audience, opts.now)}`, sections: [], invitation: null };
  }
  // Lead with a win when there is one — emotional balance is the point.
  const ORDER = [['high', 'High'], ['low', 'Low']];
  const sections = [];
  for (const [key, label] of ORDER) {
    const g = planned.groups && planned.groups[key];
    if (!g || !(g.insights || []).length) continue;
    sections.push({ key, label, insights: g.insights });
  }
  return {
    empty: false,
    greeting: `${hello} Here’s what deserves your attention${audience === 'leader' ? '' : ' today'}.`,
    sections,
    invitation: 'Would you like to explore any of these?',
  };
}

module.exports = {
  plan, opening, bucketOf,
  BUCKET, BUCKET_LABEL, SEV_RANK, CONF_RANK,
  _rankCmp, _calm,
};
