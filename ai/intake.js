/* ============================================================
   ai/intake.js — PURE universal-intake parsers + classification

   Turns raw external content into NORMALISED intake units, ready for the one
   governed ingestion boundary in server.js to record as canonical evidence. This
   module is PURE: no DB, no server, no AI, no authorization, no evidence writes.
   It only PARSES and CLASSIFIES.

   Deterministic formats (no dependencies): text, markdown, csv, json.
   Binary formats (pdf, docx): this module accepts ALREADY-EXTRACTED text — binary
   extraction needs a parser library that isn't a dependency here; the pipeline is
   format-agnostic and wires a real extractor when one is present (see report).

   One unit → one canonical evidence envelope. CSV rows and JSON array elements
   become one unit EACH (never flattened into a single blob), each retaining its
   source file + row/index + original values.
   ============================================================ */

const adapters = require('./adapters');   // reuse the existing CSV parser (pure)

const SUPPORTED = ['text', 'markdown', 'md', 'pdf', 'docx', 'csv', 'json'];

function _norm(fmt) {
  const f = String(fmt || 'text').toLowerCase();
  return f === 'md' ? 'markdown' : f;
}

/* Render a structured record as stable, human-readable "key: value | …" text so it
   is retrievable and citable, while the original values are retained separately. */
function _renderRecord(obj) {
  return Object.entries(obj || {})
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${String(v).slice(0, 300)}`)
    .join(' | ');
}

/* A person/group/project reference an imported record may carry — reused by the
   server's identity resolution (never invents an identity). */
function _subjectRef(obj) {
  for (const k of ['name', 'member', 'memberName', 'person', 'employee', 'fullName', 'email']) {
    if (obj && obj[k] != null && String(obj[k]).trim()) return String(obj[k]).trim();
  }
  return null;
}

/* Markdown: preserve the text/structure; lift the first heading as a title and
   list headings so classification + citation have structure to work with. */
function _markdownHeadings(text) {
  const heads = [];
  String(text || '').split('\n').forEach(l => { const m = l.match(/^(#{1,6})\s+(.*)$/); if (m) heads.push({ level: m[1].length, text: m[2].trim() }); });
  return heads;
}

/* Classify normalised content into an EXISTING evidence category (not a parallel
   taxonomy — the envelope keeps type='document'; this is stored as an attribute).
   Deterministic keyword heuristic. */
const CATEGORY_RULES = [
  ['policy',       /\b(policy|policies|entitlement|reimburs|allowance|pto|paid time off|vacation|annual leave|code of conduct)\b/i],
  ['procedure',    /\b(procedure|process|steps?|how to|checklist|onboarding|workflow)\b/i],
  ['meeting_note', /\b(meeting|minutes|agenda|discussed|action items?|attendees|stand[- ]?up|retro)\b/i],
  ['schedule',     /\b(schedule|session|starts? at|kick[- ]?off|fixture|roster|timetable|calendar)\b/i],
  ['objective',    /\b(objective|goal|target|okr|kpi target|milestone)\b/i],
  ['metric',       /\b(score|metric|kpi|average|total|percentage|\d+%)\b/i],
  ['reference',    /\b(reference|see also|link|appendix|glossary|definition)\b/i],
];
function classify(text) {
  const t = String(text || '');
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  return 'knowledge';
}

/* Parse raw content into normalised units. Returns { sourceType, units, warnings,
   failures }. Never throws — a bad record becomes a failure entry. */
function parse({ format, content, sourceName } = {}) {
  const sourceType = _norm(format);
  const warnings = [], failures = [], units = [];
  const name = String(sourceName || 'import').slice(0, 200);
  const raw = content == null ? '' : (typeof content === 'string' ? content : JSON.stringify(content));

  if (!SUPPORTED.includes(sourceType)) { failures.push({ reason: 'unsupported_format', format: sourceType }); return { sourceType, units, warnings, failures }; }

  try {
    if (sourceType === 'csv') {
      const arr = adapters.parseCSV(raw);                    // array-of-arrays; row 0 = headers (pure)
      if (arr.length < 2) warnings.push('no CSV data rows found');
      const headers = (arr[0] || []).map(h => String(h).trim());
      for (let i = 1; i < arr.length; i++) {
        const cells = arr[i] || [];
        const row = {};
        headers.forEach((h, ci) => { if (h) row[h] = cells[ci] != null ? String(cells[ci]).trim() : ''; });
        const text = _renderRecord(row);
        if (!text) { failures.push({ unit: 'row' + i, reason: 'empty_row' }); continue; }
        units.push({ unitKey: 'row' + i, title: `${name} — row ${i}`, text,
          structured: { rowNumber: i, values: row }, subjectRef: _subjectRef(row) });
      }
    } else if (sourceType === 'json') {
      let data; try { data = typeof content === 'object' ? content : JSON.parse(raw); }
      catch (e) { failures.push({ reason: 'invalid_json', detail: e.message }); return { sourceType, units, warnings, failures }; }
      const arr = Array.isArray(data) ? data : [data];
      arr.forEach((obj, i) => {
        if (obj == null) return;
        const isObj = typeof obj === 'object' && !Array.isArray(obj);
        const text = isObj ? _renderRecord(obj) : String(obj);
        if (!text) { failures.push({ unit: 'item' + (i + 1), reason: 'empty_item' }); return; }
        units.push({ unitKey: Array.isArray(data) ? 'item' + (i + 1) : 'object', title: `${name}${Array.isArray(data) ? ' — item ' + (i + 1) : ''}`,
          text, structured: { rowNumber: Array.isArray(data) ? i + 1 : null, values: isObj ? obj : { value: obj } }, subjectRef: isObj ? _subjectRef(obj) : null });
      });
    } else if (sourceType === 'markdown') {
      const heads = _markdownHeadings(raw);
      const title = (heads[0] && heads[0].text) || name;
      if (!raw.trim()) { failures.push({ reason: 'empty_document' }); return { sourceType, units, warnings, failures }; }
      units.push({ unitKey: 'doc', title, text: raw, structured: { headings: heads.map(h => h.text).slice(0, 50) } });
    } else {
      // text, and pdf/docx passed as already-extracted text.
      if (!raw.trim()) { failures.push({ reason: 'empty_document' }); return { sourceType, units, warnings, failures }; }
      if (sourceType === 'pdf' || sourceType === 'docx') warnings.push(`${sourceType}: text accepted as pre-extracted (no binary extractor bundled)`);
      const firstLine = raw.split('\n').map(s => s.trim()).find(Boolean) || name;
      units.push({ unitKey: 'doc', title: firstLine.slice(0, 120) || name, text: raw, structured: null });
    }
  } catch (e) {
    failures.push({ reason: 'parse_error', detail: e.message });
  }

  // Attach a deterministic category to each unit.
  units.forEach(u => { u.category = classify(u.text); });
  return { sourceType, units, warnings, failures };
}

module.exports = { parse, classify, SUPPORTED, _renderRecord, _subjectRef, _markdownHeadings };
