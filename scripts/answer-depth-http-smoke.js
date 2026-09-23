/* Truth layer — CONCISE FIRST, MATERIALLY DEEPER WHEN THE SHORT ANSWER WAS NOT ENOUGH.

   ACCEPTANCE MATRIX 15. The rule existed: `ai/composer.js` tells the model to "start concise
   (roughly 120 words or less) unless they explicitly ask for depth, evidence, history, or a full
   walkthrough. Then go materially deeper rather than repeating the short answer."

   It lived ONLY there. With models off — the pilot's configuration — a coach standing in an
   inquiry who asked "What is going on with the last twenty?", then "Why? Show me the evidence.",
   then "Walk me through the full history and everything that supports it." received the same 186
   characters three times. Measured on the real path before this file existed.

   THE TRIGGER IS REPETITION, NOT VOCABULARY. The call site this sits on carries a standing
   decision: matching English question cues there "would rebuild the allowlist problem one layer
   down". It would also work in English only. Asking again while standing in the same object IS
   the signal that the short answer was not enough, in any language — so depth is chosen by
   whether the concise read has already been said in this conversation.

   AND DEPTH IS NOT PADDING. `_objectSelfRead` returns null for a layer that would add nothing, so
   "there is no more on the record" stays a different answer from "here is more", and the second
   layer never restates the first under a new label.

   Run: node scripts/answer-depth-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'dep', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5'];
/* THE WORDS NOBODY ELSE MAY SEE. Distinctive enough that finding them in any answer is
   unmistakable: a deeper read reports the SHAPE of the evidence and never its content. */
