/* Truth layer — THE SHELF (pure). Founder: "make library like chat gpt ... open and name folders
   store focuses, highs and lows of your choice there".

   The whole risk in this feature is that a folder starts behaving like storage. Every assertion
   below is aimed at one of the two ways that happens: the shelf keeping a COPY of what it points
   at, or the shelf becoming a second answer to who may see something. Run: node scripts/shelf-smoke.js */

'use strict';
const shelf = require('../ai/shelf.js');

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT. Without this a mutation that made shelf.view throw
   killed the script mid-run: no FAIL line was printed, and a harness reading for one concluded
   the assertion could not go red. `ok` takes a thunk wherever the thing under test might throw. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (e) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

/* A gate. `visible` is what this reader may open; everything else resolves to null, which is the
   only thing the shelf is ever told about something it may not see. */
const gateOf = visible => (kind, refId) =>
  visible[`${kind}:${refId}`] ? { label: visible[`${kind}:${refId}`], sub: 'now', whose: 'First Team' } : null;

const FOLDERS = [{ id: 'f1', ownerId: 'me', name: 'Set pieces' }, { id: 'f2', ownerId: 'me', name: 'Saturday' }];

/* ── SH1-SH3: a filing is a reference and nothing else. ── */
{
  const r = shelf.file([], { kind: 'focus', id: 'tf1', title: 'Saturday away — the press', text: 'lots of words' },
    { folderId: 'f1', at: 100, id: 'shf_a' });
  ok('SH1 filing a focus records WHERE it is, not what it says — the old Library kept a flattened copy beside the live thing and the two drifted apart with no way to tell which you were reading',
    r.ok && r.entry.kind === 'focus' && r.entry.refId === 'tf1');
  ok('SH1b …and no title, text or state came with it, however much the caller passed in',
    JSON.stringify(Object.keys(r.entry).sort()) === JSON.stringify(['at', 'folderId', 'id', 'kind', 'refId']));
  ok('SH2 only things with an access gate of their own may be filed — a seventh kind of thing would need a new gate, and a new gate is a second answer to a question the product already answers',
    JSON.stringify(shelf.KINDS) === JSON.stringify(['focus', 'high', 'low', 'inquiry', 'conversation', 'material']));
  ok('SH2b …so an invented kind is refused rather than filed against nothing',
    shelf.file([], { kind: 'salary', id: 'x' }, {}).ok === false);
  ok('SH3 filing the same thing twice MOVES it rather than making a second copy of the row — which is also what makes the control safe to press twice on a slow phone',
    (() => { const list = []; shelf.file(list, { kind: 'focus', id: 'tf1' }, { folderId: 'f1', at: 1 });
      const again = shelf.file(list, { kind: 'focus', id: 'tf1' }, { folderId: 'f2', at: 2 });
      return list.length === 1 && again.moved === true && again.added === false && list[0].folderId === 'f2'; })());
}

/* ── SH4-SH7: THE GATE. A folder is an index of things you could already open. ── */
{
  const filings = [
    { id: 'a', kind: 'focus', refId: 'tf1', folderId: 'f1', at: 300 },
    { id: 'b', kind: 'low',   refId: 'lo9', folderId: 'f1', at: 200 },
    { id: 'c', kind: 'high',  refId: 'hi3', folderId: null, at: 100 },
  ];
  const full = shelf.view(filings, FOLDERS, gateOf({ 'focus:tf1': 'The press', 'low:lo9': 'Second balls', 'high:hi3': 'Set-piece defending' }));
  ok('SH4 everything the reader may open is on the shelf, with the folder it was put in',
    full.items.length === 3 && full.items.find(i => i.refId === 'tf1').folderId === 'f1');
  ok('SH4b …and its label is read LIVE from the object, not from anything the shelf wrote down',
    full.items.find(i => i.refId === 'lo9').label === 'Second balls');
  ok('SH4c …and every row carries the same address the rest of the app binds threads by, so a shelf row and a card on Home lead to the identical place',
    full.items.every(i => i.about === `${i.kind}:${i.refId}`));

  /* SH5 — THE ONE THAT MATTERS. The reader loses sight of the low. */
  const narrowed = shelf.view(filings, FOLDERS, gateOf({ 'focus:tf1': 'The press', 'high:hi3': 'Set-piece defending' }));
  ok('SH5 FILING CONFERS NO ACCESS — something the reader may no longer open is simply not on their shelf, however deliberately they once filed it',
    narrowed.items.length === 2 && !narrowed.items.some(i => i.refId === 'lo9'));
  ok('SH5b …with no placeholder and no trace of it anywhere in the payload — a greyed row saying "unavailable" discloses the thing it is hiding',
    !JSON.stringify(narrowed).includes('lo9'));
  /* SH5c — THE COUNT IS A DISCLOSURE, and this is the half that gets forgotten. Counting what was
     FILED rather than what RESOLVED reports the existence of exactly what the gate withheld:
     "this folder has 2 things and you can see 1" says one thing exists that you may not know
     about, which is the leak stated out loud. */
  ok('SH5c …and the folder\'s COUNT is of what resolved, not of what was filed — "2 items, 1 shown" is the leak said out loud',
    narrowed.folders.find(f => f.id === 'f1').count === 1 &&
    full.folders.find(f => f.id === 'f1').count === 2);
  ok('SH6 a gate that THROWS is a gate that refused, rather than one unreadable row emptying the whole shelf — passed as a thunk, because the failure being guarded against is an exception escaping and killing the read',
    () => shelf.view(filings, FOLDERS, (k) => { if (k === 'low') throw new Error('boom'); return { label: 'x' }; }).items.length === 2);
  ok('SH7 asking for one folder returns that folder\'s items, and asking for none returns the loose ones',
    shelf.view(filings, FOLDERS, gateOf({ 'focus:tf1': 'a', 'low:lo9': 'b', 'high:hi3': 'c' }), { folderId: 'f1' }).items.length === 2 &&
    shelf.view(filings, FOLDERS, gateOf({ 'focus:tf1': 'a', 'low:lo9': 'b', 'high:hi3': 'c' }), { folderId: null }).items.length === 1);
}

