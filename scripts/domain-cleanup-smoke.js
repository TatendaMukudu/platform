/* ============================================================
   scripts/domain-cleanup-smoke.js — the vertical-prompt cleanup guarantees.

   Proves the architecture after consolidation:
     • Organisational language has ONE source — the resolved domain / _domainDirective.
       No legacy orgMode vertical prose competes with it anywhere in the server.
     • The role ladder never MANUFACTURES a profession from a permission tier:
       a captain (a member who leads) is not turned into "staff", and only an
       EXPLICIT role/title is ever asserted verbatim.

   Pure-ish: boots the server module in DB_OPTIONAL to reach the real helpers, and
   scans the server source for banned vertical phrases.

   Run:  node scripts/domain-cleanup-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs   = require('fs');
const path = require('path');
const srv  = require('../server.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('\n=== Domain cleanup guarantees ===\n');

// ── 1. No legacy vertical prose survives in the server ──────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const BANNED = [
  'athletes in a sports club',
  'students in a school environment',
  'employees in a workplace',
  'verticalCtx',
  'ORGANISATION TYPE:',
  'Adapt language and context to the organisation type',
];
BANNED.forEach(phrase => ok(`no legacy vertical phrase: "${phrase}"`, !src.includes(phrase)));
ok('buildReflectionPrompt no longer takes orgMode (signature is vertical-neutral)',
   /function buildReflectionPrompt\(orgName\b/.test(src));
ok('buildScenarioPrompt no longer takes orgMode (signature is vertical-neutral)',
   /function buildScenarioPrompt\(orgName\b/.test(src));

// ── 2. The role ladder — permissions never invent a profession ──────────────
const CODE = 'cleanupco';
srv._loadAllStores({
  // a sports org so the directive is non-empty and the person word is "player"
  orgMeta:  { [CODE]: { orgName: 'Cleanup FC', orgMode: 'sports', createdAt: new Date().toISOString() } },
  orgUsers: { [CODE]: {
    boss:    { id: 'boss',    name: 'The Director', email: 'boss@c.co',  role: 'superadmin', orgCode: CODE, status: 'active' },
    coach1:  { id: 'coach1',  name: 'A Coach',      email: 'coach@c.co', role: 'coach',      orgCode: CODE, status: 'active' },
    player1: { id: 'player1', name: 'A Player',     email: 'p1@c.co',    role: 'member',     orgCode: CODE, status: 'active' },
    // a CAPTAIN: member tier, but leads a node → _isLeader true. Must NOT become "staff".
    captain: { id: 'captain', name: 'The Captain',  email: 'cap@c.co',   role: 'member',     orgCode: CODE, status: 'active', leadershipNodeIds: ['n1'] },
    // an explicit title carried on the record → used verbatim.
    titled:  { id: 'titled',  name: 'Dana Analyst', email: 'an@c.co',    role: 'member',     orgCode: CODE, status: 'active', title: 'Performance Analyst' },
  } },
});
srv._rebuildEmailIndex();

const rc = uid => srv._subjectRoleContext(CODE, uid);
ok('superadmin → "a staff member" (assigned tier, not an invented job)', rc('boss').subjectRole === 'a staff member');
ok('coach role → "a staff member"', rc('coach1').subjectRole === 'a staff member');
ok('plain member → generic noun applies (no role, no suppression)',
   rc('player1').subjectRole === null && rc('player1').avoidGeneric === false);
ok('CAPTAIN (member who leads) → suppress generic, but NOT labelled staff',
   rc('captain').subjectRole === null && rc('captain').avoidGeneric === true);
ok('explicit title → used verbatim', rc('titled').subjectRole === 'Performance Analyst');

// ── 3. The directive reflects the ladder, and never mislabels the captain ───
const capDir = srv._domainDirective(CODE, { userId: 'captain' });
ok('captain directive suppresses "player" without inventing a title',
   /do not assume the generic term "player"/i.test(capDir) &&
   !/\bstaff member\b/i.test(capDir) && !/is a "?(coach|manager|analyst)"?/i.test(capDir));
const coachDir = srv._domainDirective(CODE, { userId: 'coach1' });
ok('coach directive names them a staff member, not a "player"',
   /a staff member/.test(coachDir) && /not a "player"/.test(coachDir));
const playerDir = srv._domainDirective(CODE, { userId: 'player1' });
ok('player directive adds no subject role line (generic "player" is correct)',
   !/person in focus/i.test(playerDir) && /"player"/.test(playerDir));

console.log(`\n=== domain-cleanup-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
