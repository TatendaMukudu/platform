/* Truth layer — THE A → B BUNDLE ACTUALLY REACHES THE MODEL.

   `_crossEvidenceContext` returned **null on every call** for the whole of round 3 and was
   reported PASS. It began `const a = _turnAbout(about)` and then read `a.kind`; `_turnAbout`
   returns `{headline, body}` and has never returned a kind. Nothing failed, because a reader that
   returns null is indistinguishable from "this object is connected to nothing" — which is the
   ordinary case for most objects, so the feature looked like it was working on every screen where
   it had nothing to say.

   The fix was one line. THE REASON IT SURVIVED A ROUND IS THAT NOTHING DROVE IT, and a fix with
   no test that bites is a fix waiting to be undone. So this file asks the only question that
   matters: does the connection bundle arrive in the text a model is actually handed?

   HOW IT IS DRIVEN. `ai.complete` is replaced with a capture — the real turn runs, the real
   context is built, and the prompt the gateway would have sent is read back. Nothing here asserts
   against source. Every claim is about a string the model was given.

   WHAT MUST NOT BE IN IT is half the file. A connection bundle is a list of things this person's
   records point at, and the failure that costs is not an empty bundle — it is a bundle carrying
   somebody else's object, another tenant's, or a verbatim sentence out of a private record.

   Run: node scripts/cross-evidence-context-http-smoke.js */

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

const C = 'cev', X = 'oth';
const NOW = Date.UTC(2026, 2, 10, 9, 0, 0), DAY = 86400000;

/* THE PRIVATE SENTENCE. It is on a signal of the inquiry the focus addresses, so it is genuinely
   reachable from the object under test — an absence is only worth asserting when the thing could
   have been there. */
const PRIVATE_WORDS = 'I was dreading the Thursday session all week';
const SIG = (ref, at, text) => ({ kind: 'observation', status: 'active', source: 'me',
  originRef: `o_${ref}`, at, turnId: `t_${ref}`, directness: 'direct', authority: 'self_report',
  specificity: 0.7, ref, text });

