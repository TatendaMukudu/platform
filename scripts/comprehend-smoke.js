/* Truth layer — deterministic UNDERSTANDING (pure). Proves the assistant can turn free text
   into bounded features WITHOUT an LLM: it reads sentiment + allow-listed themes, honours
   negation ("not tired" ≠ tired), invents nothing on empty/irrelevant input, is deterministic,
   never extracts a clinical/protected word as a theme, and its output flows cleanly through
   the ai/understanding guard into a reasoner observation. No DB / AI / IO.
   Run: node scripts/comprehend-smoke.js */

const C = require('../ai/comprehend.js');
const U = require('../ai/understanding.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* ── 1 · a negative note → the right themes + negative sentiment ── */
const a = C.comprehend("I'm exhausted and the workload keeps piling up this week.");
ok('1 · picks up fatigue + workload themes', a.themes.includes('fatigue') && a.themes.includes('workload'));
ok('1 · reads the sentiment as negative', a.sentiment === -1);

/* ── 2 · a positive note ── */
const b = C.comprehend('Massive progress this week — feeling strong and confident.');
ok('2 · picks up progress + confidence', b.themes.includes('progress') && b.themes.includes('confidence'));
ok('2 · reads it positive, and "massive" makes it high intensity', b.sentiment === 1 && b.intensity === 'high');

/* ── 3 · NEGATION — "not tired" must not become fatigue ── */
const c = C.comprehend("I'm not tired at all, just a bit distracted.");
ok('3 · a negated symptom is not extracted as a theme', !c.themes.includes('fatigue'));
ok('3 · but a real one still is', c.themes.includes('focus'));

/* ── 4 · empty / irrelevant input invents nothing ── */
ok('4 · empty text → no features', JSON.stringify(C.comprehend('')) === JSON.stringify({ sentiment: 0, themes: [], intensity: 'low', sensitive: false }));
ok('4 · text with no triggers → neutral, no themes', (() => { const r = C.comprehend('The bus leaves from the north gate.'); return r.sentiment === 0 && r.themes.length === 0; })());

/* ── 5 · privacy — a clinical/protected word is NOT extracted as a theme ── */
const d = C.comprehend('I have been feeling depressed and anxious.');
ok('5 · "depressed" never becomes a theme (not in the lexicon)', !d.themes.some(t => /depress|anx/.test(t)));

/* ── 6 · determinism ── */
ok('6 · identical text → identical features', JSON.stringify(C.comprehend('tired and stuck')) === JSON.stringify(C.comprehend('tired and stuck')));

/* ── 7 · flows through the guard into a reasoner observation (no LLM anywhere) ── */
const feat = U.sanitizeFeatures(C.comprehend("I'm shattered and overwhelmed, could use some help."));
ok('7 · comprehend output passes the understanding guard unchanged in shape', Array.isArray(feat.themes) && feat.sentiment === -1);
const obs = U.featuresToObservation(feat, { subjectId: 'u1', t: 1000 });
ok('7 · a negative fatigue/load note becomes ONE tentative reasoner observation', obs && obs.confidence === 'tentative' && ['overload', 'withdrawal', 'momentum_drop'].includes(obs.kind));

console.log(`\ncomprehend-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
