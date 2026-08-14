/* ============================================================
   ai/admissibility.js — MAY THIS EVIDENCE GROUND AN ANSWER NOW? (pure)

   The retrieval boundary decides what reaches an answer, and it had no awareness of signal
   lifecycle. So a signal whose source has since withdrawn it could still ground a current
   factual claim, and the correction that was supposed to matter changed nothing a reader
   saw. Corrections became cosmetic. This is the gate that closes that.

   ── One question, and only one ──────────────────────────────────────────────────────────

   May this signal ground an answer NOW. Not how much it is worth, not who may read it, not
   how it should be phrased. Those already have homes, and a second opinion here would mean
   two modules quietly disagreeing:

     counting independent origins     → ai/diagnose.js deriveConfidence (originRef)
     may evidence enter a group       → ai/contribution.js mayContribute
     who may read a subject at all    → the server's auth layer
     predictive / diagnostic phrasing → ai/language-guard.js

   originKind in particular is NOT an admissibility input. 'reported' evidence is admissible
   and merely worth less — that discount is deriveConfidence's to apply, and applying it twice
   would punish the same signal in two places.

   ── Deliberately stricter than isActive ─────────────────────────────────────────────────

   ai/diagnose.js has:

       const isActive = s => !s || !s.status || s.status === 'active';

   isActive(null) is TRUE. That is right where it lives: the confidence kernel treats a signal
   as active until something says otherwise, so rows stored before the status field existed
   keep counting. It is wrong at a retrieval boundary, where a missing or malformed signal is
   a bug or a race, and grounding an answer on it is exactly the failure this prevents.

   So the two diverge, on purpose, in one place and one direction:

       signal missing / not an object   isActive: active     admissible: NO
       status absent (legacy row)       isActive: active     admissible: YES

   The second is not an oversight. Rejecting legacy rows would silently empty the grounding of
   every older inquiry — a correctness disaster wearing the costume of caution.

   ── Allowlist, never denylist ───────────────────────────────────────────────────────────

   Only recognised-and-admissible statuses pass. Excluding a list of known-bad values fails
   OPEN: the day 'disputed' joins the vocabulary, every disputed signal grounds answers until
   a human notices. AGENTS.md §2 epistemic invariant 7.

   ── Exclusion is reported, never silent ─────────────────────────────────────────────────

   Filtering a withdrawn account out is only half a correction. If retrieval simply drops it,
   the answer quietly shrinks and nobody learns anything was corrected. partition() returns
   what was excluded and why, so a caller can say "three accounts, one since withdrawn"
   instead of reporting two and looking confident about it.

   PURE: no IO, no model, no state. Never mutates the signals it judges — callers pass stored
   objects, and a gate that edits the record it was meant to protect is worse than no gate.
   ============================================================ */

'use strict';

const { SIGNAL_STATUSES } = require('./diagnose');

/* The one status that lets evidence ground an answer. Derived from the kernel's vocabulary
   rather than restated, so a change there cannot silently disagree with a copy here. */
const ADMISSIBLE_STATUS = 'active';

/* Verdict kinds. These name WHY, which is the difference between a gate and a filter. */
const VERDICTS = ['active', 'legacy', 'superseded', 'withdrawn', 'unrecognised', 'missing'];

function _verdict(admissible, status, reason) {
  return { admissible, status, reason };
}

/* Judge one signal. Returns { admissible, status, reason } and nothing else — deliberately no
   confidence, weight or score, because a caller that finds one here will use it, and then
   confidence is computed in two places. */
function admit(signal) {
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) {
    return _verdict(false, 'missing', 'no signal to judge');
  }

  const status = signal.status;

  // Legacy rows predate the status field. The kernel counts them; so do we, but they are
  // labelled rather than silently indistinguishable from an explicitly active signal.
  if (status === undefined || status === null || status === '') {
    return _verdict(true, 'legacy', 'no status recorded; treated as active, as the kernel does');
  }

  if (typeof status !== 'string' || !SIGNAL_STATUSES.includes(status)) {
    return _verdict(false, 'unrecognised', `unrecognised status: ${String(status)}`);
  }

  if (status === ADMISSIBLE_STATUS) return _verdict(true, 'active', null);

  // A recognised terminal state. Naming which one matters: "withdrawn" and "superseded" mean
  // different things to a reader, and collapsing them loses the difference between "they took
  // it back" and "a later account replaced it".
  if (status === 'superseded') {
    return _verdict(false, 'superseded', 'superseded by a later account');
  }
  return _verdict(false, 'withdrawn', 'withdrawn by its source');
}

/* Split a list into what may ground an answer and what may not, keeping the reason for every
   exclusion so it can be reported rather than silently dropped. */
function partition(signals) {
  const list = Array.isArray(signals) ? signals : [];
  const admissible = [];
  const excluded = [];

  for (const signal of list) {
    const v = admit(signal);
    if (v.admissible) { admissible.push(signal); continue; }
    excluded.push({
      ref: (signal && typeof signal === 'object' && signal.ref != null) ? signal.ref : null,
      status: v.status,
      reason: v.reason,
    });
  }

  return { admissible, excluded };
}

module.exports = { admit, partition, ADMISSIBLE_STATUS, VERDICTS };
