/* ============================================================
   scripts/seed-club.js — a fully-sized football club, for demo + stress testing

   Builds a large, realistic professional club ("Trafford United FC", fictional —
   NOT a real organisation) with a full node hierarchy (First Team, Women's Team,
   an academy of age groups, a foundation phase), coaching + performance + medical
   staff, and ~6–12 MONTHS of back-dated data engineered so every layer has
   something real to react to:

     • ~200 players + ~40 staff across ~11 team nodes under one club
     • weekly-ish check-ins with genuine story arcs (quiet / overload / improving /
       injury-return / dip / breakout / steady) so the kernel fires varied patterns
     • training-load + wellness metrics (OVERLOAD only fires with a real load series)
     • recurring assessments assigned, returned, and scored across the year, with
       strengths/development signals → feeds whats-working, planning, nudges, memory
     • completed interventions WITH measured outcomes → feeds the learning loop
     • pinned tutorials + a few Studio threads with plans and evidence observations

   Two uses:
     1. HTTP demo — POST /api/admin/seed-demo-club installs it into a live instance
        so you can click through it (separate org code; never touches other orgs).
     2. Stress test — scripts/club-stress.js loads it in-process and drives every
        layer, reporting how the kernel + infra react at scale.

   Nothing here is a real person or a real club. All names are generated.
   ============================================================ */

const bcrypt = require('bcryptjs');

const SALT = 8;                       // demo speed over hardness
const CODE = process.env.CLUB_CODE || 'trafford-united';
const DAYS = Number(process.env.CLUB_DAYS || 365);   // ~1 year of history
const rid  = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const dAgo = (d, hour = 9) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(hour, 0, 0, 0); return t; };
const iso  = dt => dt.toISOString();
const dstr = dt => dt.toLocaleDateString('en-GB');
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const jit  = n => Math.round((Math.random() - 0.5) * 2 * n);
const MOODLBL = { 1: 'Rough', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };

const FIRST = ['James','Marcus','Kai','Diego','Luca','Noah','Ethan','Mason','Leo','Omar','Finn','Reece','Jude','Cole','Tyler','Rhys','Jamal','Andre','Tomas','Ivan','Mateo','Bruno','Hugo','Felix','Ari','Sol','Dami','Kofi','Zane','Nils','Sven','Pablo','Enzo','Theo','Rio','Dex','Josh','Callum','Harvey','Ola','Sekou','Yannick','Bilal','Emre','Nikola','Sacha','Milan','Dylan','Ashton','Kian'];
const FIRSTF = ['Maya','Priya','Lena','Aisha','Nadia','Ella','Sofia','Grace','Amara','Chloe','Ines','Yara','Zoe','Freya','Nora','Iris','Talia','Bea','Rosa','Nia','Leah','Anya','Mila','Sana','Hana','Keira','Robin','Sam','Alex','Jordan'];
const LAST = ['Ellis','Chen','Okoro','Park','Anand','Feld','Vidal','Rahman','Silva','Mensah','Novak','Costa','Haas','Larsson','Doyle','Reyes','Bianchi','Kovac','Diallo','Mbeki','Fischer','Romano','Petrov','Adeyemi','Watanabe','Nowak','Duarte','Karlsson','Osei','Marin','Blanc','Grant','Hughes','Byrne','Traore','Iqbal','Santos','Wolfe','Marsh','Quinn','Bello','Frost','Nkemdirim','Ivanov','Sorensen','Ferreira','Baptiste','Dumont','Voss','Ashby'];
const usedEmails = new Set();
function person(female) {
  const first = female ? pick(FIRSTF) : pick(FIRST);
  const last  = pick(LAST).replace(/[^A-Za-z]/g, '');   // guard any stray chars
  let base = `${first}.${last}`.toLowerCase(); let email = `${base}@trafford.fc`; let n = 1;
  while (usedEmails.has(email)) email = `${base}${++n}@trafford.fc`;
  usedEmails.add(email);
  return { first, last, name: `${first} ${last}`, email };
}

