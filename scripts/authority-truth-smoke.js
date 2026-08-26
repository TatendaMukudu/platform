/* Truth layer — P0-D: AUTHORITY DECIDES WHAT MAY BE SETTLED, NEVER WHAT IS TRUE.

   Pilot blocker. See docs/briefs/p0-d-authority-and-p0-5-origin.md.

   WRITTEN BEFORE THE FIX, by the reviewer. Do not edit an assertion to make it pass.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green.

   ── The defect ──────────────────────────────────────────────────────────────────────────

   ai/inquiry.js  adjudicateAnswer()  — three branches (negate, affirm, plain statement) all
   read:

       authority:  isOwner ? 'authoritative' : (isMember ? 'shared_but_unverified' : 'reported')
       confidence: isOwner ? 'high' : 'medium'
       proposal:   { …, corroborationNeeded: !isOwner }

   `isOwner` is a ROLE fact — this person is the responsible owner for this requirement. For
   an OPERATIONAL claim that is exactly right: the coach who sets kick-off time IS the system
   of record for kick-off time, and their word settles it.

   For an EMPIRICAL claim it is a category error. "The squad is fatigued", "morale is down",
   "attendance improved" are propositions about the world. No role makes one true. Today the
   owner asserting one is recorded `authoritative`, `high`, `corroborationNeeded: false` — and
   ai/org-state.js:217 then treats it as SATISFYING the requirement, so a single leader's
   impression closes an empirical question that no evidence ever supported.

   That is the one place in the system where position outranks evidence.

   ── The invariant ───────────────────────────────────────────────────────────────────────

       A person's role may determine what they are entitled to DECIDE. It may never
       determine whether an empirical proposition is TRUE. An empirical claim always needs
       corroboration, whoever made it.

   ── The model ───────────────────────────────────────────────────────────────────────────

   `claimNature(claimType)` → 'operational' | 'empirical'.

   OPERATIONAL is an ALLOW-LIST, drawn from the claim types the packs actually define
   (ai/org-state.js:61-80): meeting_time, meeting_owner, completion_status, kickoff_time,
   game_plan, availability, session_time. Anything not on the list is EMPIRICAL.

   Fail closed, and note which way "closed" points: an unrecognised claim type must NOT
   inherit owner authority. Getting that backwards would mean every new claim type ships
   with the defect until someone remembers to classify it.

   Run: node scripts/authority-truth-smoke.js */

'use strict';

