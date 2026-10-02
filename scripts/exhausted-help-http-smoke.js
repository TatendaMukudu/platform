/* Truth layer — WHEN EVERYTHING THIS GROUP TRIED DID NOT WORK, THE NEXT MOVE IS A PERSON.

   ACCEPTANCE MATRIX 14. `_inquiryOptions` already knows the state: when the group has acted on a
   question and nothing recorded says it helped, it drops the "test the leading explanation" option
   and says in `because` that "more understanding or somebody else's help is" the useful next move.

   It then offered no way to get somebody else's help. The one place the product is entitled to say
   "stop varying the tactic" was also the one place it left a person with a shorter list and no next
   move — which reads as the system giving up, at precisely the moment it has the most standing to
   be useful.

   THE PRIVACY CONSTRAINT IS THE WHOLE DESIGN. Naming a person to ask is a disclosure. It must never
   name anybody the asker could not already address, so the option is resolved through
   `_contactsFor` — the existing owner of "the people you can address", bounded by the tree — and
   intersected with the people who actually hold standing on this node. Relationship is not
   readership; relevance is not authorisation. If that intersection is empty there is no option,
   because inventing somebody to ask would be worse than saying nothing.

   AND NOTHING IS SENT. The option is a read. It names who could be asked; it does not message
   them, does not create a Focus, and does not tell them they were suggested.

   Run: node scripts/exhausted-help-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'exh', NOW = Date.now(), DAY = 86400000;
const SQUAD = ['p1', 'p2', 'p3', 'p4', 'p5'];
const SIG = (w, n) => ({ kind: 'observation', status: 'active', source: w, originRef: `o_${w}_${n}`,
  at: NOW - 9 * DAY, turnId: `t_${w}_${n}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${w}_${n}`, contributedBy: w, text: 'we fade late' });

const INQ = id => ({
  inquiryId: id, subjectRef: 'group:n',
  topic: { canonicalConcept: 'f.late', label: 'How the last twenty go' }, status: 'exploring',
  hypotheses: [{ id: 'h1', statement: 'the legs go in the last twenty', supportRefs: SQUAD.map((w, i) => `ev_${w}_${i}`),
    challengeRefs: [], confidence: { score: 0.7, band: 'probable' }, status: 'open', createdAt: NOW }],
  leadingHypothesisId: 'h1', signals: SQUAD.map((w, i) => SIG(w, i)),
  confidence: { score: 0.7, band: 'probable', because: ['5 independent origins'] },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

/* A GROUP THAT HAS ALREADY ACTED ON THIS QUESTION, AND IT DID NOT HELP. */
const TRIED = (focusId, text, result) => ({
  focusId, nodeId: 'n', text, status: 'active', createdAt: NOW - 5 * DAY, by: 'coach',
  origin: { from: 'leader', by: 'coach', at: NOW - 5 * DAY, inquiryId: 'q1' },
  outcome: result ? { result, at: NOW - DAY, by: 'coach' } : null,
});

