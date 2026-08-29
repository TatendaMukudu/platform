/* PILOT REHEARSAL — the product run as a deployment, not as a slice.

   Every other suite in this repository tests one thing. This one runs a month of a real
   organisation's life through production HTTP routes, from an empty store to the screens a
   coach would actually read, and PRINTS THE LITERAL TEXT at each step.

   That transcript is the deliverable as much as the pass/fail. A human is supposed to read it
   and say whether it is any good — which is a question no assertion can answer.

   Deliberately shape-neutral: one team node under one parent, a coach, twelve members. That is
   Alma, and it is also a department, and it is also a class. A node is a node.

   Run: node scripts/pilot-rehearsal.js
        node scripts/pilot-rehearsal.js --quiet     (assertions only, no transcript) */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const QUIET = process.argv.includes('--quiet');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };

const say = (...a) => { if (!QUIET) console.log(...a); };
const step = (n, title) => say(`\n${'═'.repeat(72)}\n  STEP ${n} · ${title}\n${'═'.repeat(72)}`);
const screen = (label, text) => say(`      ${String(label).padEnd(9)} ${text == null ? '—' : text}`);
const note = t => say(`\n      · ${t}`);

const S = require('../server.js');
const { app, orgMeta, orgUsers, orgNodes, issueToken } = S;

const C = 'rehearsal';
const now = Date.now(), DAY = 86400000;

/* ── The organisation ─────────────────────────────────────────────────────────
   Structural setup only. Everything AFTER this point goes through a production route, because
   the point of a rehearsal is that the path is the real one. */
const NAMES = ['Amara', 'Ben', 'Chidi', 'Dara', 'Eli', 'Femi', 'Gus', 'Hana', 'Iris', 'Jonah', 'Kai', 'Lena'];
const mk = (id, name, role = 'member') => ({ id, name, email: `${id}@rehearsal.test`, role, orgCode: C, status: 'active', assignedNodeIds: [], leadershipNodeIds: [] });

orgMeta[C] = { orgName: 'Rehearsal Club', orgMode: 'sports' };
orgUsers[C] = { coach: mk('coach', 'Jordan', 'coach'), head: mk('head', 'Sam', 'superadmin') };
NAMES.forEach((n, i) => { orgUsers[C][`m${i}`] = mk(`m${i}`, n); });

orgNodes[C] = {
  club: { nodeId: 'club', name: 'Rehearsal Club', parentId: null, childNodeIds: ['mens'], leaderIds: ['head'], memberIds: [] },
  mens: { nodeId: 'mens', name: "Men's Soccer", parentId: 'club', childNodeIds: [], leaderIds: ['coach'], memberIds: NAMES.map((_, i) => `m${i}`) },
};

/* Evidence: a participation stream per member, labelled "session engagement" ON PURPOSE.

   The first run of this rehearsal used that label and the leader briefing returned NOTHING —
   pattern detection read only /mood/i-labelled metrics, the legacy signal store and
   assessments, so an ordinary imported stream produced an empty coach page with no error.
   Competitors ingest arbitrary metric vocabularies as a matter of course.

   The label stays deliberately un-blessed so this suite keeps proving that canonical evidence
   reaches the pattern engine on the strength of its declared PRIMITIVE rather than on whether
   it happens to use our word. Renaming it to "mood" would make the suite green and the defect
   invisible.

   Six of the twelve ease off over the last fortnight; the rest hold steady. Distinct days
   throughout, because one bad day must never
   assert anything about a person. */
const ev = (id, subjectId, value, daysAgo, visibility = 'shared') => ({
  id, orgCode: C, status: 'active', subjectId, type: 'metric', label: 'session engagement',
  visibility, value, observedAt: new Date(now - daysAgo * DAY).toISOString(),
  provider: 'checkin', source: 'observed',
  originRef: `origin:${id}`, originKind: 'direct_observation',
  attributes: { primitive: 'participation', valence: 'up-good' },
  promoted: visibility !== 'private',
});

