/* Truth layer — A FRAGMENT IS NOT AN ANSWER.

   LIVE iPHONE BLOCKER (findings R1 #34). A screenshot after "Can you give me suggestions on how to
   win and concede less?" showed an assistant card rendered as a visibly incomplete sentence —
   "There's nothing rec..." — with the source control sitting beside it as though the answer were
   finished.

   THE MECHANISM, and it was not a mystery once it was looked for. `_composeTurn` asks the provider
   for at most 320 tokens, which is a deliberate ceiling behind the prompt's own word budget. When a
   reply runs into it the provider stops mid-word and reports `stop_reason: max_tokens` — and the
   gateway read the words and DROPPED the reason. `ai/gateway.js` already knew this happens: the
   JSON path's own diagnostic says "unparseable usually means maxTokens cut the object off
   mid-write". Prose had no equivalent, and prose is what a person reads.

   WHAT IS ASSERTED, in the order it matters:

     the gateway carries the fact at all                             (A)
     a fragment never reaches the person as a finished sentence      (B)
     what the model DID finish is kept, and the loss is said out loud (B, C)
     and a reply with nothing complete in it degrades honestly        (D)

   WHY NOT SIMPLY DEGRADE EVERY TRUNCATED REPLY. What the model managed to say was governed like
   anything else and is not suspect; it is INCOMPLETE, which is a different problem with a
   different honest answer. Throwing away four good sentences because the fifth was cut would
   replace a visible defect with a silent one — the person would get the deterministic fallback
   with no sign that anything had been lost.

   Run: node scripts/truncated-turn-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;
const ai = require('../ai/gateway.js');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'trn', NOW = Date.now(), DAY = 86400000;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@t.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
  userAiProfiles: { [`${C}:coach`]: { focuses: [{
    id: 'foc_t', text: 'Concede fewer late goals', status: 'active',
    visibility: 'only_me', createdAt: new Date(NOW - 2 * DAY).toISOString(),
  }] } },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable,
  complete: ai.complete, completeJSON: ai.completeJSON, canUnderstand: ai.canUnderstand };

/* THE ONE SEAM, and it is the gateway's own marker rather than a shape invented here. `_reply`
   returns a String object carrying `__iqTruncated` when the provider reported `max_tokens`; this
   builds exactly that, so what the composer receives is what a real cut-off reply looks like. */
const truncatedReply = (text) => {
  const s = new String(text);   // eslint-disable-line no-new-wrappers
  Object.defineProperty(s, '__iqTruncated', { value: true, enumerable: false });
  return s;
};

/* TWO COMPLETE SENTENCES AND A THIRD CUT MID-WORD — the exact shape a token ceiling produces, and
   deliberately not a single fragment, because the interesting case is the one where something
   worth keeping survives. Nothing in it names a person or states a figure, so a refusal here would
   be about truncation rather than about the grounding cage. */
const CUT = 'Nothing has been recorded about how this focus has gone yet. '
  + 'That means there is no result on the record to weigh, and nothing in it points either way. '
  + 'The next thing worth doing would be to writ';

