require('dotenv').config();
const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const path      = require('path');
const bcrypt    = require('bcryptjs');
const fs        = require('fs');   // kept for store.json → Postgres one-time migration
const crypto    = require('crypto');   // webhook HMAC signature verification
const db        = require('./db');

/* ── AI layer (Phase 1) ──────────────────────────────────────────────────────
   One gateway controls model choice / retries / validation; the privacy gate
   enforces "private may inform, never reveal"; lenses shape advice by role. */
const ai         = require('./ai/gateway');
const privacy    = require('./ai/privacy');
const lenses     = require('./ai/lenses');
const valuesLens = require('./ai/values');
const embeddings = require('./ai/embeddings');
const intel      = require('./ai/intelligence');
const baseline   = require('./ai/baseline');
const agents     = require('./ai/agents');
const packs      = require('./ai/packs');
const primitives = require('./ai/primitives');
const confidence = require('./ai/confidence');
const adapters   = require('./ai/adapters');
const connectors = require('./ai/connectors');
const office     = require('./lib/office');   // dependency-free .xlsx / .docx reading
const connectorSDK = require('./lib/connector-sdk');   // capability contract, identity resolution, mappings
const evidence   = require('./lib/evidence');   // the canonical evidence envelope — the connector↔kernel boundary
const mappingLib = require('./lib/mapping');     // the mapping approval lifecycle — the interpretation boundary
const syncLib    = require('./lib/sync');        // sync reliability — classification, backoff, health, staleness
const policyLib  = require('./lib/policy');      // the organisational constitution — what the assistant may DO
const actionLib  = require('./lib/action');      // the universal Action Contract — the Execution Layer spine
const workspaceLib = require('./lib/workspace'); // the unified personal workspace — typed, scoped items
const reasoning  = require('./lib/reasoning');   // the three reasoning boundaries — pre-kernel / kernel / post-kernel
const capAdapters = require('./lib/adapters');   // capability → canonical evidence adapters (legacy convergence)

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* ── Process-level crash guards ───────────────────────────────────────────────
   A single unhandled async error should never take the whole server down and
   sign everyone out. Log loudly; keep serving. (DB/boot failures still exit via
   db.js — these guards are for in-flight request bugs.) */
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});

// 25mb so base64 rich-media (images/PDF) in chat/scenarios isn't rejected by the
// default 100kb body limit — a real, silent failure mode for attachments.
// Capture the raw body (for webhook HMAC signature verification) without a second parse.
app.use(express.json({ limit: '25mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
// Serve static assets, but force browsers to revalidate HTML/JS/CSS on every load
// (etag makes this cheap) so a Render redeploy is picked up on the next refresh
// instead of a stale cached bundle — the cause of "I deployed but nothing changed".
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

/* ── Persistence ──────────────────────────────────────────────────────────────
   All in-memory stores are persisted to Neon Postgres (via db.js).
   On startup, data is loaded from Postgres. A one-time migration from
   store.json is performed if Postgres is empty and the file still exists.

   scheduleSave() debounces writes to Postgres (500 ms), same as before.
   ─────────────────────────────────────────────────────────────────────────── */

// Legacy store.json path — used only for the one-time migration at startup.
const DATA_DIR   = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

let _saveTimer = null;
function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      // Prune expired sessions before saving so the blob doesn't grow unbounded
      const now = Date.now();
      for (const [token, s] of Object.entries(activeSessions)) {
        if (s.expiresAt < now) delete activeSessions[token];
      }
      await db.saveMain({
        orgMeta, orgUsers, inviteTokens, emailIndex, pendingInvites,
        orgGroups, orgNotes, orgMessages, orgStore,
        assignedScenarios, memberResults, memberCheckins,
        memberGoals, weeklyAssessments, orgInterventions,
        orgNodes, orgMetrics, orgValues, orgGoals, userPermissions,
        userAiProfiles, advisorThreads, orgSignals, noticeFeedback,
        userConsents, connectedSources, pendingActions,
        assessmentTemplates, assessmentAssignments, orgTutorials, orgApiTokens,
        orgConnections, orgOAuthApps, studioThreads, activeSessions,
        rawEvidence, evidenceLog, orgMappings,
        syncRuns, failedRecords, webhookDeliveries,
        orgPolicies, actionsLog, orgCalendar, workspaceItems, reasoningArtifacts,
      });
    } catch(e) { console.error('[db] Save failed:', e.message); }
  }, 500);
}

/* ── Data retention (GDPR storage limitation) ─────────────────────────────────
   Personal signals + check-ins older than the retention window are purged, so we
   don't hold data longer than we need. Default 2 years; set RETENTION_DAYS to
   override. Runs on boot and daily. Only removes OLD data — recent is untouched. */
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS, 10) > 0 ? parseInt(process.env.RETENTION_DAYS, 10) : 730;
function _purgeExpired(retentionDays = RETENTION_DAYS) {
  const cutoff = Date.now() - retentionDays * 86400000;
  const keep = ts => { const t = ts ? new Date(ts).getTime() : NaN; return !Number.isFinite(t) || t >= cutoff; };
  let removed = 0;
  for (const code of Object.keys(orgSignals)) {
    if (!Array.isArray(orgSignals[code])) continue;
    const before = orgSignals[code].length;
    orgSignals[code] = orgSignals[code].filter(s => keep(s.ts));
    removed += before - orgSignals[code].length;
  }
  for (const k of Object.keys(memberCheckins)) {
    if (!Array.isArray(memberCheckins[k])) continue;
    const before = memberCheckins[k].length;
    memberCheckins[k] = memberCheckins[k].filter(c => keep(c.ts));
    removed += before - memberCheckins[k].length;
  }
  // Canonical evidence + its raw immutable records age out on the same window.
  for (const code of Object.keys(evidenceLog)) {
    if (!Array.isArray(evidenceLog[code])) continue;
    const before = evidenceLog[code].length;
    evidenceLog[code] = evidenceLog[code].filter(env => {
      if (keep(env.observedAt || env.createdAt)) return true;
      if (env.rawRef) delete rawEvidence[env.rawRef];
      return false;
    });
    removed += before - evidenceLog[code].length;
  }
  if (typeof _rebuildEvidenceIndex === 'function') _rebuildEvidenceIndex();
  if (removed) { console.log(`[retention] purged ${removed} record(s) older than ${retentionDays}d`); scheduleSave(); }
  return removed;
}

/* ── Session tokens ───────────────────────────────────────────────────────────
   Persisted to Postgres so tokens survive server restarts (Railway redeploys).
   Expired sessions are pruned before each save and on load.
   24-hour expiry per token.
   ─────────────────────────────────────────────────────────────────────────── */
const activeSessions = {}; // token → { userId, orgCode, role, expiresAt }

const SALT_ROUNDS = 10;

// Detect passwords still stored with the old toy simpleHash (short hex, no $2b$ prefix)
function isLegacyHash(h) { return h && !h.startsWith('$2b$') && !h.startsWith('$2a$'); }

// Legacy hash used only for migration path — new code never calls this for new passwords
function simpleHash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(16); }

/* Directive built from the ORG's values, desired traits and success definition
   (captured at setup, editable in Settings). Prepended to AI system prompts so
   every surface reasons from what the organisation actually values. */
function _worldviewDirective(code) {
  const c = (code || '').toLowerCase();
  const prof = orgMeta[c]?.organizationProfile || {};
  const vals = (orgValues[c] && orgValues[c].length) ? orgValues[c] : (prof.values || []);
  return valuesLens.orgDirective(vals, prof.behaviours || [], prof.successDefinition || '', orgMeta[c]?.orgName);
}

/* Directive built from a MEMBER's own goals/values/growth (member onboarding).
   Used by member-facing AI so responses anchor to what THEY want to become. */
function _memberValuesDirective(code, userId) {
  if (!userId) return '';
  const c = (code || '').toLowerCase();
  const profile = memberGoals[userKey(c, userId)];
  return valuesLens.memberDirective(profile, orgUsers[c]?.[userId]?.name);
}

/* ── Domain language (the org's own voice) ────────────────────────────────────
   The kernel stores universal primitives; these helpers let generated PROSE speak
   the organisation's language. All three sit on top of the single shared builder
   in ai/packs.js, so the instruction is never duplicated across prompt sites. */
function _resolvedDomain(code) {
  const org = orgMeta[(code || '').toLowerCase()];
  return packs.resolveDomain(org?.orgMode, org?.domain);
}

/* An EXPLICIT semantic role/title a user actually carries (not a permission tier).
   None of these fields exist in the current data model, but honouring them keeps
   the rule "explicit role → use it" true the moment a connector or admin supplies
   one, without ever inventing a title. */
function _explicitRoleTitle(u) {
  const t = u && (u.title || u.position || u.jobTitle || u.roleTitle);
  return (typeof t === 'string' && t.trim()) ? t.trim().slice(0, 40) : null;
}

/* Resolve how to refer to the subject WITHOUT manufacturing a profession from
   permissions. The ladder (see ARCHITECTURE.md "Role sensitivity"):
     1. explicit role/title present            → use it verbatim
     2. staff-tier role assigned by the org     → "a staff member" (domain-neutral;
        (coach/admin/superadmin)                   the assigned tier, not a guessed job)
     3. leadership certain, no explicit role    → suppress the generic noun, use name
        (a member who leads — captain OR staff)    (avoidGeneric; NO title invented)
     4. otherwise (a plain member)              → generic person noun is correct
   Returns { subjectRole, avoidGeneric }. */
function _subjectRoleContext(code, userId) {
  if (!userId) return { subjectRole: null, avoidGeneric: false };
  const c = (code || '').toLowerCase();
  const u = orgUsers[c]?.[userId];
  if (!u) return { subjectRole: null, avoidGeneric: false };
  const explicit = _explicitRoleTitle(u);
  if (explicit) return { subjectRole: explicit, avoidGeneric: false };
  if (u.role === 'coach' || u.role === 'admin' || u.role === 'superadmin') return { subjectRole: 'a staff member', avoidGeneric: false };
  if (_isLeader(c, userId)) return { subjectRole: null, avoidGeneric: true };
  return { subjectRole: null, avoidGeneric: false };
}

/* The one call every AI entry point makes. Resolves the org's domain, derives the
   subject's role context when a userId is given (never inventing a title), and
   returns the compact language directive (empty in universal mode with no role
   nuance — costs nothing). A caller may pass subjectRole explicitly to override. */
function _domainDirective(code, opts = {}) {
  const domain = _resolvedDomain(code);
  let subjectRole = null, avoidGeneric = false;
  if (opts.subjectRole !== undefined) subjectRole = opts.subjectRole;
  else if (opts.userId) ({ subjectRole, avoidGeneric } = _subjectRoleContext(code, opts.userId));
  return packs.domainDirective(domain, { subjectRole, avoidGenericForSubject: avoidGeneric, concepts: opts.concepts });
}

/* Audit stamp recorded alongside generated prose so historical outputs remain
   attributable to the vocabulary in effect when they were produced. */
function _domainStamp(code) {
  const d = _resolvedDomain(code);
  return { pack: d.id, vocabVersion: packs.vocabVersion(d) };
}

/* Server-side vocabulary lookup — the counterpart of the frontend _v(). Used by
   DETERMINISTIC fallback copy so a no-AI briefing/insight still speaks the org's
   language ("players"/"squad") instead of hard-coded generic nouns. */
function _vc(code, key) {
  const d = _resolvedDomain(code);
  return (d.vocab && d.vocab[key]) || key;
}

// Sessions last 30 days, and REFRESH on use (sliding expiry) — so anyone who
// opens the app at least every few weeks stays logged in. A 24h token logged
// pilot users out constantly ("session may have expired").
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function issueToken(userId, orgCode, role) {
  const token = generateToken();
  activeSessions[token] = {
    userId, orgCode: (orgCode || '').toLowerCase(), role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  scheduleSave(); // persist so this token survives a server restart
  return token;
}

function verifyToken(tokenStr) {
  if (!tokenStr) return null;
  const s = activeSessions[tokenStr];
  if (!s) return null;
  if (s.expiresAt < Date.now()) { delete activeSessions[tokenStr]; return null; }
  // Sliding expiry: once past the halfway mark, extend the window on use so an
  // active user is never logged out mid-use. Debounced-persisted via scheduleSave.
  const remaining = s.expiresAt - Date.now();
  if (remaining < SESSION_TTL_MS / 2) { s.expiresAt = Date.now() + SESSION_TTL_MS; scheduleSave(); }
  return s;
}

// Middleware — applied to endpoints that expose aggregate org data
function requireAuth(req, res, next) {
  const header = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const token  = header || req.query.token || req.body?.token;
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ error: 'Authentication required. Please log in again.' });
  req.iqSession = session;
  next();
}

/* ─── REFLECTION SYSTEM PROMPT ─────────────────────────────────────────── */
/* NOTE: this prompt is deliberately VERTICAL-NEUTRAL. Organisational language
   (player/student/team-member…) is supplied by the shared _domainDirective at the
   call site — never by an orgMode branch embedded here. See ARCHITECTURE.md
   ("Organisational language"). orgMode is no longer a parameter: what the model
   should know about the org comes from its OWN description (orgSummary) plus the
   resolved domain, not a hard-coded industry template. */
function buildReflectionPrompt(orgName, orgValues = [], orgMetrics = [], orgProfile = {}) {
  // Prefer the org's OWN description; otherwise stay generic. No industry template.
  let contextLine;
  if (orgProfile.orgSummary) {
    contextLine = `You are speaking with members of ${orgName}. About this organisation: ${orgProfile.orgSummary}`;
    if (orgProfile.orgEnvironment)      contextLine += ` Environment: ${orgProfile.orgEnvironment}`;
    if (orgProfile.orgSuccessDefinition) contextLine += ` Success looks like: ${orgProfile.orgSuccessDefinition}`;
  } else {
    contextLine = `You are speaking with individuals in a professional or institutional environment.`;
  }

  const valuesLine  = orgValues.length  ? `\nORG VALUES: ${orgValues.join(', ')} — connect your reflections to these where relevant.` : '';
  const metricsLine = orgMetrics.length ? `\nORG PERFORMANCE DIMENSIONS: ${orgMetrics.map(m=>typeof m==='string'?m:m.name).join(', ')} — explore how the member's behaviour connects to these.` : '';

  return `You are the IntelliQ Reflection Assistant — an empathetic, intelligent AI embedded in the IntelliQ platform used by ${orgName}.

${contextLine}${valuesLine}${metricsLine}

YOUR ROLE:
Guide structured post-scenario reflections and standalone check-ins. Help individuals develop genuine self-awareness and understand their decision-making patterns. You are not a therapist — but you are warm, perceptive, and take what people share seriously.

REFLECTION STRUCTURE — move through these phases naturally, don't announce them:
1. Reaction — immediate emotional response
2. Reasoning — unpacking the thinking behind their choices
3. Influences — what shaped their decisions (people, experiences, environment)
4. External — gently checking on life outside this context
5. Closing — a forward-looking takeaway

TONE:
- Conversational, warm, direct. Not clinical or robotic.
- Ask one question at a time.
- Reference what they actually said — never give generic responses.
- Use their name naturally but not excessively.

SAFEGUARDING — MANDATORY — HIGHEST PRIORITY:
You are a mandated reporter. If anything suggests self-harm, suicidal ideation, abuse, threats, feeling unsafe, or severe hopelessness — you MUST:
1. Respond with care, without alarm
2. State that what they shared is important and you are flagging it for a trusted adult
3. Ask if there is someone nearby they feel safe with
4. Include the exact string [[MANDATED_FLAG]] in your response

Catch nuanced language — "I've been in a really dark place" or "I just don't see the point anymore" should trigger this, not only explicit statements.`;
}

/* ─── SCENARIO SYSTEM PROMPT ────────────────────────────────────────────── */
/* Also vertical-neutral: the org is described by its OWN summary (a fact), and any
   organisational language comes from the shared _domainDirective at the call site,
   not from an orgMode tag. */
function buildScenarioPrompt(orgName, title, context, memberName, difficulty, opening = null, probes = null, orgValues = [], orgMetrics = [], orgProfile = {}) {
  const difficultyNote = {
    easy:   'Start with a clear, straightforward situation. Keep the stakes moderate.',
    medium: 'Present a situation with genuine tension and no obvious right answer.',
    hard:   'Create high-stakes complexity with competing obligations, time pressure, and moral ambiguity.',
  }[difficulty] || 'Present a situation with genuine tension and no obvious right answer.';

  const orgCtxLine = orgProfile.orgSummary
    ? `ORGANISATION: ${orgName} — ${orgProfile.orgSummary}${orgProfile.orgEnvironment ? ' ' + orgProfile.orgEnvironment : ''}`
    : `ORGANISATION: ${orgName}`;

  return `You are the IntelliQ Scenario Facilitator — an intelligent evaluator running a live decision-making assessment in the IntelliQ platform used by ${orgName}.

${orgCtxLine}
You are assessing ${memberName} using a scenario in the domain: "${title}".
SCENARIO CONTEXT: ${context}
DIFFICULTY: ${difficultyNote}
${opening ? `\nAPPROVED OPENING — use this exact opening to begin:\n"${opening}"\n` : ''}
${probes?.length ? `\nAPPROVED PROBE FRAMEWORK — the leader has pre-approved these follow-up angles. Use them as your guide but adapt naturally to what ${memberName} says:\n${probes.map((p, i) => `${i+1}. ${p}`).join('\n')}\n` : ''}
YOUR JOB:
1. ${opening ? `Start with the approved opening above — present it naturally, do not just read it verbatim.` : `Open with a vivid, specific, realistic situation tied to the context above.`}
2. Let ${memberName} respond in their own words.
3. React to what they actually say. ${probes?.length ? `Use the approved probes as your framework.` : `Probe reasoning: "Why that approach?", "What would you do if X changed?", "Who else is affected?"`}
4. Introduce a complication or escalation based on their response — raise the stakes when they handle something well.
5. After 5–7 exchanges you have enough data. Wrap up naturally, then output your scoring.

SCORING — output this when ready (after sufficient exchanges):
Append this block on a new line at the end of your closing message:
[[SCORE:{"ethical_reasoning":75,"stakeholder_awareness":80,"pressure_response":65,"self_awareness":70,"overall":73,"summary":"2-3 sentence honest assessment of their decision-making quality","strengths":["specific strength 1","specific strength 2"],"development":["specific area 1","specific area 2"]}]]

SCORING CRITERIA:
- ethical_reasoning: Did they weigh right/wrong, fairness, duty? Did they justify their choices?
- stakeholder_awareness: Did they consider who else is affected, not just the immediate situation?
- pressure_response: How did they handle complexity, time pressure, or escalation?
- self_awareness: Did they acknowledge uncertainty, reflect on their own role, or show intellectual honesty?
- overall: Weighted composite. Be honest — a 70 earned through genuine reasoning is more valuable than an inflated 90.
- strengths/development: Specific, actionable, tied to what they actually said. Not generic.

SAFEGUARDING — MANDATORY:
If anything suggests self-harm, abuse, threats, or danger — respond with care, include [[MANDATED_FLAG]], ask if they're safe. This overrides the scenario immediately.

TONE:
- Direct and realistic. This is an assessment, not a therapy session.
- Keep scenario descriptions concise — one short paragraph to open, then let them respond.
- React specifically to what they say. No generic follow-up questions.
- Do not reveal the scoring criteria to the member.`;
}

/* ─── CHAT / SCENARIO ENDPOINT ──────────────────────────────────────────── */
app.post('/api/chat', async (req, res) => {
  const {
    messages,
    orgMode,
    orgName,
    orgCode,
    userId,             // optional: member's server userId for memory lookup
    memberName,
    scenarioContext,    // reflection mode: completed scenario summary
    promptType,         // 'reflection' (default) | 'scenario'
    scenarioRunContext, // scenario mode: { title, context, difficulty, opening, probes, image }
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Load org-specific values, metrics, and profile for prompt enrichment
  const code    = (orgCode || '').toLowerCase();
  const values  = orgValues[code]  || [];
  const metrics = (orgMetrics[code] || []).map(m => m.name || m);
  const orgProfile = orgMeta[code] || {};

  try {
    let systemPrompt;

    if (promptType === 'scenario') {
      const sc = scenarioRunContext || {};
      systemPrompt = buildScenarioPrompt(
        orgName  || 'your organisation',
        sc.title || 'Decision Making',
        sc.context || 'A general situational assessment',
        memberName || 'the member',
        sc.difficulty || 'medium',
        sc.opening  || null,
        sc.probes   || null,
        values,
        metrics,
        orgProfile
      );
    } else {
      const memBlock = userId ? _buildMemoryBlock(code, userId) : '';
      systemPrompt = buildReflectionPrompt(orgName || 'your organisation', values, metrics, orgProfile);
      if (memBlock) systemPrompt += memBlock;
      if (scenarioContext) {
        systemPrompt += `\n\nSCENARIO JUST COMPLETED:\nTitle: ${scenarioContext.title}\nScore: ${scenarioContext.score}/100 (${scenarioContext.label})\n`;
        if (scenarioContext.answers?.length) {
          systemPrompt += 'Their answers:\n' + scenarioContext.answers.map((a, i) =>
            `Q${i+1}: "${a.chosen}" — Score: ${a.score}/100`
          ).join('\n');
        }
      }
    }

    // If scenario has an attached image, inject it into the first user message
    const scenarioImage = scenarioRunContext?.image;
    const apiMessages = messages.map((m, i) => {
      if (i === 0 && m.role === 'user' && scenarioImage?.data) {
        return {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: scenarioImage.mediaType || 'image/jpeg', data: scenarioImage.data } },
            { type: 'text', text: m.content },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:     [systemPrompt, _domainDirective(code, { userId })].filter(Boolean).join('\n\n'),
      messages:   apiMessages,
    });

    const raw = response.content[0]?.text || '';

    // Extract structured score block if present
    const scoreMatch = raw.match(/\[\[SCORE:(\{[\s\S]*?\})\]\]/);
    let scoreData = null;
    if (scoreMatch) {
      try { scoreData = JSON.parse(scoreMatch[1]); } catch(e) { console.warn('Score parse error:', e.message); }
    }

    const mandated = raw.includes('[[MANDATED_FLAG]]');
    const cleaned  = raw
      .replace(/\[\[SCORE:[\s\S]*?\]\]/, '')
      .replace('[[MANDATED_FLAG]]', '')
      .trim();

    res.json({ text: cleaned, mandated, score: scoreData });

  } catch (err) {
    console.error('Anthropic API error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', detail: err.message });
  }
});

/* ─── SCENARIO DRAFT ENDPOINT ──────────────────────────────────────────── */
app.post('/api/draft-scenario', requireAuth, async (req, res) => {
  const { brief, orgMode, orgName, orgCode, memberName, difficulty, image } = req.body;
  if (!brief) return res.status(400).json({ error: 'brief required' });

  const hasImage = image && image.data && image.mediaType;
  const code = (orgCode || req.iqSession?.orgCode || '').toLowerCase();
  const profile = orgMeta[code] || {};

  // Vertical-neutral: describe the org by its OWN summary; organisational language
  // is carried by _domainDirective(code) appended to the system prompt below.
  const orgCtx = profile.orgSummary
    ? `ORGANISATION: ${orgName || profile.orgName || 'an organisation'} — ${profile.orgSummary}`
    : `ORGANISATION: ${orgName || profile.orgName || 'an organisation'}`;

  const systemPrompt = `You are an expert scenario designer for IntelliQ, a performance intelligence platform used by ${orgName || 'an organisation'}.

A leader has written a brief about a member. Your job is to draft a scenario that will be used to assess that member's decision-making, reasoning, and self-awareness.

${orgCtx}
MEMBER: ${memberName || 'the member'}
DIFFICULTY: ${difficulty || 'medium'}
${hasImage ? '\nEvidence has been attached. Build the scenario around what is shown — reference specific elements the member should notice and respond to.' : ''}

OUTPUT FORMAT — respond with valid JSON only, no extra text:
{
  "opening": "The vivid opening situation (2-3 sentences). ${hasImage ? 'Reference the image directly — e.g. \"Take a look at the clip/diagram/sheet below.\" Then set the scene.' : 'Ground it in reality.'} Do not resolve the tension.",
  "probes": [
    "First follow-up — references something specific in the image or brief",
    "Second follow-up — introduces a complication or raises stakes",
    "Third follow-up — tests self-awareness or understanding"
  ],
  "coachNote": "What this scenario is designed to reveal, and what strong vs weak responses look like. 2-3 sentences. Reference the evidence content if relevant.",
  "title": "A short scenario title (3-6 words)"
}

RULES:
- The opening must feel real and specific
- Do not make the right answer obvious
- The probes should escalate
- The coachNote is private — never shown to the member`;

  const userContent = hasImage
    ? [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
        { type: 'text', text: `Coach brief: ${brief}` },
      ]
    : `Coach brief: ${brief}`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system:     [systemPrompt, _domainDirective(code)].filter(Boolean).join('\n\n'),
      messages:   [{ role: 'user', content: userContent }],
    });

    const raw = response.content[0]?.text || '';
    const jsonStr = raw.replace(/```json\n?|\n?```/g, '').trim();

    let draft;
    try { draft = JSON.parse(jsonStr); }
    catch(e) { return res.status(500).json({ error: 'Draft parse failed', raw }); }

    res.json({ draft });

  } catch (err) {
    console.error('Draft scenario error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', detail: err.message });
  }
});

/* ─── COACH DEBRIEF ENDPOINT ────────────────────────────────────────────── */
app.post('/api/coach-debrief', async (req, res) => {
  const { conversation, scores, memberName, scenarioTitle, orgMode, orgName, coachRole } = req.body;
  if (!conversation || !scores) return res.status(400).json({ error: 'conversation and scores required' });

  const systemPrompt = `You are an expert performance analyst for IntelliQ, used by ${orgName || 'an organisation'}.

You are writing a private debrief for a ${coachRole || 'leader/supervisor'} — NOT for the member. The member will never see this.

Your job: analyse ${memberName}'s responses to the "${scenarioTitle}" scenario and give the leader practical, specific guidance.

OUTPUT FORMAT — valid JSON only:
{
  "headline": "One sentence summary of the most important thing the leader should know",
  "whatThisReveals": "2-3 sentences on what ${memberName}'s reasoning pattern shows — not just the score, but the WHY behind it. What does this tell you about how they think?",
  "watchFor": ["Specific behaviour or pattern to observe in real situations", "Another thing to monitor"],
  "coachingActions": ["Concrete action the leader can take this week", "A second specific action", "Optional third action"],
  "escalate": false
}

Set "escalate" to true ONLY if the conversation contains anything suggesting the member needs support beyond normal coaching (wellbeing concern, significant distress, safeguarding indicator).

Be honest. Be specific. Reference what ${memberName} actually said. Do not give generic coaching advice.`;

  const conversationText = conversation
    .map(m => `${m.role === 'user' ? memberName : 'AI'}: ${m.content}`)
    .join('\n');

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     [systemPrompt, packs.domainDirective(packs.resolveDomain(orgMode))].filter(Boolean).join('\n\n'),
      messages:   [{
        role:    'user',
        content: `SCORES: Ethical Reasoning ${scores.ethical_reasoning}, Stakeholder Awareness ${scores.stakeholder_awareness}, Pressure Response ${scores.pressure_response}, Self Awareness ${scores.self_awareness}, Overall ${scores.overall}\n\nCONVERSATION:\n${conversationText}`,
      }],
    });

    const raw     = response.content[0]?.text || '';
    const jsonStr = raw.replace(/```json\n?|\n?```/g, '').trim();

    let debrief;
    try { debrief = JSON.parse(jsonStr); }
    catch(e) { return res.status(500).json({ error: 'Debrief parse failed', raw }); }

    res.json({ debrief });

  } catch (err) {
    console.error('Coach debrief error:', err.message);
    res.status(500).json({ error: 'AI service unavailable', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH — ORG & USER MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */

// ── In-memory stores — populated from Postgres at startup via _loadAllStores() ──
const orgMeta      = {};  // orgCode → { orgName, orgMode, createdAt }
const orgUsers     = {};  // orgCode → { userId → userObject }
const inviteTokens = {};  // token → { orgCode, role, supervisorId, expiresAt }
const emailIndex   = {};  // email (lowercase) → { orgCode, userId }
const pendingInvites = {}; // token → { email, orgCode, role, ... }

// ── Sprint 2 stores ────────────────────────────────────────────────────────
const orgNodes        = {};  // orgCode → { nodeId → OrgNode }
const orgMetrics      = {};  // orgCode → [{ metricId, name, source, order }]
const orgValues       = {};  // orgCode → [string]
const orgGoals        = {};  // orgCode → [{ goalId, text, createdAt }]
const userPermissions = {};  // orgCode → { userId → { perm → bool } }

// ── Memory Engine ──────────────────────────────────────────────────────────
const userAiProfiles  = {};  // `orgCode:userId` → { openThreads, recentThemes, priorFollowUps, lastUpdated }
// Consent ledger (GDPR): `orgCode:userId` → { [scope]: { granted, at } }. The person
// owns it; drawing external app data is gated on it and it is revocable at any time.
const userConsents    = {};
const connectedSources= {};  // `orgCode:userId` → { [sourceId]: { connectedAt, lastPull } }
const pendingActions  = {};  // `orgCode:userId` → [{ id, action, summary, payload, status, createdAt }]
// Assessments: a leader creates a TEMPLATE (a way they want something done — a
// spreadsheet, film breakdown, a way of playing) and ASSIGNS it. The assignee
// (leader or member) fills it and returns it; the assigner reviews. Tutorials are
// pinned how-to references anyone can look back at. `orgCode` → [ ... ].
const assessmentTemplates   = {};  // [{ id, title, description, kind, fields:[{label,hint}], createdBy, createdByName, createdAt }]
const assessmentAssignments = {};  // [{ id, templateId, title, kind, fields, assignerId/Name, assigneeId/Name, status, response:{}, feedback, score, assignedAt, submittedAt, returnedAt }]
const orgTutorials          = {};  // [{ id, title, body, url, kind, createdBy, createdByName, createdAt }]
// The Studio — each person's conversation-first space: a running chat with IntelliQ
// plus the plans they capture there. Keyed `orgCode:userId`. Assigned work and pins
// are read live from the assessment/tutorial stores; this holds the conversation and
// the person's own planning items (which also emit kernel signals, so planning counts).
const studioThreads         = {};  // `${code}:${userId}` → { messages:[{role,text,ts,media?}], plans:[{id,text,ts,done}] }
// Universal ingest — one authenticated pipe ANY app (in-house, SaaS, a script, a
// no-code automation) can POST numeric data to. Per-org token → maps records to
// members and emits universal signals, so we never build N bespoke integrations.
const orgApiTokens          = {};  // orgCode → { token, createdAt, createdBy }
// Universal connectors — a connection to ANY system that has a URL or can push a
// webhook. The org configures {url, auth, schedule}; the server polls it and the
// generic mapper deciphers whatever JSON comes back into signals. No per-vendor code.
const orgConnections        = {};  // orgCode → [ { id, name, url, method, headers, scheduleHours, source, jsonPath, oauth?, lastRun, lastStatus, lastCount, createdBy, createdAt, + sync-reliability fields } ]
// Sync reliability layer — the durable movement of data up to the evidence boundary.
//   syncRuns:       orgCode → [ run ]  (append-only audit of every attempt: cursors, counts, outcome)
//   failedRecords:  orgCode → [ record ]  (the dead-letter queue — replayable, org-scoped)
//   webhookDeliveries: deliveryKey → { org, connId, at }  (idempotency: a delivery is processed once)
const syncRuns              = {};
const failedRecords         = {};
const webhookDeliveries     = {};
const SYNC_RUN_CAP          = 200;  // keep the last N runs per org
const _syncLocks            = {};   // connId → true  (in-process guard: one run per connection at a time)
// The EXECUTION LAYER — where IntelliQ participates in reality (not just reads it).
//   orgPolicies: orgCode → [ rule ]  (the organisational constitution; what the AI may DO)
//   actionsLog:  orgCode → [ action ] (every action through recommend→…→learn, audited)
const orgPolicies           = {};
const actionsLog            = {};
const ACTIONS_CAP           = 500;
// Calendar — the first PRODUCTION capability. The store is provider-agnostic; the
// internal adapter writes here, and a real provider (Google/Microsoft) is just
// another adapter registered against the SAME capability. No new architecture.
const orgCalendar           = {};  // orgCode → [ event ]
// MyWorkspace — ONE personal operating surface. Every input is a typed, scoped item
// (see lib/workspace.js). Keyed by owner; privacy is explicit and deterministic.
const workspaceItems        = {};  // `${orgCode}:${userId}` → [ item ]
const WORKSPACE_CAP         = 1000;
// Reasoning artifacts — the INSPECTABLE trace of every pre-kernel transformation,
// kernel derivation, and meaningful post-kernel decision (never chain-of-thought).
// See lib/reasoning.js. This is what makes the three boundaries auditable.
const reasoningArtifacts    = {};  // orgCode → [ artifact ]
const REASONING_CAP         = 4000;
// OAuth2 app credentials the org registered with each provider (client id/secret
// obtained from the provider's developer console). orgCode → { provider → {clientId, clientSecret} }.
const orgOAuthApps          = {};
const oauthPending          = {};  // state → { code(org), userId, provider, ts }
// The Canonical Evidence layer — the universal boundary every connector crosses.
//   rawEvidence:  id → the ORIGINAL source record, stored verbatim and NEVER mutated
//                 (the immutable provenance root every envelope points back to).
//   evidenceLog:  orgCode → [ envelope ] (append-only; see lib/evidence.js). The
//                 kernel signal is DERIVED from a promotable envelope, so the log is
//                 the audit trail of exactly what entered organisational truth.
const rawEvidence           = {};  // rawRef → { org, provider, receivedAt, record }
const evidenceLog           = {};  // orgCode → [ envelope ]
const _evidenceSeen         = {};  // orgCode → Set(dedupeKey)  (rebuilt on load; dedupe index)
const EVIDENCE_LOG_CAP      = 8000; // per-org retention cap for the in-memory/blob log
// The Mapping Approval layer — the interpretation boundary. A registry of VERSIONED
// mapping contracts per org. Only an ACTIVE version may promote evidence; editing an
// approved version forks a new draft (versions are immutable). See lib/mapping.js.
const orgMappings           = {};  // orgCode → [ mappingVersion ]

/* The provider catalog. Every one of these is a standard OAuth2 authorization-code
   flow — only the URLs, scopes, and default data endpoint differ. Adding a new app
   is data, not code. `subject:'self'` means the data is about the person who
   connected (a wearable); the poll attributes it to them. */
const OAUTH_PROVIDERS = {
  strava:    { label: 'Strava',            authorizeUrl: 'https://www.strava.com/oauth/authorize',                          tokenUrl: 'https://www.strava.com/oauth/token',                          scope: 'read,activity:read_all', dataUrl: 'https://www.strava.com/api/v3/athlete/activities?per_page=30', subject: 'self', docs: 'strava.com/settings/api' },
  google:    { label: 'Google Workspace',  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',                    tokenUrl: 'https://oauth2.googleapis.com/token',                          scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', dataUrl: '', subject: 'self', extraAuth: { access_type: 'offline', prompt: 'consent' }, docs: 'console.cloud.google.com' },
  microsoft: { label: 'Microsoft 365 / Teams', authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', scope: 'offline_access User.Read', dataUrl: 'https://graph.microsoft.com/v1.0/me', subject: 'self', docs: 'portal.azure.com' },
  fitbit:    { label: 'Fitbit',            authorizeUrl: 'https://www.fitbit.com/oauth2/authorize',                         tokenUrl: 'https://api.fitbit.com/oauth2/token',                         scope: 'activity heartrate sleep profile', dataUrl: 'https://api.fitbit.com/1/user/-/activities/date/today.json', subject: 'self', docs: 'dev.fitbit.com' },
  hudl:      { label: 'Hudl',              authorizeUrl: 'https://www.hudl.com/oauth2/authorize',                           tokenUrl: 'https://www.hudl.com/oauth2/token',                           scope: 'read', dataUrl: '', subject: 'self', docs: 'hudl.com developer access' },
  custom:    { label: 'Any OAuth2 app',    authorizeUrl: '', tokenUrl: '', scope: '', dataUrl: '', subject: 'self', docs: 'the app\'s API docs' },
};
const CONSENT_VERSION = '2026-07';
const _consentKey = (code, uid) => `${code}:${uid}`;
function _getConsents(code, uid) { const k = _consentKey(code, uid); return (userConsents[k] = userConsents[k] || {}); }
function _hasConsent(code, uid, scope) { return _getConsents(code, uid)[scope]?.granted === true; }

/* Get or create a user's AI memory profile */
function _getMemory(orgCode, userId) {
  const key = `${orgCode}:${userId}`;
  if (!userAiProfiles[key]) {
    userAiProfiles[key] = {
      openThreads:    [],  // [{ id, text, source, date, occurrences, resolved }]
      recentThemes:   [],  // string[], max 10
      priorFollowUps: [],  // [{ id, commitment, source, date, resolved }]
      focuses:        [],  // [{ id, text, type, status:'active'|'done', outcome, createdAt }] — approved work
      model:          agents.personModel.blankModel(),  // the Person Model (self-owned, categorical tokens only)
      lastUpdated:    null,
    };
  }
  // Back-fill fields for profiles created before they existed.
  if (!userAiProfiles[key].model)   userAiProfiles[key].model   = agents.personModel.blankModel();
  if (!userAiProfiles[key].focuses) userAiProfiles[key].focuses = [];
  return userAiProfiles[key];
}

/* Update memory after a check-in insight or scenario score.
   source: 'checkin' | 'weekly' | 'scenario'
   data: { watchOutFor?, themes?[], development?[], suggestedNextAction? } */
function _updateUserMemory(orgCode, userId, source, data) {
  if (!orgCode || !userId) return;
  const mem = _getMemory(orgCode, userId);
  const today = new Date().toISOString().split('T')[0];
  let changed = false;

  // ── 1. Open threads from watchOutFor ──────────────────────────────────────
  if (data.watchOutFor && typeof data.watchOutFor === 'string') {
    const text = data.watchOutFor.trim();
    if (text && text.toLowerCase() !== 'null') {
      // Check for existing similar thread (simple keyword overlap, 40% threshold)
      const textWords = new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
      const similar = mem.openThreads.find(t => {
        if (t.resolved) return false;
        const tWords = new Set(t.text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        const shared = [...textWords].filter(w => tWords.has(w)).length;
        return shared >= Math.ceil(textWords.size * 0.4);
      });
      if (similar) {
        similar.occurrences = (similar.occurrences || 1) + 1;
        similar.date = today;
      } else {
        mem.openThreads.push({
          id:          `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          text,
          source,
          date:        today,
          occurrences: 1,
          resolved:    false,
        });
      }
      changed = true;
    }
  }

  // ── 2. Scenario development areas → open threads ──────────────────────────
  if (Array.isArray(data.development)) {
    for (const dev of data.development.slice(0, 3)) {
      if (!dev || typeof dev !== 'string') continue;
      const text = dev.trim();
      const already = mem.openThreads.find(t => !t.resolved && t.text.toLowerCase().includes(text.toLowerCase().slice(0, 30)));
      if (!already) {
        mem.openThreads.push({
          id:          `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
          text,
          source:      'scenario',
          date:        today,
          occurrences: 1,
          resolved:    false,
        });
        changed = true;
      }
    }
  }

  // ── 3. Recent themes (keywords from watchOutFor + development) ─────────────
  const themeWords = [];
  if (data.watchOutFor) themeWords.push(...data.watchOutFor.toLowerCase().split(/\W+/).filter(w => w.length > 4));
  if (Array.isArray(data.themes)) themeWords.push(...data.themes.map(t => t.toLowerCase().trim()).filter(Boolean));
  if (themeWords.length) {
    for (const word of themeWords) {
      if (!mem.recentThemes.includes(word)) {
        mem.recentThemes.unshift(word);
        changed = true;
      }
    }
    mem.recentThemes = mem.recentThemes.slice(0, 10); // cap at 10
  }

  // ── 4. Prior follow-ups from suggestedNextAction ───────────────────────────
  if (data.suggestedNextAction && typeof data.suggestedNextAction === 'string') {
    const action = data.suggestedNextAction.trim();
    if (action && !mem.priorFollowUps.find(f => !f.resolved && f.commitment === action)) {
      mem.priorFollowUps.push({
        id:         `${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
        commitment: action,
        source,
        date:       today,
        resolved:   false,
      });
      // Cap at 10 unresolved follow-ups
      const unresolved = mem.priorFollowUps.filter(f => !f.resolved);
      if (unresolved.length > 10) {
        const oldest = unresolved.sort((a, b) => a.date.localeCompare(b.date))[0];
        oldest.resolved = true;
      }
      changed = true;
    }
  }

  // ── Person Model: accumulate structured, categorical understanding ────────
  // Only ever categorical tokens (privacy-by-construction). Deterministic and
  // wrapped so it can never break a check-in. Timing = when they engage; an
  // overload/withdrawal read maps to what tends to overwhelm them.
  try {
    const hour = new Date().getHours();
    const timing = hour < 11 ? 'morning' : hour < 16 ? 'midday' : hour < 21 ? 'evening' : 'night';
    const obs = { timing };
    const blob = `${data.watchOutFor || ''} ${(data.themes || []).join(' ')} ${data.suggestedNextAction || ''}`.toLowerCase();
    if (/overload|too much|overwhelm|heavy|burnout|exhaust/.test(blob)) obs.overwhelmers = 'load';
    else if (/isolat|withdraw|alone|disconnect/.test(blob))            obs.overwhelmers = 'isolation';
    else if (/uncertain|unsure|unclear|confus/.test(blob))            obs.overwhelmers = 'uncertainty';
    agents.personModel.update(mem.model || (mem.model = agents.personModel.blankModel()), obs);
    changed = true;
  } catch (_) { /* model update is best-effort; never blocks a check-in */ }

  if (changed) {
    // Cap open threads at 20 (keep most recent unresolved)
    const unresolved = mem.openThreads.filter(t => !t.resolved);
    if (unresolved.length > 20) {
      unresolved.sort((a, b) => a.date.localeCompare(b.date));
      unresolved.slice(0, unresolved.length - 20).forEach(t => { t.resolved = true; });
    }
    mem.lastUpdated = new Date().toISOString();
    scheduleSave();
  }
}

/* Build the memory injection block for AI prompts */
function _buildMemoryBlock(orgCode, userId) {
  const mem = userAiProfiles[`${orgCode}:${userId}`];
  if (!mem) return '';

  const activeThreads  = (mem.openThreads  || []).filter(t => !t.resolved).slice(0, 5);
  const activeFollowUps = (mem.priorFollowUps || []).filter(f => !f.resolved).slice(0, 3);
  const themes          = (mem.recentThemes || []).slice(0, 6);

  if (!activeThreads.length && !activeFollowUps.length && !themes.length) return '';

  const lines = ['MEMBER MEMORY — real observations from prior sessions (only reference if directly relevant):'];
  if (activeThreads.length) {
    lines.push('Recurring themes:');
    activeThreads.forEach(t => {
      const freq = t.occurrences > 1 ? ` (mentioned ${t.occurrences}× — last: ${t.date})` : ` (${t.date})`;
      lines.push(`  - "${t.text}"${freq}`);
    });
  }
  if (activeFollowUps.length) {
    lines.push('Prior follow-ups:');
    activeFollowUps.forEach(f => lines.push(`  - "${f.commitment}" (${f.date}, unresolved)`));
  }
  if (themes.length) {
    lines.push(`Keywords: ${themes.join(', ')}`);
  }
  lines.push('Do not force memory into every response. Reference it only when the member says something that connects naturally.');

  return '\n\n' + lines.join('\n');
}

// Rebuild emailIndex from orgUsers (called after _loadAllStores at startup)
function _rebuildEmailIndex() {
  for (const [orgCode, users] of Object.entries(orgUsers)) {
    for (const [userId, user] of Object.entries(users)) {
      if (user.email) emailIndex[user.email.toLowerCase()] = { orgCode, userId };
    }
  }
}

function generateId()    { return Math.random().toString(36).slice(2,10); }
function generateToken() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
function toOrgCode(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

/* ── Setup new org (first super admin) ─────────────────────────────────── */
app.post('/api/auth/setup-org', async (req, res) => {
  const { orgName, orgMode, adminName, firstName, lastName, email, password } = req.body;
  // Support legacy adminName OR new firstName+lastName
  const fName = (firstName || '').trim();
  const lName = (lastName  || '').trim();
  const fullName = fName && lName ? `${fName} ${lName}` : (adminName || '').trim();
  const emailNorm = (email || '').toLowerCase().trim();

  if (!orgName || !fullName || !password) return res.status(400).json({ error: 'Missing fields: organisation name, admin name and password are required.' });
  if (!emailNorm) return res.status(400).json({ error: 'Email address is required for Super Admin creation.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  // Global email uniqueness check
  if (emailIndex[emailNorm]) return res.status(400).json({ error: 'An account with this email already exists.' });

  const orgCode = toOrgCode(orgName);
  if (orgUsers[orgCode] && Object.keys(orgUsers[orgCode]).length > 0) {
    return res.status(400).json({ error: 'Organisation already exists. Ask your admin for an invite.' });
  }

  const userId      = generateId();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  orgMeta[orgCode]  = { orgName, orgMode: orgMode || '', createdAt: new Date().toISOString() };
  orgUsers[orgCode] = {};
  orgUsers[orgCode][userId] = {
    id:           userId,
    firstName:    fName || fullName,
    lastName:     lName || '',
    name:         fullName,
    email:        emailNorm,
    role:         'superadmin',
    orgCode,
    supervisorId: null,
    passwordHash,
    passwordSet:  true,
    status:       'active',
    createdAt:    new Date().toISOString(),
    levelId:      1,
  };
  emailIndex[emailNorm] = { orgCode, userId };
  scheduleSave();

  const token = issueToken(userId, orgCode, 'superadmin');
  res.json({ ok: true, orgCode, userId, orgName, role: 'superadmin', token,
             user: { ...orgUsers[orgCode][userId], passwordHash: undefined } });
});

/* ── Login — email + password only ─────────────────────────────────────── */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const emailNorm = (email || '').toLowerCase().trim();

  if (!emailNorm) return res.status(400).json({ error: 'Email address is required.' });
  if (!password)  return res.status(400).json({ error: 'Password is required.' });

  const entry = emailIndex[emailNorm];
  if (!entry) return res.status(401).json({ error: 'No account found with that email address.' });

  const code = entry.orgCode;
  const user = orgUsers[code]?.[entry.userId];
  if (!user) return res.status(401).json({ error: 'Account not found. Please contact your admin.' });

  // Lazy bcrypt migration: verify old hash then upgrade
  let passwordValid = false;
  if (isLegacyHash(user.passwordHash)) {
    if (simpleHash(password) === user.passwordHash) {
      passwordValid = true;
      user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      scheduleSave();
    }
  } else {
    passwordValid = await bcrypt.compare(password, user.passwordHash);
  }

  if (!passwordValid) return res.status(401).json({ error: 'Email or password incorrect.' });

  const org   = orgMeta[code];
  const token = issueToken(user.id, code, user.role);
  res.json({ ok: true, user: { ...user, passwordHash: undefined }, org, token });
});

/* ── Create user (admin/coach adds someone below them) ─────────────────── */
app.post('/api/auth/create-user', async (req, res) => {
  const { orgCode, creatorId, name, firstName, lastName, email, role, supervisorId, password, group } = req.body;
  const code  = (orgCode || '').toLowerCase();
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Org not found' });

  const creator = users[creatorId];
  if (!creator) return res.status(403).json({ error: 'Creator not found' });

  const roleLevel = { superadmin:1, admin:2, coach:3, member:4 };
  // A leader (node / supervisor / group lead) may add plain MEMBERS under
  // themselves even when their own role is 'member' — item C. They cannot create
  // anyone above member, and the new member is forced into their subtree below.
  const leaderAddingMember = role === 'member' && _isLeader(code, creatorId);
  if (roleLevel[role] <= roleLevel[creator.role] && creator.role !== 'superadmin' && !leaderAddingMember) {
    return res.status(403).json({ error: 'You cannot create someone at or above your level' });
  }
  // For non-admin leaders, force placement under themselves so they can never
  // create a user outside their own subtree.
  const isPrivileged = ['superadmin','admin','coach'].includes(creator.role);
  const effectiveSupervisorId = isPrivileged ? (supervisorId || creatorId) : creatorId;

  // Build full name
  const fName = (firstName || '').trim();
  const lName = (lastName  || '').trim();
  const fullName = fName && lName ? `${fName} ${lName}` : (name || '').trim();
  if (!fullName) return res.status(400).json({ error: 'Name is required' });

  const emailNorm = (email || '').toLowerCase().trim();
  if (!emailNorm) return res.status(400).json({ error: 'Email address is required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (emailIndex[emailNorm]) return res.status(400).json({ error: 'An account with this email already exists.' });

  const exists = Object.values(users).find(u => u.name.toLowerCase() === fullName.toLowerCase());
  if (exists) return res.status(400).json({ error: 'Someone with that name already exists in this org' });

  const userId          = generateId();
  const hasPassword     = !!(password && password.trim());
  // If no password supplied: set a cryptographically random hash so no one can log in
  // with a guessed default. The user must activate via an invite link (passwordSet: false).
  const rawPassword     = hasPassword ? password : (Math.random().toString(36) + Math.random().toString(36));
  const passwordHash    = await bcrypt.hash(rawPassword, SALT_ROUNDS);

  users[userId] = {
    id:           userId,
    firstName:    fName || fullName,
    lastName:     lName || '',
    name:         fullName,
    email:        emailNorm,
    role,
    orgCode:      code,
    supervisorId: effectiveSupervisorId,
    group:        group || '',
    passwordHash,
    passwordSet:  hasPassword,
    status:       'active',
    createdAt:    new Date().toISOString(),
    levelId:      roleLevel[role] || 4,
  };
  emailIndex[emailNorm] = { orgCode: code, userId };
  scheduleSave();

  res.json({ ok: true, user: { ...users[userId], passwordHash: undefined } });
});

/* ── Bulk create (name-only) REMOVED — use bulk-import with email instead ── */
// POST /api/auth/bulk-create was removed in Sprint 2.
// All new users must be created with an email address via /api/auth/create-user
// or imported in bulk via /api/auth/bulk-import (which requires email column).

/* ── Generate invite link ───────────────────────────────────────────────── */
app.post('/api/auth/invite', (req, res) => {
  const { orgCode, role, supervisorId, group, label, usageLimit, expiryDays } = req.body;
  const token = generateToken();
  const days  = Math.min(Math.max(parseInt(expiryDays) || 7, 1), 90);
  inviteTokens[token] = {
    orgCode:    orgCode.toLowerCase(),
    role:       role || 'member',
    supervisorId,
    group:      group || '',
    label:      label || '',
    usageLimit: usageLimit ? parseInt(usageLimit) : null,
    useCount:   0,
    expiresAt:  Date.now() + days * 24 * 60 * 60 * 1000,
    createdAt:  new Date().toISOString(),
  };
  scheduleSave();
  const inviteUrl = `/?invite=${token}`;
  console.log(`[INVITE] token=${token} | url=${inviteUrl} | org=${orgCode} | role=${role || 'member'}`);
  res.json({ ok: true, token, url: inviteUrl });
});

/* ── Validate invite token (no account created — used by registration page) ── */
app.get('/api/auth/invite-info', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'token required' });
  const invite = inviteTokens[token];
  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite link.' });
  if (invite.expiresAt < Date.now()) return res.status(410).json({ error: 'This invite link has expired.' });
  if (invite.usageLimit && (invite.useCount || 0) >= invite.usageLimit)
    return res.status(410).json({ error: 'This invite link has reached its usage limit.' });
  const org = orgMeta[invite.orgCode];
  res.json({
    ok:      true,
    orgName: org?.orgName || invite.orgCode,
    role:    invite.role,
    group:   invite.group || '',
    email:   invite.email || '',   // prefill if invite was email-targeted
  });
});

/* ── Join via invite ────────────────────────────────────────────────────── */
app.post('/api/auth/join-invite', async (req, res) => {
  const { token, name, firstName, lastName, email, password } = req.body;
  const invite = inviteTokens[token];
  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite link' });
  if (invite.expiresAt < Date.now()) return res.status(410).json({ error: 'Invite link has expired' });
  if (invite.usageLimit && (invite.useCount || 0) >= invite.usageLimit) return res.status(410).json({ error: 'This invite link has reached its usage limit' });

  const code  = invite.orgCode;
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Organisation not found' });

  // Build full name
  const fName = (firstName || '').trim();
  const lName = (lastName  || '').trim();
  const fullName = fName && lName ? `${fName} ${lName}` : (name || '').trim();
  if (!fullName) return res.status(400).json({ error: 'Full name is required' });

  // Email: use provided, or fall back to invite-embedded email
  const emailNorm = ((email || invite.email || '')).toLowerCase().trim();
  if (!emailNorm) return res.status(400).json({ error: 'Email address is required.' });
  if (emailIndex[emailNorm]) return res.status(400).json({ error: 'An account with this email already exists. Please log in instead.' });

  const exists = Object.values(users).find(u => u.name.toLowerCase() === fullName.toLowerCase());
  if (exists) return res.status(400).json({ error: 'That name is already taken in this org' });

  const roleLevel   = { superadmin:1, admin:2, coach:3, member:4 };
  const userId      = generateId();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  users[userId] = {
    id: userId,
    firstName:    fName || fullName,
    lastName:     lName || '',
    name:         fullName,
    email:        emailNorm,
    role:         invite.role,
    orgCode:      code,
    supervisorId: invite.supervisorId,
    group:        invite.group || '',
    passwordHash,
    passwordSet:  true,
    status:       'active',
    createdAt:    new Date().toISOString(),
    levelId:      roleLevel[invite.role] || 4,
  };
  emailIndex[emailNorm] = { orgCode: code, userId };

  // Auto-add to group if specified
  if (invite.group && orgGroups[code]) {
    const gObj = orgGroups[code].find(g => g.name.toLowerCase() === (invite.group || '').toLowerCase());
    if (gObj && !gObj.memberIds.includes(userId)) gObj.memberIds.push(userId);
  }
  invite.useCount = (invite.useCount || 0) + 1;
  // A new person exists → re-evaluate evidence that was held back unmatched. Any
  // envelope that deterministically matches them now (email/id) resolves + promotes,
  // preserving its original observed time. Fuzzy name matches are only proposed.
  try { _reresolveUnmatched(code, { by: 'system', method: 'rule', reason: 'person created' }); } catch (_) {}
  scheduleSave();

  const org   = orgMeta[code];
  const tkn   = issueToken(userId, code, invite.role);
  res.json({ ok: true, user: { ...users[userId], passwordHash: undefined }, org, token: tkn });
});

/* ── Get current user profile ───────────────────────────────────────────── */
app.get('/api/auth/me', (req, res) => {
  const header  = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const token   = header || req.query.token;
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ error: 'Authentication required.' });

  const user = orgUsers[session.orgCode]?.[session.userId];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const org = orgMeta[session.orgCode];

  // Unified permission resolution (role defaults → leader grants → explicit).
  // `leads` tells the client whether to show the Leader Workspace, and is true
  // for node leaders, supervisor-tree leaders, AND group leads — see _isLeader.
  const permissions = _effectivePermissions(session.orgCode, session.userId);
  const leads       = _isLeader(session.orgCode, session.userId);

  // Adaptive display language: the kernel stores universal primitives; the client
  // renders them in this org's words (player/student/team-member…). Driven from
  // the org's domain pack + any custom overrides — never hard-coded in the UI.
  const domain = packs.resolveDomain(org?.orgMode, org?.domain);

  res.json({ ok: true, user: { ...user, passwordHash: undefined, leads }, org, permissions, domain });
});

/* ── Permission defaults by role (fallback when no explicit grant) ───────── */
function _resolveRoleDefaults(role) {
  const d = {
    superadmin: {
      view_members: true, edit_members: true, delete_members: true,
      view_analytics: true, manage_metrics: true, manage_values: true,
      manage_goals: true, manage_tree: true, manage_permissions: true,
      assign_scenarios: true, view_reports: true, manage_settings: true,
      // Phase 1: leader layer permissions
      view_team: true, review_checkins: true, view_insights: true,
    },
    admin: {
      view_members: true, edit_members: true, delete_members: false,
      view_analytics: true, manage_metrics: true, manage_values: true,
      manage_goals: true, manage_tree: true, manage_permissions: false,
      assign_scenarios: true, view_reports: true, manage_settings: false,
      // Phase 1: leader layer permissions
      view_team: true, review_checkins: true, view_insights: true,
    },
    coach: {
      view_members: true, edit_members: false, delete_members: false,
      view_analytics: true, manage_metrics: false, manage_values: false,
      manage_goals: false, manage_tree: false, manage_permissions: false,
      assign_scenarios: true, view_reports: true, manage_settings: false,
      // Phase 1: leader layer — coaches can see their team and assign
      view_team: true, review_checkins: true, view_insights: true,
    },
    member: {
      view_members: false, edit_members: false, delete_members: false,
      view_analytics: false, manage_metrics: false, manage_values: false,
      manage_goals: false, manage_tree: false, manage_permissions: false,
      assign_scenarios: false, view_reports: false, manage_settings: false,
      // Phase 1: members never see the leader layer
      view_team: false, review_checkins: false, view_insights: false,
    },
  };
  return d[role] || d.member;
}

/* ── Permission middleware factory ──────────────────────────────────────── */
function requirePermission(perm) {
  return (req, res, next) => {
    const header  = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const session = verifyToken(header || req.query.token);
    if (!session) return res.status(401).json({ error: 'Authentication required.' });

    const user = orgUsers[session.orgCode]?.[session.userId];
    if (!user) return res.status(401).json({ error: 'User not found.' });

    // SuperAdmin bypasses all permission checks
    if (user.role === 'superadmin') { req.iqSession = session; return next(); }

    const allowed = _effectivePermissions(session.orgCode, session.userId)[perm] === true;

    if (!allowed) return res.status(403).json({ error: `Permission denied: ${perm}` });
    req.iqSession = session;
    next();
  };
}

/* ── Get org hierarchy tree ─────────────────────────────────────────────── */
app.get('/api/auth/org-tree', requireAuth, (req, res) => {
  // SECURITY: was unauthenticated — anyone who knew an org code could enumerate
  // the whole member directory (names, emails, roles). Now requires auth and is
  // scoped to the caller's own org from the session. Fixed 2026-07-09.
  const code  = req.iqSession.orgCode;
  if (!code) return res.status(403).json({ error: 'Forbidden' });
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Org not found' });

  const all  = Object.values(users).map(u => ({ ...u, passwordHash: undefined, children: [] }));
  const byId = {};
  all.forEach(u => byId[u.id] = u);

  const roots = [];
  all.forEach(u => {
    if (!u.supervisorId || !byId[u.supervisorId]) roots.push(u);
    else byId[u.supervisorId].children.push(u);
  });

  res.json({ ok: true, tree: roots, flat: all });
});

/* ── Update user ────────────────────────────────────────────────────────── */
app.put('/api/auth/update-user', async (req, res) => {
  const { orgCode, userId, updates } = req.body;
  const code  = (orgCode||'').toLowerCase();
  const users = orgUsers[code];
  if (!users || !users[userId]) return res.status(404).json({ error: 'User not found' });
  const safe = ['name','firstName','lastName','role','supervisorId','group','status'];
  safe.forEach(k => { if (updates[k] !== undefined) users[userId][k] = updates[k]; });
  // Recompute name if first/last changed
  if ((updates.firstName || updates.lastName) && !updates.name) {
    users[userId].name = `${users[userId].firstName || ''} ${users[userId].lastName || ''}`.trim();
  }
  // Email update: check uniqueness, update index
  if (updates.email) {
    const newEmail = updates.email.toLowerCase().trim();
    const oldEmail = users[userId].email;
    if (newEmail !== oldEmail) {
      if (emailIndex[newEmail]) return res.status(400).json({ error: 'Email already in use.' });
      if (oldEmail) delete emailIndex[oldEmail];
      emailIndex[newEmail] = { orgCode: code, userId };
      users[userId].email = newEmail;
    }
  }
  if (updates.password) users[userId].passwordHash = await bcrypt.hash(updates.password, SALT_ROUNDS);
  scheduleSave();
  res.json({ ok: true, user: { ...users[userId], passwordHash: undefined } });
});

/* ── Remove person — full cleanup ───────────────────────────────────────── */
//
//  DELETE /api/auth/users/:userId
//  DELETE /api/auth/users/:userId?deleteData=true   (also wipes historical data)
//
//  Cleans:
//    orgUsers  · emailIndex  · inviteTokens  · pendingInvites
//    orgNodes memberIds/leaderIds  · orgGroups memberIds/leadIds
//    userPermissions
//
//  With ?deleteData=true also cleans:
//    memberGoals · memberCheckins · weeklyAssessments
//    memberResults · assignedScenarios
//
function _removePerson(code, userId, deleteData) {
  const users = orgUsers[code];
  if (!users || !users[userId]) return { ok: false, error: 'User not found' };

  const user  = users[userId];
  const email = (user.email || '').toLowerCase();
  const name  = user.name  || '';

  // 1. Remove from emailIndex
  if (email && emailIndex[email]) delete emailIndex[email];

  // 2. Remove invite tokens linked to this org + email
  Object.keys(inviteTokens).forEach(token => {
    const t = inviteTokens[token];
    if (t.orgCode === code && (t.label === email || t.email === email)) {
      delete inviteTokens[token];
    }
  });

  // 3. Remove pendingInvites linked to this org + email
  Object.keys(pendingInvites).forEach(k => {
    const p = pendingInvites[k];
    if (p.orgCode === code && p.email === email) delete pendingInvites[k];
  });

  // 4. Remove from all org tree nodes (memberIds and leaderIds)
  const nodes = orgNodes[code] || {};
  Object.values(nodes).forEach(node => {
    if (node.memberIds) node.memberIds = node.memberIds.filter(id => id !== userId);
    if (node.leaderIds) node.leaderIds = node.leaderIds.filter(id => id !== userId);
  });

  // 5. Remove from all groups (memberIds and leadIds)
  const groups = orgGroups[code] || [];
  groups.forEach(g => {
    if (g.memberIds) g.memberIds = g.memberIds.filter(id => id !== userId && id !== name);
    if (g.leadIds)   g.leadIds   = g.leadIds.filter(id   => id !== userId && id !== name);
  });

  // 6. Remove explicit permissions
  if (userPermissions[code]) delete userPermissions[code][userId];

  // 7. Remove user record itself
  delete users[userId];

  // 8. Hard-delete ALL of this person's data (GDPR Art 17 — right to erasure).
  //    Must leave NO orphaned personal data anywhere, including the raw check-in
  //    text in signals, the AI memory/Person Model, notes, and messages.
  if (deleteData) {
    const uKey = userKey(code, userId);
    const mKey = memberKey(code, name);
    [uKey, mKey].forEach(k => {
      delete memberGoals[k];
      delete memberCheckins[k];
      delete memberResults[k];
      delete assignedScenarios[k];
    });
    // AI memory + Person Model (derived personal data, may hold raw threads)
    delete userAiProfiles[uKey];
    delete userAiProfiles[mKey];
    // Signals — contain raw check-in text (sensitive). Remove any about or by them.
    if (Array.isArray(orgSignals[code])) {
      orgSignals[code] = orgSignals[code].filter(s => s.subjectId !== userId && s.createdBy !== userId);
    }
    // Notes authored by them (incl. private content)
    Object.keys(orgNotes).forEach(id => {
      const n = orgNotes[id];
      if (n && n.orgCode === code && n.authorId === userId) delete orgNotes[id];
    });
    // Messages they sent
    Object.keys(orgMessages).forEach(id => {
      const m = orgMessages[id];
      if (m && m.orgCode === code && (m._realFromId === userId || m.fromId === userId)) delete orgMessages[id];
    });
    // Weekly assessments are keyed by week, not user — filter each week's entries.
    Object.keys(weeklyAssessments).forEach(wk => {
      if (!wk.startsWith(code + ':')) return;
      weeklyAssessments[wk] = (weeklyAssessments[wk] || []).filter(e =>
        e.memberId !== userId && (e.memberName || '').toLowerCase() !== name.toLowerCase());
    });
    // Advisor threads about them
    if (advisorThreads && typeof advisorThreads === 'object') {
      Object.keys(advisorThreads).forEach(k => {
        if (k === uKey || k === mKey || k.startsWith(`${code}:${userId}`)) delete advisorThreads[k];
      });
    }
    // Consent ledger, connected sources, pending assistant actions
    [uKey, mKey].forEach(k => { delete userConsents[k]; delete connectedSources[k]; delete pendingActions[k]; });
    // Assessments they authored or that were assigned to them (may hold their work)
    if (Array.isArray(assessmentTemplates[code]))
      assessmentTemplates[code] = assessmentTemplates[code].filter(t => t.createdBy !== userId);
    if (Array.isArray(assessmentAssignments[code]))
      assessmentAssignments[code] = assessmentAssignments[code].filter(a => a.assigneeId !== userId && a.assignerId !== userId);
    if (Array.isArray(orgTutorials[code]))
      orgTutorials[code] = orgTutorials[code].filter(t => t.createdBy !== userId);
  }

  return { ok: true };
}

app.delete('/api/auth/users/:userId', requirePermission('delete_members'), (req, res) => {
  const code       = req.iqSession.orgCode;
  const { userId } = req.params;
  const deleteData = req.query.deleteData === 'true';

  const result = _removePerson(code, userId, deleteData);
  if (!result.ok) return res.status(404).json(result);
  scheduleSave();
  res.json({ ok: true, deleteData });
});

/* ── Legacy delete-user endpoint — forwards to _removePerson ────────────── */
app.delete('/api/auth/delete-user', requireAuth, (req, res) => {
  const { orgCode, userId } = req.body;
  const code   = (orgCode || req.iqSession?.orgCode || '').toLowerCase();
  const result = _removePerson(code, userId, false);
  if (!result.ok) return res.status(404).json(result);
  scheduleSave();
  res.json({ ok: true });
});

/* ── Complete member profile (first-login onboarding) ──────────────────── *
 *  POST /api/auth/complete-profile
 *  Body: { mainGoals, longTermGoals, strengths, improvementAreas,
 *          selectedValues[], personalMetrics[], freeText }
 *  Sets profileComplete = true on the user record.
 *  Also stores the profile data in memberGoals[userKey] for use by IntelliQ.
 * ─────────────────────────────────────────────────────────────────────────── */
app.post('/api/auth/complete-profile', requireAuth, (req, res) => {
  const { orgCode: _c, userId: _u, ...body } = req.body;
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  const user   = orgUsers[code]?.[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Repair path (login re-sync of an already-complete profile): just re-affirm
  // completion — never re-validate or overwrite the existing goals/values.
  if (req.body?.repair === true) {
    user.profileComplete = true;
    scheduleSave();
    return res.json({ ok: true, user: { ...user, passwordHash: undefined } });
  }

  const {
    mainGoals        = '',
    longTermGoals    = '',
    strengths        = '',
    improvementAreas = '',
    selectedValues   = [],
    personalMetrics  = [],
    freeText         = '',
  } = req.body;

  // Required anchors — a member needs a goal + at least one value.
  const _mv = (Array.isArray(selectedValues) ? selectedValues : []).map(v => String(v).trim()).filter(Boolean);
  if (!String(mainGoals || '').trim()) return res.status(400).json({ error: 'A main goal is required.' });
  if (_mv.length < 1)                  return res.status(400).json({ error: 'At least one value is required.' });

  // Store profile data in memberGoals — extends existing structure
  const key = userKey(code, userId);
  memberGoals[key] = {
    ...(memberGoals[key] || {}),
    goal:             mainGoals,       // primary "goal" field used by IntelliQ chat prompts
    identity:         longTermGoals,   // "who they want to become" → maps to long-term vision
    mainGoals,
    longTermGoals,
    strengths,
    improvementAreas,
    selectedValues:   Array.isArray(selectedValues)  ? selectedValues  : [],
    personalMetrics:  Array.isArray(personalMetrics) ? personalMetrics : [],
    freeText,
    memberName: user.name,
    setAt:      new Date().toISOString(),
  };

  // Mark profile complete on the user record
  user.profileComplete = true;
  scheduleSave();

  res.json({ ok: true, user: { ...user, passwordHash: undefined } });
});

/* ── Complete organisation profile (SuperAdmin Layer 1 onboarding) ─────── *
 *  POST /api/auth/complete-org-profile                                       *
 *  Requires SuperAdmin. Saves org profile, sets organizationProfileComplete. *
 * ─────────────────────────────────────────────────────────────────────────── */
app.post('/api/auth/complete-org-profile', requireAuth, (req, res) => {
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  const user   = orgUsers[code]?.[userId];
  const org    = orgMeta[code];

  if (!org)  return res.status(404).json({ error: 'Organisation not found' });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'superadmin') return res.status(403).json({ error: 'Only Super Admins can complete the organisation profile' });

  const {
    description       = '',
    values            = [],
    goals             = [],
    successDefinition = '',
    behaviours        = [],
    metrics           = [],
  } = req.body;

  // Required anchors — the AI reasons from these; an org can't finish without them.
  const _vals  = (Array.isArray(values) ? values : []).map(v => String(v).trim()).filter(Boolean);
  const _goals = (Array.isArray(goals)  ? goals  : []).map(g => String(g).trim()).filter(Boolean);
  if (_vals.length < 1)  return res.status(400).json({ error: 'At least one core value is required.' });
  if (_goals.length < 1) return res.status(400).json({ error: 'At least one organisation goal is required.' });

  // Save org profile — fully human-approved, nothing auto-locked
  org.organizationProfile = {
    description,
    values:            Array.isArray(values)      ? values      : [],
    goals:             Array.isArray(goals)        ? goals        : [],
    successDefinition,
    behaviours:        Array.isArray(behaviours)   ? behaviours   : [],
    metrics:           Array.isArray(metrics)      ? metrics      : [],
    setAt: new Date().toISOString(),
    setBy: userId,
  };
  org.organizationProfileComplete = true;

  // Flow the approved profile into the LIVE stores the app + AI actually read,
  // so values/goals/metrics set at creation reach the Advisor, Copilot, etc.
  const profile = org.organizationProfile;
  if (profile.values.length) orgValues[code] = [...profile.values];
  if (profile.goals.length && !(orgGoals[code] && orgGoals[code].length)) {
    orgGoals[code] = profile.goals.map(g => ({ goalId: 'g_' + generateId(), text: String(g), createdAt: new Date().toISOString() }));
  }
  if (profile.metrics.length && !(orgMetrics[code] && orgMetrics[code].length)) {
    orgMetrics[code] = profile.metrics.map((m, i) => ({ metricId: 'm_' + generateId(), name: String(m), source: 'org', order: i }));
  }

  scheduleSave();
  res.json({ ok: true, org: { ...org } });
});

/* ── Domain pack (adaptive display language) ──────────────────────────────── *
 *  The kernel stores universal primitives; each org renders them in its own
 *  words. GET returns the catalog + this org's currently-resolved vocabulary;
 *  POST lets an admin choose a pack and/or set custom words. Display only — this
 *  never changes what the kernel reasons over, only what humans read.
 * ─────────────────────────────────────────────────────────────────────────── */
app.get('/api/org/domain', requireAuth, (req, res) => {
  const org = orgMeta[req.iqSession.orgCode] || {};
  res.json({
    ok: true,
    catalog: packs.domainCatalog(),
    current: packs.resolveDomain(org.orgMode, org.domain),
    config:  org.domain || {},
  });
});

app.post('/api/org/domain', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  const org  = orgMeta[code];
  if (!org) return res.status(404).json({ error: 'Organisation not found' });
  const perms = _effectivePermissions(code, req.iqSession.userId);
  if (!perms.manage_settings) return res.status(403).json({ error: 'You do not have permission to change organisation settings.' });

  const { pack, vocab } = req.body || {};
  const cfg = {};
  if (pack && packs.DOMAIN_VOCAB[pack]) cfg.pack = pack;
  if (vocab && typeof vocab === 'object') {
    const clean = {};
    for (const k of Object.keys(vocab)) {
      if (typeof vocab[k] === 'string' && vocab[k].trim()) clean[k] = vocab[k].trim().slice(0, 40);
    }
    if (Object.keys(clean).length) cfg.vocab = clean;
  }
  org.domain = cfg;
  scheduleSave();
  res.json({ ok: true, current: packs.resolveDomain(org.orgMode, org.domain), config: cfg });
});

/* ── AI suggestions for org setup wizard ─────────────────────────────────── *
 *  POST /api/org-setup/suggest                                                *
 *  Body: { description, orgName }                                             *
 *  Returns: { values[], goals[], successDefinition, behaviours[], metrics[] } *
 * ─────────────────────────────────────────────────────────────────────────── */
app.post('/api/org-setup/suggest', requireAuth, async (req, res) => {
  const { description = '', orgName = '' } = req.body;
  if (!description || description.trim().length < 10) {
    return res.status(400).json({ error: 'Organisation description is required.' });
  }

  const systemPrompt = `You are an organisational intelligence assistant helping a Super Admin set up their IntelliQ platform.
Your job is to analyse the organisation description and suggest appropriate values, goals, success criteria, expected behaviours, and metrics.
Keep suggestions professional, generic (not sports-specific or school-specific unless the description says so), actionable, and concise.
Return ONLY valid JSON — no markdown, no explanation, no extra text.`;

  const userPrompt = `Organisation name: ${orgName || 'Not specified'}
Description: ${description.trim()}

Based on this, suggest:
- 4-6 core organisational VALUES (single words or short phrases)
- 3-5 primary GOALS for the organisation (action-oriented sentences)
- A SUCCESS DEFINITION (1-2 sentences describing what success looks like)
- 4-6 expected BEHAVIOURS from members (short phrases)
- 4-6 HEALTH METRICS to track (short metric names like "Engagement Score")

Return exactly this JSON shape:
{
  "values": ["...", "..."],
  "goals": ["...", "..."],
  "successDefinition": "...",
  "behaviours": ["...", "..."],
  "metrics": ["...", "..."]
}`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content?.[0]?.text || '{}';
    let parsed;
    try {
      // Strip any accidental markdown fences
      const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(cleaned);
    } catch(e) {
      console.error('[org-setup/suggest] JSON parse failed:', raw);
      return res.status(500).json({ error: 'AI returned malformed data — please try again or fill in manually.' });
    }

    res.json({
      values:            Array.isArray(parsed.values)      ? parsed.values      : [],
      goals:             Array.isArray(parsed.goals)        ? parsed.goals        : [],
      successDefinition: typeof parsed.successDefinition === 'string' ? parsed.successDefinition : '',
      behaviours:        Array.isArray(parsed.behaviours)   ? parsed.behaviours   : [],
      metrics:           Array.isArray(parsed.metrics)      ? parsed.metrics      : [],
    });
  } catch(err) {
    console.error('[org-setup/suggest] Anthropic error:', err.message);
    res.status(500).json({ error: 'AI service unavailable — please fill in the fields manually.' });
  }
});

/* ── Set member password (first-login flow) ─────────────────────────────── */
app.post('/api/auth/set-password', async (req, res) => {
  const { orgCode, userId, currentPassword, newPassword } = req.body;

  // ── Token-only path: unified app sends a Bearer token, no currentPassword needed
  //    Allowed only when passwordSet === false (first-login).
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (authHeader) {
    const session = verifyToken(authHeader);
    if (!session) return res.status(401).json({ error: 'Invalid or expired token' });
    const user = orgUsers[session.orgCode]?.[session.userId];
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Only allow skipping current-password check when password was never set
    if (user.passwordSet !== false) return res.status(403).json({ error: 'Current password required' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.passwordSet  = true;
    scheduleSave();
    const token = issueToken(session.userId, session.orgCode, user.role);
    return res.json({ ok: true, token });
  }

  // ── Legacy path: orgCode + userId + currentPassword (platform set-password form)
  const code  = (orgCode || '').toLowerCase();
  const users = orgUsers[code];
  if (!users || !users[userId]) return res.status(404).json({ error: 'User not found' });

  const user = users[userId];

  // Verify current password (supports legacy hash migration)
  let valid = false;
  if (isLegacyHash(user.passwordHash)) {
    valid = simpleHash(currentPassword) === user.passwordHash;
  } else {
    valid = await bcrypt.compare(currentPassword, user.passwordHash);
  }
  if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.passwordSet  = true;
  scheduleSave();

  const token = issueToken(userId, code, user.role);
  res.json({ ok: true, token });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — ORG TREE
   Flat node store reconstructed as tree by parentId.
   Node: { nodeId, name, description, parentId, childNodeIds, memberIds, leaderIds, createdAt, updatedAt }
   User records carry derived caches kept in sync by _syncUserNodeArrays():
     user.assignedNodeIds    — nodeIds where this user appears in node.memberIds
     user.leadershipNodeIds  — nodeIds where this user appears in node.leaderIds
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/tree', requireAuth, (req, res) => {
  const code  = req.iqSession.orgCode;
  const nodes = Object.values(orgNodes[code] || {});
  res.json({ ok: true, nodes });
});

app.post('/api/tree/node', requirePermission('manage_tree'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { name, parentId, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!orgNodes[code]) orgNodes[code] = {};
  const nodeId = 'nd_' + generateId();
  const now    = new Date().toISOString();
  orgNodes[code][nodeId] = {
    nodeId,
    name:        name.trim(),
    description: (description || '').trim(),
    parentId:    parentId || null,
    childNodeIds: [],
    memberIds:   [],
    leaderIds:   [],
    createdAt:   now,
    updatedAt:   now,
  };
  // Add to parent's childNodeIds
  if (parentId && orgNodes[code][parentId]) {
    if (!orgNodes[code][parentId].childNodeIds) orgNodes[code][parentId].childNodeIds = [];
    orgNodes[code][parentId].childNodeIds.push(nodeId);
    orgNodes[code][parentId].updatedAt = now;
  }
  scheduleSave();
  res.json({ ok: true, node: orgNodes[code][nodeId] });
});

app.put('/api/tree/node/:nodeId', requirePermission('manage_tree'), (req, res) => {
  const code   = req.iqSession.orgCode;
  const nodeId = req.params.nodeId;
  const node   = orgNodes[code]?.[nodeId];
  if (!node) return res.status(404).json({ error: 'Node not found' });
  const { name, description, parentId, memberIds, leaderIds } = req.body;
  const now = new Date().toISOString();
  if (name        !== undefined) node.name        = name.trim();
  if (description !== undefined) node.description = description.trim();
  // Sync user arrays before and after membership changes
  const oldMemberIds = [...(node.memberIds || [])];
  const oldLeaderIds = [...(node.leaderIds || [])];
  if (memberIds !== undefined) node.memberIds = memberIds;
  if (leaderIds !== undefined) node.leaderIds = leaderIds;
  if (memberIds !== undefined || leaderIds !== undefined) {
    _syncUserNodeArrays(code, nodeId, oldMemberIds, node.memberIds, oldLeaderIds, node.leaderIds);
  }
  // Handle reparenting
  if (parentId !== undefined && parentId !== node.parentId) {
    // Remove from old parent
    if (node.parentId && orgNodes[code][node.parentId]) {
      const op = orgNodes[code][node.parentId];
      op.childNodeIds = (op.childNodeIds || []).filter(id => id !== nodeId);
      op.updatedAt = now;
    }
    // Add to new parent
    if (parentId && orgNodes[code][parentId]) {
      if (!orgNodes[code][parentId].childNodeIds) orgNodes[code][parentId].childNodeIds = [];
      orgNodes[code][parentId].childNodeIds.push(nodeId);
      orgNodes[code][parentId].updatedAt = now;
    }
    node.parentId = parentId || null;
  }
  node.updatedAt = now;
  scheduleSave();
  res.json({ ok: true, node });
});

app.delete('/api/tree/node/:nodeId', requirePermission('manage_tree'), (req, res) => {
  const code   = req.iqSession.orgCode;
  const nodeId = req.params.nodeId;
  const node   = orgNodes[code]?.[nodeId];
  if (!node) return res.status(404).json({ error: 'Node not found' });
  const now = new Date().toISOString();
  // Remove nodeId from user caches before deleting
  _syncUserNodeArrays(code, nodeId, node.memberIds || [], [], node.leaderIds || [], []);
  // Remove from parent
  if (node.parentId && orgNodes[code][node.parentId]) {
    const p = orgNodes[code][node.parentId];
    p.childNodeIds = (p.childNodeIds || []).filter(id => id !== nodeId);
    p.updatedAt = now;
  }
  // Reparent children to deleted node's parent
  (node.childNodeIds || []).forEach(childId => {
    if (orgNodes[code][childId]) {
      orgNodes[code][childId].parentId  = node.parentId;
      orgNodes[code][childId].updatedAt = now;
    }
  });
  delete orgNodes[code][nodeId];
  scheduleSave();
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   PHASE 2 — VISIBILITY ENGINE
   Core rule:
     · Permissions decide WHAT a user can do.
     · Org tree position decides WHO a user can see.
   Enforced server-side only — clients never receive hidden users.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Leader grants — the scoped permission set a leader receives ─────────────
   Applied to anyone detected as a leader (see _isLeader), on top of their role
   defaults. Deliberately does NOT include org-wide admin powers (manage_*,
   delete_members, manage_settings) — leaders manage their subtree, not the org. */
const LEADER_GRANTS = {
  view_team:        true,
  review_checkins:  true,
  view_insights:    true,
  assign_scenarios: true,
  view_reports:     true,
  view_members:     true,
};

/* ── _isLeader — robust leadership detection across all three structures ──────
   A user is a leader if ANY of these hold:
     1. they lead >=1 org node   (orgNodes[].leaderIds / user.leadershipNodeIds)
     2. they supervise >=1 user  (legacy supervisorId tree)
     3. they lead >=1 group      (orgGroups[].leadIds)
     4. they SIT IN A NODE THAT HAS SUB-NODES (hierarchy leadership) — i.e. their
        node tier is above another. This makes the tree intuitive: a person in
        "Coach" (which has child "Player") leads the Player branch automatically,
        without anyone having to tick a separate "leader" box.
   This is what fixes "I'm a leader but the app treats me as a member": node
   leaderIds are only ever set by manually editing a node, so orgs built via
   onboarding (which sets supervisorId) were never recognized as having leaders. */
function _isLeader(orgCode, userId) {
  const user = orgUsers[orgCode]?.[userId];
  if (!user) return false;
  if ((user.leadershipNodeIds || []).length) return true;
  const users = orgUsers[orgCode] || {};
  if (Object.values(users).some(u => u.id !== userId && u.supervisorId === userId)) return true;
  if ((orgGroups[orgCode] || []).some(g => (g.leadIds || []).includes(userId))) return true;
  if (_leadsViaHierarchy(orgCode, userId)) return true;
  return false;
}

/* A user leads via hierarchy if any node they belong to (member or leader) has
   at least one sub-node beneath it — their tier sits above another. */
function _leadsViaHierarchy(orgCode, userId) {
  const nodes = orgNodes[orgCode] || {};
  for (const nid of getUserNodeIds(orgCode, userId)) {
    if ((nodes[nid]?.childNodeIds || []).length) return true;
  }
  return false;
}

/* ── _effectivePermissions — single source of truth for what a user can do ────
   roleDefaults -> leader grants (if a leader) -> explicit per-user overrides.
   Used by /api/auth/me, _userHasPerm, and requirePermission so the client and
   the server can never disagree about a user's permissions. */
function _effectivePermissions(orgCode, userId) {
  const user = orgUsers[orgCode]?.[userId];
  if (!user) return {};
  const roleDefaults = _resolveRoleDefaults(user.role);
  const leaderGrants = _isLeader(orgCode, userId) ? LEADER_GRANTS : {};
  const explicit     = userPermissions[orgCode]?.[userId] || {};
  return { ...roleDefaults, ...leaderGrants, ...explicit };
}

/* ── Internal: resolve a single permission for any user ─────────────────── */
function _userHasPerm(orgCode, userId, perm) {
  const user = orgUsers[orgCode]?.[userId];
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return _effectivePermissions(orgCode, userId)[perm] === true;
}

/* ── Get all node IDs where a user appears (as member OR leader) ────────── */
function getUserNodeIds(orgCode, userId) {
  const nodes = orgNodes[orgCode] || {};
  return Object.values(nodes)
    .filter(n =>
      (n.memberIds || []).includes(userId) ||
      (n.leaderIds || []).includes(userId)
    )
    .map(n => n.nodeId);
}

/* ── Collect a node + all descendant node IDs (BFS, cycle-safe) ─────────── */
function getDescendantNodeIds(orgCode, rootNodeId) {
  const nodes   = orgNodes[orgCode] || {};
  const visited = new Set();
  const queue   = [rootNodeId];
  while (queue.length) {
    const curr = queue.shift();
    if (visited.has(curr)) continue;
    visited.add(curr);
    const node = nodes[curr];
    if (node?.childNodeIds) node.childNodeIds.forEach(c => queue.push(c));
  }
  return [...visited];
}

/* ── Sync user.assignedNodeIds / user.leadershipNodeIds on node membership changes ──
 *  Called whenever memberIds or leaderIds on a node change (PUT or DELETE).
 *  Keeps the per-user cached arrays in sync with the node stores so that
 *  getVisibleUserIds() can use O(1) lookups instead of full scans.
 * ──────────────────────────────────────────────────────────────────────── */
function _syncUserNodeArrays(orgCode, nodeId, oldMemberIds, newMemberIds, oldLeaderIds, newLeaderIds) {
  const users = orgUsers[orgCode];
  if (!users) return;
  const add    = (arr, id) => { if (!arr.includes(id)) arr.push(id); };
  const remove = (arr, id) => { const i = arr.indexOf(id); if (i !== -1) arr.splice(i, 1); };

  // Members removed
  (oldMemberIds || []).filter(id => !(newMemberIds || []).includes(id)).forEach(uid => {
    if (users[uid]) { if (!users[uid].assignedNodeIds) users[uid].assignedNodeIds = []; remove(users[uid].assignedNodeIds, nodeId); }
  });
  // Members added
  (newMemberIds || []).filter(id => !(oldMemberIds || []).includes(id)).forEach(uid => {
    if (users[uid]) { if (!users[uid].assignedNodeIds) users[uid].assignedNodeIds = []; add(users[uid].assignedNodeIds, nodeId); }
  });
  // Leaders removed
  (oldLeaderIds || []).filter(id => !(newLeaderIds || []).includes(id)).forEach(uid => {
    if (users[uid]) { if (!users[uid].leadershipNodeIds) users[uid].leadershipNodeIds = []; remove(users[uid].leadershipNodeIds, nodeId); }
  });
  // Leaders added
  (newLeaderIds || []).filter(id => !(oldLeaderIds || []).includes(id)).forEach(uid => {
    if (users[uid]) { if (!users[uid].leadershipNodeIds) users[uid].leadershipNodeIds = []; add(users[uid].leadershipNodeIds, nodeId); }
  });
}

/* ── Derive user.assignedNodeIds / user.leadershipNodeIds from orgNodes ──
 *  Run once at startup after _loadAllStores() to initialise the cached
 *  arrays on every user record — safe to run repeatedly (always rebuilt fresh).
 * ──────────────────────────────────────────────────────────────────────── */
function _backfillUserNodeIds() {
  let userCount = 0;
  for (const [orgCode, nodes] of Object.entries(orgNodes)) {
    const users = orgUsers[orgCode];
    if (!users) continue;
    // Reset caches
    Object.values(users).forEach(u => { u.assignedNodeIds = []; u.leadershipNodeIds = []; });
    // Rebuild from node membership
    Object.values(nodes).forEach(node => {
      (node.memberIds || []).forEach(uid => {
        if (users[uid]) {
          if (!users[uid].assignedNodeIds.includes(node.nodeId)) users[uid].assignedNodeIds.push(node.nodeId);
        }
      });
      (node.leaderIds || []).forEach(uid => {
        if (users[uid]) {
          if (!users[uid].leadershipNodeIds.includes(node.nodeId)) users[uid].leadershipNodeIds.push(node.nodeId);
        }
      });
    });
    userCount += Object.keys(users).length;
  }
  console.log(`[startup] _backfillUserNodeIds: processed ${userCount} user records`);
}

/* ── Collect all users below a user in the legacy supervisorId tree (BFS) ──── */
function getSupervisedSubtreeIds(orgCode, userId) {
  const users = orgUsers[orgCode] || {};
  const childrenOf = {};
  Object.values(users).forEach(u => {
    if (u.supervisorId) (childrenOf[u.supervisorId] = childrenOf[u.supervisorId] || []).push(u.id);
  });
  const out   = new Set();
  const queue = [...(childrenOf[userId] || [])];
  while (queue.length) {
    const id = queue.shift();
    if (out.has(id)) continue;
    out.add(id);
    (childrenOf[id] || []).forEach(c => queue.push(c));
  }
  return [...out];
}

/* ── Get node IDs where a user is a LEADER (used for visibility scoping) ── */
function getUserLeaderNodeIds(orgCode, userId) {
  const user = orgUsers[orgCode]?.[userId];
  if (!user) return [];
  // Use cached array if populated; fall back to full scan for safety
  if (user.leadershipNodeIds?.length) return [...user.leadershipNodeIds];
  const nodes = orgNodes[orgCode] || {};
  return Object.values(nodes)
    .filter(n => (n.leaderIds || []).includes(userId))
    .map(n => n.nodeId);
}

/* ── Compute the set of user IDs visible to the requesting user ─────────── *
 *
 *  Visibility rules (evaluated in order):
 *  1. SuperAdmin                    → everyone in the org
 *  2. Has edit_members permission   → everyone (full People management access)
 *  3. Has view_team permission      → all users in own tree node(s) + descendants
 *     3a. Has view_team but no node → only self (unassigned leader)
 *  4. Everyone else                 → only self
 *
 * ──────────────────────────────────────────────────────────────────────── */
function getVisibleUserIds(orgCode, requestingUserId) {
  const user = orgUsers[orgCode]?.[requestingUserId];
  if (!user) return [];

  // Rule 1 — SuperAdmin sees all
  if (user.role === 'superadmin') {
    return Object.keys(orgUsers[orgCode] || {});
  }

  // Rule 2 — Full member management permission sees all
  if (_userHasPerm(orgCode, requestingUserId, 'edit_members')) {
    return Object.keys(orgUsers[orgCode] || {});
  }

  // Rule 3 — view_team: see everyone below this user, composed across ALL three
  // leadership structures (node subtree + legacy supervisor subtree + led groups)
  // so visibility matches _isLeader detection regardless of how the org was built.
  if (_userHasPerm(orgCode, requestingUserId, 'view_team')) {
    const visibleIds = new Set([requestingUserId]); // always include self

    const allNodes = orgNodes[orgCode] || {};
    const addPeople = nid => {
      const n = allNodes[nid];
      if (!n) return;
      (n.memberIds || []).forEach(id => visibleIds.add(id));
      (n.leaderIds || []).forEach(id => visibleIds.add(id));
    };

    // (a) Node subtrees this user LEADS — sees that node + all descendants
    getUserLeaderNodeIds(orgCode, requestingUserId).forEach(nid =>
      getDescendantNodeIds(orgCode, nid).forEach(addPeople)
    );

    // (a2) Hierarchy leadership — for any node this user belongs to, see the
    // people in its DESCENDANT nodes (the tiers below), but not their own peers.
    getUserNodeIds(orgCode, requestingUserId).forEach(nid =>
      getDescendantNodeIds(orgCode, nid).forEach(d => { if (d !== nid) addPeople(d); })
    );

    // (b) Legacy supervisor subtree (everyone who reports up to this user)
    getSupervisedSubtreeIds(orgCode, requestingUserId).forEach(id => visibleIds.add(id));

    // (c) Members of any group this user leads
    (orgGroups[orgCode] || [])
      .filter(g => (g.leadIds || []).includes(requestingUserId))
      .forEach(g => (g.memberIds || []).forEach(id => visibleIds.add(id)));

    return [...visibleIds];
  }

  // Rule 4 — standard member: only self
  return [requestingUserId];
}

/* ── GET /api/workspace/visible-members ──────────────────────────────────
 *
 *  Returns the subset of org users the requesting user is allowed to see.
 *  Fields per member: userId, name, email, role, status, passwordSet,
 *    profileComplete, nodeIds, latestCheckin (snippet).
 *  Never exposes passwordHash or any user outside the visible set.
 *
 * ──────────────────────────────────────────────────────────────────────── */
app.get('/api/workspace/visible-members', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const user = orgUsers[code]?.[userId];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const visibleIds = getVisibleUserIds(code, userId);
  const myNodeIds  = getUserNodeIds(code, userId);

  console.log(
    `[VISIBILITY] userId=${userId} role=${user.role} ` +
    `nodes=${myNodeIds.join(',') || 'none'} visibleCount=${visibleIds.length}`
  );

  // Build reverse index: userId → nodeIds (from the whole tree — only used
  // for users who are already in the visible set, so no data leakage)
  const allNodes   = orgNodes[code] || {};
  const userNodeMap = {};
  Object.values(allNodes).forEach(n => {
    [...(n.memberIds || []), ...(n.leaderIds || [])].forEach(uid => {
      if (!userNodeMap[uid]) userNodeMap[uid] = [];
      if (!userNodeMap[uid].includes(n.nodeId)) userNodeMap[uid].push(n.nodeId);
    });
  });

  const members = visibleIds
    .map(uid => {
      const u = orgUsers[code]?.[uid];
      if (!u) return null;

      // Latest check-in — try userId key first, then legacy name key
      const ckList =
        memberCheckins[userKey(code, uid)] ||
        memberCheckins[memberKey(code, u.name || '')] ||
        [];
      const latest = ckList.length ? ckList[ckList.length - 1] : null;
      const latestCheckin = latest
        ? {
            date:      latest.date  || null,
            mood:      latest.mood  || null,
            moodLabel: latest.moodLabel || null,
            text:      (latest.text || '').slice(0, 120), // snippet — not the full entry
            ts:        latest.ts    || null,
          }
        : null;

      return {
        userId:          u.id,
        name:            u.name            || '',
        email:           u.email           || '',
        role:            u.role            || 'member',
        status:          u.status          || 'active',
        passwordSet:     u.passwordSet     !== false,
        profileComplete: u.profileComplete === true,
        nodeIds:         userNodeMap[uid]  || [],
        latestCheckin,
      };
    })
    .filter(Boolean);

  res.json({
    ok: true,
    members,
    requestingUserId: userId,
    visibleCount:     members.length,
  });
});

/* ── GET /api/workspace/team-insights ────────────────────────────────────
 *
 *  Aggregated snapshot for anyone with view_insights or review_checkins.
 *  Uses getVisibleUserIds() — same scoping rules as visible-members.
 *
 *  Returns:
 *    visibleCount      — total members in scope
 *    activeThisWeek    — members with ≥1 check-in since Monday
 *    avgMood           — average mood across this-week check-ins (1–5) | null
 *    needsAttention    — [ { userId, name, reason } ] (capped at 5)
 *    recommendedAction — plain-text suggestion | null
 *    notEnoughData     — true when <3 active check-ins this week
 *    canReviewCheckins — whether caller has full check-in text access
 *
 * ──────────────────────────────────────────────────────────────────────── */
app.get('/api/workspace/team-insights', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;

  const canViewInsights   = _userHasPerm(code, userId, 'view_insights');
  const canReviewCheckins = _userHasPerm(code, userId, 'review_checkins');
  if (!canViewInsights && !canReviewCheckins) {
    return res.status(403).json({ error: 'Permission denied: view_insights or review_checkins required' });
  }

  const visibleIds   = getVisibleUserIds(code, userId);
  const visibleCount = visibleIds.length;

  if (visibleCount === 0) {
    return res.json({ ok: true, visibleCount: 0, activeThisWeek: 0, avgMood: null,
                      needsAttention: [], recommendedAction: null, notEnoughData: true, canReviewCheckins });
  }

  // Start-of-week: most recent Monday at 00:00 local
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun … 6=Sat
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  let activeThisWeek = 0;
  let moodSum = 0;
  let moodCount = 0;
  const needsAttention = [];

  visibleIds.forEach(uid => {
    const u = orgUsers[code]?.[uid];
    if (!u || u.role === 'superadmin') return;

    const ckList =
      memberCheckins[userKey(code, uid)] ||
      memberCheckins[memberKey(code, u.name || '')] ||
      [];

    // Check-ins from this calendar week
    const thisWeek = ckList.filter(c => {
      const ts = c.ts ? new Date(c.ts) : null;
      return ts && ts >= monday;
    });

    if (thisWeek.length > 0) {
      activeThisWeek++;
      thisWeek.forEach(c => { if (c.mood) { moodSum += c.mood; moodCount++; } });
    }

    // Needs-attention heuristics
    const lastCk = ckList.length ? ckList[ckList.length - 1] : null;
    const daysSince = lastCk?.ts
      ? Math.floor((Date.now() - new Date(lastCk.ts).getTime()) / 86400000)
      : null;

    if (daysSince !== null && daysSince >= 7) {
      needsAttention.push({ userId: uid, name: u.name || '', reason: `No check-in for ${daysSince} days` });
    } else if (thisWeek.length > 0) {
      const weekMoods = thisWeek.filter(c => c.mood).map(c => c.mood);
      if (weekMoods.length) {
        const weekAvg = weekMoods.reduce((s, v) => s + v, 0) / weekMoods.length;
        if (weekAvg < 2.5) needsAttention.push({ userId: uid, name: u.name || '', reason: 'Low mood this week' });
      }
    }
  });

  const avgMood      = moodCount > 0 ? Math.round((moodSum / moodCount) * 10) / 10 : null;
  const notEnoughData = activeThisWeek < 3;

  let recommendedAction = null;
  if (needsAttention.length > 0) {
    recommendedAction = `${needsAttention.length} team member${needsAttention.length !== 1 ? 's' : ''} may need a direct conversation — check in personally or assign a targeted assessment.`;
  } else if (activeThisWeek < Math.ceil(visibleCount * 0.5)) {
    recommendedAction = `Fewer than half your team has checked in this week. Consider prompting engagement.`;
  } else if (avgMood !== null && avgMood >= 3.8) {
    recommendedAction = `Team energy is strong this week. A good moment to assign a stretch assessment.`;
  }

  console.log(`[TEAM-INSIGHTS] userId=${userId} visible=${visibleCount} active=${activeThisWeek} mood=${avgMood} attn=${needsAttention.length}`);

  res.json({
    ok: true,
    visibleCount,
    activeThisWeek,
    avgMood,
    needsAttention:    needsAttention.slice(0, 5),
    commonThemes:      null, // Phase 8
    recommendedAction,
    notEnoughData,
    canReviewCheckins,
  });
});

/* ── GET /api/intelligence/watch — PROACTIVE early-warning for a leader ─────────
   The "catch it before it becomes a problem" surface. Runs the kernel's pattern
   detection over the people this leader is responsible for and splits findings:
     • emerging   — medium/low severity: worth a look BEFORE it grows
     • attention  — high severity: needs a conversation now
   Each item is privacy-safe (contentless "why" + a care-first suggested action;
   private context is only ever flagged, never shown). Leader-scoped. */
app.get('/api/intelligence/watch', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Leaders only' });
  const ids = getVisibleUserIds(code, userId).filter(id => id !== userId);
  const now = Date.now();
  const emerging = [], attention = [], rising = [];
  ids.forEach(id => {
    const u = orgUsers[code]?.[id];
    if (!u || u.role === 'superadmin') return;
    let m = null; try { m = _buildMemberIntelInput(code, u, now); } catch (_) { m = null; }
    const findings = m ? intel.detectPatterns(m) : [];
    if (!findings.length) return;
    const item = intel.composeBriefingItem(m, findings);
    if (!item) return;
    const row = { memberId: item.memberId, name: item.name, why: item.whyNow, action: item.recommendedAction, careFlag: item.careFlag, patternType: item.patternType, severity: item.severity };
    // Positive momentum is worth surfacing too (recognise it, don't just fight fires).
    if (/improv|recover/i.test(item.patternType)) {
      row.factors = _personStrengths(code, id);   // WHAT'S working (grounded, privacy-safe)
      rising.push(row);
    }
    else if (item.severity === 'high') attention.push(row);
    else emerging.push(row);
  });
  res.json({ ok: true, scanned: ids.length, emerging: emerging.slice(0, 8), attention: attention.slice(0, 8), rising: rising.slice(0, 6) });
});

/* A person's recurring strengths, pulled from their assessment signals — the
   grounded "what's working" behind momentum (categorical tokens, never content). */
function _personStrengths(code, id) {
  const out = {};
  (orgSignals[code] || []).forEach(s => {
    if (s.subjectId !== id || s.source !== 'assessment') return;
    const mm = (s.valueText || '').match(/Strengths:\s*([^·]+)/i);
    if (mm) mm[1].split(',').forEach(x => { const v = x.trim(); if (v) out[v.toLowerCase()] = (out[v.toLowerCase()] || 0) + 1; });
  });
  return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
}

/* GET /api/intelligence/success — the flip side of the watch: the org's SUCCESS
   patterns. Aggregates what's recurring among the people trending up, so a leader
   can scale what works, not just fix what's broken. Leader-scoped, contentless. */
app.get('/api/intelligence/success', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Leaders only' });
  const ids = getVisibleUserIds(code, userId).filter(id => id !== userId);
  const now = Date.now();
  const risingPeople = [];
  const factorCount = {};
  ids.forEach(id => {
    const u = orgUsers[code]?.[id];
    if (!u || u.role === 'superadmin') return;
    let m = null; try { m = _buildMemberIntelInput(code, u, now); } catch (_) {}
    const findings = m ? intel.detectPatterns(m) : [];
    if (!findings.some(f => /improv|recover/i.test(f.type))) return;
    const factors = _personStrengths(code, id);
    factors.forEach(f => { factorCount[f] = (factorCount[f] || 0) + 1; });
    risingPeople.push({ memberId: id, name: u.name || '', factors });
  });
  const commonFactors = Object.entries(factorCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([factor, count]) => ({ factor, count }));
  res.json({ ok: true, rising: risingPeople.slice(0, 8), commonFactors });
});

/* A person's current DIRECTION, reduced to one of up / down / steady from the
   kernel's pattern detection. The shared read used by the assessment-learning
   loop — "did the people who did this assessment get better or worse after?" */
function _memberTrajDir(code, u, now) {
  let m = null; try { m = _buildMemberIntelInput(code, u, now); } catch (_) { m = null; }
  const pats = m ? intel.detectPatterns(m) : [];
  if (!pats.length) return 'steady';
  if (pats.some(p => /improv|recover/i.test(p.type))) return 'up';
  if (pats.some(p => p.severity === 'high' || /drop|concern|decline|shift/i.test(p.type))) return 'down';
  return 'steady';
}

/* ── The assessment-learning loop ──────────────────────────────────────────────
   Assessments and planning are the core that levels an org up or down, so their
   OUTCOMES have to feed the kernel's memory. This correlates each returned
   assessment (grouped by title) with where its assignees have trended SINCE, plus
   the reasoning scores it produced — so IntelliQ can say "repeat this, it lines up
   with people improving" or "revisit this, it preceded a drop". Honest and
   correlational, never causal; leader-scoped over the caller's own people. Returns
   per-title outcome objects the endpoint and the summaries both read. */
function _assessmentOutcomes(code, userId, now) {
  const visible = new Set(getVisibleUserIds(code, userId));
  const returned = (assessmentAssignments[code] || [])
    .filter(a => a.status === 'returned' && visible.has(a.assigneeId));
  const dirCache = {};
  const dirOf = (id) => {
    if (dirCache[id] !== undefined) return dirCache[id];
    const u = orgUsers[code]?.[id];
    return (dirCache[id] = u ? _memberTrajDir(code, u, now) : 'steady');
  };
  const groups = {};
  returned.forEach(a => {
    const key = (a.title || 'Untitled').trim().toLowerCase();
    const g = groups[key] || (groups[key] = { title: a.title || 'Untitled', scores: [], people: {}, lastReturnedAt: null, n: 0 });
    g.n += 1;
    if (Number.isFinite(a.score)) g.scores.push(a.score);
    if (!g.lastReturnedAt || (a.returnedAt && a.returnedAt > g.lastReturnedAt)) g.lastReturnedAt = a.returnedAt || g.lastReturnedAt;
    const name = a.assigneeName || orgUsers[code]?.[a.assigneeId]?.name || 'Someone';
    g.people[a.assigneeId] = { name, dir: dirOf(a.assigneeId) };
  });
  const items = Object.values(groups).map(g => {
    const ppl = Object.values(g.people);
    const rising = ppl.filter(p => p.dir === 'up').length;
    const falling = ppl.filter(p => p.dir === 'down').length;
    const avgScore = g.scores.length ? Math.round(g.scores.reduce((a, b) => a + b, 0) / g.scores.length) : null;
    // A composite verdict: direction of the people who did it, with score as tiebreak.
    let verdict = 'neutral';
    if (rising > falling || (rising === falling && avgScore != null && avgScore >= 70)) verdict = 'working';
    else if (falling > rising || (rising === falling && avgScore != null && avgScore > 0 && avgScore < 50)) verdict = 'revisit';
    return {
      title: g.title, n: g.n, people: ppl.length, avgScore, lastReturnedAt: g.lastReturnedAt,
      rising, falling, net: rising - falling, verdict,
      who: ppl.map(p => p.name).slice(0, 8),
    };
  });
  // Rank: strongest signal first (biggest net, then most people, then recency).
  const rank = (x) => Math.abs(x.net) * 100 + x.people * 10 + (x.lastReturnedAt ? 1 : 0);
  const working = items.filter(i => i.verdict === 'working').sort((a, b) => rank(b) - rank(a));
  const revisit = items.filter(i => i.verdict === 'revisit').sort((a, b) => rank(b) - rank(a));
  return { working, revisit, total: returned.length };
}

/* One short, honest sentence explaining WHY an outcome item is worth repeating or
   revisiting — the when/who/how the user asked for, from real numbers only. */
function _assessmentWhy(it) {
  const when = it.lastReturnedAt ? new Date(it.lastReturnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently';
  const whoStr = it.who.length <= 3 ? it.who.join(', ') : `${it.who.slice(0, 3).join(', ')} and ${it.who.length - 3} more`;
  const scorePart = it.avgScore != null ? ` Average reasoning score ${it.avgScore}.` : '';
  if (it.verdict === 'working') {
    const dir = it.rising ? `${it.rising} of them have trended up since` : 'scores held strong';
    return `${whoStr} completed "${it.title}" (last on ${when}); ${dir}.${scorePart} It lines up with improvement — worth repeating.`;
  }
  const dir = it.falling ? `${it.falling} have trended down since` : 'scores came in low';
  return `${whoStr} completed "${it.title}" (last on ${when}); ${dir}.${scorePart} It preceded a dip — worth revisiting how it's run.`;
}

/* Per-member assessment nudges — the same learning, but about ONE person, for the
   individual summary: which assessments turned into a strength for them (repeat) and
   which lined up with a dip (revisit). Short, grounded, correlational. */
function _memberAssessmentNudges(code, memberId, now) {
  const u = orgUsers[code]?.[memberId];
  if (!u) return [];
  const dir = _memberTrajDir(code, u, now);
  const mine = (assessmentAssignments[code] || [])
    .filter(a => a.status === 'returned' && a.assigneeId === memberId);
  if (!mine.length) return [];
  const byTitle = {};
  mine.forEach(a => {
    const g = byTitle[a.title] || (byTitle[a.title] = { title: a.title, scores: [], last: null, n: 0 });
    g.n += 1;
    if (Number.isFinite(a.score)) g.scores.push(a.score);
    if (!g.last || (a.returnedAt && a.returnedAt > g.last)) g.last = a.returnedAt || g.last;
  });
  const first = (u.name || 'They').split(' ')[0];
  const out = [];
  Object.values(byTitle).forEach(g => {
    const avg = g.scores.length ? Math.round(g.scores.reduce((a, b) => a + b, 0) / g.scores.length) : null;
    const when = g.last ? new Date(g.last).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently';
    if (dir === 'up' && (avg == null || avg >= 65)) {
      out.push({ tone: 'repeat', title: g.title, text: `"${g.title}" landed well for ${first}${avg != null ? ` (score ${avg})` : ''} and they've trended up since ${when} — worth repeating.` });
    } else if (dir === 'down' || (avg != null && avg < 45)) {
      out.push({ tone: 'revisit', title: g.title, text: `"${g.title}" (last ${when}${avg != null ? `, score ${avg}` : ''}) lined up with a dip for ${first} — worth revisiting how it's run.` });
    }
  });
  return out.slice(0, 3);
}

/* GET /api/intelligence/whats-working — the assessment-outcome report for a leader:
   which assessments line up with people improving (repeat these) and which precede
   a drop (revisit these), each with a grounded, correlational "why". Leader-scoped;
   names are the leader's own team, scores are legitimate capability signals. */
app.get('/api/intelligence/whats-working', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Leaders only' });
  const { working, revisit, total } = _assessmentOutcomes(code, userId, Date.now());
  res.json({
    ok: true,
    total,
    working: working.slice(0, 6).map(i => ({ title: i.title, n: i.n, people: i.people, avgScore: i.avgScore, rising: i.rising, falling: i.falling, lastReturnedAt: i.lastReturnedAt, why: _assessmentWhy(i) })),
    revisit: revisit.slice(0, 6).map(i => ({ title: i.title, n: i.n, people: i.people, avgScore: i.avgScore, rising: i.rising, falling: i.falling, lastReturnedAt: i.lastReturnedAt, why: _assessmentWhy(i) })),
    note: 'Correlational, not proof — these are patterns worth acting on, checked against real trajectories and scores.',
  });
});

/* ── The Discoveries engine ────────────────────────────────────────────────────
   The leap past "what happened" and "what to do next": what has this ORGANISATION
   learned about how IT learns? Not recommendations about a person — discoveries
   about context. It segments real outcomes by tenure, approach, and team, and only
   surfaces a finding when the effect is consistent AND the sample is big enough to
   mean something. Honest and correlational throughout; contentless. Leader-scoped.
   Examples it can find: "new people respond to recognition over correction in their
   first 90 days"; "this reflection lines up with improvement specifically in the
   U18s". These are the seeds of the org's own research. */
function _interventionCategory(i) {
  const a = (i.action || '').toLowerCase();
  if (i.patternType === 'quiet_improvement' || i.patternType === 'recovering' || /recogni|acknowledge|praise|celebrat|nice work/.test(a)) return 'recognition';
  return 'corrective';
}
function _orgDiscoveries(code, userId, now) {
  const out = [];
  const visible = new Set(getVisibleUserIds(code, userId));
  const users = orgUsers[code] || {};

  // A) Tenure × approach — do NEW people respond differently to recognition vs
  //    corrective steps than ESTABLISHED people? (measured intervention outcomes)
  const measured = (orgInterventions[code] || []).filter(i =>
    i.status === 'completed' && i.targetMemberId && visible.has(i.targetMemberId) &&
    (i.recordedOutcome || i.outcome?.status === 'measured'));
  const seg = {};   // `${tenure}_${cat}` → { pos, total }
  measured.forEach(i => {
    const u = users[i.targetMemberId]; if (!u || !u.createdAt) return;
    const tenureDays = (new Date(i.createdAt).getTime() - new Date(u.createdAt).getTime()) / 86400000;
    if (!Number.isFinite(tenureDays)) return;
    const tenure = tenureDays < 90 ? 'new' : 'established';
    const cat = _interventionCategory(i);
    const oc = i.recordedOutcome || i.outcome?.outcome;
    const k = `${tenure}_${cat}`;
    (seg[k] = seg[k] || { pos: 0, total: 0 }); seg[k].total++; if (oc === 'positive') seg[k].pos++;
  });
  const MIN_SEG = 4;
  const rate = k => (seg[k] && seg[k].total >= MIN_SEG) ? Math.round(seg[k].pos / seg[k].total * 100) : null;
  const nRec = rate('new_recognition'), nCorr = rate('new_corrective');
  if (nRec != null && nCorr != null && Math.abs(nRec - nCorr) >= 20) {
    const better = nRec >= nCorr ? 'recognition' : 'corrective steps';
    const worse  = nRec >= nCorr ? 'corrective steps' : 'recognition';
    out.push({
      area: 'First 90 days',
      statement: `New people respond better to ${better} than ${worse} in their first 90 days — ${better} helped ${Math.max(nRec, nCorr)}% of the time vs ${Math.min(nRec, nCorr)}%.`,
      basis: `${seg['new_recognition'].total + seg['new_corrective'].total} measured steps on people in their first 90 days`,
      confidence: (seg['new_recognition'].total + seg['new_corrective'].total) >= 12 ? 'emerging' : 'tentative',
    });
  }

  // B) What works WHERE — an assessment that lines up with improvement in a specific
  //    team (not org-wide). Same correlation as whats-working, but per node.
  const nodes = orgNodes[code] || {};
  Object.values(nodes).forEach(node => {
    const memberIds = new Set((node.memberIds || []).filter(id => visible.has(id)));
    if (memberIds.size < 5) return;
    const returned = (assessmentAssignments[code] || []).filter(a => a.status === 'returned' && memberIds.has(a.assigneeId));
    const byTitle = {};
    returned.forEach(a => { (byTitle[a.title] = byTitle[a.title] || []).push(a); });
    Object.entries(byTitle).forEach(([title, list]) => {
      const ids = [...new Set(list.map(a => a.assigneeId))];
      if (list.length < 5 || ids.length < 4) return;
      let up = 0, down = 0;
      ids.forEach(id => { const u = users[id]; const d = u ? _memberTrajDir(code, u, now) : 'steady'; if (d === 'up') up++; else if (d === 'down') down++; });
      if (up >= 3 && up > down * 2) {
        out.push({ area: node.name, statement: `"${title}" lines up with improvement specifically in the ${node.name} — ${up} of ${ids.length} who completed it are trending up.`, basis: `${list.length} completions in ${node.name}`, confidence: up >= 5 ? 'emerging' : 'tentative' });
      } else if (down >= 3 && down > up * 2) {
        out.push({ area: node.name, statement: `"${title}" has lined up with decline in the ${node.name} — ${down} of ${ids.length} who did it are trending down. Worth checking timing or fit here.`, basis: `${list.length} completions in ${node.name}`, confidence: down >= 5 ? 'emerging' : 'tentative' });
      }
    });
  });

  // C) Recognition vs correction, org-wide — the simplest, most robust discovery.
  const allRec = (seg['new_recognition']?.total || 0) + (seg['established_recognition']?.total || 0);
  const allCorr = (seg['new_corrective']?.total || 0) + (seg['established_corrective']?.total || 0);
  if (allRec >= MIN_SEG && allCorr >= MIN_SEG) {
    const recPos = (seg['new_recognition']?.pos || 0) + (seg['established_recognition']?.pos || 0);
    const corrPos = (seg['new_corrective']?.pos || 0) + (seg['established_corrective']?.pos || 0);
    const recRate = Math.round(recPos / allRec * 100), corrRate = Math.round(corrPos / allCorr * 100);
    if (Math.abs(recRate - corrRate) >= 15 && !out.some(d => d.area === 'First 90 days')) {
      out.push({ area: 'Across the org', statement: `${recRate >= corrRate ? 'Recognition' : 'Corrective steps'} have worked better here overall — ${Math.max(recRate, corrRate)}% vs ${Math.min(recRate, corrRate)}%.`, basis: `${allRec + allCorr} measured steps`, confidence: 'emerging' });
    }
  }

  return out.slice(0, 6);
}

/* GET /api/intelligence/discoveries — how this org learns. Leader-scoped, honest,
   correlational; each finding carries the numbers and sample behind it. */
app.get('/api/intelligence/discoveries', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Leaders only' });
  let discoveries = [];
  try { discoveries = _orgDiscoveries(code, userId, Date.now()); } catch (_) { discoveries = []; }
  // Scope reflects who they manage — a director sees the whole org; a team lead sees
  // their part of it, so their discoveries genuinely differ.
  const visibleN = getVisibleUserIds(code, userId).length;
  const totalN = Object.keys(orgUsers[code] || {}).length || 1;
  const scope = visibleN >= totalN * 0.85 ? 'organisation' : 'team';
  res.json({
    ok: true, scope, discoveries,
    note: discoveries.length
      ? 'How your organisation learns — correlational patterns from real outcomes, not proof. Each needs a human read of when, where, and why.'
      : 'Not enough outcome history yet to spot how your organisation learns. As interventions and assessments accumulate, discoveries appear here.',
  });
});

/* ── POST /api/intelligence/prepare — "here's what I've already drafted" ────────
   The leap from copilot to assistance: for a flagged person, IntelliQ DRAFTS a
   concrete, supportive intervention (a short reflection the leader can send), so
   the leader's only job is approve or edit. Nothing is saved or sent here — it's
   a draft. Leader-scoped; the person is never told they were "flagged". */
app.post('/api/intelligence/prepare', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Leaders only' });
  const rawKind = req.body?.kind;
  const kind = ['recognition', 'replicate', 'plan'].includes(rawKind) ? rawKind : 'support';

  // "Plan" is team-wide and forward-looking — the leader asked IntelliQ to put
  // together a proactive session/plan for the week around a THEME (a shared weak
  // area, a busy stretch ahead, or reworking something that's not landing). No
  // single subject; it delivers to the whole team like the replicate flow.
  if (kind === 'plan') {
    const theme = String(req.body?.theme || '').slice(0, 120).trim();
    const fallback = {
      title: theme ? `This week's focus: ${theme}` : 'A proactive plan for the week',
      description: `A short, shared plan to get ahead of ${theme || `what the ${_vc(code, 'group')} is facing this week`} — everyone reflects, then we act on it together.`,
      fields: [{ label: `What's your read on ${theme || 'this'} right now?`, hint: '' }, { label: 'One thing that would help you this week', hint: '' }],
      message: `Getting ahead of ${theme || 'the week'} — take two minutes so we can plan around it together.`,
      rationale: `Being proactive about ${theme || 'this'} now beats reacting to it later.`,
    };
    let out = null;
    if (ai.enabled()) {
      try {
        const system = [`${privacy.GATE_DIRECTIVE}\n\nYou are IntelliQ helping a leader be PROACTIVE — drafting a short, forward-looking plan the whole team engages with to get ahead of a theme (a shared development area, a busy period coming up, or a process that needs reworking). No names, no emojis. Return JSON only: {"title": string(<=60), "description": string(1-2 sentences), "fields": array of 1-3 {"label","hint"}, "message": string(a warm 1-2 sentence note to the team), "rationale": string(one sentence to the LEADER on why acting now helps)}.`, _domainDirective(code)].filter(Boolean).join('\n\n');
        out = await ai.completeJSON({ tier: 'reason', system, user: `Theme to plan around: ${theme || '(general week-ahead readiness)'}.`, maxTokens: 500, schema: ['title', 'message'] });
      } catch (_) { out = null; }
    }
    const d = (out && out.title) ? out : fallback;
    return res.json({
      ok: true, aiUsed: !!(out && out.title), toTeam: true,
      draft: {
        title: String(d.title || fallback.title).slice(0, 120),
        description: String(d.description || '').slice(0, 1200),
        fields: (Array.isArray(d.fields) ? d.fields : fallback.fields).slice(0, 5).map(f => ({ label: String(f?.label || '').slice(0, 160), hint: String(f?.hint || '').slice(0, 300) })).filter(f => f.label),
        message: String(d.message || fallback.message).slice(0, 600),
        rationale: String(d.rationale || fallback.rationale).slice(0, 300),
      },
    });
  }

  // "Replicate" is team-wide — build a reflection that helps everyone grow a
  // strength that's working for someone who's rising. No single subject.
  if (kind === 'replicate') {
    const factor = String(req.body?.factor || '').slice(0, 80).trim();
    const sourceName = String(req.body?.sourceName || '').slice(0, 80).trim();
    const first = sourceName ? sourceName.split(' ')[0] : `someone on the ${_vc(code, 'group')}`;
    let out = null;
    const fallback = {
      title: factor ? `Building on what's working: ${factor}` : 'Building on what\'s working',
      description: `A short reflection for everyone on how to grow ${factor || `the habits that are helping the ${_vc(code, 'group')} right now`}.`,
      fields: [{ label: `Where do you already do this well?`, hint: '' }, { label: `One way you could do more of it`, hint: '' }],
      message: `We've seen ${factor || 'some real strengths'} making a difference lately — let's build it across the ${_vc(code, 'group')}.`,
      rationale: `${first}'s momentum is partly down to ${factor || 'these habits'}; spreading it lifts everyone.`,
    };
    if (ai.enabled()) {
      try {
        const system = [`${privacy.GATE_DIRECTIVE}\n\nYou are IntelliQ helping a leader SCALE a success pattern across their team. Given a strength that's working for someone who's improving, draft a short, positive reflection everyone can do to build that same strength. No names of the source person in the message, no emojis. Return JSON only: {"title": string(<=60), "description": string(1-2 sentences), "fields": array of 1-3 {"label","hint"}, "message": string(a warm 1-2 sentence note to the team), "rationale": string(one sentence to the LEADER)}.`, _domainDirective(code)].filter(Boolean).join('\n\n');
        out = await ai.completeJSON({ tier: 'reason', system, user: `Strength to spread: ${factor || '(general good habits)'}.`, maxTokens: 500, schema: ['title', 'message'] });
      } catch (_) { out = null; }
    }
    const d = (out && out.title) ? out : fallback;
    return res.json({
      ok: true, aiUsed: !!(out && out.title), toTeam: true,
      draft: {
        title: String(d.title || fallback.title).slice(0, 120),
        description: String(d.description || '').slice(0, 1200),
        fields: (Array.isArray(d.fields) ? d.fields : fallback.fields).slice(0, 5).map(f => ({ label: String(f?.label || '').slice(0, 160), hint: String(f?.hint || '').slice(0, 300) })).filter(f => f.label),
        message: String(d.message || fallback.message).slice(0, 600),
        rationale: String(d.rationale || fallback.rationale).slice(0, 300),
      },
    });
  }

  const memberId = String(req.body?.memberId || '');
  if (!new Set(getVisibleUserIds(code, userId)).has(memberId)) return res.status(403).json({ error: 'not in your range' });
  const subject = orgUsers[code]?.[memberId];
  if (!subject) return res.status(404).json({ error: 'not found' });

  let m = null; try { m = _buildMemberIntelInput(code, subject, Date.now()); } catch (_) {}
  const findings = m ? intel.detectPatterns(m) : [];
  const item = findings.length ? intel.composeBriefingItem(m, findings) : null;
  const first = subject.name ? subject.name.split(' ')[0] : 'they';

  // Deterministic, care-first fallback — always works.
  const fallback = kind === 'recognition'
    ? { title: 'Nice work lately', description: `A quick note of recognition for ${first}.`, fields: [{ label: 'What you did well', hint: '' }], message: `${first}, I've noticed real progress from you lately — keep it going.`, rationale: 'Recognising momentum reinforces it.' }
    : { title: 'A quick reflection', description: `A short, supportive reflection for ${first} — no pressure, just a check-in.`, fields: [{ label: 'How are things going for you right now?', hint: 'Honestly — good or hard' }, { label: 'Anything getting in your way?', hint: '' }], message: `${first}, taking a moment to check in — how are things going, and is anything getting in your way?`, rationale: item ? `Because ${item.whyNow}` : 'A gentle check-in, before anything grows.' };

  let out = null;
  if (ai.enabled()) {
    try {
      const system = [`${privacy.GATE_DIRECTIVE}\n\nYou are IntelliQ preparing a SUPPORTIVE intervention a leader can send to one of their people. It must feel caring, never like surveillance, and must NOT reveal any private detail or that the person was "flagged". Return JSON only: {"title": string(<=60), "description": string(1-2 sentences of gentle instructions), "fields": array of 1-3 {"label","hint"}, "message": string(a warm 1-2 sentence note to the person), "rationale": string(one sentence to the LEADER on why this helps)}. No emojis.`, _domainDirective(code, { userId: memberId })].filter(Boolean).join('\n\n');
      const ctx = item ? `Pattern (privacy-safe): ${item.whyNow}. Suggested direction: ${item.recommendedAction}.` : 'No strong pattern; keep it light and general.';
      out = await ai.completeJSON({ tier: 'reason', system, user: `Person's first name: ${first}. Intent: ${kind}. ${ctx}`, maxTokens: 500, schema: ['title', 'message'] });
    } catch (_) { out = null; }
  }
  const d = (out && out.title) ? out : fallback;
  res.json({
    ok: true, aiUsed: !!(out && out.title), memberId, memberName: subject.name || '',
    draft: {
      title: String(d.title || fallback.title).slice(0, 120),
      description: String(d.description || '').slice(0, 1200),
      fields: (Array.isArray(d.fields) ? d.fields : fallback.fields).slice(0, 5).map(f => ({ label: String(f?.label || '').slice(0, 160), hint: String(f?.hint || '').slice(0, 300) })).filter(f => f.label),
      message: String(d.message || fallback.message).slice(0, 600),
      rationale: String(d.rationale || fallback.rationale).slice(0, 300),
    },
  });
});

/* ── POST /api/intelligence/deliver — the leader approves; IntelliQ does it ─────
   Creates the drafted reflection as a real assessment and assigns it to the person
   (reusing the assessment rails), so it lands in their queue like any other work —
   supportive, never labelled a "concern". One approval = the intervention happens. */
app.post('/api/intelligence/deliver', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Leaders only' });
  const me = orgUsers[code]?.[userId];
  const toTeam = req.body?.toTeam === true;

  // Resolve the recipient list: one person, or the whole visible team.
  let targets = [];
  if (toTeam) {
    targets = getVisibleUserIds(code, userId).filter(id => id !== userId).filter(id => { const u = orgUsers[code]?.[id]; return u && u.role !== 'superadmin'; });
    if (!targets.length) return res.status(400).json({ error: 'no team members to send to' });
  } else {
    const memberId = String(req.body?.memberId || '');
    if (!new Set(getVisibleUserIds(code, userId)).has(memberId)) return res.status(403).json({ error: 'not in your range' });
    if (!orgUsers[code]?.[memberId]) return res.status(404).json({ error: 'not found' });
    targets = [memberId];
  }

  const title = String(req.body?.title || 'A quick reflection').slice(0, 160).trim();
  const description = String(req.body?.description || '').slice(0, 2000);
  const fields = (Array.isArray(req.body?.fields) ? req.body.fields : [{ label: 'How are things going?' }])
    .slice(0, 6).map(f => ({ label: String(f?.label || '').slice(0, 160), hint: String(f?.hint || '').slice(0, 300) })).filter(f => f.label);

  const tpl = { id: _shortId(), title, description, kind: 'general', fields, createdBy: userId, createdByName: me?.name || 'Leader', createdAt: new Date().toISOString() };
  (assessmentTemplates[code] = assessmentTemplates[code] || []).push(tpl);
  const created = [];
  targets.forEach(mid => {
    const subject = orgUsers[code]?.[mid];
    if (!subject) return;
    const a = {
      // Criteria are SNAPSHOTTED (deep-copied) + versioned at issue, so a later template
      // edit can never rewrite a historical expectation.
      id: _shortId(), templateId: tpl.id, title: tpl.title, kind: tpl.kind, fields: JSON.parse(JSON.stringify(tpl.fields || [])),
      description: tpl.description || '', guidance: tpl.guidance || '', criteriaVersion: 1,
      assignerId: userId, assignerName: me?.name || 'Leader', assigneeId: mid, assigneeName: subject.name || 'Member',
      status: 'assigned', response: {}, note: '', feedback: '', score: null, submissions: [], assignedAt: new Date().toISOString(),
      prepared: true,
    };
    (assessmentAssignments[code] = assessmentAssignments[code] || []).push(a);
    try { _canonicaliseCommitment(code, a); } catch (_) {}
    created.push(_publicAssignment(a));
  });
  scheduleSave();
  res.json({ ok: true, sent: created.length, assignment: created[0] || null });
});

/* ── GET /api/workspace/group-health ──────────────────────────────────────────
   Item D — metrics on a leader's group, scoped to their subtree.
   Aggregate health (participation / wellbeing / engagement / completion) PLUS a
   per-member DIRECTIONAL state — NOT a ranked scoreboard, per the alignment
   canon ("if a screen lets you sort people by a number, it's wrong").
   States: converging · sustaining · stalled · diverging · unanchored · unknown.
 * ──────────────────────────────────────────────────────────────────────── */
function _memberDirection(code, u) {
  // Returns { state, note } from mood trajectory + activity + goal presence.
  // MIGRATED: the mood conclusion reads CANONICAL mood evidence, not raw check-in rows.
  const cks = _canonicalMoodSeries(code, u.id).map(p => ({ mood: p.mood, t: p.t }));

  const hasGoal = normalizeMemberGoals(_memberGoalsFor(code, u)).length > 0;
  const lastT   = cks.length ? cks[cks.length - 1].t : null;
  const daysSince = lastT != null ? Math.floor((Date.now() - lastT) / 86400000) : null;

  if (!hasGoal) return { state: 'unanchored', note: 'No goal set yet — anchor a goal first.' };

  const moods = cks.filter(c => c.mood != null);
  if (moods.length < 2 || daysSince === null || daysSince > 21) {
    return { state: 'unknown', note: daysSince != null ? `Quiet for ${daysSince}d — not enough recent signal.` : 'No check-ins yet.' };
  }

  // Compare recent half vs earlier half of available mood points.
  const mid    = Math.floor(moods.length / 2);
  const earlier = moods.slice(0, mid).map(c => c.mood);
  const recent  = moods.slice(mid).map(c => c.mood);
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const delta = avg(recent) - avg(earlier);
  const recentAvg = avg(recent);

  if (delta > 0.3)  return { state: 'converging', note: 'Mood trending up.' };
  if (delta < -0.3) return { state: 'diverging',  note: 'Mood trending down — worth a check-in.' };
  if (daysSince > 10) return { state: 'stalled', note: `Steady but quiet (${daysSince}d since last check-in).` };
  if (recentAvg < 2.7) return { state: 'stalled', note: 'Steady but low — may be stuck.' };
  return { state: 'sustaining', note: 'Consistent and engaged.' };
}

app.get('/api/workspace/group-health', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;

  if (!_userHasPerm(code, userId, 'view_insights') && !_userHasPerm(code, userId, 'review_checkins')) {
    return res.status(403).json({ error: 'Permission denied: view_insights or review_checkins required' });
  }

  const now      = Date.now();
  const members  = getVisibleUserIds(code, userId)
    .map(uid => orgUsers[code]?.[uid])
    .filter(u => u && u.id !== userId && u.role !== 'superadmin');

  const STATE_ORDER = ['diverging', 'stalled', 'unanchored', 'unknown', 'sustaining', 'converging'];
  const counts = { converging: 0, sustaining: 0, stalled: 0, diverging: 0, unanchored: 0, unknown: 0 };

  let active7 = 0, active30 = 0, withGoal = 0, setup = 0;
  let mood7Sum = 0, mood7Cnt = 0, mood30Sum = 0, mood30Cnt = 0;

  const perMember = members.map(u => {
    const cks = (memberCheckins[userKey(code, u.id)] || memberCheckins[memberKey(code, u.name || '')] || []);
    const lastTs = cks.length ? new Date(cks[cks.length - 1].ts || cks[cks.length - 1].date).getTime() : null;
    if (lastTs && now - lastTs < 7 * 86400000)  active7++;
    if (lastTs && now - lastTs < 30 * 86400000) active30++;
    if (u.passwordSet !== false) setup++;
    cks.forEach(c => {
      const t = new Date(c.ts || c.date).getTime();
      if (c.mood == null || isNaN(t)) return;
      if (now - t < 7 * 86400000)  { mood7Sum += Number(c.mood);  mood7Cnt++; }
      if (now - t < 30 * 86400000) { mood30Sum += Number(c.mood); mood30Cnt++; }
    });

    const dir = _memberDirection(code, u);
    counts[dir.state] = (counts[dir.state] || 0) + 1;
    if (dir.state !== 'unanchored') withGoal++;
    return { userId: u.id, name: u.name || '', state: dir.state, note: dir.note };
  });

  // Sort by attention-need (diverging first) — this orders by STATE, not by any
  // per-person score, so it stays a triage list, not a ranking.
  perMember.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));

  const mood7  = mood7Cnt  ? Math.round((mood7Sum  / mood7Cnt)  * 10) / 10 : null;
  const mood30 = mood30Cnt ? Math.round((mood30Sum / mood30Cnt) * 10) / 10 : null;
  const moodTrend = (mood7 != null && mood30 != null)
    ? (mood7 > mood30 + 0.2 ? 'improving' : mood7 < mood30 - 0.2 ? 'declining' : 'steady')
    : 'unknown';

  res.json({
    ok: true,
    groupSize: members.length,
    participation: { active7, active30, total: members.length },
    wellbeing:     { mood7, mood30, trend: moodTrend },
    engagement:    { withGoal, setup, total: members.length },
    states:        counts,
    members:       perMember,
    notEnoughData: members.length === 0,
  });
});

/* ── GET /api/workspace/my-tree ───────────────────────────────────────────────
   The leader's people as a TREE (the node tiers BELOW them), not a flat list.
   Roots = nodes the leader explicitly leads + the direct children of nodes they
   belong to. Each node carries its visible members; people visible to the leader
   but not in any shown node land in an "unassigned" bucket. Scoped server-side. */
function _leaderMemberCard(code, uid) {
  const u = orgUsers[code]?.[uid];
  if (!u || u.role === 'superadmin') return null;
  const ck = memberCheckins[userKey(code, uid)] || memberCheckins[memberKey(code, u.name || '')] || [];
  const last = ck.length ? ck[ck.length - 1] : null;
  return {
    userId: u.id, name: u.name || '', email: u.email || '', role: u.role || 'member',
    passwordSet: u.passwordSet !== false,
    latestCheckin: last ? { date: last.date || null, mood: last.mood || null, ts: last.ts || null } : null,
  };
}

app.get('/api/workspace/my-tree', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  if (!_userHasPerm(code, userId, 'view_team')) {
    return res.status(403).json({ error: 'Permission denied: view_team required' });
  }

  const nodes      = orgNodes[code] || {};
  const visible    = new Set(getVisibleUserIds(code, userId));
  visible.delete(userId);

  // Root nodes to display: explicitly-led nodes + direct children of own nodes.
  const roots = new Set(getUserLeaderNodeIds(code, userId));
  getUserNodeIds(code, userId).forEach(nid =>
    (nodes[nid]?.childNodeIds || []).forEach(c => roots.add(c))
  );

  const seenMembers = new Set();
  const buildNode = (nid) => {
    const n = nodes[nid];
    if (!n) return null;
    const ids = [...new Set([...(n.memberIds || []), ...(n.leaderIds || [])])]
      .filter(id => visible.has(id));
    const members = ids.map(id => { seenMembers.add(id); return _leaderMemberCard(code, id); }).filter(Boolean);
    const children = (n.childNodeIds || []).map(buildNode).filter(Boolean);
    return { nodeId: n.nodeId, name: n.name, members, children };
  };

  const tree = [...roots].map(buildNode).filter(Boolean);

  // Visible members not placed in any shown node (e.g. added via supervisor).
  const unassigned = [...visible].filter(id => !seenMembers.has(id))
    .map(id => _leaderMemberCard(code, id)).filter(Boolean);

  res.json({ ok: true, tree, unassigned, totalVisible: visible.size });
});

/* ── GET /api/workspace/briefing — PROACTIVE "what needs you" feed ─────────────
   Deterministic alerts (mood decline, gone quiet, dipped results, unanchored) +
   an AI briefing synthesised from the WEIGHTED signal picture. Names members in
   the alert list (leader's own management view); the narrative stays aggregate.
   Cached per leader for 2h. This is the push, not the pull. */
const leaderBriefingCache = {}; // `${code}:${userId}` → { data, ts }
const BRIEFING_TTL = 2 * 60 * 60 * 1000;

function _memberLastActivity(code, id, name) {
  let last = 0;
  [userKey(code, id), memberKey(code, name || '')].forEach(k =>
    (memberCheckins[k] || []).forEach(c => { const t = new Date(c.ts || c.date).getTime(); if (!isNaN(t)) last = Math.max(last, t); }));
  // Only the member's OWN inputs count as engagement. Data logged ABOUT them by a
  // coach (observations, imported sheets) has createdBy !== the member, and must
  // NOT mask disengagement — otherwise a "gone quiet" alert never fires for the
  // very people it exists to surface.
  _gatherSignals(code, 'member', id, 40)
    .filter(s => s.createdBy === id)
    .forEach(s => { const t = new Date(s.ts).getTime(); if (!isNaN(t)) last = Math.max(last, t); });
  return last || null;
}

function _memberAlert(code, u) {
  const now = Date.now();
  // MIGRATED: the mood-decline conclusion reads CANONICAL mood evidence, never raw
  // check-in rows. (Engagement recency below still uses last-activity, which is a
  // cross-capability operational signal, not a mood/content conclusion.)
  const cks = _canonicalMoodSeries(code, u.id).map(p => ({ mood: p.mood, t: p.t }));
  const lastAct = _memberLastActivity(code, u.id, u.name);
  const days = lastAct ? Math.floor((now - lastAct) / 86400000) : null;
  const hasGoal = normalizeMemberGoals(_memberGoalsFor(code, u)).length > 0;

  // Gone quiet (weighted by how long)
  if (days === null) return { severity: 'medium', reason: 'no activity yet', action: 'Invite them to their first check-in.' };
  if (days >= 14)   return { severity: 'high',   reason: `quiet for ${days} days`, action: 'Reach out personally.' };

  // Mood decline — compare the last 14 days to the preceding ~4 weeks, weighted by
  // TIME not an arbitrary half-split of all history (which let an old low patch
  // fire long after it mattered). Needs ≥2 points in each window to claim a trend,
  // so it never calls a decline off one or two check-ins.
  const avg = a => a.reduce((s, v) => s + v.mood, 0) / a.length;
  const RECENT_MS = 14 * 86400000, PRIOR_MS = 42 * 86400000;
  const recentPts = cks.filter(c => c.mood != null && now - c.t < RECENT_MS);
  const priorPts  = cks.filter(c => c.mood != null && now - c.t >= RECENT_MS && now - c.t < PRIOR_MS);
  if (recentPts.length >= 2) {
    const recent = avg(recentPts);
    if (priorPts.length >= 2 && recent < avg(priorPts) - 0.5 && recent < 3) {
      return { severity: 'high', reason: 'mood trending down', action: 'Check in — ask how they’re doing, listen first.' };
    }
    if (recent < 2.5) return { severity: 'medium', reason: 'low mood recently', action: 'A supportive conversation may help.' };
  }

  // Dipped result — SCALE-AWARE from canonical assessment evidence (a score below half of
  // its OWN scale), not the naked `valueNum < 50` percentage assumption on the legacy signal.
  const lowAssessment = _assessmentConcerns(code, u.id)
    .some(c => (Date.now() - c.t) < 30 * 86400000);
  if (lowAssessment) return { severity: 'medium', reason: 'a recent result dipped', action: 'Review the assessment together and set one focus.' };

  if (days >= 10) return { severity: 'medium', reason: `quiet for ${days} days`, action: 'A quick nudge would help re-engage them.' };
  if (!hasGoal)   return { severity: 'low', reason: 'no goal set yet', action: 'Help them anchor a personal goal.' };
  return null;
}

app.get('/api/workspace/briefing', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  if (!_userHasPerm(code, userId, 'view_team') && !_userHasPerm(code, userId, 'view_insights')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  const cacheKey = `${code}:${userId}`;
  const cached = leaderBriefingCache[cacheKey];
  if (cached && req.query.refresh !== '1' && Date.now() - cached.ts < BRIEFING_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const members = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.id !== userId && u.role !== 'superadmin');

  const SEV = { high: 0, medium: 1, low: 2 };
  const alerts = [];
  let activeWeek = 0;
  members.forEach(u => {
    const last = _memberLastActivity(code, u.id, u.name);
    if (last && Date.now() - last < 7 * 86400000) activeWeek++;
    const a = _memberAlert(code, u);
    if (a) alerts.push({ memberId: u.id, name: u.name, ...a });
  });
  alerts.sort((x, y) => SEV[x.severity] - SEV[y.severity]);
  const topAlerts = alerts.slice(0, 8);

  // AI briefing from the aggregate weighted picture (no individual names).
  const highN = alerts.filter(a => a.severity === 'high').length;
  const reasons = {};
  alerts.forEach(a => { reasons[a.reason] = (reasons[a.reason] || 0) + 1; });
  const reasonLine = Object.entries(reasons).map(([r, n]) => `${n}× ${r}`).join(', ');
  const brief = [
    `GROUP: ${members.length} members, ${activeWeek} active this week.`,
    alerts.length ? `Attention flags: ${alerts.length} (${highN} high). Patterns: ${reasonLine}.` : 'No attention flags this week.',
    'Signals are weighted: results and repeated patterns count more than one-off notes.',
  ].join('\n');

  let narrative = null;
  try {
    narrative = await ai.complete({
      tier: 'reason', maxTokens: 220,
      system: [`You are IntelliQ, briefing a group's leader. In 2-4 sentences say what the week looks like and the ONE or TWO things to prioritise. Aggregate only — do not name individuals (the leader sees the named list separately). Directional, practical, warm. No scores.`, _worldviewDirective(code), _domainDirective(code)].filter(Boolean).join('\n\n'),
      user: brief,
    });
  } catch (_) { /* fall back to no narrative */ }

  const data = {
    ok: true,
    generatedAt: new Date().toISOString(),
    domain: _domainStamp(code),
    memberCount: members.length,
    activeThisWeek: activeWeek,
    alerts: topAlerts,
    highCount: highN,
    briefing: narrative || (alerts.length
      ? `${alerts.length} member(s) could use your attention this week — see the list below.`
      : `Your group looks steady this week — ${activeWeek}/${members.length} active.`),
  };
  leaderBriefingCache[cacheKey] = { data, ts: Date.now() };
  res.json(data);
});

/* ═══════════════════════════════════════════════════════════════════════════
   PLATFORM INTELLIGENCE LOOP (v1)
   Input → Signal → PATTERN → Judgment → Action → Outcome → Learning

   ONE consolidated leader surface. The engine (ai/intelligence.js) is pure and
   privacy-safe: it only ever receives DERIVED features (numbers, weights,
   timestamps, directions, booleans) assembled here through the privacy gate —
   never raw note/check-in text. Sensitive context enters only as a boolean flag.
   ═══════════════════════════════════════════════════════════════════════════ */
const intelBriefingCache = {}; // `${code}:${userId}` → { data, ts }
const noticeFeedback = {};     // orgCode → { noticingType → { useful, dismiss } } — the Confidence Engine's memory

/* Confidence Engine read: per-noticing-type reliability, from humans' feedback. */
function _reliabilityByType(code) {
  const fb = noticeFeedback[code] || {};
  const out = {};
  Object.keys(fb).forEach(type => { out[type] = confidence.reliability(fb[type]); });
  return out;
}

/* Source-only guard — a DERIVED pattern/recommendation is NEVER counted as new
   independent SOURCE evidence of its own underlying pattern. Prevents the lineage
   source → pattern → recommendation → (recommendation as source) → stronger pattern. */
function _isSourceEvidence(env) {
  return !!env && env.provider !== 'kernel' && env.source !== 'derived'
    && !(Array.isArray(env.derivedFrom) && env.derivedFrom.length > 0);
}

/* Canonical mood series for a subject — reads claim-bounded CANONICAL check-in mood
   evidence (never raw check-in rows, never the compatibility signal). Source evidence
   only (self-feeding-protected). [{ t(ms), mood, evidenceId }] ascending. This is the
   ONE longitudinal check-in mood reader; the whole member-intelligence engine inherits
   it, so no check-in trajectory/concern conclusion rests on a raw row or a raw signal. */
function _canonicalMoodSeries(code, subjectId) {
  const log = evidenceLog[code] || [];
  const out = [], seen = new Set();
  log.forEach(env => {
    if (env.status !== 'active' || env.subjectId !== subjectId) return;
    if (env.type !== 'metric' || !/mood/i.test(env.label || '')) return;
    if (env.visibility === 'private') return;      // mood is sensitive, not private; guard anyway
    if (!_isSourceEvidence(env)) return;           // never count a derived pattern as mood proof
    const t = new Date(env.observedAt || env.retrievedAt || 0).getTime();
    const v = Number(env.value);
    if (isNaN(t) || !Number.isFinite(v) || seen.has(t)) return;
    seen.add(t); out.push({ t, mood: v, evidenceId: env.id });
  });
  return out.sort((a, b) => a.t - b.t);
}

/* Deduped mood series for a member: [{ t(ms), mood(1-5) }] ascending. No text.
   MIGRATED: now sourced from canonical evidence, not raw check-in rows. */
function _memberMoodSeries(code, u) {
  return _canonicalMoodSeries(code, u.id).map(p => ({ t: p.t, mood: p.mood }));
}

/* Directional trajectory from a mood series: 'up' | 'down' | 'flat' | null. */
function _trajectoryFromMood(series, now) {
  const recent = series.filter(p => now - p.t <  intel.RECENT);
  const prior  = series.filter(p => now - p.t >= intel.RECENT && now - p.t < intel.PRIOR);
  if (recent.length < 2 || prior.length < 2) return null;
  const ra = recent.reduce((s, p) => s + p.mood, 0) / recent.length;
  const pa = prior.reduce((s, p) => s + p.mood, 0) / prior.length;
  const d = ra - pa;
  return d > 0.4 ? 'up' : d < -0.4 ? 'down' : 'flat';
}

/* Team trajectory: pooled mood direction of the member's first group's peers. */
function _teamTrajectory(code, u, now) {
  const g = (orgGroups[code] || []).find(x =>
    (x.memberIds || []).includes(u.id) || (x.leadIds || []).includes(u.id));
  if (!g) return null;
  const peers = [...new Set([...(g.memberIds || []), ...(g.leadIds || [])])].filter(id => id !== u.id);
  const pooled = [];
  peers.forEach(id => {
    const pu = orgUsers[code]?.[id]; if (!pu) return;
    _memberMoodSeries(code, pu).forEach(p => pooled.push(p));
  });
  return _trajectoryFromMood(pooled.sort((a, b) => a.t - b.t), now);
}

/* Assemble the PRIVACY-SAFE feature set the engine reasons over. No raw text. */
function _buildMemberIntelInput(code, u, now) {
  const moodSeries = _memberMoodSeries(code, u);
  const sigs = _gatherSignals(code, 'member', u.id, 80);
  const signalSeries = sigs.map(s => ({
    t: new Date(s.ts).getTime(),
    source: s.source,
    weight: s.weight || 'weak',
    own: s.createdBy === u.id,
  })).filter(s => !isNaN(s.t));

  // Concern signals — timestamps only (low-mood check-ins + dipped results).
  // MIGRATED: a dipped assessment is now SCALE-AWARE from CANONICAL evidence (a score below
  // half of its OWN scale) — never the naked `valueNum < 50` on the legacy signal, which
  // wrongly assumed a percentage. An unknown scale raises no false concern.
  const concernSeries = [];
  moodSeries.forEach(p => { if (p.mood <= 2) concernSeries.push({ t: p.t }); });
  try { _assessmentConcerns(code, u.id).forEach(c => concernSeries.push({ t: c.t })); } catch (_) {}

  // "Helping / among-others" proxy — timestamps only: shared notes the member
  // authored + messages they sent to a group. No content is read.
  const helpingSeries = [];
  Object.values(orgNotes).forEach(n => {
    if (n.orgCode === code && n.authorId === u.id && n.type && n.type !== 'private') {
      const t = new Date(n.createdAt).getTime(); if (!isNaN(t)) helpingSeries.push({ t });
    }
  });
  Object.values(orgMessages).forEach(mm => {
    if (mm.orgCode === code && mm._realFromId === u.id && mm.toType === 'group') {
      const t = new Date(mm.createdAt).getTime(); if (!isNaN(t)) helpingSeries.push({ t });
    }
  });

  const mem = userAiProfiles[`${code}:${u.id}`];
  const hasSensitiveContext =
    !!(mem?.keyMemory || []).some(k => k.sensitive) ||
    sigs.some(s => privacy.isPrivate(s.sensitivity));

  // ── Behaviour Engine (ai/baseline): compare the member to THEIR OWN normal ──
  // Build weekly-rate + level series per behavioural dimension, then let the
  // Behaviour Engine find deviations-from-self. All numeric — no text.
  const checkinTs = []; const seenCk = new Set();
  [userKey(code, u.id), memberKey(code, u.name || '')].forEach(k =>
    (memberCheckins[k] || []).forEach(c => {
      const t = new Date(c.ts || c.date).getTime();
      if (!isNaN(t) && !seenCk.has(t)) { seenCk.add(t); checkinTs.push(t); }
    }));
  const ownSignalTs  = signalSeries.filter(s => s.own).map(s => s.t);
  const reflectionTs = signalSeries.filter(s => s.own && (s.source === 'note' || s.source === 'weekly')).map(s => s.t);
  const dimSeries = {
    mood:               moodSeries.map(p => ({ t: p.t, v: p.mood })),
    check_in_frequency: _weeklyCounts(checkinTs, now),
    reflection_cadence: _weeklyCounts(reflectionTs, now),
    contribution:       _weeklyCounts(ownSignalTs, now),
    helping:            _weeklyCounts(helpingSeries.map(h => h.t), now),
  };
  let deviations = [], fingerprint = null;
  try { const b = baseline.analyze(dimSeries, now); deviations = b.deviations; fingerprint = b.fingerprint; } catch (_) {}

  // ── Cross-signal reasoning (ai/agents): honest connections across ANY streams ──
  // The five behavioural dimensions PLUS any raw numeric signal (a stat, a grade,
  // attendance, a KPI) — self-relative, correlated over time. Domain-agnostic:
  // it reasons over numbers-vs-self, not industry meaning. Connections, never causes.
  // Streams are typed by universal PRIMITIVE + VALENCE (the domain→kernel mapping),
  // so the pattern engine reasons about "a participation stream declining", not
  // about "check-ins". The five behavioural dimensions PLUS any raw numeric signal.
  const pack = packs.resolvePack(orgMeta[code]?.orgMode);
  const streams = [
    { key: 'mood',               label: packs.labelFor(pack, 'mood'),               primitive: 'state',         valence: 'up-good', series: dimSeries.mood },
    { key: 'check_in_frequency', label: packs.labelFor(pack, 'check_in_frequency'), primitive: 'participation', valence: 'up-good', series: dimSeries.check_in_frequency },
    { key: 'reflection_cadence', label: packs.labelFor(pack, 'reflection_cadence'), primitive: 'participation', valence: 'up-good', series: dimSeries.reflection_cadence },
    { key: 'contribution',       label: packs.labelFor(pack, 'contribution'),       primitive: 'participation', valence: 'up-good', series: dimSeries.contribution },
    { key: 'helping',            label: packs.labelFor(pack, 'helping'),            primitive: 'relational',    valence: 'up-good', series: dimSeries.helping },
  ];
  const numeric = {};
  sigs.forEach(s => {
    if (s.valueNum == null) return;
    // Mood check-ins are ALREADY a first-class dimension (dimSeries.mood + the
    // check-in cadence stream). Their per-value label ("Mood 4/5", "Mood 5/5")
    // would otherwise fragment into one numeric stream PER mood value — so a person
    // who shifts from 4s to 5s leaves a stale "Mood 4/5" stream that trips a false
    // data_gap ("went quiet"). Skip them here: mood is not a raw external metric.
    if (s.source === 'checkin') return;
    const t = new Date(s.ts).getTime(); if (isNaN(t)) return;
    const key = `${s.source}${s.label ? ':' + s.label : ''}`;
    const label = s.label || (SIGNAL_SOURCES[s.source]?.label || s.source);
    (numeric[key] = numeric[key] || {
      key, label,
      // Signals may declare their own primitive/valence (best); else infer universally.
      primitive: s.primitive || packs.primitiveForSignal(s.source, s.label),
      valence:   s.valence   || packs.valenceFor(s.label),
      series: [],
    }).series.push({ t, v: Number(s.valueNum) });
  });
  Object.values(numeric).forEach(st => { if (st.series.length >= 6) streams.push(st); });

  let connections = [];
  try { connections = agents.crossSignal(streams, now); } catch (_) {}
  // The Universal Pattern Engine: domain-free structures (withdrawal/isolation/
  // overload/plateau) over the typed streams — same logic for any human system.
  let structural = [];
  try { structural = primitives.structuralPatterns(streams, now); } catch (_) {}

  return {
    id: u.id, name: u.name || 'This member', now,
    moodSeries, signalSeries, concernSeries, helpingSeries,
    lastActivityT: _memberLastActivity(code, u.id, u.name),
    goalCount: normalizeMemberGoals(_memberGoalsFor(code, u)).length,
    memberTrajectory: _trajectoryFromMood(moodSeries, now),
    teamTrajectory:   _teamTrajectory(code, u, now),
    hasSensitiveContext,
    deviations, fingerprint, connections, structural,
    // The ephemeral relationship graph (honest: correlational, never causal).
    streams: streams.map(s => ({ key: s.key, label: s.label, primitive: s.primitive })),
  };
}

/* Weekly event counts over a trailing window → one point per week [{t, v}].
   Zero-fills quiet weeks (a drop to zero IS the signal). Feeds the Behaviour
   Engine's rate dimensions. */
function _weeklyCounts(times, now, weeks = 16) {
  const buckets = new Array(weeks).fill(0);
  (times || []).forEach(t => {
    const w = Math.floor((now - t) / (7 * 86400000));
    if (w >= 0 && w < weeks) buckets[w]++;
  });
  return buckets.map((v, i) => ({ t: now - (i * 7 + 3.5) * 86400000, v })).sort((a, b) => a.t - b.t);
}

/* Close the loop: which action CATEGORY has helped each pattern, from the org's
   own logged interventions + recorded/measured outcomes. */
function _learningByPattern(code) {
  const acc = {};
  (orgInterventions[code] || []).forEach(i => {
    const pt = i.patternType; if (!pt) return;
    const oc = i.recordedOutcome || (i.outcome?.status === 'measured' ? i.outcome.outcome : null);
    if (!oc) return;
    const s = acc[pt] || (acc[pt] = { actions: {}, positive: 0, total: 0 });
    s.total++; if (oc === 'positive') s.positive++;
    const cat = _categorizeAction(i.action);
    const a = s.actions[cat] || (s.actions[cat] = { label: cat, positive: 0, total: 0 });
    a.total++; if (oc === 'positive') a.positive++;
  });
  const out = {};
  Object.entries(acc).forEach(([pt, s]) => {
    const best = Object.values(s.actions).sort((a, b) => b.positive - a.positive || b.total - a.total)[0];
    out[pt] = { action: best ? best.label : null, positive: s.positive, total: s.total };
  });
  return out;
}

/* ── The proactive prompt layer ───────────────────────────────────────────────
   Grounded CANDIDATES the AI reasons over. Each is a real, privacy-safe fact about
   the leader's OWN people (an outcome, a shared development area, a trajectory, an
   upcoming stretch) paired with a structured CTA that routes to the prepare→deliver
   rails. The AI (in _reasonedPrompts) decides which matter for THIS organisation and
   phrases them in its voice — but the CTA stays deterministic, so nothing acted on
   is ever fabricated. This function is the grounding; the reasoning sits above it. */
function _promptCandidates(code, userId, now) {
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x';
  const cands = [];
  const ids = getVisibleUserIds(code, userId).filter(id => id !== userId);
  const members = ids.map(id => orgUsers[code]?.[id]).filter(u => u && u.role !== 'superadmin');

  // Assessment outcomes → repeat what's working / rework what isn't.
  let outcomes; try { outcomes = _assessmentOutcomes(code, userId, now); } catch (_) { outcomes = { working: [], revisit: [] }; }
  if (outcomes.working[0]) {
    const w = outcomes.working[0];
    cands.push({ id: 'repeat-' + slug(w.title), tone: 'opportunity',
      basis: `The assessment "${w.title}" lines up with people improving${w.rising ? ` (${w.rising} trending up since)` : ''}${w.avgScore != null ? `, avg score ${w.avgScore}` : ''}. Running it again could help.`,
      text: `"${w.title}" has lined up with people improving${w.rising ? ` — ${w.rising} trending up since` : ''}. Want me to build this week around running it again?`,
      cta: { label: 'Draft the plan', action: 'plan', theme: w.title } });
  }
  if (outcomes.revisit[0]) {
    const r = outcomes.revisit[0];
    cands.push({ id: 'rework-' + slug(r.title), tone: 'attention',
      basis: `The assessment "${r.title}" preceded a dip${r.falling ? ` for ${r.falling} ${r.falling === 1 ? 'person' : 'people'}` : ''}${r.avgScore != null ? `, avg score ${r.avgScore}` : ''}. It may need reworking.`,
      text: `"${r.title}" has preceded a dip${r.falling ? ` for ${r.falling}` : ''}. Want me to rework how it's run before it goes out again?`,
      cta: { label: 'Rework it', action: 'plan', theme: `reworking ${r.title}` } });
  }

  // Development areas per member (categorical tokens from assessment signals only).
  const devCount = {}, devByMember = {};
  members.forEach(u => {
    const toks = new Set();
    (orgSignals[code] || []).forEach(s => {
      if (s.subjectId !== u.id || s.source !== 'assessment') return;
      const dm = (s.valueText || '').match(/Development:\s*([^·]+)/i);
      if (dm) dm[1].split(',').forEach(x => { const v = x.trim().toLowerCase(); if (v) toks.add(v); });
    });
    toks.forEach(v => { devCount[v] = (devCount[v] || 0) + 1; });
    devByMember[u.id] = toks;
  });

  // A shared development area across several people → a proactive plan.
  const topWeak = Object.entries(devCount).sort((a, b) => b[1] - a[1])[0];
  if (topWeak && topWeak[1] >= 2) {
    cands.push({ id: 'team-weak-' + slug(topWeak[0]), tone: 'attention',
      basis: `${topWeak[1]} people have "${topWeak[0]}" as a development area right now — a shared theme worth getting ahead of.`,
      text: `${topWeak[1]} people have been working on ${topWeak[0]} lately. Want me to draft a proactive plan for the week to get ahead of it?`,
      cta: { label: 'Draft a plan', action: 'plan', theme: topWeak[0] } });
  }

  // People who are a little weaker in an area and not trending up → assign a focused reflection.
  members.forEach(u => {
    const dir = _memberTrajDir(code, u, now);
    if ((dir === 'down' || dir === 'steady') && devByMember[u.id] && devByMember[u.id].size) {
      const first = (u.name || 'They').split(' ')[0];
      const area = [...devByMember[u.id]][0];
      cands.push({ id: 'assign-' + u.id, tone: 'opportunity',
        basis: `${first} has "${area}" as a development area and is ${dir === 'down' ? 'trending down' : 'holding steady, not improving'} — a focused reflection could help.`,
        text: `${first} has been a little weaker in ${area}. Want me to assign them a focused reflection on it?`,
        cta: { label: `Assign to ${first}`, action: 'support', memberId: u.id } });
    }
  });

  // A busy stretch ahead — only when REAL upcoming events are connected (lights up
  // once a calendar is linked; never fabricated).
  const soon = now + 14 * 86400000;
  let upcoming = 0;
  (orgSignals[code] || []).forEach(s => {
    const isEvent = s.modality === 'event' || /calendar|google|outlook|teams|fixture|event/i.test(s.source || '');
    if (!isEvent) return;
    const t = new Date(s.ts).getTime();
    if (Number.isFinite(t) && t > now && t < soon) upcoming++;
  });
  if (upcoming >= 3) {
    cands.push({ id: 'busy-week', tone: 'attention',
      basis: `${upcoming} events are on the calendar in the next two weeks — a heavier-than-usual stretch to prepare for.`,
      text: `There are ${upcoming} things on the calendar over the next two weeks. Want me to put together sessions to prepare for it?`,
      cta: { label: 'Draft sessions', action: 'plan', theme: 'a busy stretch coming up' } });
  }

  return cands;
}

/* The reasoning above the grounding. Hands the AI the grounded candidates plus the
   org's own worldview, and lets it decide which genuinely matter for THIS
   organisation and phrase each as a natural "want me to…" offer in the org's voice
   — because what's proactive differs for every org. The structured CTA is preserved
   verbatim from the candidate (never model-authored), so approval stays safe and
   grounded. No AI key → the deterministic candidate text is used as-is. */
async function _reasonedPrompts(code, userId, now) {
  const cands = _promptCandidates(code, userId, now);
  if (!cands.length) return [];
  if (!ai.enabled()) return cands.slice(0, 4);
  try {
    const byId = Object.fromEntries(cands.map(c => [c.id, c]));
    const list = cands.map(c => `- id: ${c.id}\n  fact: ${c.basis}`).join('\n');
    const system = [
      `You are IntelliQ, the proactive intelligence for a leader. You are given GROUNDED FACTS about their team (each with an id) and must decide which genuinely deserve the leader's attention THIS week, then phrase each as a short, natural "want me to…" offer in the organisation's own voice — the way a sharp chief of staff would raise it. What counts as proactive differs for every organisation; reason from the facts and the worldview, don't apply a template. Return JSON only: {"prompts":[{"id": <one of the given ids, unchanged>, "text": <=160 chars, a warm, specific offer phrased as a question the leader can say yes to>]}. Include only ids worth surfacing (0-4), most important first. Never invent facts, names, or ids beyond those given. No emojis.`,
      _worldviewDirective(code),
      _domainDirective(code),
    ].filter(Boolean).join('\n\n');
    const out = await ai.completeJSON({ tier: 'reason', system, user: `Grounded facts:\n${list}`, maxTokens: 500, schema: ['prompts'] });
    const picked = Array.isArray(out?.prompts) ? out.prompts : [];
    const result = [];
    picked.forEach(p => {
      const c = byId[p?.id];
      if (!c) return;                          // model must reference a real, grounded candidate
      const text = String(p?.text || c.text).slice(0, 220).trim() || c.text;
      result.push({ id: c.id, tone: c.tone, text, cta: c.cta });  // CTA verbatim from grounding
    });
    return result.length ? result.slice(0, 4) : cands.slice(0, 4);
  } catch (_) {
    return cands.slice(0, 4);
  }
}

/* ── GET /api/intelligence/briefing — the ONE leader intelligence surface ─────
   Consolidates: who-needs-attention + why-now + evidence + recommended action +
   group rollup (folds the old Group Health / Org Health / Intelligence pages).
   Privacy-safe throughout; the only AI call is the aggregate summary (gateway). */
app.get('/api/intelligence/briefing', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin';
  if (!isAdmin && !_userHasPerm(code, userId, 'view_team') && !_userHasPerm(code, userId, 'view_insights')) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const cacheKey = `${code}:${userId}`;
  const cached = intelBriefingCache[cacheKey];
  if (cached && req.query.refresh !== '1' && Date.now() - cached.ts < BRIEFING_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const now = Date.now();
  const members = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.id !== userId && u.role !== 'superadmin');
  const learning = _learningByPattern(code);

  const reliabilityByType = _reliabilityByType(code);
  const items = []; let activeWeek = 0; const patternCounts = {};
  members.forEach(u => {
    let m; try { m = _buildMemberIntelInput(code, u, now); } catch (_) { return; }
    if (m.lastActivityT && now - m.lastActivityT < 7 * 86400000) activeWeek++;
    // Kernel findings = self-relative/trajectory patterns + the universal structural
    // patterns (withdrawal/isolation/overload/plateau), ranked together by severity.
    const SEVR = { high: 0, medium: 1, low: 2 };
    const findings = [...intel.detectPatterns(m), ...(m.structural || [])]
      .sort((a, b) => SEVR[a.severity] - SEVR[b.severity]);
    if (!findings.length) return;
    const item = intel.composeBriefingItem(m, findings, learning);
    if (!item) return;
    item.graph = { nodes: m.streams || [], edges: item.connections || [] }; // honest, correlational
    // Confidence Engine: suppress a noticing type that's earned enough feedback and
    // proven mostly unhelpful here; label the rest honestly.
    const rel = reliabilityByType[item.patternType];
    if (!confidence.shouldSurface(rel)) return;
    item.reliability = confidence.label(rel);
    findings.forEach(f => { patternCounts[f.type] = (patternCounts[f.type] || 0) + 1; });
    items.push(item);
  });
  const SEV = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
  const top = items.slice(0, 15);

  const participation = members.length ? Math.round((activeWeek / members.length) * 100) : 0;
  const drops = patternCounts.momentum_drop || 0, ups = patternCounts.quiet_improvement || 0;
  const momentum = drops > ups ? 'softening' : ups > drops ? 'building' : 'steady';

  let narrative = null;
  try {
    const brief = [
      `${members.length} members, ${activeWeek} active this week (participation ${participation}%).`,
      `Patterns noticed: ${Object.entries(patternCounts).map(([k, v]) => `${v}× ${intel.PATTERN_LABEL[k] || k}`).join(', ') || 'none'}.`,
      `Overall momentum: ${momentum}.`,
    ].join('\n');
    narrative = await ai.complete({
      tier: 'reason', maxTokens: 200,
      system: [
        `You are Platform Intelligence, briefing a leader in 2-3 sentences: the shape of the week and the ONE thing to prioritise. Aggregate only — NEVER name an individual (the leader sees the named list separately). Honest and directional — say "pattern" or "early signal", never "prediction" and never scores.`,
        _worldviewDirective(code),
        _domainDirective(code),
      ].filter(Boolean).join('\n\n'),
      user: brief,
    });
  } catch (_) { /* narrative is optional */ }

  const data = {
    ok: true,
    generatedAt: new Date().toISOString(),
    domain: _domainStamp(code),
    summary: narrative || (top.length
      ? `${top.length} ${_vc(code, top.length === 1 ? 'member' : 'members')} show patterns worth a look this week.`
      : `Your ${_vc(code, 'group')} looks steady — ${activeWeek}/${members.length} active, nothing flagged.`),
    rollup: { memberCount: members.length, activeThisWeek: activeWeek, participation, momentum, patternCounts },
    items: top,
    prompts: await (async () => { try { return await _reasonedPrompts(code, userId, now); } catch (_) { return []; } })(),
  };
  intelBriefingCache[cacheKey] = { data, ts: Date.now() };
  res.json(data);
});

/* ── GET /api/intelligence/roster — EVERYONE in scope, at-a-glance status ──────
   The briefing shows who needs you *today*; the roster shows your whole tree
   (org-wide for a superadmin) with a one-word kernel read each, so a leader can
   scan everyone, not just the flagged few. Deterministic (no AI call), cached. */
const rosterCache = {}; // `${code}:${userId}` → { data, ts }

app.get('/api/intelligence/roster', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin';
  if (!isAdmin && !_userHasPerm(code, userId, 'view_team') && !_userHasPerm(code, userId, 'view_insights')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  const key = `${code}:${userId}`;
  const cached = rosterCache[key];
  if (cached && req.query.refresh !== '1' && Date.now() - cached.ts < BRIEFING_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const now = Date.now();
  const members = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.id !== userId && u.role !== 'superadmin');

  const counts = { attention: 0, improving: 0, steady: 0, 'no-data': 0 };
  const roster = members.map(u => {
    let m; try { m = _buildMemberIntelInput(code, u, now); } catch (_) { m = null; }
    const findings = m ? [...intel.detectPatterns(m), ...(m.structural || [])] : [];
    const lastDays = m?.lastActivityT ? Math.floor((now - m.lastActivityT) / 86400000) : null;
    const hasData = (m?.moodSeries?.length || 0) > 0 || (m?.signalSeries?.length || 0) > 0 || lastDays != null;

    let status = 'steady', topLabel = null;
    if (!hasData) { status = 'no-data'; }
    else {
      const urgent  = findings.find(f => f.severity === 'high') || findings.find(f => f.severity === 'medium');
      const improve = findings.find(f => f.type === 'quiet_improvement');
      if (urgent)       { status = 'attention'; topLabel = intel.PATTERN_LABEL[urgent.type] || urgent.type; }
      else if (improve) { status = 'improving'; topLabel = 'Quietly improving'; }
      else              { status = 'steady'; }
    }
    counts[status]++;
    return { id: u.id, name: u.name || '', status, topLabel, lastActiveDays: lastDays };
  });

  const ORDER = { attention: 0, improving: 1, steady: 2, 'no-data': 3 };
  roster.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));

  const data = { ok: true, count: members.length, counts, roster, orgWide: isAdmin };
  rosterCache[key] = { data, ts: Date.now() };
  res.json(data);
});

/* ── POST /api/intelligence/act — leader logs an action taken on a briefing item.
   Ties the intervention to the PATTERN so the loop can learn per-pattern. */
app.post('/api/intelligence/act', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const { memberId, patternType, action } = req.body || {};
  if (!action || !String(action).trim()) return res.status(400).json({ error: 'action required' });
  if (memberId && !getVisibleUserIds(code, userId).includes(memberId)) {
    return res.status(403).json({ error: 'Member not in your visible scope' });
  }
  if (!orgInterventions[code]) orgInterventions[code] = [];
  const intv = {
    id: _intvId(), createdAt: new Date().toISOString(),
    targetMember: orgUsers[code]?.[memberId]?.name || null,
    targetMemberId: memberId || null, targetGroup: null,
    action: String(action).slice(0, 300),
    patternType: patternType || null,
    urgency: 'medium', owner: userId, reason: 'briefing', evidence: [],
    status: 'completed', acknowledgedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(), dismissedAt: null,
    outcome: null, recordedOutcome: null,
  };
  orgInterventions[code].push(intv);
  scheduleSave();
  res.json({ ok: true, interventionId: intv.id });
});

/* ── POST /api/intelligence/outcome — leader records how an action went.
   Explicit outcome (positive|neutral|negative) closes the learning loop. */
app.post('/api/intelligence/outcome', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const { interventionId, outcome } = req.body || {};
  const VALID = ['positive', 'neutral', 'negative'];
  if (!interventionId || !VALID.includes(outcome)) return res.status(400).json({ error: 'interventionId and valid outcome required' });
  const intv = (orgInterventions[code] || []).find(i => i.id === interventionId);
  if (!intv) return res.status(404).json({ error: 'Not found' });
  if (intv.owner !== userId && orgUsers[code]?.[userId]?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only the logger can record the outcome' });
  }
  intv.recordedOutcome = outcome;
  intv.outcomeRecordedAt = new Date().toISOString();
  intelBriefingCache[`${code}:${userId}`] = null; // learning changed — invalidate
  scheduleSave();
  res.json({ ok: true });
});

/* ── POST /api/intelligence/notice-feedback — teach the Confidence Engine ──────
   Either lens sends { type, feedback:'useful'|'dismiss' }. The kernel learns which
   KINDS of noticing are actually useful here, and stops surfacing the ones that
   aren't. This is how proactivity earns (or loses) the right to speak. */
/* Record a useful/dismiss signal for a noticing TYPE and invalidate the caches
   it affects. Shared by the leader feedback endpoint and the member Learn loop. */
function _recordNoticeFeedback(code, type, feedback) {
  if (!['useful', 'dismiss'].includes(feedback)) return null;
  if (!noticeFeedback[code]) noticeFeedback[code] = {};
  const t = noticeFeedback[code][String(type)] || (noticeFeedback[code][String(type)] = { useful: 0, dismiss: 0 });
  t[feedback]++;
  Object.keys(intelBriefingCache).forEach(k => { if (k.startsWith(code + ':')) intelBriefingCache[k] = null; });
  Object.keys(meRecordCache).forEach(k => { if (k.startsWith(code + ':')) meRecordCache[k] = null; });
  scheduleSave();
  return t;
}

app.post('/api/intelligence/notice-feedback', requireAuth, (req, res) => {
  const { orgCode } = req.iqSession;
  const code = orgCode;
  const { type, feedback } = req.body || {};
  if (!type || !['useful', 'dismiss'].includes(feedback)) return res.status(400).json({ error: 'type and useful|dismiss required' });
  const t = _recordNoticeFeedback(code, type, feedback);
  res.json({ ok: true, reliability: confidence.label(confidence.reliability(t)) });
});

/* ── POST /api/signals/import-csv — a source adapter in action ─────────────────
   The "everything is a signal" contract: a spreadsheet becomes per-member metric
   signals through the SAME attribution + scope-safety path as the smart import.
   Body: { csv, fileName?, public? }. */
app.post('/api/signals/import-csv', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const csvText = String(req.body?.csv || '');
  if (!csvText.trim()) return res.status(400).json({ error: 'csv content required' });

  let parsed; try { parsed = adapters.csv(csvText); } catch (e) { return res.status(400).json({ error: 'Could not parse CSV: ' + e.message }); }
  if (!parsed.members.length) return res.json({ ok: true, imported: 0, matched: [], unmatched: [], note: 'No member rows found (first column should be the member name).' });

  const roster = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.role !== 'superadmin')
    .map(u => ({ id: u.id, name: (u.name || '').toLowerCase().trim(), first: (u.firstName || (u.name || '').split(' ')[0] || '').toLowerCase().trim() }));
  if (!roster.length) return res.status(400).json({ error: 'No members in your scope to attribute data to.' });

  const result = _attributeMembers(code, userId, parsed.members, roster, String(req.body?.fileName || 'import.csv').slice(0, 120), !!req.body?.public);
  res.json({ ok: true, ...result });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INTELLIQ — the PERSON'S OWN lens over the same kernel.
   The record belongs to the individual: they see their OWN behavioural portrait,
   what has shifted vs THEIR OWN normal, their values/goals, and a warm reflection
   from the Coach agent. Self-owned, self-relative, never scored. Sensitive context
   informs the reflection's tone but is never enumerated back at them.
   ═══════════════════════════════════════════════════════════════════════════ */
const meRecordCache = {}; // `${code}:${userId}` → { data, ts }

app.get('/api/me/record', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const me = orgUsers[code]?.[userId];
  if (!me) return res.status(404).json({ error: 'Not found' });

  const cacheKey = `${code}:${userId}`;
  const cached = meRecordCache[cacheKey];
  if (cached && req.query.refresh !== '1' && Date.now() - cached.ts < BRIEFING_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const now = Date.now();
  let m; try { m = _buildMemberIntelInput(code, me, now); } catch (_) { m = null; }

  // Their own stated aims/values (person-authored core of the human model).
  const goalRec = _memberGoalsFor(code, me) || {};
  const goals  = normalizeMemberGoals(goalRec).map(g => g.title).filter(Boolean);
  const values = Array.isArray(goalRec.selectedValues) ? goalRec.selectedValues.filter(Boolean) : [];

  // Portrait = their behavioural fingerprint (self-relative normals). Never a score.
  const portrait = m?.fingerprint || {};
  const shifts   = (m?.deviations || []).map(d => ({ label: d.label, direction: d.direction, deviationPct: d.deviationPct, confidence: d.confidence }));
  const trajectory = m?.memberTrajectory || null;

  // The Coach agent reflects — warm, self-relative, values-anchored. Via the gateway.
  let reflection = null;
  const enoughToReflect = (m?.moodSeries?.length || 0) >= 1 || Object.keys(portrait).length > 0 || goals.length > 0;
  if (enoughToReflect) {
    try {
      // The person's own confidence-gated understanding shapes STYLE only.
      const understanding = agents.personModel.understanding(userAiProfiles[`${code}:${userId}`]?.model);
      const { system, user } = agents.coachReflectionPrompt({
        name: me.name, values, goals,
        fingerprint: portrait, deviations: m?.deviations || [],
        trajectory, hasSensitiveContext: !!m?.hasSensitiveContext,
        understanding,
      });
      reflection = await ai.complete({ tier: 'reason', system: [system, _domainDirective(code, { userId })].filter(Boolean).join('\n\n'), user, maxTokens: 220 });
      // Belt-and-suspenders: strip any private span that could have slipped in.
      reflection = privacy.redact(reflection, m?.privateStrings || []);
    } catch (_) { reflection = null; }
  }

  const data = {
    ok: true,
    generatedAt: new Date().toISOString(),
    domain: _domainStamp(code),
    name: me.name,
    reflection: reflection || (goals.length
      ? `You're just getting started here. As you check in and reflect, this becomes a clearer mirror of who you're becoming.`
      : `Welcome. Name one thing you're working toward, and IntelliQ starts building an honest picture of your growth — just for you.`),
    portrait,          // { dim: { label, normal } } — self-relative normals
    shifts,            // what's different from THEIR own normal, lately
    connections: (m?.connections || []).map(c => ({ a: c.a, b: c.b, relation: c.relation, basis: c.basis, confidence: c.confidence })),
    patterns: (m?.structural || []).map(s => ({ type: s.type, basis: s.basis, confidence: s.confidence })),
    trajectory,        // directional word, never a score
    values, goals,
    ownedByYou: true,  // this record is theirs
  };
  meRecordCache[cacheKey] = { data, ts: Date.now() };
  res.json(data);
});

/* GET /api/me/context — the proactive "Me" context open-state (Individual
   Experience Phase 1–3). Reasoning-first, self-owned, privacy-safe. The kernel
   has "already worked": what changed since last visit, what it noticed
   (self-relative), the person's own open questions, and a prepared suggestion.
   Fully deterministic from the kernel — no AI key required, so it always works. */
app.get('/api/me/context', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const me = orgUsers[code]?.[userId];
  if (!me) return res.status(404).json({ error: 'Not found' });

  const now = Date.now();
  let m; try { m = _buildMemberIntelInput(code, me, now); } catch (_) { m = null; }
  const mem = _getMemory(code, userId);

  // Since last visit — deterministic. Count the person's OWN signals since then.
  const lastSeen = mem.lastSeen ? new Date(mem.lastSeen).getTime() : null;
  let newSince = 0;
  try {
    const mine = (orgSignals[code] || []).filter(s => s.subjectId === userId);
    newSince = lastSeen ? mine.filter(s => new Date(s.ts).getTime() > lastSeen).length : 0;
  } catch (_) {}

  // What the kernel NOTICED — self-relative shifts + structural patterns. Gated,
  // privacy-safe (labels/directions only, never raw text).
  const noticed = [];
  (m?.deviations || []).forEach(d => noticed.push({
    kind: 'shift', text: `${d.label} is ${d.direction} your usual lately`, confidence: d.confidence || 'tentative',
  }));
  (m?.structural || []).forEach(s => noticed.push({
    kind: 'pattern', text: intel.PATTERN_LABEL[s.type] || s.type, confidence: s.confidence || 'tentative',
  }));

  // The person's OWN open questions — self-owned memory threads (never leave them).
  const questions = (mem.openThreads || []).filter(t => !t.resolved).slice(0, 4)
    .map(t => ({ id: t.id, text: t.text }));

  // Prepared — one gentle, approvable suggestion from the top signal. Carries the
  // pattern type so approving it can close the loop (Learn) later.
  const prepared = [];
  const top = (m?.structural || [])[0] || (m?.deviations || [])[0];
  const activeFocusTexts = new Set((mem.focuses || []).filter(f => f.status === 'active').map(f => f.text));
  if (top) {
    const ptext = top.type ? (intel.DEFAULT_ACTION[top.type] || 'A small, supportive focus this week.') : 'A small, supportive focus this week.';
    if (!activeFocusTexts.has(ptext)) prepared.push({ text: ptext, type: top.type || null });
  }

  // Returning from a quiet spell — perceive it as a positive (they came back), and
  // acknowledge it warmly rather than treating the gap as a red mark.
  const lastAct = _memberLastActivity(code, userId, me.name);
  const quietDays = lastAct ? Math.floor((now - lastAct) / 86400000) : null;
  const returning = quietDays != null && quietDays >= 10;

  // Adaptive check-in — WHAT we ask adapts to where the person is (new, in a rough
  // patch, climbing, returning, or steady) instead of the same weekly prompt for
  // everyone. Deterministic and honest; the engine decides the question.
  const created = me.createdAt ? new Date(me.createdAt).getTime() : null;
  const tenureDays = created ? (now - created) / 86400000 : null;
  const topPat = (m?.structural || [])[0] || (m?.deviations || [])[0];
  const rough  = topPat && (topPat.severity === 'high' || /drop|concern|withdrawal|overload|decline/i.test(topPat.type || ''));
  const rising = (m?.structural || []).some(s => /improv|recover/i.test(s.type));
  let ask;
  if (returning)                         ask = "It's been a little while — no pressure at all. How are things going right now?";
  else if (tenureDays != null && tenureDays < 90) ask = "You're still settling in. What's one thing that's gone well, and one you're not sure about yet?";
  else if (rough)                        ask = "How are you holding up this week — honestly? No wrong answer.";
  else if (rising)                       ask = "You've been building nicely lately. What's been working that you want to keep doing?";
  else                                   ask = "What happened this week that's worth noting?";

  // A deterministic, honest opening line (no AI needed).
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  let opening;
  if (returning)           opening = `Good to see you back${quietDays >= 14 ? ` — it's been about ${quietDays} days` : ''}. No pressure; whenever you're ready, tell me how things are.`;
  else if (noticed.length) opening = `Since you were last here, I looked over your week — ${noticed.length === 1 ? "there's one thing" : `there are ${noticed.length} things`} worth a moment.`;
  else if (newSince > 0)   opening = `I've taken in ${newSince} new ${newSince === 1 ? 'thing' : 'things'} since your last visit and folded ${newSince === 1 ? 'it' : 'them'} into your picture.`;
  else                     opening = `Nothing new demands your attention right now. Add anything on your mind and I'll take it from there.`;

  // If a model is configured, let the Coach VOICE the opening warmly. The
  // judgment stays deterministic above; the LLM only turns it into words.
  // Privacy-safe: it sees labels/directions (never raw text) and is redacted.
  // Skipped for a return (the warm fixed line is the point) and with no key.
  if (ai.enabled() && !returning) {
    try {
      const obs = noticed.map(x => `- ${x.text}`).join('\n') || '- nothing notably different from their own normal lately';
      const sys = `You are IntelliQ, ${me.name}'s private mirror. Write ONE warm, brief opening (max 2 sentences) that makes them feel seen. Speak to them as "you". Self-relative, no scores, no advice, no invented specifics.`;
      const usr = `Observations about THEIR OWN recent patterns — never quote or state private detail:\n${obs}\n\nWrite the opening line only.`;
      const line = await ai.complete({ tier: 'micro', system: sys, user: usr, maxTokens: 90 });
      if (line && line.trim()) opening = privacy.redact(line.trim(), m?.privateStrings || []);
    } catch (_) { /* keep the deterministic opening */ }
  }

  // Mark this visit.
  mem.lastSeen = new Date().toISOString();
  scheduleSave();

  // Active focuses — approved work still in flight (the person's own commitments).
  const focuses = (mem.focuses || []).filter(f => f.status === 'active')
    .map(f => ({ id: f.id, text: f.text }));

  // Recognition ABOUT them from others (leader or peer) — the draw-in: they open
  // the app and find someone acknowledged them. Positive/attributed by design.
  const recognitions = (orgSignals[code] || [])
    .filter(s => s.subjectId === userId && s.source === 'observation' && s.data && s.data.kind === 'recognition')
    .sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 3)
    .map(s => ({ text: s.valueText || 'recognised your work', by: s.data.byName || 'Someone on your team', date: s.ts }));

  res.json({
    ok: true, name: me.name, greeting, opening, ask, returning, quietDays, newSince, noticed, questions, prepared, focuses, recognitions,
    understanding: agents.personModel.understanding(mem.model),
    trajectory: m?.memberTrajectory || null,
  });
});

/* POST /api/compose — the universal composer (one input; the AI reasons over it).
   v1: text. Stores as the person's own signal (sensitive by default), updates
   their Person Model, reasons over the updated picture, and returns what it
   understood + what it noticed. AI-optional: the "noticed" is real kernel output;
   the acknowledgement degrades to an honest deterministic line without a key. */
app.post('/api/compose', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const me   = orgUsers[code]?.[userId];
  const text = (req.body?.text || '').trim();
  const moodRaw = Number(req.body?.mood);
  const mood = Number.isInteger(moodRaw) && moodRaw >= 1 && moodRaw <= 5 ? moodRaw : null;  // optional
  if (!me) return res.status(404).json({ error: 'Not found' });
  if (!text && !mood) return res.status(400).json({ error: 'text or mood required' });
  if (text.length > 4000) return res.status(400).json({ error: 'too long' });

  // Is this a RETURN after a quiet spell? Measure the gap BEFORE recording the new
  // check-in. A return is a positive (they came back) — but a low-mood return from
  // someone who rarely logs is a higher-signal event, so we up-weight it.
  const priorLast = _memberLastActivity(code, userId, me.name);
  const returnGap = priorLast ? Math.floor((Date.now() - priorLast) / 86400000) : null;
  const isReturn  = returnGap != null && returnGap >= 10;

  // Store as the person's own check-in + signal. Free text is a personal
  // disclosure → sensitive by default (the privacy gate treats it as such).
  const moodLabels = { 1:'Rough', 2:'Low', 3:'Okay', 4:'Good', 5:'Great' };
  const key = userKey(code, userId);
  if (!memberCheckins[key]) memberCheckins[key] = [];
  const _ciRec = {
    id: 'ci_' + generateId(),
    memberName: me.name, text: text || null, mood, moodLabel: mood ? moodLabels[mood] : null,
    role: me.role || 'member', orgMode: '', date: new Date().toLocaleDateString('en-GB'), ts: new Date().toISOString(),
  };
  memberCheckins[key].push(_ciRec);
  // COMPATIBILITY WRITE (non-authoritative): a CONTENTLESS participation marker only —
  // no mood value, no text, no mood-derived weight (see the frozen contract).
  _emitCheckinParticipationSignal(code, userId, {
    firstReturn: isReturn, quietDays: returnGap,
    sensitivePresent: text ? privacy.isPrivate(privacy.classifyText(text, { source: 'checkin' })) : false,
  });
  // CONVERGENCE: the same check-in also becomes claim-bounded canonical evidence
  // (the authoritative source for reasoning; a hardship note stays owner-only-private).
  try { _canonicaliseCheckin(code, userId, _ciRec); } catch (_) {}

  // Update memory + Person Model (deterministic; wrapped so it can't break compose).
  try {
    const blob = text.toLowerCase();
    const watch = /worr|stress|struggl|overwhelm|tired|anx|heavy|burnout|exhaust|isolat|alone/.test(blob) ? text.slice(0, 140) : null;
    _updateUserMemory(code, userId, 'checkin', { watchOutFor: watch, themes: [] });
  } catch (_) {}

  // Reason freshly over the updated picture.
  const now = Date.now();
  let m; try { m = _buildMemberIntelInput(code, me, now); } catch (_) { m = null; }
  const noticed = [];
  (m?.deviations || []).slice(0, 2).forEach(d => noticed.push(`${d.label} is ${d.direction} your usual lately`));
  (m?.structural || []).slice(0, 2).forEach(s => noticed.push(intel.PATTERN_LABEL[s.type] || s.type));

  let acknowledgement = isReturn
    ? "Good to have you back — thanks for checking in after a bit of quiet. I've folded this in."
    : "Got it — I've added that and folded it into your picture.";
  if (ai.enabled() && text) {
    try {
      const first = (me.name || 'there').split(' ')[0];
      const memberRead = _studioMemberRead(code, userId, now);
      const noticedLine = noticed.length ? `What you just noticed about them (privacy-safe, self-relative): ${noticed.join('; ')}.` : '';
      const sys = [
        `You are IntelliQ, ${first}'s private mirror and coach — self-facing, warm, and honest. They just shared something. First show you genuinely understood. Then, IF it warrants it (a problem, a goal, a question, a hard week), give a specific, honest read grounded in what you actually know about them, and one or two concrete things that would help — never generic advice. If it's just a passing note, a warm sentence is enough; don't force coaching. MATCH THEIR TONE AND WORDS — mirror how they talk; if they're casual, be casual. Be real, never a platitude. 1-4 sentences. If you don't have the data to be specific, say so plainly rather than inventing. Speak to them as "you". Never a score as a verdict. No emojis.`,
        _worldviewDirective(code),
        _domainDirective(code, { userId }),
        memberRead ? `WHAT YOU KNOW ABOUT THEM (use it, be specific): ${memberRead}` : '',
        noticedLine,
      ].filter(Boolean).join('\n\n');
      const line = await ai.complete({ tier: 'reason', system: sys, user: `They wrote: "${text}".${mood ? ` Their mood: ${mood}/5.` : ''}\n\nRespond in their voice.`, maxTokens: 320 });
      // Self-facing (their own record, reflected back to them) — no redaction needed.
      if (line && line.trim()) acknowledgement = line.trim();
    } catch (_) { /* keep the deterministic acknowledgement */ }
  }

  res.json({
    ok: true,
    acknowledgement,
    noticed,
    understanding: agents.personModel.understanding(_getMemory(code, userId).model),
  });
});

/* POST /api/me/prepared/act — approve (or dismiss) a prepared suggestion.
   Approve → it becomes one of the person's own active focuses (the visible
   Recommend → Approve → Execute step). Self-scoped. */
app.post('/api/me/prepared/act', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { text, type, decision } = req.body || {};
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });
  if (!text || (decision !== 'approve' && decision !== 'dismiss')) {
    return res.status(400).json({ error: 'text and decision (approve|dismiss) required' });
  }
  const mem = _getMemory(code, userId);
  if (decision === 'approve') {
    mem.focuses = mem.focuses || [];
    mem.focuses.unshift({
      id: 'foc_' + generateId(), text: String(text).slice(0, 300), type: type || null,
      status: 'active', outcome: null, createdAt: new Date().toISOString(),
    });
  } else {
    // Dismiss teaches the Confidence Engine this kind of nudge didn't land for them.
    if (type) { try { _recordNoticeFeedback(code, type, 'dismiss'); } catch (_) {} }
  }
  mem.lastUpdated = new Date().toISOString();
  scheduleSave();
  res.json({ ok: true, focuses: (mem.focuses || []).filter(f => f.status === 'active').map(f => ({ id: f.id, text: f.text })) });
});

/* POST /api/me/focus/outcome — close the loop: report how an approved focus went.
   Observe outcome → LEARN. Resolves the focus and teaches the Confidence Engine
   (helped → useful; didn't → dismiss) for the pattern type that suggested it.
   Self-scoped. This is the lifecycle's final step (…Execute → Observe → Learn). */
app.post('/api/me/focus/outcome', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { focusId, outcome } = req.body || {};
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });
  if (!focusId || !['helped', 'no', 'mixed'].includes(outcome)) {
    return res.status(400).json({ error: 'focusId and outcome (helped|no|mixed) required' });
  }
  const mem = _getMemory(code, userId);
  const f = (mem.focuses || []).find(x => x.id === focusId);
  if (!f) return res.status(404).json({ error: 'focus not found' });

  f.status = 'done';
  f.outcome = outcome;
  f.resolvedAt = new Date().toISOString();

  // LEARN — feed the Confidence Engine so what genuinely helps this person
  // surfaces more, and what doesn't fades.
  if (f.type && outcome !== 'mixed') {
    try { _recordNoticeFeedback(code, f.type, outcome === 'helped' ? 'useful' : 'dismiss'); } catch (_) {}
  }
  mem.lastUpdated = new Date().toISOString();
  scheduleSave();
  res.json({ ok: true });
});

/* GET /api/me/export — the person downloads EVERYTHING we hold about them
   (GDPR Art 15/20 — right of access & portability). Strictly self-scoped:
   the caller only ever gets their own data. One honest, complete JSON. */
app.get('/api/me/export', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const me = orgUsers[code]?.[userId];
  if (!me) return res.status(404).json({ error: 'Not found' });
  const uKey = userKey(code, userId);
  const mKey = memberKey(code, me.name || '');

  const { passwordHash, ...profile } = me;   // never export the password hash
  const bundle = {
    exportedAt: new Date().toISOString(),
    note: 'This is all the personal data IntelliQ holds about you.',
    profile,
    goals:       memberGoals[uKey] || memberGoals[mKey] || null,
    checkins:    memberCheckins[uKey] || memberCheckins[mKey] || [],
    results:     memberResults[uKey] || memberResults[mKey] || [],
    // A person's own signals — BUT exclude third-party welfare/safeguarding
    // observations others recorded about them (sensitive, reporter-protected).
    // GDPR Art 15(4): access must not adversely affect the rights of others.
    signals: (orgSignals[code] || []).filter(s =>
      (s.subjectId === userId || s.createdBy === userId) &&
      !(s.source === 'observation' && s.createdBy !== userId && s.sensitivity !== 'normal')),
    notes:       Object.values(orgNotes).filter(n => n.orgCode === code && n.authorId === userId),
    aiMemory:    userAiProfiles[uKey] || null,   // their own model — theirs to see
    weekly:      Object.entries(weeklyAssessments)
                   .filter(([wk]) => wk.startsWith(code + ':'))
                   .flatMap(([, arr]) => (arr || []).filter(e => e.memberId === userId || (e.memberName || '').toLowerCase() === (me.name || '').toLowerCase())),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="intelliq-my-data.json"');
  res.json(bundle);
});

/* POST /api/observe — record an observation ABOUT someone (the "works even if the
   person never logs in" path + peer recognition). An observation is just a signal
   with subjectId = the person and createdBy = the observer, so the kernel already
   reasons over it by subject regardless of who authored it.

   Directions supported (all "considered" by the kernel):
     • leader → member (top-down)        • leader ↔ leader (peer)
     • member ↔ member (lateral)         • member → leader (upward / 360)
   Guardrails so it can't be weaponised:
     • RECOGNITION (positive) — anyone in the org may record it about anyone; it's
       surfaced to the subject (attribution kept). Dignity-preserving by design.
     • CONCERN / NOTE — requires the author to actually lead/see the subject (scope);
       stored SENSITIVE (informs the kernel, never shown to the subject or peers).
       A peer cannot file a public "concern" about someone (no pile-ons).
   Weight reflects the relationship: a leader's observation weighs more than a peer's. */
app.post('/api/observe', requireAuth, (req, res) => {
  const { orgCode: code, userId: authorId } = req.iqSession;
  const { subjectId, kind, text, metricLabel, metricValue } = req.body || {};
  const author  = orgUsers[code]?.[authorId];
  const subject = orgUsers[code]?.[subjectId];
  if (!author || !subject) return res.status(404).json({ error: 'Not found' });
  const k = ['recognition', 'concern', 'note'].includes(kind) ? kind : 'note';
  const body = String(text || '').trim();
  const mNum = metricValue != null && Number.isFinite(Number(metricValue)) ? Number(metricValue) : null;
  if (!body && mNum == null) return res.status(400).json({ error: 'text or a metric is required' });

  const leadsSubject = getVisibleUserIds(code, authorId).includes(subjectId) &&
    (_userHasPerm(code, authorId, 'view_insights') || _userHasPerm(code, authorId, 'view_members') ||
     author.role === 'superadmin' || subject.supervisorId === authorId);
  const isPeer = !leadsSubject;

  // Permission + handling by kind:
  //  • recognition — anyone, about anyone. Positive, surfaced to the subject.
  //  • concern     — a LEADER files a scoped concern (weight strong). A PEER may
  //    also raise one, but it is handled as a private SAFEGUARDING flag: low
  //    weight (needs corroboration — one voice can't mark someone), sensitive
  //    (informs the responsible leader only, never the subject or other peers),
  //    reporter-protected, optionally anonymous. "See something, say something"
  //    done safely — a peer cannot weaponise it, and a real welfare worry isn't lost.
  //  • note        — a neutral record, for someone who leads the person only.
  if (k === 'note' && isPeer) {
    return res.status(403).json({ error: 'Notes are for someone who leads this person. Use recognition, or raise a concern.' });
  }

  const anonymous     = req.body?.anonymous === true;
  const peerSafeguard = isPeer && k === 'concern';
  const sensitivity   = k === 'recognition' ? 'normal' : 'sensitive';
  const weightNum     = k === 'recognition' ? (leadsSubject ? 3 : 2)
                      : (leadsSubject ? 3 : 1);            // peer concern = low weight, corroboration-gated
  try {
    _emitSignalSafe(code, {
      subjectType: 'member', subjectId, source: 'observation', modality: 'text',
      valueNum: mNum, valueText: body || null,
      label: metricLabel ? String(metricLabel).slice(0, 120) : (k === 'recognition' ? 'Recognition' : 'Observation'),
      sensitivity, weightNum,
      data: {
        kind,
        // Attribution only for positive recognition; concerns protect the reporter.
        byName: (k === 'recognition' && !anonymous) ? author.name : undefined,
        byRole: author.role,
        peerReport: peerSafeguard || undefined,           // a peer welfare flag → corroboration-gated
        reporterProtected: (k !== 'recognition' || anonymous) || undefined,
      },
    }, authorId);
  } catch (e) { return res.status(500).json({ error: 'could not record' }); }

  // Recognition is surfaced to the subject — clear their proactive cache so it shows.
  if (k === 'recognition') {
    Object.keys(meRecordCache).forEach(key => { if (key.startsWith(code + ':')) meRecordCache[key] = null; });
  }
  scheduleSave();
  res.json({
    ok: true, kind: k,
    weight: weightNum >= 3 ? 'strong' : weightNum >= 2 ? 'medium' : 'low',
    routed: peerSafeguard
      ? 'Raised privately with the people responsible for their wellbeing. Thank you for looking out for them.'
      : (k === 'recognition' ? 'Shared with them.' : 'Recorded.'),
  });
});

/* ── CONSENT LEDGER + external app connectors (GDPR: informed, revocable) ─────
   The person owns their consent. Drawing data from an external app requires
   their explicit, recorded, revocable consent for that source — and it's always
   THEIR OWN data (self-scoped). Withdraw any time → disconnect + stop drawing. */

app.get('/api/me/consent', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  res.json({ ok: true, version: CONSENT_VERSION, consents: _getConsents(code, userId), connectors: connectors.list() });
});

app.post('/api/me/consent', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { scope, granted } = req.body || {};
  if (!scope || typeof scope !== 'string') return res.status(400).json({ error: 'scope required' });
  const c = _getConsents(code, userId);
  c[scope] = { granted: granted === true, at: new Date().toISOString(), version: CONSENT_VERSION };
  // Revoking an external scope disconnects that source too (stop drawing at once).
  if (granted !== true && scope.startsWith('external:')) {
    const src = scope.slice('external:'.length);
    const conn = connectedSources[_consentKey(code, userId)];
    if (conn && conn[src]) delete conn[src];
  }
  scheduleSave();
  res.json({ ok: true, scope, granted: c[scope].granted });
});

app.get('/api/me/sources', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const conn = connectedSources[_consentKey(code, userId)] || {};
  res.json({ ok: true, sources: connectors.list().map(s => ({
    ...s, consented: _hasConsent(code, userId, s.scope), connected: !!conn[s.id], lastPull: conn[s.id]?.lastPull || null,
    assistConsented:     s.assist     ? _hasConsent(code, userId, s.assist.scope)     : false,
    contributeConsented: s.contribute ? _hasConsent(code, userId, s.contribute.scope) : false,
  })) });
});

/* Connect an external app — REQUIRES the person's consent for its scope first.
   Self-scoped: you only ever connect YOUR OWN apps. (The OAuth token exchange is
   the provider-specific integration point; the consent + mapping are real now.) */
app.post('/api/me/connect', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const src = connectors.get(req.body?.source);
  if (!src) return res.status(400).json({ error: 'unknown source' });
  if (!_hasConsent(code, userId, src.scope)) {
    return res.status(403).json({ error: 'consent_required', scope: src.scope, message: `Grant consent for "${src.label}" before connecting.` });
  }
  const key = _consentKey(code, userId);
  const conn = connectedSources[key] = connectedSources[key] || {};
  conn[src.id] = { connectedAt: new Date().toISOString(), lastPull: null };
  scheduleSave();
  res.json({ ok: true, source: src.id, connected: true });
});

app.delete('/api/me/connect/:source', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const conn = connectedSources[_consentKey(code, userId)] || {};
  delete conn[req.params.source];
  scheduleSave();
  res.json({ ok: true, disconnected: req.params.source });
});

/* Draw data from a connected+consented source → universal signals (self only).
   Accepts `data` (raw provider export) — the real-time OAuth auto-fetch is the
   integration point. Data minimisation: connectors map to numeric signals only,
   never raw content. */
app.post('/api/me/sources/pull', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const src = connectors.get(req.body?.source);
  if (!src) return res.status(400).json({ error: 'unknown source' });
  if (!_hasConsent(code, userId, src.scope)) return res.status(403).json({ error: 'consent_required', scope: src.scope });
  const conn = connectedSources[_consentKey(code, userId)] || {};
  if (!conn[src.id]) return res.status(400).json({ error: 'not_connected' });

  const raw = Array.isArray(req.body?.data) ? req.body.data.slice(0, 2000) : [];   // integration point / manual export
  let signals = [];
  try { signals = src.map(raw) || []; } catch (_) { signals = []; }
  let emitted = 0;
  for (const s of signals) {
    if (!Number.isFinite(s.valueNum)) continue;
    try {
      _emitSignalSafe(code, {
        subjectType: 'member', subjectId: userId, source: 'metric', modality: 'data',
        valueNum: s.valueNum, label: s.label, ts: s.ts, sensitivity: 'normal',
        data: { connector: src.id, primitive: s.primitive, valence: s.valence },
      }, userId);
      emitted++;
    } catch (_) {}
  }
  conn[src.id].lastPull = new Date().toISOString();
  scheduleSave();
  res.json({ ok: true, source: src.id, imported: emitted });
});

/* ── CONTRIBUTE tier — the distillation membrane ──────────────────────────────
   The third, separate consent: let what the assistant sees be turned into NUMBERS
   for the person's own growth record (fused by the kernel with how they feel).
   Four safeguards, all enforced here:
     1. Explicit, separate permission — the connector's OWN `contribute.scope`
        (never implied by insight or assist consent).
     2. Numbers cross, content never — we run the connector's map() and store ONLY
        {label, valueNum, ts}; the raw payload is dropped, never persisted.
     3. Visible + revocable — every crossing is flagged `contributed:true` and the
        person can list exactly what crossed via GET /api/me/contributions.
     4. Org-safe — contributed signals are the same minimised numbers as insight;
        the org still only ever sees aggregate patterns, never content. */
app.post('/api/me/sources/contribute', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const src = connectors.get(req.body?.source);
  if (!src || !src.contribute) return res.status(400).json({ error: 'source does not support contribute' });
  if (!_hasConsent(code, userId, src.contribute.scope)) {
    return res.status(403).json({ error: 'consent_required', scope: src.contribute.scope, message: `Turn on Contribute for "${src.label}" first.` });
  }
  const raw = Array.isArray(req.body?.data) ? req.body.data.slice(0, 2000) : [];
  let distilled = [];
  try { distilled = (src.map(raw) || []).filter(s => Number.isFinite(s.valueNum)); } catch (_) { distilled = []; }
  // SAFEGUARD 2: only the mapped numbers are emitted — `raw` is never stored.
  const crossed = [];
  for (const s of distilled) {
    try {
      _emitSignalSafe(code, {
        subjectType: 'member', subjectId: userId, source: 'contributed', modality: 'data',
        valueNum: s.valueNum, label: s.label, ts: s.ts, sensitivity: 'normal',
        contributed: true, data: { connector: src.id, primitive: s.primitive, valence: s.valence, contributed: true },
      }, userId);
      crossed.push({ label: s.label, valueNum: s.valueNum, ts: s.ts });
    } catch (_) {}
  }
  scheduleSave();
  // Return exactly what crossed — the audit the person sees immediately.
  res.json({ ok: true, source: src.id, contributed: crossed.length, crossed });
});

/* GET /api/me/contributions — the visible audit: exactly the NUMBERS that the
   Contribute tier moved into your record (never any content). Self-only. */
app.get('/api/me/contributions', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = (orgSignals[code] || [])
    .filter(s => (s.subjectId === userId || s.createdBy === userId) && (s.contributed === true || s.data?.contributed === true || s.source === 'contributed'))
    .map(s => ({ label: s.valueText ? undefined : s.label || s.data?.connector, connector: s.data?.connector || null, valueNum: s.valueNum, ts: s.ts }))
    .filter(x => Number.isFinite(x.valueNum))
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 200);
  res.json({ ok: true, contributions: list });
});

/* ── The assistant: draft → APPROVE → execute. IntelliQ can act on your behalf
   (schedule a meeting, send a generic email) — but ONLY after you approve, and
   ONLY with write consent for that action. Nothing outward happens unilaterally.
   The provider call (Google Calendar / Microsoft Graph / mail) is the OAuth
   integration point; the draft + approval + consent gate are real today. */

app.get('/api/me/actions', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = (pendingActions[_consentKey(code, userId)] || []).filter(a => a.status === 'pending');
  res.json({ ok: true, actions: list, canDo: connectors.listActions() });
});

/* Draft an action (proposed by the user, or by IntelliQ on their behalf). Nothing
   is performed here — it becomes a pending item awaiting the person's approval. */
app.post('/api/me/actions', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const def = connectors.getAction(req.body?.action);
  if (!def) return res.status(400).json({ error: 'unknown action' });
  const prepared = def.prepare(req.body?.params || {});
  if (!prepared.valid) return res.status(400).json({ error: prepared.error || 'invalid params' });
  const key = _consentKey(code, userId);
  const item = { id: 'act_' + generateId(), action: def.id, writeScope: def.writeScope,
    summary: prepared.summary, payload: prepared.payload, status: 'pending', createdAt: new Date().toISOString() };
  (pendingActions[key] = pendingActions[key] || []).push(item);
  scheduleSave();
  res.json({ ok: true, action: { id: item.id, action: item.action, summary: item.summary, needsConsent: !_hasConsent(code, userId, def.writeScope) } });
});

/* Approve → EXECUTE. Requires write consent for the action's scope. The actual
   provider send is stubbed until OAuth; everything up to it is enforced. */
app.post('/api/me/actions/:id/approve', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = pendingActions[_consentKey(code, userId)] || [];
  const item = list.find(a => a.id === req.params.id && a.status === 'pending');
  if (!item) return res.status(404).json({ error: 'action not found' });
  if (!_hasConsent(code, userId, item.writeScope)) {
    return res.status(403).json({ error: 'consent_required', scope: item.writeScope, message: `Grant ${item.writeScope} to let IntelliQ do this for you.` });
  }
  // ── Provider integration point (OAuth write). Stubbed: mark executed. ──
  item.status = 'done'; item.executedAt = new Date().toISOString();
  item.result = 'Executed (provider integration pending — no external send in this build).';
  scheduleSave();
  res.json({ ok: true, id: item.id, status: 'done', result: item.result });
});

app.post('/api/me/actions/:id/reject', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = pendingActions[_consentKey(code, userId)] || [];
  const item = list.find(a => a.id === req.params.id && a.status === 'pending');
  if (item) { item.status = 'rejected'; scheduleSave(); }
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ASSESSMENTS — a leader defines a way they want something done (a spreadsheet,
   a film breakdown, a way of playing), assigns it, the assignee fills it and
   returns it, the leader reviews. Completions feed the kernel as signals so an
   assessment is not a dead form — it becomes part of the person's growth record.
   TUTORIALS — pinned how-to references anyone can look back at.
   ═══════════════════════════════════════════════════════════════════════════ */
const ASSESS_KINDS = ['spreadsheet', 'film', 'play', 'skill', 'general'];
const _shortId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function _publicAssignment(a) {
  return { id: a.id, templateId: a.templateId, title: a.title, kind: a.kind, fields: a.fields,
    description: a.description || '', guidance: a.guidance || '',
    assignerName: a.assignerName, assigneeName: a.assigneeName, assigneeId: a.assigneeId,
    status: a.status, response: a.response || {}, note: a.note || '', feedback: a.feedback || '',
    score: a.score ?? null, assignedAt: a.assignedAt, submittedAt: a.submittedAt || null, returnedAt: a.returnedAt || null };
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE STUDIO — a person's conversation-first space. One chat with IntelliQ that
   holds three things: work assigned to them, pins sent to them, and their own
   planning. They can type, drop in a file or photo, or record a voice note — and
   everything they put in becomes a private kernel signal, so planning counts.
   ═══════════════════════════════════════════════════════════════════════════ */
function _studioThread(code, userId) {
  const k = `${code}:${userId}`;
  return studioThreads[k] || (studioThreads[k] = { messages: [], plans: [] });
}

/* What the Studio REMEMBERS, distilled for reasoning: what has tended to work and
   what hasn't — for this org and this person — so IntelliQ reasons from evidence,
   not a blank slate. Privacy-safe and visibility-scoped: titles/approaches and
   aggregate direction only, never another individual's private detail. This is the
   "knowing your org in and out — what's worked, what hasn't, and why" surface. */
function _studioMemoryContext(code, userId) {
  const parts = [];
  // What returned work has tended to help / precede a dip (caller's own scope).
  let oc; try { oc = _assessmentOutcomes(code, userId, Date.now()); } catch (_) { oc = { working: [], revisit: [] }; }
  if (oc.working?.length) parts.push(`Has tended to help: ${oc.working.slice(0, 4).map(w => `"${w.title}"${w.avgScore != null ? ` (avg ${w.avgScore})` : ''}`).join(', ')}.`);
  if (oc.revisit?.length) parts.push(`Has tended to precede a dip: ${oc.revisit.slice(0, 3).map(r => `"${r.title}"`).join(', ')}.`);
  // Approaches the org has learned work (aggregate, measured outcomes, no names).
  let learn; try { learn = _learningByPattern(code); } catch (_) { learn = {}; }
  const worked = Object.entries(learn || {})
    .filter(([, v]) => v && v.action && v.total >= 2 && v.positive / v.total >= 0.6)
    .map(([pt, v]) => `for ${intel.PATTERN_LABEL[pt] || pt}, ${v.action} (helped ${v.positive}/${v.total})`);
  if (worked.length) parts.push(`Approaches that have worked here before: ${worked.slice(0, 3).join('; ')}.`);
  // This person's own footing — recurring strengths + plans they've completed.
  const strengths = _personStrengths(code, userId);
  if (strengths.length) parts.push(`Their recurring strengths: ${strengths.join(', ')}.`);
  const th = studioThreads[`${code}:${userId}`];
  const done = th ? th.plans.filter(p => p.done).length : 0;
  if (done) parts.push(`They've completed ${done} plan${done > 1 ? 's' : ''} in the workspace so far.`);
  return parts.join(' ');
}

/* Pull structured numbers out of freeform text / CSV WITHOUT any AI — a spreadsheet
   or a pasted stat line becomes real metrics. "label: 45", "label = 45", "label,45",
   or a two-column CSV row all count. Nothing plugged in gets thrown away. */
function _extractMetricsFromText(text) {
  const out = [];
  String(text || '').split(/\r?\n/).slice(0, 300).forEach(line => {
    let label = null, value = null;
    let m = line.match(/^\s*([A-Za-z][A-Za-z0-9 _\-\/%().]{1,46}?)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*[%a-zA-Z\/]{0,6}\s*$/);
    if (m) { label = m[1]; value = Number(m[2]); }
    else {
      const c = line.split(',');
      if (c.length === 2 && /[A-Za-z]/.test(c[0]) && /^-?\d+(?:\.\d+)?$/.test(c[1].trim())) { label = c[0]; value = Number(c[1].trim()); }
    }
    if (label && Number.isFinite(value)) {
      const clean = label.trim().replace(/\s+/g, ' ').slice(0, 60);
      if (clean && !/^\d/.test(clean)) out.push({ label: clean, value });
    }
  });
  return out.slice(0, 40);
}

/* Named team-import: a coach uploads a table with a name/email column and metric
   columns; each row is mapped to the right member (within the uploader's visible
   scope) and every numeric column becomes a signal for THAT person. One upload →
   data across the whole squad. Returns a summary, or null if it isn't a roster
   table. Only members the uploader can legitimately see are written to. */
function _importTeamTable(code, uploaderId, text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;                       // need a header + ≥2 rows
  const rows = lines.slice(0, 400).map(l => l.split(',').map(c => c.trim()));
  const header = rows[0].map(h => h.toLowerCase());
  const emailCol = header.findIndex(h => /e-?mail/.test(h));
  const nameCol  = header.findIndex(h => /\b(name|player|member|athlete|person|employee|student)\b/.test(h));
  const keyCol = emailCol >= 0 ? emailCol : nameCol;
  if (keyCol < 0) return null;
  const dataRows = rows.slice(1);
  const numCols = [];
  header.forEach((h, ci) => {
    if (ci === keyCol) return;
    const vals = dataRows.map(r => r[ci]).filter(v => v);
    const numeric = vals.filter(v => /^-?\d+(?:\.\d+)?$/.test(v)).length;
    if (vals.length >= 2 && numeric / vals.length >= 0.6) numCols.push(ci);
  });
  if (!numCols.length) return null;
  const visible = new Set(getVisibleUserIds(code, uploaderId));
  const users = orgUsers[code] || {};
  const findId = (val) => {
    const v = val.toLowerCase();
    if (emailCol >= 0) { const id = Object.keys(users).find(k => (users[k].email || '').toLowerCase() === v); if (id) return id; }
    return Object.keys(users).find(k => (users[k].name || '').toLowerCase().trim() === v.trim()) || null;
  };
  let importedMembers = 0, totalMetrics = 0; const unmatched = [];
  dataRows.forEach(r => {
    const keyVal = (r[keyCol] || '').trim();
    if (!keyVal) return;
    const uid = findId(keyVal);
    if (!uid || !visible.has(uid)) { unmatched.push(keyVal.slice(0, 40)); return; }
    let any = false;
    numCols.forEach(ci => {
      const v = Number(r[ci]); if (!Number.isFinite(v)) return;
      _emitSignalSafe(code, {
        subjectType: 'member', subjectId: uid, source: 'metric', modality: 'data',
        valueNum: v, label: (header[ci] || 'Metric').slice(0, 80), sensitivity: 'normal',
        data: { imported: true, extracted: true },
      }, uploaderId);
      totalMetrics++; any = true;
    });
    if (any) importedMembers++;
  });
  if (!importedMembers) return null;
  scheduleSave();
  return { importedMembers, totalMetrics, columns: numCols.map(ci => header[ci]).slice(0, 8), unmatched: unmatched.slice(0, 6) };
}

/* What IntelliQ actually KNOWS about this person, so its coaching is grounded in
   their record — their aim, their reviewed strengths and development areas, where
   they're trending, and their recent results. This is their OWN data in their OWN
   workspace, so it's used in full (never another person's private detail). */
function _studioMemberRead(code, userId, now) {
  const u = orgUsers[code]?.[userId];
  if (!u) return '';
  const parts = [];
  const g = memberGoals[userKey(code, userId)];
  if (g) {
    const aim = g.mainGoals || g.goal; if (aim) parts.push(`Their stated aim: ${String(aim).slice(0, 140)}.`);
    if (g.identity) parts.push(`Who they're trying to be: ${String(g.identity).slice(0, 100)}.`);
  }
  const strengths = _personStrengths(code, userId);
  if (strengths.length) parts.push(`Recurring strengths in their reviews: ${strengths.join(', ')}.`);
  const devCount = {};
  (orgSignals[code] || []).forEach(s => {
    if (s.subjectId !== userId || s.source !== 'assessment') return;
    const dm = (s.valueText || '').match(/Development:\s*([^·]+)/i);
    if (dm) dm[1].split(',').forEach(x => { const v = x.trim().toLowerCase(); if (v) devCount[v] = (devCount[v] || 0) + 1; });
  });
  const dev = Object.entries(devCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  if (dev.length) parts.push(`Development areas they've been working on: ${dev.join(', ')}.`);
  let dir = 'steady'; try { dir = _memberTrajDir(code, u, now); } catch (_) {}
  parts.push(`Recent trajectory: ${dir === 'up' ? 'trending up' : dir === 'down' ? 'in a dip' : 'steady'}.`);
  // Recent reviews consume the COMPLETE canonical Assessment (score kept with its scale +
  // basis), not a naked number pulled from the raw record. Falls back to the raw record only
  // if nothing has been canonicalised yet (backwards compatible during migration).
  let reviews = [];
  try { reviews = _assessmentEvidenceFor(code, userId, { purpose: 'personal_assistance', viewerId: userId }).slice(-4); } catch (_) {}
  if (reviews.length) {
    parts.push(`Recent reviews: ${reviews.map(a => `"${a.title}" (${a.score}${a.scoreScale ? '/' + String(a.scoreScale).split('-').pop() : ''})`).join(', ')}.`);
  } else {
    const returned = (assessmentAssignments[code] || []).filter(a => a.assigneeId === userId && a.status === 'returned' && Number.isFinite(a.score)).slice(-4);
    if (returned.length) parts.push(`Recent reviews: ${returned.map(a => `"${a.title}" (${a.score})`).join(', ')}.`);
  }
  return parts.join(' ');
}

/* GET /api/studio — the whole conversation-first surface for the caller. */
app.get('/api/studio', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const th = _studioThread(code, userId);
  const all = assessmentAssignments[code] || [];
  const assigned = all.filter(a => a.assigneeId === userId && a.status !== 'returned').map(_publicAssignment);
  const pins = (orgTutorials[code] || []).map(t => ({ id: t.id, title: t.title, kind: t.kind, createdByName: t.createdByName }));
  const me = orgUsers[code]?.[userId];
  const first = (me?.name || 'there').split(' ')[0];
  const openPlans = th.plans.filter(p => !p.done);
  // A PROACTIVE status, recomputed every visit — Studio remembers where you left
  // off ("you completed two, one's still waiting") instead of starting cold.
  const weekAgo = Date.now() - 7 * 86400000;
  const doneRecently = th.plans.filter(p => p.done && p.ts && new Date(p.ts).getTime() > weekAgo - 30 * 86400000).length;
  const parts = [];
  if (openPlans.length) parts.push(`${openPlans.length} plan${openPlans.length > 1 ? 's' : ''} still open`);
  if (doneRecently)     parts.push(`${doneRecently} completed`);
  if (assigned.length)  parts.push(`${assigned.length} assigned thing${assigned.length > 1 ? 's' : ''} waiting`);
  const proactive = parts.length
    ? `Picking up where you left off — ${parts.join(', ')}. What should we focus on today?`
    : null;
  // The first-message greeting only for a brand-new Studio.
  let opening = null;
  if (!th.messages.length) {
    const bits = [];
    if (assigned.length) bits.push(`${assigned.length} thing${assigned.length > 1 ? 's' : ''} assigned to you`);
    if (openPlans.length) bits.push(`${openPlans.length} plan${openPlans.length > 1 ? 's' : ''} in progress`);
    opening = `Hi ${first} — this is your workspace. ${bits.length ? `You've got ${bits.join(' and ')}. ` : ''}Tell me what you want to work on, think a plan out loud, or drop in a file, photo, or voice note. What's on your mind?`;
  }
  res.json({ ok: true, opening, proactive, messages: th.messages.slice(-40), plans: openPlans, assigned, pins, canTranscribe: ai.canTranscribe() });
});

/* POST /api/studio/chat — talk to IntelliQ in the Studio. Knows the caller's
   assigned work, pins, and plans; replies conversationally and can help them shape
   a plan. Every user turn (text or media) is persisted AND emitted as a private
   kernel signal, so what they plan and capture here informs their own trajectory. */
app.post('/api/studio/chat', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const message = String(req.body?.message || '').slice(0, 4000).trim();
  const media = (req.body?.media && typeof req.body.media === 'object')
    ? { name: String(req.body.media.name || '').slice(0, 160), kind: String(req.body.media.kind || 'file').slice(0, 24) } : null;
  // The evidence itself (base64 + mimetype), kept only for this request so IntelliQ
  // can actually READ it — never persisted raw in the thread.
  const att = (req.body?.attachment && typeof req.body.attachment === 'object') ? req.body.attachment : null;
  const savePlan = req.body?.savePlan === true;
  if (!message && !media) return res.status(400).json({ error: 'message or media required' });

  const th = _studioThread(code, userId);
  th.messages.push({ role: 'user', text: message, ts: new Date().toISOString(), media: media || undefined });

  // Planning counts: the caller's own input becomes a private activity signal in the
  // kernel (categorical/short — the org only ever sees aggregate patterns, never this).
  // Sensitivity is CLASSIFIED, never hard-coded: a hardship disclosed in a MyWorkspace
  // capture must inform reasoning but stay under the same privacy policy as a check-in.
  if (message || media) _emitSignalSafe(code, {
    subjectType: 'member', subjectId: userId, source: 'studio', modality: media ? 'media' : 'text',
    valueText: ((media ? `[${media.kind}] ` : '') + (message || 'shared a file')).slice(0, 200),
    label: 'Studio input', primitive: 'activity',
    sensitivity: message ? privacy.classifyText(message, { source: 'workspace' }) : 'normal',
    data: { studio: true, media: media ? media.kind : undefined },
  }, userId);

  const me = orgUsers[code]?.[userId];
  const first = (me?.name || 'there').split(' ')[0];
  const all = assessmentAssignments[code] || [];
  const assignedTitles = all.filter(a => a.assigneeId === userId && a.status !== 'returned').map(a => a.title);
  const openPlans = th.plans.filter(p => !p.done).map(p => p.text);

  // ── If evidence was attached, READ it AND DECIPHER IT INTO NUMBERS. Reading gives
  //    a grounded reply; the extracted metrics become real numeric signals the kernel
  //    reasons over (trajectory, load, capability). Nothing plugged in is thrown away.
  let understanding = '';
  let understandNote = '';
  let capturedMetrics = [];   // [{label, value}]
  let teamImport = null;
  if (att && att.data) {
    const mime = String(att.mimetype || '').toLowerCase();
    const fname = String(att.name || media?.name || '').toLowerCase();
    const isXlsx = /spreadsheetml|excel/.test(mime) || /\.xlsx?$/.test(fname);
    const isDocx = /wordprocessingml/.test(mime) || /\.docx?$/.test(fname);
    let kind = null, payload = null, plainText = null;
    if (mime.startsWith('image/')) { kind = 'image'; payload = { type: 'image', mimetype: mime, data: att.data }; }
    else if (mime === 'application/pdf') { kind = 'pdf'; payload = { type: 'pdf', data: att.data }; }
    else if (isXlsx) {
      // Excel → CSV-style text, read with no dependencies, then the same pipeline.
      kind = 'text';
      try { plainText = office.xlsxToText(Buffer.from(att.data, 'base64')); if (plainText) payload = { type: 'text', text: plainText }; } catch (_) {}
      if (!plainText) understandNote = 'I couldn\'t read that Excel file — re-save it as .xlsx or export a CSV and I\'ll read it in full.';
    }
    else if (isDocx) {
      kind = 'text';
      try { plainText = office.docxToText(Buffer.from(att.data, 'base64')); if (plainText) payload = { type: 'text', text: plainText }; } catch (_) {}
      if (!plainText) understandNote = 'I couldn\'t read that Word file — re-save it as .docx or paste the text.';
    }
    else if (mime.startsWith('text/') || mime === 'application/csv') {
      kind = 'text';
      try { plainText = Buffer.from(att.data, 'base64').toString('utf8'); payload = { type: 'text', text: plainText }; } catch (_) { payload = null; }
    }

    // A table with a name/email column + metric columns → import across the squad,
    // one row per person (leaders only, and only for people they can see).
    if (plainText && _isLeader(code, userId)) {
      try { teamImport = _importTeamTable(code, userId, plainText); } catch (_) { teamImport = null; }
    }

    // A roster import already wrote the numbers per-person. Otherwise, decipher this
    // as ONE person's data (deterministic — no AI key needed).
    if (teamImport) {
      const cols = (teamImport.columns || []).join(', ');
      understanding = `Imported ${teamImport.totalMetrics} data point${teamImport.totalMetrics !== 1 ? 's' : ''} across ${teamImport.importedMembers} ${teamImport.importedMembers > 1 ? 'people' : 'person'}${cols ? ` (${cols})` : ''} — each is now on that person's own record, so it'll shape what I notice for them.${teamImport.unmatched.length ? ` I couldn't match: ${teamImport.unmatched.join(', ')} — check the name or email.` : ''}`;
    } else if (plainText) {
      capturedMetrics = _extractMetricsFromText(plainText);
    }

    if (teamImport) {
      /* handled above — skip single-person understanding */
    } else if (!kind) {
      understandNote = 'I can read images, PDFs, Excel, Word, and text/CSV. This type I couldn\'t open — paste the text and I\'ll take it.';
    } else if (!ai.canUnderstand(kind) && !capturedMetrics.length && !understandNote) {
      understandNote = kind === 'pdf'
        ? 'Reading PDFs needs a Claude key — it\'s captured here. Send it as an image or text, or tell me what\'s in it, and I\'ll work with that.'
        : 'Reading files needs an AI key configured — it\'s captured here, but tell me what\'s in it and I\'ll work with that for now.';
    } else if (ai.canUnderstand(kind)) {
      try {
        const emem = _studioMemoryContext(code, userId);
        const sys = [
          `You are IntelliQ, reading a piece of evidence ${first} shared in their workspace (a ${kind}). Understand what it actually shows and how it bears on their work; connect it to what's worked before when relevant (see MEMORY). ALSO extract every number worth tracking — a stat, a score, a distance, a count, a percentage — faithfully, never invented. Return JSON only: {"reply": string (2-4 sentences, warm and specific, what you see and one useful next step), "observations": array of up to 3 short factual notes, "metrics": array of up to 15 {"label": short string, "value": number}}. No emojis.`,
          _worldviewDirective(code),
          _domainDirective(code, { userId }),
          emem ? `MEMORY — what's worked / hasn't: ${emem}` : '',
        ].filter(Boolean).join('\n\n');
        const raw = await ai.understand({ system: sys, prompt: `${message ? `They said: "${message}". ` : ''}Read the attached ${kind} ("${att.name || media?.name || 'file'}"), respond, and pull out the numbers.`, media: payload, maxTokens: 900 });
        const parsed = ai.parseJSON(raw) || {};
        understanding = String(parsed.reply || raw || '').slice(0, 1200);
        (Array.isArray(parsed.observations) ? parsed.observations.slice(0, 3) : []).forEach(o => _emitSignalSafe(code, {
          subjectType: 'member', subjectId: userId, source: 'studio', modality: 'media',
          valueText: `From ${kind}: ${String(o).slice(0, 160)}`, label: 'Studio evidence', primitive: 'observation', sensitivity: 'normal',
          data: { studio: true, evidence: kind },
        }, userId));
        // Merge AI-read metrics (dedupe by label; deterministic ones already found win).
        const seen = new Set(capturedMetrics.map(x => x.label.toLowerCase()));
        (Array.isArray(parsed.metrics) ? parsed.metrics : []).forEach(mm => {
          const label = String(mm?.label || '').trim().slice(0, 60); const value = Number(mm?.value);
          if (label && Number.isFinite(value) && !seen.has(label.toLowerCase())) { seen.add(label.toLowerCase()); capturedMetrics.push({ label, value }); }
        });
      } catch (_) { if (!capturedMetrics.length) understandNote = 'I had the file but couldn\'t read it just now — try again, or tell me what\'s in it.'; }
    }

    // Emit every captured number as a real metric signal — this is the "data in" that
    // the kernel then trends, correlates, and reasons over going forward.
    capturedMetrics = capturedMetrics.slice(0, 20);
    capturedMetrics.forEach(mm => _emitSignalSafe(code, {
      subjectType: 'member', subjectId: userId, source: 'metric', modality: 'data',
      valueNum: mm.value, label: mm.label.slice(0, 80), sensitivity: 'normal',
      data: { studio: true, evidence: kind, extracted: true, name: att.name || media?.name || null },
    }, userId));
    if (capturedMetrics.length) {
      const preview = capturedMetrics.slice(0, 4).map(mm => `${mm.label} ${mm.value}`).join(', ');
      const tail = `I pulled ${capturedMetrics.length} number${capturedMetrics.length > 1 ? 's' : ''} from that${preview ? ` — ${preview}${capturedMetrics.length > 4 ? '…' : ''}` : ''} — I'm tracking ${capturedMetrics.length > 1 ? 'them' : 'it'} now, so they'll shape what I notice going forward.`;
      understanding = understanding ? `${understanding} ${tail}` : tail;
    }
  }

  // Deterministic, always-works reply.
  let reply = understanding
    ? understanding
    : media
    ? `Got it — I've saved ${media.name || 'that'} to your workspace${understandNote ? '. ' + understandNote : ' and noted it. Want me to turn it into a plan, or add it to something you\'re already working on?'}`
    : savePlan
    ? `Saved that as a plan. Want to break it into steps, or leave it as-is for now?`
    : assignedTitles.length
    ? `Noted. You've also got "${assignedTitles[0]}" assigned — want to work on that, or keep going with this?`
    : `Noted. Want me to help you shape this into a plan you can act on?`;

  // Plans emerge from the conversation — the model decides when a turn contains a
  // plan worth keeping, so it feels like "I've turned that into a plan", not a form.
  let plansToSave = (savePlan && message) ? [message.slice(0, 400)] : [];
  if (ai.enabled() && message && !understanding) {
    const history = th.messages.slice(-10).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text || (m.media ? `[shared ${m.media.kind}]` : '') }));
    const ctx = [
      assignedTitles.length ? `Assigned to them right now: ${assignedTitles.slice(0, 5).join('; ')}.` : 'Nothing is assigned to them right now.',
      openPlans.length ? `Plans they're working on: ${openPlans.slice(0, 5).join('; ')}.` : 'No saved plans yet.',
    ].filter(Boolean).join(' ');
    const memberRead = _studioMemberRead(code, userId, Date.now());
    const memory = _studioMemoryContext(code, userId);
    const grounding = [
      _worldviewDirective(code),
      _domainDirective(code, { userId }),
      memberRead ? `WHAT YOU KNOW ABOUT ${first.toUpperCase()} (use it — be specific): ${memberRead}` : '',
      memory ? `WHAT'S WORKED HERE BEFORE (reason from this): ${memory}` : '',
      `Also: ${ctx}`,
    ].filter(Boolean).join('\n\n');
    const system = [
      `You are IntelliQ, ${first}'s coach in their private workspace — a sharp, supportive thinking partner who actually knows their record. When they raise something (a weakness, a goal, a question), give a GENUINELY USEFUL, specific answer: name what you actually see in their data, connect it to their development areas, strengths, and what's worked here before, and give two or three concrete next steps they can start this week. Be a real coach — substantive but tight (3-6 sentences), warm, direct, plainly said. MATCH THEIR TONE AND WORDS: mirror how they actually talk — if they're casual or use slang, be casual back; if they're formal, meet that. Don't sound like a corporate memo. Ground everything in what you know; if you genuinely lack the data to be specific, say so honestly and ask the ONE question that would let you help. When the exchange lands on something concrete to do, capture it as 1-3 short, checkable steps in "planSteps" and set savePlan true, phrasing your reply so it feels natural — never make them click. Otherwise planSteps is empty. Return JSON only: {"reply": string, "savePlan": boolean, "planSteps": array of short imperative strings}. Never invent facts about them or the team. No emojis.`,
      grounding,
    ].join('\n\n');
    try {
      const out = await ai.completeJSON({ tier: 'reason', maxTokens: 650, system, messages: history, schema: ['reply'] });
      if (out && out.reply) {
        reply = String(out.reply).slice(0, 1400).trim();
        const steps = Array.isArray(out.planSteps) ? out.planSteps : (out.planText ? [out.planText] : []);
        if (out.savePlan === true) steps.slice(0, 3).forEach(s => { const t = String(s || '').slice(0, 300).trim(); if (t) plansToSave.push(t); });
      } else {
        // JSON didn't parse — still give a real, grounded answer (just no structured
        // plan capture this turn) rather than dropping to the thin deterministic line.
        const line = await ai.complete({ tier: 'reason', maxTokens: 500, system: `You are IntelliQ, ${first}'s coach. Give a specific, useful, grounded answer in 3-6 sentences with two or three concrete next steps. No emojis.\n\n${grounding}`, messages: history });
        if (line && line.trim()) reply = line.trim().slice(0, 1400);
      }
    } catch (_) { /* deterministic reply stands */ }
  }

  plansToSave.forEach(t => th.plans.push({ id: _shortId(), text: t, ts: new Date().toISOString(), done: false }));
  const planToSave = plansToSave.length ? plansToSave[0] : null;

  th.messages.push({ role: 'assistant', text: reply, ts: new Date().toISOString() });
  scheduleSave();
  res.json({ ok: true, reply, planSaved: !!planToSave, understood: !!understanding, imported: teamImport || undefined, metricsCaptured: capturedMetrics.length });
});

/* POST /api/studio/plan/:id — mark one of the caller's plans done (or reopen). */
app.post('/api/studio/plan/:id', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const th = _studioThread(code, userId);
  const p = th.plans.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  p.done = req.body?.done !== false;
  if (p.done) _emitSignalSafe(code, {
    subjectType: 'member', subjectId: userId, source: 'studio', modality: 'text',
    valueText: `Completed a plan: ${p.text.slice(0, 120)}`, label: 'Studio plan done',
    primitive: 'activity', sensitivity: 'normal', data: { studio: true, planDone: true },
  }, userId);
  scheduleSave();
  res.json({ ok: true, plans: th.plans.filter(x => !x.done) });
});

/* POST /api/studio/transcribe — voice note → text (OpenAI Whisper). Only available
   when an OpenAI key is set; otherwise it degrades honestly (the caller is told to
   type it or that transcription needs a key) rather than fabricating a transcript. */
app.post('/api/studio/transcribe', requireAuth, async (req, res) => {
  if (!ai.canTranscribe()) return res.status(503).json({ error: 'transcription-unavailable', note: 'Voice transcription needs an OpenAI key. You can type your note for now.' });
  const b64 = String(req.body?.audio || '');
  const mimetype = String(req.body?.mimetype || 'audio/webm').slice(0, 60);
  const data = b64.includes(',') ? b64.split(',')[1] : b64;
  if (!data) return res.status(400).json({ error: 'audio required' });
  let buffer; try { buffer = Buffer.from(data, 'base64'); } catch (_) { return res.status(400).json({ error: 'bad audio' }); }
  if (!buffer.length || buffer.length > 25 * 1024 * 1024) return res.status(400).json({ error: 'audio too large or empty' });
  try {
    const ext = /wav/.test(mimetype) ? 'wav' : /mp4|m4a/.test(mimetype) ? 'm4a' : /mpeg|mp3/.test(mimetype) ? 'mp3' : 'webm';
    const text = await ai.transcribe(buffer, { filename: `note.${ext}`, mimetype });
    res.json({ ok: true, text });
  } catch (e) {
    res.status(502).json({ error: 'transcribe-failed', note: 'Could not transcribe that — try again or type it.' });
  }
});

/* GET /api/assessments — everything the caller needs for the tab, role-scoped. */
app.get('/api/assessments', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const leader = _isLeader(code, userId);
  const all = assessmentAssignments[code] || [];
  // Per-template track record — is it trusted, does it work, is it stale? Computed
  // from real assignments: average returned outcome, how many times run, when last
  // used, and the outcome verdict (does it line up with improvement or decline?).
  let verdictByTitle = {};
  try {
    const oc = _assessmentOutcomes(code, userId, Date.now());
    (oc.working || []).forEach(w => { verdictByTitle[w.title.toLowerCase()] = 'working'; });
    (oc.revisit || []).forEach(r => { verdictByTitle[r.title.toLowerCase()] = 'revisit'; });
  } catch (_) {}
  const templateStats = (tpl) => {
    const uses = all.filter(a => a.templateId === tpl.id);
    const scored = uses.filter(a => a.status === 'returned' && Number.isFinite(a.score));
    const avgOutcome = scored.length ? Math.round(scored.reduce((s, a) => s + a.score, 0) / scored.length) : null;
    const times = uses.map(a => new Date(a.assignedAt).getTime()).filter(Number.isFinite);
    const lastUsed = times.length ? new Date(Math.max(...times)).toISOString() : null;
    const verdict = verdictByTitle[(tpl.title || '').toLowerCase()] || null;
    // Evidence-derived label — the org's own playbook, graded by what actually
    // happened (never by ratings or popularity). Honest about sample size.
    let evidence;
    if (scored.length < 3)                                      evidence = 'Not enough data yet';
    else if (verdict === 'working' || (avgOutcome != null && avgOutcome >= 70)) evidence = 'Works consistently';
    else if (verdict === 'revisit' || (avgOutcome != null && avgOutcome < 50))  evidence = 'Needs redesign';
    else                                                         evidence = 'Works sometimes';
    return { uses: uses.length, returned: scored.length, avgOutcome, lastUsed, verdict, evidence, stage: tpl.stage || 'active' };
  };
  res.json({
    ok: true,
    canCreate: leader,
    templates: (assessmentTemplates[code] || []).map(t => ({ id: t.id, title: t.title, description: t.description, kind: t.kind, fields: t.fields, createdByName: t.createdByName, ...templateStats(t) })),
    assigned: all.filter(a => a.assigneeId === userId).map(_publicAssignment),           // things I must fill
    issued:   leader ? all.filter(a => a.assignerId === userId).map(_publicAssignment) : [], // things I gave out
    tutorials: (orgTutorials[code] || []).map(t => ({ id: t.id, title: t.title, body: t.body, url: t.url, kind: t.kind, createdByName: t.createdByName, createdAt: t.createdAt })),
  });
});

/* POST /api/assessments/templates — a leader defines an assessment. */
/* POST /api/assessments/draft — the agentic builder. Give it a plain-language
   goal ("a weekly review that helps a new hire reflect on wins and blockers")
   and it drafts a real assessment: title, kind, instructions, and the fields to
   fill. LLM-drafted when a key is present; a solid deterministic scaffold otherwise.
   Nothing is saved — it just fills the form for the leader to edit and create. */
app.post('/api/assessments/draft', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Only a leader can build assessments' });
  const goal = String(req.body?.goal || '').slice(0, 600).trim();
  if (!goal) return res.status(400).json({ error: 'goal required' });

  // Deterministic scaffold — always works, and is the fallback with no LLM.
  const fallback = {
    title: goal.length <= 60 ? goal.replace(/^\w/, c => c.toUpperCase()) : 'New assessment',
    kind: 'general',
    description: `Purpose: ${goal}\n\nComplete each section thoughtfully — specifics are more useful than summaries.`,
    fields: [
      { label: 'What went well', hint: 'Concrete examples' },
      { label: 'What was hard or got in the way', hint: 'Blockers, gaps' },
      { label: 'What you\'ll do differently next', hint: 'One or two clear steps' },
    ],
  };

  let out = null;
  if (ai.enabled()) {
    try {
      const system = ['You design clear, motivating assessments and reviews for ANY kind of organisation or work. Given a goal, return JSON only: {"title": string (<=80 chars), "kind": one of ["spreadsheet","film","play","skill","general"], "description": string (2-4 sentences of instructions, warm and specific, no emojis), "fields": array of 3-6 {"label": string, "hint": string} the person fills in}. Make it feel like a thoughtful mentor designed it, not a form.', _domainDirective(code)].filter(Boolean).join('\n\n');
      out = await ai.completeJSON({ tier: 'reason', system, user: `Goal: ${goal}`, maxTokens: 600, schema: ['title', 'fields'] });
    } catch (_) { out = null; }
  }
  const d = out && Array.isArray(out.fields) && out.fields.length ? out : fallback;
  res.json({
    ok: true,
    aiUsed: !!(out && out !== fallback),
    draft: {
      title: String(d.title || fallback.title).slice(0, 160),
      kind: ASSESS_KINDS.includes(d.kind) ? d.kind : 'general',
      description: String(d.description || '').slice(0, 2000),
      fields: (d.fields || []).slice(0, 12).map(f => ({ label: String(f?.label || '').slice(0, 160), hint: String(f?.hint || '').slice(0, 400) })).filter(f => f.label),
    },
  });
});

/* Gather the PRIVACY-SAFE planning context a leader legitimately sees about their
   team: per-person categorical strengths/development + recent score + trajectory,
   the team's most common development areas, and how past assessments have gone.
   Only aggregate/categorical/numeric data — never raw check-in text or anything
   sensitive. This is what the planner reasons over. */
function _gatherPlanningContext(code, userId) {
  const ids = getVisibleUserIds(code, userId).filter(id => id !== userId);
  const now = Date.now();
  const team = [];
  const devCount = {};
  ids.forEach(id => {
    const u = orgUsers[code]?.[id];
    if (!u || u.role === 'superadmin') return;
    const sigs = (orgSignals[code] || []).filter(s => s.subjectId === id && s.source === 'assessment');
    const scores = sigs.filter(s => Number.isFinite(s.valueNum)).map(s => s.valueNum);
    const recentScore = scores.length ? Math.round(scores.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, scores.length)) : null;
    const strengths = [], development = [];
    sigs.forEach(s => {
      const t = s.valueText || '';
      const sm = t.match(/Strengths:\s*([^·]+)/i); if (sm) sm[1].split(',').forEach(x => { const v = x.trim(); if (v) strengths.push(v); });
      const dm = t.match(/Development:\s*([^·]+)/i); if (dm) dm[1].split(',').forEach(x => { const v = x.trim(); if (v) { development.push(v); devCount[v.toLowerCase()] = (devCount[v.toLowerCase()] || 0) + 1; } });
    });
    let trajectory = 'steady';
    try {
      const m = _buildMemberIntelInput(code, u, now);
      const pats = m ? intel.detectPatterns(m) : [];
      if (pats.some(p => p.severity === 'high')) trajectory = 'needs attention';
      else if (pats.some(p => /improv|recover/i.test(p.type))) trajectory = 'improving';
    } catch (_) {}
    team.push({
      name: u.name || 'Member', recentScore,
      strengths: [...new Set(strengths)].slice(0, 4),
      development: [...new Set(development)].slice(0, 4),
      trajectory,
    });
  });
  const weakAreas = Object.entries(devCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  const returned = (assessmentAssignments[code] || []).filter(a => a.status === 'returned' && Number.isFinite(a.score));
  const byTitle = {};
  returned.forEach(a => { (byTitle[a.title] = byTitle[a.title] || []).push(a.score); });
  const pastAssessments = Object.entries(byTitle).map(([title, s]) => ({ title, avg: Math.round(s.reduce((x, y) => x + y, 0) / s.length), n: s.length }));
  return { team, weakAreas, pastAssessments };
}

/* POST /api/assessments/plan — the planning agent. Reasons over the whole team's
   history (strengths, weak areas, past assessments, trajectories) and a plain
   goal, then returns: an INSIGHT (where the team stands), a PLAN (the assessment/
   session to run), an ALLOCATION (who's suited to what / who needs focus), and a
   SEQUENCE (a sensible order). LLM-reasoned when a key is present; a real
   data-driven fallback otherwise. Nothing is saved — it fills the builder. */
app.post('/api/assessments/plan', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Only a leader can plan' });
  const goal = String(req.body?.goal || '').slice(0, 600).trim();
  if (!goal) return res.status(400).json({ error: 'goal required' });
  const ctx = _gatherPlanningContext(code, userId);

  // Deterministic, data-driven fallback (also the no-LLM path).
  const weak = ctx.weakAreas.slice(0, 3);
  const strongAt = {};
  ctx.team.forEach(p => (p.strengths || []).forEach(s => { (strongAt[s] = strongAt[s] || []).push(p.name); }));
  const fallback = {
    insight: ctx.team.length
      ? `Across ${ctx.team.length} people${weak.length ? `, the most common area to strengthen is ${weak.join(', ')}` : ''}. ${ctx.team.filter(p => p.trajectory === 'needs attention').length} may need attention; ${ctx.team.filter(p => p.trajectory === 'improving').length} are trending up.`
      : 'Not enough history yet — this plan is a starting point that will sharpen as assessments come in.',
    plan: {
      title: goal.length <= 60 ? goal.replace(/^\w/, c => c.toUpperCase()) : 'Weekly plan',
      kind: 'general',
      description: `Goal: ${goal}\n\nFocus where the group is weakest${weak.length ? ` (${weak.join(', ')})` : ''}. Play to individual strengths and give the people who are struggling a smaller, winnable version.`,
      fields: [{ label: 'What to focus on', hint: '' }, { label: 'How we\'ll know it worked', hint: 'A concrete signal' }],
    },
    allocation: ctx.team.slice(0, 12).map(p => ({
      name: p.name,
      suggestion: (p.development && p.development.length) ? `Work on ${p.development[0]}` : (p.strengths && p.strengths.length) ? `Lead on ${p.strengths[0]}` : 'Give a clear, winnable task',
    })),
    sequence: ['Warm up / align on the goal', 'Core work on the weakest area', 'Apply it in a realistic scenario', 'Short review — what worked'],
  };

  let out = null;
  if (ai.enabled()) {
    try {
      const system = [`${privacy.GATE_DIRECTIVE}\n\nYou are a planning partner for ANY kind of organisation or work. You are given a leader's goal and PRIVACY-SAFE context about the people they lead (categorical strengths/development, recent scores, trajectories, weak areas, past assessment averages). Reason over it and return JSON only:
{"insight": string (2-3 sentences: where the team stands and what to strengthen, grounded in the data),
 "plan": {"title": string(<=80), "kind": one of ["spreadsheet","film","play","skill","general"], "description": string(2-4 sentences of instructions), "fields": array of 3-6 {"label","hint"}},
 "allocation": array of up to 12 {"name": (use ONLY names given), "suggestion": string (what this person should do / work on, from their strengths & development)},
 "sequence": array of 3-6 short ordered steps}
Play to individual strengths, target real weak areas, and adapt to the specific people. No emojis.`, _domainDirective(code)].filter(Boolean).join('\n\n');
      const user = `Goal: ${goal}\n\nContext about the people (privacy-safe):\n${JSON.stringify(ctx).slice(0, 6000)}`;
      out = await ai.completeJSON({ tier: 'reason', system, user, maxTokens: 1100, schema: ['insight', 'plan'] });
    } catch (_) { out = null; }
  }
  const r = (out && out.plan && Array.isArray(out.plan.fields)) ? out : fallback;
  // Constrain allocation names to the real team (never invent people).
  const names = new Set(ctx.team.map(p => p.name));
  const allocation = (r.allocation || fallback.allocation).filter(a => a && names.has(a.name)).slice(0, 12)
    .map(a => ({ name: String(a.name).slice(0, 80), suggestion: String(a.suggestion || '').slice(0, 200) }));
  res.json({
    ok: true, aiUsed: !!(out && out !== fallback),
    insight: String(r.insight || fallback.insight).slice(0, 800),
    plan: {
      title: String(r.plan.title || fallback.plan.title).slice(0, 160),
      kind: ASSESS_KINDS.includes(r.plan.kind) ? r.plan.kind : 'general',
      description: String(r.plan.description || '').slice(0, 2000),
      fields: (r.plan.fields || []).slice(0, 12).map(f => ({ label: String(f?.label || '').slice(0, 160), hint: String(f?.hint || '').slice(0, 400) })).filter(f => f.label),
    },
    allocation: allocation.length ? allocation : fallback.allocation,
    sequence: (Array.isArray(r.sequence) && r.sequence.length ? r.sequence : fallback.sequence).slice(0, 8).map(s => String(s).slice(0, 160)),
    context: { teamSize: ctx.team.length, weakAreas: ctx.weakAreas.slice(0, 5), pastAssessments: ctx.pastAssessments.slice(0, 6) },
  });
});

/* POST /api/assessments/plan/chat — the builder as a REASONING PARTNER, not a form.
   A back-and-forth where IntelliQ grounds every suggestion in the team's data AND
   pushes back when the leader's idea conflicts with it ("I'd be cautious assigning
   that to Jordan — it's been a development area for them", "several people are
   trending down, so a high-intensity plan may backfire"). When you converge on
   something concrete, it returns a structured `plan` you can drop into the form. */
app.post('/api/assessments/plan/chat', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Only a leader can plan' });
  const message = String(req.body?.message || '').slice(0, 2000).trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];
  const ctx = _gatherPlanningContext(code, userId);

  // Deterministic fallback — still grounded: name a real caution if one exists.
  const weak = ctx.weakAreas.slice(0, 2);
  const dipping = ctx.team.filter(p => p.trajectory === 'needs attention').map(p => p.name);
  let reply = `Here's what the data says: ${ctx.team.length} people`;
  if (weak.length) reply += `, most commonly working on ${weak.join(' and ')}`;
  if (dipping.length) reply += `. I'd be cautious about anything high-intensity right now — ${dipping.slice(0, 3).join(', ')} ${dipping.length === 1 ? 'is' : 'are'} trending down`;
  reply += '. Tell me the shape you have in mind and I\'ll pressure-test it against who\'s strong where.';

  let out = null;
  if (ai.enabled()) {
    try {
      const system = [`${privacy.GATE_DIRECTIVE}\n\nYou are IntelliQ, a planning PARTNER for a leader in ANY kind of organisation. This is a conversation, not a form. Reason WITH them and ground every point in the PRIVACY-SAFE team context provided. Crucially: PUSH BACK when their idea conflicts with the data — be a thoughtful expert who disagrees when warranted, never a yes-man. Examples of good pushback: "I'd hold off assigning that to Jordan — it's been a development area, so they may struggle to execute it efficiently"; "several people are trending down, so a demanding session may set them back — consider a lighter version". Be specific, use only the names given, never invent data, never reveal private detail. Keep replies to 2-4 sentences unless proposing a plan.\n\nReturn JSON only: {"reply": string (your conversational response, including any pushback), "plan": null OR {"title","kind" one of ["spreadsheet","film","play","skill","general"],"description","fields":[{"label","hint"}]} — include a plan ONLY when you and the leader have converged on something concrete}.`, _domainDirective(code)].filter(Boolean).join('\n\n');
      const messages = [
        ...history.filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string').map(h => ({ role: h.role, content: h.content.slice(0, 1500) })),
        { role: 'user', content: `${message}\n\n[Team context — privacy-safe]: ${JSON.stringify(ctx).slice(0, 5000)}` },
      ];
      out = await ai.completeJSON({ tier: 'reason', messages, system, maxTokens: 900, schema: ['reply'] });
    } catch (_) { out = null; }
  }
  const plan = (out && out.plan && out.plan.title) ? {
    title: String(out.plan.title).slice(0, 160),
    kind: ASSESS_KINDS.includes(out.plan.kind) ? out.plan.kind : 'general',
    description: String(out.plan.description || '').slice(0, 2000),
    fields: (Array.isArray(out.plan.fields) ? out.plan.fields : []).slice(0, 12).map(f => ({ label: String(f?.label || '').slice(0, 160), hint: String(f?.hint || '').slice(0, 400) })).filter(f => f.label),
  } : null;
  res.json({ ok: true, aiUsed: !!(out && out.reply), reply: String((out && out.reply) || reply).slice(0, 2000), plan });
});

app.post('/api/assessments/templates', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Only a leader can create assessments' });
  const { title, description, kind, fields, guidance } = req.body || {};
  if (!String(title || '').trim()) return res.status(400).json({ error: 'title required' });
  const me = orgUsers[code]?.[userId];
  const tpl = {
    id: _shortId(), title: String(title).slice(0, 160).trim(),
    description: String(description || '').slice(0, 2000),
    // How the creator wants it done — the material IntelliQ tutors the assignee
    // from AND grades against. This is the "teach the AI" / pinned-tutorial layer,
    // living on the assessment itself.
    guidance: String(guidance || '').slice(0, 4000),
    kind: ASSESS_KINDS.includes(kind) ? kind : 'general',
    fields: Array.isArray(fields) ? fields.slice(0, 30).map(f => ({ label: String(f?.label || '').slice(0, 160), hint: String(f?.hint || '').slice(0, 400) })).filter(f => f.label) : [],
    createdBy: userId, createdByName: me?.name || 'Leader', createdAt: new Date().toISOString(),
  };
  (assessmentTemplates[code] = assessmentTemplates[code] || []).push(tpl);
  scheduleSave();
  res.json({ ok: true, template: tpl });
});

app.delete('/api/assessments/templates/:id', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = assessmentTemplates[code] || [];
  const t = list.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  if (t.createdBy !== userId && !_isLeader(code, userId)) return res.status(403).json({ error: 'not allowed' });
  assessmentTemplates[code] = list.filter(x => x.id !== req.params.id);
  scheduleSave();
  res.json({ ok: true });
});

/* POST /api/assessments/templates/:id/stage — curate the playbook. A leader marks a
   template Experimental (trialling), Active (in the rotation), or Archived (retired
   but kept for the record) — GitHub-releases-style curation of what the org runs. */
app.post('/api/assessments/templates/:id/stage', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Leaders only' });
  const t = (assessmentTemplates[code] || []).find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  const stage = String(req.body?.stage || '');
  if (!['experimental', 'active', 'archived'].includes(stage)) return res.status(400).json({ error: 'stage must be experimental | active | archived' });
  t.stage = stage;
  scheduleSave();
  res.json({ ok: true, stage });
});

/* POST /api/assessments/assign — assign a template to people. A leader may assign
   to anyone in their visible range; anyone may self-assign (assign to themselves). */
app.post('/api/assessments/assign', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { templateId, assigneeIds } = req.body || {};
  const tpl = (assessmentTemplates[code] || []).find(t => t.id === templateId);
  if (!tpl) return res.status(404).json({ error: 'template not found' });
  const targets = Array.isArray(assigneeIds) && assigneeIds.length ? assigneeIds : [userId];
  const leader = _isLeader(code, userId);
  const inRange = new Set(getVisibleUserIds(code, userId));
  const selfOnly = targets.every(id => id === userId);
  if (!selfOnly && !leader) return res.status(403).json({ error: 'Only a leader can assign to others' });
  const bad = targets.find(id => id !== userId && !inRange.has(id));
  if (bad) return res.status(403).json({ error: 'assignee outside your range' });
  const me = orgUsers[code]?.[userId];
  const created = [];
  targets.forEach(aid => {
    const subj = orgUsers[code]?.[aid];
    if (!subj) return;
    const a = {
      // Criteria SNAPSHOTTED (deep-copied) + versioned at issue — a later template edit
      // can never rewrite this assignment's historical expectation.
      id: _shortId(), templateId: tpl.id, title: tpl.title, kind: tpl.kind, fields: JSON.parse(JSON.stringify(tpl.fields || [])),
      description: tpl.description || '', guidance: tpl.guidance || '', criteriaVersion: 1,
      assignerId: userId, assignerName: me?.name || 'Leader', assigneeId: aid, assigneeName: subj.name || 'Member',
      status: 'assigned', response: {}, note: '', feedback: '', score: null, submissions: [],
      assignedAt: new Date().toISOString(),
    };
    (assessmentAssignments[code] = assessmentAssignments[code] || []).push(a);
    try { _canonicaliseCommitment(code, a); } catch (_) {}
    created.push(_publicAssignment(a));
  });
  scheduleSave();
  res.json({ ok: true, assigned: created });
});

/* POST /api/assessments/:id/submit — the assignee fills it in and returns it. */
app.post('/api/assessments/:id/submit', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const a = (assessmentAssignments[code] || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  if (a.assigneeId !== userId) return res.status(403).json({ error: 'not your assessment' });
  const { response, note } = req.body || {};
  const resp = (response && typeof response === 'object') ? response : {};
  const noteText = String(note || '').slice(0, 4000);
  // APPEND-ONLY submissions. A resubmission never overwrites — it is a REVISION linked to
  // the prior submission (and to the assessment it answers, if the work had been returned).
  a.submissions = a.submissions || [];
  const prior = a.submissions.length ? a.submissions[a.submissions.length - 1] : null;
  const wasReturned = a.status === 'returned';
  const sub = {
    id: 'sub_' + _shortId(), response: resp, note: noteText, submittedAt: new Date().toISOString(),
    iteration: a.submissions.length + 1,
    revisionOf: prior ? prior.id : null,
    respondsToAssessmentId: wasReturned ? `as_${a.id}` : null,
  };
  a.submissions.push(sub);
  // Latest snapshot kept on the record for backwards compatibility (_publicAssignment etc.).
  a.response = resp; a.note = noteText;
  a.status = 'submitted'; a.submittedAt = sub.submittedAt;
  // BACKWARDS COMPAT: completion is still a participation signal (contentless).
  _emitSignalSafe(code, {
    subjectType: 'member', subjectId: userId, source: 'assessment', modality: 'number',
    label: `Assessment completed: ${a.title}`.slice(0, 120), valueNum: 1, primitive: 'participation', sensitivity: 'normal',
  }, userId);
  // AUTHORITATIVE: the submission (and, on resubmit, a revision) becomes canonical evidence.
  try { _canonicaliseSubmission(code, a, sub); } catch (_) {}
  scheduleSave();
  res.json({ ok: true, assignment: _publicAssignment(a), iteration: sub.iteration });
});

/* POST /api/assessments/:id/return — the assigner reviews: feedback + optional score. */
app.post('/api/assessments/:id/return', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const a = (assessmentAssignments[code] || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const canReview = a.assignerId === userId || (_isLeader(code, userId) && new Set(getVisibleUserIds(code, userId)).has(a.assigneeId));
  if (!canReview) return res.status(403).json({ error: 'not allowed' });
  const { feedback, score } = req.body || {};
  a.feedback = String(feedback || '').slice(0, 4000);
  const s = Number(score);
  a.score = Number.isFinite(s) ? Math.max(0, Math.min(100, s)) : a.score;
  a.status = 'returned'; a.returnedAt = new Date().toISOString();
  // BACKWARDS COMPAT: the legacy capability signal is preserved unchanged (numeric streams,
  // concern trigger, _personStrengths all keep working) — non-authoritative during migration.
  if (Number.isFinite(a.score)) _emitSignalSafe(code, {
    subjectType: 'member', subjectId: a.assigneeId, source: 'assessment', modality: 'number',
    label: `Assessment score: ${a.title}`.slice(0, 120), valueNum: a.score, primitive: 'capability', sensitivity: 'normal',
  }, userId);
  // AUTHORITATIVE: the complete canonical Assessment (assessor · rubric · scale · feedback ·
  // submissionId) + the feedback as an authored observation — emitted LIVE, never a naked number.
  try { _canonicaliseAssessment(code, a); } catch (_) {}
  scheduleSave();
  res.json({ ok: true, assignment: _publicAssignment(a) });
});

/* POST /api/assessments/:id/summarize — IntelliQ reads the person's responses and,
   grading against HOW THE LEADER WANTED IT DONE (the guidance), proposes a summary,
   a reasoning score, and strengths/development. The leader edits and returns — the
   raw responses are always kept and published alongside; this never replaces them. */
app.post('/api/assessments/:id/summarize', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const a = (assessmentAssignments[code] || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const canReview = a.assignerId === userId || (_isLeader(code, userId) && new Set(getVisibleUserIds(code, userId)).has(a.assigneeId));
  if (!canReview) return res.status(403).json({ error: 'not allowed' });
  const answers = Object.entries(a.response || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
  if (!answers.trim()) return res.status(400).json({ error: 'no responses to summarise yet' });

  const fallback = { summary: 'Responses received — review below and add your own read.', score: null, strengths: [], development: [] };
  let out = null;
  if (ai.enabled()) {
    try {
      const system = [`You help a leader review someone's assignment. You are given HOW THE LEADER WANTED IT DONE and the person's actual responses. Judge the responses AGAINST the leader's stated method/expectation — not a generic standard. Be fair and specific. Return JSON only: {"summary": string (2-3 sentences the leader could send), "score": integer 0-100 (your honest reasoning score against the leader's expectation) or null if there isn't enough to score, "strengths": array of up to 3 short phrases, "development": array of up to 3 short phrases}. No emojis.`, _domainDirective(code, { userId: a.assigneeId })].filter(Boolean).join('\n\n');
      const user = `Assignment: "${a.title}".\nHow the leader wanted it done: ${a.guidance || a.description || '(not specified — judge on general quality and effort)'}\n\nThe person's responses:\n${answers.slice(0, 4000)}`;
      out = await ai.completeJSON({ tier: 'reason', system, user, maxTokens: 600, schema: ['summary'] });
    } catch (_) { out = null; }
  }
  const d = out || fallback;
  const sc = Number(d.score);
  res.json({
    ok: true, aiUsed: !!out,
    summary: String(d.summary || fallback.summary).slice(0, 1200),
    score: Number.isFinite(sc) ? Math.max(0, Math.min(100, Math.round(sc))) : null,
    strengths: (Array.isArray(d.strengths) ? d.strengths : []).slice(0, 3).map(x => String(x).slice(0, 60)),
    development: (Array.isArray(d.development) ? d.development : []).slice(0, 3).map(x => String(x).slice(0, 60)),
  });
});

/* POST /api/assessments/:id/discuss — the assignment is a conversation, not a form.
   The assignee (or the assigner) can talk it through with IntelliQ, which knows what
   the leader set (title, instructions, kind, fields) and helps them think it through
   — the "interactive, not a chore" experience. LLM-driven with a plain fallback. */
app.post('/api/assessments/:id/discuss', requireAuth, async (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const a = (assessmentAssignments[code] || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  const isAssignee = a.assigneeId === userId;
  const canReview  = a.assignerId === userId || (_isLeader(code, userId) && new Set(getVisibleUserIds(code, userId)).has(a.assigneeId));
  if (!isAssignee && !canReview) return res.status(403).json({ error: 'not allowed' });
  const message = String(req.body?.message || '').slice(0, 2000).trim();
  if (!message) return res.status(400).json({ error: 'message required' });
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];

  const fieldList = (a.fields || []).map(f => f.label).join(', ') || 'your response';
  let reply = isAssignee
    ? `Start with what you actually did or saw, then be specific. For "${a.title}", the parts to cover are: ${fieldList}. Want to talk through any one of them?`
    : `This is ${a.assigneeName}'s work on "${a.title}". Ask me to summarise their answers or compare them to what you set.`;

  if (ai.enabled()) {
    try {
      const role = isAssignee
        ? `You are IntelliQ, having a warm, natural CONVERSATION with a person to help them reflect on an assignment their leader set. This is a chat, not a form — guide them gently through the areas below ONE AT A TIME: ask about the first, listen, acknowledge what they say, then move to the next when it feels natural. Ask a follow-up if an answer is thin. When you've covered everything, tell them warmly that they can hit "Send to [leader]" whenever they're ready. Keep each message to 1-3 sentences. Never do it for them, never invent facts about them, never reveal private data. No emojis.`
        : `You are IntelliQ helping a LEADER reflect on someone's assignment. Be concise and neutral. No emojis.`;
      const context = `Assignment: "${a.title}" (${a.kind}).\nInstructions the leader set: ${a.description || '(none)'}\nSections to fill: ${fieldList}.` +
        (a.guidance ? `\n\nHOW THE LEADER WANTS THIS DONE (tutor the person from this — teach them this specific method/expectation, don't invent your own):\n${a.guidance}` : '') +
        (isAssignee && a.response && Object.keys(a.response).length ? `\nTheir current draft: ${Object.entries(a.response).map(([k, v]) => `${k}: ${v}`).join(' | ').slice(0, 800)}` : '');
      const messages = [
        ...history.filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string').map(h => ({ role: h.role, content: h.content.slice(0, 1000) })),
        { role: 'user', content: message },
      ];
      const out = await ai.complete({ tier: 'reason', system: [`${role}\n\n${context}`, _domainDirective(code, { userId: a.assigneeId })].filter(Boolean).join('\n\n'), messages, maxTokens: 300 });
      if (out) reply = out;
    } catch (_) {}
  }
  res.json({ ok: true, reply });
});

/* Tutorials — pinned how-to references. Leaders pin; everyone can read. */
app.post('/api/tutorials', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'Only a leader can pin a tutorial' });
  const { title, body, url, kind } = req.body || {};
  if (!String(title || '').trim()) return res.status(400).json({ error: 'title required' });
  const me = orgUsers[code]?.[userId];
  const t = {
    id: _shortId(), title: String(title).slice(0, 160).trim(),
    body: String(body || '').slice(0, 5000), url: String(url || '').slice(0, 500),
    kind: ASSESS_KINDS.includes(kind) ? kind : 'general',
    createdBy: userId, createdByName: me?.name || 'Leader', createdAt: new Date().toISOString(),
  };
  (orgTutorials[code] = orgTutorials[code] || []).push(t);
  scheduleSave();
  res.json({ ok: true, tutorial: t });
});

app.delete('/api/tutorials/:id', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = orgTutorials[code] || [];
  const t = list.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  if (t.createdBy !== userId && !_isLeader(code, userId)) return res.status(403).json({ error: 'not allowed' });
  orgTutorials[code] = list.filter(x => x.id !== req.params.id);
  scheduleSave();
  res.json({ ok: true });
});

/* POST /api/admin/llm-selftest — prove the language model is connected and show
   how it reasons on demo-style prompts. Admin-gated (manage_settings). No shell
   needed: runs from the browser against whatever key the host has configured.
   With no key, reports that the kernel is on its deterministic fallbacks. */
/* ── GET /api/health — public status. Booleans only, never secrets. Lets anyone
   confirm at a glance whether the AI keys are wired (visit it in a browser). */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ai: {
      enabled: ai.enabled(),
      claude:  !!process.env.ANTHROPIC_API_KEY,
      openai:  !!process.env.OPENAI_API_KEY,
    },
    voice:     ai.canTranscribe(),   // OpenAI Whisper for voice notes
    readsFiles: ai.canUnderstand(),  // vision / PDF understanding
    reasoning: ai.enabled()
      ? 'connected — replies are grounded and reasoned'
      : 'no key — running on deterministic fallbacks (set ANTHROPIC_API_KEY)',
    time: new Date().toISOString(),
  });
});

/* ── POST /api/admin/seed-demo-club — install the full demo club for a click-through.
   Builds "Trafford United FC" (fictional, ~226 people, ~1yr of data) and installs it
   as its OWN org so you can log in and see every layer react at scale. Superadmin-
   gated. Re-running replaces the club org's data (idempotent), never touches others. */
app.post('/api/admin/seed-demo-club', requirePermission('manage_settings'), async (req, res) => {
  try {
    const { buildClubStore, CLUB_CODE } = require('./scripts/seed-club.js');
    const { store, summary } = await buildClubStore();
    // Each slice is keyed by the club's org code (except emailIndex, rebuilt below),
    // so assigning replaces just the club org and leaves every other org intact.
    Object.assign(orgMeta, store.orgMeta);
    Object.assign(orgUsers, store.orgUsers);
    Object.assign(orgNodes, store.orgNodes);
    Object.assign(orgValues, store.orgValues);
    Object.assign(orgGoals, store.orgGoals);
    Object.assign(orgMetrics, store.orgMetrics);
    Object.assign(userPermissions, store.userPermissions);
    Object.assign(memberGoals, store.memberGoals);
    Object.assign(memberCheckins, store.memberCheckins);
    Object.assign(orgSignals, store.orgSignals);
    Object.assign(assessmentTemplates, store.assessmentTemplates);
    Object.assign(assessmentAssignments, store.assessmentAssignments);
    Object.assign(orgTutorials, store.orgTutorials);
    Object.assign(orgInterventions, store.orgInterventions);
    Object.assign(studioThreads, store.studioThreads);
    Object.assign(orgGroups, store.orgGroups);
    _rebuildEmailIndex();
    scheduleSave();
    console.log(`[seed-demo-club] installed ${summary.orgName} (${summary.users} users, ${summary.checkins} check-ins)`);
    res.json({ ok: true, summary, note: `Log in with ${summary.login.director} (or ${summary.login.firstTeamCoach}), password ${summary.login.password}, org code "${CLUB_CODE}".` });
  } catch (e) {
    console.error('[seed-demo-club] failed:', e.message);
    res.status(500).json({ error: 'Could not seed the demo club: ' + e.message });
  }
});

app.post('/api/admin/llm-selftest', requirePermission('manage_settings'), async (req, res) => {
  const status = {
    enabled:   ai.enabled(),
    models:    ai.MODELS,
    providers: { claude: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY },
  };
  if (!ai.enabled()) {
    return res.json({ ok: true, status, results: [],
      note: 'No language-model key is configured on this host. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) and the kernel will use it; until then it runs on its deterministic fallbacks.' });
  }
  // Two demo-shaped prompts — the kind of content the seeded orgs produce — one
  // per tier, so you see both the fast path and the reasoning path.
  const trials = [
    { tier: 'micro', label: 'Check-in acknowledgement (fast tier)',
      system: 'You are a supportive coach. Reply in ONE warm, genuine sentence. No emojis.',
      user:   'A team member wrote: "Tough week — legs feel heavy but I got through every session." Acknowledge it warmly.' },
    { tier: 'reason', label: 'Coaching reflection (reasoning tier)',
      system: 'You are a thoughtful performance mentor. In 2–3 sentences, reflect on what this pattern suggests and offer one gentle next step. No emojis, no lists.',
      user:   "Over six weeks a person's participation stayed high, but their self-reported energy has drifted down three weeks running. What might be going on, and what's one supportive step?" },
  ];
  const results = [];
  for (const t of trials) {
    const started = Date.now();
    try {
      const out = await ai.complete({ tier: t.tier, system: t.system, user: t.user, maxTokens: 160 });
      results.push({ label: t.label, tier: t.tier, model: ai.MODELS[t.tier], ms: Date.now() - started, ok: true, output: out });
    } catch (e) {
      results.push({ label: t.label, tier: t.tier, model: ai.MODELS[t.tier], ms: Date.now() - started, ok: false, error: e.message });
    }
  }
  res.json({ ok: true, status, results });
});

/* ═══════════════════════════════════════════════════════════════════════════
   UNIVERSAL INGEST — how the algorithm connects to ANY app.

   Instead of building a bespoke integration per app, we expose ONE authenticated
   pipe. An org's admin generates a token; then anything — an in-house system, a
   Google-Apps script, a CRM, a no-code automation (Zapier/Make), a nightly cron —
   POSTs numeric records here and the kernel reasons over them like any other
   signal. This is what makes "connect any app" real, especially for in-house
   tools that have no OAuth. Numbers only (a score/count/rating), so the privacy
   model is unchanged. OAuth "pull" connectors (Google, Microsoft) are just a
   convenience layer that ends up calling this same ingestion.
   ═══════════════════════════════════════════════════════════════════════════ */

/* GET/POST /api/org/ingest-token — admin views or rotates the org's ingest token. */
app.get('/api/org/ingest-token', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const t = orgApiTokens[code];
  res.json({ ok: true, token: t?.token || null, createdAt: t?.createdAt || null, endpoint: '/api/ingest' });
});
app.post('/api/org/ingest-token', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const token = 'iq_ingest_' + generateToken() + generateToken();
  orgApiTokens[code] = { token, createdAt: new Date().toISOString(), createdBy: req.iqSession.userId };
  scheduleSave();
  res.json({ ok: true, token, endpoint: '/api/ingest' });
});

function _orgByIngestToken(tok) {
  if (!tok) return null;
  for (const [code, v] of Object.entries(orgApiTokens)) if (v && v.token === tok) return code;
  return null;
}

/* POST /api/ingest — the pipe. Auth by the org ingest token (NOT a user session).
   Body: { records: [ { email? | name? | userId?, label, value, date? } ] } (or a
   single record). Resolves each record to a member of that org and emits a numeric
   signal. Anything non-numeric is ignored — numbers only, by design. */
/* ── The universal mapper — turn ANY JSON into signals ─────────────────────────
   The heart of "connect to anything": whatever shape of data arrives, find the
   PERSON and the NUMBERS in it. Handles a clean {email,label,value}, a wide row
   {email, sprint:7, passes:44}, an array of either, or {records|data:[...]} — and
   resolves the subject by userId / email / name / common role keys. */
const _SUBJECT_KEYS = ['userid', 'id', 'email', 'mail', 'emailaddress', 'name', 'fullname', 'player', 'member', 'athlete', 'employee', 'student', 'user', 'person'];
const _META_KEYS    = ['date', 'ts', 'timestamp', 'time', 'label', 'value', 'unit'];
function _resolveSubjectId(code, rec) {
  const users = orgUsers[code] || {};
  const norm = k => String(k).toLowerCase().replace(/[\s_-]/g, '');
  const find = (keys) => { for (const k of Object.keys(rec)) if (keys.includes(norm(k))) { const v = rec[k]; if (v != null && v !== '') return String(v); } return null; };
  const uidRaw = find(['userid', 'id', 'user']);
  if (uidRaw && users[uidRaw]) return uidRaw;
  const email = find(['email', 'mail', 'emailaddress']);
  if (email) { const e = email.toLowerCase(); const id = Object.keys(users).find(k => (users[k].email || '').toLowerCase() === e); if (id) return id; }
  const name = find(['name', 'fullname', 'player', 'member', 'athlete', 'employee', 'student', 'person']);
  if (name) { const n = name.toLowerCase().trim(); const id = Object.keys(users).find(k => (users[k].name || '').toLowerCase().trim() === n); if (id) return id; }
  return null;
}
/* Rebuild the dedupe index from the persisted log (called on load). Map keyed by
   dedupeKey → the CURRENT envelope for that factual identity, so a retry can be
   recognised as a duplicate and a corrected value can supersede the prior fact. */
function _rebuildEvidenceIndex() {
  for (const code of Object.keys(evidenceLog)) {
    const map = new Map();
    (evidenceLog[code] || []).forEach(env => { try { if (env.status !== 'superseded') map.set(evidence.dedupeKey(env), env); } catch (_) {} });
    _evidenceSeen[code] = map;
  }
}

/* Remove a promoted signal from the kernel (used by correction, deletion, reversal). */
function _withdrawSignal(code, env) {
  if (env && env.signalId && Array.isArray(orgSignals[code])) orgSignals[code] = orgSignals[code].filter(s => s.id !== env.signalId);
  if (env) { env.promoted = false; env.signalId = null; env.promotedAt = null; }
}

/* Record ONE canonical envelope + its raw immutable record. The single choke point
   through which all incoming information becomes stored evidence:
     • the original record is stored verbatim (rawEvidence) and never mutated
     • the envelope is validated against the contract before it's kept
     • duplicates (webhook retries, overlapping syncs) collapse via dedupeKey
   Returns { stored, duplicate, invalid, id, promotable }. Storing NEVER emits a
   signal — promotion to the kernel is a separate, explicit step. */
function _recordEvidence(code, envInput, rawRecord) {
  const rawRef = 'ev_' + generateId();
  const env = evidence.buildEnvelope({ ...envInput, org: code, id: rawRef, rawRef });
  const v = evidence.validateEnvelope(env);
  if (!v.ok) return { stored: false, invalid: true, errors: v.errors };

  const seen = _evidenceSeen[code] || (_evidenceSeen[code] = new Map());
  const key = evidence.dedupeKey(env);
  const prior = seen.get(key);
  if (prior) {
    // Same factual identity. If the VALUE is unchanged it's a true duplicate (a
    // retry / overlapping sync) → collapse. If the value changed it's a CORRECTION →
    // supersede the prior fact rather than create a competing truth.
    const samePayload = prior.value === env.value && (prior.valueText || null) === (env.valueText || null);
    if (samePayload) return { stored: false, duplicate: true, id: prior.id, promotable: false, envelope: prior };
    prior.status = 'superseded'; prior.supersededBy = env.id; prior.supersededAt = new Date().toISOString();
    _withdrawSignal(code, prior);   // the old signal is withdrawn; the corrected one promotes below
    env.correctionOf = prior.id;
  }
  seen.set(key, env);

  // Raw immutable record — the provenance root. Capped so a pathological payload
  // can't blow the blob; the envelope still carries the extracted facts.
  rawEvidence[rawRef] = { org: code, provider: env.provider, receivedAt: env.retrievedAt,
    record: JSON.parse(JSON.stringify(rawRecord ?? envInput.data ?? null)) };

  const log = evidenceLog[code] || (evidenceLog[code] = []);
  log.push(env);
  if (log.length > EVIDENCE_LOG_CAP) {
    const dropped = log.splice(0, log.length - EVIDENCE_LOG_CAP);
    dropped.forEach(d => { if (d.rawRef) delete rawEvidence[d.rawRef]; });
  }
  return { stored: true, id: env.id, promotable: evidence.promotable(env), envelope: env };
}

/* ── The identity resolution LIFECYCLE ────────────────────────────────────────
   unmatched → candidate discovered → probable/confirmed → resolution appended →
   promotion reconsidered → kernel signal emitted EXACTLY once. Original envelopes
   and raw records are never mutated destructively — resolution is APPENDED and the
   observed time is always preserved so late-promoted history is never mistaken for
   a new event. */

/* Promote a resolved, active envelope to a kernel signal — at most once. The
   signal's timestamp is the envelope's ORIGINAL observedAt, never "now", so old
   evidence promoted late does not read as a fresh event (no false alerts). */
function _promoteEvidence(code, env) {
  if (!evidence.promotable(env)) return false;
  const sig = _emitSignalSafe(code, {
    subjectType: 'member', subjectId: env.subjectId, source: env.source, modality: 'data',
    valueNum:  env.value != null ? env.value : null,
    valueText: env.valueText || null,
    label:     String(env.label || 'Metric').slice(0, 80),
    ts:        env.observedAt || undefined,   // ← preserve observed time
    sensitivity: env.visibility === 'private' ? 'sensitive' : (env.visibility || 'normal'),
    data: { connector: env.source, ingest: true, source: { provider: env.provider, external_id: env.externalId || undefined, retrieved_at: env.retrievedAt, evidence_id: env.id } },
  }, env.subjectId);
  if (!sig) return false;
  env.promoted = true; env.promotedAt = new Date().toISOString(); env.signalId = sig.id;
  return true;
}

/* Append a resolution event and update the envelope's CURRENT identity. The event
   preserves the from-state (full history is reconstructable). Keeps the dedupe
   index correct because the key depends on subjectId. */
function _appendResolution(code, env, patch) {
  const seen = _evidenceSeen[code];
  if (seen) seen.delete(evidence.dedupeKey(env));
  const evt = evidence.resolutionEvent(env, patch);
  env.resolutions = env.resolutions || [];
  env.resolutions.push(evt);
  env.subjectId  = evt.to.subjectId;
  env.confidence = evt.to.confidence;
  if (patch.status) env.status = patch.status;
  env.resolvedBy = evt.by; env.resolvedMethod = evt.method; env.resolvedAt = evt.ts;
  if (seen && env.status !== 'superseded') seen.set(evidence.dedupeKey(env), env);
  return evt;
}

/* Reconstruct an identity-resolvable record when the raw record is unavailable. */
function _envelopeIdentityRecord(env) {
  const r = {};
  if (env.subjectRef) { if (env.subjectRef.includes('@')) r.email = env.subjectRef; else r.name = env.subjectRef; }
  if (env.externalId) r.externalId = env.externalId;
  return r;
}

/* Re-evaluate the org's UNMATCHED / conflict evidence against the CURRENT roster.
   Deterministic identifiers (email / external id / member id) auto-confirm and
   promote; a unique NAME match is PROPOSED as a candidate (never auto-confirmed, so
   old evidence can't silently attach to a similarly named newcomer); an ambiguous
   name stays a conflict. Called when the roster changes (person created, account
   linked, sync completed) or on admin demand. */
function _reresolveUnmatched(code, meta = {}) {
  const users = orgUsers[code] || {};
  const log = evidenceLog[code] || [];
  const by = meta.by || 'system';
  const reasonBase = meta.reason || 'roster change';
  let confirmed = 0, promoted = 0, proposed = 0;
  for (const env of log) {
    if (env.promoted || env.status === 'rejected') continue;
    if (env.confidence === 'confirmed') continue;   // already resolved deterministically
    const raw = env.rawRef && rawEvidence[env.rawRef] ? rawEvidence[env.rawRef].record : null;
    const rec = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : _envelopeIdentityRecord(env);
    const idr = connectorSDK.resolveIdentity(users, rec);
    if (idr.confidence === 'confirmed' && idr.id) {
      _appendResolution(code, env, { subjectId: idr.id, confidence: 'confirmed', by, method: 'deterministic', reason: `${reasonBase}: matched by ${idr.key}` });
      confirmed++;
      if (_promoteEvidence(code, env)) promoted++;
    } else if (idr.confidence === 'probable' && idr.id) {
      env.candidate = { subjectId: idr.id, key: idr.key || 'name', reason: 'possible name match — confirm before use', at: new Date().toISOString() };
      proposed++;
    } else if (idr.confidence === 'conflict') {
      env.candidateNote = idr.ambiguous || 'ambiguous';
    }
  }
  if (confirmed || proposed) scheduleSave();
  return { confirmed, promoted, proposed };
}

/* ── The MAPPING APPROVAL lifecycle ───────────────────────────────────────────
   draft → proposed → approved → active → superseded/retired. Only an ACTIVE mapping
   may create canonical evidence; versions are immutable (editing forks a new draft);
   activating a version never silently reinterprets history (reprocessing is explicit). */
function _mappingsFor(code) { return orgMappings[code] || (orgMappings[code] = []); }
function _activeMapping(code, provider) {
  return _mappingsFor(code).find(m => m.provider === provider && m.status === 'active') || null;
}
function _mappingById(code, id) { return _mappingsFor(code).find(m => m.id === id) || null; }
function _nextMappingVersion(code, provider) {
  return Math.max(0, ..._mappingsFor(code).filter(m => m.provider === provider).map(m => m.version || 0)) + 1;
}

/* Create a PROPOSED draft mapping from sample records (AI/generic inspection may
   propose meaning — but this can never promote until an admin approves + activates). */
function _proposeMapping(code, provider, records, meta = {}) {
  const proposed = connectorSDK.proposeMapping(records);
  if (!proposed) return null;
  const fp = mappingLib.schemaFingerprint(records);
  const m = {
    id: 'map_' + generateId(),
    org: code, provider, connector: meta.connector || provider,
    sourceObject: meta.sourceObject || provider,
    schemaFingerprint: fp.hash, schemaFields: fp.fields, schemaTypes: fp.types,
    subjectField: proposed.subjectField, dateField: proposed.dateField, eventField: proposed.eventField,
    groupField: proposed.groupField || null,
    fields: (proposed.fields || []).map(f => ({ from: f.from, primitive: f.primitive || 'metric', evidenceType: 'metric', label: f.label || f.from, unit: null, transform: null, include: f.include !== false })),
    requiredFields: [proposed.subjectField, ...(proposed.fields || []).filter(f => f.include !== false).map(f => f.from)].filter(Boolean),
    optionalFields: [proposed.dateField, proposed.eventField].filter(Boolean),
    identityStrategy: meta.identityStrategy || 'auto',
    visibilityDefault: meta.visibilityDefault || 'normal',
    proposedBy: meta.by || 'system', approvedBy: null, approvedAt: null,
    testSample: (Array.isArray(records) ? records : [records]).slice(0, 3),
    expectedOutput: null,
    version: _nextMappingVersion(code, provider), status: 'proposed',
    createdAt: new Date().toISOString(),
  };
  m.expectedOutput = mappingLib.preview(m.testSample, m).samples.map(s => s.output);
  _mappingsFor(code).push(m);
  scheduleSave();
  return m;
}

/* Reprocess HELD evidence for a provider by INTERPRETING each retained raw record
   under the now-ACTIVE mapping → canonical envelopes (+ promotion where identity
   resolves). EXPLICIT: activating a mapping never auto-reinterprets history — this
   is the deliberate replay. The original observed time is preserved throughout, so
   historical data is never read as a new event. */
function _reprocessHeld(code, provider, by) {
  const active = _activeMapping(code, provider);
  if (!active) return { reprocessed: 0, created: 0, promoted: 0, error: 'no active mapping' };
  const users = orgUsers[code] || {};
  let reprocessed = 0, created = 0, promoted = 0;
  for (const env of [...(evidenceLog[code] || [])]) {
    if (env.provider !== provider || env.status !== 'held' || !env.heldBatch) continue;
    const raw = env.rawRef && rawEvidence[env.rawRef] ? rawEvidence[env.rawRef].record : null;
    if (!raw || typeof raw !== 'object') { continue; }
    const idr = connectorSDK.resolveIdentity(users, raw);
    let uid = idr.id, confidence = idr.confidence;
    mappingLib.applyMapping(raw, active).forEach(it => {
      const r = _recordEvidence(code, {
        provider, source: env.source, externalId: it.event || env.externalId,
        subjectRef: env.subjectRef, subjectId: uid || null, groupRef: env.groupRef,
        type: it.type, label: it.label, value: it.value, unit: it.unit || null,
        observedAt: it.date || env.observedAt, retrievedAt: env.retrievedAt,   // ← preserve observed time
        confidence, visibility: active.visibilityDefault || 'normal', mappingVersion: active.version,
      }, raw);
      if (!r.stored) return;
      r.envelope.mappingId = active.id;
      created++;
      if (r.promotable && _promoteEvidence(code, r.envelope)) promoted++;
    });
    env.status = 'superseded';   // the held placeholder has been interpreted
    reprocessed++;
  }
  if (reprocessed) scheduleSave();
  return { reprocessed, created, promoted };
}

const _subjectRefOf = rec => String(rec.email || rec.mail || rec.name || rec.player || rec.member || rec.athlete || rec.employee || rec.student || rec.userId || rec.id || '').slice(0, 200) || null;
const _externalIdOf = rec => rec.event || rec.eventId || rec.fixture || rec.externalId || rec.id || null;
const _groupRefOf   = rec => { const g = rec.group || rec.team || rec.department || rec.class || rec.cohort || null; return g ? String(g) : null; };

function _ingestGeneric(code, payload, createdBy, opts = {}) {
  const source = String(opts.source || 'connector').slice(0, 40);
  const provider = opts.provider || source;
  const users = orgUsers[code] || {};
  const retrievedAt = new Date().toISOString();
  let recs = [];
  if (Array.isArray(payload)) recs = payload;
  else if (payload && Array.isArray(payload.records)) recs = payload.records;
  else if (payload && Array.isArray(payload.data)) recs = payload.data;
  else if (payload && Array.isArray(payload.results)) recs = payload.results;
  else if (payload && typeof payload === 'object') recs = [payload];

  // ── The INTERPRETATION BOUNDARY (connectors only) ─────────────────────────
  // Only an ACTIVE approved mapping may create canonical evidence. Without one we
  // HOLD (retain raw for inspection) and PROPOSE a mapping; if the schema drifted we
  // PAUSE and never guess. The first-party push door (no requireApprovedMapping) uses
  // its documented canonical contract and is unaffected.
  let activeMap = null, driftInfo = null, gate = 'promote';
  if (opts.requireApprovedMapping) {
    activeMap = _activeMapping(code, provider);
    if (!activeMap) { if (recs.length) gate = 'hold'; }   // empty batch with no mapping = nothing to do
    else if (recs.length) { driftInfo = mappingLib.detectDrift(recs, activeMap); if (driftInfo.drifted) gate = 'drift'; }
  }

  const stats = { imported: 0, matched: 0, probable: 0, unmatched: 0, conflicts: 0, stored: 0, duplicates: 0, held: 0 };
  const subjects = new Set(); const conflictNames = new Set();

  if (gate === 'hold' || gate === 'drift') {
    // Retain the raw records + a HELD placeholder each — never promoted. Meaning is
    // not approved, so we do not interpret into metrics yet; reprocessing does that.
    recs.slice(0, 3000).forEach(rec => {
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return;
      const idr = connectorSDK.resolveIdentity(users, rec);
      const r = _recordEvidence(code, {
        provider, source, externalId: _externalIdOf(rec), subjectRef: _subjectRefOf(rec),
        subjectId: null, groupRef: _groupRefOf(rec), type: 'document',
        label: gate === 'drift' ? 'Held — source schema changed' : 'Held — awaiting mapping approval',
        valueText: JSON.stringify(rec).slice(0, 2000), observedAt: rec.date || rec.ts || rec.timestamp || null,
        retrievedAt, confidence: idr.confidence, visibility: 'normal', status: 'held',
      }, rec);
      if (r.duplicate) stats.duplicates++;
      else if (r.stored) { r.envelope.heldBatch = true; stats.held++; }
    });
    // Propose a mapping for review if none is already pending for this provider.
    const pending = _mappingsFor(code).find(m => m.provider === provider && ['proposed', 'draft', 'approved'].includes(m.status));
    const proposal = (gate === 'hold' && !pending && recs.length) ? _proposeMapping(code, provider, recs, { by: createdBy || 'system', connector: opts.connector, sourceObject: opts.sourceObject }) : null;
    if (stats.held || stats.duplicates) scheduleSave();
    return { imported: 0, stored: stats.held, held: stats.held, duplicates: stats.duplicates,
      matched: 0, probable: 0, unmatched: 0, conflicts: 0, subjects: 0, conflictNames: [],
      needsMapping: gate === 'hold', drift: gate === 'drift' ? driftInfo : null,
      mappingProposed: proposal ? proposal.id : (pending ? pending.id : null) };
  }

  // ── PROMOTE path — active approved mapping, or the ungated first-party door ──
  recs.slice(0, 3000).forEach(rec => {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return;
    const idr = connectorSDK.resolveIdentity(users, rec);
    let uid = idr.id, confidence = idr.confidence;
    if (confidence === 'conflict') { stats.conflicts++; if (idr.ambiguous) conflictNames.add(idr.ambiguous); }
    else if (!uid && opts.defaultSubjectId && users[opts.defaultSubjectId]) { uid = opts.defaultSubjectId; confidence = 'probable'; }
    if (confidence === 'confirmed') stats.matched++;
    else if (confidence === 'probable') stats.probable++;
    else if (confidence === 'unmatched') stats.unmatched++;

    const externalId = _externalIdOf(rec);
    const subjectRef = _subjectRefOf(rec);
    const groupRef = _groupRefOf(rec);

    // An APPROVED mapping is applied deterministically (saved rules only); otherwise
    // the first-party canonical/wide read.
    let items;
    if (activeMap) items = mappingLib.applyMapping(rec, activeMap);
    else {
      items = [];
      const date = rec.date || rec.ts || rec.timestamp || rec.time || null;
      if (rec.label != null && rec.value != null) items.push({ label: rec.label, value: rec.value, date, event: externalId });
      else for (const [k, val] of Object.entries(rec)) {
        const norm = k.toLowerCase().replace(/[\s_-]/g, '');
        if (_META_KEYS.includes(k.toLowerCase()) || _SUBJECT_KEYS.includes(norm)) continue;
        const num = typeof val === 'number' ? val : (typeof val === 'string' && /^-?\d+(?:\.\d+)?$/.test(val.trim()) ? Number(val.trim()) : null);
        if (num != null) items.push({ label: k, value: num, date, event: externalId });
      }
    }
    let any = false;
    items.forEach(it => {
      const r = _recordEvidence(code, {
        provider, source, externalId: it.event || externalId,
        subjectRef, subjectId: uid || null, groupRef,
        type: evidence.EVIDENCE_TYPES.includes(it.type) ? it.type : 'metric',
        label: it.label, value: it.value, unit: it.unit || null,
        observedAt: it.date || null, retrievedAt, confidence,
        visibility: activeMap ? (activeMap.visibilityDefault || 'normal') : 'normal',
        mappingVersion: activeMap ? activeMap.version : null,
      }, rec);
      if (r.duplicate) { stats.duplicates++; return; }
      if (!r.stored) return;
      if (activeMap) r.envelope.mappingId = activeMap.id;
      stats.stored++;
      if (r.promotable && _promoteEvidence(code, r.envelope)) { stats.imported++; any = true; }
    });
    if (any) subjects.add(uid);
  });
  if (stats.stored) scheduleSave();
  return { imported: stats.imported, subjects: subjects.size, matched: stats.matched, probable: stats.probable, unmatched: stats.unmatched, conflicts: stats.conflicts, stored: stats.stored, duplicates: stats.duplicates, held: stats.held, conflictNames: [...conflictNames].slice(0, 6) };
}

/* POST /api/ingest — the push door. Any app / webhook / script POSTs data in ANY
   shape; the universal mapper deciphers it. Authed by the per-org ingest token. */
app.post('/api/ingest', (req, res) => {
  const tok = (req.headers.authorization || '').replace('Bearer ', '').trim() || req.body?.token;
  const code = _orgByIngestToken(tok);
  if (!code) return res.status(401).json({ error: 'invalid ingest token' });
  const source = String(req.body?.source || 'custom').slice(0, 40);
  // Accept the whole body (minus the token/source envelope) in whatever shape it is.
  const payload = (req.body?.records || req.body?.data || req.body?.results)
    ? req.body
    : (Array.isArray(req.body) ? req.body : { ...req.body });
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) { delete payload.token; delete payload.source; }
  const r = _ingestGeneric(code, payload, null, { source, provider: source });
  if (!r.stored && !r.duplicates && !r.unmatched && !r.conflicts) return res.status(400).json({ error: 'no usable data found', hint: 'send JSON containing a person (email/name/userId) and one or more numbers' });
  res.json({ ok: true, imported: r.imported, people: r.subjects, matched: r.matched, probable: r.probable, unmatched: r.unmatched, conflicts: r.conflicts, stored: r.stored, duplicates: r.duplicates, conflictNames: r.conflictNames });
});

/* GET /api/connectors/manifest — the capability contract: the universal data model,
   the read/action capabilities, and the reference connector manifests. This is the
   published surface an org (or a future connector author) builds against. */
app.get('/api/connectors/manifest', requirePermission('manage_settings'), (req, res) => {
  res.json({ ok: true, primitives: connectorSDK.PRIMITIVES, capabilities: connectorSDK.CAPABILITIES,
    connectors: connectorSDK.MANIFESTS, evidenceTypes: evidence.EVIDENCE_TYPES,
    confidenceStates: evidence.CONFIDENCE_STATES, lifecycleStates: evidence.LIFECYCLE_STATES });
});

/* GET /api/evidence — the audit trail of the canonical evidence layer. Every record
   that crossed the boundary, with its identity confidence, promotion status, and a
   pointer to the raw immutable record. Admin-only; content is summarised (no private
   payload dump) so it's safe to review. This is how an org SEES what entered — or was
   held back from — its organisational truth. */
app.get('/api/evidence', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const log = evidenceLog[code] || [];
  const filterConf = req.query.confidence;   // e.g. ?confidence=unmatched to review what was held back
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const rows = log.filter(e => !filterConf || e.confidence === filterConf).slice(-limit).reverse().map(e => ({
    id: e.id, provider: e.provider, source: e.source, externalId: e.externalId,
    subjectId: e.subjectId, subjectRef: e.subjectRef, groupRef: e.groupRef,
    type: e.type, label: e.label, value: e.value, unit: e.unit,
    observedAt: e.observedAt, retrievedAt: e.retrievedAt,
    confidence: e.confidence, status: e.status, visibility: e.visibility,
    mappingVersion: e.mappingVersion, rawRef: e.rawRef,
    promoted: !!e.promoted, promotedAt: e.promotedAt || null,
    resolutions: (e.resolutions || []).length,
  }));
  const summary = { total: log.length,
    promoted:  log.filter(e => e.promoted).length,
    unmatched: log.filter(e => e.confidence === 'unmatched' && !e.promoted).length,
    conflict:  log.filter(e => e.confidence === 'conflict' && !e.promoted).length };
  res.json({ ok: true, summary, evidence: rows });
});

/* ── Identity review queue + resolution actions ───────────────────────────────
   The living lifecycle made visible + actionable. Admin-only. */
app.get('/api/identity/review', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const users = orgUsers[code] || {};
  const log = evidenceLog[code] || [];
  const nameOf = id => users[id]?.name || id;
  const brief = e => ({ id: e.id, provider: e.provider, source: e.source, type: e.type, label: e.label,
    value: e.value, unit: e.unit, valueText: e.valueText, observedAt: e.observedAt, subjectRef: e.subjectRef, rawRef: e.rawRef });
  // Recompute a live candidate against the CURRENT roster (deterministic first).
  const liveCandidates = e => {
    const raw = e.rawRef && rawEvidence[e.rawRef] ? rawEvidence[e.rawRef].record : _envelopeIdentityRecord(e);
    const idr = connectorSDK.resolveIdentity(users, (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : _envelopeIdentityRecord(e));
    if (idr.id) return [{ subjectId: idr.id, name: nameOf(idr.id), confidence: idr.confidence, reason: `matched by ${idr.key}` }];
    return [];
  };
  const unmatched = [], conflicts = [], probable = [], recentlyResolved = [];
  for (const e of log) {
    if (e.status === 'rejected') continue;
    if (e.promoted) { if ((e.resolutions || []).length) recentlyResolved.push({ ...brief(e), subjectId: e.subjectId, subjectName: nameOf(e.subjectId), resolvedBy: e.resolvedBy, resolvedMethod: e.resolvedMethod, resolvedAt: e.resolvedAt }); continue; }
    if (e.candidate) { probable.push({ ...brief(e), candidates: [{ subjectId: e.candidate.subjectId, name: nameOf(e.candidate.subjectId), reason: e.candidate.reason }] }); continue; }
    if (e.confidence === 'conflict') { conflicts.push({ ...brief(e), note: e.candidateNote || 'name matched more than one person', candidates: [] }); continue; }
    if (e.confidence === 'unmatched') { unmatched.push({ ...brief(e), candidates: liveCandidates(e) }); continue; }
  }
  const cap = a => a.slice(-100).reverse();
  res.json({ ok: true,
    counts: { unmatched: unmatched.length, conflicts: conflicts.length, probable: probable.length, recentlyResolved: recentlyResolved.length },
    unmatched: cap(unmatched), conflicts: cap(conflicts), probable: cap(probable), recentlyResolved: cap(recentlyResolved) });
});

/* Run a re-resolution pass on demand (also runs automatically on roster changes). */
app.post('/api/identity/reresolve', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, ..._reresolveUnmatched(code, { by: req.iqSession.userId, method: 'rule', reason: 'admin re-resolve' }) });
});

/* Admin CONFIRMS a specific person for a held-back envelope → resolve + promote once.
   Fuzzy never confirms itself; this is where a human closes the loop. */
app.post('/api/evidence/:id/resolve', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const env = (evidenceLog[code] || []).find(e => e.id === req.params.id);
  if (!env) return res.status(404).json({ error: 'evidence not found' });
  if (env.promoted) return res.status(409).json({ error: 'already resolved and promoted' });
  const subjectId = String(req.body?.subjectId || '');
  if (!orgUsers[code]?.[subjectId]) return res.status(400).json({ error: 'unknown subject' });
  if (!new Set(getVisibleUserIds(code, req.iqSession.userId)).has(subjectId)) return res.status(403).json({ error: 'subject not in your range' });
  _appendResolution(code, env, { subjectId, confidence: 'confirmed', by: req.iqSession.userId, method: 'admin', reason: String(req.body?.reason || 'admin confirmed').slice(0, 200) });
  delete env.candidate; delete env.candidateNote;
  const promoted = _promoteEvidence(code, env);
  scheduleSave();
  res.json({ ok: true, promoted, evidenceId: env.id, subjectId });
});

/* Admin dismisses a proposed/unmatched item (won't promote; drops out of the queue). */
app.post('/api/evidence/:id/reject', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const env = (evidenceLog[code] || []).find(e => e.id === req.params.id);
  if (!env) return res.status(404).json({ error: 'evidence not found' });
  if (env.promoted) return res.status(409).json({ error: 'already promoted — reverse it instead' });
  delete env.candidate; delete env.candidateNote;
  _appendResolution(code, env, { subjectId: null, confidence: env.confidence === 'conflict' ? 'conflict' : 'unmatched', by: req.iqSession.userId, method: 'admin', status: 'rejected', reason: String(req.body?.reason || 'admin rejected').slice(0, 200) });
  scheduleSave();
  res.json({ ok: true, evidenceId: env.id });
});

/* REVERSAL — undo a resolution: remove the emitted signal and return the envelope
   to unmatched so it can be re-resolved. Real, not cosmetic. */
app.post('/api/evidence/:id/reverse', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const env = (evidenceLog[code] || []).find(e => e.id === req.params.id);
  if (!env) return res.status(404).json({ error: 'evidence not found' });
  if (!env.promoted) return res.status(409).json({ error: 'not promoted' });
  if (env.signalId && Array.isArray(orgSignals[code])) orgSignals[code] = orgSignals[code].filter(s => s.id !== env.signalId);
  _appendResolution(code, env, { subjectId: null, confidence: 'unmatched', by: req.iqSession.userId, method: 'reversal', reason: String(req.body?.reason || 'admin reversed').slice(0, 200) });
  env.promoted = false; env.signalId = null; env.promotedAt = null;
  scheduleSave();
  res.json({ ok: true, evidenceId: env.id });
});

/* ═══ MAPPING APPROVAL LIFECYCLE ═══════════════════════════════════════════════
   draft → proposed → approved → active → superseded/retired. Admin-gated + audited.
   Only ACTIVE mappings promote; versions are immutable (edit forks a draft);
   activation never auto-reinterprets history (reprocessing is a separate action). */
function _publicMapping(m) {
  return { id: m.id, provider: m.provider, connector: m.connector, sourceObject: m.sourceObject,
    version: m.version, status: m.status, schemaFingerprint: m.schemaFingerprint,
    subjectField: m.subjectField, dateField: m.dateField, eventField: m.eventField,
    fields: m.fields, requiredFields: m.requiredFields, optionalFields: m.optionalFields,
    identityStrategy: m.identityStrategy, visibilityDefault: m.visibilityDefault,
    proposedBy: m.proposedBy, approvedBy: m.approvedBy, approvedAt: m.approvedAt,
    testSample: m.testSample, expectedOutput: m.expectedOutput,
    rejected: !!m.rejected, createdAt: m.createdAt, audit: m.audit || [] };
}
function _mapAudit(m, action, by) { (m.audit = m.audit || []).push({ action, by, ts: new Date().toISOString() }); }

/* Version history for a provider (or all) — the "version history" UI area. */
app.get('/api/mappings', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const all = _mappingsFor(code);
  const provider = req.query.provider;
  const rows = (provider ? all.filter(m => m.provider === provider) : all).map(_publicMapping);
  res.json({ ok: true, mappings: rows,
    awaiting: all.filter(m => m.status === 'proposed' || m.status === 'draft').length,
    active: all.filter(m => m.status === 'active').length });
});

/* "Mappings awaiting review" UI area. */
app.get('/api/mappings/awaiting', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, mappings: _mappingsFor(code).filter(m => m.status === 'proposed' || m.status === 'draft' || m.status === 'approved').map(_publicMapping) });
});

app.get('/api/mappings/:id', requirePermission('manage_settings'), (req, res) => {
  const m = _mappingById(req.iqSession.orgCode, req.params.id);
  if (!m) return res.status(404).json({ error: 'mapping not found' });
  res.json({ ok: true, mapping: _publicMapping(m) });
});

/* "Transformation preview" UI area — sample records → canonical output, before approval. */
app.post('/api/mappings/:id/preview', requirePermission('manage_settings'), (req, res) => {
  const m = _mappingById(req.iqSession.orgCode, req.params.id);
  if (!m) return res.status(404).json({ error: 'mapping not found' });
  const records = Array.isArray(req.body?.records) && req.body.records.length ? req.body.records : (m.testSample || []);
  const preview = mappingLib.preview(records, m, 8);
  const drift = mappingLib.detectDrift(records, m);
  res.json({ ok: true, preview, drift });
});

/* Approve a proposed/draft mapping (does NOT activate). Permission-gated + audited. */
app.post('/api/mappings/:id/approve', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const m = _mappingById(code, req.params.id);
  if (!m) return res.status(404).json({ error: 'mapping not found' });
  if (m.status !== 'proposed' && m.status !== 'draft') return res.status(409).json({ error: `cannot approve a ${m.status} mapping` });
  m.status = 'approved'; m.approvedBy = req.iqSession.userId; m.approvedAt = new Date().toISOString();
  _mapAudit(m, 'approve', req.iqSession.userId); scheduleSave();
  res.json({ ok: true, mapping: _publicMapping(m) });
});

/* Activate an approved (or previously superseded → rollback) version. Supersedes the
   current active for the same provider. Does NOT reprocess history (that's explicit). */
app.post('/api/mappings/:id/activate', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const m = _mappingById(code, req.params.id);
  if (!m) return res.status(404).json({ error: 'mapping not found' });
  if (m.rejected) return res.status(409).json({ error: 'mapping was rejected' });
  if (m.status !== 'approved' && m.status !== 'superseded') return res.status(409).json({ error: `only an approved or superseded version can be activated (this is ${m.status})` });
  const prior = _activeMapping(code, m.provider);
  if (prior && prior.id !== m.id) { prior.status = 'superseded'; _mapAudit(prior, 'superseded', req.iqSession.userId); }
  m.status = 'active'; _mapAudit(m, 'activate', req.iqSession.userId); scheduleSave();
  res.json({ ok: true, mapping: _publicMapping(m), superseded: prior && prior.id !== m.id ? prior.id : null });
});

/* Roll back to the most recent previously-active (superseded) version for a provider,
   restoring it without mutating any history. */
app.post('/api/mappings/:provider/rollback', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode; const provider = req.params.provider;
  const prev = _mappingsFor(code).filter(m => m.provider === provider && m.status === 'superseded').sort((a, b) => b.version - a.version)[0];
  if (!prev) return res.status(404).json({ error: 'no previous version to roll back to' });
  const cur = _activeMapping(code, provider);
  if (cur) { cur.status = 'superseded'; _mapAudit(cur, 'rolled-back-from', req.iqSession.userId); }
  prev.status = 'active'; _mapAudit(prev, 'rollback-activate', req.iqSession.userId); scheduleSave();
  res.json({ ok: true, mapping: _publicMapping(prev), from: cur ? cur.id : null });
});

/* Retire the active mapping — stops FUTURE promotion; keeps all prior evidence. */
app.post('/api/mappings/:id/retire', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const m = _mappingById(code, req.params.id);
  if (!m) return res.status(404).json({ error: 'mapping not found' });
  m.status = 'retired'; _mapAudit(m, 'retire', req.iqSession.userId); scheduleSave();
  res.json({ ok: true, mapping: _publicMapping(m) });
});

/* Reject a proposal — it produces no evidence or signals; held records stay held. */
app.post('/api/mappings/:id/reject', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const m = _mappingById(code, req.params.id);
  if (!m) return res.status(404).json({ error: 'mapping not found' });
  if (m.status === 'active') return res.status(409).json({ error: 'retire an active mapping instead of rejecting' });
  m.status = 'retired'; m.rejected = true; _mapAudit(m, 'reject', req.iqSession.userId); scheduleSave();
  res.json({ ok: true, mapping: _publicMapping(m) });
});

/* Edit → FORK a new draft version (immutability: approved contracts are never mutated). */
app.post('/api/mappings/:id/edit', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const m = _mappingById(code, req.params.id);
  if (!m) return res.status(404).json({ error: 'mapping not found' });
  const patch = req.body?.patch || {};
  const draft = JSON.parse(JSON.stringify(m));
  draft.id = 'map_' + generateId();
  draft.version = _nextMappingVersion(code, m.provider);
  draft.status = 'draft'; draft.rejected = false;
  draft.approvedBy = null; draft.approvedAt = null; draft.proposedBy = req.iqSession.userId;
  draft.forkedFrom = m.id; draft.audit = [{ action: 'fork', by: req.iqSession.userId, ts: new Date().toISOString() }];
  if (Array.isArray(patch.fields)) draft.fields = patch.fields.map(f => ({ from: String(f.from || '').slice(0, 60), primitive: 'metric', evidenceType: evidence.EVIDENCE_TYPES.includes(f.evidenceType) ? f.evidenceType : 'metric', label: String(f.label || f.from || 'Metric').slice(0, 80), unit: f.unit ? String(f.unit).slice(0, 24) : null, transform: (f.transform && typeof f.transform === 'object') ? f.transform : null, include: f.include !== false }));
  if (patch.subjectField !== undefined) draft.subjectField = patch.subjectField;
  if (patch.dateField !== undefined) draft.dateField = patch.dateField;
  if (patch.identityStrategy) draft.identityStrategy = patch.identityStrategy;
  if (patch.visibilityDefault) draft.visibilityDefault = patch.visibilityDefault;
  draft.expectedOutput = mappingLib.preview(draft.testSample || [], draft).samples.map(s => s.output);
  _mappingsFor(code).push(draft); scheduleSave();
  res.json({ ok: true, mapping: _publicMapping(draft) });
});

/* Explicit REPROCESS — interpret held records under the active mapping (deliberate
   replay; preserves observed time). Never automatic on activation. */
app.post('/api/mappings/:provider/reprocess', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const r = _reprocessHeld(code, req.params.provider, req.iqSession.userId);
  if (r.error) return res.status(409).json(r);
  res.json({ ok: true, ...r });
});

/* ── Connections: connect to anything with a URL. The org configures a source; the
   server polls it on a schedule and the mapper turns whatever comes back into
   signals. SSRF-guarded and admin-only. ──────────────────────────────────────── */
function _urlIsSafe(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (['localhost', '0.0.0.0', '::1', '[::1]'].includes(h)) return false;
    if (/^127\.|^10\.|^192\.168\.|^169\.254\./.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch (_) { return false; }
}
/* Refresh an OAuth2 access token when it's expired (standard refresh_token grant). */
async function _oauthRefresh(code, conn) {
  const oa = conn.oauth; const prov = OAUTH_PROVIDERS[oa.provider]; const app = orgOAuthApps[code]?.[oa.provider];
  if (!oa.refreshToken || !prov || !app) return false;
  try {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: oa.refreshToken, client_id: app.clientId, client_secret: app.clientSecret });
    const resp = await fetch(oa.tokenUrl || prov.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
    if (!resp.ok) return false;
    const j = await resp.json();
    if (!j.access_token) return false;
    oa.accessToken = j.access_token;
    if (j.refresh_token) oa.refreshToken = j.refresh_token;
    oa.expiresAt = j.expires_in ? Date.now() + (j.expires_in - 60) * 1000 : (oa.expiresAt || 0);
    scheduleSave();
    return true;
  } catch (_) { return false; }
}
/* ── The durable SYNC RUN model ───────────────────────────────────────────────
   connection → run created → fetch → raw persisted → mapping applied → identity
   resolved → evidence recorded → cursor committed → run finalized. The cursor is
   committed ONLY after the batch safely crosses the evidence boundary, so a failed
   run resumes without skipping records (and dedupe makes the replay idempotent). */
function _newSyncRun(code, conn, trigger) {
  const run = { id: 'run_' + generateId(), org: code, connId: conn.id, trigger: trigger || 'poll',
    status: 'running', startedAt: new Date().toISOString(), completedAt: null,
    cursorBefore: conn.cursor || null, cursorAfter: null, latencyMs: null,
    metrics: { fetched: 0, held: 0, promoted: 0, duplicates: 0, unresolved: 0, drift: 0, deletions: 0, failed: 0 },
    failureClass: null, error: null };
  const list = (syncRuns[code] = syncRuns[code] || []);
  list.push(run);
  if (list.length > SYNC_RUN_CAP) list.splice(0, list.length - SYNC_RUN_CAP);
  return run;
}
function _highWater(recs) {
  let max = null;
  (recs || []).forEach(r => { const d = r && (r.date || r.ts || r.timestamp || r.time); const t = d ? Date.parse(d) : NaN; if (!isNaN(t) && (max == null || t > max)) max = t; });
  return max ? new Date(max).toISOString() : null;
}
function _openFailures(code, connId) { return (failedRecords[code] || []).filter(f => f.status === 'open' && (!connId || f.connId === connId)); }
function _recordFailure(code, f) {
  const rec = { id: 'fail_' + generateId(), org: code, connId: f.connId || null, runId: f.runId || null,
    rawRef: f.rawRef || null, category: f.category || 'data', error: String(f.error || '').slice(0, 300),
    mappingVersion: f.mappingVersion || null, attempts: 1, firstFailedAt: new Date().toISOString(),
    lastFailedAt: new Date().toISOString(), retryEligible: f.category === 'temporary' || f.category === 'data', status: 'open' };
  (failedRecords[code] = failedRecords[code] || []).push(rec);
  return rec;
}

/* Deletion at source → a lifecycle event, never a raw-history erase. Matches active
   evidence by external id (or subject+label) and marks it deleted_at_source, keeping
   the evidence (withdrawn) and the immutable raw record intact. */
function _markDeletedAtSource(code, provider, rec) {
  const ext = _externalIdOf(rec); const subjectRef = _subjectRefOf(rec);
  let affected = 0;
  for (const env of (evidenceLog[code] || [])) {
    if (env.provider !== provider || env.status === 'deleted' || env.status === 'superseded') continue;
    const match = (ext && env.externalId === ext) || (subjectRef && env.subjectRef === subjectRef && (!rec.label || env.label === rec.label));
    if (!match) continue;
    const seen = _evidenceSeen[code]; if (seen) seen.delete(evidence.dedupeKey(env));
    env.status = 'deleted'; env.deletedAtSource = new Date().toISOString();
    if (env.promoted) _withdrawSignal(code, env);   // withdraw the signal; keep the evidence
    affected++;
  }
  return affected;
}

async function _runConnection(code, conn, opts = {}) {
  // One run per connection at a time — two workers/ticks cannot process it concurrently.
  if (_syncLocks[conn.id]) return { skipped: true, reason: 'already running' };
  if (conn.paused && !opts.force) return { skipped: true, reason: 'paused' };
  _syncLocks[conn.id] = true;
  conn.running = true;
  const startedIso = new Date().toISOString();
  conn.lastAttemptedSync = startedIso; conn.lastRun = startedIso;
  const run = _newSyncRun(code, conn, opts.trigger || 'poll');
  const t0 = Date.now();
  const finalize = (patch) => { Object.assign(run, patch); run.completedAt = new Date().toISOString(); run.latencyMs = Date.now() - t0; conn.running = false; delete _syncLocks[conn.id]; scheduleSave(); };
  const fail = (failureClass, message) => {
    conn.lastFailureClass = failureClass; conn.lastReason = message;
    conn.consecutiveFailures = (conn.consecutiveFailures || 0) + 1;
    if (syncLib.isRetryable(failureClass)) conn.nextAttemptAt = new Date(Date.now() + syncLib.backoffMs(conn.consecutiveFailures, { retryAfterSec: conn.retryAfterSec })).toISOString();
    else conn.nextAttemptAt = null;   // authorization/configuration/permanent → wait for intervention
    conn.lastStatus = `${failureClass} — ${message}`;
    finalize({ status: 'failed', failureClass, error: message });
    return { error: message, failureClass };
  };
  try {
    const headers = { ...(conn.headers || {}) };
    if (conn.oauth) {
      if (!conn.oauth.accessToken || (conn.oauth.expiresAt && Date.now() > conn.oauth.expiresAt)) {
        const ok = await _oauthRefresh(code, conn);
        if (!ok && (!conn.oauth.accessToken || Date.now() > (conn.oauth.expiresAt || 0))) return fail('authorization', 'token expired — reconnect');
      }
      headers.Authorization = `Bearer ${conn.oauth.accessToken}`;
    }
    if (!conn.url) return fail('configuration', 'no data URL set');
    if (!_urlIsSafe(conn.url)) return fail('configuration', 'blocked — unsafe or private URL');
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
    let resp;
    try { resp = await fetch(conn.url, { method: conn.method || 'GET', headers, signal: ctrl.signal }); }
    catch (e) { clearTimeout(timer); return fail(syncLib.classifyFailure({ message: e.message }), String(e.message || 'network error').slice(0, 80)); }
    clearTimeout(timer);
    const rl = syncLib.parseRateLimit(resp.headers);
    conn.rateLimit = rl; conn.retryAfterSec = rl.retryAfterSec; conn.rateLimited = rl.remaining === 0 || resp.status === 429;
    if (!resp.ok) return fail(syncLib.classifyFailure({ status: resp.status, message: `HTTP ${resp.status}` }), `HTTP ${resp.status}`);
    let data; try { data = await resp.json(); } catch (_) { return fail('data', 'response was not JSON'); }
    if (conn.jsonPath) { try { data = String(conn.jsonPath).split('.').reduce((o, k) => (o == null ? o : o[k]), data); } catch (_) {} }
    return _processBatch(code, conn, data, run, finalize);
  } catch (e) { return fail(syncLib.classifyFailure({ message: e.message }), String(e.message || 'error').slice(0, 80)); }
}

/* Process a fetched batch through the boundary — shared by polling AND webhooks so
   there is ONE truth path, not two. Commits the cursor only on a clean crossing. */
function _processBatch(code, conn, data, run, finalize) {
  let recs = Array.isArray(data) ? data : (data && Array.isArray(data.records) ? data.records : (data && Array.isArray(data.data) ? data.data : (data && Array.isArray(data.results) ? data.results : (data && typeof data === 'object' ? [data] : []))));
  run.metrics.fetched = recs.length;
  const provider = conn.oauth?.provider || conn.source || conn.name || 'connector';
  let deletions = 0; const upserts = [];
  recs.forEach(rec => {
    if (rec && (rec._deleted === true || rec.deleted === true || rec._op === 'delete')) deletions += _markDeletedAtSource(code, provider, rec);
    else if (rec && typeof rec === 'object') upserts.push(rec);
  });
  const r = _ingestGeneric(code, { records: upserts }, conn.createdBy, { source: conn.source || conn.name || 'connector', provider, requireApprovedMapping: true, connector: conn.id, sourceObject: conn.url, defaultSubjectId: conn.oauth?.subject === 'self' ? conn.createdBy : undefined });
  try { _reresolveUnmatched(code, { by: 'system', method: 'rule', reason: 'sync completed' }); } catch (_) {}
  conn.needsMappingApproval = !!r.needsMapping; conn.driftPaused = !!r.drift;
  Object.assign(run.metrics, { promoted: r.imported || 0, held: r.held || 0, duplicates: r.duplicates || 0, unresolved: r.unmatched || 0, drift: r.drift ? 1 : 0, deletions });
  if (!r.drift) {
    // Commit the cursor ONLY now that the batch has crossed the boundary.
    const hw = _highWater(upserts);
    conn.pendingCursor = hw || conn.pendingCursor || null;
    conn.cursor = conn.pendingCursor; conn.highWater = hw || conn.highWater || null;
    conn.lastCompletedSync = new Date().toISOString();
    conn.consecutiveFailures = 0; conn.lastFailureClass = null; conn.lastReason = null; conn.nextAttemptAt = null; conn.rateLimited = false;
  }
  conn.lastCount = r.imported || 0;
  conn.lastStatus = r.drift ? `paused — source schema changed. Review the mapping.`
    : r.needsMapping ? `held — ${r.held} record(s) retained; mapping awaiting approval.`
    : `ok — ${r.imported} promoted, ${r.held || 0} held, ${r.duplicates || 0} duplicate(s)${deletions ? `, ${deletions} deleted` : ''}`;
  finalize({ status: r.drift ? 'paused' : 'completed', failureClass: r.drift ? 'data' : null, cursorAfter: conn.cursor || null, error: r.drift ? 'schema drift' : null });
  return r;
}

const _publicConnection = (c, code) => {
  const failCount = _openFailures(code || '', c.id).length;
  const health = syncLib.deriveHealth({ ...c, failedRecordCount: failCount });
  return { id: c.id, name: c.name, url: c.url, method: c.method || 'GET', scheduleHours: c.scheduleHours, source: c.source, jsonPath: c.jsonPath || null,
    headerKeys: Object.keys(c.headers || {}), oauth: c.oauth ? { provider: c.oauth.provider } : null,
    lastRun: c.lastRun || null, lastStatus: c.lastStatus || 'never run', lastCount: c.lastCount || 0,
    health: health.status, healthReason: health.reason, paused: !!c.paused,
    cursor: c.cursor || null, highWater: c.highWater || null,
    lastAttemptedSync: c.lastAttemptedSync || null, lastCompletedSync: c.lastCompletedSync || null,
    nextAttemptAt: c.nextAttemptAt || null, expectedFreshnessMinutes: c.expectedFreshnessMinutes || null,
    rateLimited: !!c.rateLimited, failures: failCount };
};

app.get('/api/connections', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, connections: (orgConnections[code] || []).map(c => _publicConnection(c, code)) });
});
app.post('/api/connections', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { name, url, method, headers, scheduleHours, source, jsonPath } = req.body || {};
  if (!url || !_urlIsSafe(String(url))) return res.status(400).json({ error: 'A valid public https URL is required.' });
  const conn = {
    id: 'conn_' + _shortId(), name: String(name || 'Connection').slice(0, 80), url: String(url).slice(0, 600),
    method: /^post$/i.test(method) ? 'POST' : 'GET',
    headers: (headers && typeof headers === 'object') ? Object.fromEntries(Object.entries(headers).slice(0, 10).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 400)])) : {},
    scheduleHours: Math.max(1, Math.min(168, Number(scheduleHours) || 24)),
    source: String(source || name || 'connector').slice(0, 40), jsonPath: jsonPath ? String(jsonPath).slice(0, 120) : null,
    expectedFreshnessMinutes: Number(req.body?.expectedFreshnessMinutes) > 0 ? Math.min(43200, Number(req.body.expectedFreshnessMinutes)) : null,
    createdBy: req.iqSession.userId, createdAt: new Date().toISOString(), lastRun: null, lastStatus: 'never run', lastCount: 0,
  };
  (orgConnections[code] = orgConnections[code] || []).push(conn);
  scheduleSave();
  res.json({ ok: true, connection: _publicConnection(conn, code) });
});
app.delete('/api/connections/:id', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  orgConnections[code] = (orgConnections[code] || []).filter(c => c.id !== req.params.id);
  scheduleSave();
  res.json({ ok: true });
});
app.post('/api/connections/:id/run', requirePermission('manage_settings'), async (req, res) => {
  const code = req.iqSession.orgCode;
  const conn = (orgConnections[code] || []).find(c => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'not found' });
  const r = await _runConnection(code, conn, { trigger: 'manual' });
  res.json({ ok: !r.error, result: r, connection: _publicConnection(conn, code) });
});

/* ── Connection health, run history, controls, and the dead-letter queue ─────── */
app.get('/api/connections/:id/health', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const conn = (orgConnections[code] || []).find(c => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'not found' });
  const health = syncLib.deriveHealth({ ...conn, failedRecordCount: _openFailures(code, conn.id).length });
  const stale = syncLib.isStale(conn);
  const runs = (syncRuns[code] || []).filter(r => r.connId === conn.id);
  res.json({ ok: true, connection: _publicConnection(conn, code), health, staleness: stale,
    lastRun: runs[runs.length - 1] || null, runCount: runs.length,
    failures: _openFailures(code, conn.id).length });
});

app.get('/api/connections/:id/runs', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const runs = (syncRuns[code] || []).filter(r => r.connId === req.params.id).slice(-50).reverse();
  res.json({ ok: true, runs });
});

app.post('/api/connections/:id/pause', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const conn = (orgConnections[code] || []).find(c => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'not found' });
  conn.paused = true; conn.pauseReason = String(req.body?.reason || 'paused by admin').slice(0, 120);
  (conn.audit = conn.audit || []).push({ action: 'pause', by: req.iqSession.userId, ts: new Date().toISOString() });
  scheduleSave();
  res.json({ ok: true, connection: _publicConnection(conn, code) });
});

app.post('/api/connections/:id/resume', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const conn = (orgConnections[code] || []).find(c => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'not found' });
  conn.paused = false; conn.pauseReason = null; conn.consecutiveFailures = 0; conn.nextAttemptAt = null;
  (conn.audit = conn.audit || []).push({ action: 'resume', by: req.iqSession.userId, ts: new Date().toISOString() });
  scheduleSave();
  res.json({ ok: true, connection: _publicConnection(conn, code) });
});

/* Reset the cursor (deliberate full re-fetch). Audited — dedupe keeps it idempotent. */
app.post('/api/connections/:id/cursor/reset', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const conn = (orgConnections[code] || []).find(c => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'not found' });
  const was = conn.cursor;
  conn.cursor = null; conn.pendingCursor = null; conn.highWater = null;
  (conn.audit = conn.audit || []).push({ action: 'cursor-reset', by: req.iqSession.userId, from: was, ts: new Date().toISOString() });
  scheduleSave();
  res.json({ ok: true, connection: _publicConnection(conn, code) });
});

/* Dead-letter queue — org-scoped. A tenant can never see or replay another org's failures. */
app.get('/api/failures', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const connId = req.query.connId || null;
  res.json({ ok: true, failures: _openFailures(code, connId).slice(-200).reverse() });
});

/* Replay one failed record — from the ORIGINAL raw record, preserving observed time. */
function _replayFailure(code, f) {
  const conn = (orgConnections[code] || []).find(c => c.id === f.connId);
  const raw = f.rawRef && rawEvidence[f.rawRef] ? rawEvidence[f.rawRef].record : null;
  if (!raw) { f.error = 'raw record no longer available'; return { ok: false }; }
  const provider = conn ? (conn.oauth?.provider || conn.source || conn.name) : (f.provider || 'connector');
  const r = _ingestGeneric(code, { records: [raw] }, conn ? conn.createdBy : null, { source: provider, provider, requireApprovedMapping: true, connector: f.connId, sourceObject: conn?.url });
  f.attempts = (f.attempts || 1) + 1; f.lastFailedAt = new Date().toISOString();
  if (r.imported > 0 || r.held > 0) { f.status = 'replayed'; f.replayedAt = new Date().toISOString(); return { ok: true, result: r }; }
  return { ok: false, result: r };
}
app.post('/api/failures/:id/retry', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const f = (failedRecords[code] || []).find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'not found' });
  const out = _replayFailure(code, f); scheduleSave();
  res.json({ ok: out.ok, failure: f, result: out.result || null });
});
app.post('/api/connections/:id/failures/retry', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const list = _openFailures(code, req.params.id).filter(f => f.retryEligible);
  let replayed = 0; list.forEach(f => { if (_replayFailure(code, f).ok) replayed++; });
  scheduleSave();
  res.json({ ok: true, attempted: list.length, replayed });
});
app.post('/api/failures/:id/dismiss', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const f = (failedRecords[code] || []).find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'not found' });
  f.status = 'dismissed'; f.dismissedBy = req.iqSession.userId; f.dismissReason = String(req.body?.reason || '').slice(0, 200); f.dismissedAt = new Date().toISOString();
  scheduleSave();
  res.json({ ok: true, failure: f });
});

/* ── Webhooks — push delivery through the SAME truth path as polling ──────────
   1) verify signature · 2) persist delivery (dedupe) · 3) ack fast · 4) process via
   the shared boundary. A provider verification challenge is echoed. Duplicate
   deliveries are ignored; out-of-order events are handled by observedAt + supersede.
   Public route (providers can't send our auth header) but HMAC-authenticated. */
app.post('/api/webhooks/:code/:connId', (req, res) => {
  const code = String(req.params.code || '').toLowerCase();
  const conn = (orgConnections[code] || []).find(c => c.id === req.params.connId);
  if (!conn) return res.status(404).json({ error: 'unknown webhook' });

  // Provider verification challenge (echo it back) — supports setup handshakes.
  const challenge = req.body?.challenge || req.query?.challenge;
  if (challenge && (req.body?.type === 'url_verification' || req.query?.challenge)) return res.json({ challenge });

  // Signature verification (HMAC-SHA256 over the raw body with the connection secret).
  if (conn.webhookSecret) {
    const sigHeader = String(req.headers['x-iq-signature'] || req.headers['x-signature'] || '');
    const expected = 'sha256=' + crypto.createHmac('sha256', conn.webhookSecret).update(req.rawBody || Buffer.from(JSON.stringify(req.body || {}))).digest('hex');
    const a = Buffer.from(sigHeader); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'bad signature' });
  }

  // Idempotency: a delivery id is processed at most once (retries are safe no-ops).
  const deliveryId = String(req.headers['x-delivery-id'] || req.body?.deliveryId || req.body?.id || '').slice(0, 120);
  if (deliveryId) {
    const key = `${code}:${conn.id}:${deliveryId}`;
    if (webhookDeliveries[key]) return res.json({ ok: true, duplicate: true });
    webhookDeliveries[key] = { org: code, connId: conn.id, at: new Date().toISOString() };
  }

  // Ack FAST, then process through the same path as polling (one truth logic).
  res.json({ ok: true, received: true });
  try {
    const run = _newSyncRun(code, conn, 'webhook');
    const t0 = Date.now();
    _processBatch(code, conn, req.body, run, (patch) => { Object.assign(run, patch); run.completedAt = new Date().toISOString(); run.latencyMs = Date.now() - t0; scheduleSave(); });
  } catch (e) {
    _recordFailure(code, { connId: conn.id, category: syncLib.classifyFailure({ message: e.message }), error: e.message });
    scheduleSave();
  }
});

/* ═══ THE EXECUTION LAYER ══════════════════════════════════════════════════════
   Where IntelliQ participates in reality, not just reads it. Every capability is an
   implementation of the SAME contract (recommend→draft→confirm→execute→observe→
   evaluate→learn), and every outward/destructive step is checked against the org's
   POLICIES first. Reading, reasoning, and acting are separate authorities. */

function _policiesFor(code) {
  const c = (code || '').toLowerCase();
  if (!orgPolicies[c]) orgPolicies[c] = policyLib.defaultPolicies();
  return orgPolicies[c];
}

/* Calendar ADAPTERS — a provider is just an adapter behind the SAME capability. The
   internal adapter writes to our own store; a Google/Microsoft adapter would register
   here and translate to the provider API. The capability code never changes. */
const _CALENDAR_ADAPTERS = {
  internal: {
    create(code, ev) {
      const rec = { id: 'cal_' + generateId(), title: ev.title, start: ev.start, end: ev.end || null,
        attendees: Array.isArray(ev.attendees) ? ev.attendees : [], agenda: ev.agenda || '', groupRef: ev.groupRef || null,
        createdBy: ev.createdBy || 'system', createdAt: new Date().toISOString(), status: 'scheduled', attendance: {} };
      (orgCalendar[code] = orgCalendar[code] || []).push(rec);
      return rec;
    },
    get(code, id) { return (orgCalendar[code] || []).find(e => e.id === id) || null; },
  },
};
function _calendarAdapter(code) {
  // A connection could pin a provider adapter; default to internal.
  return _CALENDAR_ADAPTERS.internal;
}

/* The CAPABILITY REGISTRY. A capability plugs stage executors into the universal
   contract — no bespoke endpoints, no private truth logic, no policy exemptions.
   `intervention` is the internal reference; `calendar` is the first PRODUCTION edge —
   both are the SAME shape (recommend→draft→execute→observe→evaluate). Each executor
   returns a patch merged onto the action. */
const _CAPABILITIES = {
  intervention: {
    verbs: ['create'], category: null, authority: 'execute',
    // RECOMMEND — grounded in the person's kernel signals (why now).
    recommend(code, { subjectId, actorId }) {
      const subject = orgUsers[code]?.[subjectId];
      const first = subject?.name ? subject.name.split(' ')[0] : 'they';
      let whyNow = 'a supportive check-in', evidenceRefs = [];
      try {
        const m = _buildMemberIntelInput(code, subject, Date.now());
        const findings = m ? intel.detectPatterns(m) : [];
        if (findings.length) { const item = intel.composeBriefingItem(m, findings); whyNow = item.whyNow; }
        evidenceRefs = _gatherSignals(code, 'member', subjectId, 5).map(s => s.id);
      } catch (_) {}
      return { rationale: `${first} could use support — ${whyNow}.`, evidenceRefs, subjectId };
    },
    // DRAFT — the exact content a human will approve (deterministic; AI-enrichable).
    draft(code, action) {
      const subject = orgUsers[code]?.[action.subjectId];
      const first = subject?.name ? subject.name.split(' ')[0] : 'there';
      return { draft: { title: 'A supportive check-in', message: `${first}, taking a moment to check in — how are things going, and is there anything I can help with?`, kind: 'intervention' } };
    },
    // EXECUTE — INTERNAL, safe: prepare the intervention in the person's space. No
    // external side effect; this is the reference effect the loop measures.
    execute(code, action) {
      const rec = { id: 'iv_' + generateId(), subjectId: action.subjectId, message: action.draft?.message || '', createdBy: action.actorId, createdAt: new Date().toISOString(), from: 'execution-layer' };
      (orgInterventions[code] = orgInterventions[code] || []).push(rec);
      return { execution: { done: true, effect: 'prepared_intervention', ref: rec.id, at: new Date().toISOString() } };
    },
    // OBSERVE — what actually happened (reported outcome).
    observe(code, action, input) {
      const outcome = ['helped', 'no_change', 'worse'].includes(input?.outcome) ? input.outcome : 'no_change';
      return { observation: { outcome, note: String(input?.note || '').slice(0, 500), at: new Date().toISOString() } };
    },
    // EVALUATE — did it actually improve anything? Compare the person's mood signals
    // before vs after the action. THIS is the loop nobody else closes.
    evaluate(code, action) {
      const at = action.execution?.at ? new Date(action.execution.at).getTime() : Date.now();
      // Outcome evaluation reads CANONICAL mood evidence (source-only), never raw signals.
      const moods = _canonicalMoodSeries(code, action.subjectId).map(p => ({ ts: new Date(p.t).toISOString(), valueNum: p.mood, t: p.t }));
      const before = moods.filter(s => s.t < at).slice(-5);
      const after = moods.filter(s => s.t >= at).slice(0, 5);
      const avg = a => a.length ? a.reduce((x, s) => x + s.valueNum, 0) / a.length : null;
      const b = avg(before), a = avg(after);
      const improved = (b != null && a != null) ? a > b : null;
      return { evaluation: { improved, before: b, after: a, basis: `${before.length} before / ${after.length} after`, reportedOutcome: action.observation?.outcome || null, at: new Date().toISOString() } };
    },
  },

  /* CALENDAR — the first PRODUCTION capability. Reads through the Truth Pipeline,
     recommends a meeting when the evidence warrants it, drafts an agenda, creates the
     event (policy: calendar.create is ALLOWed by the default constitution — no
     approval needed, in contrast to interventions), observes attendance, and
     evaluates whether it actually reduced blockers. A real provider is just a
     different adapter; the loop below is unchanged. */
  calendar: {
    verbs: ['create'], category: null, authority: 'execute',
    // RECOMMEND — "this meeting should probably happen", grounded in the group's signals.
    recommend(code, { groupRef, actorId, context }) {
      const title = String(context?.title || '').slice(0, 120) || 'Team sync';
      // Ground it: a heavier-than-usual stretch or emerging blockers in the group.
      let why = 'to align on priorities', evidenceRefs = [];
      try {
        const recent = (orgSignals[code] || []).filter(s => /block|overdue|delay|stuck|load|workload/i.test(s.label || '')).slice(-5);
        if (recent.length) { why = 'blockers and load are building — a short alignment would help'; evidenceRefs = recent.map(s => s.id); }
      } catch (_) {}
      return { rationale: `A "${title}" meeting looks worthwhile — ${why}.`, evidenceRefs, groupRef: groupRef || context?.groupRef || null,
        draft: { title, attendees: Array.isArray(context?.attendees) ? context.attendees.slice(0, 40) : [] } };
    },
    // DRAFT — a concrete agenda + proposed time (deterministic; AI-enrichable later).
    draft(code, action) {
      const title = action.draft?.title || 'Team sync';
      const start = action.draft?.start || new Date(Date.now() + 86400000).toISOString();   // default: tomorrow
      const agenda = action.draft?.agenda || `1. Where we stand\n2. Blockers to clear\n3. Priorities for the week\n4. Owners + next steps`;
      return { draft: { ...(action.draft || {}), title, start, agenda, kind: 'calendar' } };
    },
    // EXECUTE — create the event via the adapter (internal here; a provider is an edge).
    execute(code, action) {
      const ev = _calendarAdapter(code).create(code, {
        title: action.draft?.title, start: action.draft?.start, end: action.draft?.end,
        agenda: action.draft?.agenda, attendees: action.draft?.attendees, groupRef: action.groupRef, createdBy: action.actorId });
      return { execution: { done: true, effect: 'calendar_event', ref: ev.id, at: new Date().toISOString() } };
    },
    // OBSERVE — attendance (who actually showed up), fed in or read from the provider.
    observe(code, action, input) {
      const ev = _calendarAdapter(code).get(code, action.execution?.ref);
      const attended = Array.isArray(input?.attended) ? input.attended : [];
      if (ev) { attended.forEach(uid => { ev.attendance[uid] = true; }); ev.status = 'occurred'; }
      const invited = (ev?.attendees || []).length || 0;
      return { observation: { attended: attended.length, invited, rate: invited ? attended.length / invited : null, at: new Date().toISOString() } };
    },
    // EVALUATE — did it reduce blockers? Compare blocker-signals before vs after.
    evaluate(code, action) {
      const at = action.execution?.at ? new Date(action.execution.at).getTime() : Date.now();
      const blockers = (orgSignals[code] || []).filter(s => /block|overdue|delay|stuck/i.test(s.label || ''));
      const before = blockers.filter(s => new Date(s.ts).getTime() < at).length;
      const after = blockers.filter(s => new Date(s.ts).getTime() >= at).length;
      const improved = (before || after) ? after < before : null;
      return { evaluation: { improved, blockersBefore: before, blockersAfter: after, attendanceRate: action.observation?.rate ?? null, basis: 'blocker signals before vs after', at: new Date().toISOString() } };
    },
  },
};

function _actionsFor(code) { return actionsLog[code] || (actionsLog[code] = []); }
function _actionById(code, id) { return (actionsLog[code] || []).find(a => a.id === id); }
function _actAudit(a, stage, by, extra) { a.audit.push({ stage, by: by || 'system', at: new Date().toISOString(), ...(extra || {}) }); a.updatedAt = new Date().toISOString(); }

/* Evaluate an action against the constitution for a given stage. */
function _policyCheck(code, action, stage, actorRole) {
  return policyLib.evaluate(_policiesFor(code), {
    capability: action.capability, verb: action.verb, stage,
    amount: action.amount, category: action.category, tags: action.tags, actorRole,
  });
}

/* ── Policy (the constitution) — admin-managed ──────────────────────────────── */
app.get('/api/policies', requirePermission('manage_settings'), (req, res) => {
  res.json({ ok: true, policies: _policiesFor(req.iqSession.orgCode), effects: policyLib.EFFECTS });
});
/* Dry-run: "what would you be allowed to do?" — transparency for admins + the UI. */
app.post('/api/policies/evaluate', requirePermission('manage_settings'), (req, res) => {
  const b = req.body || {};
  res.json({ ok: true, decision: policyLib.evaluate(_policiesFor(req.iqSession.orgCode), { capability: b.capability, verb: b.verb, stage: b.stage || 'execute', amount: b.amount, category: b.category, tags: b.tags, actorRole: b.actorRole }) });
});
app.post('/api/policies', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode; const r = req.body?.rule || {};
  if (!policyLib.EFFECTS.includes(r.effect)) return res.status(400).json({ error: 'invalid effect' });
  const list = _policiesFor(code);
  const rule = { id: r.id && list.some(x => x.id === r.id) ? r.id : ('pol_' + generateId()),
    effect: r.effect, capability: String(r.capability || '*').slice(0, 40), verb: String(r.verb || '*').slice(0, 40),
    stage: String(r.stage || 'execute').slice(0, 20),
    conditions: (r.conditions && typeof r.conditions === 'object') ? r.conditions : null,
    escalateTo: r.escalateTo || null, note: String(r.note || '').slice(0, 200), enabled: r.enabled !== false, builtin: false };
  const idx = list.findIndex(x => x.id === rule.id);
  if (idx >= 0) { if (list[idx].builtin) return res.status(409).json({ error: 'a built-in rule can be disabled but not edited' }); list[idx] = rule; }
  else list.push(rule);
  scheduleSave();
  res.json({ ok: true, rule, policies: list });
});
app.post('/api/policies/:id/toggle', requirePermission('manage_settings'), (req, res) => {
  const rule = _policiesFor(req.iqSession.orgCode).find(r => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'not found' });
  rule.enabled = !rule.enabled; scheduleSave();
  res.json({ ok: true, rule });
});
app.delete('/api/policies/:id', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode; const list = _policiesFor(code);
  const rule = list.find(r => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'not found' });
  if (rule.builtin) return res.status(409).json({ error: 'a built-in rule can be disabled, not deleted' });
  orgPolicies[code] = list.filter(r => r.id !== req.params.id); scheduleSave();
  res.json({ ok: true });
});
app.post('/api/policies/reset', requirePermission('manage_settings'), (req, res) => {
  orgPolicies[req.iqSession.orgCode] = policyLib.defaultPolicies(); scheduleSave();
  res.json({ ok: true, policies: orgPolicies[req.iqSession.orgCode] });
});

/* ── Actions — the universal execution orchestrator ─────────────────────────── */
app.get('/api/actions', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  if (!_isLeader(code, req.iqSession.userId)) return res.status(403).json({ error: 'leaders only' });
  const status = req.query.status;
  const rows = _actionsFor(code).filter(a => !status || a.status === status).slice(-100).reverse().map(actionLib.summarize);
  res.json({ ok: true, actions: rows });
});
app.get('/api/actions/:id', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  if (!_isLeader(code, req.iqSession.userId)) return res.status(403).json({ error: 'leaders only' });
  const a = _actionById(code, req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, action: a });
});

/* PROPOSE — the capability RECOMMENDS (grounded), and we snapshot the policy decision
   for the intended authority so the human sees up front what will/won't be allowed. */
app.post('/api/actions/propose', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode, userId = req.iqSession.userId;
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'leaders only' });
  const { capability, verb, subjectId, groupRef, category, amount, tags } = req.body || {};
  const cap = _CAPABILITIES[capability];
  if (!cap) return res.status(400).json({ error: 'unknown capability' });
  if (subjectId && !new Set(getVisibleUserIds(code, userId)).has(subjectId)) return res.status(403).json({ error: 'subject not in your range' });
  const rec = cap.recommend ? cap.recommend(code, { subjectId, groupRef, actorId: userId, context: req.body }) : {};
  const action = actionLib.buildAction({ id: 'act_' + generateId(), org: code, capability, verb: verb || cap.verbs[0], authority: cap.authority,
    actorId: userId, subjectId: rec.subjectId || subjectId, groupRef: rec.groupRef || groupRef, category: category || cap.category, amount, tags,
    rationale: rec.rationale, evidenceRefs: rec.evidenceRefs, draft: rec.draft || null, status: 'proposed' });
  action.policy = _policyCheck(code, action, 'execute', req.iqSession.role);   // preview the eventual gate
  const list = _actionsFor(code); list.push(action);
  if (list.length > ACTIONS_CAP) list.splice(0, list.length - ACTIONS_CAP);
  scheduleSave();
  res.json({ ok: true, action });
});

/* DRAFT — produce the exact content a human will review. Still nothing outward. */
app.post('/api/actions/:id/draft', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode, userId = req.iqSession.userId;
  const a = _actionById(code, req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'leaders only' });
  if (!actionLib.canAdvance(a.stage, 'draft') && a.stage !== 'draft') return res.status(409).json({ error: `cannot draft from ${a.stage}` });
  const cap = _CAPABILITIES[a.capability];
  const patch = cap.draft ? cap.draft(code, a) : {};
  Object.assign(a, patch); a.stage = 'draft'; a.status = 'drafted';
  a.policy = _policyCheck(code, a, 'execute', req.iqSession.role);
  _actAudit(a, 'draft', userId); scheduleSave();
  res.json({ ok: true, action: a });
});

/* APPROVE — a human authorises. Records the approval that a require_approval /
   escalate policy demands. */
app.post('/api/actions/:id/approve', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const a = _actionById(code, req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  a.approvals.push({ by: req.iqSession.userId, at: new Date().toISOString(), note: String(req.body?.note || '').slice(0, 200) });
  a.stage = 'confirm'; a.status = 'approved';
  _actAudit(a, 'confirm', req.iqSession.userId, { approval: true }); scheduleSave();
  res.json({ ok: true, action: a });
});
app.post('/api/actions/:id/reject', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode, userId = req.iqSession.userId;
  const a = _actionById(code, req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'leaders only' });
  a.status = 'rejected'; a.stage = 'rejected'; _actAudit(a, 'rejected', userId, { reason: String(req.body?.reason || '').slice(0, 200) }); scheduleSave();
  res.json({ ok: true, action: a });
});

/* EXECUTE — the only outward step. Policy-gated: DENY → refused; require_approval /
   escalate → must be approved first; allow → proceeds. Reading and drafting never
   reached here. */
app.post('/api/actions/:id/execute', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode, userId = req.iqSession.userId;
  const a = _actionById(code, req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'leaders only' });
  if (a.status === 'executed') return res.status(409).json({ error: 'already executed' });
  const decision = _policyCheck(code, a, 'execute', req.iqSession.role);
  a.policy = decision;
  if (decision.denied) { _actAudit(a, 'blocked', userId, { reason: decision.reason }); a.status = 'blocked'; scheduleSave(); return res.status(403).json({ error: 'policy forbids this action', decision }); }
  if (decision.requiresApproval && !a.approvals.length) { a.status = 'awaiting_approval'; _actAudit(a, 'awaiting_approval', userId); scheduleSave(); return res.status(409).json({ error: decision.escalate ? `must be escalated to ${decision.escalateTo}` : 'approval required before executing', decision }); }
  const cap = _CAPABILITIES[a.capability];
  try {
    const patch = cap.execute ? cap.execute(code, a) : { execution: { done: true, effect: 'noop', at: new Date().toISOString() } };
    Object.assign(a, patch); a.stage = 'observe'; a.status = 'executed';
    _actAudit(a, 'execute', userId, { policy: decision.effect }); scheduleSave();
    res.json({ ok: true, action: a });
  } catch (e) { a.status = 'failed'; _actAudit(a, 'failed', userId, { error: e.message }); scheduleSave(); res.status(500).json({ error: 'execution failed: ' + e.message }); }
});

/* OBSERVE → EVALUATE → LEARN — the feedback loop that closes on organisational
   improvement (the part almost every assistant skips). */
app.post('/api/actions/:id/observe', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode, userId = req.iqSession.userId;
  const a = _actionById(code, req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'leaders only' });
  if (a.status !== 'executed' && a.stage !== 'observe') return res.status(409).json({ error: 'observe only after execute' });
  const cap = _CAPABILITIES[a.capability];
  Object.assign(a, cap.observe ? cap.observe(code, a, req.body || {}) : {}); a.stage = 'evaluate';
  _actAudit(a, 'observe', userId); scheduleSave();
  res.json({ ok: true, action: a });
});
app.post('/api/actions/:id/evaluate', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode, userId = req.iqSession.userId;
  const a = _actionById(code, req.params.id);
  if (!a) return res.status(404).json({ error: 'not found' });
  if (!_isLeader(code, userId)) return res.status(403).json({ error: 'leaders only' });
  const cap = _CAPABILITIES[a.capability];
  Object.assign(a, cap.evaluate ? cap.evaluate(code, a) : {}); a.stage = 'learn'; a.status = 'evaluated';
  // LEARN — a durable signal back to the kernel: did this intervention help?
  if (a.evaluation) _emitSignalSafe(code, { subjectType: 'org', subjectId: null, source: 'external', modality: 'data',
    label: `Action outcome: ${a.capability}.${a.verb}`, valueNum: a.evaluation.improved === true ? 1 : a.evaluation.improved === false ? 0 : null,
    valueText: `evaluated ${a.capability}: improved=${a.evaluation.improved}`, sensitivity: 'normal', data: { action: a.id, evaluation: a.evaluation } });
  _actAudit(a, 'learn', userId); scheduleSave();
  res.json({ ok: true, action: a });
});

/* Calendar visibility — the events the execution layer scheduled (leader-scoped).
   Calendar needs NO bespoke action endpoints: it runs through /api/actions/* like
   every capability. This is the only read surface it adds. */
app.get('/api/calendar', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  if (!_isLeader(code, req.iqSession.userId)) return res.status(403).json({ error: 'leaders only' });
  const events = (orgCalendar[code] || []).slice(-100).reverse().map(e => ({
    id: e.id, title: e.title, start: e.start, end: e.end, status: e.status,
    invited: (e.attendees || []).length, attended: Object.keys(e.attendance || {}).length, agenda: e.agenda }));
  res.json({ ok: true, events });
});

/* ═══ THE THREE REASONING BOUNDARIES ══════════════════════════════════════════
   raw input → PRE-KERNEL → canonical evidence → KERNEL → derived evidence →
   POST-KERNEL → authorised experience/action. Each stage is a separate, typed
   service; none may quietly do another's job. Every meaningful step is recorded as
   an inspectable reasoning ARTIFACT (never chain-of-thought). See lib/reasoning.js. */
function _recordArtifact(code, input) {
  const art = reasoning.buildArtifact({ ...input, org: code, id: 'ra_' + generateId() });
  const list = reasoningArtifacts[code] || (reasoningArtifacts[code] = []);
  list.push(art);
  if (list.length > REASONING_CAP) list.splice(0, list.length - REASONING_CAP);
  return art;
}

/* Split raw text into bounded CLAIMS with a derivation + a floor-capped confidence.
   Deterministic; a model may enrich wording but structure (and the "never confirmed"
   rule) lives here so admissibility never depends on a model call. */
function _extractClaims(text) {
  const parts = String(text || '').split(/(?:[.!?]+|\band\b|\bbut\b|,\s*)/i).map(s => s.trim()).filter(s => s.length > 3);
  return parts.map(s => {
    const l = s.toLowerCase();
    let type = 'observation', derivation = 'observed', confidence = 'medium';
    if (/\b(said|told|mentioned|reported|asked me)\b/.test(l)) { type = 'statement'; derivation = 'reported'; confidence = 'low'; }
    else if (/\b(asked|request|move|reschedule|can we|could we|wants? to)\b/.test(l)) { type = 'request'; derivation = 'requested'; confidence = 'low'; }
    else if (/\b(seem|appeared|looked|felt|sounds?)\b/.test(l)) { type = 'observation'; derivation = 'observed'; confidence = 'low'; }
    else if (/\b\d+(\.\d+)?\s?(%|kg|km|hours?|mins?|points?|reps?)\b/.test(l)) { type = 'measurement'; derivation = 'measured'; confidence = 'high'; }
    else if (/\b(i will|i'll|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week)|deadline|commit)\b/.test(l)) { type = 'commitment'; derivation = 'requested'; confidence = 'medium'; }
    return { text: s.slice(0, 400), type, derivation, confidence };
  });
}
/* Strip conclusory framing so a pre-kernel claim can never assert a confirmed
   pattern/cause ("confirmed overload" → "reported that it was too much"). */
function _downgradeClaim(claim) {
  return { ...claim, derivation: 'reported', confidence: 'low',
    text: claim.text.replace(/\b(confirmed|is (overloaded|burned out|declining|withdrawing))\b/gi, 'reported difficulty').replace(/\bbecause of\b|\bcaused by\b|\bdue to\b/gi, 'possibly related to') };
}

/* A. PRE-KERNEL — InputInterpretationService. Raw text/workspace item → claim-bounded
   canonical evidence, preserving the raw source + transformation provenance. NEVER a
   confirmed conclusion or a longitudinal pattern. Personal-private material is
   interpreted for the OWNER only and never becomes organisational evidence. */
function _interpretInput(code, opts = {}) {
  const { text, ownerId, subjectId, rawRef, by, item } = opts;
  const vis = item ? workspaceLib.canonicalVisibility(item) : 'normal';   // private | sensitive | normal
  const isPrivate = vis === 'private';
  const orgFacing = !item || workspaceLib.informsOrgReasoning(item);
  const evidenceWorthy = !item || workspaceLib.producesEvidence(item);
  const claims = _extractClaims(text).map(c => reasoning.claimIsAdmissible(c) ? c : _downgradeClaim(c));
  const artifacts = [], evidenceIds = [];
  claims.forEach(claim => {
    const art = _recordArtifact(code, { stage: 'pre_kernel', type: 'transformed_evidence', derivation: claim.derivation,
      result: { text: claim.text, claimType: claim.type }, confidence: claim.confidence, rawRef,
      provenanceBy: by || ownerId || 'system', provenanceKind: opts.byModel ? 'model' : 'rule',
      limitations: claim.confidence === 'confirmed' ? [] : ['single report — unverified at capture'] });
    const check = reasoning.preKernelValid(art);
    if (!check.ok) { art.rejected = check.errors; return; }   // invalid pre-kernel output never proceeds
    if (!evidenceWorthy) return;
    // CORRECTION: meaningful content ALWAYS becomes canonical evidence. What changes is
    // its VISIBILITY and whether it emits an organisational signal:
    //   • private  → PRIVATE canonical evidence (owner-only), NO org signal, personal
    //                reasoning only. Kept so IntelliQ can remember + assist the owner.
    //   • org      → canonical evidence + (if permitted) an org signal.
    // A private claim is the owner's memory (all types); an org claim must be an
    // observation/measurement/statement.
    const admit = isPrivate ? true : ['observation', 'measurement', 'statement'].includes(claim.type);
    if (!admit) return;
    const evSubject = isPrivate ? ownerId : (subjectId || null);
    // A text reflection's factual identity IS its text — derive a stable key from it so
    // two distinct claims from one input don't collide, while an identical re-capture
    // dedups (a correction shares the item id but changes the text).
    let th = 0; for (const ch of String(claim.text)) th = (th * 31 + ch.charCodeAt(0)) >>> 0;
    const claimKey = `${item ? item.id : 'ws'}#${th.toString(36)}`;
    const r = _recordEvidence(code, {
      provider: 'workspace', source: 'workspace', subjectId: evSubject, externalId: claimKey,
      ownerRef: isPrivate ? ownerId : null, workspaceItemId: item ? item.id : null,
      type: claim.type === 'measurement' ? 'metric' : 'observation',
      label: isPrivate ? `Private reflection (${claim.type})` : `Observation (${claim.type})`,
      valueText: claim.text,
      // Stable observed-time per item (its capture time), so re-interpreting the SAME
      // item dedups/supersedes deterministically rather than forking by millisecond.
      observedAt: (item && item.createdAt) || new Date().toISOString(), retrievedAt: new Date().toISOString(),
      confidence: evSubject ? 'confirmed' : 'unmatched', visibility: vis,
    }, { rawText: text, workspaceItemId: item ? item.id : null });
    if (!r.stored) return;
    evidenceIds.push(r.id); art.result.evidenceId = r.id;
    // ORG signal ONLY for org-facing evidence. Private evidence is canonical but emits
    // NO organisational signal — it never enters organisational reasoning.
    if (orgFacing && !isPrivate && r.promotable) _promoteEvidence(code, r.envelope);
  });
  return { artifacts, evidenceIds, claims };
}

/* B. KERNEL EVIDENCE GATEWAY — the ONLY door to kernel reasoning. Returns canonical
   evidence envelopes only (never raw capability records), and PURPOSE-SCOPED: private
   evidence is excluded BEFORE any unauthorised context is built (never retrieved then
   filtered). A canonical record may be admissible for one purpose and not another. */
const PERSONAL_PURPOSES = ['personal_assistance', 'personal_memory', 'personal_planning', 'outcome_evaluation'];
const ORG_PURPOSES = ['workspace_shared_reasoning', 'leader_support', 'group_reasoning', 'organisation_reasoning'];
function _kernelEvidence(code, opts = {}) {
  const purpose = opts.purpose || 'organisation_reasoning';
  const personal = PERSONAL_PURPOSES.includes(purpose);
  const viewerId = opts.viewerId || null;
  const log = evidenceLog[code] || [];
  return log.filter(env => {
    if (env.status !== 'active') return false;
    if (opts.subjectId && env.subjectId !== opts.subjectId) return false;
    if (personal) {
      // Personal reasoning: the owner's own material. Private → only its owner.
      if (env.visibility === 'private') return !!viewerId && env.ownerRef === viewerId;
      return (env.subjectId && env.subjectId === viewerId) || (env.ownerRef && env.ownerRef === viewerId);
    }
    // ORGANISATIONAL purposes: private evidence NEVER passes; the rest must have
    // crossed the org truth boundary (promoted).
    if (env.visibility === 'private') return false;
    return env.promoted === true;
  }).map(env => ({ evidenceId: env.id, subjectId: env.subjectId, ownerRef: env.ownerRef || null, type: env.type,
    label: env.label, value: env.value, valueText: env.valueText, observedAt: env.observedAt,
    visibility: env.visibility, attributes: env.attributes || null, purpose, __canonical: true }));
}
/* Guard used by the gateway + tests: a raw capability record is NOT canonical. */
function _isCanonicalEvidence(x) { return !!x && x.__canonical === true && !!x.evidenceId; }

/* Record a KERNEL derivation as an artifact — enforces that it carries basis IDs. */
function _recordKernelDerivation(code, { type, result, basis, confidence, limitations, detector }) {
  const art = _recordArtifact(code, { stage: 'kernel', type: type || 'derived_pattern', derivation: 'pattern',
    result, basis: basis || [], confidence: confidence || 'low', limitations: limitations || [], provenanceBy: detector || 'kernel', provenanceKind: 'rule' });
  const check = reasoning.kernelOutputValid(art);
  if (!check.ok) { art.rejected = check.errors; }
  return art;
}

/* The visibility ceiling a DERIVED output inherits from its basis — the most
   restrictive of any basis evidence. Derived evidence can never be broader than its
   narrowest input (no broadening exceptions for personal_private in this commit). */
function _inheritedVisibility(code, basisIds) {
  const log = evidenceLog[code] || [];
  const order = { private: 3, sensitive: 2, normal: 1 };
  let worst = 'normal', owner = null;
  (basisIds || []).forEach(id => {
    const env = log.find(e => e.id === id);
    if (env && order[env.visibility] > order[worst]) { worst = env.visibility; owner = env.ownerRef || owner; }
    else if (env && env.visibility === 'private' && !owner) owner = env.ownerRef;
  });
  return { visibility: worst, ownerRef: worst === 'private' ? owner : null };
}
/* Record CANONICAL DERIVED evidence (a personal pattern/recommendation) inheriting an
   owner-only ceiling when any basis is private. It goes back through the SAME store —
   there is no separate personal-memory path outside canonical evidence. */
function _recordDerivedEvidence(code, { subjectId, ownerId, type, label, valueText, basisIds, confidence }) {
  const inh = _inheritedVisibility(code, basisIds);
  const r = _recordEvidence(code, {
    provider: 'kernel', source: 'derived', subjectId: subjectId || ownerId || null,
    ownerRef: inh.visibility === 'private' ? (inh.ownerRef || ownerId) : null,
    type: type || 'observation', label: label || 'Derived pattern', valueText: valueText || '',
    observedAt: new Date().toISOString(), retrievedAt: new Date().toISOString(),
    confidence: 'confirmed', visibility: inh.visibility, derivedFrom: basisIds || [],
  }, { derivedFrom: basisIds });
  return r;
}

/* C. POST-KERNEL — ExperienceReasoningService. Turns a kernel result into an
   audience-appropriate experience WITHOUT exceeding its strength, dropping its
   limitations, inventing facts, or citing evidence the audience can't see. */
function _composeForAudience(code, kernelArtifact, audience = {}) {
  // Purpose-scope the authorised citation set to the AUDIENCE: an owner reasoning
  // about themselves may see their private basis; a leader may not.
  const purpose = audience.purpose || (audience.role && audience.role !== 'member' ? 'leader_support' : 'personal_assistance');
  const authorised = new Set((_kernelEvidence(code, { subjectId: audience.subjectId, purpose, viewerId: audience.viewerId || audience.subjectId }) || []).map(e => e.evidenceId));
  // Only cite basis the audience is authorised to see.
  const cites = (kernelArtifact.basis || []).filter(id => authorised.has(id));
  const out = {
    confidence: kernelArtifact.confidence,                 // never raised
    limitations: [...(kernelArtifact.limitations || [])],  // preserved
    cites,
    text: audience.text || '',
    addedFactualClaim: false,
  };
  const check = reasoning.postKernelBounded(kernelArtifact, out, [...authorised]);
  const art = _recordArtifact(code, { stage: 'post_kernel', type: 'presentation_decision', derivation: 'decision',
    result: { audience: audience.role || 'member', cites: out.cites, text: out.text }, basis: kernelArtifact.basis || [],
    confidence: out.confidence, limitations: out.limitations, audienceScope: audience.role || 'member',
    policyContext: check.ok ? 'bounded' : 'REJECTED: ' + check.errors.join('; ') });
  return { output: out, artifact: art, ok: check.ok, errors: check.errors };
}

/* ═══ LEGACY CONVERGENCE — one truth layer, one context builder ════════════════
   Legacy capabilities (check-in, Studio, assessments) keep their operational records
   and surfaces but no longer own independent truth. An ADAPTER translates each record
   into claim-bounded canonical evidence (idempotent via a stable source key); the ONE
   shared CONTEXT BUILDER assembles reasoning context ONLY through the purpose-scoped
   gateway. No capability builds AI context from raw repositories. */

/* Record adapter outputs as canonical evidence — idempotent (the adapter's stable
   externalId means a replay dedups rather than forking a real-world event). Private
   inputs never promote to an organisational signal. */
function _ingestAdapterEvidence(code, inputs) {
  let recorded = 0, duplicates = 0;
  (inputs || []).forEach(inp => {
    const r = _recordEvidence(code, {
      provider: inp.provider, source: inp.source, externalId: inp.externalId,
      subjectId: inp.subjectId, ownerRef: inp.ownerRef, type: inp.type, label: inp.label,
      value: inp.value, unit: inp.unit, valueText: inp.valueText,
      observedAt: inp.observedAt, retrievedAt: inp.retrievedAt,
      // Envelope `confidence` is IDENTITY confidence — never the claim's epistemic
      // strength (that lives in the raw record's `strength`).
      confidence: inp.subjectId ? 'confirmed' : 'unmatched', visibility: inp.visibility,
      // The COMPLETE structured primitive object (e.g. an Assessment) rides on the envelope.
      attributes: inp.attributes || null,
    }, { adapter: inp.provider, derivation: inp.derivation, strength: inp.confidence, context: inp.context, provenanceKind: inp.provenanceKind });
    if (r.duplicate) { duplicates++; return; }
    if (!r.stored) return;
    recorded++;
    // Org-facing (non-private) evidence with a resolved subject promotes to a legacy signal —
    // UNLESS the claim opts out (lifecycle claims are canonical evidence only, not signals).
    if (inp.promote !== false && inp.visibility !== 'private' && r.promotable) _promoteEvidence(code, r.envelope);
  });
  if (recorded) scheduleSave();
  return { recorded, duplicates };
}

/* THE shared reasoning-context builder. Every migrated capability calls this instead
   of assembling context from raw repositories. Enforces purpose-scoped gateway access
   (private excluded before context for org purposes), records what entered context,
   and returns canonical evidence only. */
function _canonicalContext(opts = {}) {
  const { code, viewerId, purpose, subjectId } = opts;
  const ev = _kernelEvidence(code, { purpose: purpose || 'personal_assistance', viewerId, subjectId });
  // Record which evidence entered the model context (auditable; not chain-of-thought).
  _recordArtifact(code, { stage: 'kernel', type: 'derived_pattern', derivation: 'pattern',
    result: { contextFor: purpose, subject: subjectId || null, size: ev.length }, basis: ev.map(e => e.evidenceId).slice(0, 50),
    confidence: 'low', limitations: ['context assembly, not a conclusion'], provenanceBy: 'context-builder' });
  return ev;
}

/* ── FROZEN COMPATIBILITY-SIGNAL CONTRACT (non-authoritative) ──────────────────
   The check-in compatibility signal is a PARTICIPATION marker only. It carries exactly:
     • a timestamp (the signal record's ts),
     • a participation occurrence (source 'checkin', modality 'participation'),
     • a CONTENTLESS sensitivity-PRESENCE flag (that sensitive content exists, not what).
   It MUST NOT carry: a mood value, note/concern text, a trajectory, or any semantic
   inference (including a mood-derived weight). All longitudinal reasoning uses canonical
   evidence + the kernel. A frozen-contract test guards this so a future change cannot
   quietly re-add mood/content here. Named consumer: behaviour-engine participation
   cadence + last-activity + the contentless hasSensitiveContext flag. */
const CHECKIN_SIGNAL_CONTRACT = Object.freeze({
  allowedKeys: Object.freeze(['subjectType', 'subjectId', 'source', 'modality', 'label', 'sensitivity', 'data']),
  forbiddenKeys: Object.freeze(['valueNum', 'valueText', 'weightNum', 'trajectory', 'concern', 'mood']),
});
function _emitCheckinParticipationSignal(code, subjectId, opts = {}) {
  if (!subjectId) return null;
  const payload = {
    subjectType: 'member', subjectId, source: 'checkin', modality: 'participation',
    label: 'Check-in', sensitivity: opts.sensitivePresent ? 'sensitive' : 'normal',
    // Participation metadata only — a "returned after a quiet spell" event, never mood.
    data: opts.firstReturn ? { firstReturn: true, quietDays: opts.quietDays } : null,
  };
  // Contract guard (defence-in-depth): never let a forbidden field through.
  CHECKIN_SIGNAL_CONTRACT.forbiddenKeys.forEach(k => { if (k in payload) delete payload[k]; });
  try { return _emitSignalSafe(code, payload, subjectId); } catch (_) { return null; }
}

/* Emit canonical evidence for a check-in via the adapter (compatibility dual-write —
   the legacy signal remains for existing charts; canonical is authoritative for
   reasoning). Hardship notes are treated as PRIVATE (owner-only). */
function _canonicaliseCheckin(code, subjectId, rec) {
  if (!subjectId) return { recorded: 0, duplicates: 0 };
  const noteText = rec && (rec.note || rec.text) || '';
  // A hardship note is owner-only-private when it is sensitive OR restricted (isPrivate
  // covers both — a restricted disclosure must be protected at least as much, not less).
  const category = noteText ? privacy.classifyText(noteText, { source: 'checkin' }) : 'normal';
  const sensitiveNote = noteText ? privacy.isPrivate(category) : false;
  // Log the classification DECISION for observability — category + outcome + length, but
  // NEVER the substance. Lets ops inspect false positives/negatives without reading notes.
  if (noteText) _logCheckinClassification(code, { subjectId, category, madePrivate: sensitiveNote, length: noteText.length });
  // Adapter default: sensitive (informs org aggregate, never quoted). Then ONLY a
  // hardship note is escalated to private (owner-only) — the mood rating stays sensitive.
  const inputs = capAdapters.CheckInAdapter.toCanonicalEvidence(rec, { subjectId, private: false, now: new Date().toISOString() });
  inputs.forEach(i => { if (i.label === 'Check-in note' && sensitiveNote) { i.visibility = 'private'; i.ownerRef = subjectId; } });
  return _ingestAdapterEvidence(code, inputs);
}

/* ═══ ASSIGNED WORK → CANONICAL EVIDENCE (MyWorkspace) ═════════════════════════
   The assign → submit → assess → revise lifecycle becomes claim-bounded canonical
   evidence through the SAME AssessmentAdapter used by the backfill (one code path, no
   parallel logic). Legacy signals are preserved for backwards compatibility; the score
   claim promotes to the equivalent legacy signal, so downstream numeric reasoning is
   unchanged while the COMPLETE Assessment object becomes available for canonical reasoning. */

/* An issued assignment becomes a canonical commitment. */
function _canonicaliseCommitment(code, a) {
  if (!a || !a.assigneeId) return { recorded: 0, duplicates: 0 };
  return _ingestAdapterEvidence(code, capAdapters.AssessmentAdapter.commitment(a, { now: new Date().toISOString() }));
}

/* A submission becomes canonical evidence (append-only). A resubmission also emits a
   revision claim linking it to the prior submission. Privacy is CLASSIFIED, never
   hard-coded: a hardship disclosed in a submission note becomes sensitive. */
function _canonicaliseSubmission(code, a, sub) {
  if (!a || !sub || !a.assigneeId) return { recorded: 0, duplicates: 0 };
  const note = sub.note || '';
  const category = note ? privacy.classifyText(note, { source: 'workspace' }) : 'normal';
  const visibility = note && privacy.isPrivate(category) ? 'sensitive' : 'normal';   // informs, never quoted
  return _ingestAdapterEvidence(code, capAdapters.AssessmentAdapter.submission(a, sub, { now: new Date().toISOString(), visibility }));
}

/* A returned review becomes a COMPLETE canonical Assessment (assessor · rubric · scale ·
   feedback · submissionId) plus the feedback as an authored observation — emitted LIVE. */
function _canonicaliseAssessment(code, a) {
  if (!a || a.status !== 'returned' || !Number.isFinite(Number(a.score))) return { recorded: 0, duplicates: 0 };
  const submissionId = Array.isArray(a.submissions) && a.submissions.length ? a.submissions[a.submissions.length - 1].id : a.id;
  return _ingestAdapterEvidence(code, capAdapters.AssessmentAdapter.assessment(a, { now: new Date().toISOString(), submissionId }));
}

/* THE authorised complete-Assessment reader. Reads canonical assessment evidence DIRECTLY
   (like the mood series) so reasoning consumes the whole object — assessor, rubric, scale,
   feedback — never an isolated number. It is NOT an unrestricted raw reader: it enforces
   the ORG boundary (evidenceLog[code]), the SUBJECT, the PURPOSE, and VISIBILITY — a private
   assessment is admitted only for the owner under a personal purpose, and never for a
   leader-facing purpose. Authorship (assessorId) is preserved. Requester scope (can this
   viewer see this subject) is enforced by the calling endpoint; pass requesterId for audit. */
function _assessmentEvidenceFor(code, subjectId, opts = {}) {
  const purpose = opts.purpose || 'leader_support';
  const personal = PERSONAL_PURPOSES.includes(purpose);
  const viewerId = opts.viewerId || null;
  const log = evidenceLog[code] || [];
  return log.filter(env => {
    if (env.status !== 'active') return false;
    if (!(env.attributes && env.attributes.primitive === 'assessment')) return false;
    if (subjectId && env.subjectId !== subjectId) return false;
    // Private assessment → owner-only, personal purpose only. Leader/org purposes NEVER see it.
    if (env.visibility === 'private') return personal && !!viewerId && env.ownerRef === viewerId;
    return true;   // normal/sensitive work judgements are admissible for the scoped purpose
  }).map(env => ({
    evidenceId: env.id, subjectId: env.subjectId, observedAt: env.observedAt, visibility: env.visibility,
    assessmentId: env.attributes.assessmentId, submissionId: env.attributes.submissionId,
    assessorId: env.attributes.assessorId, rubric: env.attributes.rubric,
    score: env.attributes.score != null ? env.attributes.score : env.value, scoreScale: env.attributes.scoreScale,
    qualitativeFeedback: env.attributes.qualitativeFeedback, confidence: env.attributes.confidence,
    limitations: env.attributes.limitations, title: (env.label || '').replace(/^Assessment score:\s*/, ''),
    __canonical: true,
  })).sort((x, y) => new Date(x.observedAt) - new Date(y.observedAt));
}

/* The numeric ceiling of a score scale ('0-100' → 100, '0-50' → 50); null when unknown. */
function _scaleMax(scale) {
  const m = String(scale || '').match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[2]) : null;
}
/* Two assessments are comparable only when they share a scale AND a rubric — never compare
   across incompatible scales/rubrics/purposes. */
function _assessmentComparableKey(a) {
  const rubric = String(a.rubric || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${a.scoreScale || '?'}::${rubric || '?'}`;
}
/* Scale-aware LOW-assessment concern timestamps from CANONICAL assessments (never the naked
   legacy signal): a score below HALF of its OWN scale. So 45/50 and 45/100 are judged on
   their own scales, and an unknown scale raises NO false concern (a limitation, not a flag). */
function _assessmentConcerns(code, subjectId) {
  return _assessmentEvidenceFor(code, subjectId, { purpose: 'organisation_reasoning' })
    .filter(a => { const max = _scaleMax(a.scoreScale); return max && Number.isFinite(a.score) && a.score < max * 0.5; })
    .map(a => ({ t: new Date(a.observedAt).getTime(), evidenceId: a.evidenceId }));
}

/* BOUNDED ASSESSMENT KERNEL STATE — the developmental journey reconstructed from canonical
   commitment/submission/revision/assessment/observation evidence (never a naked score).
   Purpose-scoped (private excluded before the state is formed for leader/org purposes).
   Never compares assessments with incompatible scales/rubrics; retains basis IDs + limits. */
function _assessmentKernelState(code, subjectId, opts = {}) {
  const purpose  = opts.purpose || 'leader_support';
  const viewerId = opts.viewerId || null;
  const personal = PERSONAL_PURPOSES.includes(purpose);
  const log = evidenceLog[code] || [];
  const admit = env => {
    if (env.status !== 'active' || env.subjectId !== subjectId) return false;
    if (env.visibility === 'private') return personal && !!viewerId && env.ownerRef === viewerId;
    return true;
  };
  const byPrim = p => log.filter(e => e.attributes && e.attributes.primitive === p && admit(e));
  const assessments = _assessmentEvidenceFor(code, subjectId, { purpose, viewerId });   // complete, purpose-scoped
  const submissions = byPrim('submission');
  const revisions   = byPrim('revision');
  const observations = byPrim('observation');

  const latest = assessments.length ? assessments[assessments.length - 1] : null;
  const comparable = latest ? assessments.filter(a => _assessmentComparableKey(a) === _assessmentComparableKey(latest)) : [];

  let direction = 'unknown', confidence = null;
  const limitations = [];
  if (!latest) { limitations.push('no assessment evidence yet'); }
  else if (!latest.scoreScale || !latest.rubric) { limitations.push('assessment is missing its scale or rubric — no interpretation drawn'); }
  else if (comparable.length >= 2) {
    const first = comparable[0].score, last = comparable[comparable.length - 1].score;
    const max = _scaleMax(latest.scoreScale) || 100;
    const thr = max * 0.05;                                   // 5% of the scale
    direction = (last - first) > thr ? 'improvement' : (last - first) < -thr ? 'decline' : 'stable';
    confidence = comparable.length >= 3 ? 'medium' : 'low';
  } else if (assessments.length >= 2) {
    direction = 'incomparable';
    limitations.push('assessments used different scales or rubrics — a direct comparison is not established');
  } else {
    limitations.push('only one assessment — no comparison possible');
  }

  const feedbackActedUpon = revisions.some(r => r.attributes && r.attributes.respondsToAssessmentId);
  const latestAssignmentId = latest ? String(latest.assessmentId || '').replace(/^as_/, '') : null;
  const iterations = latestAssignmentId
    ? submissions.filter(s => s.attributes.assignmentId === latestAssignmentId).length
    : submissions.length;
  // Feedback THEMES = the dimensions assessed (structural), never the raw feedback text.
  const feedbackThemes = [...new Set(observations.map(o => o.attributes && o.attributes.dimension).filter(Boolean))].slice(0, 5);
  let whatChanged = null;
  if (feedbackActedUpon && iterations >= 2) whatChanged = `resubmitted (iteration ${iterations}) after feedback${feedbackThemes.length ? ` on ${feedbackThemes[0]}` : ''}`;

  const basisIds = [...assessments.map(a => a.evidenceId), ...submissions.map(s => s.id),
    ...revisions.map(r => r.id), ...observations.map(o => o.id)];

  const kernelArt = _recordKernelDerivation(code, {
    type: 'derived_pattern',
    result: { subject: subjectId, direction,
      latest: latest ? { score: latest.score, scoreScale: latest.scoreScale, hasRubric: !!latest.rubric } : null,
      assessmentCount: assessments.length, comparableCount: comparable.length, iterations, feedbackActedUpon, feedbackThemes },
    basis: basisIds.length ? basisIds : ['none'],
    confidence: confidence || 'low', limitations, detector: 'assessment-kernel',
  });

  return { subjectId, purpose, latest, assessments, comparable, direction, confidence,
    iterations, feedbackActedUpon, feedbackThemes, whatChanged, limitations, basisIds, kernelArt };
}

/* Kernel reasoning over one assignment's canonical evidence. Answers the four questions
   the migration requires — did they improve, did they respond to feedback, what changed,
   how many iterations — from submissions/revisions/assessments, never from a bare status. */
function _assignmentProgress(code, assignmentId, subjectId) {
  const log = evidenceLog[code] || [];
  const attrs = t => log.filter(e => e.status === 'active' && e.attributes && e.attributes.primitive === t
    && (e.attributes.assignmentId === assignmentId));
  const submissions = attrs('submission').sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
  const revisions   = attrs('revision');
  const assessments = (_assessmentEvidenceFor(code, subjectId, { purpose: 'leader_support' }) || [])
    .filter(a => a.assessmentId === `as_${assignmentId}`);
  const scores = assessments.map(a => a.score).filter(Number.isFinite);
  const improved = scores.length >= 2 ? (scores[scores.length - 1] > scores[0]) : null;
  return {
    assignmentId,
    iterations: submissions.length,
    respondedToFeedback: revisions.some(r => r.attributes.respondsToAssessmentId) || revisions.length > 0,
    improved,
    scoreTrend: scores,
    limitations: scores.length < 2 ? ['not enough scored iterations to judge improvement'] : [],
  };
}

/* Contentless classification audit — records the DECISION (category/outcome/length),
   never the note text. Bounded ring buffer so it can't grow unbounded. */
const checkinClassificationLog = {};
function _logCheckinClassification(code, entry) {
  const list = checkinClassificationLog[code] || (checkinClassificationLog[code] = []);
  list.push({ at: new Date().toISOString(), subjectId: entry.subjectId, category: entry.category,
    madePrivate: !!entry.madePrivate, length: entry.length | 0 });
  if (list.length > 2000) list.splice(0, list.length - 2000);
}
/* Aggregate classification decisions (contentless) so ops can watch the classifier's
   private-vs-normal balance and spot drift — starving org reasoning, or under-protecting. */
function _checkinClassificationAudit(code) {
  const list = checkinClassificationLog[code] || [];
  const byCategory = { normal: 0, sensitive: 0, restricted: 0 };
  let madePrivate = 0;
  list.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + 1; if (e.madePrivate) madePrivate++; });
  const total = list.length;
  return { total, byCategory, madePrivate, normalShare: total ? Math.round((byCategory.normal / total) * 100) : 0,
    privateShare: total ? Math.round((madePrivate / total) * 100) : 0 };
}

/* OBSERVABILITY — flag MATERIAL DISAGREEMENT between the raw aggregate dashboard (which
   still averages raw check-in rows) and the canonical aggregate reconstruction (per-member
   kernel state). The aggregation rules differ, so a gap is not proof either is wrong — but
   a leader seeing "team stable" while several members' kernel states report deterioration
   erodes trust. This DIAGNOSES the gap; it never silently forces the surfaces to match. */
function _checkinAggregateReconciliation(code, opts = {}) {
  const now = opts.now || Date.now();
  const WINDOW = 30 * 86400000;
  const members = Object.values(orgUsers[code] || {}).filter(u => u.role !== 'superadmin');
  // RAW dashboard method — average of raw check-in mood rows in the window.
  let rawSum = 0, rawCnt = 0;
  members.forEach(u => {
    [userKey(code, u.id), memberKey(code, u.name || '')].forEach(k => (memberCheckins[k] || []).forEach(c => {
      const t = new Date(c.ts || c.date).getTime();
      if (c.mood != null && !isNaN(t) && now - t < WINDOW) { rawSum += Number(c.mood); rawCnt++; }
    }));
  });
  const rawAvg = rawCnt ? rawSum / rawCnt : null;
  // CANONICAL reconstruction — per-member kernel state (org purpose) + canonical mood avg.
  let canSum = 0, canCnt = 0, diverging = 0, recovering = 0;
  members.forEach(u => {
    _canonicalMoodSeries(code, u.id).forEach(p => { if (now - p.t < WINDOW) { canSum += p.mood; canCnt++; } });
    const st = _checkinKernelState(code, u.id, { purpose: 'organisation_reasoning', viewerId: null, now });
    if (st.trajectory === 'diverging') diverging++;
    if (st.patterns.some(p => p.type === 'recovering')) recovering++;
  });
  const canonicalAvg = canCnt ? canSum / canCnt : null;
  const avgDelta = (rawAvg != null && canonicalAvg != null) ? Math.round((rawAvg - canonicalAvg) * 100) / 100 : null;
  const rawSaysStable = rawAvg != null && rawAvg >= 3;
  // Material disagreement: the dashboard reads "stable" while ≥1 member is diverging, or
  // the two averages diverge by more than half a point (different populations/windows).
  const disagreement = (rawSaysStable && diverging >= 1) || (avgDelta != null && Math.abs(avgDelta) >= 0.5);
  return { rawAvg: rawAvg != null ? Math.round(rawAvg * 100) / 100 : null,
    canonicalAvg: canonicalAvg != null ? Math.round(canonicalAvg * 100) / 100 : null,
    avgDelta, rawSaysStable, membersDiverging: diverging, membersRecovering: recovering,
    disagreement, note: disagreement
      ? 'Raw dashboard and canonical reconstruction disagree materially — investigate before trusting the aggregate.'
      : 'Raw dashboard and canonical reconstruction are consistent.' };
}

/* Admin diagnostics (never expose note substance — counts + decisions only). */
app.get('/api/admin/checkin-reconciliation', requirePermission('view_insights'), (req, res) => {
  res.json({ ok: true, reconciliation: _checkinAggregateReconciliation(req.iqSession.orgCode) });
});
app.get('/api/admin/checkin-classification-audit', requirePermission('view_insights'), (req, res) => {
  res.json({ ok: true, audit: _checkinClassificationAudit(req.iqSession.orgCode) });
});

/* Idempotent BACKFILL — run the adapters over existing operational records so history
   becomes canonical evidence. Retry-safe (dedupe), privacy-preserving (never broadens),
   timestamp-preserving. Returns an audit report. */
function _backfillCanonical(code, opts = {}) {
  // Reconciliation report: what was scanned, what claims we expected, what already
  // exists canonically, what we created, what deduped, and any privacy ambiguities.
  const report = { checkins: 0, assessments: 0, claimsExpected: 0, claimsPresent: 0,
    recorded: 0, duplicates: 0, privacyAmbiguities: 0, errors: 0, dryRun: !!opts.dryRun };
  const users = orgUsers[code] || {};
  const present = new Set((evidenceLog[code] || []).map(e => e.externalId).filter(Boolean));
  // Check-ins (keyed by `${code}:${userId}` or legacy `${code}:${name}`).
  for (const key of Object.keys(memberCheckins)) {
    if (!key.startsWith(code + ':')) continue;
    const idPart = key.slice(code.length + 1);
    const subjectId = users[idPart] ? idPart : _resolveUserIdByName(code, idPart);
    (memberCheckins[key] || []).forEach(rec => {
      report.checkins++;
      try {
        const noteText = rec.note || rec.text;
        const sensitiveNote = noteText ? privacy.isPrivate(privacy.classifyText(noteText, { source: 'checkin' })) : false;
        const inputs = capAdapters.CheckInAdapter.toCanonicalEvidence(rec, { subjectId, private: false, now: rec.ts });
        report.claimsExpected += inputs.length;
        inputs.forEach(i => {
          if (present.has(i.externalId)) report.claimsPresent++;
          if (i.label === 'Check-in note' && sensitiveNote) { i.visibility = 'private'; i.ownerRef = subjectId; }
        });
        // A note whose subject can't be resolved is a privacy ambiguity (we can't safely
        // own-scope it), so it is NOT recorded rather than risk mis-scoping.
        if (!subjectId && noteText) report.privacyAmbiguities++;
        if (opts.dryRun || !subjectId) return;
        const r = _ingestAdapterEvidence(code, inputs); report.recorded += r.recorded; report.duplicates += r.duplicates;
        inputs.forEach(i => present.add(i.externalId));
      } catch (_) { report.errors++; }
    });
  }
  // Returned assessments → score evidence (with rubric/evaluator retained).
  (assessmentAssignments[code] || []).forEach(a => {
    if (a.status !== 'returned' || !Number.isFinite(Number(a.score))) return;
    report.assessments++;
    try {
      const inputs = capAdapters.AssessmentAdapter.toCanonicalEvidence(a, { now: a.returnedAt });
      report.claimsExpected += inputs.length;
      inputs.forEach(i => { if (present.has(i.externalId)) report.claimsPresent++; });
      if (opts.dryRun) return;
      const r = _ingestAdapterEvidence(code, inputs); report.recorded += r.recorded; report.duplicates += r.duplicates;
      inputs.forEach(i => present.add(i.externalId));
    } catch (_) { report.errors++; }
  });
  return report;
}
app.post('/api/admin/backfill-canonical', requirePermission('manage_settings'), (req, res) => {
  res.json({ ok: true, report: _backfillCanonical(req.iqSession.orgCode, { dryRun: req.body?.dryRun === true }) });
});

/* ═══ CHECK-IN INTELLIGENCE — canonical evidence · shared kernel · post-kernel ═════
   The daily check-in keeps its own interaction, but canonical evidence + the universal
   kernel are its ONLY intelligence system. No check-in trend, concern, recovery,
   recommendation or leader-facing conclusion reads a raw check-in row or the legacy
   compatibility signal. Longitudinal conclusions are produced by the EXISTING universal
   detector (intel.detectPatterns) fed CANONICAL-sourced series — not a new engine. */

/* THE shared check-in kernel service. Reconstructs member check-in STATE from
   purpose-scoped canonical evidence (private excluded BEFORE reasoning for org
   purposes), reusing the existing trajectory + pattern detectors. Records a kernel
   derivation artifact retaining basis + counter-evidence IDs, confidence, limitations. */
function _checkinKernelState(code, subjectId, opts = {}) {
  const purpose  = opts.purpose || 'personal_assistance';
  const viewerId = opts.viewerId || null;
  const now      = opts.now || Date.now();
  // Purpose-scoped canonical evidence — the gateway excludes private for org purposes.
  const evidence = _kernelEvidence(code, { purpose, viewerId, subjectId });
  const admitted = new Set(evidence.map(e => e.evidenceId));
  // Mood series: source-only canonical mood, narrowed to what THIS purpose admits.
  const moodSeries = _canonicalMoodSeries(code, subjectId).filter(p => admitted.has(p.evidenceId));
  const moodEvidenceIds = moodSeries.map(p => p.evidenceId);
  // Concern series (below-okay mood) — timestamps only, canonical-sourced.
  const concernSeries = moodSeries.filter(p => p.mood <= 2).map(p => ({ t: p.t }));
  // Reuse the EXISTING universal detector over canonical series (never a new detector).
  const m = { id: subjectId, now, moodSeries, signalSeries: [], concernSeries, helpingSeries: [],
    memberTrajectory: _trajectoryFromMood(moodSeries, now), teamTrajectory: null, deviations: [] };
  let patterns = [];
  try { patterns = intel.detectPatterns(m) || []; } catch (_) { patterns = []; }

  // Directional trajectory in the canonical vocabulary (words, never a grade).
  const TRAJ = { up: 'converging', down: 'diverging', flat: 'sustaining' };
  const recentCutoff = now - intel.PRIOR;
  const hasRecent = moodSeries.some(p => p.t >= recentCutoff);
  let trajectory = (moodSeries.length && hasRecent) ? (TRAJ[m.memberTrajectory] || 'unknown') : 'unknown';

  const limitations = ['reconstructed only from captured, authorised check-in evidence'];
  let confidence = 'low';
  if (moodSeries.length >= 6 && hasRecent) confidence = 'medium';
  // A DATA GAP is a limitation, never a negative conclusion (no disengagement/distress).
  if (!moodSeries.length) { limitations.push('no check-in mood evidence yet — no conclusion drawn'); }
  else if (!hasRecent) { limitations.push('no recent check-ins — a data gap, not evidence of a negative state'); patterns = patterns.concat([{ type: 'data_gap', severity: 'low', basis: 'no recent check-in evidence', confidence: 'emerging' }]); }
  if (concernSeries.length) limitations.push('a low self-rating is a self-report, not a diagnosis of any cause');

  const basisEvidenceIds = moodEvidenceIds;
  const kernelArt = _recordKernelDerivation(code, {
    type: 'derived_pattern',
    result: { subject: subjectId, asOf: new Date(now).toISOString(), trajectory,
      dimensions: { reportedMood: moodSeries.length ? { points: moodSeries.length, latest: moodSeries[moodSeries.length - 1].mood } : null },
      patterns: patterns.map(p => p.type).filter(Boolean) },
    basis: basisEvidenceIds.length ? basisEvidenceIds : ['none'],
    confidence, limitations, detector: 'checkin-kernel',
  });

  return { subjectId, asOf: new Date(now).toISOString(), purpose, evidence, moodSeries, concernSeries,
    trajectory, patterns, confidence, limitations, basisEvidenceIds, counterEvidenceIds: [], kernelArt };
}

/* Intervention lifecycle for a check-in concern. The kernel suppresses DUPLICATE action,
   never genuinely new deterioration. Edge cases handled explicitly:
     • a NEW, distinct concern (a pattern type the active intervention does not target)
       still recommends, even while another intervention is active;
     • fresh deterioration (a current diverging trajectory / momentum drop) overrides an
       earlier recovery — it never de-escalates while the person is declining again;
     • recovery must be CONFIDENT (a 'clear' recovering pattern or a recorded 'improved'
       outcome) — a low-confidence recovery does not de-escalate on its own;
     • a mood recovery does NOT resolve a differently-scoped intervention (e.g. one aimed
       at workload) — success is dimension-matched, not administrative;
     • a completed-but-not-improved intervention does not imply success.
   Accepts the kernel STATE ({ patterns, trajectory }). Never invents a diagnosis. */
// The three mood-decline patterns are FACETS of one mood concern, so a mood-targeted (or
// untyped) intervention covers all of them. A concern OUTSIDE this family (a different
// dimension, e.g. a future overload/withdrawal type) is genuinely distinct and uncovered.
const CHECKIN_MOOD_CONCERNS = ['repeated_concern', 'momentum_drop', 'baseline_shift'];
const CHECKIN_CONCERN_TYPES = [...CHECKIN_MOOD_CONCERNS, 'overload_hypothesis', 'withdrawal', 'invisible_load'];
const CHECKIN_MOOD_PATTERNS = [...CHECKIN_MOOD_CONCERNS, 'recovering'];
function _checkinInterventionState(code, subjectId, state) {
  const patterns   = (state && state.patterns) || [];
  const trajectory = state && state.trajectory;
  const list   = (orgInterventions[code] || []).filter(i => i.targetMemberId === subjectId);
  const active = list.filter(i => i.status && !['completed', 'dismissed'].includes(i.status));
  const activeTypes = new Set(active.map(i => i.patternType).filter(Boolean));
  const moodFamily = new Set(CHECKIN_MOOD_CONCERNS);
  const concerns = patterns.filter(p => CHECKIN_CONCERN_TYPES.includes(p.type));
  // An active mood/untyped intervention covers the whole mood-concern family; a concern of
  // a DIFFERENT dimension needs an intervention of its own type to be "covered".
  const activeCoversMood = active.some(i => !i.patternType || moodFamily.has(i.patternType));
  const covered = c => moodFamily.has(c.type) ? activeCoversMood : activeTypes.has(c.type);
  const uncoveredConcerns = concerns.filter(c => !covered(c));
  // Fresh deterioration = currently declining, not a stale flag.
  const freshDeterioration = trajectory === 'diverging' || concerns.some(c => c.type === 'momentum_drop');
  // Recovery must be confident and not contradicted by a fresh decline.
  const confidentRecovery = patterns.some(p => p.type === 'recovering' && ['clear', 'medium', 'high', 'confirmed'].includes(p.confidence))
    || list.some(i => i.recordedOutcome === 'improved' || i.outcome === 'improved');
  // A mood recovery must not de-escalate an intervention scoped to a non-mood dimension.
  const activeNonMoodScoped = active.some(i => i.patternType && !CHECKIN_MOOD_PATTERNS.includes(i.patternType));
  const deEscalate = confidentRecovery && !freshDeterioration && !activeNonMoodScoped;
  return {
    activeIntervention: active.length > 0,
    // Suppress a duplicate only when every current concern is already covered.
    suppressDuplicateRecommendation: concerns.length > 0 && uncoveredConcerns.length === 0 && active.length > 0,
    deEscalate,
    // A genuinely new/uncovered concern still recommends — suppress duplicate, not new decline.
    recommend: uncoveredConcerns.length > 0 && !deEscalate,
  };
}

/* Owner-facing check-in intelligence — personal purpose (may use owner-private
   evidence). Prefers a QUESTION where interpretation is uncertain; never diagnoses. */
app.get('/api/checkin/me/intelligence', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const st  = _checkinKernelState(code, userId, { purpose: 'personal_assistance', viewerId: userId });
  const iv  = _checkinInterventionState(code, userId, st);
  const lines = [];
  if (!st.moodSeries.length) lines.push('No check-in mood captured yet — patterns will emerge as you check in.');
  else if (st.trajectory === 'diverging') lines.push('Your recent check-ins are trending below your usual. Would you like to adjust this week’s plan?');
  else if (st.trajectory === 'converging' || iv.deEscalate) lines.push('Your recent check-ins appear to be moving back toward your usual baseline.');
  else if (st.trajectory === 'sustaining') lines.push('Your check-ins are holding steady around your usual baseline.');
  else lines.push('Not enough recent check-in signal to say much yet — a good moment to check in.');
  const text = lines.join(' ');
  // Post-kernel bound to the owner (may cite their own authorised evidence).
  const composed = _composeForAudience(code, st.kernelArt, { role: 'member', subjectId: userId, viewerId: userId, purpose: 'personal_assistance', text });
  res.json({ ok: true, trajectory: st.trajectory, confidence: st.confidence, limitations: st.limitations,
    patterns: st.patterns.map(p => ({ type: p.type, severity: p.severity })), answer: text,
    cites: composed.output.cites, bounded: composed.ok });
});

/* Leader-facing check-in intelligence — leader_support (private excluded before
   context). Grounded, non-diagnostic, post-kernel bounded; suppresses a duplicate
   recommendation while an intervention is active; de-escalates on recovery. */
app.get('/api/checkin/:memberId/intelligence', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const memberId = req.params.memberId;
  const member = orgUsers[code]?.[memberId];
  if (!member) return res.status(404).json({ error: 'Member not found' });
  if (!getVisibleUserIds(code, userId).includes(memberId)) return res.status(403).json({ error: 'Member not in your visible scope' });
  if (!(orgUsers[code]?.[userId]?.role === 'superadmin' || _userHasPerm(code, userId, 'view_insights') || _userHasPerm(code, userId, 'review_checkins')))
    return res.status(403).json({ error: 'Permission denied: view_insights required' });

  const st = _checkinKernelState(code, memberId, { purpose: 'leader_support', viewerId: userId });
  const iv = _checkinInterventionState(code, memberId, st);
  let text, recommend = false;
  if (!st.moodSeries.length) text = 'No authorised check-in evidence yet — nothing to conclude.';
  else if (iv.deEscalate) text = 'Recent authorised check-in evidence suggests improvement; a previously raised concern can be de-escalated.';
  else if (iv.suppressDuplicateRecommendation) text = 'A support action is already active for this member; the evidence does not warrant a duplicate recommendation yet.';
  else if (iv.recommend) { text = 'Recent authorised check-in evidence differs from this member’s previous baseline. The evidence supports a private, supportive clarification — it does not establish a cause.'; recommend = true; }
  else if (st.trajectory === 'converging') text = 'Recent authorised check-in evidence suggests improvement.';
  else text = 'Recent authorised check-in evidence is broadly steady; nothing stands out as needing attention.';

  // Record a meaningful recommendation as canonical derived evidence (no auto-promote).
  let recEvidenceId = null;
  if (recommend && st.basisEvidenceIds.length) {
    const rec = _recordDerivedEvidence(code, { subjectId: memberId, type: 'observation',
      label: 'Check-in support recommendation', valueText: text.slice(0, 400), basisIds: st.basisEvidenceIds });
    recEvidenceId = rec && rec.id ? rec.id : null;
  }
  const composed = _composeForAudience(code, st.kernelArt, { role: member.role || 'admin', subjectId: memberId, viewerId: userId, purpose: 'leader_support', text });
  res.json({ ok: true, trajectory: st.trajectory, confidence: st.confidence, limitations: st.limitations,
    patterns: st.patterns.map(p => ({ type: p.type, severity: p.severity })), answer: text,
    recommend, recEvidenceId, activeIntervention: iv.activeIntervention, deEscalated: iv.deEscalate,
    cites: composed.output.cites, bounded: composed.ok });
});

/* ═══ MYWORKSPACE — one conversation-first personal operating surface ══════════
   Every input becomes a TYPED, SCOPED object with explicit ownership, visibility and
   AI-use permissions. IntelliQ SUGGESTS a classification; the person confirms. Privacy
   is deterministic and visible — a personal-private item supports the individual and
   is never exposed, quoted, or turned into organisational evidence unless permitted. */
function _wsKey(code, userId) { return `${(code || '').toLowerCase()}:${userId}`; }

/* Suggest (never apply) a classification for a captured input. */
app.post('/api/workspace/classify', requireAuth, (req, res) => {
  res.json({ ok: true, suggestion: workspaceLib.suggestClassification(String(req.body?.text || '')) });
});

/* Capture an item with its EXPLICIT (confirmed) classification. Routes through the
   PRE-KERNEL boundary — never straight to the kernel. */
app.post('/api/workspace', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const b = req.body || {};
  if (!b.text && !b.media) return res.status(400).json({ error: 'text or media required' });
  const item = workspaceLib.buildItem({ id: 'ws_' + generateId(), org: code, ownerId: userId,
    text: b.text, media: b.media || null, scope: b.scope, purpose: b.purpose, visibility: b.visibility,
    aiUsage: b.aiUsage, audience: b.audience, classifiedBy: b.classifiedBy });
  const list = workspaceItems[_wsKey(code, userId)] || (workspaceItems[_wsKey(code, userId)] = []);
  list.push(item);
  if (list.length > WORKSPACE_CAP) list.splice(0, list.length - WORKSPACE_CAP);
  // Pre-kernel interpretation. Private items inform only the owner; permitted items
  // may become canonical evidence for the org — all deterministically, from `item`.
  let interp = { evidenceIds: [] };
  try { interp = _interpretInput(code, { text: item.text, ownerId: userId, subjectId: item.purpose === 'observation' ? null : userId, item }); } catch (_) {}
  scheduleSave();
  res.json({ ok: true, item, becameEvidence: interp.evidenceIds.length, informsOrg: workspaceLib.informsOrgReasoning(item) });
});

/* The owner's surface — SELF ONLY. Lenses are VIEWS (projections) over the same
   items, not separate stores. Filtering can only narrow, never broaden, visibility. */
function _workspaceLens(req, res) {
  const { orgCode: code, userId } = req.iqSession;
  const lens = String(req.query.lens || 'all');
  let items = (workspaceItems[_wsKey(code, userId)] || []).filter(i => !i.deleted).reverse();
  const byLens = {
    me:      i => i.scope === 'personal_private' || i.purpose === 'reflection',
    work:    i => ['organizational', 'team', 'specific_people'].includes(i.scope) || ['task', 'commitment', 'observation'].includes(i.purpose),
    notes:   i => i.purpose === 'note' || i.purpose === 'observation',
    plans:   i => i.purpose === 'plan' || i.purpose === 'commitment',
  };
  if (byLens[lens]) items = items.filter(byLens[lens]);
  res.json({ ok: true, lens, items: items.slice(0, 200), vocab: { scopes: workspaceLib.SCOPES, purposes: workspaceLib.PURPOSES, visibilities: workspaceLib.VISIBILITIES, aiUses: workspaceLib.AI_USES } });
}
app.get('/api/workspace', requireAuth, _workspaceLens);
app.get('/api/workspace/items', requireAuth, _workspaceLens);

/* Deleting a workspace item removes its canonical evidence from ACTIVE reasoning
   (lifecycle 'deleted'), without rewriting raw history. Self-only. */
function _deleteWorkspaceEvidence(code, itemId) {
  let n = 0;
  for (const env of (evidenceLog[code] || [])) {
    if (env.workspaceItemId !== itemId || env.status === 'deleted') continue;
    const seen = _evidenceSeen[code]; if (seen) seen.delete(evidence.dedupeKey(env));
    env.status = 'deleted'; env.deletedAtSource = new Date().toISOString();
    if (env.promoted) _withdrawSignal(code, env);
    n++;
  }
  return n;
}
app.delete('/api/workspace/:id', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const list = workspaceItems[_wsKey(code, userId)] || [];
  const item = list.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });   // self-only: not in caller's list → 404
  item.deleted = true; item.deletedAt = new Date().toISOString();
  const removed = _deleteWorkspaceEvidence(code, item.id);
  scheduleSave();
  res.json({ ok: true, removedEvidence: removed });
});

/* ── The conversation-first EXPERIENCE surfaces — all intelligence flows through
   the purpose-scoped gateway + post-kernel selection, never raw items. Workspace
   items are used only as display projections. ────────────────────────────────── */

/* POST-KERNEL attention selection: build grounded, traceable candidates from the
   owner's admissible evidence + projections, then select a restrained few. Every
   factual item keeps its basis evidence IDs; nothing is invented. */
function _composeToday(code, userId) {
  // Personal purpose — the owner's own admissible evidence (includes their private).
  const ev = _kernelEvidence(code, { purpose: 'personal_assistance', viewerId: userId });
  const items = (workspaceItems[_wsKey(code, userId)] || []).filter(i => !i.deleted);
  const now = Date.now();
  const cand = [];
  // Reassurance grounded in real private evidence (a "kept private" confirmation).
  const privateEv = ev.filter(e => e.visibility === 'private');
  if (privateEv.length) cand.push({ kind: 'privacy', confidence: 'confirmed',
    text: `You marked ${privateEv.length} thing${privateEv.length === 1 ? '' : 's'} private. ${privateEv.length === 1 ? 'It has' : "They've"} stayed private — used only to assist you.`,
    basis: privateEv.slice(0, 5).map(e => e.evidenceId) });
  // Open commitments (projection; the count is a display fact, phrased as a question).
  const commitments = items.filter(i => i.purpose === 'commitment');
  if (commitments.length) cand.push({ kind: 'commitment', confidence: 'medium',
    text: `You have ${commitments.length} open commitment${commitments.length === 1 ? '' : 's'}. Want to review what's still outstanding?`, basis: [] });
  // Actions awaiting the owner (from the execution layer).
  const awaiting = (actionsLog[code] || []).filter(a => a.actorId === userId && a.status === 'awaiting_approval');
  if (awaiting.length) cand.push({ kind: 'action', confidence: 'confirmed',
    text: `${awaiting.length} action${awaiting.length === 1 ? '' : 's'} ${awaiting.length === 1 ? 'is' : 'are'} waiting on your approval.`, basis: [] });
  // Recent captures worth a nudge.
  const recent = ev.filter(e => now - new Date(e.observedAt).getTime() < 3 * 86400000);
  if (recent.length && cand.length < 2) cand.push({ kind: 'recent', confidence: 'confirmed',
    text: `You've captured ${recent.length} thing${recent.length === 1 ? '' : 's'} recently — IntelliQ is keeping them in mind.`, basis: recent.slice(0, 3).map(e => e.evidenceId) });
  // Post-kernel selection: a small number, de-duplicated by kind, capped.
  const seen = new Set();
  return cand.filter(c => (seen.has(c.kind) ? false : (seen.add(c.kind), true))).slice(0, 3);
}

app.get('/api/workspace/today', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const user = orgUsers[code]?.[userId];
  const first = user?.name ? user.name.split(' ')[0] : 'there';
  const attention = _composeToday(code, userId);
  const items = (workspaceItems[_wsKey(code, userId)] || []).filter(i => !i.deleted);
  const continuing = items.filter(i => ['plan', 'commitment', 'task'].includes(i.purpose)).slice(0, 5)
    .map(i => ({ id: i.id, text: i.text.slice(0, 160), purpose: i.purpose, visibility: i.visibility }));
  const recentlyChanged = items.slice(-5).reverse()
    .map(i => ({ id: i.id, text: i.text.slice(0, 160), purpose: i.purpose, visibility: i.visibility, at: i.createdAt }));
  const orientation = attention.length
    ? `Good to see you, ${first}. Here's what IntelliQ is keeping an eye on.`
    : `Good to see you, ${first}. Nothing needs you right now — capture anything you want IntelliQ to remember.`;
  res.json({ ok: true, orientation, attention, continuing, recentlyChanged });
});

/* Conversation. Determines the viewer + reasoning PURPOSE, pulls evidence through
   the gateway, and composes a bounded answer that cites ONLY authorised evidence.
   Deterministic + grounded (AI-enrichable); prefers a question when support is thin. */
app.post('/api/workspace/ask', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const q = String(req.body?.question || '').toLowerCase().trim();
  if (!q) return res.status(400).json({ error: 'question required' });
  // Work/org-scoped questions exclude private evidence BEFORE context is built.
  const workScoped = /\b(team|org|organisation|organization|project|shared|everyone|department|colleague)\b/.test(q);
  const purpose = workScoped ? 'workspace_shared_reasoning' : 'personal_assistance';
  const ev = _kernelEvidence(code, { purpose, viewerId: userId, subjectId: workScoped ? undefined : userId });
  const authorised = ev.map(e => e.evidenceId);

  let answer = '', cites = [], confidence = 'medium', limitations = [];
  const priv = ev.filter(e => e.visibility === 'private');
  if (/what.*(private|only me)|is.*private/.test(q)) {
    answer = priv.length
      ? `You have ${priv.length} private item${priv.length === 1 ? '' : 's'}. Only you can see ${priv.length === 1 ? 'it' : 'them'}; ${priv.length === 1 ? "it's" : "they're"} used only to assist you and never inform organisational reasoning.`
      : `Nothing here is marked private right now.`;
    cites = priv.slice(0, 8).map(e => e.evidenceId); confidence = 'confirmed';
  } else if (/what.*chang|since (yesterday|last)/.test(q)) {
    const recent = ev.slice(-5);
    answer = recent.length ? `Recently you captured: ${recent.map(e => '“' + String(e.valueText || e.label).slice(0, 60) + '”').join('; ')}.` : `Nothing new has been captured recently.`;
    cites = recent.map(e => e.evidenceId); confidence = 'confirmed';
  } else if (/focus|what should i|attention|priorit/.test(q)) {
    const att = _composeToday(code, userId);
    answer = att.length ? att.map(a => a.text).join(' ') : `Nothing is pressing right now. A good moment to plan ahead or capture something.`;
    cites = att.flatMap(a => a.basis); confidence = 'medium';
    limitations = ['based only on what you have captured so far'];
  } else if (/putting off|avoid|overdue|stuck|blocked/.test(q)) {
    const items = (workspaceItems[_wsKey(code, userId)] || []).filter(i => !i.deleted && ['commitment', 'task'].includes(i.purpose));
    answer = items.length ? `You have ${items.length} open item${items.length === 1 ? '' : 's'} that may need attention. Want to go through them?` : `Nothing looks stuck right now.`;
    confidence = 'low'; limitations = ['I can only see what you have captured — not everything'];
  } else {
    // Insufficient support → prefer a grounded clarification over a confident answer.
    answer = ev.length
      ? `I can reason over ${ev.length} thing${ev.length === 1 ? '' : 's'} you've shared. Could you say a bit more about what you'd like — to plan, review, or capture something?`
      : `I don't have enough captured yet to answer that well. Tell me what's on your mind and I'll remember it.`;
    confidence = ev.length ? 'low' : 'none';
    limitations = ['limited context'];
  }

  // Post-kernel bounding — cite only authorised evidence; record the decision artifact.
  const kernelArt = _recordKernelDerivation(code, { type: 'recommendation', result: { question: q }, basis: authorised.length ? authorised.slice(0, 20) : ['none'], confidence, limitations });
  const composed = _composeForAudience(code, kernelArt, { role: 'member', subjectId: userId, viewerId: userId, purpose, text: answer });
  const boundedCites = cites.filter(id => authorised.includes(id));
  res.json({ ok: true, answer, purpose, confidence, limitations, cites: boundedCites, bounded: composed.ok });
});

/* A readable timeline of meaningful activity (owner-only; projections + actions). */
app.get('/api/workspace/history', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const items = (workspaceItems[_wsKey(code, userId)] || []).map(i => ({
    id: i.id, kind: 'capture', text: i.text.slice(0, 160), purpose: i.purpose, visibility: i.visibility, at: i.createdAt, deleted: !!i.deleted }));
  const acts = (actionsLog[code] || []).filter(a => a.actorId === userId).map(a => ({
    id: a.id, kind: 'action', text: `${a.capability}.${a.verb}`, status: a.status, at: a.updatedAt }));
  const timeline = [...items, ...acts].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 100);
  res.json({ ok: true, timeline });
});

/* POST /api/connections/:id/inspect — fetch a SAMPLE, propose a mapping contract for
   the admin to verify (the safe workflow: inspect → AI proposes → admin confirms →
   versioned mapping → all future data validated against it). Nothing is stored yet. */
app.post('/api/connections/:id/inspect', requirePermission('manage_settings'), async (req, res) => {
  const code = req.iqSession.orgCode;
  const conn = (orgConnections[code] || []).find(c => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'not found' });
  if (!conn.url || !_urlIsSafe(conn.url)) return res.status(400).json({ error: 'connection has no reachable URL to sample' });
  try {
    const headers = { ...(conn.headers || {}) };
    if (conn.oauth?.accessToken) headers.Authorization = `Bearer ${conn.oauth.accessToken}`;
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
    const resp = await fetch(conn.url, { method: conn.method || 'GET', headers, signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return res.status(400).json({ error: `sample failed — HTTP ${resp.status}` });
    let data = await resp.json();
    if (conn.jsonPath) { try { data = String(conn.jsonPath).split('.').reduce((o, k) => (o == null ? o : o[k]), data); } catch (_) {} }
    const recs = Array.isArray(data) ? data : (data.records || data.data || data.results || [data]);
    const mapping = connectorSDK.proposeMapping(recs);
    if (!mapping) return res.status(400).json({ error: 'couldn\'t find a person + numbers in the sample', sample: recs.slice(0, 2) });
    res.json({ ok: true, mapping, sample: recs.slice(0, 3) });
  } catch (e) { res.status(502).json({ error: 'inspect failed — ' + String(e.message).slice(0, 80) }); }
});

/* POST /api/connections/:id/mapping — save the admin-VERIFIED mapping contract (a
   versioned agreement). From then on the connection applies it deterministically. */
app.post('/api/connections/:id/mapping', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const conn = (orgConnections[code] || []).find(c => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'not found' });
  const m = req.body?.mapping;
  if (!m || !m.subjectField || !Array.isArray(m.fields)) return res.status(400).json({ error: 'a mapping with subjectField + fields is required' });
  conn.mapping = { version: (conn.mapping?.version || 0) + 1, status: 'verified', verifiedBy: req.iqSession.userId, verifiedAt: new Date().toISOString(),
    subjectField: String(m.subjectField).slice(0, 60), dateField: m.dateField ? String(m.dateField).slice(0, 60) : null, eventField: m.eventField ? String(m.eventField).slice(0, 60) : null,
    fields: (m.fields || []).slice(0, 60).map(f => ({ from: String(f.from || '').slice(0, 60), primitive: connectorSDK.PRIMITIVES.includes(f.primitive) ? f.primitive : 'metric', label: String(f.label || f.from || 'Metric').slice(0, 80), include: f.include !== false })) };
  scheduleSave();
  res.json({ ok: true, mapping: conn.mapping });
});

/* ── OAuth2: connect real apps (Strava, Google, Microsoft/Teams, Hudl, Fitbit…) ──
   One generic authorization-code flow serves every provider — only the catalog
   entry differs. The org registers the app once with the provider and stores the
   client id/secret; a person then connects by logging in. Tokens are refreshed
   automatically and the connection is polled through the same mapper. */
function _publicBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/* GET /api/oauth/catalog — the providers, and whether each is set up in this org. */
app.get('/api/oauth/catalog', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const apps = orgOAuthApps[code] || {};
  const catalog = Object.entries(OAUTH_PROVIDERS).map(([key, p]) => ({
    key, label: p.label, docs: p.docs, configured: !!(apps[key] && apps[key].clientId),
    custom: key === 'custom',
  }));
  res.json({ ok: true, catalog, redirectUri: `${_publicBaseUrl(req)}/api/oauth/callback` });
});

/* POST /api/oauth/app — store the org's client id/secret for a provider (from the
   provider's developer console). For 'custom', also the authorize/token/data URLs. */
app.post('/api/oauth/app', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { provider, clientId, clientSecret, authorizeUrl, tokenUrl, dataUrl, scope } = req.body || {};
  if (!OAUTH_PROVIDERS[provider]) return res.status(400).json({ error: 'unknown provider' });
  if (!clientId || !clientSecret) return res.status(400).json({ error: 'clientId and clientSecret are required' });
  (orgOAuthApps[code] = orgOAuthApps[code] || {})[provider] = {
    clientId: String(clientId).slice(0, 200), clientSecret: String(clientSecret).slice(0, 400),
    authorizeUrl: authorizeUrl ? String(authorizeUrl).slice(0, 400) : undefined,
    tokenUrl: tokenUrl ? String(tokenUrl).slice(0, 400) : undefined,
    dataUrl: dataUrl ? String(dataUrl).slice(0, 600) : undefined,
    scope: scope ? String(scope).slice(0, 300) : undefined,
  };
  scheduleSave();
  res.json({ ok: true, configured: true });
});

/* POST /api/oauth/:provider/start — returns the provider's login URL to open. Authed
   via header (a browser redirect can't carry our bearer token), so the client opens
   the returned URL itself. */
app.post('/api/oauth/:provider/start', requirePermission('manage_settings'), (req, res) => {
  const code = req.iqSession.orgCode; const userId = req.iqSession.userId;
  const provider = req.params.provider;
  const prov = OAUTH_PROVIDERS[provider]; const app = orgOAuthApps[code]?.[provider];
  if (!prov) return res.status(400).json({ error: 'unknown provider' });
  if (!app || !app.clientId) return res.status(400).json({ error: `Add your ${prov.label} client id/secret first.` });
  const authorizeUrl = app.authorizeUrl || prov.authorizeUrl;
  if (!authorizeUrl) return res.status(400).json({ error: 'No authorize URL configured for this provider.' });
  const state = _shortId() + _shortId();
  oauthPending[state] = { code, userId, provider, ts: Date.now() };
  // prune old pending states
  for (const [k, v] of Object.entries(oauthPending)) if (Date.now() - v.ts > 15 * 60 * 1000) delete oauthPending[k];
  const params = new URLSearchParams({
    client_id: app.clientId, response_type: 'code', redirect_uri: `${_publicBaseUrl(req)}/api/oauth/callback`,
    scope: app.scope || prov.scope || '', state,
    ...(prov.extraAuth || {}),
  });
  res.json({ ok: true, authorizeUrl: `${authorizeUrl}?${params.toString()}` });
});

/* GET /api/oauth/callback — the provider redirects the person's browser here after
   they approve. We exchange the code for tokens and create a polled connection. */
app.get('/api/oauth/callback', async (req, res) => {
  const { code: authCode, state, error } = req.query;
  const page = (msg, ok) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#131019;color:#ece9f4;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:1.5rem"><div><div style="font-size:2rem;margin-bottom:0.5rem">${ok ? '✓' : '—'}</div><div style="font-size:1.05rem;max-width:30ch">${msg}</div><div style="color:#837c94;font-size:0.85rem;margin-top:1rem">You can close this window.</div></div></body>`;
  if (error) return res.status(400).send(page('Connection was declined.', false));
  const pend = state && oauthPending[state];
  if (!pend || !authCode) return res.status(400).send(page('This connection link has expired — start again from Settings.', false));
  delete oauthPending[state];
  const { code, userId, provider } = pend;
  const prov = OAUTH_PROVIDERS[provider]; const app = orgOAuthApps[code]?.[provider];
  if (!prov || !app) return res.status(400).send(page('That provider is no longer set up.', false));
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code: String(authCode), client_id: app.clientId, client_secret: app.clientSecret,
      redirect_uri: `${_publicBaseUrl(req)}/api/oauth/callback`,
    });
    const tr = await fetch(app.tokenUrl || prov.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
    const tj = await tr.json().catch(() => ({}));
    if (!tr.ok || !tj.access_token) return res.status(400).send(page(`Couldn't complete the ${prov.label} connection. Check the client id/secret and redirect URL.`, false));
    const conn = {
      id: 'conn_' + _shortId(), name: prov.label, url: app.dataUrl || prov.dataUrl || '', method: 'GET', headers: {},
      scheduleHours: 12, source: provider, jsonPath: null,
      oauth: { provider, subject: prov.subject || 'self', accessToken: tj.access_token, refreshToken: tj.refresh_token || null, expiresAt: tj.expires_in ? Date.now() + (tj.expires_in - 60) * 1000 : 0, tokenUrl: app.tokenUrl || prov.tokenUrl },
      createdBy: userId, createdAt: new Date().toISOString(), lastRun: null, lastStatus: 'connected — first sync pending', lastCount: 0,
    };
    (orgConnections[code] = orgConnections[code] || []).push(conn);
    scheduleSave();
    // First sync in the background (don't block the browser response).
    if (conn.url) _runConnection(code, conn).catch(() => {});
    res.send(page(`${prov.label} connected. Its data will now flow into IntelliQ.`, true));
  } catch (e) {
    res.status(500).send(page('Something went wrong finishing the connection. Try again.', false));
  }
});

/* Aggregate a SET of people into a privacy-safe unit read (counts + pattern
   types + percentages only — never a name or private detail). Shared by the
   overall range roll-up and each sub-unit. */
const _POSITIVE_PATTERNS = new Set(['recovering', 'quiet_improvement']);
function _aggregatePeople(code, ids, now, monday) {
  const users = ids.map(id => orgUsers[code]?.[id]).filter(u => u && u.role !== 'superadmin');
  const patternCounts = {}; let attention = 0, positive = 0, active = 0;
  const traj = { up: 0, down: 0, steady: 0 };
  const idSet = new Set(users.map(u => u.id));
  users.forEach(u => {
    let m; try { m = _buildMemberIntelInput(code, u, now); } catch (_) { m = null; }
    (m ? intel.detectPatterns(m) : []).forEach(p => {
      patternCounts[p.type] = (patternCounts[p.type] || 0) + 1;
      if (p.severity === 'high') attention++;
      if (_POSITIVE_PATTERNS.has(p.type)) positive++;
    });
    const tr = m?.memberTrajectory; if (tr && traj[tr] != null) traj[tr]++;
    const ck = memberCheckins[userKey(code, u.id)] || memberCheckins[memberKey(code, u.name || '')] || [];
    if (ck.some(c => c.ts && new Date(c.ts) >= monday)) active++;
  });
  const recognition = (orgSignals[code] || []).filter(s =>
    s.source === 'observation' && s.data && s.data.kind === 'recognition' &&
    idSet.has(s.subjectId) && new Date(s.ts) >= monday).length;
  const size = users.length;
  const pct = n => size ? Math.round((n / size) * 100) : 0;
  const status = size === 0 ? 'no-data'
    : attention >= Math.ceil(size * 0.34) ? 'strained'
    : positive >= attention ? 'thriving' : 'steady';
  const topConcern = Object.entries(patternCounts).filter(([t]) => !_POSITIVE_PATTERNS.has(t)).sort((a, b) => b[1] - a[1])[0];
  return {
    size, active, status, attention, positive, recognition,
    percent: { active: pct(active), needsAttention: pct(attention), doingWell: pct(positive) },
    trajectory: traj.down > traj.up && traj.down >= traj.steady ? 'down' : traj.up > traj.steady ? 'up' : 'steady',
    focus: topConcern ? (intel.PATTERN_LABEL[topConcern[0]] || topConcern[0]) : null,
    focusAction: topConcern ? (intel.DEFAULT_ACTION[topConcern[0]] || null) : null,
    momentum: positive * 2 + recognition - attention * 2,
  };
}

/* GET /api/org/divisions — oversight roll-up for ANY leader, scoped to THEIR
   range (their node + everything beneath it, all the way down — via
   getVisibleUserIds). A head-of-department sees their whole sub-tree as
   aggregate PERCENTAGES; the CEO sees the org. Privacy-safe: counts + pattern
   types + percentages only, never a name or private detail. */
app.get('/api/org/divisions', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const range = getVisibleUserIds(code, userId).filter(id => id !== userId);   // the people they oversee
  if (range.length === 0 && !(orgUsers[code]?.[userId]?.role === 'superadmin')) {
    return res.status(403).json({ error: 'This view is for leaders — it shows the people you oversee.' });
  }
  const now = Date.now();
  const monday = new Date(now); const dow = monday.getDay();
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1)); monday.setHours(0, 0, 0, 0);
  const rangeSet = new Set(range);

  // Overall — everyone in this leader's range, as percentages.
  const overall = _aggregatePeople(code, range, now, monday);

  // Per sub-unit — only groups that intersect the range, only the visible members.
  const units = (orgGroups[code] || [])
    .map(g => ({ g, ids: (g.memberIds || []).filter(id => rangeSet.has(id)) }))
    .filter(x => x.ids.length)
    .map(({ g, ids }) => ({ id: g.id, name: g.name, ..._aggregatePeople(code, ids, now, monday) }));

  const STAT = { thriving: 0, steady: 1, strained: 2, 'no-data': 3 };
  units.sort((a, b) => STAT[a.status] - STAT[b.status] || b.momentum - a.momentum);
  const best = [...units].filter(u => u.size > 0).sort((a, b) => b.momentum - a.momentum)[0];
  const unitOfWeek = best && (best.positive > 0 || best.recognition > 0)
    ? { name: best.name, why: `Best momentum this week — ${best.percent.doingWell}% doing well${best.recognition ? `, ${best.recognition} recognitions` : ''}, ${best.percent.needsAttention}% needing attention.` }
    : null;

  res.json({
    ok: true, generatedAt: new Date().toISOString(),
    range: { people: overall.size, ...overall.percent, status: overall.status, trajectory: overall.trajectory, focus: overall.focus, focusAction: overall.focusAction },
    divisions: units.map(({ momentum, ...u }) => u),
    unitOfWeek,
    summary: { total: units.length, thriving: units.filter(u => u.status === 'thriving').length, strained: units.filter(u => u.status === 'strained').length },
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — METRICS
   Three sources: org (superadmin-defined), shared (leader), personal (member)
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/metrics', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, metrics: orgMetrics[code] || [] });
});

app.post('/api/metrics', requirePermission('manage_metrics'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { name, source } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (!orgMetrics[code]) orgMetrics[code] = [];
  const metric = {
    metricId: 'met_' + generateId(),
    name:     name.trim(),
    source:   source || 'org',
    order:    orgMetrics[code].length,
    createdAt: new Date().toISOString(),
  };
  orgMetrics[code].push(metric);
  scheduleSave();
  res.json({ ok: true, metric });
});

app.put('/api/metrics/:metricId', requirePermission('manage_metrics'), (req, res) => {
  const code   = req.iqSession.orgCode;
  const metric = (orgMetrics[code] || []).find(m => m.metricId === req.params.metricId);
  if (!metric) return res.status(404).json({ error: 'Metric not found' });
  if (req.body.name  !== undefined) metric.name  = req.body.name.trim();
  if (req.body.order !== undefined) metric.order = req.body.order;
  scheduleSave();
  res.json({ ok: true, metric });
});

app.delete('/api/metrics/:metricId', requirePermission('manage_metrics'), (req, res) => {
  const code = req.iqSession.orgCode;
  if (!orgMetrics[code]) return res.status(404).json({ error: 'Not found' });
  const before = orgMetrics[code].length;
  orgMetrics[code] = orgMetrics[code].filter(m => m.metricId !== req.params.metricId);
  if (orgMetrics[code].length === before) return res.status(404).json({ error: 'Metric not found' });
  scheduleSave();
  res.json({ ok: true });
});

// AI metric suggestions
app.post('/api/metrics/suggest', requirePermission('manage_metrics'), async (req, res) => {
  const code   = req.iqSession.orgCode;
  const meta   = orgMeta[code] || {};
  const desc   = req.body.description || meta.orgDescription || meta.orgName || '';
  const values = orgValues[code] || [];
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system:     'You are a performance measurement expert. Output valid JSON only.',
      messages:   [{
        role:    'user',
        content: `Suggest 5-8 performance metrics for an organisation described as: "${desc}"${values.length ? '. Their values are: ' + values.join(', ') : ''}.
Output JSON array of strings: ["Metric Name 1", "Metric Name 2", ...]. Be specific to the organisation. No generic HR metrics.`,
      }],
    });
    const raw  = response.content[0]?.text || '[]';
    const json = raw.replace(/```json\n?|\n?```/g, '').trim();
    const suggestions = JSON.parse(json);
    res.json({ ok: true, suggestions });
  } catch(e) {
    res.status(500).json({ error: 'AI unavailable', detail: e.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — VALUES STORE
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/values', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, values: orgValues[code] || [] });
});

app.put('/api/values', requirePermission('manage_values'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { values } = req.body;
  if (!Array.isArray(values)) return res.status(400).json({ error: 'values must be an array of strings' });
  orgValues[code] = values.map(v => String(v).trim()).filter(Boolean);
  scheduleSave();
  res.json({ ok: true, values: orgValues[code] });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — GOALS STORE (org-level goals)
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/goals', requireAuth, (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, goals: orgGoals[code] || [] });
});

app.post('/api/goals', requirePermission('manage_goals'), (req, res) => {
  const code = req.iqSession.orgCode;
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  if (!orgGoals[code]) orgGoals[code] = [];
  const goal = { goalId: 'goal_' + generateId(), text: text.trim(), createdAt: new Date().toISOString(), status: 'active' };
  orgGoals[code].push(goal);
  scheduleSave();
  res.json({ ok: true, goal });
});

app.put('/api/goals/:goalId', requirePermission('manage_goals'), (req, res) => {
  const code = req.iqSession.orgCode;
  const goal = (orgGoals[code] || []).find(g => g.goalId === req.params.goalId);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  if (req.body.text   !== undefined) goal.text   = req.body.text.trim();
  if (req.body.status !== undefined) goal.status = req.body.status;
  scheduleSave();
  res.json({ ok: true, goal });
});

app.delete('/api/goals/:goalId', requirePermission('manage_goals'), (req, res) => {
  const code = req.iqSession.orgCode;
  if (!orgGoals[code]) return res.status(404).json({ error: 'Not found' });
  orgGoals[code] = orgGoals[code].filter(g => g.goalId !== req.params.goalId);
  scheduleSave();
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SPRINT 2 — PERMISSIONS
   ═══════════════════════════════════════════════════════════════════════════ */

app.get('/api/permissions', requirePermission('manage_permissions'), (req, res) => {
  const code = req.iqSession.orgCode;
  res.json({ ok: true, permissions: userPermissions[code] || {} });
});

app.put('/api/permissions', requirePermission('manage_permissions'), (req, res) => {
  const code   = req.iqSession.orgCode;
  const { userId, grants } = req.body;
  if (!userId || typeof grants !== 'object') return res.status(400).json({ error: 'userId and grants object required' });
  if (!orgUsers[code]?.[userId]) return res.status(404).json({ error: 'User not found' });
  if (!userPermissions[code]) userPermissions[code] = {};
  userPermissions[code][userId] = { ...(userPermissions[code][userId] || {}), ...grants };
  scheduleSave();
  res.json({ ok: true, permissions: userPermissions[code][userId] });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GROUPS — Sub-teams within an org
   ═══════════════════════════════════════════════════════════════════════════ */

const orgGroups   = {};  // populated at startup via _loadAllStores()
const orgNotes    = {};
const orgMessages = {};

function noteId()  { return 'n_'   + generateId(); }
function msgId()   { return 'm_'   + generateId(); }
function groupId() { return 'grp_' + generateId(); }

/* ── Create group ─────────────────────────────────────────────────────────── */
app.post('/api/groups/create', (req, res) => {
  const { orgCode, name, description, memberIds, leadIds } = req.body;
  if (!orgCode || !name) return res.status(400).json({ error: 'orgCode and name required' });
  const code = orgCode.toLowerCase().trim();
  if (!orgGroups[code]) orgGroups[code] = [];
  const group = { id: groupId(), name, description: description || '', memberIds: memberIds || [], leadIds: leadIds || [], goals: [], traits: [], copilotEnabled: false, createdAt: new Date().toISOString() };
  orgGroups[code].push(group);
  scheduleSave();
  res.json({ ok: true, group });
});

/* ── List groups for org (filtered by memberId if provided) ─────────────── */
app.get('/api/groups', (req, res) => {
  const { orgCode, memberId } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  let groups = orgGroups[orgCode.toLowerCase().trim()] || [];
  if (memberId) {
    groups = groups.filter(g => g.memberIds.includes(memberId) || g.leadIds.includes(memberId));
  }
  res.json({ groups });
});

/* ── Update group ────────────────────────────────────────────────────────── */
app.put('/api/groups/:groupId', (req, res) => {
  const { orgCode, name, description, memberIds, leadIds } = req.body;
  const code   = orgCode?.toLowerCase().trim();
  const groups = orgGroups[code] || [];
  const g      = groups.find(g => g.id === req.params.groupId);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  if (name        !== undefined) g.name        = name;
  if (description !== undefined) g.description = description;
  if (memberIds   !== undefined) g.memberIds   = memberIds;
  if (leadIds     !== undefined) g.leadIds     = leadIds;
  scheduleSave();
  res.json({ ok: true, group: g });
});

/* ── Set a group's GOALS & TRAITS (the TEAM frame) ────────────────────────────
   Only a LEAD of the group (or an admin/superadmin) may set its aims — being a
   member is not enough. This is the membership-vs-leadership distinction: a coach
   leads "Quarterbacks" (can set goals) but is only a member of "Staff" (cannot). */
app.put('/api/groups/:groupId/aims', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code   = orgCode;
  const groups = orgGroups[code] || [];
  const g      = groups.find(g => g.id === req.params.groupId);
  if (!g) return res.status(404).json({ error: 'Group not found' });

  const isLead  = (g.leadIds || []).includes(userId);
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin' || _userHasPerm(code, userId, 'manage_goals');
  if (!isLead && !isAdmin) {
    return res.status(403).json({ error: 'Only a lead of this group can set its goals and traits.' });
  }

  const clean = arr => Array.isArray(arr)
    ? [...new Set(arr.map(s => String(s).trim()).filter(Boolean))].slice(0, 20)
    : undefined;
  const goals  = clean(req.body.goals);
  const traits = clean(req.body.traits);
  if (goals  !== undefined) g.goals  = goals;
  if (traits !== undefined) g.traits = traits;
  scheduleSave();
  res.json({ ok: true, group: g });
});

/* ── PUT /api/groups/:groupId/copilot-settings — lead enables/disables Copilot ─
   The real consent gate: no analysis happens unless the lead turns it on. */
app.put('/api/groups/:groupId/copilot-settings', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const g    = (orgGroups[code] || []).find(g => g.id === req.params.groupId);
  if (!g) return res.status(404).json({ error: 'Group not found' });
  const isLead  = (g.leadIds || []).includes(userId);
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin' || _userHasPerm(code, userId, 'manage_settings');
  if (!isLead && !isAdmin) return res.status(403).json({ error: 'Only a lead can change Copilot settings.' });
  if (typeof req.body.enabled === 'boolean') g.copilotEnabled = req.body.enabled;
  scheduleSave();
  res.json({ ok: true, copilotEnabled: !!g.copilotEnabled });
});

/* ── GET /api/groups/:groupId/copilot — the Group Copilot (coach for the LEAD) ─
   Positioned as "help the group reach its stated goals", NOT "monitoring".
   SIGNALS-FIRST (participation / activity / goal signals — not message content),
   AGGREGATE-ONLY (advice, never naming or exposing individuals), DIRECTIONAL
   language (no scores). Through the AI gateway + privacy gate. Lead-only, and
   only runs when the lead has enabled the Copilot for the group. */
app.get('/api/groups/:groupId/copilot', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const g    = (orgGroups[code] || []).find(g => g.id === req.params.groupId);
  if (!g) return res.status(404).json({ error: 'Group not found' });

  const isLead  = (g.leadIds || []).includes(userId);
  const isAdmin = orgUsers[code]?.[userId]?.role === 'superadmin' || _userHasPerm(code, userId, 'view_analytics');
  if (!isLead && !isAdmin) return res.status(403).json({ error: 'Only a lead of this group can use the Copilot.' });

  if (!g.copilotEnabled) return res.json({ ok: true, enabled: false });

  const memberIds = [...new Set([...(g.memberIds || []), ...(g.leadIds || [])])].filter(id => id !== userId);
  const now    = Date.now();
  const WEEK   = 7 * 86400000;

  // ── SIGNALS (no message content) ──────────────────────────────────────────
  let active7 = 0, activePrev = 0;            // members active this week / prior week
  let quietCount = 0;                          // became/stayed quiet (10+ days)
  let moodSum = 0, moodCnt = 0;
  memberIds.forEach(id => {
    const u = orgUsers[code]?.[id]; if (!u) return;
    const cks = memberCheckins[userKey(code, id)] || memberCheckins[memberKey(code, u.name || '')] || [];
    let a7 = false, aPrev = false, lastTs = null;
    cks.forEach(c => {
      const t = new Date(c.ts || c.date).getTime(); if (isNaN(t)) return;
      lastTs = Math.max(lastTs || 0, t);
      if (now - t < WEEK) a7 = true;
      else if (now - t < 2 * WEEK) aPrev = true;
      if (c.mood != null && now - t < 2 * WEEK) { moodSum += Number(c.mood); moodCnt++; }
    });
    if (a7) active7++;
    if (aPrev) activePrev++;
    const days = lastTs ? Math.floor((now - lastTs) / 86400000) : null;
    if (days === null || days >= 10) quietCount++;
  });

  // Group message volume (count only — never content) this week vs prior
  let msg7 = 0, msgPrev = 0;
  Object.values(orgMessages).forEach(m => {
    if (m.orgCode !== code || m.toType !== 'group' || m.toId !== g.id) return;
    const t = new Date(m.createdAt).getTime(); if (isNaN(t)) return;
    if (now - t < WEEK) msg7++; else if (now - t < 2 * WEEK) msgPrev++;
  });

  const total       = memberIds.length;
  const participation = total ? Math.round((active7 / total) * 100) : 0;
  const recentAct   = active7 + msg7;
  const priorAct    = activePrev + msgPrev;
  const engagementTrend = priorAct === 0 ? (recentAct > 0 ? 'Increasing' : 'Quiet')
    : recentAct > priorAct * 1.15 ? 'Increasing'
    : recentAct < priorAct * 0.85 ? 'Decreasing' : 'Steady';

  // Directional health (no score)
  const health = total === 0 ? 'No members yet'
    : participation >= 70 ? 'Sustaining'
    : participation >= 40 ? 'Holding'
    : 'Needs attention';
  const healthColor = health === 'Sustaining' ? 'green' : health === 'Holding' ? 'yellow' : 'red';

  // Goal progress (directional, heuristic until Phase 2 goal-progress signals)
  const goalProgress = !(g.goals && g.goals.length) ? 'No goals set'
    : participation >= 70 && engagementTrend !== 'Decreasing' ? 'Strong'
    : participation >= 40 ? 'Moderate' : 'Early';

  // ── AI: actions / prompts / reflection — from SIGNALS + goals/traits only ──
  const signalBrief = [
    `Group: ${g.name} (${total} members).`,
    g.goals?.length  ? `Goals: ${g.goals.join('; ')}.`   : 'Goals: none set.',
    g.traits?.length ? `Traits: ${g.traits.join(', ')}.` : 'Traits: none set.',
    `Participation this week: ${participation}% (${active7}/${total}).`,
    `Engagement trend: ${engagementTrend}.`,
    `Members who have gone quiet (10+ days): ${quietCount}.`,
    moodCnt ? `Recent average mood: ${Math.round((moodSum / moodCnt) * 10) / 10}/5.` : 'Mood: no recent data.',
    `Goal progress (directional): ${goalProgress}.`,
  ].join('\n');

  const system = [
    `You are the IntelliQ Group Copilot — a coach for the group's LEAD. Your job is to help the group move toward its stated goals. You are NOT a monitor and you do not surveil members.`,
    privacy.GATE_DIRECTIVE,
    `Hard rules: speak in AGGREGATE only — never name or single out an individual. Give the lead ADVICE, not exposure. Use directional language, never scores. Tie everything to the group's goals and traits.`,
    _worldviewDirective(code),
    _domainDirective(code),
  ].filter(Boolean).join('\n\n');

  const user = [
    'SIGNALS (counts and trends only — no message content):',
    signalBrief,
    '',
    'Return ONLY JSON: {"actions":["1-3 aggregate suggested actions for the lead, e.g. \'Some members have gone quiet — reach out personally\'"],"prompts":["2-3 discussion prompts derived from the group goals/traits the lead could post"],"reflection":"one short weekly reflection: what may be helping vs slowing progress toward the goals"}',
  ].join('\n');

  let out = null;
  try {
    out = await ai.completeJSON({ tier: 'reason', system, user, maxTokens: 500, schema: ['actions'] });
  } catch (err) {
    console.warn('[group-copilot] AI error:', err.message);
  }

  res.json({
    ok: true,
    enabled:   true,
    groupName: g.name,
    health, healthColor,
    participation,
    goalProgress,
    engagementTrend,
    hasGoals:  !!(g.goals && g.goals.length),
    actions:   Array.isArray(out?.actions) ? out.actions.slice(0, 3)
               : (quietCount > 0 ? [`${quietCount} member(s) have become less active — consider reaching out personally to see how they're doing.`] : []),
    prompts:   Array.isArray(out?.prompts) ? out.prompts.slice(0, 3) : [],
    reflection: out?.reflection || null,
  });
});

/* ── Delete group ─────────────────────────────────────────────────────────── */
app.delete('/api/groups/:groupId', (req, res) => {
  const { orgCode } = req.body;
  const code = orgCode?.toLowerCase().trim();
  if (!orgGroups[code]) return res.status(404).json({ error: 'Org not found' });
  orgGroups[code] = orgGroups[code].filter(g => g.id !== req.params.groupId);
  scheduleSave();
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   NOTES — Private / Shared / Anonymous
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Create note ─────────────────────────────────────────────────────────── */
app.post('/api/notes', async (req, res) => {
  const { orgCode, authorId, authorName, content, type, tag, groupId: gid, orgMode, orgName, goals } = req.body;
  if (!orgCode || !authorId || !content || !type) return res.status(400).json({ error: 'missing fields' });

  const id   = noteId();
  const note = {
    id, orgCode: orgCode.toLowerCase().trim(),
    groupId: gid || null,
    authorId, authorName,
    content, type,
    tag: tag || null,
    // Phase 1: classify sensitivity at write time so the privacy gate can act
    // on it later (private may inform AI reasoning, never be revealed).
    sensitivity: privacy.classifyText(content, { type, tag }),
    createdAt: new Date().toISOString(),
    aiResponse: null,
  };
  orgNotes[id] = note;

  const shouldGetAIResponse = type === 'private' || type === 'anonymous' || type === 'shared';
  if (shouldGetAIResponse) {
    const prompts = {
      private:   `You are IntelliQ, a private AI companion. Someone has written a private note — only they and you see this. Respond with 1-2 sentences: acknowledge what they've written with genuine care, and if useful, offer one thought or gentle prompt to go deeper. Be warm and human, not clinical.`,
      shared:    `You are IntelliQ. Someone has written a note they're sharing with their group. Acknowledge it briefly (1 sentence) and note anything that might be useful context for their goals or development. Max 2 sentences.`,
      anonymous: `You are IntelliQ. Someone has posted an anonymous note to their group. Acknowledge it (1 sentence). This response is shown only to the author — not the group. Max 2 sentences.`,
    };
    const userMsg = goals?.goal ? `Their goal: "${goals.goal}"\n\nNote: ${content}` : `Note: ${content}`;
    try {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 100,
        system: [prompts[type] || prompts.private, _worldviewDirective(note.orgCode), _domainDirective(note.orgCode, { userId: authorId }), _memberValuesDirective(note.orgCode, authorId)].filter(Boolean).join('\n\n'),
        messages: [{ role: 'user', content: userMsg }],
      });
      note.aiResponse = response.content[0]?.text?.trim() || null;
    } catch(e) { /* non-critical */ }
  }

  // Every note becomes a signal the AI can use (private/anonymous → inform-only).
  _emitSignalSafe(note.orgCode, {
    subjectType: 'member', subjectId: authorId, source: 'note',
    modality: 'text', label: note.tag || null, valueText: content,
    sensitivity: note.sensitivity,
  }, authorId);

  scheduleSave();
  res.json({ ok: true, note: _sanitizeNote(note, authorId) });
});

/* ── Get notes — requires auth ───────────────────────────────────────────── */
app.get('/api/notes', requireAuth, (req, res) => {
  const { groupId: gid, type } = req.query;
  // SECURITY: identity comes from the session, never the query. Previously
  // requesterId was read from the query, so any logged-in user could read
  // another member's PRIVATE notes by passing their id (IDOR). Fixed 2026-07-09.
  const code        = req.iqSession.orgCode;
  const requesterId = req.iqSession.userId;
  if (!code || !requesterId) return res.status(403).json({ error: 'Forbidden' });

  const myGroups = (orgGroups[code] || []).filter(g =>
    g.memberIds.includes(requesterId) || g.leadIds.includes(requesterId)
  ).map(g => g.id);

  const notes = Object.values(orgNotes)
    .filter(n => {
      if (n.orgCode !== code) return false;
      if (gid && n.groupId !== gid) return false;
      if (type && n.type !== type) return false;
      if (n.type === 'private') return n.authorId === requesterId;
      if (n.groupId) return myGroups.includes(n.groupId) || n.authorId === requesterId;
      return n.authorId === requesterId;
    })
    .map(n => _sanitizeNote(n, requesterId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ notes });
});

function _sanitizeNote(note, requesterId) {
  if (note.type === 'anonymous' && note.authorId !== requesterId) {
    return { ...note, authorId: null, authorName: 'Anonymous' };
  }
  return note;
}

/* ── Delete own note ─────────────────────────────────────────────────────── */
app.delete('/api/notes/:noteId', (req, res) => {
  const { requesterId } = req.body;
  const note = orgNotes[req.params.noteId];
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (note.authorId !== requesterId) return res.status(403).json({ error: 'Not your note' });
  delete orgNotes[req.params.noteId];
  scheduleSave();
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   MESSAGES — Known or Anonymous, to a person / group / org
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Send message ─────────────────────────────────────────────────────────── */
app.post('/api/messages/send', (req, res) => {
  const { orgCode, fromId, fromName, toType, toId, content, anonymous } = req.body;
  if (!orgCode || !fromId || !content || !toType) return res.status(400).json({ error: 'missing fields' });
  const id  = msgId();
  const msg = {
    id, orgCode: orgCode.toLowerCase().trim(),
    fromId, fromName: anonymous ? 'Anonymous' : fromName,
    _realFromId: fromId,
    toType, toId: toId || null,
    content, anonymous: !!anonymous,
    createdAt: new Date().toISOString(),
    readBy: [],
  };
  orgMessages[id] = msg;
  scheduleSave();
  res.json({ ok: true, messageId: id });
});

/* ── Get messages — requires auth ────────────────────────────────────────── */
app.get('/api/messages', requireAuth, (req, res) => {
  const { groupId: gid, toType } = req.query;
  // SECURITY: identity from the session, never the query — previously a
  // caller-supplied requesterId let any logged-in user read another member's
  // direct messages (IDOR). Fixed 2026-07-09.
  const code        = req.iqSession.orgCode;
  const requesterId = req.iqSession.userId;
  if (!code || !requesterId) return res.status(403).json({ error: 'Forbidden' });

  const myGroups = (orgGroups[code] || []).filter(g =>
    g.memberIds.includes(requesterId) || g.leadIds.includes(requesterId)
  ).map(g => g.id);

  const msgs = Object.values(orgMessages)
    .filter(m => {
      if (m.orgCode !== code) return false;
      if (gid && m.toId !== gid) return false;
      if (toType && m.toType !== toType) return false;
      if (m._realFromId === requesterId) return true;
      if (m.toType === 'user' && m.toId === requesterId) return true;
      if (m.toType === 'group' && myGroups.includes(m.toId)) return true;
      if (m.toType === 'org' && m.orgCode === code) return true;
      return false;
    })
    .map(m => _sanitizeMsg(m, requesterId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ messages: msgs });
});

/* ── Mark message read ───────────────────────────────────────────────────── */
app.post('/api/messages/:msgId/read', (req, res) => {
  const { requesterId } = req.body;
  const m = orgMessages[req.params.msgId];
  if (!m) return res.status(404).json({ error: 'Not found' });
  if (!m.readBy.includes(requesterId)) m.readBy.push(requesterId);
  scheduleSave();
  res.json({ ok: true });
});

function _sanitizeMsg(msg, requesterId) {
  if (msg.anonymous && msg._realFromId !== requesterId) {
    const { _realFromId, ...safe } = msg;
    return safe;
  }
  const { _realFromId, ...safe } = msg;
  return safe;
}

/* ── Group feed (shared + anonymous notes + messages) ────────────────────── */
app.get('/api/groups/:groupId/feed', requireAuth, (req, res) => {
  // SECURITY: identity from the session, never the query. Was unauthenticated and
  // trusted a caller-supplied requesterId for group-membership checks (IDOR).
  const code        = req.iqSession.orgCode;
  const requesterId = req.iqSession.userId;
  if (!code || !requesterId) return res.status(403).json({ error: 'Forbidden' });
  const gid  = req.params.groupId;

  const groups = orgGroups[code] || [];
  const group  = groups.find(g => g.id === gid);
  if (group) {
    const isMemberOrLead = group.memberIds.includes(requesterId) || group.leadIds.includes(requesterId);
    const users = orgUsers[code] || {};
    const requesterUser = users[requesterId];
    const isOrgStaff = requesterUser && ['superadmin','admin','coach'].includes(requesterUser.role);
    if (!isMemberOrLead && !isOrgStaff) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }
  }

  const notes = Object.values(orgNotes)
    .filter(n => n.orgCode === code && n.groupId === gid && (n.type === 'shared' || n.type === 'anonymous'))
    .map(n => _sanitizeNote(n, requesterId))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  const messages = Object.values(orgMessages)
    .filter(m => m.orgCode === code && m.toType === 'group' && m.toId === gid)
    .map(m => _sanitizeMsg(m, requesterId))
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ notes, messages });
});


/* ═══════════════════════════════════════════════════════════════════════════
   MEMBER APP — SHARED SESSION STORE
   ═══════════════════════════════════════════════════════════════════════════ */

const orgStore          = {};  // populated at startup via _loadAllStores()
const assignedScenarios = {};
const memberResults     = {};
const memberCheckins    = {};
const orgInterventions  = {};  // orgCode → [intervention, ...]
const advisorThreads    = {};  // orgCode → [{ id, memberId, requesterId, requesterRole, question, answer, evidence, createdAt }]

/* ═══════════════════════════════════════════════════════════════════════════
   UNIVERSAL SIGNAL INGESTION  (the input layer)
   Product thesis: the more input the ecosystem ingests, the stronger the output.
   Every input — check-in, voice film note, spreadsheet row, game stat, coach
   observation, or an external feed (Teams / Google / Outlook) — normalises into
   ONE Signal shape that the AI (Advisor, Group Copilot, memory) reasons over.
   Sources are a registry so new connectors plug in without touching the core.
   ═══════════════════════════════════════════════════════════════════════════ */
const orgSignals = {};  // orgCode → [ signal ]

/* Source registry — declares known/plannable input sources + their defaults.
   `integration:true` sources are OAuth connectors (built later) but the contract
   is here now so the rest of the system can already reason about them. */
const SIGNAL_SOURCES = {
  checkin:   { label: 'Check-in',           modality: 'text',   defaultSensitivity: 'sensitive' },
  note:      { label: 'Note / observation', modality: 'text',   defaultSensitivity: 'normal' },
  assessment:{ label: 'Assessment',         modality: 'text',   defaultSensitivity: 'normal' },
  weekly:    { label: 'Weekly reflection',  modality: 'text',   defaultSensitivity: 'sensitive' },
  voice:     { label: 'Voice note',         modality: 'audio',  defaultSensitivity: 'normal' },
  film:      { label: 'Film note',          modality: 'text',   defaultSensitivity: 'normal' },
  metric:    { label: 'Metric',             modality: 'number', defaultSensitivity: 'normal' },
  sheet:     { label: 'Spreadsheet row',    modality: 'sheet',  defaultSensitivity: 'normal' },
  gamestats: { label: 'Game stats',         modality: 'number', defaultSensitivity: 'public' },
  document:  { label: 'Document',           modality: 'file',   defaultSensitivity: 'normal' },
  external:  { label: 'External feed',      modality: 'data',   defaultSensitivity: 'normal' },
  teams:     { label: 'Microsoft Teams',    modality: 'event',  defaultSensitivity: 'normal', integration: true },
  google:    { label: 'Google Workspace',   modality: 'event',  defaultSensitivity: 'normal', integration: true },
  outlook:   { label: 'Outlook / Email',    modality: 'event',  defaultSensitivity: 'normal', integration: true },
};

function signalId() { return 'sig_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7); }

/* ── Signal weighting — not everything is equally important ────────────────────
   STRONG  : assessment results, metrics, game stats, stat sheets (hard outcomes)
   MEDIUM  : reflections, notes, check-ins, film/voice/document
   WEAK    : one-off external events / messages / comments
   Effective weight also rises with REPETITION (repeated behaviour) and RECENCY,
   so a recurring pattern outweighs a single strong data point. Keeps the AI from
   treating one stray note like a season of results. */
const SIGNAL_WEIGHTS = {
  assessment: 3, metric: 3, gamestats: 3, sheet: 3,
  weekly: 2, note: 2, checkin: 2, film: 2, document: 2, voice: 2,
  external: 1, teams: 1, google: 1, outlook: 1,
};
function _signalBaseWeight(source) { return SIGNAL_WEIGHTS[source] != null ? SIGNAL_WEIGHTS[source] : 1; }
function _weightTier(n) { return n >= 3 ? 'strong' : n >= 2 ? 'medium' : 'weak'; }

/* Normalise + store one raw signal. Returns the stored signal (or null if invalid). */
function _ingestSignal(code, raw, createdBy) {
  if (!raw || !raw.source) return null;
  const src = SIGNAL_SOURCES[raw.source] || { modality: 'data', defaultSensitivity: 'normal' };
  const text = raw.valueText != null ? String(raw.valueText) : '';
  const sensitivity = raw.public ? 'public'
    : raw.sensitivity || (text ? privacy.classifyText(text, { source: raw.source }) : src.defaultSensitivity);
  const sig = {
    id:          signalId(),
    orgCode:     code,
    ts:          raw.ts || new Date().toISOString(),
    source:      raw.source,
    modality:    raw.modality || src.modality || 'data',
    subjectType: raw.subjectType || 'member',     // member | group | org
    subjectId:   raw.subjectId || null,
    category:    raw.category || null,            // perf-framework category (optional)
    label:       raw.label != null ? String(raw.label).slice(0, 120) : null,
    valueNum:    raw.valueNum != null && !isNaN(Number(raw.valueNum)) ? Number(raw.valueNum) : null,
    valueText:   text.slice(0, 4000) || null,
    data:        raw.data || null,                // structured payload (sheet row, event, etc.)
    sensitivity,
    public:      sensitivity === 'public',
    weightNum:   raw.weightNum != null ? raw.weightNum : _signalBaseWeight(raw.source),
    weight:      _weightTier(raw.weightNum != null ? raw.weightNum : _signalBaseWeight(raw.source)),
    createdBy:   createdBy || null,
    createdAt:   new Date().toISOString(),
  };
  if (!orgSignals[code]) orgSignals[code] = [];
  orgSignals[code].push(sig);
  return sig;
}

/* Resolve a userId from a member name within an org (best-effort). */
function _resolveUserIdByName(code, name) {
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  const u = Object.values(orgUsers[code] || {}).find(u => (u.name || '').toLowerCase().trim() === n);
  return u ? u.id : null;
}

/* Emit a signal from an input touchpoint — never throws (input flow must not
   break if signal capture fails). This is how EVERY input becomes signal. */
function _emitSignalSafe(code, raw, createdBy) {
  try { return _ingestSignal(code, raw, createdBy); } catch (e) { console.warn('[signal] emit failed:', e.message); return null; }
}

/* Recent signals for a subject (used by the AI layer). */
function _gatherSignals(code, subjectType, subjectId, limit = 40) {
  return (orgSignals[code] || [])
    .filter(s => s.subjectType === subjectType && (subjectId == null || s.subjectId === subjectId))
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, limit);
}

// Key helpers — new code uses userId keys; legacy name keys still supported for reads
function memberKey(orgCode, memberName) {
  return `${orgCode.toLowerCase().trim()}:${memberName.toLowerCase().trim()}`;
}
function userKey(orgCode, userId) {
  return `${orgCode.toLowerCase().trim()}:${userId}`;
}

/* ── Platform registers org ─────────────────────────────────────────────── */
app.post('/api/platform/register-org', (req, res) => {
  const { orgCode, orgName, orgMode } = req.body;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  orgStore[orgCode.toLowerCase().trim()] = { orgName, orgMode };
  scheduleSave();
  res.json({ ok: true });
});

/* ── Update org mode ────────────────────────────────────────────────────── */
app.post('/api/platform/update-org-mode', requireAuth, (req, res) => {
  const { orgCode, orgMode } = req.body;
  if (!orgCode || !orgMode) return res.status(400).json({ error: 'orgCode and orgMode required' });
  const code = orgCode.toLowerCase().trim();
  if (orgMeta[code]) { orgMeta[code].orgMode = orgMode; scheduleSave(); }
  if (orgStore[code]) { orgStore[code].orgMode = orgMode; scheduleSave(); }
  res.json({ ok: true });
});

/* ── Bulk import users (CSV/XLSX parsed client-side) ─────────────────── */
app.post('/api/auth/bulk-import', requireAuth, async (req, res) => {
  const { orgCode, users: importRows } = req.body;
  if (!orgCode || !Array.isArray(importRows)) return res.status(400).json({ error: 'orgCode and users[] required' });
  const code    = orgCode.toLowerCase().trim();
  const creator = req.user;

  if (!orgUsers[code]) return res.status(404).json({ error: 'Org not found' });

  const created = [], skipped = [], failed = [];

  for (const row of importRows) {
    const name  = (row.name  || '').trim();
    const email = (row.email || '').trim().toLowerCase();
    const role  = (['admin','coach','member'].includes(row.role?.toLowerCase()) ? row.role.toLowerCase() : 'member');
    const group = (row.group || row.department || '').trim();

    if (!name) { failed.push({ row, reason: 'Missing name' }); continue; }
    if (!email) { failed.push({ row, reason: 'Missing email' }); continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { failed.push({ row: name, reason: 'Invalid email format' }); continue; }

    // Check for duplicate by email (global) or name (org)
    if (emailIndex[email]) { skipped.push(`${name} (email already used)`); continue; }
    const existing = Object.values(orgUsers[code]).find(u => u.name.toLowerCase() === name.toLowerCase());
    if (existing) { skipped.push(name); continue; }

    const userId = generateId();
    const password = name.toLowerCase().replace(/\s+/g, '');
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const roleLevel = { admin: 2, coach: 3, member: 4 };
    // Parse firstName/lastName from name or explicit columns
    const fName = (row.firstName || name.split(' ')[0] || '').trim();
    const lName = (row.lastName  || name.split(' ').slice(1).join(' ') || '').trim();

    orgUsers[code][userId] = {
      id: userId,
      firstName: fName, lastName: lName,
      name, email, role, orgCode: code,
      group, department: group,
      passwordHash, passwordSet: false,
      status: 'active',
      createdAt: new Date().toISOString(),
      levelId: roleLevel[role] || 4,
      supervisorId: req.iqSession.userId,
      importedAt: new Date().toISOString(),
    };
    emailIndex[email] = { orgCode: code, userId };

    // Auto-create group if it doesn't exist
    if (group) {
      if (!orgGroups[code]) orgGroups[code] = [];
      const groupExists = orgGroups[code].some(g => g.name.toLowerCase() === group.toLowerCase());
      if (!groupExists) {
        orgGroups[code].push({
          id: generateId(), name: group, orgCode: code,
          memberIds: [], createdAt: new Date().toISOString(),
        });
      }
      // Add member to group
      const gObj = orgGroups[code].find(g => g.name.toLowerCase() === group.toLowerCase());
      if (gObj && !gObj.memberIds.includes(userId)) gObj.memberIds.push(userId);
    }

    created.push({ id: userId, name, role, group });
  }

  scheduleSave();
  res.json({ ok: true, created, skipped, failed, total: importRows.length });
});

/* ── List active join/invite links ───────────────────────────────────── */
app.get('/api/auth/join-links', requireAuth, (req, res) => {
  // SECURITY: invite links grant org access (at a role) — admin-only, own org.
  // Was gated on requireAuth only, exposing them to any authenticated user.
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  const role   = orgUsers[code]?.[userId]?.role;
  if (!code || !(role === 'superadmin' || role === 'admin' || _userHasPerm(code, userId, 'manage_settings'))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const now   = Date.now();
  const links = Object.entries(inviteTokens)
    .filter(([, t]) => t.orgCode === code && t.expiresAt > now)
    .map(([token, t]) => ({
      token,
      url:        `/?invite=${token}`,
      role:       t.role,
      group:      t.group || '',
      label:      t.label || '',
      usageLimit: t.usageLimit || null,
      useCount:   t.useCount || 0,
      expiresAt:  new Date(t.expiresAt).toISOString(),
      createdAt:  t.createdAt || null,
    }));
  res.json({ links });
});

/* ── Load sample data for org ─────────────────────────────────────────── */
/* ── load-sample REMOVED (Sprint 2) ─────────────────────────────────────── */
// Demo data injection is no longer supported. All people must be real users
// with valid email addresses. Use /api/auth/create-user or bulk-import.
app.post('/api/auth/load-sample', requireAuth, (req, res) => {
  res.status(410).json({ error: 'Sample data loading has been removed. Please add real members using the People → Onboard section.' });
});

/* ── Platform assigns a scenario to a member ────────────────────────────── *
 *
 *  Body: { orgCode, memberName?, memberId?, scenario,
 *          assignedByNodeId?, assignedByNodeName? }
 *
 *  Assigner identity is always taken from the auth session — the client
 *  never controls assignedByUserId / assignedByName to prevent spoofing.
 *  assignedByNodeId / assignedByNodeName are optional context fields the
 *  admin UI may pass when the assignment is made on behalf of a node/group.
 *
 * ──────────────────────────────────────────────────────────────────────── */
app.post('/api/platform/assign-scenario', requireAuth, (req, res) => {
  const {
    orgCode, memberName, memberId, scenario,
    assignedByNodeId, assignedByNodeName,
  } = req.body;

  const code = (orgCode || req.iqSession.orgCode || '').toLowerCase().trim();
  if (!code || !scenario) {
    return res.status(400).json({ error: 'orgCode and scenario required' });
  }

  // Resolve member name — prefer memberId lookup for accuracy
  let resolvedName = memberName;
  if (memberId && !resolvedName) {
    const u = orgUsers[code]?.[memberId];
    if (u) resolvedName = u.name;
  }
  if (!resolvedName) {
    return res.status(400).json({ error: 'memberName or memberId required' });
  }

  // Assigner always comes from the verified session — never from request body
  const assignerUser       = orgUsers[code]?.[req.iqSession.userId];
  const assignedByUserId   = req.iqSession.userId;
  const assignedByName     = assignerUser?.name  || 'Organisation';
  const assignedByRole     = assignerUser?.role   || 'admin';

  const key = memberKey(code, resolvedName);
  if (!assignedScenarios[key]) assignedScenarios[key] = [];

  // Prevent exact duplicate (same scenario id, same assigner, already pending)
  const alreadyPending = assignedScenarios[key].find(
    s => s.id === scenario.id && s.status === 'pending'
  );
  if (!alreadyPending) {
    assignedScenarios[key].push({
      ...scenario,
      status:             'pending',
      assignedAt:         new Date().toISOString(),
      assignedByUserId,
      assignedByName,
      assignedByRole,
      assignedByNodeId:   assignedByNodeId   || null,
      assignedByNodeName: assignedByNodeName || null,
    });
  }

  scheduleSave();
  res.json({ ok: true, total: assignedScenarios[key].length });
});

/* ── Member joins org — issues token if userId is valid ─────────────────── */
app.post('/api/member/join', (req, res) => {
  const { orgCode, memberName, userId } = req.body;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'orgCode and memberName required' });
  const code = orgCode.toLowerCase().trim();
  const org  = orgStore[code];

  // Issue a token if the userId is a real user in this org
  let token = null;
  if (userId && orgUsers[code]?.[userId]) {
    const user = orgUsers[code][userId];
    token = issueToken(userId, code, user.role);
  }

  res.json({
    ok:         true,
    orgName:    org?.orgName  || orgCode,
    orgMode:    org?.orgMode  || '',
    memberName: memberName.trim(),
    orgCode:    code,
    token,
  });
});

/* ── Member gets pending scenarios ─────────────────────────────────────── *
 *
 *  Returns pending + completed scenarios for the requesting member.
 *  Each scenario object includes assigner metadata fields:
 *    assignedByUserId, assignedByName, assignedByRole,
 *    assignedByNodeId, assignedByNodeName, assignedAt
 *  Legacy assignments that predate Phase 3 will have these fields as null/
 *  undefined; clients should fall back to "Assigned by: Organisation".
 *
 * ──────────────────────────────────────────────────────────────────────── */
app.get('/api/member/pending', requireAuth, (req, res) => {
  const { orgCode, memberName, userId } = req.query;
  const code = (orgCode || req.iqSession.orgCode || '').toLowerCase().trim();
  if (!code) return res.status(400).json({ error: 'orgCode required' });

  // Resolve memberName from userId when provided (unified app path)
  let resolvedName = memberName;
  if (!resolvedName) {
    const uid  = userId || req.iqSession.userId;
    const user = orgUsers[code]?.[uid];
    if (user) resolvedName = user.name;
  }
  if (!resolvedName) return res.status(400).json({ error: 'memberName or userId required' });

  const key      = memberKey(code, resolvedName);
  const all      = assignedScenarios[key] || [];
  const pending  = all.filter(s => s.status === 'pending');
  const completed = all.filter(s => s.status === 'completed');

  // Enrich each scenario: ensure assigner fallback for legacy entries
  const enrich = sc => ({
    ...sc,
    assignedByName:     sc.assignedByName     || 'Organisation',
    assignedByRole:     sc.assignedByRole     || null,
    assignedByNodeId:   sc.assignedByNodeId   || null,
    assignedByNodeName: sc.assignedByNodeName || null,
  });

  res.json({
    scenarios: pending.map(enrich),
    completed: completed.map(enrich),
  });
});

/* ── Member submits scenario result ─────────────────────────────────────── */
app.post('/api/member/submit-result', (req, res) => {
  const { orgCode, memberName, memberId, userId, scenarioId, result } = req.body;
  if (!orgCode || !result) return res.status(400).json({ error: 'missing fields' });

  // Resolve memberName from memberId (unified app path)
  let resolvedName = memberName;
  if (memberId && !resolvedName) {
    const user = orgUsers[orgCode.toLowerCase()]?.[memberId];
    if (user) resolvedName = user.name;
  }
  if (!resolvedName) return res.status(400).json({ error: 'memberName or memberId required' });

  const key = memberKey(orgCode, resolvedName);

  if (assignedScenarios[key]) {
    const sc = assignedScenarios[key].find(s => s.id === scenarioId);
    if (sc) sc.status = 'completed';
  }

  if (!memberResults[key]) memberResults[key] = [];
  // Store memberName and memberId inside result for display + future migration
  memberResults[key].push({ ...result, memberName: resolvedName, memberId: memberId || null, submittedAt: new Date().toISOString() });

  // Update memory from scenario development areas
  const resolvedUserId = userId || memberId;
  if (resolvedUserId && result?.dimensions?.development?.length) {
    _updateUserMemory(orgCode.toLowerCase(), resolvedUserId, 'scenario', {
      development: result.dimensions.development,
    });
  }

  // Assessment completion → signals: the score (citable) + what it revealed.
  const _code = orgCode.toLowerCase().trim();
  const _aid  = resolvedUserId || _resolveUserIdByName(_code, resolvedName);
  if (_aid) {
    const sc = result.score || result.dimensions || {};
    if (sc.overall != null) _emitSignalSafe(_code, {
      subjectType: 'member', subjectId: _aid, source: 'assessment', modality: 'number',
      label: 'Assessment overall', valueNum: Number(sc.overall), sensitivity: 'normal',
    }, _aid);
    const parts = [];
    if (sc.summary) parts.push(sc.summary);
    if (Array.isArray(sc.strengths) && sc.strengths.length)   parts.push('Strengths: ' + sc.strengths.join(', '));
    if (Array.isArray(sc.development) && sc.development.length) parts.push('Development: ' + sc.development.join(', '));
    if (parts.length) _emitSignalSafe(_code, {
      subjectType: 'member', subjectId: _aid, source: 'assessment', modality: 'text',
      label: result.scenarioTitle || 'Assessment', valueText: parts.join(' · '), sensitivity: 'normal',
    }, _aid);
  }

  scheduleSave();
  res.json({ ok: true });
});

/* ── Member submits check-in (legacy simple endpoint) ───────────────────── */
app.post('/api/member/checkin', (req, res) => {
  const { orgCode, memberName, mood, note } = req.body;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'missing fields' });
  const code = (orgCode || '').toLowerCase().trim();
  const key = memberKey(orgCode, memberName);
  if (!memberCheckins[key]) memberCheckins[key] = [];
  const _ciRec = {
    id: 'ci_' + generateId(),
    memberName,
    mood, note,
    date: new Date().toLocaleDateString('en-GB'),
    ts:   new Date().toISOString(),
  };
  memberCheckins[key].push(_ciRec);
  const _cid = _resolveUserIdByName(code, memberName);
  // COMPATIBILITY WRITE (non-authoritative): a CONTENTLESS participation marker only
  // (frozen contract) — no mood value, no text. Named consumer: behaviour-engine
  // participation cadence + last-activity. No check-in INTELLIGENCE reads it.
  if (_cid) _emitCheckinParticipationSignal(code, _cid, {
    sensitivePresent: note ? privacy.isPrivate(privacy.classifyText(note, { source: 'checkin' })) : false,
  });
  // AUTHORITATIVE: the check-in becomes claim-bounded canonical evidence (a hardship
  // note stays owner-only-private; the mood rating is sensitive + org-aggregable).
  if (_cid) { try { _canonicaliseCheckin(code, _cid, _ciRec); } catch (_) {} }
  scheduleSave();
  res.json({ ok: true });
});

/* Leader-analytics gate. Returns { code, userId } when the session may view
   org/member insight, else sends 403 and returns null. Identity ALWAYS comes
   from the session — analytics endpoints must never authorize on a query orgCode. */
function _requireInsight(req, res) {
  const { orgCode: code, userId } = req.iqSession;
  if (!code || !userId) { res.status(403).json({ error: 'Forbidden' }); return null; }
  const ok = _userHasPerm(code, userId, 'view_insights') ||
             _userHasPerm(code, userId, 'review_checkins') ||
             orgUsers[code]?.[userId]?.role === 'superadmin';
  if (!ok) { res.status(403).json({ error: 'Insufficient permissions' }); return null; }
  return { code, userId };
}

/* Shared privacy-safe projection of a check-in for any leader-facing surface.
   Check-in free-text is a personal disclosure (classified sensitive by default);
   sensitive/restricted entries are redacted to a contentless marker so leaders
   see engagement (mood, cadence) but never a member's private words. */
function _safeCheckinEntry(c) {
  const sens = privacy.classifyText(c.text || '', { source: 'checkin' });
  const isPrivate = sens === 'sensitive' || sens === 'restricted';
  return {
    memberName: c.memberName, mood: c.mood, moodLabel: c.moodLabel,
    role: c.role, date: c.date, ts: c.ts,
    text: isPrivate ? null : c.text,
    private: isPrivate,
  };
}

/* ── Platform pulls member results ─────────────────────────────────────────
   SECURITY (fixed 2026-07-09): was requireAuth-only, letting any logged-in user
   read any member's raw check-ins by name. Now session-scoped and gated: the
   member themselves, or a leader with review_checkins/view_insights within scope;
   check-ins are privacy-filtered for the leader path. */
app.get('/api/platform/member-results', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  const { memberName } = req.query;
  if (!code || !memberName) return res.status(400).json({ error: 'missing fields' });

  const target   = _resolveUserIdByName(code, memberName);
  const isSelf   = target && target === userId;
  const canLead  = _userHasPerm(code, userId, 'view_insights') || _userHasPerm(code, userId, 'review_checkins');
  const inScope  = target && getVisibleUserIds(code, userId).includes(target);
  if (!isSelf && !(canLead && inScope)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const key      = memberKey(code, memberName);
  const checkins = memberCheckins[key] || [];
  res.json({
    results:  memberResults[key] || [],
    // Self sees their own words; a leader sees the privacy-filtered projection.
    checkins: isSelf ? checkins : checkins.map(_safeCheckinEntry),
  });
});

/* ── Platform pulls all results for org ─────────────────────────────────────
   SECURITY (fixed 2026-07-09): was requireAuth-only. Now session-scoped, gated,
   and limited to the caller's visible members. */
app.get('/api/platform/org-results', requireAuth, (req, res) => {
  const { orgCode: code, userId } = req.iqSession;
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });
  if (!_userHasPerm(code, userId, 'view_insights') && !_userHasPerm(code, userId, 'review_checkins')
      && orgUsers[code]?.[userId]?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const results = {};
  getVisibleUserIds(code, userId).forEach(uid => {
    const u = orgUsers[code]?.[uid];
    if (!u || u.role === 'superadmin') return;
    const entries = memberResults[userKey(code, uid)] || memberResults[memberKey(code, u.name || '')] || [];
    if (entries.length) results[u.name || uid] = entries;
  });
  res.json({ results });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ORG INTELLIGENCE — FREEFORM DESCRIPTION → AI TRAIT EXTRACTION
   ═══════════════════════════════════════════════════════════════════════════ */
app.post('/api/org/describe', async (req, res) => {
  const { description, orgName } = req.body;
  if (!description) return res.status(400).json({ error: 'description required' });

  const systemPrompt = `You are an intelligent org analyst for IntelliQ, a performance intelligence platform.

An organisation admin has described their organisation in their own words. Your job is to:
1. Determine the closest org category
2. Extract the key values, goals, and environment they want to create
3. Identify what "success" means to them

OUTPUT FORMAT — valid JSON only, no extra text:
{
  "orgMode": "school|sports|workplace|military|healthcare|government|other",
  "summary": "One sentence capturing what this org is really about",
  "traits": ["specific trait 1", "specific trait 2", "specific trait 3", "specific trait 4"],
  "goals": ["meaningful org goal 1", "meaningful org goal 2", "meaningful org goal 3"],
  "environment": "The kind of culture/environment they want to build (1 sentence)",
  "successLooks": "What success looks like for them specifically (1 sentence)"
}

RULES:
- orgMode must be exactly one of: school, sports, workplace, military, healthcare, government, other
- traits should be observable, specific characteristics (e.g. "athlete wellbeing first", "high accountability culture", "data-driven decisions")
- goals should be meaningful outcomes, not generic platitudes
- Be grounded in what they actually wrote — do not invent things they didn't mention`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: `Organisation: ${orgName}\n\nDescription: ${description}` }],
    });
    const raw     = response.content[0]?.text || '';
    const jsonStr = raw.replace(/```json\n?|\n?```/g, '').trim();
    let traits;
    try { traits = JSON.parse(jsonStr); }
    catch(e) { return res.status(500).json({ error: 'Parse failed', raw }); }
    res.json({ ok: true, ...traits });
  } catch(err) {
    console.error('Org describe error:', err.message);
    res.status(500).json({ error: 'AI unavailable', detail: err.message });
  }
});

/* ─── ORG PROFILE UPDATE ────────────────────────────────────────────────── */
/* Stores AI-extracted org profile fields (description, summary, traits, etc.)
   These come from /api/org/describe and are persisted here by the setup wizard.
   Additive merge — never overwrites orgName, orgMode, or createdAt.          */
app.put('/api/org/profile', requireAuth, (req, res) => {
  const { orgCode, orgMode, orgDescription, orgSummary, orgEnvironment, orgSuccessDefinition, orgTraits } = req.body;
  const code = (orgCode || req.iqSession?.orgCode || '').toLowerCase().trim();
  if (!code) return res.status(400).json({ error: 'orgCode required' });

  // Only superadmin for this org may update the profile
  const user = orgUsers[code]?.[req.iqSession.userId];
  if (!user || user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });

  if (!orgMeta[code]) return res.status(404).json({ error: 'Organisation not found' });

  // Additive merge — never overwrite immutable fields
  if (orgMode            !== undefined) orgMeta[code].orgMode             = orgMode;
  if (orgDescription     !== undefined) orgMeta[code].orgDescription      = orgDescription;
  if (orgSummary         !== undefined) orgMeta[code].orgSummary          = orgSummary;
  if (orgEnvironment     !== undefined) orgMeta[code].orgEnvironment      = orgEnvironment;
  if (orgSuccessDefinition !== undefined) orgMeta[code].orgSuccessDefinition = orgSuccessDefinition;
  if (orgTraits          !== undefined) orgMeta[code].orgTraits           = orgTraits;

  scheduleSave();
  res.json({ ok: true, org: orgMeta[code] });
});

/* ═══════════════════════════════════════════════════════════════════════════
   MEMBER GOALS — Individual goal & identity intake
   Accepts memberId (stable) or memberName (legacy). Prefers memberId.
   ═══════════════════════════════════════════════════════════════════════════ */
const memberGoals = {};  // populated at startup via _loadAllStores()

app.post('/api/member/goals', (req, res) => {
  const { orgCode, memberName, memberId, goal, identity } = req.body;
  if (!orgCode || (!memberName && !memberId)) return res.status(400).json({ error: 'missing fields' });
  // Prefer stable userId as key; fall back to name for backward compat
  const key = memberId
    ? userKey(orgCode, memberId)
    : memberKey(orgCode, memberName);
  memberGoals[key] = { goal: goal || '', identity: identity || '', memberName, setAt: new Date().toISOString() };
  scheduleSave();
  res.json({ ok: true });
});

app.get('/api/member/goals', requireAuth, (req, res) => {
  // SECURITY: was unauthenticated. Now auth'd and scoped — the member themselves,
  // or a leader who has this member in scope. Fixed 2026-07-09.
  const { memberName, memberId } = req.query;
  const code = req.iqSession.orgCode;
  if (!code || (!memberName && !memberId)) return res.status(400).json({ error: 'missing fields' });

  const targetId = memberId || _resolveUserIdByName(code, memberName || '');
  const isSelf   = targetId && targetId === req.iqSession.userId;
  const canLead  = (_userHasPerm(code, req.iqSession.userId, 'view_insights') ||
                    _userHasPerm(code, req.iqSession.userId, 'view_members')) &&
                   targetId && getVisibleUserIds(code, req.iqSession.userId).includes(targetId);
  if (!isSelf && !canLead) return res.status(403).json({ error: 'Insufficient permissions' });

  const key    = memberId ? userKey(code, memberId) : memberKey(code, memberName);
  const altKey = memberId ? memberKey(code, memberName || '') : null;
  res.json({ goals: memberGoals[key] || (altKey ? memberGoals[altKey] : null) || null });
});

/* ═══════════════════════════════════════════════════════════════════════════
   MEMORY ENGINE — Read / resolve user AI profile
   ═══════════════════════════════════════════════════════════════════════════ */

/* GET /api/user/memory — the person reads their OWN model.

   PRIVACY GOVERNANCE (council-ratified 2026-07-09): a member's Person Model is
   THEIRS. It is inspectable and correctable by the person, and Platform (leaders,
   admins) NEVER receives it raw — org-level insight comes only from the
   privacy-gated briefing, never from these private threads. So this endpoint is
   strictly self-scoped: it ignores any userId in the query and returns only the
   caller's own memory. There is no leader cross-read path, by construction. */
app.get('/api/user/memory', requireAuth, (req, res) => {
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });
  const mem = userAiProfiles[`${code}:${userId}`] || null;
  res.json({ memory: mem });
});

/* PUT /api/user/memory/resolve — the person corrects/resolves their OWN model.
   Self-scoped for the same governance reason as the GET above. */
app.put('/api/user/memory/resolve', requireAuth, (req, res) => {
  const { threadId, followUpId } = req.body;
  if (!threadId && !followUpId) {
    return res.status(400).json({ error: 'threadId or followUpId required' });
  }
  const code   = req.iqSession.orgCode;
  const userId = req.iqSession.userId;
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });

  const mem = _getMemory(code, userId);
  if (threadId) {
    const t = mem.openThreads.find(t => t.id === threadId);
    if (t) { t.resolved = true; t.resolvedAt = new Date().toISOString(); }
  }
  if (followUpId) {
    const f = mem.priorFollowUps.find(f => f.id === followUpId);
    if (f) { f.resolved = true; f.resolvedAt = new Date().toISOString(); }
  }
  mem.lastUpdated = new Date().toISOString();
  scheduleSave();
  res.json({ ok: true, memory: mem });
});

/* ═══════════════════════════════════════════════════════════════════════════
   FREEFORM CHECK-IN — Free text + AI response
   Phase 4: Member role returns structured insight object.
   Other roles (leader/admin) return a plain text aiResponse as before.
   Accepts memberId (stable) or memberName (legacy). Prefers memberId.
   ═══════════════════════════════════════════════════════════════════════════ */
app.post('/api/checkin/freeform', async (req, res) => {
  const { orgCode, memberName, memberId, userId, text, mood, role, orgMode, orgName, goals } = req.body;
  if (!orgCode || !memberName || !text) return res.status(400).json({ error: 'missing fields' });

  const code = (orgCode || '').toLowerCase().trim();
  const key = memberId
    ? userKey(code, memberId)
    : memberKey(code, memberName);

  if (!memberCheckins[key]) memberCheckins[key] = [];

  const moodLabels = { 1:'Rough', 2:'Low', 3:'Okay', 4:'Good', 5:'Great' };
  const checkin = {
    id:        'ci_' + generateId(),
    memberName,
    text,
    mood:      mood || null,
    moodLabel: moodLabels[mood] || null,
    role:      role || 'member',
    orgMode:   orgMode || '',
    date:      new Date().toLocaleDateString('en-GB'),
    ts:        new Date().toISOString(),
  };
  memberCheckins[key].push(checkin);

  const _fid = memberId || _resolveUserIdByName(code, memberName);
  // COMPATIBILITY WRITE (non-authoritative) — a CONTENTLESS participation marker only
  // (frozen contract); no mood value, no text. See /api/member/checkin.
  if (_fid) _emitCheckinParticipationSignal(code, _fid, {
    sensitivePresent: text ? privacy.isPrivate(privacy.classifyText(text, { source: 'checkin' })) : false,
  });
  // AUTHORITATIVE: claim-bounded canonical evidence (hardship note stays owner-only).
  if (_fid) { try { _canonicaliseCheckin(code, _fid, checkin); } catch (_) {} }

  const effectiveRole = role || 'member';

  /* ── MEMBER: structured insight (Phase 4) ─────────────────────────────── */
  if (effectiveRole === 'member') {

    // Gather server-side context
    const stored       = memberGoals[key] || memberGoals[memberKey(code, memberName)] || {};
    const focusGoal    = goals?.goal      || stored.goal     || '';
    const identityGoal = goals?.identity  || stored.identity || '';

    // LONGITUDINAL CONCLUSION comes from the shared KERNEL over canonical evidence —
    // NOT from raw prior rows. The current check-in was already canonicalised above, so
    // it is included. The model phrases the result; it never computes the trend itself.
    const _ckState = _fid ? _checkinKernelState(code, _fid, { purpose: 'personal_assistance', viewerId: _fid }) : null;
    const trendPhrase = !_ckState || !_ckState.moodSeries.length
      ? 'This is an early check-in — no established trend yet'
      : _ckState.trajectory === 'diverging' ? 'Kernel trend: recent check-ins are BELOW this member\'s usual baseline'
      : _ckState.trajectory === 'converging' ? 'Kernel trend: recent check-ins are moving back toward baseline (recovering)'
      : _ckState.trajectory === 'sustaining' ? 'Kernel trend: holding steady around baseline'
      : 'Kernel trend: not enough recent signal to establish a trajectory';
    // The concern flag is the KERNEL's — the model may only phrase it, never invent one.
    const kernelConcern = _ckState && _ckState.patterns.some(p => ['repeated_concern', 'momentum_drop', 'baseline_shift'].includes(p.type));

    const orgVals       = (orgValues[code]   || []).slice(0, 6).join(', ') || null;
    const orgMetricList = (orgMetrics[code]  || []).slice(0, 6).map(m => m.name || m).join(', ') || null;

    // Memory injection — only for members with a userId
    const memoryBlock = userId ? _buildMemoryBlock(code, userId) : '';

    const systemPrompt = `You are IntelliQ — a warm, perceptive, and honest performance intelligence system.

A member has submitted their daily check-in. Return a structured insight that is genuinely useful and grounded strictly in what they actually wrote. Do not invent data, assume context, or fake trends.
${memoryBlock}
RULES:
- Observe only what the member explicitly shared — never project or extrapolate
- If this is their first check-in, acknowledge it honestly ("This is your first check-in — patterns will emerge over time")
- Use the organisation's own vocabulary naturally (see ORGANISATION LANGUAGE below) — but never invent domain detail the member didn't share
- suggestedNextAction must be concrete and specific to TODAY's check-in — not generic advice
- LONGITUDINAL TREND is provided by the kernel (see "Kernel trend" below). Do NOT compute or infer your own trend, baseline or "persistent" pattern from the history — only phrase what the kernel provided.
- watchOutFor: include ONLY if the kernel flagged a concern (see "Kernel concern" below) or today's words contain explicit avoidance/contradiction — otherwise null. Never diagnose (no "burned out", "depressed", "can't cope").
- goalConnection: only include if a goal is set and today's check-in has a real connection to it — otherwise null
- metricSignals: only include if org metrics are defined and the member mentioned something relevant — otherwise null
- Max 2 sentences per field. Keep it tight and human.

OUTPUT — valid JSON only, no markdown fencing, no extra text:
{
  "summary": "One honest sentence of what IntelliQ noticed today",
  "whatIntelliQNoticed": "A specific personal observation from today's check-in (1-2 sentences)",
  "goalConnection": "How today connects to their focus goal, or null",
  "metricSignals": "Any metric-relevant signals from what they shared, or null",
  "suggestedNextAction": "One concrete specific action based on what they wrote today",
  "encouragement": "A brief genuine note — 1 sentence, not generic",
  "watchOutFor": "A real concern if present in their words, or null"
}`;

    const userContent = [
      `Member: ${memberName}`,
      focusGoal    ? `Focus goal: "${focusGoal}"` : 'Focus goal: not set',
      identityGoal ? `Identity aspiration: "${identityGoal}"` : null,
      orgVals       ? `Organisation values: ${orgVals}` : null,
      orgMetricList ? `Organisation metrics: ${orgMetricList}` : null,
      trendPhrase,
      `Kernel concern: ${kernelConcern ? 'YES — the kernel flagged a recurring/below-baseline concern' : 'none flagged by the kernel'}`,
      ``,
      `Today's mood: ${moodLabels[mood] || 'not specified'}`,
      `Today's check-in: "${text}"`,
    ].filter(Boolean).join('\n');

    try {
      const response = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system:     [systemPrompt, _worldviewDirective(code), _domainDirective(code, { userId }), _memberValuesDirective(code, userId)].filter(Boolean).join('\n\n'),
        messages:   [{ role: 'user', content: userContent }],
      });

      const raw     = (response.content[0]?.text || '').trim();
      const jsonStr = raw.replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'').trim();

      let insight;
      try {
        insight = JSON.parse(jsonStr);
      } catch(parseErr) {
        // AI returned non-JSON — degrade gracefully
        console.warn('[CHECKIN] insight parse failed, using raw as summary');
        insight = {
          summary:             raw.slice(0, 160) || 'Check-in received.',
          whatIntelliQNoticed: null,
          goalConnection:      null,
          metricSignals:       null,
          suggestedNextAction: null,
          encouragement:       null,
          watchOutFor:         null,
        };
      }

      checkin.insight    = insight;
      checkin.aiResponse = insight.summary || null; // backward compat

      // Update user memory from this insight
      if (userId && insight) {
        _updateUserMemory(code, userId, 'checkin', {
          watchOutFor:        insight.watchOutFor,
          suggestedNextAction: insight.suggestedNextAction,
        });
      }

      scheduleSave();
      return res.json({ ok: true, insight, aiResponse: checkin.aiResponse });

    } catch(err) {
      console.error('[CHECKIN] AI error:', err.message);
      scheduleSave();
      return res.json({ ok: true, insight: null, aiResponse: null });
    }
  }

  /* ── LEADER / ADMIN: lightweight plain-text response (unchanged) ─────── */
  const leaderPrompts = {
    leader: `You are IntelliQ, a performance intelligence assistant for leaders. A leader has submitted their daily check-in. Acknowledge what they shared briefly. If they mentioned a specific person or situation, reflect something useful back. Max 3 sentences. Be direct and practical.`,
    admin:  `You are IntelliQ, a performance intelligence assistant. An admin has submitted a check-in. Acknowledge briefly. If anything sounds like it needs org-level attention, note it. Max 2 sentences.`,
  };

  const leaderRoleKey = (effectiveRole === 'admin' || effectiveRole === 'superadmin') ? 'admin' : 'leader';
  const systemPrompt = leaderPrompts[leaderRoleKey];
  let userContent = '';
  if (mood) userContent += `Mood: ${moodLabels[mood]}\n`;
  userContent += `Check-in: ${text}`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system:     [systemPrompt, _worldviewDirective(code), _domainDirective(code, { userId })].filter(Boolean).join('\n\n'),
      messages:   [{ role: 'user', content: userContent }],
    });
    const aiResponse = response.content[0]?.text?.trim() || '';
    checkin.aiResponse = aiResponse;
    scheduleSave();
    return res.json({ ok: true, insight: null, aiResponse });
  } catch(err) {
    console.error('[CHECKIN] AI error (leader):', err.message);
    scheduleSave();
    return res.json({ ok: true, insight: null, aiResponse: null });
  }
});

/* ── Platform: pull all checkins for org — requires auth ────────────────── */
app.get('/api/platform/org-checkins', requireAuth, (req, res) => {
  // SECURITY: session-scoped (never trust orgCode from the query), permission-
  // gated, and scoped to the caller's visible members — same rules as
  // team-insights. Previously this was requireAuth-only, which let any logged-in
  // user read every member's raw check-in text across orgs. Fixed 2026-07-09.
  const { orgCode: code, userId } = req.iqSession;
  if (!code || !userId) return res.status(403).json({ error: 'Forbidden' });

  const canViewInsights   = _userHasPerm(code, userId, 'view_insights');
  const canReviewCheckins = _userHasPerm(code, userId, 'review_checkins');
  if (!canViewInsights && !canReviewCheckins) {
    return res.status(403).json({ error: 'Permission denied: view_insights or review_checkins required' });
  }

  // PRIVACY LAW: check-in free-text is redacted for sensitive/restricted entries
  // via the shared _safeCheckinEntry projection — leaders see engagement, never
  // a member's private words.
  const results = {};
  getVisibleUserIds(code, userId).forEach(uid => {
    const u = orgUsers[code]?.[uid];
    if (!u || u.role === 'superadmin') return;
    const entries = memberCheckins[userKey(code, uid)] || memberCheckins[memberKey(code, u.name || '')] || [];
    if (entries.length) results[u.name || uid] = entries.map(_safeCheckinEntry);
  });
  res.json({ checkins: results });
});

/* ═══════════════════════════════════════════════════════════════════════════
   WEEKLY ASSESSMENTS — Role-specific weekly reflection forms
   Accepts memberId (stable) or memberName (legacy). Prefers memberId.
   ═══════════════════════════════════════════════════════════════════════════ */

const weeklyAssessments = {};  // populated at startup via _loadAllStores()

function weekKey(orgCode, weekStr) {
  return `${orgCode.toLowerCase().trim()}:${weekStr}`;
}

function currentWeekStr() {
  const d    = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
}

/* ── Submit weekly assessment ───────────────────────────────────────────── */
app.post('/api/weekly/submit', async (req, res) => {
  const { orgCode, memberName, memberId, userId, role, orgMode, orgName, data, goals } = req.body;
  if (!orgCode || !memberName || !data) return res.status(400).json({ error: 'missing fields' });

  const week = currentWeekStr();
  const key  = weekKey(orgCode, week);
  if (!weeklyAssessments[key]) weeklyAssessments[key] = [];

  // Remove prior submission this week for this member (by id or name)
  const idx = weeklyAssessments[key].findIndex(e =>
    (memberId && e.memberId === memberId) ||
    (!memberId && e.memberName.toLowerCase() === memberName.toLowerCase())
  );
  if (idx > -1) weeklyAssessments[key].splice(idx, 1);

  const rolePrompts = {
    member: `You are IntelliQ. A member has completed their weekly reflection. Read what they shared and respond in 2-3 sentences: acknowledge their week genuinely, and if they have a goal, connect something they said to it. Be warm and specific. Max 3 sentences.`,
    leader: `You are IntelliQ, a performance intelligence assistant. A leader has submitted their weekly reflection. Read it and respond with one practical insight or observation worth acting on. Reference specifics they mentioned. Max 3 sentences.`,
    staff:  `You are IntelliQ. A staff member has submitted their weekly report. Acknowledge what they shared and note anything that may need follow-up. Max 2 sentences.`,
  };

  const roleKey = role === 'member' ? 'member' : (role === 'coach' || role === 'admin' || role === 'superadmin') ? 'leader' : 'staff';
  const code    = (orgCode || '').toLowerCase().trim();

  // Memory injection for members
  const memoryBlock = (roleKey === 'member' && userId)
    ? _buildMemoryBlock(code, userId)
    : '';
  const memberSystemPrompt = `You are IntelliQ. A member has completed their weekly reflection. Read what they shared and respond in 2-3 sentences: acknowledge their week genuinely, and if they have a goal, connect something they said to it. Be warm and specific. Max 3 sentences.${memoryBlock ? '\n' + memoryBlock : ''}`;

  const finalRolePrompts = {
    member: memberSystemPrompt,
    leader: rolePrompts.leader,
    staff:  rolePrompts.staff,
  };

  let userMsg = '';
  if (goals?.goal) userMsg += `Their goal: "${goals.goal}"\n\n`;
  userMsg += `Weekly reflection:\n${Object.entries(data).map(([k,v]) => `${k}: ${v}`).join('\n')}`;

  let aiResponse = null;
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 150,
      system: [finalRolePrompts[roleKey], _worldviewDirective(code), _domainDirective(code, { userId }), _memberValuesDirective(code, userId)].filter(Boolean).join('\n\n'),
      messages: [{ role: 'user', content: userMsg }],
    });
    aiResponse = response.content[0]?.text?.trim() || null;
  } catch(e) { /* non-critical */ }

  // Update memory for members: use weekly reflection text as theme source
  if (roleKey === 'member' && userId) {
    const allText = Object.values(data).filter(Boolean).join(' ');
    // Extract themes from the 'hard' / 'overall' fields if present
    const themes = [];
    if (data.hard)    themes.push(...data.hard.toLowerCase().split(/\W+/).filter(w => w.length > 4).slice(0, 3));
    if (data.overall) themes.push(...data.overall.toLowerCase().split(/\W+/).filter(w => w.length > 4).slice(0, 3));
    if (themes.length) _updateUserMemory(code, userId, 'weekly', { themes });
  }

  const entry = {
    memberName, memberId: memberId || null,
    role: role || 'member', orgMode: orgMode || '',
    data, week, aiResponse,
    submittedAt: new Date().toISOString(),
  };
  weeklyAssessments[key].push(entry);

  // Weekly reflection → signal (free text the AI can mine; inform-only).
  const _wid = memberId || _resolveUserIdByName(code, memberName);
  const _wtext = Object.values(data || {}).filter(Boolean).join(' · ').slice(0, 1500);
  if (_wid && _wtext) _emitSignalSafe(code, {
    subjectType: 'member', subjectId: _wid, source: 'weekly', modality: 'text',
    valueText: _wtext, sensitivity: 'sensitive',
  }, _wid);

  scheduleSave();

  res.json({ ok: true, aiResponse, week });
});

/* ── Get weekly assessments for org — requires auth ─────────────────────── */
app.get('/api/weekly/org', requireAuth, (req, res) => {
  const { orgCode, week } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const w   = week || currentWeekStr();
  const key = weekKey(orgCode, w);
  res.json({ week: w, assessments: weeklyAssessments[key] || [] });
});

/* ── Get own weekly history ─────────────────────────────────────────────── */
app.get('/api/weekly/member', (req, res) => {
  const { orgCode, memberName, memberId } = req.query;
  if (!orgCode || (!memberName && !memberId)) return res.status(400).json({ error: 'missing fields' });
  const code = orgCode.toLowerCase().trim();
  const history = [];
  Object.keys(weeklyAssessments).forEach(key => {
    if (!key.startsWith(code + ':')) return;
    const entries = weeklyAssessments[key].filter(e =>
      (memberId && e.memberId === memberId) ||
      (!memberId && e.memberName?.toLowerCase() === memberName?.toLowerCase())
    );
    history.push(...entries);
  });
  history.sort((a, b) => b.week.localeCompare(a.week));
  res.json({ history });
});

/* ── IntelliQ synthesis of this week's inputs — requires auth ───────────── */
app.post('/api/weekly/synthesis', requireAuth, async (req, res) => {
  const { orgCode, orgName, orgMode, week } = req.body;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });

  const w    = week || currentWeekStr();
  const key  = weekKey(orgCode, w);
  const entries = weeklyAssessments[key] || [];

  if (entries.length === 0) {
    return res.json({ synthesis: null, message: 'No weekly assessments submitted yet for this week.' });
  }

  const systemPrompt = `You are IntelliQ, an intelligent performance system used by ${orgName || 'an organisation'}.

You have received the weekly assessment inputs from multiple people across the organisation. Your job is to synthesise what all of them are saying together — finding patterns, gaps, and things that need attention.

OUTPUT FORMAT — valid JSON:
{
  "headline": "The most important thing the admin/coach should know this week (1 sentence)",
  "patterns": ["Pattern 1 across multiple inputs", "Pattern 2"],
  "watchFor": ["Specific person or situation to keep an eye on"],
  "positives": ["Something going well worth acknowledging"],
  "recommendations": ["One concrete action for this week", "Optional second action"]
}

Be specific and grounded — only say what the data actually supports. Do not invent things nobody mentioned.`;

  const inputsText = entries.map(e =>
    `${e.memberName} (${e.role}):\n${Object.entries(e.data).map(([k,v]) => `  ${k}: ${v}`).join('\n')}`
  ).join('\n\n');

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 600,
      system: [systemPrompt, _domainDirective(orgCode)].filter(Boolean).join('\n\n'),
      messages: [{ role: 'user', content: `Week: ${w}\nOrg: ${orgName}\n\n${inputsText}` }],
    });
    const raw = response.content[0]?.text || '';
    const jsonStr = raw.replace(/```json\n?|\n?```/g, '').trim();
    let synthesis;
    try { synthesis = JSON.parse(jsonStr); }
    catch(e) { return res.json({ synthesis: null, raw }); }
    res.json({ synthesis, week: w, count: entries.length });
  } catch(err) {
    res.status(500).json({ error: 'AI unavailable', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   INTELLIQ ORG INTELLIGENCE v2 — "What IntelliQ Knows"
   Decision-support intelligence: multi-week trends, member profiles,
   group intelligence, semantic theme clustering, evidence-based recommendations.
   Cached per org for 1 hour. Force refresh: ?refresh=1
   ═══════════════════════════════════════════════════════════════════════════ */

const orgInsightCache = {}; // orgCode → { data, generatedAt } — in-memory only

// Return the ISO week string for N weeks in the past
function _weekStrOffset(n) {
  const d    = new Date(Date.now() - n * 7 * 24 * 60 * 60 * 1000);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const wk   = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function _avgMood(checkins) {
  const scores = checkins.filter(c => c.mood !== null && c.mood !== undefined).map(c => Number(c.mood));
  if (!scores.length) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

// ── Pattern & Prediction helpers ──────────────────────────────────────────────

function _countConsecutiveDeclines(weeklyAvgs) {
  // weeklyAvgs: array of {week, avg} sorted newest-first
  // Returns number of consecutive weekly declines from most recent
  let count = 0;
  for (let i = 0; i < weeklyAvgs.length - 1; i++) {
    if (weeklyAvgs[i].avg !== null && weeklyAvgs[i + 1].avg !== null &&
        weeklyAvgs[i].avg < weeklyAvgs[i + 1].avg - 0.1) {
      count++;
    } else break;
  }
  return count;
}

function _detectMemberPatternsFromData(name, weeklyMoodAvgs, allMemberCheckins, weeklySubCount, hasGoal, latestScores, orgTextCorpus) {
  // weeklyMoodAvgs: [{week, avg}] newest-first, up to 4 weeks
  // allMemberCheckins: check-ins last 30 days for this member
  // weeklySubCount: number of weekly reflections submitted last 30 days
  // hasGoal: boolean
  // latestScores: {ethical_reasoning, pressure_response, self_awareness, overall} or {}
  // orgTextCorpus: all recent text entries for this member
  const patterns = [];

  const validMoods = weeklyMoodAvgs.filter(w => w.avg !== null);
  const recentAvg  = validMoods.length ? validMoods[0].avg : null;
  const consecutive = _countConsecutiveDeclines(weeklyMoodAvgs);

  const thisWeekCheckins = allMemberCheckins.filter(c => c.isThisWeek).length;
  const prevWeekCheckins = allMemberCheckins.filter(c => c.isPrevWeek).length;
  const totalCheckins    = allMemberCheckins.length;

  const textSample = orgTextCorpus.join(' ').toLowerCase();
  const doubtWords = ['not sure', "don't know", 'confused', 'struggling', 'lost', 'doubt', 'unsure', 'overwhelmed', 'stuck'];
  const isolationWords = ['alone', 'nobody', 'no one', 'ignored', 'left out', 'excluded', 'disconnected'];
  const burnoutWords = ['exhausted', 'burnt out', 'burned out', 'drained', 'no energy', 'tired', 'can\'t keep up'];
  const doubtSignals = doubtWords.filter(w => textSample.includes(w)).length;
  const isolationSignals = isolationWords.filter(w => textSample.includes(w)).length;
  const burnoutSignals = burnoutWords.filter(w => textSample.includes(w)).length;

  const pressureScore = latestScores?.pressure_response || null;
  const overallScore  = latestScores?.overall || null;

  // ── Burnout Risk ──────────────────────────────────────────────────────────
  const burnoutFlags = [];
  if (recentAvg !== null && recentAvg < 2.5) burnoutFlags.push(`mood ${recentAvg}/5`);
  if (consecutive >= 3) burnoutFlags.push(`${consecutive} consecutive weekly mood declines`);
  if (burnoutSignals >= 2) burnoutFlags.push('burnout language detected in reflections');
  if (thisWeekCheckins > 0 && recentAvg !== null && recentAvg < 2.5) burnoutFlags.push('still engaging despite low mood');
  if (burnoutFlags.length >= 2) {
    patterns.push({
      type:       'BURNOUT_RISK',
      label:      'Burnout Risk',
      confidence: burnoutFlags.length >= 3 ? 'high' : 'medium',
      signals:    burnoutFlags,
    });
  }

  // ── Disengagement Risk ───────────────────────────────────────────────────
  const disengFlags = [];
  if (thisWeekCheckins === 0) disengFlags.push('no check-in this week');
  if (prevWeekCheckins === 0) disengFlags.push('no check-in previous week');
  if (weeklySubCount === 0)   disengFlags.push('no weekly reflections submitted');
  if (totalCheckins < 2)     disengFlags.push('fewer than 2 check-ins in 30 days');
  if (disengFlags.length >= 2) {
    patterns.push({
      type:       'DISENGAGEMENT_RISK',
      label:      'Disengagement Risk',
      confidence: disengFlags.length >= 3 ? 'high' : 'medium',
      signals:    disengFlags,
    });
  }

  // ── Confidence Concern ───────────────────────────────────────────────────
  const confFlags = [];
  if (doubtSignals >= 2) confFlags.push(`doubt/uncertainty language (${doubtSignals} signals)`);
  if (pressureScore !== null && pressureScore < 3) confFlags.push(`low pressure response score (${pressureScore}/5)`);
  if (overallScore !== null && overallScore < 3) confFlags.push(`below-average assessment score (${overallScore}/5)`);
  if (recentAvg !== null && recentAvg < 2.8) confFlags.push(`low mood (${recentAvg}/5)`);
  if (confFlags.length >= 2) {
    patterns.push({
      type:       'CONFIDENCE_CONCERN',
      label:      'Confidence Concern',
      confidence: confFlags.length >= 3 ? 'high' : 'medium',
      signals:    confFlags,
    });
  }

  // ── Isolation Risk ───────────────────────────────────────────────────────
  const isoFlags = [];
  if (isolationSignals >= 1) isoFlags.push('isolation language detected');
  if (totalCheckins < 2)     isoFlags.push('minimal participation');
  if (recentAvg !== null && recentAvg < 2.5) isoFlags.push(`low mood (${recentAvg}/5)`);
  if (isoFlags.length >= 2) {
    patterns.push({
      type:       'ISOLATION_RISK',
      label:      'Isolation Risk',
      confidence: isoFlags.length >= 3 ? 'high' : 'medium',
      signals:    isoFlags,
    });
  }

  // ── Goal Misalignment ────────────────────────────────────────────────────
  const goalFlags = [];
  if (hasGoal) {
    if (weeklySubCount === 0)                 goalFlags.push('has goal but no weekly reflections submitted');
    if (totalCheckins > 0 && consecutive >= 2) goalFlags.push('declining engagement alongside active goal');
    if (recentAvg !== null && recentAvg < 2.8) goalFlags.push('goal-holder showing low mood');
    if (goalFlags.length >= 2) {
      patterns.push({
        type:       'GOAL_MISALIGNMENT',
        label:      'Goal Abandonment Risk',
        confidence: goalFlags.length >= 3 ? 'high' : 'medium',
        signals:    goalFlags,
      });
    }
  }

  return patterns;
}

function _predictMemberRisksFromData(name, weeklyMoodAvgs) {
  // weeklyMoodAvgs: [{week, avg}] newest-first
  // Returns array of {type, prediction, confidence, reasons, urgency} or []
  const valid = weeklyMoodAvgs.filter(w => w.avg !== null);
  if (valid.length < 3) return [];

  // Linear slope over last 3-4 points (newest-first → reverse for regression)
  const pts = valid.slice(0, 4).reverse(); // oldest first
  const n = pts.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  pts.forEach((p, i) => { sumX += i; sumY += p.avg; sumXY += i * p.avg; sumX2 += i * i; });
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  const predictions = [];
  if (slope < -0.2) {
    // Project 2 periods forward from most recent
    const projected = valid[0].avg + slope * 2;
    const urgency   = projected < 2.0 ? 'high' : projected < 2.5 ? 'medium' : 'low';
    const conf      = valid.length >= 4 ? 'high' : 'medium';
    predictions.push({
      type:             'MOOD_DECLINE_RISK',
      label:            'Mood Decline Trajectory',
      prediction:       `If current trend continues, mood may reach ~${Math.max(1, Math.round(projected * 10) / 10).toFixed(1)}/5 within 2 weeks`,
      confidence:       conf,
      urgency,
      reasons:          [`Slope: ${slope.toFixed(2)} per week over last ${n} periods`, `Current mood: ${valid[0].avg}/5`],
    });
  }
  return predictions;
}

/* ── normalizeMemberGoals ─────────────────────────────────────────────────
   memberGoals[key] can be either:
     • Array   — set by old goal-management endpoints
     • Object  — set by POST /api/auth/complete-profile (onboarding)
   This normaliser always returns an Array so callers can safely call .filter()
   without crashing on object-format data.
──────────────────────────────────────────────────────────────────────────── */
function normalizeMemberGoals(goalData) {
  if (!goalData) return [];
  if (Array.isArray(goalData)) return goalData;
  if (typeof goalData === 'object') {
    const goals = [];
    if (goalData.goal || goalData.mainGoals) {
      goals.push({
        id: 'profile_main_goal',
        title: goalData.goal || goalData.mainGoals,
        status: 'active',
        source: 'profile',
      });
    }
    if (goalData.longTermGoals || goalData.identity) {
      goals.push({
        id: 'profile_long_term_goal',
        title: goalData.longTermGoals || goalData.identity,
        status: 'active',
        source: 'profile',
      });
    }
    if (Array.isArray(goalData.personalMetrics)) {
      goalData.personalMetrics.forEach(metric => {
        goals.push({
          id: 'metric_' + String(metric).toLowerCase().replace(/\W+/g, '_'),
          title: metric,
          status: 'active',
          source: 'personal_metric',
          type: 'metric',
        });
      });
    }
    return goals;
  }
  return [];
}

/* Resolve a member's raw goal record across every key shape it might live under:
   the stable id-key (onboarding), the legacy name-key, and — as a last resort —
   a record whose stored memberName matches (recovers goals stranded under an
   unexpected/old key, e.g. after a name change). Without this, a member who DOES
   have goals can read as "unanchored" purely from a key mismatch, and the advisor
   then treats that false absence as the finding. */
function _memberGoalsFor(code, u) {
  if (!u) return null;
  const direct = memberGoals[userKey(code, u.id)] || (u.name ? memberGoals[memberKey(code, u.name)] : null);
  if (direct) return direct;
  const nm = (u.name || '').toLowerCase().trim();
  if (nm) {
    for (const g of Object.values(memberGoals)) {
      if (g && typeof g === 'object' && !Array.isArray(g) && (g.memberName || '').toLowerCase().trim() === nm) return g;
    }
  }
  return null;
}

function _aggregateOrgData(code) {
  const users  = orgUsers[code]  || {};
  const meta   = orgMeta[code]   || {};
  const groups = orgGroups[code] || [];

  const WEEK_MS       = 7  * 24 * 60 * 60 * 1000;
  const MONTH_MS      = 30 * 24 * 60 * 60 * 1000;
  const now           = Date.now();
  const weekAgo       = now - WEEK_MS;
  const monthAgo      = now - MONTH_MS;
  const prevWeekFrom  = now - 14 * 24 * 60 * 60 * 1000; // 7–14 days ago
  const prevWeekTo    = now - WEEK_MS;

  const allMembers = Object.values(users).filter(u => u.role !== 'superadmin');

  // ── Collect ALL check-ins across last 30 days ─────────────────────────────
  const allCheckins = [];
  Object.entries(memberCheckins).forEach(([key, entries]) => {
    if (!key.startsWith(code + ':')) return;
    (entries || []).forEach(c => {
      const ts = c.ts || c.date;
      if (!ts) return;
      const time = new Date(ts).getTime();
      if (time < monthAgo) return;
      allCheckins.push({
        memberName: c.memberName || key.split(':').slice(1).join(':'),
        mood: c.mood != null ? Number(c.mood) : null,
        text: c.text || c.note || '',
        role: c.role || 'member',
        ts, time,
        isThisWeek: time > weekAgo,
        isPrevWeek: time > prevWeekFrom && time <= prevWeekTo,
      });
    });
  });

  const recentCheckins = allCheckins.filter(c => c.isThisWeek);
  const prevCheckins   = allCheckins.filter(c => c.isPrevWeek);

  // Consolidated per-member (handles both name-key and userId-key entries)
  const checkinsByMember = {};
  allCheckins.forEach(c => {
    const n = c.memberName || 'Unknown';
    if (!checkinsByMember[n]) checkinsByMember[n] = [];
    checkinsByMember[n].push(c);
  });

  const moodLast7    = _avgMood(recentCheckins);
  const moodLast30   = _avgMood(allCheckins);
  const moodPrevWeek = _avgMood(prevCheckins);
  const moodCount7   = recentCheckins.filter(c => c.mood !== null).length;

  // ── Engagement ────────────────────────────────────────────────────────────
  const activeThisWeek  = new Set(recentCheckins.map(c => c.memberName)).size;
  const activeLast30    = new Set(allCheckins.map(c => c.memberName)).size;
  const inactiveMembers = allMembers
    .filter(u => !recentCheckins.some(c => c.memberName === u.name))
    .map(u => u.name);

  // ── At-risk rule-based signals ────────────────────────────────────────────
  const atRiskComputed = [];
  Object.entries(checkinsByMember).forEach(([name, checkins]) => {
    const thisWeekMoods = checkins.filter(c => c.isThisWeek && c.mood !== null).map(c => c.mood);
    if (!thisWeekMoods.length) return;
    const avg = thisWeekMoods.reduce((a, b) => a + b, 0) / thisWeekMoods.length;
    if (avg <= 2) {
      atRiskComputed.push({ name, reason: `Low mood avg ${avg.toFixed(1)}/5 across ${thisWeekMoods.length} check-in(s)`, urgency: 'high' });
    } else if (avg < 2.8) {
      atRiskComputed.push({ name, reason: `Below-average mood (${avg.toFixed(1)}/5) this week`, urgency: 'medium' });
    } else if (thisWeekMoods.length >= 3) {
      const last    = thisWeekMoods[thisWeekMoods.length - 1];
      const prevAvg = thisWeekMoods.slice(0, -1).reduce((a, b) => a + b, 0) / (thisWeekMoods.length - 1);
      if (last < prevAvg - 1.2) {
        atRiskComputed.push({ name, reason: 'Mood dropping sharply — latest well below recent average', urgency: 'medium' });
      }
    }
  });
  inactiveMembers.forEach(name => atRiskComputed.push({ name, reason: 'No check-in this week', urgency: 'low' }));

  // ── Goals ─────────────────────────────────────────────────────────────────
  const membersWithGoals    = [];
  const membersWithoutGoals = [];
  allMembers.forEach(u => {
    const goal = memberGoals[userKey(code, u.id)] || memberGoals[memberKey(code, u.name)];
    if (goal?.goal) membersWithGoals.push({ name: u.name, userId: u.id, goal: goal.goal, identity: goal.identity || '' });
    else membersWithoutGoals.push(u.name);
  });

  // ── Weekly reflections — last 4 weeks ─────────────────────────────────────
  const last4WeekKeys    = [0, 1, 2, 3].map(n => weekKey(code, _weekStrOffset(n)));
  const allWeeklyEntries = last4WeekKeys.flatMap(k => weeklyAssessments[k] || []);
  const thisWeekEntries  = weeklyAssessments[last4WeekKeys[0]] || [];

  // ── Assessment/scenario results per member ────────────────────────────────
  const resultsByMember = {};
  allMembers.forEach(u => {
    const all = [
      ...(memberResults[memberKey(code, u.name)] || []),
      ...(memberResults[userKey(code, u.id)]     || []),
    ];
    if (all.length) resultsByMember[u.name] = all.slice(-4);
  });

  // ── Shared/anonymous notes — last 30 days ─────────────────────────────────
  const recentSharedNotes = Object.values(orgNotes).filter(
    n => n.orgCode === code && n.type !== 'private' && new Date(n.createdAt).getTime() > monthAgo
  );

  // ── Group cross-reference ─────────────────────────────────────────────────
  const groupData = groups.map(g => {
    const memberIds  = g.memberIds || [];
    const gmUsers    = allMembers.filter(u => memberIds.includes(u.id));
    const gmNames    = gmUsers.map(u => u.name);
    const gmCheckins = allCheckins.filter(c => gmNames.includes(c.memberName) && c.isThisWeek);
    return {
      id: g.id, name: g.name,
      memberCount: memberIds.length,
      memberNames: gmNames,
      avgMood: _avgMood(gmCheckins),
      activeCount: new Set(gmCheckins.map(c => c.memberName)).size,
      noteCount: Object.values(orgNotes).filter(
        n => n.orgCode === code && n.groupId === g.id && new Date(n.createdAt).getTime() > weekAgo
      ).length,
    };
  });

  // ── Text corpus for semantic theme detection ───────────────────────────────
  const textCorpus = [
    ...allCheckins.map(c => c.text),
    ...allWeeklyEntries.flatMap(e => Object.values(e.data || {})),
    ...recentSharedNotes.map(n => n.content),
  ].filter(Boolean).map(t => String(t).slice(0, 200));

  // ── Per-member pattern detection & predictions ────────────────────────────
  const memberPatterns     = {};
  const memberPredictions  = {};

  allMembers.forEach(u => {
    const mCheckins = checkinsByMember[u.name] || [];
    const rawGoals  = memberGoals[memberKey(code, u.name)] || memberGoals[userKey(code, u.id)];
    const goals     = normalizeMemberGoals(rawGoals).filter(g => g.status !== 'completed');
    const scores    = resultsByMember[u.name] || {};

    // Build per-week mood averages (last 4 weeks)
    const weeklyMoodAvgs = [0, 1, 2, 3].map(n => {
      const wStr = _weekStrOffset(n);
      const wCheckins = mCheckins.filter(c => {
        if (!c.ts && !c.date) return false;
        // crude: check if entry is approximately in that week
        const t = new Date(c.ts || c.date).getTime();
        const wStart = Date.now() - (n + 1) * 7 * 24 * 60 * 60 * 1000;
        const wEnd   = Date.now() - n * 7 * 24 * 60 * 60 * 1000;
        return t >= wStart && t < wEnd;
      });
      return { week: wStr, avg: _avgMood(wCheckins) };
    });

    // Weekly reflection count
    const memberName = u.name;
    const memberId   = u.id;
    const weeklySubCount = Object.values(weeklyAssessments).reduce((sum, entries) => {
      return sum + (entries || []).filter(e =>
        (e.memberName === memberName || e.memberId === memberId) &&
        new Date(e.submittedAt || 0).getTime() > monthAgo
      ).length;
    }, 0);

    // Member text corpus
    const memberText = mCheckins.map(c => c.text).filter(Boolean);

    memberPatterns[u.name]    = _detectMemberPatternsFromData(
      u.name, weeklyMoodAvgs, mCheckins, weeklySubCount, goals.length > 0, scores, memberText
    );
    memberPredictions[u.name] = _predictMemberRisksFromData(u.name, weeklyMoodAvgs);
  });

  return {
    meta, allMembers, memberCount: allMembers.length,
    allCheckins, recentCheckins, checkinsByMember,
    moodLast7, moodLast30, moodPrevWeek, moodCount7,
    activeThisWeek, activeLast30, inactiveMembers,
    atRiskComputed,
    membersWithGoals, membersWithoutGoals,
    allWeeklyEntries, thisWeekEntries,
    resultsByMember,
    recentSharedNotes,
    groupData, textCorpus,
    memberPatterns, memberPredictions,
    thisWeek: _weekStrOffset(0),
  };
}

function _buildInsightPrompt(agg, orgCode) {
  const lines = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`ORG: ${agg.meta.orgName || orgCode} (${agg.meta.orgMode || 'general'})`);
  lines.push(`WEEK: ${agg.thisWeek} | Members: ${agg.memberCount}`);
  lines.push(`ENGAGEMENT: ${agg.activeThisWeek}/${agg.memberCount} active this week, ${agg.activeLast30}/${agg.memberCount} active last 30 days`);

  const trendDir = agg.moodLast7 !== null && agg.moodPrevWeek !== null
    ? (agg.moodLast7 > agg.moodPrevWeek + 0.3 ? 'up ↑' : agg.moodLast7 < agg.moodPrevWeek - 0.3 ? 'down ↓' : 'stable →')
    : '—';
  lines.push(`MOOD: This week avg ${agg.moodLast7 ?? '—'}/5 (${agg.moodCount7} responses) | Prev week ${agg.moodPrevWeek ?? '—'}/5 | Last 30d avg ${agg.moodLast30 ?? '—'}/5 | vs last week: ${trendDir}`);
  if (agg.inactiveMembers.length) lines.push(`NO CHECK-IN THIS WEEK: ${agg.inactiveMembers.join(', ')}`);
  lines.push('');

  // ── Per-member cross-referenced profiles ──────────────────────────────────
  lines.push('MEMBER PROFILES (goals + check-ins + weekly reflections + assessments):');
  agg.allMembers.forEach(u => {
    const thisWeekC  = (agg.checkinsByMember[u.name] || []).filter(c => c.isThisWeek);
    const allC       = agg.checkinsByMember[u.name]  || [];
    const moods7     = thisWeekC.filter(c => c.mood !== null).map(c => c.mood);
    const avgM       = moods7.length ? (moods7.reduce((a, b) => a + b, 0) / moods7.length).toFixed(1) : null;
    const text7      = thisWeekC.map(c => c.text).filter(Boolean).slice(0, 3).join(' / ').slice(0, 280);
    const text30     = allC.filter(c => !c.isThisWeek).map(c => c.text).filter(Boolean).slice(-4).join(' / ').slice(0, 280);
    const goalObj    = agg.membersWithGoals.find(g => g.name === u.name);
    const weeklies   = agg.allWeeklyEntries.filter(e => e.memberName === u.name || (e.memberId && e.memberId === u.id)).slice(-2);
    const weeklyText = weeklies.map(e => Object.values(e.data || {}).filter(Boolean).join(' | ').slice(0, 250)).join(' // ');
    const results    = agg.resultsByMember[u.name] || [];
    const scoreLines = results.map(r => r.score
      ? `overall:${r.score.overall ?? '?'} ethical:${r.score.ethical_reasoning ?? '?'} pressure:${r.score.pressure_response ?? '?'} self-awareness:${r.score.self_awareness ?? '?'}`
      : null).filter(Boolean).slice(-2).join(' | ');

    lines.push(`\n[${u.name}] role:${u.role}`);
    lines.push(`  Goal: ${goalObj ? `"${goalObj.goal.slice(0, 130)}"` : 'not set'}${goalObj?.identity ? ` | Identity: "${goalObj.identity.slice(0, 80)}"` : ''}`);
    lines.push(`  Mood this week: ${avgM !== null ? `${avgM}/5 (${moods7.length} check-ins)` : 'no check-in'}`);
    if (text7)   lines.push(`  Check-in text (this week): "${text7}"`);
    if (text30)  lines.push(`  Check-in text (prev weeks): "${text30}"`);
    if (weeklyText) lines.push(`  Weekly reflections: "${weeklyText}"`);
    if (scoreLines) lines.push(`  Assessment scores: ${scoreLines}`);
  });
  lines.push('');

  // ── Groups ────────────────────────────────────────────────────────────────
  if (agg.groupData.length > 0) {
    lines.push('GROUPS:');
    agg.groupData.forEach(g => {
      const mStr = g.avgMood !== null ? `avg mood ${g.avgMood}/5` : 'no mood data';
      lines.push(`${g.name}: members [${g.memberNames.join(', ')}] — ${g.activeCount}/${g.memberCount} active, ${mStr}`);
    });
    lines.push('');
  }

  // ── Text corpus for semantic clustering ───────────────────────────────────
  const corpus = agg.textCorpus.filter(Boolean).slice(0, 35);
  if (corpus.length > 0) {
    lines.push('ALL MEMBER TEXT (check-ins + reflections + notes — use for semantic theme clustering):');
    corpus.forEach((t, i) => lines.push(`${i + 1}. "${t}"`));
    lines.push('');
  }

  // ── Detected risk patterns (rule-based, pre-computed) ────────────────────
  const allPatternNames = Object.entries(agg.memberPatterns || {})
    .flatMap(([name, pats]) => pats.map(p => `${name}: ${p.label} (${p.confidence} confidence — ${p.signals.join('; ')})`));
  const allPredictions = Object.entries(agg.memberPredictions || {})
    .flatMap(([name, preds]) => preds.map(p => `${name}: ${p.label} — ${p.prediction}`));

  if (allPatternNames.length > 0) {
    lines.push('DETECTED RISK PATTERNS (algorithm-detected, include in recommendations):');
    allPatternNames.forEach(s => lines.push(`  • ${s}`));
    lines.push('');
  }
  if (allPredictions.length > 0) {
    lines.push('TRAJECTORY PREDICTIONS (linear trend extrapolation):');
    allPredictions.forEach(s => lines.push(`  • ${s}`));
    lines.push('');
  }

  return lines.join('\n');
}

app.get('/api/intelliq/org-insights', requireAuth, async (req, res) => {
  const { refresh } = req.query;
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics

  const CACHE_TTL    = 60 * 60 * 1000;
  const cached       = orgInsightCache[code];
  const forceRefresh = refresh === '1';
  if (cached && !forceRefresh && (Date.now() - cached.generatedAt < CACHE_TTL)) {
    return res.json({ ...cached.data, cached: true });
  }

  let agg;
  try {
    agg = _aggregateOrgData(code);
  } catch(e) {
    console.error('[org-insights] _aggregateOrgData failed:', e.message, e.stack);
    return res.status(500).json({ error: 'Intelligence data unavailable — internal error. Please try again.' });
  }
  const stats = {
    memberCount:       agg.memberCount,
    activeThisWeek:    agg.activeThisWeek,
    activeLast30:      agg.activeLast30,
    avgMoodLast7:      agg.moodLast7,
    avgMoodLast30:     agg.moodLast30,
    avgMoodPrevWeek:   agg.moodPrevWeek,
    moodCount:         agg.moodCount7,
    goalsSet:          agg.membersWithGoals.length,
    weeklySubmissions: agg.thisWeekEntries.length,
    inactiveMembers:   agg.inactiveMembers,
    atRiskComputed:    agg.atRiskComputed,
    week:              agg.thisWeek,
  };

  const hasAnyData = agg.allCheckins.length > 0
    || agg.allWeeklyEntries.length > 0
    || agg.membersWithGoals.length > 0;

  if (!hasAnyData || agg.memberCount === 0) {
    const result = {
      generatedAt: new Date().toISOString(), cached: false, stats, domain: _domainStamp(code),
      ai: _noDataFallback(agg),
    };
    orgInsightCache[code] = { data: result, generatedAt: Date.now() };
    return res.json(result);
  }

  // ── Claude synthesis with v2 structured output ────────────────────────────
  const SYSTEM = `You are IntelliQ, a decision-support intelligence system. You receive structured data about an organisation — member goals, check-ins, weekly reflections, assessment scores, groups. Your job is NOT to describe the data, but to synthesise it into intelligence: what does it mean, what patterns exist, and what should the leader do?

OUTPUT FORMAT — valid JSON only, absolutely no markdown or extra text outside the JSON object:
{
  "summary": "2-3 sentences. What does the leader need to know TODAY? Name specific people and specific patterns. Never be generic.",
  "moodTrend": "improving|stable|declining|unknown",
  "moodNote": "One sentence comparing this week's mood to the previous week and 30-day trend.",
  "notEnoughData": false,

  "trends": {
    "trendDirection": "improving|stable|declining",
    "trendReason": "One sentence — reference the actual numbers and which members are driving the change.",
    "confidenceLevel": "high|medium|low",
    "engagementTrend": "improving|stable|declining",
    "moodComparison": "One sentence comparing this week to prev week and 30-day avg with specific numbers."
  },

  "semanticThemes": [
    {
      "theme": "Cluster label — e.g. Fatigue / Burnout, Confidence Concerns, Leadership Tension, Transition Stress",
      "signals": ["exact word or short phrase from the actual text"],
      "affectedMembers": ["name — only if clearly identifiable"],
      "severity": "high|medium|low"
    }
  ],

  "memberProfiles": [
    {
      "name": "exact member name from data",
      "currentState": "One sentence — where is this person right now, specifically?",
      "strengths": ["one specific observable strength grounded in their data"],
      "concerns": ["one specific concern with data evidence"],
      "goalAlignment": "on_track|mixed|off_track|no_goal",
      "goalAlignmentExplanation": "One sentence — does their behavior match their goal? Reference the goal and the check-in/assessment evidence.",
      "riskSignals": ["specific signal — e.g. 'mood avg 1.8/5', 'pressure_response score 42'"],
      "recommendedAction": "One concrete action for the leader, with their name."
    }
  ],

  "groupInsights": [
    {
      "groupName": "exact group name",
      "mood": "high|okay|low|unknown",
      "engagement": "high|medium|low",
      "recurringThemes": ["theme"],
      "riskSignals": ["specific signal"],
      "positiveSignals": ["specific signal"],
      "membersNeedingAttention": ["name"],
      "suggestedAction": "One concrete group-level action."
    }
  ],

  "recommendations": [
    {
      "action": "Specific action — who, what, when.",
      "urgency": "high|medium|low",
      "owner": "leader|admin|member",
      "reason": "Why — reference actual data from the brief.",
      "evidence": ["checkins", "weeklyAssessments", "goals", "assessmentScores", "notes"],
      "confidence": "high|medium|low",
      "predictedOutcome": "One sentence: what likely improves if this action is taken?",
      "riskIfIgnored": "One sentence: what likely happens if this is not acted on?"
    }
  ],

  "memberHighlights": [
    { "name": "...", "note": "Specific positive observation with data support." }
  ],

  "goalProgress": "One sentence summarising goal-setting and whether people's actions align with their goals.",

  "atRisk": [
    { "name": "...", "reason": "Specific reason with data.", "urgency": "high|medium|low" }
  ],

  "themes": ["short label 1", "short label 2", "short label 3"],

  "groupHighlights": [],

  "recommendedActions": [
    { "priority": "high|medium|low", "action": "..." }
  ]
}

CRITICAL RULES:
- Synthesise, don't describe. "Timmy is struggling with leadership confidence" is synthesis. "Timmy checked in 3 times" is description.
- Every recommendation must name the person and reference specific data.
- semanticThemes: cluster conceptually similar text even if words differ (overwhelmed/drained/burned out → Fatigue). Max 4.
- memberProfiles: include ALL members — even those with no data (state "No activity this week — unknown").
- goalAlignment: "off_track" if check-ins or assessments contradict the stated goal direction. "on_track" if they support it. "mixed" if partial.
- recommendations: max 4, highest urgency first. Each must have evidence[] listing the data sources that support it. Each must include confidence, predictedOutcome, riskIfIgnored.
- atRisk max 3, memberHighlights max 2.
- groupInsights: only include groups that have members with data. Skip empty groups.
- confidenceLevel: "high" if 4+ data points, "medium" if 2-3, "low" if 0-1.
- If DETECTED RISK PATTERNS are listed in the brief, use them to inform your recommendations and atRisk entries. Do not ignore them.
- riskPatterns in each recommendation: reference the pattern label (e.g. "Burnout Risk") if that pattern was the driver.`;

  let ai = null;
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2400,
      system:     [SYSTEM, _domainDirective(code)].filter(Boolean).join('\n\n'),
      messages:   [{ role: 'user', content: _buildInsightPrompt(agg, code) }],
    });
    const raw = (response.content[0]?.text || '').replace(/```json\n?|\n?```/g, '').trim();
    ai = JSON.parse(raw);
  } catch(err) {
    console.warn('Org insights v2 — AI fallback:', err.message);
  }

  if (!ai) ai = _buildFallbackInsight(agg);

  // Flatten patterns for the frontend — include in response so the UI can render them without a second call
  const flatPatterns = Object.entries(agg.memberPatterns || {})
    .flatMap(([name, pats]) => pats.map(p => ({ member: name, ...p })));
  const flatPredictions = Object.entries(agg.memberPredictions || {})
    .flatMap(([name, preds]) => preds.map(p => ({ member: name, ...p })));

  const result = { generatedAt: new Date().toISOString(), cached: false, stats, domain: _domainStamp(code), ai, patterns: flatPatterns, predictions: flatPredictions };
  orgInsightCache[code] = { data: result, generatedAt: Date.now() };
  res.json(result);
});

/* ═══════════════════════════════════════════════════════════════════════════
   INTELLIQ MEMORY — Timelines + Intervention Tracking + Outcome Analysis
   Timelines: computed on demand from existing stores, cached 30 min.
   Interventions: persisted in orgInterventions store.
   ═══════════════════════════════════════════════════════════════════════════ */

const memberTimelineCache = {}; // `orgCode:userId`  → { data, ts }
const groupTimelineCache  = {}; // `orgCode:groupId` → { data, ts }
const orgTimelineCache    = {}; // orgCode            → { data, ts }
const TIMELINE_TTL        = 30 * 60 * 1000; // 30 minutes

function _intvId() { return 'intv_' + Math.random().toString(36).slice(2, 10); }

// Categorise an intervention action by keyword for learning stats
function _categorizeAction(action) {
  const a = action || '';
  if (/private|1-on-1|one.on.one|conversation|speak with|talk to/i.test(a)) return 'Private conversation';
  if (/group|session|workshop|team meeting/i.test(a))                        return 'Group session';
  if (/goal|objective|check on progress/i.test(a))                           return 'Goal review';
  if (/nudge|remind|encourage|prompt|check.in/i.test(a))                     return 'Engagement nudge';
  if (/assessment|scenario|assign/i.test(a))                                 return 'Assessment assigned';
  return 'Other';
}

// Measure outcome of a completed intervention (mood delta pre/post)
function _measureInterventionOutcome(code, intv) {
  const { targetMember, targetMemberId, createdAt, completedAt } = intv;
  if (!completedAt) return null;

  const completedTs = new Date(completedAt).getTime();
  const createdTs   = new Date(createdAt).getTime();
  const MIN_WAIT    = 7 * 24 * 60 * 60 * 1000;

  if (Date.now() < completedTs + MIN_WAIT) {
    return {
      status:     'pending',
      note:       'Needs 7+ days of post-intervention check-ins.',
      checkAfter: new Date(completedTs + MIN_WAIT).toISOString(),
    };
  }

  const keys = [
    targetMember   ? memberKey(code, targetMember)   : null,
    targetMemberId ? userKey(code, targetMemberId)   : null,
  ].filter(Boolean);

  const allC = [];
  keys.forEach(k => (memberCheckins[k] || []).forEach(c => {
    const ts = c.ts || c.date;
    if (ts) allC.push({ mood: c.mood != null ? Number(c.mood) : null, time: new Date(ts).getTime() });
  }));

  const PRE = 21 * 24 * 60 * 60 * 1000;
  const beforeC = allC.filter(c => c.time >= createdTs - PRE && c.time < createdTs);
  const afterC  = allC.filter(c => c.time >= completedTs     && c.time <= completedTs + PRE);

  const beforeMoods = beforeC.filter(c => c.mood !== null).map(c => c.mood);
  const afterMoods  = afterC.filter(c => c.mood !== null).map(c => c.mood);

  if (!beforeMoods.length || !afterMoods.length) {
    return { status: 'insufficient_data', note: 'Not enough check-ins to measure impact.' };
  }

  const beforeAvg = beforeMoods.reduce((a, b) => a + b, 0) / beforeMoods.length;
  const afterAvg  = afterMoods.reduce((a, b)  => a + b, 0) / afterMoods.length;
  const moodDelta = afterAvg - beforeAvg;

  // ── Engagement delta (check-in frequency) ─────────────────────────────────
  const PRE_DAYS  = PRE / (24 * 60 * 60 * 1000);
  const beforeRate = beforeC.length / PRE_DAYS * 7; // per week
  const afterRate  = afterC.length  / PRE_DAYS * 7;
  const engDelta   = afterRate - beforeRate;

  // ── Weekly participation delta ─────────────────────────────────────────────
  const countWeekliesInWindow = (from, to) => {
    const name = targetMember || '';
    const id   = targetMemberId || '';
    return Object.values(weeklyAssessments).reduce((sum, entries) => {
      return sum + (entries || []).filter(e =>
        (e.memberName === name || e.memberId === id) &&
        new Date(e.submittedAt || 0).getTime() >= from &&
        new Date(e.submittedAt || 0).getTime() < to
      ).length;
    }, 0);
  };
  const weeklyBefore = countWeekliesInWindow(createdTs - PRE, createdTs);
  const weeklyAfter  = countWeekliesInWindow(completedTs, completedTs + PRE);
  const weeklyDelta  = weeklyAfter - weeklyBefore;

  // ── changesDetected ────────────────────────────────────────────────────────
  const changesDetected = [
    {
      dimension: 'mood',
      before:    Math.round(beforeAvg * 10) / 10,
      after:     Math.round(afterAvg  * 10) / 10,
      delta:     Math.round(moodDelta * 10) / 10,
      direction: moodDelta > 0.3 ? 'improved' : moodDelta < -0.3 ? 'declined' : 'unchanged',
    },
    {
      dimension: 'engagement',
      before:    Math.round(beforeRate * 10) / 10,
      after:     Math.round(afterRate  * 10) / 10,
      delta:     Math.round(engDelta   * 10) / 10,
      direction: engDelta > 0.3 ? 'improved' : engDelta < -0.3 ? 'declined' : 'unchanged',
    },
  ];
  if (weeklyBefore > 0 || weeklyAfter > 0) {
    changesDetected.push({
      dimension: 'weekly_participation',
      before:    weeklyBefore,
      after:     weeklyAfter,
      delta:     weeklyDelta,
      direction: weeklyDelta > 0 ? 'improved' : weeklyDelta < 0 ? 'declined' : 'unchanged',
    });
  }

  // ── Confidence level ───────────────────────────────────────────────────────
  const totalPoints = beforeMoods.length + afterMoods.length;
  const confidence  = totalPoints >= 8 ? 'high' : totalPoints >= 4 ? 'medium' : 'low';

  // ── Likely drivers (rule-based inference) ─────────────────────────────────
  const likelyDrivers = [];
  const moodUp   = moodDelta  >  0.3;
  const moodDown = moodDelta  < -0.3;
  const engUp    = engDelta   >  0.2;
  const engDown  = engDelta   < -0.2;
  if (moodUp   && engUp)   likelyDrivers.push('Both mood and engagement improved — intervention appears to have addressed core needs');
  if (moodUp   && !engUp)  likelyDrivers.push('Mood improved without significant engagement change — emotional impact without behavior change');
  if (!moodUp  && engUp)   likelyDrivers.push('Engagement increased but mood unchanged — member re-engaged but underlying concerns may persist');
  if (moodDown && engDown) likelyDrivers.push('Both mood and engagement declined — intervention may not have addressed root cause');
  if (weeklyDelta > 0)     likelyDrivers.push('Weekly reflection participation increased — stronger accountability loop forming');

  // ── Overall outcome ────────────────────────────────────────────────────────
  const positiveSignals  = changesDetected.filter(c => c.direction === 'improved').length;
  const negativeSignals  = changesDetected.filter(c => c.direction === 'declined').length;
  const overallOutcome   = positiveSignals > negativeSignals ? 'positive'
                         : negativeSignals > positiveSignals ? 'negative' : 'neutral';

  return {
    status:          'measured',
    moodBefore:      Math.round(beforeAvg  * 10) / 10,
    moodAfter:       Math.round(afterAvg   * 10) / 10,
    moodDelta:       Math.round(moodDelta  * 10) / 10,
    dataPoints:      { before: beforeMoods.length, after: afterMoods.length },
    outcome:         overallOutcome,
    confidence,
    changesDetected,
    likelyDrivers,
    outcomeSummary:  likelyDrivers[0] || (moodDelta > 0.5 ? `Mood improved ${moodDelta.toFixed(1)} points.` : 'No significant change detected.'),
    note:            moodDelta >  0.5 ? `Mood improved ${moodDelta.toFixed(1)} points.`
                   : moodDelta < -0.5 ? `Mood declined ${moodDelta.toFixed(1)} points.`
                   : 'No significant mood change detected.',
  };
}

// ── Build member timeline from existing data stores ───────────────────────────
async function _buildMemberTimeline(code, userId, memberName) {
  const events = [];

  // Goal events
  const goal = memberGoals[userKey(code, userId)] || memberGoals[memberKey(code, memberName)];
  if (goal?.setAt) events.push({ type: 'goal_set', ts: goal.setAt, data: { goal: goal.goal, identity: goal.identity || '' } });

  // Check-ins
  const checkinKeys = [userKey(code, userId), memberKey(code, memberName)];
  const seenCheckins = new Set();
  checkinKeys.forEach(k => (memberCheckins[k] || []).forEach(c => {
    const ts = c.ts || c.date;
    if (!ts || seenCheckins.has(ts)) return;
    seenCheckins.add(ts);
    events.push({ type: 'checkin', ts, data: { mood: c.mood != null ? Number(c.mood) : null, text: (c.text || c.note || '').slice(0, 120) } });
  }));

  // Weekly reflections (all weeks)
  Object.entries(weeklyAssessments).forEach(([key, entries]) => {
    if (!key.startsWith(code + ':')) return;
    (entries || []).forEach(e => {
      if (e.memberName !== memberName && e.memberId !== userId) return;
      const ts = e.submittedAt;
      if (!ts) return;
      events.push({ type: 'weekly_reflection', ts, data: { role: e.role || 'member', text: Object.values(e.data || {}).filter(Boolean).join(' | ').slice(0, 180) } });
    });
  });

  // Assessment results
  const seenResults = new Set();
  checkinKeys.forEach(k => (memberResults[k] || []).forEach(r => {
    const ts = r.submittedAt;
    if (!ts || seenResults.has(ts)) return;
    seenResults.add(ts);
    const score = r.score;
    events.push({ type: 'assessment', ts, data: { overall: score?.overall, summary: score?.summary?.slice(0, 120) || '', strengths: score?.strengths || [], development: score?.development || [] } });
  }));

  // Notes authored by this member (their own notes)
  Object.values(orgNotes).filter(n => n.orgCode === code && n.authorId === userId).forEach(n => {
    events.push({ type: 'note', ts: n.createdAt, data: { noteType: n.type, tag: n.tag, content: n.content.slice(0, 100) } });
  });

  // Intervention completions targeting this member
  (orgInterventions[code] || [])
    .filter(i => (i.targetMember === memberName || i.targetMemberId === userId) && i.completedAt)
    .forEach(i => {
      events.push({ type: 'intervention_completed', ts: i.completedAt, data: { action: i.action, outcome: i.outcome?.outcome, delta: i.outcome?.moodDelta } });
    });

  // Sort chronologically
  events.sort((a, b) => new Date(a.ts) - new Date(b.ts));

  // Group by month
  const byMonth = {};
  events.forEach(e => {
    const month = (e.ts || '').slice(0, 7);
    if (!month) return;
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(e);
  });

  // Add computed mood change events between adjacent months
  const months = Object.keys(byMonth).sort();
  let prevMoodAvg = null;
  months.forEach(month => {
    const cis = byMonth[month].filter(e => e.type === 'checkin' && e.data.mood !== null);
    if (!cis.length) return;
    const avg = cis.reduce((s, e) => s + e.data.mood, 0) / cis.length;
    if (prevMoodAvg !== null) {
      const delta = avg - prevMoodAvg;
      if (delta >  0.8) byMonth[month].unshift({ type: 'mood_improving', ts: month + '-01T00:00:00Z', data: { from: prevMoodAvg.toFixed(1), to: avg.toFixed(1), delta: delta.toFixed(1) } });
      if (delta < -0.8) byMonth[month].unshift({ type: 'mood_declining', ts: month + '-01T00:00:00Z', data: { from: prevMoodAvg.toFixed(1), to: avg.toFixed(1), delta: delta.toFixed(1) } });
    }
    prevMoodAvg = avg;
  });

  // Generate 1-sentence AI narrative for months with 3+ events
  const monthData = await Promise.all(months.map(async month => {
    const evs = byMonth[month] || [];
    const label = new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const checkins = evs.filter(e => e.type === 'checkin');
    const moodAvg  = checkins.filter(e => e.data.mood !== null).length > 0
      ? (checkins.filter(e => e.data.mood !== null).reduce((s, e) => s + e.data.mood, 0) / checkins.filter(e => e.data.mood !== null).length).toFixed(1)
      : null;

    let narrative = null;
    if (evs.length >= 2) {
      const brief = evs.slice(0, 6).map(e => {
        if (e.type === 'goal_set')              return `Goal set: "${e.data.goal}"`;
        if (e.type === 'checkin' && e.data.text) return `Check-in: "${e.data.text}"`;
        if (e.type === 'weekly_reflection')      return `Weekly: "${e.data.text}"`;
        if (e.type === 'assessment')             return `Assessment score: ${e.data.overall ?? '?'}/100`;
        if (e.type === 'mood_improving')         return `Mood improved: ${e.data.from}→${e.data.to}`;
        if (e.type === 'mood_declining')         return `Mood declined: ${e.data.from}→${e.data.to}`;
        if (e.type === 'intervention_completed') return `Intervention: ${e.data.action}`;
        return null;
      }).filter(Boolean).join(' | ');
      try {
        const r = await client.messages.create({
          model: 'claude-haiku-4-5-20251001', max_tokens: 80,
          system: [`Write ONE sentence (max 20 words) summarising what this data shows about a member during this month. Past tense. Specific. No fluff.`, _domainDirective(code, { userId })].filter(Boolean).join('\n\n'),
          messages: [{ role: 'user', content: `${memberName} — ${label}: ${brief}` }],
        });
        narrative = r.content[0]?.text?.trim() || null;
      } catch(e) { /* non-critical */ }
    }

    return { month, label, eventCount: evs.length, moodAvg, events: evs, narrative };
  }));

  return { member: memberName, userId, timeline: monthData.filter(m => m.eventCount > 0) };
}

// ── Build group timeline ────────────────────────────────────────────────────────
function _buildGroupTimeline(code, group) {
  const memberIds   = group.memberIds || [];
  const users       = orgUsers[code]   || {};
  const gmUsers     = Object.values(users).filter(u => memberIds.includes(u.id));

  // Collect all check-ins for group members, grouped by month
  const monthlyMood = {}; // month → [mood scores]
  const monthlyText = {}; // month → [text snippets]

  gmUsers.forEach(u => {
    const keys = [userKey(code, u.id), memberKey(code, u.name)];
    keys.forEach(k => (memberCheckins[k] || []).forEach(c => {
      const ts = c.ts || c.date;
      if (!ts) return;
      const month = ts.slice(0, 7);
      if (c.mood != null) {
        if (!monthlyMood[month]) monthlyMood[month] = [];
        monthlyMood[month].push(Number(c.mood));
      }
      if (c.text || c.note) {
        if (!monthlyText[month]) monthlyText[month] = [];
        monthlyText[month].push((c.text || c.note || '').slice(0, 80));
      }
    }));

    // Weekly reflections
    Object.entries(weeklyAssessments).forEach(([key, entries]) => {
      if (!key.startsWith(code + ':')) return;
      entries.filter(e => e.memberName === u.name || e.memberId === u.id).forEach(e => {
        const month = (e.submittedAt || '').slice(0, 7);
        if (!month) return;
        const text = Object.values(e.data || {}).filter(Boolean).join(' | ').slice(0, 100);
        if (text) { if (!monthlyText[month]) monthlyText[month] = []; monthlyText[month].push(text); }
      });
    });
  });

  const months = [...new Set([...Object.keys(monthlyMood), ...Object.keys(monthlyText)])].sort();
  const timeline = months.map(month => {
    const moods = monthlyMood[month] || [];
    const avgMood = moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null;
    const texts   = (monthlyText[month] || []).slice(0, 4);
    return {
      month,
      label:        new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      avgMood,
      checkInCount: moods.length,
      textSamples:  texts,
    };
  });

  return { groupId: group.id, groupName: group.name, memberCount: gmUsers.length, timeline };
}

// ── Build org timeline ────────────────────────────────────────────────────────
function _buildOrgTimeline(code) {
  const users  = orgUsers[code]  || {};
  const allMembers = Object.values(users).filter(u => u.role !== 'superadmin');

  const monthlyMood = {};
  const monthlyActive = {};
  const monthlyText = {};

  allMembers.forEach(u => {
    const keys = [userKey(code, u.id), memberKey(code, u.name)];
    keys.forEach(k => (memberCheckins[k] || []).forEach(c => {
      const ts = c.ts || c.date;
      if (!ts) return;
      const month = ts.slice(0, 7);
      if (c.mood != null) {
        if (!monthlyMood[month])   monthlyMood[month]   = [];
        if (!monthlyActive[month]) monthlyActive[month] = new Set();
        monthlyMood[month].push(Number(c.mood));
        monthlyActive[month].add(u.name);
      }
      if (c.text || c.note) {
        if (!monthlyText[month]) monthlyText[month] = [];
        monthlyText[month].push((c.text || c.note || '').slice(0, 80));
      }
    }));
  });

  const months = [...new Set([...Object.keys(monthlyMood), ...Object.keys(monthlyText)])].sort();
  const timeline = months.map(month => {
    const moods     = monthlyMood[month] || [];
    const avgMood   = moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null;
    const active    = monthlyActive[month]?.size || 0;
    const texts     = (monthlyText[month] || []).slice(0, 5);
    return {
      month,
      label:         new Date(month + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      avgMood,
      activeMembers: active,
      totalMembers:  allMembers.length,
      textSamples:   texts,
    };
  });

  return { orgCode: code, orgName: orgMeta[code]?.orgName || code, memberCount: allMembers.length, timeline };
}

/* ── GET member timeline ───────────────────────────────────────────────── */
app.get('/api/intelliq/member-timeline', requireAuth, async (req, res) => {
  const { memberId, memberName, refresh } = req.query;
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics

  // SCOPE: the target member must be within the requester's visible subtree.
  // A leader can only pull the timeline of someone they actually lead.
  const targetId = memberId || _resolveUserIdByName(code, memberName || '');
  if (!targetId || !getVisibleUserIds(code, g.userId).includes(targetId)) {
    return res.status(403).json({ error: 'Member not in your scope' });
  }

  const cacheKey = `${code}:${memberId || memberName || ''}`;
  const cached  = memberTimelineCache[cacheKey];

  if (cached && refresh !== '1' && (Date.now() - cached.ts < TIMELINE_TTL)) {
    return res.json({ ...cached.data, cached: true });
  }

  // Resolve member name from userId if only id provided
  let resolvedName = memberName || '';
  if (memberId && !resolvedName) {
    const u = (orgUsers[code] || {})[memberId];
    resolvedName = u?.name || memberId;
  }

  try {
    const data = await _buildMemberTimeline(code, memberId || '', resolvedName);
    memberTimelineCache[cacheKey] = { data, ts: Date.now() };
    res.json(data);
  } catch(err) {
    res.status(500).json({ error: 'Timeline generation failed', detail: err.message });
  }
});

/* ── GET group timeline ────────────────────────────────────────────────── */
app.get('/api/intelliq/group-timeline', requireAuth, (req, res) => {
  const { groupId, refresh } = req.query;
  if (!groupId) return res.status(400).json({ error: 'groupId required' });
  const g = _requireInsight(req, res); if (!g) return;
  const code  = g.code;  // session org — never trust a query orgCode for analytics
  const cacheKey = `${code}:${groupId}`;
  const cached = groupTimelineCache[cacheKey];

  if (cached && refresh !== '1' && (Date.now() - cached.ts < TIMELINE_TTL)) {
    return res.json({ ...cached.data, cached: true });
  }

  const group = (orgGroups[code] || []).find(g => g.id === groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const data = _buildGroupTimeline(code, group);
  groupTimelineCache[cacheKey] = { data, ts: Date.now() };
  res.json(data);
});

/* ── GET org timeline ──────────────────────────────────────────────────── */
app.get('/api/intelliq/org-timeline', requireAuth, (req, res) => {
  const { orgCode, refresh } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code   = orgCode.toLowerCase().trim();
  const cached = orgTimelineCache[code];

  if (cached && refresh !== '1' && (Date.now() - cached.ts < TIMELINE_TTL)) {
    return res.json({ ...cached.data, cached: true });
  }

  const data = _buildOrgTimeline(code);
  orgTimelineCache[code] = { data, ts: Date.now() };
  res.json(data);
});

/* ── POST create intervention ──────────────────────────────────────────── */
app.post('/api/intelliq/intervention', requireAuth, (req, res) => {
  const { orgCode, targetMember, targetMemberId, targetGroup, action, urgency, owner, reason, evidence } = req.body;
  if (!orgCode || !action) return res.status(400).json({ error: 'orgCode and action required' });
  const code = orgCode.toLowerCase().trim();

  if (!orgInterventions[code]) orgInterventions[code] = [];
  const intv = {
    id:             _intvId(),
    createdAt:      new Date().toISOString(),
    targetMember:   targetMember   || null,
    targetMemberId: targetMemberId || null,
    targetGroup:    targetGroup    || null,
    action,
    urgency:        urgency  || 'medium',
    owner:          owner    || 'coach',
    reason:         reason   || '',
    evidence:       evidence || [],
    status:         'suggested',
    acknowledgedAt: null,
    completedAt:    null,
    dismissedAt:    null,
    outcome:        null,
  };
  orgInterventions[code].push(intv);
  scheduleSave();
  res.json({ ok: true, intervention: intv });
});

/* ── PATCH update intervention status ──────────────────────────────────── */
app.patch('/api/intelliq/intervention/:id', requireAuth, (req, res) => {
  const { orgCode, status, outcomeNote } = req.body;
  if (!orgCode || !status) return res.status(400).json({ error: 'orgCode and status required' });
  const code        = orgCode.toLowerCase().trim();
  const interventions = orgInterventions[code] || [];
  const intv        = interventions.find(i => i.id === req.params.id);
  if (!intv) return res.status(404).json({ error: 'Intervention not found' });

  const VALID = ['suggested', 'acknowledged', 'completed', 'dismissed'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  intv.status = status;
  if (status === 'acknowledged' && !intv.acknowledgedAt) intv.acknowledgedAt = new Date().toISOString();
  if (status === 'completed'    && !intv.completedAt)    {
    intv.completedAt = new Date().toISOString();
    intv.outcome     = _measureInterventionOutcome(code, intv);
  }
  if (status === 'dismissed'    && !intv.dismissedAt)    intv.dismissedAt = new Date().toISOString();
  if (outcomeNote) intv.outcomeNote = outcomeNote;

  scheduleSave();
  res.json({ ok: true, intervention: intv });
});

/* ── GET interventions for org ─────────────────────────────────────────── */
app.get('/api/intelliq/interventions', requireAuth, (req, res) => {
  const { orgCode, status } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code = orgCode.toLowerCase().trim();
  let all = orgInterventions[code] || [];
  if (status) all = all.filter(i => i.status === status);
  // Return most recent first
  res.json({ interventions: [...all].reverse() });
});

/* ── GET intervention analysis + learning stats ─────────────────────────── */
app.get('/api/intelliq/intervention-analysis', requireAuth, (req, res) => {
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics
  const all  = orgInterventions[code] || [];

  const byStatus = { suggested: 0, acknowledged: 0, completed: 0, dismissed: 0 };
  all.forEach(i => { if (byStatus[i.status] !== undefined) byStatus[i.status]++; });

  const measured  = all.filter(i => i.status === 'completed' && i.outcome?.status === 'measured');
  const outcomes  = { positive: 0, neutral: 0, negative: 0 };
  measured.forEach(i => { if (outcomes[i.outcome.outcome] !== undefined) outcomes[i.outcome.outcome]++; });

  // Learning stats by action type
  const actionStats = {};
  measured.forEach(i => {
    const type = _categorizeAction(i.action);
    if (!actionStats[type]) actionStats[type] = { total: 0, positive: 0, neutral: 0, negative: 0, moodDeltas: [] };
    actionStats[type].total++;
    actionStats[type][i.outcome.outcome]++;
    actionStats[type].moodDeltas.push(i.outcome.moodDelta);
  });
  const patterns = Object.entries(actionStats).map(([type, s]) => ({
    type,
    total:       s.total,
    successRate: Math.round(s.positive / s.total * 100),
    avgMoodDelta: s.moodDeltas.length ? Math.round((s.moodDeltas.reduce((a, b) => a + b, 0) / s.moodDeltas.length) * 10) / 10 : 0,
    outcomes:    { positive: s.positive, neutral: s.neutral, negative: s.negative },
  })).sort((a, b) => b.successRate - a.successRate);

  // Pending outcome checks — re-measure on request
  const pendingOutcomes = all.filter(i => i.status === 'completed' && i.outcome?.status === 'pending');
  pendingOutcomes.forEach(i => {
    const fresh = _measureInterventionOutcome(code, i);
    if (fresh && fresh.status !== 'pending') { i.outcome = fresh; scheduleSave(); }
  });

  res.json({
    total: all.length, byStatus, outcomes,
    patterns,
    successRate:    measured.length > 0 ? Math.round(outcomes.positive / measured.length * 100) : null,
    avgMoodDelta:   measured.length > 0 ? Math.round(measured.reduce((s, i) => s + (i.outcome.moodDelta || 0), 0) / measured.length * 10) / 10 : null,
    recent:         [...all].reverse().slice(0, 8),
    hasEnoughData:  measured.length >= 3,
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   INDIVIDUAL ADVISOR AI  (Phase 1)

   A leader selects a member and asks a question ("How do I motivate them?",
   "How do I improve accountability?"). The advisor reasons over everything
   IntelliQ knows about that person — but through the Privacy Gate (private
   may inform, never be revealed) and the requester's role Lens.

   Built on EXISTING data only — no schema migration. Profile-backed reasoning
   arrives in Phase 2 once the signals table exists.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Build the two-tier advisor context for a member from current stores.
   Returns { citable[], privateInforming[], privateStrings[] } where
   privateStrings are raw spans the redaction pass must never let through. */
function _buildAdvisorContext(code, member, requesterUser) {
  const memberId   = member.id;
  const memberName = member.name || '';
  const keys       = [userKey(code, memberId), memberKey(code, memberName)];

  const citable          = [];
  const privateInforming = [];
  const privateStrings   = [];

  // ── Identity ──────────────────────────────────────────────────────────────
  citable.push(`Name: ${memberName}${member.role ? ` · role: ${member.role}` : ''}`);

  // ── Alignment anchors — the three frames the advisor reasons across ────────
  // These are STATED AIMS (not private). They are the references behaviour is
  // measured against; they are never a hierarchy.
  //  • Member aims  = the engine (intrinsic goals)
  //  • Team context = the shared middle (group emphasis / culture)
  //  • Org values   = the guardrails (ethical boundaries + identity)
  const goals = normalizeMemberGoals(_memberGoalsFor(code, member));
  if (goals.length) {
    citable.push(`MEMBER aim(s): ${goals.map(g => g.title || g.text).filter(Boolean).join('; ')}`);
  } else {
    citable.push('MEMBER aim(s): none stated yet — treat as UNANCHORED; the absence is itself the finding.');
  }
  (orgGroups[code] || [])
    .filter(g => (g.memberIds || []).includes(memberId) || (g.leadIds || []).includes(memberId))
    .forEach(g => citable.push(`TEAM context — ${g.name}${g.description ? `: ${g.description}` : ''}`));
  const _orgValues = orgValues[code] || [];
  if (_orgValues.length) citable.push(`ORG values (guardrails): ${_orgValues.join(', ')}`);
  const _orgGoals = orgGoals[code] || [];
  if (_orgGoals.length) citable.push(`ORG priorities: ${_orgGoals.map(g => g.text).filter(Boolean).slice(0, 4).join('; ')}`);

  // ── Check-ins: mood numbers citable, free text informs only ───────────────
  const checkins = [];
  const seen = new Set();
  keys.forEach(k => (memberCheckins[k] || []).forEach(c => {
    const ts = c.ts || c.date; if (!ts || seen.has(ts)) return; seen.add(ts);
    checkins.push({ mood: c.mood != null ? Number(c.mood) : null, text: (c.text || c.note || '').trim(), ts });
  }));
  checkins.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const moods = checkins.filter(c => c.mood !== null).map(c => c.mood);
  if (moods.length) {
    const recent = moods.slice(0, 10);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    citable.push(`Recent mood: ${Math.round(avg * 10) / 10}/5 across ${recent.length} check-in(s); ${checkins.length} total.`);
  } else {
    citable.push('No check-in mood data yet.');
  }
  checkins.slice(0, 6).forEach(c => {
    if (!c.text) return;
    privateInforming.push(`Check-in note: ${c.text}`);
    privateStrings.push(c.text);
  });

  // ── Weekly reflections: completion citable, text informs only ─────────────
  let weeklyCount = 0;
  Object.entries(weeklyAssessments).forEach(([key, entries]) => {
    if (!key.startsWith(code + ':')) return;
    (entries || []).forEach(e => {
      if (e.memberName !== memberName && e.memberId !== memberId) return;
      weeklyCount++;
      const text = Object.values(e.data || {}).filter(Boolean).join(' | ').trim();
      if (text) { privateInforming.push(`Weekly reflection: ${text.slice(0, 300)}`); privateStrings.push(text.slice(0, 300)); }
    });
  });
  if (weeklyCount) citable.push(`Completed ${weeklyCount} weekly reflection(s).`);

  // ── Assessment results: scores/strengths/development are citable ──────────
  const results = [];
  keys.forEach(k => (memberResults[k] || []).forEach(r => results.push(r)));
  if (results.length) {
    const last = results[results.length - 1]?.score || {};
    const bits = [];
    if (last.overall != null) bits.push(`latest overall ${last.overall}/100`);
    if (Array.isArray(last.strengths) && last.strengths.length) bits.push(`strengths: ${last.strengths.slice(0, 3).join(', ')}`);
    if (Array.isArray(last.development) && last.development.length) bits.push(`development areas: ${last.development.slice(0, 3).join(', ')}`);
    citable.push(`Assessments completed: ${results.length}${bits.length ? ` (${bits.join('; ')})` : ''}.`);
  }

  // ── Memory profile: behavioral observations inform reasoning ──────────────
  const mem = userAiProfiles[`${code}:${memberId}`];
  if (mem) {
    // Durable long-term memory (persists even after signals age out) — significant
    // facts/events. Sensitive ones inform reasoning only; non-sensitive are citable.
    (mem.keyMemory || []).forEach(k => {
      const line = `[strong] Remembered${k.firstSeen ? ` (since ${k.firstSeen})` : ''}: ${k.text}`;
      if (k.sensitive) { privateInforming.push(line); privateStrings.push(k.text); }
      else citable.push(line);
    });
    (mem.openThreads || []).filter(t => !t.resolved).slice(0, 5).forEach(t => {
      privateInforming.push(`Recurring observation${t.occurrences > 1 ? ` (×${t.occurrences})` : ''}: ${t.text}`);
      privateStrings.push(t.text);
    });
    (mem.priorFollowUps || []).filter(f => !f.resolved).slice(0, 3).forEach(f => {
      privateInforming.push(`Open follow-up: ${f.commitment}`);
    });
  }

  // ── Authored notes: private/restricted inform only; shared are citable ────
  Object.values(orgNotes)
    .filter(n => n.orgCode === code && n.authorId === memberId)
    .forEach(n => {
      const sens = n.sensitivity || privacy.classifyText(n.content, { type: n.type, tag: n.tag });
      if (privacy.isPrivate(sens)) {
        privateInforming.push(`Private note (${sens}): ${n.content.slice(0, 200)}`);
        privateStrings.push(n.content.slice(0, 200));
      } else {
        citable.push(`Shared note: ${n.content.slice(0, 160)}`);
      }
    });

  // ── Interventions targeting this member: coach actions are citable ────────
  (orgInterventions[code] || [])
    .filter(i => i.targetMember === memberName || i.targetMemberId === memberId)
    .slice(-5)
    .forEach(i => {
      const out = i.outcome?.outcome ? ` → ${i.outcome.outcome}` : '';
      citable.push(`Past action: ${i.action} [${i.status}]${out}`);
    });

  // ── Patterns + predictions from the aggregator (derived, citable) ─────────
  try {
    const agg = _aggregateOrgData(code);
    (agg.memberPatterns?.[memberName] || []).forEach(p => citable.push(`Pattern: ${p.label || p.type} (${p.confidence || 'n/a'} confidence)`));
    (agg.memberPredictions?.[memberName] || []).forEach(p => citable.push(`Trajectory: ${p.prediction}`));
  } catch (_) { /* aggregation is best-effort here */ }

  // ── Ingested signals — WEIGHTED so the AI doesn't treat noise like results ──
  // The universal input layer: public/normal = citable, sensitive = inform-only.
  // Effective weight = base(source) + repetition + recency, so repeated behaviour
  // and recent hard outcomes outrank one-off notes. Strong/medium are included;
  // weak one-offs are capped to keep reasoning signal-rich, not noisy.
  const sigs = _gatherSignals(code, 'member', memberId, 60);
  // "Repeated behaviour" means the MEMBER repeatedly did the same thing — so only
  // count signals the member generated themselves. How many times a coach logged
  // about them is coach activity, not member behaviour, and must not inflate weight.
  const ownSrcCount = {};
  sigs.forEach(s => { if (s.createdBy === memberId) ownSrcCount[s.source] = (ownSrcCount[s.source] || 0) + 1; });
  const nowTs = Date.now();
  const baseW = s => s.weightNum != null ? s.weightNum : _signalBaseWeight(s.source);
  // Effective weight drives ORDERING only (recurring + recent surface first)…
  const effective = s => {
    let w = baseW(s);
    if ((ownSrcCount[s.source] || 0) >= 3) w += 1;                   // member's own repeated behaviour
    if (nowTs - new Date(s.ts).getTime() < 14 * 86400000) w += 0.5;  // recent
    return w;
  };
  const ranked = sigs
    .map(s => ({ s, w: effective(s) }))
    .sort((a, b) => b.w - a.w || new Date(b.s.ts) - new Date(a.s.ts));

  let weakUsed = 0;
  ranked.forEach(({ s }) => {
    // …but the strength LABEL reflects the source's TRUE weight, so a soft note is
    // never dressed up as a hard outcome ([strong]) by recency/repetition alone.
    const tier = _weightTier(baseW(s));
    if (tier === 'weak' && weakUsed >= 3) return;                     // cap noise
    if (tier === 'weak') weakUsed++;
    const src   = SIGNAL_SOURCES[s.source]?.label || s.source;
    const valid = s.valueText || (s.valueNum != null ? `${s.label ? s.label + ': ' : ''}${s.valueNum}` : null)
                  || (s.data ? JSON.stringify(s.data).slice(0, 200) : null);
    if (!valid) return;
    const tag  = tier === 'strong' ? '[strong] ' : tier === 'weak' ? '[minor] ' : '';
    const line = `${tag}${src}${s.label && s.valueText ? ` (${s.label})` : ''}: ${valid}`;
    if (privacy.isPrivate(s.sensitivity)) {
      privateInforming.push(line);
      if (s.valueText) privateStrings.push(s.valueText.slice(0, 200));
    } else {
      citable.push(line);
    }
  });

  return { citable, privateInforming, privateStrings };
}

/* ═══════════════════════════════════════════════════════════════════════════
   BEHAVIORAL PROFILE — the AI's evolving understanding of a person
   Synthesised from the member's weighted evidence THROUGH the privacy gate, so
   the stored narrative is safe to show leaders (sensitive detail informs it but
   is never exposed). Cached on the member's memory record; rebuilt as evidence
   grows. Replaces keyword threads as the primary "understanding" the AI reasons
   from. Directional language, no scores.
   ═══════════════════════════════════════════════════════════════════════════ */
function _memberSignalCount(code, userId, name) {
  // Count DISTINCT check-ins across the id-key and the legacy name-key — a member
  // with entries under both (or where the two keys collide) must not be counted
  // twice, or the profile would look like it has more evidence than it does and
  // rebuild too eagerly.
  const seen = new Set();
  [userKey(code, userId), memberKey(code, name || '')].forEach(k =>
    (memberCheckins[k] || []).forEach(c => seen.add(c.ts || c.date || JSON.stringify(c))));
  return _gatherSignals(code, 'member', userId, 500).length + seen.size;
}

function _profileStale(profile, signalCount) {
  if (!profile) return true;
  if (Date.now() - new Date(profile.builtAt).getTime() > 12 * 60 * 60 * 1000) return true; // 12h
  if (signalCount - (profile.signalBasis || 0) >= 5) return true;                            // meaningful new evidence
  return false;
}

/* Merge newly-extracted durable memories into the persistent record (dedupe by
   keyword overlap), so significant facts survive even after signals age out. */
function _mergeKeyMemory(mem, items) {
  if (!Array.isArray(mem.keyMemory)) mem.keyMemory = [];
  const today = new Date().toISOString().split('T')[0];
  items.forEach(it => {
    const text = String(it.text || '').trim();
    if (!text) return;
    const words = new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const dup = mem.keyMemory.find(k => {
      const kw = new Set(k.text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
      if (!kw.size || !words.size) return false;
      // Treat as the SAME memory only on high overlap against the LARGER phrase.
      // Measuring against the larger set (not the new one) and at 0.7 keeps
      // distinct events that merely share common words apart — e.g. "father
      // passed away" vs "mother passed away" (2/3 = 0.67) stay as two memories
      // instead of the second silently overwriting the first.
      const shared = [...words].filter(w => kw.has(w)).length;
      return shared >= Math.ceil(Math.max(words.size, kw.size) * 0.7);
    });
    if (dup) { dup.lastSeen = today; return; }
    mem.keyMemory.push({
      id: 'km_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      text, kind: it.kind || 'fact',
      sensitive: !!it.sensitive,
      firstSeen: today, lastSeen: today,
    });
  });
  // Keep the record bounded — drop oldest non-sensitive first.
  if (mem.keyMemory.length > 40) {
    mem.keyMemory.sort((a, b) => (a.sensitive === b.sensitive ? a.lastSeen.localeCompare(b.lastSeen) : a.sensitive ? 1 : -1));
    mem.keyMemory = mem.keyMemory.slice(mem.keyMemory.length - 40);
  }
}

async function _buildBehavioralProfile(code, userId) {
  const member = orgUsers[code]?.[userId];
  if (!member) return null;
  const mem = _getMemory(code, userId);
  const ctx = _buildAdvisorContext(code, member, member);
  const signalCount = _memberSignalCount(code, userId, member.name);

  // Feed the durable record back in so the AI keeps continuity across rebuilds.
  const remembered = (mem.keyMemory || []).map(k => `- ${k.text}${k.sensitive ? ' (sensitive)' : ''}`).join('\n');

  const digest = [
    remembered ? 'ALREADY REMEMBERED (durable — keep and update):\n' + remembered + '\n' : '',
    'OBSERVABLE EVIDENCE:',
    ...ctx.citable,
    ctx.privateInforming.length ? '\nPRIVATE (informs only — never reveal):' : '',
    ...ctx.privateInforming,
  ].filter(Boolean).join('\n');

  const system = [
    `You are IntelliQ, maintaining a longitudinal understanding of one person for the leaders who support them. You (1) synthesise who they are behaviourally, (2) keep a durable memory of SIGNIFICANT facts and life events worth remembering long-term (e.g. a family bereavement, an injury, a big goal, a role change), and (3) note things worth checking up on. Safe, humane, evidence-based — not a data dump or a verdict.`,
    privacy.GATE_DIRECTIVE,
    `Weigh strong and repeated evidence over one-off notes ([strong] beats [minor]). Directional language, never scores.
For durable memory: capture the SIGNIFICANT and lasting (life events, circumstances, big goals, recurring struggles) — not routine activity. Mark anything personal or sensitive with "sensitive": true; phrase it with care and never in a way that exposes private detail if surfaced.
For follow-ups: things a leader should gently check on later, phrased safely (e.g. "a supportive check-in may help right now" — not the private reason).`,
    _worldviewDirective(code),
    _domainDirective(code, { userId }),
    _memberValuesDirective(code, userId),
  ].filter(Boolean).join('\n\n');

  const user = `PERSON: ${member.name}\n\n${digest}\n\nReturn ONLY JSON: {"narrative":"2-4 sentences: who they are behaviourally and where they're trending","tendencies":["how they tend to respond"],"motivators":["what drives/engages them"],"watchFor":["early signs worth watching"],"trajectory":"converging|sustaining|stalled|diverging|unanchored|unknown","remember":[{"text":"a significant durable fact/event worth keeping","kind":"event|circumstance|goal|struggle|fact","sensitive":true|false}],"followUps":[{"text":"a gentle, safely-phrased thing to check on later"}]}`;

  let out = null;
  try {
    out = await ai.completeJSON({ tier: 'reason', system, user, maxTokens: 800, schema: ['narrative'] });
  } catch (err) { console.warn('[profile] AI error:', err.message); }
  if (!out) return mem.profile || null;

  // Redact any verbatim private span that slipped through.
  const priv = ctx.privateStrings || [];
  const clean = s => typeof s === 'string' ? privacy.redact(s, priv) : s;

  // Accumulate durable memory (persists across rebuilds).
  if (Array.isArray(out.remember)) {
    _mergeKeyMemory(mem, out.remember.map(r => ({ ...r, text: clean(r.text || '') })).filter(r => r.text));
  }

  // Trajectory hysteresis — the label rebuilds every 12h and the model can wobble
  // between converging/sustaining/stalled on the same evidence. Hold the prior
  // label unless real new evidence accrued since the last build, and never let a
  // real label regress to "unknown" on noise. A leader should see the direction
  // change because the person changed, not because the model re-rolled.
  const prevTraj  = mem.profile?.trajectory;
  const prevBasis = mem.profile?.signalBasis || 0;
  let trajectory  = out.trajectory || 'unknown';
  if (prevTraj && prevTraj !== 'unknown') {
    if (trajectory === 'unknown') {
      trajectory = prevTraj;                                        // don't regress on a noisy rebuild
    } else if (trajectory !== prevTraj && (signalCount - prevBasis) < 3) {
      trajectory = prevTraj;                                        // hold unless the evidence really moved
    }
  }

  mem.profile = {
    narrative:  clean(out.narrative || ''),
    tendencies: Array.isArray(out.tendencies) ? out.tendencies.map(clean).slice(0, 6) : [],
    motivators: Array.isArray(out.motivators) ? out.motivators.map(clean).slice(0, 6) : [],
    watchFor:   Array.isArray(out.watchFor)   ? out.watchFor.map(clean).slice(0, 6)   : [],
    trajectory,
    followUps:  Array.isArray(out.followUps)  ? out.followUps.map(f => clean(f.text || f)).filter(Boolean).slice(0, 4) : [],
    builtAt:    new Date().toISOString(),
    signalBasis: signalCount,
    // Audit: the vocabulary context this prose was generated under, so it stays
    // attributable even if the org later changes its display language.
    domain:     _domainStamp(code),
  };
  scheduleSave();

  // Cross-member vector (optional — gated on embeddings + pgvector). Fire-and-
  // forget so it never blocks or breaks the profile response.
  if (embeddings.enabled() && db.vectorsReady()) {
    const summary = [mem.profile.narrative, ...(mem.profile.tendencies || []), ...(mem.profile.motivators || [])].filter(Boolean).join('. ');
    embeddings.embed(summary)
      .then(vec => vec && db.upsertMemberVector(code, userId, vec, summary))
      .catch(e => console.warn('[profile] vector upsert failed:', e.message));
  }

  return mem.profile;
}

async function _getBehavioralProfile(code, userId, force) {
  const member = orgUsers[code]?.[userId];
  if (!member) return null;
  const mem = _getMemory(code, userId);
  const signalCount = _memberSignalCount(code, userId, member.name);
  if (force || _profileStale(mem.profile, signalCount)) {
    return await _buildBehavioralProfile(code, userId);
  }
  return mem.profile;
}

/* ── GET /api/member/:memberId/profile — the behavioral understanding ──────── */
app.get('/api/member/:memberId/profile', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = (orgCode || '').toLowerCase().trim();
  const memberId = req.params.memberId;
  if (!getVisibleUserIds(code, userId).includes(memberId)) return res.status(403).json({ error: 'Member not in your visible scope' });
  if (!(_userHasPerm(code, userId, 'view_insights') || _userHasPerm(code, userId, 'review_checkins') || orgUsers[code]?.[userId]?.role === 'superadmin')) {
    return res.status(403).json({ error: 'Permission denied: view_insights required' });
  }
  try {
    const profile = await _getBehavioralProfile(code, memberId, req.query.refresh === '1');
    const mem = userAiProfiles[`${code}:${memberId}`] || {};
    const km  = mem.keyMemory || [];
    // Durable memory: non-sensitive facts are shown; sensitive personal matters
    // are acknowledged (count) but their detail is never exposed to the leader.
    res.json({
      ok: true,
      profile: profile || null,
      remembered: km.filter(k => !k.sensitive).map(k => ({ text: k.text, since: k.firstSeen, kind: k.kind })),
      privateMatters: km.filter(k => k.sensitive).length,
      assessmentNudges: _memberAssessmentNudges(code, memberId, Date.now()),
    });
  } catch (err) {
    console.error('[profile] error:', err.message);
    res.status(502).json({ error: 'Could not build the profile right now.' });
  }
});

/* ── GET /api/member/:memberId/similar — cross-member intelligence (v1) ────────
   "Members on a similar path, and what's helped them." Finds a cohort sharing
   this member's risk patterns/trajectory, then aggregates which interventions
   had positive outcomes for that cohort (falls back to org-wide when the cohort
   has little intervention history). ANONYMOUS — never names other members.
   This is the flywheel first slice; embeddings/Postgres are the scale upgrade. */
app.get('/api/member/:memberId/similar', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = (orgCode || '').toLowerCase().trim();
  const memberId = req.params.memberId;
  if (!getVisibleUserIds(code, userId).includes(memberId)) return res.status(403).json({ error: 'Member not in your visible scope' });
  if (!(_userHasPerm(code, userId, 'view_insights') || orgUsers[code]?.[userId]?.role === 'superadmin')) {
    return res.status(403).json({ error: 'Permission denied' });
  }
  const member = orgUsers[code]?.[memberId];
  if (!member) return res.status(404).json({ error: 'Member not found' });

  // Vector cohort (nearest neighbours) when pgvector + embeddings are live;
  // otherwise rule-based pattern overlap below. Both stay anonymous.
  let vectorCohort = null;
  if (embeddings.enabled() && db.vectorsReady()) {
    try {
      const rows = await db.nearestMembers(code, memberId, 8);
      const names = rows.map(r => orgUsers[code]?.[r.user_id]?.name).filter(Boolean);
      if (names.length) vectorCohort = { set: new Set(names), method: 'embedding' };
    } catch (e) { console.warn('[similar] vector query failed:', e.message); }
  }

  let agg; try { agg = _aggregateOrgData(code); } catch (_) { agg = { memberPatterns: {}, memberPredictions: {} }; }
  const myPatterns = new Set((agg.memberPatterns?.[member.name] || []).map(p => p.type));
  const myTraj     = (agg.memberPredictions?.[member.name] || []).length > 0;

  // Cohort: nearest-neighbour (embeddings) when available, else members sharing a
  // risk pattern / declining trajectory. Names only scope the intervention
  // lookup — never returned. Anonymous either way.
  const sharedPatterns = new Set();
  let cohort, method;
  if (vectorCohort) {
    cohort = vectorCohort.set;
    method = 'embedding';
  } else {
    cohort = new Set();
    method = 'pattern';
    Object.entries(agg.memberPatterns || {}).forEach(([name, pats]) => {
      if (name === member.name) return;
      const shared = pats.map(p => p.type).filter(t => myPatterns.has(t));
      if (shared.length) { cohort.add(name); shared.forEach(t => sharedPatterns.add(t)); }
    });
    if (myTraj) Object.entries(agg.memberPredictions || {}).forEach(([name, preds]) => {
      if (name !== member.name && preds.length) cohort.add(name);
    });
  }

  // What has helped: measured, positive interventions — cohort-scoped if we have
  // enough, else org-wide. Aggregate by action type. Anonymous.
  const measured = (orgInterventions[code] || []).filter(i => i.status === 'completed' && i.outcome?.status === 'measured');
  const tally = list => {
    const by = {};
    list.forEach(i => { const t = _categorizeAction(i.action); by[t] = by[t] || { positive: 0, total: 0 }; by[t].total++; if (i.outcome.outcome === 'positive') by[t].positive++; });
    return Object.entries(by).map(([type, s]) => ({ type, positive: s.positive, total: s.total })).sort((a, b) => b.positive - a.positive);
  };
  // A cohort of one is not a cohort — and its "shared pattern" could point a
  // leader straight at a single identifiable person, breaking the anonymity
  // promise. Require at least MIN_COHORT before framing anything around it.
  const MIN_COHORT = 2;
  // Never present a single outcome (1/1) as if it were evidence — require a
  // minimum sample before a "what helped" type is shown as guidance.
  const MIN_SAMPLE = 2;
  const cohortValid = cohort.size >= MIN_COHORT;

  const cohortIntns = cohortValid ? measured.filter(i => cohort.has(i.targetMember)) : [];
  let whatWorked = tally(cohortIntns).filter(w => w.total >= MIN_SAMPLE);
  let scope = 'cohort';
  if (whatWorked.length === 0) { whatWorked = tally(measured).filter(w => w.total >= MIN_SAMPLE); scope = 'org'; }
  const lowConfidence = whatWorked.length > 0 && whatWorked[0].total < 3;

  res.json({
    ok: true,
    cohortSize: cohortValid ? cohort.size : 0,
    sharedPatterns: cohortValid ? [...sharedPatterns] : [],
    whatWorked: whatWorked.slice(0, 4),
    scope,
    method,
    lowConfidence,
    hasData: whatWorked.length > 0,
  });
});

const ADVISOR_SYSTEM = `You are the IntelliQ Individual Advisor — embedded in ONE member's profile to help a leader support, develop, and lead THIS specific person. You are not a score machine. You never rank people and never output a number as a verdict.

HOW YOU THINK — ALIGNMENT, NOT OBEDIENCE:
Alignment is the coherence between what this person actually does over time and what they — and the communities they belong to — say they are trying to become. It is directional (are they becoming it?), never a fixed grade, and never "doing what the coach says." You reason across three frames, which are NOT a hierarchy:
- MEMBER aims  = the engine (their own goals; intrinsic motivation is what actually drives durable growth).
- TEAM context = the shared middle (group emphasis and culture).
- ORG values   = the guardrails (ethical boundaries and identity).
Optimize for: the member's own goals, pursued within org guardrails, integrated with team context.

DIRECTIONAL LANGUAGE — NEVER SCORES:
Describe trajectory with words, not numbers: converging, sustaining, stalled, diverging, unanchored (no stated aim yet), or unknown (not enough signal). Never say "62% aligned" or assign a grade.

WEIGH THE EVIDENCE:
Not all signals are equal. Lean on [strong] signals (results, metrics, attendance, repeated behaviour, long-term trends) and converging patterns across several signals. Treat [minor] one-offs (a single note/message) lightly — never build a judgement on one of them. A pattern across signals beats any single data point.

CONFLICT DOCTRINE:
- MEMBER aim vs TEAM aim → seek INTEGRATION first: show how pursuing the team's aim also serves the member's own goal. If they genuinely conflict, name the honest tradeoff for the humans to decide — do not coerce toward the team.
- TEAM vs ORG values → the org value is the guardrail and should win, but treat it as a culture issue for leadership, never as a mark against this individual.
- Anchored to NOTHING → highest care, not the worst grade. Lead with curiosity; most often we simply never captured what they want.
- Aligned across all three → reinforce and stretch (leadership / mentoring opportunities).

OUTPUT RULES:
- Be specific to this person. No platitudes, no generic coaching advice.
- Recommend actions the requester can take, not descriptions of the data.
- Reason from your understanding of the person; do not recite or quote source material.
- If a stated aim is missing, say so plainly — that absence is the finding, not a failure.`;

/* ── MEMBER ADVISOR — canonical evidence · kernel reasoning · post-kernel bounds ──
   The advisor is a privacy-critical surface. It NEVER assembles truth from raw member
   signals, NEVER reads private evidence, and the LLM NEVER becomes a second kernel:
     1. RETRIEVE — only leader-authorised CANONICAL evidence, through the shared gateway
        at purpose `leader_support`. Private evidence is excluded BEFORE any context is
        built, so the advisor cannot see it and therefore cannot leak it.
     2. KERNEL   — member state (directional trajectory) is reconstructed here, over the
        authorised evidence, retaining the basis evidence IDs + confidence + limitations.
     3. CONTEXT  — normal evidence is quotable; SENSITIVE evidence informs the model but
        is never quoted (privacy law); anchors (member aims / team context / org values)
        are reference FRAMES, not evidence. Behavioural truth comes only from evidence.
   The endpoint then records the recommendation as canonical DERIVED evidence and bounds
   the answer through the POST-KERNEL boundary (cite only what the leader may see). */
function _advisorKernelReasoning(code, member, requesterId) {
  const memberId = member.id;
  // 1. RETRIEVE — leader-authorised canonical evidence only (private excluded upstream).
  const evidence = _canonicalContext({ code, viewerId: requesterId, purpose: 'leader_support', subjectId: memberId });

  // 2. KERNEL STATE — directional trajectory reconstructed from canonical metrics.
  const moods = evidence.filter(e => e.type === 'metric' && /mood/i.test(e.label || '') && Number.isFinite(Number(e.value)))
    .sort((a, b) => new Date(a.observedAt || 0) - new Date(b.observedAt || 0));
  // Assessment reasoning consumes the COMPLETE canonical Assessment lifecycle (scale-aware,
  // journey-aware), never a naked score. Private assessments/submissions are excluded here
  // because the purpose is leader_support. Raw feedback text is never quoted — only structure.
  const assess = _assessmentKernelState(code, memberId, { purpose: 'leader_support', viewerId: requesterId });
  const observations = evidence.filter(e => e.type === 'observation');

  const goals    = normalizeMemberGoals(_memberGoalsFor(code, member));
  const anchored = goals.length > 0;

  // Directional words, never scores: compare the recent half of ratings to the earlier.
  let trajectory = 'unknown', confidence = 'low';
  const limitations = ['reconstructed only from captured, leader-authorised evidence — not the whole person'];
  if (moods.length >= 4) {
    const vals = moods.map(m => Number(m.value));
    const half = Math.floor(vals.length / 2);
    const avg  = a => a.reduce((x, y) => x + y, 0) / a.length;
    const delta = avg(vals.slice(half)) - avg(vals.slice(0, half));
    trajectory = delta > 0.4 ? 'converging' : delta < -0.4 ? 'diverging' : 'sustaining';
    confidence = 'medium';
  } else if (moods.length >= 1) {
    limitations.push('too few check-ins to establish a trajectory');
  } else if (!anchored) {
    trajectory = 'unanchored';
    limitations.push('no stated member aim captured yet — the absence is itself the finding');
  }

  // 3. BASIS — the evidence IDs the kernel state rests on (mood context + assessment journey).
  const basis = [...evidence.map(e => e.evidenceId), ...assess.basisIds];
  const kernelArt = _recordKernelDerivation(code, {
    type: 'derived_pattern',
    result: { subject: memberId, trajectory, anchored, moodCount: moods.length,
      assessmentCount: assess.assessments.length, assessmentDirection: assess.direction, observationCount: observations.length },
    basis: basis.length ? basis : ['none'],
    confidence, limitations, detector: 'advisor-kernel',
  });

  // 4. CONTEXT TIERS — normal evidence is quotable; sensitive INFORMS only (never quoted),
  //    per the privacy law; private is already gone (gateway-excluded before we got here).
  const citable = [], informing = [], informingStrings = [];
  citable.push(`Name: ${member.name || ''}${member.role ? ` · role: ${member.role}` : ''}`);
  citable.push(anchored
    ? `MEMBER aim(s): ${goals.map(g => g.title || g.text).filter(Boolean).join('; ')}`
    : 'MEMBER aim(s): none stated yet — treat as UNANCHORED; the absence is itself the finding.');
  (orgGroups[code] || [])
    .filter(g => (g.memberIds || []).includes(memberId) || (g.leadIds || []).includes(memberId))
    .forEach(g => citable.push(`TEAM context — ${g.name}${g.description ? `: ${g.description}` : ''}`));
  if ((orgValues[code] || []).length) citable.push(`ORG values (guardrails): ${orgValues[code].join(', ')}`);
  if ((orgGoals[code] || []).length)  citable.push(`ORG priorities: ${orgGoals[code].map(g => g.text).filter(Boolean).slice(0, 4).join('; ')}`);

  // The directional kernel state — words, never a grade.
  citable.push(`Kernel state: trajectory ${trajectory} (confidence ${confidence}) across ${moods.length} mood check-in(s), ${assess.assessments.length} assessment(s), ${observations.length} observation(s).`);
  if (moods.length) {
    const recent = moods.slice(-10).map(m => Number(m.value));
    citable.push(`Recent mood: ${Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 10) / 10}/5 across ${recent.length} check-in(s) (aggregate).`);
  } else {
    citable.push('No check-in mood data yet.');
  }
  // Assessment — SCALE-AWARE, journey-aware, and NEVER quoting the raw feedback text.
  if (assess.latest) {
    const L = assess.latest, max = _scaleMax(L.scoreScale);
    citable.push(`Latest assessment: ${L.score}${max ? '/' + max : (L.scoreScale ? ' (' + L.scoreScale + ')' : '')}${L.rubric ? ` · rubric: ${String(L.rubric).slice(0, 80)}` : ' · no rubric on record'}.`);
    const dirWord = { improvement: 'improving across comparable attempts', decline: 'declining across comparable attempts',
      stable: 'stable across comparable attempts', incomparable: 'not directly comparable (different scale/rubric)',
      unknown: 'no comparison established yet' }[assess.direction];
    citable.push(`Assessment trajectory: ${dirWord}${assess.confidence ? ` (confidence ${assess.confidence})` : ''}.`);
    if (assess.feedbackActedUpon) citable.push(`Feedback was acted on: ${assess.whatChanged || 'a revision followed the feedback'} — but the outcome may not yet be reassessed.`);
    if (assess.feedbackThemes.length) citable.push(`Feedback dimensions (themes only, not quoted): ${assess.feedbackThemes.join(', ')}.`);
    assess.limitations.forEach(l => citable.push(`Assessment limitation: ${l}.`));
  }

  // Free-text observations: normal → quotable; sensitive → informs reasoning, never quoted.
  observations.forEach(o => {
    const line = String(o.valueText || o.label || '').trim();
    if (!line) return;
    if (o.visibility === 'normal') citable.push(`Observation: ${line.slice(0, 200)}`);
    else { informing.push(`Observation (informs only): ${line.slice(0, 200)}`); informingStrings.push(line.slice(0, 200)); }
  });

  return { evidence, citable, informing, informingStrings, kernelArt, basis, trajectory, confidence };
}

/* ── POST /api/advisor/:memberId/ask ──────────────────────────────────────── */
app.post('/api/advisor/:memberId/ask', requireAuth, async (req, res) => {
  const { orgCode } = req.iqSession;
  const requesterId = req.iqSession.userId;
  const code        = (orgCode || '').toLowerCase().trim();
  const memberId    = req.params.memberId;
  const question    = (req.body?.question || '').trim();
  const mode        = req.body?.mode === 'briefing' ? 'briefing' : 'question';

  // In briefing mode the question is optional (we generate a full briefing).
  if (mode !== 'briefing' && !question) return res.status(400).json({ error: 'question required' });
  if (question.length > 600) return res.status(400).json({ error: 'question too long' });

  const requester = orgUsers[code]?.[requesterId];
  const member    = orgUsers[code]?.[memberId];
  if (!requester) return res.status(401).json({ error: 'Requester not found' });
  if (!member)    return res.status(404).json({ error: 'Member not found' });

  // Permission: must be able to see this member AND have an insight permission.
  const visible = getVisibleUserIds(code, requesterId);
  if (!visible.includes(memberId)) return res.status(403).json({ error: 'Member not in your visible scope' });
  const canAdvise = requester.role === 'superadmin'
    || _userHasPerm(code, requesterId, 'view_insights')
    || _userHasPerm(code, requesterId, 'review_checkins');
  if (!canAdvise) return res.status(403).json({ error: 'Permission denied: view_insights required' });

  // RETRIEVE + KERNEL — leader-authorised canonical evidence only, member state
  // reconstructed in the kernel. No raw signals, no legacy memory, no private evidence.
  const kr   = _advisorKernelReasoning(code, member, requesterId);
  const lens = lenses.lensFor(requester);

  const system = [
    ADVISOR_SYSTEM,
    privacy.GATE_DIRECTIVE,
    lenses.lensDirective(lens),
    _worldviewDirective(code),
    _domainDirective(code, { userId: memberId }),
    _memberValuesDirective(code, memberId),
  ].filter(Boolean).join('\n\n');

  const contextBlock = privacy.buildContextBlock({ citable: kr.citable, privateInforming: kr.informing });

  const userMsg = mode === 'briefing'
    ? [
        `Produce an alignment briefing on ${member.name || 'this member'} for a ${lens?.label || requester.role}.`,
        '',
        contextBlock,
        '',
        'Write the briefing under these four short headings, a sentence or two each:',
        '1. What we are seeing',
        '2. Why it might be happening',
        '3. How this aligns (member aims · team context · org values) — use directional words, no scores',
        '4. What to try next',
      ].join('\n')
    : [
        `QUESTION (from a ${lens?.label || requester.role}): ${question}`,
        '',
        contextBlock,
        '',
        'Answer in 3-5 sentences with specific, actionable guidance for this person, reasoning across their member/team/org aims where relevant. Use directional language, never scores.',
      ].join('\n');

  let answer;
  try {
    answer = await ai.complete({ tier: 'reason', system, user: userMsg, maxTokens: mode === 'briefing' ? 600 : 400 });
  } catch (err) {
    console.error('[advisor] AI error:', err.message);
    return res.status(502).json({ error: 'Advisor unavailable right now. Please try again.' });
  }

  // Last-line privacy defence — strip any sensitive informing span that survived into
  // the output (private material never reached the model, so it cannot be here).
  answer = privacy.redact(answer, kr.informingStrings);

  // Record the recommendation as canonical DERIVED evidence (meaningful output only),
  // grounded in the kernel basis. It inherits an org-safe visibility ceiling from its
  // basis and does NOT auto-promote — it never recursively feeds itself back as truth.
  let recEvidenceId = null;
  if (answer && answer.trim().length > 40 && kr.basis.length) {
    const rec = _recordDerivedEvidence(code, {
      subjectId: memberId, type: 'observation',
      label: mode === 'briefing' ? 'Advisor briefing' : 'Advisor recommendation',
      valueText: answer.slice(0, 600), basisIds: kr.basis,
    });
    recEvidenceId = rec && rec.id ? rec.id : null;
  }

  // POST-KERNEL — bound the answer to the kernel result and the leader's authorised set;
  // cites only evidence the leader may see, never raising confidence or dropping limits.
  const composed = _composeForAudience(code, kr.kernelArt, {
    role: requester.role, subjectId: memberId, viewerId: requesterId, purpose: 'leader_support', text: answer,
  });

  // Persist the thread (non-sensitive: question + bounded answer + provenance only).
  if (!advisorThreads[code]) advisorThreads[code] = [];
  const thread = {
    id:            `adv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    memberId, memberName: member.name || '',
    requesterId, requesterRole: requester.role,
    lens:          lens?.label || null,
    mode,
    question:      mode === 'briefing' ? 'Full alignment briefing' : question,
    answer,
    trajectory:    kr.trajectory,
    cites:         composed.output.cites,
    recEvidenceId,
    createdAt:     new Date().toISOString(),
  };
  advisorThreads[code].push(thread);
  scheduleSave();

  res.json({
    ok: true,
    answer,
    mode,
    lens: lens?.label || null,
    evidenceCount: kr.basis.length,
    trajectory: kr.trajectory,
    confidence: kr.confidence,
    cites: composed.output.cites,
    bounded: composed.ok,
    threadId: thread.id,
  });
});

/* ── GET /api/advisor/:memberId/threads — prior advisor Q&A for a member ───── */
app.get('/api/advisor/:memberId/threads', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code     = (orgCode || '').toLowerCase().trim();
  const memberId = req.params.memberId;

  const visible = getVisibleUserIds(code, userId);
  if (!visible.includes(memberId)) return res.status(403).json({ error: 'Member not in your visible scope' });

  const threads = (advisorThreads[code] || [])
    .filter(t => t.memberId === memberId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  res.json({ threads });
});

/* ── GET /api/signals/sources — the input source registry ──────────────────── */
app.get('/api/signals/sources', requireAuth, (req, res) => {
  res.json({ sources: SIGNAL_SOURCES });
});

/* ── POST /api/signals/ingest — universal input endpoint ──────────────────────
   Accepts one signal or { signals: [...] }. Any modality (text/number/voice
   transcript/sheet row/event/external feed). Scoped: you may attach a signal to
   yourself, or to a member/group you can see/lead. Sensitivity auto-classified. */
app.post('/api/signals/ingest', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code  = orgCode;
  const batch = Array.isArray(req.body?.signals) ? req.body.signals : [req.body];

  const visible = new Set(getVisibleUserIds(code, userId));
  const canAttach = (s) => {
    if (s.subjectType === 'org') return _userHasPerm(code, userId, 'view_team') || orgUsers[code]?.[userId]?.role === 'superadmin';
    if (s.subjectType === 'group') {
      const g = (orgGroups[code] || []).find(x => x.id === s.subjectId);
      return !!g && ((g.leadIds || []).includes(userId) || orgUsers[code]?.[userId]?.role === 'superadmin');
    }
    // member: self, or a member you can see
    return s.subjectId === userId || visible.has(s.subjectId);
  };

  const stored = [];
  for (const raw of batch) {
    if (!raw || !raw.source) continue;
    if (raw.subjectId && !canAttach(raw)) continue; // silently skip out-of-scope
    const sig = _ingestSignal(code, raw, userId);
    if (sig) stored.push({ id: sig.id, source: sig.source, modality: sig.modality, subjectId: sig.subjectId });
  }
  if (!stored.length) return res.status(400).json({ error: 'No valid in-scope signals to ingest.' });
  scheduleSave();
  res.json({ ok: true, ingested: stored.length, signals: stored });
});

/* ── GET /api/signals — query signals for a subject you can see ──────────────── */
app.get('/api/signals', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code = orgCode;
  const { subjectType = 'member', subjectId } = req.query;

  if (subjectType === 'member' && subjectId && subjectId !== userId) {
    if (!getVisibleUserIds(code, userId).includes(subjectId)) {
      return res.status(403).json({ error: 'Subject not in your visible scope' });
    }
  }
  // Raw sensitive/restricted text is only returned to leaders/admins; members
  // get their own. Public + normal always returned.
  const isLeaderOrAdmin = _userHasPerm(code, userId, 'view_insights') || orgUsers[code]?.[userId]?.role === 'superadmin';
  const signals = _gatherSignals(code, subjectType, subjectId, 100).map(s => {
    if (privacy.isPrivate(s.sensitivity) && !isLeaderOrAdmin && s.subjectId !== userId) {
      return { ...s, valueText: null, data: null, redacted: true };
    }
    return s;
  });
  res.json({ signals });
});

/* ── GET /api/signals/recent — transparency list of what the AI can use ────────
   Recent signals across the requester's scope (members they see + groups they
   lead + org + things they logged). Powers the Data Sources "what's feeding the
   AI" view. Enriched with subject + source labels; sensitive text summarised. */
app.get('/api/signals/recent', requireAuth, (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code    = orgCode;
  const visible = new Set(getVisibleUserIds(code, userId));
  const ledGroupIds = new Set((orgGroups[code] || []).filter(g => (g.leadIds || []).includes(userId)).map(g => g.id));

  const inScope = s =>
    s.createdBy === userId ||
    (s.subjectType === 'org') ||
    (s.subjectType === 'member' && s.subjectId && visible.has(s.subjectId)) ||
    (s.subjectType === 'group'  && ledGroupIds.has(s.subjectId));

  const subjectName = s => {
    if (s.subjectType === 'org') return 'Organization';
    if (s.subjectType === 'group') return (orgGroups[code] || []).find(g => g.id === s.subjectId)?.name || 'Group';
    return orgUsers[code]?.[s.subjectId]?.name || 'Member';
  };

  const list = (orgSignals[code] || [])
    .filter(inScope)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, 60)
    .map(s => ({
      id: s.id, ts: s.ts, source: s.source,
      sourceLabel: SIGNAL_SOURCES[s.source]?.label || s.source,
      modality: s.modality, sensitivity: s.sensitivity, public: s.public,
      weight: s.weight || _weightTier(s.weightNum != null ? s.weightNum : _signalBaseWeight(s.source)),
      subjectType: s.subjectType, subject: subjectName(s),
      label: s.label,
      snippet: privacy.isPrivate(s.sensitivity)
        ? '(private — informs the AI, not shown)'
        : (s.valueText ? s.valueText.slice(0, 100) : (s.valueNum != null ? String(s.valueNum) : (s.label || s.sourceLabel))),
    }));

  res.json({ signals: list });
});

/* ── Match an extracted name to a visible member's userId (fuzzy, safe) ──────── */
function _matchMember(code, candidates, name) {
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  // exact full-name, then "contains", then first-name match
  let hit = candidates.find(c => c.name === n);
  if (!hit) hit = candidates.find(c => c.name.includes(n) || n.includes(c.name));
  if (!hit) hit = candidates.find(c => c.first && (c.first === n || n.startsWith(c.first + ' ') || n.endsWith(' ' + c.first)));
  return hit ? hit.id : null;
}

/* Attribute AI-extracted per-member data and ingest as signals (scope-safe). */
function _attributeMembers(code, userId, members, roster, fileName, isPublic) {
  const matched = [], unmatched = [];
  let imported = 0;
  (Array.isArray(members) ? members : []).slice(0, 60).forEach(m => {
    const mid = _matchMember(code, roster, m.name);
    if (!mid) { if (m.name) unmatched.push(m.name); return; }
    let count = 0;
    (Array.isArray(m.metrics) ? m.metrics : []).slice(0, 30).forEach(mt => {
      if (!mt || (mt.label == null && mt.value == null)) return;
      const num = Number(mt.value);
      const sig = _ingestSignal(code, {
        subjectType: 'member', subjectId: mid, source: 'sheet',
        modality: isNaN(num) ? 'text' : 'number',
        label: mt.label != null ? String(mt.label) : null,
        valueNum: isNaN(num) ? null : num,
        valueText: isNaN(num) ? (mt.value != null ? String(mt.value) : null) : null,
        public: isPublic,
      }, userId);
      if (sig) { count++; imported++; }
    });
    if (m.note && String(m.note).trim()) {
      const sig = _ingestSignal(code, {
        subjectType: 'member', subjectId: mid, source: 'document',
        modality: 'text', label: fileName, valueText: String(m.note), public: isPublic,
      }, userId);
      if (sig) { count++; imported++; }
    }
    if (count) matched.push({ name: orgUsers[code]?.[mid]?.name || m.name, signals: count });
  });
  if (imported) scheduleSave();
  return { imported, matched, unmatched };
}

const _IMPORT_SCHEMA_HINT = 'Return ONLY JSON: {"members":[{"name":"<roster name>","metrics":[{"label":"e.g. Squat 1RM","value":"number or short text"}],"note":"<concise factual summary of anything else about this person, else empty>"}]}';
const _IMPORT_SYSTEM = `You extract structured, per-person data from a document, spreadsheet, or an IMAGE/scan of one, for a performance organisation. Attribute data ONLY to people in the provided roster — ignore anyone not on it. Read tables/columns carefully. Be faithful to the source; do not invent numbers.`;

/* ── POST /api/signals/import — SMART import (text OR image/PDF via vision) ────
   Accepts { content } (extracted text) OR { media:{kind:'image'|'pdf', mediaType,
   data(base64)} } for scanned stat sheets. The AI maps rows/mentions to the
   requester's VISIBLE roster and files metrics + notes under the right member. */
app.post('/api/signals/import', requireAuth, async (req, res) => {
  const { orgCode, userId } = req.iqSession;
  const code     = orgCode;
  const fileName = String(req.body?.fileName || 'upload').slice(0, 120);
  const isPublic = !!req.body?.public;
  const content  = String(req.body?.content || '').slice(0, 8000);
  const media    = req.body?.media; // { kind:'image'|'pdf', mediaType, data }

  if (!content.trim() && !(media && media.data)) {
    return res.status(400).json({ error: 'No content to import.' });
  }

  const roster = getVisibleUserIds(code, userId)
    .map(id => orgUsers[code]?.[id]).filter(u => u && u.role !== 'superadmin')
    .map(u => ({ id: u.id, name: (u.name || '').toLowerCase().trim(), first: (u.firstName || (u.name || '').split(' ')[0] || '').toLowerCase().trim() }));
  if (!roster.length) return res.status(400).json({ error: 'No members in your scope to attribute data to.' });

  const rosterList = roster.map(r => r.name).join(', ');
  const promptText = `ROSTER (only attribute to these names): ${rosterList}\n\nFILE: ${fileName}\n\n${_IMPORT_SCHEMA_HINT}`;

  // Build messages: a vision block for image/PDF, else plain text content.
  let messages;
  if (media && media.data) {
    const block = media.kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: media.data } }
      : { type: 'image',    source: { type: 'base64', media_type: media.mediaType || 'image/jpeg', data: media.data } };
    messages = [{ role: 'user', content: [ block, { type: 'text', text: promptText + '\n\nExtract the per-member data from the attached file.' } ] }];
  } else {
    messages = [{ role: 'user', content: `${promptText}\n\nCONTENT:\n${content}` }];
  }

  let parsed = null;
  try {
    parsed = await ai.completeJSON({ tier: 'reason', system: `${_IMPORT_SYSTEM}\n\n${privacy.GATE_DIRECTIVE}`, messages, maxTokens: 1100, schema: ['members'] });
  } catch (err) {
    console.warn('[signals/import] AI error:', err.message);
    return res.status(502).json({ error: 'Import analysis failed. Try again.' });
  }
  if (!parsed || !Array.isArray(parsed.members)) {
    return res.json({ ok: true, imported: 0, matched: [], unmatched: [], note: 'No per-member data found in this file.' });
  }

  res.json({ ok: true, ..._attributeMembers(code, userId, parsed.members, roster, fileName, isPublic) });
});

/* ═══════════════════════════════════════════════════════════════════════════
   LEARNING ENGINE — Patterns, Predictions, Effectiveness, Summary
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── GET /api/intelliq/patterns — rule-based risk patterns for org ────────── */
app.get('/api/intelliq/patterns', requireAuth, (req, res) => {
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics
  const agg  = _aggregateOrgData(code);

  const flat = [];
  Object.entries(agg.memberPatterns || {}).forEach(([name, pats]) => {
    pats.forEach(p => flat.push({ member: name, ...p }));
  });

  const summary = {
    totalMembers:    agg.memberCount,
    membersAtRisk:   new Set(flat.map(p => p.member)).size,
    patternCounts:   flat.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {}),
    highConfidence:  flat.filter(p => p.confidence === 'high').length,
    patterns:        flat,
  };
  res.json(summary);
});

/* ── GET /api/intelliq/predictions — trajectory predictions ──────────────── */
app.get('/api/intelliq/predictions', requireAuth, (req, res) => {
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics
  const agg  = _aggregateOrgData(code);

  const flat = [];
  Object.entries(agg.memberPredictions || {}).forEach(([name, preds]) => {
    preds.forEach(p => flat.push({ member: name, ...p }));
  });

  const high   = flat.filter(p => p.urgency === 'high');
  const medium = flat.filter(p => p.urgency === 'medium');

  res.json({
    totalPredictions: flat.length,
    highUrgency:      high.length,
    mediumUrgency:    medium.length,
    predictions:      flat.sort((a, b) => (a.urgency === 'high' ? -1 : 1)),
    generatedAt:      new Date().toISOString(),
  });
});

/* ── GET /api/intelliq/intervention-effectiveness — per-type breakdown ────── */
app.get('/api/intelliq/intervention-effectiveness', requireAuth, (req, res) => {
  const g = _requireInsight(req, res); if (!g) return;
  const code = g.code;  // session org — never trust a query orgCode for analytics
  const all  = orgInterventions[code] || [];

  const measured = all.filter(i => i.status === 'completed' && i.outcome?.status === 'measured');

  const byType = {};
  measured.forEach(i => {
    const type = _categorizeAction(i.action);
    if (!byType[type]) byType[type] = { total: 0, positive: 0, neutral: 0, negative: 0, moodDeltas: [], engDeltas: [] };
    byType[type].total++;
    byType[type][i.outcome.outcome]++;
    if (i.outcome.moodDelta != null) byType[type].moodDeltas.push(i.outcome.moodDelta);
    const engChange = (i.outcome.changesDetected || []).find(c => c.dimension === 'engagement');
    if (engChange) byType[type].engDeltas.push(engChange.delta || 0);
  });

  const effectiveness = Object.entries(byType).map(([type, s]) => ({
    type,
    total:              s.total,
    successRate:        Math.round(s.positive / s.total * 100),
    avgMoodDelta:       s.moodDeltas.length ? Math.round((s.moodDeltas.reduce((a, b) => a + b, 0) / s.moodDeltas.length) * 10) / 10 : null,
    avgEngagementDelta: s.engDeltas.length  ? Math.round((s.engDeltas.reduce((a, b) => a + b, 0)  / s.engDeltas.length)  * 10) / 10 : null,
    outcomes:           { positive: s.positive, neutral: s.neutral, negative: s.negative },
    verdict:            s.positive / s.total >= 0.6 ? 'effective' : s.positive / s.total >= 0.4 ? 'mixed' : 'low-impact',
  })).sort((a, b) => b.successRate - a.successRate);

  res.json({
    totalMeasured: measured.length,
    byType:        effectiveness,
    mostEffective: effectiveness[0] || null,
    hasEnoughData: measured.length >= 3,
  });
});

/* ── Learning-summary cache ───────────────────────────────────────────────── */
const learningSummaryCache = {}; // orgCode → { data, generatedAt }
const LEARNING_CACHE_TTL   = 2 * 60 * 60 * 1000; // 2 hours

/* ── GET /api/intelliq/learning-summary — org-level learning narrative ───── */
app.get('/api/intelliq/learning-summary', requireAuth, async (req, res) => {
  const { refresh } = req.query;
  const g = _requireInsight(req, res); if (!g) return;
  const code   = g.code;  // session org — never trust a query orgCode for analytics
  const cached = learningSummaryCache[code];
  if (cached && refresh !== '1' && Date.now() - cached.generatedAt < LEARNING_CACHE_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const agg  = _aggregateOrgData(code);
  const all  = orgInterventions[code] || [];

  // ── Intervention stats ─────────────────────────────────────────────────
  const measured = all.filter(i => i.status === 'completed' && i.outcome?.status === 'measured');
  const positive = measured.filter(i => i.outcome.outcome === 'positive').length;
  const intStats = {
    total:           all.length,
    completed:       all.filter(i => i.status === 'completed').length,
    measured:        measured.length,
    successRate:     measured.length > 0 ? Math.round(positive / measured.length * 100) : null,
    byType:          {},
  };
  measured.forEach(i => {
    const t = _categorizeAction(i.action);
    if (!intStats.byType[t]) intStats.byType[t] = { total: 0, positive: 0 };
    intStats.byType[t].total++;
    if (i.outcome.outcome === 'positive') intStats.byType[t].positive++;
  });

  // ── Pattern frequency ──────────────────────────────────────────────────
  const allPatterns = Object.values(agg.memberPatterns || {}).flat();
  const patternFreq = allPatterns.reduce((acc, p) => { acc[p.label] = (acc[p.label] || 0) + 1; return acc; }, {});

  // ── Monthly mood trend (last 3 months) ────────────────────────────────
  const monthlyMood = [0, 1, 2].map(n => {
    const from = Date.now() - (n + 1) * 30 * 24 * 60 * 60 * 1000;
    const to   = Date.now() - n * 30 * 24 * 60 * 60 * 1000;
    const mc   = agg.allCheckins.filter(c => c.time >= from && c.time < to);
    return { month: n === 0 ? 'current' : n === 1 ? '1 month ago' : '2 months ago', avgMood: _avgMood(mc), checkins: mc.length };
  });

  // ── Build learning data block for Claude ──────────────────────────────
  const byTypeLines = Object.entries(intStats.byType).map(([t, s]) =>
    `${t}: ${s.total} completed, ${Math.round(s.positive / s.total * 100)}% positive`
  ).join(', ');
  const patternLines = Object.entries(patternFreq).map(([l, c]) => `${l}: ${c} member(s)`).join(', ');
  const moodLine = monthlyMood.map(m => `${m.month}: ${m.avgMood ?? 'no data'}/5 (${m.checkins} check-ins)`).join(' | ');
  const predCount = Object.values(agg.memberPredictions || {}).flat().length;

  const learningBrief = [
    `ORG: ${agg.meta.orgName || code} (${agg.meta.orgMode || 'general'}) — ${agg.memberCount} members`,
    `INTERVENTION HISTORY: ${intStats.total} tracked, ${intStats.completed} completed, ${intStats.measured} measured.`,
    intStats.successRate !== null ? `Overall success rate: ${intStats.successRate}%.` : 'Not enough measured outcomes yet.',
    byTypeLines ? `By action type: ${byTypeLines}.` : '',
    patternLines ? `Current risk patterns: ${patternLines}.` : 'No current risk patterns detected.',
    `Monthly mood: ${moodLine}.`,
    predCount > 0 ? `Active trajectory predictions: ${predCount} members showing declining trends.` : '',
    `Org mood this week: ${agg.moodLast7 ?? 'no data'}/5 | Last 30d: ${agg.moodLast30 ?? 'no data'}/5.`,
    `Active this week: ${agg.activeThisWeek}/${agg.memberCount} members.`,
  ].filter(Boolean).join('\n');

  // ── Claude narrative (150 tokens, cached 2h) ──────────────────────────
  let narrative = null;
  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:     [`You are IntelliQ, a learning intelligence system. You receive a summary of what an org has done and what has worked. Write 3-4 short sentences that describe what IntelliQ has learned about this specific organisation over time: what intervention approaches work best, what patterns recur, and what the trajectory looks like. Be specific. Be honest about limited data. Do not be generic. Do not use headers or bullet points. Write as one flowing paragraph.`, _domainDirective(code)].filter(Boolean).join('\n\n'),
      messages:   [{ role: 'user', content: learningBrief }],
    });
    narrative = response.content[0]?.text?.trim() || null;
  } catch(err) {
    console.warn('learning-summary AI error:', err.message);
  }

  const result = {
    generatedAt:     new Date().toISOString(),
    cached:          false,
    domain:          _domainStamp(code),
    orgName:         agg.meta.orgName || code,
    narrative:       narrative || `IntelliQ is building its understanding of this organisation. ${intStats.total} intervention(s) tracked so far. More data will unlock richer learning.`,
    interventions:   intStats,
    patternFrequency: patternFreq,
    monthlyMood,
    currentPredictions: predCount,
    memberCount:     agg.memberCount,
  };

  learningSummaryCache[code] = { data: result, generatedAt: Date.now() };
  res.json(result);
});

function _noDataFallback(agg) {
  return {
    summary: 'Not enough data yet. Once members complete a check-in or weekly reflection, IntelliQ will synthesise what it learns here.',
    moodTrend: 'unknown', moodNote: 'No mood data collected yet.', notEnoughData: true,
    trends: { trendDirection: 'unknown', trendReason: 'No data yet.', confidenceLevel: 'low', engagementTrend: 'unknown', moodComparison: 'No data yet.' },
    semanticThemes: [], memberProfiles: [], groupInsights: [],
    recommendations: [
      { action: 'Ask members to complete their first check-in in the IntelliQ app.', urgency: 'high', owner: 'leader', reason: 'No member activity recorded yet.', evidence: [] },
      { action: 'Ensure all members have set a personal goal on first login.', urgency: 'medium', owner: 'leader', reason: `${agg.memberCount - agg.membersWithGoals.length} member(s) have no goal set.`, evidence: ['goals'] },
    ],
    memberHighlights: [], goalProgress: `${agg.membersWithGoals.length} of ${agg.memberCount} member(s) have set goals.`,
    atRisk: [], themes: [], groupHighlights: [], recommendedActions: [],
  };
}

function _buildFallbackInsight(agg) {
  const moodTrend = agg.moodLast7 === null ? 'unknown'
    : agg.moodPrevWeek !== null && agg.moodLast7 > agg.moodPrevWeek + 0.3 ? 'improving'
    : agg.moodPrevWeek !== null && agg.moodLast7 < agg.moodPrevWeek - 0.3 ? 'declining'
    : 'stable';
  const engTrend = agg.activeThisWeek >= Math.ceil(agg.memberCount * 0.7) ? 'stable' : 'declining';

  return {
    summary: `${agg.activeThisWeek} of ${agg.memberCount} members active this week.`
      + (agg.moodLast7 !== null ? ` Team mood: ${agg.moodLast7}/5.` : '')
      + (agg.atRiskComputed.length > 0 ? ` ${agg.atRiskComputed.length} member(s) need attention.` : ''),
    moodTrend, notEnoughData: false,
    moodNote: agg.moodLast7 !== null ? `Team mood ${agg.moodLast7}/5 this week.` : 'No mood data.',
    trends: {
      trendDirection: moodTrend, engagementTrend: engTrend,
      confidenceLevel: agg.moodCount7 >= 4 ? 'high' : agg.moodCount7 >= 2 ? 'medium' : 'low',
      trendReason: agg.moodLast7 !== null && agg.moodPrevWeek !== null
        ? `Mood moved from ${agg.moodPrevWeek}/5 last week to ${agg.moodLast7}/5 this week.`
        : 'Insufficient data for trend comparison.',
      moodComparison: agg.moodLast30 !== null
        ? `Last 30d avg: ${agg.moodLast30}/5 — this week: ${agg.moodLast7 ?? '—'}/5.`
        : 'No historical data yet.',
    },
    semanticThemes: [],
    memberProfiles: agg.allMembers.map(u => {
      const thisWeekC = (agg.checkinsByMember[u.name] || []).filter(c => c.isThisWeek);
      const moods     = thisWeekC.filter(c => c.mood !== null).map(c => c.mood);
      const avg       = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
      const hasGoal   = agg.membersWithGoals.some(g => g.name === u.name);
      return {
        name: u.name,
        currentState: avg !== null ? `Mood ${avg.toFixed(1)}/5 this week (${moods.length} check-ins)` : 'No check-in this week — status unknown',
        strengths: [], concerns: thisWeekC.length === 0 ? ['No check-in this week'] : [],
        goalAlignment: hasGoal ? 'unknown' : 'no_goal',
        goalAlignmentExplanation: hasGoal ? 'Insufficient check-in data for alignment analysis.' : 'No goal set.',
        riskSignals: avg !== null && avg < 2.5 ? [`Low mood avg ${avg.toFixed(1)}/5`] : [],
        recommendedAction: avg !== null && avg < 2.5 ? `Check in with ${u.name} directly this week.`
          : thisWeekC.length === 0 ? `Nudge ${u.name} to check in.` : '',
      };
    }),
    groupInsights: agg.groupData.filter(g => g.memberCount > 0).map(g => ({
      groupName: g.name,
      mood: g.avgMood === null ? 'unknown' : g.avgMood >= 4 ? 'high' : g.avgMood >= 3 ? 'okay' : 'low',
      engagement: g.memberCount === 0 ? 'low' : g.activeCount / g.memberCount >= 0.7 ? 'high' : g.activeCount > 0 ? 'medium' : 'low',
      recurringThemes: [], riskSignals: [], positiveSignals: [],
      membersNeedingAttention: [], suggestedAction: '',
    })),
    recommendations: agg.atRiskComputed.slice(0, 3).map(r => ({
      action: `Check in with ${r.name} — ${r.reason.toLowerCase()}.`,
      urgency: r.urgency, owner: 'leader', reason: r.reason, evidence: ['checkins'],
    })),
    memberHighlights: [],
    goalProgress: `${agg.membersWithGoals.length} of ${agg.memberCount} members have set goals.`,
    atRisk: agg.atRiskComputed.slice(0, 3),
    themes: [], groupHighlights: [],
    recommendedActions: agg.atRiskComputed.slice(0, 2).map(r => ({ priority: r.urgency, action: `Check in with ${r.name}.` })),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STARTUP — Postgres init → load stores → start HTTP server
   ═══════════════════════════════════════════════════════════════════════════ */

/* Populate all in-memory store objects from a loaded data blob.
   Uses Object.assign so the existing const references stay valid. */
function _loadAllStores(data) {
  Object.assign(orgMeta,          data.orgMeta          || {});
  Object.assign(orgUsers,         data.orgUsers         || {});
  Object.assign(inviteTokens,     data.inviteTokens     || {});
  Object.assign(emailIndex,       data.emailIndex       || {});
  Object.assign(pendingInvites,   data.pendingInvites   || {});
  Object.assign(orgNodes,         data.orgNodes         || {});
  Object.assign(orgMetrics,       data.orgMetrics       || {});
  Object.assign(orgValues,        data.orgValues        || {});
  Object.assign(orgGoals,         data.orgGoals         || {});
  Object.assign(userPermissions,  data.userPermissions  || {});
  Object.assign(orgGroups,        data.orgGroups        || {});
  Object.assign(orgNotes,         data.orgNotes         || {});
  Object.assign(orgMessages,      data.orgMessages      || {});
  Object.assign(orgStore,         data.orgStore         || {});
  Object.assign(assignedScenarios,data.assignedScenarios|| {});
  Object.assign(memberResults,    data.memberResults    || {});
  Object.assign(memberCheckins,   data.memberCheckins   || {});
  Object.assign(memberGoals,      data.memberGoals      || {});
  Object.assign(weeklyAssessments,data.weeklyAssessments|| {});
  Object.assign(orgInterventions, data.orgInterventions || {});
  Object.assign(userAiProfiles,   data.userAiProfiles   || {});
  Object.assign(advisorThreads,   data.advisorThreads   || {});
  Object.assign(userConsents,     data.userConsents     || {});
  Object.assign(connectedSources, data.connectedSources || {});
  Object.assign(pendingActions,   data.pendingActions   || {});
  Object.assign(assessmentTemplates,   data.assessmentTemplates   || {});
  Object.assign(assessmentAssignments, data.assessmentAssignments || {});
  Object.assign(orgTutorials,          data.orgTutorials          || {});
  Object.assign(orgApiTokens,          data.orgApiTokens          || {});
  Object.assign(orgConnections,        data.orgConnections        || {});
  Object.assign(orgOAuthApps,          data.orgOAuthApps          || {});
  Object.assign(studioThreads,         data.studioThreads         || {});
  Object.assign(orgSignals,       data.orgSignals       || {});
  Object.assign(noticeFeedback,   data.noticeFeedback   || {});
  Object.assign(rawEvidence,      data.rawEvidence      || {});
  Object.assign(evidenceLog,      data.evidenceLog      || {});
  Object.assign(orgMappings,      data.orgMappings      || {});
  Object.assign(syncRuns,         data.syncRuns         || {});
  Object.assign(failedRecords,    data.failedRecords    || {});
  Object.assign(webhookDeliveries,data.webhookDeliveries|| {});
  Object.assign(orgPolicies,      data.orgPolicies      || {});
  Object.assign(actionsLog,       data.actionsLog       || {});
  Object.assign(orgCalendar,      data.orgCalendar      || {});
  Object.assign(workspaceItems,   data.workspaceItems   || {});
  Object.assign(reasoningArtifacts, data.reasoningArtifacts || {});
  _rebuildEvidenceIndex();
  // Restore sessions, pruning any that expired while the server was down
  const _now = Date.now();
  const _savedSessions = data.activeSessions || {};
  for (const [token, s] of Object.entries(_savedSessions)) {
    if (s.expiresAt > _now) activeSessions[token] = s;
  }
  console.log(`[sessions] Restored ${Object.keys(activeSessions).length} active session(s) from Postgres`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROBUSTNESS — registered AFTER all routes.
   - Unknown /api/* paths return a clean 404 JSON instead of the SPA HTML.
   - Any error thrown in a route (or a malformed JSON body) is caught here and
     returned as JSON instead of crashing the process or leaking a stack trace.
   ═══════════════════════════════════════════════════════════════════════════ */
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Unknown API endpoint: ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars  (Express needs the 4-arg signature)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  // Body-parser raises a 400 for malformed JSON — surface it cleanly.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  console.error(`[error] ${req.method} ${req.originalUrl} →`, err.message);
  if (res.headersSent) return next(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our end. Please try again.' : err.message });
});

const PORT = process.env.PORT || 3000;

// Export a minimal surface for the endpoint smoke test (in-process, DB_OPTIONAL).
// Requiring this module never boots a listener — only running it directly does.
module.exports = { app, _loadAllStores, _rebuildEmailIndex, issueToken, _purgeExpired,
  // exported for the truth layer: proves the role ladder never invents a title
  _subjectRoleContext, _domainDirective,
  // exported for the truth layer: the canonical evidence boundary + identity lifecycle
  _ingestGeneric, _recordEvidence, _reresolveUnmatched, _promoteEvidence, evidenceLog, rawEvidence, orgSignals, orgUsers,
  // exported for the truth layer: the mapping approval lifecycle
  _proposeMapping, _reprocessHeld, _activeMapping, orgMappings,
  // exported for the truth layer: sync reliability
  _runConnection, _processBatch, _markDeletedAtSource, _newSyncRun, _recordFailure, _openFailures,
  syncRuns, failedRecords, webhookDeliveries, orgConnections, _syncLocks,
  // exported for the truth layer: the execution layer
  orgPolicies, actionsLog, _policiesFor, orgInterventions, orgCalendar,
  // exported for the truth layer: reasoning boundaries + workspace
  _interpretInput, _kernelEvidence, _isCanonicalEvidence, _recordKernelDerivation, _composeForAudience,
  _recordDerivedEvidence, _deleteWorkspaceEvidence, reasoningArtifacts, workspaceItems,
  // exported for the truth layer: legacy convergence
  _ingestAdapterEvidence, _canonicalContext, _backfillCanonical, _canonicaliseCheckin, memberCheckins, assessmentAssignments,
  // exported for the truth layer: the member-advisor migration (canonical + kernel + post-kernel)
  _advisorKernelReasoning, advisorThreads, orgGroups, orgValues, orgGoals,
  // exported for the truth layer: the daily check-in migration (canonical-only intelligence)
  _checkinKernelState, _canonicalMoodSeries, _memberMoodSeries, _isSourceEvidence, _checkinInterventionState, orgInterventions,
  // exported for the truth layer: check-in hardening (frozen signal, reconciliation, classification audit)
  _emitCheckinParticipationSignal, CHECKIN_SIGNAL_CONTRACT, _checkinAggregateReconciliation, _checkinClassificationAudit, checkinClassificationLog,
  // exported for the truth layer: assigned-work → canonical evidence (MyWorkspace)
  _canonicaliseCommitment, _canonicaliseSubmission, _canonicaliseAssessment, _assessmentEvidenceFor, _assignmentProgress,
  // exported for the truth layer: complete-assessment consumption (scale-aware kernel state)
  _assessmentKernelState, _assessmentConcerns, _scaleMax, _assessmentComparableKey, _buildMemberIntelInput };

if (require.main === module) (async () => {
  try {
    // 1. Connect to Postgres + create schema
    await db.init();

    // 2. Load persisted data
    let storeData = await db.loadMain();

    // 3. One-time migration: if Postgres is empty and store.json still exists,
    //    copy it into Postgres so no existing data is lost on first deploy.
    if (Object.keys(storeData).length === 0 && fs.existsSync(STORE_FILE)) {
      console.log('[db] Postgres is empty — migrating from store.json...');
      try {
        const jsonData = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        await db.saveMain(jsonData);
        storeData = jsonData;
        console.log('[db] Migration complete ✓  store.json data is now in Postgres.');
        console.log('[db] You can delete data/store.json — it will no longer be used.');
      } catch (e) {
        console.warn('[db] Migration skipped (store.json unreadable):', e.message);
      }
    }

    // 4. Populate in-memory stores
    _loadAllStores(storeData);

    // 5. Repair emailIndex (handles any missing entries from loaded data)
    _rebuildEmailIndex();

    // 5a2. Optional demo seed on boot — for hosts with no shell (e.g. Render free
    //      tier). Set SEED_DEMO=1 to add the demo squad; idempotent (skips if the
    //      demo org already exists) and additive (never wipes other orgs).
    // Optional demo seeds on boot (no shell needed). SEED_DEMO → athletic squad,
    // SEED_COMPANY → business team. '1' is idempotent; 'force' re-seeds.
    const _seedOnBoot = async (flag, build, code, creds) => {
      const v = process.env[flag];
      if (v !== '1' && v !== 'force') return;
      try {
        const seed = require('./scripts/seed');
        if (v === 'force' || !orgMeta[code]) {
          const demo = await seed[build]();
          _loadAllStores(demo);          // additive merge into the in-memory stores
          _rebuildEmailIndex();
          scheduleSave();
          const n = Object.keys(demo.orgUsers[code] || {}).length;
          console.log(`[seed] ✓ ${flag}=${v} — ready (${n} users in ${code}). ${creds}`);
        } else {
          console.log(`[seed] ${flag}=1 but ${code} already present — skipping (use ${flag}=force to re-seed).`);
        }
      } catch (e) { console.warn(`[seed] ${flag} boot seed failed (non-fatal):`, e.message); }
    };
    await _seedOnBoot('SEED_DEMO',    'buildDemoStore',        require('./scripts/seed').DEMO_CODE,    'Log in: coach@demo.club / maya@demo.club — password demo1234.');
    await _seedOnBoot('SEED_COMPANY', 'buildCompanyDemoStore', require('./scripts/seed').COMPANY_CODE, 'Log in: manager@atlas.demo / marcus@atlas.demo — password demo1234.');

    // SEED_CLUB → the full-scale demo club (Trafford United, ~226 people, ~1yr).
    // '1' seeds once and skips if already present; 'force' re-seeds. Same idempotent,
    // additive contract as the others, but its builder returns { store, summary }.
    if (process.env.SEED_CLUB === '1' || process.env.SEED_CLUB === 'force') {
      try {
        const { buildClubStore, CLUB_CODE } = require('./scripts/seed-club');
        if (process.env.SEED_CLUB === 'force' || !orgMeta[CLUB_CODE]) {
          const { store, summary } = await buildClubStore();
          _loadAllStores(store);        // additive merge into the in-memory stores
          _rebuildEmailIndex();
          scheduleSave();
          console.log(`[seed] ✓ SEED_CLUB — ${summary.orgName} ready (${summary.users} users, org "${CLUB_CODE}"). Log in (password demo1234): director@trafford.fc · coach@trafford.fc · player@trafford.fc`);
        } else {
          console.log(`[seed] SEED_CLUB=1 but ${CLUB_CODE} already present — skipping (SEED_CLUB=force to re-seed).`);
        }
      } catch (e) { console.warn('[seed] SEED_CLUB boot seed failed (non-fatal):', e.message); }
    }

    // 5b. Derive user.assignedNodeIds / user.leadershipNodeIds from orgNodes
    _backfillUserNodeIds();

    // 5c. Optional pgvector for cross-member similarity — only if embeddings are
    //     configured. Fully non-fatal; disables itself and falls back otherwise.
    if (embeddings.enabled()) {
      try { await db.initVectors(embeddings.DIM); }
      catch (e) { console.warn('[db] initVectors failed (non-fatal):', e.message); }
    } else {
      console.log('[db] embeddings not configured — cross-member similarity uses rule-based fallback');
    }

    // 5d. Data retention (GDPR storage limitation) — purge expired personal data
    //     on boot, then daily. Runs only in the live server (never in test mode).
    _purgeExpired();
    setInterval(() => { try { _purgeExpired(); } catch (e) { console.warn('[retention] purge failed:', e.message); } }, 24 * 60 * 60 * 1000).unref();

    // Connection poller — every 20 min. Respects pause, backoff (nextAttemptAt),
    // and rate-limit; processes a BOUNDED number per tick and round-robins across
    // orgs so one large connection can't starve the others (fair scheduling).
    setInterval(async () => {
      const now = Date.now();
      const MAX_PER_TICK = 25;
      const due = [];
      for (const [code, list] of Object.entries(orgConnections)) {
        for (const conn of (list || [])) {
          if (conn.paused || conn.running || !conn.url) continue;
          if (conn.nextAttemptAt && now < new Date(conn.nextAttemptAt).getTime()) continue;   // honour backoff / Retry-After
          const dueMs = (conn.scheduleHours || 24) * 3600000;
          const last = conn.lastAttemptedSync ? new Date(conn.lastAttemptedSync).getTime() : 0;
          const ready = conn.nextAttemptAt ? true : (now - last >= dueMs);
          if (ready) due.push([code, conn]);
        }
      }
      // Round-robin by org for fairness, cap the batch.
      due.sort(() => 0); // stable; fairness comes from the cap + per-connection lock
      for (const [code, conn] of due.slice(0, MAX_PER_TICK)) { try { await _runConnection(code, conn, { trigger: 'poll' }); } catch (_) {} }
    }, 20 * 60 * 1000).unref();

    // 6. Start HTTP server
    app.listen(PORT, () => {
      console.log('');
      console.log(`[server] ✓ IntelliQ ready on port ${PORT}`);
      console.log(`[server]   API key: ${process.env.ANTHROPIC_API_KEY ? '✓ loaded' : '✗ MISSING — set ANTHROPIC_API_KEY'}`);
      console.log(`[server]   Persistence: Neon Postgres (DATABASE_URL)`);
      console.log(`[server]   Retention: ${RETENTION_DAYS} days (RETENTION_DAYS to override)`);
      console.log('');
    });

  } catch (err) {
    console.error('[server] FATAL startup error:', err.message);
    process.exit(1);
  }
})();
