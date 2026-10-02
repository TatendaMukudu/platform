/* Truth layer — THE ASSISTANT AND THE HIGHS/LOWS PAGES READ ONE OWNER.

   LIVE iPHONE BLOCKERS (findings R1 #16 and #6). Two answers about one record, with the person
   looking at both:

     the assistant said there was now enough to count as something worth attention;
     the Lows page said nothing needed attention.

   And separately:

     the assistant said "I can't add collaborators or change who sees this focus" and "the
     available actions do not include inviting collaborators to a focus";
     the Focus screen in front of the founder was showing "Who can see this" with three audience
     choices, and the room afterwards read "9 can read this".

   BOTH ARE THE SAME SHAPE. The model reasoned from what it had been handed to a claim about the
   product, and what it had been handed was an ABSENCE. Nothing about canonical standing was in its
   context at all — `_attentionContext` returns null when nothing qualifies and the block is then
   omitted — so a space existed where a fact belonged, and a model furnishes spaces. Every other
   block in `buildContext` states its empty case out loud.

   WHAT THIS FILE ASSERTS, in the order it matters:

     the deterministic path never claims a standing the projection does not hold  (A, B)
     the context always carries the canonical standing, including when it is empty  (C)
     and it carries the words for what is below the line, and the capability that exists  (D)

   THE PROMPT IS NOT THE IMPLEMENTATION and section D says so. A law living only in a prompt reaches
   nobody with models off, which is the pilot's own configuration — so the deterministic half is
   asserted first, against real routes, and the prompt is asserted to agree with it.

   Run: node scripts/standing-agreement-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'std', NOW = Date.now(), DAY = 86400000;

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@s.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
    p1: { id: 'p1', name: 'Player One', email: 'p1@s.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach', 'p1'], leaderIds: ['coach'] } } },
  /* DELIBERATELY BELOW THE LINE. One person, one telling — the state the founder was in when the
     assistant said it now counted as something worth attention. A fixture that already had a Low
     would prove the easy half and miss the failure entirely. */
  userAiProfiles: { [`${C}:coach`]: { focuses: [{
    id: 'foc_s', text: 'Concede fewer late goals', status: 'active',
    visibility: 'only_me', createdAt: new Date(NOW - 2 * DAY).toISOString(),
  }] } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    console.log('\n  A — THE PAGES THEMSELVES SAY NOTHING HAS CROSSED');
    const lows = await call('GET', '/api/objects?kind=low&scope=all');
    const highs = await call('GET', '/api/objects?kind=high&scope=all');
    ok('SA-A1 the Lows page holds nothing', lows.status === 200 && !((lows.j || {}).objects || []).length);
    ok('SA-A2 the Highs page holds nothing', highs.status === 200 && !((highs.j || {}).objects || []).length);

    console.log('\n  B — AND THE ASSISTANT DOES NOT SAY OTHERWISE');
    /* THE LIVE SENTENCE AND ITS FAMILY. Asked the question that produced it, the answer must not
       assert a standing the page in the next tab does not have. */
    const asked = await call('POST', '/api/assistant/turn',
      { text: 'A few of the lads have mentioned we fade late. Is that something worth attention now?' });
    const said = String(((asked.j || {}).response || {}).responseText || '');
    ok('SA-B1 the turn is answered', asked.status === 200 && said.length > 0);
    ok('SA-B2 …and it does not announce a Low, or that this now counts as something worth attention',
      !/now counts as|counts as something worth attention|has become a low|this is a low\b/i.test(said));
    ok('SA-B3 …and claims no High either',
      !/has become a high|this is a high\b/i.test(said));
    /* AND NOTHING APPEARED BEHIND IT. An answer that talks a standing into existence is the other
       half of the same failure. */
    const lowsAfter = await call('GET', '/api/objects?kind=low&scope=all');
    ok('SA-B4 …and asking about it created no standing',
      !((lowsAfter.j || {}).objects || []).length);

    console.log('\n  C — THE MODEL IS HANDED THE PAGE\'S OWN ANSWER, INCLUDING WHEN IT IS EMPTY');
    /* THE ROOT CAUSE. `_attentionContext` returns null when nothing qualifies and the composer
       omitted the block, so nothing about standing reached the model at all — and an absence is
       not a fact a model reads, it is a space it furnishes. */
    const ctx = S._standingContext ? S._standingContext(C, 'coach') : null;
    ok('SA-C1 a standing context exists and is readable from the same authorised set', !!ctx);
    ok('SA-C2 …and with nothing crossed it reports empty rather than nothing at all',
      !!ctx && Array.isArray(ctx.highs) && Array.isArray(ctx.lows)
      && ctx.highs.length === 0 && ctx.lows.length === 0);
    const composer = require('../ai/composer.js');
    const built = composer.buildContext({ name: 'Dana', role: 'coach', question: 'anything?',
      standing: ctx });
    ok('SA-C3 …and the built context states the empty case in words, not by omission',
      /LOWS THAT HAVE ACTUALLY CROSSED: none\. Their Lows page says nothing needs attention\./.test(built)
      && /HIGHS THAT HAVE ACTUALLY CROSSED: none\. Their Highs page is empty\./.test(built));
    /* AND WHEN SOMETHING HAS CROSSED, IT SAYS THAT INSTEAD — otherwise the block would be a
       permanent "none" that a model learns to ignore. */
    const built2 = composer.buildContext({ name: 'Dana', role: 'coach', question: 'anything?',
      standing: { highs: [], lows: ['Late goals in the last twenty'] } });
    ok('SA-C4 …and names what has crossed when something has',
      /LOWS THAT HAVE ACTUALLY CROSSED \(this is what their Lows page shows\)/.test(built2)
      && /Late goals in the last twenty/.test(built2));

    console.log('\n  D — AND THE PROMPT AGREES WITH THE CODE RATHER THAN CONTRADICTING IT');
    /* NOT THE IMPLEMENTATION, AND SAID SO. The deterministic half is asserted above, against real
       routes; this asserts the model is not being told something different. */
    ok('SA-D1 the model is told the kernel decides standing, not it',
      /The kernel decides standing, not you/i.test(built));
    ok('SA-D2 …and is given the words for what is below the line',
      /worth investigating/i.test(built) && /still a hypothesis/i.test(built));
    /* FINDINGS R1 #6 — the other half of the same shape. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'ai', 'composer.js'), 'utf8');
    ok('SA-D3 …and is told that changing who can see an object is a capability this product has',
      /CHANGING WHO CAN SEE A HIGH, LOW, INQUIRY OR FOCUS IS A REAL CAPABILITY THIS PRODUCT HAS/.test(src));
    ok('SA-D4 …and must point at the control rather than deny it',
      /Never tell/i.test(src) && /collaborators cannot be added/i.test(src)
      && /Who can see this/.test(src));

  } catch (e) { fail++; console.error('  FAIL standing-agreement suite threw:', e && e.stack); }

  server.close();
  console.log(`\nstanding-agreement-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
