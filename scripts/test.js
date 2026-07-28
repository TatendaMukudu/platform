/* ============================================================
   scripts/test.js — the Truth Layer (one command, one verdict)

   Run:  npm test    (or)   node scripts/test.js

   The council's arbiter. Every agent — Claude, Codex, or a human — must leave
   this GREEN. It (1) syntax-checks every source file, then (2) runs every test
   suite. Any failure → non-zero exit, so CI and pre-commit hooks catch it.

   No DB, no AI key required — everything here is pure/deterministic on purpose,
   so the truth layer is fast, hermetic, and reproducible anywhere.
   ============================================================ */

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let failed = 0;
const step = (label, fn) => {
  process.stdout.write(`\n▶ ${label}\n`);
  try { fn(); } catch (e) {
    failed++;
    if (e.stdout) process.stdout.write(String(e.stdout));
    console.log('  ✗', (e.message || 'failed').split('\n')[0]);
  }
};

// 1 ── syntax: every source file parses (catches a broken commit instantly) ──
step('syntax — node --check all sources', () => {
  const files = [];
  const addDir = d => { try { fs.readdirSync(path.join(root, d)).forEach(f => { if (f.endsWith('.js')) files.push(path.join(d, f)); }); } catch (_) {} };
  ['ai', 'scripts', 'js'].forEach(addDir);
  ['server.js', 'db.js'].forEach(f => { if (fs.existsSync(path.join(root, f))) files.push(f); });
  for (const f of files) execFileSync('node', ['--check', path.join(root, f)]);
  console.log(`  ✓ ${files.length} files parse`);
});

