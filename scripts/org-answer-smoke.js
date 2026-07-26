/* Truth layer — SCOPED ORGANISATIONAL ANSWERING (pure). Proves explicit intent detection,
   grounded answers composed from the scoped org-state's own claims (never invented), honest
   limitations, owner-routing when it can't answer, and member-safe output (no ids/authority).
   No DB / AI / IO. Run: node scripts/org-answer-smoke.js */

const A = require('../ai/org-answer.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const soon = new Date(Date.now() + 3 * 86400000).toISOString();
const state = {
  requirements: [
    { id: 'e1:game_plan', claimType: 'game_plan', expectedOwner: 'coach', ownerBasis: 'role_responsibility', ownerUnresolved: false },
    { id: 'e1:availability', claimType: 'availability', expectedOwner: null, ownerBasis: 'unresolved', ownerUnresolved: true },
  ],
  claimStates: [
    { requirementId: 'e1:game_plan', claimType: 'game_plan', state: 'missing' },
    { requirementId: 'e1:availability', claimType: 'availability', state: 'known' },
  ],
  events: [{ id: 'e1', type: 'match', title: 'Cup Final', startAt: soon }],
};
const lead = { present: true, label: 'Coach Lead' };
const ask = (q, opts = {}) => A.answer({ question: q, state, areaLabel: 'your area', nodeLeader: lead, now: Date.now(), ...opts });

/* ── 1 · intent detection (explicit matcher) ── */
ok('1 · "what is outstanding?" → outstanding', A.classifyQuestion('what is outstanding?').intent === 'outstanding');
ok('1 · "who owns the game plan?" → ownership', A.classifyQuestion('who owns the game plan?').intent === 'ownership');
ok('1 · "are we ready?" → readiness', A.classifyQuestion('are we ready for the weekend?').intent === 'readiness');
ok('1 · "what are we preparing for?" → focus', A.classifyQuestion('what are we preparing for?').intent === 'focus');
ok('1 · "is the game plan done?" → claim_status', A.classifyQuestion('is the game plan done?').intent === 'claim_status');
ok('1 · an unrelated question → unknown', A.classifyQuestion('tell me a joke about football').intent === 'unknown');

/* ── 2 · grounded answers composed from scoped state (never invented) ── */
const outstanding = ask('what is still outstanding?');
ok('2 · outstanding lists the missing claim, not the known one', /game plan/i.test(outstanding.answer) && !/availability/i.test(outstanding.answer) && outstanding.answerable);
ok('2 · outstanding carries a structural basis + a limitation about scope', outstanding.basis.some(b => b.claimType === 'game plan') && outstanding.limitations.some(l => /confirmed in your area/i.test(l)));

ok('3 · claim_status reports the derived state ("not yet recorded")', /not yet recorded/i.test(ask('is the game plan sorted?').answer));
ok('3 · ownership names the responsible role', /owned by the coach/i.test(ask('who owns the game plan?').answer));
ok('3 · unassigned ownership is honest + routes to a lead', (() => { const r = ask('who owns availability?'); return /no one is currently assigned/i.test(r.answer) && r.routeTo && r.routeTo.to === 'Coach Lead'; })());
ok('3 · focus names the upcoming event', /Cup Final/.test(ask('what are we preparing for?').answer));
ok('3 · readiness summarises what still needs attention', /game plan/i.test(ask('are we ready?').answer));

/* ── 4 · routing when it can't answer (never guesses) ── */
const unknown = ask('what is the meaning of life?');
ok('4 · an unanswerable question routes to the area lead instead of guessing', unknown.answerable === false && unknown.routeTo && /Coach Lead/.test(unknown.answer));
const emptyScope = A.answer({ question: 'what is outstanding?', state: {}, areaLabel: 'your area', nodeLeader: lead });
ok('4 · an empty scope is honest + routes (no invented answer)', emptyScope.answerable === false && emptyScope.routeTo);
const noLead = A.answer({ question: 'what is the meaning of life?', state, areaLabel: 'your area', nodeLeader: { present: false } });
ok('4 · with no lead to route to, it stays honest (no fabricated target)', noLead.routeTo === null);

/* ── 5 · member-safe output — no ids, requirement ids, or authority metadata ── */
ok('5 · answers never leak requirement ids or authority internals', !/e1:game_plan|requirementId|expectedOwner|ownerBasis|"id":/.test(JSON.stringify([outstanding, ask('who owns the game plan?')])));

/* ── 6 · determinism ── */
ok('6 · the same question yields the same answer', JSON.stringify(ask('what is outstanding?')) === JSON.stringify(ask('what is outstanding?')));

console.log(`\norg-answer-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
