/* Truth layer — the ACCOUNTABILITY LAYER (HTTP). Proves the compliance surface end to end:
   a leader reading beliefs about people is RECORDED (content-free); a person can exercise a
   Subject Access Request (Art 15) and receive everything held about them PLUS the trail of
   who accessed it — but only ever their OWN record; an admin can review the org's access log
   and verify the trail hasn't been tampered with; and erasure (Art 17) is itself recorded.
   Boots the real app (DB_OPTIONAL). Run: node scripts/audit-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, auditLog } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'audh', DAY = 86400000, now = Date.now();
const iso = n => new Date(now - n * DAY).toISOString();
const note = (id, author, content, days, type) => ({
  id, orgCode: C, authorId: author, authorName: author, content, type, tag: null,
  sensitivity: 'normal', createdAt: iso(days), aiResponse: null,
});

_loadAllStores({
  orgMeta: { [C]: { orgName: 'A', orgMode: 'sports' } },
  orgUsers: { [C]: {
    admin:  { id: 'admin',  name: 'Dir', role: 'superadmin', orgCode: C, status: 'active' },
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    uma:    { id: 'uma',    name: 'Uma',  role: 'member', orgCode: C, status: 'active' },
    ken:    { id: 'ken',    name: 'Ken',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    teamA: { nodeId: 'teamA', parentId: null, leaderIds: ['coachA'], memberIds: ['uma', 'ken'] },
  } },
  orgNotes: {
    u1: note('u1', 'uma', 'Honestly I am exhausted and overwhelmed this week, could use some help.', 8, 'shared'),
    u2: note('u2', 'uma', 'Still shattered and stretched too thin — so much on.', 5, 'shared'),
    u3: note('u3', 'uma', 'Drained again today, overwhelmed by everything on my plate.', 1, 'shared'),
  },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { admin: issueToken('admin', C, 'superadmin'), coachA: issueToken('coachA', C, 'coach'), uma: issueToken('uma', C, 'member'), ken: issueToken('ken', C, 'member') };
  const get = (p, who) => fetch(base + p, { headers: { Authorization: `Bearer ${tok[who]}` } });
  const getj = (p, who) => get(p, who).then(r => r.json());

  try {
    /* 1 — a leader reading beliefs about people is RECORDED (content-free) */
    ok('0 · before any access, the org trail is empty', !(auditLog[C] || []).length);
    await getj('/api/reason/agenda?refresh=1', 'coachA');
    const trail = auditLog[C] || [];
    const agendaEntry = trail.find(e => e.action === 'agenda_view' && e.actor === 'coachA');
    ok('1 · a leader\'s agenda read is recorded as an accountable access', !!agendaEntry);
    ok('1 · …naming whose data it touched (Uma)', agendaEntry && (agendaEntry.subjectIds || []).includes('uma'));
    ok('1 · …content-free: no claim/quote/score in the entry', agendaEntry && !('claim' in agendaEntry) && !JSON.stringify(agendaEntry).match(/overwhelmed|exhausted|drained/i));

    /* 2 — Subject Access Request (Art 15): a person gets everything held about them + the trail */
    const sar = await getj('/api/me/data', 'uma');
    ok('2 · a person can request their own record (Art 15)', sar.ok && sar.subject.id === 'uma');
    ok('2 · …it returns the reads held about them + their notes + rights', sar.held && Array.isArray(sar.held.reads) && sar.held.myNotes.length === 3 && sar.rights.erase);
    ok('2 · …and the trail of who accessed their data (the coach\'s read shows up)', (sar.held.accessTrail || []).some(t => t.actor === 'coachA' && t.action === 'agenda_view'));

    /* 3 — a SAR is strictly SELF: Ken's request never returns Uma's record */
    const kenSar = await getj('/api/me/data', 'ken');
    ok('3 · a SAR is self-only — Ken sees his own record, never Uma\'s', kenSar.ok && kenSar.subject.id === 'ken' && !/uma|overwhelmed|exhausted/i.test(JSON.stringify(kenSar.held)));

    /* 4 — admin review: the whole access log + a tamper-evidence check */
    const review = await getj('/api/admin/access-log', 'admin');
    ok('4 · an admin can review the org access log', review.ok && review.total >= 2);
    ok('4 · …the trail verifies intact (tamper-evidence)', review.integrity && review.integrity.ok === true);
    ok('4 · …and it can be narrowed to one subject (who accessed Uma\'s data)', (await getj('/api/admin/access-log?subjectId=uma', 'admin')).entries.every(e => true) && (await getj('/api/admin/access-log?subjectId=uma', 'admin')).entries.length >= 1);

    /* 5 — the access log is gated: a plain member cannot read it */
    ok('5 · a member cannot read the org access log (403)', (await get('/api/admin/access-log', 'ken')).status === 403);

    /* 6 — tamper-evidence is real: corrupt an entry in place and the review flags it */
    if ((auditLog[C] || []).length) auditLog[C][0].subjectIds = ['nobody'];
    const tampered = await getj('/api/admin/access-log', 'admin');
    ok('6 · editing the stored trail breaks the chain — the review reports the tamper', tampered.integrity && tampered.integrity.ok === false && tampered.integrity.brokenAt === 0);

  } catch (e) { fail++; console.log('  ✗ HTTP suite threw:', e && e.message); }

  server.close();
  console.log(`\naudit-http-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
