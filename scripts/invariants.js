/* Truth layer — PRODUCT INVARIANTS. Not unit tests of one module; the laws the
   whole product must always obey, expressed as executable checks. Any agent's
   change that breaks a law here goes red. This file IS the spec of "what IntelliQ
   is allowed to say." Plain `node`, no DB/AI key. */

const baseline   = require('../ai/baseline');
const intel      = require('../ai/intelligence');
const primitives = require('../ai/primitives');
const agents     = require('../ai/agents');
const confidence = require('../ai/confidence');

const DAY = 86400000, now = Date.now(), ago = d => now - d * DAY;
let pass = 0, fail = 0;
const law = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ VIOLATED:', n); } };

// Build a representative spread of kernel output to scan.
const moods = (pairs) => pairs.map(([d, v]) => ({ t: ago(d), mood: v }));
const dip = moods([[35,8],[30,8],[25,8],[6,3],[2,3]]);
const dev = baseline.detectDeviation('mood', dip.map(p => ({ t: p.t, v: p.mood })), now);
const m = { id: 'x', name: 'X', now, moodSeries: dip, deviations: dev.concerning ? [dev] : [] };
const findings = [...intel.detectPatterns(m), ...primitives.structuralPatterns([
  { key: 'p', label: 'attendance', primitive: 'participation', valence: 'up-good', series: moods([[40,5],[35,5],[30,5],[5,1]]).map(p=>({t:p.t,v:p.mood})) },
], now)];
const item = intel.composeBriefingItem(m, findings, { momentum_drop: { action: 'A quiet word', positive: 3, total: 4 } });
const conns = agents.crossSignal([
  { key:'a', label:'x', series: moods([[40,5],[30,5],[10,2],[3,2]]).map(p=>({t:p.t,v:p.mood})) },
  { key:'b', label:'y', series: moods([[40,9],[30,9],[10,4],[3,4]]).map(p=>({t:p.t,v:p.mood})) },
], now);
const { system, user } = agents.coachReflectionPrompt({ name:'A', values:['x'], goals:['y'],
  fingerprint:{ mood:{label:'mood',normal:7} }, deviations:[{label:'cadence',direction:'below',deviationPct:-50}], trajectory:'down' });

const allText = JSON.stringify({ findings, item, conns });

// ── LAW 1 · Directional, never graded. No numeric verdict scores. ───────────
law('no graded scores (\\d+/100) in kernel output', !/\b\d{1,3}\/100\b/.test(allText));
law('no letter-grade verdicts', !/\bgrade [A-F]\b/i.test(allText));

// ── LAW 2 · Honest language — never "prediction"/deterministic claims. ──────
law('no "prediction"/"will quit"-style determinism', !/predict|will (quit|fail|drop out)|guaranteed/i.test(allText));

// ── LAW 3 · Correlation is not cause. ───────────────────────────────────────
law('cross-signal never asserts a cause', !/\bcaus|because|leads to|due to\b/i.test(JSON.stringify(conns)));

// ── LAW 4 · Never surface NaN/undefined to a human. ─────────────────────────
law('no NaN in any kernel output', !/\bNaN\b/.test(allText));
law('no "undefined" in any kernel output', !/\bundefined\b/.test(allText));

// ── LAW 5 · Self-relative — the Coach reflects vs the person's OWN normal. ──
law('coach reflection is self-relative', /their own normal/i.test(system + user));
law('coach reflection forbids scores', /no scores/i.test(system));

// ── LAW 6 · Confidence honesty — never claim reliability below the floor. ───
law('thin evidence → calibrating (no false reliability)', confidence.reliability({ useful: 1, dismiss: 0 }).tier === 'calibrating');
law('reliability requires the feedback floor', confidence.reliability({ useful: 2, dismiss: 1 }).score === null || confidence.reliability({ useful: 8, dismiss: 1 }).tier === 'reliable');

// ── LAW 7 · Privacy-by-construction — engine items carry no raw text fields. ─
law('briefing item has no raw text field', item && !('valueText' in item) && !('note' in item) && !('content' in item) && !('text' in item));
law('careFlag is a contentless boolean', item && typeof item.careFlag === 'boolean');

// ── LAW 8 · Fairness — a stable person is never flagged for being different. ─
const stable = [];
for (let d = 90; d >= 1; d -= 5) stable.push({ t: ago(d), v: 3 });
law('a stable-but-low person is not flagged', baseline.detectDeviation('mood', stable, now).unusual === false);

// ── LAW 9 · Universality — patterns are domain-free (fire on any stream). ───
const w = primitives.structuralPatterns([{ key:'p', label:'shift log-ins', primitive:'participation', valence:'up-good',
  series: [...Array(9)].map((_,i)=>({t:ago(45-i*5),v:5})).concat([{t:ago(4),v:1},{t:ago(1),v:1}]) }], now);
law('withdrawal fires on ANY participation stream (domain-free)', w.some(f => f.type === 'withdrawal'));

// ── LAW 10 · Person Model governance — Platform never sees the private model. ─
const personModel = require('../ai/person-model');
let pmM = personModel.blankModel();
['teammates','teammates','teammates'].forEach(() => personModel.update(pmM, { motivators:'teammates', communication:'gentle' }));
const pmPub = JSON.stringify(personModel.publicProjection(pmM));
law('publicProjection leaks no private token', !/teammates|gentle|progress|brief|direct/.test(pmPub));
law('publicProjection is contentless (hasModel/interactions only)',
    Object.keys(personModel.publicProjection(pmM)).sort().join(',') === 'hasModel,interactions');
law('Person Model stores no raw text (disclosure ignored)',
    Object.keys(personModel.update(personModel.blankModel(), { overwhelmers:'my mother passed away last week' }).overwhelmers).length === 0);

// ── LAW 11 · Reason is internal cognition — flagged internal, never graded. ──
const rj = agents.reason({ id:'z', name:'Z', now, moodSeries: dip, deviations: [] }, { model: pmM });
law('reason output is flagged internal (backstage)', rj.internal === true);
law('reason output carries no graded score', !/\b\d{1,3}\/100\b/.test(JSON.stringify(rj)));

console.log(`\ninvariants: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
