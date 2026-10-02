/* Truth layer — A FIGURE BELONGS TO THE CLAIM IT IS ABOUT (HTTP, the real composer route).

   An independent gate produced the sharpest counterexample this verifier has been given. Hold a
   manifest with two approved claims:

       "2 separate sessions concern recovery between fixtures"
       "3 separate sessions concern attendance at training"

   and let the model write

       "3 separate sessions concern recovery between fixtures."

   Every word in that sentence is approved. Every figure in it is approved. The organisation's own
   record contains both halves. And the sentence is FALSE, because the figure has been attached to
   the wrong claim — and the verifier said `ok: true`, because it had pooled every claim's numbers
   into one set and could no longer tell which claim a figure had come from. A membership test
   cannot see a swap. It is the same class as a stale channel: nothing invented, and the relation
   between true things wrong.

   ai/manifest.js owns the law (L-MF2b) and output-manifest-smoke §J drives the module against it.
   THIS FILE IS THE OTHER HALF, and it is the half the gate was right to ask for: a verifier
   nothing calls on the way to a screen is a verifier that will be correct about an answer nobody
   was shown. So the crossing arrives here the way it would arrive in production — written by the
   model, through POST /api/assistant/turn, with the manifest built by the route out of this
   person's real agenda rather than by a fixture — and the assertions are about what reaches the
   reader.

   The provider boundary is steered by replacing ai.complete on the gateway module object, the
   same object server.js holds. No fake server, no fake route, the real handler all the way down.

   Run: node scripts/manifest-claim-binding-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const ai = require('../ai/gateway.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'mcb';
const NOW = Date.UTC(2026, 2, 10, 9, 0, 0);
const DAY = 86400000;

const SIG = (origin, at, ref, text) => ({ kind: 'observation', status: 'active', source: 'training log',
  originRef: origin, at, turnId: `t_${ref}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref, text });

/* TWO WORKING READS, TWO TOPICS, TWO FIGURES. Both become approved claims on the turn's manifest
   because the route puts this person's own active inquiries into the model's context — which is
   exactly the situation that makes a crossing possible at all. One inquiry could not produce one. */
