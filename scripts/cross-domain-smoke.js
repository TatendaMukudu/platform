/* Truth layer — ONE KERNEL, FOUR DOMAINS, AND NOTHING FORKS.

   AGENTS.md product law 9: "Universality. Patterns fire on any typed stream, domain-free." And
   the design law in ai/packs.js: "universal by default, vertical by addition. Vocabulary lives in
   packs; intelligence lives in the kernel."

   The claim those two sentences make is checkable, and it had never been checked end to end:
   THE SAME EVIDENCE, IN FOUR DIFFERENT DOMAINS, MUST PRODUCE THE SAME EPISTEMIC ANSWER. If a
   sports org and a school reach different confidence from identical records, then a sector
   package is a second reasoning engine wearing a vocabulary, and every claim this product makes
   about being domain-agnostic is a claim about one domain.

   So this file builds FOUR organisations — sports, education, business, nonprofit — with the
   same people, the same node shape and byte-identical evidence, and drives the real routes. What
   must differ is the WORDS. What must not differ is anything the kernel decided.

   Run: node scripts/cross-domain-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs'), path = require('path');
const packs = require('../ai/packs.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const NOW = Date.UTC(2026, 2, 10, 9, 0, 0), DAY = 86400000;
/* THE FOUR THE FOUNDER NAMES, plus universal as the control. A suite that ran two domains would
   prove two domains. */
const DOMAINS = ['sports', 'education', 'business', 'nonprofit', 'universal'];
const CODE = d => `xd${d.slice(0, 3)}`;

const SIG = (origin, at) => ({ kind: 'observation', status: 'active', source: 'record',
  originRef: origin, at, turnId: `t_${origin}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${origin}`, text: 'the same thing was noticed again' });

/* BYTE-IDENTICAL EVIDENCE IN EVERY DOMAIN. Built by one function so it cannot drift; if these
   ever differ between orgs the comparison below is measuring the fixture, not the kernel. */
