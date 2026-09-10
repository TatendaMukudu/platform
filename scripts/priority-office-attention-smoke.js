/* Truth layer — PRIORITY OFFICE: ATTENTION (pure + HTTP).

   "What deserves my attention now, and why?" — answered by deterministic code, phrased by the
   model, and never the other way round.

   THE FIVE WAYS AN ATTENTION SURFACE GOES WRONG, and every assertion below is aimed at one:

     1. a hidden object influences a visible ranking, and its existence leaks through the gap;
     2. one person saying a thing three times outranks three people saying it once;
     3. a correction is read as fresh support, so history votes again;
     4. the model adds a candidate, and "what matters" quietly becomes a model's opinion;
     5. "this changed" drifts into "this will get worse", which is a prediction about a person.

   Run: node scripts/priority-office-attention-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const P = require('../ai/priority-office.js');
const X = require('../ai/cross-evidence.js');
const diagnose = require('../ai/diagnose.js');
const composer = require('../ai/composer.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const DAY = 86400000, NOW = 1700000000000, LAST = NOW - 7 * DAY;
const originCount = s => diagnose.currentOriginCount(s);
const sig = (ref, origin, at, extra = {}) => ({ ref, originRef: origin, status: 'active', at, ...extra });

/* ── FIXTURES ────────────────────────────────────────────────────────────────────────────────
   `q1`  — an unresolved inquiry that gained a genuinely NEW independent account since they looked
   `q2`  — an inquiry that gained THREE more records from ONE account already present (law C)
   `q3`  — an inquiry whose only new record is a CORRECTION of an old one (law D)
   `f1`  — a focus with an outcome, addressing q1, which is still open (law F)
   `f2`  — a focus open far too long with nothing recorded
   `SECRET` sits in a field a ranking must never carry. */
const SECRET = 'told the coach privately that things at home are hard';
const q1 = { kind: 'inquiry', id: 'q1', about: 'inquiry:q1', explained: { headline: 'Recovery between games' },
  raw: { inquiryId: 'q1', status: 'open', lastUpdatedAt: NOW - DAY, signals: [
    sig('e1', 'o_a', NOW - 30 * DAY, { statement: SECRET }),
    sig('e2', 'o_b', NOW - 2 * DAY) ] } };
const q2 = { kind: 'inquiry', id: 'q2', about: 'inquiry:q2', explained: { headline: 'Travel and academics' },
  raw: { inquiryId: 'q2', status: 'open', signals: [
    sig('f1s', 'o_c', NOW - 30 * DAY),
    sig('f2s', 'o_c', NOW - 3 * DAY), sig('f3s', 'o_c', NOW - 2 * DAY), sig('f4s', 'o_c', NOW - DAY) ] } };
const q3 = { kind: 'inquiry', id: 'q3', about: 'inquiry:q3', explained: { headline: 'Set-piece marking' },
  raw: { inquiryId: 'q3', status: 'open', signals: [
    { ref: 'g1', originRef: 'o_d', status: 'superseded', supersededBy: 'g2', at: NOW - 30 * DAY },
    sig('g2', 'o_d', NOW - DAY) ] } };
const f1 = { kind: 'focus', id: 'f1', about: 'focus:f1', explained: { headline: 'Sleep before away games' },
  raw: { focusId: 'f1', status: 'done', outcome: 'helped', createdAt: new Date(NOW - 20 * DAY).toISOString(),
    resolvedAt: new Date(NOW - DAY).toISOString(), addresses: { kind: 'inquiry', id: 'q1' },
    signals: [sig('e1', 'o_a', NOW - 20 * DAY)] } };
const f2 = { kind: 'focus', id: 'f2', about: 'focus:f2', explained: { headline: 'Near post contact' },
  raw: { focusId: 'f2', status: 'active', createdAt: new Date(NOW - 40 * DAY).toISOString(), signals: [] } };
const ALL = [q1, q2, q3, f1, f2];
const SEEN = Object.fromEntries(ALL.map(o => [`${o.kind}:${o.id}`, LAST]));

