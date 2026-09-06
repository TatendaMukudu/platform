/* Truth layer — A RECOMMENDED DIRECTION IS A JUDGMENT, NOT A FACT.
   And: the conversation should remember what you agreed to try.

   Two laws the founder drew explicitly, and they belong together because they are the two halves
   of "make a good conversation useful, and carry its value into the next one".

   ── ONE: THE STANCE ─────────────────────────────────────────────────────────────────────────

     | What happened                | "These records describe…" with dates and sources    |
     | What appears to be happening | "The current evidence suggests…" with uncertainty   |
     | What to do next              | "Given your goal, one option is…" with trade-offs   |

   The failure this prevents is not inventing a fact. Every word of a recommendation can be
   perfectly sourced and it is still a JUDGMENT — and stated in the grammar of a finding it
   borrows an authority it has not got. `reasoning-register` governs where a claim may come from;
   nothing governed what kind of thing it was being offered as.

   A record that cannot show its receipts is DEMOTED to a reading rather than refused, because the
   content may be good and it is the certainty that was wrong.

   ── TWO: THE RETURN ─────────────────────────────────────────────────────────────────────────

   "You wanted to try a captain-led reset. Did you get a chance to use it?"

   Three answers, and only one of them is about the person: "we did not play", "I did not get
   round to it" and "I tried it" are three different facts. A done/not-done control reads a
   fixture list as a character flaw.

   Run: node scripts/stance-continuity-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-test-not-a-real-key';

const stance = require('../ai/stance.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _getMemory, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const DAY = 86400000;

/* ══════════════════ PART ONE — THE STANCE ══════════════════ */

ok('SN1 there are three stances and no more — a fourth is a new promise to a listener and must not be addable by accident',
  JSON.stringify(stance.STANCES) === JSON.stringify(['record', 'reading', 'recommendation']));

ok('SN1b each opens in the founder\'s own words, deterministically, so a reading never some days opens like a record',
  stance.OPENERS.record === 'These records describe' &&
  stance.OPENERS.reading === 'The current evidence suggests' &&
  stance.OPENERS.recommendation === 'Given your goal, one option is');

/* L-SN1 — an unrecognised stance is REFUSED, not defaulted to the safest. A caller that forgot to
   say has not decided, and deciding for them is how the distinction stops being made. */
{
  const g = stance.govern({ text: 'something', sources: [{ ref: 'a', at: Date.now() }] });
  ok('SN2 a claim with no stance declared is REFUSED rather than defaulted — picking the safe one for a caller is how a distinction quietly stops being drawn',
    !g.ok && g.violations[0].kind === 'unknown_stance' && g.statement === null);
}

/* L-SN2 — a record must show its receipts, and is DEMOTED rather than binned. */
{
  const g = stance.govern({ stance: 'record', text: 'the team pressed higher in the second half',
    sources: ['some-note'], stillUnknown: ['whether it held for the whole half'] });
  ok('SN3 a RECORD with an undated source is not a record — a claim about what happened, with nothing to check WHEN against, is a reading in a record\'s grammar',
    g.ok === true && g.stance === 'reading' && g.demoted === true);
  ok('SN3b …and it is demoted, not refused: the content may be perfectly good and it is the certainty that was wrong',
    /current evidence suggests/.test(stance.say(g.statement)));
}
{
  const g = stance.govern({ stance: 'record', text: 'two match reviews mentioned the restart',
    sources: [{ ref: 'rev1', label: 'Match review', at: Date.parse('2026-08-10') },
              { ref: 'rev2', label: 'Match review', at: Date.parse('2026-08-24') }] });
  ok('SN4 a record WITH dated sources stands as a record',
    g.ok === true && g.stance === 'record' && g.demoted === false);
  ok('SN4b …and says how many and when, because "these records describe" is a promise the reader can check',
    /^These records describe/.test(stance.say(g.statement)) && /2 records/.test(stance.say(g.statement)));
}

/* L-SN3 — a reading must carry what would change it. */
{
  const bare = stance.govern({ stance: 'reading', text: 'people stop talking after conceding' });
  ok('SN5 a READING with no stated uncertainty is refused — "the evidence suggests" with nothing that would change it is a verdict with a hedge in front of it',
    !bare.ok && bare.violations.some(v => v.kind === 'reading_without_uncertainty'));
  const good = stance.govern({ stance: 'reading', text: 'people stop talking after conceding',
    stillUnknown: ['whether it happens when you are ahead too'] });
  ok('SN5b …and one that says what would change it stands, and says it out loud',
    good.ok && /What would change this: whether it happens when you are ahead too/.test(stance.say(good.statement)));
}

