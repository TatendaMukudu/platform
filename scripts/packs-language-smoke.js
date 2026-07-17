/* ============================================================
   scripts/packs-language-smoke.js — the domain-LANGUAGE pass.

   Proves that the SAME universal facts produce organisation-appropriate LANGUAGE
   CONTEXT for the model — sports/education/business/nonprofit — while the kernel's
   primitives, meaning, and confidence are never touched. Pure + deterministic:
   it tests the instruction the model receives, which is the honest unit here (no
   live model needed, and no live model could make these guarantees).

   Run:  node scripts/packs-language-smoke.js   (part of `npm test`)
   ============================================================ */

const packs = require('../ai/packs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('\n=== Domain language pass ===\n');

const D = id => packs.resolveDomain(null, { pack: id });
const dir = (id, opts) => packs.domainDirective(D(id), opts);

// ── 1. The same fact renders in each pack's own words ───────────────────────
const sports = dir('sports'), edu = dir('education'), biz = dir('business'), np = dir('nonprofit');
ok('sports directive names the sport words (player / team / match)',
   /"player"/.test(sports) && /"team"/.test(sports) && /"match"/.test(sports));
ok('education directive names the school words (student / class / lesson)',
   /"student"/.test(edu) && /"class"/.test(edu) && /"lesson"/.test(edu));
ok('business directive names the workplace words (team member / department / meeting)',
   /"team member"/.test(biz) && /"department"/.test(biz) && /"meeting"/.test(biz));
ok('nonprofit directive names the programme words (participant / cohort)',
   /"participant"/.test(np) && /"cohort"/.test(np));
ok('the four packs produce genuinely different guidance (not one template)',
   new Set([sports, edu, biz, np]).size === 4);

// ── 2. Custom vocabulary overrides pack defaults ────────────────────────────
const custom = packs.domainDirective(packs.resolveDomain('school', { pack: 'education', vocab: { person: 'scholar' } }));
ok('a custom word (scholar) overrides the pack default (student) in the directive',
   /"scholar"/.test(custom) && !/→ "student"/.test(custom));

// ── 3. Role sensitivity — a non-athlete is not a "player" ───────────────────
const staffDir = dir('sports', { subjectRole: 'a staff member' });
ok('a known staff role suppresses the generic person word for the subject',
   /a staff member/.test(staffDir) && /not a "player"/.test(staffDir));
ok('the base directive still instructs respecting each subject\'s ACTUAL role',
   /respect each subject's ACTUAL role/i.test(sports));

// avoidGenericForSubject: leadership certain but role unknown (e.g. a captain) —
// the directive must SUPPRESS the generic noun WITHOUT inventing a profession.
const avoidDir = dir('sports', { avoidGenericForSubject: true });
ok('the title-free suppression signal tells the model not to assume "player"',
   /do not assume the generic term "player"/i.test(avoidDir) && /use their .*name/i.test(avoidDir));
ok('the suppression signal never manufactures a profession/title',
   !/\b(coach|manager|director|analyst|physio|teacher|staff member)\b/i.test(avoidDir.split('Do not assume')[1] || ''));

// ── 4. No blind replacement; named structures + meaning preserved ───────────
ok('directive forbids mechanical find-and-replace',
   /not a find-and-replace/i.test(sports) && /do not mechanically swap/i.test(sports));
ok('directive tells the model to preserve the org\'s own named structures',
   /preserve the organisation's own named teams/i.test(sports));
ok('directive states wording never changes meaning/confidence (epistemic honesty)',
   /still an observation \(not a verified fact\)/i.test(sports) && /confidence, source and status/i.test(sports));

// ── 5. Universal mode stays silent (stable no-domain behaviour, zero tokens) ─
ok('universal pack with no role nuance yields an EMPTY directive',
   packs.domainDirective(packs.resolveDomain(null, null)) === '' &&
   packs.domainDirective(D('universal')) === '');
ok('an absent/blank domain yields an empty directive (never throws)',
   packs.domainDirective(null) === '' && packs.domainDirective({}) === '');

// ── 6. Token control — only the requested concepts appear ───────────────────
const trimmed = dir('sports', { concepts: ['person'] });
ok('scoping to one concept keeps the directive lean (player yes, match no)',
   /"player"/.test(trimmed) && !/"match"/.test(trimmed));

// ── 7. The kernel is untouched — primitives + resolution are display-only ───
const beforePrims = JSON.stringify(packs.DOMAIN_VOCAB.universal);
dir('sports', { subjectRole: 'a director' }); dir('education');
ok('resolving/emitting directives never mutates the primitive vocabulary',
   JSON.stringify(packs.DOMAIN_VOCAB.universal) === beforePrims);
const rd = packs.resolveDomain('sports', null);
ok('resolveDomain returns display words only — no kernel/primitive fields leak',
   rd.id === 'sports' && rd.vocab.person === 'player' && !('primitive' in rd) && !('sourceMap' in rd));

// ── 8. Audit fingerprint — stable, and moves when the words move ────────────
const v1 = packs.vocabVersion(D('sports'));
const v2 = packs.vocabVersion(D('sports'));
const v3 = packs.vocabVersion(packs.resolveDomain('sports', { pack: 'sports', vocab: { person: 'footballer' } }));
ok('vocabVersion is stable for identical vocabulary', v1 === v2 && /^sports\./.test(v1));
ok('vocabVersion changes when the vocabulary changes (attributable history)', v1 !== v3);
ok('vocabVersion of no domain is a safe sentinel', packs.vocabVersion(null) === 'none');

console.log(`\n=== packs-language-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
