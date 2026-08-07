/* ============================================================
   ai/diagnose.js — SEMANTIC INTAKE (pure)

   The input side of the flip. Until now the ears were ai/comprehend.js: a ~40-stem lexicon
   that turned "I've been struggling with my first touch when someone closes me down" into
   `support_need = true`. It destroyed the information before anything else could reason over
   it — the words "first touch" do not exist in its vocabulary, so neither did the problem.

   This module is the intake engine for the platform. The pipeline it serves:

     raw utterance → SEMANTIC PROPOSAL → adjudication → inquiry state
                   → question selection → conversation → confirmed evidence → re-derivation

   and the boundaries are rigid:

     • It NEVER writes evidence, never mutates a person, never decides someone "lacks
       confidence". It proposes candidate interpretations, explicitly grounded in what was
       actually said. Deterministic code then decides what a proposal is allowed to do.
     • The four epistemic levels never collapse into one field. "I lose the ball when pressed"
       is an OBSERVATION. "Poor scanning" is an INTERPRETATION. "Scanning deficiency causes
       loss of possession" is a HYPOTHESIS. "Scanning is the primary limiting factor" is a
       CONCLUSION — and the model may never propose one of those at all.
     • CONFIDENCE is computed here from deterministic factors. A model asserting 0.87 is
       extremely articulate fake mathematics, and is discarded.

   The primitive is deliberately called an INQUIRY, not a diagnosis. The same machinery has to
   surface what someone is unusually good at, the conditions under which they perform well, and
   the habits that produce success — not only what is wrong. "Diagnostic state" is the product
   word; naming the primitive after problems would quietly bias the engine into a weakness
   detector.

   Why this needs no domain packs: the LLM supplies domain language, this kernel supplies
   universal epistemology — what was claimed, who said it, how directly, what supports it, what
   contradicts it, what is still unknown, what to ask next, how confident we may be. Those
   questions are identical whether the sentence is "my first touch disappears under pressure",
   "the line keeps missing tolerance after the tooling change", or "our reps aren't converting
   enterprise demos".

   PURE: imports nothing, no IO, no network. The model call lives at the server edge.
   ============================================================ */

/* ── EPISTEMIC LEVELS ────────────────────────────────────────────────────────
   Ordered by how much they claim. A level may only rest on levels beneath it. */
const LEVELS = ['observation', 'interpretation', 'hypothesis', 'conclusion'];
const LEVEL_RANK = { observation: 0, interpretation: 1, hypothesis: 2, conclusion: 3 };

/* A CONCLUSION is never the model's to draw — it is the deterministic core's, from a
   supported hypothesis. Listing it keeps the refusal explicit rather than implied. */
const MODEL_MAY_PROPOSE = new Set(['observation', 'interpretation', 'hypothesis']);

const _norm = s => String(s == null ? '' : s).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/* Does this span genuinely come from what they said? Exact containment first — that is the
   guarantee we want. But a model that drops a filler word ("struggling with first touch" for
   "struggling with my first touch") is still pointing at real words, and rejecting it throws
   away a true observation. So we fall back to: every word of the span appears in the utterance,
   in order. That still cannot admit an invented claim — every token has to be theirs. */
function _spanIsTheirs(span, utterance) {
  const s = _norm(span), u = _norm(utterance);
  if (!s || !u) return false;
  if (u.includes(s)) return true;
  const words = s.split(' ').filter(Boolean);
  if (words.length < 2) return false;                 // a single word is not a quotation
  let from = 0;
  for (const w of words) {
    const at = u.indexOf(w, from);
    if (at === -1) return false;                       // a word they never said → not theirs
    from = at + w.length;
  }
  return true;
}
const _clamp01 = n => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/* ── 1. GROUNDING ────────────────────────────────────────────────────────────
   Every proposal must be traceable to what the person actually said. An OBSERVATION carries a
   sourceSpan that has to appear in the utterance — near-verbatim, so we can point at the words
   that caused it. An INTERPRETATION or HYPOTHESIS must rest on at least one accepted
   observation, so "poor scanning habits" can always be traced back to a real sentence.

   Returns { accepted, rejected } — rejected proposals carry the reason, which is worth logging:
   a model that keeps failing grounding is a model that is guessing. */
