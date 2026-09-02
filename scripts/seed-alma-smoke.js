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
  } catch (e) { fail++; console.error('  FAIL http checks threw:', e && e.stack); }
  server.close();

  /* ── SA19: the people are fictional, and the file says so where someone will read it. ── */
  const src = fs.readFileSync(path.join(__dirname, 'seed-alma.js'), 'utf8');
  ok('SA19 the seed states that every person in it is invented — fabricated wellbeing records about real named students is not a thing a demo gets to do',
    /EVERY PERSON IN IT IS FICTIONAL/.test(src));

  console.log(`\nseed-alma-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
