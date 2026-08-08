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
    inq.status === 'exploring' && inq.confidence.score === 0 && inq.hypotheses.length === 0);
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
    after.signals.length === 1 && /seen too late/.test((after.hypotheses.find(h => h.id === after.leadingHypothesisId) || {}).statement || ''));
  ok('12 · …keeps the rival explanation as a COMPETING hypothesis, not a footnote',
    after.hypotheses.some(h => /technical execution/.test(h.statement)));
  ok('12 · …and records what would show it is wrong', after.falsifiers.length === 1);

  /* AN INQUIRY IS A PROJECTION, NOT A STORE. It holds references into governed evidence — never
     copies of the text. The first cut copied signal text inline, which created a second
     substrate with no provenance, no inherited visibility and no deletion path: erasing a piece
     of evidence would have left its content sitting in an inquiry forever. */
  ok('12 · the inquiry holds REFERENCES, never a copy of the evidence text',
    after.signals.every(s => typeof s.ref === 'string' && !('text' in s))
    && !JSON.stringify(after.signals).includes('first touch degrades'));
  ok('12 · …while keeping what the KERNEL needs to weigh the claim',
    after.signals.every(s => 'directness' in s && 'authority' in s && 'at' in s));

  // A later, competing hypothesis must not erase the first — it demotes it.
  const { accepted: a2 } = d.groundProposals([
    { id: 'h2', level: 'hypothesis', text: 'the touch itself is technically loose', basis: ['o1'] },
  ], { utterance: UTTERANCE, turnId: 't2', knownObservationIds: ['o1'] });
  const after2 = d.applyProposals(after, a2);
  ok('13 · rival hypotheses COEXIST and compete — no last-writer-wins',
    after2.hypotheses.filter(h => /technically loose|seen too late/.test(h.statement)).length === 2);
  ok('13 · …each carrying its OWN confidence, so they can rise and fall independently',
    after2.hypotheses.every(h => h.confidence && typeof h.confidence.band === 'string'));
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

  /* EVIDENCE CHALLENGES a hypothesis, not just supports one — the thing a flat signal list
     could never express, and what makes a well-attacked explanation actually fall. */
  const rivals = d.applyProposals(d.newInquiry({ id: 'i3', subjectRef: 'm:1', concept: 'football.first_touch' }),
    d.groundProposals([
      { id: 'o1', level: 'observation', text: 'touch is clean when unpressured',
        sourceSpan: 'first touch when someone closes me down', source: 'video', directness: 'direct',
        authority: 'authoritative', specificity: 0.9, challenges: 'hTech' },
      { id: 'hTech', level: 'hypothesis', text: 'the touch is technically loose', basis: ['o1'] },
    ], { utterance: UTTERANCE, turnId: 't1' }).accepted);
  const tech = rivals.hypotheses.find(h => h.id === 'hTech');
  ok('14 · evidence can CHALLENGE a hypothesis, and challenging evidence is recorded as such',
    tech && tech.challengeRefs.length === 1);

  /* Re-applying the SAME evidence is idempotent and teaches nothing. Novelty is now judged by
     reference rather than by text: two DIFFERENT pieces of evidence that happen to say similar
     things are genuinely two signals, and de-duplicating identical content is the evidence
     layer's job (lib/evidence.dedupeKey), not this one's. */
  const repeat = d.applyProposals(after, accepted);
  const yRepeat = d.diagnosticYield(after, repeat, { rejected: [] });
  ok('15 · re-applying the same evidence is idempotent and yields no learning',
    repeat.signals.length === after.signals.length && yRepeat.score === 0);

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

/* ── 6. THE COLLECTION FRONTIER, derived from the inquiry's OWN state ────── */
{
  const inq = d.applyProposals(
    d.newInquiry({ id: 'i9', subjectRef: 'm:1', concept: 'football.first_touch' }),
    d.groundProposals([
      { id: 'o1', level: 'observation', text: 'touch gets away under pressure',
        sourceSpan: 'first touch when someone closes me down', source: 'self', directness: 'direct', specificity: 0.8 },
      { id: 'h1', level: 'hypothesis', text: 'pressure is seen too late', basis: ['o1'],
        alternatives: ['the touch itself is loose'] },
    ], { utterance: UTTERANCE, turnId: 't1' }).accepted);
  inq.missingSignals = [
    { question: 'does it happen when you can see the defender coming?', resolves: ['scanning_vs_execution'], burden: 0.2 },
    { question: 'can you film every reception for a full season?', resolves: ['scanning_vs_execution'], burden: 0.95 },
  ];
  const ranked = d.rankQuestions(d.frontierFor(inq));
  ok('21 · the frontier derives its ranking from the inquiry, not from a model\'s say-so',
    ranked.length === 2 && ranked.every(c => typeof c.value === 'number'));
  ok('21 · …and the easy question beats the expensive one that resolves the same thing',
    /see the defender coming/.test(ranked[0].question));
  ok('22 · a CONTESTED inquiry raises the value of settling it',
    d.frontierFor(inq)[0].decisionImpact >= 0.8);
  ok('23 · an inquiry with nothing unknown offers no question rather than inventing one',
    d.frontierFor(d.newInquiry({ id: 'i10' })).length === 0);
}

