/* Truth layer — CAPTURE INTENT (pure).

   Proves the trust rule at the input boundary: detection is automatic, persistence
   is deliberate. An explicit command ("remember this", "save these minutes", "add
   this to our organisation knowledge") is recognised AND scoped (personal vs org);
   ordinary declarative content is only ever OFFERED for saving; questions and
   chit-chat trigger nothing. No DB, no AI key. Run: node scripts/capture-smoke.js */

const { detectCommand, looksDeclarative } = require('../ai/capture');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

// ── explicit commands are detected + scoped ──────────────────────────────────
{
  const c1 = detectCommand('Remember this: training moves to 7pm on Thursdays.');
  ok('1 · "remember this: …" is a personal command with payload', c1 && c1.scope === 'personal' && /training moves to 7pm/i.test(c1.payload));

  const c2 = detectCommand('Save these meeting minutes: we agreed to sign two defenders.');
  ok('2 · "save these meeting minutes: …" is a command with payload', c2 && /sign two defenders/i.test(c2.payload));

  const c3 = detectCommand('Add this to our organisation knowledge: away kit is black this season.');
  ok('3 · "add this to our organisation knowledge" is an ORGANISATION command', c3 && c3.scope === 'organisation' && /away kit is black/i.test(c3.payload));

  const c4 = detectCommand('Store this for the club records: the cup final is on the 12th.');
  ok('4 · "store this for the club records" scopes to organisation', c4 && c4.scope === 'organisation' && /cup final is on the 12th/i.test(c4.payload));

  const c5 = detectCommand('remember this');
  ok('5 · a bare "remember this" is a command with NO inline payload', c5 && c5.payload === '');
}

// ── questions / chit-chat are NOT commands ───────────────────────────────────
{
  ok('6 · "do you remember our last game?" is not a save command', detectCommand('Do you remember our last game?') === null);
  ok('6 · "should I save this somewhere?" is not a command', detectCommand('Should I save this somewhere?') === null);
  ok('6 · "what did we decide last week?" is not a command', detectCommand('What did we decide last week?') === null);
  ok('6 · ordinary talk is not a command', detectCommand('The session felt sharp today, everyone was up for it.') === null);
}

// ── declarative detection: offer, never auto-save ────────────────────────────
{
  ok('7 · meeting minutes read as declarative (offer to save)',
     looksDeclarative('Minutes from tonight: we agreed the new training schedule, confirmed the away travel, and set trials for next month.'));
  ok('7 · a stat line reads as declarative', looksDeclarative('Final score 3-1. Two assists from Mia, a clean sheet after the 60th minute, and 14 shots on target.'));
  ok('8 · a question is NOT declarative', !looksDeclarative('What time is training on Thursday this week again?'));
  ok('8 · a short remark is NOT declarative', !looksDeclarative('Good session today.'));
  ok('8 · a mid-length feeling is NOT treated as a record', !looksDeclarative('I feel pretty good about how the team is coming together lately.'));
}

// ── command vs offer are mutually sensible ───────────────────────────────────
{
  const t = 'Add this to our organisation knowledge: the pressing triggers are on the goalkeeper and the fullbacks.';
  ok('9 · an org command is detected as a command', !!detectCommand(t));
  ok('9 · the same text also reads as declarative content', looksDeclarative(t));
}

console.log(`\ncapture-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
