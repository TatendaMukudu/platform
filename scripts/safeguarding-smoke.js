/* Truth layer — SAFEGUARDING (pure). Proves the duty of care works with NO model: real
   distress is detected deterministically (crisis vs concern), a crisis response is transparent
   that a safe adult is being told and surfaces real resources, ordinary text is never
   false-flagged, and the resources are overridable per org. Run: node scripts/safeguarding-smoke.js */

const SG = require('../ai/safeguarding.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* 1 — CRISIS phrasings are caught (erring toward sensitivity) */
for (const t of ['I want to kill myself', 'i dont want to be here anymore', "I've been thinking about ending it",
  'I keep cutting myself', "I feel unsafe at home", "there's no point in living", 'I am scared to go home to my dad']) {
  ok(`1 · crisis detected · "${t.slice(0, 32)}…"`, SG.detect(t).severity === 'crisis');
}

/* 2 — CONCERN (severe distress) is a softer tier, still surfaced */
for (const t of ['I feel completely worthless', "I can't cope anymore", 'I hate myself', 'nobody cares about me']) {
  ok(`2 · concern detected · "${t.slice(0, 28)}…"`, SG.detect(t).severity === 'concern');
}

/* 3 — ordinary / performance text is NEVER false-flagged as a crisis */
for (const t of ['how is the team doing', 'we need to work on defending set pieces', "I'm a bit tired after training",
  'the striker wants to end the game strongly', 'kill the tempo in the second half']) {
  ok(`3 · not flagged · "${t.slice(0, 30)}…"`, SG.detect(t).severity === 'none');
}

/* 4 — a crisis response is TRANSPARENT about escalation + carries resources (never hollow) */
const r = SG.composeResponse({ name: 'Sam Okafor', severity: 'crisis' });
ok('4 · crisis response escalates and says so plainly (no false confidentiality)', r.escalate === true && /safeguarding lead|let .* know|999/i.test(r.message));
ok('4 · …addresses the person warmly by first name', /^Sam,/.test(r.message));
ok('4 · …and always includes real crisis resources', Array.isArray(r.resources) && r.resources.length >= 3 && r.resources.some(x => /116 123/.test(x.contact)));

/* 5 — a concern response supports WITHOUT forcing escalation (agency stays with the person) */
const c = SG.composeResponse({ severity: 'concern' });
ok('5 · concern supports without forced escalation', c.escalate === false && c.resources.length >= 1);

/* 6 — resources are overridable per org (a US org sets its own) */
const us = SG.composeResponse({ severity: 'crisis', resources: [{ label: '988 Suicide & Crisis Lifeline', contact: 'call or text 988' }] });
ok('6 · an org can override the resources (988 for the US)', us.resources.length === 1 && /988/.test(us.resources[0].contact));

console.log(`\nsafeguarding-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
