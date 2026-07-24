/* Truth layer — OPERATING-CONTEXT intake (pure).

   Proves how an organisation DESCRIBES its operation becomes PROPOSED structured
   records (extraction is automatic, persistence deliberate), that validation hard-
   blocks the unsafe/broken and warns the risky, that dependency cycles are caught,
   that authority comes from WHO confirms (not wording), and that confirmed effective
   records PROJECT into the org-state config (with supersession, never mutating
   history). Pure — no DB, no AI. Run: node scripts/org-context-smoke.js */

const OC = require('../ai/org-context');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const now = Date.parse('2026-07-23T09:00:00Z'); // a Thursday

// 1 · SCENARIO 1 — "We play Saturday at 3. The head coach owns the game plan, and it must be ready 24 hours before kickoff."
{
  const a = OC.extract('Our first team plays Saturday at 3pm.', { now });
  const ev = a.proposals.find(p => p.type === 'event');
  ok('1 · a match sentence extracts an event proposal', ev && ev.fields.type === 'match' && ev.fields.startAt);
  ok('1 · the event is the NEXT Saturday at 15:00', new Date(ev.fields.startAt).getDay() === 6 && new Date(ev.fields.startAt).getHours() === 15);

  const r = OC.extract('The head coach owns the game plan.', { now });
  const resp = r.proposals.find(p => p.type === 'responsibility');
  ok('1 · a responsibility is extracted, mapped to a claim type', resp && resp.fields.claimTypes.includes('game_plan'));
  ok('1 · "head coach" is recognised as a ROLE (not a named person)', resp.fields.role && !resp.isNamedPerson);

  const q = OC.extract('The game plan must be ready 24 hours before kickoff.', { now });
  const req = q.proposals.find(p => p.type === 'requirement');
  ok('1 · a requirement with a needed-by rule is extracted', req && req.fields.claimType === 'game_plan' && req.fields.neededByRule.offsetHours === 24);
}

// 2 · nothing persists on extraction; a preview REQUIRES confirmation
{
  const { proposals } = OC.extract('Our first team plays Saturday at 3pm.', { now });
  const pv = OC.preview(proposals, { actorRole: 'superadmin' });
  ok('2 · preview requires explicit confirmation', pv.requiresConfirmation === true);
  ok('2 · preview explains the effect in plain language', pv.effects.some(e => /upcoming event/i.test(e)));
}

// 3 · a NAMED person for a durable responsibility warns
{
  const r = OC.extract('Jordan Smith owns the game plan.', { now });
  ok('3 · a named-person responsibility is flagged as possibly stale', r.warnings.some(w => w.code === 'named_person_responsibility'));
  const resp = r.proposals.find(p => p.type === 'responsibility');
  ok('3 · it still extracts (allowed, just warned)', resp && resp.isNamedPerson === true);
}

// 4 · SCENARIO 2 — a member reporting a schedule is NOT authoritative
{
  ok('4 · a leader confirming makes authoritative organisation context', OC.authorityFor('superadmin') === 'organisation');
  ok('4 · a member’s operating context stays shared-but-unverified', OC.authorityFor('member') === 'shared_unverified');
  const s = OC.extract('Training is at 5 tomorrow.', { now });
  const ev = s.proposals.find(p => p.type === 'event');
  ok('4 · a member schedule still extracts an event (its AUTHORITY differs, not its shape)', ev && ev.fields.type === 'training' && new Date(ev.fields.startAt).getHours() === 17);
}

// 5 · SCENARIO 3 — a recurring rhythm with an expected output
{
  const r = OC.extract('We review player availability every Thursday and should produce a confirmed player list.', { now });
  const rhy = r.proposals.find(p => p.type === 'rhythm');
  ok('5 · a rhythm is extracted with cadence + expected output', rhy && rhy.fields.cadenceDays === 7 && /player list/i.test(rhy.fields.expectedOutput || ''));
  ok('5 · a rhythm with no cadence hard-fails validation', !OC.validate({ type: 'rhythm', scope: { kind: 'team' }, fields: { process: 'x' } }).ok);
}

