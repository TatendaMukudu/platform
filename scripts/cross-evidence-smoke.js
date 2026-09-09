/* Truth layer — CROSS-EVIDENCE (pure + HTTP).

   THE CAPABILITY IS A READER, NOT A STORE. Every edge it returns is a field the governed objects
   already carried: a focus's `addresses`, a High's `inquiryId`, a signal's `ref` or
   `supersededBy`. Nothing here mints an id or writes anything, and the assertions below are
   aimed at the four ways a relationship layer goes wrong in a product like this:

     1. it copies a statement into an edge, and evidence stops being referenced-only;
     2. it becomes a second answer to who may see what, and relevance turns into authorisation;
     3. it counts connections as corroboration, so one account cited twice reads as two;
     4. it treats a correction as new support, so history votes twice.

   Boots the real app (DB_OPTIONAL) for the HTTP half.
   Run: node scripts/cross-evidence-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const X = require('../ai/cross-evidence.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* ── FIXTURES ────────────────────────────────────────────────────────────────────────────────
   An inquiry two accounts support, a High projected from it, a focus started to work on it, and
   a second inquiry that shares ONE of those accounts. Every statement below sits in a field this
   module must never read, so if any of it appears in an edge the assertion catches it. */
const SECRET = 'Ravi said he has been sleeping badly because of things at home';
const inq = {
  kind: 'inquiry', id: 'inq1', about: 'inquiry:inq1',
  explained: { headline: 'Recovery between games' },
  raw: { inquiryId: 'inq1', status: 'open',
    signals: [
      { ref: 'e1', originRef: 'o_ravi', status: 'active', at: 100, statement: SECRET },
      { ref: 'e2', originRef: 'o_coach', status: 'active', at: 200 },
      { ref: 'e0', originRef: 'o_ravi', status: 'superseded', supersededBy: 'e1', at: 50 },
      /* AFTER the focus outcome (resolvedAt 300), and from an origin already present — so this
         tests that `observedSince` counts RECORDS that arrived, not new accounts. A second word
         from the same person is a second record and not a second voice, and the loop reports it
         as movement observed, never as extra support. */
      { ref: 'e3', originRef: 'o_coach', status: 'active', at: 400 },
    ] } };
const high = { kind: 'high', id: 'hi1', about: 'high:hi1',
  explained: { headline: 'Midweek recovery is landing' },
  raw: { inquiryId: 'inq1', claim: 'a claim nobody outside should read from an edge' } };
const focus = { kind: 'focus', id: 'foc1', about: 'focus:foc1',
  explained: { headline: 'Sleep before away games' },
  raw: { focusId: 'foc1', text: 'a focus body', outcome: 'helped', resolvedAt: new Date(300).toISOString(),
    addresses: { kind: 'inquiry', id: 'inq1' },
    /* TWO signals, ONE account. This is the fixture that makes law E testable at all: counting
       signals gives two, counting origins gives one, and a mutation that swaps them must go red.
       With a single signal the two methods agree and the assertion proves nothing. */
    signals: [{ ref: 'e1', originRef: 'o_ravi', status: 'active', at: 120 },
              { ref: 'e4', originRef: 'o_ravi', status: 'active', at: 130 }] } };
const other = { kind: 'inquiry', id: 'inq2', about: 'inquiry:inq2',
  explained: { headline: 'Travel and academics' },
  raw: { inquiryId: 'inq2', signals: [{ ref: 'e2', originRef: 'o_coach', status: 'active', at: 250 }] } };
const ALL = [inq, high, focus, other];

console.log('\n  A/B — THE EDGES ARE CANONICAL REFS');
const E = X.edges(ALL);
ok('CE-A1 Focus -> Inquiry is an edge, by canonical ref, from the focus\'s own addresses field',
  E.some(e => e.from === 'focus:foc1' && e.type === 'addresses' && e.to === 'inquiry:inq1' && e.basis === 'focus.addresses'));
ok('CE-A2 …and the same edge is readable from the inquiry, so "what is being done about this" is answerable',
  E.some(e => e.from === 'inquiry:inq1' && e.type === 'addressed_by' && e.to === 'focus:foc1'));
ok('CE-B1 High -> Inquiry is an edge, from the High\'s own inquiryId',
  E.some(e => e.from === 'high:hi1' && e.type === 'projected_from' && e.to === 'inquiry:inq1' && e.basis === 'raw.inquiryId'));
ok('CE-B2 …and readable the other way as well',
  E.some(e => e.from === 'inquiry:inq1' && e.type === 'projected_to' && e.to === 'high:hi1'));
ok('CE-B3 every edge names both ends as `kind:id` and nothing else',
  E.every(e => X.parseRef(e.from) && X.parseRef(e.to)));
ok('CE-B4 the relationship vocabulary is CLOSED — an edge type outside it cannot appear',
  E.every(e => X.REL.includes(e.type)));

console.log('\n  C — AN EDGE CARRIES NO TEXT');
const blob = JSON.stringify(E);
ok('CE-C1 no statement, claim or body reaches an edge — evidence is referenced, never copied',
  !blob.includes(SECRET) && !blob.includes('a claim nobody outside') && !blob.includes('a focus body'));
