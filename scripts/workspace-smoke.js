/* ============================================================
   scripts/workspace-smoke.js — the unified workspace item model (pure).

   Every input is a typed, scoped object. Privacy is deterministic and visible: the AI
   suggests, the person confirms, and a personal-private item never leaks.

   Run:  node scripts/workspace-smoke.js   (part of `npm test`)
   ============================================================ */

const w = require('../lib/workspace');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('\n=== Unified workspace items ===\n');

// ── Classification is a SUGGESTION, and privacy-first for hardship ──────────
const s1 = w.suggestClassification("I'm exhausted and struggling to cope this week");
ok('emotional first-person input is suggested PERSONAL-PRIVATE, assist-only',
   s1.scope === 'personal_private' && s1.aiUsage === 'private_assistance_only' && s1.visibility === 'only_me' && s1.confidence === 'suggested');
const s2 = w.suggestClassification('Jordan missed the last three project deadlines');
ok('an observation about someone else is suggested ORGANISATIONAL, citable',
   s2.scope === 'organizational' && s2.purpose === 'observation' && s2.aiUsage === 'may_be_cited');
ok('every suggestion is explicitly labelled a suggestion (never auto-applied)', s1.confidence === 'suggested' && s2.confidence === 'suggested');

// ── The private FLOOR is enforced structurally, not by trust ────────────────
const priv = w.buildItem({ org: 'CO', ownerId: 'u1', text: 'a hard week', scope: 'personal_private', aiUsage: 'may_be_shared', visibility: 'organization' });
ok('a personal_private item is FORCED to assist-only + only-me (even if asked otherwise)',
   priv.aiUsage === 'private_assistance_only' && priv.visibility === 'only_me');

// ── Enforcement predicates (the single source of truth) ─────────────────────
const privRef = w.buildItem({ org: 'CO', ownerId: 'u1', text: 'a hard week', scope: 'personal_private', purpose: 'reflection' });
ok('a personal_private item never informs org reasoning', !w.informsOrgReasoning(privRef));
ok('a personal_private item is never citable to leaders', !w.citableToLeaders(privRef));
ok('a personal_private item is never ORGANISATIONAL evidence', !w.becomesOrgEvidence(privRef));
ok('a meaningful personal_private item DOES become PRIVATE canonical evidence (owner-only)', w.becomesPrivateEvidence(privRef));
ok('private evidence carries the "private" canonical visibility', w.canonicalVisibility(privRef) === 'private');
ok('a personal_private item emits NO org signal (no sensitivity)', w.signalSensitivity(privRef) === null);

const obs = w.buildItem({ org: 'CO', ownerId: 'u1', text: 'Jordan missed deadlines', scope: 'organizational', purpose: 'observation', visibility: 'manager', aiUsage: 'may_be_cited' });
ok('a permitted organisational observation informs the org', w.informsOrgReasoning(obs));
ok('a permitted observation is citable to leaders and can become org evidence', w.citableToLeaders(obs) && w.becomesOrgEvidence(obs));
ok('a citable observation maps to a NORMAL signal sensitivity', w.signalSensitivity(obs) === 'normal');

const shared = w.buildItem({ org: 'CO', ownerId: 'u1', text: 'my plan', scope: 'personal_shared', purpose: 'plan', aiUsage: 'may_inform_recommendations' });
ok('a may_inform item informs the org but is NOT citable and NOT org evidence',
   w.informsOrgReasoning(shared) && !w.citableToLeaders(shared) && !w.becomesOrgEvidence(shared) && w.signalSensitivity(shared) === 'sensitive');

// ── Visibility ──────────────────────────────────────────────────────────────
ok('the owner can always see their own item', w.visibleTo(priv, { userId: 'u1', role: 'member' }));
ok('a leader cannot see an only_me item', !w.visibleTo(priv, { userId: 'boss', role: 'admin' }));
ok('a manager-visible item is visible to a coach/admin', w.visibleTo(obs, { userId: 'boss', role: 'coach' }));

console.log(`\n=== workspace-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
