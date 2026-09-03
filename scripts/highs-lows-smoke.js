/* Truth layer — HIGHS AND LOWS, WITHOUT A MACHINE DECIDING HOW SOMEBODY IS DOING.

   Both buckets had been structurally dead since September and nothing said so. Six of the seven
   pattern detectors read a mood series built from the daily check-in, and when that was retired
   the detectors had nothing to fire on — so the app reported "Nothing needs your attention right
   now — you're in a steady place" to a person it could not see at all. Measured, not guessed:
   zero highs and zero lows across 28 seeded players with real evidence in the system.

   The founder's diagnosis of the check-in was the right one: "my beef with the check-ins is they
   were outputting the same thing." A question asked every day whether or not there is anything
   to answer teaches people the question is noise.

   So this is built the way the TEAM path already works, which is the part of this product worth
   copying. A team belief becomes a High or a Low by passing four gates in order: somebody CALLED
   it working-well or worth-attention; two independent origins; the two-sided cohort floor; and
   the kernel rates it emerging or better and undisputed. For a belief about one person there is
   no cohort, so that gate does not apply. Every other one does.

   Gate one is the whole thing: NOBODY BUT THE PERSON CALLS IT. Not the model, not a keyword
   list over the wording, not a leader. The machine counts, checks independence, and refuses when
   the evidence is thin; a human says which way it points. That is what makes the team version
   trustworthy and it is the only reason to build the personal one the same way.

   And it asks ONCE, about a belief that has already earned the question — the difference between
   firing on evidence and firing on a clock.

   Run: node scripts/highs-lows-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const diagnose = require('../ai/diagnose.js');
const teamState = require('../ai/team-state.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates, _getMemory } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'hls';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: { u: { id: 'u', name: 'A Player', email: 'u@x.io', role: 'member', orgCode: C, status: 'active' } } },
});
_rebuildEmailIndex();

/* An inquiry built through the PRODUCTION constructors with `n` independent origins, so the
   bands and origin counts below are the kernel's own and not the fixture's. */
const mk = (id, concept, label, n, opts = {}) => {
  let i = diagnose.newInquiry({ id, subjectRef: 'member:u', concept, label, domain: 'sports' });
  const props = Array.from({ length: n }, (_, k) => ({
    id: `p${k}`, level: 'observation', directness: 'direct', authority: 'self_report',
    source: 'self', specificity: 0.7, statement: 'x',
    originKind: 'self_report', originRef: `${id}_o${k}`, turnId: `${id}_t${k}`,
    ...(opts.dissentOn === k ? { contradicts: true } : {}),
  }));
  i = diagnose.applyProposals(i, props, { now: Date.now(), evidenceRefOf: p => p.originRef });
  i.hypotheses = [diagnose.newHypothesis({ id: `h_${id}`, statement: `something about ${label}` })];
  i.leadingHypothesisId = i.hypotheses[0].id;
  return i;
};

inquiryStates[C] = { 'member:u': {
  ready:     mk('inq_ready', 'soccer.warmup', 'Warm-up routine', 3),
  thin:      mk('inq_thin', 'soccer.touch', 'First touch', 1),
  contested: mk('inq_cont', 'soccer.travel', 'Away travel', 3, { dissentOn: 2 }),
} };

