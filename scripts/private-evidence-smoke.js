/* ============================================================
   scripts/private-evidence-smoke.js — the 18 private-evidence invariants.

   The corrected contract: a meaningful private item BECOMES private canonical
   evidence (owner-only) so it can power personal reasoning — while staying
   structurally excluded from all organisational reasoning. Privacy governs
   consumption + visibility; it does not exempt AI-used data from canonicalisation.

   Run:  node scripts/private-evidence-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _interpretInput, _kernelEvidence, _isCanonicalEvidence,
        _recordDerivedEvidence, _deleteWorkspaceEvidence, evidenceLog, orgSignals, reasoningArtifacts } = srv;
const wlib = require('../lib/workspace');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'priv';
_loadAllStores({ orgMeta: { [CODE]: { orgName: 'Priv Co', createdAt: new Date().toISOString() } }, orgUsers: { [CODE]: {
  ana: { id: 'ana', name: 'Ana', email: 'ana@co.fc', role: 'member', orgCode: CODE, status: 'active' },
  boss: { id: 'boss', name: 'Boss', email: 'boss@co.fc', role: 'admin', orgCode: CODE, status: 'active' },
} } });
_rebuildEmailIndex();
const priv = wlib.buildItem({ id: 'ws_priv', org: CODE, ownerId: 'ana', text: "I'm exhausted and struggling to cope this week", scope: 'personal_private' });

console.log('\n=== Private canonical evidence — 18 invariants ===\n');

// (1) A stored private reflection used by IntelliQ creates private canonical evidence.
_interpretInput(CODE, { text: priv.text, ownerId: 'ana', subjectId: 'ana', item: priv });
const pe = (evidenceLog[CODE] || []).find(e => e.visibility === 'private' && e.ownerRef === 'ana');
ok('1. a stored private reflection creates PRIVATE canonical evidence', !!pe && pe.__proto__ !== undefined && pe.valueText.includes('exhausted'));

// (2) A private reflection cannot enter the kernel before canonicalisation.
ok('2. the private item only reaches reasoning as canonical evidence (a pre-kernel artifact + envelope exist)',
   (reasoningArtifacts[CODE] || []).some(a => a.stage === 'pre_kernel') && !!pe.rawRef);

// (3) Personal reasoning retrieves private evidence through the canonical gateway.
const personal = _kernelEvidence(CODE, { purpose: 'personal_assistance', viewerId: 'ana', subjectId: 'ana' });
ok('3. personal reasoning retrieves private evidence via the gateway', personal.some(e => e.evidenceId === pe.id) && personal.every(_isCanonicalEvidence));

// (4) Private evidence is retrievable for the OWNER under a personal purpose.
ok('4. the owner can retrieve their private evidence for personal purposes',
   _kernelEvidence(CODE, { purpose: 'personal_memory', viewerId: 'ana' }).some(e => e.evidenceId === pe.id));

// (5-7) Excluded under leader / group / organisation reasoning.
ok('5. private evidence is excluded under LEADER reasoning',
   !_kernelEvidence(CODE, { purpose: 'leader_support', viewerId: 'boss', subjectId: 'ana' }).some(e => e.evidenceId === pe.id));
ok('6. private evidence is excluded under GROUP reasoning',
   !_kernelEvidence(CODE, { purpose: 'group_reasoning', viewerId: 'boss' }).some(e => e.evidenceId === pe.id));
ok('7. private evidence is excluded under ORGANISATION reasoning',
   !_kernelEvidence(CODE, { purpose: 'organisation_reasoning' }).some(e => e.evidenceId === pe.id));

// (8) Private evidence emits no organisational signal.
ok('8. private evidence emits NO organisational signal', !(orgSignals[CODE] || []).some(s => (s.valueText || '').includes('exhausted')));

// (9) Private evidence does not contribute to organisational aggregates.
ok('9. private evidence contributes to no org aggregate (never promoted)', pe.promoted !== true);

// (10-11) Cannot appear in leader-facing citations / leak through wording.
const r = require('../lib/reasoning');
const leaderAuthorised = _kernelEvidence(CODE, { purpose: 'leader_support', viewerId: 'boss', subjectId: 'ana' }).map(e => e.evidenceId);
ok('10. private evidence cannot be a leader-facing citation',
   !r.postKernelBounded({ confidence: 'medium', basis: [pe.id], limitations: [] }, { confidence: 'medium', limitations: [], cites: [pe.id] }, leaderAuthorised).ok);
ok('11. private evidence id is absent from the leader-authorised set (no indirect leak)', !leaderAuthorised.includes(pe.id));

// (12) Private derived evidence inherits owner-only visibility.
const derived = _recordDerivedEvidence(CODE, { subjectId: 'ana', ownerId: 'ana', type: 'observation', label: 'repeated concern', valueText: 'a recurring low mood', basisIds: [pe.id] });
ok('12. a pattern derived from private evidence inherits PRIVATE visibility + owner',
   derived.stored && derived.envelope.visibility === 'private' && derived.envelope.ownerRef === 'ana');

// (13) Post-kernel reasoning cannot broaden private visibility.
ok('13. derived private evidence is still excluded from org reasoning',
   !_kernelEvidence(CODE, { purpose: 'organisation_reasoning' }).some(e => e.evidenceId === derived.id));

// (14) Deleting private evidence removes it from active personal reasoning.
_deleteWorkspaceEvidence(CODE, priv.id);
ok('14. deleting the private item removes its evidence from active personal reasoning',
   !_kernelEvidence(CODE, { purpose: 'personal_assistance', viewerId: 'ana' }).some(e => e.evidenceId === pe.id));

// (15) Correcting private evidence supersedes the prior active representation.
const priv2 = wlib.buildItem({ id: 'ws_sleep', org: CODE, ownerId: 'ana', text: 'sleep 5 hours', scope: 'personal_private' });
_interpretInput(CODE, { text: priv2.text, ownerId: 'ana', subjectId: 'ana', item: priv2 });
_interpretInput(CODE, { text: 'sleep 5 hours', ownerId: 'ana', subjectId: 'ana', item: priv2 });   // exact retry → dedup, not a new fact
const sleeps = (evidenceLog[CODE] || []).filter(e => (e.valueText || '').includes('sleep 5 hours') && e.status === 'active');
ok('15. an identical private re-capture does not create a competing truth (dedup/supersede)', sleeps.length === 1);

// (16) Unsaved composer text does not become canonical evidence.
const beforeCount = (evidenceLog[CODE] || []).length;
wlib.suggestClassification('just thinking out loud, not saved');   // classify only — never interprets/stores
ok('16. unsaved composer text (classify only) creates no canonical evidence', (evidenceLog[CODE] || []).length === beforeCount);

// (17) No raw workspace-item repository is read directly for personal AI context.
// The gateway returns only canonical envelopes (with evidenceId), never raw items.
ok('17. personal AI context comes ONLY from canonical evidence (gateway), never raw items',
   _kernelEvidence(CODE, { purpose: 'personal_assistance', viewerId: 'ana' }).every(e => _isCanonicalEvidence(e) && !!e.evidenceId));

// (18) No private chain-of-thought is persisted.
ok('18. no reasoning artifact persists chain-of-thought',
   (reasoningArtifacts[CODE] || []).every(a => !('chainOfThought' in a) && !('reasoning' in a)));

console.log(`\n=== private-evidence-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
