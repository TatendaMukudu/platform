/* Truth layer — WHAT THE MODEL WRITES IS CHECKED BEFORE ANYBODY READS IT.

   Four live iPhone findings, all of them on the path a prompt alone governs:

     #47  a turn ending "Or are you ready to c" rendered with controls beneath it, as if finished
     #46  "That is as far as I got before I ran out of room in one answer" offered as a reason
     #45  "are you interested in recording some Highs or Lows to give me actual evidence?"
     #49  "What could we try next?" answered by reading IMG_1918.png back, before the Focus
     #50  the degraded banner on college WiFi, with every provider failure logged as one word

   THE RULE THIS FILE EXISTS FOR is the one the whole round keeps arriving at: a law that lives in
   a system prompt is not implemented. The prompt carries each of these now AND so does the code,
   and it is the code these assertions drive — with the model stubbed, so what is measured is what
   the product does with a reply rather than what a provider happened to write that day.

   #47 IS NOT #34 AGAIN, and finding out why was the whole of it. `__iqTruncated` is set from
   `stop_reason === 'max_tokens'`; a reply that stops because the STREAM stopped — an upstream
   error, a dropped connection, a proxy cutting the response, which is the same event #50 reports
   — carries no such reason, so `_cutShort` stayed false and the fragment was polished, grounded,
   given a source list and committed. Reproduced in three shapes here; the middle one is the live
   defect and the marker never fires on it.

   Run: node scripts/model-edge-honesty-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;
const ai = require('../ai/gateway.js');
const material = require('../ai/material.js');
const languageGuard = require('../ai/language-guard.js');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'meh', NOW = Date.now(), DAY = 86400000;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: { coach: { id: 'coach', name: 'Dana Coach', email: 'c@meh.io', role: 'coach',
    orgCode: C, status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true } } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
  userAiProfiles: { [`${C}:coach`]: { focuses: [{ id: 'foc_a', text: 'Concede fewer late goals',
    status: 'active', visibility: 'only_me', createdAt: new Date(NOW - 2 * DAY).toISOString() }] } },
});
_rebuildEmailIndex();

/* THE GATEWAY'S OWN MARKER, built the way `_reply` builds it, so what the composer receives is
   what a real cut-off reply looks like rather than a shape invented here. */
const marked = (text) => {
  const s = new String(text);   // eslint-disable-line no-new-wrappers
  Object.defineProperty(s, '__iqTruncated', { value: true, enumerable: false });
  return s;
};

/* THE FOUNDER'S OWN SHAPE: two finished sentences, the second ending on a NEWLINE, then a word cut
   in half. The newline matters — `'?\n'` was missing from the boundary set, so even when the
   marker DID fire the good question was thrown away with the fragment. */
const FOUNDER_CUT = 'Nothing has been recorded about how this focus has gone yet. '
  + 'Do you want me to go through what is already on it?\n'
  + 'Or are you ready to c';

const SHOT = 'Team header section showing the club crest and the words Alma College First Team. '
  + 'Below it a league table with the team in fourth position on 24 points from 16 played, '
  + 'goal difference plus four. To the right a fixture list: Saturday away to Northbridge, '
  + 'Wednesday home to Kingsway. A small logo in the bottom corner and a share icon beside it.';

const RECITES = 'Team header section showing the club crest and the words Alma College First Team. '
  + 'Below it a league table with the team in fourth position on 24 points from 16 played, '
  + 'goal difference plus four. What is it you are actually worried about losing?';
const USES = 'Nothing has been recorded about how this focus has gone yet. The table you attached '
  + 'puts you fourth on 24 points, which is context rather than anything about the late goals.';

const HIGHS = 'Nothing has been recorded about this yet. Are you interested in recording some '
  + 'Highs or Lows to give me actual evidence to work from?';
const ASKS_PROPERLY = 'Nothing has been recorded about this yet. Tell me what you saw and I will '
  + 'hold it as your account of it.';

