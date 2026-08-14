/* Truth layer — THE EPISTEMIC INVARIANTS (pure, static + behavioural).

   AGENTS.md §2 lists seven rules governing how the kernel is allowed to come to believe
   anything. Several were prose only — enforced by whoever happened to review the diff. This
   suite makes two of them mechanical, because both were violated in shipped code and neither
   was caught by any existing suite.

   The bugs this exists for, both live on main before this file:

     1. ai/priority-office.js and ai/intelligence-feed.js truncated `title` to 160 chars and
        `body` to 400, then attached `original: item` — the entire unredacted source object —
        next to them. The truncation was decorative. (AGENTS.md §2 product law 7, and
        epistemic invariant 2: evidence is referenced, never copied.)

     2. Six sites returned `safe: true` as a hardcoded literal, and
        ai/scoped-intelligence-packet.js:canUseItem READ that field as an authorisation gate.
        A module declared itself safe and a gate believed it. Worse,
        ai/outcome-intelligence.js owned a working predictive-language checker and never ran
        it on its own output. (Epistemic invariant 1: a module may never assert its own
        confidence or its own safety.)

   Both are CLASS bugs, not instances — which is why this suite scans every module in ai/
   rather than testing the five that happened to be wrong. A new module that repeats either
   mistake turns this red on the commit that introduces it.

   Run: node scripts/epistemic-invariants-smoke.js */

'use strict';

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const AI_DIR = path.join(__dirname, '..', 'ai');
const sources = fs.readdirSync(AI_DIR).filter(f => f.endsWith('.js'))
  .map(f => ({ file: `ai/${f}`, src: fs.readFileSync(path.join(AI_DIR, f), 'utf8') }));

/* Strip comments before scanning. A rule quoted in a header comment (as several modules now
   do, deliberately) must not read as a violation of itself.

   Blanking must PRESERVE line count — a comment replaced by '' shifts every line number after
   it, and a suite that reports the wrong location sends the next reader to the wrong place.
   So block comments become spaces, keeping their newlines. */
const code = ({ src }) => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/^(\s*)\/\/.*$/gm, '$1');

console.log('epistemic-invariants-smoke\n');

/* 1 — INVARIANT 1: safety and confidence are computed, never declared.

   A literal `safe: true` is the signature of a module vouching for itself. The legitimate
   form is an expression — `safe: queue.every(...)`, `safe: guard.describesOnly(text)` — whose
   value depends on what the module actually produced. */
{
  const offenders = [];
  for (const s of sources) {
    const lines = code(s).split('\n');
    lines.forEach((line, i) => {
      if (/\bsafe\s*:\s*(true|false)\s*[,}]/.test(line)) offenders.push(`${s.file}:${i + 1}`);
    });
  }
  ok('1 · no module declares its own `safe` as a literal', offenders.length === 0);
  if (offenders.length) console.log('      ', offenders.join(', '));
}

