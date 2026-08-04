/* ============================================================
   ai/kernel-coreasoning.js — the LLM helps the KERNEL reason, without ever owning truth.

   The rule, in one line: THE LLM SHAPES THE QUESTIONS; THE DETERMINISTIC KERNEL OWNS THE
   ANSWERS. The belief ledger is only ever written by deterministic derivation from real
   signals. This layer never writes a belief, never predicts an outcome, never names a
   person. It makes the brain SMARTER ABOUT WHAT TO LOOK AT, in three safe roles:

     1. HYPOTHESIS      — reading the aggregate patterns the kernel has ALREADY derived, it
                          offers an industry-informed hypothesis to TEST ("a cluster pulling
                          back defensively often co-occurs with a formation mismatch"). It
                          enters as a hypothesis at low readiness; the Confidence Engine
                          confirms or refutes it against recorded evidence. LLM proposes,
                          data disposes.
     2. COLLECTION GAP  — knowing the industry priors, it names signals worth COLLECTING that
                          the org isn't capturing yet (the empty shelves). Feeds the inquiry
                          engine. It points at missing data; it never invents the data.
     3. FRAMING         — industry-framed, LABELLED commentary on an ALREADY-CONFIRMED pattern.
                          Never a new belief; a framing can only attach to a confirmed pattern.

   THE SAFETY BACKBONE IS DE-IDENTIFICATION. The model is given ONLY aggregate counts and
   structure — never a name, never a subject id — so it is structurally incapable of naming a
   person or reasoning about an individual. governSuggestions() adds defence in depth: it drops
   any suggestion that even mentions a supplied person token, and it discards a framing whose
   pattern isn't in the confirmed set. Everything is read-only and confirmation-gated.

   Pure: no IO, no DB, no LLM call. The server assembles the de-identified aggregates and makes
   the (optional) model call; this module builds the digest, holds the contract, and governs.
   ============================================================ */

/* Build the DE-IDENTIFIED digest the model may see. Counts and structure only — this is the
   guarantee that the model can't reason about a person, because it never receives one.
   `aggregates` = { kinds:{kind:count}, registers:{register:count}, structure:{teams,tiers,
   roles:{role:count}}, collecting:[evidenceType…], confirmedPatterns:[{id,summary}] }. */
