/* ============================================================
   lib/office.js — read Excel (.xlsx) and Word (.docx) with NO dependencies.

   Both formats are just ZIP archives of XML. We read the ZIP central directory,
   inflate the entries we need, and pull the values out with small, defensive
   parsers. Everything is wrapped so a malformed file can never throw into the
   request path — callers get null and degrade honestly.

   Exports:
     xlsxToText(buffer) → CSV-style text (header row + data rows) or null
     docxToText(buffer) → plain text (paragraphs on their own lines) or null
   ============================================================ */

const zlib = require('zlib');

/* Read a ZIP buffer into { filename: Buffer } using the central directory (robust
   against data descriptors). Returns {} on anything unexpected. */
function readZip(buf) {
  const out = {};
  try {
    // Find End Of Central Directory (0x06054b50), scanning back from the end.
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return out;
    const count  = buf.readUInt16LE(eocd + 10);
    let ptr      = buf.readUInt32LE(eocd + 16);   // central directory offset
    for (let e = 0; e < count; e++) {
      if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) break;
      const method   = buf.readUInt16LE(ptr + 10);
      const compSize = buf.readUInt32LE(ptr + 20);
      const nameLen  = buf.readUInt16LE(ptr + 28);
      const extraLen = buf.readUInt16LE(ptr + 30);
      const cmtLen   = buf.readUInt16LE(ptr + 32);
      const lho      = buf.readUInt32LE(ptr + 42);   // local header offset
      const name     = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
      // Jump to the local header to find where the data actually starts.
      if (lho + 30 <= buf.length && buf.readUInt32LE(lho) === 0x04034b50) {
        const lNameLen  = buf.readUInt16LE(lho + 26);
        const lExtraLen = buf.readUInt16LE(lho + 28);
        const dataStart = lho + 30 + lNameLen + lExtraLen;
        const raw = buf.subarray(dataStart, dataStart + compSize);
        try { out[name] = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw); } catch (_) {}
      }
      ptr += 46 + nameLen + extraLen + cmtLen;
    }
  } catch (_) {}
  return out;
}

const _decode = s => String(s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch (_) { return ''; } });

