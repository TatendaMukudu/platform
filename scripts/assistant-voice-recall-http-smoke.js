/* Truth layer — RECALL, SELF-VOICE, and the CLARIFIER OVERRIDE (HTTP). Four live failures:

   1. "What did I just tell you?" dead-ended with "not enough authorised evidence" — it was
      classified as an org lookup and answered from the evidence store, when the answer was
      sitting in the conversation thread. Recall is now its own register, answered
      DETERMINISTICALLY from the thread (no model, no egress, cannot fabricate).

   2. The standing read named the reader in the THIRD PERSON ("Ashton Mbeki has been pulling
      back from their own normal") — said to Ashton. A belief whose subject is the reader is
      now rendered in its second-person self view.

   3. An explicit assessment request was still overridden by the ambiguous assigned-work
      clarifier ("you have 4 assigned items — which one do you mean?"), because workLead won
      unconditionally at composition time even after the assessment answer was set.

   4. Confirming an assessment rendered the raw actionType ("assessment_start") to the person
      instead of the server's sentence. (Client-side; pinned here by asserting the server
      always supplies a human `note` to render.)

   Run: node scripts/assistant-voice-recall-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;
const reg = require('../ai/reasoning-register.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

/* ── pure: the recall register + composer ─────────────────────────────────── */
ok('P1 · "what did I just tell you" classifies as RECALL (not an org lookup)',
  reg.classifyRegister('What did I just tell you?').register === 'recall');
ok('P1 · …so do "remind me what I just said" and a bare "what did I say?"',
  reg.classifyRegister('remind me what I just said').register === 'recall'
  && reg.classifyRegister('what did I say?').register === 'recall');
ok('P2 · a real org question is NOT swallowed by the recall register',
  reg.classifyRegister('how is the team doing this season?').register !== 'recall');
// The narrowness that matters: naming a TOPIC makes it a lookup of recorded evidence, so it
// must keep the retrieval path. (Recall once swallowed this and broke private-note retrieval.)
ok('P2 · "what did I say ABOUT <topic>" stays an evidence lookup, not thread recall',
  reg.classifyRegister('what did I say about my sore knee').register !== 'recall'
  && reg.classifyRegister('what did I tell you about the match on Saturday').register !== 'recall');
ok('P3 · recall needs NO model (it is not a reasoning register — nothing leaves the box)',
  reg.wantsReasoning('recall') === false);
ok('P4 · the composer quotes what was actually said, and invents nothing',
  /first touch/i.test(reg.composeRecall([{ role: 'user', text: 'I have been struggling with my first touch' }]) || ''));
ok('P5 · with nothing said yet it returns null (so the caller can be honest)',
  reg.composeRecall([]) === null);

/* ── pure: the OUTPUT POLISH pass over the model's prose ──────────────────── */
ok('P6 · assistant-ese prefaces are stripped ("Great question!", "Certainly,")',
  reg.polish('Great question! A 4-3-3 gives you width.') === 'A 4-3-3 gives you width.'
  && reg.polish('Certainly, the wingers stretch the pitch.') === 'the wingers stretch the pitch.');
ok('P6 · emoji never survive into displayed prose (house style)',
  !/[\u{1F300}-\u{1FAFF}]/u.test(reg.polish('Nice work 🎉 keep going 🔥')));
ok('P6 · it never damages ordinary prose (safe transforms only)',
  reg.polish('You have eased off from your own normal.') === 'You have eased off from your own normal.');
ok('P7 · the model is instructed to address the person directly, and to skip filler',
  /Speak TO the person/.test(reg.SYSTEM_PROMPT) && /No emojis/.test(reg.SYSTEM_PROMPT));
ok('P8 · the polish runs inside the governed assembler (not just as advice in the prompt)',
  !/[\u{1F300}-\u{1FAFF}]/u.test(JSON.stringify(reg.assembleGoverned({
    claims: [{ text: 'Great question! Width comes from the wide forwards 🔥', provenance: 'general' }] }))));

const C = 'vrc';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Demo Athletic Club', orgMode: 'sports' } },
  orgUsers: { [C]: { maya: { id: 'maya', name: 'Maya Chen', role: 'member', orgCode: C, status: 'active' } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('maya', C, 'member');
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const turn = (text, conversationId) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H, body: JSON.stringify({ text, conversationId }) }).then(r => r.json());
  const reply = r => (r.response && r.response.responseText) || '';

  try {
    /* 1 — RECALL, end to end, in a real thread */
    const t1 = await turn('I have been struggling with my first touch under pressure');
    const t2 = await turn('What did I just tell you?', t1.conversationId);
    ok('1 · recall answers from the conversation (never "not enough authorised evidence")',
      /first touch/i.test(reply(t2)) && !/enough authorised evidence/i.test(reply(t2)));

    /* 2 — recall at the very start of a thread is honest, not a dead end */
    const fresh = await turn('What did I just tell you?');
    ok('2 · recall with an empty thread says so honestly',
      /start of our conversation|haven'?t told me anything/i.test(reply(fresh)) && !/enough authorised evidence/i.test(reply(fresh)));

    /* 3 — the person is never referred to in the third person by name in their own reply */
    const t3 = await turn('How am I doing?');
    ok('3 · the reply never names the reader in the third person', !/\bMaya Chen\b/.test(reply(t3)));

    /* 4 — an assessment request LEADS even when the work clarifier would otherwise win */
    const t4 = await turn('Okay can we discuss my assessment?');
    const r4 = reply(t4);
    ok('4 · the assessment request leads (the clarifier no longer wins outright)',
      /assessment/i.test(r4) && !/^You have \d+ assigned items/.test(r4));

    /* 5 — confirming an assessment returns a HUMAN sentence, never the raw actionType */
    const t5 = await turn("I'd like a short assessment to help me improve at finishing");
    const p5 = ((t5.response && t5.response.proposedActions) || []).find(p => p.actionType === 'assessment_start');
    const conf = await fetch(base + `/api/assistant/turn/${encodeURIComponent(t5.turnId)}/confirm`, {
      method: 'POST', headers: H, body: JSON.stringify({ proposalId: p5 && p5.id }) }).then(r => r.json());
    ok('5 · confirm returns a human sentence to show (not the raw "assessment_start")',
      conf.ok === true && typeof conf.note === 'string' && conf.note.length > 10 && !/^assessment_start$/.test(conf.note));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nassistant-voice-recall-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
