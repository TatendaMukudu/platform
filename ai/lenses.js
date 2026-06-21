/* ============================================================
   ai/lenses.js — Role-conditioned Advisor lenses

   The same member profile should yield DIFFERENT recommendations
   depending on who is asking. A head coach gets leadership and
   accountability guidance; an athletic trainer gets recovery and
   wellbeing guidance; a teacher gets engagement guidance.

   Permissions decide IF you may ask the advisor.
   The lens decides WHAT KIND of answer you get.

   Lenses are keyed by an advisor-role that resolves from, in order:
     user.advisorRole  →  user.title  →  user.role
   so finer-grained roles (assistant_coach, trainer, teacher) work as
   soon as they exist on the user record, without a code change here.
   ============================================================ */

const LENSES = {
  superadmin: {
    label: 'Organizational leadership',
    focus: ['organizational patterns', 'leadership development', 'team-role fit', 'accountability'],
  },
  admin: {
    label: 'Organizational leadership',
    focus: ['organizational patterns', 'leadership development', 'team-role fit', 'accountability'],
  },
  coach: {
    label: 'Head coach',
    focus: ['leadership', 'accountability', 'team role', 'motivation', 'performance under pressure'],
  },
  assistant_coach: {
    label: 'Assistant coach',
    focus: ['training approach', 'communication', 'skill development', 'day-to-day support'],
  },
  trainer: {
    label: 'Athletic trainer',
    focus: ['recovery adherence', 'wellbeing', 'load management', 'support needs'],
  },
  athletic_trainer: {
    label: 'Athletic trainer',
    focus: ['recovery adherence', 'wellbeing', 'load management', 'support needs'],
  },
  teacher: {
    label: 'Teacher',
    focus: ['engagement', 'participation', 'consistency', 'academic support'],
  },
  // Members never receive the advisor — handled by the endpoint, not here.
};

function _key(user) {
  return String(user?.advisorRole || user?.title || user?.role || '')
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/* lensFor — resolve the advisor lens for a requesting user.
   Falls back to the head-coach lens for any leader role we don't have a
   specific lens for, so a new role still gets useful (not generic) output. */
function lensFor(user) {
  if (!user) return null;
  return LENSES[_key(user)] || LENSES[String(user.role || '').toLowerCase()] || LENSES.coach;
}

/* lensDirective — the system-prompt fragment that steers the answer. */
function lensDirective(lens) {
  if (!lens) return '';
  return `REQUESTER LENS — you are advising a ${lens.label}. ` +
    `Tailor recommendations toward: ${lens.focus.join(', ')}. ` +
    `Stay within what this role would actually act on; defer matters outside their remit.`;
}

module.exports = { LENSES, lensFor, lensDirective };
