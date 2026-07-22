/* ============================================================
   ai/retrieval.js — PURE grounded-retrieval primitives

   Ranking, deterministic extractive answering, and citation validation for the
   grounded-retrieval slice. This module is PURE: no DB, no server, no AI, and — by
   design — NO authorization. It consumes candidate passages that the caller has
   ALREADY authorised through the canonical evidence gateway, and produces:
     • a hybrid ranking (semantic + authority + freshness + lexical), deterministic;
     • an inspectable grounding artifact;
     • a deterministic, cited extractive answer (the no-AI-key fallback);
     • a citation validator (every factual claim must map to a retrieved passage).

   It NEVER decides who may see what — that happens upstream. It NEVER mutates or
   executes. It never invents a bridging fact: an extractive answer only ever
   contains sentences lifted from authorised passages, each tied to its evidence.
   ============================================================ */

// Provenance authority. A synced system-of-record outranks a user's own assertion.
const TRUST_RANK = { system_of_record: 3, connected: 2, user_reported: 1, unknown: 0, derived: -1 };

/* Classify an evidence envelope's provenance into a trust tier. Deterministic. */
function trustTier(provenance) {
  const provider = (provenance && provenance.provider) || '';
  const source   = (provenance && provenance.source) || '';
  if (source === 'derived' || provider === 'kernel') return 'derived';        // must never be retrieved
  if (provider === 'user' || source === 'reported') return 'user_reported';   // a person's own assertion
  if (source === 'system_of_record') return 'system_of_record';
  if (provider && provider !== 'user' && provider !== 'checkin') return 'connected'; // a synced source
  return 'user_reported';                                                     // self-reported (check-in, manual)
}

function _tokens(s) { return String(s == null ? '' : s).toLowerCase().match(/[a-z0-9]+/g) || []; }

// Common words carry no relevance — they must not let an unrelated passage match
// (e.g. "what is THE capital…" must not hit a note just because it contains "the").
const STOPWORDS = new Set(('a an the and or but of to in on at for with from by is are was were be been being ' +
  'this that these those it its as into about over under i you he she we they me my your our their them his her ' +
  'do does did done have has had will would can could should may might must what when where who whom which why how ' +
  'not no yes if then than so such just any all some more most other out up down off own same too very').split(/\s+/));

/* Deterministic lexical relevance: fraction of the query's MEANINGFUL terms
   (length>2, non-stopword) present in the passage. Range [0,1]. */
function lexicalScore(query, text) {
  const q = [...new Set(_tokens(query).filter(t => t.length > 2 && !STOPWORDS.has(t)))];
  if (!q.length) return 0;
  const t = new Set(_tokens(text));
  let hit = 0; for (const w of q) if (t.has(w)) hit++;
  return hit / q.length;
}

/* Recency: 1.0 today → 0 at a year old. Missing timestamp = neutral 0.5. */
function freshnessScore(ts, now) {
  if (!ts) return 0.5;
  const days = ((Number.isFinite(now) ? now : Date.now()) - new Date(ts).getTime()) / 86400000;
  if (!Number.isFinite(days)) return 0.5;
  return Math.max(0, Math.min(1, 1 - days / 365));
}

const DEFAULT_WEIGHTS = Object.freeze({ semantic: 0.5, authority: 0.2, freshness: 0.1, lexical: 0.2 });
const RANKING_VERSION = 'hybrid-v1';

/* Rank already-authorised candidate passages. `semanticScores` maps evidenceId → a
   [0,1] cosine (when embeddings are available); when absent, the semantic component
   falls back to the lexical score so ranking still works with no embedding backend.
   Deterministic: same inputs → same order (stable evidenceId tiebreak). */
function rankPassages(candidates, query, opts = {}) {
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const w = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const sem = opts.semanticScores || null;
  return (candidates || []).map(c => {
    const lexical  = lexicalScore(query, c.text);
    const semantic = (sem && Number.isFinite(sem[c.evidenceId])) ? sem[c.evidenceId] : lexical;
    const authority = Math.max(0, (TRUST_RANK[c.trustTier] ?? 0) / 3);   // normalised 0..1
    const freshness = freshnessScore(c.sourceTimestamp, now);
    // RELEVANCE GATES the score. Authority/freshness only TUNE a passage that is
    // actually relevant — they can never manufacture relevance for an unrelated
    // (but recent, or user-reported) passage. Zero relevance ⇒ zero final ⇒ excluded.
    const relevance = Math.max(semantic, lexical);
    const final = relevance === 0 ? 0
      : (w.semantic * semantic + w.lexical * lexical + w.authority * authority + w.freshness * freshness);
    return { ...c, scores: { semantic: round(semantic), authority: round(authority), freshness: round(freshness), lexical: round(lexical), final: round(final) } };
  }).sort((a, b) => (b.scores.final - a.scores.final) || (a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0));
}
function round(n) { return Math.round(n * 1000) / 1000; }