/* L-SN4 — THE FOUNDER'S LINE, MADE MECHANICAL. */
{
  const sold = stance.govern({ stance: 'recommendation', text: 'give the captain the reset' });
  ok('SN6 a RECOMMENDATION with no goal and no trade-off is refused — one with no cost is being sold, not offered',
    !sold.ok && sold.violations.some(v => v.kind === 'recommendation_without_goal') &&
    sold.violations.some(v => v.kind === 'recommendation_without_tradeoff'));
  const offered = stance.govern({ stance: 'recommendation', text: 'give the captain the reset',
    goal: 'to stop the quiet spell after conceding',
    tradeoffs: ['it puts more on one player, who may not want it'] });
  ok('SN6b …one that names its goal and its cost stands',
    offered.ok === true && offered.stance === 'recommendation');
  ok('SN6c …AND MARKS ITSELF A JUDGMENT, on the object and in the sentence — a person cannot disagree with something that has not admitted it is arguable',
    offered.statement.isJudgment === true &&
    /This is a judgment, not a finding\./.test(stance.say(offered.statement)) &&
    /The cost: it puts more on one player/.test(stance.say(offered.statement)));
  ok('SN6d …and it opens by naming the goal it serves, rather than as a flat instruction',
    /^Given your goal, one option is/.test(stance.say(offered.statement)));
}

/* L-SN6 — the founder's other line: "a room agreeing with a story doesn't make it independently
   verified." Refused as an INPUT, so it cannot be laundered into weight. */
{
  const g = stance.govern({ stance: 'reading', text: 'the restart is the problem',
    stillUnknown: ['who is meant to organise it'], agreementCount: 9 });
  ok('SN7 A COUNT OF PEOPLE WHO AGREED IS REFUSED AS EVIDENCE — a room agreeing with a story does not make it independently verified, and the number cannot be handed in as if it did',
    !g.ok && g.violations.some(v => v.kind === 'agreement_is_not_corroboration'));
  ok('SN7b …refused rather than ignored, so a caller finds out the input is wrong instead of watching it silently do nothing',
    g.statement === null);
}

/* L-SN5 — the stance is declared, never read from the wording. */
{
  const hedged = stance.govern({ stance: 'record', text: 'maybe possibly it might have been that',
    sources: [{ ref: 'r', at: Date.now() }] });
  ok('SN8 the most hedged wording imaginable still stands as a RECORD when the caller declared one — the stance is declared, never inferred, which is the same law a signal\'s direction obeys',
    hedged.ok && hedged.stance === 'record');
  const flat = stance.govern({ stance: 'recommendation', text: 'this is definitely the answer',
    goal: 'g', tradeoffs: ['t'] });
  ok('SN8b …and the flattest wording is still a recommendation, still marked a judgment',
    flat.ok && flat.statement.isJudgment === true);
}

/* ══════════════════ PART TWO — THE RETURN ══════════════════ */

