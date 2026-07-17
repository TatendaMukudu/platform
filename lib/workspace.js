/* ============================================================
   lib/workspace.js — the unified personal workspace item model.

   MyWorkspace is ONE conversation-first surface. Every input a person brings into it
   — "I'm exhausted today", "remember this privately", "draft a plan for the team",
   "Jordan missed three deadlines" — becomes a TYPED, SCOPED object. The person (or a
   suggestion they confirm) decides what it is and who may see it; IntelliQ never
   infers or changes privacy silently.

   THE BOUNDARY this protects: the organisation can understand its people without
   owning their private inner lives. A personal-private item may support the
   individual without ever being exposed, quoted, or turned into organisational
   evidence — unless the person explicitly permits it.

   Pure + deterministic: the schema, the classification SUGGESTER (a proposal only),
   and the enforcement predicates. The server owns storage and applies these.
   ============================================================ */

/* WHO the item concerns / how far it may travel. */
const SCOPES = ['personal_private', 'personal_shared', 'organizational', 'team', 'specific_people'];
/* WHAT kind of thing it is. */
const PURPOSES = ['reflection', 'note', 'evidence', 'plan', 'commitment', 'task', 'observation'];
/* WHO may see it. */
const VISIBILITIES = ['only_me', 'manager', 'team', 'organization'];
/* HOW IntelliQ may use it — the privacy contract, from most protective to most open. */
const AI_USES = ['private_assistance_only', 'may_inform_recommendations', 'may_be_cited', 'may_be_shared'];

const _s = (v, n) => (v == null ? '' : String(v)).slice(0, n);
const _oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);

/* Suggest a classification for free text. A PROPOSAL the person confirms — never
   applied silently. Deterministic heuristics (the server may enrich the wording with
   AI, but the structural default is here so privacy never depends on a model call).
   Emotional/first-person hardship → private reflection. A factual statement about
   someone else → an organisational observation. A "plan/draft" ask → a plan. */
