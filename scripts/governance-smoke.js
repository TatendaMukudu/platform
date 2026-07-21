/* Truth layer — GOVERNANCE. The constitution as an ENFORCED law, not a doc.

   Proactive DELIVERY — grouping, ordering ("lead with a win"), volume caps, the
   opening greeting, and empty-state / silence — may exist in exactly ONE place:
   ai/behaviour.js. Projection (ai/proactive.js) owns the artifact + audience-safety
   and NO delivery. Every server surface CONSUMES the one pipeline; none recomputes
   proactive behaviour independently.

   This is the "architectural gravity" test: if a future engineer builds proactive
   delivery anywhere except the behaviour layer, this suite goes red. It scans the
   server + ai COMPUTATION layer (the frontend is a pure consumer and is excluded).

   Run:  node scripts/governance-smoke.js   (part of `npm test`) */

const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (_) { return ''; } };

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const behaviour = read('ai/behaviour.js');
const proactive = read('ai/proactive.js');
const server    = read('server.js');

// The server + ai COMPUTATION layer, excluding the behaviour layer itself.
const aiFiles = fs.readdirSync(path.join(root, 'ai')).filter(f => f.endsWith('.js') && f !== 'behaviour.js').map(f => 'ai/' + f);
const computeLayer = ['server.js', ...aiFiles];

// 1 · behaviour is structurally pure — it cannot reason, read evidence, or change visibility.
ok('behaviour.js imports nothing (pure delivery layer)', !/\brequire\s*\(/.test(behaviour));

// 2 · delivery lives in behaviour: it owns plan() + opening().
ok('behaviour.js owns plan() + opening()', /function plan\s*\(/.test(behaviour) && /function opening\s*\(/.test(behaviour));

// 3 · the bucket taxonomy (the grouping decision) is DEFINED only in behaviour.js.
ok('the bucket taxonomy is defined once — behaviour.js only',
   /worth_celebrating/.test(behaviour) && computeLayer.every(f => !/worth_celebrating/.test(read(f))));

// 4 · the attention OPENING greeting is composed only in behaviour.js.
ok('the opening greeting is composed once — behaviour.js only',
   /Good (morning|afternoon|evening)/.test(behaviour) && computeLayer.every(f => !/Good (morning|afternoon|evening)/.test(read(f))));

// 5 · projection (proactive.js) exports NO delivery verb — it owns visibility, not delivery.
{
  // Strip comments so a delivery word inside an explanatory comment isn't a false hit.
  const exportsBlock = (proactive.split('module.exports')[1] || '').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok('projection exports no delivery (plan/opening/attention/surface/composeOpening)',
     !/\b(plan|opening|attention|surface|composeOpening)\b/.test(exportsBlock));
}

// 6 · the server produces attention ONLY through the behaviour layer.
ok('server groups attention only via behaviour.plan',   /behaviour\.plan\s*\(/.test(server));
ok('server composes the opening only via behaviour.opening', /behaviour\.opening\s*\(/.test(server));

// 7 · /api/me/context is a CONSUMER — its `noticed` is derived from the pipeline flatten
//     (`_attInsights`), not recomputed from the detectors.
ok('me/context consumes the one pipeline (noticed derived from _proactiveInsights)',
   /_att\s*=\s*_proactiveInsights/.test(server) && /noticed = _attInsights\.map/.test(server));

console.log(`\ngovernance-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