const inquiry = require('../ai/inquiry.js');
const orgContext = require('../ai/org-context.js');
const orgState = require('../ai/org-state.js');
const primitives = require('../ai/primitives.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('authority-truth-smoke — P0-D\n');

/* ── 1 · The nature of a claim is a thing the system can state. ──────────────────────────
   Without this there is nothing for the adjudicator to consult, and the distinction can only
   live in a comment. */
const nature = inquiry.claimNature;
ok('1 · claimNature(claimType) is exported', typeof nature === 'function');

if (typeof nature !== 'function') {
  console.log('\n  → ai/inquiry.js does not export claimNature. The remaining cases cannot run.');
  console.log(`\nauthority-truth-smoke: ${pass} passed, ${fail + 13} failed`);
  process.exit(1);
}

/* ── 2 · Production, not a duplicated list, defines the completeness check. ──────────────
   Pack requirements and claim types emitted by org-context are the production sources. */
{
  const packTypes = Object.values(orgState.PACKS).flatMap(pack => Object.keys(pack.requirements));
  const contextTypes = ['transport confirmation', 'approval', 'owner', 'ownership'].map(label => {
    const proposal = orgContext.extract(`${label} must be confirmed`).proposals.find(p => p.type === 'requirement');
    return proposal && proposal.fields.claimType;
  });
  ok('2 · every operational claim type exposed by production is operational',
    [...packTypes, ...contextTypes].every(ct => ct && nature(ct) === 'operational'));
  ok('2 · org-context exposes the four defined arrangement types',
    ['transport_confirmation', 'approval', 'owner', 'ownership'].every(ct => contextTypes.includes(ct)));
}

/* ── 3 · Everything else is empirical, INCLUDING what nobody has classified yet. ─────────
   The direction of the default is the whole safety property. ── */
{
  ok('3 · a proposition about the world is empirical',
    nature('team_morale') === 'empirical' && nature('fatigue') === 'empirical');
  ok('3 · an unrecognised claim type defaults to empirical, never to operational',
    nature('some_claim_type_invented_next_year') === 'empirical');
  ok('3 · a missing claim type defaults to empirical',
    nature(null) === 'empirical' && nature(undefined) === 'empirical' && nature('') === 'empirical');
}

/* ── 3b · Free-text arrangements are operational because of their confirmed origin. ─────
   The identical string outside that origin remains empirical. */
{
  const now = Date.parse('2026-08-21T12:00:00Z');
  const proposals = [
    ...orgContext.extract('The kit manager owns pitch booking', { now }).proposals,
    ...orgContext.extract('pitch booking must be done', { now }).proposals,
  ];
  const records = proposals.map((p, i) => ({
    id: `ctx_${i}`, type: p.type, fields: p.fields, status: 'active',
    confirmedAt: new Date(now).toISOString(), effectiveFrom: new Date(now - 1000).toISOString(),
  }));
  const config = orgContext.projectConfig(records, now);
  const state = orgState.deriveOrgState({ now, organisation: { id: 'org-a' },
    structure: { responsibilities: config.responsibilities }, configuration: config, evidence: [] });
  const uncertainty = orgState.stateToUncertainties(state).find(u => u.claimType === 'pitch_booking');
  ok('3b · org-context carries arrangement provenance into the live uncertainty',
    !!uncertainty && uncertainty.claimOrigin === orgContext.ARRANGEMENT_ORIGIN && uncertainty.resolutionOwner === 'kit manager');

  const governed = inquiry.adjudicateAnswer({ answer: 'Yes, done.', isOwner: true,
    claimType: uncertainty && uncertainty.claimType, claimOrigin: uncertainty && uncertainty.claimOrigin });
  ok('3b · the responsible owner can settle a free-text org-context arrangement',
    governed.authority === 'authoritative' && governed.proposal.corroborationNeeded === false &&
    !governed.limitations.some(l => /empirical/i.test(l)));

  const unprovenanced = inquiry.adjudicateAnswer({ answer: 'Yes, done.', isOwner: true, claimType: 'pitch_booking' });
  ok('3b · the same unknown string outside org-context still fails closed to empirical',
    nature('pitch_booking') === 'empirical' && unprovenanced.authority !== 'authoritative' &&
    unprovenanced.proposal.corroborationNeeded === true);

  const requirementOnly = orgContext.projectConfig(records.filter(r => r.type === 'requirement'), now);
  ok('3b · org-context wording alone cannot mint operational provenance without responsibility',
    requirementOnly.requirements[0].claimOrigin === null);
}

/* ── 4 · NO REGRESSION. An owner still settles an operational claim.
   If this fails, the fix has broken the thing the system gets right today. ── */
{
  const transport = inquiry.adjudicateAnswer({ answer: 'Yes, transport is confirmed.', isOwner: true,
    claimType: 'transport_confirmation', claimLabel: 'Transport' });
  ok('4 · an owner can settle the production transport-confirmation arrangement',
    nature('transport_confirmation') === 'operational' && transport.authority === 'authoritative' &&
    transport.proposal.corroborationNeeded === false);

  const r = inquiry.adjudicateAnswer({
    answer: 'Yes, kick-off is confirmed for 2pm.',
    isOwner: true, claimType: 'kickoff_time', claimLabel: 'Kick-off time',
  });
  ok('4 · the owner of an operational claim is still authoritative', r.authority === 'authoritative');
  ok('4 · …and it still satisfies the requirement without corroboration',
    r.proposal && r.proposal.corroborationNeeded === false);
}

/* ── 5 · THE HEADLINE. The same person, the same confidence, an empirical claim.
   Being the responsible leader does not make a proposition about the world true. ── */
{
  const r = inquiry.adjudicateAnswer({
    answer: 'Yes, the squad has definitely been fatigued this week.',
    isOwner: true, claimType: 'team_fatigue', claimLabel: 'Squad fatigue',
  });
  ok('5 · an owner asserting an EMPIRICAL claim is not authoritative',
    r.authority !== 'authoritative');
  ok('5 · …and it always needs corroboration, whoever said it',
    !!r.proposal && r.proposal.corroborationNeeded === true);
  ok('5 · …and confidence is not raised to high by role alone',
    r.confidence !== 'high');
  ok('5 · …and the reason is stated, not silently applied',
    Array.isArray(r.limitations) && r.limitations.some(l => /corroborat|empirical|observ|evidence/i.test(l)));
}

/* ── 6 · The same holds for the other two branches that read isOwner.
   Fixing only the affirmative path leaves the identical hole one sentence away. ── */
{
  const stmt = inquiry.adjudicateAnswer({
    answer: 'Attendance has been dropping since the schedule changed.',
    isOwner: true, claimType: 'attendance_trend', claimLabel: 'Attendance',
  });
  ok('6 · a plain empirical statement by the owner needs corroboration',
    !!stmt.proposal && stmt.proposal.corroborationNeeded === true && stmt.authority !== 'authoritative');

  const neg = inquiry.adjudicateAnswer({
    answer: 'No, morale has not recovered.',
    isOwner: true, claimType: 'team_morale', claimLabel: 'Morale',
    hasExistingAuthoritative: true,
  });
  ok('6 · an empirical negation by the owner needs corroboration',
    !!neg.proposal && neg.proposal.corroborationNeeded === true && neg.authority !== 'authoritative');
}

/* ── 7 · Nature belongs to the CLAIM, not to the answerer.
   If who is speaking could change whether something is empirical, the whole distinction
   collapses back into authority. ── */
{
  const asOwner  = inquiry.adjudicateAnswer({ answer: 'Yes, the group is tired.', isOwner: true,  claimType: 'team_fatigue' });
  const asMember = inquiry.adjudicateAnswer({ answer: 'Yes, the group is tired.', isMember: true, claimType: 'team_fatigue' });
  ok('7 · an empirical claim needs corroboration regardless of who answered',
    asOwner.proposal.corroborationNeeded === true && asMember.proposal.corroborationNeeded === true);
  ok('7 · …and neither answerer is recorded as authoritative on it',
    asOwner.authority !== 'authoritative' && asMember.authority !== 'authoritative');
}

/* ── 8 · Nothing else moves. A hedged answer was already handled correctly and must stay
   that way — this fix adds a reason for corroboration, it does not change the vocabulary. ── */
{
  const vague = inquiry.adjudicateAnswer({ answer: 'It should be fine I think.', isOwner: true, claimType: 'kickoff_time' });
  ok('8 · a hedged answer is still a non-definite, needs-corroboration placeholder',
    vague.authority === 'needs_corroboration' && vague.proposal.definite === false);

  const nonAnswer = inquiry.adjudicateAnswer({ answer: 'thanks', isOwner: true, claimType: 'team_fatigue' });
  ok('8 · an acknowledgement is still not an answer and proposes nothing',
    nonAnswer.responseKind === 'non_answer' && nonAnswer.proposal === null);
}

/* ── 9 · Responsibility for an empirical topic never becomes truth authority. ── */
{
  const now = Date.parse('2026-08-21T12:00:00Z');
  const proposals = [
    ...orgContext.extract('Sam is responsible for attendance', { now }).proposals,
    ...orgContext.extract('attendance must be confirmed', { now }).proposals,
  ];
  const records = proposals.map((p, i) => ({ id: `attendance_${i}`, type: p.type,
    fields: p.fields, status: 'active', confirmedAt: new Date(now).toISOString() }));
  const config = orgContext.projectConfig(records, now);
  const state = orgState.deriveOrgState({ now, organisation: { id: 'org-a' },
    structure: { responsibilities: config.responsibilities }, configuration: config, evidence: [] });
  const uncertainty = orgState.stateToUncertainties(state).find(u => u.claimType === 'attendance');
  const answer = inquiry.adjudicateAnswer({ answer: 'Yes, attendance has improved.', isOwner: true,
    claimType: 'attendance', claimOrigin: uncertainty && uncertainty.claimOrigin });
  ok('9 · attendance responsibility routes to its owner without granting truth authority',
    !!uncertainty && String(uncertainty.resolutionOwner).toLowerCase() === 'sam' && answer.authority !== 'authoritative');
  ok('9 · the empirical answer inherits neither high confidence nor satisfaction',
    answer.confidence !== 'high' && answer.proposal.corroborationNeeded === true &&
    answer.limitations.some(l => /empirical|evidence|corroborat/i.test(l)));
}

ok('10 · exact empirical identity overrides a hand-constructed arrangement marker',
  nature('attendance', { origin: orgContext.ARRANGEMENT_ORIGIN }) === 'empirical');

/* The genuine pitch-booking path in §3b remains the Boundary A/B operational proof (§11/12). */

{
  const packTypes = Object.values(orgState.PACKS).flatMap(pack => Object.keys(pack.requirements));
  const contextTypes = ['transport confirmation', 'approval', 'owner', 'ownership'].map(label =>
    orgContext.extract(`${label} must be confirmed`).proposals.find(p => p.type === 'requirement').fields.claimType);
  const operational = [...new Set([...packTypes, ...contextTypes])];
  ok('13 · all eleven curated operational identities survive with and without provenance',
    operational.length === 11 && operational.every(ct => nature(ct) === 'operational' &&
      nature(ct, { origin: orgContext.ARRANGEMENT_ORIGIN }) === 'operational'));
}

ok('14 · every canonical empirical identity resists owner role plus arrangement provenance',
  primitives.EMPIRICAL_CONCEPTS instanceof Set && primitives.EMPIRICAL_CONCEPTS.size > 60 &&
  [...primitives.EMPIRICAL_CONCEPTS].every(ct => {
    const answer = inquiry.adjudicateAnswer({ answer: 'Yes, definitely.', isOwner: true,
      claimType: ct, claimOrigin: orgContext.ARRANGEMENT_ORIGIN });
    return nature(ct, { origin: orgContext.ARRANGEMENT_ORIGIN }) === 'empirical' &&
      answer.authority !== 'authoritative' && answer.confidence !== 'high' &&
      answer.proposal.corroborationNeeded === true;
  }));

{
  const derived = ['attendance_rate', 'engagement_dropped', 'wellbeing_score',
    'morale_trend', 'performance_review'];
  ok('15 · derived empirical identities resist arrangement provenance', derived.every(ct =>
    nature(ct, { origin: orgContext.ARRANGEMENT_ORIGIN }) === 'empirical'));
  ok('15 · token matching never degrades into substring matching',
    nature('disapproval', { origin: orgContext.ARRANGEMENT_ORIGIN }) === 'operational' &&
    nature('downer', { origin: orgContext.ARRANGEMENT_ORIGIN }) === 'operational');
}

{
  const now = Date.parse('2026-08-21T12:00:00Z');
  const projected = claim => {
    const proposals = [
      ...orgContext.extract(`Sam is responsible for ${claim}`, { now }).proposals,
      ...orgContext.extract(`${claim} must be confirmed`, { now }).proposals,
    ];
    return orgContext.projectConfig(proposals.map((p, i) => ({ id: `${claim}_${i}`,
      type: p.type, fields: p.fields, status: 'active', confirmedAt: new Date(now).toISOString() })), now);
  };
  ok('16 · projectConfig withholds arrangement provenance from known empirical claims',
    projected('attendance').requirements[0].claimOrigin === null);
  ok('16 · projectConfig retains arrangement provenance for an unknown assigned arrangement',
    projected('pitch booking').requirements[0].claimOrigin === orgContext.ARRANGEMENT_ORIGIN);
}

{
  const malformed = [undefined, null, '', '   ', 123, {}];
  ok('17 · malformed identities remain empirical even when a marker is supplied', malformed.every(ct =>
    nature(ct, { origin: orgContext.ARRANGEMENT_ORIGIN }) === 'empirical'));
  ok('17 · arbitrary unknown identities without provenance remain empirical',
    ['__proto__', 'constructor', 'brand_new_type'].every(ct => nature(ct) === 'empirical'));
}

console.log(`\nauthority-truth-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
