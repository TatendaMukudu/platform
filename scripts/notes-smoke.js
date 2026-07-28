/* Truth layer — NOTES governance (pure). Proves a note is private by default and only two
   deliberate, reversible acts change that — pin and share — with the privacy gate as the
   hard guard: a sensitive note cannot be shared even if the author asks; the team-view leaks
   no sensitivity, no private AI reply, no internal ids; and the shelf orders pins first.
   No DB / AI / IO. Run: node scripts/notes-smoke.js */

const N = require('../ai/notes.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const base = { id: 'n1', orgCode: 'c', authorId: 'u1', authorName: 'Priya', content: 'Spring the press off their keeper\'s first touch.', tag: 'Press trap', sensitivity: 'normal', createdAt: '2026-07-20T10:00:00Z', aiResponse: 'a private companion reply' };

/* ── 1 · private by default; a normal note CAN be shared ── */
const c1 = N.canShareToTeam(base, { isSensitive: false });
ok('1 · a normal, non-empty note may be shared with the team', c1.allowed === true);

/* ── 2 · the privacy gate is a HARD guard — sensitive stays private even if asked ── */
const c2 = N.canShareToTeam(base, { isSensitive: true });
ok('2 · a sensitive note is refused sharing (private wellbeing never leaks by accident)', c2.allowed === false && c2.reason === 'sensitive_stays_private');

/* ── 3 · empty content can't be shared ── */
ok('3 · an empty note cannot be shared', N.canShareToTeam({ ...base, content: '  ' }, {}).allowed === false);

/* ── 4 · share is a deliberate, scoped, reversible patch ── */
const shared = N.share(base, { actorId: 'u1', now: 1000, nodeScope: 'teamA' });
ok('4 · sharing stamps teamShared + who/when + node scope', shared.teamShared === true && shared.sharedBy === 'u1' && shared.sharedAt === 1000 && shared.nodeScope === 'teamA');
ok('4 · an already-shared note is not re-shared', N.canShareToTeam(shared, { isSensitive: false }).reason === 'already_shared');
const back = N.unshare(shared);
ok('4 · un-sharing makes it private again', back.teamShared === false && !('sharedAt' in back));

/* ── 5 · pin / unpin toggle ── */
const pinned = N.pin(base, { now: 2000 });
ok('5 · pinning sets pinned + pinnedAt', pinned.pinned === true && pinned.pinnedAt === 2000);
ok('5 · unpinning clears it', N.unpin(pinned).pinned === false);

/* ── 6 · teamView leaks nothing private ── */
const tv = N.teamView(shared);
ok('6 · a teammate sees the title + shareable body + who shared it', tv.title === 'Press trap' && /keeper/.test(tv.content) && tv.sharedBy === 'Priya');
ok('6 · …and NEVER the sensitivity, the private AI reply, or the internal author id', !('sensitivity' in tv) && !('aiResponse' in tv) && !('authorId' in tv) && !JSON.stringify(tv).includes('companion'));

/* ── 7 · shelf orders pins first, newest first ── */
const shelf = N.shelfSort([
  { id: 'a', pinned: false, createdAt: '2026-07-01' },
  { id: 'b', pinned: true, pinnedAt: '2026-07-10' },
  { id: 'c', pinned: true, pinnedAt: '2026-07-20' },
]);
ok('7 · pinned notes come first, most-recently-pinned at the top', shelf.map(x => x.id).join('') === 'cba');

/* ── 8 · purity / determinism — share does not mutate the input ── */
ok('8 · transitions are pure patches (input unchanged)', base.teamShared === undefined && base.pinned === undefined);

console.log(`\nnotes-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
