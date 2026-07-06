/* Smoke test for ai/intelligence.js — runs with plain `node`, no DB/AI key.
   Verifies: (1) each of the 5 detectors fires on a matching synthetic series and
   stays quiet otherwise; (2) briefing items never contain raw text / private
   content (privacy-by-construction check). */

const intel = require('../ai/intelligence');
const DAY = 86400000;
const now = Date.now();
const ago = d => now - d * DAY;

let pass = 0, fail = 0;
const ok  = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

// ── momentum_drop: was ~4, now ~2 ───────────────────────────────────────────
const drop = intel.detectPatterns({ now, id: 'a', name: 'A',
  moodSeries: [
    { t: ago(35), mood: 4 }, { t: ago(30), mood: 4 }, { t: ago(25), mood: 4 },
    { t: ago(6), mood: 2 },  { t: ago(2), mood: 2 },
  ] });
ok('momentum_drop fires', drop.some(f => f.type === 'momentum_drop'));

// steady mood → no drop
const steady = intel.detectPatterns({ now, id: 'b', name: 'B',
  moodSeries: [{ t: ago(30), mood: 4 }, { t: ago(20), mood: 4 }, { t: ago(5), mood: 4 }, { t: ago(1), mood: 4 }] });
ok('steady mood → no momentum_drop', !steady.some(f => f.type === 'momentum_drop'));

// ── quiet_improvement: rising, now good, low visibility ─────────────────────
const quiet = intel.detectPatterns({ now, id: 'c', name: 'C',
  moodSeries: [{ t: ago(38), mood: 3 }, { t: ago(30), mood: 3 }, { t: ago(15), mood: 4 }, { t: ago(3), mood: 4 }],
  signalSeries: [] });
ok('quiet_improvement fires', quiet.some(f => f.type === 'quiet_improvement'));

// ── repeated_concern: 4 concern signals ─────────────────────────────────────
const concern = intel.detectPatterns({ now, id: 'd', name: 'D',
  concernSeries: [{ t: ago(30) }, { t: ago(20) }, { t: ago(10) }, { t: ago(3) }] });
ok('repeated_concern fires', concern.some(f => f.type === 'repeated_concern'));
ok('single concern → no pattern',
  !intel.detectPatterns({ now, id: 'd2', name: 'D2', concernSeries: [{ t: ago(3) }] }).some(f => f.type === 'repeated_concern'));

// ── member_team_divergence: member down, team up ────────────────────────────
const diverge = intel.detectPatterns({ now, id: 'e', name: 'E', memberTrajectory: 'down', teamTrajectory: 'up' });
ok('member_team_divergence fires', diverge.some(f => f.type === 'member_team_divergence'));
ok('member & team both up → no divergence',
  !intel.detectPatterns({ now, id: 'e2', name: 'E2', memberTrajectory: 'up', teamTrajectory: 'up' }).some(f => f.type === 'member_team_divergence'));

// ── invisible_load: helping others + strained mood ──────────────────────────
const load = intel.detectPatterns({ now, id: 'f', name: 'F',
  helpingSeries: [{ t: ago(30) }, { t: ago(20) }, { t: ago(12) }, { t: ago(5) }],
  moodSeries: [{ t: ago(20), mood: 3 }, { t: ago(5), mood: 2.5 }] });
ok('invisible_load fires', load.some(f => f.type === 'invisible_load'));

// ── honest language: no "prediction" anywhere ───────────────────────────────
const allBasis = [...drop, ...quiet, ...concern, ...diverge, ...load].map(f => f.basis).join(' ').toLowerCase();
ok('no "prediction" language', !/predict/.test(allBasis));

// ── PRIVACY: a composed item must never carry raw text fields ────────────────
const item = intel.composeBriefingItem(
  { id: 'g', name: 'G', now, hasSensitiveContext: true,
    moodSeries: [{ t: ago(35), mood: 4 }, { t: ago(30), mood: 4 }, { t: ago(4), mood: 2 }, { t: ago(1), mood: 2 }] },
  intel.detectPatterns({ now, id: 'g', name: 'G',
    moodSeries: [{ t: ago(35), mood: 4 }, { t: ago(30), mood: 4 }, { t: ago(4), mood: 2 }, { t: ago(1), mood: 2 }] }),
  { momentum_drop: { action: 'A quiet word', positive: 3, total: 4 } });
ok('composed item has no valueText/note/content fields',
  item && !('valueText' in item) && !('note' in item) && !('content' in item) && !('text' in item));
ok('careFlag is a boolean, no detail', item && typeof item.careFlag === 'boolean');
ok('learning surfaces as an honest note', item && /quiet word/i.test(item.learnedNote || ''));
ok('care-first default recommended action stands', item && /listen first/i.test(item.recommendedAction));

// ── baseline_shift: fires from Behaviour-Engine deviations (compare to self) ──
const shift = intel.detectPatterns({ now, id: 'h', name: 'H',
  deviations: [{ label: 'contribution', direction: 'below', deviationPct: -65, recent: 1, normal: 4, confidence: 'clear', dimension: 'contribution' }] });
ok('baseline_shift fires from deviations', shift.some(f => f.type === 'baseline_shift'));
ok('no deviations → no baseline_shift',
  !intel.detectPatterns({ now, id: 'h2', name: 'H2', deviations: [] }).some(f => f.type === 'baseline_shift'));

console.log(`\nintelligence-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