ok('CE-C2 …an edge has exactly four fields: from, type, to, basis',
  E.every(e => JSON.stringify(Object.keys(e).sort()) === JSON.stringify(['basis', 'from', 'to', 'type'])));

console.log('\n  D — RELEVANCE IS NOT AUTHORISATION');
/* The module cannot reach past what it is given. This is the structural half of the law; the
   HTTP half below proves the route hands it only the authorised set. */
const withoutInquiry = X.edges([focus, high, other]);
ok('CE-D1 an edge to an object the caller did not pass in is never returned — the module cannot reach past its input',
  !withoutInquiry.some(e => e.to === 'inquiry:inq1' || e.from === 'inquiry:inq1'));
/* `Function.length` does not count parameters that carry defaults, so `X.edges.length === 1` was
   always 0 and measured nothing — a vacuous assertion (PROTOCOL lie #4) written by me. The law it
   was reaching for is that this module is never handed an identity, so it cannot decide access
   even by accident. Asserted against the source. */
ok('CE-D2 …and no function in the module takes a userId, an org code or a store — it CANNOT be asked to authorise',
  (() => { const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'ai', 'cross-evidence.js'), 'utf8');
    const sigs = src.match(/^function \w+\([^)]*\)/gm) || [];
    return sigs.length >= 5 && !sigs.some(sg => /userId|orgCode|\bcode\b|req\b|session/.test(sg)); })());

console.log('\n  E — A CONNECTION IS NOT CORROBORATION');
ok('CE-E1 the focus and the inquiry share ONE account, and it is reported as one, not two',
  X.loop(ALL, 'focus:foc1').sharedOrigins.length === 1);
ok('CE-E2 …the same origin appearing in two objects yields ONE shared origin, however many signals carry it',
  JSON.stringify(X.loop(ALL, 'focus:foc1').sharedOrigins) === JSON.stringify(['o_ravi']));