const INQ = (subjectRef) => ({
  inquiryId: 'inq_same', subjectRef,
  topic: { canonicalConcept: 'general.consistency', label: 'Consistency' },
  status: 'exploring',
  hypotheses: [{ id: 'h1', statement: 'Something is moving in the same direction each time',
    confidence: { score: 0.6, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: 'h1',
  signals: [SIG('o_a', NOW - 3 * DAY), SIG('o_b', NOW - 2 * DAY)],
  confidence: { score: 0.6, band: 'probable', because: ['2 independent origins'] },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

const stores = { orgMeta: {}, orgUsers: {}, orgNodes: {}, inquiryStates: {} };
for (const d of DOMAINS) {
  const C = CODE(d);
  stores.orgMeta[C] = { orgName: `Org ${d}`, orgMode: d === 'universal' ? '' : d };
  stores.orgUsers[C] = {
    lead: { id: 'lead', name: 'A Leader', email: `l@${C}.io`, role: 'coach', orgCode: C, status: 'active', leadershipNodeIds: ['n1'] },
    one:  { id: 'one',  name: 'Person One', email: `1@${C}.io`, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    two:  { id: 'two',  name: 'Person Two', email: `2@${C}.io`, role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
  };
  stores.orgNodes[C] = { n1: { nodeId: 'n1', name: 'A Group', parentId: null, childNodeIds: [], memberIds: ['one', 'two'], leaderIds: ['lead'] } };
  stores.inquiryStates[C] = { 'group:n1': { inq_same: INQ('group:n1') } };
}
_loadAllStores(stores);
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (u, t) => fetch(base + u, { headers: { Authorization: `Bearer ${t}` } })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    console.log('\n  A — THE PACK IS A LENS, AND THERE IS ONLY ONE OF IT');
    ok('XD-A1 every domain resolves to the SAME pack object — there is no vertical reasoning engine to select',
      DOMAINS.every(d => packs.resolvePack(d) === packs.resolvePack('universal')));
    ok('XD-A2 …and the pack registry holds exactly one pack, so "vertical by addition" has not quietly become "vertical by branch"',
      Object.keys(packs.PACKS).length === 1 && !!packs.PACKS.universal);
    ok('XD-A3 the dimensions the kernel reasons over are the universal ones, not a domain\'s',
      DOMAINS.every(d => JSON.stringify(Object.keys(packs.resolvePack(d).dimensions))
        === JSON.stringify(Object.keys(packs.UNIVERSAL_DIMENSIONS))));

    console.log('\n  B — A DOMAIN ADDS WORDS, NEVER CONCEPTS');
    const universalKeys = JSON.stringify(Object.keys(packs.DOMAIN_VOCAB.universal).sort());
    for (const d of DOMAINS) {
      ok(`XD-B1 ${d} names the SAME set of concepts as universal — a vocabulary that can add a key can add an idea`,
        JSON.stringify(Object.keys(packs.DOMAIN_VOCAB[d] || packs.DOMAIN_VOCAB.universal).sort()) === universalKeys);
    }
    ok('XD-B2 …and the words themselves genuinely differ, or this suite is comparing a domain to itself',
      packs.DOMAIN_VOCAB.sports.person !== packs.DOMAIN_VOCAB.education.person
      && packs.DOMAIN_VOCAB.business.group !== packs.DOMAIN_VOCAB.nonprofit.group
      && packs.DOMAIN_VOCAB.sports.person !== packs.DOMAIN_VOCAB.universal.person);

    console.log('\n  C — THE SAME EVIDENCE REACHES THE SAME CONCLUSION IN EVERY DOMAIN');
    const readings = {};
    for (const d of DOMAINS) {
      const C = CODE(d);
      const r = await get('/api/group/n1/inquiry', issueToken('lead', C, 'coach'));
      readings[d] = r;
      ok(`XD-C0 ${d}: the group's inquiry is readable, so the comparison has something to compare`,
        r.status === 200 && !!r.j);
    }
    /* WHAT THE KERNEL DECIDED, stripped of every identifier that legitimately differs between
       organisations. If this is not identical across four domains, a sector package is deciding
       something it has no business deciding. */
    const epistemic = (j) => {
      const list = (j && (j.inquiries || (j.inquiry ? [j.inquiry] : []))) || [];
      return JSON.stringify(list.map(i => ({
        status: i.status,
        band: i.confidence && i.confidence.band,
        score: i.confidence && i.confidence.score,
        origins: i.independentOrigins,
        contributors: i.contributors,
        contested: i.contested,
        signals: Array.isArray(i.signals) ? i.signals.length : i.signals,
      })));
    };
    const first = epistemic(readings.sports.j);
    ok('XD-C1 the reading is not empty — an identical NOTHING across four domains would pass this section for free',
      first.length > 4 && /band/.test(first));
    for (const d of DOMAINS) {
      ok(`XD-C2 ${d} reaches byte-for-byte the same epistemic answer as sports from the same evidence`,
        epistemic(readings[d].j) === first);
    }

    console.log('\n  D — AND THE WORDS ARE THE PART THAT MOVES');
    const me = {};
    for (const d of DOMAINS) {
      const C = CODE(d);
      const r = await get('/api/auth/me', issueToken('one', C, 'member'));
      me[d] = r.j || {};
      ok(`XD-D0 ${d}: the session carries which vocabulary is in force, so output is attributable to it`,
        !!me[d].domain && typeof me[d].domain.id === 'string' && !!me[d].domain.vocab);
    }
    ok('XD-D1 four domains, four different resolved vocabularies',
      new Set(DOMAINS.map(d => me[d].domain.id)).size >= 4);
    ok('XD-D1b …and each one is told its OWN word for a person, from the same field the UI reads',
      me.sports.domain.vocab.person === 'player' && me.education.domain.vocab.person === 'student'
      && me.business.domain.vocab.person === 'team member' && me.nonprofit.domain.vocab.person === 'participant');
    ok('XD-D2 …and a sports org is told "player" where a school is told "student"',
      packs.DOMAIN_VOCAB.sports.person === 'player' && packs.DOMAIN_VOCAB.education.person === 'student');

    console.log('\n  E — NO KERNEL FILE KNOWS WHAT INDUSTRY IT IS IN');
    /* The check the design law actually makes. ai/packs.js is the one file allowed to name a
       domain, because naming them is its whole job. Anything else branching on one is a
       behaviour fork, and it is the shape a sector package would arrive in. */
    const aiDir = path.join(__dirname, '..', 'ai');
    const offenders = [];
    for (const f of fs.readdirSync(aiDir).filter(x => x.endsWith('.js') && x !== 'packs.js')) {
      const src = fs.readFileSync(path.join(aiDir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
      // A COMPARISON against a domain id, not a mention. `'sports'` in a list of labels is
      // vocabulary; `mode === 'sports'` is a fork.
      if (/(===|==|!==|!=)\s*['"](sports|education|business|nonprofit|clinical)['"]/.test(src)
        || /['"](sports|education|business|nonprofit|clinical)['"]\s*(===|==|!==|!=)/.test(src)) offenders.push(f);
    }
    if (offenders.length) console.error('      forks in:', offenders.join(', '));
    ok('XD-E1 no kernel module branches on a domain id — vocabulary lives in packs, intelligence lives in the kernel',
      offenders.length === 0);
    ok('XD-E1b …and the scan would have caught one, so its silence means something',
      (() => {
        const planted = "if (mode === 'education') { return 2; }";
        return /(===|==|!==|!=)\s*['"](sports|education|business|nonprofit|clinical)['"]/.test(planted);
      })());

    /* THE ONE BRANCH THAT EXISTS, named rather than hidden. server.js picks a pack NAME from an
       org's mode. It selects vocabulary and nothing else — resolvePack returns the universal pack
       whatever it is handed, which XD-A1 drives — so it is a label lookup rather than a fork. It
       is recorded here so that if it ever starts selecting behaviour, this assertion is where
       somebody has to come and change the story. */
    const SRV = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    const srvForks = (SRV.match(/(===|==|!==|!=)\s*['"](sports|education|business|nonprofit|clinical)['"]/g) || []).length;
    ok('XD-E2 the server has exactly ONE domain comparison, and it chooses a word rather than a behaviour',
      srvForks === 1 && /mode === 'sports' \? 'sports' : 'universal'/.test(SRV));

  } catch (e) { fail++; console.error('  FAIL cross-domain suite threw:', e && e.stack); }

  server.close();
  console.log(`\ncross-domain-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
