/* Truth layer — "3 SOURCES" MEANS THREE THINGS YOU CAN LOOK AT, AND IT SAYS WHICH KIND EACH IS.

   LIVE iPHONE PROVENANCE AUDIT (findings R1 #41). The founder met source counts under answers —
   "1 source", "3 sources" — and a line reading `No outside reading here — no concept to search
   on…`, and asked for the whole thing traced: what `sources` means on each surface, internal
   record against user-provided material against external knowledge, counts that open to something
   inspectable, and no implication of outside reading where none happened.

   TWO THINGS WERE WRONG AND ONE WAS INVISIBLE.

   MATERIAL WAS CITED BY NOTHING. `_composeTurn` resolved the attached document inline at the
   `buildContext` call, handed it to the model, and built the source list from evidence, beliefs
   and assigned work only. So an answer drawn from a deck somebody had just uploaded came back
   saying "2 sources" and listed two things from the record — the one thing the reader most
   obviously wanted to check was the one thing missing. It is a THIRD KIND, not a record and not
   the web: user-provided, here, read, and none of that makes it an observation anybody recorded.

   AND THE REFUSAL SPOKE IN THIS CODEBASE'S OWN VOCABULARY. "No concept to search on" is precise
   and means nothing to a coach; "concept" is the internal word for a canonical topic key.

   WHAT IS ASSERTED:

     every source carries a kind, and the client has a word for every kind   (A)
     the count IS the list, so a number always opens onto something          (B)
     a document somebody attached is cited, as its own kind                  (C)
     external knowledge is visibly separate and never local proof            (D)
     and nothing implies outside reading that did not happen                 (E)

   Run: node scripts/source-provenance-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;
const ai = require('../ai/gateway.js');
const websearch = require('../ai/websearch.js');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'src', NOW = Date.now(), DAY = 86400000;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@src.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
  userAiProfiles: { [`${C}:coach`]: { focuses: [{
    id: 'foc_s', text: 'Concede fewer late goals', status: 'active',
    visibility: 'only_me', createdAt: new Date(NOW - 2 * DAY).toISOString(),
  }] } },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable,
  complete: ai.complete, completeJSON: ai.completeJSON, canUnderstand: ai.canUnderstand };
/* A MODEL THAT SAYS SOMETHING PLAIN. The sources are assembled from what the server RETRIEVED,
   never from what the model wrote, so a fixed reply is the right seam: it holds the answer
   constant while the source list is what is being measured. It mentions no figure and no name, so
   nothing here can be refused by the grounding cage instead of by the rule under test. */
Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true, canUnderstand: () => false,
  complete: async () => 'Here is what I have on that, in plain terms, without adding anything.',
  completeJSON: async () => null,
});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const call = (m, u, b) => fetch(base + u, { method: m, headers: H,
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const ask = async (text, about) => {
    const r = await call('POST', '/api/assistant/turn', { text, ...(about ? { about } : {}) });
    const resp = (r.j || {}).response || {};
    return { said: String(resp.responseText || ''), sources: resp.sources || [], speech: String(resp.speech || '') };
  };

  const KINDS = ['record', 'belief', 'work', 'material', 'web'];

  try {
    console.log('\n  A — EVERY SOURCE SAYS WHICH KIND OF THING IT IS');
    /* THE DOCUMENT IS ATTACHED FIRST, because it is the thing that was not being cited and every
       section below reads the same answer. Note what is NOT used as the fixture: a sentence
       somebody typed into the conversation. Human speech is not evidence in this product, so a
       turn about it correctly cites nothing — asserting sources over one would have been asserting
       that the law is broken. */
    const up = await call('POST', '/api/materials', {
      title: 'Opposition shape — set pieces', filename: 'shape.txt',
      text: 'Section one. They push both full backs high on attacking corners.\n\n'
        + 'Section two. Their keeper does not come for anything outside the six yard box.',
      attachTo: { kind: 'focus', id: 'foc_s' },
    });
    ok('SP-A0 a document can be attached to the focus', up.status === 200 || up.status === 201);
    const plain = await ask('What does that document say about their corners?', { kind: 'focus', id: 'foc_s' });
    ok('SP-A1 an answer that rests on something cites it', plain.sources.length >= 1);
    ok('SP-A2 …and every source names a kind from the closed vocabulary',
      plain.sources.every(s => KINDS.includes(String(s.kind))));
    ok('SP-A3 …and every one is inspectable: a label, and something to read under it',
      plain.sources.every(s => String(s.label || '').trim().length > 0));
    /* THE CLIENT HAS A WORD FOR EVERY KIND. A kind the renderer does not know falls through to
       the honest "Source", which is not wrong — but a kind the SERVER emits and the client has no
       word for means a person is shown "Source" for something the product could have named. */
    const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const wordMap = (ui.match(/const word = \{[^}]*\}/) || [''])[0];
    ok('SP-A4 the client has a word for every kind the server emits: ' + wordMap.slice(0, 120),
      KINDS.every(k => new RegExp(`\\b${k}:`).test(wordMap)));

    console.log('\n  B — AND THE COUNT IS THE LIST');
    /* A NUMBER THAT DOES NOT OPEN ONTO ANYTHING is the defect the founder described: "1 source"
       with no way to see what it was. The spoken rendering states the same count, so the two
       channels are asserted together — a listener told "this rests on three sources" and a reader
       shown two is the same lie in a quieter register. */
    ok('SP-B1 the spoken rendering states the number of sources the list actually holds',
      !plain.sources.length
      || new RegExp(`rests on ${plain.sources.length} source`).test(plain.speech));
    ok('SP-B2 …and says they are shown under the reply, which is where they are',
      !plain.sources.length || /shown under the reply/.test(plain.speech));

    console.log('\n  C — A DOCUMENT SOMEBODY ATTACHED IS CITED, AS ITS OWN KIND');
    /* THE DEFECT. Material was handed to the model and cited by nothing, so the deck a person had
       just uploaded was the one thing missing from the list under the answer about it. */
    /* THE DEFECT WAS TWO DEEP, and the second one had hidden the first. `_composeTurn` resolved
       the attached document from `about` — which is `_turnAbout(opts.about)`, the `{ headline,
       body }` prose the prompt reads — and `_materialContext` asks `_aboutRef` for a `kind:id`.
       A headline is not one, so the lookup returned null EVERY TIME: a document attached to a
       Focus was never handed to the composer while talking on that Focus's thread. Only material
       attached to the conversation itself ever arrived, through a fallback, which is why nothing
       looked broken. And even when it arrived it was cited by nothing. */
    const mat = plain.sources.find(s => s.kind === 'material');
    ok('SP-C2 …and the answer about it cites it', !!mat);
    ok('SP-C3 …by name, so a reader can tell which document it was',
      !!mat && /Opposition shape/.test(String(mat.label)));
    ok('SP-C4 …saying it is theirs rather than something the record holds',
      !!mat && /you attached this/i.test(String(mat.detail)));
    /* AND WHICH KIND OF THING IT IS, in the governed classification's own terms. "Something to
       read from" says nothing about anybody here; the other two classes are deliberate, confirmed
       claims about people. A reader deciding whether to trust a sentence is deciding exactly
       that, and this fixture is the first kind. */
    ok('SP-C4b …and that it is something to read from, not an account of anybody here',
      !!mat && /says nothing about anybody here/i.test(String(mat.detail)));
    /* AND WHETHER THE WHOLE THING WAS READ. An answer drawn from three slides of twenty is not an
       answer about the deck, and the reader is entitled to know which it is. */
    ok('SP-C5 …and whether it was read in full or only in part',
      !!mat && /(read in full|part of it was read)/i.test(String(mat.detail)));
    /* IT IS NOT A RECORD AND IT IS NOT THE WEB. The three are different claims about where an
       answer came from, and collapsing any two is the thing this whole audit is about. */
    ok('SP-C6 …and it is neither filed as the record nor as outside reading',
      !!mat && mat.kind === 'material' && !mat.url);

    console.log('\n  D — EXTERNAL KNOWLEDGE IS VISIBLY SEPARATE, AND NEVER LOCAL PROOF');
    /* THE WEB KIND IS THE ONLY ONE THAT CARRIES A URL, and that is what makes it checkable. The
       source list refuses to carry one for anything else — a record with a link beside it would
       read as though somebody could go and verify what a player said. */
    const shaped = S._sourceList([
      { kind: 'record', label: 'Something you told me', detail: 'We faded late', url: 'https://example.com/x' },
      { kind: 'material', label: 'A deck', detail: 'You attached this.', url: 'https://example.com/y' },
      { kind: 'web', label: 'A study of late goals', detail: 'Outside reading', url: 'https://example.com/z' },
      { kind: 'web', label: 'Not a real address', detail: 'Outside reading', url: 'javascript:alert(1)' },
    ]);
    ok('SP-D1 only outside reading carries a link',
      shaped.filter(s => s.url).every(s => s.kind === 'web'));
    ok('SP-D2 …and it is a real web address, not whatever was handed in',
      (shaped.find(s => s.label === 'A study of late goals') || {}).url === 'https://example.com/z'
      && !(shaped.find(s => s.label === 'Not a real address') || {}).url);
    /* AND THE CLIENT ONLY OFFERS TO OPEN ONE FOR THE WEB KIND. */
    ok('SP-D3 …and the reader is offered a link only on an outside source',
      /s\.kind === 'web' && \/\^https\?:\\\/\\\//.test(ui));

    console.log('\n  E — AND NOTHING IMPLIES OUTSIDE READING THAT DID NOT HAPPEN');
    ok('SP-E1 an answer with no outside reading cites no web source and offers no link',
      plain.sources.every(s => s.kind !== 'web' && !s.url));
    ok('SP-E2 …and says nothing about having read anything outside',
      !/i read|i looked up|according to|research (?:shows|suggests)/i.test(plain.said));
    /* AND WHEN THERE IS NOTHING TO SEARCH ON, IT SAYS SO IN ENGLISH. Findings R1 #41 named this
       line specifically: "No outside reading here — no concept to search on…". The fact is right
       and worth saying; "concept" is this codebase's word for a canonical topic key, and on a
       screen it is a fragment of an API. */
    const noQuery = websearch.deriveQuery({ canonicalConcept: '', domain: 'sports' });
    ok('SP-E3 an object with nothing general in it refuses outside reading', noQuery.ok === false);
    ok('SP-E4 …and says why in words a coach reads, not in the words this code uses',
      !/\bconcept\b|\bcanonical\b|\bquery\b|\bkey\b/i.test(String(noQuery.reason))
      && String(noQuery.reason).length > 20);
    ok('SP-E5 …and still says what is true: this one is accounts, not a subject to look up',
      /first-hand accounts/i.test(String(noQuery.reason))
      && /look up|read about|general topic/i.test(String(noQuery.reason)));
    /* AND A QUERY IS STILL NEVER BUILT FROM SOMEBODY'S SENTENCE — L-WS1, unchanged by the
       rewording above, and the reason the refusal exists at all. */
    ok('SP-E6 …and a search is still built from a topic, never from what somebody wrote',
      (() => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'ai', 'websearch.js'), 'utf8');
        const fn = src.slice(src.indexOf('function deriveQuery('), src.indexOf('function ', src.indexOf('function deriveQuery(') + 10));
        return !/\btext\b|\bstatement\b|\bquestion\b/.test(fn);
      })());


    console.log('\n  F — AND THE SAME DISCLOSURE WITH THE MODEL SWITCHED OFF');
    /* THE MODEL-ONLY-LAYER RULE, which this repository keeps rediscovering. Citing the document
       on the composed path alone would have put the fix in front of exactly the readers who are
       NOT the pilot: with models off — the pilot's own configuration — every answer comes through
       the deterministic branch, which built its own source list and omitted material too. A person
       who attaches a deck and asks about it is owed the same disclosure whichever engine wrote the
       sentence. */
    Object.assign(ai, { enabled: () => false, budgetAvailable: () => false });
    const det = await ask('And what about their keeper?', { kind: 'focus', id: 'foc_s' });
    Object.assign(ai, { enabled: () => true, budgetAvailable: () => true });
    const detMat = det.sources.find(s => s.kind === 'material');
    ok('SP-F1 with no model at all, the answer still cites the document it was given', !!detMat);
    ok('SP-F2 …by the same name, with the same two things said about it',
      !!detMat && /Opposition shape/.test(String(detMat.label))
      && /you attached this/i.test(String(detMat.detail))
      && /(read in full|part of it was read)/i.test(String(detMat.detail)));
    ok('SP-F3 …and the spoken rendering counts it, so both channels agree off the model path too',
      !det.sources.length
      || new RegExp(`rests on ${det.sources.length} source`).test(det.speech));

  } catch (e) { fail++; console.error('  FAIL source-provenance suite threw:', e && e.stack); }

  Object.assign(ai, REAL);
  server.close();
  console.log(`\nsource-provenance-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
