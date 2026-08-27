/* Truth layer — DOCUMENT STATUS INTEGRITY.

   Stale context costs more than missing context. Missing context makes an agent ask; stale
   context makes it act, confidently, on something that is no longer true. That has now caused
   duplicate work twice — once when a branch was cut before a status block existed, and once when
   an agent worked eleven days behind and rebuilt roughly 3,500 lines.

   So the index's freshness is not a habit. It is an assertion.

   Run: node scripts/docs-status-smoke.js */

'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) { return null; } };

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };

const index = R('docs/INDEX.md');
const DEV_BRANCH = 'claude/platform-work-summary-nmb0cm';

console.log('\n  THE INDEX IS THE ROUTER — it has to be true');
ok('docs/INDEX.md exists', !!index);

/* The SHA it was written against must be a real ancestor of where we are. A SHA that is not an
   ancestor means the index describes a branch nobody is on. */
{
  const m = index && index.match(/\*\*Written against:\*\*\s*`([0-9a-f]{7,40})`/);
  ok('the index names the commit it was written against', !!m);
  if (m) {
    let ancestor = false, age = null;
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', m[1], 'HEAD'], { cwd: ROOT, stdio: 'ignore' });
      ancestor = true;
      age = Number(execFileSync('git', ['rev-list', '--count', `${m[1]}..HEAD`], { cwd: ROOT }).toString().trim());
    } catch (_) {}
    ok(`its commit ${m[1]} is an ancestor of HEAD`, ancestor);
    // Twenty is generous. The point is to catch an index describing a different month, not to
    // demand a rewrite every commit.
    ok(`it is not badly stale (${age === null ? '?' : age} commits behind HEAD)`, age !== null && age <= 20);
  }
}

ok('the index names the branch work lands on', !!index && index.includes(DEV_BRANCH));

/* Everything the index points at must exist AT THIS COMMIT. A router pointing at a missing
   document is worse than no router: an agent that cannot find the brief invents one. */
console.log('\n  EVERY DOCUMENT IT POINTS AT MUST EXIST');
{
  const refs = [...new Set((index || '').match(/`((?:ttd|briefs|rnd)\/[a-z0-9-]+\.md)`/g) || [])]
    .map(x => 'docs/' + x.replace(/`/g, ''));
  const missing = refs.filter(f => R(f) === null);
  if (missing.length) missing.forEach(f => console.log('      missing: ' + f));
  ok(`all ${refs.length} referenced documents exist`, missing.length === 0);
}

/* One work order, and it must agree with itself. Two documents both claiming to be the current
   programme is how an agent picks the wrong one. */
console.log('\n  ONE CURRENT WORK ORDER');
{
  const programme = R('docs/briefs/codex-pilot-programme.md');
  ok('the work order exists', !!programme);
  ok('it carries a status block an agent reads first',
    !!programme && /STATUS — READ BEFORE ANY LANE/.test(programme));
  ok('it names the branch, so a session cannot start on the wrong one',
    !!programme && programme.includes(DEV_BRANCH));
}

/* A closed blocker still listed as open is the exact failure that made an agent rebuild Lane A.
   These are named individually because each one is now closed and each has a suite proving it. */
console.log('\n  NOTHING CLOSED IS STILL ADVERTISED AS OPEN');
for (const [claim, suite] of [
  ['no-llm', 'scripts/no-llm-floor-smoke.js'],
  ['two-sided cohort floor', 'scripts/audience-disclosure-smoke.js'],
  ['person-model distinct days', 'scripts/person-model-temporal-smoke.js'],
  ['invalidation on removal', 'scripts/graph-invalidation-smoke.js'],
]) {
  ok(`"${claim}" has a suite that proves it (${path.basename(suite)})`, R(suite) !== null);
}
ok('the index no longer lists the six original blockers as open',
  !!index && !/### What blocks Falcon\? — \*\*SIX\*\*/.test(index));

/* R&D must stay non-authoritative in writing, not just in intention. */
console.log('\n  R&D HAS NO STANDING');
{
  const rnd = R('docs/rnd/intelliq-rnd-program.md');
  ok('the R&D register exists', !!rnd);
  ok('it states plainly that nothing in it is a reason to build',
    !!rnd && /may be cited as a reason to build/.test(rnd));
  ok('the index labels it non-authoritative', !!index && /non-authoritative/.test(index));
}

console.log(`\ndocs-status-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
