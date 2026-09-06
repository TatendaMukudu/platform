/* Truth layer — THE DEMO IS THE FIRST THING ANYONE BELIEVES.

   A seed is not test data. It is the version of the product a person forms their opinion of
   before they have any of their own records in it, so anything false about it is false in the
   most expensive possible place. Three properties matter, and each replaces a way the previous
   seeds were wrong:

     1. IT MUST FIT. The seed this replaces was 21.5 MB — 16 MB of it daily check-ins, a
        feature retired in September 2026 — and the boot path loaded it out of Postgres on
        every cold start. That is how a pilot with one person on it reached 86% of a 5 GB
        monthly transfer allowance. A size budget is not tidiness here; it is the bill.

     2. IT MUST BE HONEST ABOUT CONFIDENCE. The whole claim of this product is that confidence
        comes from the shape of the evidence rather than from assertion. A seed where every
        inquiry looks equally certain demonstrates the opposite of the thing being sold. So one
        line of inquiry rests on two tellings on separate days and one rests on a single
        telling, and the system must visibly rank them differently — WITHOUT the seed setting a
        confidence field itself.

     3. IT MUST BE READABLE BY THE REAL PATHS. A seed that writes records the production code
        could never produce diverges silently, and the first person to notice is a customer.
        Every object here is built with the same constructors the live routes use, and this
        suite reads them back through the same surfaces the app reads them through.

   And one that is not about correctness: every person in it is FICTIONAL. The programme shape
   is modelled on a real Division III college soccer programme, but inventing wellbeing and
   workload records about named, identifiable students is not something a demo gets to do.

   Run: node scripts/seed-alma-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs');
const path = require('path');
const diagnose = require('../ai/diagnose.js');
const teamState = require('../ai/team-state.js');
const { buildAlmaStore, ALMA_CODE } = require('../scripts/seed-alma.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, _backfillUserNodeIds, issueToken, orgUsers, orgNodes } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* The budget. Generous against the 31 KB it actually is, because the assertion worth making is
   "this cannot quietly grow into the last one", not "this is exactly the size it is today". */
const BUDGET_MB = 1;

