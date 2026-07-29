/* Truth layer — the node-aware BRIEF composer (pure). Proves it composes, never reasons:
   leader and member get different shapes and offer sets; every offer is on the allow-list
   and proposal-gated; items come ONLY from the reads it's given (never fabricated); an offer
   appears only when its input is present; empty inputs → an honest steady brief with no made-
   up items; and it's deterministic. No DB / AI / IO. Run: node scripts/brief-smoke.js */

const B = require('../ai/brief.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const actions = b => b.offers.map(o => o.action);

/* ── 1 · a LEADER with attention + a positive read + practices ── */
const leader = B.compose({
  level: 'leader', name: 'Tyler', timeOfDay: 'afternoon', areaLabel: 'the under-18s',
  reads: [
    { text: "Joe's momentum is below his own normal.", meta: 'emerging', polarity: 'risk' },
    { text: 'Ada has been climbing back.', meta: 'emerging', polarity: 'progress' },
  ],
  practices: ['Thursday video sessions are how we operate.'],
});
ok('1 · the greeting uses the time of day + name', /^Afternoon Tyler\./.test(leader.opening));
ok('1 · the reads become items (not invented)', leader.items.some(i => /Joe's momentum/.test(i.text)));
ok('1 · a leader is offered the grounded report + setting an assessment', actions(leader).includes('report') && actions(leader).includes('set_assessment'));
ok('1 · a positive read unlocks a "recognise" offer', actions(leader).includes('recognise'));
ok('1 · a confirmed practice is surfaced as "what\'s driving it"', leader.items.some(i => /driving it/.test(i.text)));

/* ── 2 · a MEMBER gets a different shape + offer set ── */
const member = B.compose({
  level: 'member', name: 'Sam', timeOfDay: 'morning',
  reads: [{ text: 'This skill has felt tough lately.', meta: 'tentative' }],
  practices: ['Small-sided games helped four teammates here.'],
  routeTo: { label: 'Coach Ada' },
});
ok('2 · a member greeting reads for them, not the team', /^Morning Sam\./.test(member.opening) && !/steady — nothing/.test(member.opening));
ok('2 · a member is offered peer methods + a personal assessment', actions(member).includes('peer_methods') && actions(member).includes('self_assessment'));
ok('2 · with a router target, a member is offered a route to that person', actions(member).includes('ask_help') && member.offers.find(o => o.action === 'ask_help').text.includes('Coach Ada'));
ok('2 · a member is NOT offered leader-only actions', !actions(member).includes('set_assessment') && !actions(member).includes('report'));

/* ── 3 · an offer appears only when its input is present ── */
const noRoute = B.compose({ level: 'member', reads: [{ text: 'x' }], practices: [] });
ok('3 · no router target → no "ask help" offer; no practices → no "peer methods"', !actions(noRoute).includes('ask_help') && !actions(noRoute).includes('peer_methods'));

/* ── 4 · empty inputs → an honest, steady brief with NO fabricated items ── */
const quiet = B.compose({ level: 'leader', name: 'Tyler', areaLabel: 'your area' });
ok('4 · nothing to raise → a calm, honest opening', /steady — nothing needs you this second/.test(quiet.opening));
ok('4 · …and no items are invented', quiet.items.length === 0);

/* ── 5 · every offer is on the allow-list AND proposal-gated (never acts) ── */
ok('5 · all offers across leader + member are allow-listed and require confirmation', leader.safe === true && member.safe === true && [...leader.offers, ...member.offers].every(o => o.requiresConfirmation === true));

/* ── 6 · a leader rollup headline leads the opening when provided ── */
const rolled = B.compose({ level: 'leader', name: 'Tyler', rollupHeadline: 'your org has had a strong week', reads: [{ text: 'one thing', meta: 'x' }] });
ok('6 · a provided rollup headline leads the opening', /strong week/.test(rolled.opening));

/* ── 7 · determinism ── */
ok('7 · identical inputs → identical brief', JSON.stringify(B.compose({ level: 'member', name: 'Sam', reads: [{ text: 'x' }] })) === JSON.stringify(B.compose({ level: 'member', name: 'Sam', reads: [{ text: 'x' }] })));

/* ── 8 · ACCOMMODATIONS — an accepted self-model setting actually reshapes the brief ── */
// pin_view: the view the person opens daily is now waiting, pinned, at the very top.
const noPref = B.compose({ level: 'member', name: 'Sam', reads: [{ text: 'a real read', meta: 'x' }] });
const pinned = B.compose({ level: 'member', name: 'Sam', reads: [{ text: 'a real read', meta: 'x' }], prefs: { pin_view: "Marcus's graph" } });
ok('8 · with no accepted accommodation, nothing is pinned', !noPref.items.some(i => i.pinned) && (noPref.applied || []).length === 0);
ok('8 · an accepted pin_view puts that view at the TOP of the brief', pinned.items[0].pinned === true && /Marcus's graph/.test(pinned.items[0].text));
ok('8 · …and the brief reports the accommodation as applied (transparency)', pinned.applied.includes('pin_view'));

// own_assessment_first: the personal-assessment offer is promoted ahead of the rest.
const promoted = B.compose({ level: 'member', name: 'Sam', reads: [{ text: 'x' }], practices: ['peer thing helped'], prefs: { own_assessment_first: true } });
ok('8 · an accepted own_assessment_first promotes the self-assessment offer to first', promoted.offers[0].action === 'self_assessment' && promoted.applied.includes('own_assessment_first'));

// a leader accommodation (readiness_first) only applies at leader level.
const memberReadiness = B.compose({ level: 'member', name: 'Sam', reads: [{ text: 'x' }], prefs: { readiness_first: true } });
ok('8 · a leader-only accommodation does not apply to a member', !memberReadiness.applied.includes('readiness_first'));

// still governed: promoting an offer never adds one off the allow-list or un-gates it.
ok('8 · applying accommodations never breaks the offer safety contract', pinned.safe === true && promoted.safe === true);

console.log(`\nbrief-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
