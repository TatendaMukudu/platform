/* Truth layer — EVIDENCE ORIGIN + CORRECTIONS (pure).

   The two assumptions that were still unsafe before more than one person could feed the kernel.

   ORIGIN. Confidence counted SOURCES. Five teammates repeating what the captain said after
   Saturday's match was five sources and five occasions — numerically indistinguishable from five
   people who each noticed something. With one member describing themselves that rarely bit,
   because a member is one source. Add a group, where several people discussing the same session
   is the ordinary case, and counting sources manufactures certainty out of a room agreeing with
   itself. Origin is a third axis: what the evidence is ultimately BASED on.

   CORRECTIONS. A hypothesis was refuted only when `challenged && never supported`, so a single
   historical signal granted it permanent life — no quantity of later evidence could rule it out.
   And a signal, once recorded, counted forever: "actually I watched the video, my touch was fine"
   could only pile up NEXT to the claim it was correcting. A system that cannot abandon an
   explanation is accumulating, not reasoning.

   Run: node scripts/origin-correction-smoke.js */

const d = require('../ai/diagnose.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const t = Date.UTC(2026, 7, 13);
const day = 86400000;

/* A signal as applyProposals builds one. `origin` null means "not established", which is the
   default and the conservative case. */
const sig = ({ ref = 'r' + Math.random(), source = 'self', origin = null, kind = 'observation',
               turn = 't1', at = t, directness = 'direct', authority = 'self_report',
               specificity = 0.8, status = 'active', dissents = false } = {}) => ({
  ref, source, originRef: origin, originKind: origin ? 'direct_observation' : 'unknown',
  kind, turnId: turn, at, directness, authority, specificity, status, dissents,
});

console.log('\n  ORIGIN — repetition is not corroboration');

/* 1 / 2 / 3 — the three cases that were previously indistinguishable. */
const fiveIndependent = d.deriveConfidence([
  sig({ ref: 'a', source: 'ash',   origin: 'saw_it_1',  turn: 'p1', at: t - 4 * day }),
  sig({ ref: 'b', source: 'bo',    origin: 'saw_it_2',  turn: 'p2', at: t - 3 * day }),
  sig({ ref: 'c', source: 'cass',  origin: 'saw_it_3',  turn: 'p3', at: t - 2 * day }),
  sig({ ref: 'e', source: 'dev',   origin: 'saw_it_4',  turn: 'p4', at: t - day }),
  sig({ ref: 'f', source: 'video', origin: 'saw_it_5',  turn: 'p5', at: t }),
], { now: t });

const fiveEchoes = d.deriveConfidence([
  sig({ ref: 'a', source: 'captain', origin: 'sat_match_press', turn: 'p1', at: t - 4 * day }),
  sig({ ref: 'b', source: 'ash',     origin: 'sat_match_press', turn: 'p2', at: t - 3 * day }),
  sig({ ref: 'c', source: 'bo',      origin: 'sat_match_press', turn: 'p3', at: t - 2 * day }),
  sig({ ref: 'e', source: 'cass',    origin: 'sat_match_press', turn: 'p4', at: t - day }),
  sig({ ref: 'f', source: 'dev',     origin: 'sat_match_press', turn: 'p5', at: t }),
], { now: t });

const fiveUnknown = d.deriveConfidence([
  sig({ ref: 'a', source: 'ash',  turn: 'p1', at: t - 4 * day }),
  sig({ ref: 'b', source: 'bo',   turn: 'p2', at: t - 3 * day }),
  sig({ ref: 'c', source: 'cass', turn: 'p3', at: t - 2 * day }),
  sig({ ref: 'e', source: 'dev',  turn: 'p4', at: t - day }),
  sig({ ref: 'f', source: 'eli',  turn: 'p5', at: t }),
], { now: t });

ok('1 · five independent origins is the strongest reading', fiveIndependent.score > fiveUnknown.score);
ok('2 · five sources echoing ONE origin is much weaker than five findings',
  fiveEchoes.score < fiveIndependent.score * 0.7);
ok('2 · …and it says so in its own words',
  fiveEchoes.because.some(b => /one origin/.test(b)));
ok('3 · unknown origin is NOT credited as independent origin',
  fiveUnknown.score < fiveIndependent.score);
ok('3 · …but is not treated as worthless either', fiveUnknown.score > 0 && fiveUnknown.score > fiveEchoes.score);
ok('3 · …and is honest about what it does not know',
  fiveUnknown.because.some(b => /origin not established/.test(b)));

/* 4 — the existing temporal axis must keep working. One person, genuinely separate tellings,
   is real corroboration and the origin work must not have flattened it. */
const oneSourceOneTelling = d.deriveConfidence([
  sig({ ref: 'a', source: 'ash', turn: 't1', at: t }),
  sig({ ref: 'b', source: 'ash', turn: 't1', at: t }),
], { now: t });
const oneSourceManyTellings = d.deriveConfidence([
  sig({ ref: 'a', source: 'ash', turn: 't1', at: t - 21 * day }),
  sig({ ref: 'b', source: 'ash', turn: 't2', at: t - 7 * day }),
  sig({ ref: 'c', source: 'ash', turn: 't3', at: t }),
], { now: t });
ok('4 · one source across genuinely separate occasions still corroborates',
  oneSourceManyTellings.score > oneSourceOneTelling.score);

/* 5 — same occasion, different origins. Four people watching one match and each noticing the
   thing separately IS four observations; origin is about what was seen, not when. */
const oneOccasionFourOrigins = d.deriveConfidence([
  sig({ ref: 'a', source: 'ash',   origin: 'ash_saw',   turn: 'match7' }),
  sig({ ref: 'b', source: 'bo',    origin: 'bo_saw',    turn: 'match7' }),
  sig({ ref: 'c', source: 'coach', origin: 'coach_saw', turn: 'match7' }),
  sig({ ref: 'e', source: 'video', origin: 'video_1',   turn: 'match7' }),
], { now: t });
const oneOccasionOneOrigin = d.deriveConfidence([
  sig({ ref: 'a', source: 'ash',   origin: 'cap_said', turn: 'match7' }),
  sig({ ref: 'b', source: 'bo',    origin: 'cap_said', turn: 'match7' }),
  sig({ ref: 'c', source: 'coach', origin: 'cap_said', turn: 'match7' }),
  sig({ ref: 'e', source: 'dev',   origin: 'cap_said', turn: 'match7' }),
], { now: t });
ok('5 · same occasion but separate observations still count as separate',
  oneOccasionFourOrigins.score > oneOccasionOneOrigin.score);

/* 6 — the headline guarantee. Repeating ONE origin, however many times, cannot climb. */
const echoes = n => d.deriveConfidence(
  Array.from({ length: n }, (_, i) => sig({ ref: 'r' + i, source: 's' + i, origin: 'one_thing', turn: 'p' + i, at: t - i * day })),
  { now: t });
ok('6 · twenty retellings of one origin do not beat five',
  echoes(20).score <= echoes(5).score + 0.01);
ok('6 · …and one origin can never reach "supported" on volume alone',
  echoes(20).band !== 'supported' && echoes(50).band !== 'supported');
ok('6 · …while genuinely independent origins can', fiveIndependent.band === 'supported' || fiveIndependent.score > echoes(50).score);

console.log('\n  ORIGIN — the model may classify, the kernel decides what it means');
ok('· an unrecognised origin kind degrades to unknown',
  d.originOf({ originKind: 'definitely_independent_trust_me', originRef: 'x' }).originKind === 'unknown');
ok('· a kind with no reference establishes nothing', d.originOf({ originKind: 'direct_observation' }).originRef === null);
ok('· a stated origin is kept', d.originOf({ originKind: 'document', originRef: 'report_4' }).originRef === 'report_4');
ok('· no origin at all is unknown, not independent', d.originOf({}).originKind === 'unknown');

console.log('\n  CONTRADICTION — the relationship survives routing');
const frontier = [{ inquiryId: 'inq_1', aliases: ['first_touch'], displayLabel: 'First touch' }];
{
  const same = d.resolveIdentity({ concept: 'touch', relationship: 'SAME_AS', targetId: 'inq_1', reason: 'same thing' }, frontier);
  const against = d.resolveIdentity({ concept: 'touch', relationship: 'CONTRADICTS', targetId: 'inq_1', reason: 'cuts against it' }, frontier);
  const supports = d.resolveIdentity({ concept: 'touch', relationship: 'SUPPORTS', targetId: 'inq_1', reason: 'bears on it' }, frontier);
  ok('7 · all three still route to the same place', same.action === 'apply' && against.action === 'apply' && supports.action === 'apply');
  ok('7 · …but CONTRADICTS is no longer indistinguishable from SAME_AS',
    against.relationship === 'CONTRADICTS' && same.relationship === 'SAME_AS' && supports.relationship === 'SUPPORTS');
  const orphan = d.resolveIdentity({ concept: 'touch', relationship: 'CONTRADICTS', targetId: 'inq_nope', reason: 'x' }, frontier);
  ok('7 · …and a contradiction aimed at an unresolvable target stays a contradiction',
    orphan.relationship === 'CONTRADICTS');
}

console.log('\n  HYPOTHESIS — refutation is a balance, not a biography');
const inq0 = d.newInquiry({ id: 'inq_1', subjectRef: 'member:ash', concept: 'first_touch', label: 'First touch', now: t });

/* 8 — a previously SUPPORTED hypothesis can become contested. */
let inq = d.applyProposals(inq0, [
  { id: 'o1', level: 'observation', text: 'loses it under pressure', sourceSpan: 'x', source: 'ash', originRef: 'ash_1', originKind: 'self_report', specificity: 0.8, turnId: 'p1' },
  { id: 'h1', level: 'hypothesis', text: 'technique under pressure', basis: ['o1'] },
], { now: t });
inq = d.applyProposals(inq, [
  { id: 'o2', level: 'observation', text: 'again on the weekend', sourceSpan: 'x', source: 'coach', originRef: 'coach_1', specificity: 0.8, turnId: 'p2', supports: 'h1' },
], { now: t + day });
const supportedScore = (inq.hypotheses.find(h => h.id === 'h1') || {}).confidence.score;
ok('8 · a hypothesis with live support leads', inq.leadingHypothesisId === 'h1' && supportedScore > 0);

inq = d.applyProposals(inq, [
  { id: 'o3', level: 'observation', text: 'video shows the touch was fine', sourceSpan: 'x', source: 'video', originRef: 'vid_1', authority: 'authoritative', specificity: 0.9, turnId: 'p3', challenges: 'h1' },
], { now: t + 2 * day });
{
  const h = inq.hypotheses.find(x => x.id === 'h1');
  ok('8 · …and real counter-evidence moves it off "open"', h.status === 'contested' || h.status === 'refuted');
  ok('8 · …with confidence actually falling', h.confidence.score < supportedScore);
}

/* 9 — enough contrary evidence refutes a hypothesis that DID have support. This is the case the
   old `never had support` rule made impossible. */
inq = d.applyProposals(inq, [
  { id: 'o4', level: 'observation', text: 'second analyst agrees', sourceSpan: 'x', source: 'analyst', originRef: 'an_1', authority: 'authoritative', specificity: 0.9, turnId: 'p4', challenges: 'h1' },
  { id: 'o5', level: 'observation', text: 'third review agrees', sourceSpan: 'x', source: 'review', originRef: 'rev_1', authority: 'authoritative', specificity: 0.9, turnId: 'p5', challenges: 'h1' },
], { now: t + 3 * day });
{
  const h = inq.hypotheses.find(x => x.id === 'h1');
  ok('9 · a previously supported hypothesis CAN be refuted', h.status === 'refuted');
  ok('9 · …and the timeline records it being ruled out',
    inq.timeline.some(e => e.kind === 'refuted'));
}

/* 10 — but one weak dissent must not fell a strongly supported explanation. */
{
  let strong = d.newInquiry({ id: 'inq_2', subjectRef: 'member:ash', concept: 'c', label: 'c', now: t });
  strong = d.applyProposals(strong, [
    { id: 'o1', level: 'observation', text: 'a', sourceSpan: 'x', source: 'ash',   originRef: 'g1', specificity: 0.9, authority: 'authoritative', turnId: 'p1' },
    { id: 'h1', level: 'hypothesis', text: 'the strong one', basis: ['o1'] },
  ], { now: t });
  strong = d.applyProposals(strong, [
    { id: 'o2', level: 'observation', text: 'b', sourceSpan: 'x', source: 'bo',    originRef: 'g2', specificity: 0.9, authority: 'authoritative', turnId: 'p2', supports: 'h1' },
    { id: 'o3', level: 'observation', text: 'c', sourceSpan: 'x', source: 'cass',  originRef: 'g3', specificity: 0.9, authority: 'authoritative', turnId: 'p3', supports: 'h1' },
    { id: 'o4', level: 'observation', text: 'd', sourceSpan: 'x', source: 'video', originRef: 'g4', specificity: 0.9, authority: 'authoritative', turnId: 'p4', supports: 'h1' },
  ], { now: t + day });
  const before = strong.hypotheses.find(h => h.id === 'h1').confidence.score;
  strong = d.applyProposals(strong, [
    { id: 'o9', level: 'observation', text: 'someone vaguely disagrees', sourceSpan: 'x', source: 'dev', specificity: 0.2, authority: 'unverified', turnId: 'p9', challenges: 'h1' },
  ], { now: t + 2 * day });
  const h = strong.hypotheses.find(x => x.id === 'h1');
  ok('10 · one weak dissent does not destroy strong independent support', h.status !== 'refuted');
  ok('10 · …though it does cost it something', h.confidence.score < before);
}

console.log('\n  CORRECTIONS — a claim can be taken back');
let c = d.newInquiry({ id: 'inq_3', subjectRef: 'member:ash', concept: 'first_touch', label: 'First touch', now: t });
c = d.applyProposals(c, [
  { id: 'o1', level: 'observation', text: 'my first touch was poor under pressure', sourceSpan: 'x', source: 'ash', originRef: 'ash_tue', specificity: 0.8, turnId: 'p1' },
  { id: 'h1', level: 'hypothesis', text: 'first touch technique', basis: ['o1'] },
], { now: t });
const beforeCorrection = c.confidence.score;
ok('11 · (a claim is recorded and supports a hypothesis)', beforeCorrection > 0 && c.signals.length === 1);

c = d.applyProposals(c, [
  { id: 'o2', level: 'observation', text: 'watched it back, the touch was fine, it was my body position', sourceSpan: 'x',
    source: 'ash', originRef: 'ash_video', specificity: 0.9, turnId: 'p4', corrects: ['o1'], correctionReason: 'reviewed the video' },
], { now: t + 3 * day });

{
  const old = c.signals.find(s => s.ref === 'o1');
  ok('11 · the correction lands', !!old && old.status === 'superseded');
  ok('12 · …and the original REMAINS in the record', c.signals.some(s => s.ref === 'o1'));
  ok('12 · …carrying who replaced it, when, and why',
    old.supersededBy === 'o2' && !!old.supersededAt && /video/.test(old.supersededReason));
  ok('12 · …and the timeline can explain the change',
    c.timeline.some(e => e.kind === 'correction'));
  ok('13 · a corrected claim no longer counts as current support',
    !c.confidence.because.some(b => /^1 signal/.test(b)) && c.hypotheses.find(h => h.id === 'h1').confidence.score
      < beforeCorrection + 0.001);
  ok('14 · the correcting evidence itself counts normally',
    c.signals.find(s => s.ref === 'o2').status === 'active');
}

/* 15 — a corrected claim, repeated, cannot inflate anything. */
{
  const withSuperseded = d.deriveConfidence([
    sig({ ref: 'a', source: 'ash', origin: 'o1', turn: 'p1', status: 'superseded' }),
    sig({ ref: 'b', source: 'ash', origin: 'o1', turn: 'p2', status: 'superseded' }),
    sig({ ref: 'c', source: 'ash', origin: 'o1', turn: 'p3', status: 'superseded' }),
    sig({ ref: 'e', source: 'bo',  origin: 'o2', turn: 'p4' }),
  ], { now: t });
  const aloneActive = d.deriveConfidence([sig({ ref: 'e', source: 'bo', origin: 'o2', turn: 'p4' })], { now: t });
  ok('15 · repeating a corrected claim inflates nothing', withSuperseded.score === aloneActive.score);
  const allGone = d.deriveConfidence([sig({ ref: 'a', status: 'superseded' }), sig({ ref: 'b', status: 'withdrawn' })], { now: t });
  ok('15 · …and an entirely corrected picture is honestly zero, not silently missing',
    allGone.score === 0 && allGone.because.some(b => /superseded or withdrawn/.test(b)));
}

/* 16 — a correction can hand the lead to a rival explanation. */
{
  let lead = d.newInquiry({ id: 'inq_4', subjectRef: 'member:ash', concept: 'c', label: 'c', now: t });
  lead = d.applyProposals(lead, [
    { id: 'o1', level: 'observation', text: 'touch was poor', sourceSpan: 'x', source: 'ash', originRef: 'a1', specificity: 0.9, turnId: 'p1' },
    { id: 'h1', level: 'hypothesis', text: 'first touch technique', basis: ['o1'] },
  ], { now: t });
  lead = d.applyProposals(lead, [
    { id: 'o2', level: 'observation', text: 'body position was square on', sourceSpan: 'x', source: 'coach', originRef: 'a2', specificity: 0.9, turnId: 'p2' },
    { id: 'h2', level: 'hypothesis', text: 'body orientation before receiving', basis: ['o2'] },
  ], { now: t + day });
  const leadBefore = lead.leadingHypothesisId;
  lead = d.applyProposals(lead, [
    { id: 'o3', level: 'observation', text: 'video: touch was fine', sourceSpan: 'x', source: 'ash', originRef: 'a3',
      specificity: 0.9, turnId: 'p3', corrects: ['o1'], correctionReason: 'video review', supports: 'h2' },
  ], { now: t + 2 * day });
  ok('16 · a correction can shift which explanation leads',
    leadBefore === 'h1' && lead.leadingHypothesisId === 'h2');
}

console.log('\n  CORRECTION vs CONTRADICTION — not the same thing');
{
  let x = d.newInquiry({ id: 'inq_5', subjectRef: 'member:ash', concept: 'c', label: 'c', now: t });
  x = d.applyProposals(x, [
    { id: 'o1', level: 'observation', text: 'positioning was fine', sourceSpan: 'x', source: 'ash', originRef: 'a1', specificity: 0.8, turnId: 'p1' },
  ], { now: t });
  // A different, non-authoritative source cannot overwrite someone else's account.
  x = d.applyProposals(x, [
    { id: 'o2', level: 'observation', text: 'positioning was the problem', sourceSpan: 'x', source: 'teammate',
      originRef: 'a2', authority: 'self_report', specificity: 0.8, turnId: 'p2', corrects: ['o1'] },
  ], { now: t + day });
  ok('· one person cannot silently overwrite another\'s account',
    x.signals.find(s => s.ref === 'o1').status === 'active');
  ok('· …it becomes a contradiction instead, and BOTH stay live',
    x.signals.find(s => s.ref === 'o2').dissents === true && x.signals.every(s => d.isActive(s)));
  ok('· …with the disagreement recorded, not resolved',
    (x.signals.find(s => s.ref === 'o2').disputes || []).includes('o1'));
  ok('· a source may always revise ITSELF', d.canCorrect({ source: 'ash' }, { source: 'ash' }));
  ok('· an authoritative record may overrule an unverified one',
    d.canCorrect({ source: 'ash', authority: 'self_report' }, { source: 'video', authority: 'authoritative' }));
  ok('· but an unverified claim may not overrule an authoritative one',
    !d.canCorrect({ source: 'video', authority: 'authoritative' }, { source: 'ash', authority: 'self_report' }));
}

/* ── PART O — THE GROUP PROOF ────────────────────────────────────────────────────────────────
   Read-only, kernel-level. A group subject is just another subjectRef; nothing below asks what
   kind of subject it is. The point is that the SAME machinery, given the shape of evidence a
   group actually produces, does not manufacture confidence out of a room agreeing with itself. */
console.log('\n  GROUP PROOF — synthetic group:u18, no kernel fork');
{
  let g = d.newInquiry({ id: 'inq_g1', subjectRef: 'group:u18', concept: 'press_resistance', label: 'Playing out under pressure', now: t });

  // Five members repeating ONE captain observation from Saturday's match.
  g = d.applyProposals(g, [
    { id: 'c1', level: 'observation', text: 'their press kept forcing us backwards', sourceSpan: 'x',
      source: 'captain', originKind: 'direct_observation', originRef: 'sat_match_press', specificity: 0.8, turnId: 'g1' },
    { id: 'h1', level: 'hypothesis', text: 'the press is beating our first line', basis: ['c1'] },
  ], { now: t });
  const echoProps = ['ash', 'bo', 'cass', 'dev'].map((who, i) => ({
    id: 'e' + i, level: 'observation', text: 'like the captain said, their press pinned us', sourceSpan: 'x',
    source: who, originKind: 'reported', originRef: 'sat_match_press', specificity: 0.7, turnId: 'g' + (i + 2), supports: 'h1',
  }));
  g = d.applyProposals(g, echoProps, { now: t + day });
  const afterEchoes = g.hypotheses.find(h => h.id === 'h1').confidence.score;
  ok('O1 · five voices repeating one origin do not read as five confirmations',
    g.hypotheses.find(h => h.id === 'h1').confidence.band !== 'supported');
  ok('O1 · …and the reason is legible', g.confidence.because.some(b => /one origin/.test(b)));

  // Two genuinely independent observations.
  g = d.applyProposals(g, [
    { id: 'i1', level: 'observation', text: 'I noticed it myself in the second half', sourceSpan: 'x',
      source: 'eli', originKind: 'direct_observation', originRef: 'eli_saw', specificity: 0.8, turnId: 'g7', supports: 'h1' },
    { id: 'i2', level: 'observation', text: 'I saw the same in training', sourceSpan: 'x',
      source: 'fern', originKind: 'direct_observation', originRef: 'fern_saw', specificity: 0.8, turnId: 'g8', supports: 'h1' },
  ], { now: t + 2 * day });
  const afterIndependent = g.hypotheses.find(h => h.id === 'h1').confidence.score;
  ok('O2 · genuinely independent observations DO add confidence', afterIndependent > afterEchoes);

  // Video analysis — another independent origin, of a different kind.
  g = d.applyProposals(g, [
    { id: 'v1', level: 'observation', text: 'clip shows six turnovers in the first phase', sourceSpan: 'x',
      source: 'analysis', originKind: 'document', originRef: 'clip_pack_12', authority: 'authoritative', specificity: 0.9, turnId: 'g9', supports: 'h1' },
  ], { now: t + 3 * day });
  const afterVideo = g.hypotheses.find(h => h.id === 'h1').confidence.score;
  ok('O3 · a document adds another independent origin', afterVideo > afterIndependent);

  // A correction from the captain: the original account was wrong.
  g = d.applyProposals(g, [
    { id: 'c2', level: 'observation', text: 'rewatching it, it was our spacing not their press', sourceSpan: 'x',
      source: 'captain', originKind: 'direct_observation', originRef: 'cap_review', specificity: 0.9, turnId: 'g10',
      corrects: ['c1'], correctionReason: 'rewatched the match' },
  ], { now: t + 4 * day });
  ok('O4 · a correction retires the earlier account', g.signals.find(s => s.ref === 'c1').status === 'superseded');
  ok('O4 · …without deleting it', g.signals.some(s => s.ref === 'c1'));
  ok('O4 · …and history can still explain what changed',
    g.timeline.some(e => e.kind === 'correction') && g.signals.find(s => s.ref === 'c1').supersededBy === 'c2');
  ok('O4 · …while the echoes of it remain visible as what they were',
    g.signals.filter(s => s.originRef === 'sat_match_press' && s.originKind === 'reported').length === 4);

  // A contradiction that stays live.
  g = d.applyProposals(g, [
    { id: 'x1', level: 'observation', text: 'the press was fine, we just rushed it', sourceSpan: 'x',
      source: 'gil', originKind: 'direct_observation', originRef: 'gil_saw', specificity: 0.8, turnId: 'g11', challenges: 'h1' },
  ], { now: t + 5 * day });
  ok('O5 · a contradiction remains visible rather than being absorbed',
    g.hypotheses.find(h => h.id === 'h1').challengeRefs.includes('x1') &&
    d.isActive(g.signals.find(s => s.ref === 'x1')));

  ok('O6 · every step ran on a group: subject with no special handling',
    g.subjectRef === 'group:u18' && g.signals.length === 10);
}

console.log(`\norigin-correction-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
