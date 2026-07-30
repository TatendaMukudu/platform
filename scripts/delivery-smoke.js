/* Truth layer — outbound DELIVERY (pure). Proves the last mile holds the line: a
   care-flagged (sensitive) read is NEVER eligible to leave the box; an empty digest is
   never sent; quiet hours and a once-per-day cap prevent spam; opt-in is required; the
   digest is composed only from the reads given (nothing invented); an alert fires only for
   something genuinely worth interrupting; deterministic. No DB / AI / IO / network.
   Run: node scripts/delivery-smoke.js */

const D = require('../ai/delivery.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const DAY = 86400000;
const noon = Date.parse('2026-07-28T12:00:00Z');   // inside waking hours (UTC)
const night = Date.parse('2026-07-28T23:00:00Z');  // inside default quiet hours

const reads = [
  { text: 'The under-18s had a strong week.', readiness: 'ripe', urgency: 4, polarity: 'progress' },
  { text: 'Two things are worth a look on defence.', readiness: 'ripe', urgency: 5 },
  { text: 'A private wellbeing read', readiness: 'ripe', urgency: 9, careFlag: true },     // sensitive → never out
  { text: 'Another sensitive note', readiness: 'ripe', urgency: 8, sensitive: true },      // sensitive → never out
];

/* ── 1 · SENSITIVE STAYS IN-APP — care-flagged / sensitive reads are never eligible ── */
const elig = D.eligibleReads(reads);
ok('1 · care-flagged + sensitive reads are filtered out of anything outbound', elig.length === 2 && !elig.some(r => r.careFlag || r.sensitive));
ok('1 · the sensitive text never appears in a composed digest',
   !/private wellbeing|sensitive note/i.test(JSON.stringify(D.composeDigest({ name: 'Alex', opening: 'Afternoon, Alex.', reads }))));

/* ── 2 · opt-in is required; nothing goes out until the person turns it on ── */
ok('2 · default prefs are OFF (consent-first)', D.DEFAULT_PREFS.enabled === false);
ok('2 · not opted in → no send', D.shouldDeliver({ prefs: { enabled: false }, now: noon, hasContent: true }).reason === 'not_opted_in');

const on = { enabled: true, channels: { push: true }, cadence: 'daily', quietStart: 21, quietEnd: 7, lastSentAt: 0 };

/* ── 3 · never an empty digest; nothing to say → send nothing ── */
ok('3 · opted in but no content → no send (never an empty digest)', D.shouldDeliver({ prefs: on, now: noon, hasContent: false }).reason === 'nothing_to_say');
ok('3 · opted in WITH content, waking hours, first send → SEND', D.shouldDeliver({ prefs: on, now: noon, hasContent: true }).send === true);

/* ── 4 · NO SPAM — quiet hours hold, and only once per day ── */
ok('4 · inside quiet hours → held', D.shouldDeliver({ prefs: on, now: night, hasContent: true }).reason === 'quiet_hours');
ok('4 · already sent this window → held (no double-send)',
   D.shouldDeliver({ prefs: { ...on, lastSentAt: noon - 3600000 }, now: noon, hasContent: true }).reason === 'already_sent_this_window');
ok('4 · a fresh day after yesterday\'s send → sends again',
   D.shouldDeliver({ prefs: { ...on, lastSentAt: noon - 2 * DAY }, now: noon, hasContent: true }).send === true);
ok('4 · a channel must be chosen (opt-in with no channel sends nothing)',
   D.shouldDeliver({ prefs: { ...on, channels: {} }, now: noon, hasContent: true }).reason === 'no_channel');

/* ── 5 · the digest is composed only from the reads given (nothing invented) ── */
const dig = D.composeDigest({ name: 'Alex', opening: 'Afternoon, Alex. Two things worth a look.', reads, url: '/app' });
ok('5 · the digest leads with the deterministic voice line', /Afternoon, Alex/.test(dig.body));
ok('5 · it summarises only the eligible reads (2), never the sensitive ones', dig.itemCount === 2 && /strong week/.test(dig.body) && /defence/.test(dig.body));
ok('5 · it carries a title + a deep-link url + kind=digest', dig.title.includes('Alex') && dig.url === '/app' && dig.kind === 'digest');

/* ── 6 · ALERT only for something genuinely worth interrupting (and never sensitive) ── */
ok('6 · no ripe high-urgency non-sensitive read → no alert', D.alertWorthy(reads, { minUrgency: 7 }) === null);
const urgent = [{ text: 'A blocker needs a decision before the deadline.', readiness: 'ripe', urgency: 8 }];
const a = D.alertWorthy(urgent, { minUrgency: 7 });
ok('6 · a ripe, high-urgency, non-sensitive read → an alert', a && /blocker/.test(a.text));
ok('6 · a high-urgency but CARE-FLAGGED read never alerts outbound',
   D.alertWorthy([{ text: 'urgent wellbeing', readiness: 'ripe', urgency: 10, careFlag: true }], { minUrgency: 7 }) === null);
const al = D.composeAlert({ name: 'Alex', read: a, url: '/app' });
ok('6 · the alert payload is short + single-subject', al.kind === 'alert' && al.itemCount === 1 && al.body.length <= 240);

/* ── 7 · determinism ── */
ok('7 · identical inputs → identical digest', JSON.stringify(D.composeDigest({ name: 'Alex', opening: 'x', reads })) === JSON.stringify(D.composeDigest({ name: 'Alex', opening: 'x', reads })));

console.log(`\ndelivery-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