function suggestClassification(text, opts = {}) {
  const t = String(text || '').toLowerCase();
  const aboutSelf = /\b(i|i'm|im|i am|my|me|myself|i've|ive)\b/.test(t) && !/\b(they|he|she|their|his|her|team|everyone)\b/.test(t.slice(0, 40));
  const hardship = /\b(exhausted|struggling|struggle|overwhelmed|anxious|anxiety|depress|burn(ed)?\s?out|can't cope|cant cope|stressed|drained|lonely|down|hopeless|crying|panic)\b/.test(t);
  const wantsPlan = /\b(plan|draft|prepare|organi[sz]e|schedule|outline|strategy)\b/.test(t);
  const commitment = /\b(i will|i'll|commit|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week)|deadline|promise)\b/.test(t);
  const aboutOther = /\b(jordan|alex|sarah|[A-Z][a-z]+)\b/.test(String(text || '')) && /\b(missed|late|failed|didn't|behind|deadline|struggling with|needs)\b/.test(t) && !aboutSelf;
  const growth = /\b(improve|get better at|work on my|develop|learn to|coach said|feedback)\b/.test(t);

  let s;
  if (hardship || (aboutSelf && growth)) {
    s = { scope: 'personal_private', purpose: 'reflection', visibility: 'only_me', aiUsage: 'private_assistance_only',
      reason: 'This reads as something personal about you — kept private, used only to support you, never shown or quoted to leaders.' };
  } else if (aboutOther) {
    s = { scope: 'organizational', purpose: 'observation', visibility: 'manager', aiUsage: 'may_be_cited',
      reason: 'This is an observation about someone else — visible to authorised leaders and eligible to become evidence.' };
  } else if (wantsPlan) {
    s = { scope: 'personal_shared', purpose: 'plan', visibility: 'only_me', aiUsage: 'may_inform_recommendations',
      reason: 'This looks like a plan you\'re working on — yours by default; it can inform IntelliQ\'s suggestions to you.' };
  } else if (commitment) {
    s = { scope: 'personal_shared', purpose: 'commitment', visibility: 'only_me', aiUsage: 'may_inform_recommendations',
      reason: 'This reads as a commitment — tracked for you; it can shape reminders and suggestions.' };
  } else {
    s = { scope: 'personal_shared', purpose: 'note', visibility: 'only_me', aiUsage: 'may_inform_recommendations',
      reason: 'A note kept for you; it can inform IntelliQ\'s support without being shared.' };
  }
  s.confidence = 'suggested';   // ALWAYS a suggestion — the person confirms
  return s;
}

/* Build a normalised, explicitly-scoped item. The classification is whatever the
   caller passes (a confirmed suggestion) — this function never re-guesses it. */
function buildItem(input = {}) {
  const now = new Date().toISOString();
  const scope = _oneOf(input.scope, SCOPES, 'personal_shared');
  // A personal_private item can never carry an outward AI-use — enforce the floor.
  let aiUsage = _oneOf(input.aiUsage, AI_USES, 'may_inform_recommendations');
  let visibility = _oneOf(input.visibility, VISIBILITIES, 'only_me');
  if (scope === 'personal_private') { aiUsage = 'private_assistance_only'; visibility = 'only_me'; }
  return {
    id: _s(input.id, 64) || null,
    org: _s(input.org, 64).toLowerCase(),
    ownerId: _s(input.ownerId, 64),
    text: _s(input.text, 8000),
    media: input.media || null,
    scope, purpose: _oneOf(input.purpose, PURPOSES, 'note'), visibility, aiUsage,
    audience: Array.isArray(input.audience) ? input.audience.slice(0, 50).map(a => _s(a, 64)) : [],   // for specific_people
    classifiedBy: input.classifiedBy === 'ai' ? 'ai_suggested_user_confirmed' : 'user',
    links: (input.links && typeof input.links === 'object') ? input.links : {},   // note→plan→commitment lineage
    createdAt: _s(input.createdAt, 40) || now, updatedAt: now,
  };
}

/* ── The enforcement predicates — deterministic, the single source of truth ──── */

/* May this item inform the ORGANISATION's reasoning at all? Private-assistance-only
   items never do — they support the owner and no one else. */
function informsOrgReasoning(item) {
  return !!item && item.scope !== 'personal_private' && item.aiUsage !== 'private_assistance_only';
}
/* May IntelliQ quote/cite this to leaders? Only when explicitly permitted AND not
   owner-only. */
function citableToLeaders(item) {
  return !!item && (item.aiUsage === 'may_be_cited' || item.aiUsage === 'may_be_shared') && item.visibility !== 'only_me';
}
/* May this become canonical organisational EVIDENCE? Only observations/evidence the
   person allowed to be cited or shared, and never personal_private. */
function becomesEvidence(item) {
  return !!item && item.scope !== 'personal_private'
    && (item.aiUsage === 'may_be_cited' || item.aiUsage === 'may_be_shared')
    && (item.purpose === 'observation' || item.purpose === 'evidence');
}
/* Can a viewer (by role) see this item at all? The owner always can. */
function visibleTo(item, viewer) {
  if (!item) return false;
  if (viewer && viewer.userId && viewer.userId === item.ownerId) return true;   // owner
  if (item.visibility === 'only_me') return false;
  if (item.visibility === 'organization') return true;
  const role = viewer && viewer.role;
  if (item.visibility === 'manager') return role === 'coach' || role === 'admin' || role === 'superadmin';
  if (item.visibility === 'team') return true;   // team-mates; server narrows by group
  return false;
}
/* Map an item's AI-use to the kernel signal sensitivity, so the existing privacy gate
   treats it correctly (sensitive → informs but never revealed; normal → citable). */
function signalSensitivity(item) {
  if (!item || item.aiUsage === 'private_assistance_only') return null;   // no org signal at all
  return item.aiUsage === 'may_inform_recommendations' ? 'sensitive' : 'normal';
}

module.exports = {
  SCOPES, PURPOSES, VISIBILITIES, AI_USES,
  suggestClassification, buildItem,
  informsOrgReasoning, citableToLeaders, becomesEvidence, visibleTo, signalSensitivity,
};
