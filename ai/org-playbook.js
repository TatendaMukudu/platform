/* ============================================================
   ai/org-playbook.js — PURE Learning Engine, Phase B2: counter-evidence, confidence,
   and CANDIDATE PRACTICES for a GOVERNED playbook.

   Phase B1 produced neutral OBSERVATIONS (things that recurred). This module takes those
   observations and, for the ones strong enough to be worth a human's attention, weighs
   the evidence FOR and AGAINST (counter-evidence), assigns a qualitative CONFIDENCE BAND
   (never a false-precision number), and shapes a CANDIDATE PRACTICE — a proposal a leader
   can review.

   The governance line is the whole point, and it is absolute:
     • This module NEVER writes to the playbook. It only DESCRIBES a candidate.
     • A candidate becomes org knowledge ONLY when a leader explicitly confirms it
       (playbookEntryFrom shapes the confirmed record; the server persists it).
     • It is NOT a recommendation. The system does not say "you should"; it says "this
       recurred, here is the evidence and the counter-evidence — do you recognise it as
       how your team operates?" The judgement is always the human's.

   Discipline (unchanged from every prior layer):
     • PURE — imports nothing. Deterministic. No LLM, embeddings, scoring, or clustering.
     • OBSERVATIONAL — reads observations; never mutates memory, evidence, or state.
     • COUNTER-EVIDENCE FIRST — every candidate carries what argues against it.
     • CONFIDENCE AS A BAND, NEVER A NUMBER — no fabricated precision.
     • NON-CAUSAL / NON-EVALUATIVE — never "caused", "improved", "healthy", "should".
     • PRIVACY — public output is redacted to safe labels + memory fingerprints only.
   ============================================================ */

const PLAYBOOK_SCHEMA_VERSION = 1;
const PLAYBOOK_RULES_VERSION  = 1;

function _hash(str) { let h = 5381; const s = String(str); for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(36); }
const uniq = arr => [...new Set(arr)];

/* Only these observation types describe a repeatable WAY OF OPERATING worth proposing as
   a practice. Recurrence-of-type / co-occurrence / stable-state are informative but are
   not, on their own, a "practice" — they stay observations. */
const CANDIDATE_TYPES = Object.freeze(['repeated_transition', 'transition_sequence']);

/* Qualitative confidence — a BAND, never a number. Ordered weakest → strongest. */
const CONFIDENCE_BANDS = Object.freeze(['emerging', 'supported', 'well_supported']);
const CONFIDENCE_LABELS = Object.freeze({ emerging: 'Emerging', supported: 'Supported', well_supported: 'Well supported' });

/* ── COUNTER-EVIDENCE — deterministic tally of what argues FOR and AGAINST. Supporting is
   the observation's own occurrence count. Contradicting is, for a repeated transition, how
   often the REVERSE transition also occurred (looked up among the sibling observations);
   plus the neutral contradiction signals the observation already carries. ── */
function counterEvidence(obs, byReverseKey) {
  const supporting = obs.occurrenceCount || (obs.support && obs.support.occurrenceCount) || 0;
  let contradicting = 0;
  if (obs.type === 'repeated_transition' && obs.transitionCategory) {
    const rev = byReverseKey.get(`${obs.subject}|${obs.transitionCategory.to}|${obs.transitionCategory.from}`);
    if (rev) contradicting += rev.occurrenceCount || 0;
  }
  const signals = uniq(obs.possibleContradictions || []);
  return { supporting, contradicting, signals };
}

/* ── CONFIDENCE BAND — from named, bounded, tested inputs. Explicit thresholds only. ── */
function confidenceBand({ supporting, distinctEvents, contradicting, rebaselineInterrupted }) {
  if (supporting >= 3 && distinctEvents >= 2 && contradicting === 0 && !rebaselineInterrupted) return 'well_supported';
  if (supporting >= 2 && contradicting <= Math.floor(supporting / 2)) return 'supported';
  return 'emerging';
}

/* Assess ONE observation: attach counter-evidence + a confidence band + eligibility.
   `byReverseKey` maps `subject|from|to` → observation, so a reverse transition is found
   deterministically. Does not mutate the input. */
function assessObservation(obs, byReverseKey) {
  const ce = counterEvidence(obs, byReverseKey);
  const rebaselineInterrupted = (obs.possibleContradictions || []).includes('history_interrupted_by_a_rules_change');
  const confidence = confidenceBand({ supporting: ce.supporting, distinctEvents: obs.distinctEvents || 0, contradicting: ce.contradicting, rebaselineInterrupted });
  const candidateEligible = CANDIDATE_TYPES.includes(obs.type) && ce.supporting >= 2;
  return { ...obs, counterEvidence: ce, confidence, candidateEligible };
}

/* ── CANDIDATE PRACTICE — a proposal for a leader to confirm. Built from an assessed
   observation. The `statement` is the observation's own neutral description (the server
   attaches `summary`); the practice framing ("recognise this as how you operate?") lives
   in the UI, never here — this module never endorses. ── */
