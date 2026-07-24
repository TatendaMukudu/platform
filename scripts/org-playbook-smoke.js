/* Truth layer — LEARNING ENGINE Phase B2 (pure): counter-evidence, confidence bands, and
   governed CANDIDATE PRACTICES. Proves the evidence is weighed FOR and AGAINST; that
   confidence is a qualitative band (never a number); that only repeatable ways-of-operating
   become candidates; that the module NEVER endorses or writes a playbook (it only shapes a
   candidate a leader confirms); and that public output is redacted + non-causal.
   No DB / AI / IO. Run: node scripts/org-playbook-smoke.js */

const P = require('../ai/org-playbook.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

// A minimal INTERNAL observation (shape mirrors ai/org-learning output + an attached .summary).
const obs = (o = {}) => ({
  type: o.type || 'repeated_transition', subject: o.subject || 'availability', subjectLabel: o.subjectLabel || 'availability information',
  transitionCategory: o.transitionCategory || { from: 'missing', to: 'known' },
  summary: o.summary || 'Availability information moved from not recorded to recorded on 3 occasions.',
  occurrenceCount: o.occurrenceCount != null ? o.occurrenceCount : 3, distinctEvents: o.distinctEvents != null ? o.distinctEvents : 3,
  firstObservedAt: o.firstObservedAt || '2026-01-01T00:00:00Z', lastObservedAt: o.lastObservedAt || '2026-01-03T00:00:00Z',
  support: { intervalFingerprints: o.support || ['a→b', 'b→c', 'c→d'], occurrenceCount: o.occurrenceCount != null ? o.occurrenceCount : 3 },
  possibleContradictions: o.possibleContradictions || [], limitations: o.limitations || [],
  fingerprint: o.fingerprint || 'obs1', identityKey: o.identityKey || 'id1',
});
const rev = new Map();

/* ── 1 · confidence is a BAND from explicit thresholds (never a number) ── */
ok('1 · strong, uncontradicted, multi-event → well_supported', P.confidenceBand({ supporting: 3, distinctEvents: 3, contradicting: 0, rebaselineInterrupted: false }) === 'well_supported');
ok('1 · minority contradiction → supported', P.confidenceBand({ supporting: 4, distinctEvents: 2, contradicting: 1, rebaselineInterrupted: false }) === 'supported');
ok('1 · heavy contradiction → emerging', P.confidenceBand({ supporting: 2, distinctEvents: 1, contradicting: 2, rebaselineInterrupted: false }) === 'emerging');
ok('1 · a rules-change interruption caps confidence below well_supported', P.confidenceBand({ supporting: 5, distinctEvents: 3, contradicting: 0, rebaselineInterrupted: true }) !== 'well_supported');
ok('1 · every band is one of the named qualitative bands (no numeric score)', P.CONFIDENCE_BANDS.includes(P.confidenceBand({ supporting: 1, distinctEvents: 1, contradicting: 0 })));

/* ── 2 · counter-evidence weighs FOR and AGAINST ── */
const strong = P.assessObservation(obs(), rev);
ok('2 · supporting count comes from the observation occurrences', strong.counterEvidence.supporting === 3 && strong.counterEvidence.contradicting === 0);
ok('2 · a clean, strong observation assesses as well_supported + candidate-eligible', strong.confidence === 'well_supported' && strong.candidateEligible === true);

// A reverse transition present among siblings raises contradicting → lowers confidence.
const withRev = new Map([['availability|known|missing', obs({ transitionCategory: { from: 'known', to: 'missing' }, occurrenceCount: 2, fingerprint: 'obsR' })]]);
const contested = P.assessObservation(obs({ possibleContradictions: ['reverse_transition_also_occurred'] }), withRev);
ok('3 · a reverse transition among siblings is counted as counter-evidence', contested.counterEvidence.contradicting === 2 && contested.confidence !== 'well_supported');

/* ── 4 · only repeatable ways-of-operating are candidate-eligible ── */
ok('4 · a recurring-requirement-type observation is NOT a practice candidate', P.assessObservation(obs({ type: 'recurring_requirement_type' }), rev).candidateEligible === false);
ok('4 · a transition sequence IS candidate-eligible', P.assessObservation(obs({ type: 'transition_sequence', summary: 'For availability information, the sequence “went out of date, then was recorded again” occurred 2 times.' }), rev).candidateEligible === true);
ok('4 · a single-occurrence observation is not eligible (needs ≥2 support)', P.assessObservation(obs({ occurrenceCount: 1, support: ['a→b'] }), rev).candidateEligible === false);

/* ── 5 · candidate shape — statement is the observation's own neutral description ── */
const cand = P.buildCandidate(strong);
ok('5 · a candidate carries the neutral statement, confidence band, counter-evidence, and a sample', cand.statement === strong.summary && cand.confidence === 'well_supported' && cand.counterEvidence.supporting === 3 && cand.sample.length > 0);
ok('5 · the sample links back to safe memory fingerprints only', cand.sample.every(fp => typeof fp === 'string') && cand.sample.includes('a') && cand.sample.includes('b'));
ok('5 · the candidate links back to its observation + carries a deterministic fingerprint', cand.observationFingerprint === 'obs1' && typeof cand.fingerprint === 'string' && cand.fingerprint.length);

/* ── 6 · deriveCandidates — only eligible, deduped, deterministically ordered ── */
const many = [obs({ fingerprint: 'o1' }), obs({ type: 'recurring_requirement_type', fingerprint: 'o2' }),
  obs({ type: 'transition_sequence', occurrenceCount: 2, distinctEvents: 1, summary: 'seq', fingerprint: 'o3', support: ['x→y', 'y→z'] })];
const cands = P.deriveCandidates(many);
ok('6 · only the two eligible observations become candidates', cands.length === 2 && cands.every(c => P.CANDIDATE_TYPES.includes(c.type)));
ok('6 · candidates are ordered strongest-confidence first', cands[0].confidence === 'well_supported');
ok('6 · derivation is idempotent + deterministic', JSON.stringify(P.deriveCandidates(many)) === JSON.stringify(cands));

/* ── 7 · GOVERNED confirmation — the module SHAPES but never writes a playbook entry ── */
const entry = P.playbookEntryFrom(cand, { confirmedBy: 'coach', confirmedAt: '2026-02-01T00:00:00Z' });
ok('7 · a confirmed entry snapshots the confidence + counter-evidence AT confirmation', entry.confidenceAtConfirmation === 'well_supported' && entry.counterEvidenceAtConfirmation.supporting === 3 && entry.status === 'active');
ok('7 · the entry records who/when confirmed + links to its candidate + observation', entry.confirmedBy === 'coach' && entry.candidateFingerprint === cand.fingerprint && entry.observationFingerprint === 'obs1');
ok('7 · the entry fingerprint is stable (same candidate → same entry id)', P.playbookEntryFrom(cand, { confirmedBy: 'x', confirmedAt: 'y' }).fingerprint === entry.fingerprint);

/* ── 8 · PUBLIC redaction — safe labels only ── */
const pc = P.publicCandidate(cand);
ok('8 · a public candidate exposes a confidence LABEL + supporting/contradicting counts', pc.confidenceLabel === 'Well supported' && pc.counterEvidence.supporting === 3 && Array.isArray(pc.counterEvidence.signals));
ok('8 · a public candidate leaks no versions, identity keys, or raw internals', !/playbookRulesVersion|identityKey|counterEvidenceAtConfirmation|"subject":/.test(JSON.stringify(pc)));
const pe = P.publicPlaybookEntry(entry);
ok('8 · a public playbook entry never exposes the confirming actor id', !/confirmedBy|"coach"/.test(JSON.stringify(pe)) && pe.confirmedAt === '2026-02-01T00:00:00Z');
ok('8 · counter-evidence signals are safe, plain sentences', P.publicCandidate(contested && P.buildCandidate(contested) || cand).counterEvidence.signals.every(s => typeof s === 'string' && !/e1:|requirementId/.test(s)));

/* ── 9 · never causal / evaluative / advisory ── */
const allText = cands.concat([pc]).map(c => JSON.stringify(c)).join(' ');
ok('9 · no candidate text uses causal, evaluative, or advice language', !/\b(caused|led to|resulted in|because|should|recommend|healthy|unhealthy|effective|ineffective|success|failure|improved)\b/i.test(allText));

console.log(`\norg-playbook-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
