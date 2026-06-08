require('dotenv').config();
const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const path      = require('path');

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

/* ─── REFLECTION SYSTEM PROMPT ─────────────────────────────────────────── */
function buildReflectionPrompt(orgMode, orgName) {
  const ctx = {
    school:     'students in a school environment. Academic pressure, peer relationships, behaviour, and moral development are common themes.',
    sports:     'athletes in a sports club. Performance pressure, team dynamics, coaching relationships, and mental resilience are common themes.',
    workplace:  'employees in a workplace. Professional conduct, leadership, team conflict, stress, and work-life balance are common themes.',
    military:   'personnel in a military unit. Discipline, command decisions, ethics under pressure, and stress management are common themes.',
    healthcare: 'healthcare workers. Patient care decisions, ethical dilemmas, burnout, and high-stakes stress are common themes.',
    government: 'government officials and public servants. Policy decisions, integrity, public accountability, and crisis management are common themes.',
  };

  return `You are the IntelliQ Reflection Assistant — an empathetic, intelligent AI coach embedded in the IntelliQ platform used by ${orgName}.

You are speaking with ${ctx[orgMode] || 'individuals in a professional or institutional environment.'}

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
function buildScenarioPrompt(orgMode, orgName, title, context, memberName, difficulty, opening = null, probes = null) {
  const difficultyNote = {
    easy:   'Start with a clear, straightforward situation. Keep the stakes moderate.',
    medium: 'Present a situation with genuine tension and no obvious right answer.',
    hard:   'Create high-stakes complexity with competing obligations, time pressure, and moral ambiguity.',
  }[difficulty] || 'Present a situation with genuine tension and no obvious right answer.';

  return `You are the IntelliQ Scenario Facilitator — an intelligent evaluator running a live decision-making assessment in the IntelliQ platform used by ${orgName}.

You are assessing ${memberName} using a scenario in the domain: "${title}".
SCENARIO CONTEXT: ${context}
DIFFICULTY: ${difficultyNote}
${opening ? `\nAPPROVED OPENING — use this exact opening to begin:\n"${opening}"\n` : ''}
${probes?.length ? `\nAPPROVED PROBE FRAMEWORK — the coach has pre-approved these follow-up angles. Use them as your guide but adapt naturally to what ${memberName} says:\n${probes.map((p, i) => `${i+1}. ${p}`).join('\n')}\n` : ''}
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
    memberName,
    scenarioContext,    // reflection mode: completed scenario summary
    promptType,         // 'reflection' (default) | 'scenario'
    scenarioRunContext, // scenario mode: { title, context, difficulty, opening, probes, image }
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    let systemPrompt;

    if (promptType === 'scenario') {
      const sc = scenarioRunContext || {};
      systemPrompt = buildScenarioPrompt(
        orgMode || 'school',
        orgName  || 'your organisation',
        sc.title || 'Decision Making',
        sc.context || 'A challenging workplace or social situation',
        memberName || 'the member',
        sc.difficulty || 'medium',
        sc.opening  || null,
        sc.probes   || null
      );
    } else {
      systemPrompt = buildReflectionPrompt(orgMode || 'school', orgName || 'your organisation');
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
      system:     systemPrompt,
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

/* ─── SCENARIO DRAFT ENDPOINT ───────────────────────────────────────────
   Coach submits a plain-language brief. Claude drafts a scenario:
   opening situation, 3-5 probing questions, and a coaching note.
   Coach reviews and approves before it ever reaches the member.
   ────────────────────────────────────────────────────────────────────── */
app.post('/api/draft-scenario', async (req, res) => {
  const { brief, orgMode, orgName, memberName, difficulty, image } = req.body;
  if (!brief) return res.status(400).json({ error: 'brief required' });

  const hasImage = image && image.data && image.mediaType;

  const systemPrompt = `You are an expert scenario designer for IntelliQ, a performance intelligence platform used by ${orgName || 'an organisation'}.

A coach/professional has written a brief about a member. Your job is to draft a scenario that will be used to assess that member's decision-making, reasoning, and self-awareness.

ORGANISATION TYPE: ${orgMode || 'school'}
MEMBER: ${memberName || 'the member'}
DIFFICULTY: ${difficulty || 'medium'}
${hasImage ? '\nAn image has been attached by the coach. Build the scenario around what is shown in the image — reference specific elements the member should notice and respond to.' : ''}

OUTPUT FORMAT — respond with valid JSON only, no extra text:
{
  "opening": "The vivid opening situation (2-3 sentences). ${hasImage ? 'Reference the image directly — e.g. \"Take a look at the clip/diagram/sheet below.\" Then set the scene.' : 'Ground it in reality.'} Do not resolve the tension.",
  "probes": [
    "First follow-up — references something specific in the image or brief",
    "Second follow-up — introduces a complication or raises stakes",
    "Third follow-up — tests self-awareness or understanding"
  ],
  "coachNote": "What this scenario is designed to reveal, and what strong vs weak responses look like. 2-3 sentences. Reference the image content if relevant.",
  "title": "A short scenario title (3-6 words)"
}

RULES:
- The opening must feel real and specific
- Do not make the right answer obvious
- The probes should escalate
- The coachNote is private — never shown to the member
- Adapt to the org type`;

  // Build message content — include image if provided
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
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    });

    const raw = response.content[0]?.text || '';
    // Strip markdown code fences if present
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

/* ─── COACH DEBRIEF ENDPOINT ────────────────────────────────────────────
   After a member completes a scenario, generates a private debrief
   for the coach: what the responses reveal + recommended actions.
   Never shown to the member.
   ────────────────────────────────────────────────────────────────────── */
app.post('/api/coach-debrief', async (req, res) => {
  const { conversation, scores, memberName, scenarioTitle, orgMode, orgName, coachRole } = req.body;
  if (!conversation || !scores) return res.status(400).json({ error: 'conversation and scores required' });

  const systemPrompt = `You are an expert performance analyst for IntelliQ, used by ${orgName || 'an organisation'}.

You are writing a private debrief for a ${coachRole || 'coach/supervisor'} — NOT for the member. The member will never see this.

Your job: analyse ${memberName}'s responses to the "${scenarioTitle}" scenario and give the coach practical, specific guidance.

ORGANISATION TYPE: ${orgMode || 'school'}

OUTPUT FORMAT — valid JSON only:
{
  "headline": "One sentence summary of the most important thing the coach should know",
  "whatThisReveals": "2-3 sentences on what ${memberName}'s reasoning pattern shows — not just the score, but the WHY behind it. What does this tell you about how they think?",
  "watchFor": ["Specific behaviour or pattern to observe in real situations", "Another thing to monitor"],
  "coachingActions": ["Concrete action the coach can take this week", "A second specific action", "Optional third action"],
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
      system:     systemPrompt,
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
   Simple in-memory store. Replace with Postgres/Redis for production.
   ═══════════════════════════════════════════════════════════════════════════ */

const orgMeta  = {};  // orgCode → { orgName, orgMode, createdAt }
const orgUsers = {};  // orgCode → { userId → userObject }
const inviteTokens = {}; // token → { orgCode, role, supervisorId, expiresAt }

function generateId()    { return Math.random().toString(36).slice(2,10); }
function generateToken() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
function simpleHash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(16); }
function toOrgCode(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }

/* ── Setup new org (first super admin) ─────────────────────────────────── */
app.post('/api/auth/setup-org', (req, res) => {
  const { orgName, orgMode, adminName, password } = req.body;
  if (!orgName || !adminName || !password) return res.status(400).json({ error: 'Missing fields' });

  const orgCode = toOrgCode(orgName);
  if (orgUsers[orgCode] && Object.keys(orgUsers[orgCode]).length > 0) {
    return res.status(400).json({ error: 'Organisation already exists. Ask your admin for an invite.' });
  }

  const userId = generateId();
  orgMeta[orgCode]  = { orgName, orgMode: orgMode || 'school', createdAt: new Date().toISOString() };
  orgUsers[orgCode] = {};
  orgUsers[orgCode][userId] = {
    id:           userId,
    name:         adminName,
    role:         'superadmin',
    orgCode,
    supervisorId: null,
    passwordHash: simpleHash(password),
    createdAt:    new Date().toISOString(),
    levelId:      1,
  };

  res.json({ ok: true, orgCode, userId, orgName, role: 'superadmin' });
});

/* ── Login ──────────────────────────────────────────────────────────────── */
app.post('/api/auth/login', (req, res) => {
  const { orgCode, name, password } = req.body;
  const code  = (orgCode || '').toLowerCase().trim();
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Organisation not found. Check your org code.' });

  const user = Object.values(users).find(u =>
    u.name.toLowerCase() === name.toLowerCase().trim() &&
    u.passwordHash === simpleHash(password)
  );
  if (!user) return res.status(401).json({ error: 'Name or password incorrect.' });

  const org = orgMeta[code];
  res.json({ ok: true, user: { ...user, passwordHash: undefined }, org });
});

/* ── Create user (admin/coach adds someone below them) ─────────────────── */
app.post('/api/auth/create-user', (req, res) => {
  const { orgCode, creatorId, name, role, supervisorId, password } = req.body;
  const code  = (orgCode || '').toLowerCase();
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Org not found' });

  const creator = users[creatorId];
  if (!creator) return res.status(403).json({ error: 'Creator not found' });

  // Role hierarchy check — can't create someone at same level or higher
  const roleLevel = { superadmin:1, admin:2, coach:3, member:4 };
  if (roleLevel[role] <= roleLevel[creator.role] && creator.role !== 'superadmin') {
    return res.status(403).json({ error: 'You cannot create someone at or above your level' });
  }

  // Check name uniqueness in org
  const exists = Object.values(users).find(u => u.name.toLowerCase() === name.toLowerCase().trim());
  if (exists) return res.status(400).json({ error: 'Someone with that name already exists in this org' });

  const userId = generateId();
  const isDefaultPassword = !password; // no explicit password = default = name in lowercase
  users[userId] = {
    id:           userId,
    name:         name.trim(),
    role,
    orgCode:      code,
    supervisorId: supervisorId || creatorId,
    passwordHash: simpleHash(password || name.trim().toLowerCase()),
    passwordSet:  !isDefaultPassword, // false = member needs to set their own password
    createdAt:    new Date().toISOString(),
    levelId:      roleLevel[role],
  };

  res.json({ ok: true, user: { ...users[userId], passwordHash: undefined } });
});

/* ── Bulk create users from CSV ─────────────────────────────────────────── */
app.post('/api/auth/bulk-create', (req, res) => {
  const { orgCode, creatorId, users: newUsers, role, supervisorId } = req.body;
  const code  = (orgCode || '').toLowerCase();
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Org not found' });

  const created = [], skipped = [];
  (newUsers || []).forEach(name => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const exists = Object.values(users).find(u => u.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) { skipped.push(trimmed); return; }
    const userId = generateId();
    const roleLevel = { superadmin:1, admin:2, coach:3, member:4 };
    users[userId] = {
      id: userId, name: trimmed, role: role || 'member', orgCode: code,
      supervisorId: supervisorId || creatorId,
      passwordHash: simpleHash(trimmed.toLowerCase()),
      passwordSet:  false, // bulk-created users always need to set their own password
      createdAt:    new Date().toISOString(),
      levelId:      roleLevel[role] || 4,
    };
    created.push({ name: trimmed, password: trimmed.toLowerCase() });
  });

  res.json({ ok: true, created, skipped });
});

/* ── Generate invite link ───────────────────────────────────────────────── */
app.post('/api/auth/invite', (req, res) => {
  const { orgCode, role, supervisorId } = req.body;
  const token = generateToken();
  inviteTokens[token] = {
    orgCode: orgCode.toLowerCase(),
    role: role || 'member',
    supervisorId,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  res.json({ ok: true, token, url: `/join?invite=${token}` });
});

/* ── Join via invite ────────────────────────────────────────────────────── */
app.post('/api/auth/join-invite', (req, res) => {
  const { token, name, password } = req.body;
  const invite = inviteTokens[token];
  if (!invite) return res.status(404).json({ error: 'Invalid or expired invite link' });
  if (invite.expiresAt < Date.now()) return res.status(410).json({ error: 'Invite link has expired' });

  const code  = invite.orgCode;
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Organisation not found' });

  const exists = Object.values(users).find(u => u.name.toLowerCase() === name.toLowerCase().trim());
  if (exists) return res.status(400).json({ error: 'That name is already taken in this org' });

  const roleLevel = { superadmin:1, admin:2, coach:3, member:4 };
  const userId = generateId();
  users[userId] = {
    id: userId, name: name.trim(), role: invite.role, orgCode: code,
    supervisorId: invite.supervisorId,
    passwordHash: simpleHash(password),
    createdAt: new Date().toISOString(),
    levelId: roleLevel[invite.role] || 4,
  };

  const org = orgMeta[code];
  res.json({ ok: true, user: { ...users[userId], passwordHash: undefined }, org });
});

/* ── Get org hierarchy tree ─────────────────────────────────────────────── */
app.get('/api/auth/org-tree', (req, res) => {
  const { orgCode } = req.query;
  const code  = (orgCode || '').toLowerCase();
  const users = orgUsers[code];
  if (!users) return res.status(404).json({ error: 'Org not found' });

  // Build tree from flat list
  const all   = Object.values(users).map(u => ({ ...u, passwordHash: undefined, children: [] }));
  const byId  = {};
  all.forEach(u => byId[u.id] = u);

  const roots = [];
  all.forEach(u => {
    if (!u.supervisorId || !byId[u.supervisorId]) roots.push(u);
    else byId[u.supervisorId].children.push(u);
  });

  res.json({ ok: true, tree: roots, flat: all });
});

/* ── Update user ────────────────────────────────────────────────────────── */
app.put('/api/auth/update-user', (req, res) => {
  const { orgCode, userId, updates } = req.body;
  const users = orgUsers[(orgCode||'').toLowerCase()];
  if (!users || !users[userId]) return res.status(404).json({ error: 'User not found' });
  const safe = ['name','role','supervisorId','group'];
  safe.forEach(k => { if (updates[k] !== undefined) users[userId][k] = updates[k]; });
  if (updates.password) users[userId].passwordHash = simpleHash(updates.password);
  res.json({ ok: true, user: { ...users[userId], passwordHash: undefined } });
});

/* ── Delete user ────────────────────────────────────────────────────────── */
app.delete('/api/auth/delete-user', (req, res) => {
  const { orgCode, userId } = req.body;
  const users = orgUsers[(orgCode||'').toLowerCase()];
  if (!users || !users[userId]) return res.status(404).json({ error: 'User not found' });
  delete users[userId];
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   GROUPS — Sub-teams within an org
   Members can belong to multiple groups (QB room, Offense, Starters, etc.)
   Each group has its own notes feed, anonymous channel, and messages.
   ═══════════════════════════════════════════════════════════════════════════ */

// orgGroups: orgCode → [ { id, name, description, memberIds[], leadIds[], createdAt } ]
const orgGroups = {};

// notes: noteId → { id, orgCode, groupId|null, authorId, authorName, content, type, aiResponse, createdAt }
// type: 'private' | 'shared' | 'anonymous'
const orgNotes = {};

// messages: msgId → { id, orgCode, fromId, fromName, toType:'user'|'group'|'org', toId, content, anonymous, createdAt, readBy:[] }
const orgMessages = {};

function noteId()   { return 'n_'  + generateId(); }
function msgId()    { return 'm_'  + generateId(); }
function groupId()  { return 'grp_'+ generateId(); }

/* ── Create group ─────────────────────────────────────────────────────────── */
app.post('/api/groups/create', (req, res) => {
  const { orgCode, name, description, memberIds, leadIds } = req.body;
  if (!orgCode || !name) return res.status(400).json({ error: 'orgCode and name required' });
  const code = orgCode.toLowerCase().trim();
  if (!orgGroups[code]) orgGroups[code] = [];
  const group = { id: groupId(), name, description: description || '', memberIds: memberIds || [], leadIds: leadIds || [], createdAt: new Date().toISOString() };
  orgGroups[code].push(group);
  res.json({ ok: true, group });
});

/* ── List groups for org ─────────────────────────────────────────────────── */
app.get('/api/groups', (req, res) => {
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  res.json({ groups: orgGroups[orgCode.toLowerCase().trim()] || [] });
});

/* ── Update group (add/remove members, rename) ───────────────────────────── */
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
  res.json({ ok: true, group: g });
});

/* ── Delete group ─────────────────────────────────────────────────────────── */
app.delete('/api/groups/:groupId', (req, res) => {
  const { orgCode } = req.body;
  const code = orgCode?.toLowerCase().trim();
  if (!orgGroups[code]) return res.status(404).json({ error: 'Org not found' });
  orgGroups[code] = orgGroups[code].filter(g => g.id !== req.params.groupId);
  res.json({ ok: true });
});

/* ═══════════════════════════════════════════════════════════════════════════
   NOTES — Private / Shared / Anonymous
   Private:   author + AI only
   Shared:    author + group members + leads
   Anonymous: group sees content, not author name
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Create note ─────────────────────────────────────────────────────────── */
app.post('/api/notes', async (req, res) => {
  const { orgCode, authorId, authorName, content, type, groupId: gid, orgMode, orgName, goals } = req.body;
  if (!orgCode || !authorId || !content || !type) return res.status(400).json({ error: 'missing fields' });

  const id   = noteId();
  const note = {
    id, orgCode: orgCode.toLowerCase().trim(),
    groupId: gid || null,
    authorId, authorName,
    content, type,
    createdAt: new Date().toISOString(),
    aiResponse: null,
  };
  orgNotes[id] = note;

  // AI responds to private and anonymous notes
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
        system: prompts[type] || prompts.private,
        messages: [{ role: 'user', content: userMsg }],
      });
      note.aiResponse = response.content[0]?.text?.trim() || null;
    } catch(e) { /* non-critical */ }
  }

  res.json({ ok: true, note: _sanitizeNote(note, authorId) });
});

/* ── Get notes (filtered by requester's access) ──────────────────────────── */
app.get('/api/notes', (req, res) => {
  const { orgCode, requesterId, groupId: gid, type } = req.query;
  if (!orgCode || !requesterId) return res.status(400).json({ error: 'missing fields' });
  const code = orgCode.toLowerCase().trim();

  // Get groups this requester belongs to (as member or lead)
  const myGroups = (orgGroups[code] || []).filter(g =>
    g.memberIds.includes(requesterId) || g.leadIds.includes(requesterId)
  ).map(g => g.id);

  const notes = Object.values(orgNotes)
    .filter(n => {
      if (n.orgCode !== code) return false;
      if (gid && n.groupId !== gid) return false;
      if (type && n.type !== type) return false;
      // Private: only author sees it
      if (n.type === 'private') return n.authorId === requesterId;
      // Shared/anonymous: requester must be in the group (or it's an org-wide note)
      if (n.groupId) return myGroups.includes(n.groupId) || n.authorId === requesterId;
      return n.authorId === requesterId;
    })
    .map(n => _sanitizeNote(n, requesterId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ notes });
});

function _sanitizeNote(note, requesterId) {
  // Anonymous notes: hide author name/id from everyone except the author
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
    _realFromId: fromId, // never exposed to non-author
    toType, toId: toId || null,
    content, anonymous: !!anonymous,
    createdAt: new Date().toISOString(),
    readBy: [],
  };
  orgMessages[id] = msg;
  res.json({ ok: true, messageId: id });
});

/* ── Get messages for a user/group ───────────────────────────────────────── */
app.get('/api/messages', (req, res) => {
  const { orgCode, requesterId, groupId: gid, toType } = req.query;
  if (!orgCode || !requesterId) return res.status(400).json({ error: 'missing fields' });
  const code = orgCode.toLowerCase().trim();

  // Groups requester is in
  const myGroups = (orgGroups[code] || []).filter(g =>
    g.memberIds.includes(requesterId) || g.leadIds.includes(requesterId)
  ).map(g => g.id);

  const msgs = Object.values(orgMessages)
    .filter(m => {
      if (m.orgCode !== code) return false;
      if (gid && m.toId !== gid) return false;
      if (toType && m.toType !== toType) return false;
      // Sent by me
      if (m._realFromId === requesterId) return true;
      // Sent to me directly
      if (m.toType === 'user' && m.toId === requesterId) return true;
      // Sent to a group I'm in
      if (m.toType === 'group' && myGroups.includes(m.toId)) return true;
      // Sent to org
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
  res.json({ ok: true });
});

function _sanitizeMsg(msg, requesterId) {
  // Anonymous: hide real sender from everyone except themselves
  if (msg.anonymous && msg._realFromId !== requesterId) {
    const { _realFromId, ...safe } = msg;
    return safe;
  }
  const { _realFromId, ...safe } = msg;
  return safe;
}

/* ── Platform: get group feed (shared + anonymous notes + messages) ─────── */
app.get('/api/groups/:groupId/feed', (req, res) => {
  const { orgCode, requesterId } = req.query;
  if (!orgCode || !requesterId) return res.status(400).json({ error: 'missing fields' });
  const code = orgCode.toLowerCase().trim();
  const gid  = req.params.groupId;

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

/* ══════════════════════════════════════════════════════════════════════════
   MEMBER APP — SHARED SESSION STORE
   In-memory bridge between Platform (coach) and Member App (Timmy).
   Replace with a real DB (Postgres/Redis) when persistence is needed.
   ═══════════════════════════════════════════════════════════════════════════ */

// orgStore: orgCode → { orgName, orgMode }
const orgStore = {};

// assignedScenarios: orgCode:memberKey → [ scenario objects ]
const assignedScenarios = {};

// memberResults: orgCode:memberKey → [ result objects ]
const memberResults = {};

// checkins: orgCode:memberKey → [ checkin objects ]
const memberCheckins = {};

function memberKey(orgCode, memberName) {
  return `${orgCode.toLowerCase().trim()}:${memberName.toLowerCase().trim()}`;
}

/* ── Platform registers org (called on login) ───────────────────────────── */
app.post('/api/platform/register-org', (req, res) => {
  const { orgCode, orgName, orgMode } = req.body;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  orgStore[orgCode.toLowerCase().trim()] = { orgName, orgMode };
  res.json({ ok: true });
});

/* ── Platform assigns a scenario to a member ────────────────────────────── */
app.post('/api/platform/assign-scenario', (req, res) => {
  const { orgCode, memberName, scenario } = req.body;
  if (!orgCode || !memberName || !scenario) {
    return res.status(400).json({ error: 'orgCode, memberName and scenario required' });
  }
  const key = memberKey(orgCode, memberName);
  if (!assignedScenarios[key]) assignedScenarios[key] = [];
  // Avoid duplicates by scenario id
  if (!assignedScenarios[key].find(s => s.id === scenario.id)) {
    assignedScenarios[key].push({ ...scenario, assignedAt: new Date().toISOString(), status: 'pending' });
  }
  res.json({ ok: true, total: assignedScenarios[key].length });
});

/* ── Member joins org ───────────────────────────────────────────────────── */
app.post('/api/member/join', (req, res) => {
  const { orgCode, memberName } = req.body;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'orgCode and memberName required' });
  const code = orgCode.toLowerCase().trim();
  const org  = orgStore[code];
  // Allow join even if org not pre-registered (demo mode)
  res.json({
    ok:         true,
    orgName:    org?.orgName  || orgCode,
    orgMode:    org?.orgMode  || 'school',
    memberName: memberName.trim(),
    orgCode:    code,
  });
});

/* ── Member gets pending scenarios ─────────────────────────────────────── */
app.get('/api/member/pending', (req, res) => {
  const { orgCode, memberName } = req.query;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'orgCode and memberName required' });
  const key      = memberKey(orgCode, memberName);
  const pending  = (assignedScenarios[key] || []).filter(s => s.status === 'pending');
  res.json({ scenarios: pending });
});

/* ── Member submits scenario result ─────────────────────────────────────── */
app.post('/api/member/submit-result', (req, res) => {
  const { orgCode, memberName, scenarioId, result } = req.body;
  if (!orgCode || !memberName || !result) return res.status(400).json({ error: 'missing fields' });
  const key = memberKey(orgCode, memberName);

  // Mark scenario as completed
  if (assignedScenarios[key]) {
    const sc = assignedScenarios[key].find(s => s.id === scenarioId);
    if (sc) sc.status = 'completed';
  }

  // Store result
  if (!memberResults[key]) memberResults[key] = [];
  memberResults[key].push({ ...result, submittedAt: new Date().toISOString() });
  res.json({ ok: true });
});

/* ── Member submits check-in ────────────────────────────────────────────── */
app.post('/api/member/checkin', (req, res) => {
  const { orgCode, memberName, mood, note } = req.body;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'missing fields' });
  const key = memberKey(orgCode, memberName);
  if (!memberCheckins[key]) memberCheckins[key] = [];
  memberCheckins[key].push({
    mood, note,
    date: new Date().toLocaleDateString('en-GB'),
    ts:   new Date().toISOString(),
  });
  res.json({ ok: true });
});

/* ── Platform pulls member results ─────────────────────────────────────── */
app.get('/api/platform/member-results', (req, res) => {
  const { orgCode, memberName } = req.query;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'missing fields' });
  const key = memberKey(orgCode, memberName);
  res.json({
    results:  memberResults[key]  || [],
    checkins: memberCheckins[key] || [],
  });
});

/* ── Platform pulls all results for org ─────────────────────────────────── */
app.get('/api/platform/org-results', (req, res) => {
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code    = orgCode.toLowerCase().trim();
  const results = {};
  Object.keys(memberResults).forEach(key => {
    if (key.startsWith(code + ':')) {
      const name = key.split(':').slice(1).join(':');
      results[name] = memberResults[key];
    }
  });
  res.json({ results });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ORG INTELLIGENCE — FREEFORM DESCRIPTION → AI TRAIT EXTRACTION
   Admin describes their org in plain language. Claude extracts what matters.
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
  "orgMode": "school|sports|workplace|military|healthcare|government",
  "summary": "One sentence capturing what this org is really about",
  "traits": ["specific trait 1", "specific trait 2", "specific trait 3", "specific trait 4"],
  "goals": ["meaningful org goal 1", "meaningful org goal 2", "meaningful org goal 3"],
  "environment": "The kind of culture/environment they want to build (1 sentence)",
  "successLooks": "What success looks like for them specifically (1 sentence)"
}

RULES:
- orgMode must be exactly one of: school, sports, workplace, military, healthcare, government
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

    // Store traits in orgMeta if orgCode known
    res.json({ ok: true, ...traits });
  } catch(err) {
    console.error('Org describe error:', err.message);
    res.status(500).json({ error: 'AI unavailable', detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   MEMBER GOALS — Individual goal & identity intake
   Every member sets a season goal + who they want to become. Stored once.
   IntelliQ references these in check-ins and reflections.
   ═══════════════════════════════════════════════════════════════════════════ */
const memberGoals = {}; // orgCode:memberName → { goal, identity, setAt }

app.post('/api/member/goals', (req, res) => {
  const { orgCode, memberName, goal, identity } = req.body;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'missing fields' });
  const key = memberKey(orgCode, memberName);
  memberGoals[key] = { goal: goal || '', identity: identity || '', setAt: new Date().toISOString() };
  res.json({ ok: true });
});

app.get('/api/member/goals', (req, res) => {
  const { orgCode, memberName } = req.query;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'missing fields' });
  const key = memberKey(orgCode, memberName);
  res.json({ goals: memberGoals[key] || null });
});

/* ═══════════════════════════════════════════════════════════════════════════
   FREEFORM CHECK-IN — Free text + AI response
   Member writes anything. IntelliQ reads it, saves it, responds briefly.
   Coach check-ins also flow through here.
   ═══════════════════════════════════════════════════════════════════════════ */
app.post('/api/checkin/freeform', async (req, res) => {
  const { orgCode, memberName, text, mood, role, orgMode, orgName, goals } = req.body;
  if (!orgCode || !memberName || !text) return res.status(400).json({ error: 'missing fields' });

  const key = memberKey(orgCode, memberName);
  if (!memberCheckins[key]) memberCheckins[key] = [];

  const moodLabels = { 1:'Rough', 2:'Low', 3:'Okay', 4:'Good', 5:'Great' };
  const checkin = {
    text,
    mood: mood || null,
    moodLabel: moodLabels[mood] || null,
    role: role || 'member',
    orgMode: orgMode || 'school',
    date: new Date().toLocaleDateString('en-GB'),
    ts:   new Date().toISOString(),
  };
  memberCheckins[key].push(checkin);

  // Role-specific AI prompt
  const rolePrompts = {
    member:  `You are IntelliQ, a warm and perceptive performance intelligence system. A team member has just submitted their daily check-in. Read what they shared, acknowledge it genuinely in 1-2 sentences, then if they have a goal — leave them with one specific, actionable thought about it. Keep it brief and human. Max 3 sentences total. Never be generic or robotic.`,
    coach:   `You are IntelliQ, a performance intelligence assistant for coaches. A coach has submitted their daily check-in. Acknowledge what they shared briefly. If they mentioned a specific player or session, reflect something useful back. If there's a pattern worth noting, surface it. Max 3 sentences. Be direct and practical.`,
    admin:   `You are IntelliQ, a performance intelligence assistant. An admin has submitted a check-in. Acknowledge briefly. If anything sounds like it needs org-level attention, note it. Max 2 sentences.`,
  };

  const systemPrompt = rolePrompts[role] || rolePrompts.member;

  let userContent = '';
  if (mood) userContent += `Mood: ${moodLabels[mood]}\n`;
  if (goals?.goal) userContent += `Their season goal: "${goals.goal}"\n`;
  if (goals?.identity) userContent += `Who they want to become: "${goals.identity}"\n`;
  userContent += `\nCheck-in: ${text}`;

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    });
    const aiResponse = response.content[0]?.text?.trim() || '';
    checkin.aiResponse = aiResponse;
    res.json({ ok: true, aiResponse });
  } catch(err) {
    console.error('Checkin AI error:', err.message);
    res.json({ ok: true, aiResponse: null });
  }
});