function groundProposals(proposals, { utterance = '', turnId = '', knownObservationIds = [] } = {}) {
  const accepted = [], rejected = [];
  const okIds = new Set(knownObservationIds);

  for (const raw of Array.isArray(proposals) ? proposals : []) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const level = String(p.level || '').toLowerCase();
    const text = String(p.text || '').trim();

    if (!text) { rejected.push({ proposal: p, reason: 'empty text' }); continue; }
    if (!LEVELS.includes(level)) { rejected.push({ proposal: p, reason: `unknown level "${p.level}"` }); continue; }
    if (!MODEL_MAY_PROPOSE.has(level)) {
      // The refusal that matters most: a model does not get to conclude.
      rejected.push({ proposal: p, reason: 'a conclusion is not the model\'s to draw' });
      continue;
    }

    if (level === 'observation') {
      const span = String(p.sourceSpan || '').trim();
      if (!span) { rejected.push({ proposal: p, reason: 'observation without a source span' }); continue; }
      if (!_spanIsTheirs(span, utterance)) {
        rejected.push({ proposal: p, reason: 'source span does not appear in what they said' });
        continue;
      }
      const id = String(p.id || `obs_${accepted.length}_${turnId}`);
      okIds.add(id);
      accepted.push({ ...p, id, level, text, sourceSpan: span, turnId, grounded: true });
      continue;
    }

    // interpretation / hypothesis — must rest on observations we accepted.
    const basis = (Array.isArray(p.basis) ? p.basis : []).map(String).filter(b => okIds.has(b));
    if (!basis.length) {
      rejected.push({ proposal: p, reason: `${level} with no grounded observation beneath it` });
      continue;
    }
    accepted.push({ ...p, id: String(p.id || `${level}_${accepted.length}_${turnId}`), level, text, basis, turnId, grounded: true });
  }
  return { accepted, rejected };
}

/* ── 2. CONFIDENCE (deterministic) ───────────────────────────────────────────
   Never the model's number. Computed from the shape of the evidence beneath a claim:

     independence  — how many SEPARATE signals, not how many times one was repeated
     directness    — the person's own words about themselves beat an inference about them
     authority     — an authoritative record beats an unverified self-report for org facts
     corroboration — independent sources agreeing
     recency       — stale signals decay; the world moves
     specificity   — "my touch gets away when pressed from behind" beats "not great lately"
     contradiction — anything that disagrees pulls confidence DOWN, hard

   Returns a band as well as a score, because a band is what a person should ever be shown. */
const _BANDS = [
  { at: 0.75, band: 'supported' },
  { at: 0.50, band: 'probable' },
  { at: 0.25, band: 'emerging' },
  { at: 0.00, band: 'tentative' },
];

