/* Truth layer — the SELF-MODEL (pure): the reasoner pointed at its operator. Proves it only
   learns an allow-listed set (surveillance can't get in); confidence is DISTINCT DAYS (a
   habit, not a one-off); an established habit becomes a proposal-gated accommodation;
   accepting applies it and stops proposing; "not now" stands it down briefly; "that's not a
   thing I do" stands it down for a long time; it goes dormant when the habit stops; and the
   person can see everything it believes. No DB / AI / IO. Run: node scripts/self-model-smoke.js */

const M = require('../ai/self-model.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const DAY = 86400000;
const now = Date.parse('2026-07-28T08:00:00Z');
const d = n => now - n * DAY;
const byId = (arr, id) => arr.find(x => x.habitId === id || x.id === id);

/* ── 1 · only allow-listed patterns are learned (surveillance is ignored) ── */
const h1 = M.learn({ now, events: [
  { pattern: 'keystroke_timing', label: 'x', t: d(1) },   // NOT on the allow-list
  { pattern: 'opens_view', label: "Marcus's graph", t: d(5) },
] });
ok('1 · an off-allow-list pattern forms no habit', !byId(h1, 'keystroke_timing:x'));
ok('1 · an allow-listed pattern does', !!byId(h1, "opens_view:Marcus's graph"));

/* ── 2 · confidence is DISTINCT DAYS — same day twice is still one ── */
const same = M.learn({ now, events: [
  { pattern: 'own_work_first', t: d(2) }, { pattern: 'own_work_first', t: d(2) + 3600000 },
] });
ok('2 · two events on the same day count as one', byId(same, 'own_work_first:').dayCount === 1 && byId(same, 'own_work_first:').confidence === 'tentative');

/* ── 3 · a habit across ≥3 distinct days becomes an established, proposable accommodation ── */
const habit = M.learn({ now, events: [
  { pattern: 'opens_view', label: "Marcus's graph", t: d(4) },
  { pattern: 'opens_view', label: "Marcus's graph", t: d(2) },
  { pattern: 'opens_view', label: "Marcus's graph", t: d(1) },
] });
const props = M.proposals(habit, now);
const p = byId(props, "opens_view:Marcus's graph");
ok('3 · three distinct days makes it emerging', byId(habit, "opens_view:Marcus's graph").confidence === 'emerging');
ok('3 · …and it surfaces as a proposal-gated accommodation naming the habit', p && p.requiresConfirmation === true && /Marcus's graph/.test(p.text) && p.setting === 'pin_view');

/* ── 4 · a one-off (single day) is NOT proposed (never jumps to a conclusion) ── */
const oneOff = M.learn({ now, events: [{ pattern: 'readiness_first', t: d(1) }] });
ok('4 · a single-day pattern is held back (tentative → no proposal)', M.proposals(oneOff, now).length === 0);

/* ── 5 · accept applies it and stops proposing ── */
M.applyFeedback(habit, "opens_view:Marcus's graph", 'accept', now);
const afterAccept = M.learn({ priorHabits: habit, now, events: [] });
ok('5 · accepting marks it accepted and it is no longer proposed', byId(afterAccept, "opens_view:Marcus's graph").status === 'accepted' && M.proposals(afterAccept, now).length === 0);

/* ── 6 · dismiss stands it down briefly; reject stands it down for a long time ── */
const h6 = M.learn({ now, events: [
  { pattern: 'own_assessment_first', t: d(5) }, { pattern: 'own_assessment_first', t: d(3) }, { pattern: 'own_assessment_first', t: d(1) },
] });
ok('6 · precondition: it is proposed before feedback', M.proposals(h6, now).some(x => x.habitId === 'own_assessment_first:'));
M.applyFeedback(h6, 'own_assessment_first:', 'dismiss', now);
ok('6 · "not now" suppresses it (no nag)', M.proposals(M.learn({ priorHabits: h6, now }), now).length === 0);
const rej = M.applyFeedback(h6, 'own_assessment_first:', 'reject', now);
ok('6 · "that\'s not a thing I do" stands it down far longer than a dismissal', rej.suppressUntil - now > M.DISMISS && rej.rejected === true);
ok('6 · an unknown response is rejected', M.applyFeedback(h6, 'own_assessment_first:', 'lol', now) === null);

/* ── 7 · a habit that stops recurring goes dormant ── */
const stale = M.learn({ now, events: [
  { pattern: 'readiness_first', t: d(40) }, { pattern: 'readiness_first', t: d(38) }, { pattern: 'readiness_first', t: d(36) },
] });
ok('7 · no activity for over a month → dormant, not proposed', byId(stale, 'readiness_first:').status === 'dormant' && M.proposals(stale, now).length === 0);

/* ── 8 · full transparency — the person can see everything it believes ── */
const view = M.selfView(habit);
ok('8 · selfView lists what it has learned (pattern, confidence, how many days)', view.length && view[0].confidence && typeof view[0].seenOnDays === 'number');

/* ── 9 · an accepted accommodation becomes a LIVE setting (the read-back that makes it apply) ── */
// `habit` had opens_view accepted in step 5 — activeSettings must now expose it as pin_view.
const live = M.activeSettings(habit, now);
ok('9 · an accepted habit surfaces as a live setting (pin_view = its label)', live.pin_view === "Marcus's graph");
ok('9 · …and it reports which habit produced the setting (transparency)', live._applied.some(a => a.setting === 'pin_view' && a.habitId === "opens_view:Marcus's graph"));

/* an UNACCEPTED (merely emerging) habit is NOT a live setting — nothing applies until you say yes */
const emergingOnly = M.learn({ now, events: [
  { pattern: 'own_work_first', t: d(5) }, { pattern: 'own_work_first', t: d(3) }, { pattern: 'own_work_first', t: d(1) },
] });
ok('9 · an established-but-unaccepted habit applies NOTHING (proposal-gated)', !M.activeSettings(emergingOnly, now).self_first);

/* a REJECTED habit never applies, even though it was once seen */
M.applyFeedback(emergingOnly, 'own_work_first:', 'accept', now);
ok('9 · once accepted, it does apply', M.activeSettings(emergingOnly, now).self_first === true);
M.applyFeedback(emergingOnly, 'own_work_first:', 'reject', now);
ok('9 · a rejected accommodation stops applying', !M.activeSettings(emergingOnly, now).self_first);

/* an accepted-but-abandoned (dormant) habit stops applying — accommodations track reality */
const acceptedThenStale = M.learn({ now, events: [
  { pattern: 'readiness_first', t: d(50) }, { pattern: 'readiness_first', t: d(48) }, { pattern: 'readiness_first', t: d(46) },
] });
M.applyFeedback(acceptedThenStale, 'readiness_first:', 'accept', now);
ok('9 · an accepted habit gone dormant stops applying (tracks reality)', !M.activeSettings(acceptedThenStale, now).readiness_first);

console.log(`\nself-model-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
