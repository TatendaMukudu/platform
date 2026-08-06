/* Truth layer — THE DETERMINISTIC HIJACK + ASSESSMENT CONFIRM (HTTP). Two live failures:

   1. Every unmatched question came back with the SAME "here's what deserves your attention"
      text. Cause: when nothing matched the question, the read fell back to the reasoner's
      STANDING read (the attention digest) and returned it with a real confidence — so the
      caller counted the question as answered and the governed reasoner never ran. The standing
      read is now marked and never counts as an answer to what was asked.

   2. "I'd like a short assessment to help me improve at finishing" was answered with an
      unrelated clarifier ("you have 3 assigned items — which one do you mean?") because the
      deterministic read won, and Confirm on the assessment card failed with "unknown proposal
      type" because assessment_start had no confirm handler at all.

   Run: node scripts/assistant-answer-hijack-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'hjk';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Demo Athletic Club', orgMode: 'sports' } },
  orgUsers: { [C]: { maya: { id: 'maya', name: 'Maya Chen', role: 'member', orgCode: C, status: 'active' } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('maya', C, 'member');
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const turn = (text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H, body: JSON.stringify({ text }) }).then(r => r.json());
  const reply = r => (r.response && r.response.responseText) || '';
  const cards = r => ((r.response && r.response.proposedActions) || []).map(p => p.actionType);

  try {
    /* 1 — the assessment request LEADS the reply; it is not buried behind an unrelated read */
    const r1 = await turn("Hey... I'd like a short assessment to help me improve at finishing");
    ok('1 · the assessment request leads the reply (no unrelated "which one do you mean?")',
      /assessment/i.test(reply(r1)) && !/which one do you mean/i.test(reply(r1)));
    ok('1 · …and it names the topic (finishing)', /finishing/i.test(reply(r1)));
    ok('1 · …and offers assessment_start', cards(r1).includes('assessment_start'));

    /* 2 — CONFIRM on that card actually works (it used to 400 "unknown proposal type") */
    const prop = ((r1.response && r1.response.proposedActions) || []).find(p => p.actionType === 'assessment_start');
    const conf = await fetch(base + `/api/assistant/turn/${encodeURIComponent(r1.turnId)}/confirm`, {
      method: 'POST', headers: H, body: JSON.stringify({ proposalId: prop && prop.id }) }).then(r => r.json());
    ok('2 · confirming the assessment card succeeds (no "unknown proposal type")', conf.ok === true && conf.confirmed === 'assessment_start');
    ok('2 · …and it creates a real, self-assigned assessment to fill in', !!(conf.assessment && conf.assessment.id));

    /* 3 — a status-style mention is NOT hijacked into an assessment request (no false positive) */
    const r3 = await turn('what is the assessment status for the squad?');
    ok('3 · a status question about assessments is not turned into an assessment request',
      !cards(r3).includes('assessment_start'));

    /* 4 — THE HIJACK: the standing read never counts as an answer. With no model configured the
       reasoner cannot take over, so the honest degrade is the insufficient-evidence line or a
       reasoning response — but NEVER a confident attention digest presented as the answer. */
    const r4 = await turn('Based on how I have been training, should I focus on speed or strength this month?');
    const qa4 = (r4.response && r4.response.qa) || {};
    ok('4 · a planning question is not answered by the standing attention digest',
      !(qa4.standingRead === true && qa4.confidence && qa4.confidence !== 'none'));

    /* 5 — two DIFFERENT unmatched questions must not return the identical canned text */
    const a = await turn('How is the team doing this season?');
    const b = await turn('What should I work on in training tomorrow?');
    ok('5 · two different questions do not return the identical canned answer',
      !(reply(a) && reply(a) === reply(b)));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nassistant-answer-hijack-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
