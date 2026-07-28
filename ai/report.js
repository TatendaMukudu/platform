/* ============================================================
   ai/report.js — the grounded artifact layer (PURE)

   The first "creation" capability: turn what the reasoner and canonical evidence
   already KNOW into a shareable document (saved as a PDF from the browser's print).
   It is an OUTPUT edge — it renders truth, it never sources it. The governing rule,
   the same one that's held all along:

     NOTHING appears in a report that isn't grounded. Every fact must carry a source
     (a basis string from evidence / the reasoner). A fact without one is DROPPED, not
     printed. A section with no grounded facts says so honestly — it never pads.

   So a generated report can be handed to anyone, because there is nothing in it the
   system couldn't point to. PURE: imports nothing, no DB/IO, deterministic; the caller
   assembles the payload from real evidence and the server serves the HTML.
   ============================================================ */

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* Build the report MODEL from a payload. This is where the grounding guarantee is
   enforced: a fact survives only if it has both text AND a basis. Returns the model plus
   a count of how many ungrounded facts were refused (for transparency / auditing). */
function buildReport({ title, subject, generatedAt, intro, sections = [] } = {}) {
  let dropped = 0;
  const clean = (sections || []).map(s => {
    const facts = (s.facts || []).filter(f => {
      const ok = f && String(f.text || '').trim() && String(f.basis || '').trim();
      if (!ok) dropped++;
      return ok;
    }).map(f => ({ text: String(f.text), basis: String(f.basis) }));
    return { heading: String((s && s.heading) || 'Section'), facts, empty: facts.length === 0,
      emptyNote: String((s && s.emptyNote) || 'Not enough recorded yet to report on this.') };
  });
  return {
    title: String(title || 'Report'),
    subject: subject ? String(subject) : null,
    intro: intro ? String(intro) : null,
    generatedAt: generatedAt || new Date().toISOString(),
    sections: clean,
    droppedUngrounded: dropped,
    grounded: true,
  };
}

/* Render the model to a self-contained, print-ready HTML document. Inline CSS, A4-friendly,
   readable, no external anything. What's on the page is exactly what buildReport allowed —
   no fact is manufactured here. The footer states the honesty guarantee. */
function renderHtml(model) {
  const m = model || {};
  const date = (() => { try { return new Date(m.generatedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (_) { return ''; } })();
  const sections = (m.sections || []).map(s => `
      <section class="sec">
        <h2>${_esc(s.heading)}</h2>
        ${s.empty
          ? `<p class="empty">${_esc(s.emptyNote)}</p>`
          : `<ul>${s.facts.map(f => `<li><span class="fact">${_esc(f.text)}</span><span class="src">${_esc(f.basis)}</span></li>`).join('')}</ul>`}
      </section>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${_esc(m.title)}</title>
<style>
  :root{--ink:#17141f;--muted:#5e596f;--faint:#8f8aa3;--line:#e6e3ef;--accent:#6b4ae0}
  *{box-sizing:border-box}
  body{margin:0;background:#f4f3f9;color:var(--ink);
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5}
  .page{max-width:760px;margin:0 auto;padding:2.4rem 2rem 3rem;background:#fff;min-height:100vh;
    box-shadow:0 1px 40px rgba(20,14,45,.06)}
  header{border-bottom:2px solid var(--accent);padding-bottom:1rem;margin-bottom:1.6rem}
  .eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:.62rem;letter-spacing:.16em;
    text-transform:uppercase;color:var(--accent);margin:0 0 .35rem}
  h1{font-size:1.7rem;margin:0 0 .2rem;letter-spacing:-0.02em}
  .subject{color:var(--muted);font-size:1rem;margin:0}
  .date{color:var(--faint);font-size:.8rem;margin:.4rem 0 0;font-family:ui-monospace,Menlo,monospace}
  .intro{font-size:.98rem;color:var(--muted);margin:1.4rem 0 0}
  .sec{margin-top:1.8rem}
  h2{font-size:1.06rem;margin:0 0 .6rem;letter-spacing:-0.01em}
  ul{list-style:none;margin:0;padding:0}
  li{padding:.6rem 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:.2rem}
  li:first-child{border-top:0}
  .fact{font-size:.95rem}
  .src{font-family:ui-monospace,Menlo,monospace;font-size:.68rem;color:var(--faint)}
  .empty{color:var(--faint);font-size:.9rem;font-style:italic;margin:.2rem 0}
  footer{margin-top:2.4rem;padding-top:1rem;border-top:1px solid var(--line);
    color:var(--faint);font-size:.74rem;line-height:1.5}
  @media print{body{background:#fff}.page{box-shadow:none;max-width:none;padding:0}}
</style></head><body><div class="page">
  <header>
    <p class="eyebrow">IntelliQ · grounded report</p>
    <h1>${_esc(m.title)}</h1>
    ${m.subject ? `<p class="subject">${_esc(m.subject)}</p>` : ''}
    <p class="date">${_esc(date)}</p>
  </header>
  ${m.intro ? `<p class="intro">${_esc(m.intro)}</p>` : ''}
  ${sections}
  <footer>Every line above is drawn from recorded evidence, and shows its source. Where there
  wasn’t enough to say something, it says so — nothing here is invented or predicted.</footer>
</div></body></html>`;
}

module.exports = { buildReport, renderHtml, _esc };
