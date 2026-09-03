/* Truth layer — CITED ADVICE FROM OUTSIDE, AND A QUERY NOBODY WROTE.

   Founder: "Yes wire web source answers as well. That helps with suggestions because it's not
   the AI making it up. It's cited info and the user can use and or not use the advice."

   That sentence is the specification, and it contains both hard parts.

   "NOT THE AI MAKING IT UP" — an answer with no source is exactly the thing this replaces, so
   an uncited answer is REFUSED rather than captioned with a disclaimer. A plausible paragraph
   is indistinguishable from a sourced one to somebody reading at speed, and that person is
   deciding what to do about their own body or their own team on the strength of it.

   "USE AND OR NOT USE THE ADVICE" — it arrives as reading with its sources attached. It is not
   a finding, it never becomes evidence, and the kernel is never told. Same boundary the forum
   keeps.

   AND THE PART THAT WAS NOT ASKED FOR, because it is the law everywhere else here: A QUERY IS
   COMPOSED, NEVER COPIED. Searching means handing a string to somebody else's infrastructure.
   If that string COULD be built from what a person typed, then one day a sentence about
   somebody's knee leaves this system inside a search query. So ai/websearch.js has no parameter
   for raw text. Not a filter, not a redactor — no way in. That is the difference between "we
   strip names out" and "a name cannot get here", and only the second survives a feature nobody
   is watching six months from now.

   These assertions run with NO KEY and NO NETWORK, which is the point: everything worth pinning
   is in the composing and the reading-back, and both are pure.

   Run: node scripts/web-sources-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const web = require('../ai/websearch.js');
const diagnose = require('../ai/diagnose.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates } = S;
const ai = require('../ai/gateway.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* ── 1. THE QUERY IS BUILT, AND THERE IS NOWHERE TO PUT A SENTENCE. ── */
const built = web.deriveQuery({ canonicalConcept: 'soccer.hamstring_tightness', domain: 'sports' });
ok('WS1 a query is composed out of the topic and the domain — vocabulary this system owns, which nobody typed',
  built.ok && /sports/.test(built.query) && /soccer/.test(built.query) && /hamstring/.test(built.query));

// THE STRUCTURAL ASSERTION, and the reason this feature is safe rather than carefully handled:
// there is no parameter through which a person's words could arrive. A caller holding a
// sentence has nowhere to put it. Asserted on the function's own shape, because a filter can be
// bypassed by the next caller and an absent parameter cannot.
const leak = web.deriveQuery({
  canonicalConcept: 'soccer.hamstring_tightness', domain: 'sports',
  text: 'my left hamstring has been tight since the Tuesday session and I did not tell the coach',
  statement: 'Tyler Mukudu says his hamstring hurts', question: 'what should I do about my hamstring',
});
ok('WS2 RAW TEXT IS NOT AN INPUT — passing somebody\'s sentence, name and question changes the query not at all, because there is no parameter that reads them',
  leak.query === built.query);
// Only words that appear NOWHERE in the topic are checked. The first version looked for
// "tight", which the concept `soccer.hamstring_tightness` legitimately contains — an assertion
// that would have failed on correct code and told me nothing about a leak.
ok('WS2b …and no word unique to that sentence reaches the query in any form',
  !/tuesday|coach|mukudu|hurts|session|left/i.test(leak.query));

ok('WS3 a topic with no concept produces NO query rather than falling back to whatever text is lying around',
  web.deriveQuery({ canonicalConcept: '', domain: 'sports' }).ok === false);
