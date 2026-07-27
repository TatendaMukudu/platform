/* Truth layer — MEMBER-VIEW METHOD GUARD. MemberApp is one object literal, so every
   `this._x(...)` / `MemberApp._x(...)` CALL must resolve to a method DEFINED in the file.
   dead-code-scan catches the reverse (defined-but-unused); this catches called-but-
   undefined — the class of bug that crashed the leader MyWorkspace via an undefined
   this._ago(), which only rendered on a leader with a used template (so member-based
   boot tests never hit it). Pure static scan. Run: node scripts/member-methods-scan.js */

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'member-view.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

// Underscore-prefixed method CALLS on the app object.
const calls = new Set();
for (const m of src.matchAll(/(?:this|MemberApp)\._([A-Za-z0-9]+)\s*\(/g)) calls.add(m[1]);

// Method DEFINITIONS (object-shorthand): `  _name(args) {` optionally async.
const defs = new Set();
for (const m of src.matchAll(/^\s*(?:async\s+)?_([A-Za-z0-9]+)\s*\([^)]*\)\s*\{/gm)) defs.add(m[1]);

const missing = [...calls].filter(name => !defs.has(name)).sort();
ok(`every called MemberApp._method is defined (${calls.size} called, ${defs.size} defined)`, missing.length === 0);
if (missing.length) console.log('  ✗ undefined methods called:', missing.map(m => '_' + m).join(', '));

console.log(`\nmember-methods-scan: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
