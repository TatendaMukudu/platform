/* Truth layer — WHAT YOU JUST TOLD ME IS SOMETHING I HAVE, AND IT IS NOT EVIDENCE.

   LIVE iPHONE BLOCKER (findings R1 #2). After an image failed to be read, the founder typed the
   figures straight into the message — 28 played, 9 wins, 15 draws, 4 losses, 1.50 PPG. IntelliQ
   replied that the figures were not in anything it had access to and that it could not use numbers
   it had not received. The numbers were in the conversation. The same answer then reasoned from
   fifteen draws out of twenty-eight, contradicting its own refusal in its own next sentence.

   BOTH HALVES ARE WRONG AND THE LAW IS NOT. Human speech is not automatically evidence: nothing is
   written, nothing becomes a claim about anybody, no standing moves. But "I have no authorised
   evidence" is a statement about the EVIDENCE STORE, and it was being offered as the answer to
   "what do you make of what I just told you?" — where the honest answer is that they reported it,
   IntelliQ has it, and it has not been checked.

   THE THREE STATES THIS FILE KEEPS APART:

     recorded evidence   governed, admissible, can move a standing
     user-reported       theirs, usable, attributed, verified by nobody
     nothing             genuinely nothing, and still said plainly

   Run: node scripts/reported-provenance-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'rep';
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coach: { id: 'coach', name: 'Dana Coach', email: 'c@r.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true },
  } },
  orgNodes: { [C]: { n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

const FIGURES = 'Here are the figures: 28 played, 9 wins, 15 draws, 4 losses, 1.50 PPG, '
  + '0.93 scored per match, 0.71 conceded per match, home 5-8-1, away 4-7-3.';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('coach', C, 'coach')}`, 'Content-Type': 'application/json' };
  const thread = () => {
    let conv = null;
    return async (text) => {
      const r = await fetch(base + '/api/assistant/turn', { method: 'POST', headers: H,
        body: JSON.stringify({ text, conversationId: conv }) }).then(x => x.json()).catch(() => null);
      conv = (r && r.conversationId) || conv;
      return { said: String(((r || {}).response || {}).responseText || ''), body: r };
    };
  };

  try {
    console.log('\n  A — THE FIGURES THEY TYPED ARE NOT DENIED');
    const t = thread();
    await t(FIGURES);
    const asked = await t('What do you make of that record?');
    ok('RP-A1 the question is answered rather than refused for want of evidence',
      asked.said.length > 0 && !/enough authorised evidence/i.test(asked.said));
    /* THE LIVE SENTENCE, AND ITS FAMILY. "Not in anything I have access to" about text sitting in
       the thread is false about the thread even while it is true about the record store. */
    ok('RP-A2 …and never says it does not have what they just wrote',
      !/not in anything|cannot use numbers|have not received|don.t have access to/i.test(asked.said));
    ok('RP-A3 …it hands their own figures back to them',
      /28 played/.test(asked.said) && /15 draws/.test(asked.said));

    console.log('\n  B — LABELLED AS THEIRS, NOT AS SOMETHING ESTABLISHED');
    ok('RP-B1 the answer attributes them to the person who reported them',
      /you (?:have )?(?:told me|reported)/i.test(asked.said));
    /* IN THE WORDS A PERSON READS, not only in a field they never see. This was written with an
       `||` onto the limitations array, so an answer whose visible text claimed the figures had
       been verified and recorded still passed — the machine-readable half stood in for the half
       that reaches the human. The two channels are asserted separately now, because they are
       two different promises to two different readers. */
    ok('RP-B2 …and the words they read say nobody checked them',
      /not checked|not been checked|have not checked/i.test(asked.said)
      && !/\bverified\b|part of the record/i.test(asked.said));
    ok('RP-B2b …and the machine-readable limitation says it too',
      (((asked.body.response || {}).qa || {}).limitations || [])
        .some(l => /not something independently verified/i.test(String(l))));
    ok('RP-B3 …and carries no confidence about the world',
      ((asked.body.response || {}).qa || {}).confidence === 'none');

    console.log('\n  C — AND IT DOES NOT REASON PAST WHAT THE FIGURES CARRY');
    /* THE WORST MOMENT OF THE LIVE ANSWER was not the refusal, it was what followed: a tactical
       and mental explanation, and a specific 10-15 minute window, from a season summary that
       contains no minutes at all (findings R1 #3). */
    ok('RP-C1 no causal or psychological explanation is invented from a season summary',
      !/complacen|mental|psycholog|communication breakdown|after taking the lead/i.test(asked.said));
    ok('RP-C2 …and no time window nobody supplied',
      !/\b\d{1,2}\s*[-–]\s*\d{1,2}\s*minute/i.test(asked.said));
    ok('RP-C3 …and it says what it cannot do here rather than implying it weighed them',
      /reasoning engine/i.test(asked.said));

    console.log('\n  D — AND NOTHING WAS WRITTEN ANYWHERE');
    /* THE LAW THIS COULD MOST EASILY BREAK. Making speech usable must not make it evidence:
       repeating it back is a read, and a read writes nothing. */
    ok('RP-D1 nothing about anybody was recorded from what they said',
      ((asked.body.response || {}).qa || {}).limitations
        .some(l => /nothing was saved|no standing changed/i.test(String(l))));
    const objs = await fetch(base + '/api/objects?kind=high&scope=all', { headers: H })
      .then(r => r.json()).catch(() => null);
    ok('RP-D2 …and no standing appeared from a person reporting their own numbers',
      !((objs || {}).objects || []).length);

    console.log('\n  E — AND A CONVERSATION WITH NOTHING IN IT IS STILL SAID TO BE EMPTY');
    /* THE NEAREST NEGATIVE. A branch that answers "you told me…" for everything would be a parrot,
       and would turn every genuine "I have nothing" into a restatement of the last thing said. */
    const t2 = thread();
    await t2('I have been thinking about the season generally.');
    const empty = await t2('What does the record say about our away form?');
    ok('RP-E1 an opinion with no figures in it is not handed back as though it answered',
      !/you (?:have )?told me/i.test(empty.said));
    ok('RP-E2 …the honest refusal still stands when there is genuinely nothing',
      /enough authorised evidence|do not have|don.t have|nothing/i.test(empty.said));

    console.log('\n  F — AND THE MODEL IS TOLD THE SAME THING THE CODE DOES');
    /* NOT THE IMPLEMENTATION, AND SAID SO. The rule is carried by the deterministic path above,
       which is what runs with models off — the pilot's own state. This asserts the prompt agrees
       with it rather than contradicting it, which is what produced the live answer: the model was
       told the records were empty and read that as "they have told you nothing". */
    const composer = fs.readFileSync(path.join(__dirname, '..', 'ai', 'composer.js'), 'utf8');
    ok('RP-F1 the prompt says what they typed is something the model has',
      /JUST TOLD YOU IN THIS CONVERSATION IS SOMETHING YOU HAVE/.test(composer));
    ok('RP-F2 …and that it is user-reported rather than verified',
      /USER-REPORTED/.test(composer) && /not verified by having been typed|NOT verified by having been typed/i.test(composer));
    ok('RP-F3 …and forbids reasoning past it into causes or timings',
      /do not reason past them into causes, timings or motives/i.test(composer));

  } catch (e) { fail++; console.error('  FAIL reported-provenance suite threw:', e && e.stack); }

  server.close();
  console.log(`\nreported-provenance-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
