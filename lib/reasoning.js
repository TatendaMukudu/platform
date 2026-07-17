/* ============================================================
   lib/reasoning.js — the Three Reasoning Boundaries (pure contracts).

   IntelliQ preserves THREE separate forms of reasoning that must never be collapsed
   into one generic model call:

     raw input → PRE-KERNEL → canonical evidence → KERNEL → derived evidence →
     POST-KERNEL → authorised experience or action

   A. PRE-KERNEL interprets raw material into correctly-structured canonical evidence.
      It may classify, extract claims, resolve actors, assign provenance, propose
      visibility. It may NOT conclude a longitudinal pattern, infer causation, or
      promote a model interpretation into observed fact.
   B. KERNEL reasons ONLY over policy-admissible canonical evidence — patterns,
      baselines, trajectories, hypotheses — always retaining basis evidence IDs and
      confidence. It never reads raw capability records.
   C. POST-KERNEL turns an authorised kernel result into an experience/action. It may
      choose audience, channel, wording, timing. It may NOT add facts, raise
      confidence, remove limitations, or reveal evidence the audience can't see.

   We store INSPECTABLE reasoning ARTIFACTS (result, basis, confidence, limitations,
   policy context, provenance, decision state) — never private chain-of-thought.

   Pure + deterministic: the artifact shape + the boundary enforcement predicates.
   ============================================================ */

const STAGES = ['pre_kernel', 'kernel', 'post_kernel'];

/* The canonical lineage of a reasoning output — each is traceable to the last. */
const ARTIFACT_TYPES = [
  'source_evidence', 'transformed_evidence', 'derived_pattern', 'hypothesis',
  'recommendation', 'presentation_decision', 'approved_action', 'executed_action',
  'outcome', 'evaluation',
];

/* Which artifact types each stage is allowed to PRODUCE (typed boundaries). */
const STAGE_PRODUCES = {
  pre_kernel:  ['source_evidence', 'transformed_evidence'],
  kernel:      ['derived_pattern', 'hypothesis', 'recommendation', 'evaluation'],
  post_kernel: ['presentation_decision', 'approved_action', 'executed_action', 'outcome'],
};

/* Epistemic strength, ordered — post-kernel may never exceed the kernel result. */
const CONFIDENCE_ORDER = ['none', 'low', 'medium', 'high', 'confirmed'];
const _rank = c => Math.max(0, CONFIDENCE_ORDER.indexOf(c));

/* A derivation type distinguishes an OBSERVED fact from a MODEL interpretation — the
   line pre-kernel must not cross into "confirmed". */
const DERIVATIONS = ['observed', 'reported', 'measured', 'requested', 'extracted', 'pattern', 'inference', 'decision'];

const _s = (v, n) => (v == null ? '' : String(v)).slice(0, n);

/* Build an inspectable reasoning artifact. NEVER carries chain-of-thought — only the
   result and its justification metadata. */
function buildArtifact(input = {}) {
  const now = new Date().toISOString();
  return {
    id: _s(input.id, 64) || null,
    org: _s(input.org, 64).toLowerCase(),
    stage: STAGES.includes(input.stage) ? input.stage : 'pre_kernel',
    type: ARTIFACT_TYPES.includes(input.type) ? input.type : 'transformed_evidence',
    derivation: DERIVATIONS.includes(input.derivation) ? input.derivation : 'extracted',
    result: input.result != null ? input.result : null,      // the structured output (NOT reasoning prose)
    basis: Array.isArray(input.basis) ? input.basis.slice(0, 200).map(x => _s(x, 64)) : [],          // evidence IDs it rests on
    counterBasis: Array.isArray(input.counterBasis) ? input.counterBasis.slice(0, 100).map(x => _s(x, 64)) : [],
    confidence: CONFIDENCE_ORDER.includes(input.confidence) ? input.confidence : 'low',
    limitations: Array.isArray(input.limitations) ? input.limitations.slice(0, 20).map(x => _s(x, 200)) : [],
    policyContext: input.policyContext != null ? _s(input.policyContext, 200) : null,
    provenance: {                                            // detector/rule/model version — reproducibility
      by: _s(input.provenanceBy || input.by || 'system', 64),
      kind: _s(input.provenanceKind || 'rule', 40),          // 'rule' | 'model' | 'human'
      version: _s(input.provenanceVersion || 'v1', 40),
      rawRef: input.rawRef != null ? _s(input.rawRef, 64) : null,   // link back to the immutable source
    },
    decisionState: _s(input.decisionState || 'recorded', 40),
    audienceScope: input.audienceScope != null ? _s(input.audienceScope, 40) : null,
    createdAt: now,
  };
}

