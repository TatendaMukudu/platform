/* Truth layer — A DOCUMENT IS SOMETHING TO READ. IT IS NOT SOMEBODY WHO SAW IT.

   Attaching a file is the easiest way in the product to manufacture confidence, because a document
   FEELS like evidence. It is typeset, it is external, it has a title, and it appears to corroborate.
   None of that is an observation, and a PDF that says "communication is fine" is one document —
   never a second independent account agreeing with the first.

   THE TWO QUESTIONS THIS SUITE EXISTS FOR, both named by the founder rather than invented here:

     1. IS IT USEFUL WITH NO MODEL? The pilot runs models-off. If attaching a document is only
        useful when a provider is reachable, the feature does not exist on the day it is needed.

     2. CAN IT LAUNDER ITSELF INTO EVIDENCE? Into origin counts, into confidence, into somebody
        else's view. This is the one that would be invisible: the number simply reads higher.

   AND BOTH HAD A REAL DEFECT BEHIND THEM.

   On (1): `POST /api/assistant/attachments` documents itself as "the universal composer attachment
   door … later turns receive only the bounded material context". They received nothing.
   `_conversationMaterialContext` gated on `_materialFor`, which resolves a material through the
   OBJECT it hangs on (`_allObjectsFor`), and a conversation is not an object — so for the ordinary
   case, a document attached to a chat, it returned null on every turn. Asking "what does this say?"
   reached the deterministic dead end and answered "I don't have enough authorised evidence to answer
   that yet" about a file the person was looking at while they looked at it.

   On (2): nothing. Material has never touched `applyProposals`, and section C is here to keep it
   that way rather than to report a repair.

   Section E is the control. A suite that proves a document changes nothing would pass if the
   document had not been stored at all, so it proves the document IS there and IS reachable.

   Run: node scripts/attachment-boundary-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken,
        groupCandidates, _noteGroupCandidates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'atb';
const SQUAD = Array.from({ length: 14 }, (_, i) => 'p' + (i + 1));
const users = {
  coach: { id: 'coach', name: 'Coach', email: 'c@atb.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'] },
  // A coach of a DIFFERENT squad in the same tenant: every id resolves for them, and only the
  // audience boundary stands between them and somebody else's document.
  other: { id: 'other', name: 'Reserves Coach', email: 'o@atb.io', role: 'coach', orgCode: C,
    status: 'active', leadershipNodeIds: ['res'], assignedNodeIds: ['res'] },
};
for (const id of SQUAD) users[id] = { id, name: id.toUpperCase(), email: `${id}@atb.io`,
  role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['first'] };

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: {
    first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
      memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] },
    res: { nodeId: 'res', name: 'Reserves', parentId: null, childNodeIds: [],
      memberIds: ['other'], leaderIds: ['other'] },
  } },
});
_rebuildEmailIndex();

for (const id of SQUAD.slice(0, 5)) {
  _noteGroupCandidates(C, id, `member:${id}`, [{ id: 'at_' + id, level: 'observation',
    text: 'talking drops off after we lose',
    sourceSpan: 'nobody on our team talks after a loss',
    concerns: 'group', originRef: 'oa_' + id, originKind: 'direct_observation', turnId: 'ta_' + id }],
    'communication', 'Communication after results');
}

/* A document that says, in as many words, the thing the group is investigating — and says it with
   more apparent authority than any of the five people did. If a document could ever corroborate,
   this is the one that would. */
