/* ============================================================
   scripts/reasoning-boundaries-smoke.js — the 10 architectural invariants.

   Drives the real server's pre-kernel / kernel-gateway / post-kernel services + the
   workspace producer to prove the three reasoning boundaries hold end to end.

   Run:  node scripts/reasoning-boundaries-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _interpretInput, _kernelEvidence, _isCanonicalEvidence,
        _recordKernelDerivation, _composeForAudience, reasoningArtifacts, evidenceLog } = srv;
const wlib = require('../lib/workspace');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'reasonco';
_loadAllStores({ orgMeta: { [CODE]: { orgName: 'Reason Co', createdAt: new Date().toISOString() } }, orgUsers: { [CODE]: {
  sam: { id: 'sam', name: 'Sam Fox', email: 'sam@co.fc', role: 'member', orgCode: CODE, status: 'active' },
} } });
_rebuildEmailIndex();
const arts = () => reasoningArtifacts[CODE] || [];

console.log('\n=== The 10 reasoning-boundary invariants ===\n');

// (1) Pre-kernel extraction cannot write confirmed conclusions without qualifying evidence.
const orgItem = wlib.buildItem({ org: CODE, ownerId: 'lead', text: 'Sam is confirmed overloaded because of excessive workload', scope: 'organizational', purpose: 'observation', visibility: 'manager', aiUsage: 'may_be_cited' });
_interpretInput(CODE, { text: orgItem.text, ownerId: 'lead', subjectId: 'sam', item: orgItem });
ok('1. pre-kernel never writes a CONFIRMED conclusion',
   arts().filter(a => a.stage === 'pre_kernel').every(a => a.confidence !== 'confirmed' && a.derivation !== 'pattern' && a.derivation !== 'inference'));

// (2) Raw inputs cannot reach the kernel before canonicalisation.
const rawRecord = { email: 'sam@co.fc', note: 'raw capability record', foo: 1 };
ok('2. a raw capability record is NOT canonical (cannot pass the gateway)', !_isCanonicalEvidence(rawRecord));
ok('2. the kernel gateway yields ONLY canonical evidence', _kernelEvidence(CODE).every(e => _isCanonicalEvidence(e)));

// (3) Kernel outputs retain basis evidence IDs.
const basisIds = _kernelEvidence(CODE, { subjectId: 'sam' }).map(e => e.evidenceId);
const kart = _recordKernelDerivation(CODE, { type: 'hypothesis', result: { pattern: 'possible momentum decline' }, basis: basisIds.length ? basisIds : ['e_seed'], confidence: 'medium', limitations: ['cause unconfirmed'], detector: 'momentum_v1' });
ok('3. a kernel derivation carries basis evidence IDs (else rejected)', !kart.rejected && kart.basis.length >= 1);
const bad = _recordKernelDerivation(CODE, { type: 'hypothesis', result: {}, basis: [], confidence: 'medium' });
ok('3. a kernel derivation with NO basis is rejected', Array.isArray(bad.rejected) && bad.rejected.length >= 1);

// (4) Post-kernel outputs cannot increase the epistemic strength of a kernel result.
const pkGood = _composeForAudience(CODE, kart, { role: 'member', subjectId: 'sam', text: 'You have had several deadlines move — is workload getting in the way?' });
ok('4. a faithful post-kernel output is accepted and never raises confidence',
   pkGood.ok && pkGood.output.confidence === kart.confidence);
const r = require('../lib/reasoning');
ok('4. an attempt to raise confidence beyond the kernel result is rejected',
   !r.postKernelBounded(kart, { confidence: 'confirmed', limitations: kart.limitations, cites: [] }, basisIds).ok);

// (5) Post-kernel outputs cannot access evidence outside the audience's authorised set.
ok('5. post-kernel citations are filtered to the audience-authorised set',
   pkGood.output.cites.every(id => basisIds.includes(id)) &&
   !r.postKernelBounded(kart, { confidence: 'medium', limitations: kart.limitations, cites: ['e_secret'] }, basisIds).ok);

// (6) Post-kernel actions require policy and approval checks.
const pol = require('../lib/policy');
ok('6. an execute-class action is gated by policy by default (needs approval)',
   pol.evaluate(pol.defaultPolicies(), { capability: 'intervention', verb: 'create', stage: 'execute' }).requiresApproval);

// (7) Meaningful presentation and action decisions remain traceable.
ok('7. a post-kernel decision is recorded as an inspectable artifact',
   arts().some(a => a.stage === 'post_kernel' && a.type === 'presentation_decision'));

// (8) Model-generated transformations preserve raw-source provenance.
_interpretInput(CODE, { text: 'Sam said the project was becoming too much and asked to move Friday', ownerId: 'lead', subjectId: 'sam', item: orgItem, byModel: true, rawRef: 'raw_42' });
ok('8. a model pre-kernel transformation preserves its raw-source ref',
   arts().filter(a => a.stage === 'pre_kernel' && a.provenance.kind === 'model').every(a => a.provenance.rawRef && !a.rejected));

// (9) Private chain-of-thought is never persisted.
ok('9. no stored artifact contains chain-of-thought fields',
   arts().every(a => !('chainOfThought' in a) && !('reasoning' in a) && !('thought' in a)));

// (10) Action and outcome evidence return to the kernel through the canonical gateway.
// A private reflection must NOT reach the kernel; a permitted observation must.
const privItem = wlib.buildItem({ org: CODE, ownerId: 'sam', text: "I'm exhausted and struggling", scope: 'personal_private' });
const beforeEv = (evidenceLog[CODE] || []).length;
_interpretInput(CODE, { text: privItem.text, ownerId: 'sam', subjectId: 'sam', item: privItem });
ok('10. a personal-private reflection creates NO canonical evidence (owner-only)',
   (evidenceLog[CODE] || []).length === beforeEv);
const permitted = wlib.buildItem({ org: CODE, ownerId: 'lead', text: 'Sam delivered the report on time', scope: 'organizational', purpose: 'observation', visibility: 'manager', aiUsage: 'may_be_cited' });
_interpretInput(CODE, { text: permitted.text, ownerId: 'lead', subjectId: 'sam', item: permitted });
ok('10. a permitted observation DOES return to the kernel as canonical evidence via the gateway',
   _kernelEvidence(CODE, { subjectId: 'sam' }).length >= 1 && _kernelEvidence(CODE).every(e => _isCanonicalEvidence(e)));

console.log(`\n=== reasoning-boundaries-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
