/* Truth layer — THE EVIDENCE DECIDES, AND A PERSON CANNOT MARK THEMSELVES FINE.

   Founder, on the first version of Highs and Lows: "I'm confused as to why the system cannot
   decide between a high and a low... what's the point in having them if our system can't
   differentiate. It's dangerous if a person decides what their baseline is. That's like someone
   sick saying they're fine."

   Correct, and the first version was wrong. It made the person's own call the ONLY thing that
   could file a High or a Low, which quietly made their say-so the baseline. The case it failed
   is the one that matters most: somebody struggling who says they are fine files nothing at
   all, and the system goes quiet exactly when it should not.

   The mistake was over-correcting from the daily check-in. Seven detectors already existed to
   decide this and they were starved, not wrong — six read a mood series retired with the
   check-in. The fix is to feed them, not to hand their job to a tap.

   THREE FOUNDER RULINGS, taken explicitly and pinned here:

     1. THE EVIDENCE STANDS. It files on its own. No tap required, none waited for.
     2. A PERSON CANNOT CLEAR A LOW. Not by disagreeing, not ever. It clears when the evidence
        changes or a leader takes it on.
     3. DISAGREEMENT MAKES IT LOUDER. Someone saying they are fine while the evidence says
        otherwise is MORE worth attention, not less.

   AND THE LAW THAT MAKES IT SAFE TO DO AT ALL: direction is DECLARED, never inferred. The
   author tags what they said as better or worse at the moment they say it; documented data
   carries its own direction. Nothing reads meaning out of anybody's wording. A ~40-stem lexicon
   deciding what "struggling with my first touch" meant was tried in this codebase and removed
   for destroying the information before anything could reason over it. This must not become
   that by the back door, so the suite pins it from both ends.

   Run: node scripts/evidence-polarity-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const diagnose = require('../ai/diagnose.js');
const t = require('../ai/team-state.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* Built through the PRODUCTION constructors, so the bands and the origin counts below are the
   kernel's own. `spec` is a list of [originRef, direction] pairs — one entry per SIGNAL, so a
   repeated origin can be expressed and its vote counted once. */
const mk = (spec, opts = {}) => {
  let i = diagnose.newInquiry({ id: 'q', subjectRef: 'member:u', concept: 'soccer.x', label: 'L', domain: 'sports' });
  const props = spec.map(([ref, direction], k) => ({
    id: `p${k}`, level: opts.level || 'observation', directness: 'direct', authority: 'self_report',
    source: 'self', specificity: 0.7, statement: 'x',
    originKind: 'self_report', originRef: ref, turnId: `t${k}`, direction,
    ...(opts.dissentOn === k ? { contradicts: true } : {}),
  }));
  i = diagnose.applyProposals(i, props, { now: Date.now(), evidenceRefOf: p => `${p.originRef}#${p.id}` });
  i.hypotheses = [diagnose.newHypothesis({ id: 'h', statement: 'something' })];
  i.leadingHypothesisId = 'h';
  return i;
};
const WORSE = [['o1', 'decline'], ['o2', 'decline'], ['o3', 'decline']];
const BETTER = [['o1', 'improvement'], ['o2', 'improvement'], ['o3', 'improvement']];

/* ── RULING 1: THE EVIDENCE FILES, ON ITS OWN. ── */
const low = t.combinedValence(mk(WORSE), { call: null });
ok('EP1 three accounts saying it is getting worse file a LOW with nobody having tapped anything — the machine differentiates, which is the whole point of having the buckets',
  low.ok === true && low.polarity === 'friction' && low.by === 'evidence');
const high = t.combinedValence(mk(BETTER), { call: null });
ok('EP2 …and three saying better file a HIGH, by the same route',
  high.ok === true && high.polarity === 'strength' && high.by === 'evidence');

