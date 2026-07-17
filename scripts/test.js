/* ============================================================
   scripts/test.js — the Truth Layer (one command, one verdict)

   Run:  npm test    (or)   node scripts/test.js

   The council's arbiter. Every agent — Claude, Codex, or a human — must leave
   this GREEN. It (1) syntax-checks every source file, then (2) runs every test
   suite. Any failure → non-zero exit, so CI and pre-commit hooks catch it.

   No DB, no AI key required — everything here is pure/deterministic on purpose,
   so the truth layer is fast, hermetic, and reproducible anywhere.
   ============================================================ */

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let failed = 0;
const step = (label, fn) => {
  process.stdout.write(`\n▶ ${label}\n`);
  try { fn(); } catch (e) {
    failed++;
    if (e.stdout) process.stdout.write(String(e.stdout));
    console.log('  ✗', (e.message || 'failed').split('\n')[0]);
  }
};

// 1 ── syntax: every source file parses (catches a broken commit instantly) ──
step('syntax — node --check all sources', () => {
  const files = [];
  const addDir = d => { try { fs.readdirSync(path.join(root, d)).forEach(f => { if (f.endsWith('.js')) files.push(path.join(d, f)); }); } catch (_) {} };
  ['ai', 'scripts', 'js'].forEach(addDir);
  ['server.js', 'db.js'].forEach(f => { if (fs.existsSync(path.join(root, f))) files.push(f); });
  for (const f of files) execFileSync('node', ['--check', path.join(root, f)]);
  console.log(`  ✓ ${files.length} files parse`);
});

// 2 ── suites: each exits non-zero on failure ───────────────────────────────
const SUITES = [
  'baseline-smoke.js',
  'intelligence-smoke.js',
  'privacy-smoke.js',
  'person-model-smoke.js',
  'eval.js',
  'invariants.js',
  'packs-language-smoke.js', // domain LANGUAGE pass: org-voice directives, role-sensitivity, audit
  'domain-cleanup-smoke.js', // one language source: no legacy vertical prose; role ladder invents no titles
  'evidence-smoke.js',     // the canonical evidence envelope: normalise/validate/dedupe/promote
  'identity-reresolve-smoke.js', // the identity lifecycle: held-back evidence resolves + promotes once
  'mapping-smoke.js',            // the mapping contract: fingerprint/drift/transform/gate (pure)
  'mapping-lifecycle-smoke.js',  // the mapping approval lifecycle end to end (hold→approve→activate→reprocess)
  'connector-harness.js',  // the Connector SDK: identity/confidence + mapping contracts
  'endpoint-smoke.js',   // boots the real app in-process (DB_OPTIONAL) — HTTP authz + Me context
];
for (const s of SUITES) {
  step(`suite — ${s}`, () => {
    const out = execFileSync('node', [path.join(__dirname, s)], { encoding: 'utf8' });
    process.stdout.write(out.replace(/^/gm, '  '));
  });
}

console.log(failed
  ? `\n════════\n✗ TRUTH LAYER RED — ${failed} step(s) failed. Do not merge.\n`
  : `\n════════\n✓ TRUTH LAYER GREEN — all sources parse, all suites pass.\n`);
process.exit(failed ? 1 : 0);