const SAID_BY_A_PLAYER = 'my hamstring has been tight since the cup game';
const SIG = (w, n) => ({ kind: 'observation', status: 'active', source: w, originRef: `o_${w}_${n}`,
  at: NOW - 9 * DAY, turnId: `t_${w}_${n}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${w}_${n}`, contributedBy: w, text: SAID_BY_A_PLAYER });

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma', orgMode: 'sports' } },
  orgUsers: { [C]: Object.fromEntries([
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@d.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['n'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Dana Coach', email: 'c@d.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: [...SQUAD, 'coach'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: { 'group:n': {
    /* RICH: rival explanations, a falsifier, open questions. There is genuinely more to say. */
    q1: {
      inquiryId: 'q1', subjectRef: 'group:n',
      topic: { canonicalConcept: 'f.late', label: 'How the last twenty go' }, status: 'exploring',
      hypotheses: [
        { id: 'h1', statement: 'the legs go in the last twenty', supportRefs: SQUAD.map((w, i) => `ev_${w}_${i}`),
          challengeRefs: [], confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW },
        { id: 'h2', statement: 'we stop pressing together once we are ahead', supportRefs: [],
          challengeRefs: [], confidence: { score: 0.3, band: 'tentative' }, status: 'open', createdAt: NOW },
      ],
      leadingHypothesisId: 'h1', signals: SQUAD.map((w, i) => SIG(w, i)),
      confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
      missingSignals: [{ question: 'does it happen away from home too?' },
        { question: 'is it the same players every time?' }],
      falsifiers: [{ statement: 'we keep the ball when we start deeper' }],
      timeline: [], lastUpdatedAt: NOW,
    },
    /* THIN: one account, no falsifier, no rival explanation, no open question. Its second layer
       is therefore one true line about the shape of the evidence and nothing else — this fixture
       exists to prove the deeper read is built from what is there rather than from a template. */
    q2: {
      inquiryId: 'q2', subjectRef: 'group:n',
      topic: { canonicalConcept: 'f.throw', label: 'Long throws' }, status: 'exploring',
      hypotheses: [{ id: 'h9', statement: 'the long throw is not landing', supportRefs: [`ev_p1_0`],
        challengeRefs: [], confidence: { score: 0.5, band: 'emerging' }, status: 'open', createdAt: NOW }],
      leadingHypothesisId: 'h9', signals: [SIG('p1', 0)],
      confidence: { score: 0.5, band: 'emerging', because: [] },
      missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
    },
  } } },
  /* A FOCUS OF THE COACH'S OWN. A focus has no second layer at all — no rival explanations, no
     falsifier, no evidence shape — so `_objectSelfRead` returns null for depth 1 on it, and this
     is the fixture that exercises that path. Without it, every object here has at least one true
     thing to add and the "a deeper layer that adds nothing is not a deeper layer" guard could be
     deleted with nothing going red. */
  userAiProfiles: { [`${C}:coach`]: { focuses: [{
    id: 'f_press', text: 'Press from the first touch', status: 'active',
    createdAt: new Date(NOW - 2 * DAY).toISOString(),
  }] } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, w === 'coach' ? 'coach' : 'member')}`,
    'Content-Type': 'application/json' });
  /* ONE CONVERSATION, the way a person actually has one. Each reply's conversationId carries
     forward; a new thread is a deliberate act below, in section D. */
  const threadFor = (who) => {
    let conv = null;
    return async (text, id, kind = 'inquiry') => {
      const r = await fetch(base + '/api/assistant/turn', { method: 'POST', headers: H(who),
        body: JSON.stringify({ text, about: { kind, id }, conversationId: conv }) })
        .then(x => x.json()).catch(() => null);
      conv = (r && r.conversationId) || conv;
      return String(((r || {}).response || {}).responseText || '');
    };
  };

  try {
    console.log('\n  A — THE SHORT ANSWER COMES FIRST');
    const coach = threadFor('coach');
    const a1 = await coach('What is going on with the last twenty?', 'q1');
    ok('DP-A1 a question bound to an inquiry is answered from the record',
      /last twenty/i.test(a1) && /legs go/i.test(a1));
    ok('DP-A2 …and it is short, because this is read on a phone', a1.length < 320);
    ok('DP-A3 …and says it is the record describing itself, not a fresh reading',
      /not a fresh reading of it/i.test(a1));

    console.log('\n  B — AND ASKING AGAIN GOES DEEPER, RATHER THAN REPEATING');
    const a2 = await coach('Why? Show me the evidence.', 'q1');
    ok('DP-B1 the second answer is not the first one again', a2.trim() !== a1.trim());
    ok('DP-B2 …and is materially longer, not a reworded restatement', a2.length > a1.length + 100);
    /* THE LINE NO COMPETITOR PRODUCES. It is computed and on the card; it belongs in the answer. */
    ok('DP-B3 …carrying what would show the finding is wrong',
      /What would show this is wrong: we keep the ball when we start deeper/i.test(a2));
    ok('DP-B4 …and the shape of the evidence behind it',
      /5 separate accounts/i.test(a2) && /from 5 people/i.test(a2));
    ok('DP-B5 …while still refusing to be a fresh reading of anything',
      /not a fresh reading of it/i.test(a2));

    console.log('\n  C — AND IT NEVER REPEATS WHAT ANYBODY SAID');
    /* THE PRIVACY LAW THE DEEPER LAYER COULD MOST EASILY BREAK. Going deeper means reaching for
       the evidence, and the evidence is five people's own accounts. The shape of it is reportable;
       the words are not, and "referenced, never copied" is the whole difference. */
    ok('DP-C1 no contributor\'s own words reach the deeper answer',
      !a2.toLowerCase().includes('hamstring') && !a2.toLowerCase().includes(SAID_BY_A_PLAYER));
    ok('DP-C2 …and it says so, rather than leaving it to be noticed',
      /I do not repeat what anybody said/i.test(a2));
    ok('DP-C3 …and no contributor is named', !SQUAD.some(w => a2.includes(w))
      && !/Player [1-5]/.test(a2));

    console.log('\n  D — DEPTH BELONGS TO THE CONVERSATION, NOT TO THE OBJECT');
    /* A SECOND CONVERSATION HAS NOT BEEN TOLD ANYTHING YET, so it starts short. If depth were
       remembered on the object, a person opening a fresh thread would be dropped into the middle
       of an answer to a question they had not asked. */
    const fresh = threadFor('coach');
    const d1 = await fresh('What is going on with the last twenty?', 'q1');
    ok('DP-D1 a new conversation about the same object starts concise again', d1.trim() === a1.trim());
    /* AND IT IS PER-PERSON, because the conversation store is. */
    const player = threadFor('p2');
    const pl = await player('What is going on with the last twenty?', 'q1');
    ok('DP-D2 …and another person starts at the beginning too, having been told nothing',
      pl.length > 0 && pl.length < 320 && !/What would show this is wrong/i.test(pl));

    console.log('\n  E — A THINNER RECORD GETS A THINNER SECOND LAYER, NOT AN INVENTED ONE');
    const bare = threadFor('coach');
    const b1 = await bare('What about the long throws?', 'q2');
    ok('DP-E1 a thinner inquiry still gets its short answer', /long throw/i.test(b1));
    const b2 = await bare('Why? Show me everything you have.', 'q2');
    /* NOTHING INVENTED. This inquiry has no falsifier, no rival explanation and no open question,
       so none of those lines appear — the deeper layer is only ever what the record actually
       holds, and here that is the shape of a single account. */
    ok('DP-E2 …and asking again invents no falsifier and no rival explanation for it',
      !/What would show this is wrong/i.test(b2)
      && !/Other explanations on the record/i.test(b2));
    ok('DP-E3 …while still adding the one true thing the short answer left out',
      b2.trim() !== b1.trim() && /1 separate account, from 1 person/i.test(b2));
    /* AND THE END OF IT, WHICH IS THE THIRD ASK. Both layers have now been given, so there is
       genuinely nothing further and the honest answer says so rather than quietly serving the
       short one again — which is what it used to do, and which reads as the product forgetting. */
    const b3 = await bare('And is there anything else at all?', 'q2');
    ok('DP-E4 a third ask says plainly that this is everything, rather than shrinking back',
      /everything the record holds on this/i.test(b3) && b3.trim() !== b1.trim());
    ok('DP-E5 …and points at what would move it, which is a person adding to it',
      /has to come from somebody adding to it/i.test(b3));

    console.log('\n  F2 — A FOCUS HAS NO SECOND LAYER, AND NONE IS MANUFACTURED');
    /* THE PATH THAT PROVES THE GUARD. A focus carries no rival explanations, no falsifier and no
       evidence shape, so the deeper read would add literally nothing — and a "deeper" answer that
       adds nothing is the product padding. It must go straight to saying that is everything. */
    const fx = threadFor('coach');
    const f1 = await fx('What am I working on here?', 'f_press', 'focus');
    ok('DP-F2a a focus answers from the record', /Press from the first touch/i.test(f1));
    const f2 = await fx('What else do you have on this?', 'f_press', 'focus');
    ok('DP-F2b …and asking again manufactures no second layer for it',
      !/Behind it:/i.test(f2) && !/What would show this is wrong/i.test(f2)
      && !/Other explanations on the record/i.test(f2));
    ok('DP-F2c …it says that is everything instead of inventing one',
      /everything the record holds on this/i.test(f2));

    console.log('\n  F — AND A THIRD ASK ON THE RICH ONE IS HONEST TOO');
    const a3 = await coach('Walk me through the full history and everything that supports it.', 'q1');
    ok('DP-F1 the third answer does not silently shrink back to the short one', a3.trim() !== a1.trim());
    ok('DP-F2 …it keeps the fullest read rather than giving less than a moment ago',
      /What would show this is wrong/i.test(a3));
    ok('DP-F3 …and admits it is the end of the record',
      /everything the record holds on this/i.test(a3));

    console.log('\n  H — AND "IT" MEANS THE THING THEY ARE STANDING IN');
    /* THE PRONOUN DEFECT. "it", "things", "situation" and "state" sat in the same list as
       "organisation" and "squad" in the branch that answers org-overview questions — so a coach
       inside a Focus who typed "Tell me more about it." was answered with an area brief:
       "Evening, Dana. The First Team area is ticking along; nothing's asking for you today."
       Measured with models off. The bound object was resolved and its read was computed; this
       branch claimed the turn before it could be used. */
    const pron = threadFor('coach');
    const h1 = await pron('Tell me more about it.', 'f_press', 'focus');
    ok('DP-H1 "tell me more about it" inside a Focus is about the Focus',
      /Press from the first touch/i.test(h1));
    ok('DP-H2 …and not an area brief about the whole organisation',
      !/ticking along|nothing's asking for you|looks steady|All calm across/i.test(h1));
    /* THE NEAREST NEGATIVE, because the fix must not close the org path. Naming the team is not a
       pronoun, so it still reaches the organisation reader from inside an object. */
    const named = await pron('Tell me about the team.', 'f_press', 'focus');
    ok('DP-H3 …while naming the team still reaches the organisation reader from inside it',
      !/Press from the first touch/i.test(named) && named.length > 0);
    /* AND THE SAME PRONOUN WITH NOTHING BOUND IS UNCHANGED. This is the behaviour that shipped
       before the fix, and narrowing a branch must not quietly close it: asked from nowhere in
       particular, "it" has nothing else to refer to and the organisation reader is the right
       answer. Without this, deleting the guard entirely would go unnoticed. */
    const loose = await fetch(base + '/api/assistant/turn', { method: 'POST', headers: H('coach'),
      body: JSON.stringify({ text: 'Tell me more about it.' }) }).then(x => x.json()).catch(() => null);
    const looseText = String(((loose || {}).response || {}).responseText || '');
    ok('DP-H4 …and with nothing bound at all the same words are still answered, not dead-ended',
      looseText.length > 40 && !/Press from the first touch/i.test(looseText));

    console.log('\n  G — AND A QUESTION IS NEVER REPORTED AS AN UNINTERPRETABLE CHANGE');
    /* THE GUARD HAS TO ACTUALLY FIRE FOR THIS TO MEAN ANYTHING. A fourth ask on the thin inquiry
       produces the exhausted answer a second time, byte for byte, which is exactly the case the
       repeat guard was written for — and the case where it used to say the wrong thing. */
    const b4 = await bare('And nothing else?', 'q2');
    ok('DP-G0 a fourth ask repeats exactly, so the repeat guard is genuinely on this path',
      /same part of the record I just showed you/i.test(b4));
    /* THE COPY DEFECT UNDERNEATH ALL OF THIS. The repeat guard read
       `!!qa && !actionReading.unavailable` with the unavailable arm FIRST — and with models off,
       which is the pilot's configuration, `unavailable` is always true. So every repeated answer
       was reported as a change request the product could not interpret. A coach who asked "Why?
       Show me the evidence." was told "I cannot reliably interpret that change while the language
       model is unavailable." */
    const all = [a1, a2, a3, b1, b2, b3, b4, d1, pl, f1, f2, h1, named, looseText];
    ok('DP-G1 no answered question is reported as an uninterpretable change',
      all.every(t => !/cannot reliably interpret that change/i.test(t)));
    ok('DP-G2 …nor as a change of mind about an action nobody proposed',
      all.every(t => !/I heard that as a change to what you wanted/i.test(t)));
    ok('DP-G3 …and nothing in any of it claims the record was written by this conversation',
      all.every(t => !/I have saved|I have shared|now shared/i.test(t)));

  } catch (e) { fail++; console.error('  FAIL answer-depth suite threw:', e && e.stack); }

  server.close();
  console.log(`\nanswer-depth-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