/* ── EP3: THE CASE THE FOUNDER RAISED. The sick person saying they are fine. ── */
const denied = t.combinedValence(mk(WORSE), { call: { valence: 'working_well', at: Date.now() } });
ok('EP3 SOMEBODY SAYING THEY ARE FINE DOES NOT MAKE THEM FINE — the evidence says worse, they say working well, and it stays a Low',
  denied.ok === true && denied.polarity === 'friction');
ok('EP3b …their view is recorded rather than discarded — the system knows they disagree',
  denied.called === 'working_well' && denied.disagreement === true);
ok('EP3c …AND IT GETS LOUDER, NOT QUIETER. Ruling 3: a person saying they are fine against the evidence is more worth somebody\'s time, not less',
  denied.louder === true && denied.contested === true);
ok('EP3d …and it is said to them plainly, as two people seeing different things rather than as a verdict on them',
  /you read it the other way/i.test(denied.reason) && !/wrong|denial|refus/i.test(denied.reason));

/* ── RULING 2: A PERSON CANNOT CLEAR A LOW. ── */
ok('EP4 a person may not clear a Low the evidence raised — this is the ruling, and it is one predicate so no route can reimplement it wrongly',
  t.mayClear(mk(WORSE)).ok === false && /still says this needs attention/i.test(t.mayClear(mk(WORSE)).reason));
ok('EP4b …and they can still clear something the evidence is not worried about, so the rule is about protection rather than control',
  t.mayClear(mk(BETTER)).ok === true);

/* ── THE INDEPENDENCE LAW, APPLIED TO DIRECTION. Without it the loudest person in the room sets
   the polarity, and anybody could talk their own belief into a Low by repetition. ── */
const shouty = t.combinedValence(mk([['o1', 'decline'], ['o1', 'decline'], ['o1', 'decline'],
  ['o1', 'decline'], ['o1', 'decline']]), { call: null });
ok('EP5 ORIGINS VOTE, NOT SIGNALS — five messages from one person tagged worse are one origin saying worse, and one is not enough',
  shouty.ok === false && /independent origin/i.test(shouty.reason));

const mind = t.combinedValence(mk([['o1', 'decline'], ['o2', 'decline'], ['o1', 'improvement']]), { call: null });
ok('EP5b …and an origin that says worse then later says better has CHANGED ITS MIND, not voted twice — the most recent vote is the one it casts',
  mind.ok === false && mind.contested === true && mind.up === 1 && mind.down === 1);

const split = t.combinedValence(mk([['o1', 'improvement'], ['o2', 'improvement'], ['o3', 'decline']]), { call: null });
ok('EP6 origins that disagree about direction are CONTESTED, not averaged — two people who watched the same thing and read it opposite ways have produced a finding',
  split.ok === false && split.contested === true && split.up === 2 && split.down === 1);
ok('EP6b …and that disagreement is loud rather than silent', split.louder === true);

/* ── THE LAW THAT MAKES THIS SAFE: DECLARED, NEVER INFERRED. ── */
const noWords = mk([['o1', 'decline'], ['o2', 'decline'], ['o3', 'decline']]);
ok('EP7 direction lives on the SIGNAL as a declared value, not in the text — every signal here carries a direction and none carries a sentiment read off its statement',
  noWords.signals.every(s => ['improvement', 'decline', 'neutral'].includes(s.direction)));
const junk = mk([['o1', 'catastrophic'], ['o2', 'terrible'], ['o3', 'decline']]);
ok('EP7b …and anything that is not one of the three declared values becomes NEUTRAL rather than being guessed at',
  junk.signals.filter(s => s.direction === 'neutral').length === 2 &&
  t.combinedValence(junk, { call: null }).ok === false);

/* EP8: THE MODEL DOES NOT GET A VOTE. An interpretation is the machine's reading of what it was
   told, and letting it carry direction would be the removed lexicon wearing a different name.

   The fixture is MIXED on purpose, and the first version of it was not. Three interpretations on
   their own band `tentative`, so a suite built from those alone is held up by the standing gate
   and passes with the model-cannot-vote filter deleted — it proves nothing. Here three real
   observations carry the belief to `supported` and the model separately reads the situation as
   declining, which is exactly the scenario the law exists for: the person said things without
   saying which way they pointed, and the machine would like to decide for them. */
