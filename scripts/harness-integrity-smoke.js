/* Truth layer — THE ARBITER MUST BE ABLE TO SEE A CRASH.

   scripts/test.js judges every suite by its exit code and nothing else. server.js installs
   process-level crash guards so that one unhandled async error never takes a running server
   down — which is right for a server, and was quietly wrong for a harness: every suite requires
   server.js, so a suite that threw logged its stack, swallowed the error, and exited 0. A
   crashed suite read as a green one, and the arbiter could not tell the difference.

   Found while mutation-testing D53, where a mutation killed a suite mid-way and the run still
   reported success. Nothing was actually crashing at the time; the hole was simply open.

   These assertions spawn real child processes, because the behaviour under test IS the exit
   code and there is no way to observe it from inside the same process.

   Run: node scripts/harness-integrity-smoke.js */

'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const root = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const child = (body) => spawnSync(process.execPath, ['-e', body], {
  cwd: root, encoding: 'utf8',
  env: { ...process.env, DB_OPTIONAL: '1', NODE_ENV: 'test' },
});

const REQUIRE = `require(${JSON.stringify(path.join(root, 'server.js'))});`;

/* A suite that throws after requiring server.js must fail. This is the exact shape that read as
   a pass: the assertion dies on a property of undefined and the run reports green. */
const thrown = child(`${REQUIRE} setTimeout(() => { throw new Error('suite died'); }, 10);`);
ok('H1 a suite that throws after requiring the server exits non-zero', thrown.status !== 0);

/* And an unhandled rejection, which is how an await in a listen callback fails. */
const rejected = child(`${REQUIRE} Promise.reject(new Error('suite rejected')); setTimeout(() => {}, 50);`);
ok('H2 an unhandled rejection in a suite exits non-zero', rejected.status !== 0);

/* The guards must still LOG. Swallowing quietly and failing quietly would trade one blind spot
   for another — the stack is what says which suite died and where. */
ok('H3 …and the crash is still reported, not silently swallowed',
  /uncaughtException/.test(thrown.stderr || '') && /suite died/.test(thrown.stderr || ''));

/* The server's own behaviour is unchanged: a clean harness still exits 0, so this cannot turn
   passing suites red on its own. */
const clean = child(`${REQUIRE} setTimeout(() => process.exit(0), 10);`);
ok('H4 a suite that does not crash still exits zero', clean.status === 0);

console.log(`\nharness-integrity-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