function buildDigest(aggregates = {}) {
  const a = aggregates || {};
  const kinds = a.kinds || {};
  const regs  = a.registers || {};
  const struct = a.structure || {};
  const lines = [];
  lines.push('AGGREGATE PICTURE (de-identified — counts and structure only, no individuals):');
  const kindStr = Object.keys(kinds).length ? Object.entries(kinds).map(([k, n]) => `${k}×${n}`).join(', ') : 'none derived yet';
  lines.push(`  Derived pattern kinds across the org: ${kindStr}`);
  if (Object.keys(regs).length) lines.push(`  Registers: ${Object.entries(regs).map(([k, n]) => `${k}×${n}`).join(', ')}`);
  lines.push(`  Structure: ${struct.teams || 0} teams, ${struct.tiers || 0} tiers${struct.roles ? ', roles ' + Object.entries(struct.roles).map(([r, n]) => `${r}×${n}`).join('/') : ''}`);
  lines.push(`  Signals currently collected: ${(a.collecting && a.collecting.length) ? a.collecting.join(', ') : 'very little'}`);
  if ((a.confirmedPatterns || []).length) {
    lines.push('  ALREADY-CONFIRMED patterns you may add framing to (cite the id in patternRef):');
    for (const p of a.confirmedPatterns.slice(0, 12)) lines.push(`    [${p.id}] ${_clip(p.summary, 160)}`);
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT = [
  'You help the reasoning KERNEL of IntelliQ think about WHAT TO LOOK AT. You never decide what',
  'is true. You are given only DE-IDENTIFIED AGGREGATES — counts and structure, never a person —',
  'and you must never ask about, infer, or name an individual.',
  'Produce three kinds of suggestion, all of which are QUESTIONS or PROPOSALS, never facts:',
  '  • hypotheses: an industry-informed pattern worth TESTING against the recorded data. Give',
  '    what would confirm it and what would refute it. It is a hypothesis, NOT a conclusion.',
  '  • collectionGaps: a signal this kind of organisation usually benefits from watching that',
  '    they appear NOT to be collecting yet, and a gentle way to start capturing it.',
  '  • framings: OPTIONAL industry context for an ALREADY-CONFIRMED pattern — reference its id',
  '    in patternRef. Do not add a framing for anything not in the confirmed list.',
  'Never predict an outcome. Never state something about the organisation as fact. Never name or',
  'describe an individual. If the aggregates are too thin to say anything useful, return empty',
  'lists — that is a valid, honest answer.',
  'Respond ONLY with JSON: { "hypotheses": [ { "statement": string, "wouldConfirm": string,',
  '  "wouldRefute": string } ], "collectionGaps": [ { "signal": string, "why": string,',
  '  "howToAsk": string } ], "framings": [ { "patternRef": string, "framing": string } ] }.',
].join('\n');

/* Govern the model output into typed, SAFE suggestions. Defence in depth over the prompt:
   - a hypothesis is always tagged as a hypothesis at 'unconfirmed' readiness (never a belief);
   - anything mentioning a supplied person token is DROPPED (the model shouldn't have a name,
     but if one leaks in, it never survives);
   - a framing is kept ONLY if its patternRef is a real confirmed pattern.
   Returns { hypotheses, collectionGaps, framings, dropped } — all read-only, confirm-gated. */
function governSuggestions(raw, { confirmedPatternIds = [], personTokens = [] } = {}) {
  const confirmed = new Set(confirmedPatternIds || []);
  const tokens = (personTokens || []).map(t => String(t || '').toLowerCase().trim()).filter(t => t.length >= 3);
  const mentionsPerson = (s) => { const l = String(s || '').toLowerCase(); return tokens.some(t => new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(l)); };
  const dropped = [];

  const hypotheses = [];
  for (const h of _arr(raw && raw.hypotheses)) {
    const statement = String(h && h.statement || '').trim();
    if (!statement) continue;
    if (mentionsPerson(statement) || mentionsPerson(h.wouldConfirm) || mentionsPerson(h.wouldRefute)) { dropped.push({ kind: 'hypothesis', reason: 'names an individual', statement }); continue; }
    hypotheses.push({
      type: 'hypothesis', readiness: 'unconfirmed', isBelief: false,   // NEVER a belief
      statement, wouldConfirm: String(h.wouldConfirm || '').trim(), wouldRefute: String(h.wouldRefute || '').trim(),
      note: 'a hypothesis to test against recorded evidence, not a conclusion',
    });
  }

  const collectionGaps = [];
  for (const g of _arr(raw && raw.collectionGaps)) {
    const signal = String(g && g.signal || '').trim();
    if (!signal) continue;
    if (mentionsPerson(signal) || mentionsPerson(g.why) || mentionsPerson(g.howToAsk)) { dropped.push({ kind: 'collectionGap', reason: 'names an individual', signal }); continue; }
    collectionGaps.push({ type: 'collection_gap', signal, why: String(g.why || '').trim(), howToAsk: String(g.howToAsk || '').trim(), requiresConfirmation: true });
  }

  const framings = [];
  for (const f of _arr(raw && raw.framings)) {
    const patternRef = String(f && f.patternRef || '').trim();
    const framing = String(f && f.framing || '').trim();
    if (!patternRef || !framing) continue;
    if (!confirmed.has(patternRef)) { dropped.push({ kind: 'framing', reason: 'pattern not confirmed', patternRef }); continue; } // framing only on CONFIRMED patterns
    if (mentionsPerson(framing)) { dropped.push({ kind: 'framing', reason: 'names an individual', patternRef }); continue; }
    framings.push({ type: 'framing', patternRef, framing, isBelief: false, label: 'general industry framing, not a new finding' });
  }

  return { hypotheses, collectionGaps, framings, dropped,
    usable: !!(hypotheses.length || collectionGaps.length || framings.length) };
}

function _arr(x) { return Array.isArray(x) ? x : []; }
function _clip(s, n = 160) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

module.exports = { buildDigest, SYSTEM_PROMPT, governSuggestions };
