/* ============================================================
   ai/assessment-view.js — PURE member-facing assessment projection

   Derives a MEMBER's view of an assessment/check-in from confirmed inputs — leading with
   interpretation, supporting evidence, uncertainty, and a concrete next action, NOT a bare
   score. A numeric score may exist underneath for computation, but it surfaces only when it
   genuinely helps the member interpret the result.

   Critically, it distinguishes three things the old card blurred together:
     • a generated PROJECTION (IntelliQ's neutral reading),
     • direct HUMAN feedback (a real, individual comment from a leader),
     • unresolved / MISSING context.
   Sample or duplicated placeholder feedback (the same "Good detail — keep it up" on every
   card) is detected and never presented as though it were a real person's individual note.

   Discipline: PURE — imports nothing, deterministic, no LLM. Member-safe output only: no
   raw evidence, authority metadata, fingerprints, or internal confidence numbers.
   ============================================================ */

const norm = s => String(s == null ? '' : s).trim();

/* Generic, non-individual comments that carry no member-specific signal. */
const GENERIC_FEEDBACK = [
  /^good( detail| job| work| stuff)?[.! ]*$/i, /^great( job| work| stuff)?[.! ]*$/i,
  /^nice( one| work)?[.! ]*$/i, /^well done[.! ]*$/i, /^keep it up[.! ]*$/i,
  /^good detail\s*[—-]\s*keep it up[.! ]*$/i, /^solid[.! ]*$/i, /^ok(ay)?[.! ]*$/i,
  /^thanks?[.! ]*$/i, /^noted[.! ]*$/i,
];

/* Is this feedback a placeholder — empty, generic, or duplicated across other assessments
   (a sample value repeated verbatim, so not individual to this member)? */
function isPlaceholderFeedback(text, otherFeedbackTexts = []) {
  const t = norm(text);
  if (!t) return true;
  if (GENERIC_FEEDBACK.some(re => re.test(t))) return true;
  const dupes = (otherFeedbackTexts || []).map(norm).filter(x => x && x.toLowerCase() === t.toLowerCase());
  if (dupes.length >= 1) return true;              // the same comment appears elsewhere → sample/non-individual
  return false;
}

const RATIO_LABEL = [
  [0.85, 'Strong', 'The recorded evidence meets this expectation well.'],
  [0.6, 'Meeting the expectation', 'The recorded evidence is in line with what was asked.'],
  [0.4, 'Developing', 'There is a start here, but not yet enough evidence that it is happening reliably.'],
  [0, 'Needs attention', 'The recorded evidence is below what this expects.'],
];

/* ── project — the member's view. Inputs are already-confirmed/derived facts:
   { title, status, requiredCount, answeredCount, partialCount, feedback,
     otherFeedbackTexts, score, scoreMax } ── */
function project({ title = 'Assessment', status = 'assigned', requiredCount = 0, answeredCount = 0,
  partialCount = 0, feedback = '', otherFeedbackTexts = [], score = null, scoreMax = null } = {}) {

  const humanFeedback = !isPlaceholderFeedback(feedback, otherFeedbackTexts) ? norm(feedback) : '';
  const feedbackKind = humanFeedback ? 'human' : (norm(feedback) ? 'generic' : 'none');
  const remaining = Math.max(0, requiredCount - answeredCount);
  const strengths = [], attentionAreas = [], nextActions = [], limitations = [];
  let statusLabel, summary;
  let optionalScore = { show: false, value: score, max: scoreMax };

  if (status === 'returned') {
    // A reviewed result. Lead with meaning; the score supports, it does not headline.
    const ratio = (Number.isFinite(score) && Number.isFinite(scoreMax) && scoreMax > 0) ? score / scoreMax : null;
    if (ratio != null) {
      const [, label, meaning] = RATIO_LABEL.find(([t]) => ratio >= t);
      statusLabel = label;
      summary = meaning;
      optionalScore = { show: true, value: score, max: scoreMax };   // the number helps interpret a reviewed result
      if (ratio >= 0.6) strengths.push('The submitted work is meeting the expectation for this rubric.');
      if (ratio < 0.6) attentionAreas.push('There is not yet enough evidence that this is happening reliably.');
    } else {
      statusLabel = 'Reviewed';
      summary = 'Your submission has been reviewed.';
    }
    if (humanFeedback) { strengths.length = 0; nextActions.push('Read your leader\'s note below and reply if you have a question.'); }
    else if (feedbackKind === 'generic') limitations.push('The note attached is a general comment, not specific feedback on your work.');
    if (ratio != null && ratio < 0.6) nextActions.push('Give one recent, concrete example — or ask your leader what “good” looks like here.');
  } else if (status === 'submitted') {
    statusLabel = 'Submitted — awaiting review';
    summary = `You've completed ${title}. It's with your leader for review.`;
    nextActions.push('Nothing needed right now — you\'ll see the result here once it\'s reviewed.');
  } else if (answeredCount > 0 || partialCount > 0) {
    statusLabel = 'In progress';
    summary = `You've covered ${answeredCount} of ${requiredCount} part${requiredCount === 1 ? '' : 's'} so far.`;
    if (remaining > 0) nextActions.push(`Continue the conversation to cover the ${remaining} remaining part${remaining === 1 ? '' : 's'}.`);
    if (partialCount > 0) { attentionAreas.push(`${partialCount} answer${partialCount === 1 ? '' : 's'} ${partialCount === 1 ? 'was' : 'were'} a bit tentative and could be firmed up.`); limitations.push('Some responses are recorded but not yet firm.'); }
  } else {
    statusLabel = 'Not started';
    summary = `${title} is ready when you are. IntelliQ will ask a few short questions rather than hand you a blank form.`;
    nextActions.push('Start the conversation — it only asks for what it doesn\'t already know.');
  }

  const evidenceBasisSummary = requiredCount
    ? `Based on ${answeredCount} of ${requiredCount} recorded response${requiredCount === 1 ? '' : 's'}${humanFeedback ? ' and your leader\'s note' : ''}.`
    : 'Based on your recorded responses.';
  if (requiredCount && answeredCount < requiredCount && status !== 'returned') limitations.push(`${remaining} part${remaining === 1 ? '' : 's'} not yet covered.`);

  return {
    title, statusLabel, summary,
    strengths, attentionAreas, nextActions,
    limitations: [...new Set(limitations)],
    evidenceBasisSummary,
    optionalScore,
    feedbackKind,                                  // 'human' | 'generic' | 'none' — the UI shows human feedback ONLY when 'human'
    humanFeedback,                                 // '' unless a real, individual comment
    complete: status === 'returned' || status === 'submitted',
  };
}

module.exports = { project, isPlaceholderFeedback };