const DOC = [
  'Post-match debrief review',
  '',
  'We reviewed how the squad talks after difficult results across the season.',
  '',
  'What we looked at',
  '',
  'Sessions run by the players themselves produced more contributions than sessions led by staff.',
  '',
  'What it does not show',
  '',
  'Attendance was the same in both. The review does not establish why the difference exists.',
].join('\n');

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C, who === 'coach' || who === 'other' ? 'coach' : 'member')}`,
                      'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const theInquiry = async who => (((await call('GET', '/api/group/first/inquiry', undefined, who)).j || {})
    .inquiries || []).find(i => ((i.topic || {}).canonicalConcept) === 'communication') || {};
  const say = (text, conversationId, who) =>
    call('POST', '/api/assistant/turn', { text, conversationId }, who)
      .then(r => String((((r.j || {}).response) || {}).responseText || ''));

  const fingerprint = i => JSON.stringify({
    band: (i.confidence || {}).band, score: (i.confidence || {}).score,
    origins: i.independentOrigins, contributors: i.contributors,
    hypothesis: i.hypothesis, standing: (i.hypothesisStanding || {}).supportedBy,
    readiness: (i.readiness || {}).state,
  });

  try {
    /* ══ A — THE SITUATION, BEFORE ANY DOCUMENT ════════════════════════════════════════════ */
    console.log('\n  A — FIVE PEOPLE, FIVE ORIGINS, AND NOTHING ATTACHED');
    for (const id of SQUAD.slice(0, 5)) {
      const c = (groupCandidates[C] || []).find(x => x.contributorId === id && x.status === 'detected');
      if (c) await call('POST', '/api/group/first/contribute', { candidateId: c.candidateId, valence: 'worth_attention' }, id);
    }
    const before = await theInquiry('coach');
    ok('AT-A1 the question rests on five independent origins',
      before.independentOrigins === 5 && (before.confidence || {}).band === 'supported');
    const fpBefore = fingerprint(before);

    /* ══ B — THE DOCUMENT ARRIVES, WITH NO MODEL ANYWHERE ══════════════════════════════════ */
    console.log('\n  B — A COACH ATTACHES A REVIEW, WITH NO PROVIDER REACHABLE');
    const up = await call('POST', '/api/assistant/attachments', { text: DOC, title: 'Debrief review' }, 'coach');
    ok('AT-B1 it is accepted and held', up.status === 200 && !!up.j.materialId && up.j.parts >= 2);
    /* THE UPLOAD SAYS WHAT IT DID TO THE RECORD, which is nothing, in the response itself rather
       than leaving the person to infer it from silence. */
    ok('AT-B2 …and the receipt states its epistemic effect outright: none',
      up.j.epistemicEffect === 'none' && /not evidence/i.test(String(up.j.note || '')));
    const conv = up.j.conversationId;

    console.log('\n  B2 — AND IT IS USABLE, WHICH IS THE HALF THAT WAS BROKEN');
    const said = await say('What does this say?', conv, 'coach');
    /* THE DEFECT, PINNED. This exact sentence is what the product used to answer about a document
       the person had attached seconds earlier. It is a true statement about the retrieval index
       delivered as a statement about what the product knows, and a coach cannot tell them apart. */
    ok('AT-B3 the reply is not the old dead end about having no authorised evidence',
      !/don't have enough authorised evidence/i.test(said));
    ok('AT-B4 …it names the document it is holding',
      /Debrief review/i.test(said));
    ok('AT-B5 …and says how many parts it is in, which is the document describing itself',
      /\d+ parts|one part/i.test(said));
    /* AND IT DOES NOT PRETEND TO HAVE READ IT. The line between "I hold this" and "here is what it
       argues" is the whole honesty of the models-off answer. */
    ok('AT-B6 …while saying plainly that this is not a reading of it',
      /not my reading of it|describing itself/i.test(said));
    ok('AT-B7 …and naming what is missing and why, rather than going quiet',
      /reasoning engine/i.test(said));
    ok('AT-B8 …and repeating that it is external material rather than evidence about anyone',
      /external material/i.test(said) && /not.*evidence/i.test(said));

    /* ══ C — AND IT CHANGED NOTHING ABOUT WHAT IS KNOWN ════════════════════════════════════
       The laundering attack. The document says the squad's own thing back at them, with a title. */
    console.log('\n  C — AND THE QUESTION IS EXACTLY AS WELL EVIDENCED AS IT WAS');
    const after = await theInquiry('coach');
    ok('AT-C1 the origin count did not move — a document is not a sixth person',
      after.independentOrigins === 5);
    ok('AT-C2 …the confidence band and score did not move',
      (after.confidence || {}).band === (before.confidence || {}).band
      && (after.confidence || {}).score === (before.confidence || {}).score);
    ok('AT-C3 …the document did not become a candidate explanation',
      after.hypothesis === null && (after.alternatives || []).length === 0);
    ok('AT-C4 …and nothing empirical moved at all, field by field',
      fingerprint(after) === fpBefore);

    /* AND THE HALF A RE-READ CANNOT SEE. C1-C4 read the inquiry after the upload, which proves
       there is no READ-time laundering and stops there: contributions are admitted when they
       ARRIVE, so a document that only became a signal during admission would leave every
       assertion above green. The sister suite (org-context-boundary) learned this from a mutation
       that stayed green through six assertions and took out its control instead. So somebody
       contributes AFTER the document is on the record, admission runs once more with the material
       store full, and the count must rise by exactly one — for the person, not for the PDF. */
    console.log('\n  C1b — AND ADMISSION RUNNING WITH THE DOCUMENT ALREADY ON THE RECORD');
    _noteGroupCandidates(C, 'p6', 'member:p6', [{ id: 'at_p6', level: 'observation',
      text: 'talking drops off after we lose',
      sourceSpan: 'nobody on our team talks after a loss',
      concerns: 'group', originRef: 'oa_p6', originKind: 'direct_observation', turnId: 'ta_p6' }],
      'communication', 'Communication after results');
    const c6 = (groupCandidates[C] || []).find(x => x.contributorId === 'p6' && x.status === 'detected');
    if (c6) await call('POST', '/api/group/first/contribute', { candidateId: c6.candidateId, valence: 'worth_attention' }, 'p6');
    const afterSix = await theInquiry('coach');
    ok('AT-C1b a sixth PERSON moves it, and moves it by exactly one',
      afterSix.independentOrigins === 6 && afterSix.contributors === 6);
    ok('AT-C1c …so the document did not slip in as a seventh account during admission',
      afterSix.independentOrigins === before.independentOrigins + 1);
    ok('AT-C1d …and it still explains nothing, however authoritative it looked',
      afterSix.hypothesis === null && (afterSix.alternatives || []).length === 0);

    console.log('\n  C2 — AND ATTACHING IT AGAIN IS NOT TWO DOCUMENTS AGREEING');
    const up2 = await call('POST', '/api/assistant/attachments', { text: DOC, title: 'Debrief review' }, 'coach');
    ok('AT-C5 the same bytes are the same material, not a second one',
      up2.status === 200 && up2.j.materialId === up.j.materialId);
    /* Measured against the picture as it stands NOW, which includes the sixth person from C1b.
       Comparing against the section-A fingerprint would assert that a legitimate contribution had
       also changed nothing, which is the opposite of the law and would go red for the right
       reason at the wrong assertion. */
    ok('AT-C6 …and the second upload still moved nothing',
      fingerprint(await theInquiry('coach')) === fingerprint(afterSix));

    /* ══ D — AND IT IS THIS COACH'S, NOT THE ORGANISATION'S ════════════════════════════════ */
    console.log('\n  D — ANOTHER LEADER IN THE SAME TENANT CANNOT REACH IT');
    const theirs = await say('What does this say?', conv, 'other');
    ok('AT-D1 a leader of another squad, handed the conversation id, is told nothing about it',
      !/Debrief review/i.test(theirs) && !/player-led|debrief review/i.test(theirs));
    const direct = await call('GET', `/api/materials/${up.j.materialId}`, undefined, 'other');
    ok('AT-D2 …and asking for the material by id is a 404, not a 403 that confirms it exists',
      direct.status === 404);
    /* AND THE PRIVATE DOCUMENT DID NOT CHANGE WHAT THE OTHER LEADER IS TOLD ELSEWHERE. This is the
       "reason over the admissible world" law: not reasoning globally and censoring at the edge. */
    const theirState = await call('GET', '/api/group/res/state', undefined, 'other');
    ok('AT-D3 …and their own squad\'s picture carries no trace of it',
      !/debrief|player-led/i.test(JSON.stringify(theirState.j || {})));

    /* ══ E — THE CONTROL ═══════════════════════════════════════════════════════════════════
       Every assertion in C would also pass if the upload had silently failed and there were no
       document at all. This is the proof that there IS one and that it IS reachable. */
    console.log('\n  E — THE CONTROL: THE DOCUMENT REALLY IS THERE');
    const mine = await call('GET', `/api/materials/${up.j.materialId}`, undefined, 'coach');
    ok('AT-E1 its owner can still open it', mine.status === 200);
    ok('AT-E2 …and section C was measuring a document that exists, not an upload that failed',
      /Debrief review/i.test(said) && up.j.parts >= 2);

  } catch (e) { fail++; console.error('  FAIL attachment suite threw:', e && e.stack); }

  server.close();
  console.log(`\nattachment-boundary-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