function deriveConfidence(signals = [], { now = Date.now(), halfLifeDays = 45 } = {}) {
  const list = (Array.isArray(signals) ? signals : []).filter(Boolean);
  if (!list.length) return { score: 0, band: 'tentative', because: ['nothing recorded yet'] };

  const because = [];
  // Independence: distinct sources, not repeat mentions from one place.
  const sources = new Set(list.map(s => String(s.source || 'self')));
  const independence = Math.min(1, (sources.size - 1) / 3 + (sources.size ? 0.34 : 0));
  because.push(`${sources.size} independent source${sources.size === 1 ? '' : 's'}`);

  const avg = (fn) => list.reduce((a, s) => a + fn(s), 0) / list.length;
  const directness  = avg(s => (s.directness === 'direct' ? 1 : 0.45));
  const authority   = avg(s => (s.authority === 'authoritative' ? 1 : s.authority === 'corroborated' ? 0.75 : 0.5));
  const specificity = avg(s => _clamp01(typeof s.specificity === 'number' ? s.specificity : 0.5));
  const recency     = avg(s => {
    const at = Number(s.at) || now;
    const days = Math.max(0, (now - at) / 86400000);
    return Math.pow(0.5, days / Math.max(1, halfLifeDays));
  });

  const contradictions = list.filter(s => s.contradicts).length;
  const contradictionPenalty = contradictions ? Math.pow(0.45, contradictions) : 1;
  if (contradictions) because.push(`${contradictions} contradicting signal${contradictions === 1 ? '' : 's'}`);

  // A single self-reported mention should never read as settled, however specific it is.
  const singleSignalCeiling = list.length === 1 ? 0.45 : 1;
  if (list.length === 1) because.push('only one signal so far');

  const score = _clamp01(
    independence * 0.30 + directness * 0.20 + authority * 0.20 + specificity * 0.15 + recency * 0.15
  ) * contradictionPenalty * singleSignalCeiling;

  const band = (_BANDS.find(b => score >= b.at) || _BANDS[_BANDS.length - 1]).band;
  return { score: Math.round(score * 100) / 100, band, because };
}

/* ── 3. THE INQUIRY STATE ────────────────────────────────────────────────────
   One live line of understanding about a subject. Neutral by construction: `polarity` may be a
   strength or a difficulty or a condition for success, so the engine is not a weakness detector. */
function newInquiry({ id, subjectRef, concept, label, domain = '', polarity = 'neutral', now = Date.now() } = {}) {
  return {
    inquiryId: String(id || `inq_${now}`),
    subjectRef: String(subjectRef || ''),
    topic: { canonicalConcept: String(concept || ''), label: String(label || concept || ''), domain: String(domain || '') },
    polarity,                          // 'strength' | 'difficulty' | 'condition' | 'neutral'
    hypothesis: null,                  // { statement, basis, provenance }
    alternatives: [],                  // rival explanations still open — kept, never silently dropped
    knownSignals: [],
    missingSignals: [],                // the collection frontier
    contradictions: [],
    falsifiers: [],                    // what would show this is wrong
    confidence: { score: 0, band: 'tentative', because: ['nothing recorded yet'] },
    status: 'exploring',               // exploring | probable | supported | disputed | resolved
    createdAt: now, lastUpdatedAt: now,
  };
}

const _STATUS_FOR = (band, contradictions) =>
  contradictions ? 'disputed' : band === 'supported' ? 'supported' : band === 'probable' ? 'probable' : 'exploring';

/* Apply GROUNDED proposals to an inquiry. Nothing here becomes evidence — this is the working
   picture, from which a person may later confirm something into the real record. */
function applyProposals(inquiry, accepted = [], { now = Date.now() } = {}) {
  const next = JSON.parse(JSON.stringify(inquiry));
  for (const p of accepted) {
    if (p.level === 'observation') {
      next.knownSignals.push({ id: p.id, text: p.text, sourceSpan: p.sourceSpan, turnId: p.turnId,
        source: p.source || 'self', directness: p.directness || 'direct',
        authority: p.authority || 'self_report', specificity: p.specificity, at: now, contradicts: !!p.contradicts });
      if (p.contradicts) next.contradictions.push({ id: p.id, text: p.text });
    } else if (p.level === 'hypothesis') {
      // A rival hypothesis is never silently discarded — it moves to alternatives.
      if (next.hypothesis && _norm(next.hypothesis.statement) !== _norm(p.text)) {
        if (!next.alternatives.some(a => _norm(a.statement) === _norm(next.hypothesis.statement))) {
          next.alternatives.push({ statement: next.hypothesis.statement, basis: next.hypothesis.basis });
        }
      }
      next.hypothesis = { statement: p.text, basis: p.basis || [], provenance: 'proposed_from_conversation' };
      for (const alt of (Array.isArray(p.alternatives) ? p.alternatives : [])) {
        const t = String(alt || '').trim();
        if (t && !next.alternatives.some(a => _norm(a.statement) === _norm(t))) next.alternatives.push({ statement: t, basis: [] });
      }
      for (const f of (Array.isArray(p.falsifiers) ? p.falsifiers : [])) {
        const t = String(f || '').trim();
        if (t && !next.falsifiers.includes(t)) next.falsifiers.push(t);
      }
    } else if (p.level === 'interpretation') {
      // Held as an interpretation, explicitly beneath hypothesis in weight.
      next.knownSignals.push({ id: p.id, text: p.text, interpretation: true, basis: p.basis,
        source: 'interpretation', directness: 'inferred', authority: 'unverified', specificity: 0.4, at: now });
    }
  }
  next.confidence = deriveConfidence(next.knownSignals.filter(s => !s.interpretation), { now });
  next.status = _STATUS_FOR(next.confidence.band, next.contradictions.length);
  next.lastUpdatedAt = now;
  return next;
}

