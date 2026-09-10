/* Truth layer — PRIORITY SURFACING (pure + HTTP + real DOM).

   The Priority Office answered "what deserves attention, and why" for a whole pass without any
   person being able to see it. This suite guards the DOOR, and a door has more ways to be fake
   than a function does:

     1. the route is fetched and the answer is dropped, so the fetch proves nothing;
     2. the browser re-sorts what arrived, so "the server owns priority" is a comment, not a law;
     3. a reason code reaches the screen as `new_independent_evidence`;
     4. a candidate the reader may not open is rendered because the client trusted the list;
     5. the whole thing quietly becomes a second dashboard on the first screen;
     6. the object opens as a COPY of itself rather than the canonical object.

   Run: node scripts/priority-surface-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs   = require('fs');
const path = require('path');
const P    = require('../ai/priority-office.js');
const X    = require('../ai/cross-evidence.js');
const diagnose = require('../ai/diagnose.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };
const APP = R('js/app.js');
const DAY = 86400000;

/* The client function under test, sliced out by name so an assertion about "the render" cannot
   accidentally be satisfied by some other part of a 20,000-line file (PROTOCOL lie #2). */
const slice = (src, from, to) => {
  const a = src.indexOf(from);
  if (a < 0) return '';
  const b = src.indexOf(to, a + from.length);
  return b < 0 ? src.slice(a) : src.slice(a, b);
};
/* COMMENTS ARE NOT CODE. The first version of PS-B1 went red against the word "ranked" in a
   sentence explaining that nothing is ranked here — an assertion that a comment could break, and
   that a comment could equally have satisfied. Anything asserting BEHAVIOUR reads the decommented
   source; the comments stay in the file where they belong and out of the evidence. */
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const ROW    = decomment(slice(APP, '_attentionRow(it) {', '\n  _renderAttention('));
const RENDER = decomment(slice(APP, '_renderAttention(items) {', '\n  attentionWhy('));
const LOAD   = decomment(slice(APP, 'async _loadTopQuestion() {', '\n  /* Create an inquiry or a focus.'));
const WHY    = decomment(slice(APP, 'attentionWhy(kind, id) {', '\n  async _loadTopQuestion()'));

/* ══ A — EVERY REASON CODE CAN BE SAID OUT LOUD ═══════════════════════════════════════════════
   The vocabulary is closed and the desk owns it, so the desk owns the words for it too. A seventh
   code added without a sentence would reach a person as an identifier. */
console.log('\n  A — THE REASON IS SAYABLE, AND IT IS NOT JARGON');
const SENTENCES = P.ATTENTION_REASONS.map(reason => P.attentionSentence({
  reason, detail: { records: 2, originsBefore: 1, originsNow: 2, openForDays: 40, focus: 'focus:f1', outcome: 'helped' },
}));
ok('PS-A1 every reason code in the closed vocabulary has a sentence',
  SENTENCES.length === P.ATTENTION_REASONS.length && SENTENCES.every(s => typeof s === 'string' && s.length > 12));
ok('PS-A2 …and not one of them shows the code, an underscore identifier, or epistemic jargon',
  SENTENCES.every(s => !/_/.test(s)
    && !/\b(reason|reasonCode|ref|originRef|supersed|epistemic|corroborat|provenance|kernel|queue|rank)\b/i.test(s)));