(async () => {
  const { store, summary } = await buildAlmaStore();

  const bytes = Object.values(store).reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v), 'utf8'), 0);
  const mb = bytes / 1048576;
  console.log(`       ${(bytes / 1024).toFixed(0)} KB · ${summary.players} players · ${summary.staff} staff · ${summary.evidence} pieces of evidence · ${summary.inquiries} inquiries`);

  ok(`SA1 the seed fits its budget — under ${BUDGET_MB} MB, against the 21.5 MB one it replaces`,
    mb > 0 && mb < BUDGET_MB);

  /* ── The programme shape. Division III men's soccer, not a professional academy. ── */
  ok('SA2 one squad, not a hierarchy of age groups — a college programme is shaped differently from a club',
    summary.players >= 20 && summary.players <= 34 && summary.staff <= 5);
  const nodeNames = Object.values(store.orgNodes[ALMA_CODE]).map(n => n.name);
  ok('SA3 the units that actually meet separately exist: position groups and the incoming class',
    ['Goalkeepers', 'Back Line', 'Midfield', 'Front Line', 'First Years'].every(n => nodeNames.includes(n)));
  const positions = new Set(Object.values(store.orgUsers[ALMA_CODE]).map(u => u.position).filter(Boolean));
  ok('SA4 every outfield line and the keepers are represented',
    ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].every(p => positions.has(p)));
  const years = new Set(Object.values(store.orgUsers[ALMA_CODE]).map(u => u.classYear).filter(Boolean));
  ok('SA5 four class years — the thing that makes a college roster a college roster',
    years.size === 4);

  /* ── Vocabulary. The old seeds populated notes, assessments and daily check-ins, so the demo
     taught a language the product had stopped speaking. ── */
  ok('SA6 no check-ins — the feature was retired in September 2026 and a demo must not teach it',
    !store.memberCheckins && !('memberCheckins' in store));
  ok('SA7 it builds what the product HAS: evidence, inquiries and focuses',
    !!store.orgSignals && !!store.inquiryStates && !!store.teamFocuses &&
    summary.evidence > 0 && summary.inquiries > 0 && summary.focuses > 0);

  /* ── SA8-SA10: THE HONESTY PROPERTY. Two tellings on separate days must outrank one telling,
     and the seed must not be the thing deciding that. ── */
  const inqs = store.inquiryStates[ALMA_CODE];
  const all = Object.values(inqs).flatMap(m => Object.values(m));
  const wellEvidenced = all.find(i => (i.signals || []).length >= 2);
  const thin = all.find(i => (i.signals || []).length === 1);
  ok('SA8 the seed contains both a well-evidenced line and a thinly-evidenced one',
    !!wellEvidenced && !!thin);

  // The confidence on each inquiry was WRITTEN BY applyProposals — the same call the live
  // intake makes — so comparing those values compares the kernel's own judgement. An earlier
  // version of this called deriveConfidence on the finished inquiry instead, which reports
  // "nothing recorded yet" because it takes a different shape, and both sides came back 0:
  // the comparison would have passed for any seed at all.
  const scoreOf = i => Number((i.confidence || {}).score || 0);
  ok('SA9 the kernel ranks two independent tellings above one — computed from the evidence by the same call the live intake makes',
    scoreOf(wellEvidenced) > scoreOf(thin) && scoreOf(thin) > 0);
  ok('SA9b …and it says WHY in terms of origins, which is the claim the whole product rests on',
    /independent origin/.test(((wellEvidenced.confidence || {}).because || []).join(' ')) &&
    /only one signal/.test(((thin.confidence || {}).because || []).join(' ')));
  // The band must come from the kernel, so the check is on the SOURCE: the seed may not write
  // a band or a score of its own anywhere.
  const seedSrc = fs.readFileSync(path.join(__dirname, 'seed-alma.js'), 'utf8');
  ok('SA10 the seed never writes a band or a score itself — a seeded confidence is a claim the evidence did not make',
    !/\bband\s*:/.test(seedSrc) && !/\bscore\s*:/.test(seedSrc));

  /* ── SA11: evidence lives in the evidence store, referenced by the inquiry. An inquiry that
     copied the text would be a second substrate with no provenance and no deletion path. ── */
  const refs = (wellEvidenced.signals || []).map(s => s.ref);
  const sigIds = new Set(store.orgSignals[ALMA_CODE].map(s => s.id));
  ok('SA11 an inquiry holds REFERENCES to evidence, and every one resolves to a real record',
    refs.length >= 2 && refs.every(r => sigIds.has(r)));
  ok('SA12 …and holds no copy of the evidence text — that would be a store with no provenance and no way to erase',
    !(wellEvidenced.signals || []).some(s => typeof s.statement === 'string' && s.statement.length > 0));

  /* ── SA13: the focus came out of an inquiry. A seeded focus with origin 'leader' would be
     indistinguishable from one invented, and outcome learning would credit it to nobody. ── */
  const focus = Object.values(store.teamFocuses[ALMA_CODE]).flat()[0];
  ok('SA13 the team focus records the inquiry it came out of, not a bare leader decision',
    !!focus && focus.origin && focus.origin.from === 'inquiry' && !!focus.origin.inquiryId);
  const groupInq = Object.values(inqs).flatMap(m => Object.values(m)).find(i => i.inquiryId === focus.origin.inquiryId);
  ok('SA14 …and that inquiry actually exists — an origin pointing at nothing is a fabricated provenance',
    !!groupInq);

  /* ── SA15-SA18: the real read paths can consume it. This is the guard the deleted
     seed-surface-smoke carried, rewritten for this seed. ── */
  _loadAllStores(store);
  _rebuildEmailIndex();
  _backfillUserNodeIds();

  const coach = Object.values(orgUsers[ALMA_CODE]).find(u => u.role === 'superadmin');
  const player = Object.values(orgUsers[ALMA_CODE]).find(u => u.role === 'member' && inqs[`member:${u.id}`]);
  ok('SA15 the seeded org has a signed-in-able coach and a player who actually has something to see',
    !!coach && !!player);

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (u, tok) => fetch(base + u, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());

  try {
    const pTok = issueToken(player.id, ALMA_CODE, 'member');
    const objects = await get('/api/objects?kind=inquiry&scope=self', pTok);
    ok('SA16 a player opens the app and the four-bucket read returns their inquiry through the production path',
      objects.ok === true && (objects.objects || []).some(i => i.kind === 'inquiry'));
    const card = (objects.objects || []).find(i => i.kind === 'inquiry');
    ok('SA17 …and it renders as a human card, not a database key — the presentation layer resolves it',
      !!card && !!card.present && !!card.present.summary &&
      typeof card.present.summary.title === 'string' &&
      !/^[a-z0-9]+([._-][a-z0-9]+)+$/.test(card.present.summary.title));

    const cTok = issueToken(coach.id, ALMA_CODE, 'superadmin');
    const varsity = Object.values(orgNodes[ALMA_CODE]).find(n => n.name === 'Varsity Squad');
    const team = await get(`/api/group/${varsity.nodeId}/state`, cTok);
    ok('SA18 the coach opens the squad and the team-grain surface answers — the seed reaches it through the real read, not a special case',
      team && team.ok === true);

    /* ── SA20-SA30: THE BUCKETS ACTUALLY FILL, AND THEY FILL THROUGH THE GATES. ────────────

       This is why the seed was rewritten. A probe of the previous one through this same read
       path found Highs: 0 and Lows: 0 for every single person, and 27 of 28 players seeing
       nothing at all — because every seeded signal carried direction 'neutral' and nobody had
       ever called a belief, so both roads to a High or a Low were correctly closed.

       Asserting "the seed has a High" would be worth nothing on its own: the seed could write
       one. What is asserted here is that the PRODUCT produces them from declared evidence,
       through /api/objects and /api/group/:id/state, and that the gates still refuse the
       things they are supposed to refuse. */
    const cTok2 = issueToken(coach.id, ALMA_CODE, 'superadmin');
    const meU = Object.values(orgUsers[ALMA_CODE]).find(u => u.email === 'player@alma.edu');
    const meTok = issueToken(meU.id, ALMA_CODE, 'member');
    const bucket = async (tok, kind, scope) =>
      ((await get(`/api/objects?kind=${kind}&scope=${scope}`, tok)).objects || []);

    const myHighs = await bucket(meTok, 'high', 'self');
    const myLows  = await bucket(meTok, 'low', 'self');
    const myInqs  = await bucket(meTok, 'inquiry', 'self');
    ok('SA20 A PLAYER OPENS HIGHS AND THERE IS SOMETHING IN IT — the bucket the previous seed left empty for all 28 people',
      myHighs.length >= 1);
    ok('SA21 …and Lows, and Inquiries, so all three surfaces have something true to show',
      myLows.length >= 1 && myInqs.length >= 2);
    /* SA21b-SA21c — THE TWO ROADS, ASSERTED SEPARATELY. There is more than one way a belief
       reaches a bucket, and a check that only asks "is there a High" passes as long as ANY of
       them works. Two mutations proved that on this very suite: undeclaring every direction
       left it green because the CALLED beliefs still filed, and removing every call left it
       green because the EVIDENCE-directed ones did. Each road is now named by the words the
       card itself uses to explain which one decided it. */
    const claimsOf = list => list.map(o => ((o.explained || {}).claim) || '').join(' || ');
    ok('SA21b one of them was filed BY THE EVIDENCE — two independent accounts that each declared which way it was going',
      /separate accounts? points? the same way/i.test(claimsOf([...myHighs, ...myLows])));
    ok('SA21c …and another BY THE PERSON, where nothing on it points either way and their own call is what there is — a different claim, and the card says which',
      /you called this one/i.test(claimsOf([...myHighs, ...myLows])));
    /* SA21d — A DEFECT THIS SEED FOUND, and the reason it is asserted here rather than only in
       the module that had it: insights were deduplicated on `subjectId:patternType:audience`,
       and every belief-state High shares the patternType `called_strength`. So a person with
       two things genuinely going well was shown ONE and never told the other existed — dropped
       before the per-bucket limit was reached, silently, with both having cleared every gate.
       Two Highs about two different beliefs are two findings. */
    ok('SA21d two things going well are shown as two — findings about different beliefs are not collapsed into one card because they share a pattern type',
      myHighs.length >= 2 && new Set(myHighs.map(o => o.explained.headline)).size === myHighs.length);
    ok('SA22 …each rendered as a sentence a person could read, not a concept key',
      [...myHighs, ...myLows].every(o => o.explained && typeof o.explained.headline === 'string' &&
        o.explained.headline.length > 8 && !/^[a-z]+\./.test(o.explained.headline)));

    /* SA23 — THE GATE, NOT THE SEED. Strip the declared directions and the calls out of the
       store and the same read must return NOTHING to the same person. If Highs survive that,
       they were written rather than earned, and every assertion above is decorative. */
    const stripped = JSON.parse(JSON.stringify(store));
    for (const bySubject of Object.values(stripped.inquiryStates[ALMA_CODE])) {
      for (const inq of Object.values(bySubject)) {
        for (const sig of (inq.signals || [])) { sig.direction = 'neutral'; sig.dissents = false; }
        inq.status = 'open';
      }
    }
    for (const mem of Object.values(stripped.userAiProfiles)) mem.valenceCalls = {};
    _loadAllStores(stripped);
    const afterStrip = [...await bucket(meTok, 'high', 'self'), ...await bucket(meTok, 'low', 'self')];
    ok('SA23 UNDECLARE THE DIRECTIONS AND THE CALLS AND BOTH BUCKETS GO EMPTY — which is what proves the Highs and Lows above were produced by the gates rather than written by the seed',
      afterStrip.length === 0);
    _loadAllStores(store);   // put the real one back
    ok('SA23b …and they come back when it is restored, so the strip tested the gates and not the harness',
      (await bucket(meTok, 'high', 'self')).length >= 1);

    /* SA24-SA26 — THE COACH'S SQUAD VIEW, which is the other half of what a demo has to show. */
    const st = await get(`/api/group/${varsity.nodeId}/state`, cTok2);
    const sq = st.state || st;
    /* Read defensively: when a mutation empties one of these, the assertion must go RED rather
       than throw, or it takes every check after it down with it and the run reports one failure
       where there were several. */
    const basisOf = x => (x && x.basis) || {};
    ok('SA24 the coach opens the squad and there is a High and a Low, each carrying what it rests on',
      !!sq.high && !!sq.low && basisOf(sq.high).contributors >= 5 && basisOf(sq.low).contributors >= 5);
    ok('SA24b …counted against the whole squad, so a number on the page means something',
      basisOf(sq.high).of === 28 && basisOf(sq.low).of === 28);
    /* SA25 — THE REFUSAL IS THE PRODUCT. Three of twenty-eight contributed the set-piece
       pattern: corroborated enough to open as a group inquiry, nowhere near enough to put in
       front of a coach without pointing at the three who said it. A demo that only ever shows
       the floor letting things through has not shown the floor. */
    ok('SA25 something is WITHHELD from the coach by the cohort floor, and named rather than hidden — a leader shown nothing concludes nothing is there',
      (sq.withheld || []).length >= 1 &&
      (sq.withheld || []).some(w => (w.blocked || []).some(b => b.gate === 'cohort')));
    ok('SA25b …naming the topic and never restating the finding it just refused to surface',
      (sq.withheld || []).every(w => typeof w.about === 'string' && w.about.length > 0 && !w.claim));
    ok('SA26 the squad has a focus that ran its course with an outcome recorded, and one still live — so the loop is visible from both ends',
      (() => { const f = store.teamFocuses[ALMA_CODE][varsity.nodeId] || [];
        return f.some(x => x.outcome && x.outcome.result) && f.some(x => x.status === 'active'); })());

    /* SA27 — A CONTESTED BELIEF IS NEITHER A HIGH NOR A LOW ON THE EVIDENCE, and is surfaced
       as the disagreement it is. This is the state a dashboard averages away. */
    ok('SA27 a belief two accounts contradict each other about is surfaced as the disagreement, rather than resolved into a High or a Low',
      myLows.some(o => /accounts differ/i.test((o.explained && o.explained.headline) || '')));

    /* SA28-SA30 — HONESTY OF DISTRIBUTION. A demo where every surface is full teaches that the
       product always has an answer, which is the opposite of what is being sold. */
    const withSomething = Object.keys(store.inquiryStates[ALMA_CODE]).filter(k => k.startsWith('member:')).length;
    ok('SA28 not everybody has something — several players said nothing all season and their app is honestly empty',
      withSomething >= 15 && withSomething <= summary.players - 3);
    const quiet = Object.values(orgUsers[ALMA_CODE]).find(u => u.role === 'member' &&
      !store.inquiryStates[ALMA_CODE][`member:${u.id}`]);
    const quietTok = quiet ? issueToken(quiet.id, ALMA_CODE, 'member') : null;
    ok('SA29 …and one of them opens the app to genuinely empty personal buckets, which is a real state the demo must be able to show',
      !!quietTok && (await bucket(quietTok, 'high', 'self')).length === 0 &&
      (await bucket(quietTok, 'low', 'self')).length === 0);
    ok('SA29b …while still seeing the squad\'s, because a quiet player is not a shut-out one',
      !!quietTok && (await bucket(quietTok, 'low', 'all')).length >= 1);
    /* SA30 — THE SEED CONTAINS BELIEFS THE PRODUCT REFUSES. Half of what makes a demo honest
       is what it will not say. Several lines rest on a single telling, and the kernel rates
       them below the standing a High or a Low needs — so they stay visibly open questions.
       A seed where everything cleared the bar would demonstrate a product with no bar. */
    const personal = Object.entries(store.inquiryStates[ALMA_CODE])
      .filter(([k]) => k.startsWith('member:')).flatMap(([, m]) => Object.values(m));
    const bands = personal.map(i => (i.confidence || {}).band).filter(Boolean);
    ok('SA30 the beliefs do not all look equally certain — the kernel banded them across at least three levels from evidence of different weights',
      new Set(bands).size >= 3);
    ok('SA30b …and some sit BELOW the standing a High or a Low needs, so they stay open questions however they are worded — a demo where everything cleared the bar shows a product with no bar',
      personal.some(i => !teamState.fitForSurface(
        { ...i, independentOrigins: 99, contributors: 99, confidence: i.confidence },
        { cohortSize: 100 }).ok));

  } catch (e) { fail++; console.error('  FAIL http checks threw:', e && e.stack); }
  server.close();

  /* ── SA19: the people are fictional, and the file says so where someone will read it. ── */
  const src = fs.readFileSync(path.join(__dirname, 'seed-alma.js'), 'utf8');
  ok('SA19 the seed states that every person in it is invented — fabricated wellbeing records about real named students is not a thing a demo gets to do',
    /EVERY PERSON IN IT IS FICTIONAL/.test(src));

  console.log(`\nseed-alma-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
