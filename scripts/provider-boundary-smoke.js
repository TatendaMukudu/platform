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

  /* ── 4. ATTRIBUTION IS NOW REQUIRED, NOT DEFAULTED.

     The bill this check used to keep — "14 of 35 model exits are unattributed, and the number may
     only shrink" — was an honest record of a hole and a bad guarantee. An unattributed call fell
     into a bucket named `unattributed` that EVERY organisation drew on, so the per-org budget,
     whose whole purpose is that one org cannot starve the others, did not apply to those sites at
     all. A shrinking bill still leaves the failure live for as long as it takes to shrink.

     So the gateway refuses instead. A call with no organisation throws LLM_UNATTRIBUTED before it
     can reach a provider or consume a budget, and a caller that genuinely belongs to no
     organisation says so by passing PLATFORM_ORG — a visible token somebody can grep for, rather
     than an omission that looks identical to a mistake.

     Two things are checked, because the code rule and the source count fail differently: the
     REFUSAL is behavioural, and the source scan is what catches a new call site written without
     attribution before anybody runs it. ── */
  let unattributed = null;
  try { await ai.complete({ user: 'hello', taskType: 'no_org_test' }); }
  catch (e) { unattributed = e; }
  ok('PB9 A MODEL CALL WITH NO ORGANISATION IS REFUSED — missing attribution cannot silently return, because the bucket it used to fall into was shared by every organisation',
    !!unattributed && unattributed.code === 'LLM_UNATTRIBUTED');
  ok('PB9b …and the refusal names the fix rather than only the fault, so the next caller is not left guessing what to pass',
    /PLATFORM_ORG/.test(unattributed.message) && /no_org_test/.test(unattributed.message));

  let blank = null;
  try { await ai.complete({ user: 'hello', org: '   ', taskType: 'blank_org' }); }
  catch (e) { blank = e; }
  ok('PB9c …and whitespace is not attribution either — an empty string is the same omission with a value in front of it',
    !!blank && blank.code === 'LLM_UNATTRIBUTED');

  const platform = ai.PLATFORM_ORG;
  ok('PB9d a caller that genuinely belongs to no organisation says so DELIBERATELY, with a token somebody can grep for',
    typeof platform === 'string' && platform.length > 0);

  /* THE OTHER PROVIDER DOORS. complete() was never the only way out: understand() and
     transcribe() call the provider directly and had NO budget check at all — not the shared
     bucket, no bucket. Neither has a caller in the tree today, which is precisely why nobody
     noticed; the rule is applied so the FIRST one cannot arrive unmetered. */
  for (const [name, fn] of [['understand', () => ai.understand({ prompt: 'x' })],
                            ['transcribe', () => ai.transcribe(Buffer.from(''), {})],
                            ['searchWeb',  () => ai.searchWeb({ query: 'x' })]]) {
    let err = null;
    try { await fn(); } catch (e) { err = e; }
    ok(`PB9e ${name}() also refuses an unattributed call — complete() was never the only door out of this process`,
      !!err && (err.code === 'LLM_UNATTRIBUTED' || /deterministic-only/.test(err.message)));
  }

  /* THE SOURCE SCAN. Counts by brace-matching each call's own argument object, so it sees
     ai.completeJSON, calls without `await`, and attribution written any way at all — the previous
     patterns missed all three and reported 16 of 35 when the file held 35. A guard that reports
     less than half of what exists is not lenient, it is a guard that will never see the next one. */
  const calls = [...server.matchAll(/\bai\.(?:complete|completeJSON)\s*\(/g)];
  const missing = calls.filter(m => {
    let d = 0, end = m.index;
    for (let i = m.index + m[0].length - 1; i < server.length; i++) {
      if (server[i] === '(') d++;
      else if (server[i] === ')') { d--; if (d === 0) { end = i; break; } }
    }
    return !/\borg:\s*[^,}\s]/.test(server.slice(m.index, end + 1));
  });
  if (missing.length) {
    console.error('       unattributed call sites at lines:',
      missing.map(m => server.slice(0, m.index).split('\n').length).join(', '));
  }
  ok(`PB10 EVERY model exit in server.js names the organisation it is spending on (${calls.length} calls, ${missing.length} unattributed)`,
    calls.length >= 30 && missing.length === 0);
  console.log(`\nprovider-boundary-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
