/* Truth layer — the Privacy Gate. The product's most important law: private
   information may INFORM the AI but must NEVER be revealed. This suite guards it
   so no agent (Claude, Codex, or a future one) can weaken it without going red.
   Runs with plain `node` — no DB, no AI key. */

const p = require('../ai/privacy');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n); } };

// ── classification: restricted topics ───────────────────────────────────────
ok('bereavement → restricted (informs-only)', p.classifyText('My mother passed away last week', {}) === 'restricted');
ok('medical → restricted', p.classifyText('starting new medication for anxiety', {}) === 'restricted');
ok('injury → restricted', p.classifyText('my knee injury is flaring up', {}) === 'restricted');

// ── classification: keyword-free personal hardship → sensitive ───────────────
ok('hardship w/o keyword → sensitive', p.classifyText("I've been really struggling and can't cope", {}) === 'sensitive');
ok('money worry → sensitive', p.classifyText('stressed about rent and money right now', {}) === 'sensitive');
ok('private-typed note → sensitive', p.classifyText('anything at all', { type: 'private' }) === 'sensitive');

// ── classification: NOT over-flagging normal performance/culture text ────────
ok('team culture stays normal', p.classifyText('we built a real brotherhood this season', {}) === 'normal');
ok('performance stays normal', p.classifyText('hit a new squat PR of 140kg', {}) === 'normal');
ok('routine stays normal', p.classifyText('great energy at practice today', {}) === 'normal');

// ── isPrivate ────────────────────────────────────────────────────────────────
ok('sensitive is private', p.isPrivate('sensitive') === true);
ok('restricted is private', p.isPrivate('restricted') === true);
ok('normal is not private', p.isPrivate('normal') === false);

// ── leader-facing check-in projection contract (server _safeCheckinEntry) ────
// A hardship check-in is redacted from any leader surface; a neutral one shows.
ok('hardship check-in → private (redacted for leaders)',
   p.isPrivate(p.classifyText("really struggling to cope this week", { source: 'checkin' })) === true);
ok('neutral check-in → normal (visible to leaders)',
   p.isPrivate(p.classifyText("normal week, felt good at practice", { source: 'checkin' })) === false);

// ── redact: strip long verbatim private spans, keep short common words ───────
ok('redacts a long private span', p.redact('note: her father passed away suddenly here', ['her father passed away suddenly']).includes('[redacted'));
ok('leaves short fragments alone', p.redact('he is ok today', ['ok']) === 'he is ok today');

// ── the gate directive + context separation exist and say the law ────────────
ok('GATE_DIRECTIVE forbids revealing', /never/i.test(p.GATE_DIRECTIVE) && /reveal|quote|disclos/i.test(p.GATE_DIRECTIVE));
const block = p.buildContextBlock({ citable: ['Name: A'], privateInforming: ['Private note: X'] });
ok('context block separates citable from private', /OBSERVABLE/.test(block) && /PRIVATE/.test(block) && /never reveal/i.test(block));

console.log(`\nprivacy-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
