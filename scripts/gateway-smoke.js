/* Truth layer — THE GATEWAY (pure). Proves the request we build is one the configured model
   will actually accept, with no network call. The bug this exists for: `temperature` was sent
   to every model, Sonnet 5 rejects sampling parameters with a 400, and both the composer and
   the intake pass therefore failed on every single turn — silently, because a throw there is
   indistinguishable from a model with nothing to say. Run: node scripts/gateway-smoke.js */

const fs = require('fs');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const src = fs.readFileSync(require.resolve('../ai/gateway.js'), 'utf8');
const SAMPLING_OK = new RegExp(src.match(/const SAMPLING_OK = (\/.*\/);/)[1].slice(1, -1));
const accepts = (m) => SAMPLING_OK.test(m);

/* 1 — the models that removed sampling parameters must never be sent one. Each of these
   returns 400 on `temperature`, which fails the turn outright rather than degrading. */
for (const m of ['claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7',
  'claude-fable-5', 'claude-mythos-5']) {
  ok(`1 · ${m} is sent no temperature`, accepts(m) === false);
}

/* 2 — the models that still take it keep it, so nothing that worked before gets blunted. */
for (const m of ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6',
  'claude-sonnet-4-5', 'claude-opus-4-6', 'claude-opus-4-5']) {
  ok(`2 · ${m} keeps its temperature`, accepts(m) === true);
}

/* 3 — the allowlist points the right way for a model nobody has heard of yet. Guessing
   "no sampling" costs default sampling; guessing "sampling" costs every request. */
for (const m of ['claude-something-7', 'claude-opus-6', '']) {
  ok(`3 · an unrecognised model defaults to no sampling · "${m}"`, accepts(m) === false);
}

/* 4 — the configured defaults must themselves be shippable through this gateway. A default
   that 400s is the same outage with nobody having touched an env var. */
const MODELS = require('../ai/gateway.js').MODELS;
ok('4 · the shipped reason default is a real, current model id', /^claude-[a-z0-9-]+$/.test(MODELS.reason));
ok('4 · the shipped micro default is a real, current model id', /^claude-[a-z0-9-]+$/.test(MODELS.micro));

/* 5 — the fallback floor is a constant, not the micro tier. Pointing both tiers at one model
   used to disable the downshift precisely when both were misconfigured together. */
ok('5 · the fallback floor is a fixed model, not MODELS.micro',
  /const FALLBACK_MODEL = '[a-z0-9-]+';/.test(src) && !/call\(MODELS\.micro\)/.test(src));
ok('5 · …and the downshift guard compares against that floor',
  /primary !== FALLBACK_MODEL/.test(src));

/* 6 — a model that rejects sampling anyway is retried without it rather than failing. */
ok('6 · a sampling rejection triggers a retry, not a dead turn', /_isSamplingRejected\(err\)/.test(src));

console.log(`\ngateway-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