const modelSays = (() => {
  let i = diagnose.newInquiry({ id: 'q', subjectRef: 'member:u', concept: 'soccer.x', label: 'L', domain: 'sports' });
  const props = [
    ...[1, 2, 3].map(k => ({ id: 'ob' + k, level: 'observation', directness: 'direct', authority: 'self_report',
      source: 'self', specificity: 0.7, statement: 'what they actually said',
      originKind: 'self_report', originRef: 'o' + k, turnId: 't' + k, direction: 'neutral' })),
    ...[1, 2, 3].map(k => ({ id: 'in' + k, level: 'interpretation', statement: 'the model reads this as a decline',
      originKind: 'self_report', originRef: 'o' + k, turnId: 't' + k, direction: 'decline' })),
  ];
  i = diagnose.applyProposals(i, props, { now: Date.now(), evidenceRefOf: p => `${p.originRef}#${p.id}` });
  i.hypotheses = [diagnose.newHypothesis({ id: 'h', statement: 'something' })];
  i.leadingHypothesisId = 'h';
  return i;
})();
ok('EP8a the fixture is one the standing gate would let through — three real observations, rated supported — so what follows is not passing on a low band',
  (modelSays.confidence || {}).band === 'supported');
ok('EP8 THE MODEL CANNOT VOTE ON DIRECTION — it reads three declines into a well-supported belief and not one of them counts, or the classifier that was removed would be back under another name',
  t.combinedValence(modelSays, { call: null }).ok === false &&
  t.combinedValence(modelSays, { call: null }).down === 0);

/* EP9: a withdrawn or contradicted account does not vote either. */
const withdrawn = t.combinedValence(
  mk([['o1', 'decline'], ['o2', 'decline'], ['o3', 'decline']], { dissentOn: 2 }), { call: null });
ok('EP9 an account that dissents is not counted as one of the voices saying worse',
  withdrawn.down === 2);

/* ── THE PERSON'S VOICE IS STILL REAL. Where the machine has nothing, they file. ── */
const quiet = t.combinedValence(mk([['o1', 'neutral'], ['o2', 'neutral'], ['o3', 'neutral']]),
  { call: { valence: 'worth_attention', at: Date.now() } });
ok('EP10 where nothing has been marked either way, the person\'s own call files it — the machine having nothing to say is not a reason to ignore somebody who does',
  quiet.ok === true && quiet.polarity === 'friction' && quiet.by === 'person');
const silent = t.combinedValence(mk([['o1', 'neutral'], ['o2', 'neutral'], ['o3', 'neutral']]), { call: null });
ok('EP10b …and with neither an account nor a direction it stays an Inquiry, which is the honest place for something that does not point anywhere',
  silent.ok === false && silent.by === 'nobody' && silent.polarity === 'neutral');

/* EP11: agreement is not double-counted. Somebody agreeing with the evidence about themselves
   adds nothing the evidence did not already have, and must not make it louder. */
const agrees = t.combinedValence(mk(WORSE), { call: { valence: 'worth_attention', at: Date.now() } });
ok('EP11 a call that agrees with the evidence changes nothing and does not make it louder — agreeing is not corroboration any more than repeating is',
  agrees.ok === true && agrees.polarity === 'friction' &&
  agrees.louder === false && agrees.disagreement === false);

/* EP12: the count that decides all of this must not depend on a caller remembering to pass it.
   It used to, and every route that forgot silently read zero. */
const raw = mk(WORSE);
delete raw.independentOrigins;
ok('EP12 the origin count is computed from the evidence rather than trusted from a caller — the field being absent is not the same as there being no origins',
  t.originsOf(raw) === 3 && t.combinedValence(raw, { call: null }).ok === true);

console.log(`\nevidence-polarity-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
