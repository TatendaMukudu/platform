/* Truth layer — ONE OWNER PER LAW, across the whole combined pilot stack.

   Six branches were layered into one tree. Every one of them added a door, and the failure this
   guards is the one that does not announce itself: two functions that both write the same thing,
   agreeing today and drifting in three weeks. That has happened here before — five polarity
   vocabularies, two group models, two Focus constructors — and each time it was found by reading
   rather than by a suite, which is to say it was found late.

   THIS IS A STRUCTURAL TEST, NOT A BEHAVIOURAL ONE. It counts writers. A law with two writers
   fails here even if both are currently correct, because "currently correct" is exactly the state
   every drift starts from.

   Run: node scripts/stack-ownership-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) { return ''; } };

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* Everything that could plausibly hold a writer: the server monolith and every kernel module.
   Deliberately NOT a hand-picked list of files I already suspect — the point is to look where I
   would not have thought to. Test files are excluded: a suite may legitimately construct state. */
const SOURCES = ['server.js', 'db.js', ...fs.readdirSync(path.join(ROOT, 'ai'))
  .filter(f => f.endsWith('.js')).map(f => 'ai/' + f),
  ...fs.readdirSync(path.join(ROOT, 'lib')).filter(f => f.endsWith('.js')).map(f => 'lib/' + f)];

/* Count matches across every source, ignoring comments — a rule described in a comment is not a
   second writer, and a mutation that only edits prose must not be able to move this number. */
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const CODE = Object.fromEntries(SOURCES.map(f => [f, decomment(R(f))]));
const sites = rx => SOURCES.flatMap(f => (CODE[f].match(rx) || []).map(m => `${f}: ${String(m).trim().slice(0, 70)}`));

const law = (name, rx, expected, note) => {
  const hits = sites(rx);
  if (hits.length !== expected) {
    console.log(`\n    ${name} — expected ${expected} writer(s), found ${hits.length}:`);
    hits.forEach(h => console.log('      ' + h));
    if (note) console.log('      ' + note);
    console.log('');
  }
  ok(`${name}: ${expected === 1 ? 'exactly one writer' : expected + ' writers, and only those'}`, hits.length === expected);
};

console.log('\n  ONE OWNER PER LAW — THE COMBINED PILOT STACK');

/* 1. PERSONAL FOCUS — create, and outcome. `_createPersonalFocus` and
   `_recordPersonalFocusOutcome` are the canonical owners; the composer confirm branch and the
   direct routes both call them rather than touching the list. */
