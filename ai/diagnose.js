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
   strength or a difficulty or a condition for success, so the engine is not a weakness detector.

   AN INQUIRY IS A PROJECTION, NOT A STORE. It holds evidenceRefs — never copies of the text.
   The first cut of this module copied signal text inline, which quietly created a second
   substrate: no provenance, no inherited visibility, and no deletion path, so erasing a piece
   of evidence would have left its content sitting in an inquiry forever. Canonical evidence
   stays the one provenance-bearing truth; this reads it.

   `signals` therefore carries only what the KERNEL needs to weigh a claim — the reference, and
   the shape of the evidence (how direct, whose authority, how specific, when, does it dissent).
   Rendering resolves refs through the normal authorised read, so a reader can only ever see
   what they were already entitled to see. */
function newInquiry({ id, subjectRef, concept, label, domain = '', polarity = 'neutral', now = Date.now() } = {}) {
  return {
    inquiryId: String(id || `inq_${now}`),
    subjectRef: String(subjectRef || ''),
    topic: { canonicalConcept: String(concept || ''), label: String(label || concept || ''), domain: String(domain || '') },
    polarity,                          // 'strength' | 'difficulty' | 'condition' | 'neutral'
    hypotheses: [],                    // [{ id, statement, confidence, supportRefs, challengeRefs, status }]
    leadingHypothesisId: null,
    signals: [],                       // [{ ref, kind, directness, authority, specificity, at, dissents }] — REFS ONLY
    missingSignals: [],                // the collection frontier
    falsifiers: [],                    // what would show the leading hypothesis is wrong
    confidence: { score: 0, band: 'tentative', because: ['nothing recorded yet'] },
    status: 'exploring',               // exploring | probable | supported | disputed | resolved
    createdAt: now, lastUpdatedAt: now,
  };
}

/* A hypothesis is a first-class object, not a sentence on the inquiry. Evidence SUPPORTS or
   CHALLENGES it, and each hypothesis carries its own confidence — so three rival explanations
   can rise and fall independently as evidence arrives, which is what makes the reasoning
   longitudinal instead of a snapshot recomputed from a flat list. */
function newHypothesis({ id, statement, now = Date.now() } = {}) {
  return {
    id: String(id || `hyp_${now}`),
    statement: String(statement || '').trim(),
    supportRefs: [], challengeRefs: [],
    confidence: { score: 0, band: 'tentative', because: ['nothing supports this yet'] },
    status: 'open',                    // open | leading | refuted | settled
    createdAt: now,
  };
}

const _STATUS_FOR = (band, contradictions) =>
  contradictions ? 'disputed' : band === 'supported' ? 'supported' : band === 'probable' ? 'probable' : 'exploring';

/* Apply GROUNDED proposals to an inquiry. Nothing here becomes evidence — this is the working
   picture, from which a person may later confirm something into the real record. */
