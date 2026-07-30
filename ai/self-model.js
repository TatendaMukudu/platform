/* ============================================================
   ai/self-model.js — the reasoner, pointed at its OPERATOR (pure)

   IntelliQ learns how the person USING it likes to work — and offers to fit itself
   around them. "You open Marcus's graph most mornings — want it waiting for you?"
   "You clear your own things before the team's — want Today to open that way?" This is
   the same belief machinery as ai/reason.js, aimed at a person's own interaction
   patterns instead of team signals, and it is the one thing a wrapper cannot do:
   a durable, personal model of THIS operator.

   ETHICS, BY CONSTRUCTION (this is what keeps it a companion, not surveillance):
     • BOUNDED. It can only learn from a fixed allow-list of benign, accommodation-
       shaped patterns (which view you open, what order you work). No keystrokes, no
       timing, no content — anything off the list is ignored.
     • PRIVATE TO YOU. A person's self-model is theirs alone. It is NEVER shared with a
       leader above them and never used to evaluate them — it only ever proposes a
       convenience back to the person it's about. (The server must scope it to self.)
     • GOVERNED. Every accommodation is a PROPOSAL (requiresConfirmation). Nothing
       changes until the person says yes.
     • CONTESTABLE + VISIBLE. The person can see everything it believes (selfView) and
       reject any of it ("that's not a thing I do") — which stands it down for a long
       time. Dismiss ("not now") stands it down briefly.

   PURE: imports nothing, no DB/IO. Confidence is evidence-volume over DISTINCT DAYS —
   a habit, not a one-off. Same honest vocabulary as the rest of the system.
   ============================================================ */

const DAY = 86400000;
const STALE   = 30 * DAY;   // a habit unseen for a month goes dormant
const DISMISS = 14 * DAY;   // "not now"
const REJECT  = 180 * DAY;  // "that's not a thing I do"

// The ONLY patterns the self-model will learn. Each maps to a concrete accommodation the
// app could make, and a setting key the caller applies on accept. `needsLabel` patterns
// carry a privacy-safe human label (e.g. "Marcus's graph") supplied by the caller.
const PATTERNS = {
  opens_view:           { needsLabel: true,  setting: 'pin_view',
    accommodate: l => `You usually open ${l} first thing — want it waiting for you here each day?` },
  own_work_first:       { needsLabel: false, setting: 'self_first',
    accommodate: () => `You tend to clear your own things before the team's — want Today to open that way?` },
  own_assessment_first: { needsLabel: false, setting: 'own_assessment_first',
    accommodate: () => `You do your own assessments before setting others' — want yours surfaced first?` },
  readiness_first:      { needsLabel: false, setting: 'readiness_first',
    accommodate: () => `You check team readiness before anything else — want it up top?` },
};

const RESPONSES = new Set(['accept', 'dismiss', 'reject']);
const _conf = days => (days >= 6 ? 'clear' : days >= 3 ? 'emerging' : 'tentative');

/* Fold this tick's interaction events into the persisted habit ledger. Confidence is the
   number of DISTINCT DAYS a pattern recurred (a habit, never a one-off). Pure. */
function learn({ priorHabits = [], events = [], now = Date.now() } = {}) {
  const map = new Map();
  for (const h of priorHabits) if (h && h.id) map.set(h.id, { ...h, days: [...(h.days || [])] });

  for (const e of events) {
    if (!e || !e.pattern || !PATTERNS[e.pattern]) continue;                 // allow-list guard
    const needsLabel = PATTERNS[e.pattern].needsLabel;
    const label = needsLabel ? String(e.label || '').slice(0, 60).trim() : '';
    if (needsLabel && !label) continue;
    const id = `${e.pattern}:${label}`;
    const t = Number.isFinite(e.t) ? e.t : now;
    let h = map.get(id);
    if (!h) { h = { id, pattern: e.pattern, label, days: [], firstSeen: t, lastSeen: t }; map.set(id, h); }
    const day = Math.floor(t / DAY);
    if (!h.days.includes(day)) h.days.push(day);
    h.firstSeen = Math.min(h.firstSeen, t);
    h.lastSeen  = Math.max(h.lastSeen, t);
  }

  return [...map.values()].map(h => {
    const dayCount = h.days.length;
    const suppressed = h.suppressUntil && now < h.suppressUntil;
    const dormant = (now - h.lastSeen) > STALE;
    h.dayCount = dayCount;
    h.confidence = _conf(dayCount);
    h.status = h.accepted ? 'accepted' : suppressed ? 'suppressed' : dormant ? 'dormant' : 'open';
    return h;
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/* The accommodations worth offering right now — an established habit (≥3 distinct days),
   still open (not accepted, dismissed, or stale). Always proposal-gated. */
function proposals(habits, now = Date.now()) {
  return (habits || [])
    .filter(h => h.status === 'open' && h.confidence !== 'tentative')
    .map(h => ({
      habitId: h.id, pattern: h.pattern, setting: PATTERNS[h.pattern].setting,
      text: PATTERNS[h.pattern].accommodate(h.label), seenOnDays: h.dayCount,
      requiresConfirmation: true,
    }));
}

/* The accommodations the person has ACCEPTED and that are still live — the settings the app
   should actually honour right now. This is the read-back that makes an accepted proposal do
   something: a habit only counts once accepted, not rejected, and not gone dormant. Returns a
   flat settings object keyed by each pattern's `setting` (a label for `needsLabel` patterns,
   otherwise `true`), plus `_applied` listing which habit produced each — for transparency.
   Pure. If the same setting is accepted twice (e.g. two pinned views), the earliest wins for
   a stable, deterministic result. */
function activeSettings(habits, now = Date.now()) {
  const out = { _applied: [] };
  for (const h of [...(habits || [])].sort((a, b) => (a.firstSeen || 0) - (b.firstSeen || 0))) {
    if (!h || !h.accepted || h.rejected) continue;
    if (h.lastSeen && (now - h.lastSeen) > STALE) continue;              // an accepted-but-abandoned habit stops applying
    const def = PATTERNS[h.pattern]; if (!def) continue;
    const key = def.setting;
    if (key in out) continue;                                            // first accepted wins (stable)
    out[key] = def.needsLabel ? (h.label || true) : true;
    out._applied.push({ setting: key, habitId: h.id, pattern: h.pattern, label: h.label || null });
  }
  return out;
}

/* The person seeing what IntelliQ has learned about them — full transparency, their data. */
function selfView(habits) {
  return (habits || []).map(h => ({
    habitId: h.id, pattern: h.pattern, label: h.label || null,
    confidence: h.confidence, seenOnDays: h.dayCount, status: h.status,
  }));
}

/* accept → apply the accommodation (and stop proposing it). dismiss → brief cooldown.
   reject → "not a thing I do", stand it down for a long time. In place. */
function applyFeedback(habits, habitId, response, now = Date.now()) {
  if (!RESPONSES.has(response)) return null;
  const h = (habits || []).find(x => x.id === habitId);
  if (!h) return null;
  if (response === 'accept') { h.accepted = true; delete h.suppressUntil; }
  else if (response === 'dismiss') { h.suppressUntil = now + DISMISS; }
  else { h.suppressUntil = now + REJECT; h.rejected = true; }   // reject
  h.feedback = { response, at: now };
  return h;
}

module.exports = {
  learn, proposals, selfView, applyFeedback, activeSettings,
  PATTERNS, RESPONSES, STALE, DISMISS, REJECT,
};
