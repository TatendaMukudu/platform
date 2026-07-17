/* ============================================================
   scripts/reasoning-smoke.js — the Three Reasoning Boundaries (pure).

   Pre-kernel may not conclude; kernel must cite basis; post-kernel may not exceed the
   kernel result. Inspectable artifacts, never chain-of-thought.

   Run:  node scripts/reasoning-smoke.js   (part of `npm test`)
   ============================================================ */

const r = require('../lib/reasoning');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

console.log('\n=== Three reasoning boundaries ===\n');

// ── Artifact shape stores justification, NEVER chain-of-thought ─────────────
const art = r.buildArtifact({ org: 'CO', stage: 'kernel', type: 'derived_pattern', basis: ['e1', 'e2'], confidence: 'medium',
  limitations: ['cause unconfirmed'], chainOfThought: 'first I thought X then Y', reasoning: 'secret prose' });
ok('an artifact keeps result/basis/confidence/limitations/provenance', art.basis.length === 2 && art.confidence === 'medium' && !!art.provenance);
ok('an artifact NEVER persists chain-of-thought', !('chainOfThought' in art) && !('reasoning' in art));

// ── A. Pre-kernel may not conclude ──────────────────────────────────────────
ok('a pre-kernel observation is valid', r.preKernelValid(r.buildArtifact({ stage: 'pre_kernel', type: 'transformed_evidence', derivation: 'observed', confidence: 'low' })).ok);
ok('a pre-kernel PATTERN inference is rejected', !r.preKernelValid(r.buildArtifact({ stage: 'pre_kernel', type: 'transformed_evidence', derivation: 'pattern', confidence: 'low' })).ok);
ok('a pre-kernel CONFIRMED conclusion is rejected', !r.preKernelValid(r.buildArtifact({ stage: 'pre_kernel', type: 'transformed_evidence', derivation: 'extracted', confidence: 'confirmed' })).ok);
ok('a pre-kernel artifact cannot produce a kernel type (derived_pattern)', !r.preKernelValid(r.buildArtifact({ stage: 'pre_kernel', type: 'derived_pattern', derivation: 'observed', confidence: 'low' })).ok);
ok('"confirmed overload" is an inadmissible claim; "seemed distracted" is admissible',
   !r.claimIsAdmissible({ text: 'confirmed overload', confidence: 'confirmed', derivation: 'inference' }) &&
   r.claimIsAdmissible({ text: 'seemed distracted', confidence: 'low', derivation: 'observed' }));

// ── Model transformation must keep its raw source ───────────────────────────
ok('a MODEL pre-kernel transformation without a raw ref is rejected',
   !r.preKernelValid(r.buildArtifact({ stage: 'pre_kernel', type: 'transformed_evidence', derivation: 'extracted', confidence: 'low', provenanceKind: 'model' })).ok);
ok('a model transformation WITH a raw ref is valid',
   r.preKernelValid(r.buildArtifact({ stage: 'pre_kernel', type: 'transformed_evidence', derivation: 'extracted', confidence: 'low', provenanceKind: 'model', rawRef: 'raw_1' })).ok);

// ── B. Kernel output must retain basis IDs ──────────────────────────────────
ok('a kernel output WITHOUT basis IDs is rejected', !r.kernelOutputValid(r.buildArtifact({ stage: 'kernel', type: 'derived_pattern', basis: [], confidence: 'medium' })).ok);
ok('a kernel output WITH basis + confidence is valid', r.kernelOutputValid(r.buildArtifact({ stage: 'kernel', type: 'derived_pattern', basis: ['e1'], confidence: 'medium' })).ok);

// ── C. Post-kernel may not exceed the kernel result ─────────────────────────
const kernel = r.buildArtifact({ stage: 'kernel', type: 'hypothesis', basis: ['e1', 'e2'], confidence: 'medium', limitations: ['cause unconfirmed'] });
ok('a post-kernel output at the SAME confidence, keeping limitations, is bounded',
   r.postKernelBounded(kernel, { confidence: 'medium', limitations: ['cause unconfirmed'], cites: ['e1'] }, ['e1', 'e2']).ok);
ok('a post-kernel output that RAISES confidence is rejected',
   !r.postKernelBounded(kernel, { confidence: 'confirmed', limitations: ['cause unconfirmed'], cites: ['e1'] }, ['e1', 'e2']).ok);
ok('a post-kernel output that DROPS a limitation is rejected',
   !r.postKernelBounded(kernel, { confidence: 'medium', limitations: [], cites: ['e1'] }, ['e1', 'e2']).ok);
ok('a post-kernel output citing UNAUTHORISED evidence is rejected',
   !r.postKernelBounded(kernel, { confidence: 'medium', limitations: ['cause unconfirmed'], cites: ['e9'] }, ['e1', 'e2']).ok);
ok('a post-kernel output that adds an unsupported factual claim is rejected',
   !r.postKernelBounded(kernel, { confidence: 'medium', limitations: ['cause unconfirmed'], cites: [], addedFactualClaim: true }, ['e1', 'e2']).ok);

console.log(`\n=== reasoning-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
