/* Truth layer — PRIORITY CLOSURE: bound evidence identity, and the personal attention override.

   Two founder decisions, September 2026, and every assertion below is aimed at one way of getting
   them wrong:

     1. the model names an identifier, and "what the person was looking at" becomes a model's guess;
     2. the identifier is validated but against the wrong thing, so a page's claim about what is on
        screen chooses the subject of a written human judgement;
     3. something is written before the person confirmed it;
     4. a confirmed proposal writes twice, or a replayed one writes again;
     5. changing your mind overwrites the earlier call instead of superseding it;
     6. a private priority mark turns into a score, a level, or something other people can see.

   Run: node scripts/priority-closure-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs   = require('fs');
const path = require('path');
const actions = require('../ai/composer-actions.js');
const X = require('../ai/cross-evidence.js');
const P = require('../ai/priority-office.js');
const diagnose = require('../ai/diagnose.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };

const DAY = 86400000, NOW = Date.now();

/* ══ A — ONE VOCABULARY, ONE OWNER ═══════════════════════════════════════════════════════════ */
console.log('\n  A — THE RELATION VOCABULARY HAS ONE OWNER');
ok('PC-A1 the three words live in exactly one module',
  X.FOCUS_RELATIONS.join() === 'supports,undermines,unclear'
  && !/FOCUS_RELATIONS\s*=\s*Object\.freeze\(\[/.test(R('server.js'))
  && !/FOCUS_RELATIONS\s*=\s*Object\.freeze\(\[/.test(R('ai/composer-actions.js')));
ok('PC-A2 …the writer imports them rather than restating them',
  /const \{ FOCUS_RELATIONS \} = crossEvidence;/.test(R('server.js')));
ok('PC-A3 …and the ENFORCEMENT is still at the writer, where a proposal cannot walk around it',
  /FOCUS_RELATIONS\.includes\(String\(relation\)\)/.test(R('server.js')));

/* ══ B — THE MODEL MAY NOT AUTHOR AN IDENTIFIER ═══════════════════════════════════════════════
   Pure, at the grounding boundary: whatever the model writes into an id field is never read. */
console.log('\n  B — BOUND CONTEXT CHOOSES WHAT; THE MODEL MAY ONLY SUGGEST THE WORD');
const ctx = kind => ({ object: { kind: kind || 'focus', id: 'f1', label: 'Sleep before away games' },
  evidence: { ref: 'ev_bound', via: 'in_view' }, folders: [], groups: [], contacts: [] });
const propose = (args, context = ctx(), text = 'that backs up what I am doing') =>
  actions.ground(actions.normalize({ actions: [{ type: 'declare_focus_relation', arguments: args, reason: 'r' }] }, context),
    { text, priorMessages: [], context });

const wrongRef = propose({ relation: 'supports', evidenceRef: 'ev_SOMETHING_ELSE' });
ok('PC-B1 the model cannot supply a different evidenceRef — the bound one is used, its own discarded',
  wrongRef.actions[0] && wrongRef.actions[0].arguments.evidenceRef === 'ev_bound');
ok('PC-B2 …and that value is marked as resolved by the server, not stated by anybody',
  wrongRef.actions[0].argumentSources.evidenceRef === 'deterministically_resolved');
const wrongFocus = propose({ relation: 'supports', focusId: 'f_OTHER', objectId: 'f_OTHER' });
ok('PC-B3 the model cannot supply a different focus — no object identifier survives grounding at all',
  wrongFocus.actions[0] && !('focusId' in wrongFocus.actions[0].arguments)
  && !('objectId' in wrongFocus.actions[0].arguments));
ok('PC-B4 …the focus comes from the bound context when the proposal is built, and from nowhere else',
  /context:\s*context\.object\s*\?\s*\{\s*kind:\s*context\.object\.kind,\s*id:\s*context\.object\.id\s*\}/.test(R('server.js')));
ok('PC-B5 the relation IS the model\'s to propose, and is marked as its suggestion',
  wrongRef.actions[0].arguments.relation === 'supports'
  && wrongRef.actions[0].argumentSources.relation === 'model_suggested');
ok('PC-B6 …and when the person said the word themselves, it is recorded as theirs',
  (() => { const r = propose({ relation: 'undermines' }, ctx(), 'that undermines what I am trying to do');
    return r.actions[0].argumentSources.relation === 'user_stated'; })());

console.log('\n  C — THE CLOSED VOCABULARY, AT THE PROPOSAL AND AT THE WRITER');
const fourth = propose({ relation: 'probably_supports' });
ok('PC-C1 a fourth word never becomes a proposal', fourth.actions.length === 0);
ok('PC-C2 …and the person is asked which of the three it is, rather than one being chosen for them',
  /support what this focus is trying to do, undermine it, or is it unclear/i.test(String(fourth.needsClarification || '')));
ok('PC-C3 all three lawful words ground',
  X.FOCUS_RELATIONS.every(w => (propose({ relation: w }).actions[0] || {}).arguments?.relation === w));

console.log('\n  D — NO BOUND EVIDENCE, NO PROPOSAL, AND NO LIST OF HIDDEN REFS');
const unbound = { object: { kind: 'focus', id: 'f1' }, folders: [], groups: [], contacts: [] };
const none = propose({ relation: 'supports' }, unbound);
ok('PC-D1 with nothing bound, the action produces no proposal', none.actions.length === 0);
ok('PC-D2 …and the person is asked WHICH evidence rather than being guessed at',
  /which piece of evidence do you mean/i.test(String(none.needsClarification || '')));
ok('PC-D3 …and the action is not even OFFERED to the model, so it has nothing to guess with',
  !actions.available(unbound).some(a => a.type === 'declare_focus_relation')
  && actions.available(ctx()).some(a => a.type === 'declare_focus_relation'));
ok('PC-D4 …the model is told only WHETHER one is bound — never which, and never what it says',
  (() => { const p = JSON.parse(actions.prompt({ text: 'x', context: ctx() }));
    const blob = JSON.stringify(p);
    return p.currentContext.evidenceInView === true && !blob.includes('ev_bound'); })());
ok('PC-D5 …and with none bound the flag says so',
  JSON.parse(actions.prompt({ text: 'x', context: unbound })).currentContext.evidenceInView === false);

console.log('\n  E — THE PRIORITY MARK CARRIES NO ARGUMENTS FOR A MODEL TO FILL IN');
const pri = (type, args = {}) => actions.ground(
  actions.normalize({ actions: [{ type, arguments: args, reason: 'r' }] }, ctx('inquiry')),
  { text: 'prioritise this', priorMessages: [], context: ctx('inquiry') });
ok('PC-E1 "prioritise this" grounds with no target the model could have chosen',
  (() => { const r = pri('prioritise_object', { objectId: 'SOMETHING_ELSE', ref: 'inquiry:other', priority: '9' });
    const a = r.actions[0]; return a && Object.keys(a.arguments).length === 0; })());
ok('PC-E2 …and so does its undo',
  (() => { const a = pri('unprioritise_object', { objectId: 'X' }).actions[0];
    return a && Object.keys(a.arguments).length === 0; })());
ok('PC-E3 there is no numeric priority anywhere in the vocabulary — no levels, no score, no rank',
  !/priority:\s*\d|high\/medium\/low|'high'\s*,\s*'medium'|priorityLevel|priorityScore/i.test(R('ai/composer-actions.js'))
  && !/priorityLevel|priorityScore/i.test(R('server.js')));
ok('PC-E4 both priority actions require confirmation, like every other action that writes',
  actions.ACTIONS.prioritise_object.confirmation === true
  && actions.ACTIONS.unprioritise_object.confirmation === true);
ok('PC-E5 …which is the EXISTING law, not an exception: every writing action confirms, every read does not',
  (() => {
    const READS = ['inspect_inquiry', 'show_evidence', 'request_research', 'navigate_to_object'];
    return Object.entries(actions.ACTIONS).every(([t, a]) => a.confirmation === !READS.includes(t));
  })());
/* A SUBSTRING IS NOT A KEY. The first version of this asked `map.includes(type + ':')`, and
   `unprioritise_object:` contains `prioritise_object:` — so deleting the prioritise label left it
   green. Anchored to a real key boundary now. */
ok('PC-E6 every action in the vocabulary has a human label — no identifier reaches a confirm card',
  (() => { const src = R('server.js');
    const map = src.slice(src.indexOf('create_focus: \'Start this focus\''), src.indexOf('})[c.type] || c.type'));
    return map.length > 200
      && Object.keys(actions.ACTIONS).every(t => new RegExp(`(^|[^A-Za-z0-9_])${t}:`).test(map)); })());

/* ══ HTTP ════════════════════════════════════════════════════════════════════════════════════ */
const C = 'pcx';
const sig = (ref, origin, at, extra = {}) => ({ ref, originRef: origin, status: 'active', at, ...extra });
const users = {
  p1:  { id: 'p1', name: 'Player One', email: 'pc1@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
  out: { id: 'out', name: 'Other Squad', email: 'pco@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n2'] },
};
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: users },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['p1'], leaderIds: [] },
                     n2: { nodeId: 'n2', name: 'Reserves', memberIds: ['out'], leaderIds: [] } } },
  inquiryStates: { [C]: {
    'member:p1': {
      q1: { inquiryId: 'q1', topic: { label: 'Recovery between games' }, status: 'open',
        signals: [sig('ev1', 'o_p1', NOW - 30 * DAY), sig('ev2', 'o_coach', NOW - DAY)],
        hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
      q2: { inquiryId: 'q2', topic: { label: 'Travel and academics' }, status: 'open',
        signals: [sig('only1', 'o_p1', NOW - 2 * DAY)],
        hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
    },
    'member:out': {
      s1: { inquiryId: 's1', topic: { label: 'Reserves fitness' }, status: 'open',
        signals: [sig('secret_ev', 'o_out', NOW - DAY)],
        hypotheses: [], confidence: { band: 'emerging', because: [] }, missingSignals: [] },
    },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (m, u, t, b) => fetch(base + u, { method: m,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const T = {}; Object.keys(users).forEach(id => { T[id] = issueToken(id, C, 'member'); });

  try {
    console.log('\n  F — BOUND EVIDENCE, OVER HTTP');
    const mk = await req('POST', '/api/me/focus', T.p1, { text: 'Sleep before away games', addressesKind: 'inquiry', addressesId: 'q1' });
    const fid = mk.j && mk.j.focus && mk.j.focus.id;
    ok('PC-F1 a focus exists to declare against', !!fid);

    /* THE TURN IS THE BINDING. `evidenceRef` on the turn is the page's claim about what is on
       screen; the server checks it against the reader's own authorised objects before it means
       anything. Asserted through the ACTION CONTEXT the turn builds, which is the thing the model
       is handed. */
    const turn = (b) => req('POST', '/api/assistant/turn', T.p1, b);
    const bound = await turn({ text: 'does that back up what I am working on?',
      about: { kind: 'inquiry', id: 'q1' }, surface: 'inquiry', evidenceRef: 'ev1' });
    ok('PC-F2 a turn naming evidence the reader CAN see is accepted', bound.status === 200);
    const foreign = await turn({ text: 'does that back it up?',
      about: { kind: 'inquiry', id: 'q1' }, surface: 'inquiry', evidenceRef: 'secret_ev' });
    ok('PC-F3 …and one naming another person\'s evidence binds nothing and names nothing',
      foreign.status === 200 && !JSON.stringify(foreign.j).includes('secret_ev'));
    const invented = await turn({ text: 'does that back it up?',
      about: { kind: 'inquiry', id: 'q1' }, surface: 'inquiry', evidenceRef: 'ev_does_not_exist' });
    ok('PC-F4 …and an invented ref is not an error a caller can probe with — it simply binds nothing',
      invented.status === 200 && !JSON.stringify(invented.j).includes('ev_does_not_exist'));

    /* WHAT THE BINDING ACTUALLY DID, OBSERVED END TO END. Everything above watches for leaks; this
       watches the decision, and it watches it by CONFIRMING and reading what got written -- the
       only observation that cannot be satisfied by a proposal that looks right and does something
       else. The public projection of a proposal deliberately carries no payload (the payload is
       server-side and frozen), so the written record is the evidence.

       A control REQUESTS the action deterministically, so no model is involved and what comes back
       is a direct read of what the server bound. */
    const ask = (evidenceRef, args = { relation: 'supports' }) => turn({ text: 'that supports what I am doing',
      about: { kind: 'focus', id: fid }, surface: 'focus', evidenceRef,
      requestedAction: { type: 'declare_focus_relation', arguments: args } });
    const props = r => ((r.j && r.j.response && r.j.response.proposedActions) || [])
      .filter(p => p.actionType === 'declare_focus_relation');

    const onAddressed = await ask('ev1');
    ok('PC-F5 evidence on the question the focus ADDRESSES binds — a focus carries no records of its own',
      props(onAddressed).length === 1);
    ok('PC-F6 …and it is marked as needing confirmation, not done',
      props(onAddressed)[0].requiredApproval === true);
    ok('PC-F7 …and NOTHING is written by proposing it',
      ((await req('GET', `/api/objects/focus/${fid}/related`, T.p1)).j.relations || []).length === 0);

    /* THE SMUGGLE. A caller states a DIFFERENT evidence ref in the action's own arguments while the
       turn is bound to `ev1`. The founder's law says the server supplies the identifier: what gets
       written must be the bound one, whatever the arguments said. */
    const smuggle = await ask('ev1', { relation: 'supports', evidenceRef: 'only1', focusId: 'f_other' });
    const smuggled = props(smuggle)[0];
    ok('PC-F8 a proposal naming different identifiers in its own arguments is still made', !!smuggled);
    const confirmed = await req('POST', `/api/assistant/turn/${smuggle.j.turnId}/confirm`, T.p1,
      { proposalId: smuggled.id });
    ok('PC-F9 …and confirming it writes the BOUND evidence, not the one the arguments named',
      confirmed.status === 200 && confirmed.j.relation && confirmed.j.relation.ref === 'ev1');
    ok('PC-F10 …against the BOUND focus, on which it is now readable',
      ((await req('GET', `/api/objects/focus/${fid}/related`, T.p1)).j.relations || [])
        .some(r => r.ref === 'ev1' && r.relation === 'supports' && r.declaredVia === 'confirmation'));
    ok('PC-F11 …and it wrote exactly once',
      ((await req('GET', `/api/objects/focus/${fid}/related`, T.p1)).j.relations || []).length === 1);
    const replay = await req('POST', `/api/assistant/turn/${smuggle.j.turnId}/confirm`, T.p1,
      { proposalId: smuggled.id });
    ok('PC-F12 …and a replayed confirmation is refused rather than writing again',
      replay.status === 409 && ((await req('GET', `/api/objects/focus/${fid}/related`, T.p1)).j.relations || []).length === 1);

    const elsewhere = await ask('only1');
    ok('PC-F13 a record this reader CAN see but which belongs to an unrelated object does not bind',
      props(elsewhere).length === 0);
    // The clarification is the REPLY, not a side channel — it is what the person actually reads.
    ok('PC-F14 …and they are asked which evidence they mean rather than having one chosen for them',
      /which piece of evidence do you mean/i.test(String((elsewhere.j.response || {}).responseText || '')));
    const nothingNamed = await ask(undefined);
    ok('PC-F15 with two records in the neighbourhood and none named, nothing is guessed at',
      props(nothingNamed).length === 0);

    /* A SECOND FOCUS, so the direct door is exercised on a clean record. Sharing one with the
       confirmed-proposal block above would make every count below depend on what that block did,
       and a count that means two things is a count that proves neither. */
    console.log('\n  G — THE DIRECT DOOR, AND WHAT CHANGING YOUR MIND DOES');
    const mk2 = await req('POST', '/api/me/focus', T.p1, { text: 'Earlier nights midweek', addressesKind: 'inquiry', addressesId: 'q1' });
    const gid = mk2.j && mk2.j.focus && mk2.j.focus.id;
    const relations = async () => ((await req('GET', `/api/objects/focus/${gid}/related`, T.p1)).j || {}).relations || [];
    ok('PC-G1 a second focus starts with nothing declared on it', !!gid && (await relations()).length === 0);

    // The direct control, which is the door a screen will use.
    const direct = await req('POST', `/api/objects/focus/${gid}/evidence-relation`, T.p1,
      { evidenceRef: 'ev1', relation: 'supports' });
    ok('PC-G2 an authorised human can declare it directly', direct.status === 200);
    ok('PC-G3 …and it is readable back, by ref and word only',
      (await relations()).some(r => r.ref === 'ev1' && r.relation === 'supports'));
    const changed = await req('POST', `/api/objects/focus/${gid}/evidence-relation`, T.p1,
      { evidenceRef: 'ev1', relation: 'unclear' });
    ok('PC-G4 changing your mind SUPERSEDES the earlier call and keeps it — history is preserved',
      changed.status === 200 && (await relations()).some(r => r.supersededBy === 'unclear')
      && (await relations()).some(r => r.relation === 'unclear' && !r.supersededAt));
    const same = await req('POST', `/api/objects/focus/${gid}/evidence-relation`, T.p1,
      { evidenceRef: 'ev1', relation: 'unclear' });
    ok('PC-G5 …and saying the same thing twice writes once, not twice',
      same.j.already === true && (await relations()).filter(r => r.relation === 'unclear').length === 1);
    const unseen = await req('POST', `/api/objects/focus/${gid}/evidence-relation`, T.p1,
      { evidenceRef: 'secret_ev', relation: 'supports' });
    ok('PC-G6 evidence this person cannot see is "not found", never "wrong ref" — no existence oracle',
      unseen.status === 404);

    console.log('\n  H — THE PERSONAL ATTENTION OVERRIDE');
    const attention = async (t = T.p1) => ((await req('GET', '/api/me/attention', t)).j || {}).items || [];
    const before = await attention();
    ok('PC-H1 before any mark, nothing is there because a human said so',
      !before.some(r => r.reason === 'explicitly_prioritised'));

    const mark = await req('POST', '/api/objects/inquiry/q2/priority', T.p1, { prioritised: true });
    ok('PC-H2 a person can mark something as one to keep near the top',
      mark.status === 200 && mark.j.prioritised === true && mark.j.ref === 'inquiry:q2');
    ok('PC-H3 …and is told plainly that it is theirs alone and changes nothing about who can see it',
      /yours alone/i.test(String(mark.j.note || '')) && /who can see/i.test(String(mark.j.note || '')));

    const after = await attention();
    const top = after[0];
    ok('PC-H4 …and it now comes FIRST — nothing outranks somebody saying so',
      !!top && top.ref === 'inquiry:q2' && top.reason === 'explicitly_prioritised');
    ok('PC-H5 …with a reason that says the PERSON marked it, not the organisation',
      top.detail && top.detail.byYou === true && /^You marked this/.test(String(top.why || ''))
      && !/\b(we|the club|the team|the organisation|your coach)\b/i.test(String(top.why || '')));
    ok('PC-H6 …and it is still not a score: no number, no level, no rank on the row',
      !('score' in top) && !('weight' in top) && !('priority' in top) && !('level' in top)
      && !/\d/.test(String(top.why || '')));

    console.log('\n  I — PRIVATE, AND STRUCTURALLY SO');
    const q2Before = (await req('GET', '/api/objects/inquiry/q2/thread?scope=self', T.p1)).j;
    ok('PC-I1 the marked object reports the mark back to its owner', q2Before.prioritised === true);
    ok('PC-I2 …and marking changed nothing about its visibility or audience',
      q2Before.shared === false && q2Before.forumAvailable === false);
    const theirs = await attention(T.out);
    ok('PC-I3 …and nobody else sees it, in their list or anywhere near it',
      !JSON.stringify(theirs).includes('q2') && !JSON.stringify(theirs).includes('Travel and academics'));
    const steal = await req('POST', '/api/objects/inquiry/q2/priority', T.out, { prioritised: true });
    ok('PC-I4 …and another reader cannot mark an object they cannot open', steal.status === 404);
    const theirsAfter = await attention(T.out);
    ok('PC-I5 …their own list is unmoved by any of it',
      JSON.stringify(theirsAfter) === JSON.stringify(theirs));

    console.log('\n  J — THE MARK COMES OFF');
    const off = await req('POST', '/api/objects/inquiry/q2/priority', T.p1, { prioritised: false });
    ok('PC-J1 unmarking is one call and says what it did',
      off.status === 200 && off.j.prioritised === false && /ordinary ordering/i.test(String(off.j.note || '')));
    const back = await attention();
    ok('PC-J2 …and the ordering returns to what the record alone says',
      !back.some(r => r.reason === 'explicitly_prioritised'));
    ok('PC-J3 …the object itself is untouched by either act',
      (await req('GET', '/api/objects/inquiry/q2/thread?scope=self', T.p1)).j.prioritised === false);
    const vague = await req('POST', '/api/objects/inquiry/q2/priority', T.p1, {});
    ok('PC-J4 a caller who does not SAY which way is refused — a missing field is not "off"',
      vague.status === 400);
    const nowhere = await req('POST', '/api/objects/inquiry/q_nope/priority', T.p1, { prioritised: true });
    ok('PC-J5 …and an object that is not there is not found', nowhere.status === 404);

    console.log('\n  K — ONE OWNER, NO NEW STORE');
    const src = R('server.js');
    ok('PC-K1 exactly one function writes the priority marker',
      (src.match(/mem\.prioritised\s*=/g) || []).length === 1
      && /function _setPersonalPriority/.test(src));
    ok('PC-K2 …and both doors end at it: the route and the confirmed composer action',
      (src.match(/_setPersonalPriority\(/g) || []).length === 3);
    ok('PC-K3 no Priority object, kind or store was created',
      !/priorityStates|orgPriorities|priorityStore|kind:\s*'priority'/.test(src)
      && !X.KINDS.includes('priority'));
    ok('PC-K4 the Priority Office only READS the marker — it never writes one',
      !/prioritised\s*=|marked\s*\.push|markedSet\.add/.test(R('ai/priority-office.js')));
    ok('PC-K5 the canonical object kinds are unchanged', X.KINDS.join() === 'focus,inquiry,high,low');

    console.log('\n  L — A -> B -> NEXT STILL WORKS');
    await req('POST', '/api/me/focus/outcome', T.p1, { focusId: fid, outcome: 'helped' });
    const next = await attention();
    const q1row = next.find(r => r.ref === 'inquiry:q1');
    ok('PC-L1 after the work is closed out, the still-open question it addressed comes up',
      !!q1row && [q1row.reason, ...(q1row.alsoBecause || [])].includes('unresolved_after_focus_outcome'));
    ok('PC-L2 …and the declared relation survived all of it, superseded call included',
      (await relations()).length === 2);
    ok('PC-L3 …and nothing was settled by any of this',
      (await req('GET', '/api/objects/inquiry/q1/thread?scope=self', T.p1)).status === 200
      && !next.some(r => r.reason === 'explicitly_prioritised'));
  } catch (e) { fail++; console.error('  FAIL priority-closure suite threw:', e && e.stack); }

  server.close();
  console.log(`\npriority-closure-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