// Distribute story arcs so the kernel sees variety in EVERY squad — weighted to
// include a healthy share of clearly-rising players (improving/breakout/injury)
// so BOTH sides of the intelligence (repeat + revisit, rising + attention) light up.
const ARCS = ['steady','steady','improving','improving','breakout','quiet','overload','dip','injury','inconsistent'];

async function buildClubStore() {
  const pass = await bcrypt.hash('demo1234', SALT);

  const orgMeta = {}, orgUsers = { [CODE]: {} }, emailIndex = {};
  const orgNodes = { [CODE]: {} }, orgValues = {}, orgGoals = {}, orgMetrics = {};
  const userPermissions = { [CODE]: {} };
  const memberGoals = {}, memberCheckins = {}, orgSignals = { [CODE]: [] };
  const assessmentTemplates = { [CODE]: [] }, assessmentAssignments = { [CODE]: [] };
  const orgTutorials = { [CODE]: [] }, orgInterventions = { [CODE]: [] };
  const studioThreads = {}, orgGroups = { [CODE]: [] };

  const ukey = uid => `${CODE}:${uid}`;
  const mkNode = (name, description, parentId) => {
    const nodeId = 'nd_' + rid();
    orgNodes[CODE][nodeId] = { nodeId, name, description, parentId: parentId || null, childNodeIds: [], memberIds: [], leaderIds: [], createdAt: iso(dAgo(DAYS)), updatedAt: iso(dAgo(1)) };
    if (parentId && orgNodes[CODE][parentId]) orgNodes[CODE][parentId].childNodeIds.push(nodeId);
    return nodeId;
  };
  const mkUser = (p, role, supervisorId, levelId) => {
    const id = rid();
    orgUsers[CODE][id] = {
      id, firstName: p.first, lastName: p.last, name: p.name, email: p.email,
      role, orgCode: CODE, supervisorId: supervisorId || null,
      passwordHash: pass, passwordSet: true, status: 'active', createdAt: iso(dAgo(DAYS - jit(20))),
      levelId: levelId || 3, profileComplete: true, assignedNodeIds: [], leadershipNodeIds: [],
    };
    emailIndex[p.email] = { orgCode: CODE, userId: id };
    return id;
  };
  const addLeader = (nodeId, uid) => { orgNodes[CODE][nodeId].leaderIds.push(uid); const u = orgUsers[CODE][uid]; if (!u.leadershipNodeIds.includes(nodeId)) u.leadershipNodeIds.push(nodeId); };
  const addMember = (nodeId, uid) => { orgNodes[CODE][nodeId].memberIds.push(uid); const u = orgUsers[CODE][uid]; if (!u.assignedNodeIds.includes(nodeId)) u.assignedNodeIds.push(nodeId); };

  const pushSig = (subjectId, createdBy, source, dt, valueNum, valueText, label, sensitivity) =>
    orgSignals[CODE].push({
      id: 'sig_' + rid(), orgCode: CODE, ts: iso(dt), source, modality: source === 'metric' ? 'data' : 'text',
      subjectType: 'member', subjectId, category: null,
      label: label || (valueNum != null ? `Mood ${valueNum}/5` : null),
      valueNum: valueNum != null ? Number(valueNum) : null, valueText: valueText || null,
      data: null, sensitivity: sensitivity || 'normal', public: false,
      weightNum: source === 'metric' ? 3 : 2, weight: source === 'metric' ? 'strong' : 'medium',
      createdBy, createdAt: iso(dt),
    });
  const checkin = (u, dt, mood, text) => {
    const k = ukey(u.id);
    (memberCheckins[k] = memberCheckins[k] || []).push({ memberName: u.name, text, mood, moodLabel: MOODLBL[mood] || null, role: 'member', orgMode: '', date: dstr(dt), ts: iso(dt) });
    pushSig(u.id, u.id, 'checkin', dt, mood, text, `Mood ${mood}/5`, 'sensitive');
  };

  // ── Org identity — a football club worldview ─────────────────────────────
  const VALUES = ['Work rate', 'Team-first', 'Humility', 'Courage on the ball', 'Standards'];
  orgMeta[CODE] = {
    orgName: 'Trafford United FC', orgMode: '', createdAt: iso(dAgo(DAYS)),
    organizationProfile: {
      description: 'A professional football club with a men\'s and women\'s first team and a full academy from foundation phase to under-23s. The club develops players and people, balancing performance with long-term wellbeing.',
      values: VALUES,
      goals: ['Develop academy players into first-team footballers', 'Compete at the top of every league we enter', 'Keep players healthy across a long season'],
      successDefinition: 'Players who improve season on season, stay healthy, and carry the club\'s standards.',
      behaviours: ['Trains with intensity', 'Supports teammates', 'Takes feedback and acts on it', 'Recovers professionally'],
      metrics: ['Training Load', 'Wellbeing', 'Sprint Distance', 'Sleep'],
      setAt: iso(dAgo(DAYS - 5)), setBy: 'seed',
    },
    organizationProfileComplete: true,
  };
  orgValues[CODE] = VALUES;
  orgGoals[CODE]  = orgMeta[CODE].organizationProfile.goals.map(text => ({ goalId: 'g_' + rid(), text, createdAt: iso(dAgo(DAYS - 5)) }));
  orgMetrics[CODE] = ['Training Load', 'Wellbeing', 'Sprint Distance', 'Sleep'];

  // ── Node hierarchy ────────────────────────────────────────────────────────
  const clubNode     = mkNode('Trafford United FC', 'The club', null);
  const firstTeam    = mkNode('First Team (Men)', 'Senior men\'s squad', clubNode);
  const womensTeam   = mkNode('Women\'s First Team', 'Senior women\'s squad', clubNode);
  const academy      = mkNode('Academy', 'Youth development', clubNode);
  const foundation   = mkNode('Foundation Phase', 'Under-9 to Under-11', clubNode);
  const ageGroups = [
    { node: mkNode('Under-23s (PL2)', 'Professional development phase', academy), size: 20, level: 2 },
    { node: mkNode('Under-18s', 'Youth development phase', academy),               size: 20, level: 3 },
    { node: mkNode('Under-16s', 'Youth development phase', academy),               size: 18, level: 3 },
    { node: mkNode('Under-15s', 'Youth development phase', academy),               size: 18, level: 3 },
    { node: mkNode('Under-14s', 'Youth development phase', academy),               size: 16, level: 3 },
    { node: mkNode('Under-13s', 'Youth development phase', academy),               size: 16, level: 3 },
    { node: mkNode('Under-12s', 'Youth development phase', academy),               size: 16, level: 3 },
  ];

  // ── Club-level leadership (see the whole club) ────────────────────────────
  const sportingDirector = mkUser(person(), 'superadmin', null, 1);  // the demo login — sees all
  const academyDirector  = mkUser(person(), 'admin', null, 1);
  const headOfPerformance= mkUser(person(), 'admin', null, 1);
  const headOfMedicine   = mkUser(person(true), 'admin', null, 1);
  [sportingDirector, academyDirector, headOfPerformance, headOfMedicine].forEach(uid => addLeader(clubNode, uid));

  const POSN = ['Goalkeeper', 'Right-back', 'Centre-back', 'Left-back', 'Defensive midfield', 'Central midfield', 'Attacking midfield', 'Winger', 'Striker'];

  // ── Build a squad under a node ────────────────────────────────────────────
  let playerCount = 0, staffCount = 0;
  const allPlayers = [];
  function buildSquad(nodeId, teamName, size, female, level) {
    // staff: head coach + assistant (+ S&C for senior teams)
    const head = mkUser(person(female), 'member', sportingDirector, 2);
    addLeader(nodeId, head); staffCount++;
    const asst = mkUser(person(female), 'member', head, 2);
    addLeader(nodeId, asst); staffCount++;
    if (level <= 2) { const sc = mkUser(person(female), 'member', head, 2); addLeader(nodeId, sc); staffCount++; }

    for (let i = 0; i < size; i++) {
      const p = person(female);
      const uid = mkUser(p, 'member', head, level);
      addMember(nodeId, uid);
      const u = orgUsers[CODE][uid];
      const arc = ARCS[i % ARCS.length];
      const pos = pick(POSN);
      playerCount++;
      allPlayers.push({ uid, u, arc, pos, teamName, nodeId, level, headId: head });

      memberGoals[ukey(uid)] = {
        goal: `Establish myself as a ${pos.toLowerCase()} and hit the club's standards`,
        mainGoals: `Grow as a ${pos.toLowerCase()}`, identity: 'A dependable, professional footballer',
        selectedValues: VALUES.slice(0, 3), personalMetrics: [], memberName: u.name, setAt: iso(dAgo(DAYS - 30)),
      };
      seedPlayerHistory(u, arc);
    }
    return { head, asst };
  }

  // ── A player's year of data, shaped by their arc ──────────────────────────
  function seedPlayerHistory(u, arc) {
    for (let d = DAYS; d >= 0; d -= (2 + Math.floor(Math.random() * 3))) {   // every 2–4 days (avoids false data-gaps)
      let mood, text;
      const wk = d / 7;
      switch (arc) {
        case 'quiet':
          if (d <= 11) continue;                              // went quiet ~11 days ago
          mood = d <= 20 ? 2 : 4; text = d <= 20 ? 'Bit flat, keeping to myself.' : 'Good session, felt sharp.'; break;
        case 'overload':
          mood = d > 24 ? 4 : d > 12 ? 3 : 2; text = d > 24 ? 'Training hard, feeling strong.' : 'Legs heavy, sleep\'s been poor.'; break;
        case 'improving':
          mood = d > 30 ? 3 : d > 15 ? 4 : 5; text = 'Working on my game — feeling steadier every week.'; break;
        case 'injury':
          mood = d > 45 ? 4 : d > 20 ? 2 : d > 8 ? 3 : 4;     // hurt ~45d ago, low, now recovering
          text = d > 45 ? 'Flying in training.' : d > 20 ? 'Frustrated on the sidelines.' : 'Back running, building up.'; break;
        case 'dip':
          mood = d > 21 ? 4 : 3 - (d < 7 ? 1 : 0); text = d > 21 ? 'Solid, in the team.' : 'Not quite firing, form\'s off.'; break;
        case 'breakout':
          mood = d > 35 ? 3 : 5; text = d > 35 ? 'Doing okay, quietly working.' : 'Everything\'s clicking, best I\'ve felt.'; break;
        case 'inconsistent':
          mood = pick([2, 3, 4, 4, 5, 3]); text = 'Up and down week.'; break;
        default:
          mood = Math.random() < 0.15 ? 3 : 4; text = 'Normal week, all good.';
      }
      checkin(u, dAgo(d), Math.max(1, Math.min(5, mood)), text);
    }
    // Guarantee RECENT participation for every active arc (except 'quiet', which is
    // meant to have gone silent) so the kernel doesn't read a false data-gap — and
    // give the clearly-rising arcs a dense, unambiguous recent climb.
    if (arc === 'improving' || arc === 'breakout') {
      for (let d = 24; d >= 0; d -= 2) checkin(u, dAgo(d, 11), 5, 'Really flowing right now — best I\'ve felt.');
    } else if (arc === 'injury') {
      for (let d = 15; d >= 0; d -= 2) checkin(u, dAgo(d, 11), 4, 'Back in it, building sharpness.');
    } else if (arc !== 'quiet') {
      const recentMood = arc === 'overload' ? 2 : arc === 'dip' ? 3 : 4;
      for (let d = 12; d >= 0; d -= 3) checkin(u, dAgo(d, 11), recentMood, 'Regular week.');
    }
    // Training load — a real weekly series (needed for OVERLOAD to fire honestly).
    for (let d = Math.min(DAYS, 200); d >= 0; d -= 7) {
      let load;
      if (arc === 'overload') load = d > 28 ? 50 + jit(5) : Math.round(55 + ((28 - d) / 28) * 40) + jit(3);
      else if (arc === 'injury') load = d > 45 ? 60 + jit(6) : d > 20 ? 12 + jit(6) : Math.round(20 + ((20 - d) / 20) * 45) + jit(4);
      else load = 55 + jit(8);
      pushSig(u.id, u.id, 'metric', dAgo(d), Math.max(5, load), null, 'Training Load', 'normal');
      if (d % 14 === 0) pushSig(u.id, u.id, 'metric', dAgo(d), Math.max(3, 7 + jit(2)), null, 'Sleep', 'normal');
    }
  }

  // ── Build every squad ─────────────────────────────────────────────────────
  const firstTeamStaff = buildSquad(firstTeam, 'First Team', 25, false, 2);
  buildSquad(womensTeam, 'Women\'s First Team', 22, true, 2);
  ageGroups.forEach((g, i) => buildSquad(g.node, orgNodes[CODE][g.node].name, g.size, false, g.level));
  // Foundation phase — younger, lighter data
  buildSquad(foundation, 'Foundation Phase', 28, false, 3);

  // ── Assessments — recurring templates, assigned + returned + scored ───────
  const now = new Date();
  const templates = [
    { title: 'Weekly Recovery & Wellbeing Reflection', kind: 'general', good: true,  guidance: 'Rate honestly. We care about how you actually feel and recover, not the "right" answer.' },
    { title: 'Match Review — decisions and positioning',  kind: 'film',    good: true,  guidance: 'Focus on decisions, not just outcomes. One thing you did well, one to sharpen.' },
    { title: 'Strength & Conditioning Benchmark',         kind: 'spreadsheet', good: true, guidance: 'Log your numbers accurately. Progress over the block matters more than any single test.' },
    { title: 'High-Intensity Block — self review',        kind: 'general', good: false, guidance: 'Be honest about load and fatigue during the heavy block.' },
    { title: 'Individual Development Plan check-in',       kind: 'general', good: true,  guidance: 'Tie your reflection to your two development priorities.' },
  ];
  const tpls = templates.map(t => {
    const tpl = { id: rid(), title: t.title, description: `${t.title} — a recurring club assessment.`, guidance: t.guidance, kind: t.kind, fields: [{ label: 'What went well', hint: '' }, { label: 'What was hard', hint: '' }, { label: 'Focus for next block', hint: '' }], createdBy: sportingDirector, createdByName: orgUsers[CODE][sportingDirector].name, createdAt: iso(dAgo(DAYS - 20)) };
    assessmentTemplates[CODE].push(tpl);
    return { ...tpl, good: t.good };
  });

  const STRENGTHS = ['composure', 'passing range', 'work rate', 'positioning', 'first touch', 'reading the game', 'leadership', 'recovery runs', 'finishing', 'communication'];
  const DEVELOP   = ['aerial duels', 'weak foot', 'decision speed', 'defensive shape', 'pressing triggers', 'game management', 'consistency', 'set-piece marking'];

  allPlayers.forEach(pl => {
    // Give each player a handful of returned assessments across the year.
    const nAssess = 3 + Math.floor(Math.random() * 4);
    for (let a = 0; a < nAssess; a++) {
      // Improving/breakout players do the recovery/development ones (they'll trend up);
      // overload/dip players do the high-intensity review (it precedes their dip).
      let tpl;
      // Concentrate the signal so the demo shows BOTH a clear "repeat" and a clear
      // "revisit": players who are trending up mostly did the recovery reflection;
      // players who dipped mostly did the high-intensity block review.
      const recovery = tpls.find(t => /Recovery/i.test(t.title));
      const heavy    = tpls.find(t => !t.good);
      if (['improving', 'breakout', 'injury'].includes(pl.arc)) tpl = Math.random() < 0.75 ? recovery : pick(tpls.filter(t => t.good));
      else if (['overload', 'dip'].includes(pl.arc)) tpl = Math.random() < 0.7 ? heavy : pick(tpls);
      else tpl = pick(tpls.filter(t => t.good));
      const daysBack = 20 + Math.floor(Math.random() * (DAYS - 40));
      const baseScore = pl.arc === 'improving' || pl.arc === 'breakout' ? 78 : pl.arc === 'overload' || pl.arc === 'dip' ? 52 : 68;
      const score = Math.max(20, Math.min(98, baseScore + jit(12)));
      const strengths = [pick(STRENGTHS), pick(STRENGTHS)];
      const development = [pick(DEVELOP)];
      const asg = {
        id: rid(), templateId: tpl.id, title: tpl.title, kind: tpl.kind, fields: tpl.fields,
        description: tpl.description, guidance: tpl.guidance,
        assignerId: pl.headId, assignerName: orgUsers[CODE][pl.headId].name, assigneeId: pl.uid, assigneeName: pl.u.name,
        status: 'returned', response: { 'What went well': 'Felt sharp in possession.', 'What was hard': 'Tired in the last 20.', 'Focus for next block': 'Sharpen final third decisions.' },
        note: '', feedback: 'Good detail — keep it up.', score,
        assignedAt: iso(dAgo(daysBack + 7)), submittedAt: iso(dAgo(daysBack + 2)), returnedAt: iso(dAgo(daysBack)),
      };
      assessmentAssignments[CODE].push(asg);
      // The scored signal + a strengths/development signal (feeds planning, nudges, memory).
      pushSig(pl.uid, pl.headId, 'assessment', dAgo(daysBack), score, `Strengths: ${strengths.join(', ')} · Development: ${development.join(', ')}`, `Assessment score: ${tpl.title}`, 'normal');
    }
    // Leave 1–2 CURRENTLY assigned (not yet done) so Studio/assessment queues aren't empty.
    if (Math.random() < 0.5) {
      const tpl = pick(tpls);
      assessmentAssignments[CODE].push({
        id: rid(), templateId: tpl.id, title: tpl.title, kind: tpl.kind, fields: tpl.fields,
        description: tpl.description, guidance: tpl.guidance,
        assignerId: pl.headId, assignerName: orgUsers[CODE][pl.headId].name, assigneeId: pl.uid, assigneeName: pl.u.name,
        status: 'assigned', response: {}, note: '', feedback: '', score: null, assignedAt: iso(dAgo(3)),
      });
    }
  });

  // ── Interventions with measured outcomes → the learning loop has history ──
  const PATTERN_ACTIONS = [
    { patternType: 'momentum_drop', action: 'Had a supportive one-to-one and reset one clear focus', good: 0.8 },
    { patternType: 'invisible_load', action: 'Reduced their training load and added a recovery day', good: 0.75 },
    { patternType: 'quiet_improvement', action: 'Recognised their progress in front of the group', good: 0.85 },
    { patternType: 'repeated_concern', action: 'Escalated to the medical team for a full assessment', good: 0.6 },
    { patternType: 'momentum_drop', action: 'Assigned extra individual video work with no conversation', good: 0.3 },
  ];
  const flaggable = allPlayers.filter(p => ['quiet', 'overload', 'dip', 'injury', 'improving'].includes(p.arc));
  for (let i = 0; i < 60 && i < flaggable.length * 2; i++) {
    const pl = pick(flaggable);
    const pa = pick(PATTERN_ACTIONS);
    const positive = Math.random() < pa.good;
    const when = dAgo(20 + Math.floor(Math.random() * (DAYS - 40)));
    orgInterventions[CODE].push({
      id: 'intv_' + rid(), createdAt: iso(when),
      targetMember: pl.u.name, targetMemberId: pl.uid, targetGroup: null,
      action: pa.action, patternType: pa.patternType,
      urgency: 'medium', owner: pl.headId, reason: 'briefing', evidence: [],
      status: 'completed', acknowledgedAt: iso(when), completedAt: iso(when), dismissedAt: null,
      outcome: { status: 'measured', outcome: positive ? 'positive' : 'negative', moodDelta: positive ? 0.6 : -0.2, changesDetected: [] },
      recordedOutcome: positive ? 'positive' : 'negative', outcomeRecordedAt: iso(when),
    });
  }

  // ── Pinned tutorials ──────────────────────────────────────────────────────
  [
    { title: 'How we run a recovery day', body: 'Light movement, mobility, sleep and nutrition focus. No high-intensity work.', kind: 'play' },
    { title: 'Reviewing your own game footage', body: 'Watch for decisions, not just outcomes. Pick two clips: one strength, one to sharpen.', kind: 'film' },
    { title: 'The club\'s pressing principles', body: 'Trigger on the back-foot touch. Nearest player leads, the rest shift across.', kind: 'play' },
  ].forEach(t => orgTutorials[CODE].push({ id: rid(), title: t.title, body: t.body, url: '', kind: t.kind, createdBy: sportingDirector, createdByName: orgUsers[CODE][sportingDirector].name, createdAt: iso(dAgo(60)) }));

  // ── Studio usage — spread across teams & levels, varied and realistic ─────
  // Roughly 1 in 4 players actively uses their Studio: some just capture a plan,
  // some think it through in a short chat, some show IntelliQ evidence (a clip, a
  // GPS sheet, a whiteboard photo). A few coaches plan sessions there too.
  const PLAYER_PLANS = [
    'Two finishing sessions a week; review one clip after each match.',
    'Protect sleep on match-minus-one — in bed by 10:30.',
    'Add 10 minutes of weak-foot work before every session.',
    'Watch one defensive-shape clip with the analyst on Mondays.',
    'Hit my sprint-distance target in two of three sessions this week.',
    'Do the full prehab routine after every training day.',
  ];
  let studioUsers = 0, studioPlans = 0, studioDone = 0, studioEvidence = 0, studioCoaches = 0;
  allPlayers.forEach((pl, i) => {
    if (i % 4 !== 0) return;                     // ~1 in 4 players
    studioUsers++;
    const chatty = i % 8 === 0;
    const showsEvidence = ['improving', 'breakout', 'injury', 'dip'].includes(pl.arc) && i % 3 === 0;
    const p1 = { id: rid(), text: PLAYER_PLANS[i % PLAYER_PLANS.length], ts: iso(dAgo(10 + (i % 6))), done: ['improving', 'breakout', 'steady'].includes(pl.arc) };
    const p2 = { id: rid(), text: PLAYER_PLANS[(i + 3) % PLAYER_PLANS.length], ts: iso(dAgo(4 + (i % 5))), done: false };
    studioPlans += 2; if (p1.done) studioDone++;
    studioThreads[ukey(pl.uid)] = {
      messages: chatty ? [
        { role: 'user', text: 'I want to be sharper in the final third this block.', ts: iso(dAgo(10)) },
        { role: 'assistant', text: 'Good focus. Let\'s make it concrete — one rep target and one review habit. I\'ve turned that into a plan.', ts: iso(dAgo(10)) },
        { role: 'user', text: 'And I keep fading in the last 20 minutes.', ts: iso(dAgo(9)) },
        { role: 'assistant', text: 'That reads as a conditioning + sleep pattern, not effort. Let\'s protect match-minus-one sleep and I\'ll watch your load with the staff.', ts: iso(dAgo(9)) },
      ] : [
        { role: 'user', text: p1.text, ts: p1.ts },
        { role: 'assistant', text: 'Captured that as a plan — I\'ll keep it in front of you and check how it\'s going.', ts: p1.ts },
      ],
      plans: [p1, p2],
    };
    if (showsEvidence) {
      studioEvidence++;
      const ev = pick([
        'From image: whiteboard plan shows two extra finishing sessions',
        'From spreadsheet: sprint distance up 8% over the last three sessions',
        'From video: good weak-side run, late shot selection to sharpen',
      ]);
      pushSig(pl.uid, pl.uid, 'studio', dAgo(6 + (i % 4)), null, ev, 'Studio evidence', 'normal');
    }
    pushSig(pl.uid, pl.uid, 'studio', p1.ts && dAgo(10), null, `Planned: ${p1.text.slice(0, 60)}`, 'Studio input', 'normal');
  });
  // A few coaches use the Studio to plan sessions.
  [firstTeamStaff.head, firstTeamStaff.asst].forEach((cid, k) => {
    if (!cid) return; studioCoaches++;
    studioThreads[ukey(cid)] = {
      messages: [
        { role: 'user', text: 'Plan a lighter week — a lot of the group are run down.', ts: iso(dAgo(5)) },
        { role: 'assistant', text: 'Given the load trend I\'d cut sprint volume Tue/Thu and add a recovery day. I\'ve drafted the week as a plan.', ts: iso(dAgo(5)) },
      ],
      plans: [{ id: rid(), text: 'Deload week: recovery day Wed, reduced sprint volume, review Friday.', ts: iso(dAgo(5)), done: false }],
    };
    studioPlans++;
  });

  // ── A club-wide group (copilot-style) ─────────────────────────────────────
  orgGroups[CODE].push({ id: 'grp_' + rid(), name: 'First Team', description: 'Senior men\'s squad', memberIds: orgNodes[CODE][firstTeam].memberIds.slice(), leadIds: [firstTeamStaff.head], goals: ['Top-four finish', 'Everyone fit for the run-in'], traits: VALUES.slice(0, 3), copilotEnabled: false, createdAt: iso(dAgo(DAYS - 10)) });

  // Give the three demo logins fixed, memorable emails so nobody has to dig through
  // logs (everyone else keeps a realistic generated address).
  [[sportingDirector, 'director@trafford.fc'], [firstTeamStaff.head, 'coach@trafford.fc'], [allPlayers[0].uid, 'player@trafford.fc']].forEach(([uid, em]) => {
    const old = orgUsers[CODE][uid].email;
    if (old && emailIndex[old]) delete emailIndex[old];
    orgUsers[CODE][uid].email = em;
    emailIndex[em] = { orgCode: CODE, userId: uid };
  });

  return {
    store: { orgMeta, orgUsers, emailIndex, orgNodes, orgValues, orgGoals, orgMetrics, userPermissions, memberGoals, memberCheckins, orgSignals, assessmentTemplates, assessmentAssignments, orgTutorials, orgInterventions, studioThreads, orgGroups },
    summary: {
      code: CODE, orgName: 'Trafford United FC',
      players: playerCount, staff: staffCount, users: Object.keys(orgUsers[CODE]).length,
      nodes: Object.keys(orgNodes[CODE]).length,
      checkins: Object.values(memberCheckins).reduce((n, a) => n + a.length, 0),
      signals: orgSignals[CODE].length,
      assessments: assessmentAssignments[CODE].length,
      interventions: orgInterventions[CODE].length,
      studio: { users: studioUsers, coaches: studioCoaches, plans: studioPlans + studioCoaches, completed: studioDone, evidenceShown: studioEvidence },
      login: {
        director: orgUsers[CODE][sportingDirector].email,
        firstTeamCoach: orgUsers[CODE][firstTeamStaff.head].email,
        samplePlayer: orgUsers[CODE][allPlayers[0].uid].email,
        password: 'demo1234',
      },
      directorId: sportingDirector, firstTeamCoachId: firstTeamStaff.head, samplePlayerId: allPlayers[0].uid,
    },
  };
}

module.exports = { buildClubStore, CLUB_CODE: CODE };

/* CLI: DATABASE_URL=... node scripts/seed-club.js  → writes the club to the DB. */
if (require.main === module) {
  (async () => {
    const db = require('../db');
    await db.init();
    const { store, summary } = await buildClubStore();
    const existing = process.env.SEED_REPLACE === '1' ? {} : await db.loadMain();
    const merged = { ...existing };
    for (const [k, v] of Object.entries(store)) merged[k] = { ...(existing[k] || {}), ...v };
    await db.saveMain(merged);
    console.log('✓ Seeded', summary.orgName, JSON.stringify(summary, null, 2));
    process.exit(0);
  })().catch(e => { console.error('[seed-club] failed:', e); process.exit(1); });
}
