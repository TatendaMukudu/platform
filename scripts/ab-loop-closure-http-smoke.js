/* Truth layer — WE TRIED THIS ABOUT THAT, AND HERE IS WHAT HAPPENED.

   That sentence is the whole A→B loop, and at ae059a6 the product could not say it.

   Driven through the real routes: five squad members independently contribute the same
   observation, the group inquiry opens at `supported`, the coach starts a Focus from it —
   `POST /api/group/:n/focus` verifies `fromInquiryId` against this group's own inquiries and
   stores `origin: { from: 'inquiry', inquiryId }` — and records an outcome of `better`. Then:

       objects the coach has : ["focus:tf_…", "low:inq_ioc8jf8p"]
       focus raw.origin      : { from: 'inquiry', inquiryId: 'inq_ioc8jf8p' }
       edges()               : []
       loop()                : addresses: null,
                               open: ["this focus does not say what it was started to work on"]

   ONE INQUIRY, TWO NAMES FOR IT. A High and a Low are PROJECTIONS of an inquiry and carry its id,
   so the same question is `inquiry:<id>` to whatever points at it and `low:<id>` to whoever is
   reading it. `edges()` dropped every edge whose target was not literally present, so the link
   vanished — and the product told the coach the Focus did not say what it was started to work on,
   when the Focus said so precisely and had been verified at creation.

   Nothing threw and nothing was logged. The loop was not broken loudly; it was absent.

   TWO REPAIRS, BOTH AT EXISTING OWNERS. `edges()` resolves an inquiry ref by IDENTITY — an object
   whose own inquiry id matches — and expresses every edge in the name the caller can resolve. And
   `/related` reads the loop from whichever end the reader is standing at, because a coach stands
   on the QUESTION; it enters `crossEvidence.loop` from the addressing focus rather than deriving
   anything new.

   WHAT THE ALIAS MUST NOT DO is asserted as hard as what it must. It resolves only inside the set
   the caller already authorised, so it cannot reach another group or another tenant; a literal
   object always wins over an alias; and an id that matches nothing yields no edge rather than a
   guessed one.

   Run: node scripts/ab-loop-closure-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S  = require('../server.js');
const ce = require('../ai/cross-evidence.js');
const teamState = require('../ai/team-state.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates, _allObjectsFor } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. Thunks, so an expression that
   explodes is a named failure rather than a crash that loses the rest of the run. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'abl', OTHER = 'abx';
/* FOURTEEN MEMBERS, FIVE CONTRIBUTORS. The disclosure floor is two-sided — k >= 5 AND n-k >= 5 —
   so a smaller squad could only ever prove that the floor withholds, never that the loop closes. */
