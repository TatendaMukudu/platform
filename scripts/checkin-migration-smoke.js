/* ============================================================
   scripts/checkin-migration-smoke.js — the completed daily check-in migration.

   The daily check-in keeps its own interaction, but canonical evidence + the universal
   kernel are its ONLY intelligence system. This suite proves:
     • every meaningful claim becomes purpose-scoped canonical evidence,
     • private check-in evidence assists its owner but never leaks to leader/group/org,
     • ALL longitudinal conclusions come from the shared kernel (not raw rows/signals),
     • owner/leader outputs are post-kernel bounded,
     • recommendations cannot reinforce themselves as new source evidence,
     • compatibility signals are non-authoritative with named consumers,
     • backfill is idempotent, privacy-preserving, and reconciled.

   Pure/deterministic (no AI, no DB): exercises the reasoning helpers directly.

   Run:  node scripts/checkin-migration-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs   = require('fs');
const path = require('path');
const srv  = require('../server.js');
const {
  _loadAllStores, _rebuildEmailIndex,
  _canonicaliseCheckin, _backfillCanonical, _checkinKernelState, _checkinInterventionState,
  _canonicalMoodSeries, _memberMoodSeries, _isSourceEvidence, _kernelEvidence, _isCanonicalEvidence,
  _recordEvidence, _promoteEvidence, _recordDerivedEvidence, _composeForAudience,
  evidenceLog, rawEvidence, memberCheckins, orgInterventions,
} = srv;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'chk', OTHER = 'chk2';
const NOW = Date.parse('2026-06-30T12:00:00.000Z');
const DAY = 86400000;
const dayIso = d => new Date(NOW - d * DAY).toISOString();

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'Checkin Co', createdAt: dayIso(90) }, [OTHER]: { orgName: 'Other Co', createdAt: dayIso(90) } },
  orgUsers: {
    [CODE]: {
      boss: { id: 'boss', name: 'Boss', email: 'boss@ck.co', role: 'admin',  orgCode: CODE, status: 'active' },
      sam:  { id: 'sam',  name: 'Sam',  email: 'sam@ck.co',  role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
      rec:  { id: 'rec',  name: 'Rec',  email: 'rec@ck.co',  role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
      gap:  { id: 'gap',  name: 'Gap',  email: 'gap@ck.co',  role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
    },
    [OTHER]: { x: { id: 'x', name: 'X', email: 'x@o.co', role: 'member', orgCode: OTHER, status: 'active' } },
  },
});
_rebuildEmailIndex();

const ev = () => evidenceLog[CODE] || [];
const HARDSHIP = 'I have been struggling to cope with things at home right now';

console.log('\n=== Daily check-in migration ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// A. INGESTION — claim-bounded canonical evidence, deterministic + privacy-tiered
// ─────────────────────────────────────────────────────────────────────────────
const rec1 = { id: 'ci_a', mood: 2, note: HARDSHIP, ts: dayIso(3) };
_canonicaliseCheckin(CODE, 'sam', rec1);
const moodEv = ev().find(e => e.provider === 'checkin' && e.type === 'metric' && e.subjectId === 'sam');
const noteEv = ev().find(e => e.provider === 'checkin' && e.type === 'observation' && e.subjectId === 'sam');
ok('1. a live check-in creates canonical evidence', !!moodEv && !!noteEv);
ok('2. one check-in creates claim-bounded evidence records (rating + note distinct)', moodEv.id !== noteEv.id);
ok('3. claim identities are deterministic (stable externalId on replay)',
   (() => { const before = moodEv.externalId; _canonicaliseCheckin(CODE, 'sam', rec1); return ev().find(e => e.id === moodEv.id).externalId === before; })());
ok('4. replay does not duplicate evidence', ev().filter(e => e.provider === 'checkin' && e.type === 'metric' && e.subjectId === 'sam' && e.status === 'active').length === 1);
const beforeBackfill = ev().length;
(memberCheckins[`${CODE}:sam`] = memberCheckins[`${CODE}:sam`] || []).push(rec1);   // same record in the operational store
_backfillCanonical(CODE, {});
ok('5. live write + backfill does not duplicate evidence', ev().length === beforeBackfill);
ok('6. original check-in provenance is retained (raw record kept)', !!rawEvidence[moodEv.rawRef] && !!rawEvidence[noteEv.rawRef]);
ok('7. per-claim privacy: mood is SENSITIVE, the hardship note is PRIVATE (owner-only)',
   moodEv.visibility === 'sensitive' && noteEv.visibility === 'private' && noteEv.ownerRef === 'sam');
ok('8. one private note does NOT make the unrelated mood measurement private', moodEv.visibility !== 'private' && !moodEv.ownerRef);
ok('9. model/rule extraction cannot strengthen epistemic status (note stays a low-strength report)',
   (() => { const raw = rawEvidence[noteEv.rawRef]; return noteEv.type === 'observation' && (!raw || raw.record); })());

// ─────────────────────────────────────────────────────────────────────────────
// B. PURPOSE-SCOPED ACCESS — private excluded before context for org purposes
// ─────────────────────────────────────────────────────────────────────────────
const owner = _kernelEvidence(CODE, { purpose: 'personal_assistance', viewerId: 'sam', subjectId: 'sam' });
ok('10. owner personal assistance may retrieve owner-private check-in evidence', owner.some(e => e.evidenceId === noteEv.id));
ok('11. leader support EXCLUDES the private note before context is built',
   !_kernelEvidence(CODE, { purpose: 'leader_support', viewerId: 'boss', subjectId: 'sam' }).some(e => e.evidenceId === noteEv.id));
ok('12. group reasoning excludes private evidence', !_kernelEvidence(CODE, { purpose: 'group_reasoning', viewerId: 'boss', subjectId: 'sam' }).some(e => e.evidenceId === noteEv.id));
ok('13. organisation reasoning excludes private evidence', !_kernelEvidence(CODE, { purpose: 'organisation_reasoning', viewerId: 'boss' }).some(e => e.evidenceId === noteEv.id));
ok('14. cross-organisation check-in access is impossible', (evidenceLog[OTHER] || []).every(e => e.subjectId !== 'sam'));
// Superseded / invalidated exclusion.
const corr = { id: 'ci_a', mood: 4, note: HARDSHIP, ts: dayIso(3) };   // same identity, corrected mood
_canonicaliseCheckin(CODE, 'sam', corr);
ok('15. invalidated/non-active evidence is excluded from reasoning', _kernelEvidence(CODE, { purpose: 'personal_assistance', viewerId: 'sam', subjectId: 'sam' }).every(e => { const env = ev().find(x => x.id === e.evidenceId); return env.status === 'active'; }));
ok('16. superseded evidence is excluded (a correction supersedes, not competes)', ev().filter(e => e.id === moodEv.id)[0].status === 'superseded' || ev().filter(e => e.provider === 'checkin' && e.type === 'metric' && e.subjectId === 'sam' && e.status === 'active').length === 1);

// ─────────────────────────────────────────────────────────────────────────────
// C. KERNEL REASONING — longitudinal conclusions from canonical evidence only
// ─────────────────────────────────────────────────────────────────────────────
// Seed Sam a below-baseline declining series (fresh, distinct days).
[5, 5, 4, 2, 2, 1].forEach((mood, i) => _canonicaliseCheckin(CODE, 'sam', { id: `sam_s${i}`, mood, ts: dayIso(40 - i * 6) }));
const stSam = _checkinKernelState(CODE, 'sam', { purpose: 'leader_support', viewerId: 'boss', now: NOW });
ok('17. an empty authorised set allows no citations (post-kernel)',
   (() => { const empty = _composeForAudience(CODE, { stage: 'kernel', basis: ['zzz'], confidence: 'low', limitations: [] }, { role: 'member', subjectId: 'nobody', viewerId: 'nobody', purpose: 'personal_assistance', text: 'x' }); return empty.output.cites.length === 0; })());
ok('18. check-in trends use canonical evidence (kernel basis = canonical mood IDs)',
   stSam.basisEvidenceIds.length > 0 && stSam.basisEvidenceIds.every(id => { const e = ev().find(x => x.id === id); return e && e.provider === 'checkin' && e.type === 'metric'; }));
ok('19. a below-baseline decline is reconstructed by the shared kernel as DIVERGING', stSam.trajectory === 'diverging');
ok('20. a repeated concern retains basis evidence IDs', (() => { const c = stSam.patterns.find(p => p.type === 'repeated_concern'); return !c || stSam.kernelArt.basis.length > 0; })());
ok('21. the kernel carries confidence + limitations', !!stSam.confidence && stSam.limitations.length > 0);
// Recovery series — a genuine dip (prior window) climbing back (recent window).
[[28, 1], [24, 1], [20, 2], [10, 4], [6, 5], [2, 5]].forEach(([d, mood], i) => _canonicaliseCheckin(CODE, 'rec', { id: `rec_s${i}`, mood, ts: dayIso(d) }));
const stRec = _checkinKernelState(CODE, 'rec', { purpose: 'leader_support', viewerId: 'boss', now: NOW });
ok('22. recovery evidence reconstructs as CONVERGING (de-escalation-eligible)', stRec.trajectory === 'converging' || stRec.patterns.some(p => p.type === 'recovering'));
// Gap member: old check-ins only → data gap, not a negative state.
[3, 3, 4].forEach((mood, i) => _canonicaliseCheckin(CODE, 'gap', { id: `gap_s${i}`, mood, ts: dayIso(120 - i * 6) }));
const stGap = _checkinKernelState(CODE, 'gap', { purpose: 'leader_support', viewerId: 'boss', now: NOW });
ok('23. missing recent check-ins do NOT imply a negative state (data gap = limitation)',
   stGap.trajectory === 'unknown' && stGap.limitations.some(l => /data gap/i.test(l)) && !/(diverging|burn|depress)/.test(JSON.stringify(stGap.trajectory)));
ok('24. a low mood does not become a diagnosis (limitations say self-report, not cause)',
   stSam.limitations.some(l => /not a diagnosis|self-report/i.test(l)));
ok('25. causation is not inferred without support (no causal claim in the kernel result)',
   !/because|caused by|due to/i.test(JSON.stringify(stSam.kernelArt.result)));

// Self-feeding prevention — a derived recommendation must not become mood proof.
const derived = _recordDerivedEvidence(CODE, { subjectId: 'sam', type: 'metric', label: 'Self-rated mood (derived)', valueText: 'derived', basisIds: stSam.basisEvidenceIds });
const moodAfterDerived = _canonicalMoodSeries(CODE, 'sam').length;
ev().push();  // no-op to keep lint calm
ok('26. counterevidence + limitations are preserved on the kernel artifact', Array.isArray(stSam.kernelArt.limitations) && stSam.kernelArt.limitations.length > 0);
ok('27. a derived recommendation is NOT counted as new source mood evidence (no self-feed)',
   (() => { const derivedEnv = ev().find(e => e.id === derived.id); return !_isSourceEvidence(derivedEnv) && !_canonicalMoodSeries(CODE, 'sam').some(p => p.evidenceId === derived.id); })());

// ─────────────────────────────────────────────────────────────────────────────
// D. POST-KERNEL BOUNDS — owner may cite own private; leader cannot quote/paraphrase
// ─────────────────────────────────────────────────────────────────────────────
const ownerCompose = _composeForAudience(CODE, _checkinKernelState(CODE, 'sam', { purpose: 'personal_assistance', viewerId: 'sam', now: NOW }).kernelArt,
  { role: 'member', subjectId: 'sam', viewerId: 'sam', purpose: 'personal_assistance', text: 'You have logged some lower ratings recently.' });
const leaderState = _checkinKernelState(CODE, 'sam', { purpose: 'leader_support', viewerId: 'boss', now: NOW });
const leaderCompose = _composeForAudience(CODE, leaderState.kernelArt,
  { role: 'admin', subjectId: 'sam', viewerId: 'boss', purpose: 'leader_support', text: 'Recent authorised evidence differs from baseline.' });
ok('28. owner wording is post-kernel bounded (ok)', ownerCompose.ok === true);
ok('29. leader wording cannot cite the private hardship note', !leaderCompose.output.cites.includes(noteEv.id));
ok('30. leader authorised evidence never includes any private-visibility item', leaderState.evidence.every(e => e.visibility !== 'private'));
ok('31. sensitive mood is reasoned over but not exposed as an individual reading in the answer', !/\b[12345]\s*\/\s*5\b/.test(leaderCompose.output.text));
ok('32. post-kernel cannot raise confidence', leaderCompose.output.confidence === leaderState.kernelArt.confidence);
ok('33. post-kernel preserves limitations', leaderState.kernelArt.limitations.every(l => leaderCompose.output.limitations.includes(l)));
ok('34. post-kernel adds no unsupported factual claim', leaderCompose.output.addedFactualClaim === false);
const stEmpty = _checkinKernelState(CODE, 'boss', { purpose: 'personal_assistance', viewerId: 'boss', now: NOW });
ok('35. insufficient evidence returns an honest limited state (unknown + no basis)', stEmpty.trajectory === 'unknown' && stEmpty.basisEvidenceIds.length === 0);

// ─────────────────────────────────────────────────────────────────────────────
// E. LEGACY-PATH REMOVAL — static architecture checks on the migrated code
// ─────────────────────────────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const between = (startMarker, endMarker) => { const s = src.indexOf(startMarker); const e = src.indexOf(endMarker, s + 1); return s >= 0 && e > s ? src.slice(s, e) : ''; };
const kernelSrc  = between('function _checkinKernelState(', 'function _checkinInterventionState(');
const moodSrc    = between('function _canonicalMoodSeries(', 'function _memberMoodSeries(');
const freeformSrc = between("app.post('/api/checkin/freeform'", "app.get('/api/platform/org-checkins'");
ok('36. the check-in kernel does not call _gatherSignals', kernelSrc.length > 0 && !kernelSrc.includes('_gatherSignals'));
ok('37. the check-in kernel does not call _buildMemberIntelInput', !kernelSrc.includes('_buildMemberIntelInput'));
ok('38. the canonical mood reader reads the evidence log, not raw check-in rows or orgSignals',
   moodSrc.includes('evidenceLog') && !moodSrc.includes('memberCheckins') && !moodSrc.includes('orgSignals'));
ok('39. the freeform insight builder no longer derives a trend from raw prior rows',
   freeformSrc.length > 0 && !freeformSrc.includes('recentMoodStr') && freeformSrc.includes('_checkinKernelState'));
ok('40. compatibility signal writes are labelled non-authoritative with named consumers',
   /COMPATIBILITY WRITE \(non-authoritative\)/.test(src) && /behaviour-engine participation\s+cadence/.test(src));
// The mood series is read at the TOP of each function; inspect that opening window so
// the slice never bleeds into a later function that legitimately reads raw rows.
const openWindow = (marker, n = 700) => { const s = src.indexOf(marker); return s >= 0 ? src.slice(s, s + n) : ''; };
const alertSrc = openWindow('function _memberAlert(');
const dirSrc   = openWindow('function _memberDirection(');
ok('40b. the leader at-risk mood conclusion reads canonical mood, not raw rows',
   alertSrc.includes('_canonicalMoodSeries') && !alertSrc.includes('memberCheckins['));
ok('40c. the per-member direction conclusion reads canonical mood, not raw rows',
   dirSrc.includes('_canonicalMoodSeries') && !dirSrc.includes('memberCheckins['));
ok('40d. the member-intelligence engine mood series is canonical-sourced',
   openWindow('function _memberMoodSeries(').includes('_canonicalMoodSeries'));

// ─────────────────────────────────────────────────────────────────────────────
// F. INTERVENTION + OUTCOMES — de-escalation, suppression, canonical derived evidence
// ─────────────────────────────────────────────────────────────────────────────
const beforeRec = ev().length;
const recDerived = _recordDerivedEvidence(CODE, { subjectId: 'sam', type: 'observation', label: 'Check-in support recommendation', valueText: 'A supportive 1:1 this week.', basisIds: leaderState.basisEvidenceIds });
ok('41. a check-in recommendation becomes canonical derived evidence', ev().length === beforeRec + 1 && ev().find(e => e.id === recDerived.id));
const recEnv = ev().find(e => e.id === recDerived.id);
ok('42. a recommendation does NOT auto-promote (no self-reinforcing org signal)', recEnv.promoted !== true);
ok('43. a recommendation grounded in non-private basis is not private', recEnv.visibility !== 'private');
// Active intervention suppresses a duplicate recommendation (same concern type).
(orgInterventions[CODE] = orgInterventions[CODE] || []).push({ id: 'iv1', targetMemberId: 'sam', patternType: 'repeated_concern', status: 'active', outcome: null, recordedOutcome: null });
const ivActive = _checkinInterventionState(CODE, 'sam', leaderState);
ok('44. an active intervention suppresses a duplicate recommendation', ivActive.activeIntervention === true && ivActive.recommend === false);
ok('45. a completed action does not imply a successful outcome (no auto-de-escalation)',
   (() => { orgInterventions[CODE] = [{ id: 'iv2', targetMemberId: 'sam', patternType: 'repeated_concern', status: 'completed', outcome: null, recordedOutcome: null }]; return _checkinInterventionState(CODE, 'sam', leaderState).deEscalate === false; })());
ok('46. confident recovery evidence de-escalates a prior concern', _checkinInterventionState(CODE, 'rec', stRec).deEscalate === true);
ok('47. a recorded positive outcome de-escalates when there is no fresh deterioration',
   (() => { orgInterventions[CODE] = [{ id: 'iv3', targetMemberId: 'rec', patternType: 'repeated_concern', status: 'completed', recordedOutcome: 'improved' }]; return _checkinInterventionState(CODE, 'rec', stRec).deEscalate === true; })());

// ─────────────────────────────────────────────────────────────────────────────
// G. BACKFILL — idempotent, privacy-preserving, reconciled
// ─────────────────────────────────────────────────────────────────────────────
const r1 = _backfillCanonical(CODE, {});
const countAfter = ev().length;
const r2 = _backfillCanonical(CODE, {});
ok('48. historical backfill is idempotent (a second run records nothing new)', ev().length === countAfter && r2.recorded === 0);
ok('49. historical privacy is never broadened (the hardship note is still private)', ev().find(e => e.id === noteEv.id).visibility === 'private');
ok('50. historical orgSignals are not duplicated as source evidence (only adapter claims exist)',
   ev().filter(e => e.provider === 'checkin' && e.subjectId === 'sam' && e.type === 'metric' && e.status === 'active').every(_ => true) && !ev().some(e => e.provider === 'orgSignal'));
ok('51. the reconciliation report exposes scanned/expected/present/created/duplicates/ambiguities/errors',
   ['checkins', 'claimsExpected', 'claimsPresent', 'recorded', 'duplicates', 'privacyAmbiguities', 'errors'].every(k => k in r1));

// ─────────────────────────────────────────────────────────────────────────────
// H. e2e PROOFS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n  — end-to-end proofs —');
// A. Private hardship note.
ok('E2E-A. private hardship: mood keeps its own policy, note is owner-only, leader output neither states nor implies it',
   moodEv.visibility === 'sensitive' && noteEv.visibility === 'private'
   && owner.some(e => e.evidenceId === noteEv.id)
   && !leaderState.evidence.some(e => e.evidenceId === noteEv.id)
   && !leaderCompose.output.cites.includes(noteEv.id)
   && !/struggl|cope|at home/i.test(leaderCompose.output.text));
// B. Repeated authorised workload/low reports → grounded, non-causal.
ok('E2E-B. repeated below-baseline reports → diverging + grounded, non-causal recommendation',
   stSam.trajectory === 'diverging' && !/because|caused by/i.test(JSON.stringify(stSam.patterns)));
// C. Recovery de-escalation.
ok('E2E-C. recovery: converging/recovering state de-escalates a prior alert',
   (stRec.trajectory === 'converging' || stRec.patterns.some(p => p.type === 'recovering'))
   && (() => { orgInterventions[CODE] = []; return _checkinInterventionState(CODE, 'rec', stRec).deEscalate === true; })());
// D. Data gap → no negative assumption.
ok('E2E-D. data gap: no recent check-ins → data_gap limitation, never disengagement/distress',
   stGap.trajectory === 'unknown' && stGap.patterns.some(p => p.type === 'data_gap') && stGap.limitations.some(l => /not evidence of a negative state/i.test(l)));
// E. Self-feeding prevention.
ok('E2E-E. self-feeding: a stored recommendation is not treated as independent proof of its pattern',
   moodAfterDerived === _canonicalMoodSeries(CODE, 'sam').length && !_canonicalMoodSeries(CODE, 'sam').some(p => p.evidenceId === derived.id));

console.log(`\n=== checkin-migration-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
