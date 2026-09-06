/* ============================================================
   ai/shelf.js — WHERE YOU PUT YOUR OWN WORK SO YOU CAN FIND IT AGAIN.

   Founder, September 2026: "how about we make library like chat gpt? In which you can open and
   name folders store focuses, highs and lows of your choice there? So that it's easier to come
   back and navigate your work if you are looking for something specific?"

   That is a navigation feature, and the temptation is to build it as a storage feature — which
   is what the Library was before this and why it had to be rebuilt. The old one SAVED things: it
   flattened a conversation into a text blob and kept the blob beside the live conversation, so
   from that moment there were two of them, drifting, with no way to tell which one you were
   reading. This one saves nothing. It writes down WHERE something is, and goes and gets it when
   you look.

   Everything below follows from that one difference.

   ── THE LAWS ────────────────────────────────────────────────────────────────────────────────

   L-SH1  A SHELF HOLDS REFERENCES, NEVER COPIES. Filing a focus stores its kind and its id and
          nothing else — not its title, not its text, not its state. The same law that governs
          evidence in this codebase, for the same reason: a copy is a claim about the past that
          stops being true and cannot be corrected.

   L-SH2  FILING CONFERS NO ACCESS. Putting something in a folder does not make it readable, to
          you or to anybody else. Every item is resolved at read time through the reader's own
          view — the identical gate that answers the question anywhere else in the product. A
          shelf is an index of things you could already open.

   L-SH3  FILING SAYS NOTHING ABOUT THE THING FILED. It is not agreement, not a vote, not
          evidence, not a direction, and it never reaches the kernel. Somebody who files a low
          has said only that they want to find it again. This is the Focus ruling applied one
          layer out: starting says nothing.

   L-SH4  A LABEL IS READ LIVE, NEVER STORED. What a folder shows is the object's title as it is
          NOW. Storing the label at filing time would be L-SH1 through the back door, and worse:
          a title captured while you could see something would survive after you no longer could.

   L-SH5  WHAT YOU MAY NOT SEE IS NOT THERE. A reference that will not resolve is dropped in
          silence — no placeholder, no greyed row, no "2 more items", and no count that includes
          it. A number is a disclosure: "this folder has 5 things and you can see 3" says three
          things exist that somebody decided you should not know about.

   L-SH6  A SHELF IS ORDERED BY YOU, NOT BY IMPORTANCE. Home ranks by priority and is supposed
          to; a folder is where you go for something SPECIFIC, so it must be where you left it.
          Nothing here sorts by score, band or urgency.

   Pure: no IO, no LLM, no clock of its own.
   ============================================================ */

'use strict';

/* WHAT MAY BE FILED. Everything a person makes or is shown, each of which already has an access
   gate of its own — this module never invents a seventh kind of thing, because a kind with no
   existing gate would need a new one, and a new gate is a second answer to a question the
   product already answers. */
const KINDS = Object.freeze(['focus', 'high', 'low', 'inquiry', 'conversation', 'material']);

const FOLDER_CAP = 100;    // folders one person may have. Beyond this it is not navigation any more.
const SHELF_CAP  = 2000;   // things one person may file.
const NAME_MAX   = 80;

const _s = (v, n = 200) => String(v == null ? '' : v).slice(0, n);
const _arr = v => (Array.isArray(v) ? v : []);
const _num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

const key = (kind, refId) => `${kind}:${refId}`;

/* A filing is (kind, id) and nothing else — L-SH1 in one function. Anything extra a caller
   passes in is dropped here rather than deeper, so there is one place to check that a title has
   not crept into the record. */
function normalize(entry = {}) {
  const kind = _s(entry.kind, 20);
  const refId = _s(entry.refId != null ? entry.refId : entry.id, 120);
  if (!KINDS.includes(kind) || !refId) return null;
  return { kind, refId };
}

/* Name a folder. Folders are the one thing on the shelf a person writes, so this is the only
   free text in the module. */
function folderName(raw) {
  return _s(String(raw == null ? '' : raw).trim().replace(/\s+/g, ' '), NAME_MAX);
}

