/* Truth layer — SEMANTIC INTAKE (pure). The input side of the flip.

   The old ears (ai/comprehend.js) were a ~40-stem lexicon: "I've been struggling with my first
   touch when someone closes me down" became `support_need = true`. The words "first touch" do
   not exist in its vocabulary, so neither did the problem. Everything downstream — evidence,
   diagnosis, questions, patterns — was starved before it began.

   These tests pin the guarantees that make an intelligent intake layer SAFE:

     • a model may propose, never conclude, and never assert its own confidence
     • every proposal is traceable to words the person actually said
     • the four epistemic levels never collapse into one field
     • confidence is computed from the shape of the evidence, deterministically
     • a turn is scored on what it was WORTH, with the ways of gaming that punished
     • the kernel decides WHAT to learn; the model only decides HOW to ask

   Run: node scripts/diagnose-smoke.js */

const d = require('../ai/diagnose.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const UTTERANCE = "I've been struggling with my first touch when someone closes me down quickly.";

/* ── 1. GROUNDING: every claim traces to what was actually said ───────────── */
{
  const { accepted, rejected } = d.groundProposals([
    { id: 'o1', level: 'observation', text: 'first touch degrades under immediate pressure',
      sourceSpan: 'struggling with my first touch', source: 'self', directness: 'direct', specificity: 0.8 },
    { id: 'h1', level: 'hypothesis', text: 'first touch degrades when time and space are constrained',
      basis: ['o1'], alternatives: ['scanning before reception', 'body orientation'], falsifiers: ['clean touches under equal pressure on video'] },
  ], { utterance: UTTERANCE, turnId: 't1' });
  ok('1 · a quoted observation and a hypothesis resting on it are accepted', accepted.length === 2 && !rejected.length);
  ok('1 · …and the observation keeps the span that caused it (traceable to the sentence)',
    accepted[0].sourceSpan === 'struggling with my first touch' && accepted[0].grounded === true);
}
{
  const { accepted, rejected } = d.groundProposals([
    { level: 'observation', text: 'they have poor scanning habits', sourceSpan: 'never looks over their shoulder' },
  ], { utterance: UTTERANCE, turnId: 't1' });
  ok('2 · an observation whose span was NOT said is refused (no invented quotes)',
    !accepted.length && /does not appear in what they said/.test(rejected[0].reason));
}
{
  const { accepted, rejected } = d.groundProposals([
    { level: 'interpretation', text: 'poor scanning habits', basis: [] },
  ], { utterance: UTTERANCE, turnId: 't1' });
  ok('3 · an interpretation with nothing beneath it is refused (no free-floating judgement)',
    !accepted.length && /no grounded observation beneath it/.test(rejected[0].reason));
}
{
  const { accepted, rejected } = d.groundProposals([
    { level: 'conclusion', text: 'scanning is the primary limiting factor', basis: ['o1'] },
  ], { utterance: UTTERANCE, turnId: 't1', knownObservationIds: ['o1'] });
  ok('4 · A CONCLUSION IS REFUSED OUTRIGHT — deciding what is settled is not the model\'s job',
    !accepted.length && /not the model's to draw/.test(rejected[0].reason));
}
ok('5 · the prompt forbids conclusions and self-asserted confidence',
  /You may NOT return a conclusion/.test(d.INTAKE_PROMPT) && /Do NOT return confidence numbers/.test(d.INTAKE_PROMPT));
ok('5 · …demands a verbatim span for every observation',
  /copied VERBATIM/.test(d.INTAKE_PROMPT) && /If you cannot quote it, it is not an observation/.test(d.INTAKE_PROMPT));
ok('5 · …and looks for strengths as hard as for difficulties (not a weakness detector)',
  /STRENGTHS and CONDITIONS FOR SUCCESS/.test(d.INTAKE_PROMPT));

/* ── 2. CONFIDENCE is deterministic, and cannot be talked up ──────────────── */
{
  const one = d.deriveConfidence([{ source: 'self', directness: 'direct', specificity: 0.9, at: Date.now() }]);
  ok('6 · one self-reported signal never reads as settled, however specific',
    one.score <= 0.45 && one.band !== 'supported' && /only one signal/.test(one.because.join(' ')));

  const many = d.deriveConfidence([
    { source: 'self', directness: 'direct', specificity: 0.8, at: Date.now() },
    { source: 'coach', directness: 'direct', authority: 'authoritative', specificity: 0.8, at: Date.now() },
    { source: 'video', directness: 'direct', authority: 'corroborated', specificity: 0.9, at: Date.now() },
  ]);
  ok('6 · independent corroborating sources raise it', many.score > one.score && many.band !== 'tentative');

  const disputed = d.deriveConfidence([
    { source: 'self', directness: 'direct', specificity: 0.8, at: Date.now() },
    { source: 'coach', directness: 'direct', authority: 'authoritative', specificity: 0.8, at: Date.now() },
    { source: 'video', directness: 'direct', specificity: 0.9, at: Date.now(), contradicts: true },
  ]);
  ok('7 · a contradiction pulls confidence DOWN hard', disputed.score < many.score);

  const stale = d.deriveConfidence([
    { source: 'self', directness: 'direct', specificity: 0.8, at: Date.now() - 400 * 86400000 },
    { source: 'coach', directness: 'direct', specificity: 0.8, at: Date.now() - 400 * 86400000 },
  ]);
  const fresh = d.deriveConfidence([
    { source: 'self', directness: 'direct', specificity: 0.8, at: Date.now() },
    { source: 'coach', directness: 'direct', specificity: 0.8, at: Date.now() },
  ]);
  ok('8 · year-old signals decay below fresh ones', stale.score < fresh.score);
  ok('9 · an inferred signal counts for less than the person\'s own words',
    d.deriveConfidence([{ directness: 'inferred', source: 'a', at: Date.now() }, { directness: 'inferred', source: 'b', at: Date.now() }]).score
    < d.deriveConfidence([{ directness: 'direct', source: 'a', at: Date.now() }, { directness: 'direct', source: 'b', at: Date.now() }]).score);
  ok('10 · nothing recorded is honestly zero, not a hedge', d.deriveConfidence([]).score === 0);
}

/* ── 3. THE INQUIRY STATE is neutral and keeps its rivals ─────────────────── */
{
  const inq = d.newInquiry({ id: 'i1', subjectRef: 'member:123', concept: 'football.receiving_under_pressure', label: 'Receiving under pressure', domain: 'football' });
  ok('11 · an inquiry starts honestly empty and exploring',
    inq.status === 'exploring' && inq.confidence.score === 0 && inq.hypothesis === null);
  ok('11 · …and the primitive is NEUTRAL, so a strength is as expressible as a problem',
    'polarity' in inq && d.newInquiry({ polarity: 'strength' }).polarity === 'strength');

  const { accepted } = d.groundProposals([
    { id: 'o1', level: 'observation', text: 'first touch degrades under immediate pressure',
      sourceSpan: 'first touch when someone closes me down', source: 'self', directness: 'direct', specificity: 0.8 },
    { id: 'h1', level: 'hypothesis', text: 'the touch fails because pressure is seen too late',
      basis: ['o1'], alternatives: ['technical execution of the touch itself'], falsifiers: ['clean touches when pressure is called out early'] },
  ], { utterance: UTTERANCE, turnId: 't1' });
  const after = d.applyProposals(inq, accepted);
  ok('12 · applying proposals records the signal and the working hypothesis',
    after.knownSignals.length === 1 && /seen too late/.test(after.hypothesis.statement));
  ok('12 · …keeps the rival explanation instead of quietly dropping it',
    after.alternatives.some(a => /technical execution/.test(a.statement)));
  ok('12 · …and records what would show it is wrong', after.falsifiers.length === 1);

  // A later, competing hypothesis must not erase the first — it demotes it.
  const { accepted: a2 } = d.groundProposals([
    { id: 'h2', level: 'hypothesis', text: 'the touch itself is technically loose', basis: ['o1'] },
  ], { utterance: UTTERANCE, turnId: 't2', knownObservationIds: ['o1'] });
  const after2 = d.applyProposals(after, a2);
  ok('13 · a competing hypothesis demotes the old one to an alternative, never deletes it',
    /technically loose/.test(after2.hypothesis.statement)
    && after2.alternatives.some(a => /seen too late/.test(a.statement)));
}

/* ── 4. DIAGNOSTIC YIELD — and the ways of gaming it are punished ─────────── */
{
  const base = d.newInquiry({ id: 'i2', subjectRef: 'm:1', concept: 'football.first_touch' });
  const { accepted } = d.groundProposals([
    { id: 'o1', level: 'observation', text: 'touch gets away when pressed from behind',
      sourceSpan: 'first touch when someone closes me down', source: 'self', directness: 'direct', specificity: 0.9 },
  ], { utterance: UTTERANCE, turnId: 't1' });
  const after = d.applyProposals(base, accepted);
  const y = d.diagnosticYield(base, after, { rejected: [] });
  ok('14 · a real new signal yields something', y.score > 0 && y.evidenceQuality > 0.5);

  // Repeating what we already hold is worth ~nothing.
  const repeat = d.applyProposals(after, d.groundProposals([
    { id: 'o2', level: 'observation', text: 'touch gets away when pressed from behind',
      sourceSpan: 'first touch when someone closes me down', source: 'self', directness: 'direct', specificity: 0.9 },
  ], { utterance: UTTERANCE, turnId: 't2' }).accepted);
  const yRepeat = d.diagnosticYield(after, repeat, { rejected: [] });
  ok('15 · repeating a known signal is penalised as no learning',
    yRepeat.novelty === 0 && /repeated what was already held/.test(yRepeat.penalties.join(' ')));

  // Unsupported inference is penalised — the model guessing costs it.
  const yUnsupported = d.diagnosticYield(base, after, {
    rejected: [{ reason: 'interpretation with no grounded observation beneath it' }, { reason: 'source span does not appear in what they said' }] });
  ok('16 · unsupported inference is penalised', yUnsupported.score < y.score && /unsupported inference/.test(yUnsupported.penalties.join(' ')));

  // The metric must not be gameable by simply becoming confident.
  const cocky = JSON.parse(JSON.stringify(after));
  cocky.confidence = { score: 0.95, band: 'supported', because: ['because I said so'] };
  const yCocky = d.diagnosticYield(base, cocky, { rejected: [] });
  ok('17 · PREMATURE CERTAINTY is punished — the metric cannot be gamed by getting cocky',
    /premature certainty/.test(yCocky.penalties.join(' ')) && yCocky.score < 0.5);
}

/* ── 5. QUESTION SELECTION — the kernel decides WHAT, the model only HOW ──── */
{
  const ranked = d.rankQuestions([
    { question: 'do you see the pressure late, or does the touch get away?', resolves: ['scanning_vs_execution'],
      expectedInformationGain: 0.71, hypothesisImportance: 0.9, answerability: 0.95, decisionImpact: 0.8, burden: 0.2 },
    { question: 'what boots do you wear?', resolves: ['equipment'],
      expectedInformationGain: 0.05, hypothesisImportance: 0.1, answerability: 1, decisionImpact: 0.05, burden: 0.1 },
    { question: 'can you film a full match and tag every reception?', resolves: ['scanning_vs_execution'],
      expectedInformationGain: 0.9, hypothesisImportance: 0.9, answerability: 0.3, decisionImpact: 0.8, burden: 0.95 },
  ]);
  ok('18 · the highest-value question wins on gain x importance x impact / burden',
    /see the pressure late/.test(ranked[0].question));
  ok('18 · …a trivial question ranks last', /boots/.test(ranked[ranked.length - 1].question));
  ok('19 · a high-gain question with a huge burden loses to an easy one',
    ranked.findIndex(r => /film a full match/.test(r.question)) > 0);

  const need = d.nextNeed(null, [
    { question: 'x', resolves: ['scanning_vs_execution'], expectedInformationGain: 0.7, hypothesisImportance: 0.9, decisionImpact: 0.8, burden: 0.2 },
  ]);
  ok('20 · the kernel hands the model a NEED to phrase, not a sentence to copy',
    need && need.distinguishes.includes('scanning_vs_execution'));
  ok('20 · …and with nothing worth asking it says so rather than inventing a question',
    d.nextNeed(null, []) === null);
}

console.log(`\ndiagnose-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
