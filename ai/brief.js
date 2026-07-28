/* ============================================================
   ai/brief.js — the node-aware proactive BRIEF (pure delivery-layer composer)

   Sits beside ai/behaviour.js at the DELIVERY layer. It turns a greeting into a
   proactive agenda: an opening read PLUS level-appropriate, governed OFFERS. It
   composes — it never reasons.

   NON-NEGOTIABLE BOUNDARY (same as behaviour.js, enforced by importing NOTHING):
     • It does not detect, reason, or change confidence.
     • It does not scope or change visibility — the WEB already did that upstream;
       this module only arranges the already-scoped, already-safe inputs it's handed.
     • It manufactures nothing: items come only from the `reads` it's given; offers
       come only from a fixed allow-list; if an input isn't there, the offer isn't made.
     • Every offer is proposal-gated (requiresConfirmation) — it proposes, a human acts.

   The caller (server) uses the web to decide LEVEL (org-graph.scopeOfActor), to SCOPE
   the reads (visibleNodesFor/canSee), to AGGREGATE (org-routing.rollupFor), and to
   ROUTE (org-graph.routeTarget) — then hands the results here to be shaped.
   ============================================================ */

const GREET = h => (h === 'morning' ? 'Morning' : h === 'evening' ? 'Evening' : 'Afternoon');
const _cap = s => (s && s.length ? s[0].toUpperCase() + s.slice(1) : s);
const _txt = p => (typeof p === 'string' ? p : (p && (p.statement || p.text)) || '');

// The ONLY offers the brief may make. Each maps to a governed action the caller routes
// through the existing proposal → confirm pipeline. Nothing off this list can be offered.
const OFFERS = {
  report:          'See the grounded report',
  recognise:       'Recognise what’s going well',
  set_assessment:  'Set an assessment for your team',
  self_assessment: 'Try a personal assessment',
  peer_methods:    'See what’s helped your teammates',
  ask_help:        null,   // text is built with the router target
};
function _offer(action, text) { return { action, text: text || OFFERS[action], requiresConfirmation: true }; }

/* Compose the brief. `reads` are the already-scoped, already-safe things worth surfacing
   (for a leader: the team agenda; for a member: their own reads). Everything else is an
   optional, already-computed input. Level decides the shape and the offer set. */
function compose({
  level = 'member', name = '', timeOfDay = 'afternoon',
  reads = [], practices = [], routeTo = null, rollupHeadline = null,
  areaLabel = 'your area',
} = {}) {
  const greeting = `${GREET(timeOfDay)}${name ? ' ' + name : ''}.`;
  const items = (reads || []).filter(r => r && r.text).map(r => ({ text: String(r.text), meta: r.meta ? String(r.meta) : null }));
  const hasProgress = (reads || []).some(r => r && r.polarity === 'progress');
  const offers = [];
  let read;

  if (level === 'leader') {
    read = rollupHeadline
      ? _cap(String(rollupHeadline)) + (items.length ? ` And ${items.length} thing${items.length === 1 ? '' : 's'} worth a look.` : '')
      : items.length
        ? `${_cap(areaLabel)} is mostly steady — ${items.length} thing${items.length === 1 ? '' : 's'} worth a look.`
        : `${_cap(areaLabel)} looks steady — nothing needs you this second.`;
    if (items.length) offers.push(_offer('report'));
    if (hasProgress) offers.push(_offer('recognise'));
    offers.push(_offer('set_assessment'));
    if (practices.length) items.push({ text: `What’s been driving it: ${_txt(practices[0])}`, meta: 'confirmed practice' });
  } else {
    read = items.length ? 'One thing worth a look on your side.' : 'You’re steady — nothing needs you this second.';
    if (practices.length) offers.push(_offer('peer_methods'));
    offers.push(_offer('self_assessment'));
    if (routeTo && routeTo.label) offers.push(_offer('ask_help', `Ask ${routeTo.label} for help`));
  }

  return {
    level,
    opening: `${greeting} ${read}`.trim(),
    items,
    offers,
    // audit: every offer is on the allow-list and proposal-gated (the tests assert this).
    safe: offers.every(o => (o.action in OFFERS) && o.requiresConfirmation === true),
  };
}

module.exports = { compose, OFFERS, GREET };
