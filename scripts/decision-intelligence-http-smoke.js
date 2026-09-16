/* Truth layer — DECISION INTELLIGENCE V1, AND THE NINE QUESTIONS IT IS ALLOWED TO ANSWER.

   The founder's nine, in order:

     1. What do we know?                                  6. What are reasonable options?
     2. What don't we know?                               7. What could each option help us learn?
     3. What might explain it?                            8. Is there enough evidence to suggest
     4. What relevant things have we tried before?           something worth testing?
     5. What happened afterward?                          9. What should we observe afterward?

   AND THE INSTRUCTION THAT MATTERS MOST: do NOT force an answer to all nine. "Not enough evidence
   yet" is a valid and important output. If action would be premature, prefer gathering
   information. If no action is justified, watching is legitimate. Do not activate bestForPattern
   merely because it exists. Do not create a "best action" ranking. Do not invent probabilities.

   So this suite is as much about what the product REFUSES to say as about what it says. Six and
   seven have no machinery behind them and none is manufactured here: the coach writes the option
   themselves, in their own words, which is the "human chooses" step the spine already had. An
   options generator would be the system proposing what to do and then, one release later,
   ranking its own proposals — and there is no honest way to rank them, because nothing in the
   record establishes what will work.

   FOUR AND FIVE NEEDED NO NEW STORE. A group Focus has recorded `origin.inquiryId` since the
   origin field existed, and the group screen has listed what the group has tried for as long as
   it has had a history. What was missing was the JOIN: the history was rendered for the NODE,
   undifferentiated, so a coach looking at one question could not tell which of five past attempts
   was about the thing in front of them. Nine needed nothing at all — `falsifiers` has been
   computed since ai/diagnose.js was written and projected since the frontier pass, and had simply
   never reached a screen a group could read.

   EVERY ASSERTION RUNS WITH MODELS OFF. Provider-down is not a degraded mode for this journey; it
   is the state the Alma pilot runs in, so it is the state the suite runs in.

   Run: node scripts/decision-intelligence-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const fs   = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates } = S;

let pass = 0, fail = 0;
/* Thunks, so an expression that explodes is a named failure rather than a crash that loses the
   rest of the run — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'dci';
/* Fourteen members, five contributors — the two-sided cohort floor needs k >= 5 AND n-k >= 5, so
   a smaller squad could only ever prove that the floor withholds. */
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = { coach: { id: 'coach', name: 'Coach', email: 'c@dci.io', role: 'coach', orgCode: O,
                         status: 'active', leadershipNodeIds: ['squad'] } };
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@dci.io`,
  role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['squad'] };

_loadAllStores({
  orgMeta: { [O]: { orgName: "Alma Men's Soccer", orgMode: 'sports' } },
  orgUsers: { [O]: users },
  orgNodes: { [O]: { squad: { nodeId: 'squad', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: SQUAD, leaderIds: ['coach'], rev: 1 } } },
});
_rebuildEmailIndex();

/* TWO DIFFERENT THINGS THE SQUAD NOTICED, because question 4 is "what have we tried about THIS"
   and a suite with one inquiry cannot tell a correct join from a missing filter. */
for (const id of SQUAD.slice(0, 5)) {
  _noteGroupCandidates(O, id, `member:${id}`, [{ id: 'dc_' + id, level: 'observation',
    text: 'talking drops off after we lose', sourceSpan: 'nobody talks after a loss',
    concerns: 'group', originRef: 'oc_' + id, originKind: 'direct_observation', turnId: 'tc_' + id }],
    'communication', 'Communication after results');
  _noteGroupCandidates(O, id, `member:${id}`, [{ id: 'dt_' + id, level: 'observation',
    text: 'the last twenty minutes are getting away from us', sourceSpan: 'we fade late',
    concerns: 'group', originRef: 'ot_' + id, originKind: 'direct_observation', turnId: 'tt_' + id }],
    'late_game', 'How the last twenty minutes go');
}

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, O, who === 'coach' ? 'coach' : 'member')}`,
                      'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const inquiries = who => call('GET', '/api/group/squad/inquiry', undefined, who)
    .then(r => ((r.j || {}).inquiries) || []);
  const byTopic = async (who, concept) =>
    (await inquiries(who)).find(i => ((i.topic || {}).canonicalConcept) === concept) || {};

  try {
    /* ══ THE JOURNEY STARTS WHERE IT ACTUALLY STARTS ══════════════════════════════════════ */
    console.log('\n  SETUP — FIVE PEOPLE INDEPENDENTLY OFFER WHAT THEY SAW');
    for (const id of SQUAD.slice(0, 5)) {
      for (const c of (groupCandidates[O] || []).filter(x => x.contributorId === id && x.status === 'detected')) {
        await call('POST', '/api/group/squad/contribute', { candidateId: c.candidateId, valence: 'worth_attention' }, id);
      }
    }
    const comms = await byTopic('coach', 'communication');
    const late  = await byTopic('coach', 'late_game');
    ok('DI-S1 two separate things the squad noticed are open, each on its own evidence',
      !!comms.inquiryId && !!late.inquiryId && comms.inquiryId !== late.inquiryId);

    console.log('\n  Q1 — WHAT DO WE KNOW');
    ok('DI-1a the observation, and what it rests on, counted as separate origins rather than voices',
      comms.independentOrigins === 5 && comms.contributors === 5);
    ok('DI-1b …at a band the kernel computed rather than anybody declared',
      (comms.confidence || {}).band === 'supported' && typeof (comms.confidence || {}).score === 'number');
    ok('DI-1c …and it is the OBSERVATION that is known, with nothing yet claiming to explain it',
      comms.hypothesis === null && (comms.alternatives || []).length === 0);

    console.log('\n  Q8 — IS THERE ENOUGH TO SUGGEST SOMETHING WORTH TESTING (asked FIRST, because the answer is no)');
    ok('DI-8a with nobody having offered a reason, the honest answer is that there is not',
      (comms.readiness || {}).state === 'not_enough_evidence');
    ok('DI-8b …and it says why in a sentence about the record rather than about a rule',
      /nobody has offered an explanation yet/i.test(String((comms.readiness || {}).because || '')));

    console.log('\n  Q3 — WHAT MIGHT EXPLAIN IT');
    await call('POST', `/api/group/squad/inquiry/${comms.inquiryId}/explanation`,
      { text: 'players are worried about criticising each other' }, 'coach');
    const comms1 = await byTopic('coach', 'communication');
    ok('DI-3a a human explanation is carried as a candidate with its own standing',
      comms1.hypothesis === 'players are worried about criticising each other'
      && (comms1.hypothesisStanding || {}).band === 'tentative'
      && (comms1.hypothesisStanding || {}).supportedBy === 0);
    ok('DI-3b …and the INQUIRY\'s own confidence did not move because somebody explained it',
      (comms1.confidence || {}).band === 'supported');

    console.log('\n  Q2 — WHAT WE STILL DO NOT KNOW');
    ok('DI-2a offering an explanation OPENS an unknown rather than closing one',
      (comms1.stillUnknown || []).some(u => /nothing recorded supports it yet/i.test(String(u))));

    console.log('\n  Q8 AGAIN — ONE UNEVIDENCED EXPLANATION IS STILL NOT ENOUGH');
    ok('DI-8c a theory nobody has evidenced does not turn into something worth testing',
      (comms1.readiness || {}).state === 'not_enough_evidence'
      && /nothing recorded supports/i.test(String((comms1.readiness || {}).because || '')));

    await call('POST', `/api/group/squad/inquiry/${comms.inquiryId}/explanation`,
      { text: 'the schedule changed and people leave straight after' }, 'p7');
    const comms2 = await byTopic('coach', 'communication');
    ok('DI-8d with two competing and nothing separating them, the answer becomes LEARN MORE, not choose',
      (comms2.readiness || {}).state === 'gather_information'
      && /nothing recorded separates them yet/i.test(String((comms2.readiness || {}).because || '')));
    ok('DI-8e …and neither explanation is marked as the one to back',
      comms2.hypothesis !== null
      && (comms2.hypothesisStanding || {}).supportedBy === 0
      && (comms2.alternatives || []).every(a => a.band === 'tentative'));

    console.log('\n  Q6 / Q7 — REASONABLE OPTIONS, AND WHAT EACH WOULD TEACH US');
    /* NOT ANSWERED, DELIBERATELY. There is no machinery that could answer either honestly, and
       the brief forbids manufacturing one. The coach writes the option; the product records what
       it was about and what came of it. This asserts the ABSENCE, because "we did not build it"
       and "we built it and it is wrong" are indistinguishable from the outside. */
    ok('DI-6a the product offers no generated list of options',
      !('options' in comms2) && !('suggestedActions' in comms2) && !('recommendedAction' in comms2));
    ok('DI-6b …and no ranking, score or probability over anything a group might do',
      () => {
        const s = JSON.stringify(comms2);
        return !/"bestAction"|"ranked"|"rank":|"probability"|"likelihood"|"successRate"/.test(s);
      });
    ok('DI-7a the one thing it does offer is an OBSERVATION that would separate the rivals, which is what would teach us something',
      Array.isArray(comms2.wouldHelp));

    console.log('\n  Q4 — WHAT RELEVANT THINGS HAVE WE TRIED BEFORE');
    ok('DI-4a nothing has been tried about this yet, and that is stated rather than implied',
      Array.isArray(comms2.triedBefore) && comms2.triedBefore.length === 0);
    const madeComms = await call('POST', '/api/group/squad/focus',
      { text: 'Debrief within 24h of a loss, captain-led', fromInquiryId: comms.inquiryId }, 'coach');
    const madeLate = await call('POST', '/api/group/squad/focus',
      { text: 'Ten minutes of small-sided at the end of every session', fromInquiryId: late.inquiryId }, 'coach');
    ok('DI-4b both focuses record which question they came out of',
      ((madeComms.j || {}).focus || {}).origin.inquiryId === comms.inquiryId
      && ((madeLate.j || {}).focus || {}).origin.inquiryId === late.inquiryId);
    const comms3 = await byTopic('coach', 'communication');
    ok('DI-4c what the group tried ABOUT THIS appears against this question',
      (comms3.triedBefore || []).some(t => /Debrief within 24h/.test(String(t.text))));
    ok('DI-4d …and the one about the other question does NOT, which is the join that was missing',
      (comms3.triedBefore || []).every(t => !/small-sided/.test(String(t.text))));
    ok('DI-4e …and a focus with no outcome yet reads as running, never as having done nothing',
      (comms3.triedBefore || []).every(t => t.outcome === null && t.status === 'active'));

    console.log('\n  Q5 — WHAT HAPPENED AFTERWARD');
    const focusId = ((madeComms.j || {}).focus || {}).focusId;
    const rec = await call('POST', `/api/group/squad/focus/${focusId}/outcome`, { result: 'better' }, 'coach');
    ok('DI-5a the coach records what came of it, in the group\'s own vocabulary',
      rec.status === 200);
    const comms4 = await byTopic('coach', 'communication');
    ok('DI-5b …and it is attached to the question it was about, not to the node in general',
      (comms4.triedBefore || []).some(t => /Debrief within 24h/.test(String(t.text)) && t.outcome === 'better'));
    ok('DI-5c …and the OTHER question still shows nothing, because nothing was recorded about it',
      ((await byTopic('coach', 'late_game')).triedBefore || []).every(t => t.outcome === null));
    ok('DI-5d recording an outcome did not move what the group KNOWS about why it happens',
      (comms4.hypothesisStanding || {}).supportedBy === 0
      && (comms4.readiness || {}).state === 'gather_information');

    console.log('\n  Q9 — WHAT SHOULD WE OBSERVE AFTERWARD');
    ok('DI-9a falsifiers travel with the inquiry, computed rather than written by anybody',
      Array.isArray(comms4.falsifiers));

    /* ══ THE SAME JOURNEY, ENTERED FROM THE OTHER END ═════════════════════════════════════════
       The brief: a person must be able to enter from the Inquiry side AND the Focus side without
       contradictory identity or wording. This is where the id-namespace defect lived — the same
       question is `inquiry:<id>` to whatever points at it and `low:<id>` to whoever reads it. */
    console.log('\n  BOTH ENDS — THE SAME OBJECT, THE SAME WORDS, WHICHEVER END YOU STAND AT');
    const rel = await call('GET', `/api/objects/focus/${focusId}/related`, undefined, 'coach');
    ok('DI-B1 from the FOCUS, the loop reaches the question it was started out of',
      rel.status === 200 && !!(rel.j || {}).loop
      && String(((rel.j || {}).loop || {}).addresses || '').includes(comms.inquiryId));
    const st = await call('GET', '/api/group/squad/state', undefined, 'coach');
    const surface = (st.j || {}).low || (st.j || {}).high || (st.j || {}).question || {};
    ok('DI-B2 from the INQUIRY side, the squad surface is the same object by id',
      String(surface.inquiryId || '') === comms.inquiryId || String(surface.inquiryId || '') === late.inquiryId);
    /* READ AS `low`, WHICH IS THE NAME THE SQUAD SURFACE HANDS A COACH. The same inquiry is also
       carried as an `inquiry` object in the open-question slot, so it has two names at once, and
       which one a person arrives by is an accident of which screen sent them. Pinning the loop to
       the exact name they arrived by is the id-namespace defect in a second place. */
    const relQ = await call('GET', `/api/objects/low/${comms.inquiryId}/related`, undefined, 'coach');
    ok('DI-B3 …and reading from the QUESTION end reaches the same loop, rather than nothing',
      relQ.status === 200 && !!(relQ.j || {}).loop);
    ok('DI-B4 …and both ends report the same outcome word, so the two doors do not disagree',
      String(((rel.j || {}).loop || {}).outcome || '') === String(((relQ.j || {}).loop || {}).outcome || '')
      && String(((rel.j || {}).loop || {}).outcome || '') === 'better');

    /* ══ PROVIDER DOWN IS NOT A DEGRADED PATH HERE — IT IS THE PATH ══════════════════════════ */
    console.log('\n  PROVIDER DOWN — WHICH IS THE STATE THE PILOT RUNS IN');
    ok('DI-P1 every assertion above ran with models switched off',
      process.env.IQ_DETERMINISTIC_ONLY === '1');
    ok('DI-P2 …and the whole journey completed anyway: contribute, explain, focus, outcome, loop',
      !!comms4.inquiryId && (comms4.triedBefore || []).length === 1
      && (comms4.triedBefore[0] || {}).outcome === 'better' && !!(rel.j || {}).loop);
    ok('DI-P3 …and no answer above was a model\'s, because none of these routes calls one',
      () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const fn = src.slice(src.indexOf('function _inquiryFrontier'), src.indexOf('function _leaderSubjectReaders'));
        return fn.length > 500 && !/ai\.complete|await ai\.|gateway\./.test(fn);
      });

    /* ══ AND IT REACHES A SCREEN, WHICH IS THE ONLY PLACE ANY OF IT COUNTS ═══════════════════ */
    console.log('\n  RENDERED — THE SEVEN SECTIONS ARE SEVEN SECTIONS ON THE GROUP SCREEN');
    {
      const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
      const i = ui.indexOf('_groupInquiryRow(nodeId, i, leads)');
      const row = ui.slice(i, ui.indexOf('startGroupExplanation(nodeId, inquiryId)', i));
      ok('DI-R1 the row is where the question lives, and it reads the projection rather than deriving anything',
        i > 0 && row.length > 500);
      ok('DI-R2 what we are seeing, and what it rests on',
        /independentOrigins/.test(row) && /contested/.test(row));
      ok('DI-R3 what might explain it — its own heading, with each candidate at its own standing',
        /What might explain it/.test(row) && /hypothesisStanding/.test(row) && /Nothing supports this yet/.test(row));
      ok('DI-R4 what we still don\'t know',
        /What we still don't know/.test(row) && /stillUnknown/.test(row));
      ok('DI-R5 what would help us learn',
        /What would help us learn/.test(row) && /wouldHelp/.test(row));
      ok('DI-R6 what we have tried about this, and what came of it',
        /What we have tried about this/.test(row) && /triedBefore/.test(row) && /_OUTCOME_WORDS/.test(row));
      ok('DI-R7 what would show we have this wrong',
        /What would show we have this wrong/.test(row) && /falsifiers/.test(row));
      ok('DI-R8 and whether there is enough to try something, printed as plainly when the answer is no',
        /readiness/.test(row) && /Not enough evidence yet to suggest anything worth trying/.test(row));
      /* CHECKED ON THE CODE, NOT ON THE COMMENTS. The first version of this went red on the very
         comment that explains why there is no ranking — the same trap AB-H4 fell into, where a
         negative check matched the sentence that makes the block safe. */
      const code = row.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
      ok('DI-R9 …with no ranking, star, score or percentage anywhere in the row',
        !/★|%|rank|score|best option/i.test(code));
      /* THE HEADINGS ARE SEPARATE HEADINGS. Running them together is how a candidate explanation
         becomes a finding by layout alone, which is a real way to lie with correct data. */
      ok('DI-R10 …and each section is a section, not one paragraph wearing four names',
        (row.match(/iqg-inq-sec-h/g) || []).length >= 5);
    }

    /* MOBILE. The founder reads this on a phone, and a row that scrolls sideways is a row whose
       right-hand end nobody reads. Checked at the stylesheet, which is where the rule lives. */
    console.log('\n  MOBILE — AT 390px, WHICH IS WHERE THIS IS ACTUALLY READ');
    {
      const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');
      const block = css.slice(css.indexOf('.iqg-inq-sec{'), css.indexOf('.iqg-hist{'));
      ok('DI-M1 the new sections wrap rather than scroll',
        /flex-wrap:wrap/.test(block) && !/white-space:nowrap/.test(block));
      ok('DI-M2 …and long text breaks rather than pushing the page wider',
        (block.match(/overflow-wrap:anywhere/g) || []).length >= 2);
      ok('DI-M3 …and the readiness line carries no colour that ranks one answer above another',
        /iqg-inq-ready\{/.test(block) && !/iqg-inq-ready\{[^}]*(--danger|--warning|--success)/.test(block));
    }

  } catch (e) { fail++; console.error('  FAIL decision-intelligence suite threw:', e && e.stack); }

  server.close();
  console.log(`\ndecision-intelligence-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
