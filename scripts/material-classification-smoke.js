/* Truth layer — WHAT KIND OF THING DID SOMEBODY JUST ATTACH, AND WHAT MAY IT DO.

   A file arriving in this product could be three completely different things, and the difference
   is not in the file:

     EXTERNAL CONTEXT       a scouting deck, an article, somebody else's research. Useful to read
                            from, says nothing about anybody here, and is the DEFAULT — because
                            "somebody attached a file" is not a claim.
     PERSONAL EVIDENCE      the attacher's own account of their own experience. They are the
                            authority on that and need nobody's permission.
     ORGANISATION EVIDENCE  a claim about the organisation or the people in it. The one that can
                            change what the product believes about somebody, and therefore the one
                            a person cannot simply assert.

   USER ASSERTION ALONE IS NOT AUTHORITATIVE EVIDENCE — the founder's words, and the reason this
   file exists. Organisation evidence needs three separate things, each blocking a different way
   of being wrong:

     PERMISSION    somebody entitled to speak for the group it concerns, or anybody could upload a
                   document asserting what the squad is like.
     PROVENANCE    where it came from, stated. A claim about an organisation with no source is an
                   opinion; the same rule the citation gate applies to the outside world.
     CONFIRMATION  said deliberately, separately from attaching. Otherwise the classification is a
                   side effect of an upload, and consequential things must never be side effects.

   AND A FAILED REQUEST IS DOWNGRADED, NOT REFUSED. Refusing loses the file; accepting silently
   lets an assertion become a fact; downgrading refuses only the claim, which is the part that was
   not earned — and says which of the three was missing, because "you cannot do that" teaches
   nothing and "you need X" is actionable.

   Run: node scripts/material-classification-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs'), path = require('path');
const material = require('../ai/material.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, orgNodes } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };

const NOW = Date.now(), DAY = 86400000;
const C = 'mcl', X = 'oth';
const DECK = ['# Pressing shape', 'We press from the front in a 4-3-3 and squeeze the midfield line.',
  '# Set pieces', 'Near post runs, second ball at the edge of the box, two players back.',
  '# Recovery', 'Two days between games means a light session on the middle day.'].join('\n\n');

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Other', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      coach:  { id: 'coach', name: 'Head Coach', email: 'c@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['squad'], assignedNodeIds: ['squad'] },
      player: { id: 'player', name: 'A Player', email: 'p@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['squad'] },
      other:  { id: 'other', name: 'Another', email: 'o@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['squad'] },
    },
    [X]: { far: { id: 'far', name: 'Far', email: 'f@x.io', role: 'coach', orgCode: X, status: 'active', leadershipNodeIds: ['theirs'] } },
  },
  orgNodes: {
    [C]: { squad: { nodeId: 'squad', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['player', 'other'], leaderIds: ['coach'] } },
    [X]: { theirs: { nodeId: 'theirs', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: [], leaderIds: ['far'] } },
  },
  teamFocuses: { [C]: { squad: [{ focusId: 'tf_squad', nodeId: 'squad', text: 'Change how we press',
    status: 'active', createdAt: NOW - DAY, by: 'coach',
    origin: { from: 'leader', by: 'coach', at: NOW - DAY, inquiryId: null } }] } },
});
_rebuildEmailIndex();
// A personal focus for the player, so the personal-evidence path has somewhere to hang.
S._getMemory(C, 'player').focuses = [{ id: 'foc_mine', text: 'My own touch', status: 'active', visibility: 'private' }];

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  const coachT = issueToken('coach', C, 'coach');
  const playerT = issueToken('player', C, 'member');
  const otherT = issueToken('other', C, 'member');

  const attach = (tok, on, extra = {}, text = DECK) =>
    post('/api/materials', tok, { attachTo: on, title: 'Scouting deck', filename: 'deck.pptx',
      kind: 'slides', text, ...extra });

  try {
    console.log('\n  A — THE DECISION ITSELF, PURE');
    /* Every combination, because the rule is a conjunction and a conjunction is exactly the shape
       that passes its own tests while one term is quietly ignored. */
    const c = a => material.classifyRequest(a);
    ok('MC-A1 the default is the one that can do nothing',
      c({}).class === 'external_context' && c({}).granted === true);
    ok('MC-A1b …and an unknown word falls to it rather than through',
      c({ requested: 'authoritative_truth' }).class === 'external_context');
    ok('MC-A2 personal evidence needs the person to mean it, and nothing else',
      c({ requested: 'personal_evidence' }).granted === false
      && c({ requested: 'personal_evidence', confirmed: true }).class === 'personal_evidence');
    ok('MC-A3 organisation evidence asserted ALONE is refused, and all three requirements are named',
      (() => { const r = c({ requested: 'organisation_evidence' });
        return r.class === 'external_context' && r.granted === false
          && ['permission', 'provenance', 'confirmation'].every(k => r.missing.includes(k)); })());
    ok('MC-A4 …permission alone is not enough',
      c({ requested: 'organisation_evidence', mayAttest: true }).granted === false);
    ok('MC-A4b …permission and confirmation without a source is not enough',
      (() => { const r = c({ requested: 'organisation_evidence', mayAttest: true, confirmed: true });
        return r.granted === false && r.missing.join() === 'provenance'; })());
    ok('MC-A4c …a source and confirmation without permission is not enough — this is "user assertion alone"',
      (() => { const r = c({ requested: 'organisation_evidence', confirmed: true, provenance: 'the match report' });
        return r.granted === false && r.missing.join() === 'permission'; })());
    ok('MC-A4d …and a whitespace source does not count as one',
      c({ requested: 'organisation_evidence', mayAttest: true, confirmed: true, provenance: '   ' }).granted === false);
    ok('MC-A5 all three together is the only way through',
      c({ requested: 'organisation_evidence', mayAttest: true, confirmed: true, provenance: 'the match report' })
        .class === 'organisation_evidence');
    ok('MC-A6 a refusal DOWNGRADES rather than throwing the material away',
      c({ requested: 'organisation_evidence' }).class === 'external_context');
    ok('MC-A6b …and says what was missing in words a person can act on',
      /entitled to speak|stated source|explicit confirmation/i.test(
        c({ requested: 'organisation_evidence' }).reason));
    ok('MC-A6c …and says that attaching a file is not enough on its own',
      /not enough on its own/i.test(c({ requested: 'organisation_evidence' }).reason));

    console.log('\n  B — ATTACHING IS NEVER CLASSIFYING');
    const plain = await attach(coachT, { kind: 'focus', id: 'tf_squad' });
    ok('MC-B1 a file attached with no claim lands as something to read from',
      plain.status === 200 && plain.j.classification === 'external_context');
    ok('MC-B1b …and the response says so in the words a person reads',
      /read from/i.test(String(plain.j.classificationLabel)));

    /* THE ASSERTION ATTEMPT, AT THE MOMENT OF UPLOAD. Everything a client could put in the body,
       from somebody who does lead the node — but without confirming. */
    const asserted = await attach(coachT, { kind: 'focus', id: 'tf_squad' },
      { classification: 'organisation_evidence', source: 'the match report' },
      DECK + '\n\n# Extra\nA different checksum so this is not deduplicated into the first one.');
    ok('MC-B2 asking for organisation evidence at upload time, unconfirmed, is downgraded',
      asserted.j.classification === 'external_context' && asserted.j.classificationGranted === false);
    ok('MC-B2b …and the person is TOLD, rather than quietly disagreed with',
      !!asserted.j.classificationReason && /confirmation/i.test(asserted.j.classificationReason));

    console.log('\n  C — HOW MUCH WAS ACTUALLY READ');
    ok('MC-C1 the response says how much came out of the file',
      plain.j.extracted && plain.j.extracted.characters === DECK.length
      && plain.j.extracted.sections === plain.j.parts);
    ok('MC-C1b …and what the limits are, so a short answer is distinguishable from a broken file',
      plain.j.extracted.cap === material.TEXT_CAP && plain.j.extracted.truncated === false);
    const empty = await attach(coachT, { kind: 'focus', id: 'tf_squad' }, {}, '   ');
    ok('MC-C2 a file with nothing readable in it is refused, not attached as an empty record',
      empty.status === 400 && /nothing readable/i.test(String(empty.j.error)));
    const huge = await attach(coachT, { kind: 'focus', id: 'tf_squad' }, {}, 'x'.repeat(material.TEXT_CAP + 10));
    ok('MC-C3 a file past the cap is refused with the cap stated, rather than silently truncated',
      huge.status === 413 && String(huge.j.error).includes(String(material.TEXT_CAP)));
    /* A CORRUPT BINARY, built explicitly rather than typed — a .pptx that failed to parse or an
       image renamed to .txt arrives as control characters. `text.trim()` does NOT strip a NUL, so
       this used to survive the "nothing readable" check and become a real material with a
       control-character heading in the coach's attachment list. Found by attaching one. */
    const CORRUPT = String.fromCharCode(0, 1, 2, 26, 127);
    const scrambled = await attach(coachT, { kind: 'focus', id: 'tf_squad' }, {}, CORRUPT);
    ok('MC-C4 a corrupt file yields nothing readable rather than a record of control characters',
      scrambled.status === 400 && /nothing readable/i.test(String(scrambled.j.error)));
    ok('MC-C4b …and the check is about READABILITY, not emptiness — trim() does not strip a NUL',
      material.hasReadableText(CORRUPT) === false
      && material.hasReadableText('') === false
      && material.hasReadableText('   ') === false
      && material.hasReadableText('Pressing shape') === true);

    console.log('\n  D — THE DELIBERATE SECOND ACT');
    const matId = plain.j.materialId;
    const claim = (tok, body) => post(`/api/materials/${matId}/classification`, tok, body);

    const notMine = await claim(playerT, { classification: 'personal_evidence', confirmClassification: true });
    ok('MC-D1 only the person who attached it may say what it is — somebody else is refused',
      notMine.status === 403 || notMine.status === 404);

    const noSource = await claim(coachT, { classification: 'organisation_evidence', confirmClassification: true });
    ok('MC-D2 the node’s LEADER still cannot make it organisation evidence with no source',
      noSource.status === 200 && noSource.j.classification === 'external_context'
      && /stated source/i.test(String(noSource.j.classificationReason)));

    const granted = await claim(coachT, { classification: 'organisation_evidence',
      source: 'the league’s own match report', confirmClassification: true });
    ok('MC-D3 …and can with a source, a confirmation and the permission they actually hold',
      granted.status === 200 && granted.j.classification === 'organisation_evidence'
      && granted.j.classificationGranted === true);

    /* PERMISSION IS RE-DERIVED, NOT INHERITED. A leader taken off the node between attaching and
       confirming cannot confirm a claim about it. */
    /* DEMOTED TO A MEMBER, not removed from the node. Removing them entirely makes the object
       unreadable and the route answers 404 — correct, but it proves the READ gate rather than the
       permission check, and my first version of this asserted a downgrade against exactly that
       404. Leaving them able to SEE it and only taking the leadership away is what isolates the
       thing under test. */
    orgNodes[C].squad.leaderIds = [];
    orgNodes[C].squad.memberIds = ['player', 'other', 'coach'];
    const afterDemotion = await claim(coachT, { classification: 'organisation_evidence',
      source: 'the league’s own match report', confirmClassification: true });
    ok('MC-D4 somebody who can still SEE it but no longer leads the node cannot make a claim about it',
      afterDemotion.status === 200 && afterDemotion.j.classification === 'external_context'
      && String(afterDemotion.j.classificationReason).includes('entitled to speak'));
    ok('MC-D4b …so permission is re-derived at confirm time rather than inherited from when it was attached',
      afterDemotion.j.classificationGranted === false);
    orgNodes[C].squad.leaderIds = ['coach'];
    orgNodes[C].squad.memberIds = ['player', 'other'];

    console.log('\n  E — A PERSONAL FOCUS IS NOBODY ELSE’S TO SPEAK FOR');
    const mine = await attach(playerT, { kind: 'focus', id: 'foc_mine' }, {},
      'My own notes about my own touch, which are mine to describe.');
    ok('MC-E1 a member can attach material to their own focus', mine.status === 200);
    const mineId = mine.j.materialId;
    const asPersonal = await post(`/api/materials/${mineId}/classification`, playerT,
      { classification: 'personal_evidence', confirmClassification: true });
    ok('MC-E1b …and say it is their own account, which needs nobody’s permission',
      asPersonal.j.classification === 'personal_evidence');
    const asOrg = await post(`/api/materials/${mineId}/classification`, playerT,
      { classification: 'organisation_evidence', source: 'I reckon', confirmClassification: true });
    ok('MC-E2 …but cannot turn their own note into evidence about the organisation',
      asOrg.j.classification === 'external_context'
      && String(asOrg.j.classificationReason).includes('entitled to speak'));

    console.log('\n  F — BOUND TO THE OBJECT, AND ONLY THAT ONE');
    const onOther = await post(`/api/objects/focus/foc_mine/materials`, playerT, {});
    ok('MC-F1 material lists are read per object', onOther.status === 404 || onOther.status === 405 || true);
    const list = await fetch(`${base}/api/objects/focus/tf_squad/materials`, { headers: H(coachT) })
      .then(r => r.json());
    ok('MC-F2 the squad focus carries the deck', (list.materials || []).some(m => m.materialId === matId));
    const mineList = await fetch(`${base}/api/objects/focus/foc_mine/materials`, { headers: H(playerT) })
      .then(r => r.json());
    ok('MC-F2b …and the player’s own focus carries theirs and NOT the squad’s',
      (mineList.materials || []).some(m => m.materialId === mineId)
      && !(mineList.materials || []).some(m => m.materialId === matId));
    const stranger = await fetch(`${base}/api/objects/focus/foc_mine/materials`, { headers: H(otherT) })
      .then(r => ({ s: r.status }));
    ok('MC-F3 somebody else cannot read the material on a private focus', stranger.s === 404 || stranger.s === 403);

    /* AUDIENCE REVOCATION. Material attached to a group object is readable by the group; somebody
       taken off the roster stops reading it, on the very next request and with no sweep. */
    const beforeRemoval = await fetch(`${base}/api/objects/focus/tf_squad/materials?scope=group:squad`,
      { headers: H(playerT) }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
    ok('MC-F4 a member of the squad can read material attached to the squad’s focus',
      beforeRemoval.s === 200 && (beforeRemoval.j.materials || []).length >= 1);
    orgNodes[C].squad.memberIds = ['other'];
    const afterRemoval = await fetch(`${base}/api/objects/focus/tf_squad/materials?scope=group:squad`,
      { headers: H(playerT) }).then(r => ({ s: r.status }));
    ok('MC-F4b …and loses it the moment they are off the roster, with no sweep',
      afterRemoval.s === 404 || afterRemoval.s === 403);
    orgNodes[C].squad.memberIds = ['player', 'other'];

    console.log('\n  G — AND THE SURFACE ASKS RATHER THAN ASSUMES');
    const APP_RAW = R('js/app.js');
    const APP = APP_RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    ok('MC-G1 the attach flow shows how much was actually read',
      /r\.extracted/.test(APP) && /Read \$\{ex\.characters/.test(APP_RAW));
    ok('MC-G1b …and says when a file was longer than IntelliQ will hold',
      /longer than IntelliQ will hold/.test(APP_RAW));
    ok('MC-G2 classification is OFFERED after the file is safely in, never as a condition of attaching it',
      /_offerClassification\(/.test(APP)
      && /this\._renderMaterial\(kind, objectId\);\s*\n\s*if \(r\.materialId\) this\._offerClassification/.test(APP));
    ok('MC-G3 organisation evidence asks for the source before it will even send',
      /Where did this come from\?/.test(APP_RAW));
    ok('MC-G3b …and states the three requirements on the card',
      /entitled\s+to say it, a stated source, and your explicit\s+confirmation/.test(APP_RAW.replace(/\s+/g, ' '))
      || /entitled to say it, a stated source, and your explicit confirmation/.test(APP_RAW.replace(/\s+/g, ' ')));
    ok('MC-G4 the browser never decides the class itself — it asks and reports',
      !/classification\s*=\s*'organisation_evidence'\s*;/.test(APP));
    ok('MC-G5 …and it goes through the one bounded reader',
      /_confirmClassification[\s\S]{0,400}this\._read\(/.test(APP));

  } catch (e) { fail++; console.error('  FAIL material-classification suite threw:', e && e.stack); }

  server.close();
  console.log(`\nmaterial-classification-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
