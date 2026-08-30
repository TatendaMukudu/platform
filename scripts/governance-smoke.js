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
const polarityOwner = read('ai/intelligence-feed.js');
const server    = read('server.js');
const voice     = read('ai/voice.js');

// The server + ai COMPUTATION layer, excluding the behaviour layer itself.
const aiFiles = fs.readdirSync(path.join(root, 'ai')).filter(f => f.endsWith('.js') && f !== 'behaviour.js').map(f => 'ai/' + f);
const computeLayer = ['server.js', ...aiFiles];

// 1 · behaviour is structurally pure — it cannot reason, read evidence, or change visibility.
ok('behaviour.js imports only the canonical polarity owner',
   [...behaviour.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]).join(',') === './intelligence-feed');

// 2 · delivery lives in behaviour: it owns plan() + opening().
ok('behaviour.js owns plan() + opening()', /function plan\s*\(/.test(behaviour) && /function opening\s*\(/.test(behaviour));

// 3 · polarity meaning and High/Low membership are DEFINED once in intelligence-feed.
/* Widened from three named files to EVERY module. The point of consolidating five vocabularies
   into one owner is that a sixth cannot appear, and an assertion watching only the three files we
   happened to think of would not notice the seventh.

   It looks for an AUTHORED table — a literal mapping a polarity value to a bucket — because that
   is the shape all five of the originals had. Reading the owner is exactly what we want, so
   aliasing POLARITY_BUCKET or calling bucketOf() is not a finding. A first draft of this check
   flagged `const bucket = polarityOwner.bucketOf(...)` in three modules; that was the assertion
   being wrong, not the code. */
ok('the polarity taxonomy is defined once — intelligence-feed owns High/Low membership, and no other module authors one',
   /const POLARITY_BUCKET = Object\.freeze/.test(polarityOwner) &&
   /function bucketOf\s*\(/.test(polarityOwner) &&
   aiFiles.filter(f => f !== 'ai/intelligence-feed.js').every(f => {
     const src = read(f);
     return !/const POLARITY_BUCKET\s*=\s*(Object\.freeze\s*\()?\{/.test(src)
       && !/['"]?(risk|friction|progress|milestone|opportunity|strength)['"]?\s*:\s*['"](high|low|worth_attention|needs_attention|working_well)['"]/.test(src);
   }) &&
   // …and the consumers actually go through the owner rather than quietly hardcoding a result.
   ['ai/behaviour.js', 'ai/scoped-intelligence-packet.js', 'ai/team-state.js', 'ai/priority-office.js']
     .every(f => /polarity(Owner)?\.(bucketOf|POLARITY_BUCKET)/.test(read(f))));

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

// 8 · D30: deterministic person-facing pattern and assessment prose has one owner.
ok('voice.js is the single owner of person-facing pattern prose',
   /const PATTERN_MESSAGES\s*=/.test(voice) && /const PATTERN_EXPLORE\s*=/.test(voice)
   && /const STRUCTURE_LABEL\s*=/.test(voice) && /const RATIO_LABEL\s*=/.test(voice)
   && aiFiles.filter(f => f !== 'ai/voice.js').every(f => {
     const src = read(f);
     return !/const (PATTERN_MESSAGES|MESSAGES|PATTERN_EXPLORE|EXPLORE|STRUCTURE_LABEL|RATIO_LABEL)\s*=\s*[{[]/.test(src);
   }));

console.log(`\ngovernance-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
