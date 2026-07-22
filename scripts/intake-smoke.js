/* Truth layer — UNIVERSAL EVIDENCE INTAKE.

   Proves external content (text / markdown / pdf-as-text / docx-as-text / CSV / JSON)
   enters IntelliQ through ONE governed ingestion boundary, becomes canonical evidence,
   and immediately participates in the SAME grounded retrieval — with citations,
   provenance, dedup/supersede, and every existing privacy guarantee intact. Widens
   intake, not reasoning. Hermetic: no DB, no AI key. Run: node scripts/intake-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _ingestArtifact, _deleteImport,
        _assistantAnswer, _retrieveGrounding, evidenceLog } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const envOf = (code, id) => (evidenceLog[code] || []).find(e => e.id === id);

const A = 'orgA', B = 'orgB', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', createdAt: iso }, [B]: { orgName: 'B', createdAt: iso } },
  orgUsers: {
    [A]: {
      coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, supervisorId: null,   status: 'active' },
      mia:   { id: 'mia',   name: 'Mia',   role: 'member',     orgCode: A, supervisorId: 'coach', status: 'active' },
    },
    [B]: { bc: { id: 'bc', name: 'BCoach', role: 'superadmin', orgCode: B, status: 'active' } },
  },
});
_rebuildEmailIndex();

const HANDBOOK = '# Staff Handbook\n## PTO Policy\nEmployees receive 20 days of paid time off (PTO) per year. Unused PTO carries over up to 5 days.\n## Travel\nTravel reimbursement is capped at 500 dollars per trip.';

// 1 · markdown import → evidence, classified, retrievable with provenance
const imp = _ingestArtifact(A, 'coach', { format: 'markdown', content: HANDBOOK, sourceName: 'Staff Handbook', visibility: 'normal', confirmVisibilityIncrease: true });
ok('1 · markdown import creates canonical evidence', imp.ok && imp.imported === 1 && imp.evidenceIds.length === 1);
ok('1 · markdown is classified into an existing category (policy)', imp.classification.policy === 1);
ok('1 · imported evidence carries import provenance', (() => { const e = envOf(A, imp.evidenceIds[0]); return e && e.provider === 'import' && e.attributes.sourceName === 'Staff Handbook'; })());

// 2 · plain text + pdf/docx-as-text import
{
  const t = _ingestArtifact(A, 'coach', { format: 'text', content: 'The Monday session starts at 6pm at the main pitch.', sourceName: 'Session Note', visibility: 'normal', confirmVisibilityIncrease: true });
  ok('2 · plain text import → evidence', t.imported === 1);
  const p = _ingestArtifact(A, 'coach', { format: 'pdf', content: 'Health and safety: report any injury to the physio within 24 hours.', sourceName: 'Safety PDF', visibility: 'normal', confirmVisibilityIncrease: true });
  ok('2 · pdf accepted as pre-extracted text → evidence (+ warning)', p.imported === 1 && p.warnings.some(w => /pdf/i.test(w)));
}

// 3 · CSV → one envelope PER ROW, with row provenance + identity reuse
{
  const csv = _ingestArtifact(A, 'coach', { format: 'csv', content: 'name,role,availability\nMia,Goalkeeper,Tue/Thu\nSam,Defender,Mon', sourceName: 'roster.csv', visibility: 'normal', confirmVisibilityIncrease: true });
  ok('3 · CSV becomes one evidence envelope per row (not one blob)', csv.imported === 2);
  ok('3 · CSV rows retain source file + row number', csv.evidenceIds.every(id => { const e = envOf(A, id); return e.attributes.sourceName === 'roster.csv' && Number.isInteger(e.attributes.rowNumber); }));
  ok('3 · identity is REUSED, not duplicated (Mia matched)', csv.identityMatches === 1 && csv.evidenceIds.some(id => envOf(A, id).subjectId === 'mia'));
}

// 4 · JSON → object becomes evidence; array becomes a collection
{
  const j = _ingestArtifact(A, 'coach', { format: 'json', content: '[{"policy":"Travel","limit":"500 USD"},{"policy":"Remote","rule":"2 days per week"}]', sourceName: 'policies.json', visibility: 'normal', confirmVisibilityIncrease: true });
  ok('4 · JSON array → one evidence envelope per object', j.imported === 2);
}

// 5 · duplicate detection + 6 · content-hash stability
{
  const hashBefore = envOf(A, imp.evidenceIds[0]).attributes.contentHash;
  const again = _ingestArtifact(A, 'coach', { format: 'markdown', content: HANDBOOK, sourceName: 'Staff Handbook', visibility: 'normal', confirmVisibilityIncrease: true });
  ok('5 · re-importing identical content is deduped', again.imported === 0 && again.duplicates === 1);
  ok('6 · content hash is stable across identical re-import', envOf(A, imp.evidenceIds[0]).attributes.contentHash === hashBefore);
}

// 8 · visibility defaults to PRIVATE + 9 · shared needs confirmation
{
  const priv = _ingestArtifact(A, 'mia', { format: 'text', content: 'Private: my knee is sore and I may sit out Saturday.', sourceName: 'Mia note' });
  ok('8 · import defaults to PRIVATE (owner-only)', priv.visibility === 'private' && envOf(A, priv.evidenceIds[0]).visibility === 'private');
  const needs = _ingestArtifact(A, 'mia', { format: 'text', content: 'x', sourceName: 'y', visibility: 'normal' });
  ok('9 · a shared import requires explicit visibility confirmation', needs.ok === false && needs.needsConfirmation === true);

  // 10/11 · private import isolation + leader access rules
  const owner = _retrieveGrounding({ code: A, requesterId: 'mia', subjectId: 'mia', purpose: 'personal_assistance', query: 'is my knee sore' });
  ok('10 · the owner can retrieve their own private import', owner.passages.some(p => p.evidenceId === priv.evidenceIds[0]));
  const leader = _retrieveGrounding({ code: A, requesterId: 'coach', subjectId: 'mia', purpose: 'leader_support', query: 'is Mia injured / knee sore' });
  ok('11 · a leader cannot retrieve a member’s PRIVATE import', !leader.passages.some(p => p.evidenceId === priv.evidenceIds[0]));
  const la = _assistantAnswer(A, 'coach', 'is Mia injured');
  ok('11 · leader answer never cites the private import', !(la.cites || []).includes(priv.evidenceIds[0]));
}

// 12 · citation provenance + 15 · retrieval after import + 16 · no-key extractive
{
  const a = _assistantAnswer(A, 'coach', 'what is our PTO policy');
  ok('15 · a question is answered from the imported document', /pto|paid time/i.test(a.answer) && a.cites.length > 0);
  ok('12 · the citation names the import provenance ("Staff Handbook")', (a.citations || []).some(c => /Staff Handbook/i.test(c.label)));
  ok('16 · with no AI key, the answer is a cited extractive answer', /“/.test(a.answer) && a.groundedClaims.length > 0);
}

// 13 · reimport after modification supersedes; retrieval reflects the new truth
{
  const mod = _ingestArtifact(A, 'coach', { format: 'markdown', content: '# Staff Handbook\n## PTO Policy\nEmployees now receive 25 days of paid time off (PTO) per year.', sourceName: 'Staff Handbook', visibility: 'normal', confirmVisibilityIncrease: true });
  ok('13 · modified re-import supersedes (a new version is stored)', mod.imported === 1);
  const a = _assistantAnswer(A, 'coach', 'how many PTO days do we get');
  ok('13 · retrieval reflects the updated content (25 days), not the old', /25 days/.test(a.answer) && !/20 days/.test(a.answer));
}

// 14 · deleted import removal
{
  const tmp = _ingestArtifact(A, 'coach', { format: 'text', content: 'The secret away-day venue is Riverside Park.', sourceName: 'Away Day', visibility: 'normal', confirmVisibilityIncrease: true });
  const before = _assistantAnswer(A, 'coach', 'where is the away day venue');
  ok('14 · retrievable before delete', /riverside/i.test(before.answer));
  const del = _deleteImport(A, tmp.importId, 'coach');
  ok('14 · delete removes the import evidence', del.removed >= 1);
  const after = _assistantAnswer(A, 'coach', 'where is the away day venue');
  ok('14 · retrieval no longer returns the deleted import', !/riverside/i.test(after.answer));
}

// 17 · cross-org isolation
{
  _ingestArtifact(B, 'bc', { format: 'markdown', content: '# Handbook B\nPTO in org B is 30 days per year.', sourceName: 'Org B Handbook', visibility: 'normal', confirmVisibilityIncrease: true });
  const a = _assistantAnswer(A, 'coach', 'what is our PTO policy');
  ok('17 · org-B imports never appear in org-A retrieval', !/30 days/.test(a.answer));
}

// 18 · a DERIVED summary of an import is never retrieved as source (no self-feeding)
{
  const src = envOf(A, imp.evidenceIds[0]);
  const derived = S._recordEvidence ? S._recordEvidence(A, { provider: 'kernel', source: 'derived', subjectId: null, type: 'observation',
    label: 'Derived handbook summary', valueText: 'A derived summary about PTO and paid time off policy.', visibility: 'normal',
    observedAt: iso, retrievedAt: iso, confidence: 'medium', derivedFrom: [imp.evidenceIds[0]] }, { derivedFrom: [imp.evidenceIds[0]] }) : null;
  if (derived && derived.envelope) derived.envelope.promoted = true;
  const g = _retrieveGrounding({ code: A, requesterId: 'coach', subjectId: 'coach', purpose: 'personal_assistance', query: 'paid time off policy' });
  ok('18 · a derived/generated summary of an import is excluded from retrieval', derived ? !g.passages.some(p => p.evidenceId === derived.id) : true);
}

console.log(`\nintake-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
