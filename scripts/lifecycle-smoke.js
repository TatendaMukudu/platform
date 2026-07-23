/* Truth layer — EVIDENCE LIFECYCLE / knowledge governance (pure).

   Proves IntelliQ reasons about WHAT TO KEEP and WHAT TO LET GO: an operational fact
   goes stale fast, a policy is near-evergreen, a system-of-record holds its value
   longer than a person's report, a superseded record is retired, and a stale-but-
   required record becomes a PROACTIVE "is this still current?" question routed to its
   owner (not a reactive surprise). Pure — no DB, no AI. Run: node scripts/lifecycle-smoke.js */

const LC = require('../ai/lifecycle');
const IQ = require('../ai/inquiry');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const now = Date.parse('2026-07-23T00:00:00Z');
const daysAgo = d => new Date(now - d * 86400000).toISOString();
const ev = (o) => ({ id: o.id || 'e', status: 'active', confidence: 'reported', ...o, attributes: { category: o.category, ...(o.attributes || {}) } });

// 1 · category drives useful life — a fixture ages fast, a policy is near-evergreen
{
  const oldFixture = LC.assess(ev({ id: 'fx', category: 'fixture', source: 'system_of_record', retrievedAt: daysAgo(30) }), now);
  const oldPolicy  = LC.assess(ev({ id: 'pol', category: 'policy', source: 'system_of_record', retrievedAt: daysAgo(30) }), now);
  ok('1 · a 30-day-old fixture is stale/expired', ['stale', 'expired'].includes(oldFixture.status));
  ok('1 · a 30-day-old policy is still fresh/aging', ['fresh', 'aging'].includes(oldPolicy.status));
  ok('1 · an evergreen record is never auto-retired', oldPolicy.verdict !== 'retire');
}

// 2 · authority slows decay — a record outlives a report of the same kind
{
  const record = LC.assess(ev({ id: 'r', category: 'schedule', source: 'system_of_record', retrievedAt: daysAgo(10) }), now);
  const report = LC.assess(ev({ id: 'p', category: 'schedule', source: 'reported', retrievedAt: daysAgo(10) }), now);
  ok('2 · a system-of-record has a longer half-life than a report', record.halfLifeDays > report.halfLifeDays);
  ok('2 · at the same age, the report is more decayed', report.confidenceNow < record.confidenceNow);
}

// 3 · freshness ladder + confidence decay
{
  const fresh = LC.assess(ev({ id: 'a', category: 'metric', source: 'system_of_record', retrievedAt: daysAgo(1) }), now);
  const aging = LC.assess(ev({ id: 'b', category: 'metric', source: 'system_of_record', retrievedAt: daysAgo(20) }), now);
  ok('3 · a day-old metric is fresh, keep', fresh.status === 'fresh' && fresh.verdict === 'keep');
  ok('3 · confidence decays with age', aging.confidenceNow < fresh.confidenceNow);
}

// 4 · superseded → retire (a newer version exists)
{
  const s = LC.assess(ev({ id: 's', category: 'schedule', status: 'superseded', retrievedAt: daysAgo(1) }), now);
  ok('4 · a superseded record is retired', s.status === 'superseded' && s.verdict === 'retire');
}

// 5 · redundancy reconciliation (same authority, near-identical → merge candidate)
{
  const items = [
    { evidenceId: 'x1', authorityTier: 'system_of_record', label: 'Away travel plan', text: 'Coach travels with the squad on the team bus to the away fixture at noon.' },
    { evidenceId: 'x2', authorityTier: 'system_of_record', label: 'Away travel plan', text: 'The squad travels together on the team bus to the away fixture, departing noon.' },
    { evidenceId: 'y1', authorityTier: 'system_of_record', label: 'Kit order', text: 'The new away kit is black with gold trim for the season.' },
  ];
  const r = LC.reconcile(items);
  ok('5 · two near-identical records are flagged as a merge candidate', r.redundant.some(x => (x.keep === 'x1' && x.mergeCandidate === 'x2')));
  ok('5 · an unrelated record is not merged', !r.redundant.some(x => x.keep === 'y1' || x.mergeCandidate === 'y1'));
}

// 6 · STALE + required + owned → a proactive inquiry the engine can weigh
{
  const stale = LC.assess(ev({ id: 'sch', category: 'schedule', source: 'reported', retrievedAt: daysAgo(6) }), now);
  ok('6 · a 6-day-old reported schedule is stale → review', stale.status === 'stale' && stale.verdict === 'review');
  const u = LC.toUncertainty(stale, { owner: 'team-coach', ownerAuthoritative: true, label: "Saturday session time", impact: 'medium', urgency: 'medium' });
  ok('6 · it becomes a stale uncertainty routed to the owner', u && u.type === 'stale' && u.resolutionOwner === 'team-coach');
  // and the Inquiry Engine turns it into a NON-LEADING "is this still current?" question
  const phrased = IQ.phraseQuestion(u);
  ok('6 · phrased as an out-of-date check, not an accusation', /out of date|still current|has it changed/i.test(phrased));
  ok('6 · the stale-check passes the critic and has positive value', IQ.questionValue(u) > 0 && IQ.critique(u, phrased).ok);
  // Restraint vs. importance: a routine stale record stays quiet; an important, urgent
  // one clears the ask gate — the engine asks only when it matters.
  const urgent = LC.toUncertainty(stale, { owner: 'team-coach', ownerAuthoritative: true, label: 'Saturday kickoff time', impact: 'high', urgency: 'high' });
  ok('6 · a routine (medium) stale record does NOT clear the ask gate', IQ.questionValue(u) < 0.4);
  ok('6 · an important, imminent stale record DOES clear the ask gate', IQ.questionValue(urgent) >= 0.4);
}

// 7 · a FRESH record generates NO question (don't ask about what's current)
{
  const fresh = LC.assess(ev({ id: 'f2', category: 'policy', source: 'system_of_record', retrievedAt: daysAgo(5) }), now);
  ok('7 · a fresh record yields no uncertainty', LC.toUncertainty(fresh, { owner: 'admin' }) === null);
}

// 8 · an ownerless stale record does NOT manufacture a question (nobody to ask)
{
  const stale = LC.assess(ev({ id: 'o', category: 'metric', source: 'reported', retrievedAt: daysAgo(60) }), now);
  ok('8 · a stale record with no owner produces no ask', LC.toUncertainty(stale, {}) === null);
}

// 9 · summary rollup — the "what to keep / what to let go" view
{
  const assessments = [
    LC.assess(ev({ id: 'a', category: 'metric', source: 'system_of_record', retrievedAt: daysAgo(1) }), now),
    LC.assess(ev({ id: 'b', category: 'fixture', source: 'reported', retrievedAt: daysAgo(40) }), now),
    LC.assess(ev({ id: 'c', category: 'schedule', status: 'superseded', retrievedAt: daysAgo(2) }), now),
  ];
  const s = LC.summarise(assessments);
  ok('9 · the rollup counts freshness and lists retire/review candidates', s.total === 3 && (s.retireCandidates.length + s.reviewCandidates.length) >= 1);
}

console.log(`\nlifecycle-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