/* ─── Platform: pull all checkins for org ───────────────────────────────── */
app.get('/api/platform/org-checkins', (req, res) => {
  const { orgCode } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const code    = orgCode.toLowerCase().trim();
  const results = {};
  Object.keys(memberCheckins).forEach(key => {
    if (key.startsWith(code + ':')) {
      const name = key.split(':').slice(1).join(':');
      results[name] = memberCheckins[key];
    }
  });
  res.json({ checkins: results });
});

/* ═══════════════════════════════════════════════════════════════════════════
   WEEKLY ASSESSMENTS — Role-specific weekly reflection forms
   Everyone fills out their piece. IntelliQ assembles the full picture.
   ═══════════════════════════════════════════════════════════════════════════ */

// weeklyAssessments: orgCode:week → [ { memberName, role, data, submittedAt } ]
const weeklyAssessments = {};

function weekKey(orgCode, weekStr) {
  return `${orgCode.toLowerCase().trim()}:${weekStr}`;
}

function currentWeekStr() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
}

/* ── Submit weekly assessment ───────────────────────────────────────────── */
app.post('/api/weekly/submit', async (req, res) => {
  const { orgCode, memberName, role, orgMode, orgName, data, goals } = req.body;
  if (!orgCode || !memberName || !data) return res.status(400).json({ error: 'missing fields' });

  const week = currentWeekStr();
  const key  = weekKey(orgCode, week);
  if (!weeklyAssessments[key]) weeklyAssessments[key] = [];

  // Remove any prior submission this week for this member
  const idx = weeklyAssessments[key].findIndex(e => e.memberName.toLowerCase() === memberName.toLowerCase());
  if (idx > -1) weeklyAssessments[key].splice(idx, 1);

  const rolePrompts = {
    member: `You are IntelliQ. A team member has completed their weekly reflection. Read what they shared and respond in 2-3 sentences: acknowledge their week genuinely, and if they have a goal, connect something they said to it. Be warm and specific. Max 3 sentences.`,
    coach:  `You are IntelliQ, a performance intelligence assistant. A coach has submitted their weekly assessment. Read it and respond with one practical insight or observation worth acting on. Reference specifics they mentioned. Max 3 sentences.`,
    staff:  `You are IntelliQ. A staff member has submitted their weekly report. Acknowledge what they shared and note anything that may need follow-up. Max 2 sentences.`,
  };

  const roleKey = role === 'member' ? 'member' : role === 'coach' ? 'coach' : 'staff';
  const systemPrompt = rolePrompts[roleKey];

  let userMsg = '';
  if (goals?.goal) userMsg += `Their goal: "${goals.goal}"\n\n`;
  userMsg += `Weekly reflection:\n${Object.entries(data).map(([k,v]) => `${k}: ${v}`).join('\n')}`;

  let aiResponse = null;
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    });
    aiResponse = response.content[0]?.text?.trim() || null;
  } catch(e) { /* non-critical */ }

  const entry = {
    memberName, role: role || 'member', orgMode: orgMode || 'school',
    data, week, aiResponse,
    submittedAt: new Date().toISOString(),
  };
  weeklyAssessments[key].push(entry);

  res.json({ ok: true, aiResponse, week });
});

