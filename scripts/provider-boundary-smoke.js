/* Truth layer — EVERY MODEL EXIT GOES THROUGH ONE DOOR.

   server.js used to construct its own Anthropic client and call it directly from TWELVE routes:
   /api/chat, /api/draft-scenario, /api/coach-debrief, /api/org-setup/suggest,
   /api/metrics/suggest, /api/notes, /api/org/describe, /api/checkin/freeform,
   /api/weekly/submit and /api/weekly/synthesis.

   Nine of those twelve were already behind requireAuth, so this was never mainly an
   authentication story — it was a story about twelve calls sitting OUTSIDE every protection the
   gateway exists to apply:

     - deterministic-only enforcement, so a no-egress deployment still reached a provider;
     - the per-organisation budget, so one route could spend without limit and without record;
     - token telemetry, so that spend was invisible afterwards;
     - model-availability fallback and sampling-rejection handling, so a configuration change
       degraded to a 500 rather than to a working answer.

   A gate that most calls go through is not a gate. This suite makes the boundary structural: it
   fails if server.js ever grows another provider client or another direct create() call, and —
   the part that matters more — it proves the SWITCH is load-bearing rather than passing because
   no API key happens to be set. Credentials are present and dummy throughout.

   Run: node scripts/provider-boundary-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
// CREDENTIALS PRESENT. Without this the assertions below would pass on an unconfigured box and
// prove nothing at all — the thing being tested is the refusal, not the absence of a key.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-dummy-for-tests';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(root, f), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* ── 1. STRUCTURAL. One door, and it is the only one. ── */
const server = R('server.js');
const APPROVED = ['ai/gateway.js'];

