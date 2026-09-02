/* Truth layer — A COLOUR THAT FALLS BACK IS A COLOUR NOBODY CHOSE.

   I wrote 41 rules against `var(--text, #111827)`, `var(--muted, #6b7280)` and
   `var(--line, #e5e7eb)`. None of those variables exists in this theme. Every one silently fell
   back to its LIGHT-theme hex — near-black text on a near-black page — so the question IntelliQ
   was asking, the provenance line, and half of onboarding were rendered invisible. The founder
   reported it as "I can't even see the writing underneath", which is exactly what it was.

   The insidious part is the fallback. `var(--nope, #111827)` is not an error in CSS; it is a
   perfectly valid instruction to use black. A typo in a token name does not fail loudly, it
   quietly picks a colour from a design system that is not this one.

   Same class as the cache-stamp bug: everything green, everything deployed, unreadable on the
   phone. So the token names are checked against what :root actually defines.

   Run: node scripts/css-token-smoke.js */

'use strict';
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* Every custom property the stylesheet DEFINES, anywhere (:root, a theme block, a component). */
const defined = new Set([...css.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)].map(m => m[1]));
/* Every custom property it USES. */
const used = [...css.matchAll(/var\(\s*(--[A-Za-z0-9-]+)\s*(,([^)]*))?\)/g)]
  .map(m => ({ name: m[1], fallback: (m[3] || '').trim() }));

ok('CT1 the stylesheet defines a token palette', defined.size >= 8);
ok('CT2 it uses tokens rather than raw hex everywhere', used.length >= 20);

const undef = [...new Set(used.filter(u => !defined.has(u.name)).map(u => u.name))];
if (undef.length) console.error('       undefined tokens:', undef.join(', '));
ok('CT3 every token used is actually defined — an undefined one is not an error, it silently uses the fallback',
  undef.length === 0);

/* A fallback on a DEFINED token is harmless. A fallback is only ever load-bearing when the
   token is missing, which CT3 already forbids — so the remaining risk is a light-theme hex
   sitting in a fallback slot, waiting for somebody to rename a token. */
const LIGHTISH = /#(f{3,}|f[0-9a-f]{5}|e[0-9a-f]{5}|111827|111|000|6b7280|f8f9fb)\b/i;
const risky = used.filter(u => u.fallback && LIGHTISH.test(u.fallback));
if (risky.length) console.error('       light-theme fallbacks:', risky.slice(0, 5).map(r => `${r.name} -> ${r.fallback}`).join(', '));
ok('CT4 no rule carries a light-theme colour as its fallback — that is what made the text invisible',
  risky.length === 0);

console.log(`\ncss-token-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