ok('WS3b …and anything that is not a plain vocabulary word is dropped rather than escaped and sent',
  !/[<>"'@]/.test(web.deriveQuery({ canonicalConcept: 'a.<script>@x."b"', domain: 'sports' }).query || ''));
ok('WS4 the query is bounded — an unexpectedly long concept stops rather than being truncated and hoped over',
  (web.deriveQuery({ canonicalConcept: Array.from({ length: 40 }, (_, i) => 'term' + i).join('.'), domain: 'x' }).query || '').length <= web.MAX_QUERY);

/* WS5 is pinned HERE, on the function, and that is deliberate. The route calls isComposed once
   more immediately before egress, and that second call cannot be exercised by this suite: with
   no key configured, canSearchWeb() is false and the route returns before reaching it. So the
   re-check is defence in depth that CI can never turn red — mutation-tested and confirmed
   silent. It stays, because the day a key exists it is the last thing between a query of
   unknown provenance and somebody else's search index, but the assertion that actually holds
   the line is this one. */
ok('WS5 isComposed is an ASSERTION, not a filter: it recognises the query it would have built and rejects every other',
  web.isComposed(built.query, { canonicalConcept: 'soccer.hamstring_tightness', domain: 'sports' }) === true &&
  web.isComposed('hamstring pain in a 19 year old called Tyler', { canonicalConcept: 'soccer.hamstring_tightness', domain: 'sports' }) === false);

/* ── 2. READING THE ANSWER BACK. The two shapes that are easy to confuse. ── */
const good = [
  { type: 'web_search_tool_result', content: [
    { type: 'web_search_result', title: 'Hamstring load management', url: 'https://example.org/a', page_age: '2025-03-01' },
    { type: 'web_search_result', title: 'Return to running', url: 'https://example.org/b' },
    { type: 'web_search_result', title: 'Duplicate', url: 'https://example.org/a' },
  ] },
  { type: 'text', text: 'Gradual load increases are generally preferred to complete rest.' },
];
const answer = web.answerFrom(good);
ok('WS6 a sourced answer comes back with its citations, deduplicated by url',
  answer.ok && answer.citations.length === 2 && /Gradual load/.test(answer.text));
ok('WS6b …and it is labelled as advice and says it changes nothing here',
  answer.kind === 'advice' && /yours to ignore/i.test(answer.note) && /changes nothing/i.test(answer.note));

/* THE GATE. On failure the tool returns content as an OBJECT, not a list. Indexing it would
   turn a failed search into one citation made of an error code — which would then satisfy the
   "has a source" test and let an uncited answer through on the back of it. */
const failed = [
  { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
  { type: 'text', text: 'Gradual load increases are generally preferred to complete rest.' },
];
ok('WS7 A FAILED SEARCH IS NOT A SOURCE — the error shape is an object, and mistaking it for a one-item list is how an invented answer would arrive wearing a citation',
  web.answerFrom(failed).ok === false && web.citationsFrom(failed).citations.length === 0);
ok('WS7b …and the refusal says the search did not come back, rather than showing the paragraph anyway',
  /did not come back/i.test(web.answerFrom(failed).reason));

ok('WS8 NO ANSWER WITHOUT A SOURCE — a confident paragraph with nothing behind it is refused, which is the whole proposition',
  web.answerFrom([{ type: 'text', text: 'You should rest for two weeks.' }]).ok === false);
ok('WS8b …and sources with nothing written about them are refused too',
  web.answerFrom([good[0]]).ok === false);

/* ── 3. THE ROUTE. Deterministic-only means nothing leaves, and it says so. ── */
const C = 'wsr';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: { u: { id: 'u', name: 'A Player', email: 'u@x.io', role: 'member', orgCode: C, status: 'active' } } },
});
_rebuildEmailIndex();
let inq = diagnose.newInquiry({ id: 'inq_w', subjectRef: 'member:u', concept: 'soccer.hamstring_tightness',
  label: 'Hamstring tightness', domain: 'sports' });
inq = diagnose.applyProposals(inq, [0, 1, 2].map(k => ({
  id: 'p' + k, level: 'observation', directness: 'direct', authority: 'self_report', source: 'self',
  specificity: 0.7, statement: 'my hamstring is tight after Tuesday sessions',
  originKind: 'self_report', originRef: 'o' + k, turnId: 't' + k,
})), { now: Date.now(), evidenceRefOf: p => p.originRef });
inq.hypotheses = [diagnose.newHypothesis({ id: 'h', statement: 'load is spiking on Tuesdays' })];
inq.leadingHypothesisId = 'h';
inquiryStates[C] = { 'member:u': { h: inq } };

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('u', C, 'member')}` };
  const get = u => fetch(base + u, { headers: H }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    ai.setDeterministicOnly(true);
    const off = await get('/api/objects/inquiry/inq_w/reading?scope=self');
    ok('WS9 in a deployment that sends nothing outside, the route sends nothing outside and says which it is',
      off.status === 200 && off.j.ok === false && off.j.available === false &&
      /does not send anything outside/i.test(off.j.reason || ''));
    ok('WS9b …and tells the person plainly that everything on the screen came from inside',
      /came from inside/i.test(off.j.note || ''));
    // The gateway's own backstop, independent of the route's check.
    let threw = false;
    try { await ai.searchWeb({ query: 'anything' }); } catch (e) { threw = /deterministic-only/i.test(e.message); }
    ok('WS9c …and the gateway refuses too, so a caller that forgot to ask cannot get egress by accident', threw);
    ai.setDeterministicOnly(false);

    const nokey = await get('/api/objects/inquiry/inq_w/reading?scope=self');
    ok('WS10 with no key configured it degrades to saying so, rather than to an error or an empty frame',
      nokey.status === 200 && nokey.j.ok === false && nokey.j.available === false);
    ok('WS10b …and the query it WOULD have sent is shown, so what leaves is inspectable rather than trusted',
      /soccer/.test(nokey.j.query || '') && /hamstring/.test(nokey.j.query || ''));
    ok('WS10c …and that query contains none of the words the person actually wrote',
      !/tuesday|tight after|my /i.test(nokey.j.query || ''));

    /* WS11: L-WS3. Whatever happens out there, nothing about the person changes in here. */
    const before = JSON.stringify(inquiryStates[C]);
    await get('/api/objects/inquiry/inq_w/reading?scope=self');
    ok('WS11 READING IS NOT EVIDENCE — asking the outside world about a topic moves nothing the system believes about the person',
      JSON.stringify(inquiryStates[C]) === before);

    /* WS12: the call site. */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('WS12 the thread actually asks for the reading, rather than defining a renderer nothing calls',
      /this\._renderReading\(kind, objectId\)/.test(src) && /\/reading\?scope=self/.test(src));
    ok('WS12b …and every source is a link the person can go and check for themselves',
      /href="\$\{esc\(c\.url\)\}"/.test(src) && /rel="noopener noreferrer"/.test(src));
    ok('WS12c …and the surface tells them what was searched for and that it was not their words',
      /Searched for/.test(src) && /not from anything you wrote/.test(src));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nweb-sources-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
