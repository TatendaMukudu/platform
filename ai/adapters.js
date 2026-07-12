/* ============================================================
   ai/adapters.js — source adapters (the "everything is a signal" contract)

   An adapter turns one source's raw shape into the universal per-member structure
   the kernel already understands: { members: [{ name, metrics:[{label,value}], note }] }.
   That structure flows through the existing attribution + signal pipeline, so a
   new source needs an adapter here and NOTHING else in the kernel.

   Source-agnostic by construction; domain meaning is derived later by the packs.
   ============================================================ */

/* Robust-enough CSV parser (handles quoted fields + commas inside quotes). */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

/* CSV → per-member metrics. Convention: first column = member name; every other
   column is a metric (numeric kept as number, else short text). One row per member. */
function csv(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { members: [] };
  const headers = rows[0].map(h => String(h).trim());
  const members = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const name = String(cells[0] || '').trim();
    if (!name) continue;
    const metrics = [];
    for (let c = 1; c < headers.length; c++) {
      const label = headers[c]; const raw = cells[c] != null ? String(cells[c]).trim() : '';
      if (!label || raw === '') continue;
      const num = Number(raw);
      metrics.push({ label, value: Number.isFinite(num) ? num : raw });   // Infinity/NaN → keep as text
    }
    if (metrics.length) members.push({ name, metrics });
  }
  return { members };
}

module.exports = { csv, parseCSV };