ai.enabled = () => true;
ai.budgetAvailable = () => true;
ai.canUnderstand = () => false;
ai.completeJSON = async () => ({});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const turn = async (text) => {
    const r = await call('POST', '/api/assistant/turn', { text, about: { kind: 'focus', id: 'foc_a' } });
    const resp = (r.j || {}).response || {};
    return { said: String(resp.responseText || ''), composer: resp.composer || {},
      sources: resp.sources || [],
      limits: [...((resp.qa || {}).limitations || []), ...(resp.limitations || [])] };
  };
  /* A reply that ends mid-word is the whole subject of section A, so the predicate is stated once
     here rather than spelled out in five assertions that could drift apart. */
  const endsMidWord = t => /[\p{L}\p{N}]$/u.test(String(t || '').trim());

  try {
    console.log('\n  A — A FRAGMENT IS NEVER COMMITTED AS A FINISHED TURN');
    let calls = 0;
    ai.complete = async () => { calls++; return marked(FOUNDER_CUT); };
    const cutA = await turn('What could we try next?');
    ok('MEH-A1 a reply the provider reported as cut off never ends mid-word',
      !endsMidWord(cutA.said));
    /* THE HALF THAT WAS BEING THROWN AWAY. A question ending a line is a finished sentence. */
    ok('MEH-A2 …and a sentence ending in "?" on its own line is KEPT, not discarded with the fragment',
      /Do you want me to go through what is already on it\?/.test(cutA.said));
    ok('MEH-A3 …and the reader is told it stopped early',
      /stopped before it was finished/i.test(cutA.said));
    /* THE COPY THE FOUNDER WAS GIVEN AS A REASON. An answer-length ceiling is our problem, and a
       person reading "I ran out of room" hears a product apologising for its plumbing. */
    ok('MEH-A4 …without naming an internal answer-length limit, in the prose or the limitations',
      !/ran out of room|token|max_?tokens|character limit/i.test(cutA.said)
      && cutA.limits.every(l => !/ran out of room|token/i.test(String(l))));
    ok('MEH-A5 …and it asked the model again before settling for less than an answer',
      calls === 2);

    /* THE LIVE DEFECT. No marker at all, because the stream stopped rather than the ceiling. */
    calls = 0;
    ai.complete = async () => { calls++; return String(FOUNDER_CUT); };
    const cutB = await turn('What could we try next?');
    ok('MEH-B1 a reply that stops mid-word with NO provider marker is caught just the same',
      !endsMidWord(cutB.said) && /stopped before it was finished/i.test(cutB.said));
    ok('MEH-B2 …which is the live case, and the marker never fires on it',
      ai.isTruncated(String(FOUNDER_CUT)) === false);
    ok('MEH-B3 …and it too was asked again first', calls === 2);

    /* NOTHING COMPLETE IN IT AT ALL. There is no answer to show, so the deterministic one is the
       truthful outcome — and the fragment must not arrive wearing a source list. */
    ai.complete = async () => String('Or are you ready to c');
    const cutC = await turn('What could we try next?');
    ok('MEH-C1 a reply with no finished sentence in it degrades rather than shipping the fragment',
      !/Or are you ready to c/.test(cutC.said) && cutC.composer.degraded === true
      && cutC.composer.reason === 'cut_short');
    ok('MEH-C2 …and the person gets the record instead of a fragment',
      /Concede fewer late goals/i.test(cutC.said) && !endsMidWord(cutC.said));
    ok('MEH-C3 …with no source list hung off an answer that was never written',
      cutC.sources.length === 0);
    /* AND A FINISHED REPLY IS LEFT ALONE. Without this the section would pass on a build that
       marked every reply cut short. */
    ai.complete = async () => String('Nothing has been recorded about how this focus has gone yet.');
    const whole = await turn('What could we try next?');
    ok('MEH-C4 …while a reply that finished its sentence is passed through untouched',
      whole.said === 'Nothing has been recorded about how this focus has gone yet.'
      && whole.composer.degraded === false);

    console.log('\n  D — NOBODY IS ASKED TO RECORD A HIGH OR A LOW');
    ai.complete = async () => String(HIGHS);
    const highs = await turn('What do you make of this?');
    ok('MEH-D1 the live sentence never reaches the person',
      !/recording some Highs or Lows/i.test(highs.said) && highs.composer.degraded === true);
    ok('MEH-D2 …and they get the record instead of a refusal notice',
      /Concede fewer late goals/i.test(highs.said));
    ai.complete = async () => String(ASKS_PROPERLY);
    const proper = await turn('What do you make of this?');
    ok('MEH-D3 …while asking for the OBSERVATION, which is what a person actually contributes, passes',
      proper.said === ASKS_PROPERLY && proper.composer.degraded === false);
    /* THE PREDICATE ITSELF, because a guard that also refuses the product's own commonest
       sentence would be worse than the defect. "record" is a noun all over this product. */
    ok('MEH-D4 the guard reads the verb, not the noun — "on the record" is not an invitation',
      !languageGuard.invitesGovernedCreation('That is what is on the record here, and the mood is low.')
      && !languageGuard.invitesGovernedCreation('A high appeared on your record last week.')
      && !languageGuard.invitesGovernedCreation('Attendance is low and the pressure is high.'));
    ok('MEH-D5 …and still catches every way of asking for one',
      ['Shall I add a High for you?', 'Try logging a Low about it.',
        'Would you like to create a new high?', 'record some Highs or Lows']
        .every(t => languageGuard.invitesGovernedCreation(t)));

    console.log('\n  E — THE ATTACHMENT INFORMS THE ANSWER AND DOES NOT BECOME IT');
    const att = await call('POST', '/api/materials', { attachTo: { kind: 'focus', id: 'foc_a' },
      filename: 'IMG_1918.png', title: 'IMG_1918.png', kind: 'image', text: SHOT });
    ok('MEH-E0 the picture is really attached, or the rest of this proves nothing',
      att.status === 200 && !!(att.j || {}).materialId);
    ai.complete = async () => String(RECITES);
    const recite = await turn('What could we try next?');
    ok('MEH-E1 a reply that reads the picture back is refused when the question was about the focus',
      !/Team header section/i.test(recite.said) && recite.composer.degraded === true);
    ok('MEH-E2 …and the deterministic answer leads with the focus instead',
      /Concede fewer late goals/i.test(recite.said));
    ok('MEH-E3 …with the picture still inspectable underneath as a source',
      recite.sources.some(s => /IMG_1918/.test(String(s.label || ''))));
    ai.complete = async () => String(USES);
    const uses = await turn('What could we try next?');
    ok('MEH-E4 …while a reply that USES a figure from it passes untouched',
      uses.said === USES && uses.composer.degraded === false);
    /* THE LINE THE FINDING DRAWS: quoting is the point when quoting is what was asked for. */
    ai.complete = async () => String(RECITES);
    const asked = await turn('What does that picture say?');
    ok('MEH-E5 …and asking what the picture says returns what it says',
      /Team header section/i.test(asked.said) && asked.composer.degraded === false);
    ok('MEH-E6 the measurement is recitation, not resemblance — a run of the document\'s own words in order',
      material.recitationOf(RECITES, SHOT).recites === true
      && material.recitationOf(RECITES, SHOT).opens === true
      && material.recitationOf(USES, SHOT).recites === false);

    console.log('\n  F — A PROVIDER FAILURE IS CLASSIFIED, AND IS NEVER THE READER\'S NETWORK');
    const mk = o => Object.assign(new Error(o.message || 'provider failed'), o);
    ok('MEH-F1 the gateway tells the failures apart, in a closed vocabulary',
      ai.failureClass(mk({ status: 429 })) === 'rate_limited'
      && ai.failureClass(mk({ status: 529 })) === 'over_capacity'
      && ai.failureClass(mk({ status: 500 })) === 'upstream'
      && ai.failureClass(mk({ status: 401 })) === 'auth'
      && ai.failureClass(mk({ code: 'ETIMEDOUT' })) === 'timeout'
      && ai.failureClass(mk({ code: 'ENOTFOUND' })) === 'unreachable'
      && ai.failureClass(mk({ message: 'fetch failed' })) === 'unreachable');
    ok('MEH-F2 …every class it can return is one somebody can count',
      ai.FAILURE_CLASSES.length >= 8
      && [mk({ status: 429 }), mk({ status: 500 }), mk({ code: 'ENOTFOUND' }), mk({}), null]
        .every(e => ai.FAILURE_CLASSES.includes(ai.failureClass(e))));
    ai.complete = async () => { throw mk({ status: 429, message: 'rate limit exceeded' }); };
    const down = await turn('What could we try next?');
    ok('MEH-F3 a provider failure still leaves one durable answer rather than an error',
      down.composer.degraded === true && down.composer.reason === 'error'
      && /Concede fewer late goals/i.test(down.said));
    /* THE FOUNDER WAS ON COLLEGE WiFi. Whatever failed, it was between this server and the
       provider — if their connection were the problem the request would not have arrived. */
    ok('MEH-F4 …and nothing the person reads blames their connection',
      !/network|wi-?fi|connection|offline|signal|internet/i.test(down.said)
      && down.limits.every(l => !/network|wi-?fi|connection|offline/i.test(String(l))));
    ok('MEH-F5 …nor leaks the provider\'s own failure to them',
      !/rate limit|429|provider|upstream|timeout|api key/i.test(down.said));

  } catch (e) { fail++; console.error('  FAIL model edge honesty threw:', e && e.stack); }

  server.close();
  console.log(`\nmodel-edge-honesty-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
