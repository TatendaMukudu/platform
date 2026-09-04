/* Truth layer — A DESIGN WITH FIFTY-FIVE SIZES IS A DESIGN WITH NO SCALE.

   Founder, September 2026: "maybe I'm just being picky about the different fonts and sizes on
   every page. Like the focus page doesn't have the composer... a little more unison."

   Not picky, and the first half of it was fixed by the shared field shell (see
   `focus-shape-smoke`). The second half was never measured until now, and the measurement is the
   argument: 1193 font-size declarations across 55 DISTINCT VALUES. 0.72rem, 0.73rem, 0.74rem,
   0.75rem and 0.76rem were all in use — frequently on the same screen — and no two of them were
   ever chosen against each other. Nobody decided that; it accumulated, one hand-picked number at
   a time, and the symptom is exactly what was reported: every page looking slightly unlike the
   last, with nothing you could point at.

   THE FIX IS A SCALE, NOT A RESTYLE. The steps are anchored on the values that already carried
   the most weight, so this is a tidy-up rather than a redesign: 1108 of the 1193 declarations
   moved by 0.02rem or less — a third of a pixel — and exactly one moved by more than 0.1rem.

   WHAT THIS SUITE IS FOR is not the migration, which happened once. It is the fifty-sixth value.
   A scale only holds if the next hand-picked number cannot get in, and a stylesheet is the one
   place where a wrong value fails silently and looks merely slightly off.

   Run: node scripts/typography-smoke.js */

'use strict';
const fs = require('fs');
const path = require('path');
const glob = d => fs.readdirSync(path.join(__dirname, '..', d)).map(f => path.join(d, f));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILES = [...glob('css').filter(f => f.endsWith('.css')), 'js/app.js', 'index.html'];
const ALL = FILES.map(f => ({ file: f, src: R(f) }));

/* ── T1-T3: the scale exists, is ordered, and has no two steps meaning the same thing. ── */
const styles = R('css/styles.css');
const steps = [...styles.matchAll(/(--fs(?:-[0-9a-z]+)?):\s*([0-9.]+)rem;/g)]
  .map(m => ({ name: m[1], v: parseFloat(m[2]) }));

ok(`T1 there is ONE type scale, defined in :root (${steps.length} steps)`, steps.length >= 10);
ok('T2 it ascends — a scale whose steps are out of order is a list',
  steps.every((s, i) => i === 0 || steps[i - 1].v < s.v));
ok('T3 no two steps are the same size, because two names for one size is how the sprawl starts again',
  new Set(steps.map(s => s.v)).size === steps.length);

/* ── T4: EVERY SIZE COMES FROM THE SCALE. The whole point. ──

   Three kinds of exception, each a real reason rather than a thing not got round to. They are
   named here, so an unexplained fourth cannot join them quietly. The 16px ones are the iOS floor
   and there are many, because an input is the one surface that may not sit on a rem scale. */
const EXCEPTIONS = [
  { file: 'css/styles.css', value: '14px', why: 'the root font-size every rem in the app is relative to — expressing it in rem would be circular' },
  { file: 'css/styles.css', value: '16px', why: 'iOS Safari zooms the page when a focused input is under 16px, so this is a hard absolute floor and not a design choice', count: 16 },
  { file: 'css/member.css', value: '16px', why: 'the same iOS floor, in the file that loads last and was overriding it on the main composer', count: 3 },
  { file: 'css/styles.css', value: '8px',  why: 'text inside an SVG viewBox, where the unit is a viewBox unit and not a screen pixel' },
];