function applyProposals(inquiry, accepted = [], { now = Date.now(), evidenceRefOf } = {}) {
  const next = JSON.parse(JSON.stringify(inquiry));
  // A proposal points at governed evidence. Until the caller supplies a real ref (the evidence
  // this turn produced), we hold the proposal's own id — still a reference, never the content.
  const refOf = typeof evidenceRefOf === 'function' ? evidenceRefOf : (p => String(p.id));

  for (const p of accepted) {
    if (p.level === 'observation' || p.level === 'interpretation') {
      const isInterp = p.level === 'interpretation';
      const ref = refOf(p);
      if (next.signals.some(s => s.ref === ref)) continue;           // idempotent on replay
      next.signals.push({
        ref, kind: isInterp ? 'interpretation' : 'observation',
        directness: isInterp ? 'inferred' : (p.directness || 'direct'),
        authority: isInterp ? 'unverified' : (p.authority || 'self_report'),
        source: isInterp ? 'interpretation' : (p.source || 'self'),
        specificity: isInterp ? 0.4 : p.specificity,
        at: now, dissents: !!p.contradicts,
        // Which hypothesis this bears on, and which way. The model may say; if it does not,
        // the signal still counts toward the inquiry but weighs on nothing in particular.
        supports: p.supports ? String(p.supports) : null,
        challenges: p.challenges ? String(p.challenges) : null,
      });
    } else if (p.level === 'hypothesis') {
      // Rival explanations COEXIST. A new one never overwrites the old — they compete, and
      // evidence decides. This is the difference between reasoning and last-writer-wins.
      let h = next.hypotheses.find(x => _norm(x.statement) === _norm(p.text));
      if (!h) { h = newHypothesis({ id: p.id, statement: p.text, now }); next.hypotheses.push(h); }
      for (const b of (Array.isArray(p.basis) ? p.basis : [])) {
        if (!h.supportRefs.includes(String(b))) h.supportRefs.push(String(b));
      }
      for (const alt of (Array.isArray(p.alternatives) ? p.alternatives : [])) {
        const t = String(alt || '').trim();
        if (t && !next.hypotheses.some(x => _norm(x.statement) === _norm(t))) {
          next.hypotheses.push(newHypothesis({ id: `${p.id}_alt${next.hypotheses.length}`, statement: t, now }));
        }
      }
      for (const f of (Array.isArray(p.falsifiers) ? p.falsifiers : [])) {
        const t = String(f || '').trim();
        if (t && !next.falsifiers.includes(t)) next.falsifiers.push(t);
      }
    }
  }

  // Route each signal to the hypotheses it bears on, so a rival can be CHALLENGED by the very
  // evidence that supports another — the thing a flat signal list could never express.
  for (const s of next.signals) {
    if (s.supports) { const h = next.hypotheses.find(x => x.id === s.supports); if (h && !h.supportRefs.includes(s.ref)) h.supportRefs.push(s.ref); }
    if (s.challenges) { const h = next.hypotheses.find(x => x.id === s.challenges); if (h && !h.challengeRefs.includes(s.ref)) h.challengeRefs.push(s.ref); }
  }

  // Each hypothesis earns its OWN confidence from the evidence beneath it. Challenging
  // evidence is passed through as a contradiction, so a well-attacked hypothesis falls.
  const byRef = new Map(next.signals.map(s => [s.ref, s]));
  for (const h of next.hypotheses) {
    const sig = [
      ...h.supportRefs.map(r => byRef.get(r)).filter(Boolean),
      ...h.challengeRefs.map(r => byRef.get(r)).filter(Boolean).map(s => ({ ...s, contradicts: true })),
    ];
    h.confidence = sig.length ? deriveConfidence(sig, { now })
      : { score: 0, band: 'tentative', because: ['nothing supports this yet'] };
    h.status = h.challengeRefs.length && !h.supportRefs.length ? 'refuted' : h.status === 'settled' ? 'settled' : 'open';
  }

  // The leading hypothesis is whichever the evidence currently favours — not whichever arrived
  // most recently. It can change hands, and change back, without anything being lost.
  const live = next.hypotheses.filter(h => h.status !== 'refuted');
  const lead = live.slice().sort((a, b) => b.confidence.score - a.confidence.score)[0] || null;
  next.leadingHypothesisId = lead ? lead.id : null;
  for (const h of next.hypotheses) if (h.status === 'leading') h.status = 'open';
  if (lead && lead.status === 'open') lead.status = 'leading';

  // The INQUIRY's confidence is how well we understand the phenomenon — which is the leading
  // explanation's confidence, not the volume of signals collected about it.
  const real = next.signals.filter(s => s.kind !== 'interpretation');
  next.confidence = lead && lead.confidence.score > 0 ? lead.confidence : deriveConfidence(real, { now });
  next.status = _STATUS_FOR(next.confidence.band, real.filter(s => s.dissents).length);
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

  const newSignals = (after?.signals || []).filter(s => s.kind !== 'interpretation')
    .filter(s => !(before?.signals || []).some(b => b.ref === s.ref));
  const evidenceQuality = newSignals.length
    ? newSignals.reduce((a, s) => a + (s.directness === 'direct' ? 1 : 0.5) * _clamp01(typeof s.specificity === 'number' ? s.specificity : 0.5), 0) / newSignals.length
    : 0;

  const relevance    = after?.topic?.canonicalConcept ? 1 : 0.5;
  const actionability = (after?.missingSignals || []).length || (after?.hypotheses || []).length ? 1 : 0.5;

  // Novelty: repeating what we already hold is worth nothing. Signals are references now, so
  // "already held" is a ref we have seen before — which is a stricter and cheaper test than
  // comparing text, and it cannot be fooled by a reworded duplicate of the same evidence.
  const seen = new Set((before?.signals || []).map(s => s.ref));
  const fresh = newSignals.filter(s => !seen.has(s.ref));
  const novelty = newSignals.length ? fresh.length / newSignals.length : 0;

  let score = uncertaintyReduction * (0.2 + 0.8 * evidenceQuality) * relevance * actionability * (0.2 + 0.8 * novelty);

  const penalties = [];
  const unsupported = (rejected || []).filter(r => /no grounded observation|source span/.test(r.reason || '')).length;
  if (unsupported) { score *= Math.pow(0.6, unsupported); penalties.push(`${unsupported} unsupported inference`); }
  if (novelty === 0 && newSignals.length) { score *= 0.4; penalties.push('repeated what was already held'); }
  const dissentAfter = (after?.signals || []).filter(s => s.dissents).length;
  const dissentBefore = (before?.signals || []).filter(s => s.dissents).length;
  if (dissentAfter > dissentBefore) { score *= 0.7; penalties.push('introduced a contradiction'); }
  // Premature certainty: a big confidence jump off a single signal is a red flag, not a win.
  const signalCount = (after?.signals || []).filter(s => s.kind !== 'interpretation').length;
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

/* Turn an inquiry's open unknowns into ranked candidates, deriving the ranking factors from the
   inquiry's OWN state rather than asking a model to score them:

     gain       — the less we understand, the more any answer is worth
     importance — how much rests on the leading explanation being right
     impact     — a contested inquiry needs settling more than a quiet one
     burden     — carried from the unknown itself (asking for a season of film is expensive)

   This is the kernel deciding WHAT must be learned. The model only phrases it. */
function frontierFor(inquiry) {
  const inq = inquiry || {};
  const conf = (inq.confidence && inq.confidence.score) || 0;
  const hyps = inq.hypotheses || [];
  const live = hyps.filter(h => h.status !== 'refuted');
  const lead = hyps.find(h => h.id === inq.leadingHypothesisId) || null;
  const contested = live.length > 1;
  const dissents = (inq.signals || []).filter(s => s.dissents).length > 0;

  return (inq.missingSignals || []).filter(u => u && u.question).map(u => ({
    question: String(u.question),
    resolves: u.resolves,
    inquiryId: inq.inquiryId,
    topic: (inq.topic && (inq.topic.label || inq.topic.canonicalConcept)) || '',
    // An answer is worth most when we understand least.
    expectedInformationGain: typeof u.expectedInformationGain === 'number' ? u.expectedInformationGain : (1 - conf),
    // A leading explanation that is barely ahead is worth more work than a settled one.
    hypothesisImportance: lead ? (contested ? 0.9 : 0.6) : 0.5,
    // A contradiction in the record is the strongest reason to go and find out.
    decisionImpact: dissents ? 0.95 : (contested ? 0.8 : 0.5),
    answerability: typeof u.answerability === 'number' ? u.answerability : 0.85,
    burden: typeof u.burden === 'number' ? u.burden : 0.3,
  }));
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
  'WORTH AN INQUIRY? Also return "worthInquiry": true|false. TRUE only when there is an ongoing',
  '  phenomenon worth understanding, diagnosing or improving. FALSE for coordination and one-off',
  '  facts — "what time is practice", "who has the keys", "is the meeting moved" — and for pure',
  '  requests for general knowledge. Those are perfectly good conversations; they are just not',
  '  something to build a model of. Over-creating inquiries makes the picture noise.',
  '',
  'For "unknowns", list what you cannot tell from what was said — each with "question" (the thing',
  'that needs settling, in plain terms), "resolves" (what it would distinguish between), and',
  '"burden" 0-1 (how much effort answering costs them). Rank nothing; the system ranks.',
].join('\n');

module.exports = {
  LEVELS, LEVEL_RANK, MODEL_MAY_PROPOSE, INTAKE_PROMPT,
  groundProposals, deriveConfidence, newInquiry, newHypothesis, applyProposals, frontierFor,
  diagnosticYield, rankQuestions, nextNeed,
};