// 6 · SCENARIO 5 — a self-blocking dependency is a HARD failure
{
  const self = OC.validate({ type: 'dependency', scope: { kind: 'team' }, fields: { upstream: 'squad_selection', downstream: 'squad_selection' } });
  ok('6 · a self-blocking dependency is rejected', !self.ok && self.hardErrors.some(e => e.code === 'self_blocking'));
  const cyc = OC.detectCycles([{ upstream: 'a', downstream: 'b' }, { upstream: 'b', downstream: 'c' }, { upstream: 'c', downstream: 'a' }]);
  ok('6 · a dependency cycle is detected', cyc.hasCycle && cyc.cycles.length >= 1);
  const acyclic = OC.detectCycles([{ upstream: 'transport', downstream: 'squad_list' }]);
  ok('6 · an acyclic dependency is fine', !acyclic.hasCycle);
}

// 7 · validation hard blocks vs warnings
{
  ok('7 · a record without scope is hard-blocked', !OC.validate({ type: 'event', fields: { startAt: new Date(now).toISOString() } }).ok);
  ok('7 · end-before-start is hard-blocked', OC.validate({ type: 'event', scope: { kind: 'team' }, fields: { startAt: new Date(now + 2 * 3600000).toISOString(), endAt: new Date(now).toISOString() } }).hardErrors.some(e => e.code === 'end_before_start'));
  ok('7 · a requirement with no subject is hard-blocked', OC.validate({ type: 'requirement', scope: { kind: 'team' }, fields: {} }).hardErrors.some(e => e.code === 'requirement_without_subject'));
  ok('7 · visibility beyond permission is hard-blocked', !OC.validate({ type: 'event', scope: { kind: 'team' }, visibility: 'organization', fields: { startAt: new Date(now).toISOString() } }, { actorCanShareOrg: false }).ok);
}

// 8 · PRIVACY — private/wellbeing/surveillance content can NEVER become a rule
{
  ok('8 · a wellbeing disclosure is blocked at extraction', OC.extract('The team is burned out and anxious lately.', { now }).blocked === 'private_wellbeing_cannot_be_an_operating_rule');
  ok('8 · a surveillance expectation is blocked', OC.extract('Everyone must be available after hours and respond quickly.', { now }).blocked);
  ok('8 · a forbidden requirement hard-fails validation', OC.validate({ type: 'requirement', scope: { kind: 'team' }, fields: { claimType: 'morale', note: 'track who is anxious' } }).hardErrors.some(e => e.code === 'forbidden_content'));
}

// 9 · PROJECTION — confirmed effective records → org-state config; supersession keeps history
{
  const base = { org: 'A', confirmedAt: new Date(now).toISOString(), status: 'active', scope: { kind: 'team' } };
  const records = [
    { ...base, id: 'e1', type: 'event', fields: { type: 'match', title: 'Cup Final', startAt: new Date(now + 3 * 86400000).toISOString(), owner: 'coach' }, effectiveFrom: new Date(now - 86400000).toISOString() },
    { ...base, id: 'r1', type: 'requirement', fields: { claimType: 'game_plan', freshDays: 14 } },
    { ...base, id: 'old', type: 'event', fields: { type: 'match', title: 'Old kickoff 3pm' }, status: 'superseded' },       // superseded → excluded
    { ...base, id: 'ret', type: 'rhythm', fields: { process: 'x', cadenceDays: 7 }, status: 'retired' },                    // retired → excluded
  ];
  const cfg = OC.projectConfig(records, now);
  ok('9 · confirmed active records project into config', cfg.events.some(e => e.id === 'e1') && cfg.requirements.some(r => r.claimType === 'game_plan'));
  ok('9 · superseded and retired records are excluded from the projection', !cfg.events.some(e => e.id === 'old') && !cfg.rhythms.length);
  const unconfirmed = OC.projectConfig([{ ...base, id: 'u', type: 'event', confirmedAt: null, fields: { startAt: new Date(now).toISOString() } }], now);
  ok('9 · an UNCONFIRMED record never projects (no silent effect)', unconfirmed.events.length === 0);
}

// 10 · role responsibility projects with its effective period
{
  const cfg = OC.projectConfig([{ id: 'resp1', type: 'responsibility', org: 'A', status: 'active', confirmedAt: new Date(now).toISOString(), scope: { kind: 'team' }, fields: { role: 'coach', claimTypes: ['game_plan'] } }], now);
  ok('10 · a confirmed responsibility projects as a role owner', cfg.responsibilities.some(r => r.subject === 'coach' && r.claimTypes.includes('game_plan')));
}

console.log(`\norg-context-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
