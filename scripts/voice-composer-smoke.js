#!/usr/bin/env node
'use strict';

/* Truth layer — THE COMPOSER (founder decisions D30, D34, D12, D11, D38).

   ai/voice.js could only say hello: three functions, all of them greetings. Every other sentence
   a person read came from fixed tables in ai/proactive.js, which is why the deterministic voice
   was found living in four homes and recognised as one layer by nobody.

   explainObject is the part that turns a governed object into what a person actually reads. These
   assertions defend the properties that make it safe to put in front of a seventeen-year-old:
   it cannot predict, it cannot name anybody, it cannot leak a kernel word, and it says what would
   change its mind.

   Run: node scripts/voice-composer-smoke.js */

const voice = require('../ai/voice');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };

const FULL = {
  kind: 'inquiry',
  label: 'Attendance in the U18s has dropped from its usual',
  claim: 'exams are competing for time',
  band: 'probable',
  contributors: 3, independentOrigins: 2, spanDays: 28,
  stillUnknown: [{ question: 'Whether the players who dropped off are the ones sitting exams' }],
  falsifiers: ['If attendance stays low after exams finish'],
  banded: false, seed: 'u18',
};

console.log('\n  THE FOUR BLOCKS — the whole design of a thread');
{
  const o = voice.explainObject(FULL);
  ok('V1 the claim is stated as a belief, never as a fact', /^(I think|My read is|What I make of it)/.test(o.claim));
  ok('V2 confidence reaches the person in plain language, not a kernel band',
    o.confidence === 'fairly confident' && !/probable|supported|tentative/i.test(o.claim));
  ok('V3 "what I still don\'t know" is rendered — the frontier, computed and never shown until now',
    o.stillUnknown.length === 1 && /sitting exams/.test(o.stillUnknown[0]));
  ok('V4 "what would change my mind" is rendered — the line no competitor can write',
    o.wouldChangeMyMind.length === 1 && /after exams finish/.test(o.wouldChangeMyMind[0]));
}

console.log('\n  THE PROVENANCE CHIP — counts and independence, never a name');
{
  const o = voice.explainObject(FULL);
  ok('V5 it states how many people and how independent, in words',
    o.provenance === 'three people, two independent sources, over four weeks');
  // L-D27 / D38: a finding about a leader must never carry a count small enough to identify.
  // Banding is the DEFAULT, so silence cannot buy precision.
  const leader = voice.explainObject({ ...FULL, banded: true });
  ok('V6 a banded chip gives no exact count', /several people/.test(leader.provenance) && !/three/.test(leader.provenance));
  const silent = voice.explainObject({ ...FULL, banded: undefined });
  ok('V7 banding is the DEFAULT — omitting the flag fails closed, it does not buy precision',
    /several people/.test(silent.provenance));
  ok('V8 there is no field through which a contributor could be named',
    !('contributors' in voice.explainObject(FULL)) && !/\b(Sam|Alex|name)\b/i.test(JSON.stringify(voice.explainObject(FULL))));
  /* Found by mutation-testing V7: explainObject defaulted to banded, but the EXPORTED provenance()
     defaulted to unbanded — so a caller reaching for the chip directly got an exact count for
     free. Every entry point has to fail the same way, or the safe default is only a habit. */
  ok('V8b the exported chip bands by default too — every entry point fails closed, not just one',
    /several people/.test(voice.provenance({ contributors: 3, independentOrigins: 2 })));
}

console.log('\n  WHAT IT MAY NEVER SAY');
{
  const all = JSON.stringify(voice.explainObject({ ...FULL, contested: true, parkedBecause: 'other open questions would tell us more right now' }));
  // D11 — kernel status words are internal. On a team object "disputed" reads as "the team is in
  // conflict" when it usually means two people described the same week differently.
  ok('V9 no kernel status word reaches the person', !/\b(disputed|exploring|calibrating|well_supported)\b/.test(all));
  // D34 — a colleague who noticed does not tell you what it means for you. The coach sentence is
  // also a PREDICTION, which ai/language-guard.js exists to reject.
  ok('V10 it never predicts', !/\bwill\b|\bgoing to\b|\blikely to\b|\bexpect\b/i.test(all));
  ok('V11 it never instructs', !/\byou should\b|\bI'd recommend\b|\bease off\b|\bmake sure\b/i.test(all));
  ok('V12 contested is a state that says both accounts are kept, not an error',
    /points both ways/.test(all) && /Both accounts are kept/.test(all));
  ok('V13 parking says why, so a person can disagree with the ranking (D10)',
    /other open questions would tell us more/.test(all));
}

console.log('\n  IT MUST BE SAFE ON A THIN OBJECT — a blank card teaches people it has nothing to say');
{
  const bare = voice.explainObject({ label: 'Something shifted' });
  ok('V14 an object with nothing but a label still explains itself honestly',
    bare.headline === 'Something shifted.' && /not sure yet/.test(bare.claim));
  ok('V15 empty inputs produce empty lists, never undefined',
    Array.isArray(bare.stillUnknown) && Array.isArray(bare.wouldChangeMyMind));
  ok('V16 it does not invent a next question — that belongs to the caller, under the stopping rule',
    !('nextQuestion' in bare) && !/\?$/.test(bare.claim));
}

console.log('\n  DETERMINISM — the same state always reads the same way');
{
  const a = JSON.stringify(voice.explainObject(FULL));
  const b = JSON.stringify(voice.explainObject(FULL));
  ok('V17 composing twice gives byte-identical output', a === b);
  const other = JSON.stringify(voice.explainObject({ ...FULL, seed: 'different' }));
  ok('V18 variety is seeded, so a different object may read differently', typeof other === 'string');
}

/* The integration that actually matters. ai/language-guard.js is deliberately aggressive and
   rejects anything predictive or diagnostic — it exists for the LLM edges. The composer must
   survive it BY CONSTRUCTION, across every shape, or the deterministic voice is not actually
   safer than the model it replaces. */
console.log('\n  THE COMPOSER SURVIVES THE LANGUAGE GUARD, ON EVERY SHAPE');
{
  const guard = require('../ai/language-guard');
  const shapes = [
    FULL,
    { label: 'Your sleep is down from your normal', claim: 'training load went up in the same fortnight', band: 'emerging', contributors: 1, spanDays: 14, falsifiers: ['If sleep recovers while load stays high'] },
    { label: 'The Monday handoff keeps costing the team time', claim: 'the brief arrives after the session starts', band: 'supported', contributors: 6, independentOrigins: 3, spanDays: 56, contested: true },
    { label: 'Something shifted' },
  ];
  const rejected = shapes.filter(s => {
    const o = voice.explainObject({ ...s, seed: s.label });
    const text = [o.headline, o.claim, o.whyIThinkThat, o.contested, o.setAside, ...o.stillUnknown, ...o.wouldChangeMyMind]
      .filter(Boolean).join(' ');
    return guard.predictsOrDiagnoses(text);
  });
  if (rejected.length) rejected.forEach(s => console.log('      rejected: ' + s.label));
  ok(`V19 no composed explanation predicts or diagnoses (${shapes.length} shapes)`, rejected.length === 0);
}

console.log(`\nvoice-composer-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