/* ── A. PRE-KERNEL validity ─────────────────────────────────────────────────
   Pre-kernel extraction is a TRANSFORMATION. It may not assert a confirmed
   conclusion, a longitudinal pattern, or a causal inference — those are the kernel's
   job. A pre-kernel artifact must be observed/reported/measured/requested/extracted,
   never a pattern/inference/decision at high confidence, and must keep its raw source. */
function preKernelValid(artifact) {
  const errors = [];
  if (!artifact || artifact.stage !== 'pre_kernel') { errors.push('not a pre-kernel artifact'); return { ok: false, errors }; }
  if (!STAGE_PRODUCES.pre_kernel.includes(artifact.type)) errors.push(`pre-kernel cannot produce ${artifact.type}`);
  if (['pattern', 'inference'].includes(artifact.derivation)) errors.push('pre-kernel cannot infer patterns or causation');
  if (_rank(artifact.confidence) >= _rank('confirmed')) errors.push('pre-kernel cannot assert a confirmed conclusion');
  // A model-assisted extraction must preserve its raw source (provenance).
  if (artifact.provenance && artifact.provenance.kind === 'model' && !artifact.provenance.rawRef) errors.push('model transformation must preserve the raw source ref');
  return { ok: errors.length === 0, errors };
}

/* Guard for the RESULT of a pre-kernel extraction of a claim: an interpretation like
   "confirmed overload" is invalid; "appeared distracted" / "said it was too much" /
   "requested a deadline change" are valid. */
function claimIsAdmissible(claim) {
  if (!claim || typeof claim !== 'object') return false;
  const conclusory = /\b(confirmed|is (overloaded|burned out|declining|withdrawing)|because of|caused by|due to (overload|burnout))\b/i.test(String(claim.text || ''));
  const derivation = claim.derivation || 'extracted';
  return !(conclusory && (claim.confidence === 'confirmed' || derivation === 'pattern' || derivation === 'inference'));
}

/* ── B. KERNEL validity ─────────────────────────────────────────────────────
   A kernel output must carry the basis evidence IDs it rests on, a confidence, and
   any limitations. (The gateway separately guarantees the kernel only ever sees
   canonical, policy-admissible evidence — never raw.) */
function kernelOutputValid(artifact) {
  const errors = [];
  if (!artifact || artifact.stage !== 'kernel') { errors.push('not a kernel artifact'); return { ok: false, errors }; }
  if (!STAGE_PRODUCES.kernel.includes(artifact.type)) errors.push(`kernel cannot produce ${artifact.type}`);
  if (!Array.isArray(artifact.basis) || artifact.basis.length === 0) errors.push('kernel output must retain basis evidence IDs');
  if (!CONFIDENCE_ORDER.includes(artifact.confidence)) errors.push('kernel output must carry a confidence');
  return { ok: errors.length === 0, errors };
}

/* ── C. POST-KERNEL bounding ─────────────────────────────────────────────────
   A post-kernel output may not exceed the kernel result's epistemic strength, drop
   its limitations, invent basis, or cite evidence outside the audience's authorised
   set. `authorisedEvidence` is the set of evidence IDs the audience may see. */
function postKernelBounded(kernelArtifact, postOutput, authorisedEvidence) {
  const errors = [];
  if (!kernelArtifact) { errors.push('no kernel result to bound to'); return { ok: false, errors }; }
  if (_rank(postOutput.confidence || 'none') > _rank(kernelArtifact.confidence)) errors.push('post-kernel cannot raise the kernel confidence');
  const kLim = new Set(kernelArtifact.limitations || []);
  if (postOutput.dropsLimitations || (Array.isArray(postOutput.limitations) && [...kLim].some(l => !postOutput.limitations.includes(l)))) {
    // limitations must be preserved (a superset is fine; a subset that drops one is not)
    if (Array.isArray(postOutput.limitations) && kLim.size) errors.push('post-kernel cannot remove a material limitation');
  }
  const cites = postOutput.cites || [];
  // An explicitly-provided authorised set is ENFORCED even when empty ("nothing
  // authorised" ≠ "unknown"). Only skip the check when no set is provided at all.
  if (Array.isArray(authorisedEvidence)) {
    const allowed = new Set(authorisedEvidence);
    if (cites.some(id => !allowed.has(id))) errors.push('post-kernel cannot cite evidence outside the audience\'s authorised set');
  }
  if (postOutput.addedFactualClaim) errors.push('post-kernel cannot add an unsupported factual claim');
  return { ok: errors.length === 0, errors };
}

module.exports = {
  STAGES, ARTIFACT_TYPES, STAGE_PRODUCES, CONFIDENCE_ORDER, DERIVATIONS,
  buildArtifact, preKernelValid, claimIsAdmissible, kernelOutputValid, postKernelBounded,
};