const C = 'stcont';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me: { id: 'me', name: 'A Player', email: 'me@x.io', role: 'member', orgCode: C, status: 'active' },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const get  = (u, t) => fetch(base + u, { headers: H(t) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, t, b) => fetch(base + u, { method: 'POST', headers: H(t), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const meT = issueToken('me', C, 'member');
  const mem = () => _getMemory(C, 'me');

  try {
    /* A focus agreed YESTERDAY. The age matters: something set in this session is not a thing to
       be asked about, and the fixture has to be old enough to prove that rule is doing work. */
    const made = await post('/api/me/focus', meT, { text: 'try a captain-led reset after we concede' });
    const FID = made.j.focus.id;
    const f = mem().focuses.find(x => x.id === FID);
    f.createdAt = new Date(Date.now() - 2 * DAY).toISOString();

    const ctx = await get('/api/me/context', meT);
    ok('CN1 COMING BACK, INTELLIQ ASKS ABOUT THE THING YOU AGREED TO TRY',
      ctx.status === 200 && !!ctx.j.continuity && ctx.j.continuity.focusId === FID);
    ok('CN1b …quoting their OWN words back, because the point is that they recognise what they said',
      /try a captain-led reset after we concede/.test(ctx.j.continuity.question));
    ok('CN1c …and asking about the EXPERIMENT, not about them — "did you get a chance to?" can be answered with "we did not play", and nothing about that answer is a failure',
      /Did you get a chance to\?$/.test(ctx.j.continuity.question) &&
      !/how are you getting on/i.test(ctx.j.continuity.question));

    /* ASKED ONCE. Somebody opening the app four times in an afternoon is not asked four times —
       the record of having asked is what makes a follow-up feel like memory rather than a loop. */
    const again = await get('/api/me/context', meT);
    ok('CN2 asked ONCE, not on every open — a follow-up that repeats is a reminder loop, not memory',
      again.j.continuity === null || again.j.continuity === undefined);

    /* A FOCUS SET JUST NOW IS NOT ASKED ABOUT. */
    await post('/api/me/focus', meT, { text: 'something I just decided this minute' });
    const fresh = await get('/api/me/context', meT);
    ok('CN3 a focus set moments ago is not asked about — being asked whether you have tried the thing you just said is the product not listening',
      !fresh.j.continuity);

    /* THREE ANSWERS, AND ONE OF THEM IS NOT ABOUT THE PERSON. */
    const junk = await post(`/api/me/focus/${FID}/tried`, meT, { tried: 'sort of' });
    ok('CN4 an unrecognised answer is refused rather than coerced — the same law every declared thing in this product obeys',
      junk.status === 400 && /will not work out which one you meant/i.test(junk.j.error || ''));

    const noChance = await post(`/api/me/focus/${FID}/tried`, meT, { tried: 'no_chance' });
    ok('CN5 "no chance yet" is recorded as its own answer',
      noChance.status === 200 && noChance.j.tried === 'no_chance');
    ok('CN5b …and is explicitly NOT read as the thing failing — a fixture list is not a character flaw',
      /not the same as it not working/i.test(noChance.j.note || ''));
    ok('CN5c …the focus stays open, because trying something once is not finishing it and not trying it is not abandoning it',
      mem().focuses.find(x => x.id === FID).status === 'active');
    ok('CN5d …and it comes back with ONE question, so answering continues the conversation rather than ticking a box',
      typeof noChance.j.next === 'string' && /\?$/.test(noChance.j.next));

    /* THEIR WORDS BECOME EVIDENCE — with themselves as the origin, and only if they gave any. */
    const withWords = await post(`/api/me/focus/${FID}/tried`, meT,
      { tried: 'yes', because: 'we tried it against Alma and it was calmer for about ten minutes' });
    ok('CN6 an answer WITH their own words becomes evidence on their record, with themselves as the origin',
      withWords.status === 200 && !!withWords.j.inquiryId);
    const inq = Object.values((inquiryStates[C] || {})['member:me'] || {})
      .find(i => i.inquiryId === withWords.j.inquiryId);
    ok('CN6b …directed at how the FOCUS is going, not at what the person is like',
      inq && /How "try a captain-led reset/.test(inq.displayLabel || (inq.topic || {}).label || ''));
    ok('CN6c …carrying no direction, because having tried something is not an improvement and not getting to it is not a decline',
      inq && (inq.signals || []).every(s => s.direction === 'neutral'));

    const noWords = await post(`/api/me/focus/${FID}/tried`, meT, { tried: 'not_yet' });
    ok('CN7 an answer with NO words files nothing — the declaration is the fact, and asking for an account is not requiring one',
      noWords.status === 200 && noWords.j.inquiryId === null);

    /* THE ATTEMPTS ARE KEPT, so "what remains unresolved" has something behind it. */
    const attempts = mem().focuses.find(x => x.id === FID).attempts || [];
    ok('CN8 every answer is kept in order, so what was tried and when is a record rather than a last-value-wins field',
      attempts.length === 3 && attempts.map(a => a.tried).join(',') === 'no_chance,yes,not_yet');

    /* SOMEBODY ELSE'S FOCUS. */
    ok('CN9 nobody can answer for somebody else — _getMemory is keyed by this session\'s own person, so another user\'s focus is not in the list at all',
      (await post('/api/me/focus/foc_nope/tried', meT, { tried: 'yes' })).status === 404);

    /* THE CALL SITES. */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    /* CN10 — ANCHORED TO THE CALL, not the definition. The first version matched
       `/_loadContinuity\(\)/`, which the function's own `async _loadContinuity() {` satisfies —
       so deleting the call that runs it left the assertion green and the feature unreachable.
       Third time this exact masking has appeared in this codebase; existence is not invocation. */
    ok('CN10 the question is actually asked on the screen people land on — the CALL is asserted, because a regex that matches the definition proves only that somebody wrote one',
      /this\._loadTopQuestion\(\);\s*\n\s*this\._loadContinuity\(\);/.test(src) &&
      /id="iq-continuity"/.test(src));
    ok('CN10b …rendered as IntelliQ SPEAKING rather than as a task widget — a checkbox asks you to report compliance, a question asks what happened',
      /iq-msg iq-msg-iq iq-continuity/.test(src) && /I tried it/.test(src) && /No chance yet/.test(src));
    ok('CN10c …and the answer posts to the route, then shows the next question',
      /\/tried`/.test(src) && /esc\(j\.next\)/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nstance-continuity-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