/* ── 4. DIAGNOSTIC YIELD ─────────────────────────────────────────────────────
   What a turn was WORTH. Deliberately not just (uncertaintyBefore − uncertaintyAfter), because
   that metric is gamed by becoming confidently wrong. Reward learning something useful and
   defensible; penalise the failure modes that make a system sound smart and be useless. */
function diagnosticYield(before, after, { proposals = [], rejected = [], now = Date.now() } = {}) {
  const uBefore = 1 - (before?.confidence?.score || 0);
  const uAfter  = 1 - (after?.confidence?.score || 0);
  const uncertaintyReduction = Math.max(0, uBefore - uAfter);

  const newSignals = (after?.knownSignals || []).filter(s => !s.interpretation)
    .filter(s => !(before?.knownSignals || []).some(b => b.id === s.id));
  const evidenceQuality = newSignals.length
    ? newSignals.reduce((a, s) => a + (s.directness === 'direct' ? 1 : 0.5) * _clamp01(typeof s.specificity === 'number' ? s.specificity : 0.5), 0) / newSignals.length
    : 0;

  const relevance    = after?.topic?.canonicalConcept ? 1 : 0.5;
  const actionability = (after?.missingSignals || []).length || after?.hypothesis ? 1 : 0.5;

  // Novelty: repeating what we already hold is worth nothing.
  const seen = new Set((before?.knownSignals || []).map(s => _norm(s.text)));
  const fresh = newSignals.filter(s => !seen.has(_norm(s.text)));
  const novelty = newSignals.length ? fresh.length / newSignals.length : 0;

  let score = uncertaintyReduction * (0.2 + 0.8 * evidenceQuality) * relevance * actionability * (0.2 + 0.8 * novelty);

  const penalties = [];
  const unsupported = (rejected || []).filter(r => /no grounded observation|source span/.test(r.reason || '')).length;
  if (unsupported) { score *= Math.pow(0.6, unsupported); penalties.push(`${unsupported} unsupported inference`); }
  if (novelty === 0 && newSignals.length) { score *= 0.4; penalties.push('repeated what was already held'); }
  if ((after?.contradictions || []).length > (before?.contradictions || []).length) { score *= 0.7; penalties.push('introduced a contradiction'); }
  // Premature certainty: a big confidence jump off a single signal is a red flag, not a win.
  const signalCount = (after?.knownSignals || []).filter(s => !s.interpretation).length;
  if (signalCount <= 1 && (after?.confidence?.score || 0) > 0.5) { score *= 0.3; penalties.push('premature certainty'); }

  return { score: Math.round(_clamp01(score) * 100) / 100, uncertaintyReduction: Math.round(uncertaintyReduction * 100) / 100,
    evidenceQuality: Math.round(evidenceQuality * 100) / 100, novelty: Math.round(novelty * 100) / 100, penalties };
}

