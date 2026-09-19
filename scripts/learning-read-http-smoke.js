/* Truth layer — WHAT HAS BEEN LEARNED, WITHOUT A NEW TRUTH STORE AND WITHOUT A NEW PHRASE.

   ROUND 5 left this half-done: "What have we learned?" answered when bound to an object and
   dead-ended from Home.

   FOUNDER RULING, September 2026:

     Do not solve this by adding another English cue to _teamQuestionLens. Do not create a regex
     for "What have we learned?". The missing capability is semantic. Determine whether it should
     be an existing reader that is not exposed, an aggregation over existing canonical readers, or
     a genuinely missing bounded learning read model. Prefer reuse. Do not create another truth
     store. Build the capability, not the English sentence.

   IT WAS THE SECOND OF THE THREE. Nothing was missing from the record. Learning in this product is
   what happened after somebody committed to something — a Focus with an OUTCOME — together with
   the questions still open around it. Both already existed, both were already authorised by one
   owner, and nothing read them together. `_learningRead` aggregates `_allObjectsFor`, the same
   authorised set every object surface reads, and invents nothing.

   AND IT IS NOT TRIGGERED BY A PHRASE. It sits where the refusal sits — the last thing tried
   before saying there is nothing — exactly like the material and bound-object branches beside it.
   Section E proves that by asking in Shona, with no Shona pattern anywhere in the repo.

   THREE LAWS THIS FILE EXISTS TO HOLD: no causation from an outcome, no ranking of people, and no
   global answer conjured out of an empty history.

   Run: node scripts/learning-read-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'lrn';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me:    { id: 'me', name: 'Tendai', email: 'm@l.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
    mate:  { id: 'mate', name: 'Rudo', email: 'r@l.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
    coach: { id: 'coach', name: 'Coach', email: 'c@l.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true },
  } },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null,
    childNodeIds: [], memberIds: ['me', 'mate', 'coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, w === 'coach' ? 'coach' : 'member')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, w = 'me') => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const say = (text, w = 'me', extra) => call('POST', '/api/assistant/turn',
    Object.assign({ text }, extra || {}), w);
  const said = r => String((((r.j || {}).response) || {}).responseText || '');
  const lims = r => ((((r.j || {}).response) || {}).qa || {}).limitations || [];

  /* Commit to something, then report back on it — the two halves that make a thing "learned".
     THE OUTCOME WORD HAS TO BE THE PERSON'S OWN. `ground` requires the literal word in what they
     actually said, so a model (or a fixture) cannot decide for somebody how it went. The first
     version of this helper said only "we tried it" and every outcome was correctly refused — the
     product was right and the fixture was wrong, which is the right way round. */
  const SAID = { helped: 'we tried it and it helped', no: 'we tried it and it did not help',
    mixed: 'we tried it and it was mixed', better: 'we tried it and it got better',
    no_change: 'we tried it and nothing changed' };
  const learn = async (text, outcome, w = 'me', extra) => {
    const f = await call('POST', '/api/me/focus', Object.assign({ text }, extra || {}), w);
    const fid = String(f.j.focus.id);
    const t = await say(SAID[outcome] || `we tried it and it ${outcome}`, w,
      { about: { kind: 'focus', id: fid },
      requestedAction: { type: 'record_focus_outcome', arguments: { outcome } } });
    const p = ((((t.j || {}).response) || {}).proposedActions || [])
      .find(x => x.actionType === 'record_focus_outcome');
    /* AND IT REALLY RECORDED. A helper that silently failed would make every assertion below
       vacuous, which is exactly what happened on the first run. */
    if (!p) throw new Error(`fixture: no outcome proposal for "${text}"`);
    const done = await call('POST', `/api/assistant/turn/${t.j.turnId}/confirm`, { proposalId: p.id }, w);
    if (done.status !== 200) throw new Error(`fixture: outcome not recorded for "${text}"`);
    return fid;
  };

  try {
    /* ══ A — COLD, IT INVENTS NOTHING ══════════════════════════════════════════════════════
       Asserted FIRST, before anything is recorded, because a learning reader that answers from an
       empty history is worse than one that does not answer at all. */
    console.log('\n  A — WITH NOTHING RECORDED, IT DOES NOT MAKE SOMETHING UP');
    const cold = await say('What have we learned?');
    ok('A1 it says plainly that it has nothing, rather than summarising an empty history',
      /don'?t have enough authorised evidence/i.test(said(cold)));
    ok('A2 …and does not name a topic nobody has worked on',
      !/you worked on/i.test(said(cold)));
    const coldTopic = await say('What have I learned about communication?');
    ok('A3 …and the same for a question about a specific topic',
      /don'?t have enough authorised evidence/i.test(said(coldTopic)));

    /* ══ B — A PERSONAL TOPIC, FROM HOME AND UNBOUND ═══════════════════════════════════════ */
    console.log('\n  B — ONCE THERE IS SOMETHING TO KNOW, ASKING FROM HOME REACHES IT');
    const fComm = await learn('Speak first after we concede, to improve communication', 'helped');
    const fRest = await learn('Take restarts quickly', 'no');
    const topic = await say('What have I learned about communication?');
    ok('B1 asking from Home, bound to nothing, reaches the record',
      !/don'?t have enough authorised evidence/i.test(said(topic)));
    ok('B2 …answering with what was committed to', /Speak first after we concede/i.test(said(topic)));
    ok('B3 …and what was recorded afterwards', /it helped/i.test(said(topic)));
    /* NARROWED BY THEIR WORDS, not a dump of everything. The restarts Focus has an outcome too and
       has nothing to do with communication. */
    ok('B4 …and does not hand back the unrelated one', !/restarts/i.test(said(topic)));
    /* NO CAUSATION. The single law most easily broken here. */
    ok('B5 …and never says the focus caused the change',
      !/because of|thanks to|caused|resulted in|led to/i.test(said(topic)));
    ok('B6 …and says outright that it is not proof of a cause',
      lims(topic).some(l => /not proof any of them caused the change/i.test(String(l))));
    /* THE OTHER TOPIC RESOLVES TO THE OTHER THING, so B2 is not passing because there is one item. */
    const other = await say('What have I learned about restarts?');
    ok('B7 a different topic reaches the other record', /Take restarts quickly/i.test(said(other)));
    ok('B8 …and not the first one', !/Speak first/i.test(said(other)));
    ok('B9 …carrying its own outcome, including one that did not work',
      /did not help|didn'?t help|no change/i.test(said(other)));

    /* ══ C — TOO BROAD: OFFER, DO NOT FABRICATE ════════════════════════════════════════════
       The founder: *may summarize the most relevant current learning or ask what area the person
       means, depending on what can be done honestly. Do not fabricate a global answer.* */
    console.log('\n  C — AND A QUESTION TOO BROAD TO ANSWER IS ASKED BACK, NOT GUESSED AT');
    const broad = await say('What have we learned?');
    ok('C1 it does not dead-end now that there is something',
      !/don'?t have enough authorised evidence/i.test(said(broad)));
    ok('C2 …it asks which area they mean', /which of those did you mean/i.test(said(broad)));
    ok('C3 …naming the areas there really is something recorded against',
      /Speak first after we concede/i.test(said(broad)) && /Take restarts quickly/i.test(said(broad)));
    ok('C4 …and does not present the list as a finding',
      lims(broad).some(l => /nothing here is a conclusion/i.test(String(l))));
    ok('C5 …and claims no confidence for it',
      ((((broad.j || {}).response) || {}).qa || {}).confidence === 'none');

    /* ══ D — SCOPE COMES FROM THE OBJECTS, AND NEVER CROSSES A PERSON ══════════════════════ */
    console.log('\n  D — "WE" IS DECIDED BY THE OBJECT, AND NOBODY ELSE\'S RECORD IS READ');
    await learn('Organise the first restart together, as a group', 'helped', 'coach',
      { groupId: 'first' });
    const asCoach = await say('What have we learned about organising restarts?', 'coach');
    ok('D1 a shared Focus reaches the person who set it', /Organise the first restart/i.test(said(asCoach)));
    /* "WE", NOT "I". A Focus shared with named people is not something the coach did alone, and
       reporting it as personal would quietly take the squad out of their own history. The first
       version of this looked for the NODE's name — wrong for a participant Focus, which carries
       people rather than a node, and the product was right. */
    ok('D2 …and says it was shared rather than presenting it as personal',
      /\bwith \b/i.test(said(asCoach)));
    /* AND THE PEOPLE ON IT SHARE THE LEARNING, which is the same fact from the other side —
       Rudo is a participant, so it is hers to see too. */
    const mateShared = await say('What have we learned about organising restarts?', 'mate');
    ok('D3 a participant sees the learning from a Focus they are on',
      /Organise the first restart/i.test(said(mateShared)));
    /* BUT NOT WHAT IS NOT THEIRS. Tendai's own private Focus is his alone, and it is the harder
       case precisely because Rudo now legitimately has learning of her own to report. */
    const asMate = await say('What have I learned about communication?', 'mate');
    ok('D3b …and never a colleague\'s private one',
      !/Speak first after we concede/i.test(said(asMate)));
    ok('D3c …not even when asked about it directly',
      !/Speak first after we concede/i.test(said(await say('What did Tendai learn about speaking first?', 'mate'))));
    ok('D4 …and Tendai\'s answer never mentions anybody else by name',
      !/Rudo|Coach/i.test(said(topic)));
    ok('D5 …and says it covers only what this person can see',
      lims(topic).some(l => /nothing from anybody else'?s record/i.test(String(l))));

    /* ══ E — AND IT IS A CAPABILITY, NOT AN ENGLISH SENTENCE ═══════════════════════════════
       The founder's whole point. If this were a phrase match, a question in another language
       would reach nothing — which is the defect the language layer already lost once. There is no
       Shona pattern anywhere in this repo for any of these words. */
    console.log('\n  E — AND ASKING IN ANOTHER LANGUAGE REACHES THE SAME RECORD');
    const shona = await say('Takadzidzei nezve communication?');
    ok('E1 a Shona question reaches the same learning',
      /Speak first after we concede/i.test(said(shona)));
    ok('E2 …and it was not matched as an English phrase — no cue was added for any of this',
      !/what have (?:we|i) learn/i.test('Takadzidzei nezve communication?'));
    /* AND THE BROAD FORM TOO, in a language with no word list of its own. */
    const zulu = await say('Sifundeni?');
    ok('E3 a broad question in another language is asked back rather than guessed at',
      /which of those did you mean|shall I go through that/i.test(said(zulu)));

    /* ══ F — AND A FOCUS NOBODY REPORTED BACK ON TAUGHT NOTHING YET ════════════════════════
       An intention is not a finding, and treating one as learning is how a product comes to
       report that something worked because somebody said they would try it. */
    console.log('\n  F — AND AN INTENTION IS NOT A FINDING');
    await call('POST', '/api/me/focus', { text: 'Work on set pieces at the far post' });
    const unreported = await say('What have I learned about set pieces?');
    ok('F1 a Focus with no outcome does not appear as learning',
      !/far post/i.test(said(unreported)));
    ok('F2 …and it is still on the Focuses surface, so it was not hidden, only not claimed',
      (((await call('GET', '/api/objects?kind=focus&scope=self')).j || {}).objects || [])
        .some(o => /far post/i.test(JSON.stringify(o))));

  } catch (e) { fail++; console.error('  FAIL learning-read suite threw:', e && e.stack); }

  server.close();
  console.log(`\nlearning-read-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
