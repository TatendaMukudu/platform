/* ============================================================
   ai/render-artifact.js — the LLM as the OUTPUT interface (governed).

   The mirror of the reasoning register, pointed outward. When governed data needs to be
   PRESENTED — a written summary, an email, later a spreadsheet/PDF — the LLM composes it, but
   it may only style, arrange, and narrate the DATASET IT WAS GIVEN. The human decides first;
   the LLM manipulates the data after that decision; the deterministic core owns the figures.

   The inviolable rule, enforced in code (not just the prompt):
     EVERY figure in the output must trace to the source dataset. A number that isn't in the
     data is an invented figure — governArtifact catches it, and the caller falls back to the
     plain factual version, so a fabricated number NEVER reaches the reader.

   Pure: no IO, no LLM. The server gathers the governed dataset and makes the optional model
   call; this module builds the prompt, governs the output, and provides the deterministic
   fallback that works with no model at all.
   ============================================================ */

const FORMATS = ['summary', 'email'];

/* Extract comparable numeric tokens ("1,240", "50%", "3.2") normalised to their bare digits. */
function _numbers(str) {
  return (String(str == null ? '' : str).match(/\d[\d,]*(?:\.\d+)?%?/g) || []).map(s => s.replace(/[,%\s]/g, ''));
}
function _rowText(r) { return [r && r.label, r && r.value, r && r.value2, r && r.detail, r && r.note].filter(v => v != null).join(' '); }

/* Build the message the model composes from: the intent, the chosen format, and the governed
   rows (each with an id it must cite in usedRefs). These rows are the ONLY facts it may use. */
function buildDatasetMessage({ intent = '', format = 'summary', dataset = {} } = {}) {
  const rows = (dataset.rows || []);
  const lines = [
    `TASK: compose a ${FORMATS.includes(format) ? format : 'summary'} for this request: "${String(intent || 'summarise this data').trim()}"`,
    `TITLE (you may reuse or refine): ${dataset.title || 'Summary'}`,
    '',
    'DATASET — the ONLY facts you may use. Every figure in your output must come from these rows.',
  ];
  if (rows.length) for (const r of rows.slice(0, 40)) lines.push(`  [${r.id}] ${_rowText(r)}`);
  else lines.push('  (no rows — there is nothing recorded to present; say so plainly, invent nothing.)');
  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You format and write up data that has ALREADY been decided and provided to you. You are the',
  'presentation layer, not the source of truth.',
  'Absolute rule: use ONLY the figures and facts in the provided DATASET. Never introduce a',
  'number, name, date, or fact that is not in those rows. If the data does not support a point,',
  'do not make it. If there is nothing to present, say so plainly.',
  'Write clearly and in a tone that fits the format (a summary is concise and structured; an',
  'email is courteous and to the point). Cite the rows you used by their ids in usedRefs.',
  'Respond ONLY with JSON: { "title": string, "body": string, "usedRefs": string[] }.',
  'For an email, put the subject on the first line of body as "Subject: …" then the message.',
].join('\n');

/* Govern the composed artifact: validate refs and — the core guarantee — verify every numeric
   token in the body appears in the dataset. Returns { ok, artifact, violations }. When not ok,
   the caller shows the deterministic version instead, so an invented figure is never presented. */
function governArtifact({ composed, dataset = {}, format = 'summary' } = {}) {
  const rows = dataset.rows || [];
  const rowIds = new Set(rows.map(r => String(r.id)));
  const allowed = new Set();
  for (const r of rows) for (const n of _numbers(_rowText(r))) allowed.add(n);
  for (const n of _numbers(dataset.title)) allowed.add(n);

  const body = String(composed && composed.body || '');
  const title = String(composed && composed.title || dataset.title || 'Summary').slice(0, 200);
  const usedRefs = (Array.isArray(composed && composed.usedRefs) ? composed.usedRefs : []).map(String).filter(id => rowIds.has(id));

  const violations = [];
  if (!body.trim()) violations.push({ kind: 'empty' });
  const invented = [...new Set(_numbers(body).filter(n => !allowed.has(n)))];
  if (invented.length) violations.push({ kind: 'invented_figure', values: invented });

  const ok = violations.length === 0;
  return { ok, violations, artifact: ok ? { format: FORMATS.includes(format) ? format : 'summary', title, body, usedRefs } : null };
}

/* The deterministic fallback — a truthful draft drawn straight from the data, no model needed.
   This is what shows when the writing engine is off, and what the caller falls back to if the
   composed draft ever references a figure the data doesn't contain. */
function deterministicSummary(dataset = {}, format = 'summary') {
  const rows = dataset.rows || [];
  const title = dataset.title || 'Summary';
  if (!rows.length) {
    const body = `There's nothing recorded to present here yet.`;
    return { format: FORMATS.includes(format) ? format : 'summary', title, body, usedRefs: [] };
  }
  const bullets = rows.slice(0, 25).map(r => `• ${r.label || _rowText(r)}${r.value != null ? ` — ${r.value}` : ''}`);
  const factual = `${bullets.join('\n')}\n\n(A plain, factual list drawn straight from your recorded data — nothing added.)`;
  const body = format === 'email'
    ? `Subject: ${title}\n\nHi,\n\nHere's the current picture from the recorded data:\n\n${factual}\n\nBest,`
    : `${title}\n\n${factual}`;
  return { format: FORMATS.includes(format) ? format : 'summary', title, body, usedRefs: rows.slice(0, 25).map(r => String(r.id)) };
}

module.exports = { FORMATS, buildDatasetMessage, SYSTEM_PROMPT, governArtifact, deterministicSummary, _numbers };
