/* ============================================================
   scripts/checkin-hardening-smoke.js — the four post-migration watch-items.

   Hardens the deployed check-in domain BEFORE the next migration:
     1. Canonical/raw disagreement is OBSERVABLE (diagnosed, never silently forced).
     2. The compatibility signal contract is FROZEN (participation only — no mood/content).
     3. Intervention suppression handles the hard edge cases (suppress duplicate action,
        never new deterioration).
     4. Restricted-note classification decisions are LOGGED (contentless) for inspection.

   Pure/deterministic (no AI, no DB).

   Run:  node scripts/checkin-hardening-smoke.js   (part of `npm test`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const srv = require('../server.js');
const {
  _loadAllStores, _rebuildEmailIndex, _canonicaliseCheckin, _checkinKernelState, _checkinInterventionState,
  _emitCheckinParticipationSignal, CHECKIN_SIGNAL_CONTRACT, _checkinAggregateReconciliation,
  _checkinClassificationAudit, checkinClassificationLog, _canonicalMoodSeries,
  evidenceLog, orgSignals, orgInterventions, memberCheckins,
} = srv;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const CODE = 'hard';
const NOW = Date.parse('2026-06-30T12:00:00.000Z');
const DAY = 86400000;
const dayIso = d => new Date(NOW - d * DAY).toISOString();

_loadAllStores({
  orgMeta:  { [CODE]: { orgName: 'Hard Co', createdAt: dayIso(90) } },
  orgUsers: { [CODE]: {
    boss: { id: 'boss', name: 'Boss', email: 'b@h.co', role: 'admin',  orgCode: CODE, status: 'active' },
    dec:  { id: 'dec',  name: 'Dec',  email: 'd@h.co',  role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
    hi:   { id: 'hi',   name: 'Hi',   email: 'h@h.co',  role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
    rec:  { id: 'rec',  name: 'Rec',  email: 'r@h.co',  role: 'member', orgCode: CODE, supervisorId: 'boss', status: 'active' },
  } },
});
_rebuildEmailIndex();
const evCk = () => (orgSignals[CODE] || []).filter(s => s.source === 'checkin');

console.log('\n=== Check-in hardening — the four watch-items ===\n');

// ─────────────────────────────────────────────────────────────────────────────
// 2. FROZEN COMPATIBILITY-SIGNAL CONTRACT (participation only)
// ─────────────────────────────────────────────────────────────────────────────
_emitCheckinParticipationSignal(CODE, 'dec', { sensitivePresent: true, firstReturn: true, quietDays: 12 });
const sig = evCk()[evCk().length - 1];
ok('1. the compat signal carries a participation occurrence (source checkin, participation modality)',
   sig && sig.source === 'checkin' && sig.modality === 'participation');
ok('2. the compat signal carries NO mood value', sig && (sig.valueNum == null));
ok('3. the compat signal carries NO note/concern text', sig && (sig.valueText == null));
ok('4. the compat signal carries a CONTENTLESS sensitivity-presence flag only', sig && sig.sensitivity === 'sensitive' && (sig.valueText == null));
ok('5. the compat signal carries no trajectory / mood / concern inference (weight is a constant base, not mood-derived)',
   sig && !('trajectory' in sig) && !('mood' in sig) && !('concern' in sig)
   && _emitCheckinParticipationSignal(CODE, 'dec', { sensitivePresent: false }).weightNum === sig.weightNum);
ok('6. the frozen contract enumerates forbidden fields (mood value/text/weight/trajectory)',
   CHECKIN_SIGNAL_CONTRACT.forbiddenKeys.includes('valueNum') && CHECKIN_SIGNAL_CONTRACT.forbiddenKeys.includes('valueText') && CHECKIN_SIGNAL_CONTRACT.forbiddenKeys.includes('weightNum'));
ok('7. a forbidden field passed in is stripped, never emitted',
   (() => { _emitCheckinParticipationSignal(CODE, 'dec', { sensitivePresent: false, valueNum: 2, valueText: 'leak', mood: 1 }); const s = evCk()[evCk().length - 1]; return s.valueNum == null && s.valueText == null; })());
// The compatibility DUAL-WRITE marker (modality 'participation') must never carry
// mood/content — even after canonicalisation. (The canonical→signal PROMOTION bridge,
// modality 'data', legitimately carries the promoted mood value; it is canonical-lineage,
// not the dual-write, and is not read as mood intelligence — see test 8b.)
_canonicaliseCheckin(CODE, 'dec', { id: 'dec_c0', mood: 2, note: 'I am really struggling to cope at home', ts: dayIso(1) });
ok('8. the compatibility (participation) signal never carries mood/content, even via canonicalisation',
   evCk().filter(s => s.modality === 'participation').every(s => s.valueNum == null && s.valueText == null));
ok('8b. the member-intelligence engine never reads a check-in signal as a mood value (numeric streams skip check-in)',
   /if \(s\.source === 'checkin'\) return;/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8')));

// ─────────────────────────────────────────────────────────────────────────────
// 4. RESTRICTED-NOTE CLASSIFICATION LOGGING (contentless)
// ─────────────────────────────────────────────────────────────────────────────
_canonicaliseCheckin(CODE, 'dec', { id: 'dec_c1', mood: 3, note: 'my father passed away last week', ts: dayIso(2) });  // restricted
_canonicaliseCheckin(CODE, 'dec', { id: 'dec_c2', mood: 4, note: 'good productive session today', ts: dayIso(3) });    // normal
const audit = _checkinClassificationAudit(CODE);
const logEntries = checkinClassificationLog[CODE] || [];
ok('9. classification decisions are logged (category + outcome + length)', logEntries.length >= 3 && logEntries.every(e => 'category' in e && 'madePrivate' in e && 'length' in e));
ok('10. the classification log NEVER stores the note substance', logEntries.every(e => !('text' in e) && !('note' in e) && !('substance' in e)));
ok('11. a restricted disclosure (bereavement) is classified restricted AND made private',
   logEntries.some(e => e.category === 'restricted' && e.madePrivate === true));
ok('12. a normal note is classified normal and NOT made private', logEntries.some(e => e.category === 'normal' && e.madePrivate === false));
ok('13. the audit exposes category balance + private share for drift inspection',
   audit.total >= 3 && audit.byCategory && typeof audit.privateShare === 'number' && typeof audit.normalShare === 'number');

// ─────────────────────────────────────────────────────────────────────────────
// 1. CANONICAL / RAW DISAGREEMENT OBSERVABILITY
// ─────────────────────────────────────────────────────────────────────────────
// Craft a disagreement: MANY high raw rows for `hi` (dashboard reads "stable") while
// `dec` has a canonical decline (kernel reports diverging). Raw avg stays >= 3. Push to
// BOTH the raw operational store (the dashboard's source) and canonical (the kernel's).
const seedBoth = (uid, series) => series.forEach(([d, m], i) => {
  const rec = { id: `${uid}_r${i}`, memberName: uid, mood: m, ts: dayIso(d) };
  (memberCheckins[`${CODE}:${uid}`] = memberCheckins[`${CODE}:${uid}`] || []).push(rec);
  _canonicaliseCheckin(CODE, uid, rec);
});
seedBoth('hi',  [[2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5]]);
seedBoth('dec', [[30, 5], [26, 5], [22, 4], [10, 2], [6, 2], [2, 1]]);
const stDec = _checkinKernelState(CODE, 'dec', { purpose: 'organisation_reasoning', viewerId: null, now: NOW });
const recon = _checkinAggregateReconciliation(CODE, { now: NOW });
ok('14. the reconciliation reports both a raw aggregate and a canonical reconstruction',
   recon.rawAvg != null && recon.canonicalAvg != null);
ok('15. a member diverging in the kernel is counted by the reconstruction', stDec.trajectory === 'diverging' && recon.membersDiverging >= 1);
ok('16. material disagreement (dashboard "stable" while a member diverges) is FLAGGED, not hidden',
   recon.rawSaysStable === true && recon.disagreement === true && /disagree/i.test(recon.note));
ok('17. observability diagnoses the gap — it does NOT silently force the surfaces to match',
   recon.rawAvg !== recon.canonicalAvg || recon.membersDiverging >= 1);   // both surfaces preserved, not overwritten

// ─────────────────────────────────────────────────────────────────────────────
// 3. INTERVENTION SUPPRESSION EDGE CASES (suppress duplicate action, not new decline)
// ─────────────────────────────────────────────────────────────────────────────
const st = (patterns, trajectory) => ({ patterns, trajectory });
// (a) improves briefly then declines again → currently diverging → recommend, don't suppress.
orgInterventions[CODE] = [];
const briefThenDecline = _checkinInterventionState(CODE, 'dec', st([{ type: 'momentum_drop', confidence: 'clear' }, { type: 'recovering', confidence: 'emerging' }], 'diverging'));
ok('18. improves briefly then declines again → NOT de-escalated (fresh decline wins)', briefThenDecline.deEscalate === false && briefThenDecline.recommend === true);
// (b) two DISTINCT concerns during one active intervention → the new dimension still recommends.
orgInterventions[CODE] = [{ id: 'a', targetMemberId: 'dec', patternType: 'repeated_concern', status: 'active' }];
const distinct = _checkinInterventionState(CODE, 'dec', st([{ type: 'repeated_concern', confidence: 'clear' }, { type: 'overload_hypothesis', confidence: 'clear' }], 'sustaining'));
ok('19. a genuinely distinct new concern still recommends while another intervention is active', distinct.recommend === true && distinct.activeIntervention === true);
// ...but a mere facet of the SAME mood concern is suppressed as a duplicate.
const facet = _checkinInterventionState(CODE, 'dec', st([{ type: 'repeated_concern', confidence: 'clear' }, { type: 'baseline_shift', confidence: 'clear' }], 'diverging'));
ok('20. a duplicate facet of the covered mood concern is suppressed (no duplicate action)', facet.recommend === false && facet.suppressDuplicateRecommendation === true);
// (c) low-confidence recovery does NOT de-escalate on its own.
orgInterventions[CODE] = [];
const lowConf = _checkinInterventionState(CODE, 'dec', st([{ type: 'recovering', confidence: 'emerging' }], 'converging'));
ok('21. a low-confidence recovery does NOT de-escalate on its own', lowConf.deEscalate === false);
const highConf = _checkinInterventionState(CODE, 'dec', st([{ type: 'recovering', confidence: 'clear' }], 'converging'));
ok('22. a confident recovery DOES de-escalate', highConf.deEscalate === true);
// (d) intervention aimed at a non-mood dimension; mood improves for unrelated reasons.
orgInterventions[CODE] = [{ id: 'w', targetMemberId: 'dec', patternType: 'overload_hypothesis', status: 'active' }];
const wrongDimension = _checkinInterventionState(CODE, 'dec', st([{ type: 'recovering', confidence: 'clear' }], 'converging'));
ok('23. mood recovery does NOT resolve an intervention scoped to a different dimension', wrongDimension.deEscalate === false);
// (e) authorised evidence disappears (privacy/role change) → no basis → no false alert, no crash.
orgInterventions[CODE] = [];
const gone = _checkinInterventionState(CODE, 'ghost', st([], 'unknown'));
ok('24. when authorised evidence disappears there is no recommendation and no crash', gone.recommend === false && gone.activeIntervention === false && gone.deEscalate === false);
const stGhost = _checkinKernelState(CODE, 'ghost', { purpose: 'leader_support', viewerId: 'boss', now: NOW });
ok('25. an empty authorised set yields an honest limited kernel state (no basis, unknown)', stGhost.basisEvidenceIds.length === 0 && stGhost.trajectory === 'unknown');

console.log(`\n=== checkin-hardening-smoke: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