/* ── Get weekly assessments for org ─────────────────────────────────────── */
app.get('/api/weekly/org', (req, res) => {
  const { orgCode, week } = req.query;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });
  const w   = week || currentWeekStr();
  const key = weekKey(orgCode, w);
  res.json({ week: w, assessments: weeklyAssessments[key] || [] });
});

/* ── Get own weekly history ─────────────────────────────────────────────── */
app.get('/api/weekly/member', (req, res) => {
  const { orgCode, memberName } = req.query;
  if (!orgCode || !memberName) return res.status(400).json({ error: 'missing fields' });
  const code = orgCode.toLowerCase().trim();
  const name = memberName.toLowerCase().trim();
  const history = [];
  Object.keys(weeklyAssessments).forEach(key => {
    if (key.startsWith(code + ':')) {
      const entries = weeklyAssessments[key].filter(e => e.memberName.toLowerCase() === name);
      history.push(...entries);
    }
  });
  history.sort((a, b) => b.week.localeCompare(a.week));
  res.json({ history });
});

/* ── Platform: IntelliQ synthesis of this week's inputs ─────────────────── */
app.post('/api/weekly/synthesis', async (req, res) => {
  const { orgCode, orgName, orgMode, week } = req.body;
  if (!orgCode) return res.status(400).json({ error: 'orgCode required' });

  const w   = week || currentWeekStr();
  const key = weekKey(orgCode, w);
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
      system: systemPrompt,
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

/* ── Set member password (first-login flow) ─────────────────────────────── */
app.post('/api/auth/set-password', (req, res) => {
  const { orgCode, userId, currentPassword, newPassword } = req.body;
  const code  = (orgCode || '').toLowerCase();
  const users = orgUsers[code];
  if (!users || !users[userId]) return res.status(404).json({ error: 'User not found' });

  const user = users[userId];
  if (user.passwordHash !== simpleHash(currentPassword)) {
    return res.status(401).json({ error: 'Current password incorrect' });
  }

  user.passwordHash = simpleHash(newPassword);
  user.passwordSet  = true;
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IntelliQ running → http://localhost:${PORT}`);
  console.log(`Member app   → http://localhost:${PORT}/member/`);
  console.log(`API key: ${process.env.ANTHROPIC_API_KEY ? '✓ loaded' : '✗ MISSING'}`);
});
