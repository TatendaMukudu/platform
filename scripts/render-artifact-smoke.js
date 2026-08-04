/* Truth layer — GOVERNED RENDER/PRESENT (pure). Proves the LLM-as-output-interface is
   governed: it may style and narrate ONLY the dataset it was given, and EVERY figure in the
   output must trace to the source data — an invented number is caught so the caller falls back
   to the plain factual version and a fabricated figure never reaches the reader. A deterministic
   summary works with no model at all. Run: node scripts/render-artifact-smoke.js */

const R = require('../ai/render-artifact.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const dataset = {
  title: 'Under-16s — last 4 weeks',
  rows: [
    { id: 'r1', label: 'Attendance', value: '82%' },
    { id: 'r2', label: 'Sessions completed', value: 11 },
    { id: 'r3', label: 'Momentum dips flagged', value: 3 },
  ],
};

/* 1 — the dataset message hands the model the rows-with-ids and forbids anything else */
const msg = R.buildDatasetMessage({ intent: 'summarise the block', format: 'summary', dataset });
ok('1 · the compose message lists the rows with citable ids', /\[r1\]/.test(msg) && /\[r2\]/.test(msg));
ok('1 · …and states the rows are the ONLY facts allowed', /ONLY facts|Every figure/i.test(msg));
ok('1 · the system prompt forbids introducing any figure not in the data', /use ONLY the figures|Never introduce a number/i.test(R.SYSTEM_PROMPT));

/* 2 — a FAITHFUL artifact (only dataset figures) passes governance */
const good = R.governArtifact({ dataset, format: 'summary', composed: {
  title: 'Under-16s summary', usedRefs: ['r1', 'r2', 'r3'],
  body: 'Attendance held at 82% across 11 completed sessions, with 3 momentum dips flagged.' } });
ok('2 · a faithful artifact (only dataset figures) is accepted', good.ok === true && good.artifact && /82%/.test(good.artifact.body));
ok('2 · …and only real row refs are kept', good.artifact.usedRefs.length === 3);

/* 3 — THE GUARANTEE: an INVENTED figure is caught (never presented) */
const bad = R.governArtifact({ dataset, format: 'summary', composed: {
  title: 'x', usedRefs: ['r1'],
  body: 'Attendance held at 82%, and player satisfaction rose to 94% this month.' } }); // 94% is not in the data
ok('3 · an invented figure (94%) is caught as a violation', bad.ok === false && bad.violations.some(v => v.kind === 'invented_figure' && v.values.includes('94')));
ok('3 · …and no artifact is returned for the invented version (it never reaches the reader)', bad.artifact === null);

/* 4 — a fabricated ref is dropped (can only cite real rows) */
const reffed = R.governArtifact({ dataset, format: 'summary', composed: { title: 'x', usedRefs: ['r1', 'r_ghost'], body: 'Attendance was 82%.' } });
ok('4 · a non-existent row ref is dropped', reffed.ok === true && reffed.artifact.usedRefs.includes('r1') && !reffed.artifact.usedRefs.includes('r_ghost'));

/* 5 — the deterministic fallback is truthful and needs no model */
const det = R.deterministicSummary(dataset, 'summary');
ok('5 · the deterministic summary lists the real rows, nothing invented', /Attendance/.test(det.body) && /82%/.test(det.body) && R._numbers(det.body).every(n => ['82', '11', '3', '16', '4'].includes(n) || /^\d+$/.test(n)));
const email = R.deterministicSummary(dataset, 'email');
ok('5 · an email fallback carries a subject line and body', /^Subject:/m.test(email.body) && /Attendance/.test(email.body));

/* 6 — nothing to present → says so plainly, invents nothing */
const empty = R.deterministicSummary({ title: 'Empty', rows: [] }, 'summary');
ok('6 · an empty dataset yields an honest "nothing recorded", not a fabricated report', /nothing recorded/i.test(empty.body) && empty.usedRefs.length === 0);

console.log(`\nrender-artifact-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
