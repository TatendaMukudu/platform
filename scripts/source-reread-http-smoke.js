/* Truth layer — GOING BACK TO THE SOURCE, AND WHAT DELETING IT REALLY DOES.

   FOUNDER, September 2026:

     Retained source material exists partly so IntelliQ can inspect it again. Use the Highlanders
     statistics screenshot acceptance case. Attach it. Discuss it. Continue for several turns.
     Later ask: "What was their home record again?" If that information was not preserved in the
     initial description, IntelliQ must be capable of re-reading the authorized source rather than
     fabricating an answer or claiming the information is unavailable while the source still
     exists.

   THE TWO HALVES ARE DIFFERENT PROBLEMS, and this file keeps them apart because the honest answer
   differs:

     A DOCUMENT carries its own words. The parts are all held; only the CONTEXT handed to a turn is
     capped, so a fact in part nineteen of twenty was present the whole time and never offered.
     Re-reading it is deterministic retrieval — `material.findIn` — and needs no provider at all.

     A PICTURE carries a DESCRIPTION: one model's account, written when it arrived, answering a
     question nobody had asked yet. The answer may simply not be in it. Looking again needs vision,
     which is a provider capability. So the product must distinguish "the original is gone" from
     "the original is here and I cannot look right now" — and must not guess from the description.

   AND THEN DELETION. The founder's rule: the bytes are inaccessible, the model cannot re-inspect
   them, the UI does not pretend otherwise, the identifier is not a bypass, and IntelliQ does not
   fabricate details that existed only in the deleted source.

   Run: node scripts/source-reread-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

/* VISION IS STUBBED AT THE BOUNDARY, and `SEEN` captures what crossed it — so "did it re-read the
   picture" is answered by what reached the provider, not by prose. Toggled per case, because the
   whole point of section C is that the product says a DIFFERENT true thing when it is off. */
const gateway = require('../ai/gateway.js');
let VISION = false;
const SEEN = [];
gateway.enabled = () => true;
gateway.deterministicOnly = () => true;   // prose stays deterministic; only vision is in question
gateway.canUnderstand = k => VISION && k === 'image';
gateway.understand = async a => { SEEN.push(a); return 'A league table. Highlanders: home won 6 drew 3 lost 1.'; };

const S = require('../server.js');
const material = require('../ai/material.js');
const mk = require('./lib/make-office.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, materialSource } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const C = 'srr';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me: { id: 'me', name: 'Tendai', email: 'm@s.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
    mate: { id: 'mate', name: 'Rudo', email: 'r@s.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
  } },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null,
    childNodeIds: [], memberIds: ['me', 'mate'], leaderIds: [] } } },
});
_rebuildEmailIndex();

/* A LONG DOCUMENT ON PURPOSE, AND LONG ENOUGH TO MATTER. The first version of this had forty
   short paragraphs, which came to 6k characters — comfortably INSIDE `CONTEXT_CAP`, so A3 failed
   and was right to: the whole document was in the context and "it was outside the cap" was not the
   reason anything passed. Each part is now a realistic paragraph, so the total genuinely exceeds
   the cap and the home record really does sit past where a turn's context stops. */
const FILLER = Array.from({ length: 60 }, (_, i) =>
  `Section ${i + 1}. Ordinary notes about the season: travel to away fixtures, the training week `
  + `either side of them, availability, and how the squad rotated. Nothing in this part concerns `
  + `results at home or away; it is background written up after the ${i + 1}th round of matches, `
  + `covering logistics, minor knocks, and who trained fully on which day of that week.`);