/* ── SH8-SH9: ordered by you, and never by importance. ── */
{
  const filings = [
    { id: 'a', kind: 'focus', refId: 'old', folderId: null, at: 100 },
    { id: 'b', kind: 'high',  refId: 'new', folderId: null, at: 900 },
  ];
  const gate = (kind, refId) => ({ label: refId, sub: '', whose: '', priority: refId === 'old' ? 'critical' : 'low' });
  const v = shelf.view(filings, FOLDERS, gate);
  ok('SH8 A SHELF IS ORDERED BY YOU — most recently filed first, so the thing you just put down is where you left it',
    v.items[0].refId === 'new' && v.items[1].refId === 'old');
  ok('SH8b …and NOT by importance, however urgent the gate says the older one is — Home ranks by priority because you are browsing; a folder is where you go for something specific',
    v.items[0].refId !== 'old');
  ok('SH9 two things filed in the same millisecond still come back in the same order every read, rather than shuffling under somebody looking for one of them',
    JSON.stringify(shelf.view([{ id: 'z', kind: 'focus', refId: 'z1', at: 5 }, { id: 'a', kind: 'focus', refId: 'a1', at: 5 }], [], () => ({ label: 'x' })).items.map(i => i.id)) === '["a","z"]');
}

/* ── SH10-SH12: folders. ── */
{
  const filings = [{ id: 'a', kind: 'focus', refId: 'tf1', folderId: 'gone', at: 1 }];
  const v = shelf.view(filings, FOLDERS, () => ({ label: 'The press' }));
  ok('SH10 a filing pointing at a folder that no longer exists comes back LOOSE rather than vanishing — deleting a folder has never been a way to lose track of your work',
    v.items.length === 1 && v.items[0].folderId === null && v.loose === 1);
  ok('SH11 a folder name is trimmed and bounded, because it is the only free text on the shelf',
    shelf.folderName('   Set   pieces   ') === 'Set pieces' && shelf.folderName('x'.repeat(500)).length === shelf.NAME_MAX);
  ok('SH12 the shelf says on itself what it is, because "saved to Library" is exactly the phrase that would make somebody think a copy was taken',
    /does not copy it/.test(v.note) && /does not decide who may open it/.test(v.note));
}

/* ── SH13: the cap. ── */
{
  const many = Array.from({ length: shelf.SHELF_CAP }, (_, i) => ({ id: `x${i}`, kind: 'focus', refId: `f${i}`, at: i }));
  ok('SH13 one person\'s shelf is bounded rather than unbounded, and a full one refuses in words rather than silently dropping what they just filed',
    shelf.file(many, { kind: 'focus', id: 'one-more' }, {}).ok === false &&
    /full/.test(shelf.file(many, { kind: 'focus', id: 'one-more' }, {}).reason));
  ok('SH13b …but something ALREADY on a full shelf can still be moved, because moving adds nothing',
    shelf.file(many, { kind: 'focus', id: 'f5' }, { folderId: 'f1' }).ok === true);
}

/* ── SH14: unfiling. ── */
{
  const list = [{ id: 'a', kind: 'focus', refId: 'tf1', at: 1 }];
  const r = shelf.unfile(list, 'a');
  ok('SH14 taking something off the shelf removes the bookmark and returns nothing else — the entry never held the thing, so there is nothing here that could delete it',
    r.ok && r.filings.length === 0);
  ok('SH14b …and removing something that is not there says so rather than reporting a success',
    shelf.unfile(list, 'nope').ok === false);
}

console.log(`\nshelf-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
