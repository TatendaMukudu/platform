/* Truth layer — DEAD CODE GUARD.

   Keeps the codebase from re-accumulating the legacy debt we just swept: a named
   function (or a module-level arrow-function constant) that nothing references
   anywhere is dead weight — usually a surface that was retired but left behind.

   How it works: build ONE reference corpus from the entire front/back end
   (server.js + every js/ module + index.html + scripts + mobile), then, for each
   target file, flag any top-level `function NAME(` / `const NAME = (…) =>` whose
   name appears nowhere but its own declaration. Scanning the WHOLE corpus (not
   just the file) means a cross-file onclick="fn()" in a template string counts as
   a use — so a live handler is never a false positive.

   If this suite goes red, either wire the function up or delete it.
   Run:  node scripts/deadcode-scan.js   (part of `npm test`) */

const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

// An allow-list for names that ARE referenced only dynamically in ways a text scan
// can't see (e.g. built purely from a computed string). Keep this SHORT and justified.
const ALLOW = new Set([
  // (none today — the sweep left the codebase clean)
]);

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return ''; } }

// Reference corpus — everything that could reference a function.
let corpus = readSafe(path.join(root, 'index.html')) + '\n' + readSafe(path.join(root, 'server.js')) + '\n';
for (const f of fs.readdirSync(path.join(root, 'js'))) if (f.endsWith('.js')) corpus += readSafe(path.join(root, 'js', f)) + '\n';
for (const d of ['scripts', 'mobile']) {
  try { for (const f of fs.readdirSync(path.join(root, d))) if (/\.(js|html)$/.test(f)) corpus += readSafe(path.join(root, d, f)) + '\n'; } catch (_) {}
}

// Files we hold to the "no dead functions" bar (the big surfaces where debt hides).
const TARGETS = ['server.js', ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)];

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

function exportedNames(src) { return (src.match(/module\.exports\s*=\s*\{[\s\S]*?\}/) || [''])[0]; }

function deadIn(target) {
  const src = readSafe(path.join(root, target));
  const exp = exportedNames(src);
  const dead = [];
  const check = (name) => {
    if (ALLOW.has(name) || exp.includes(name)) return;
    const esc = name.replace(/[$]/g, '\\$');
    const refs = (corpus.match(new RegExp('\\b' + esc + '\\b', 'g')) || []).length;
    const decls = (src.match(new RegExp('(?:function\\s+|const\\s+)' + esc + '\\b', 'g')) || []).length;
    if (refs - decls <= 0) dead.push(name);
  };
  let m;
  const fnRe = /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm;      // named declarations
  while ((m = fnRe.exec(src))) check(m[1]);
  const arrowRe = /^const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(?[^=\n]*?=>/gm; // module-level arrow fns
  while ((m = arrowRe.exec(src))) check(m[1]);
  return dead;
}

let total = 0;
for (const t of TARGETS) {
  const dead = deadIn(t);
  ok(`${t} — no unreferenced functions`, dead.length === 0 || (console.log('      dead:', dead.join(', ')), false));
  total += dead.length;
}
ok('codebase carries zero dead functions', total === 0);

console.log(`\ndeadcode-scan: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
