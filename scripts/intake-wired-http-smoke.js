/* Truth layer — THE EARS, WIRED (HTTP). ai/diagnose.js is the kernel; this pins the wiring.

   The contract that makes it safe to run automatically on every turn:
     • intake NEVER blocks the reply — it runs after, so understanding the turn costs the person
       no latency (it improves the NEXT answer, not this one)
     • what it builds is a WORKING PICTURE, never evidence and never a belief
     • it is SELF-SCOPED: /api/inquiry returns your own inquiries and nobody else's
     • with no model configured the turn is completely unaffected (honest degrade, no crash)

   Run: node scripts/intake-wired-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';        // the ears only run when the composer is on

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates } = S;
const diagnose = require('../ai/diagnose.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'ear';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Demo Athletic Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    maya: { id: 'maya', name: 'Maya Chen', role: 'member', orgCode: C, status: 'active' },
    jo:   { id: 'jo',   name: 'Jo Blake',  role: 'member', orgCode: C, status: 'active' },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = (who) => ({ Authorization: `Bearer ${issueToken(who, C, 'member')}`, 'Content-Type': 'application/json' });

  try {
    /* 1 — the turn still answers normally with no model configured: the ears must never break
       the mouth, and must never make the person wait to be understood. */
    const t0 = Date.now();
    const r1 = await fetch(base + '/api/assistant/turn', { method: 'POST', headers: H('maya'),
      body: JSON.stringify({ text: "I've been struggling with my first touch when someone closes me down quickly" }) }).then(r => r.json());
    const took = Date.now() - t0;
    ok('1 · the turn answers normally (the ears never break the mouth)', r1.ok === true && !!(r1.response && r1.response.responseText));
    ok('1 · …and is not slowed waiting to be understood', took < 5000);

    /* 2 — the working picture is exposed, self-scoped, and honest about what it is */
    const mine = await fetch(base + '/api/inquiry', { headers: H('maya') }).then(r => r.json());
    ok('2 · /api/inquiry returns the working picture', mine.ok === true && Array.isArray(mine.inquiries));
    ok('2 · …and says plainly that nothing in it is recorded as fact yet',
      /nothing here is recorded as fact until you confirm/i.test(mine.note || ''));

    /* 3 — SELF-SCOPED. Another member's route returns their own (empty) picture, never Maya's. */
    inquiryStates[C] = inquiryStates[C] || {};
    inquiryStates[C]['member:maya'] = { 'football.first_touch': diagnose.applyProposals(
      diagnose.newInquiry({ id: 'i1', subjectRef: 'member:maya', concept: 'football.first_touch', label: 'First touch' }),
      diagnose.groundProposals([
        { id: 'o1', level: 'observation', text: 'first touch degrades under pressure',
          sourceSpan: 'first touch when someone closes me down', source: 'self', directness: 'direct', specificity: 0.8 },
        { id: 'h1', level: 'hypothesis', text: 'pressure is being seen too late', basis: ['o1'] },
      ], { utterance: "I've been struggling with my first touch when someone closes me down quickly", turnId: 't1' }).accepted) };

    const maya = await fetch(base + '/api/inquiry', { headers: H('maya') }).then(r => r.json());
    ok('3 · the owner sees their own inquiry', maya.inquiries.some(i => /first_touch/.test(i.topic.canonicalConcept)));
    const jo = await fetch(base + '/api/inquiry', { headers: H('jo') }).then(r => r.json());
    ok('3 · another member sees NONE of it (self-scoped, no leak)', (jo.inquiries || []).length === 0);
    ok('3 · …and it is unauthenticated-safe',
      (await fetch(base + '/api/inquiry')).status === 401);

    /* 4 — what is exposed carries the epistemics: an unconfirmed hypothesis, a computed
       confidence band, and the rival explanations. Never a bare verdict. */
    const inq = maya.inquiries.find(i => /first_touch/.test(i.topic.canonicalConcept));
    ok('4 · it exposes a HYPOTHESIS with a computed confidence band, not a verdict',
      inq && typeof inq.hypothesis === 'string' && inq.confidence && typeof inq.confidence.band === 'string'
      && Array.isArray(inq.confidence.because));
    ok('4 · …and one signal never reads as settled', inq.confidence.band !== 'supported');
    ok('4 · …and it reports how many signals it actually rests on', inq.signals === 1);
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nintake-wired-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
