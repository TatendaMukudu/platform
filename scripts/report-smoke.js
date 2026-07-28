/* Truth layer — the GROUNDED REPORT layer (pure). Proves the artifact edge renders truth
   and never manufactures it: a fact with no source is DROPPED (never printed); a section
   with no grounded facts says so honestly instead of padding; the model is deterministic;
   the HTML is self-contained, escapes content, and carries the honesty footer.
   No DB / AI / IO. Run: node scripts/report-smoke.js */

const R = require('../ai/report.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const model = R.buildReport({
  title: 'Team report', subject: 'the under-18s', generatedAt: '2026-07-28T09:00:00Z',
  intro: 'Where things stand this week.',
  sections: [
    { heading: 'Worth attention', facts: [
      { text: 'Momentum has dipped for one player.', basis: 'reasoner · emerging · 3 check-ins' },
      { text: 'This one has no source', basis: '' },                 // ungrounded → must be dropped
      { text: '', basis: 'a source but no text' },                   // no text → dropped
    ] },
    { heading: 'Confirmed practices', facts: [
      { text: 'Thursday video sessions are how we operate.', basis: 'playbook · confirmed 2026-07-10' },
    ] },
    { heading: 'What changed', facts: [] },                          // legitimately empty
  ],
});

/* ── 1 · the grounding guarantee — a fact without a source never survives ── */
const s0 = model.sections[0];
ok('1 · a fact with a source is kept', s0.facts.some(f => /Momentum/.test(f.text)));
ok('1 · a fact with NO source is dropped', !s0.facts.some(f => /no source/.test(f.text)));
ok('1 · a "fact" with no text is dropped', s0.facts.length === 1);
ok('1 · the model counts what it refused (auditable)', model.droppedUngrounded === 2);

/* ── 2 · an empty section says so honestly — never padded ── */
const changed = model.sections[2];
ok('2 · a section with no grounded facts is marked empty', changed.empty === true);
ok('2 · …and carries an honest note, not filler', /Not enough recorded/.test(changed.emptyNote));

/* ── 3 · determinism ── */
const again = R.buildReport({ title: 'Team report', subject: 'the under-18s', generatedAt: '2026-07-28T09:00:00Z', intro: 'Where things stand this week.', sections: [{ heading: 'Confirmed practices', facts: [{ text: 'Thursday video sessions are how we operate.', basis: 'playbook · confirmed 2026-07-10' }] }] });
ok('3 · identical input → identical model (for the shared section)', JSON.stringify(again.sections[0]) === JSON.stringify(model.sections[1]));

/* ── 4 · the HTML renders the grounded facts + their sources, self-contained ── */
const html = R.renderHtml(model);
ok('4 · the HTML is a self-contained document', /^<!doctype html>/i.test(html) && !/https?:\/\//.test(html));
ok('4 · it shows the kept fact and its source', /Momentum has dipped/.test(html) && /emerging · 3 check-ins/.test(html));
ok('4 · it NEVER shows a dropped, ungrounded fact', !/no source/.test(html));
ok('4 · the empty section renders its honest note', /Not enough recorded/.test(html));
ok('4 · it carries the honesty footer (nothing invented or predicted)', /nothing here is invented or predicted/.test(html));

/* ── 5 · content is escaped (a report can be handed to anyone) ── */
const evil = R.renderHtml(R.buildReport({ title: 'X', sections: [{ heading: 'H', facts: [{ text: '<script>alert(1)</script>', basis: 'src' }] }] }));
ok('5 · injected markup in a fact is escaped, not executed', !/<script>alert/.test(evil) && /&lt;script&gt;/.test(evil));

console.log(`\nreport-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