/* ── 7. THE TIMELINE — how the understanding CHANGED, not just where it landed ── */
{
  const t0 = Date.now();
  const start = d.newInquiry({ id: 'i11', subjectRef: 'm:1', concept: 'football.first_touch', now: t0 });
  ok('24 · a new inquiry starts with an empty history', Array.isArray(start.timeline) && start.timeline.length === 0);

  // First evidence + a technical explanation.
  const s1 = d.applyProposals(start, d.groundProposals([
    { id: 'o1', level: 'observation', text: 'touch gets away under pressure',
      sourceSpan: 'first touch when someone closes me down', source: 'self', directness: 'direct', specificity: 0.8 },
    { id: 'hTech', level: 'hypothesis', text: 'the touch is technically loose', basis: ['o1'] },
  ], { utterance: UTTERANCE, turnId: 't1' }).accepted, { now: t0 });
  ok('25 · evidence arriving is recorded, and the first explanation with it',
    s1.timeline.some(e => e.kind === 'evidence') && s1.timeline.some(e => e.kind === 'hypothesis'));

  // Film says the touch is clean unpressured — that CHALLENGES the technical explanation.
  const t1 = t0 + 86400000;
  const s2 = d.applyProposals(s1, d.groundProposals([
    { id: 'o2', level: 'observation', text: 'touch is clean when unpressured',
      sourceSpan: 'struggling with my first touch', source: 'video', directness: 'direct',
      authority: 'authoritative', specificity: 0.9, challenges: 'hTech' },
    { id: 'hLate', level: 'hypothesis', text: 'pressure is seen too late', basis: ['o2'] },
  ], { utterance: UTTERANCE, turnId: 't2', knownObservationIds: ['o1'] }).accepted, { now: t1 });

  ok('26 · the record shows the lead CHANGING HANDS, with what it moved from and to',
    s2.timeline.some(e => e.kind === 'lead_change' && /seen too late/.test(e.to || '')));
  ok('27 · …and it is ordered, so you can read how the understanding developed',
    s2.timeline.every((e, i, a) => i === 0 || e.at >= a[i - 1].at));

  /* THE DISCIPLINE: a timeline REFERENCES evidence, it never quotes it. Otherwise the history
     becomes the leak that the inquiry itself was carefully designed not to be. */
  ok('28 · the history references evidence and never copies its wording',
    s2.timeline.every(e => Array.isArray(e.refs))
    && !JSON.stringify(s2.timeline).includes('touch is clean when unpressured'));

  // Re-applying known evidence is not history. Silence is correct here.
  const s3 = d.applyProposals(s2, d.groundProposals([
    { id: 'o2', level: 'observation', text: 'touch is clean when unpressured',
      sourceSpan: 'struggling with my first touch', source: 'video', directness: 'direct', specificity: 0.9 },
  ], { utterance: UTTERANCE, turnId: 't3' }).accepted, { now: t1 + 1000 });
  ok('29 · re-applying known evidence writes NO history (only material change is recorded)',
    s3.timeline.length === s2.timeline.length);
}

