/* Truth layer — GROUNDED RETRIEVAL over canonical evidence.

   Proves the trustworthy grounded-retrieval slice: an authorised user can ask a
   question about free-text canonical evidence and get a CITED answer, while an
   unauthorised user cannot retrieve, cite, detect, or infer protected evidence —
   and the same works with NO AI key (deterministic extractive answers).

   Authorisation is proven BEFORE answer composition (the private evidence is absent
   from the grounding bundle, not redacted afterward). Hermetic: no DB, no AI key,
   no embedding key. Run:  node scripts/retrieval-smoke.js   (part of `npm test`) */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, _recordEvidence, _captureKnowledge,
        _retrieveGrounding, _assistantAnswer, _indexEvidence, _evictEvidenceVector,
        evidenceVectors, evidenceLog } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'orgA', B = 'orgB', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', createdAt: iso }, [B]: { orgName: 'B', createdAt: iso } },
  orgUsers: {
    [A]: {
      coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, supervisorId: null,   status: 'active' },
      m1:    { id: 'm1',    name: 'Mia',   role: 'member',     orgCode: A, supervisorId: 'coach', status: 'active' },
      m2:    { id: 'm2',    name: 'Sam',   role: 'member',     orgCode: A, supervisorId: 'coach', status: 'active' },
    },
    [B]: { bc: { id: 'bc', name: 'BCoach', role: 'superadmin', orgCode: B, status: 'active' } },
  },
});
_rebuildEmailIndex();

const PRESS = 'Our high press uses a 4-3-3 shape. The wingers pin the opposition fullbacks and we press on the goalkeeper pass.';
const doc   = _captureKnowledge(A, 'coach', PRESS, { visibility: 'normal' });
const note1 = _captureKnowledge(A, 'm1', 'Keep this private: I am seriously considering leaving the team next season.', { visibility: 'private' });
const note2 = _captureKnowledge(A, 'm2', 'Private: my knee has been sore after every session.', { visibility: 'private' });
const derived = _recordEvidence(A, { provider: 'kernel', source: 'derived', subjectId: 'coach', type: 'observation',
  label: 'Derived summary', valueText: 'A derived note about the high press 4-3-3 shape and wingers.', visibility: 'normal',
  observedAt: iso, retrievedAt: iso, confidence: 'medium', derivedFrom: [doc.id] }, { derivedFrom: [doc.id] });
_captureKnowledge(B, 'bc', 'Our high press in a 4-3-3 with pressing triggers on the fullbacks.', { visibility: 'normal' });