const INQ = (id, label, statement, signals) => ({
  inquiryId: id, subjectRef: 'member:ash',
  topic: { canonicalConcept: `football.${id}`, label },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement, confidence: { score: 0.6, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals,
  confidence: { score: 0.6, band: 'probable', because: ['2 independent origins'] },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    ash: { id: 'ash', name: 'Ashton Mbeki', email: 'a@mcb.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['ash'], leaderIds: [] } } },
  inquiryStates: { [C]: { 'member:ash': {
    rec: INQ('rec', 'Recovery between games', '2 separate sessions concern recovery between fixtures',
      [SIG('o_r1', NOW - 4 * DAY, 'ev_r1', 'Recovery felt short after the midweek game'),
       SIG('o_r2', NOW - 3 * DAY, 'ev_r2', 'Legs were heavy going into the weekend')]),
    att: INQ('att', 'Attendance at training', '3 separate sessions concern attendance at training',
      [SIG('o_a1', NOW - 4 * DAY, 'ev_a1', 'Turnout was thin on Tuesday'),
       SIG('o_a2', NOW - 2 * DAY, 'ev_a2', 'Two players missed the Thursday session')]),
  } } },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete };
const restore = () => Object.assign(ai, REAL);
const say = (what) => Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true, complete: async () => what,
});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('ash', C, 'member')}`, 'Content-Type': 'application/json' };
  const turn = text => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H, body: JSON.stringify({ text }) })
    .then(r => r.json()).catch(() => null);

  const ASK = 'What is the picture on recovery between games at the moment?';
  const HONEST  = '2 separate sessions concern recovery between fixtures, and that is the working read rather than something settled.';
  const CROSSED = '3 separate sessions concern recovery between fixtures, and that is the working read rather than something settled.';
  const SWAPPED = '2 separate sessions concern attendance at training, and that is the working read rather than something settled.';
  const INVENTED = '9 separate sessions concern recovery between fixtures, and that is the working read rather than something settled.';

  try {
    console.log('\n  A — THE HONEST SENTENCE GOES OUT, WHICH IS WHAT MAKES THE REFUSALS BELOW MEAN ANYTHING');
    say(HONEST);
    const good = ((await turn(ASK)) || {}).response || {};
    ok('MCB-A1 the composer wrote the reply — otherwise every assertion here is about the deterministic path',
      good.composer && good.composer.degraded === false);
    ok('MCB-A2 …and the figure the record actually holds for THIS topic reaches the reader',
      /2 separate sessions concern recovery/i.test(String(good.responseText || '')));
    ok('MCB-A3 …on the spoken channel too, so the two doors carry the same figure',
      /2 separate sessions concern recovery/i.test(String(good.speech || '')));

    console.log('\n  B — THE GATE\'S COUNTEREXAMPLE, WRITTEN BY THE MODEL, THROUGH THE REAL ROUTE');
    /* Both halves of this sentence are in the record. 3 is approved. "recovery between fixtures"
       is approved. Only the JOIN is false, and before L-MF2b existed this shipped. */
    say(CROSSED);
    const crossed = ((await turn(ASK)) || {}).response || {};
    ok('MCB-B1 a figure approved for ANOTHER claim, attached to this one, is refused and the turn degrades',
      crossed.composer && crossed.composer.degraded === true && crossed.composer.reason === 'unverified');
    ok('MCB-B2 …and the crossed sentence reaches NO channel, written or spoken',
      !/3 separate sessions concern recovery/i.test(String(crossed.responseText || '') + ' ' + String(crossed.speech || '')));
    ok('MCB-B3 …while the reader still gets an answer, because a refusal is not an outage',
      typeof crossed.responseText === 'string' && crossed.responseText.length > 0
      && typeof crossed.speech === 'string' && crossed.speech.length > 0);

    console.log('\n  C — AND IN THE OTHER DIRECTION, SO THIS IS A RULE RATHER THAN ONE HARD-CODED SENTENCE');
    say(SWAPPED);
    const swapped = ((await turn('What is the picture on attendance at training?')) || {}).response || {};
    ok('MCB-C1 the other topic\'s figure attached to attendance is refused the same way',
      swapped.composer && swapped.composer.degraded === true && swapped.composer.reason === 'unverified');
    ok('MCB-C2 …and nothing of it is shown',
      !/2 separate sessions concern attendance/i.test(String(swapped.responseText || '') + ' ' + String(swapped.speech || '')));

    console.log('\n  D — A FIGURE IN NO CLAIM AT ALL IS STILL REFUSED, BY THE OLDER LAW');
    say(INVENTED);
    const invented = ((await turn(ASK)) || {}).response || {};
    ok('MCB-D1 an invented figure degrades the turn, as it did before this law existed',
      invented.composer && invented.composer.degraded === true && invented.composer.reason === 'unverified');
    ok('MCB-D2 …and does not reach the reader',
      !/9 separate sessions/i.test(String(invented.responseText || '') + ' ' + String(invented.speech || '')));

    console.log('\n  E — THE HONEST PATH IS NOT COLLATERAL DAMAGE');
    /* The law refuses by COMPARISON, not by threshold, and these are the sentences that would be
       refused by a threshold. A rephrasing loses context against every claim equally, so it
       accuses nobody; a source count has no topic to be about; and one sentence may honestly
       carry both figures, each with its own. If any of these three degrade, the law is unusable
       and a caller will switch it off — which is the failure mode that matters more than a
       missed crossing, because a gate nobody runs catches nothing. */
    say('2 separate records mentioning recovery between fixtures are on file, and that is the working read rather than something settled.');
    const rephrased = ((await turn(ASK)) || {}).response || {};
    ok('MCB-E1 a REPHRASED honest figure still goes out',
      rephrased.composer && rephrased.composer.degraded === false
      && /2 separate records/i.test(String(rephrased.responseText || '')));

    say('2 separate sessions concern recovery between fixtures, and 3 separate sessions concern attendance at training.');
    const both = ((await turn(ASK)) || {}).response || {};
    ok('MCB-E2 ONE sentence carrying BOTH figures, each with its own claim, still goes out — the clause is the unit',
      both.composer && both.composer.degraded === false
      && /2 separate sessions concern recovery/i.test(String(both.responseText || ''))
      && /3 separate sessions concern attendance/i.test(String(both.responseText || '')));

    ok('MCB-E3 …and the spoken rendering of that reply still states what it rests on, with a count nobody crossed',
      /rests on \d+ sources?/i.test(String(both.speech || '')));

  } catch (e) { fail++; console.error('  FAIL manifest-claim-binding suite threw:', e && e.stack); }

  restore();
  server.close();
  console.log(`\nmanifest-claim-binding-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