/* ── 30 · CONSOLIDATION ──────────────────────────────────────────────────────
   The shape that actually shipped: one member explaining one Tuesday produced five concepts,
   two of them holding no observation at all, and the page filled with the same story filed
   five ways. These use that exact grouping. */
{
  const obs = (c) => ({ level: 'observation', domainConcept: c });
  const hyp = (c) => ({ level: 'hypothesis', domainConcept: c });
  const live = {
    'football.training_attendance': [obs('x'), obs('x'), hyp('x')],
    'football.attendance_timing':   [obs('x'), obs('x')],
    'football.training_structure':  [obs('x')],
    'football.motivation':          [hyp('x')],                 // no observation — a shell
    'football.attendance_pattern':  [hyp('x')],                 // no observation — a shell
  };

  const r = d.consolidate(live, { existing: {}, cap: 2 });
  const kept = Object.keys(r.byConcept);
  ok('30 · five concepts for one story consolidate down', kept.length < 5);
  ok('30 · …the primary is the concept with the most observations',
    r.primary === 'football.training_attendance');
  ok('30 · …a concept with no observation of its own gets no inquiry',
    !kept.includes('football.motivation') && !kept.includes('football.attendance_pattern'));
  ok('30 · …and the new-concept cap holds the rest', kept.length <= 1 + 2);
  ok('30 · …every folded concept says why', r.folded.every(f => f.concept && f.why));

  // Folding must move the filing, never the content — consolidating cannot cost reasoning.
  const before = Object.values(live).reduce((n, ps) => n + ps.length, 0);
  const after = Object.values(r.byConcept).reduce((n, ps) => n + ps.length, 0);
  ok('30 · …no accepted proposal is lost in the fold', after === before);

  // A concept already open for this person is not "new", so an established pile keeps growing
  // rather than being folded away by a cap meant for sprawl.
  const r2 = d.consolidate(live, { existing: { 'football.training_structure': {} }, cap: 0 });
  ok('30 · an already-open concept survives a cap of zero',
    Object.keys(r2.byConcept).includes('football.training_structure'));

  // Determinism: the same input must always consolidate the same way, or the picture depends
  // on key order rather than on evidence.
  const a = d.consolidate(live, { existing: {}, cap: 2 });
  const b = d.consolidate(live, { existing: {}, cap: 2 });
  ok('30 · consolidation is deterministic', JSON.stringify(Object.keys(a.byConcept)) === JSON.stringify(Object.keys(b.byConcept)));

  ok('30 · a single concept is left alone', Object.keys(d.consolidate({ 'a.b': [obs('x')] }, {}).byConcept).length === 1);
  ok('30 · an empty turn consolidates to nothing, not a crash', d.consolidate({}, {}).primary === null);
}

/* ── 31 · the intake contract must ask for what the routing needs ────────────
   Each unknown carries the concept it resolves. Without it the whole list lands on every
   inquiry and the identical question appears on every card. */
ok('31 · the prompt requires a concept on each unknown', /"concept"/.test(d.INTAKE_PROMPT) && /unknown.*concept|concept.*resolve/i.test(d.INTAKE_PROMPT));
ok('31 · …and tells the model one phenomenon is one concept', /ONE PHENOMENON, ONE CONCEPT/.test(d.INTAKE_PROMPT));