(async () => {
  // 1 · personal/private retrieval
  {
    const g = _retrieveGrounding({ code: A, requesterId: 'm1', subjectId: 'm1', purpose: 'personal_assistance', query: 'am I thinking about leaving the team' });
    ok('1 · owner retrieves their own private note', g.passages.some(p => p.evidenceId === note1.id));
  }

  // 2 · LEADER LEAK PREVENTION — private absent from the bundle BEFORE composition
  {
    const g = _retrieveGrounding({ code: A, requesterId: 'coach', subjectId: 'm1', purpose: 'leader_support', query: 'is Mia considering leaving the team' });
    ok('2 · leader bundle does NOT contain the private note (absent pre-composition)', !g.passages.some(p => p.evidenceId === note1.id));
    ok('2 · no leader passage paraphrases the private note', !/leaving|leave/i.test(JSON.stringify(g.passages)));
    const a = _assistantAnswer(A, 'coach', 'is Mia considering leaving the team');
    ok('2 · leader-side answer never cites/echoes the member private evidence', !(a.cites || []).includes(note1.id) && !/leaving/i.test(a.answer));
  }

  // 3 · cross-member isolation
  {
    const g = _retrieveGrounding({ code: A, requesterId: 'm2', subjectId: 'm2', purpose: 'personal_assistance', query: 'considering leaving the team next season' });
    ok('3 · a member cannot retrieve another member’s private note', !g.passages.some(p => p.evidenceId === note1.id));
  }

  // 4 · organisation isolation
  {
    const g = _retrieveGrounding({ code: A, requesterId: 'coach', subjectId: 'coach', purpose: 'personal_assistance', query: 'high press 4-3-3 fullbacks' });
    ok('4 · retrieval stays within the org (no org-B evidence)', !g.passages.some(p => /pressing triggers/i.test(p.text)));
  }

  // 5 · group/role scope
  {
    const g = _retrieveGrounding({ code: A, requesterId: 'm2', subjectId: 'm1', purpose: 'leader_support', query: 'sore knee after sessions' });
    ok('5 · a member using a leader purpose still gets no private evidence', !g.passages.some(p => p.evidenceId === note2.id));
  }

  // 6 · generated / derived exclusion
  {
    const g = _retrieveGrounding({ code: A, requesterId: 'coach', subjectId: 'coach', purpose: 'personal_assistance', query: 'high press 4-3-3 wingers' });
    ok('6 · derived/generated evidence is never a retrieved passage', !g.passages.some(p => p.evidenceId === derived.id));
    ok('6 · derived evidence is counted as excluded (non-source)', g.excludedCounts.nonSourceEvidence >= 1);
  }

  // 7 · citation integrity
  {
    const a = _assistantAnswer(A, 'coach', 'how does our high press work');
    const g = _retrieveGrounding({ code: A, requesterId: 'coach', subjectId: 'coach', purpose: 'personal_assistance', query: 'how does our high press work' });
    const allowed = new Set(g.passages.map(p => p.evidenceId));
    ok('7 · answer produced grounded claims with citations', (a.groundedClaims || []).length > 0 && (a.citations || []).length > 0);
    ok('7 · every grounded claim cites evidence in the authorised bundle', (a.groundedClaims || []).every(c => (c.evidenceRefs || []).every(r => allowed.has(r))));
  }

  // 8 · empty retrieval
  {
    const a = _assistantAnswer(A, 'm1', 'what is the capital of France');
    ok('8 · no relevant evidence → explicit insufficient-evidence answer', /don't have enough authorised evidence/i.test(a.answer) && a.confidence === 'none');
    ok('8 · insufficient answer fabricates/cites nothing', (a.groundedClaims || []).length === 0 && (a.cites || []).length === 0);
  }

  // 9 · lower-trust labelling
  {
    const a = _assistantAnswer(A, 'm1', 'what did I say about leaving');
    ok('9 · a user-reported claim is labelled user-reported', (a.groundedClaims || []).some(c => c.userReported === true));
    ok('9 · user-reported material is not presented as independently verified', /not independently verified|your own note/i.test(a.answer));
  }

  // 10 · deterministic no-key fallback
  {
    const a = _assistantAnswer(A, 'coach', 'how does our high press work');
    ok('10 · with no AI key, returns a cited extractive answer', a.citations.length > 0 && a.cites.length > 0 && /“/.test(a.answer));
  }

  // 11 · idempotent embedding
  {
    await _indexEvidence(A, doc.envelope);
    const r = await _indexEvidence(A, doc.envelope);
    ok('11 · re-indexing unchanged evidence is an idempotent no-op', r.reason === 'idempotent_skip');
    ok('11 · the index holds exactly one entry for the evidence', (evidenceVectors[A] || new Map()).has(doc.id));
  }

  // 12 · updated / superseded evidence — stale vector evicted; retrieval reflects new truth
  {
    await _indexEvidence(A, note2.envelope);
    ok('12 · evidence is indexed before eviction', (evidenceVectors[A] || new Map()).has(note2.id));
    _evictEvidenceVector(A, note2.id);
    ok('12 · a stale/superseded vector is evicted', !(evidenceVectors[A] || new Map()).has(note2.id));
    const env = (evidenceLog[A] || []).find(e => e.id === note2.id);
    if (env) env.status = 'superseded';
    const g = _retrieveGrounding({ code: A, requesterId: 'm2', subjectId: 'm2', purpose: 'personal_assistance', query: 'sore knee after sessions' });
    ok('12 · superseded evidence is not retrieved', !g.passages.some(p => p.evidenceId === note2.id));
    if (env) env.status = 'active';
  }

  // 13 · visibility change shared→private blocks subsequent unauthorised retrieval
  {
    const shared = _recordEvidence(A, { provider: 'user', source: 'reported', subjectId: 'm1', type: 'note',
      label: 'Session availability', valueText: 'Mia can make the Tuesday and Thursday evening sessions.',
      visibility: 'normal', observedAt: iso, retrievedAt: iso, confidence: 'reported' });
    const env = (evidenceLog[A] || []).find(e => e.id === shared.id);
    if (env) env.promoted = true;
    const before = _retrieveGrounding({ code: A, requesterId: 'coach', subjectId: 'm1', purpose: 'leader_support', query: 'which sessions can Mia make' });
    ok('13 · a shared+promoted note is retrievable by a leader', before.passages.some(p => p.evidenceId === shared.id));
    if (env) env.visibility = 'private';
    const after = _retrieveGrounding({ code: A, requesterId: 'coach', subjectId: 'm1', purpose: 'leader_support', query: 'which sessions can Mia make' });
    ok('13 · after shared→private, the leader can no longer retrieve it', !after.passages.some(p => p.evidenceId === shared.id));
  }

  // 14 · no existence leakage
  {
    const g = _retrieveGrounding({ code: A, requesterId: 'coach', subjectId: 'm1', purpose: 'leader_support', query: 'is Mia considering leaving the team' });
    ok('14 · the grounding artifact exposes no "unauthorised" count', !('unauthorised' in g.excludedCounts));
    ok('14 · limitations never reveal that inaccessible evidence exists', !g.limitations.some(l => /private|hidden|restricted|cannot see|not authorised/i.test(l)));
    const a = _assistantAnswer(A, 'coach', 'is Mia considering leaving the team');
    ok('14 · the answer never hints protected evidence exists', !/private|hidden|restricted/i.test(a.answer));
  }

  // 15 · GOVERNANCE — one retrieval authority; answer routes through it; index refuses non-source
  {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    ok('15 · _assistantAnswer routes through _retrieveGrounding', /function _assistantAnswer[\s\S]*?_retrieveGrounding\(\{/.test(src));
    ok('15 · retrieval authorises via _kernelEvidence BEFORE ranking', /function _retrieveGrounding[\s\S]*?_kernelEvidence\(code[\s\S]*?rankPassages/.test(src));
    ok('15 · the index refuses non-source evidence', /_indexEvidence[\s\S]*?_isSourceEvidence\(env\)/.test(src));
  }

  console.log(`\nretrieval-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
