/* Truth layer — LEGACY NOTES → LIBRARY MIGRATION. Proves the one-home sweep: existing notes
   become Library note-items with the right owner + visibility ('shared' → shared, 'private'/
   'anonymous' → private, never re-exposed); the sweep is IDEMPOTENT (re-running adds nothing);
   the original orgNotes are left intact; and a note made through the legacy /api/notes endpoint
   also mirrors into the Library. Boots the real app (DB_OPTIONAL). Run: node scripts/library-migration-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _migrateLegacyNotesToLibrary, libraryItems, orgNotes } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const C = 'lmig', iso = '2026-01-01T00:00:00.000Z';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Trafford United FC', orgMode: 'sports' } },
  orgUsers: { [C]: { coachA: { id: 'coachA', name: 'Pablo', role: 'coach', orgCode: C, status: 'active' } } },
  orgNotes: {
    n1: { id: 'n1', orgCode: C, authorId: 'coachA', authorName: 'Pablo', content: 'Work on defending set pieces.', type: 'private', tag: null, createdAt: iso },
    n2: { id: 'n2', orgCode: C, authorId: 'coachA', authorName: 'Pablo', content: 'Team agreed the new Saturday schedule.', type: 'shared', tag: 'Logistics', createdAt: iso },
    n3: { id: 'n3', orgCode: C, authorId: 'coachA', authorName: 'Pablo', content: 'Someone vented anonymously.', type: 'anonymous', tag: null, createdAt: iso },
  },
});
_rebuildEmailIndex();

// The migration runs at boot in production; invoke it directly here.
const migrated = _migrateLegacyNotesToLibrary();
ok('1 · all three legacy notes are swept into the Library', migrated === 3 && (libraryItems[C] || []).filter(i => i.type === 'note').length === 3);

const byRef = ref => (libraryItems[C] || []).find(i => i.sourceRef === ref);
ok('2 · a private note maps to a PRIVATE library item, owned by the author', byRef('note:n1') && byRef('note:n1').visibility === 'private' && byRef('note:n1').ownerId === 'coachA');
ok('2 · a shared note maps to a SHARED library item, titled from its tag', byRef('note:n2') && byRef('note:n2').visibility === 'shared' && byRef('note:n2').title === 'Logistics');
ok('2 · an anonymous note maps to PRIVATE (never re-exposed)', byRef('note:n3') && byRef('note:n3').visibility === 'private');
ok('2 · the created time is preserved from the original note', byRef('note:n1').createdAt === iso);

ok('3 · the original notes are left intact (migration only ADDS)', Object.keys(orgNotes).length >= 3 && !!orgNotes.n1);

// Idempotency — a second sweep must add nothing.
const again = _migrateLegacyNotesToLibrary();
ok('4 · re-running the sweep is idempotent (no duplicates)', again === 0 && (libraryItems[C] || []).filter(i => i.type === 'note').length === 3);

// Dual-write — a NEW note through the legacy endpoint also mirrors into the Library.
const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fetch(base + '/api/notes', { method: 'POST', headers: { Authorization: `Bearer ${issueToken('coachA', C, 'coach')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgCode: C, authorId: 'coachA', authorName: 'Pablo', content: 'A brand new note.', type: 'private' }) }).then(r => r.json());
    ok('5 · a note made via the legacy endpoint also appears in the Library', (libraryItems[C] || []).some(i => i.type === 'note' && /brand new note/.test(i.body || '')));
  } catch (e) { fail++; console.log('  ✗ threw:', e && e.message); }
  server.close();
  console.log(`\nlibrary-migration-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
