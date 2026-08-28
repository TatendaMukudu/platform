#!/usr/bin/env node
'use strict';

/* Truth layer — D21: THE SAFEGUARDING EXCEPTION IS STATED BEFORE ANYONE SPEAKS.

   Safeguarding is the one place a person's words cross a boundary without their say-so. Today
   they are told at the moment it happens, which is honest but late: a person who learns the
   boundary only when they cross it learns it as a betrayal rather than as a rule they had
   already accepted.

   A NOTICE IS NOT A CONSENT, and these assertions exist to keep that distinction alive in code.
   Consent can be refused; this cannot. What is recorded is that somebody was SHOWN the rule,
   never that they permitted it — because a stored "granted: false" would let a person
   reasonably believe they had opted out of a rule that still applies to them.

   Run: node scripts/advance-notice-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
const S = require('../server');
const safeguarding = require('../ai/safeguarding');

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) { passed++; console.log('  PASS', name); } else { failed++; console.log('  FAIL', name); } };

const CODE = 'd21';
S._loadAllStores({
  orgMeta: { [CODE]: { orgName: 'D21 Test' } },
  orgUsers: { [CODE]: {
    boss:   { id: 'boss',   name: 'Boss',   email: 'boss@d21.test',   role: 'superadmin', status: 'active', orgCode: CODE },
    player: { id: 'player', name: 'Player', email: 'player@d21.test', role: 'member',     status: 'active', orgCode: CODE, supervisorId: 'boss' },
  } },
});
S._rebuildEmailIndex();

const server = S.app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = id => ({ Authorization: `Bearer ${S.issueToken(id, CODE, id === 'boss' ? 'superadmin' : 'member')}` });
  const json = async (path, opts = {}) => {
    const r = await fetch(base + path, opts);
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  try {
    // N1 — the sentence has ONE home and the server serves that one, not a re-typed copy.
    const cfg = await json('/api/safeguarding/config', { headers: auth('player') });
    check('N1 the exception is served to an ordinary member from its single home',
      cfg.status === 200 && cfg.body.safetyException === safeguarding.SAFETY_EXCEPTION
      && /safeguarding lead is told/.test(cfg.body.safetyException));

    // N2 — a member who has never seen it is told so. This is what makes "before they speak"
    //      enforceable rather than aspirational: the client can ask and get a truthful answer.
    const before = await json('/api/me/notices', { headers: auth('player') });
    const sgBefore = (before.body.notices || []).find(n => n.id === 'safeguarding');
    check('N2 an unacknowledged notice reports itself as unacknowledged, with its text',
      before.status === 200 && sgBefore && sgBefore.acknowledged === false
      && sgBefore.text === safeguarding.SAFETY_EXCEPTION && sgBefore.acknowledgedAt === null);

    // N3 — acknowledging records that it was SHOWN.
    const ack = await json('/api/me/notices/ack', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth('player') },
      body: JSON.stringify({ id: 'safeguarding' }),
    });
    const after = await json('/api/me/notices', { headers: auth('player') });
    const sgAfter = (after.body.notices || []).find(n => n.id === 'safeguarding');
    check('N3 acknowledgement is recorded durably and reads back',
      ack.status === 200 && ack.body.acknowledged === true
      && sgAfter && sgAfter.acknowledged === true && !!sgAfter.acknowledgedAt);

    // N4 — THE DISTINCTION. A notice is not a grantable consent. Nothing in the stored record may
    //      say "granted", because a person must never be able to believe they declined this rule.
    const consents = await json('/api/me/consent', { headers: auth('player') });
    const stored = (consents.body.consents || {})['notice:safeguarding'];
    check('N4 the stored record is an acknowledgement, never a grantable consent',
      !!stored && stored.acknowledged === true && !('granted' in stored));

    // N5 — a notice cannot be invented by a caller. The vocabulary is fixed, like the audit log's.
    const bogus = await json('/api/me/notices/ack', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...auth('player') },
      body: JSON.stringify({ id: 'not-a-real-notice' }),
    });
    check('N5 an unknown notice id is refused', bogus.status === 400);

    // N6 — self-scoped. One person acknowledging must never mark anybody else as told.
    const boss = await json('/api/me/notices', { headers: auth('boss') });
    const bossSg = (boss.body.notices || []).find(n => n.id === 'safeguarding');
    check('N6 acknowledgement is self-scoped and does not leak across people',
      boss.status === 200 && bossSg && bossSg.acknowledged === false);
  } catch (e) {
    failed++; console.log('  FAIL suite threw:', e && e.message);
  }

  console.log(`\nadvance-notice-http-smoke: ${passed} passed, ${failed} failed\n`);
  server.close();
  process.exit(failed ? 1 : 0);
});
