/* Truth layer — the Person Model + the Reason stage. Guards the three laws:
   privacy-by-construction (no raw text can enter), honesty (confidence-gated),
   and the org boundary (publicProjection leaks nothing private). Plain node. */

const pm     = require('../ai/person-model');
const agents = require('../ai/agents');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

// ── privacy-by-construction: only vocabulary tokens are ever stored ─────────
let m = pm.blankModel();
pm.update(m, { motivators: 'progress', communication: 'brief' });
pm.update(m, { overwhelmers: "I've been really struggling with my mum's illness" }); // raw text
ok('raw text/sentence is NOT stored (ignored)', Object.keys(m.overwhelmers).length === 0);
ok('unknown token is ignored', (pm.update(pm.blankModel(), { motivators: 'blockchain' }).motivators.blockchain === undefined));
ok('valid tokens are counted', m.motivators.progress === 1 && m.communication.brief === 1);

// ── honesty: understanding is confidence-gated (evidence floor) ─────────────
let m2 = pm.blankModel();
pm.update(m2, { motivators: 'teammates' });
pm.update(m2, { motivators: 'teammates' });
ok('below floor → not asserted', pm.understanding(m2).motivators === undefined);
pm.update(m2, { motivators: 'teammates' }); // now at floor (3)
ok('at floor → asserted with evidence', pm.understanding(m2).motivators?.value === 'teammates');
ok('isEvidenced true once a dimension clears the floor', pm.isEvidenced(m2) === true);

// tie → not asserted (we don't guess between equals)
let m3 = pm.blankModel();
['direct','direct','direct','gentle','gentle','gentle'].forEach(t => pm.update(m3, { communication: t }));
ok('a tie is NOT asserted (honest)', pm.understanding(m3).communication === undefined);

// ── the org boundary: publicProjection leaks NOTHING private ────────────────
const pub = pm.publicProjection(m2);
const pubStr = JSON.stringify(pub);
ok('publicProjection exposes no tokens/text', !/teammates|progress|brief|gentle|direct/.test(pubStr));
ok('publicProjection is only {hasModel, interactions}', Object.keys(pub).sort().join(',') === 'hasModel,interactions');
ok('publicProjection reflects that a model exists', pub.hasModel === true && pub.interactions >= 3);
ok('empty model → hasModel false', pm.publicProjection(pm.blankModel()).hasModel === false);

// ── REASON: internal, honest, no raw text ───────────────────────────────────
const DAY = 86400000, now = Date.now(), ago = d => now - d * DAY;
const dip = [[35,8],[30,8],[25,8],[6,3],[2,3]].map(([d,v]) => ({ t: ago(d), mood: v }));
const input = { id:'x', name:'X', now, moodSeries: dip, deviations: [] };

const rNone = agents.reason({ id:'y', name:'Y', now, moodSeries: [], deviations: [] });
ok('reason marks output internal', rNone.internal === true);
ok('reason is honest: no patterns → confidence "none"', rNone.confidence === 'none');

const r = agents.reason(input, { model: m2 });
ok('reason surfaces confidence-gated understanding', r.understanding.motivators?.value === 'teammates');
ok('reason output contains no raw member text', !/struggling|illness|mum/i.test(JSON.stringify(r)));

// ── Coach adaptation is style-only and stays lawful ─────────────────────────
const { system, user } = agents.coachReflectionPrompt({
  name:'A', values:['effort'], goals:['grow'], trajectory:'steady',
  understanding: { communication: { value:'brief', evidence:4 }, motivators: { value:'teammates', evidence:3 } },
});
ok('coach reflects learned style (brevity)', /2 sentences/i.test(system));
ok('coach still forbids scores with a model present', /no scores/i.test(system.toLowerCase()) || /No scores/.test(system));
ok('coach stays self-relative with a model present', /their own normal/i.test(system + user));

console.log(`\nperson-model-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