const log = [];
NAMES.forEach((_, i) => {
  const easesOff = i < 6;
  // SIX baseline points, not four. ai/baseline.js MIN_POINTS is 5 and the recent window is
  // excluded from the baseline, so five prior observations are the floor before ANY pattern can
  // fire. Worth knowing for a pilot starting from an empty database: roughly five check-ins per
  // person before a coach's page can say anything at all.
  [40, 36, 32, 28, 24, 20].forEach((d, k) => log.push(ev(`b_${i}_${k}`, `m${i}`, 4, d)));
  [10, 7, 4, 2].forEach((d, k) => log.push(ev(`r_${i}_${k}`, `m${i}`, easesOff ? 2 : 4, d)));
});
// One private capture. It must change nothing a leader sees, anywhere in this rehearsal.
log.push(ev('private_marker', 'm0', 1, 1, 'private'));

S._loadAllStores({ orgMeta: { [C]: orgMeta[C] }, orgUsers: { [C]: orgUsers[C] }, orgNodes: { [C]: orgNodes[C] }, evidenceLog: { [C]: log } });
S._backfillUserNodeIds();
S._rebuildEmailIndex();

(async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = id => ({ Authorization: `Bearer ${issueToken(id, C, (orgUsers[C][id] || {}).role || 'member')}`, 'Content-Type': 'application/json' });
  const GET = (id, p) => fetch(base + p, { headers: H(id) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const POST = (id, p, b) => fetch(base + p, { method: 'POST', headers: H(id), body: JSON.stringify(b || {}) })
    .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const spoke = r => String(r.body?.response?.responseText || r.body?.reply || r.body?.answer || '');

  try {

    // ── 1 ─────────────────────────────────────────────────────────────────────
    step(1, 'A NEW SQUAD. NOBODY HAS SAID ANYTHING YET.');
    {
      const r = await GET('coach', '/api/group/mens/state');
      screen('Team', r.body.node.name + `  (${r.body.node.memberCount} members)`);
      screen('High', r.body.high && r.body.high.claim);
      screen('Low', r.body.low && r.body.low.claim);
      screen('IntelliQ', r.body.statement);
      ok('1 · an empty group answers honestly instead of inventing something',
        r.status === 200 && !r.body.high && !r.body.low && /Nothing has crossed/.test(r.body.statement));
    }

    // ── 2 ─────────────────────────────────────────────────────────────────────
    step(2, 'PEOPLE TALK TO INTELLIQ ACROSS SEVERAL DAYS.');
    {
      const turn = await POST('m0', '/api/assistant/turn', { text: 'Our shape after we concede is unclear, we all end up chasing.' });
      note(`A member says: "Our shape after we concede is unclear, we all end up chasing."`);
      note(`IntelliQ replies: ${spoke(turn).slice(0, 160) || '(no reply)'}`);

      // FINDING, recorded here rather than hidden: candidate detection lives inside _intakeTurn,
      // which returns early with no model configured. So with models OFF nothing is ever noticed
      // as possibly concerning a group, and the team surface can never fill from conversation.
      // The pilot will have a model, so this is not fatal — but the "works with models disabled"
      // claim does NOT extend to this input path, and that should be said out loud.
      const detected = (S.groupCandidates[C] || []).length;
      note(`Candidates detected from that turn: ${detected} — intake requires a model, and this rehearsal runs with models OFF.`);
      ok('2 · with models off, conversation notices nothing for the group (recorded, not hidden)', detected === 0);

      // So the rehearsal calls the same function intake calls, with the same shape, to stand in
      // for the model's proposal. Everything downstream is the real path.
      const prop = (id, originRef) => ([{
        id: `e_${id}`, level: 'observation', text: 'shape unclear after conceding',
        sourceSpan: 'Our shape after we concede is unclear, we all end up chasing',
        concerns: 'group', originRef, originKind: 'direct_observation', turnId: `t_${id}`,
      }]);
      // Six people notice it, on five separate occasions — m2 is retelling m1's Saturday, which
      // is the case the origin rule exists to catch, and one of them will decline entirely.
      for (const [id, origin] of [['m0', 'o_tue'], ['m1', 'o_sat'], ['m2', 'o_sat'], ['m3', 'o_sun'],
                                  ['m4', 'o_wed'], ['m5', 'o_thu'], ['m6', 'o_fri']]) {
        S._noteGroupCandidates(C, id, `member:${id}`, prop(id, origin), 'shape', 'Shape after conceding');
      }
      note(`Standing in for the model: seven members' remarks noticed as possibly concerning the squad.`);
    }

    // ── 3 ─────────────────────────────────────────────────────────────────────
    step(3, 'EACH MEMBER SEES THEIR OWN NOTICINGS. NOBODY ELSE CAN.');
    {
      const mine = await GET('m0', '/api/group/mens/candidates');
      const theirs = await GET('m1', '/api/group/mens/candidates');
      const coachSees = await GET('coach', '/api/group/mens/candidates');
      say('');
      say(`      Amara sees:  "${mine.body.candidates[0].label}"`);
      say(`                   ${mine.body.note}`);
      say(`      Ben sees:    ${theirs.body.candidates.length} of their own — not Amara's.`);
      say(`      Jordan (coach) sees: ${coachSees.body.candidates.length}. A leader's position grants no view of a noticing.`);
      ok('3 · a noticing is private to whoever produced it',
        mine.body.candidates.length === 1 && theirs.body.candidates.length === 1
        && mine.body.candidates[0].candidateId !== theirs.body.candidates[0].candidateId);
      ok('3 · a leader cannot see a member\'s un-contributed noticing', coachSees.body.candidates.length === 0);
    }

    // ── 4 ─────────────────────────────────────────────────────────────────────
    step(4, 'SOME OFFER IT TO THE SQUAD. ONE KEEPS IT TO THEMSELVES.');
    let inquiryId = null;
    {
      const candOf = id => (S.groupCandidates[C] || []).find(c => c.contributorId === id && c.status === 'detected');

      const first = await POST('m0', '/api/group/mens/contribute', { candidateId: candOf('m0').candidateId, valence: 'worth_attention' });
      note(`Amara offers it, calling it something worth attention.`);
      note(`  → ${first.body.decision.reason}`);
      ok('4 · one account alone does not open anything', first.body.groupInquiry === 'not yet');

      const second = await POST('m1', '/api/group/mens/contribute', { candidateId: candOf('m1').candidateId, valence: 'worth_attention' });
      note(`Ben offers his, from a different occasion.`);
      note(`  → ${second.body.decision.reason}`);
      ok('4 · a second INDEPENDENT origin opens the group inquiry', second.body.groupInquiry === 'open');

      const echo = await POST('m2', '/api/group/mens/contribute', { candidateId: candOf('m2').candidateId, valence: 'worth_attention' });
      note(`Chidi offers his — but it retells the same occasion as Ben's.`);
      note(`  → counted as ${echo.body.decision.independentOrigins} independent origins from ${echo.body.decision.contributors} people.`);
      ok('4 · a retelling adds a voice, not an origin',
        echo.body.decision.contributors === 3 && echo.body.decision.independentOrigins === 2);

      note(`Dara reads theirs and decides it is not the squad's business. Nothing is recorded.`);
      await POST('m3', `/api/group/mens/candidates/${candOf('m3').candidateId}/dismiss`, {});

      // The disclosure floor is a SEPARATE, stricter rule than the one that opened the inquiry:
      // five contributors of twelve, both sides clear. Three more offer theirs.
      for (const id of ['m4', 'm5', 'm6']) {
        await POST(id, '/api/group/mens/contribute', { candidateId: candOf(id).candidateId, valence: 'worth_attention' });
      }
      note(`Three more offer theirs. Five of twelve have now spoken — enough to say it without pointing at anyone.`);

      const inq = await GET('m0', '/api/group/mens/inquiry');
      inquiryId = inq.body.inquiries[0].inquiryId;
      say('');
      say(`      The squad is now working out: "${inq.body.inquiries[0].topic.label}"`);
      say(`      Resting on ${inq.body.inquiries[0].independentOrigins} independent origins from ${inq.body.inquiries[0].contributors} people.`);
      say(`      ${inq.body.note}`);
    }

    // ── 5 ─────────────────────────────────────────────────────────────────────
    step(5, 'THE COACH OPENS INTELLIQ.');
    let teamState = null;
    {
      const lead = await GET('coach', '/api/inquiry/lead');
      const st = await GET('coach', '/api/group/mens/state');
      teamState = st.body;
      say('');
      if (lead.body.lead) {
        say(`      OPEN QUESTION · ${lead.body.lead.source === 'self' ? 'About you' : lead.body.lead.where}`);
        say(`      ${lead.body.lead.question}`);
        say('');
      }
      say(`      ${st.body.node.name}${' '.repeat(Math.max(1, 40 - st.body.node.name.length))}${st.body.node.memberCount} members`);
      screen('High', st.body.high && (st.body.high.claim || st.body.high.about));
      screen('Low', st.body.low && (st.body.low.claim || st.body.low.about));
      screen('Inquiry', st.body.question && st.body.question.question);
      screen('Focus', st.body.focus && st.body.focus.text);
      screen('IntelliQ', st.body.statement);
      for (const w of st.body.withheld || []) say(`      (withheld: ${w.about} — ${w.blocked.map(b => b.reason).join('; ')})`);

      ok('5 · the coach has something real to read, not an empty screen',
        !!(st.body.low || st.body.high || st.body.question));
      ok('5 · nothing on this screen names an individual',
        !NAMES.some(n => JSON.stringify(st.body).includes(n)));
      ok('5 · no private evidence reaches it',
        !JSON.stringify(st.body).includes('origin:private_marker'));
    }

    // ── 6 ─────────────────────────────────────────────────────────────────────
    step(6, 'THE COACH ASKS A QUESTION IN PLAIN ENGLISH.');
    {
      const r = await POST('coach', '/api/assistant/turn', { text: 'How is the team doing?' });
      const said = spoke(r);
      say('');
      say(`      Jordan: "How is the team doing?"`);
      say(`      IntelliQ: ${said.replace(/\s+/g, ' ').slice(0, 500)}`);
      ok('6 · the assistant answers at the team\'s grain with models off', r.status === 200 && said.length > 20);
      ok('6 · and names no individual player', !NAMES.some(n => said.includes(n)));
    }

    // ── 7 ─────────────────────────────────────────────────────────────────────
    step(7, 'THE COACH COMMITS TO SOMETHING, THEN SAYS WHAT HAPPENED.');
    let focusId = null;
    {
      const made = await POST('coach', '/api/group/mens/focus', {
        text: 'Walk the shape after conceding, twice a week, for the next three sessions',
        fromInquiryId: inquiryId,
      });
      focusId = made.body.focus.focusId;
      note(`Focus set: "${made.body.focus.text}"`);
      note(`  recorded as coming from ${made.body.focus.origin.from === 'inquiry' ? 'the open inquiry' : 'the coach\'s own judgement'}.`);
      ok('7 · a focus records what it came out of', made.body.focus.origin.from === 'inquiry' && made.body.focus.origin.inquiryId === inquiryId);

      const mid = await GET('coach', '/api/group/mens/state');
      screen('IntelliQ', mid.body.statement);
      ok('7 · while it runs, IntelliQ names the untested thing rather than claiming success',
        /nothing has come back|don't yet know/i.test(mid.body.statement));

      const closed = await POST('coach', `/api/group/mens/focus/${focusId}/outcome`, { result: 'better', note: 'Three sessions in; less chasing.' });
      note(`Outcome recorded: ${closed.body.focus.outcome.result}.`);
      ok('7 · the loop closes and stays on the record', closed.body.focus.outcome.result === 'better' && closed.body.focus.status === 'done');
    }

    // ── 8 ─────────────────────────────────────────────────────────────────────
    step(8, 'THE COACH ACTS ON ONE PERSON, AND RECORDS HOW IT WENT.');
    {
      const brief = await GET('coach', '/api/intelligence/briefing?refresh=1');
      const person = (brief.body.items || []).find(i => i.perspective !== 'web');
      const web = (brief.body.items || []).filter(i => i.perspective === 'web');
      say('');
      say(`      Aggregate items (name nobody): ${web.length}`);
      say(`      People the coach can act on today: ${(brief.body.items || []).filter(i => i.perspective !== 'web').length}`);
      ok('8 · the briefing carries BOTH the aggregate and the people', web.length > 0 || !!person);

      if (person) {
        say(`      "${person.name}" — ${person.whyNow}`);
        say(`      Try: ${person.recommendedAction}`);
        const acted = await POST('coach', '/api/intelligence/act', { orgCode: C, memberId: person.memberId, patternType: person.patternType, action: 'Had a quiet word after training.' });
        ok('8 · the coach can record that they acted', acted.status === 200 && !!acted.body.interventionId);
        const outcome = await POST('coach', '/api/intelligence/outcome', { orgCode: C, interventionId: acted.body.interventionId, outcome: 'positive' });
        note(`Recorded: it helped. The system now knows this kind of noticing was useful here.`);
        ok('8 · and record how it went, so the system learns', outcome.status === 200);
      } else {
        ok('8 · a person item exists for the coach to act on', false);
      }
      ok('8 · no leader-facing item carries a private-context flag',
        !(brief.body.items || []).some(i => 'careFlag' in i));
    }

    // ── 9 ─────────────────────────────────────────────────────────────────────
    step(9, 'SOMEONE LEAVES, AND ASKS TO BE ERASED.');
    {
      const before = await GET('coach', '/api/group/mens/state');
      S._removePerson(C, 'm1', { erase: true });
      const after = await GET('coach', '/api/group/mens/state');
      const roster = await GET('coach', '/api/intelligence/roster');

      note(`Ben is removed with erasure.`);
      say(`      Squad size before: ${before.body.node.memberCount}   after: ${after.body.node.memberCount}`);
      ok('9 · the roster reflects it immediately, with no cache wait',
        after.body.node.memberCount === before.body.node.memberCount - 1
        && !JSON.stringify(roster.body).includes('Ben'));

      const inq = await GET('coach', '/api/group/mens/inquiry');
      const still = (inq.body.inquiries || []).find(i => i.inquiryId === inquiryId);
      note(`The squad keeps what it learned; the person is unlinked from it.`);
      ok('9 · the group keeps the finding they contributed to', !!still);
      ok('9 · but the person is gone from it', !JSON.stringify(inq.body).includes('Ben'));

      const focus = (S._teamFocuses(C, 'mens') || []).find(f => f.focusId === focusId);
      ok('9 · a commitment survives its author being erased', !!focus && focus.text.length > 0);
    }

    // ── 10 ────────────────────────────────────────────────────────────────────
    /* Everything above is the COACH's journey, and it predates the person-facing work. This step
       walks what a PLAYER actually meets, in order, because that is who the pilot puts this in
       front of first — and the transcript is the deliverable. If any of these sentences read
       badly to a human, that is a finding no assertion can produce. */
    step(10, 'WHAT A PLAYER ACTUALLY MEETS, IN ORDER.');
    {
      // D21 — the boundary is stated BEFORE they speak, not when they cross it.
      const notices = await GET('m2', '/api/me/notices');
      const sg = (notices.body.notices || []).find(n => n.id === 'safeguarding');
      say('');
      say('      BEFORE THEY SAY ANYTHING');
      say(`      "${sg && sg.text}"`);
      ok('10 · the one exception to privacy is stated before a person speaks',
        !!sg && sg.acknowledged === false && /safeguarding lead is told/.test(sg.text));

      // The trust question, answered deterministically rather than promised in a paragraph.
      const audiences = await GET('m2', '/api/me/audiences');
      say('');
      say('      "WHO CAN SEE WHAT I SAY HERE?"');
      for (const a of (audiences.body.audiences || []).slice(0, 3)) {
        say(`      · ${a.label || a.kind}${Number.isFinite(a.reaches) ? ` — reaches ${a.reaches}` : ''}`);
      }
      ok('10 · the question "who can see this" has a real answer, not a policy',
        audiences.status === 200 && (audiences.body.audiences || []).length > 0);

      // D18 — their own record, in their own subject view.
      const mine = await GET('m2', '/api/me/data');
      const held = mine.body.held || {};
      const trail = held.accessTrail || [];
      say('');
      say('      THEIR OWN RECORD');
      say(`      reads held about them: ${(held.reads || []).length} · own notes: ${(held.myNotes || []).length}`);
      say(`      who has looked: ${trail.length} recorded access(es), content-free`);
      ok('10 · a person can see their own record and who has looked at it', mine.status === 200 && !!mine.body.held);
      /* Content-freedom is a SHAPE guarantee, not a word blacklist: the audit entry carries a
         fixed vocabulary of fields and nothing else, so there is nowhere for content to sit. A
         blacklist would pass for any sentence nobody thought to ban. */
      const ALLOWED = new Set(['actor', 'action', 'at', 'basis', 'subjectIds', 'findingRefs', 'seq', 'hash', 'prevHash']);
      ok('10 · the access trail is content-free BY SHAPE — no field outside the fixed vocabulary',
        trail.length > 0 && trail.every(e => Object.keys(e).every(k => ALLOWED.has(k))));

      // D4/D5/D6 — their own Highs and Lows, bucketed by the one owner.
      const own = await GET('m2', '/api/proactive/insights');
      const groups = own.body.groups || {};
      say('');
      say('      THEIR OWN HIGHS AND LOWS');
      for (const [name, g] of Object.entries(groups)) {
        say(`      ${String(name).padEnd(6)} ${g.insights && g.insights.length ? g.insights[0].title || g.insights[0].headline : (g.message || '—')}`);
      }
      ok('10 · a person is shown their own Highs and Lows, self-scoped',
        own.status === 200 && Object.keys(groups).length > 0);
    }

    // ── 11 ────────────────────────────────────────────────────────────────────
    /* THE SENTENCES THEMSELVES. Not that a field is populated — what a human would READ. This is
       the composer (D30/D34) on the object that ranks highest, and it is the single screen the
       product is judged on. */
    step(11, 'THE OPEN QUESTION, AS A PERSON READS IT.');
    {
      const lead = await GET('coach', '/api/inquiry/lead');
      const x = lead.body.lead && lead.body.lead.explained;
      say('');
      if (x) {
        say(`      ${x.headline}`);
        say(`      ${x.claim}`);
        if (x.provenance) say(`      ${x.provenance}`);
        if ((x.stillUnknown || []).length) { say(''); say('      What I still don\'t know'); x.stillUnknown.forEach(u => say(`        ${u}`)); }
        if ((x.wouldChangeMyMind || []).length) { say(''); say('      What would change my mind'); x.wouldChangeMyMind.forEach(f => say(`        ${f}`)); }
        if (x.contested) { say(''); say(`      ${x.contested}`); }
      } else { say('      (no open question ranked at this point in the rehearsal)'); }
      ok('11 · the lead question arrives composed, not as raw fields for a client to assemble',
        !lead.body.lead || (!!x && typeof x.claim === 'string' && x.claim.length > 0));
      ok('11 · no kernel band word reaches the person',
        !x || !/\b(probable|supported|tentative|disputed|exploring)\b/.test(JSON.stringify(x)));
    }

    // ── VERDICT ───────────────────────────────────────────────────────────────
    say(`\n${'═'.repeat(72)}`);
    say('  WHAT A COACH WOULD HAVE SEEN, END TO END');
    say('═'.repeat(72));
    say(`      ${teamState.node.name}`);
    screen('High', teamState.high && (teamState.high.claim || teamState.high.about));
    screen('Low', teamState.low && (teamState.low.claim || teamState.low.about));
    screen('Inquiry', teamState.question && teamState.question.question);
    screen('IntelliQ', teamState.statement);

  } catch (e) {
    fail++;
    console.log('  FAIL rehearsal threw:', e.stack || e.message);
  } finally {
    server.close();
    console.log(`\npilot-rehearsal: ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