/* ── 5. QUESTION SELECTION ───────────────────────────────────────────────────
   The kernel decides WHAT needs to be learned; the model only decides HOW to ask it. Candidates
   are ranked by what answering would be worth, divided by what it costs the person to answer.
   The winner is handed to the model as a NEED ("distinguish scanning from execution"), and it
   returns the natural sentence. That division is far safer than letting the model pick. */
function rankQuestions(candidates = [], { now = Date.now() } = {}) {
  return (Array.isArray(candidates) ? candidates : [])
    .map(c => {
      const gain       = _clamp01(c.expectedInformationGain);
      const importance = _clamp01(typeof c.hypothesisImportance === 'number' ? c.hypothesisImportance : 0.5);
      const answerable = _clamp01(typeof c.answerability === 'number' ? c.answerability : 0.8);
      const impact     = _clamp01(typeof c.decisionImpact === 'number' ? c.decisionImpact : 0.5);
      const burden     = Math.max(0.1, _clamp01(typeof c.burden === 'number' ? c.burden : 0.3));
      const value = (gain * importance * answerable * impact) / burden;
      return { ...c, value: Math.round(value * 1000) / 1000 };
    })
    .sort((a, b) => b.value - a.value);
}

/* The single highest-value thing to learn next, as a NEED for the model to phrase. */
function nextNeed(inquiry, candidates = []) {
  const ranked = rankQuestions(candidates);
  if (!ranked.length) return null;
  const top = ranked[0];
  return { need: top.resolves || top.question || '', why: top.why || '', candidate: top,
    distinguishes: Array.isArray(top.resolves) ? top.resolves : (top.resolves ? [top.resolves] : []) };
}

/* ── 6. THE EXTRACTION PROMPT ────────────────────────────────────────────────
   What the model is asked for at intake. Note what it is NOT asked for: a conclusion, or a
   confidence number. Both are computed here from the shape of the evidence. */
const INTAKE_PROMPT = [
  'You are the intake layer of a governed organisational assistant. You do NOT reply to the',
  'person here. You read what they said and propose SEMANTIC STRUCTURE for the system to weigh.',
  '',
  'Return ONLY JSON: { "proposals": [ ... ], "unknowns": [ ... ] }',
  '',
  'A proposal is one of exactly three levels, and they must never be collapsed:',
  '  • "observation"    — what they actually reported. MUST carry "sourceSpan": a short quote',
  '    copied VERBATIM from their message. If you cannot quote it, it is not an observation.',
  '  • "interpretation" — what you think it means. MUST carry "basis": the ids of observations',
  '    it rests on. "Poor scanning" is an interpretation, never an observation.',
  '  • "hypothesis"     — a candidate explanation linking things. MUST carry "basis", and should',
  '    carry "alternatives" (rival explanations) and "falsifiers" (what would show it is wrong).',
  'You may NOT return a conclusion. Deciding what is settled is not your job.',
  'Do NOT return confidence numbers. Confidence is computed from the evidence, not asserted.',
  '',
  'Name the domain concept precisely ("football.first_touch", "manufacturing.tolerance_drift"),',
  'because a vague concept cannot be retrieved or connected to anything later.',
  '',
  'Look for STRENGTHS and CONDITIONS FOR SUCCESS as carefully as for difficulties: what someone',
  'is unusually good at, and what circumstances bring out their best, matter just as much.',
  '',
  'For "unknowns", list what you cannot tell from what was said — each with "question" (the thing',
  'that needs settling, in plain terms), "resolves" (what it would distinguish between), and',
  '"burden" 0-1 (how much effort answering costs them). Rank nothing; the system ranks.',
].join('\n');

module.exports = {
  LEVELS, LEVEL_RANK, MODEL_MAY_PROPOSE, INTAKE_PROMPT,
  groundProposals, deriveConfidence, newInquiry, applyProposals,
  diagnosticYield, rankQuestions, nextNeed,
};