const BASE = {
  orgMeta: { [C]: { orgName: 'Alma', orgMode: 'sports' } },
  orgUsers: { [C]: Object.fromEntries([
    ...SQUAD.map((id, i) => [id, { id, name: `Player ${i + 1}`, email: `${id}@e.io`, role: 'member',
      orgCode: C, status: 'active', assignedNodeIds: ['n'], profileComplete: true }]),
    ['coach', { id: 'coach', name: 'Dana Coach', email: 'c@e.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true }],
    /* A LEADER OF A DIFFERENT NODE ENTIRELY. Relevant-sounding, and not this group's business. */
    ['far', { id: 'far', name: 'Far Leader', email: 'f@e.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['other'], assignedNodeIds: ['other'], profileComplete: true }],
    /* STILL LISTED AS A LEADER OF THIS NODE, AND NO LONGER HERE. Standing alone would name them;
       `_contactsFor` drops a removed person, and the intersection is the only thing standing
       between a member and the advice to go and ask somebody who left. */
    ['gone', { id: 'gone', name: 'Gone Leader', email: 'g@e.io', role: 'coach', orgCode: C,
      status: 'removed', leadershipNodeIds: ['n'], assignedNodeIds: ['n'], profileComplete: true }],
  ]) },
  orgNodes: { [C]: {
    n: { nodeId: 'n', name: 'First Team', parentId: null, childNodeIds: [],
      memberIds: [...SQUAD, 'coach'], leaderIds: ['coach', 'gone'] },
    other: { nodeId: 'other', name: 'Reserves', parentId: null, childNodeIds: [],
      memberIds: ['far'], leaderIds: ['far'] },
  } },
  inquiryStates: { [C]: { 'group:n': { q1: INQ('q1') } } },
  teamFocuses: { [C]: { n: [TRIED('tf_a', 'Extra fitness block on Tuesdays', 'no_change')] } },
};

_loadAllStores(JSON.parse(JSON.stringify(BASE)));
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, w === 'coach' || w === 'far' ? 'coach' : 'member')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, w) => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const readAs = async w => {
    const r = await call('GET', '/api/group/n/inquiry', undefined, w);
    const one = (((r.j || {}).inquiries) || []).find(x => x.inquiryId === 'q1') || null;
    return { status: r.status, inq: one, opts: (one && one.options) || null };
  };
  const helpOpt = o => ((o && o.options) || []).find(x => x && String(x.id || '').startsWith('ask_someone'));

  try {
    console.log('\n  A — THE STATE IS REACHED AT ALL');
    const p1 = await readAs('p1');
    ok('EH-A1 a member of the group reads the inquiry', p1.status === 200 && !!p1.inq);
    ok('EH-A2 the record holds a tactic that was tried about this question and did not help',
      (p1.inq.triedBefore || []).some(t => t.focusId === 'tf_a' && t.outcome === 'no_change'));
    ok('EH-A3 the kernel is in the state where another variation is not the honest next move',
      !!p1.opts && /somebody else's help/i.test(String(p1.opts.because))
      && !(p1.opts.options || []).some(x => x.id === 'test_explanation'));

    console.log('\n  B — SO IT ROUTES TO A PERSON, AND NAMES ONE');
    const h = helpOpt(p1.opts);
    ok('EH-B1 there is an option to bring in somebody with standing here', !!h);
    ok('EH-B2 …naming a real person by name and role, not "a leader"',
      !!h && /Dana Coach/.test(String(h.text)) && (h.basis.people || []).some(x => x.id === 'coach'));
    /* WHY THEM, IN THE SAME SHAPE AS EVERY OTHER OPTION: what it would teach, and what it does
       not establish. Asking somebody is not evidence either. */
    ok('EH-B3 …carrying its own basis, what it would teach, and what it does not settle',
      !!h && h.basis.sourceClass === 'people_with_standing'
      && typeof h.wouldTeach === 'string' && h.wouldTeach.length > 10
      && typeof h.uncertainty === 'string' && h.uncertainty.length > 10);
    ok('EH-B4 …and "learn more" is still there, so this is not a funnel',
      (p1.opts.options || []).some(x => x.id === 'learn_more'));

    console.log('\n  C — AND IT NAMES NOBODY THE ASKER COULD NOT ALREADY WRITE TO');
    const contacts = await call('GET', '/api/contacts', undefined, 'p1');
    const addressable = new Set((((contacts.j || {}).contacts) || []).map(x => x.id));
    ok('EH-C1 every person named is already addressable by the asker',
      !!h && (h.basis.people || []).every(x => addressable.has(x.id)));
    ok('EH-C2 …and a leader of a different node is not named, however senior',
      !!h && !(h.basis.people || []).some(x => x.id === 'far')
      && !/Far Leader/.test(JSON.stringify(p1.opts)));
    /* THE CASE THAT MAKES THE INTERSECTION LOAD-BEARING RATHER THAN DECORATIVE. `gone` still sits
       in this node's `leaderIds`, so standing alone would name them. They have left, so
       `_contactsFor` does not return them. Being told to go and ask somebody who is no longer
       here is the failure this filter exists to prevent, and without it nothing else catches it. */
    ok('EH-C2b …nor a leader of THIS node who has left, though the node still lists them',
      !!h && !(h.basis.people || []).some(x => x.id === 'gone')
      && !/Gone Leader/.test(JSON.stringify(p1.opts)));
    /* THE LEADER ASKING IS NOT TOLD TO ASK THEMSELVES. That is the answer the option would give
       if it simply listed the node's leaders without looking at who is reading. */
    const co = await readAs('coach');
    const ch = helpOpt(co.opts);
    ok('EH-C3 the leader of this group is never told to go and ask themselves',
      !ch || !(ch.basis.people || []).some(x => x.id === 'coach'));
    ok('EH-C4 …and with nobody else holding standing here, no option is invented for them',
      !ch);

    console.log('\n  D — NOTHING IS SENT, AND NOTHING IS CHOSEN');
    ok('EH-D1 the options payload still chooses nothing and ranks nothing',
      p1.opts.chosen === null && p1.opts.ranked === false);
    /* READING THIS IS A READ. Nobody is messaged, no Focus appears, and the person named is not
       told they were suggested. */
    const after = await readAs('p1');
    ok('EH-D2 reading it twice creates no Focus and changes nothing',
      (after.inq.triedBefore || []).length === (p1.inq.triedBefore || []).length);
    const named = await call('GET', '/api/inbox', undefined, 'coach');
    ok('EH-D3 the person named is not notified that they were suggested',
      named.status !== 200 || !JSON.stringify(named.j || {}).includes('last twenty'));

    console.log('\n  E — AND WHEN SOMETHING DID HELP, THIS IS NOT THE ADVICE');
    _loadAllStores(JSON.parse(JSON.stringify({ ...BASE,
      teamFocuses: { [C]: { n: [TRIED('tf_a', 'Extra fitness block on Tuesdays', 'better')] } } })));
    _rebuildEmailIndex();
    const better = await readAs('p1');
    ok('EH-E1 a tactic that helped leaves the group in a different state', !!better.opts);
    ok('EH-E2 …and nobody is told to escalate out of it', !helpOpt(better.opts));
    /* AND THE NEAREST NEGATIVE: recorded, but no outcome word yet. "Nothing recorded yet" is not
       "it did not work", and must not trigger the escalation. */
    _loadAllStores(JSON.parse(JSON.stringify({ ...BASE,
      teamFocuses: { [C]: { n: [TRIED('tf_a', 'Extra fitness block on Tuesdays', null)] } } })));
    _rebuildEmailIndex();
    const pending = await readAs('p1');
    ok('EH-E3 a tactic with no outcome recorded yet is not treated as one that failed',
      !helpOpt(pending.opts));

  } catch (e) { fail++; console.error('  FAIL exhausted-help suite threw:', e && e.stack); }

  server.close();
  console.log(`\nexhausted-help-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
