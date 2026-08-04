/* Truth layer — ERROR LOG (pure). Proves the ring buffer records errors, keeps most-recent
   first, caps its size, and REDACTS PII/secrets (emails, bearer tokens, api keys) so an error
   report can never itself leak. Run: node scripts/errorlog-smoke.js */

const EL = require('../ai/errorlog.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const store = {};
EL.record(store, new Error('boom at /api/x'), { route: '/api/x', method: 'POST', status: 500, orgCode: 'club-a' });
ok('1 · an error is recorded with route + method + status', EL.list(store)[0].route === '/api/x' && EL.list(store)[0].status === 500);
ok('1 · the org code is kept (locates the pilot) — it is not PII', EL.list(store)[0].orgCode === 'club-a');

/* 2 — REDACTION: PII/secrets never survive into the log */
EL.record(store, new Error('login failed for joe@club.com with Bearer abc123def456ghi789 key sk-ant-SECRETVALUE123'), { route: '/api/auth/login' });
const m = EL.list(store)[0].message;
ok('2 · emails are redacted', !/joe@club\.com/.test(m) && /\[email\]/.test(m));
ok('2 · bearer tokens are redacted', !/abc123def456ghi789/.test(m) && /Bearer \[token\]/.test(m));
ok('2 · api keys are redacted', !/SECRETVALUE123/.test(m));

/* 3 — most-recent-first ordering */
EL.record(store, new Error('newest'), {});
ok('3 · list is most-recent-first', /newest/.test(EL.list(store)[0].message));

/* 4 — the buffer is capped (bounded memory) */
const s2 = {};
for (let i = 0; i < 260; i++) EL.record(s2, new Error('e' + i), {}, { cap: 200 });
ok('4 · the ring buffer is capped', (s2.items || []).length === 200 && /e259/.test(EL.list(s2)[0].message));

/* 5 — a stack is truncated (never a giant dump) */
const big = new Error('x'); big.stack = 'x\n' + Array.from({ length: 50 }, (_, i) => '  at f' + i).join('\n');
EL.record(store, big, {});
ok('5 · the stack is truncated to a few frames', EL.list(store)[0].stack.split('\n').length <= 4);

console.log(`\nerrorlog-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