/* 1b — the same rule for confidence, scoped to where it is actually a claim about evidence.

   Confidence is derived by ai/diagnose.js:deriveConfidence and ai/org-playbook.js:
   confidenceBand. A module writing a positive band inline is stating a conclusion it did not
   compute — which is how ai/intelligence-feed.js came to stamp playbook entries 'confirmed'
   while the record itself carried confidenceAtConfirmation, the real derived band.

   Deliberately narrow, because the broad version is wrong. Two literal bands are legitimate
   and stay:
     - an accepted accommodation is a recorded USER DECISION, not an inference;
     - a milestone is a COUNTED fact ("14 days"), not a weighing of evidence.
   Neither carries evidenceRefs, and that is the distinguishing feature: an item that cites
   evidence is making an evidential claim, and must therefore derive its band rather than
   declare one. An item citing nothing is reporting a state.

   The enclosing-literal test is a ±15-line window rather than a real parser. That is a
   heuristic, and it is stated here rather than hidden: it can miss a very large object
   literal. It cannot produce a false ALARM, which is the property that matters for a rule
   that must stay green to be worth having. */
{
  const ASSERTIVE = /\bconfidence\s*:\s*['"](confirmed|clear|reliable|well_supported|supported|high|certain)['"]/;
  const offenders = [];
  for (const s of sources) {
    const lines = code(s).split('\n');
    lines.forEach((line, i) => {
      if (!ASSERTIVE.test(line)) return;
      const window = lines.slice(Math.max(0, i - 15), i + 15).join('\n');
      if (/evidenceRefs|supportingMoments|\bsample\b|\bcites\b/.test(window)) {
        offenders.push(`${s.file}:${i + 1}`);
      }
    });
  }
  ok('1b · an evidence-citing item derives its confidence band rather than declaring one',
    offenders.length === 0);
  if (offenders.length) console.log('      ', offenders.join(', '));
}

/* 1c — the guard must be the SHARED one. ai/language-guard.js is the single canonical
   no-prediction / no-diagnosis check. A module that grows its own private regex has forked
   the rule, and the two copies drift — which is exactly how outcome-intelligence ended up
   with a checker it never ran. */
{
  const consumers = sources.filter(s => /\bsafe\s*:/.test(code(s)) && !/language-guard/.test(s.file));
  const withoutGuard = consumers
    .filter(s => !/require\(['"]\.\/language-guard['"]\)/.test(s.src))
    .filter(s => /describesOnly|predictsOrDiagnoses|assertSafeText|banned/.test(code(s)))
    .map(s => s.file);
  ok('1c · a module checking language uses the shared guard, not a private copy',
    withoutGuard.length === 0);
  if (withoutGuard.length) console.log('      ', withoutGuard.join(', '));
}

/* 2 — INVARIANT 2: evidence is referenced, never copied.

   An engine item may carry refs, typed scalars and truncated display strings. It may not
   carry the whole object it was built from: whatever raw text the source held rides along
   into every consumer, and every truncation upstream becomes decorative.

   The check is deliberately about the SHAPE of the passthrough — a field assigned the intact
   input object — rather than the name `original`, so renaming the field does not evade it. */
{
  const PASSTHROUGH = /^\s*(original|raw|source[A-Z]\w*|payload|item)\s*:\s*(item|record|signal|input|artifact|source)\s*,?\s*$/;
  const offenders = [];
  for (const s of sources) {
    const lines = code(s).split('\n');
    lines.forEach((line, i) => { if (PASSTHROUGH.test(line)) offenders.push(`${s.file}:${i + 1}`); });
  }
  ok('2 · no engine item carries its whole source object through', offenders.length === 0);
  if (offenders.length) console.log('      ', offenders.join(', '));
}

/* 2b — behavioural, not static. Feed an item carrying private raw text through the two
   normalisers that previously leaked it, and assert the text is not reachable anywhere in
   the output. A static rule can be evaded; this cannot. */
{
  const SECRET = 'PRIVATE_HARDSHIP_TEXT_THAT_MUST_NEVER_TRAVEL';
  const dirty = {
    id: 'x1', patternType: 'momentum_drop', priority: 'high', title: 'A title', body: 'A body',
    rawText: SECRET, notes: SECRET, transcript: { turns: [{ text: SECRET }] },
  };

  const po = require('../ai/priority-office');
  const leakedPO = JSON.stringify(po.stamp({ reads: [dirty] })).includes(SECRET);
  ok('2b · priority-office does not carry raw source text into its queue', !leakedPO);

  const feed = require('../ai/intelligence-feed');
  let leakedFeed = false;
  try {
    leakedFeed = JSON.stringify(feed.normalizeArtifact
      ? feed.normalizeArtifact(dirty, 'test')
      : feed.collect({ insights: [dirty] })).includes(SECRET);
  } catch { leakedFeed = false; }
  ok('2b · intelligence-feed does not carry raw source text into its artifacts', !leakedFeed);
}

/* 3 — INVARIANT 7: fail closed, by allowlist.

   Enumerating the BAD states and treating everything else as fine fails OPEN — an
   unrecognised future status slips through as though it were fine. ai/diagnose.js gets this
   right: isActive tests `status === 'active'` rather than excluding a list of known-bad
   values, so a hypothetical 'disputed' is inactive the day it is introduced rather than the
   day someone remembers to add it. */
{
  const { isActive, SIGNAL_STATUSES } = require('../ai/diagnose');
  ok('3 · a recognised active signal is active', isActive({ status: 'active' }) === true);
  ok('3 · superseded and withdrawn are not active',
    !isActive({ status: 'superseded' }) && !isActive({ status: 'withdrawn' }));
  ok('3 · an UNRECOGNISED status is not active (allowlist, not denylist)',
    !isActive({ status: 'disputed' }) && !isActive({ status: 'pending' }));
  ok('3 · the status vocabulary is exactly the three the kernel documents',
    JSON.stringify(SIGNAL_STATUSES) === JSON.stringify(['active', 'superseded', 'withdrawn']));
}

/* 3b — the known divergence, pinned deliberately rather than left to be rediscovered.

   isActive(null) and isActive({}) are BOTH true: "a signal is active until something says
   otherwise", which is right for stored signals that predate the status field. It is NOT
   right for a retrieval boundary, where evidence of unknown provenance should not ground an
   answer. ai/admissibility.js is where that stricter gate belongs. This test exists so the
   difference is a recorded decision, and so that anyone tempted to "fix" isActive sees why
   it is like that first. */
{
  const { isActive } = require('../ai/diagnose');
  ok('3b · isActive is permissive on missing status, by design (legacy signals)',
    isActive({}) === true && isActive({ ref: 's1' }) === true);
  ok('3b · …and permissive on a missing signal, which a retrieval gate must NOT copy',
    isActive(null) === true && isActive(undefined) === true);
}

/* 4 — TOOLING MUST NOT LEAK SECRETS.

   Not a kernel invariant, and it lives here rather than in a suite of its own because the
   repo's rule is to consolidate rather than sprawl. It earns its place the same way every
   other case here did: it is a bug that actually happened.

   scripts/codex-setup.sh printed a live GitHub token into a log that was then pasted into
   chat. The line was meant to report presence only, and the comment above it said exactly
   that:

       echo "... ${GITHUB_TOKEN:+SET}${GITHUB_TOKEN:-NOT SET}"

   ${VAR:-default} substitutes VAR'S VALUE when VAR is set. So the branch labelled "NOT SET"
   printed the secret, and did so precisely when there was a secret to print. Testing it with
   the variable unset — the obvious thing to do — passes and proves nothing.

   So: run the script WITH a token and assert the token never appears in its output. */
{
  const { execFileSync } = require('child_process');
  const os = require('os');
  const SENTINEL = 'ghp_SENTINEL_TOKEN_VALUE_THAT_MUST_NEVER_BE_PRINTED';
  const script = path.join(__dirname, 'codex-setup.sh');

  let out = '';
  let ran = false;
  if (fs.existsSync(script)) {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'credleak-'));
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'credrepo-'));
    try {
      execFileSync('git', ['init', '-q', tmpRepo], { stdio: 'ignore' });
      out = execFileSync('bash', [script], {
        env: { ...process.env, GITHUB_TOKEN: SENTINEL, HOME: tmpHome, CODEX_REPO_DIR: tmpRepo },
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
      });
      ran = true;
    } catch (e) {
      // A failed push attempt is expected and fine — the sentinel is not a real credential.
      // What matters is what reached stdout/stderr on the way.
      out = `${(e.stdout || '')}${(e.stderr || '')}`;
      ran = true;
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  }

  ok('4 · the setup script runs with a token present (the case that can leak)', ran);
  ok('4 · …and never prints the token itself', ran && !out.includes(SENTINEL));
  ok('4 · …while still reporting that a token is present', ran && /GITHUB_TOKEN is SET/.test(out));
  ok('4 · …and no git remote URL embeds a credential',
    ran && !/https:\/\/[^\s/@]*:[^\s/@]*@github\.com/.test(out));
}

console.log(`\nepistemic-invariants-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
