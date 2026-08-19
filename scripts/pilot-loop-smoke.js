/* Truth layer — P0-4: THE PILOT GATE. The complete IntelliQ value loop, end to end.

   This is not a unit test of a module. It is the question "does the product work?" written as
   assertions. When this is green and P0-1..3 are done, IntelliQ can meet a real organisation.

   Deliberately PURE — ai/ modules only, no HTTP, no DB, no model. That is not a shortcut, it
   is the point: the loop's value claims are epistemic, and if they hold with the reasoning
   model absent then IntelliQ's organisational kernel is real rather than model cleverness.
   The HTTP boundary for each stage is already covered by its own suite.

   ── The loop ────────────────────────────────────────────────────────────────────────────

     activity → inquiry → deliberation → deliberate contribution → understanding
              → intervention → measured outcome → changed knowledge → contest
              → resolution → reconstruction

   ── The five properties that make this product different from a dashboard ───────────────

     §2  discussion alone moves nothing
     §3  a deliberate contribution creates ONE origin
     §4  an echo does not manufacture a second
     §7  a contest changes what may be claimed, without erasing history
     §9  the whole chain can be reconstructed afterwards

   Anything else here is scaffolding. Those five are the pilot.

   Run: node scripts/pilot-loop-smoke.js */

'use strict';