law('personal focus create', /mem\.focuses\.(?:push|unshift)\(/g, 1);
law('personal focus outcome', /focus\.status = 'done'; focus\.outcome =/g, 1);

/* The TEAM focus is a different object at a different grain (ai/team-state.js, the group's own
   store), which is the documented two-products-one-kernel split rather than a duplicate. What
   would be a duplicate is the server reaching into it directly. */
law('team focus outcome stays inside its own module', /focus\.outcome = \{/g, 1,
  'ai/team-state.js owns the TEAM grain; server.js must not write a team focus outcome itself.');
ok('…and that module is the team one, not the server',
  /ai\/team-state\.js/.test(sites(/focus\.outcome = \{/g)[0] || ''));

/* 2. THE DECLARED FOCUS RELATION. Two doors — the direct route and the confirmed composer
   action — and one writer between them. */
law('focus relation declaration', /evidenceRelations\.push\(/g, 1);
ok('…and both doors reach it rather than the field',
  (CODE['server.js'].match(/_declareFocusRelation\(/g) || []).length === 3);   // 1 definition + 2 callers
ok('…and its vocabulary is imported, not restated',
  /const \{ FOCUS_RELATIONS \} = crossEvidence;/.test(CODE['server.js'])
  && (SOURCES.filter(f => /FOCUS_RELATIONS = Object\.freeze/.test(CODE[f])).length === 1));

/* 3. THE PERSONAL PRIORITY MARK. Same shape: two doors, one writer. */
law('personal priority mark/unmark', /mem\.prioritised\s*=(?!=)/g, 1);
ok('…and both doors reach it rather than the field',
  (CODE['server.js'].match(/_setPersonalPriority\(/g) || []).length === 3);
ok('…and the Priority Office only READS it',
  !/prioritised\s*=(?!=)/.test(CODE['ai/priority-office.js']));

/* 4. LIBRARY SHELF FILING. The RULE — is this filing legal, is it a move or an add — lives in
   ai/shelf.js and is called, never re-implemented. The persistence sequence around it appears at
   both doors; that is recorded rather than asserted away (see the report), because the two are
   currently identical and collapsing them is a refactor, not an integration. */
law('the shelf filing rule has one owner', /function file\(/g, 1);
ok('…and it is the pure shelf module', /ai\/shelf\.js/.test(sites(/function file\(/g)[0] || ''));
ok('…which the server calls rather than reimplementing',
  !/\.filings\.push\(|shelfEntries\.push\(/.test(CODE['server.js'])
  && (CODE['server.js'].match(/shelf\.file\(/g) || []).length === 2);
/* Both doors must carry the SAME readability guard. Two copies of a sequence is a drift risk;
   two copies that already disagree is a defect, and this is the assertion that tells them apart. */
/* Scoped to each DOOR, not counted globally. The first version counted every use of the lookup
   and expected two — but the shelf VIEW uses it legitimately as well, so the number said three and
   the assertion failed against correct code. A count across a whole file cannot tell a guard from
   a read; slicing each door can. */
ok('…and both doors gate on the reader being able to open the object', (() => {
  const src = CODE['server.js'];
  const doorA = src.slice(src.indexOf("app.post('/api/library/shelf'"), src.indexOf("shelf.file(mine, ref"));
  const i = src.indexOf("if (prop.actionType === 'keep_in_library')");
  const doorB = src.slice(i, src.indexOf('shelf.file(_myShelf', i));
  return doorA.length > 100 && doorB.length > 100
    && /_shelfLookup\(code, userId\)/.test(doorA) && /_shelfLookup\(code, userId\)/.test(doorB);
})());

/* 5. INDEPENDENT-ORIGIN IDENTITY. One definition of what counts as a separate account. Every
   consumer takes it as a parameter or calls it; nobody re-derives it. */
law('independent-origin identity', /const currentOriginCount = |function currentOriginCount\(/g, 1);
ok('…and it lives in the kernel that owns evidence lifecycle',
  /ai\/diagnose\.js/.test(sites(/const currentOriginCount = |function currentOriginCount\(/g)[0] || ''));
ok('…and the Priority Office borrows it rather than defining independence itself',
  /currentOriginCount = null/.test(CODE['ai/priority-office.js'])
  && !/originRef|distinct|new Set\(.*origin/i.test(CODE['ai/priority-office.js']));

/* 6. CROSS-EVIDENCE RETRIEVAL. One module, and it takes no identity at all — so it cannot become
   a second answer to who may see what. */
law('cross-evidence edge derivation', /function edges\(/g, 1);
law('cross-evidence neighbourhood retrieval', /function neighbourhood\(/g, 1);
law('the A -> B loop reader', /function loop\(/g, 1);
ok('…and none of it can authorise: no function there takes a user, an org or a request',
  !/function \w+\([^)]*\b(userId|orgCode|req|session)\b/.test(CODE['ai/cross-evidence.js']));

/* 7. PRIORITY OFFICE CANDIDATE GENERATION. One desk. The feed-side buildQueue is a second WINDOW
   on the same module, not a second module — which is the distinction the whole design rests on. */
law('Priority Office candidate generation', /function attentionQueue\(/g, 1);
law('…and the reason vocabulary that orders it', /const ATTENTION_REASONS = Object\.freeze/g, 1);
law('…and the words it is said in', /function attentionSentence\(/g, 1);
ok('…all three in the one Priority Office module',
  sites(/function attentionQueue\(|const ATTENTION_REASONS = Object\.freeze|function attentionSentence\(/g)
    .every(h => h.startsWith('ai/priority-office.js')));
ok('…and the browser owns none of it — no reason code appears in the front end',
  (() => { const front = ['js/app.js', 'js/member-view.js', 'js/data.js', 'index.html'].map(R).join('');
    const P = require('../ai/priority-office.js');
    return !P.ATTENTION_REASONS.some(r => front.includes(r)); })());

/* 8. THE CANONICAL REF SHAPE. `kind:id` binds threads, files on the shelf, addresses attention
   rows and names relation targets. A second format would be a second identity. */
ok('one canonical ref shape, and the client is handed its parts rather than parsing them',
  (() => { const P = require('../ai/cross-evidence.js');
    return P.refOf({ kind: 'inquiry', id: 'q1' }) === 'inquiry:q1'
      && !/\.ref\.split\(|split\(\s*':'\s*\)/.test(decomment(R('js/app.js')).split('_attentionRow')[1] || ''); })());

console.log(`\nstack-ownership-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