// 2 ── suites: each exits non-zero on failure ───────────────────────────────
const SUITES = [
  'baseline-smoke.js',
  'intelligence-smoke.js',
  'privacy-smoke.js',
  'person-model-smoke.js',
  'eval.js',
  'invariants.js',
  'packs-language-smoke.js', // domain LANGUAGE pass: org-voice directives, role-sensitivity, audit
  'domain-cleanup-smoke.js', // one language source: no legacy vertical prose; role ladder invents no titles
  'evidence-smoke.js',     // the canonical evidence envelope: normalise/validate/dedupe/promote
  'identity-reresolve-smoke.js', // the identity lifecycle: held-back evidence resolves + promotes once
  'mapping-smoke.js',            // the mapping contract: fingerprint/drift/transform/gate (pure)
  'mapping-lifecycle-smoke.js',  // the mapping approval lifecycle end to end (hold→approve→activate→reprocess)
  'sync-smoke.js',               // sync reliability primitives (pure): classify/backoff/rate-limit/health/staleness
  'sync-reliability-smoke.js',   // sync reliability invariants: idempotent replay, correction, deletion, concurrency
  'policy-smoke.js',             // the organisational constitution: what the assistant may DO (pure)
  'action-smoke.js',             // the universal action contract: recommend→…→learn stage machine (pure)
  'reasoning-smoke.js',          // the three reasoning boundaries: pre-kernel/kernel/post-kernel (pure)
  'workspace-smoke.js',          // the unified workspace item model: typed, scoped, deterministic privacy (pure)
  'reasoning-boundaries-smoke.js', // the 10 architectural invariants, end to end
  'private-evidence-smoke.js',   // the 18 private-canonical-evidence invariants (owner-only, purpose-scoped)
  'workspace-experience-smoke.js', // MyWorkspace experience boundaries (today/ask/lenses via the gateway)
  'adapters-smoke.js',           // capability → canonical evidence adapters (pure)
  'legacy-convergence-smoke.js', // legacy paths converge on canonical evidence (check-in/backfill/context)
  'advisor-migration-smoke.js',  // the member advisor on canonical evidence + kernel + post-kernel (privacy-critical)
  'checkin-migration-smoke.js',  // the daily check-in: canonical-only intelligence, kernel trends, self-feed protection
  'checkin-hardening-smoke.js',  // post-migration watch-items: frozen signal, reconciliation, classification audit, intervention edges
  'workspace-assessment-smoke.js', // assigned work → canonical evidence: commitment/submission/revision/complete Assessment (live)
  'assessment-consumption-smoke.js', // the unified assistant consumes the complete Assessment (scale-aware, journey-aware, no double-count)
  'scenario-convergence-smoke.js', // scenario/memberResults converge onto the same canonical assessment model; legacy value-signal cutover
  'assessment-presentation-smoke.js', // server-supplied assessment presentation state; frontend no longer judges a raw score
  'assistant-runtime-smoke.js',    // unified MyWorkspace assistant runtime: one composer, bounded turn, confirmable proposals
  'assistant-interface-smoke.js',  // unified MyWorkspace INTERFACE: one composer/identity, lenses as bounded hints, confirmable proposal cards
  'proactive-smoke.js',            // the proactive surfacing layer: post-kernel ProactiveInsight projection, surfacing policy, audience safety, bounded preferences
  'governance-smoke.js',           // architectural gravity: proactive DELIVERY lives ONLY in ai/behaviour.js; every surface consumes one pipeline
  'retrieval-smoke.js',            // grounded retrieval over canonical evidence: authorised-before-composition, cited, no-key extractive, full privacy/integrity matrix
  'intake-smoke.js',               // universal evidence intake: one governed ingestion boundary (text/md/pdf/docx/csv/json) → canonical evidence → grounded retrieval; dedup/supersede/delete, provenance, privacy
  'capture-smoke.js',      // capture-intent detection (pure): explicit save-commands vs one-tap offers vs questions — detection automatic, persistence deliberate
  'turn-grounding-smoke.js', // the grounded conversational turn: /api/assistant/turn answers from authorised evidence via the ONE _assistantAnswer boundary; full leak matrix + mixed-turn ordering + capture unchanged
  'org-state-smoke.js',    // organisational-state projection (pure): objectives/events/decisions/requirements over admissible evidence + config + packs; ordered ownership, deterministic impact/urgency, claim states, readiness, provenance; drives uncertainty generation
  'org-context-smoke.js',  // operating-context intake (pure): conversational extraction → proposed records, validation hard-blocks/warnings, dependency-cycle detection, authority-by-confirmer, projection with supersession — extraction automatic, persistence deliberate
  'org-context-http-smoke.js', // operating-context governed flow + scenarios (HTTP): preview→confirm→state→uncertainty, member-unverified, tenant isolation, supersession/history, import validation, private refused, cache invalidation
  'readiness-smoke.js',    // team-readiness view-model projection (pure): deterministic focus, semantic states (no percentage), structural non-blaming statements, routed questions, disputed preserved, calm empty states
  'readiness-http-smoke.js', // team-readiness + role-binding (HTTP): confirmed context→grounded briefing, missing→routed question, bind/rebind/history, private never influences, tenant isolation, fingerprint invalidation, leader-only
  'resolve-loop-smoke.js', // grounded answer-and-confirm loop (HTTP): uncertainty→answer→adjudicate→preview→confirm→governed write→re-derived readiness; authority-by-ownership, vague≠satisfied, disputed preserved, non-answer/ambiguity, idempotent, no projection mutation
  'org-memory-smoke.js',   // organisational memory (pure): the versioned, EXPLAINABLE derived-state timeline — deterministic fingerprinted snapshots + dedup on observable change; trigger provenance (normalised/redacted); semantic-version gating (incompatible → neutral rebaseline, never false transitions); diffs classify a user-facing direction AND a deterministic cause; removals keep a structural reason; leader-safe explain (history, not learning)
  'org-memory-http-smoke.js', // organisational memory (HTTP): governed writes stamp server-derived triggers (context/resolution/role-binding); client cannot inject a trigger; "what changed" + cause; explain endpoint (leader-only, tenant-isolated, no id/hash/version leaks); legacy snapshots restore without fabricated provenance → rebaseline; private/wellbeing never enters; durable store
  'org-learning-smoke.js', // learning engine Phase B1 (pure): compatible-only intervals (rebaseline/legacy excluded, tenant-guarded, malformed-safe); deterministic observation taxonomy (repeated transition/cause, coded sequence, recurring requirement, non-causal readiness co-occurrence, stable non-change); dedup + stable identity + supersession-ready fingerprints; contradictions/limitations retained; redacted, non-causal public output (history, not recommendations)
  'org-learning-http-smoke.js', // learning engine Phase B1 (HTTP): direct evidence capture stamps evidence_recorded (not temporal); client cannot inject a trigger; observations derive from own memory, leader-only + tenant-isolated + redacted + non-causal; dismissal affects only the artifact + never resurfaces; materially-new support reappears; durable store
  'org-playbook-smoke.js', // learning engine Phase B2 (pure): counter-evidence (for/against), qualitative confidence bands (never a number), candidate eligibility (repeatable ways-of-operating only), governed candidate → playbook-entry shaping (module never endorses/writes), deterministic dedup/order, redacted non-causal public output
  'org-playbook-http-smoke.js', // learning engine Phase B2 (HTTP): candidates derived from own observations + weighed; the engine never writes the playbook — only a leader confirm does; confirm/dismiss governed + idempotent + injection-resistant; leader-only, tenant-isolated, redacted; confirming never mutates memory; durable store
  'org-graph-smoke.js',    // organisational information-web scoping (pure): asymmetric visibility — a parent sees its whole subtree, a child sees only its direct parent(s); multi-parent honoured; routing walks up to the nearest leader; cycle-safe + deterministic
  'org-graph-http-smoke.js', // information-web scoping wired into org-state (integration): node-scoped evidence flows UP to parent leaders + the top but never across to a sibling branch; a member sees their own node; an org with NO node structure is unchanged (org-wide)
  'conversation-smoke.js', // grounded conversation engine + member projection (pure): required claims from a definition, grounded classification (already-known skips, stale refreshes, vague never resolves), next-question selection, adjudication composed with the EXISTING adjudicateAnswer (member reported / owner authoritative / vague → corroboration), governed proposals (never a projection mutation), completion; plus interpretation-over-score projection with placeholder/duplicate-feedback detection
  'conversation-http-smoke.js', // grounded assessment intake (HTTP): start → answer → preview (no write) → confirm (canonical evidence) → re-derive → next/complete; vague never resolves; nothing written before confirm; ownership server-derived (another member refused); resume re-derives + skips already-known; abandon writes nothing; MyWorkspace projection leads with meaning + never shows placeholder feedback as individual
  'org-answer-smoke.js',   // scoped organisational answering (pure): explicit intent detection, grounded answers composed from the scoped org-state's own claims (never invented), honest limitations, owner-routing when unanswerable, member-safe output (no ids/authority)
  'org-answer-http-smoke.js', // scoped organisational answering (HTTP): the SAME question is answered per branch of the information web — a child's shared item is "recorded" for its parent but still "outstanding" for a sibling lead (no cross-branch leak); members answered in-scope; unanswerable → routes to a lead; node-less org answers org-wide
  'org-routing-smoke.js',  // node-aware routing (pure): unresolved work routes to an EXPLICIT owner (never inferred from ancestry), escalates to the nearest leader when unowned, flags multi-parent-with-no-owner as a conflict (surfaced to all, decided by a human), dedupes multi-path recipients, rolls audience-safe summaries UP a leader's own subtree (sibling branches never included)
  'org-routing-http-smoke.js', // node-aware routing (HTTP): a resolved owner gets the item in their inbox + subtree rollup; a sibling branch lead never sees it (no leak); the top leader's rollup spans the org; conflicts scoped to recipients; node-less org returns a valid empty view
  'reason-smoke.js',       // the Reasoner / belief ledger (pure): the layer ABOVE the snapshot detector — observations accumulate into hypotheses held provisionally; confidence is evidence-volume net of counter-evidence; a same-axis progress signal CONTESTS the matching risk belief; silence lets a belief go dormant; the same risk across people in a scope becomes ONE shared hypothesis; register (support/scout/acknowledge) encodes "a time and a place"; every proposal is proposal-gated (surface, never act); claims never leak a score/quote; deterministic + dedupes + persists across ticks
  'reason-http-smoke.js',  // the Reasoner over HTTP (governed boundary): GET /api/reason/agenda is leader-gated; the ORG-WIDE belief ledger is read SCOPED per leader (a belief about a person routes only to leaders who may see them; a sibling branch lead never sees it — no leak); ripe beliefs carry proposal-gated next steps; the projection leaks no evidence basis / support records / node scope; deterministic; ledger persisted; feedback closes the loop (leader-gated + subject-contest); the brief speaks the deterministic voice with no AI
  'understanding-smoke.js', // the INPUT translator's safety core (pure): an untrusted LLM classification is FORCED through an allow-list — output carries no raw text/quote/protected trait and nothing off the theme list; sentiment/intensity clamped; smuggled traits fail safe; one note → one tentative low-severity observation (accumulation does the rest)
  'notes-smoke.js',        // pinned + team-shared notes governance (pure): private by default; sharing is refused for a privacy-sensitive note even if the author asks; pin/share are reversible pure patches; the team-view leaks no sensitivity / private AI reply / internal id; shelf orders pins first
  'notes-http-smoke.js',   // pinned + team-shared notes (HTTP): the author shares/pins; the privacy gate hard-blocks sharing a sensitive note; a shared+pinned note reaches teammates IN SCOPE (a sibling branch never sees it — no leak) via the safe projection; pinning needs visibility; un-sharing takes team visibility back; grounded ask is visibility-gated + note-only
  'self-model-smoke.js',   // the SELF-MODEL (pure): the reasoner pointed at its OPERATOR — only an allow-listed set is learnable (surveillance ignored); confidence is DISTINCT DAYS (a habit, not a one-off); an established habit becomes a proposal-gated accommodation; accept applies + stops proposing, dismiss briefly, reject long; dormant when it stops; full transparency
  'self-model-http-smoke.js', // the SELF-MODEL (HTTP): observing learns only allow-listed patterns; an established habit surfaces as a proposal-gated accommodation; accept returns the setting + stops proposing; reject stands it down; feedback validated; a self-model is PRIVATE — another user never sees it
  'report-smoke.js',       // the grounded ARTIFACT layer (pure): renders truth, never manufactures it — a fact with no source is DROPPED (never printed); an empty section says so honestly; deterministic; the HTML is self-contained, escapes content, carries the honesty footer
  'report-http-smoke.js',  // the grounded report (HTTP): GET /api/report/team assembles a real print-ready report from the reasoner + confirmed playbook, every line showing its source, with the honesty footer; leader-gated (a member is refused and gets no team content)
  'brief-smoke.js',        // the node-aware BRIEF composer (pure): composes, never reasons — leader vs member get different shapes + offer sets; every offer is allow-listed + proposal-gated; items come only from the reads given (never fabricated); an offer appears only when its input is present; empty inputs → an honest steady brief; deterministic
  'brief-http-smoke.js',   // the node-aware BRIEF (HTTP): the web does its four jobs — LEVEL (node leader → leader brief, member → member brief), SCOPE (a leader's reads are their own branch; a sibling's person never appears — leak-safe both ways), ROUTE (a member is pointed at a real leader who can help); every offer proposal-gated; greets by name + time of day
  'language-guard-smoke.js', // the NO-PREDICTION / NO-DIAGNOSIS guard (pure): the rule the system lives by, enforced at every LLM edge — predictive/forecasting/diagnostic phrasings are caught (→ caller falls back to the deterministic line), while the system's OWN descriptive outputs (reasoner/brief/report) all pass
  'lifecycle-smoke.js',    // evidence lifecycle / knowledge governance (pure): what to keep vs let go — category half-lives, authority-modulated confidence decay, superseded→retire, redundancy merge, stale→proactive "still current?" inquiry
  'inquiry-smoke.js',      // the Inquiry / epistemic-planning layer (recommendation-only): questions are actions — value-gate, critic, health-guard, least-burdensome routing, non-leading phrasing; derives uncertainties only from admissible evidence (private never enters)
  'member-methods-scan.js', // member-view guard: every called MemberApp._method is defined (catches called-but-undefined, e.g. a leader-only render branch invoking a missing helper that member-based boot tests never hit)
  'deadcode-scan.js',      // dead-code guard: fails on any unreferenced function (named or module-level arrow) across server.js + every js/ module — keeps retired-surface debt from re-accumulating
  'connector-harness.js',  // the Connector SDK: identity/confidence + mapping contracts
  'frontend-smoke.js',     // REAL headless-Chromium boot: every route + refresh + Support view; fails on any uncaught JS/parse error (self-skips if no Chromium). This is the guard that would have caught the mobile "Unexpected token" boot crash.
  'endpoint-smoke.js',   // boots the real app in-process (DB_OPTIONAL) — HTTP authz + Me context
];
for (const s of SUITES) {
  step(`suite — ${s}`, () => {
    const out = execFileSync('node', [path.join(__dirname, s)], { encoding: 'utf8' });
    process.stdout.write(out.replace(/^/gm, '  '));
  });
}

console.log(failed
  ? `\n════════\n✗ TRUTH LAYER RED — ${failed} step(s) failed. Do not merge.\n`
  : `\n════════\n✓ TRUTH LAYER GREEN — all sources parse, all suites pass.\n`);
process.exit(failed ? 1 : 0);