function buildCandidate(assessed) {
  if (!assessed || !assessed.candidateEligible) return null;
  const sample = uniq((assessed.support && assessed.support.intervalFingerprints || []).flatMap(fp => String(fp).split('→')));
  const fingerprint = _hash(JSON.stringify(['candidate', assessed.fingerprint, PLAYBOOK_RULES_VERSION]));
  return {
    fingerprint, observationFingerprint: assessed.fingerprint,
    type: assessed.type, subjectLabel: assessed.subjectLabel,
    statement: assessed.summary || 'A repeated pattern was observed.',
    confidence: assessed.confidence,
    counterEvidence: assessed.counterEvidence,
    sample, occurrenceCount: assessed.occurrenceCount, distinctEvents: assessed.distinctEvents,
    firstObservedAt: assessed.firstObservedAt, lastObservedAt: assessed.lastObservedAt,
    limitations: assessed.limitations || [],
    playbookSchemaVersion: PLAYBOOK_SCHEMA_VERSION, playbookRulesVersion: PLAYBOOK_RULES_VERSION,
  };
}

/* Derive all candidate practices from the active observation set. Each observation must
   carry a `.summary` (server attaches it via ai/org-learning). Deterministic order:
   strongest confidence, then most support, then fingerprint. */
function deriveCandidates(observations) {
  const list = observations || [];
  const byReverseKey = new Map();
  for (const o of list) if (o.type === 'repeated_transition' && o.transitionCategory)
    byReverseKey.set(`${o.subject}|${o.transitionCategory.from}|${o.transitionCategory.to}`, o);
  const seen = new Set();
  const out = [];
  for (const o of list) {
    const c = buildCandidate(assessObservation(o, byReverseKey));
    if (c && !seen.has(c.fingerprint)) { seen.add(c.fingerprint); out.push(c); }
  }
  const rank = { well_supported: 0, supported: 1, emerging: 2 };
  return out.sort((a, b) => (rank[a.confidence] - rank[b.confidence]) ||
    (b.counterEvidence.supporting - a.counterEvidence.supporting) || a.fingerprint.localeCompare(b.fingerprint));
}

/* ── GOVERNED CONFIRMATION — shape (NOT persist) the durable playbook entry a leader's
   confirmation turns a candidate into. The server persists it; the actor/timestamp are
   the leader's. The entry records the confidence + counter-evidence AT confirmation, so a
   later re-derivation never silently rewrites what the leader agreed to. ── */
function playbookEntryFrom(candidate, { confirmedBy = null, confirmedAt = null } = {}) {
  if (!candidate) return null;
  return {
    fingerprint: _hash(JSON.stringify(['entry', candidate.fingerprint])),
    candidateFingerprint: candidate.fingerprint,
    observationFingerprint: candidate.observationFingerprint,
    type: candidate.type, subjectLabel: candidate.subjectLabel, statement: candidate.statement,
    confidenceAtConfirmation: candidate.confidence,
    counterEvidenceAtConfirmation: candidate.counterEvidence,
    sample: candidate.sample, limitations: candidate.limitations,
    confirmedBy, confirmedAt, status: 'active',
    playbookSchemaVersion: PLAYBOOK_SCHEMA_VERSION, playbookRulesVersion: PLAYBOOK_RULES_VERSION,
  };
}

/* ── PUBLIC redaction — the only shapes a leader ever sees. No actor ids, record ids,
   requirement ids, hashes beyond safe fingerprints, or version numbers. ── */
function publicCandidate(c) {
  if (!c) return null;
  return {
    fingerprint: c.fingerprint, type: c.type, subjectLabel: c.subjectLabel,
    statement: c.statement, confidence: c.confidence, confidenceLabel: CONFIDENCE_LABELS[c.confidence] || 'Emerging',
    counterEvidence: { supporting: c.counterEvidence.supporting, contradicting: c.counterEvidence.contradicting,
      signals: (c.counterEvidence.signals || []).map(safeSignal) },
    occurrenceCount: c.occurrenceCount, distinctEvents: c.distinctEvents,
    firstObservedAt: c.firstObservedAt, lastObservedAt: c.lastObservedAt,
    limitations: c.limitations || [], supportingMoments: c.sample || [],
  };
}
function publicPlaybookEntry(e) {
  if (!e) return null;
  return {
    fingerprint: e.fingerprint, type: e.type, subjectLabel: e.subjectLabel, statement: e.statement,
    confidenceLabel: CONFIDENCE_LABELS[e.confidenceAtConfirmation] || 'Emerging',
    counterEvidence: { supporting: e.counterEvidenceAtConfirmation.supporting, contradicting: e.counterEvidenceAtConfirmation.contradicting },
    confirmedAt: e.confirmedAt, status: e.status, limitations: e.limitations || [], supportingMoments: e.sample || [],
  };
}
const SIGNAL_LABELS = Object.freeze({
  reverse_transition_also_occurred: 'The reverse change also occurred.',
  did_not_recur_in_most_recent_history: 'It did not recur in the most recent history.',
  depends_on_a_single_event: 'It depends on a single event.',
  present_in_a_minority_of_intervals: 'It was present in a minority of comparable moments.',
  history_interrupted_by_a_rules_change: "The history was interrupted by a change in IntelliQ's interpretation rules.",
});
const safeSignal = s => SIGNAL_LABELS[s] || 'Other history may qualify this.';

module.exports = {
  PLAYBOOK_SCHEMA_VERSION, PLAYBOOK_RULES_VERSION, CANDIDATE_TYPES, CONFIDENCE_BANDS, CONFIDENCE_LABELS,
  counterEvidence, confidenceBand, assessObservation, buildCandidate, deriveCandidates,
  playbookEntryFrom, publicCandidate, publicPlaybookEntry,
};