const STATS = [...FILLER.slice(0, 40),
  'Home record: won 6, drew 3, lost 1.',
  'Away record: won 2, drew 4, lost 4.',
  ...FILLER.slice(40)];

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, 'member')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, w = 'me') => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, ct: r.headers.get('content-type') || '',
      j: (r.headers.get('content-type') || '').includes('json') ? await r.json().catch(() => null) : null,
      buf: (r.headers.get('content-type') || '').includes('json') ? null : Buffer.from(await r.arrayBuffer()) }));
  const say = (text, conversationId, extra) => call('POST', '/api/assistant/turn',
    Object.assign({ text, conversationId }, extra || {}));
  const said = r => String((((r.j || {}).response) || {}).responseText || '');

  try {
    /* ══ A — A DOCUMENT: THE ANSWER WAS ALWAYS THERE, OUTSIDE THE CAP ══════════════════════ */
    console.log('\n  A — THE HIGHLANDERS STATISTICS, RE-READ SEVERAL TURNS LATER');
    const up = await call('POST', '/api/assistant/attachments',
      { filename: 'highlanders-stats.txt', text: STATS.join('\n\n') });
    ok('A1 the statistics attach', up.status === 200 && !!up.j.materialId);
    const cid = String(up.j.conversationId);
    const mid = String(up.j.materialId);
    ok('A2 …in many parts, so the fact is genuinely deep in it', up.j.parts >= 60);
    /* THE CONTROL THAT MAKES THIS REAL. If the capped context already carried the home record,
       answering would prove nothing about re-reading. */
    const ctx = material.contextFor((S.materials[C] || {})[mid]);
    /* THE CONTROL THAT MAKES SECTION A REAL. If the capped context already carried the home
       record, answering would prove nothing about going back to the source. */
    ok('A3 …and the CAPPED context a turn is handed does NOT contain it',
      ctx.partial === true && !/Home record/i.test(String(ctx.text)));
    ok('A3b …so the answer below can only have come from searching the whole document',
      (S.materials[C] || {})[mid].sections.some(x => /Home record/i.test(String(x.text))));

    /* SEVERAL TURNS OF ORDINARY CONVERSATION, as the founder asked — so this is not "ask about the
       thing you just uploaded". */
    await say('interesting, that is a lot of travel', cid);
    await say('we have been inconsistent all season', cid);
    await say('the away trips are brutal', cid);
    const back = await say('What was their home record again?', cid);
    ok('A4 asking several turns later does not dead-end',
      !/don'?t have enough authorised evidence/i.test(said(back)));
    ok('A5 …and the answer is the document\'s own words', /won 6, drew 3, lost 1/.test(said(back)));
    ok('A6 …attributed to the file it came out of', /highlanders-stats\.txt/.test(said(back)));
    /* NOT FABRICATED, AND SAID SO. What came back is retrieval; the limitation states that. */
    const lim = ((((back.j || {}).response) || {}).qa || {}).limitations || [];
    ok('A7 …and it says these are parts of that file, in its own words',
      lim.some(l => /in its own words/i.test(String(l))));
    ok('A8 …and that external material is not evidence about anybody',
      lim.some(l => /not evidence about a person or the organisation/i.test(String(l))));
    /* AND IT DOES NOT ANSWER WHAT THE DOCUMENT DOES NOT SAY. */
    const absent = await say('What was the stadium catering budget?', cid);
    ok('A9 a question the document does not answer is not answered from it',
      !/catering/i.test(said(absent).replace(/stadium catering budget/i, '')));

    /* ══ B — AND A DECK, BY SLIDE ═════════════════════════════════════════════════════════ */
    console.log('\n  B — AND A DECK COMES BACK BY SLIDE, NOT AS A WALL');
    const deck = await call('POST', '/api/assistant/attachments',
      { filename: 'scouting.pptx', file: { name: 'scouting.pptx', data: mk.pptx([
        ['Overview', 'the season so far'],
        ['Home form', 'won six drew three lost one at home'],
        ['Away form', 'won two drew four lost four away'],
      ], { deflate: true }).toString('base64') } });
    const dAsk = await say('What was the home form again?', String(deck.j.conversationId));
    ok('B1 the deck answers from the slide that bears on it', /won six drew three/.test(said(dAsk)));
    ok('B2 …and names the slide, which is a thing a person can go and check',
      /Slide 2/.test(said(dAsk)));
    ok('B3 …without handing back the whole deck', !/Overview/.test(said(dAsk)));

    /* ══ C — A PICTURE: THE TWO SITUATIONS, KEPT APART ═════════════════════════════════════ */
    console.log('\n  C — A PICTURE IS A DESCRIPTION, AND THE ORIGINAL IS STILL THERE');
    VISION = true;
    const shot = await call('POST', '/api/assistant/attachments',
      { filename: 'table.png', image: { mimetype: 'image/png', data: PNG } });
    ok('C1 a screenshot attaches and its original is kept',
      shot.status === 200 && shot.j.imageRetained === true);
    const pid = String(shot.j.materialId);
    const pconv = String(shot.j.conversationId);
    await say('that is the league table', pconv);
    await say('we are mid-table then', pconv);

    /* WITH VISION AVAILABLE: it offers to look again rather than answering from the note. */
    const withVision = await say('What was their goal difference?', pconv);
    ok('C2 with vision available it offers to look at the picture again',
      /look at .*again/i.test(said(withVision)));
    ok('C3 …and says it will not answer from the note it made', /rather than answering from the note/i.test(said(withVision)));

    /* WITH VISION OFF — the pilot's own state — it must say the ORIGINAL IS STILL HERE. Claiming
       the information is unavailable would be false while the file sits in the store. */
    VISION = false;
    const noVision = await say('What was their goal difference exactly?', pconv);
    ok('C4 with vision off it does NOT claim the information is simply unavailable',
      !/don'?t have enough authorised evidence/i.test(said(noVision)));
    ok('C5 …it says the picture is still here and can be looked at again',
      /still here/i.test(said(noVision)) && /looked at again/i.test(said(noVision)));
    ok('C6 …says which thing is missing rather than blaming the file',
      /reasoning engine/i.test(said(noVision)));
    ok('C7 …and refuses to guess it from the description',
      /not going to guess/i.test(said(noVision)));
    const cLim = ((((noVision.j || {}).response) || {}).qa || {}).limitations || [];
    ok('C8 …and the limitation says the original is retained and re-readable',
      cLim.some(l => /retained and can be re-read/i.test(String(l))));

    /* ══ D — "USE THIS AS EVIDENCE" STILL REACHES THE GOVERNED PATH ════════════════════════ */
    console.log('\n  D — AND IT CAN STILL BECOME EVIDENCE, THROUGH THE GOVERNED OWNER');
    const f = await call('POST', '/api/me/focus', { text: 'Fix the away trips' });
    const fid = String(f.j.focus.id);
    const t = await say('use this as evidence', cid, { about: { kind: 'focus', id: fid },
      requestedAction: { type: 'attach_material', arguments: { materialId: mid } } });
    const prop = ((((t.j || {}).response) || {}).proposedActions || [])
      .find(p => p.actionType === 'attach_material');
    ok('D1 it is proposed rather than done', !!prop);
    const done = await call('POST', `/api/assistant/turn/${t.j.turnId}/confirm`, { proposalId: prop.id });
    ok('D2 …and confirming reaches the governed owner with THAT material',
      done.status === 200 && String(done.j.materialId) === mid);
    ok('D3 …and the Focus lists it',
      (((await call('GET', `/api/objects/focus/${fid}/materials`)).j || {}).materials || [])
        .some(m => String(m.materialId) === mid));

    /* ══ E — DELETION MEANS THE MODEL CANNOT LOOK AGAIN EITHER ═════════════════════════════ */
    console.log('\n  E — DELETING THE SOURCE REALLY STOPS IT BEING RE-READ');
    ok('E1 the picture is openable before deletion',
      (await call('GET', `/api/materials/${pid}/source`)).status === 200);
    ok('E2 deleting it is allowed for the person who attached it',
      (await call('DELETE', `/api/materials/${pid}/source`)).status === 200);
    ok('E3 …the bytes really leave the store', !((materialSource[C] || {})[pid]));
    const openAfter = await call('GET', `/api/materials/${pid}/source`);
    ok('E4 …opening it says GONE rather than never-existed', openAfter.status === 410);
    ok('E5 …and the identifier is not a way round that',
      (await call('GET', `/api/materials/${pid}/source`, undefined, 'mate')).status === 404
      && (await fetch(base + `/api/materials/${pid}/source`)).status !== 200);
    /* THE ONE THAT MATTERS MOST. With vision back on, the product must not offer to look again at
       something that is gone — and must not quietly re-read it either. */
    VISION = true;
    SEEN.length = 0;
    const afterDelete = await say('What was their goal difference exactly?', pconv);
    ok('E6 it no longer offers to look at the picture again',
      !/look at .*again/i.test(said(afterDelete)) && !/still here/i.test(said(afterDelete)));
    ok('E7 …and nothing was sent to the vision model', SEEN.length === 0);
    /* AND IT DOES NOT FABRICATE WHAT ONLY THE DELETED PICTURE HELD. */
    ok('E8 …and it does not invent a goal difference',
      !/goal difference (?:was|is) [-+]?\d/i.test(said(afterDelete)));

    /* ══ F — BUT THE HISTORY IS NOT REWRITTEN ══════════════════════════════════════════════ */
    console.log('\n  F — WHILE EVERYTHING THAT WAS DERIVED FROM IT STILL STANDS');
    const stillThere = await call('GET', `/api/materials/${pid}`);
    ok('F1 the material still exists', stillThere.status === 200);
    ok('F2 …still holds what was read from the picture',
      (stillThere.j.sections || []).length > 0);
    ok('F3 …and carries the tombstone rather than looking as if there never was one',
      stillThere.j.sourceMedia.because === 'deleted'
      && stillThere.j.sourceMedia.label === 'Source attachment deleted');
    ok('F4 the evidence relationship made earlier is untouched',
      (((await call('GET', `/api/objects/focus/${fid}/materials`)).j || {}).materials || [])
        .some(m => String(m.materialId) === mid));
    /* AND THE DOCUMENT'S OWN SOURCE IS UNAFFECTED BY THE PICTURE'S DELETION. */
    ok('F5 deleting one source did not touch another',
      (await call('GET', `/api/materials/${mid}`)).status === 200);

  } catch (e) { fail++; console.error('  FAIL source-reread suite threw:', e && e.stack); }

  server.close();
  console.log(`\nsource-reread-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