ok('PS-A3 …and none of them is a score, a rank, a percentage or a position',
  SENTENCES.every(s => !/\b\d+\s*%|\bscore\b|\brank(ed|ing)?\b|\bpriority\s*\d|\b#\d|\bout of \d/i.test(s)));
ok('PS-A4 …and none of them predicts, or says one thing caused another',
  SENTENCES.every(s => !/\bwill\b|\blikely\b|\bexpect(ed)?\b|\brisk of\b|\bbecause of\b|\bcaused\b|\bleading to\b/i.test(s)));
ok('PS-A5 …and none of them is about a person, only about the record',
  SENTENCES.every(s => !/\b(they|he|she|their|his|her|teammate|player|coach)\b/i.test(s)));
ok('PS-A6 an unknown code produces nothing rather than a guess — the vocabulary stays closed',
  P.attentionSentence({ reason: 'looks_risky', detail: {} }) === null
  && P.attentionSentence({}) === null);
/* Product law 4 — never surface NaN or undefined to a human. A row whose detail the desk did not
   populate must still read as a sentence. */
ok('PS-A7 …and a row with no counts still reads as a sentence, never "undefined" or "NaN"',
  P.ATTENTION_REASONS.map(reason => P.attentionSentence({ reason }))
    .every(s => typeof s === 'string' && s.length > 12 && !/undefined|NaN|\[object/i.test(s)));

/* ══ B — THE CLIENT DOES NOT RE-DECIDE PRIORITY ═══════════════════════════════════════════════
   This is the assertion that keeps the browser from becoming a second Priority Office. It is
   deliberately about the ATTENTION path only: the fallback below it merges four object lists by a
   server-supplied score and is untouched by this pass. */
console.log('\n  B — THE SERVER OWNS PRIORITY; THE BROWSER RENDERS IT');
ok('PS-B1 the attention render never sorts, scores, ranks or reverses what arrived',
  RENDER.length > 200 && !/\.sort\(|\.reverse\(|score|weight|rank|priority\s*[-+*/]/i.test(RENDER));
ok('PS-B2 …and the sentence on screen is the SERVER\'S `why`, passed through and escaped, not derived',
  /why:\s*esc\(it\.why/.test(ROW) && /\$\{(top|r)\.why\}/.test(RENDER)
  && !/switch\s*\(|\?\s*'[^']{12,}'\s*:/.test(ROW + RENDER));
ok('PS-B3 …and consumes the list front to back, so the order on screen is the order that arrived',
  /items\[0\]/.test(RENDER) && /items\.slice\(1,\s*3\)/.test(RENDER));
ok('PS-B4 …and no reason code appears anywhere in the front end at all',
  !P.ATTENTION_REASONS.some(r => APP.includes(r)));

/* ══ C — IT IS A DOOR, NOT A FETCH ════════════════════════════════════════════════════════════ */
console.log('\n  C — THE ROUTE HAS A REAL DOOR');
ok('PS-C1 Home fetches the attention list', /fetch\('\/api\/me\/attention'/.test(LOAD));
/* THE GUARD AND THE CALL, ASSERTED AS ONE EXPRESSION. The first version of this matched
   `_renderAttention(att.items)` anywhere in the function, and stayed green when the branch above
   it was changed to `if (false)` — a render call that can never run, which is PROTOCOL lie #1
   wearing a door's clothes. The condition has to be a real test of the response. */
ok('PS-C2 …and RENDERS the answer, from a branch that actually tests the response',
  /if\s*\(att\s*&&\s*att\.ok\s*&&[\s\S]{4,90}?\)\s*\{\s*return this\._renderAttention\(att\.items\);/.test(LOAD));
ok('PS-C3 …and a failed request is not treated as an empty desk — only a well-formed answer renders',
  /att\.ok\s*&&\s*Array\.isArray\(att\.items\)\s*&&\s*att\.items\.length/.test(LOAD)
  && /catch\s*\(_\)\s*\{\s*att\s*=\s*null;?\s*\}/.test(LOAD));
ok('PS-C4 …and when the desk has nothing, the ordinary top-of-record card still stands',
  /iq-home-empty|iq-home-failed/.test(LOAD) && /_objectCard\(top,\s*top\.kind\)/.test(LOAD));

/* ══ D — CANONICAL OBJECT BINDING, NO COPIES ══════════════════════════════════════════════════ */
console.log('\n  D — OPENING AN ITEM OPENS THE OBJECT');
ok('PS-D1 a surfaced item opens the canonical object by kind and id, through the shared thread door',
  /MemberApp\.openObjectThread\('\$\{r\.kind\}','\$\{r\.id\}'\)/.test(RENDER));
ok('PS-D2 …and the client is HANDED kind and id rather than parsing a ref itself',
  /kind:\s*esc\(it\.kind/.test(ROW) && /id:\s*esc\(it\.id/.test(ROW)
  && !/\.ref\b|split\(\s*':'/.test(ROW + RENDER));
/* BOTH HALVES OF THE RENDER PATH. Scoped to `RENDER` alone, this stayed green while a statement
   field was added one function up in `_attentionRow` — the row builder is where a copy of the
   evidence would actually get in, and the assertion was not looking at it. */
ok('PS-D3 …and nothing on the way to the screen carries a statement, evidence text or a copy of the object',
  RENDER.length > 200 && ROW.length > 80
  && !/statement|passage|signals|evidenceText|\bbody\b/i.test(ROW + RENDER));
ok('PS-D4 "Why this?" binds the composer to that same canonical object and asks an ordinary turn',
  /_composerAbout\s*=\s*\{\s*kind,\s*id\s*\}/.test(WHY) && /this\.wsSend\(\)/.test(WHY));
ok('PS-D5 …and writes nothing: no POST, no confirm, no state change in the act of asking',
  !/fetch\(|method:\s*'POST'|confirm|proposal/i.test(WHY));

/* ══ E — NOT A DASHBOARD ══════════════════════════════════════════════════════════════════════ */
console.log('\n  E — HOME IS STILL ONE QUESTION');
ok('PS-E1 at most three items ever reach the screen — one primary and two quiet lines',
  /items\.slice\(1,\s*3\)/.test(RENDER) && !/items\.map\(/.test(RENDER));
ok('PS-E2 …and nothing counts the rest of the queue at people ("+7 more")',
  !/items\.length/.test(RENDER) && !/more\b.*length|length.*\bmore\b/i.test(RENDER));
ok('PS-E3 …no badge, no rank number, no percentage on the surfaced item',
  !/badge|%|iq-inq-band|data-rank|iq-pol-/i.test(RENDER));
ok('PS-E4 the reason line is a LABEL on the card, never an assistant message bubble',
  /iq-inq-why/.test(RENDER) && !/iq-msg-iq|iq-msg\b|iq-response-text/.test(RENDER));
ok('PS-E5 Home still renders exactly one brief slot, and this went into it rather than beside it',
  (APP.match(/id="iq-brief"/g) || []).length === 1 && /getElementById\('iq-brief'\)/.test(RENDER));
ok('PS-E6 …and no second Priority Office was created: one attentionQueue, one desk',
  (() => {
    const files = fs.readdirSync(path.join(__dirname, '..', 'ai')).filter(f => f.endsWith('.js'));
    const owners = files.filter(f => /function attentionQueue|attentionQueue\s*=/.test(R('ai/' + f)));
    return owners.length === 1 && owners[0] === 'priority-office.js';
  })());
ok('PS-E7 …and the browser never assembles an attention list of its own from the object routes',
  !/attention/i.test(decomment(slice(APP, 'let all = [];', 'iq-home-one'))));

/* ══ HTTP — THE GATE, THE SHAPE THE DOOR NEEDS, AND THE FOUR JOURNEYS ═════════════════════════ */
const C = 'psx';
const sig = (ref, origin, at, extra = {}) => ({ ref, originRef: origin, status: 'active', at, ...extra });
const users = {
  p1:  { id: 'p1', name: 'Player One', email: 'ps1@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
  out: { id: 'out', name: 'Other Squad', email: 'pso@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
};
const SECRET = 'said privately that things at home are hard';
const NOW = Date.now();
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['p1'], leaderIds: [] },
                     n2: { nodeId: 'n2', name: 'Reserves', memberIds: ['out'], leaderIds: [] } } },
  inquiryStates: { [C]: { 'member:p1': {
    /* q1 — gains a genuinely NEW independent account since they looked (journey C, the true half) */
    q1: { inquiryId: 'q1', topic: { label: 'Recovery between games' }, status: 'open',
      signals: [sig('ev1', 'o_p1', NOW - 30 * DAY, { statement: SECRET }), sig('ev2', 'o_coach', NOW - DAY)],
      hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
    /* q2 — three MORE records from ONE account already present (journey C, the false half) */
    q2: { inquiryId: 'q2', topic: { label: 'Travel and academics' }, status: 'open',
      signals: [sig('r1', 'o_p1', NOW - 30 * DAY), sig('r2', 'o_p1', NOW - 3 * DAY),
        sig('r3', 'o_p1', NOW - 2 * DAY), sig('r4', 'o_p1', NOW - DAY)],
      hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
    /* q3 — the only new record is a CORRECTION of an old one (journey D) */
    q3: { inquiryId: 'q3', topic: { label: 'Set-piece marking' }, status: 'open',
      signals: [{ ref: 'c1', originRef: 'o_p1', status: 'superseded', supersededBy: 'c2', at: NOW - 30 * DAY },
        sig('c2', 'o_p1', NOW - DAY)],
      hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
  } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (m, u, t, b) => fetch(base + u, { method: m,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const T = {}; Object.keys(users).forEach(id => { T[id] = issueToken(id, C, 'member'); });
  const SINCE = NOW - 7 * DAY;

  try {
    console.log('\n  F — THE ROUTE RETURNS WHAT THE DOOR NEEDS');
    const mine = await req('GET', `/api/me/attention?since=${SINCE}`, T.p1);
    const rows = (mine.j && mine.j.items) || [];
    ok('PS-F1 the list comes back ordered, with items to render', mine.status === 200 && rows.length > 0);
    ok('PS-F2 every row carries the three things the door needs: a kind, an id and a label',
      rows.every(r => r.kind && r.id && typeof r.label === 'string'));
    ok('PS-F3 …and a plain sentence for its reason, composed by the server',
      rows.every(r => typeof r.why === 'string' && r.why.length > 12));
    ok('PS-F4 …matching the desk\'s own words for that row, so there is ONE phrasing owner',
      rows.every(r => r.why === P.attentionSentence(r)));
    ok('PS-F5 …and no row carries a score, a weight or a rank the client could sort on',
      rows.every(r => !('score' in r) && !('weight' in r) && !('rank' in r)));
    ok('PS-F6 …and no evidence statement travels in a surfaced row',
      !JSON.stringify(rows).includes(SECRET));

    console.log('\n  G — PRIVACY: A HIDDEN CANDIDATE NEVER REACHES THE SCREEN');
    const theirs = await req('GET', `/api/me/attention?since=${SINCE}`, T.out);
    const blob = JSON.stringify((theirs.j && theirs.j.items) || []);
    ok('PS-G1 another squad\'s reader gets a list naming none of it — not filtered, never present',
      theirs.status === 200 && !blob.includes('q1') && !blob.includes('Recovery between games') && !blob.includes(SECRET));
    /* EVERY ITEM ON A SCREEN MUST BE OPENABLE BY THE PERSON LOOKING AT IT. The first version of
       this checked that two particular labels were absent from the other reader's list — but
       neither of those inquiries produces an attention row for ANYBODY (one is same-origin
       repetition, the other a correction), so the assertion held against a surface that could
       never have shown them: PROTOCOL lie #5. This asserts the law instead. A list is not a
       capability, and a row whose object the reader cannot open is a leak with a tap on it. */
    const openable = async (token, items) => {
      for (const r of items) {
        const t = await req('GET', `/api/objects/${r.kind}/${r.id}/thread?scope=self`, token);
        if (t.status !== 200) return false;
      }
      return true;
    };
    ok('PS-G2 …and every row a reader is shown is one that reader can actually open',
      await openable(T.out, (theirs.j && theirs.j.items) || []) && await openable(T.p1, rows));
    ok('PS-G3 …and an unauthenticated caller gets nothing at all',
      (await fetch(base + '/api/me/attention')).status === 401);
    /* The far side of a rendered item must pass the read gate AGAIN when opened — the attention
       list is not a capability, and a ref in a list is not permission to open it. */
    const stolen = await req('GET', '/api/objects/inquiry/q1/thread?scope=self', T.out);
    ok('PS-G4 opening an object from another reader\'s list is refused at the object door',
      stolen.status === 404 || stolen.status === 403);

    console.log('\n  H — JOURNEY C: INDEPENDENCE, NOT VOLUME');
    const byRef = Object.fromEntries(rows.map(r => [r.ref, r]));
    ok('PS-H1 a genuinely NEW independent account brings its inquiry up',
      !!byRef['inquiry:q1'] && [byRef['inquiry:q1'].reason, ...(byRef['inquiry:q1'].alsoBecause || [])]
        .includes('new_independent_evidence'));
    ok('PS-H2 …and says so in words a person can check: how many accounts there were, and are',
      /2 separate accounts/.test(byRef['inquiry:q1'].why) && /was 1/.test(byRef['inquiry:q1'].why));
    ok('PS-H3 three MORE records from ONE account already present raise nothing',
      !byRef['inquiry:q2'] || ![byRef['inquiry:q2'].reason, ...(byRef['inquiry:q2'].alsoBecause || [])]
        .includes('new_independent_evidence'));

    console.log('\n  I — JOURNEY D: A CORRECTION IS NOT NEWS');
    ok('PS-I1 an inquiry whose only new record CORRECTS an old one is not surfaced as fresh support',
      !byRef['inquiry:q3'] || ![byRef['inquiry:q3'].reason, ...(byRef['inquiry:q3'].alsoBecause || [])]
        .includes('new_independent_evidence'));

    console.log('\n  J — JOURNEY A/B: FOCUS OUTCOME LEAVES THE QUESTION OPEN');
    const mk = await req('POST', '/api/me/focus', T.p1, { text: 'Sleep before away games', addressesKind: 'inquiry', addressesId: 'q1' });
    const fid = mk.j && mk.j.focus && mk.j.focus.id;
    ok('PS-J1 a focus can be started on the question that was surfaced', !!fid);
    await req('POST', '/api/me/focus/outcome', T.p1, { focusId: fid, outcome: 'helped' });
    const after = await req('GET', '/api/me/attention', T.p1);          // no `since` — Home's own call
    const q1row = ((after.j && after.j.items) || []).find(r => r.ref === 'inquiry:q1');
    ok('PS-J2 after the outcome is recorded, the still-open question is what Home surfaces next',
      !!q1row && [q1row.reason, ...(q1row.alsoBecause || [])].includes('unresolved_after_focus_outcome'));
    ok('PS-J3 …in words, not a code, and without claiming the work caused anything',
      !!q1row && /still open/i.test(q1row.why) && !/_/.test(q1row.why)
      && !/\bcaused\b|\bwill\b|\bbecause of\b/i.test(q1row.why));
    ok('PS-J4 …and it opens as the canonical inquiry, not as a copy of it',
      q1row.kind === 'inquiry' && q1row.id === 'q1' && q1row.ref === 'inquiry:q1'
      && (await req('GET', '/api/objects/inquiry/q1/thread?scope=self', T.p1)).status === 200);
    ok('PS-J5 …and nothing was done to any of it: the list is a read, and says so',
      /nothing has been done to them|Nothing in your record/i.test(String((after.j || {}).note || '')));
  } catch (e) { fail++; console.error('  FAIL priority-surface suite threw:', e && e.stack); }

  server.close();
  console.log(`\npriority-surface-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
