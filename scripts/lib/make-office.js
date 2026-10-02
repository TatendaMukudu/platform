/* Build REAL .docx / .xlsx / .pptx bytes, for tests that must prove the server can read a file
   rather than that it can read a string somebody handed it.

   THESE ARE ACTUAL ZIP ARCHIVES, written here with Node's own `zlib` and no dependency, because
   a fixture that is not a real file proves nothing about a reader whose whole job is opening real
   files. Both storage methods are emitted deliberately — DEFLATE, which is what Word and
   PowerPoint actually produce, and STORE, which is what some exporters and most
   "save as" tools on a phone produce — so `readZip` is exercised on both paths.

   Used by scripts/office-ingestion-http-smoke.js. Not part of the product. */

'use strict';
const zlib = require('zlib');

/* A minimal ZIP writer: local headers, then the central directory, then EOCD. */
function zip(entries, { deflate = true } = {}) {
  const files = [];
  const chunks = [];
  let offset = 0;
  for (const [name, body] of Object.entries(entries)) {
    const raw = Buffer.from(body, 'utf8');
    const comp = deflate ? zlib.deflateRawSync(raw) : raw;
    const method = deflate ? 8 : 0;
    const crc = crc32(raw);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0, 6);            // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);           // time
    local.writeUInt16LE(0, 12);           // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra len
    chunks.push(local, nameBuf, comp);
    files.push({ name: nameBuf, method, crc, comp: comp.length, raw: raw.length, offset });
    offset += local.length + nameBuf.length + comp.length;
  }

  const cdStart = offset;
  for (const f of files) {
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(f.method, 10);
    cd.writeUInt16LE(0, 12); cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(f.crc, 16);
    cd.writeUInt32LE(f.comp, 20);
    cd.writeUInt32LE(f.raw, 24);
    cd.writeUInt16LE(f.name.length, 28);
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(f.offset, 42);
    chunks.push(cd, f.name);
    offset += cd.length + f.name.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(offset - cdStart, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);
  chunks.push(eocd);
  return Buffer.concat(chunks);
}

let _table = null;
function crc32(buf) {
  if (!_table) {
    _table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      _table[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ _table[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* A Word document whose paragraphs are the strings given. */
function docx(paragraphs, opts) {
  const body = paragraphs.map(p => `<w:p><w:r><w:t>${esc(p)}</w:t></w:r></w:p>`).join('');
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`,
  }, opts);
}

/* A spreadsheet. `rows` is an array of arrays of strings; all text goes through sharedStrings,
   which is what Excel itself does and the path most likely to be wrong if it is wrong. */
function xlsx(rows, opts) {
  const uniq = [];
  const idx = v => { const i = uniq.indexOf(v); if (i >= 0) return i; uniq.push(v); return uniq.length - 1; };
  const col = n => { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  const sheetRows = rows.map((r, ri) =>
    `<row r="${ri + 1}">` + r.map((cell, ci) =>
      `<c r="${col(ci)}${ri + 1}" t="s"><v>${idx(String(cell))}</v></c>`).join('') + '</row>').join('');
  const ss = `<?xml version="1.0"?><sst count="${uniq.length}" uniqueCount="${uniq.length}">`
    + uniq.map(v => `<si><t>${esc(v)}</t></si>`).join('') + '</sst>';
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/sharedStrings.xml': ss,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
  }, opts);
}

/* A deck. `slides` is an array of arrays of paragraph strings. Deliberately produces slide10
   alongside slide2 when asked for ten, so numeric ordering is really exercised. */
function pptx(slides, opts) {
  const entries = { '[Content_Types].xml': '<?xml version="1.0"?><Types/>' };
  slides.forEach((paras, i) => {
    const body = paras.map(p => `<a:p><a:r><a:t>${esc(p)}</a:t></a:r></a:p>`).join('');
    entries[`ppt/slides/slide${i + 1}.xml`] =
      `<?xml version="1.0"?><p:sld xmlns:a="x" xmlns:p="y"><p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  });
  return zip(entries, opts);
}

module.exports = { zip, docx, xlsx, pptx, crc32 };
