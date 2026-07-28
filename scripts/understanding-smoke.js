/* Truth layer — the INPUT translator's safety core (pure). Proves the guardrail that lets
   an LLM read language and feed the reasoner WITHOUT breaching privacy: the output carries
   no raw text, no quotation, no protected trait, and nothing off the theme allow-list;
   sentiment/intensity are clamped; a smuggled protected trait fails SAFE; and a single
   note only ever becomes ONE tentative, low-severity observation (the reasoner's own
   accumulation does the rest). No DB / AI / IO. Run: node scripts/understanding-smoke.js */

const U = require('../ai/understanding.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* ── 1 · a normal classification → clean, bounded features ── */
const a = U.sanitizeFeatures({ sentiment: -2, themes: ['fatigue', 'workload'], intensity: 'high', sensitive: false });
ok('1 · sentiment is clamped to -1|0|1', a.sentiment === -1);
ok('1 · allow-listed themes are kept', a.themes.includes('fatigue') && a.themes.includes('workload'));
ok('1 · intensity is enumerated', a.intensity === 'high');

/* ── 2 · there is NO text field — raw content structurally cannot pass through ── */
const b = U.sanitizeFeatures({ sentiment: -1, themes: ['fatigue'], text: 'I feel awful because my mum is ill', note: 'verbatim', quote: '“secret”' });
ok('2 · no raw text / note / quote field survives on the output', !('text' in b) && !('note' in b) && !('quote' in b));
ok('2 · only the four safe fields exist', JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['intensity', 'sensitive', 'sentiment', 'themes']));

/* ── 3 · off-allow-list themes are dropped (incl. anything identity-shaped) ── */
const c = U.sanitizeFeatures({ sentiment: 1, themes: ['progress', 'religion', 'race', 'random_tag', 'workload'] });
ok('3 · only allow-listed themes remain; identity/other tags are dropped', c.themes.join() === 'progress,workload');

/* ── 4 · protected traits cannot get in — by allow-list AND by never copying free fields ── */
const d = U.sanitizeFeatures({ sentiment: -1, themes: ['workload', 'depression'], intensity: 'medium', sensitive: false, extra: 'possible depression diagnosis' });
ok('4 · a non-safe raw field is ignored entirely — never copied to the output', !JSON.stringify(d).toLowerCase().includes('depression') && !('extra' in d));
ok('4 · a protected-trait theme is dropped by the allow-list', d.themes.join() === 'workload');

/* ── 5 · themes are deduped + capped ── */
const e = U.sanitizeFeatures({ sentiment: -1, themes: ['fatigue', 'fatigue', 'workload', 'motivation', 'confidence', 'focus', 'belonging'] });
ok('5 · deduped and capped at 5', e.themes.length === 5 && new Set(e.themes).size === 5);

/* ── 6 · a single negative note → ONE tentative, low/medium-severity observation ── */
const o = U.featuresToObservation({ sentiment: -1, themes: ['fatigue'], intensity: 'high', sensitive: true }, { subjectId: 'u1', subjectName: 'Uma', scope: 'teamA', id: 'n1', t: 1000 });
ok('6 · a fatigue+negative note maps to an overload signal', o && o.kind === 'overload');
ok('6 · one text is never more than tentative, never high-severity', o.confidence === 'tentative' && o.severity === 'medium');
ok('6 · the basis names the THEME, never the content', /shared note \(fatigue\)/.test(o.basis) && !/mum|awful|ill/.test(o.basis));
ok('6 · the sensitive flag rides along as a care flag', o.careFlag === true);

/* ── 7 · a positive note → a progress signal ── */
const p = U.featuresToObservation({ sentiment: 1, themes: ['progress'] }, { subjectId: 'u1' });
ok('7 · progress+positive maps to a quiet-improvement signal', p && p.kind === 'quiet_improvement' && p.confidence === 'tentative');

/* ── 8 · neutral / themeless notes produce NOTHING (no over-reading) ── */
ok('8 · a neutral note yields no observation', U.featuresToObservation({ sentiment: 0, themes: ['workload'] }) === null);
ok('8 · a note with no allow-listed theme yields no observation', U.featuresToObservation({ sentiment: -1, themes: ['weather'] }) === null);

/* ── 9 · determinism ── */
ok('9 · identical input → identical features', JSON.stringify(U.sanitizeFeatures({ sentiment: -1, themes: ['workload'] })) === JSON.stringify(U.sanitizeFeatures({ sentiment: -1, themes: ['workload'] })));

console.log(`\nunderstanding-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