const SQUAD = ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13','p14'];
const users = { coach: { id: 'coach', name: 'Coach', email: 'c@abl.io', role: 'coach', orgCode: O, status: 'active', leadershipNodeIds: ['squad'] } };
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@abl.io`, role: 'member', orgCode: O, status: 'active', assignedNodeIds: ['squad'] };

_loadAllStores({
  orgMeta: { [O]: { orgName: "Alma Men's Soccer", orgMode: 'sports' },
             [OTHER]: { orgName: 'Another Club', orgMode: 'sports' } },
  orgUsers: { [O]: users,
              [OTHER]: { rival: { id: 'rival', name: 'Rival', email: 'r@abx.io', role: 'coach', orgCode: OTHER, status: 'active', leadershipNodeIds: ['theirs'] } } },
  orgNodes: { [O]: { squad: { nodeId: 'squad', name: 'First Team', parentId: null, childNodeIds: [],
                memberIds: SQUAD, leaderIds: ['coach'], rev: 1 } },
              [OTHER]: { theirs: { nodeId: 'theirs', name: 'Their Team', parentId: null, childNodeIds: [],
                memberIds: [], leaderIds: ['rival'], rev: 1 } } },
});
_rebuildEmailIndex();

for (const id of SQUAD.slice(0, 5)) {
  _noteGroupCandidates(O, id, `member:${id}`, [{ id: 'ge_' + id, level: 'observation',
    text: 'talking drops off after we lose', sourceSpan: 'nobody talks after a loss',
    concerns: 'group', originRef: 'o_' + id, originKind: 'direct_observation', turnId: 't_' + id }],
    'communication', 'Communication after results');
}

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (who, org = O) => ({ Authorization: `Bearer ${issueToken(who, org, who === 'coach' || who === 'rival' ? 'coach' : 'member')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who, org) => fetch(base + u, { method: m, headers: H(who, org),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    console.log('\n  A — THE QUESTION BECOMES REAL, THE WAY THE PRODUCT MAKES IT REAL');
    for (const id of SQUAD.slice(0, 5)) {
      const cand = (groupCandidates[O] || []).find(x => x.contributorId === id && x.status === 'detected');
      if (cand) await call('POST', '/api/group/squad/contribute', { candidateId: cand.candidateId, valence: 'worth_attention' }, id);
    }
    const inqs = ((await call('GET', '/api/group/squad/inquiry', undefined, 'coach')).j || {}).inquiries || [];
    const inq = inqs[0] || {};
    ok('AB-A1 five independent accounts open a group inquiry',
      !!inq.inquiryId && inq.independentOrigins === 5 && inq.contributors === 5);
    ok('AB-A2 …at a confidence the kernel computed, not one anybody declared',
      (inq.confidence || {}).band === 'supported');

    console.log('\n  B — THE COACH STARTS SOMETHING ABOUT IT, AND IT RECORDS WHAT IT IS ABOUT');
    const made = await call('POST', '/api/group/squad/focus',
      { text: 'Debrief within 24h of a loss, captain-led', fromInquiryId: inq.inquiryId }, 'coach');
    const focus = (made.j || {}).focus || {};
    ok('AB-B1 the Focus is created from the inquiry',
      made.status === 200 && (focus.origin || {}).from === 'inquiry');
    ok('AB-B2 …and stores WHICH inquiry, verified against this group\'s own',
      (focus.origin || {}).inquiryId === inq.inquiryId);

    console.log('\n  C — THE EDGE SURVIVES THE FACT THAT ONE INQUIRY HAS TWO NAMES');
    const objects = _allObjectsFor(O, 'coach') || [];
    /* THE PROJECTION SPECIFICALLY, not "whichever of the three names turns up first". Since the
       group bucket began filing every one of a group's inquiries as an object — before that, only
       the one that won the ranking slot existed and the others 404'd — the same inquiry is
       present under BOTH `low:<id>` and `inquiry:<id>`. That is the very condition this section
       is about, so picking by whichever sorted first would have had it testing the literal
       against itself and calling the result a pass. */
    const lowObj  = objects.find(o => (o.kind === 'low' || o.kind === 'high')
      && String((o.raw || {}).inquiryId || o.id) === inq.inquiryId);
    const focObj  = objects.find(o => o.kind === 'focus');
    ok('AB-C1 the coach\'s object for the question is a PROJECTION carrying the inquiry id',
      !!lowObj && String((lowObj.raw || {}).inquiryId || lowObj.id) === inq.inquiryId);
    ok('AB-C2 …and is not literally named `inquiry:<id>`, which is what broke this',
      ce.refOf(lowObj) !== `inquiry:${inq.inquiryId}`);

    const eg = ce.edges(objects);
    /* THE EDGE LANDS ON THE INQUIRY, UNDER WHICHEVER OF ITS NAMES THE SET RESOLVES TO. This used
       to pin the literal string `low:<id>`, which was the only name the inquiry had at the time.
       A literal `inquiry:<id>` object now exists too — every one of a group's inquiries is filed,
       not only the one that wins the ranking slot — and `edges()` prefers a literal over an
       alias, which is its own documented law and is asserted at AB-E3 below.
       `sameThingRefs` is the module's answer to "which names denote this thing", so asking it is
       asserting the law rather than one spelling of it. */
    const _names = new Set(ce.sameThingRefs(objects, ce.refOf(lowObj)));
    ok('AB-C3 the addresses edge exists (it was dropped, silently)',
      eg.some(e => e.from === ce.refOf(focObj) && e.type === 'addresses' && _names.has(e.to)));
    ok('AB-C4 …and the inverse, which is the end a coach reads from',
      eg.some(e => _names.has(e.from) && e.type === 'addressed_by' && e.to === ce.refOf(focObj)));
    ok('AB-C5 …expressed in a name the caller can actually resolve',
      eg.every(e => objects.some(o => ce.refOf(o) === e.from) && objects.some(o => ce.refOf(o) === e.to)));

    const loopFromFocus = ce.loop(objects, ce.refOf(focObj));
    ok('AB-C6 the focus knows what it addresses (it reported null)',
      !!loopFromFocus && _names.has(loopFromFocus.addresses));
    ok('AB-C7 …and no longer says the focus did not record what it was started to work on',
      !(loopFromFocus.open || []).some(t => /does not say what it was started to work on/i.test(String(t))));

    console.log('\n  D — AND THE OUTCOME REACHES THE QUESTION, WHICH IS WHERE A COACH STANDS');
    await call('POST', `/api/group/squad/focus/${focus.focusId}/outcome`,
      { result: 'better', note: 'people talked more' }, 'coach');
    const rel = await call('GET', `/api/objects/${lowObj.kind}/${lowObj.id}/related?scope=group:squad`, undefined, 'coach');
    ok('AB-D1 opening the question shows that something was tried about it',
      rel.status === 200 && ((rel.j || {}).related || []).some(r => r.type === 'addressed_by' && r.kind === 'focus'));
    ok('AB-D2 …named in the words the coach wrote, not as an id',
      ((rel.j || {}).related || []).some(r => /Debrief within 24h/.test(String(r.label || ''))));
    ok('AB-D3 …and HOW IT WENT, from the same loop owner rather than a second one (this was null)',
      !!(rel.j || {}).loop && (rel.j).loop.outcome === 'better');
    ok('AB-D4 …with what has been recorded since, so the next decision has somewhere to start',
      !!((rel.j || {}).loop || {}).observedSince
      && Number.isFinite(((rel.j).loop.observedSince || {}).records));

    console.log('\n  G — THE WORDS THE COACH IS OFFERED ARE THE WORDS THE PRODUCT RECORDS');
    /* THE LEARNING ARROW, AND IT WAS BROKEN WHERE IT MATTERS MOST. The group's closed vocabulary
       is better / no_change / worse / unclear, and `recordFocusOutcome` coerces anything else to
       `unclear`. The coach's own buttons sent `helped` — the PERSONAL focus vocabulary — so every
       time a coach pressed "It helped", the product recorded "too tangled to tell" and the group
       learned nothing from the one signal the whole loop exists to earn.

       No suite caught it, because every suite sent a valid group word directly. None of them ever
       drove the values the CLIENT offers, which is the only place the two vocabularies meet. */
    const fs = require('fs'), path = require('path');
    const appJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    const offered = (appJs.match(/\$\{\['better', 'no_change', 'worse', 'unclear'\]\.map\(rkey/) || [])[0];
    ok('AB-G1 the group outcome buttons offer the group\'s own four words',
      !!offered);
    ok('AB-G2 …and every one of them is in the kernel\'s closed vocabulary',
      ['better', 'no_change', 'worse', 'unclear'].every(w => teamState.OUTCOME_RESULTS.includes(w)));
    ok('AB-G3 …and `helped`, which is the PERSONAL vocabulary, is not among them',
      !teamState.OUTCOME_RESULTS.includes('helped'));

    /* DRIVEN, ONE BUTTON AT A TIME, THROUGH THE REAL ROUTE. A parity check on source text would
       not have caught the original defect either — the words were all spelled correctly, they
       were simply the wrong set. What matters is what comes back out of the store. */
    for (const word of teamState.OUTCOME_RESULTS) {
      const made2 = await call('POST', '/api/group/squad/focus',
        { text: `Try something and record ${word}`, fromInquiryId: inq.inquiryId }, 'coach');
      const fid2 = ((made2.j || {}).focus || {}).focusId;
      const rec = await call('POST', `/api/group/squad/focus/${fid2}/outcome`, { result: word }, 'coach');
      ok(`AB-G4 "${word}" is recorded as "${word}" and not coerced`,
        rec.status === 200 && (((rec.j || {}).focus || {}).outcome || {}).result === word);
    }

    /* AND AN UNKNOWN WORD IS A REFUSAL. Coercing it to `unclear` is right as a last line inside
       the constructor and wrong as a first one at the boundary: it is what made a broken caller
       silent for as long as it was. */
    const stale = await call('POST', '/api/group/squad/focus',
      { text: 'One more', fromInquiryId: inq.inquiryId }, 'coach');
    const staleId = ((stale.j || {}).focus || {}).focusId;
    const bad = await call('POST', `/api/group/squad/focus/${staleId}/outcome`, { result: 'helped' }, 'coach');
    ok('AB-G5 a word from the WRONG vocabulary is refused, not quietly filed as "unclear"',
      bad.status === 400);
    ok('AB-G6 …and the refusal names what it expected, so the next caller cannot guess wrong',
      Array.isArray((bad.j || {}).expected)
      && (bad.j).expected.join(',') === teamState.OUTCOME_RESULTS.join(','));
    ok('AB-G7 …and nothing was written on the focus by that refusal',
      () => {
        const f = (S.teamFocuses[O].squad || []).find(x => x.focusId === staleId);
        return !f.outcome && f.status === 'active';
      });

    ok('AB-G8 every word the kernel allows has English for a person to read',
      teamState.OUTCOME_RESULTS.every(w => new RegExp(`\\b${w}:\\s*'`).test(appJs)));

    console.log('\n  E — THE ALIAS RESOLVES BY IDENTITY, AND INVENTS NOTHING');
    /* Each of these is a way the repair could have been wrong. */
    const strangerLow = { kind: 'low', id: 'inq_somebody_else', raw: { inquiryId: 'inq_somebody_else' } };
    ok('AB-E1 a projection of a DIFFERENT inquiry does not answer for this one',
      ce.edges([focObj, strangerLow]).length === 0);
    ok('AB-E2 an object nothing points at yields no edge rather than a guessed one',
      ce.edges([lowObj]).length === 0);

    /* AND THE MATCH IS ON THE INQUIRY ID, NOT ON THE OBJECT'S OWN ID. For a contributed group Low
       the two happen to be the same string, so that fixture alone cannot tell the two rules apart
       — a mutation resolving by `o.id` survived it. A projection with an id of its own is the
       ordinary case elsewhere in the product: ai/proactive.js mints `pi_<hash>` for a High while
       the inquiry it projects keeps `inq_…`. Only the inquiry id can carry the link. */
    const projectionWithOwnId = { kind: 'high', id: 'pi_1f3c9ab',
      raw: { inquiryId: inq.inquiryId, dedupeKey: 'coach:communication:self' } };
    const viaOwnId = ce.edges([focObj, projectionWithOwnId]);
    ok('AB-E2b a projection whose OWN id differs from the inquiry id still carries the link',
      viaOwnId.some(e => e.from === ce.refOf(focObj) && e.type === 'addresses' && e.to === 'high:pi_1f3c9ab'));
    ok('AB-E2c …and one whose own id merely LOOKS like an inquiry id does not',
      ce.edges([focObj, { kind: 'high', id: inq.inquiryId, raw: { dedupeKey: 'x' } }]).length === 0);

    /* A LITERAL OBJECT ALWAYS WINS. If the real inquiry is present under its own name, the edge
       must land on it and not on its projection — otherwise the alias would displace the thing
       it is standing in for. */
    const literal = { kind: 'inquiry', id: inq.inquiryId, raw: { inquiryId: inq.inquiryId } };
    const withLiteral = ce.edges([focObj, literal, lowObj]);
    ok('AB-E3 a literal inquiry object wins over the projection standing in for it',
      withLiteral.some(e => e.from === ce.refOf(focObj) && e.type === 'addresses' && e.to === `inquiry:${inq.inquiryId}`)
      && !withLiteral.some(e => e.type === 'addresses' && e.to === ce.refOf(lowObj)));

    /* AND THE SCOPE GATE IS UNCHANGED. The alias is built only from objects the caller already
       holds, so it can no more reach another tenant than the literal ref could. */
    const rivalObjects = _allObjectsFor(OTHER, 'rival') || [];
    ok('AB-E4 another tenant holds none of this org\'s objects in the first place',
      !rivalObjects.some(o => String(o.id) === String(inq.inquiryId) || String(o.id) === String(focus.focusId)));
    ok('AB-E5 …so mixing this focus with only THEIR objects yields no edge',
      ce.edges([focObj, ...rivalObjects]).length === 0);
    const crossRead = await call('GET', `/api/objects/${lowObj.kind}/${lowObj.id}/related?scope=group:squad`, undefined, 'rival', OTHER);
    ok('AB-E6 …and the other tenant cannot open this question at all',
      crossRead.status === 404 || crossRead.status === 403);

    console.log('\n  F — AND A MEMBER OF THE SQUAD SEES IT AS A MEMBER, NOT AS THE COACH');
    /* The loop must not become a way to read something the group read already refuses. */
    const memberRel = await call('GET', `/api/objects/${lowObj.kind}/${lowObj.id}/related?scope=group:squad`, undefined, 'p1');
    ok('AB-F1 a squad member can read the group\'s own question',
      memberRel.status === 200);
    ok('AB-F2 …and the loop carries refs and an outcome word, never anybody\'s words',
      () => {
        const l = (memberRel.j || {}).loop;
        if (!l) return true;                       // absent is fine; present must be clean
        return !/nobody talks after a loss|people talked more/i.test(JSON.stringify(l));
      });
    ok('AB-F3 …and no raw contributed text reaches the related read at all',
      !/nobody talks after a loss/i.test(JSON.stringify(memberRel.j || {})));

    /* ══ H — EVERY PLACE AN OUTCOME IS SHOWN SAYS IT IS NOT A CAUSE ═══════════════════════════
       THE ATTACK: a historical outcome described causally. "What each one achieved" and "What was
       recorded after each one" are the same list of words with opposite epistemic content, and the
       first one is what a product writes when nobody is guarding the sentence.

       There are THREE places an outcome result reaches a coach's eyes — the ask that offers the
       four words, the history of what the group has tried, and the loop panel on the object
       thread. `reachability-smoke` guarded one of them. Mutating the other two — replacing the
       caveat with "What each one achieved" — left npm test green apart from the asset stamp,
       which is not an epistemic guard and would not have caught it on a release build.

       KEYED ON THE RENDER SITES, NOT ON A SUBSTRING OF THE FILE. A regex over the whole of
       app.js passes as long as ONE caveat survives anywhere, which is precisely the failure it is
       supposed to catch. Each block is located by the code that renders the outcome and checked
       on its own, so losing any single one turns this red. */
    console.log('\n  H — EVERY PLACE AN OUTCOME IS SHOWN SAYS IT IS NOT A CAUSE');
    {
      const fs = require('fs'), path = require('path');
      const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
      const notCausal = /never a claim that the focus caused it|not a\s+claim that the focus caused it|Nothing here says a focus caused/;
      const blockAround = (needle, before, after) => {
        const i = ui.indexOf(needle);
        return i < 0 ? '' : ui.slice(Math.max(0, i - before), i + after);
      };
      const siteAsk  = blockAround("MemberApp.recordGroupOutcome('", 0, 1200);
      const siteHist = blockAround('_OUTCOME_WORDS[f.outcome && f.outcome.result]', 0, 500);
      const siteLoop = blockAround('_OUTCOME_WORDS[loop.outcome]', 0, 900);
      ok('AB-H1 the four words are offered with the caveat attached, at the moment of recording',
        !!siteAsk && notCausal.test(siteAsk));
      ok('AB-H2 …the history of what the group has tried says what FOLLOWED, not what it achieved',
        !!siteHist && notCausal.test(siteHist));
      ok('AB-H3 …and the loop panel on the object thread says it too',
        !!siteLoop && notCausal.test(siteLoop));
      /* THE CAVEAT ITSELF CONTAINS THE WORD "caused", so the causal-language check has to run on
         what is left once the DENIAL is removed. My first version of this asserted the bug as
         correct in reverse: it went red on the very sentence that makes the block safe. */
      const withoutDenial = b => String(b).replace(notCausal, '').replace(/caused it/g, '');
      ok('AB-H4 …and none of the three describes an outcome as something the focus achieved or caused',
        [siteAsk, siteHist, siteLoop].map(withoutDenial).every(b =>
          b && !/\bachieved\b/i.test(b) && !/because of (this|the) focus/i.test(b)
            && !/\bthe focus (caused|delivered|produced|drove)\b/i.test(b)
            && !/\bworked\b/i.test(b)));
      /* AND THE WORDS THEMSELVES DO NOT SMUGGLE ONE IN. `better` is a description of what
         followed; "it worked" would be a verdict on cause wearing the same button. */
      ok('AB-H5 …and the outcome words describe what happened rather than pronouncing on cause',
        () => {
          const i = ui.indexOf('_OUTCOME_WORDS: {');
          const body = ui.slice(i, ui.indexOf('}', i));
          return i > 0 && /It got better/.test(body) && /Too tangled to tell/.test(body)
            && !/\bit worked\b/i.test(body) && !/\bfixed\b/i.test(body) && !/\bsolved\b/i.test(body);
        });
    }

  } catch (e) { fail++; console.error('  FAIL ab-loop-closure suite threw:', e && e.stack); }

  server.close();
  console.log(`\nab-loop-closure-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
