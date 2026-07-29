/* Truth layer — THE KERNEL TRAVELS (HTTP). The proof that IntelliQ is an industry-agnostic
   engine, not a sports app with a coat of paint: a SCHOOL org runs the exact same stack a
   club does — the reasoner reads a student's shared notes into a support-first belief the
   teacher sees; privacy still keeps a private note out; the access is still recorded in the
   accountability trail — and the ONLY difference is the display vocabulary (student / class /
   lesson, not player / team / match). Same kernel, same governance; only the words change.
   Boots the real app (DB_OPTIONAL). Run: node scripts/kernel-travels-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, auditLog } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'schl', DAY = 86400000, now = Date.now();
const iso = n => new Date(now - n * DAY).toISOString();
const note = (id, author, content, days, type, sensitivity) => ({
  id, orgCode: C, authorId: author, authorName: author, content, type, tag: null,
  sensitivity: sensitivity || 'normal', createdAt: iso(days), aiResponse: null,
});

_loadAllStores({
  // orgMode 'school' → the education pack (student/class/lesson). NOTHING else changes.
  orgMeta: { [C]: { orgName: 'Northgate', orgMode: 'school' } },
  orgUsers: { [C]: {
    teacher: { id: 'teacher', name: 'Ms Rao', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['classA'] },
    sam:     { id: 'sam',     name: 'Sam',    role: 'member', orgCode: C, status: 'active' },
    kai:     { id: 'kai',     name: 'Kai',    role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    classA: { nodeId: 'classA', parentId: null, leaderIds: ['teacher'], memberIds: ['sam', 'kai'] },
  } },
  orgNotes: {
    // A student shares, in their own words, over several days — same signal a player's notes gave.
    s1: note('s1', 'sam', 'Honestly I am exhausted and overwhelmed this week, could use some help.', 8, 'shared'),
    s2: note('s2', 'sam', 'Still shattered and stretched too thin — so much on.', 5, 'shared'),
    s3: note('s3', 'sam', 'Drained again today, overwhelmed by everything on my plate.', 1, 'shared'),
    // Another student writes the same PRIVATELY — privacy must keep it out of the org reasoner.
    k1: note('k1', 'kai', 'Exhausted and overwhelmed, struggling badly.', 2, 'private'),
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tTok = issueToken('teacher', C, 'coach');
  const H = { Authorization: `Bearer ${tTok}` };
  const getj = p => fetch(base + p, { headers: H }).then(r => r.json());

  try {
    /* 1 — the DISPLAY vocabulary is the school's, resolved from orgMode alone */
    const dom = await getj('/api/org/domain');
    ok('1 · a school org resolves to the education pack (no per-org code)', dom.ok && dom.current.id === 'education');
    ok('1 · …and renders the school\'s own words (student / class / lesson)',
       dom.current.vocab.person === 'student' && dom.current.vocab.group === 'class' && dom.current.vocab.event === 'lesson');

    /* 2 — the SAME reasoner runs: a student's shared notes → a support-first belief the teacher sees */
    const a = await getj('/api/reason/agenda?refresh=1');
    const samBeliefs = (a.agenda || []).filter(x => x.subjectId === 'sam');
    ok('2 · the reasoner reads a student\'s shared notes into a belief (kernel is vocabulary-blind)', a.ok && samBeliefs.length > 0);
    ok('2 · …of the same wellbeing/load kind, raised support-first', samBeliefs.every(b => b.register === 'support') && samBeliefs.some(b => /overload|withdraw|momentum|isolation|baseline_shift/.test(b.kind)));

    /* 3 — the SAME privacy boundary: a private note never becomes an org belief, never leaks */
    ok('3 · a student\'s private note never becomes an org belief', !(a.agenda || []).some(x => x.subjectId === 'kai'));
    ok('3 · nothing from a private note surfaces to the teacher', !/struggling badly/i.test(JSON.stringify(a)));

    /* 4 — the SAME accountability trail: the teacher's read is recorded, content-free */
    const entry = (auditLog[C] || []).find(e => e.action === 'agenda_view' && e.actor === 'teacher');
    ok('4 · the teacher\'s read is recorded in the accountability trail (same governance)', !!entry && (entry.subjectIds || []).includes('sam'));
    ok('4 · …content-free, exactly as in any other industry', entry && !/exhausted|overwhelmed|drained/i.test(JSON.stringify(entry)));

  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\nkernel-travels-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
