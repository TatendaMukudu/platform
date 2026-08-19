/* Truth layer — P0-1: EVIDENCE MAY LEAVE THE WORKING SET, NEVER EXISTENCE.

   Pilot blocker. See docs/briefs/p0-pilot-blockers.md for the decision this encodes.

   WRITTEN BEFORE THE FIX, by the reviewer. These cases are the specification. Do not edit an
   assertion to make it pass — if one is wrong, say so in the PR and leave it red.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green.

   ── The defect ──────────────────────────────────────────────────────────────────────────

   server.js:1040  const EVIDENCE_LOG_CAP = 8000;
   server.js:6036  if (log.length > EVIDENCE_LOG_CAP) {
                     const dropped = log.splice(0, log.length - EVIDENCE_LOG_CAP);
                     dropped.forEach(d => { if (d.rawRef) delete rawEvidence[d.rawRef]; });
                   }

   The oldest evidence is destroyed by volume. A 100-person org with daily check-ins reaches
   8,000 envelopes in roughly four months, after which every new record deletes an old one.

   Three consequences, and the third is why this blocks a pilot:

     1. `_retrieveGrounding` iterates `evidenceLog[code]`, so a dropped envelope silently stops
        grounding the claims that cite it. The answer shrinks; nobody is told.
     2. `_evictEvidenceVector` is NOT called on drop, so the vector index keeps entries for
        evidence that no longer exists.
     3. It corrupts rather than crashes. Nothing fails loudly; the record just quietly becomes
        untrue, which is the one thing this product cannot afford.

   It contradicts TTD LAW E4 (provenance) and LAW E6 (corrections preserve history).

   ── What this suite requires ────────────────────────────────────────────────────────────

   Not a bigger cap — that defers the same failure to month eight. A RESOLUTION BOUNDARY:
   one function through which evidence is fetched by id, which knows the difference between
   "not in the working set" and "gone".

       _resolveEvidence(code, id) -> { envelope, cold? } | { unresolvable: true, reason }

   It must never return undefined. "I don't have it" is an answer; silence is not.

   ── How eviction is simulated ───────────────────────────────────────────────────────────

   These cases splice the envelope out of `evidenceLog[code]` directly rather than driving
   8,001 records through ingestion. That is faithful: `splice` is exactly what the cap does at
   server.js:6037. It keeps the suite fast and tests the property rather than the trigger.

   Run: node scripts/evidence-durability-smoke.js */

'use strict';

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { _loadAllStores, evidenceLog, evidenceVectors, rawEvidence } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'evdur';
const now = Date.now();
const envelope = (id, extra = {}) => ({
  id, orgCode: C, subjectId: 'joe', status: 'active', visibility: 'org',
  type: 'checkin', provider: 'intelliq', source: 'checkin',
  valueText: `observation ${id}`, retrievedAt: now, rawRef: `raw_${id}`, ...extra,
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Durability Co', orgMode: 'sports' } },
  orgUsers: { [C]: { joe: { id: 'joe', name: 'Joe', role: 'member', orgCode: C, status: 'active' } } },
  evidenceLog: { [C]: [envelope('e_old'), envelope('e_mid'), envelope('e_new')] },
});
rawEvidence.raw_e_old = { org: C, record: { note: 'the original record' } };

console.log('evidence-durability-smoke — P0-1\n');

/* 1 — the boundary must exist at all. Everything below depends on it, and its absence IS the
   architecture gap: today evidence is reachable only by scanning the working-set array, so
   "evicted" and "never existed" are indistinguishable to every caller. */
const resolve = S._resolveEvidence;
ok('1 · a resolution boundary exists', typeof resolve === 'function');
if (typeof resolve !== 'function') {
  console.log('\n  → _resolveEvidence(code, id) is not exported. The remaining cases cannot run.');
  console.log(`\nevidence-durability-smoke: ${pass} passed, ${fail + 8} failed`);
  process.exit(1);
}

/* 2 — resolution works for evidence in the working set, and never returns undefined for
   anything. A resolver that can return undefined pushes the "is it gone?" decision back out
   to every caller, which is how the current bug is invisible. */
{
  const r = resolve(C, 'e_new');
  ok('2 · working-set evidence resolves to its envelope', !!(r && r.envelope && r.envelope.id === 'e_new'));
  const missing = resolve(C, 'never_existed');
  ok('2 · an id that never existed resolves to an explicit unresolvable answer',
    !!missing && missing.unresolvable === true && typeof missing.reason === 'string');
  ok('2 · …and the resolver never returns undefined', missing !== undefined);
}

/* 3 — THE HEADLINE. Evidence pushed out of the working set is still resolvable.

   This is the whole blocker in one assertion: leaving the hot set is an eviction, not a
   deletion. */
{
  const evicted = evidenceLog[C].splice(0, 1)[0];        // exactly what the cap does
  const r = resolve(C, evicted.id);
  ok('3 · evidence evicted from the working set still resolves', !!(r && r.envelope));
  ok('3 · …with its content intact, not a stub', !!(r && r.envelope && r.envelope.valueText === 'observation e_old'));
  ok('3 · …and is marked as cold rather than pretending to be hot',
    !!(r && (r.cold === true || r.source === 'cold' || r.location === 'cold')));
}

/* 4 — no dangling provenance. A belief or signal citing evicted evidence must still be able to
   show where it came from. This is LAW E4 stated as a runtime property rather than a promise. */
{
  const r = resolve(C, 'e_old');
  ok('4 · a claim citing evicted evidence can still show its origin',
    !!(r && r.envelope && r.envelope.provider && r.envelope.source));
}

/* 5 — the vector index must not outlive the working set. Today _evictEvidenceVector is never
   called on drop, so retrieval can score a vector whose evidence is unreachable. */
{
  const store = evidenceVectors[C] || (evidenceVectors[C] = new Map());
  store.set('e_mid', { hash: 'h', vec: [0.1], visibility: 'org', type: 'checkin', indexedAt: now });
  evidenceLog[C] = evidenceLog[C].filter(e => e.id !== 'e_mid');   // evict
  if (typeof S._evictWorkingSet === 'function') S._evictWorkingSet(C, ['e_mid']);
  ok('5 · evicting evidence removes it from the vector index',
    !(evidenceVectors[C] && evidenceVectors[C].has('e_mid')));
}

/* 6 — corrections survive eviction. LAW E6 says superseded evidence stops counting and never
   disappears; eviction must not quietly complete the disappearance. */
{
  evidenceLog[C].push(envelope('e_corrected', { status: 'superseded', supersededBy: 'e_new' }));
  const kept = evidenceLog[C].filter(e => e.id !== 'e_corrected');
  evidenceLog[C] = kept;                                           // evict the superseded one
  const r = resolve(C, 'e_corrected');
  ok('6 · superseded evidence remains resolvable after eviction', !!(r && r.envelope));
  ok('6 · …and still carries what replaced it',
    !!(r && r.envelope && r.envelope.supersededBy === 'e_new'));
}

/* 7 — erasure is the ONLY thing that truly destroys. Retention obligations cut both ways: the
   record must survive volume, and must not survive a right-to-erasure request. A cold store
   that erasure cannot reach is a GDPR liability wearing a durability costume. */
{
  const erased = typeof S._eraseEvidence === 'function'
    ? (S._eraseEvidence(C, 'e_old'), resolve(C, 'e_old'))
    : null;
  ok('7 · erasure reaches cold evidence and makes it permanently unresolvable',
    !!erased && erased.unresolvable === true && /eras|delet/i.test(erased.reason || ''));
}

console.log(`\nevidence-durability-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