/* Column letters ("A", "AB") → zero-based index. */
function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function xlsxToText(buffer) {
  try {
    const files = readZip(buffer);
    // Shared strings (most text cells reference these by index).
    const shared = [];
    const ssXml = files['xl/sharedStrings.xml'];
    if (ssXml) {
      const s = ssXml.toString('utf8');
      // Each <si> may hold several <t> runs; concatenate them.
      (s.match(/<si\b[\s\S]*?<\/si>/g) || []).forEach(si => {
        const t = (si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map(m => _decode(m.replace(/<[^>]+>/g, ''))).join('');
        shared.push(t);
      });
    }
    // First worksheet.
    const sheetName = Object.keys(files).find(k => /^xl\/worksheets\/sheet1\.xml$/i.test(k))
      || Object.keys(files).find(k => /^xl\/worksheets\/.*\.xml$/i.test(k));
    if (!sheetName) return null;
    const sheet = files[sheetName].toString('utf8');
    const rows = [];
    (sheet.match(/<row\b[\s\S]*?<\/row>/g) || []).forEach(rowXml => {
      const cells = [];
      (rowXml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(cXml => {
        const ref = (cXml.match(/r="([A-Z]+)\d+"/) || [])[1];
        const idx = ref ? colIndex(ref) : cells.length;
        const type = (cXml.match(/\bt="([^"]+)"/) || [])[1];
        let val = '';
        if (type === 's') { const vi = (cXml.match(/<v>([\s\S]*?)<\/v>/) || [])[1]; val = shared[+vi] || ''; }
        else if (type === 'inlineStr') { val = _decode((cXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/) || [])[1] || ''); }
        else { const v = (cXml.match(/<v>([\s\S]*?)<\/v>/) || [])[1]; val = v != null ? _decode(v) : ''; }
        cells[idx] = String(val).replace(/[\r\n,]+/g, ' ').trim();
      });
      if (cells.length) rows.push(Array.from(cells, c => c || ''));
    });
    if (!rows.length) return null;
    return rows.map(r => r.join(',')).join('\n');
  } catch (_) { return null; }
}

function docxToText(buffer) {
  try {
    const files = readZip(buffer);
    const doc = files['word/document.xml'];
    if (!doc) return null;
    let xml = doc.toString('utf8');
    // Paragraphs → newlines, tabs → spaces, then pull the <w:t> runs.
    xml = xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab[^>]*\/>/g, '\t');
    const text = (xml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map(m => _decode(m.replace(/<[^>]+>/g, ''))).join('');
    // The join above dropped paragraph breaks; re-derive them from the stripped xml.
    const withBreaks = xml.replace(/<[^>]+>/g, '');
    const clean = _decode(withBreaks).replace(/\n{3,}/g, '\n\n').trim();
    return (clean || text || '').trim() || null;
  } catch (_) { return null; }
}

/* ── PowerPoint (.pptx) ───────────────────────────────────────────────────────────────────────
   FOUNDER DECISION, September 2026: document understanding must not depend on a runtime browser
   CDN. The other two readers here were written dependency-free and then never called from the
   request path; the browser parsed everything with JSZip and SheetJS and sent text. This is the
   third reader, so the whole Office set can be read by the server that already holds it.

   A .pptx is a ZIP whose slides are `ppt/slides/slideN.xml`, with the visible words in `<a:t>`
   runs. Slides are numbered in the file names, and NUMERIC order is not string order — slide10
   sorts before slide2 alphabetically, which would hand somebody a deck in the wrong order and
   make "the third slide" mean a different thing to IntelliQ than to them.

   THE OUTPUT SHAPE IS NOT INCIDENTAL. `ai/material.js segment()` splits a deck on
   `\nSlide N:` and derives one section per slide, so the parts a person later marks "not yet"
   line up with the slides they are looking at. Emitting anything else here would silently turn a
   twenty-slide deck into one wall of text. */
function pptxToText(buffer) {
  try {
    const files = readZip(buffer);
    const names = Object.keys(files)
      .filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
      .sort((a, b) => (parseInt(a.match(/(\d+)\.xml$/i)[1], 10) - parseInt(b.match(/(\d+)\.xml$/i)[1], 10)));
    if (!names.length) return null;
    const slides = [];
    names.forEach((n, i) => {
      const xml = files[n].toString('utf8');
      /* A paragraph break between `<a:p>` blocks, so a title and its bullets do not run into one
         another as a single sentence. */
      const text = (xml.replace(/<\/a:p>/g, '\n').match(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>|\n/g) || [])
        .map(m => (m === '\n' ? '\n' : _decode(m.replace(/<[^>]+>/g, ''))))
        .join(' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, ' ')
        .trim();
      if (text) slides.push(`Slide ${i + 1}: ${text}`);
    });
    if (!slides.length) return null;
    return slides.join('\n\n');
  } catch (_) { return null; }
}

/* ── ONE PLACE THAT KNOWS WHICH READER A FILE NEEDS ───────────────────────────────────────────
   So the picker, the upload validator and the extractor cannot disagree about what is supported.
   A kind with no reader here is not supported, whatever any list elsewhere says. */
const READERS = Object.freeze({ docx: docxToText, xlsx: xlsxToText, pptx: pptxToText });
const SUPPORTED = Object.freeze(Object.keys(READERS));

/* Read a file of a named kind. Returns null for an unknown kind, an unreadable file, or one that
   yielded no words — the three cases a caller must all treat as "nothing usable came out". */
function toText(kind, buffer) {
  const reader = READERS[String(kind || '').toLowerCase()];
  if (!reader || !buffer || !buffer.length) return null;
  const out = reader(buffer);
  return out && String(out).trim() ? String(out) : null;
}

module.exports = { xlsxToText, docxToText, pptxToText, readZip, toText, READERS, SUPPORTED };
