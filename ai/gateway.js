/* ============================================================
   ai/gateway.js — the single AI layer for IntelliQ + Platform

   Every Claude call should eventually route through here so that
   model choice, retries, cost control, and output validation live
   in ONE place instead of being copy-pasted across server.js.

   Tiers (override via env):
     micro   → fast / cheap, ingestion-time micro-tasks (default Haiku)
     reason  → higher-quality reasoning: advisor, learning synthesis
               (default Sonnet, with automatic downshift to micro if
                the configured model is unavailable on this account)

   Phase 1: the Individual Advisor and note classification route
   through this module. Existing call sites can be migrated
   incrementally without changing their behavior.
   ============================================================ */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  micro:  process.env.AI_MODEL_MICRO  || 'claude-haiku-4-5-20251001',
  reason: process.env.AI_MODEL_REASON || 'claude-sonnet-4-6',
};

/* ── Provider setup ──────────────────────────────────────────────────────────
   Claude is the primary reasoner. OpenAI, if a key is present, is an automatic
   FALLBACK — so a Claude outage / rate-limit / bad key never takes the product
   down, and the app runs on EITHER key alone. (Embeddings live in ai/embeddings
   and use OpenAI directly.) Nothing else in the app changes. */
const HAVE_CLAUDE = !!process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY || '';
const OPENAI_URL   = process.env.OPENAI_URL   || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const HAVE_OPENAI  = !!OPENAI_KEY;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Only text messages can cross to the OpenAI fallback (vision blocks stay on Claude). */
function _isTextOnly(msgs) {
  return (msgs || []).every(m => typeof m.content === 'string');
}

/* OpenAI chat-completions via fetch — no extra SDK. Returns assistant text. */
async function _openaiComplete({ system, msgs, maxTokens, temperature, model }) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  for (const m of msgs) messages.push({ role: m.role, content: m.content });
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: model || OPENAI_MODEL, max_tokens: maxTokens,
      ...(temperature != null ? { temperature } : {}), messages,
    }),
  });
  if (!res.ok) throw new Error('openai HTTP ' + res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function _isModelUnavailable(err) {
  const status = err?.status || err?.statusCode;
  const msg    = (err?.message || '').toLowerCase();
  return status === 404 || (/model/.test(msg) && /(not.*found|does not exist|unknown|invalid)/.test(msg));
}

/* ── complete ──────────────────────────────────────────────────────────────
   Returns the assistant text (string). Retries network/5xx/429 with backoff.
   If the chosen tier's model is unavailable, downshifts once to `micro`
   so a misconfigured AI_MODEL_REASON degrades gracefully instead of 500ing.
──────────────────────────────────────────────────────────────────────────── */
async function complete({
  tier = 'micro', model, system, messages, user,
  maxTokens = 400, temperature, fallbackToMicro = true,
}) {
  const primary = model || MODELS[tier] || MODELS.micro;
  const msgs    = messages || [{ role: 'user', content: user }];

  // If there's no Claude key but there is an OpenAI key, run OpenAI directly.
  if (!HAVE_CLAUDE && HAVE_OPENAI && _isTextOnly(msgs)) {
    return _openaiComplete({ system, msgs, maxTokens, temperature });
  }

  const call = (m) => client.messages.create({
    model: m,
    max_tokens: maxTokens,
    ...(temperature != null ? { temperature } : {}),
    ...(system ? { system } : {}),
    messages: msgs,
  });

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await call(primary);
      return resp.content?.[0]?.text?.trim() || '';
    } catch (err) {
      lastErr = err;

      // Configured reasoning model not on this account → downshift once.
      if (_isModelUnavailable(err) && fallbackToMicro && primary !== MODELS.micro) {
        try {
          const resp = await call(MODELS.micro);
          return resp.content?.[0]?.text?.trim() || '';
        } catch (err2) { lastErr = err2; }
      }

      const status = err?.status || err?.statusCode;
      // Non-retryable client errors (other than rate limit) → stop.
      if (status && status < 500 && status !== 429) break;
      await sleep(400 * Math.pow(2, attempt));
    }
  }

  // Claude failed after retries → automatic OpenAI fallback (text only) if available.
  if (HAVE_OPENAI && _isTextOnly(msgs)) {
    try { return await _openaiComplete({ system, msgs, maxTokens, temperature }); }
    catch (err3) { lastErr = err3; }
  }
  throw lastErr;
}

/* ── parseJSON ─────────────────────────────────────────────────────────────
   Tolerant JSON extraction — strips code fences and grabs the first object.
──────────────────────────────────────────────────────────────────────────── */
function parseJSON(text) {
  if (!text) return null;
  let t = String(text).trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try { return JSON.parse(t); } catch (_) {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

/* ── completeJSON ──────────────────────────────────────────────────────────
   Like complete() but returns a parsed object (or null on parse failure).
   Pass `schema` (array of required top-level keys) to validate — returns
   null if any required key is missing so callers can fall back cleanly.
──────────────────────────────────────────────────────────────────────────── */
async function completeJSON(opts) {
  const text = await complete(opts);
  const obj  = parseJSON(text);
  if (!obj) return null;
  if (Array.isArray(opts.schema)) {
    for (const key of opts.schema) {
      if (!(key in obj)) return null;
    }
  }
  return obj;
}

// True when at least one model is configured — callers gate optional LLM prose
// on this so that with no key they skip the call entirely (no network, no wait).
function enabled() { return HAVE_CLAUDE || HAVE_OPENAI; }

module.exports = { complete, completeJSON, parseJSON, MODELS, client, enabled };