/* FILE SOMETHING, OR MOVE IT.

   Filing the same thing twice is not two entries. A person who files a focus into Set Pieces and
   later files it into Saturday has MOVED it — which is what they meant, and what the alternative
   (the same focus in two folders) would make them clean up by hand. Idempotent on (kind, id),
   which also makes the control safe to press twice on a slow phone. */
function file(filings, entry, { folderId = null, at = 0, id = null } = {}) {
  const list = _arr(filings);
  const ref = normalize(entry);
  if (!ref) return { ok: false, reason: 'that is not something that can be filed', filings: list };

  const existing = list.find(f => f && key(f.kind, f.refId) === key(ref.kind, ref.refId));
  if (existing) {
    const moved = (existing.folderId || null) !== (folderId || null);
    existing.folderId = folderId || null;
    existing.at = _num(at) || existing.at;
    return { ok: true, filings: list, entry: existing, moved, added: false };
  }
  if (list.length >= SHELF_CAP) return { ok: false, reason: 'this shelf is full', filings: list };

  const rec = { id: _s(id, 60) || `shf_${ref.kind}_${ref.refId}`, kind: ref.kind, refId: ref.refId,
    folderId: folderId || null, at: _num(at) };
  list.push(rec);
  return { ok: true, filings: list, entry: rec, moved: false, added: true };
}

function unfile(filings, entryId) {
  const list = _arr(filings);
  const before = list.length;
  const kept = list.filter(f => f && f.id !== _s(entryId, 60));
  return { ok: kept.length < before, filings: kept };
}

/* ── WHAT THE SHELF LOOKS LIKE WHEN YOU OPEN IT ──────────────────────────────────────────────

   `lookup(kind, refId)` is the CALLER'S access gate, handed in. It returns the live object's
   label or null, and null means exactly one thing: not for this reader, right now. This module
   never asks why — whether the thing was deleted, or the reader left the squad that owned it,
   is a distinction that must not be visible on a shelf (L-SH5), and a module that could tell
   them apart would eventually be asked to say which.

   Everything the reader may see is resolved live (L-SH4). Nothing else appears at all. */
function view(filings, folders, lookup, { folderId = undefined } = {}) {
  const fn = typeof lookup === 'function' ? lookup : () => null;
  const known = _arr(folders)
    .slice(0, FOLDER_CAP)
    .map(f => ({ id: _s(f && f.id, 60), name: folderName(f && f.name) || 'Untitled folder' }))
    .filter(f => f.id);
  const ids = new Set(known.map(f => f.id));

  const resolved = [];
  for (const f of _arr(filings)) {
    if (!f || !KINDS.includes(f.kind)) continue;
    let live = null;
    // A gate that throws is a gate that refused. Treat it as a refusal rather than letting one
    // unreadable item empty the whole shelf.
    try { live = fn(f.kind, f.refId); } catch (_) { live = null; }
    if (!live) continue;                                    // L-SH5 — silently absent.
    resolved.push({
      id: f.id, kind: f.kind, refId: f.refId,
      // A folder that was deleted leaves its contents loose rather than taking them with it.
      folderId: ids.has(f.folderId) ? f.folderId : null,
      at: _num(f.at),
      label: _s(live.label, 200) || 'Untitled',
      sub: _s(live.sub, 200) || '',
      whose: _s(live.whose, 80) || '',
      // The address the client opens. Same shape the rest of the app binds threads by, so a
      // shelf row and a card from Home lead to the identical place.
      about: `${f.kind}:${f.refId}`,
    });
  }

  // L-SH6 — newest filed first, and by id when two land in the same millisecond so the order is
  // the same on every read. Never by score, band or urgency.
  resolved.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));

  const counted = known.map(f => ({
    id: f.id, name: f.name,
    // L-SH5 — counted from what this reader can actually see. A count of everything filed would
    // report the existence of what the gate just withheld.
    count: resolved.filter(r => r.folderId === f.id).length,
  }));

  const wanted = folderId === undefined ? resolved
    : resolved.filter(r => (r.folderId || null) === (folderId || null));

  return {
    folders: counted,
    items: wanted,
    loose: resolved.filter(r => !r.folderId).length,
    note: 'A folder points at your work. It does not copy it, and it does not decide who may open it.',
  };
}

module.exports = { KINDS, FOLDER_CAP, SHELF_CAP, NAME_MAX, key, normalize, folderName, file, unfile, view };
