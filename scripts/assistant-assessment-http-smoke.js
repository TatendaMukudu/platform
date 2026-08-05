/* Truth layer — ASSESSMENT REQUEST (HTTP). The live failure: a member asked three times for an
   assessment ("I'd like a short assessment to help me improve at time management", "can we make
   the assessment together?") and got "I can save that as a private reflection." Proves the
   assistant now RECOGNISES an assessment request — acknowledges it (topic-aware), offers to
   start one, and does NOT default to a capture / note card. Boots the real app (DB_OPTIONAL).
   Run: node scripts/assistant-assessment-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'asm';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Demo Athletic Club', orgMode: 'sports' } },
  orgUsers: { [C]: { maya: { id: 'maya', name: 'Maya Chen', role: 'member', orgCode: C, status: 'active' } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('maya', C, 'member');
  const turn = (text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then(r => r.json());
  const reply = r => (r.response && r.response.responseText) || '';
  const cards = r => ((r.response && r.response.proposedActions) || []).map(p => p.actionType);

  try {
    /* 1 — the exact message that failed live now recognises the assessment + names the topic */
    const r1 = await turn("I'd like a short assessment to help me improve at time management... I haven't been at all good with that");
    ok('1 · it acknowledges an ASSESSMENT (not "save as a private reflection")', /assessment/i.test(reply(r1)) && !/save (?:as|it as) (?:a )?(?:reflection|note)/i.test(reply(r1)));
    ok('1 · …and names the topic it heard (time management)', /time management/i.test(reply(r1)));
    ok('1 · …offers to START an assessment, not a capture card', cards(r1).includes('assessment_start') && !cards(r1).includes('capture'));

    /* 2 — the follow-up ("can we make the assessment together?") also lands as an assessment */
    const r2 = await turn('So can we make the assessment together?');
    ok('2 · "make the assessment together" is recognised as an assessment request', /assessment/i.test(reply(r2)) && cards(r2).includes('assessment_start') && !cards(r2).includes('capture'));

    /* 3 — a plain "assess me on my defending" works too, with the topic */
    const r3 = await turn('assess me on my defending');
    ok('3 · "assess me on X" starts an assessment on the topic', cards(r3).includes('assessment_start') && /defending/i.test(reply(r3)));

    /* 4 — a genuine disclosure is NOT hijacked into an assessment (no false positive) */
    const r4 = await turn('feeling a bit flat today, not sure why');
    ok('4 · an ordinary disclosure is not turned into an assessment', !cards(r4).includes('assessment_start'));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nassistant-assessment-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