const plant = (reply) => Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true,
  complete: async () => reply,
  completeJSON: async () => null,
  canUnderstand: () => false,
});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const ask = (text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H,
    body: JSON.stringify({ text, about: { kind: 'focus', id: 'foc_t' } }) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    console.log('\n  A — THE GATEWAY CARRIES THE FACT AT ALL');
    /* THE FIRST LINK, AND THE ONE THAT WAS MISSING. Everything below is unreachable if a cut-off
       reply is indistinguishable from a finished one by the time it leaves the gateway. */
    ok('TT-A1 the gateway exports a way to ask whether a reply was cut off',
      typeof ai.isTruncated === 'function');
    ok('TT-A2 …it says yes for a reply the provider stopped at the ceiling',
      ai.isTruncated(truncatedReply('half a sen')) === true);
    ok('TT-A3 …and no for an ordinary complete one, so it is not simply always true',
      ai.isTruncated('A finished sentence.') === false);
    /* AND THE MARKED REPLY IS STILL A STRING TO EVERY CALLER THAT DOES NOT ASK. This is the whole
       reason the fact rides on the value rather than changing the return shape: dozens of call
       sites treat it as text, and a repair that needed all of them edited at once to fix one of
       them is how a fix becomes the next outage. */
    const marked = truncatedReply('Some words.');
    ok('TT-A4 …while a caller that does not ask still gets something that behaves as a string',
      String(marked) === 'Some words.' && marked.length === 11
      && `${marked}`.trim() === 'Some words.' && (marked + '!') === 'Some words.!');

    console.log('\n  B — A CUT-OFF REPLY NEVER ARRIVES AS A FINISHED SENTENCE');
    plant(truncatedReply(CUT));
    const cut = await ask('Can you give me suggestions on how to win and concede less?');
    const said = String(((cut.j || {}).response || {}).responseText || '');
    ok('TT-B1 the turn is still answered rather than erroring', cut.status === 200 && said.length > 0);
    /* THE LIVE DEFECT ITSELF: the fragment, on the screen, presented as the answer. */
    ok('TT-B2 …and the half-written word the provider stopped on is not in it',
      !/to writ\b/.test(said) && !/\bwrit$/.test(said.trim()));
    ok('TT-B3 …and what it does say ends on a finished sentence',
      /[.?!]$/.test(said.trim()));
    /* AND WHAT THE MODEL DID FINISH IS KEPT. Degrading the whole turn would replace a visible
       defect with a silent one — the deterministic fallback, with no sign anything was lost. */
    ok('TT-B4 …while the sentences it did finish are still there',
      /Nothing has been recorded about how this focus has gone yet/.test(said)
      && /no result on the record to weigh/.test(said));

    console.log('\n  C — AND THE LOSS IS SAID OUT LOUD, IN BOTH CHANNELS');
    /* TWO READERS, TWO PROMISES. The sentence reaches the person's eyes; the limitation reaches
       the manifest, the spoken rendering and anything that reads the turn programmatically.
       Asserted separately, because an earlier round of this work found a machine-readable
       limitation standing in for words a human never saw. */
    ok('TT-C1 the person is told in the prose that the answer stopped early',
      /ran out of room/i.test(said));
    ok('TT-C2 …and the machine-readable limitations say it too',
      (((cut.j || {}).response || {}).limitations || [])
        .some(l => /ran out of room before it finished/i.test(String(l))));
    /* AND IT IS NOT DRESSED UP AS A COMPLETE ANSWER ELSEWHERE. A turn that says "cut short" in the
       prose and reports itself as an ordinary composed reply everywhere else is half a fix. */
    ok('TT-C3 …and nothing claims the answer is complete',
      !/in summary|to sum up|that is everything/i.test(said));

    console.log('\n  D — AND A REPLY WITH NOTHING COMPLETE IN IT DEGRADES HONESTLY');
    /* THE OTHER END OF THE SAME RULE. Cut before the first full stop, there is no finished
       sentence to keep, and inventing one would be worse than saying the normal reply is not
       available. */
    plant(truncatedReply('The first thing worth looking at here is whether the shape of the'));
    const none = await ask('And what about the last ten minutes?');
    const noneSaid = String(((none.j || {}).response || {}).responseText || '');
    ok('TT-D1 the turn is still answered', none.status === 200 && noneSaid.length > 0);
    ok('TT-D2 …and the fragment does not appear anywhere in it',
      !/whether the shape of the/.test(noneSaid));
    ok('TT-D3 …and it is reported as a degraded turn, naming the interruption rather than "empty"',
      (((none.j || {}).response || {}).composer || {}).degraded === true
      && (((none.j || {}).response || {}).composer || {}).reason === 'cut_short');

    console.log('\n  E — AND AN UNINTERRUPTED REPLY IS UNTOUCHED');
    /* THE CONTROL. Every assertion above is satisfied for free by a build that degrades every
       composed turn, which would be a far worse product than the one the founder photographed. */
    plant('Nothing has been recorded about how this focus has gone yet. Tell me what happened and I will hold it.');
    const fine = await ask('Anything on this one?');
    const fineSaid = String(((fine.j || {}).response || {}).responseText || '');
    ok('TT-E1 a complete reply is delivered as written', /Tell me what happened and I will hold it/.test(fineSaid));
    ok('TT-E2 …with no cut-short sentence bolted onto it', !/ran out of room/i.test(fineSaid));
    ok('TT-E3 …and no cut-short limitation',
      !(((fine.j || {}).response || {}).limitations || [])
        .some(l => /ran out of room/i.test(String(l))));
    ok('TT-E4 …and it is not reported as degraded at all',
      (((fine.j || {}).response || {}).composer || {}).degraded === false);

  } catch (e) { fail++; console.error('  FAIL truncated-turn suite threw:', e && e.stack); }

  Object.assign(ai, REAL);
  server.close();
  console.log(`\ntruncated-turn-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