/* ── 32 · IDENTITY: a rename must not become a second belief ─────────────────
   The frontier Ashton actually had when message 2 arrived. */
{
  const frontier = [
    { inquiryId: 'inq_a1', concept: 'football.training_attendance', aliases: ['football.training_attendance'], meaning: 'does he get to training' },
    { inquiryId: 'inq_b2', concept: 'football.attendance_timing', aliases: ['football.attendance_timing'], meaning: 'does he arrive on time' },
    { inquiryId: 'inq_c3', concept: 'football.match_performance', aliases: ['football.match_performance'], meaning: 'how he plays' },
  ];
  const R = (c, relationship, targetId, reason) => d.resolveIdentity({ concept: c, relationship, targetId, reason }, frontier);

  ok('32 · SAME_AS routes evidence into the existing inquiry',
    R('football.session_attendance', 'SAME_AS', 'inq_a1').action === 'apply');
  ok('32 · …at the target it named', R('football.session_attendance', 'SAME_AS', 'inq_a1').targetId === 'inq_a1');
  ok('32 · REFINES builds a child, not a rival',
    R('football.lateness_vs_absence', 'REFINES', 'inq_a1').action === 'refine');
  ok('32 · RELATED_TO does not open a line of its own',
    R('football.work_schedule', 'RELATED_TO', 'inq_a1').action === 'link');
  ok('32 · SUPPORTS lands on the question it bears on',
    R('football.warmup_value', 'SUPPORTS', 'inq_b2').action === 'apply');

  // The behaviour this whole mechanism exists for.
  ok('32 · an ARGUED new concept is allowed to be new',
    R('football.injury_niggle', 'NEW', null, 'a physical complaint, unrelated to whether or when he attends').action === 'create');
  ok('32 · an UNARGUED NEW is not — that is how a synonym became a second belief',
    R('football.session_attendance', 'NEW', null, '').action === 'apply');
  ok('32 · …and a bare "new topic" does not count as an argument',
    R('football.session_attendance', 'NEW', null, 'new topic').action === 'apply');

  // Degradation must always run toward coherence, never toward fragmentation.
  ok('32 · a relationship naming an unknown target holds rather than splits',
    R('football.whatever', 'SAME_AS', 'inq_does_not_exist').action === 'apply');
  ok('32 · no relationship at all holds rather than splits',
    R('football.whatever', '', null).action === 'apply');
  ok('32 · a garbage relationship holds rather than splits',
    R('football.whatever', 'BANANA', 'inq_a1').action === 'apply');

  // A name already known to be this inquiry is this inquiry, whatever the model claims.
  const withAlias = [{ inquiryId: 'inq_a1', concept: 'football.training_attendance',
    aliases: ['football.training_attendance', 'football.session_attendance'] }];
  const aliased = d.resolveIdentity({ concept: 'football.session_attendance', relationship: 'NEW', reason: 'feels different to me' }, withAlias);
  ok('32 · a known alias outranks a NEW claim', aliased.action === 'apply' && aliased.targetId === 'inq_a1');

  // With nothing open there is nothing to reject, so a first concept is simply new.
  ok('32 · the first concept for a person is new without argument',
    d.resolveIdentity({ concept: 'football.anything', relationship: 'NEW' }, []).action === 'create');

  // Names accumulate; the inquiry persists.
  const inq = d.newInquiry({ id: 'inq_a1', concept: 'football.training_attendance', label: 'Training attendance' });
  d.addAlias(inq, 'football.session_attendance', { at: 'now', relationship: 'SAME_AS', reason: 'same question' });
  ok('33 · an alias is added, not swapped in',
    inq.aliases.includes('football.training_attendance') && inq.aliases.includes('football.session_attendance'));
  ok('33 · …the identity is the id, which never moved', inq.inquiryId === 'inq_a1');
  ok('33 · …and why it was merged is on the record', inq.provenance.length === 1 && inq.provenance[0].reason === 'same question');
  d.addAlias(inq, 'football.session_attendance');
  ok('33 · re-adding a known alias changes nothing', inq.aliases.length === 2);
}

/* ── 34 · EVIDENCE INDEPENDENCE ──────────────────────────────────────────────
   attendance_timing read "probable" off two sentences in one message. Two paraphrases from one
   telling are closer to one evidentiary event than to two confirmations. */
{
  const sig = (turnId, at) => ({ ref: `r${Math.random()}`, kind: 'observation', directness: 'direct',
    authority: 'self_report', source: 'self', specificity: 0.8, turnId, at });
  const day = 86400000, t = Date.now();

  const oneTelling = d.deriveConfidence([sig('t1', t), sig('t1', t)], { now: t });
  ok('34 · two signals from ONE telling do not reach probable', oneTelling.band !== 'probable' && oneTelling.band !== 'supported');
  ok('34 · …and the reason says so plainly', oneTelling.because.some(b => /one telling/.test(b)));

  const twoTellings = d.deriveConfidence([sig('t1', t - 14 * day), sig('t2', t)], { now: t });
  ok('34 · the same evidence across two tellings is worth more', twoTellings.score > oneTelling.score);

  // Independence must still be about separateness, not volume: restating something five times
  // in one message must not overtake saying it twice on two occasions.
  const fiveInOne = d.deriveConfidence([sig('t1', t), sig('t1', t), sig('t1', t), sig('t1', t), sig('t1', t)], { now: t });
  ok('34 · five restatements in one telling stay under two separate ones', fiveInOne.score < twoTellings.score);

  const single = d.deriveConfidence([sig('t1', t)], { now: t });
  ok('34 · a single signal still reads as one signal', single.because.some(b => /only one signal/.test(b)));
}

/* ── 35 · the contract asks for the commitment the routing depends on ────────── */
ok('35 · the prompt defines every relationship the kernel accepts',
  d.RELATIONSHIPS.every(r => new RegExp(r).test(d.INTAKE_PROMPT)));
ok('35 · …requires a target id for everything but NEW', /targetInquiryId is REQUIRED/.test(d.INTAKE_PROMPT));
ok('35 · …and makes NEW something the model has to argue for', /may not declare NEW until/.test(d.INTAKE_PROMPT));

console.log(`\ndiagnose-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