const raw = [];
for (const { file, src } of ALL) {
  for (const m of src.matchAll(/font-size:\s*([^;}"')]+)/g)) {
    const v = m[1].trim();
    if (/^var\(--fs/.test(v)) continue;
    raw.push({ file, v });
  }
}
const allowed = new Set(EXCEPTIONS.map(e => `${e.file}|${e.value}`));
const strays = raw.filter(r => !allowed.has(`${r.file}|${r.v}`));
if (strays.length) console.error('       strays:', strays.map(s => `${s.file}:${s.v}`).join(', '));
ok('T4 every font-size in the app comes from the scale, bar the absolute values that each have a reason',
  strays.length === 0);
ok(`T4b the raw-literal bill is FROZEN at ${raw.length} — a scale only holds if the fifty-sixth hand-picked value cannot get in`,
  raw.length === 21);
ok('T4c every exception states WHY, so the list cannot become a hiding place',
  EXCEPTIONS.every(e => e.why && e.why.length > 30));

/* ── T5: nothing uses a step that does not exist. A var() with no definition is not an error in
   CSS — it silently falls back, which is the same class of bug as the invisible-text one that
   `css-token-smoke` exists for, and it would be a size nobody chose. ── */
const defined = new Set(steps.map(s => s.name));
const usedTokens = new Set();
for (const { src } of ALL) for (const m of src.matchAll(/var\((--fs(?:-[0-9a-z]+)?)\)/g)) usedTokens.add(m[1]);
const undef = [...usedTokens].filter(t => !defined.has(t));
if (undef.length) console.error('       undefined scale steps:', undef.join(', '));
ok('T5 every scale step used is defined — including from member.css, which css-token-smoke does not read',
  undef.length === 0);
ok('T5b …and the scale is actually used across the app rather than defined and ignored',
  usedTokens.size >= 8);

/* ── T6: THE iOS FLOOR, and it found thirteen. ──

   Not a preference — a defect that only exists on a phone. Safari zooms the viewport when a
   focused input renders under 16px, and it does not zoom back afterwards; the page just stays
   wrong until you reload it. So an input is the one surface in the app that may NOT sit on the
   rem scale, because the scale is relative to a 14px root and every step below --fs-xl lands
   under the floor.

   Thirteen surfaces were under it, including THE MAIN COMPOSER: `styles.css` sets
   `.iq-composer-input` to 16px and `member.css` — which loads after it, at equal specificity —
   set it to 0.94rem, so the rule meant to prevent this was itself being overridden. Onboarding's
   textarea, the coach form, the org setup fields and the library filter were all the same.

   Scanned over CSS only, with comments stripped: a comment mentioning "input" is not a selector,
   and an HTML string in app.js is not a stylesheet. Both produced false positives in the first
   version of this check, which is its own small lesson about scanning source with a regex. */
const belowFloor = [];
for (const { file, src } of ALL) {
  if (!file.endsWith('.css')) continue;
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of bare.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (!/(^|[\s,>])(input|textarea|select)\b|input\[|-input\b|-textarea\b/.test(sel)) continue;
    const decl = (m[2].match(/font-size:\s*([^;}]+)/) || [])[1];
    if (decl && /^var\(--fs/.test(decl.trim())) belowFloor.push(`${file}: ${sel.slice(0, 60)} -> ${decl.trim()}`);
  }
}
if (belowFloor.length) console.error('       inputs on the rem scale:', belowFloor.join(' | '));
ok(`T6 every input surface carries an ABSOLUTE 16px, never a scale step — under 16px, Safari zooms the page on focus and never zooms back (${belowFloor.length} still on the scale)`,
  belowFloor.length === 0);
ok('T6b …including the blanket rule that was supposed to guarantee it',
  /textarea,select,\.iq-composer-input,\.form-input\{font-size:16px\}/.test(styles));
/* T6c — THE ONE THAT MATTERED MOST, pinned by name. styles.css set the composer to 16px and
   member.css, loaded afterwards at equal specificity, set it back to 0.94rem. The rule written to
   prevent exactly this bug was losing to a later file, silently, on the app's busiest input. */
ok('T6c …and the main composer is 16px in member.css TOO, which loads after styles.css at equal specificity and was quietly winning',
  /\.iq-composer-input\{[^}]*font-size:16px/.test(R('css/member.css')));

/* ── T7: ONE TYPEFACE. The other half of "different fonts on every page".

   AND THIS CHECK WAS VACUOUS UNTIL A MUTATION SAID SO. The first version captured with
   `[^;}"')]+`, a character class that excludes the quote — so `font-family: 'Inter', 'Segoe UI',
   system-ui` matched an EMPTY STRING, every stack in the app collapsed to '', and the assertion
   "there is one typeface" was true of a set containing nothing. Planting a second typeface
   changed no answer. A font stack is quoted almost by definition, so excluding the quote is
   excluding the data. ── */
const families = [];
/* Stop at ; } or a DOUBLE quote. CSS stacks quote family names with apostrophes, while an inline
   style="..." in app.js is delimited by the double quote — so this reads both without either
   swallowing the other's terminator. The first version excluded the apostrophe too, which is what
   made every quoted stack read as empty. */
for (const { src } of ALL) for (const m of src.matchAll(/font-family:\s*([^;}"]+)/g)) families.push(m[1].trim().replace(/\s+/g, ''));
const realStacks = [...new Set(families.filter(f => f !== 'inherit' && !/monospace/.test(f)))];
if (realStacks.length > 1) console.error('       stacks:', realStacks.join(' | '));
ok(`T7 the app has ONE typeface stack, not one per page (found ${realStacks.length} across ${families.length} declarations)`,
  realStacks.length === 1 && families.length >= 20);
ok('T7b …and the only other families are `inherit` and monospace, which are deliberate rather than drift',
  families.every(f => f === 'inherit' || /monospace/.test(f) || realStacks.includes(f)));

console.log(`\ntypography-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