/* Assemble the inspectable grounding artifact (full — for authorised diagnostics). */
function buildGrounding({ queryId, requesterId, purpose, scope, query, passages, excludedCounts, limitations }) {
  return {
    queryId, requesterId, purpose, query,
    scope: scope || { subjectId: null, groupId: null, orgId: null },
    rankingVersion: RANKING_VERSION,
    passages: passages || [],
    excludedCounts: { nonSourceEvidence: 0, stale: 0, lowRelevance: 0, ...(excludedCounts || {}) },
    limitations: limitations || [],
  };
}

/* Pick the sentence in a passage most relevant to the query (deterministic). */
function _bestSentence(text, query) {
  // Strip markdown heading/list/emphasis markers so a bare heading isn't returned as
  // the whole answer, and split into candidate sentences.
  const sentences = String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/^#{1,6}\s*/, '').replace(/^[-*]\s+/, '').replace(/[*_`]/g, '').trim())
    .filter(Boolean);
  if (!sentences.length) return String(text || '').trim();
  const scored = sentences.map(s => ({ s, sc: lexicalScore(query, s), words: s.split(/\s+/).length }));
  const max = Math.max(...scored.map(x => x.sc));
  // Prefer a CONTENT sentence (≥4 words) that is relevant; a short heading like
  // "PTO Policy" matches the query but isn't a useful answer on its own.
  const content = scored.filter(x => x.sc > 0 && x.words >= 4).sort((a, b) => b.sc - a.sc || b.words - a.words);
  if (content.length && content[0].sc >= max * 0.5) return content[0].s;
  return scored.sort((a, b) => b.sc - a.sc || b.words - a.words)[0].s;
}

/* ── Deterministic extractive answer — the no-AI-key fallback ──────────────────
   Lifts the strongest relevant sentence from each top passage, groups by source,
   labels lower-trust (user-reported) material honestly, and NEVER invents a
   bridging fact. Returns null when nothing clears the relevance floor (caller then
   emits the explicit insufficient-evidence response). */
function extractiveAnswer(grounding, opts = {}) {
  const floor = Number.isFinite(opts.floor) ? opts.floor : 0.15;
  const maxPassages = Number.isInteger(opts.maxPassages) ? opts.maxPassages : 4;
  const relevant = (grounding.passages || []).filter(p => (p.scores?.final ?? 0) >= floor).slice(0, maxPassages);
  if (!relevant.length) return null;

  const groundedClaims = [];
  const lines = [];
  for (const p of relevant) {
    const sentence = _bestSentence(p.text, grounding.query);
    if (!sentence) continue;
    const userReported = p.trustTier === 'user_reported';
    const src = safeCitation(p);
    lines.push(`${userReported ? 'You noted' : (src.label || 'A source')}: “${sentence}”${userReported ? ' (your own note — not independently verified)' : ''}`);
    groundedClaims.push({ claim: sentence, evidenceRefs: [p.evidenceId], userReported });
  }
  if (!groundedClaims.length) return null;

  const anyVerified = relevant.some(p => p.trustTier !== 'user_reported');
  return {
    answer: lines.join('\n'),
    groundedClaims,
    citations: relevant.map(safeCitation),
    confidence: anyVerified ? 'medium' : 'low',
    mode: 'extractive',
  };
}

/* A human-readable, safe citation. Passages here are already authorised, so this
   exposes only a title/date/ref — never internal scores or raw vector data. */
function safeCitation(p) {
  return {
    label: (p.sourceLabel && String(p.sourceLabel).slice(0, 120)) || 'Source',
    date: p.sourceTimestamp || null,
    ref: p.evidenceId,
    source: (p.provenance && p.provenance.provider) || null,
    userReported: p.trustTier === 'user_reported',
  };
}

/* Citation validation — every grounded claim MUST reference a passage that is
   actually in the authorised bundle. Drops any claim that doesn't (defence against
   an LLM inventing an unsupported organisational fact). Returns the kept claims and
   what was removed. */
function validateCitations(groundedClaims, grounding) {
  const allowed = new Set((grounding.passages || []).map(p => p.evidenceId));
  const kept = [], dropped = [];
  for (const c of (groundedClaims || [])) {
    const refs = (c.evidenceRefs || []).filter(r => allowed.has(r));
    if (refs.length) kept.push({ ...c, evidenceRefs: refs });
    else dropped.push(c);
  }
  return { kept, dropped, ok: dropped.length === 0 };
}

/* Build the user-facing limitations WITHOUT revealing that inaccessible evidence
   exists. Only counts that cannot imply protected material are surfaced. */
function userFacingLimitations(grounding) {
  const lim = [];
  if (!(grounding.passages || []).length) lim.push('No authorised evidence matched this question.');
  else if ((grounding.passages || []).every(p => p.trustTier === 'user_reported'))
    lim.push('Based only on what you have told me — not independently verified.');
  // NOTE: excludedCounts.unauthorised is deliberately never surfaced — it could
  // reveal that private/inaccessible evidence exists.
  return lim;
}

module.exports = {
  trustTier, lexicalScore, freshnessScore, rankPassages, buildGrounding,
  extractiveAnswer, safeCitation, validateCitations, userFacingLimitations,
  TRUST_RANK, DEFAULT_WEIGHTS, RANKING_VERSION,
  _tokens, _bestSentence,
};