const INQ = (id, subjectRef, label, signals) => ({
  inquiryId: id, subjectRef, topic: { canonicalConcept: `general.${id}`, label },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: `A working read about ${label}`,
    confidence: { score: 0.6, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals,
  confidence: { score: 0.6, band: 'probable', because: ['2 independent origins'] },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' }, [X]: { orgName: 'Elsewhere', orgMode: 'sports' } },
  orgUsers: {
    [C]: {
      me:    { id: 'me',    name: 'Ash Mbeki',  email: 'm@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
      other: { id: 'other', name: 'Sam Other',  email: 's@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    },
    [X]: { far: { id: 'far', name: 'Far Away', email: 'f@x.io', role: 'member', orgCode: X, status: 'active', assignedNodeIds: ['t1'] } },
  },
  orgNodes: {
    [C]: { n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['me', 'other'], leaderIds: [] } },
    [X]: { t1: { nodeId: 't1', name: 'Theirs', parentId: null, childNodeIds: [], memberIds: ['far'], leaderIds: [] } },
  },
  inquiryStates: {
    [C]: {
      'member:me': {
        // THE THING THE FOCUS ADDRESSES. Two signals before the outcome, one AFTER it — the one
        // that makes `observedSince` a real count rather than a zero that proves nothing.
        recovery: INQ('recovery', 'member:me', 'Recovery between fixtures', [
          SIG('ev_r1', NOW - 20 * DAY, PRIVATE_WORDS),
          SIG('ev_r2', NOW - 18 * DAY, 'legs felt heavy on the Saturday'),
          SIG('ev_r3', NOW - 2 * DAY,  'came through the week better'),
        ]),
        // AN UNRELATED INQUIRY OF MY OWN. Connected to nothing, so it must not appear when the
        // turn is about the focus — an absence that is not about permission at all, which is the
        // one a "show everything authorised" bug would sail through.
        kit: INQ('kit', 'member:me', 'Kit and boots', [SIG('ev_k1', NOW - 9 * DAY, 'new boots rub')]),
      },
      // SOMEBODY ELSE'S, in the same org and the same node. Authorised to exist, never mine to be told.
      'member:other': { theirs: INQ('theirs', 'member:other', 'Their sleep', [SIG('ev_o1', NOW - 5 * DAY, 'up late again')]) },
    },
    [X]: { 'member:far': { alien: INQ('alien', 'member:far', 'Another tenant entirely', [SIG('ev_x1', NOW - 5 * DAY, 'nothing to do with us')]) } },
  },
  userAiProfiles: {
    [`${C}:me`]: { focuses: [{
      id: 'foc_deload', text: 'A lighter middle day between fixtures',
      // THE EDGE UNDER TEST: focus.addresses is the field ai/cross-evidence.js reads.
      addresses: { kind: 'inquiry', id: 'recovery' },
      status: 'closed', createdAt: new Date(NOW - 15 * DAY).toISOString(),
      resolvedAt: new Date(NOW - 5 * DAY).toISOString(),
      outcome: { result: 'helped', at: new Date(NOW - 5 * DAY).toISOString() },
    }] },
    // Another person's focus on the same node, for the same reason as their inquiry.
    [`${C}:other`]: { focuses: [{ id: 'foc_theirs', text: 'Their own thing', status: 'active',
      createdAt: new Date(NOW - 10 * DAY).toISOString() }] },
  },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete, completeJSON: ai.completeJSON };
let handed = '';
Object.assign(ai, {
  enabled: () => true,
  budgetAvailable: () => true,
  // The capture. Returning '' degrades the turn to the deterministic path, which is fine: what is
  // under test is the CONTEXT that was built, not the reply that came back.
  complete: async (o) => { handed = String((o && o.user) || ''); return ''; },
  completeJSON: async () => null,
});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { me: issueToken('me', C, 'member'), other: issueToken('other', C, 'member'), far: issueToken('far', X, 'member') };
  const turn = (who, text, about) => fetch(base + '/api/assistant/turn', {
    method: 'POST', headers: { Authorization: `Bearer ${tok[who]}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, about }),
  }).then(r => r.json()).catch(() => null);

  try {
    console.log('\n  A — THE BUNDLE ARRIVES, AND IT NAMES THE RIGHT RELATIONSHIP');
    handed = '';
    await turn('me', 'Did that lighter middle day actually make any difference?', { kind: 'focus', id: 'foc_deload' });
    ok('CE-A0 the composer ran at all — every assertion below is about the text it was handed',
      handed.length > 100);
    ok('CE-A1 the connection block is in the prompt the model was given',
      /HOW THIS CONNECTS TO THEIR OTHER RECORDS/.test(handed));
    ok('CE-A2 …and it names the relationship CORRECTLY — this focus was started to work on that inquiry',
      /this was started to work on an? inquiry: Recovery between fixtures/i.test(handed));
    /* CE-A3 FOUND A SECOND DEFECT UNDER THE FIRST ONE. `focus.outcome` is a RECORD --
       { result, note, by, at } -- and cross-evidence read `raw.outcome || null` and clipped it to
       twenty characters, so the model was handed "the person recorded the outcome of this focus
       as: [object Object]". Nothing failed: the field was there, the sentence was well formed,
       and the only thing wrong with it was that it said nothing. The negative half is the half
       that bites. */
    ok('CE-A3 …and reports the outcome the PERSON recorded, from the canonical field',
      /the person recorded the outcome of this focus as: helped/i.test(handed));
    ok('CE-A3b …as the RESULT rather than a stringified record, which is what it was',
      !/\[object Object\]/.test(handed));
    ok('CE-A4 …and what has been observed SINCE, as a count',
      /1 record\(s\) have arrived on that thing SINCE the outcome/i.test(handed));
    ok('CE-A5 …with the causal refusal stated in the same block as the data, not left to a prompt to remember',
      /is NOT evidence the focus caused it, and you must not say it was/i.test(handed));
    ok('CE-A6 …and the repetition rule too, because a list of connections is the shape that invites "three things point at this"',
      /a connection does NOT make/i.test(handed) && /two records resting on one account are still one account/i.test(handed));

    console.log('\n  B — AND IT CARRIES NOTHING IT SHOULD NOT');
    ok('CE-B1 NOT A WORD OF THE PRIVATE RECORD travels in the connection bundle — labels and refs only',
      !new RegExp(PRIVATE_WORDS, 'i').test(handed.slice(handed.indexOf('HOW THIS CONNECTS'))));
    ok('CE-B2 no UNRELATED object of my own is listed, which is the absence a "show everything authorised" bug would fail',
      !/Kit and boots/i.test(handed.slice(handed.indexOf('HOW THIS CONNECTS'))));
    ok('CE-B3 no OTHER PERSON\'S object is listed, though they are on my node and it plainly exists',
      !/Their sleep/i.test(handed) && !/Their own thing/i.test(handed));
    ok('CE-B4 nothing from another tenant is listed',
      !/Another tenant entirely/i.test(handed));
    ok('CE-B5 …and no other person is NAMED anywhere in the turn context',
      !/Sam Other/i.test(handed) && !/Far Away/i.test(handed));

    console.log('\n  C — A DIFFERENT OBJECT GETS A DIFFERENT ANSWER, AND AN UNCONNECTED ONE GETS NONE');
    handed = '';
    await turn('me', 'What do you make of this one?', { kind: 'inquiry', id: 'kit' });
    ok('CE-C1 an object connected to NOTHING carries no connection block at all — the bundle is not decorative',
      handed.length > 100 && !/HOW THIS CONNECTS TO THEIR OTHER RECORDS/.test(handed));
    handed = '';
    await turn('me', 'And what about this?', { kind: 'inquiry', id: 'recovery' });
    ok('CE-C2 the OTHER END of the same edge reports the other direction — the inquiry is being worked on by the focus',
      /is being worked on by a focus: A lighter middle day/i.test(handed));
    ok('CE-C2b …and does NOT claim the loop, because a loop belongs to the focus that ran it',
      !/the person recorded the outcome of this focus/i.test(handed));

    console.log('\n  D — AND SOMEBODY ELSE ASKING ABOUT MY OBJECT GETS NOTHING AT ALL');
    handed = '';
    await turn('other', 'Tell me about that focus', { kind: 'focus', id: 'foc_deload' });
    ok('CE-D1 another member binding to an object that is not theirs is handed no connection bundle for it',
      !/A lighter middle day/i.test(handed) && !/Recovery between fixtures/i.test(handed));
    handed = '';
    await turn('far', 'Tell me about that focus', { kind: 'focus', id: 'foc_deload' });
    ok('CE-D2 …and another tenant is handed nothing either, which fails closed at the object rather than at the edge',
      !/A lighter middle day/i.test(handed) && !/Recovery between fixtures/i.test(handed));
    /* WHICH GATE IS ACTUALLY DOING THE WORK, recorded because mutation M83 found out. Removing
       the `if (!self) return null` early return changed nothing either of the two assertions
       above could see — because the protection is not that check. Every edge is derived over
       `_allObjectsFor(code, userId)`, the reader's OWN authorised set, so another person's object
       has no edges to be found in their neighbourhood at all. The early return is a cheap exit,
       not the gate, and a reader of this file should know which is which. M84 mutates the
       authorised set to somebody else's and CE-D1 goes red. */
    ok('CE-D3 the edges are derived over the READER\'s authorised objects, which is the gate the early return is often mistaken for',
      () => {
        const SRC = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
        const fn = SRC.slice(SRC.indexOf('function _crossEvidenceContext('), SRC.indexOf('function _forumContext('));
        return /_objectsWithEvidenceFor\(code, userId\)/.test(fn) && /crossEvidence\.neighbourhood\(authorised/.test(fn);
      });
    /* AND THE SET IT DERIVES OVER IS THE AUTHORISED SET, UNCHANGED — asserted rather than read.
       `_objectsWithEvidenceFor` joins each group projection back to the evidence its own record
       holds, because a group Focus's "what has arrived since" was structurally zero without it.
       A join is exactly the shape that quietly widens a set, and this one must not: same objects,
       same refs, same order, every time. If it ever adds one, it has become a second authoriser
       and CE-D4 is the thing that says so. */
    ok('CE-D4 joining the evidence back on adds NOT ONE OBJECT to what the reader was cleared to see',
      () => {
        const plain = S._allObjectsFor(C, 'me').map(o => `${o.kind}:${o.id}`);
        const joined = S._objectsWithEvidenceFor(C, 'me').map(o => `${o.kind}:${o.id}`);
        return plain.length > 0 && joined.length === plain.length
          && joined.every((r, i) => r === plain[i]);
      });
    ok('CE-D4b …and the same holds for a reader whose authorised set is a different one',
      () => {
        const a = S._allObjectsFor(C, 'other').map(o => `${o.kind}:${o.id}`);
        const b = S._objectsWithEvidenceFor(C, 'other').map(o => `${o.kind}:${o.id}`);
        return b.length === a.length && b.every((r, i) => r === a[i])
          && !b.some(r => S._allObjectsFor(C, 'me').map(o => `${o.kind}:${o.id}`).includes(r) && r.startsWith('focus:foc_deload'));
      });

    /* ── E — THE READER IS REACHED THROUGH THE REF, WHICH IS THE BUG THAT WAS THERE ──────────
       The defect was not the bundle's contents; it was that the reader was handed the prompt's
       headline/body shape and asked for a kind. One assertion that the ref actually resolves, so
       a future refactor that reintroduces the conflation is caught by something that reads the
       product rather than the source. */
    console.log('\n  E — RESOLVED FROM THE BOUND REF, WHICH IS WHERE IT BROKE');
    handed = '';
    await turn('me', 'no object bound at all here, just a general question about my week', null);
    ok('CE-E1 a turn bound to NO object carries no connection block — there is no object to connect from',
      handed.length > 50 && !/HOW THIS CONNECTS TO THEIR OTHER RECORDS/.test(handed));
    handed = '';
    await turn('me', 'What about this one?', { kind: 'focus', id: 'no_such_focus' });
    ok('CE-E2 …and a bound ref naming an object that does not exist carries none either, rather than falling back to everything',
      !/HOW THIS CONNECTS TO THEIR OTHER RECORDS/.test(handed));

  } catch (e) { fail++; console.error('  FAIL cross-evidence-context suite threw:', e && e.stack); }

  Object.assign(ai, REAL);
  server.close();
  console.log(`\ncross-evidence-context-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
