/* Truth layer — D-A1: A CLASSIFICATION IS NOT A PLACE IN THE HIERARCHY.

   A person may be a midfielder, a captain and a sophomore at once while sitting in exactly one
   place in the organisation. Before this, IntelliQ could express neither: an orgNode is a
   hierarchy position whose membership feeds visibleScope -> canSee -> admissible evidence, and a
   roleBinding is a SINGLETON responsibility that supersedes its previous holder. Modelling
   "Captains" as a node would have handed its members' evidence to whoever led it and promoted the
   captain to a leader.

   So a classification is a declared, non-authoritative label on an existing membership. What this
   suite exists to prove is mostly what it does NOT do:

     · it grants no visibility, no authority and no evidence admission
     · it makes nobody a leader
     · and one human wearing three labels remains ONE evidence origin, because origin counting has
       always been by originRef rather than by membership — three labels are not three witnesses

   Classifications are DECLARED organisational fact ("midfielder"), never inferred description
   ("avoids confrontation"). The latter is a claim with provenance and falsifiers, which is an
   Inquiry, and it stays there.

   Run: node scripts/classification-scope-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server');
const contribution = require('../ai/contribution');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'classify';
const mk = (id, role = 'member') => ({ id, name: id, email: `${id}@c.test`, role, status: 'active', assignedNodeIds: ['first'], leadershipNodeIds: [] });
S._loadAllStores({
  orgMeta: { [C]: { orgName: 'Classify FC' } },
  orgUsers: { [C]: { cap: mk('cap'), mid: mk('mid'), fwd: mk('fwd'), coach: mk('coach', 'coach'), out: mk('out') } },
  orgNodes: { [C]: {
    first: { nodeId: 'first', name: 'First Team', parentId: null, childNodeIds: [],
             memberIds: ['cap', 'mid', 'fwd'], leaderIds: ['coach'] },
    other: { nodeId: 'other', name: 'Other Squad', parentId: null, childNodeIds: [],
             memberIds: ['out'], leaderIds: [] },
  } },
});
S._rebuildEmailIndex();

const visibleBefore = JSON.stringify(S.getVisibleUserIds(C, 'coach').slice().sort());
const capVisibleBefore = JSON.stringify(S.getVisibleUserIds(C, 'cap').slice().sort());

S._setClassifications(C, 'first', 'cap', ['midfielder', 'captain', 'sophomore']);
S._setClassifications(C, 'first', 'mid', ['midfielder']);
S._setClassifications(C, 'first', 'fwd', ['forward']);
S._setClassifications(C, 'other', 'out', ['captain']);

/* ── IT EXPRESSES THE THING ──────────────────────────────────────────────── */
ok('K1 one person holds several classifications while sitting in one place',
  S._classificationsOf(C, 'cap').join(',') === 'captain,midfielder,sophomore');
ok('K2 a cohort is queryable across the organisation',
  S._membersWithClassification(C, 'midfielder').join(',') === 'cap,mid');
ok('K3 …and can be narrowed to one node, so cohorts do not silently span the org',
  S._membersWithClassification(C, 'captain', { nodeId: 'first' }).join(',') === 'cap');
ok('K4 an intersection of classifications is expressible — midfielders who are captains',
  S._membersWithClassification(C, 'midfielder').filter(u => S._classificationsOf(C, u).includes('captain')).join(',') === 'cap');

/* ── AND GRANTS NOTHING ──────────────────────────────────────────────────── */
ok('K5 classifying nobody wider: the leader sees exactly who they saw before',
  JSON.stringify(S.getVisibleUserIds(C, 'coach').slice().sort()) === visibleBefore);
ok('K6 …and a classified member sees no further than before',
  JSON.stringify(S.getVisibleUserIds(C, 'cap').slice().sort()) === capVisibleBefore);
ok('K7 a captain is not a leader — a label is not authority',
  S._isLeader(C, 'cap') === false);
ok('K8 sharing a classification across nodes does not join the two branches',
  !S.getVisibleUserIds(C, 'cap').includes('out') && !S.getVisibleUserIds(C, 'coach').includes('out'));

/* The structural guarantee, not a convention: the scope computation must never read this field.
   Comments stripped, so prose about the rule is not mistaken for a violation of it. */
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'ai', 'org-graph.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok('K9 the graph module that computes scope contains no reference to classifications',
    !/classification/i.test(src));
}

/* ── ONE HUMAN IS ONE ORIGIN ─────────────────────────────────────────────── */
const wearingThreeHats = [
  { status: 'contributed', contributorId: 'cap', originRef: 'cap_saturday', contributorRole: 'member' },
  { status: 'contributed', contributorId: 'cap', originRef: 'cap_saturday', contributorRole: 'member' },
  { status: 'contributed', contributorId: 'cap', originRef: 'cap_saturday', contributorRole: 'member' },
];
const verdict = contribution.shouldOpenGroupInquiry(wearingThreeHats);
ok('K10 one human with three classifications is ONE origin and cannot open an inquiry alone',
  verdict.open === false && verdict.independentOrigins === 1 && verdict.contributors === 1);

/* ── PERSISTENCE, AND NO SECOND STORE ────────────────────────────────────── */
const snapshot = JSON.parse(JSON.stringify(S._persistedStores()));
ok('K11 classifications ride the node they belong to — no store of their own',
  !('classifications' in snapshot) && !('orgClassifications' in snapshot)
  && !!snapshot.orgNodes[C].first.classifications);
delete S.orgNodes[C];
S._loadAllStores(snapshot);
ok('K12 …and survive a save and reload intact',
  S._classificationsOf(C, 'cap').join(',') === 'captain,midfielder,sophomore');

/* ── FAIL CLOSED, QUIETLY ────────────────────────────────────────────────── */
ok('K13 an unknown classification is an empty cohort, not an error and not everybody',
  S._membersWithClassification(C, 'goalkeeper').length === 0
  && S._membersWithClassification(C, '').length === 0);
ok('K14 a person with no classifications has none, rather than inheriting any',
  S._classificationsOf(C, 'coach').length === 0);
ok('K15 classifications are org-scoped and never cross a tenant boundary',
  S._membersWithClassification('other-org', 'captain').length === 0);

console.log(`\nclassification-scope-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