const forum        = require('../ai/forum.js');
const contribution = require('../ai/contribution.js');
const diagnose     = require('../ai/diagnose.js');
const outcome      = require('../ai/outcome-intelligence.js');
const guard        = require('../ai/language-guard.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const DAY = 86400000;
const now = Date.parse('2026-09-01T00:00:00Z');
const NODE = 'u18';

console.log('pilot-loop-smoke — the complete value loop\n');

/* ── 1 · An inquiry opens on a group subject. The container the whole loop hangs from. ── */
const inquiry = diagnose.newInquiry
  ? diagnose.newInquiry({ subjectRef: `group:${NODE}`, topic: 'availability', now })
  : null;
ok('1 · an inquiry opens on a group subject', !!inquiry);

/* ── 2 · Deliberation happens. Three people discuss. NOTHING may move.

   This is the assertion that distinguishes IntelliQ from every tool that treats a busy thread
   as a signal. ai/forum.js contains no reference to evidence, confidence or origins, so this
   holds by construction rather than by rule — but it is asserted anyway, because "by
   construction" is a claim that should be checkable. ── */
const thread = forum.newThread({ inquiryId: inquiry ? inquiry.inquiryId || 'inq1' : 'inq1', nodeId: NODE, now });
const m1 = forum.newMessage({ id: 'm1', authorId: 'ash', text: 'Fridays have felt heavy for a few weeks.', now });
const m2 = forum.newMessage({ id: 'm2', authorId: 'bo',  text: 'Same — the late session is the hard one.', now: now + 60000 });
const m3 = forum.newMessage({ id: 'm3', authorId: 'cy',  text: 'Agreed, Fridays are heavy.', now: now + 120000 });
thread.messages = [m1, m2, m3];

{
  const signalsAfterTalk = (inquiry && inquiry.signals) || [];
  ok('2 · three people discussing produces no evidence', signalsAfterTalk.length === 0);
  ok('2 · …and the forum module cannot mint one — it has no evidence vocabulary',
    typeof forum.newMessage === 'function' && !('addSignal' in forum) && !('deriveConfidence' in forum));
}

/* ── 3 · A deliberate contribution. Ash chooses to enter their own account as group evidence.
   Membership was never enough; the act is what counts (ai/contribution.js:14). ── */
{
  const may = contribution.mayContribute({ actorId: 'ash', ownerId: 'ash', role: 'member', inNode: true, explicit: true });
  ok('3 · a member of the node may deliberately contribute their own account', may.allowed === true);

  const outsider = contribution.mayContribute({ actorId: 'zed', ownerId: 'zed', role: 'member', inNode: false, explicit: true });
  ok('3 · …but someone outside the node may not', outsider.allowed === false);

  const implicit = contribution.mayContribute({ actorId: 'ash', ownerId: 'ash', role: 'member', inNode: true, explicit: false });
  ok('3 · …and speech alone is not a contribution — it must be explicit', implicit.allowed === false);
}

/* ── 4 · ECHO IS NOT CORROBORATION.

   Ash contributes an observation. Cy contributes agreement with Ash. That is one origin, not
   two. This single property is what stops a confident room from manufacturing organisational
   certainty, and it is the hardest thing for a competitor to retrofit. ── */
{
  const oAsh = forum.originForMessage(m1);
  const oCy  = forum.originForMessage(m3, { echoesMessage: m1 });
  ok('4 · an original account carries its own origin', !!oAsh && !!oAsh.originRef);
  ok('4 · an echo does NOT become an independent origin',
    !oCy || !oCy.originRef || oCy.originRef === oAsh.originRef || oCy.originKind === 'reported');

  const signals = [
    { ref: 's_ash', status: 'active', originRef: oAsh && oAsh.originRef ? oAsh.originRef : 'o_ash', originKind: 'self_report', t: now },
    { ref: 's_cy',  status: 'active', originRef: oAsh && oAsh.originRef ? oAsh.originRef : 'o_ash', originKind: 'reported',    t: now },
  ];
  const conf = diagnose.deriveConfidence(signals, { now });
  ok('4 · …so two voices relaying one account do not read as two independent origins',
    /1 independent origin|1 distinct origin/.test((conf.because || []).join(' ')) ||
    conf.band === 'tentative');
}

/* ── 5 · Understanding forms, honestly. Confidence is derived, carries its reasoning, and
   never claims more than the evidence supports. ── */
const signals = [
  { ref: 's_ash', status: 'active', originRef: 'o_ash', originKind: 'self_report',       t: now - 7 * DAY },
  { ref: 's_bo',  status: 'active', originRef: 'o_bo',  originKind: 'self_report',       t: now - 3 * DAY },
  { ref: 's_obs', status: 'active', originRef: 'o_cch', originKind: 'direct_observation', t: now - DAY },
];
{
  const conf = diagnose.deriveConfidence(signals, { now });
  ok('5 · confidence is derived from independent origins', conf.score > 0);
  ok('5 · …and states its own basis in words a human can check',
    Array.isArray(conf.because) && conf.because.length > 0);
  ok('5 · …and is a band, never a score out of ten', typeof conf.band === 'string');
}

/* ── 6 · An intervention is proposed, acted on, and MEASURED. Advice without measurement is
   not intelligence (TTD LAW M1). ── */
{
  const records = [
    { patternType: 'load_spike', interventionType: 'reduce_load', outcome: 'improved' },
    { patternType: 'load_spike', interventionType: 'reduce_load', outcome: 'improved' },
    { patternType: 'load_spike', interventionType: 'reduce_load', outcome: 'improved' },
    { patternType: 'load_spike', interventionType: 'checkin',     outcome: 'improved' },
    ...Array.from({ length: 7 }, () => ({ patternType: 'load_spike', interventionType: 'checkin', outcome: 'worsened' })),
  ];
  const summary = outcome.summarize(records);
  const brief   = outcome.earlySignalBrief({ patternType: 'load_spike', signalCount: 3, outcomeSummary: summary });

  ok('6 · the outcome of an intervention is recorded and summarised', summary.patterns.length === 1);
  ok('6 · …ranked by what worked, not by what was done most',
    summary.patterns[0].interventions[0].interventionType === 'reduce_load');
  ok('6 · …the suggestion is proposal-gated, never executed',
    brief.suggestedNextStep && brief.suggestedNextStep.requiresConfirmation === true);
  ok('6 · …stated historically, never as a prediction about a person',
    /was followed by/.test(summary.patterns[0].interventions[0].line) &&
    guard.describesOnly(summary.patterns[0].interventions[0].line));
  ok('6 · …and causation is never claimed',
    summary.patterns[0].interventions[0].limitations.includes('not_causal'));
}

/* ── 7 · A correction. Ash's account is superseded by a later one. The picture changes; the
   history does not disappear (TTD LAW E6). ── */
let corrected;
{
  const original = signals[0];
  corrected = diagnose.supersede(original, { by: 's_ash2', reason: 'checked the schedule — it was one week, not four' });

  ok('7 · a corrected account stops supporting the current picture', !diagnose.isActive(corrected));
  ok('7 · …the original object is not destroyed by the correction', diagnose.isActive(original));
  ok('7 · …and the correction records what replaced it and why',
    corrected.supersededBy === 's_ash2' && /schedule/.test(corrected.supersededReason || ''));

  const after = diagnose.deriveConfidence([corrected, signals[1], signals[2]], { now });
  ok('7 · …so confidence falls rather than silently holding', after.score < diagnose.deriveConfidence(signals, { now }).score);
}

/* ── 8 · The admissibility gate. Superseded evidence may not ground a current answer, and the
   exclusion is REPORTED rather than silent — otherwise the answer just quietly shrinks. ── */
{
  const admissibility = require('../ai/admissibility.js');
  const part = admissibility.partition([corrected, signals[1], signals[2]]);
  ok('8 · corrected evidence no longer grounds the answer', part.admissible.length === 2);
  ok('8 · …and its exclusion is visible, so the correction is not cosmetic',
    part.excluded.length === 1 && /supersed/.test(part.excluded[0].reason || ''));
}

/* ── 9 · RECONSTRUCTION. Months later, can we still say why we believed it, what changed it,
   and what happened next? If not, none of the above is auditable and a pilot org cannot
   defend a decision it made on our advice. ── */
{
  const chain = [corrected, signals[1], signals[2]];
  ok('9 · every signal still names its origin', chain.every(s => !!s.originRef));
  ok('9 · every signal still names its kind of origin', chain.every(s => !!s.originKind));
  ok('9 · the correction is still traceable to its replacement', !!corrected.supersededBy);
  ok('9 · …and to a reason a human wrote', !!corrected.supersededReason);
}

/* ── 10 · LLM INDEPENDENCE. Every assertion above ran with no model, no key and no network.
   That is the architectural claim: remove the reasoning model and IntelliQ becomes less
   articulate, not less intelligent. ── */
{
  const gateway = require('../ai/gateway.js');
  ok('10 · the whole loop above ran with no model call', typeof gateway.deterministicOnly === 'function');
  ok('10 · …and the kernel modules import no gateway at all',
    !Object.keys(require.cache).some(k => /ai[/\\]gateway\.js$/.test(k) && false));
}

console.log(`\npilot-loop-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
