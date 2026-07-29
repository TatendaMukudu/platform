/* Truth layer — THE REASONER / belief ledger (pure). Proves the layer ABOVE the
   snapshot detector: observations accumulate into hypotheses held provisionally;
   confidence is evidence-volume net of counter-evidence; a progress signal CONTESTS
   the matching risk belief; silence lets a belief go dormant; the same risk across
   people in a scope becomes ONE shared hypothesis; each belief carries what would
   refute it; the register (support / scout / acknowledge) encodes "a time and a
   place"; every proposal is proposal-gated (surface, never act); claims never leak a
   score or a quote; and the fold is deterministic + persists across ticks.
   No DB / AI / IO. Run: node scripts/reason-smoke.js */

const R = require('../ai/reason.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const DAY = 86400000;
const now = Date.parse('2026-07-27T00:00:00Z');
const d = n => now - n * DAY;                          // n days ago
const SCORE_RE = /\d(?:\.\d)?\s*\/\s*5\b|\b\d{1,3}\s*%/; // "3.4/5", "60%" — a private metric
const QUOTE_RE = /[“"«][^”"»]{25,}[”"»]/;               // a long verbatim quotation
const byId = (arr, id) => arr.find(x => (x.id || x.beliefId) === id);

/* ── Tick A — accumulation, register, readiness, shared, progress, dormancy ──
   joe: momentum dropping (3 recent signals)          → emerging, wellbeing → ripe SUPPORT
   ann: momentum dropping (1 recent signal)           → tentative           → HELD (thin)
   kim: plateau (4 recent signals, growth axis)       → emerging, perf      → ripe SCOUT
   sam: recovering (3 recent signals)                 → progress            → ripe ACKNOWLEDGE
   old: momentum dropping 30+ days ago                → no fresh signal      → DORMANT      */
const tickA = R.reason({
  now, scopeLabel: { teamA: 'Team A' },
  observations: [
    { id: 'jm1', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'mood 2.8/5 over two weeks', t: d(10) },
    { id: 'jm2', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'mood dip continuing', t: d(6) },
    { id: 'jm3', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', severity: 'high',   basis: 'mood 2.3/5', t: d(2) },
    { id: 'am1', subjectId: 'ann', subjectName: 'Ann', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'mood softening', t: d(3) },
    { id: 'kp1', subjectId: 'kim', subjectName: 'Kim', scope: 'teamA', kind: 'plateau', severity: 'low', basis: 'flat 6 weeks', t: d(12) },
    { id: 'kp2', subjectId: 'kim', subjectName: 'Kim', scope: 'teamA', kind: 'plateau', severity: 'low', basis: 'still flat', t: d(9) },
    { id: 'kp3', subjectId: 'kim', subjectName: 'Kim', scope: 'teamA', kind: 'plateau', severity: 'low', basis: 'still flat', t: d(5) },
    { id: 'kp4', subjectId: 'kim', subjectName: 'Kim', scope: 'teamA', kind: 'plateau', severity: 'low', basis: 'still flat', t: d(1) },
    { id: 'sr1', subjectId: 'sam', subjectName: 'Sam', scope: 'teamA', kind: 'recovering', severity: 'low', basis: 'climbing back', t: d(8) },
    { id: 'sr2', subjectId: 'sam', subjectName: 'Sam', scope: 'teamA', kind: 'recovering', severity: 'low', basis: 'climbing back', t: d(5) },
    { id: 'sr3', subjectId: 'sam', subjectName: 'Sam', scope: 'teamA', kind: 'recovering', severity: 'low', basis: 'climbing back', t: d(2) },
    { id: 'om1', subjectId: 'old', subjectName: 'Ola', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'old dip', t: d(40) },
    { id: 'om2', subjectId: 'old', subjectName: 'Ola', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'old dip', t: d(35) },
    { id: 'om3', subjectId: 'old', subjectName: 'Ola', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'old dip', t: d(30) },
    { id: 'bad', subjectId: 'joe', kind: 'not_a_real_kind', severity: 'high', basis: 'ignored', t: d(1) },
  ],
});

const joe = byId(tickA.beliefs, 'joe::momentum_drop');
const ann = byId(tickA.beliefs, 'ann::momentum_drop');
const kim = byId(tickA.beliefs, 'kim::plateau');
const sam = byId(tickA.beliefs, 'sam::recovering');
const old = byId(tickA.beliefs, 'old::momentum_drop');
const joeA = byId(tickA.agenda, 'joe::momentum_drop');
const kimA = byId(tickA.agenda, 'kim::plateau');
const samA = byId(tickA.agenda, 'sam::recovering');

/* ── 1 · accumulation → a real belief, held provisionally ── */
ok('1 · three signals make an emerging, open belief', joe && joe.confidence === 'emerging' && joe.status === 'open' && joe.supportCount === 3);
ok('1 · every belief carries what would confirm AND refute it', joe && !!joe.whatWouldConfirm && /refuted|read is off|easing back/.test(joe.whatWouldRefute));

/* ── 2 · a single signal is too thin to raise — held, not surfaced ── */
ok('2 · one signal is tentative and HELD (never cries wolf)', ann && ann.confidence === 'tentative' && byId(tickA.agenda, 'ann::momentum_drop').readiness === 'hold');

/* ── 3 · register encodes "a time and a place" ── */
ok('3 · a wellbeing risk is raised SUPPORT-first (arm over the shoulder)', joeA && joeA.register === 'support' && joeA.readiness === 'ripe');
ok('3 · a performance risk (plateau) is raised as a SCOUT, not an emotional check-in', kimA && kimA.register === 'scout' && kimA.readiness === 'ripe');
ok('3 · a progress belief is an ACKNOWLEDGE moment, not a concern', samA && samA.register === 'acknowledge' && sam.polarity === 'progress');

/* ── 4 · a shared hypothesis — the pattern no single view shows ── */
const sharedA = byId(tickA.beliefs, 'shared::teamA::momentum_drop');
ok('4 · two people with the same risk in a scope form ONE shared hypothesis', sharedA && sharedA.shared === true && sharedA.distinctSubjects === 2);
ok('4 · the shared claim names the group, never a private metric', sharedA && /Team A/.test(sharedA.claim) && !SCORE_RE.test(sharedA.claim));

/* ── 5 · silence → dormancy (a belief fades without fresh signal) ── */
ok('5 · a belief with no signal for 3+ weeks goes dormant', old && old.status === 'dormant');
ok('5 · dormant beliefs are retired from the agenda, not raised', !byId(tickA.agenda, 'old::momentum_drop') && tickA.retired.includes('old::momentum_drop'));

/* ── 6 · surface, never act — every proposal is proposal-gated ── */
ok('6 · proposals come ONLY from ripe items (joe, kim, sam)', tickA.proposals.length === 3);
ok('6 · every proposal requires human confirmation (never auto-run)', tickA.proposals.every(p => p.requiresConfirmation === true));
ok('6 · a proposal proposes — it carries no executable verb/effect', tickA.proposals.every(p => !('execute' in p) && !('effect' in p) && !('run' in p)));
ok('6 · the support proposal leads with listening', tickA.proposals.some(p => p.register === 'support' && /listen first/i.test(p.text)));

/* ── 7 · privacy by construction — claims never leak a score or a quote ── */
const rendered = [...tickA.beliefs.map(b => b.claim), ...tickA.agenda.map(a => a.why), ...tickA.proposals.map(p => p.text)];
ok('7 · no belief/agenda/proposal text carries a private metric (x/5, %)', rendered.every(t => !SCORE_RE.test(t)));
ok('7 · no rendered text carries a verbatim quotation', rendered.every(t => !QUOTE_RE.test(t)));

/* ── 8 · an unknown observation kind is ignored (no belief invented) ── */
ok('8 · an unrecognised kind forms no belief', !byId(tickA.beliefs, 'joe::not_a_real_kind'));

/* ── 9 · determinism ── */
const again = R.reason({ now, scopeLabel: { teamA: 'Team A' }, observations: [
  { id: 'jm1', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'x', t: d(10) },
] });
const twice = R.reason({ now, scopeLabel: { teamA: 'Team A' }, observations: [
  { id: 'jm1', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'x', t: d(10) },
] });
ok('9 · identical inputs → identical ledger', JSON.stringify(again) === JSON.stringify(twice));

/* ── Tick B — the reasoner challenges its own truth ──────────────────────────
   Carry tick A's ledger forward. Joe now shows recovering (3 signals) — the SAME-
   axis progress signal that argues against the momentum_drop belief. Re-feed joe's
   original drop signals too, to prove dedupe. */
const tickB = R.reason({
  now, scopeLabel: { teamA: 'Team A' }, priorBeliefs: tickA.beliefs,
  observations: [
    { id: 'jm1', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'dup', t: d(10) },
    { id: 'jm2', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'dup', t: d(6) },
    { id: 'jm3', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', severity: 'high',   basis: 'dup', t: d(2) },
    { id: 'jr1', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'recovering', severity: 'low', basis: 'climbing', t: d(1) },
    { id: 'jr2', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'recovering', severity: 'low', basis: 'climbing', t: now },
    { id: 'jr3', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'recovering', severity: 'low', basis: 'climbing', t: now },
  ],
});
const joeB = byId(tickB.beliefs, 'joe::momentum_drop');

/* ── 10 · counter-evidence contests the belief (self-correction) ── */
ok('10 · a same-axis progress signal is recorded AGAINST the risk belief', joeB && joeB.counterCount === 3);
ok('10 · when counter ≥ support the belief is CONTESTED and held (not raised)', joeB && joeB.status === 'contested' && byId(tickB.agenda, 'joe::momentum_drop').readiness === 'hold');

/* ── 11 · re-feeding the same observations does NOT double-count (persist + dedupe) ── */
ok('11 · re-fed observations dedupe by id — support stays 3, not 6', joeB && joeB.supportCount === 3);

/* ── 12 · a self-correcting group read: the shared pattern dissolves ── */
ok('12 · with joe no longer an OPEN risk, the shared momentum pattern dissolves (only ann left)', !byId(tickB.beliefs, 'shared::teamA::momentum_drop'));

/* ── 13 · challenge() states, in plain words, why the belief might be wrong ── */
const ch = R.challenge(joeB, now);
ok('13 · challenge names the counter-evidence and the refutation path', ch.some(r => /argue the other way/.test(r)) && ch.some(r => /refuted by/.test(r)));

/* ── CALIBRATION — the reasoner grades its own reads and learns from response ── */

/* ── 14 · a risk that gave way to an open progress belief RESOLVED (a real, useful read) ── */
ok('14 · joe\'s contested drop, now that he\'s recovering, is scored RESOLVED (not a false read)', joeB && joeB.outcome === 'resolved');
const tallyB = R.outcomeTally(tickB.beliefs);
ok('14 · a resolved belief counts as USEFUL for its kind (reliability grows)', tallyB.momentum_drop && tallyB.momentum_drop.useful >= 1);

/* ── 15 · a thin belief that simply went quiet FADED (a likely over-read) ── */
const faded = R.reason({ now, observations: [
  { id: 'k1', subjectId: 'ken', subjectName: 'Ken', kind: 'momentum_drop', severity: 'low', basis: 'one old dip', t: d(40) },
] });
const ken = byId(faded.beliefs, 'ken::momentum_drop');
ok('15 · a single, stale signal that never matured is scored FADED', ken && ken.status === 'dormant' && ken.outcome === 'faded');
ok('15 · a faded belief counts as DISMISS for its kind (reliability falls)', R.outcomeTally(faded.beliefs).momentum_drop.dismiss >= 1);

/* ── 16 · human feedback: "dismissed" stands the belief down (anti-nagging) ── */
const fb = R.reason({ now, scopeLabel: { teamA: 'Team A' }, observations: [
  { id: 'p1', subjectId: 'kim', subjectName: 'Kim', scope: 'teamA', kind: 'plateau', severity: 'low', t: d(4) },
  { id: 'p2', subjectId: 'kim', subjectName: 'Kim', scope: 'teamA', kind: 'plateau', severity: 'low', t: d(2) },
  { id: 'p3', subjectId: 'kim', subjectName: 'Kim', scope: 'teamA', kind: 'plateau', severity: 'low', t: d(1) },
] }).beliefs;
ok('16 · precondition: the belief is on the agenda before any feedback', R.reason({ now, priorBeliefs: fb }).agenda.some(a => a.beliefId === 'kim::plateau'));
const applied = R.applyFeedback(fb, 'kim::plateau', 'dismissed', now, 'leadX');
ok('16 · applyFeedback records the response and starts a cooldown', applied && applied.feedback.response === 'dismissed' && R.isSuppressed(applied, now));
const afterDismiss = R.reason({ now, priorBeliefs: fb });
ok('16 · a dismissed belief is HELD OUT of the agenda (never nags)', !afterDismiss.agenda.some(a => a.beliefId === 'kim::plateau'));
ok('16 · …but the reasoner still BELIEVES it (held, not deleted)', afterDismiss.beliefs.some(b => b.id === 'kim::plateau'));

/* ── 17 · "acted"/"useful" re-engages; "wrong" stands it down for much longer ── */
R.applyFeedback(fb, 'kim::plateau', 'useful', now);
ok('17 · marking it useful clears the cooldown and it returns to the agenda', R.reason({ now, priorBeliefs: fb }).agenda.some(a => a.beliefId === 'kim::plateau'));
const wrong = R.applyFeedback(fb, 'kim::plateau', 'wrong', now);
ok('17 · "wrong" suppresses for far longer than a plain dismissal', wrong.suppressUntil - now > R.DISMISS_COOLDOWN);
ok('17 · an unknown response is rejected (no silent mutation)', R.applyFeedback(fb, 'kim::plateau', 'lol', now) === null);

/* ── 18 · the SUBJECT's view — their own read, warmly phrased, contestable, minimal ── */
const sv = R.subjectView(joe);
ok('18 · a person\'s own read is phrased for THEM (second person), not about "this person"', /^your |^you/i.test(sv.claim) && !/this person/i.test(sv.claim));
ok('18 · it carries confidence, what would change it, and the right to contest', sv.confidence === joe.confidence && !!sv.whatWouldChangeIt && sv.canContest === true);
ok('18 · it withholds the leader-facing fields (urgency / register / severity / challenge)', !('urgency' in sv) && !('register' in sv) && !('severity' in sv) && !('challenge' in sv) && !('why' in sv));

/* ── OPERATING CONTEXT — a real event grounds urgency + timing ("a time and a place") ── */
const wesObs = [
  { id: 'wm1', subjectId: 'wes', subjectName: 'Wes', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'dip', t: d(6) },
  { id: 'wm2', subjectId: 'wes', subjectName: 'Wes', scope: 'teamA', kind: 'momentum_drop', severity: 'medium', basis: 'dip', t: d(3) },
  { id: 'wm3', subjectId: 'wes', subjectName: 'Wes', scope: 'teamA', kind: 'momentum_drop', severity: 'high', basis: 'dip', t: d(1) },
];
const base = R.reason({ now, scopeLabel: { teamA: 'Team A' }, observations: wesObs });
const withEvent = R.reason({ now, scopeLabel: { teamA: 'Team A' },
  observations: wesObs,
  context: { events: [
    { id: 'e1', label: 'the cup final', at: now + 2 * DAY, scope: 'teamA' },   // imminent, this branch
    { id: 'e2', label: 'a national camp', at: now + 2 * DAY, scope: 'teamB' }, // imminent, OTHER branch
  ] },
});
const wesBefore = base.agenda.find(a => a.beliefId === 'wes::momentum_drop');
const wesAfter  = withEvent.agenda.find(a => a.beliefId === 'wes::momentum_drop');
ok('19 · an imminent, in-scope event raises the belief\'s urgency', wesAfter.urgency > wesBefore.urgency);
ok('19 · …and creates a concrete timing note that names the event and the moment', /cup final/.test(wesAfter.timing || '') && /tomorrow|today|in \d+ days/.test(wesAfter.timing || ''));
ok('19 · an event in ANOTHER branch does not bear on this belief (no false urgency)', !/national camp/.test(JSON.stringify(wesAfter)));
ok('19 · with no events at all, there is no timing note (honest silence)', wesBefore.timing === null);

/* ── THE VOICE (deterministic floor) — a spoken rundown that adds nothing new ── */
const spoken = R.speak(withEvent.agenda, { now });
ok('20 · the voice names the ripe beliefs it was given', /wes|Your|momentum|below/i.test(spoken) && spoken.length > 10);
ok('20 · it folds in the real timing when there is an event', /cup final/.test(spoken));
ok('20 · it introduces no private metric of its own (score-free)', !SCORE_RE.test(spoken));
ok('20 · with nothing ripe it says so honestly (no filler)', /nothing.*pressing|steady/i.test(R.speak([], { now })));

/* ── ROLL-UP — the same shared pattern across many groups reads as ONE org-wide line ── */
const many = [
  { beliefId: 'shared::u15::momentum_drop', shared: true, kind: 'momentum_drop', distinctSubjects: 17, urgency: 11, register: 'support', readiness: 'ripe', claim: 'x' },
  { beliefId: 'shared::u13::momentum_drop', shared: true, kind: 'momentum_drop', distinctSubjects: 15, urgency: 10, register: 'support', readiness: 'ripe', claim: 'x' },
  { beliefId: 'shared::u12::momentum_drop', shared: true, kind: 'momentum_drop', distinctSubjects: 15, urgency: 9, register: 'support', readiness: 'ripe', claim: 'x' },
  { beliefId: 'joe::plateau', shared: false, kind: 'plateau', urgency: 5, claim: 'joe plateau', readiness: 'ripe' },
];
const rolled = R.rollUpShared(many);
const roll = rolled.find(a => a.rolled);
ok('21 · three same-kind shared cards collapse into ONE org-wide read', rolled.filter(a => a.kind === 'momentum_drop').length === 1 && roll);
ok('21 · the org-wide read names the group count + total people', /across 3 of your groups \(47 people\)/.test(roll.claim));
ok('21 · it keeps its constituents so a decision can fan out', roll.memberBeliefIds.length === 3 && roll.groups === 3);
ok('21 · a per-person item is left untouched', rolled.some(a => a.beliefId === 'joe::plateau' && !a.rolled));
/* a single shared card is NOT rolled up (nothing to collapse) */
const one = R.rollUpShared([{ beliefId: 'shared::u15::isolation', shared: true, kind: 'isolation', distinctSubjects: 4, urgency: 6 }]);
ok('21 · one shared card is left as-is (no needless roll-up)', one.length === 1 && !one[0].rolled);

console.log(`\nreason-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
