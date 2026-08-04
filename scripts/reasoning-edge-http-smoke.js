/* Truth layer — THE GOVERNED REASONING EDGE (HTTP). Proves the SECOND register is wired: a
   world-knowledge / planning question ("why is a 4-3-3 better than a 5-3-2?", "help me build a
   session") is treated as a REASONING question, not forced through org-truth retrieval and
   dead-ended. With no model configured (this env) it degrades HONESTLY — it says it needs the
   reasoning engine and speaks only to recorded data — and never fabricates. An ORG-FACT
   question ("how is the team doing?") is UNTOUCHED: still the deterministic grounded read, no
   model. Boots the real app (DB_OPTIONAL). Run: node scripts/reasoning-edge-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; // force the honest-degrade path

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 're', DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Trafford United FC', orgMode: 'sports' } },
  orgUsers: { [C]: {
    coachA: { id: 'coachA', name: 'Pablo', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    joe:    { id: 'joe',    name: 'Joe',   role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: { teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['joe'] } } },
  reasonLedger: { [C]: [
    { id: 'joe::momentum_drop', subjectId: 'joe', subjectName: 'Joe', scope: 'teamA', kind: 'momentum_drop', axis: 'momentum', polarity: 'risk', register: 'support',
      claim: "Joe's momentum has been running below his own normal.",
      support: [ { id: 'j1', t: d(9), severity: 'medium', basis: 'x' }, { id: 'j2', t: d(5), severity: 'medium', basis: 'x' }, { id: 'j3', t: d(1), severity: 'high', basis: 'x' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1), whatWouldConfirm: 'x', whatWouldRefute: 'y' },
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('coachA', C, 'coach');
  const turn = (text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).then(r => r.json());
  const qa = r => (r.response && r.response.qa) || {};
  const reply = r => (r.response && r.response.responseText) || '';

  try {
    /* 1 — a WORLD-KNOWLEDGE question is reasoned, not dead-ended, and (engine off) honest */
    const w = await turn('why is a 4-3-3 better than a 5-3-2?');
    ok('1 · a tactics question is NOT met with "not enough authorised evidence"', !/enough authorised evidence/.test(reply(w)));
    ok('1 · …it routes through the reasoning register (world_knowledge)', qa(w).reasoning === true && qa(w).register === 'world_knowledge');
    ok('1 · …and with no model it degrades honestly (never fabricates a tactical claim)', /reasoning (?:question|engine)|switched on|only speak to what'?s? in your data/i.test(reply(w)));

    /* 2 — a PLANNING question is reasoned the same way */
    const p = await turn('help me build a training session for Tuesday');
    ok('2 · a planning question routes through the reasoning register (planning)', qa(p).reasoning === true && qa(p).register === 'planning');
    ok('2 · …and is handled honestly, not dead-ended', !/enough authorised evidence/.test(reply(p)));

    /* 3 — an ORG-FACT question is UNTOUCHED: deterministic grounded read, no reasoning edge */
    const o = await turn('how is the team doing?');
    ok('3 · an org-status question is answered from the grounded read', /Joe's momentum has been running below/.test(reply(o)));
    ok('3 · …and is NOT routed through the reasoning edge (stays deterministic, no egress)', qa(o).reasoning !== true);

    /* 4 — provenance channel exists on the qa contract (empty here — no model — but present) */
    ok('4 · the qa contract carries the provenance channel for the UI', Array.isArray(qa(w).provenance));
  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nreasoning-edge-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
