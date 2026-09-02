#!/usr/bin/env node
'use strict';

/* L-OC1 over the real HTTP boundary: an object's opening is a fresh projection, never a
   message copied into assistantConversations. */
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const S = require('../server');

let pass = 0;
let fail = 0;
const ok = (name, condition) => {
  if (condition) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
};

const CODE = 'oc-screen';
const inquiry = {
  inquiryId: 'i_1', subjectRef: 'member:member',
  topic: { label: 'Attendance has changed', canonicalConcept: 'attendance' },
  status: 'probable', leadingHypothesisId: 'h_1',
  hypotheses: [{ id: 'h_1', statement: 'travel is making attendance harder' }],
  confidence: { band: 'probable', because: ['The pattern has repeated'] },
  signals: [{ ref: 'e_1', kind: 'observation', status: 'active', originRef: 'origin_1', contributedBy: 'member' }],
  missingSignals: [{ question: 'Whether the travel schedule changed' }],
  falsifiers: ['Attendance returns while travel stays the same'],
};

S._loadAllStores({
  orgMeta: { [CODE]: { orgName: 'Object Conversation' } },
  orgUsers: { [CODE]: {
    member: { id: 'member', name: 'Member', email: 'member@oc.test', role: 'member', status: 'active', orgCode: CODE },
  } },
  inquiryStates: { [CODE]: { 'member:member': { attendance: inquiry } } },
  assistantConversations: { [`${CODE}:member`]: [{
    id: 'conv_1', title: 'Attendance', about: 'inquiry:i_1',
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z',
    messages: [
      { role: 'user', text: 'The bus route changed.', at: '2026-08-01T00:00:00Z' },
      { role: 'assistant', text: 'I have kept that as your account.', at: '2026-08-01T00:01:00Z' },
    ],
  }] },
});
S._rebuildEmailIndex();

const storedBefore = JSON.stringify(S.assistantConversations[`${CODE}:member`]);
const server = S.app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = S.issueToken('member', CODE, 'member');
  const read = async () => {
    const response = await fetch(`${base}/api/inquiry/i_1/thread`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };

  try {
    const first = await read();
    ok('OC1 the real object-thread read returns four freshly composed explanation fields and stored turns',
      first.status === 200 && first.body.opening
      && first.body.opening.claim && first.body.opening.whyIThinkThat
      && first.body.opening.stillUnknown.length === 1 && first.body.opening.wouldChangeMyMind.length === 1
      && first.body.messages.length === 2);

    inquiry.hypotheses[0].statement = 'the new timetable is making attendance harder';
    const second = await read();
    ok('OC2 the opening is recomposed from the object on every read',
      second.body.opening.claim !== first.body.opening.claim
      && /new timetable/.test(second.body.opening.claim));

    const storedAfter = JSON.stringify(S.assistantConversations[`${CODE}:member`]);
    ok('OC3 no opening claim, explanation block, or generated message is written to the conversation store',
      storedAfter === storedBefore
      && !storedAfter.includes('travel is making attendance harder')
      && !storedAfter.includes('new timetable is making attendance harder')
      && !storedAfter.includes('What would change my mind'));

    const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    /* The four HEADINGS were removed by founder decision (September 2026) — labelled boxes read
       as a form being filled in about you. What must survive is the four pieces of INFORMATION,
       now composed as prose: what IntelliQ thinks, how it knows, what else it could be, and
       what would change its mind. This asserts the information and the overflow, not the
       layout, so the screen may be redesigned again without silently losing a field. */
    ok('OC4 the thread still carries all four pieces of information, and the two-item overflow',
      /iqt-lede/.test(ui) && /iqt-prov/.test(ui) && /iqt-rival/.test(ui) && /iqt-falsify/.test(ui)
      && /iqt-ask/.test(ui)
      && ui.includes('sum.thinking') && ui.includes('x.provenance')
      && ui.includes('det.alternatives') && ui.includes('det.falsifiers')
      && ui.includes('sum.openQuestion')
      && (ui.match(/MemberApp\.inquiryOverflow\('/g) || []).length === 2
      && ui.includes('>Mark answered<') && ui.includes('>Set aside<'));
  } catch (error) {
    fail++; console.log('  FAIL suite threw:', error && error.message);
  } finally {
    console.log(`\nobject-conversation-screen-http-smoke: ${pass} passed, ${fail} failed\n`);
    server.close();
    process.exit(fail ? 1 : 0);
  }
});