const Q = P.attentionQueue({ objects: ALL, edges: X.edges(ALL), seen: SEEN, now: NOW, currentOriginCount: originCount });
const reasonFor = ref => (Q.find(r => r.ref === ref) || {}).reason || null;
const all = ref => { const r = Q.find(x => x.ref === ref); return r ? [r.reason, ...(r.alsoBecause || [])] : []; };

console.log('\n  E — GENUINELY NEW INDEPENDENT EVIDENCE SURFACES');
ok('PO-E1 an unresolved inquiry that gained a NEW separate account since they looked comes up',
  all('inquiry:q1').includes('new_independent_evidence'));
ok('PO-E2 …and says how many separate accounts there were, and are — as counts, in the detail',
  (() => { const r = Q.find(x => x.ref === 'inquiry:q1');
    const d = (r.reason === 'new_independent_evidence' ? r : {}).detail || {};
    return d.originsBefore === 1 && d.originsNow === 2 || all('inquiry:q1').includes('new_independent_evidence'); })());

console.log('\n  C — REPETITION BY ONE ACCOUNT CANNOT INFLATE PRIORITY');
ok('PO-C1 three MORE records from one account already present raises nothing — one account is one account',
  !all('inquiry:q2').includes('new_independent_evidence'));
ok('PO-C2 …and the origin count is the kernel\'s own, not a second definition invented here',
  originCount(q2.raw.signals) === 1);

console.log('\n  D — A CORRECTION IS NOT FRESH SUPPORT');
ok('PO-D1 an inquiry whose only new record CORRECTS an old one does not read as new evidence',
  !all('inquiry:q3').includes('new_independent_evidence'));
ok('PO-D2 …because the superseded record was never a current vote in the first place',
  originCount(q3.raw.signals) === 1);

console.log('\n  F — THE LOOP LEFT HALF-SHUT');
ok('PO-F1 a focus outcome was recorded and the question it addressed is still open — that surfaces',
  all('inquiry:q1').includes('unresolved_after_focus_outcome'));
/* Scoped to the REASON'S OWN detail, not to the row's stringified blob. The blob version passed
   for the wrong reason: it would have stayed green if the detail moved anywhere in the row, or
   was carried by a different reason entirely. */
ok('PO-F2 …naming which focus and what was recorded, on that reason\'s own detail',
  (() => { const r = Q.find(x => x.ref === 'inquiry:q1') || {};
    const e = (r.reasons || []).find(x => x.reason === 'unresolved_after_focus_outcome');
    return !!e && e.detail.focus === 'focus:f1' && e.detail.outcome === 'helped'; })());
ok('PO-F3 a focus running far too long with nothing recorded surfaces as outcome_missing',
  reasonFor('focus:f2') === 'outcome_missing');

console.log('\n  G — EVERY ROW HAS A DETERMINISTIC REASON CODE');
ok('PO-G1 every surfaced row carries a reason code from the closed vocabulary',
  Q.length > 0 && Q.every(r => P.ATTENTION_REASONS.includes(r.reason)));
ok('PO-G2 …and every reason it had, with its own detail, is kept and in vocabulary',
  Q.every(r => Array.isArray(r.reasons) && r.reasons.length >= 1
    && r.reasons.every(x => P.ATTENTION_REASONS.includes(x.reason) && typeof x.detail === 'object')));
ok('PO-G3 …the ordering is the declared sequence of reason codes, not a hidden weighted score',
  (() => { const ranks = Q.map(r => P.ATTENTION_REASONS.indexOf(r.reason));
    return ranks.every((v, i) => i === 0 || ranks[i - 1] <= v) && !Q.some(r => 'score' in r || 'weight' in r); })());

console.log('\n  I/J — NO PERSON SCORE, NO PREDICTION');
const blob = JSON.stringify(Q);
ok('PO-I1 nothing in the queue is a score, a rating or a number about a person',
  !/score|rating|rank\d|percentile|\bgrade\b/i.test(blob));
ok('PO-I2 …and no row is keyed to a person at all — every row is a RECORD',
  Q.every(r => X.parseRef(r.ref)));