/* WHY THERE IS NO "TWO WEAK ORIGINS" FIXTURE HERE, having tried to build one.
   The kernel admits observations and refuses inferences outright, and ANY two admitted
   observations from distinct origins land at `probable` — specificity, directness and authority
   do not pull the band back below `emerging`. So along this path `origins < MIN_ORIGINS` and
   `band < emerging` are the SAME CONDITION, and neither gate is ever the sole reason a belief is
   refused. Each is defence in depth for the other, which is the right way round, but it means no
   fixture reachable through the routes can tell them apart: a mutation deleting either one leaves
   every HTTP answer identical. The first version of this suite had a fixture that looked like it
   covered the case and was passing on an inquiry with zero admitted signals.
   So both gates are asserted directly on the kernel below (HL3b, HL7c, HL3c, HL7d), where the two
   conditions can be handed in separately, and the route-level assertions stand on what they can
   honestly see. */

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('u', C, 'member')}`, 'Content-Type': 'application/json' };
  const get  = u => fetch(base + u, { headers: H }).then(r => r.json());
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: H, body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const buckets = async () => ({
    high: ((await get('/api/objects?kind=high&scope=self')).objects || []).map(o => (o.present || {}).summary?.title || ''),
    low:  ((await get('/api/objects?kind=low&scope=self')).objects  || []).map(o => (o.present || {}).summary?.title || ''),
  });

  try {
    /* ── HL1-HL3: nothing is filed until somebody says so. ── */
    const before = await buckets();
    // The contested belief is a Low from the outset and correctly so — a disagreement needs
    // nobody's call. So what HL1 asserts is that an UNCALLED, uncontested belief is neither,
    // not that both buckets are empty. The first version asserted the latter and was wrong
    // about the product rather than about the code.
    ok('HL1 an uncalled belief is neither a High nor a Low — a belief on its own does not point anywhere',
      before.high.length === 0 && !before.low.some(t => /Warm-up routine/i.test(t)));

    const asked = await get('/api/me/calls');
    const labels = (asked.calls || []).map(c => c.label);
    ok('HL2 the question is asked about a belief that EARNED it — three separate occasions, rated emerging or better',
      labels.some(l => /Warm-up routine/i.test(l)));
    ok('HL3 …and NOT about one resting on a single telling — asking early is how the check-in taught people to ignore it',
      !labels.some(l => /First touch/i.test(l)));
    // Same masking as HL7c, at the other end: through the route, a one-origin belief is already
    // below `emerging`, so HL3 above would still pass with the origins check deleted. Asserted on
    // the kernel where the two conditions come apart.
    ok('HL3b …and the ask-gate refuses a single-origin belief on its own, not merely because the band is low',
      teamState.readyForCall({ confidence: { band: 'supported' }, independentOrigins: 1 }) === false &&
      teamState.readyForCall({ confidence: { band: 'supported' }, independentOrigins: 2 }) === true);
    ok('HL3c …and the other way round: plenty of separate origins does not earn the question if the kernel still rates it tentative',
      teamState.readyForCall({ confidence: { band: 'tentative' }, independentOrigins: 5 }) === false);

    /* ── HL4-HL7: the person calls it, and the call is what decides the bucket. ── */
    const up = await post('/api/me/call', { inquiryId: 'inq_ready', valence: 'working_well' });
    ok('HL4 calling it working-well files it as a High', up.status === 200 && up.j.bucket === 'high');
    const afterUp = await buckets();
    ok('HL4b …and it is actually in the bucket, through the same read the app uses',
      afterUp.high.some(t => /Warm-up routine/i.test(t)) && !afterUp.low.some(t => /Warm-up routine/i.test(t)));

    const down = await post('/api/me/call', { inquiryId: 'inq_ready', valence: 'worth_attention' });
    ok('HL5 changing your mind moves it — a call is a call, not a conclusion', down.j.bucket === 'low');
    const afterDown = await buckets();
    ok('HL5b …and the buckets follow',
      afterDown.low.some(t => /Warm-up routine/i.test(t)) && !afterDown.high.some(t => /Warm-up routine/i.test(t)));

    const cleared = await post('/api/me/call', { inquiryId: 'inq_ready', valence: null });
    ok('HL6 taking the call back returns it to being something you are working out',
      cleared.j.called === null);
    const afterClear = await buckets();
    ok('HL6b …and it leaves both buckets',
      !afterClear.high.some(t => /Warm-up routine/i.test(t)) && !afterClear.low.some(t => /Warm-up routine/i.test(t)));

    /* ── HL7: A CALL CANNOT PROMOTE THIN EVIDENCE. Somebody deciding a thing is going well does
       not make it established, and this is the gate that stops the feature becoming a mood
       button with extra steps. ── */
    const thin = await post('/api/me/call', { inquiryId: 'inq_thin', valence: 'working_well' });
    ok('HL7 a call on a belief resting on ONE telling is recorded but does not file it anywhere',
      thin.status === 200 && thin.j.bucket === null && /independent origin/.test(thin.j.note || ''));
    ok('HL7b …and it is genuinely not in a bucket',
      !(await buckets()).high.some(t => /First touch/i.test(t)));

    /* HL7c pins the origins gate ON ITS OWN. Through the HTTP path it cannot be caught at the
       outcome: independentOrigins is counted from the same evidence refs that drive the band, so
       a one-origin belief is already below `emerging` and the standing gate refuses it first.
       Removing the origins check entirely leaves every route answering the same way and only the
       WORDING of the refusal changes — which is a coupling between two gates, not a law.
       So the case where they come apart is asserted directly on the kernel: a belief the kernel
       rates `supported`, called by the person whose belief it is, resting on ONE telling. */
    const loud = teamState.personalValence(
      { confidence: { band: 'supported' }, independentOrigins: 1 },
      { call: { valence: 'working_well', at: Date.now() } });
    ok('HL7c a call plus a strong band STILL does not file a single-origin belief — repetition is not corroboration, and a call is not evidence',
      loud.ok === false && loud.polarity === 'neutral' &&
      loud.blocked.some(b => b.gate === 'origins'));

    const weak = teamState.personalValence(
      { confidence: { band: 'tentative' }, independentOrigins: 5 },
      { call: { valence: 'worth_attention', at: Date.now() } });
    ok('HL7d …and a call on something the kernel rates tentative is refused however many origins it has — two origins is not the only thing a belief has to be',
      weak.ok === false && weak.polarity === 'neutral' &&
      weak.blocked.some(b => b.gate === 'standing'));

    /* ── HL8: contested needs nobody's call. A disagreement is a fact about the evidence, and
       it is a Low because it is a thing to go and resolve rather than to average. ── */
    const withContested = await buckets();
    ok('HL8 a belief accounts disagree about surfaces as a Low on its own — no call needed, because the disagreement IS the finding',
      withContested.low.some(t => /Away travel|differ/i.test(t)));
    const contestedCall = await post('/api/me/call', { inquiryId: 'inq_cont', valence: 'working_well' });
    ok('HL8b …and calling it does not overrule the disagreement',
      contestedCall.j.bucket === null);

    /* ── HL9-HL11: focuses. Facts about a commitment somebody made themselves. ── */
    const mem = _getMemory(C, 'u');
    mem.focuses = [
      { id: 'f_done', text: 'Arrive twenty minutes early', status: 'done', visibility: 'private',
        outcome: { result: 'helped', at: Date.now() }, createdAt: new Date().toISOString() },
      { id: 'f_late', text: 'Lead the warm-up on Tuesdays', status: 'active', visibility: 'private',
        reviewAt: Date.now() - 5 * 86400000, createdAt: new Date().toISOString() },
    ];
    const withFocuses = await buckets();
    ok('HL9 a focus whose outcome you recorded as having helped is a High',
      withFocuses.high.some(t => /set out to do worked/i.test(t)));
    ok('HL9b …and it carries none of the focus\'s own words — an insight is a projection, not a place for raw text to travel',
      !withFocuses.high.some(t => /Arrive twenty minutes early/i.test(t)));
    ok('HL10 a focus past its review date with nothing recorded is a Low',
      withFocuses.low.some(t => /past its review/i.test(t)));

    /* ── HL11: THE PROPERTY THAT MATTERS. Nowhere in any of this does a machine decide how a
       person is doing. Asserted on the kernel directly: with no call, no polarity, whatever
       the evidence looks like. ── */
    const strong = mk('inq_x', 'soccer.x', 'Anything at all', 6);
    const uncalled = teamState.personalValence({ ...strong, independentOrigins: 6 }, { call: null });
    ok('HL11 with nobody having called it, even overwhelming evidence produces NO polarity — the machine counts, a person says which way it points',
      uncalled.ok === false && uncalled.polarity === 'neutral' &&
      uncalled.blocked.some(b => b.gate === 'uncalled'));

    /* ── HL12: THE QUESTION HAS TO REACH THE PHONE. Both routes worked and passed every
       assertion above while nothing in the app called either of them — which is the same defect
       as the coach's squad focus that no player ever saw, and as the "Make this a focus" button
       that never made a focus. Asserting a function EXISTS is not asserting anything CALLS it,
       so this pins the CALL SITE and the two answers a person can actually tap. ── */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('HL12 the thread ASKS — opening a belief invokes the call row, rather than merely defining it',
      /this\._renderCallRow\(objectId\)/.test(src));
    ok('HL12b …and both answers are things a person can tap, either way round',
      /callBelief\('\$\{id\}','working_well'\)/.test(src) &&
      /callBelief\('\$\{id\}','worth_attention'\)/.test(src));
    ok('HL12c …and the row reads the beliefs that earned the question, and posts the call',
      /fetch\('\/api\/me\/calls'/.test(src) && /fetch\('\/api\/me\/call'/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nhighs-lows-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
