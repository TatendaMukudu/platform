#!/usr/bin/env node
/* ============================================================
   scripts/advisor-smoke.js — end-to-end smoke test for the
   Individual Advisor (Phase 1, alignment-aware).

   This MUST run against a live instance with a real DATABASE_URL
   and ANTHROPIC_API_KEY (local `node server.js` or your deploy).
   It does not boot the server itself.

   USAGE
     # against a local server, logging in:
     BASE_URL=http://localhost:3000 \
     EMAIL=you@example.com PASSWORD=secret \
     node scripts/advisor-smoke.js

     # against a deploy with an existing token + explicit member:
     BASE_URL=https://your-app.onrender.com \
     TOKEN=xxxxx MEMBER_ID=u_123 \
     node scripts/advisor-smoke.js

   ENV
     BASE_URL    default http://localhost:3000
     TOKEN       skip login if provided
     EMAIL       login email (if no TOKEN)
     PASSWORD    login password (if no TOKEN)
     MEMBER_ID   member to advise on (auto-picked from visible members if absent)

   Exit code 0 = all hard checks passed, 1 = a hard check failed.
   ============================================================ */

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let pass = 0, fail = 0, warn = 0;
const C = { g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m` };
const ok   = (m) => { pass++; console.log(`  ${C.g('✓')} ${m}`); };
const bad  = (m) => { fail++; console.log(`  ${C.r('✗')} ${m}`); };
const note = (m) => { warn++; console.log(`  ${C.y('!')} ${m}`); };
function check(cond, m) { cond ? ok(m) : bad(m); return cond; }

async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

// Heuristic: the "no scalar" product law. Mood is reported as x/5, which is
// allowed; we flag percentages, /100 grades, and "score of N" as soft warnings.
function looksLikeScore(text) {
  const t = String(text || '');
  return /\b\d{1,3}\s?%/.test(t) || /\b\d{1,3}\s?\/\s?100\b/.test(t) || /\bscore of \d/i.test(t);
}

(async () => {
  console.log(C.dim(`\nAdvisor smoke test → ${BASE}\n`));

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  console.log('1. Authentication');
  let token = process.env.TOKEN || null;
  if (!token) {
    if (!process.env.EMAIL || !process.env.PASSWORD) {
      bad('No TOKEN and no EMAIL/PASSWORD provided — cannot authenticate.');
      return finish();
    }
    const r = await api('POST', '/api/auth/login', { body: { email: process.env.EMAIL, password: process.env.PASSWORD } });
    if (!check(r.status === 200 && r.data?.token, `login → ${r.status}`)) return finish();
    token = r.data.token;
    console.log(C.dim(`     logged in as ${r.data.user?.name || r.data.user?.email} (${r.data.user?.role})`));
  } else {
    ok('using provided TOKEN');
  }

  // ── 2. Pick a member ───────────────────────────────────────────────────────
  console.log('\n2. Resolve a member to advise on');
  let memberId = process.env.MEMBER_ID || null;
  let memberName = '';
  if (!memberId) {
    const r = await api('GET', '/api/workspace/visible-members', { token });
    if (!check(r.status === 200 && Array.isArray(r.data?.members), `visible-members → ${r.status}`)) return finish();
    const self = r.data.requestingUserId;
    const pick = r.data.members.find(m => m.userId !== self && m.role === 'member')
              || r.data.members.find(m => m.userId !== self)
              || r.data.members[0];
    if (!check(pick, 'found at least one visible member')) return finish();
    memberId = pick.userId; memberName = pick.name;
    console.log(C.dim(`     using ${memberName} (${memberId})`));
  } else {
    ok(`using MEMBER_ID ${memberId}`);
  }

  // ── 3. Question mode ───────────────────────────────────────────────────────
  console.log('\n3. Ask Advisor (question mode)');
  const q = await api('POST', `/api/advisor/${encodeURIComponent(memberId)}/ask`, {
    token, body: { question: 'How do I motivate this person?', mode: 'question' },
  });
  check(q.status === 200 && q.data?.ok, `ask → ${q.status}`);
  const ans = q.data?.answer || '';
  check(ans.trim().length > 20, `answer is non-empty (${ans.length} chars)`);
  check(!!q.data?.lens, `role lens applied: ${q.data?.lens || '—'}`);
  if (looksLikeScore(ans)) note('answer contains a percentage/grade — verify it is not an alignment score (mood x/5 is fine).');
  else ok('no obvious numeric score in answer (directional-language law)');
  const threadId1 = q.data?.threadId;
  console.log(C.dim(`     "${ans.slice(0, 160).replace(/\n/g, ' ')}${ans.length > 160 ? '…' : ''}"`));

  // ── 4. Briefing mode ───────────────────────────────────────────────────────
  console.log('\n4. Full Briefing (briefing mode)');
  const b = await api('POST', `/api/advisor/${encodeURIComponent(memberId)}/ask`, {
    token, body: { mode: 'briefing' },
  });
  check(b.status === 200 && b.data?.ok, `briefing → ${b.status}`);
  check(b.data?.mode === 'briefing', `response tagged mode=briefing`);
  const brief = b.data?.answer || '';
  check(brief.trim().length > 40, `briefing is non-empty (${brief.length} chars)`);
  const frames = ['seeing', 'happening', 'align', 'next'].filter(w => new RegExp(w, 'i').test(brief)).length;
  check(frames >= 2, `briefing references the 4-question structure (${frames}/4 cue words found)`);
  if (looksLikeScore(brief)) note('briefing contains a percentage/grade — verify it is not an alignment score.');
  const threadId2 = b.data?.threadId;

  // ── 5. History ─────────────────────────────────────────────────────────────
  console.log('\n5. Thread history');
  const h = await api('GET', `/api/advisor/${encodeURIComponent(memberId)}/threads`, { token });
  check(h.status === 200 && Array.isArray(h.data?.threads), `threads → ${h.status}`);
  const ids = (h.data?.threads || []).map(t => t.id);
  check(threadId1 && ids.includes(threadId1), 'question thread persisted in history');
  check(threadId2 && ids.includes(threadId2), 'briefing thread persisted in history');

  // ── 6. Guardrails ──────────────────────────────────────────────────────────
  console.log('\n6. Guardrails');
  const empty = await api('POST', `/api/advisor/${encodeURIComponent(memberId)}/ask`, {
    token, body: { question: '', mode: 'question' },
  });
  check(empty.status === 400, `empty question rejected → ${empty.status} (expected 400)`);

  const noAuth = await api('POST', `/api/advisor/${encodeURIComponent(memberId)}/ask`, {
    body: { question: 'test' },
  });
  check(noAuth.status === 401, `unauthenticated request rejected → ${noAuth.status} (expected 401)`);

  finish();
})().catch(err => { console.error(C.r(`\nFATAL: ${err.message}`)); process.exit(1); });

function finish() {
  console.log(`\n${pass} passed, ${fail} failed${warn ? `, ${warn} warning(s)` : ''}.\n`);
  process.exit(fail ? 1 : 0);
}