ok('PB1 server.js constructs NO provider client of its own — it used to build an Anthropic client at module scope and hand it to twelve routes',
  !/new\s+Anthropic\s*\(/.test(server) && !/require\(['"]@anthropic-ai\/sdk['"]\)/.test(server));

ok('PB2 server.js makes NO direct provider call — every model exit is a gateway call',
  !/\bclient\.messages\.create\s*\(/.test(server) && !/\.messages\.create\s*\(/.test(server));

// The whole repo, not just server.js: a second door opened anywhere else is the same defect.
const jsFiles = [];
for (const dir of ['ai', 'scripts', 'js']) {
  for (const f of fs.readdirSync(path.join(root, dir))) if (f.endsWith('.js')) jsFiles.push(`${dir}/${f}`);
}
jsFiles.push('server.js', 'db.js');
const offenders = jsFiles.filter(f => {
  if (APPROVED.includes(f) || f.startsWith('scripts/')) return false;   // suites may assert on the text
  let src; try { src = R(f); } catch (_) { return false; }
  return /new\s+Anthropic\s*\(/.test(src) || /\.messages\.create\s*\(/.test(src);
});
ok('PB3 …and nowhere else in the codebase opens a second one either',
  offenders.length === 0 || console.error('      offenders:', offenders.join(', ')) === undefined && offenders.length === 0);

ok('PB4 the gateway is the file that holds the client, so there is somewhere for the rule to live',
  /new\s+Anthropic\s*\(/.test(R('ai/gateway.js')));

/* ── 2. BEHAVIOURAL. The switch is load-bearing. ──
   The structural check above can be satisfied by a helper that wraps the same unsafe behaviour
   under a different name. These prove the gateway actually refuses. */
const ai = require('../ai/gateway.js');

ok('PB5 a key IS configured for this suite, so every refusal below is the gate acting rather than an unconfigured box',
  ai.enabled() === true);

(async () => {
  ai.setDeterministicOnly(true);
  let threw = null;
  try { await ai.complete({ user: 'hello', org: 'x', taskType: 'test' }); }
  catch (e) { threw = e.message; }
  ok('PB6 IN DETERMINISTIC-ONLY MODE NOTHING LEAVES THE BOX — with a key present and a caller asking, the gateway refuses',
    /deterministic-only/i.test(threw || ''));

  let searchThrew = null;
  try { await ai.searchWeb({ query: 'anything', org: 'x' }); }
  catch (e) { searchThrew = e.message; }
  ok('PB6b …and that covers web search too, which is a different egress with the same rule',
    /deterministic-only/i.test(searchThrew || ''));
  ok('PB6c …and the capability says so rather than failing silently when asked',
    ai.canSearchWeb() === false);
  ai.setDeterministicOnly(false);

  /* ── 3. BUDGET. An organisation that has spent its allowance does not reach the provider. ── */
  ai._resetGatewayState && ai._resetGatewayState();
  let drained = 0;
  while (ai._consumeBudget('boundary-test-org') && drained < 100000) drained++;
  ok('PB7 the per-organisation budget is finite and can be exhausted', drained > 0);

  let budgetErr = null;
  try { await ai.complete({ user: 'hello', org: 'boundary-test-org', taskType: 'test' }); }
  catch (e) { budgetErr = e; }
  ok('PB8 AN OVER-BUDGET ORGANISATION DOES NOT REACH THE PROVIDER — refused before the network, with a code a caller can act on',
    !!budgetErr && (budgetErr.code === 'LLM_BUDGET_EXHAUSTED' || /budget/i.test(budgetErr.message)));

  /* ── 4. THE ROUTES THEMSELVES, AND THE COUNT THIS CHECK USED TO GET WRONG.

     PB9 matched `await ai.complete(` and PB10 matched one exact literal string. Between them they
     reported 16 gateway calls of which 12 named an organisation — and both numbers were wrong,
     because the file holds THIRTY-FOUR model exits and the patterns missed `ai.completeJSON`,
     calls not preceded by `await`, and every attribution written any other way.

     That is worse than the hole it was hiding. A guard that reports 16 of 34 is not a lenient
     guard, it is a guard that will never see the next one — and its own pull request said the
     quiet part out loud: "a gate most calls go through is not a gate." The same sentence applies
     to the check.

     WHY IT MATTERS. An unattributed call spends from a bucket named `unattributed`, shared by
     every organisation on the deployment — so the per-org budget, whose entire purpose is that
     one org cannot starve the others, does not apply to those call sites at all. The telemetry is
     likewise unattributed.

     Counted properly now, with the true numbers frozen as a BILL that must shrink. ── */
  const calls = [...server.matchAll(/\bai\.(?:complete|completeJSON)\s*\(/g)];
  const attributed = calls.filter(m => {
    // The call's own argument object, by brace matching from the opening paren.
    let d = 0, end = m.index;
    for (let i = m.index + m[0].length - 1; i < server.length; i++) {
      if (server[i] === '(') d++;
      else if (server[i] === ')') { d--; if (d === 0) { end = i; break; } }
    }
    return /\borg:\s*[^,}]/.test(server.slice(m.index, end + 1));
  }).length;

  ok(`PB9 every model exit is counted, not just the ones an old pattern happened to match (found ${calls.length})`,
    calls.length >= 30);

  /* THE BILL. 21 call sites still spend from the shared `unattributed` bucket. They are recorded
     rather than hidden, and the number may only go DOWN — the check fails if it grows, which is
     what stops the next unattributed call being added silently. */
  const UNATTRIBUTED_DEBT = 14;
  const unattributed = calls.length - attributed;
  ok(`PB10 the unattributed debt does not GROW — ${unattributed} of ${calls.length} model exits still spend from the shared bucket every org draws on, which is the per-org budget not applying to them (bill: ${UNATTRIBUTED_DEBT})`,
    unattributed <= UNATTRIBUTED_DEBT);
  ok(`PB10b …and the majority ARE attributed, so the budget is a real instrument rather than a decoration (${attributed} of ${calls.length})`,
    attributed >= 21);

  console.log(`\nprovider-boundary-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