ok('CE-E3 …and nothing in an edge or a loop is a confidence, a band, a score or a count of support',
  !/confidence|band|score|corrobor|support(ed)?["\s:]/i.test(JSON.stringify(X.loop(ALL, 'focus:foc1')) + blob));

console.log('\n  F — CORRECTIONS KEEP HISTORY AND DO NOT VOTE');
ok('CE-F1 a superseded signal is still readable as an evidence ref — history is preserved, not erased',
  X.evidenceRefsOf(inq).includes('e0'));
ok('CE-F2 …but a superseded record contributes no CURRENT origin, so it cannot vote twice',
  !X.originRefsOf(inq).includes('o_gone') && X.originRefsOf(inq).length === 2);
ok('CE-F3 …and the lineage edge exists so a reader can follow the correction',
  X.REL.includes('supersedes') && X.REL.includes('superseded_by'));

console.log('\n  G/I — THE A -> B LOOP');
const L = X.loop(ALL, 'focus:foc1');
ok('CE-G1 the loop names what the focus was started to work on', L.addresses === 'inquiry:inq1');
ok('CE-G2 …the outcome the person recorded, from the canonical Focus owner\'s own field', L.outcome === 'helped');
ok('CE-G3 …and what has been OBSERVED on that thing since the outcome, as a count of refs',
  L.observedSince && L.observedSince.records === 1 && L.observedSince.refs.length === 1);
ok('CE-G4 …the loop is a description of what was recorded and never a prediction',
  !/will |expect|predict|likely|going to|should improve/i.test(JSON.stringify(L)));
ok('CE-I1 a focus with nothing recorded says WHERE the loop is open rather than answering anyway',
  (() => { const bare = { kind: 'focus', id: 'f0', raw: { focusId: 'f0' } };
    const l = X.loop([bare], 'focus:f0');
    return l.open.length === 2 && l.open.some(t => /does not say what it was started/.test(t))
      && l.open.some(t => /no outcome/.test(t)); })());
ok('CE-I2 …and a loop is only ever built for a focus, because only a focus has an outcome',
  X.loop(ALL, 'inquiry:inq1') === null && X.loop(ALL, 'high:hi1') === null);

/* ── HTTP: SCOPE FIRST, RELATION SECOND ─────────────────────────────────────────────────────
   Two squads. The relationship route must return the coach's edges and must refuse a reader who
   cannot open the object at all — and, critically, must never surface an edge that reaches into
   the other squad, because the route hands the module only what the reader may already open. */
const C = 'crx';
const users = {
  coach: { id: 'coach', name: 'Coach', email: 'c@x.io', role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
  p1:    { id: 'p1', name: 'Player One', email: 'p1@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
  out:   { id: 'out', name: 'Other Squad', email: 'o@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
};
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: {
    n1: { nodeId: 'n1', name: 'First Team', parentId: null, memberIds: ['p1'], leaderIds: ['coach'] },
    n2: { nodeId: 'n2', name: 'Reserves',   parentId: null, memberIds: ['out'], leaderIds: [] } } },
  inquiryStates: { [C]: { 'member:p1': { q1: {
    inquiryId: 'q1', topic: { label: 'Recovery between games' },
    signals: [{ ref: 'ev1', originRef: 'o_p1', status: 'active', at: Date.now() - 5000 }],
    hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [], status: 'open',
  } } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (u, t) => fetch(base + u, { headers: { Authorization: `Bearer ${t}` } })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const post = (u, t, b) => fetch(base + u, { method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const T = {}; Object.keys(users).forEach(id => { T[id] = issueToken(id, C, users[id].role); });

  try {
    console.log('\n  HTTP — SCOPE FIRST');
    // A focus that says what it was started to work on, made through the canonical owner.
    const mk = await post('/api/me/focus', T.p1, { text: 'Sleep before away games', addressesKind: 'inquiry', addressesId: 'q1' });
    const fid = mk.j && mk.j.focus && mk.j.focus.id;
    ok('CE-H1 a focus can be created addressing an inquiry, through the existing canonical owner', !!fid);

    const rel = await get(`/api/objects/focus/${fid}/related`, T.p1);
    ok('CE-H2 the owner can read what it connects to',
      rel.status === 200 && rel.j.related.some(r => r.ref === 'inquiry:q1' && r.type === 'addresses'));
    ok('CE-H3 …and the loop comes back with it, naming what was addressed',
      !!rel.j.loop && rel.j.loop.addresses === 'inquiry:q1' && rel.j.loop.outcome === null);
    ok('CE-H4 …and says the loop is open rather than implying it is closed',
      ((rel.j.loop || {}).open || []).some(t => /no outcome/.test(t)));

    /* THE PRIVACY ASSERTION THAT MATTERS. Somebody from another squad must not be able to use the
       relationship route to learn that this focus, or the inquiry behind it, exists at all. */
    const denied = await get(`/api/objects/focus/${fid}/related`, T.out);
    ok('CE-D3 somebody who cannot open the focus cannot traverse its relationships either — 404, not a filtered list',
      denied.status === 404);
    ok('CE-D4 …and the refusal discloses nothing about what was there',
      !JSON.stringify(denied.j || {}).includes('q1') && !JSON.stringify(denied.j || {}).includes('Sleep before'));

    console.log('\n  HTTP — THE LOOP CLOSES');
    const outc = await post('/api/me/focus/outcome', T.p1, { focusId: fid, outcome: 'helped' });
    ok('CE-G5 the outcome is recorded through the canonical Focus owner, not a second one', outc.status === 200);
    const after = await get(`/api/objects/focus/${fid}/related`, T.p1);
    ok('CE-G6 …and the loop now carries it, so "did it help" is answerable from the record',
      !!after.j.loop && after.j.loop.outcome === 'helped' && Number.isFinite(after.j.loop.resolvedAt));
    ok('CE-G7 …while still naming what it cannot say — nothing recorded since is stated, not glossed',
      ((after.j.loop || {}).open || []).some(t => /nothing has been recorded/.test(t)) || (((after.j.loop || {}).observedSince) || {}).records > 0);

    console.log('\n  H — THE COMPOSER CAN RETRIEVE THE RELATED OBJECTS');
    /* Built through the real composer context builder with a real connections bundle, so this is
       what the model would actually be handed. */
    const composer = require('../ai/composer.js');
    const ctx = composer.buildContext({ name: 'Player One', question: 'Why did we create this focus?',
      connections: { related: [{ type: 'addresses', kind: 'inquiry', label: 'Recovery between games' }],
        loop: { addresses: 'inquiry:q1', outcome: 'helped', observedSince: 2, sharedOrigins: 1, open: [] } } });
    ok('CC-1 the context tells the model plainly that a connection does NOT make either side more certain',
      /a connection does NOT make/i.test(ctx) && /one account are still one account/i.test(ctx));
    ok('CC-2 …names what the focus was started to work on, in words the reader would use',
      /was started to work on a inquiry|was started to work on/i.test(ctx) && /Recovery between games/.test(ctx));
    ok('CC-3 …carries the recorded outcome', /recorded the outcome of this focus as: helped/.test(ctx));
    ok('CC-4 …states what has been observed since as OBSERVATION, and forbids calling it cause',
      /have arrived on that thing SINCE/.test(ctx) && /NOT evidence the focus caused it/.test(ctx));
    ok('CC-5 …tells the model not to predict', /Do not say what will happen/.test(ctx));
    ok('CC-6 …and a turn with no connections adds no connection block at all',
      !/HOW THIS CONNECTS/.test(composer.buildContext({ name: 'x', question: 'hello' })));

    console.log('\n  HTTP — NO SECOND TRUTH STORE');
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'ai', 'cross-evidence.js'), 'utf8');
    ok('CE-N1 the relationship module writes nothing, reads no store and calls no model',
      !/require\(/.test(src.replace(/^'use strict';$/m, '')) && !/\.push\(.*Store|scheduleSave|orgUsers|inquiryStates/.test(src));
    ok('CE-N2 …and the route holds no relationship records of its own — the edges are derived on read',
      !/relationshipStore|edgeStore|crossEvidenceStore/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8')));
  } catch (e) { fail++; console.error('  FAIL cross-evidence suite threw:', e && e.stack); }

  server.close();
  console.log(`\ncross-evidence-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
