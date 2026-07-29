/* Truth layer — DETERMINISTIC-ONLY / NO-EGRESS MODE. Proves the long-term guarantee: even
   with a model key configured, no-egress mode makes every LLM edge go dark, complete()
   hard-refuses, and the env form (IQ_DETERMINISTIC_ONLY) cannot be overridden at runtime —
   so an organisation can PROVE nothing about their people ever leaves the box.
   No network is ever touched (the fake key is never called). Run: node scripts/no-egress-smoke.js */

process.env.ANTHROPIC_API_KEY = 'sk-test-fake-key-never-called';   // simulate a configured key
delete process.env.IQ_DETERMINISTIC_ONLY;

const path = require('path');
const { execFileSync } = require('child_process');
const ai = require('../ai/gateway.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

(async () => {
  /* ── 1 · a configured key enables the model (baseline) ── */
  ok('1 · a configured key enables the LLM', ai.enabled() === true && ai.deterministicOnly() === false);
  ok('1 · understanding via a model is available', ai.canUnderstand('text') === true);

  /* ── 2 · no-egress mode makes EVERY edge go dark — even with the key present ── */
  ai.setDeterministicOnly(true);
  ok('2 · deterministic-only reports ON', ai.deterministicOnly() === true);
  ok('2 · enabled() goes false despite the key (every optional edge gates on this)', ai.enabled() === false);
  ok('2 · canUnderstand goes false for text AND pdf', ai.canUnderstand('text') === false && ai.canUnderstand('pdf') === false);

  /* ── 3 · complete() hard-refuses — belt-and-braces if a caller forgets to check ── */
  let refused = false;
  try { await ai.complete({ user: 'hi' }); } catch (e) { refused = /deterministic-only/i.test(e.message); }
  ok('3 · complete() refuses to call any model in no-egress mode (nothing leaves)', refused === true);

  /* ── 4 · reversible at runtime ── */
  ai.setDeterministicOnly(false);
  ok('4 · turning it back off re-enables the model', ai.enabled() === true);

  /* ── 5 · the ENV form is a HARD guarantee — it cannot be re-enabled at runtime ── */
  const out = execFileSync(process.execPath, ['-e',
    "const ai=require('./ai/gateway.js'); ai.setDeterministicOnly(false); process.stdout.write(JSON.stringify({enabled:ai.enabled(),det:ai.deterministicOnly()}));"],
    { env: { ...process.env, IQ_DETERMINISTIC_ONLY: '1', ANTHROPIC_API_KEY: 'k' }, encoding: 'utf8', cwd: path.join(__dirname, '..') });
  const env = JSON.parse(out);
  ok('5 · IQ_DETERMINISTIC_ONLY=1 forces it off, and setDeterministicOnly(false) cannot override', env.enabled === false && env.det === true);

  console.log(`\nno-egress-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