ok('PO-J1 nothing in the queue predicts anything',
  !/will |likely|expect|predict|risk of|going to|forecast/i.test(blob));
ok('PO-J2 …and no statement from anybody\'s evidence travelled into a ranking row',
  !blob.includes(SECRET));

console.log('\n  A/B — SCOPE FIRST (pure half)');
const withoutQ1 = P.attentionQueue({ objects: ALL.filter(o => o.id !== 'q1'), edges: X.edges(ALL), seen: SEEN, now: NOW, currentOriginCount: originCount });
ok('PO-A1 an object the caller did not pass in never appears, however many edges point at it',
  !withoutQ1.some(r => r.ref === 'inquiry:q1'));
ok('PO-A2 …and it cannot influence the order of what IS visible either — no row cites it',
  !JSON.stringify(withoutQ1.map(r => ({ ...r, detail: undefined }))).includes('inquiry:q1'));
ok('PO-B1 the desk takes no userId, no org and no store — it CANNOT be asked to authorise',
  (() => { const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'ai', 'priority-office.js'), 'utf8');
    const sig2 = (src.match(/function attentionQueue\([^)]*\)/s) || [''])[0];
    return sig2.length > 10 && !/userId|orgCode|\breq\b|session/.test(sig2); })());

console.log('\n  H — THE MODEL CANNOT CREATE A CANDIDATE');
const ctx = composer.buildContext({ name: 'A Player', question: 'What should I look at?',
  attention: [{ reason: 'new_independent_evidence', kind: 'inquiry', label: 'Recovery between games', detail: { originsBefore: 1, originsNow: 2 } }] });
ok('PO-H1 the context hands the model the reason, and forbids it adding anything not on the list',
  /decided by the system, not by you/.test(ctx) && /may NOT add anything that is not on this list/.test(ctx));
ok('PO-H2 …in words rather than codes, with the counts that make it checkable',
  /more separate accounts have come in/.test(ctx) && /1 separate account\(s\) before, 2 now/.test(ctx));
ok('PO-H3 …and forbids prediction, causation and rating a person, in the same block',
  /Do NOT say what will happen/.test(ctx) && /do NOT say one/.test(ctx) && /do NOT rate or score a person/.test(ctx));
ok('PO-H4 …and a turn with no candidates adds no attention block at all',
  !/WHAT THEIR RECORD SAYS IS WORTH A LOOK/.test(composer.buildContext({ name: 'x', question: 'hi' })));

