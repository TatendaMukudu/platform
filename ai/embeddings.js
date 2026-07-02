/* ============================================================
   ai/embeddings.js — optional embeddings for cross-member search

   GATED: does nothing unless EMBEDDINGS_API_KEY is set. When set,
   embeds text via any OpenAI-compatible embeddings endpoint
   (OpenAI, Voyage, etc. — set EMBEDDINGS_URL/MODEL to match).

   Env:
     EMBEDDINGS_API_KEY   — provider key (absence = feature off)
     EMBEDDINGS_URL       — default https://api.openai.com/v1/embeddings
     EMBEDDINGS_MODEL     — default text-embedding-3-small
     EMBEDDINGS_DIM       — default 1536 (must match the model + db column)
   ============================================================ */

const KEY   = process.env.EMBEDDINGS_API_KEY || '';
const URL   = process.env.EMBEDDINGS_URL   || 'https://api.openai.com/v1/embeddings';
const MODEL = process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small';
const DIM   = parseInt(process.env.EMBEDDINGS_DIM || '1536', 10) || 1536;

function enabled() { return !!KEY; }

/* Returns a number[] embedding, or null on any failure / when disabled. */
async function embed(text) {
  if (!KEY || !text) return null;
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, input: String(text).slice(0, 8000) }),
    });
    if (!res.ok) { console.warn('[embeddings] HTTP', res.status); return null; }
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch (err) {
    console.warn('[embeddings] error:', err.message);
    return null;
  }
}

module.exports = { enabled, embed, MODEL, DIM };