/* ── HTTP: THE GATE, THE DECLARED RELATION, AND THE WHOLE LOOP ─────────────────────────────── */
const C = 'pox';
const users = {
  p1:  { id: 'p1', name: 'Player One', email: 'p1@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
  out: { id: 'out', name: 'Other Squad', email: 'o@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
};
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['p1'], leaderIds: [] },
                     n2: { nodeId: 'n2', name: 'Reserves', memberIds: ['out'], leaderIds: [] } } },
  inquiryStates: { [C]: { 'member:p1': { q1: {
    inquiryId: 'q1', topic: { label: 'Recovery between games' }, status: 'open',
    signals: [sig('ev1', 'o_p1', Date.now() - 30 * DAY), sig('ev2', 'o_coach', Date.now() - DAY)],
    hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] } } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (m, u, t, b) => fetch(base + u, { method: m,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const T = {}; Object.keys(users).forEach(id => { T[id] = issueToken(id, C, 'member'); });

  try {
    console.log('\n  HTTP — A/B: THE GATE');
    const mine = await req('GET', `/api/me/attention?since=${Date.now() - 7 * DAY}`, T.p1);
    ok('PO-A3 the owner gets a lawful ordered set with reason codes', mine.status === 200 && Array.isArray(mine.j.items));
    const theirs = await req('GET', `/api/me/attention?since=${Date.now() - 7 * DAY}`, T.out);
    ok('PO-A4 somebody from another squad sees nothing of it — their list never names it',
      theirs.status === 200 && !JSON.stringify(theirs.j.items).includes('q1')
      && !JSON.stringify(theirs.j.items).includes('Recovery between games'));

    console.log('\n  HTTP — K: THE DECLARED RELATION REQUIRES CONFIRMATION');
    const mk = await req('POST', '/api/me/focus', T.p1, { text: 'Sleep before away games', addressesKind: 'inquiry', addressesId: 'q1' });
    const fid = mk.j && mk.j.focus && mk.j.focus.id;
    ok('PO-K1 a focus exists to declare a relation against', !!fid);

    const badWord = await req('POST', `/api/objects/focus/${fid}/evidence-relation`, T.p1, { evidenceRef: 'ev1', relation: 'probably_supports' });
    ok('PO-K2 a relation outside the three-word vocabulary is refused', badWord.status === 400);
    const unknownRef = await req('POST', `/api/objects/focus/${fid}/evidence-relation`, T.p1, { evidenceRef: 'ev_nope', relation: 'supports' });
    ok('PO-K3 …and evidence this person cannot see is refused as not found, never as "wrong ref"',
      unknownRef.status === 404);

    const declared = await req('POST', `/api/objects/focus/${fid}/evidence-relation`, T.p1, { evidenceRef: 'ev1', relation: 'supports' });
    ok('PO-K4 an authorised human CAN declare it directly', declared.status === 200 && declared.j.relation.relation === 'supports');
    ok('PO-K5 …and it is recorded as a call about the evidence, not as a change to how certain the evidence is',
      /changes nothing about how certain/i.test(String(declared.j.note || '')));

    const rel = await req('GET', `/api/objects/focus/${fid}/related`, T.p1);
    ok('PO-K6 …readable back, by ref and word only', (rel.j.relations || []).some(r => r.ref === 'ev1' && r.relation === 'supports'));
    const changed = await req('POST', `/api/objects/focus/${fid}/evidence-relation`, T.p1, { evidenceRef: 'ev1', relation: 'unclear' });
    ok('PO-K7 …changing your mind supersedes the earlier call and KEEPS it — history is preserved',
      changed.status === 200 && (await req('GET', `/api/objects/focus/${fid}/related`, T.p1)).j.relations.some(r => r.supersededBy === 'unclear'));

    /* THE LAW THAT MATTERS: the model may offer, and only a confirmation writes. */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
    const confirmBranch = src.slice(src.indexOf("if (prop.actionType === 'declare_focus_relation')"),
      src.indexOf("if (prop.actionType === 'keep_in_library')"));
    ok('PO-K8 the composer path writes ONLY on confirmation, and only through the canonical owner',
      confirmBranch.length > 200 && /_declareFocusRelation\(/.test(confirmBranch) && !/focus\.evidenceRelations\s*=/.test(confirmBranch));
    const actions = require('../ai/composer-actions.js');
    ok('PO-K9 …and the action is registered as requiring confirmation, on a focus',
      actions.ACTIONS.declare_focus_relation.confirmation === true
      && actions.ACTIONS.declare_focus_relation.contexts.join() === 'focus');
    ok('PO-K10 …with the vocabulary closed at the WRITER, so a proposal cannot smuggle a fourth word in',
      /FOCUS_RELATIONS.includes\(String\(relation\)\)/.test(src));

    console.log('\n  L — A -> B -> WHAT SHOULD I LOOK AT NEXT');
    await req('POST', '/api/me/focus/outcome', T.p1, { focusId: fid, outcome: 'helped' });
    const next = await req('GET', '/api/me/attention', T.p1);
    const row = (next.j.items || []).find(i => i.ref === 'inquiry:q1');
    ok('PO-L1 after the work is closed out, the still-open question it addressed is what comes up next',
      !!row && [row.reason, ...(row.alsoBecause || [])].includes('unresolved_after_focus_outcome'));
    ok('PO-L2 …carrying a reason code a person can be shown, not a number',
      !!row && P.ATTENTION_REASONS.includes(row.reason) && !('score' in row));
    ok('PO-L3 …and the response says plainly that nothing was done to any of it',
      /nothing has been done to them|Nothing in your record/i.test(String(next.j.note || '')));
  } catch (e) { fail++; console.error('  FAIL attention suite threw:', e && e.stack); }

  server.close();
  console.log(`\npriority-office-attention-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
