/* ============================================================
   scripts/seed-alma.js — the demo organisation: a college men's soccer programme
   across the six weeks of the pilot.

   Modelled on Alma College men's soccer (the Alma Scots) — NCAA Division III, MIAA, central
   Michigan. The PROGRAMME is real and the shape here matches it: a single varsity squad of
   around twenty-eight, a small staff, a fall season that runs preseason in August to the
   conference tournament in November, and a roster spread across four class years.

   EVERY PERSON IN IT IS FICTIONAL. That is deliberate and not negotiable. This seed exists to
   demonstrate a system that forms beliefs about people's wellbeing, workload and performance,
   and attaching invented records of that kind to real, named college students would be
   fabricating a record about an identifiable private individual. The programme is the thing
   worth being accurate about; the people are not.

   ── WHY THIS WAS REWRITTEN ───────────────────────────────────────────────────────────────

   The previous version built three inquiries and six pieces of evidence, and a probe of it
   through the real read path found what a demo would have shown a room:

       Highs: 0 for everybody. Lows: 0 for everybody. 27 of the 28 players saw nothing at all.

   That was not a bug in the buckets. It is this product's central law working exactly as
   written. A High or a Low needs a DECLARED direction — somebody saying a thing is getting
   better or worse — and every seeded signal carried `direction: 'neutral'` because the seed
   never declared one, and nobody had ever CALLED a belief. Both roads to a High or a Low were
   closed, so both buckets were correctly empty.

   So the fix is not to write High and Low objects. It is to seed a season in which people
   said things, declared which way they were going, and called their own beliefs — and then
   let the same gates the live product runs decide what surfaces. Everything below goes
   through diagnose.newInquiry, diagnose.applyProposals, contribution.toGroupProposal and
   teamState.newFocus, which are the calls the live routes make. Nothing here writes a band, a
   score, a polarity or a High: if a belief reaches a bucket it is because it earned it, and
   seed-alma-smoke asserts that the seed never writes one.

   ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────────

   It does not give everybody a High and a Low. Eight of the twenty-eight say nothing all
   season and their app is empty, several beliefs rest on a single telling and visibly cannot
   reach a band, one squad-level pattern is REFUSED by the cohort floor and shown to the coach
   as withheld rather than hidden, and one belief is contested and therefore is neither a High
   nor a Low. A demo where every surface is full teaches that the product always has an
   answer, which is the opposite of the thing being sold.
   ============================================================ */

'use strict';
const bcrypt = require('bcryptjs');
const diagnose = require('../ai/diagnose.js');
const teamState = require('../ai/team-state.js');
const contribution = require('../ai/contribution.js');

const SALT = 8;                                        // demo speed over hardness
const CODE = process.env.ALMA_CODE || 'alma-mens-soccer';
const DAY = 86400000;

/* ── THE PILOT WINDOW, AND WHERE IT SITS ON THE CALENDAR ──────────────────────────────────

   Founder: "data based on the duration basically from 26th September till November 6" — the
   six weeks of the Alma pilot, which is 42 days and about twelve fixtures.

   That window is in the FUTURE relative to the day this is being built, and a store full of
   future-dated evidence renders as nonsense: ages go negative, "3 days ago" becomes "in 30
   days", and recency ordering inverts. So the SHAPE is the pilot's — its length, and its real
   Wednesday/Saturday MIAA fixture rhythm, taken from the actual calendar — and by default it
   is laid down ENDING TODAY. You are standing at the final whistle of the last fixture,
   looking back over the six weeks.

   ALMA_LITERAL_DATES=1 puts it on the true calendar dates instead, for when the pilot is
   actually running and today is inside the window. */
const PILOT_FROM = process.env.ALMA_START || '2026-09-26';
const PILOT_TO   = process.env.ALMA_END   || '2026-11-06';
const LITERAL    = process.env.ALMA_LITERAL_DATES === '1';

const _d = s => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d, 15); };
const SEASON_DAYS = Math.round((_d(PILOT_TO) - _d(PILOT_FROM)) / DAY);
const END   = LITERAL ? _d(PILOT_TO) : new Date().setHours(15, 0, 0, 0);
const START = END - SEASON_DAYS * DAY;

/* Day 0 is the first day of the window, day SEASON_DAYS the last. Everything in this file is
   placed by its day in the season, so the story reads in order however the window is anchored. */
const onDay = (i, hour = 15) => { const t = new Date(START + i * DAY); t.setHours(hour, 0, 0, 0); return t; };
const msDay = (i, hour = 15) => onDay(i, hour).getTime();
const iso   = dt => new Date(dt).toISOString();
const NOW   = END;

/* The real fixture rhythm of that window: MIAA plays midweek and Saturday. Taken from the
   literal calendar so the pattern of hard weeks is the pattern a coach would recognise, then
   carried across to wherever the window is anchored. */
const MATCH_DAYS = (() => {
  const out = [];
  for (let i = 0; i <= SEASON_DAYS; i++) {
    const dow = new Date(_d(PILOT_FROM) + i * DAY).getUTCDay();
    if (dow === 3 || dow === 6) out.push(i);           // Wednesday, Saturday
  }
  return out;
})();
const AWAY = MATCH_DAYS.filter((_, i) => i % 2 === 1);  // alternate fixtures on the road

/* Deterministic pseudo-randomness. A demo that reshuffles itself every time it is installed
   cannot be talked about — "the thing I showed you on Tuesday" has to still be there. */
let _s0 = 20260926;
const rnd = () => { _s0 = (_s0 * 1103515245 + 12345) & 0x7fffffff; return _s0 / 0x7fffffff; };
const rid  = () => Math.floor(rnd() * 1e12).toString(36).padStart(8, '0').slice(-8);
const pick = arr => arr[Math.floor(rnd() * arr.length)];

/* Invented names, chosen to read like a Division III roster in Michigan — largely in-state,
   with the handful of international players such a programme usually carries. No name here is
   taken from any real roster. */
const FIRST = ['Brayden', 'Cole', 'Everett', 'Sawyer', 'Declan', 'Miles', 'Owen', 'Bennett',
  'Trevor', 'Gideon', 'Rowan', 'Beckett', 'Cormac', 'Anders', 'Mateo', 'Kwame', 'Ravi',
  'Duncan', 'Callan', 'Isaiah', 'Marcus', 'Elliot', 'Tobias', 'Jonas', 'Reid', 'Kieran',
  'Ansel', 'Lachlan', 'Emeka', 'Nikolai'];
const LAST = ['Vandermolen', 'Kowalczyk', 'Brennan', 'Whitfield', 'Oyelaran', 'Petrosyan',
  'Lindqvist', 'Marchetti', 'Doherty', 'Ashworth', 'Nakamura', 'Bergstrom', 'Calloway',
  'Ferreira', 'Okonkwo', 'Halvorsen', 'Rutkowski', 'Sandoval', 'Thackeray', 'Boone',
  'Delacroix', 'Mbeki', 'Larkin', 'Yoshida', 'Cavanaugh', 'Novotny', 'Abernathy', 'Ruiz',
  'Fitzgerald', 'Sorensen'];

/* A Division III men's soccer roster: three keepers, a back line, a deep midfield, a short
   forward line. The class spread is the ordinary one — a large first-year intake tapering to a
   handful of seniors. */
const POSITIONS = [
  { pos: 'Goalkeeper', n: 3 },
  { pos: 'Defender',   n: 9 },
  { pos: 'Midfielder', n: 10 },
  { pos: 'Forward',    n: 6 },
];
const CLASSES = ['First year', 'First year', 'Sophomore', 'Sophomore', 'Junior', 'Senior'];

async function buildAlmaStore() {
  const pass = await bcrypt.hash('demo1234', SALT);

  const orgMeta = {}, orgUsers = { [CODE]: {} }, emailIndex = {};
  const orgNodes = { [CODE]: {} }, orgValues = {}, orgGoals = {}, orgMetrics = {};
  const userPermissions = { [CODE]: {} };
  const orgSignals = { [CODE]: [] };
  const inquiryStates = { [CODE]: {} };
  const teamFocuses = { [CODE]: {} };
  const groupCandidates = { [CODE]: [] };
  const userAiProfiles = {};
  const assessmentAssignments = { [CODE]: [] };

  const used = new Set();
  const person = () => {
    let p, tries = 0;
    do {
      const first = pick(FIRST), last = pick(LAST);
      p = { first, last, name: `${first} ${last}`, email: `${first}.${last}`.toLowerCase() + '@alma.edu' };
    } while (used.has(p.email) && ++tries < 90);
    used.add(p.email);
    return p;
  };

  const mkNode = (name, description, parentId) => {
    const nodeId = 'nd_' + rid();
    orgNodes[CODE][nodeId] = { nodeId, name, description, parentId: parentId || null,
      childNodeIds: [], memberIds: [], leaderIds: [],
      createdAt: iso(onDay(0)), updatedAt: iso(onDay(SEASON_DAYS)) };
    if (parentId && orgNodes[CODE][parentId]) orgNodes[CODE][parentId].childNodeIds.push(nodeId);
    return nodeId;
  };
  const mkUser = (p, role, extra = {}) => {
    const id = rid();
    orgUsers[CODE][id] = {
      id, firstName: p.first, lastName: p.last, name: p.name, email: p.email,
      role, orgCode: CODE, supervisorId: extra.supervisorId || null,
      passwordHash: pass, passwordSet: true, status: 'active',
      createdAt: iso(onDay(0)), levelId: extra.levelId || 3, profileComplete: true,
      assignedNodeIds: [], leadershipNodeIds: [],
      ...(extra.position ? { position: extra.position } : {}),
      ...(extra.classYear ? { classYear: extra.classYear } : {}),
      ...(extra.title ? { title: extra.title } : {}),
    };
    emailIndex[p.email] = { orgCode: CODE, userId: id };
    return id;
  };
  const addLeader = (nodeId, uid) => {
    orgNodes[CODE][nodeId].leaderIds.push(uid);
    const u = orgUsers[CODE][uid];
    if (!u.leadershipNodeIds.includes(nodeId)) u.leadershipNodeIds.push(nodeId);
  };
  const addMember = (nodeId, uid) => {
    orgNodes[CODE][nodeId].memberIds.push(uid);
    const u = orgUsers[CODE][uid];
    if (!u.assignedNodeIds.includes(nodeId)) u.assignedNodeIds.push(nodeId);
  };
  const memOf = uid => (userAiProfiles[`${CODE}:${uid}`] = userAiProfiles[`${CODE}:${uid}`]
    || { openThreads: [], recentThemes: [], priorFollowUps: [], focuses: [], valenceCalls: {} });

  /* Evidence, through the canonical envelope shape the rest of the system reads. Text is short
     on purpose: this is what a player actually types into the composer, not a paragraph
     written to look impressive in a demo. */
  const signal = (subjectId, createdBy, dayIdx, text, { sensitivity = 'normal', source = 'workspace' } = {}) => {
    const id = 'sig_' + rid();
    orgSignals[CODE].push({
      id, orgCode: CODE, ts: iso(onDay(dayIdx)), source, modality: 'text',
      subjectType: 'member', subjectId, category: null, label: null,
      valueNum: null, valueText: text, data: null,
      sensitivity, public: false, weightNum: 2, weight: 'medium',
      createdBy, createdAt: iso(onDay(dayIdx)),
    });
    return id;
  };

  // ── The programme ─────────────────────────────────────────────────────────
  const VALUES = ['Compete every rep', 'Take care of each other', 'Be coachable', 'Own your recovery'];
  orgMeta[CODE] = {
    orgName: "Alma College Men's Soccer", orgMode: 'sports', createdAt: iso(onDay(0)),
    organizationProfile: {
      description: "The Alma Scots men's soccer programme. NCAA Division III, competing in the Michigan Intercollegiate Athletic Association. A roster of around thirty student-athletes across four class years, playing a fall season from August preseason through the conference tournament in November, with the academic year running alongside all of it.",
      values: VALUES,
      goals: ['Compete for the MIAA title', 'Keep the squad healthy through a compressed fall schedule',
        'Develop first years into contributors by their sophomore season',
        'Protect academic performance during the season'],
      successDefinition: 'Players who get better across four years, stay available, and hold each other to the standard when no coach is watching.',
      behaviours: ['Arrives ready to train', 'Communicates on the field', 'Takes feedback and applies it', 'Recovers deliberately'],
      metrics: ['Training Load', 'Availability', 'Minutes', 'Sleep'],
      setAt: iso(onDay(0)), setBy: 'seed',
    },
    organizationProfileComplete: true,
  };
  orgValues[CODE] = VALUES;
  orgGoals[CODE] = orgMeta[CODE].organizationProfile.goals.map(text => ({ goalId: 'g_' + rid(), text, createdAt: iso(onDay(0)) }));
  /* CANONICAL METRIC RECORDS, not bare strings.

     The organisation profile lists metrics as plain names, which is right for a profile — it is
     prose about the club. `orgMetrics` is a different thing: it is the store the metric ROUTES
     read and write, and its shape has always been { metricId, name, source, order, createdAt }.
     Writing the profile's strings straight into it put two shapes in one store, and Settings then
     rendered "1 undefined / 2 undefined / 3 undefined / 4 undefined" to a real coach while the
     rename and delete controls silently matched nothing.

     The id is derived from the name (the same rule `_metricRecord` uses on the server) so a
     re-seed produces the identical record and nothing downstream sees a metric change identity. */
  const _metricId = name => {
    let h = 5381; const s = 'metric:' + name;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'met_' + h.toString(36);
  };
  orgMetrics[CODE] = orgMeta[CODE].organizationProfile.metrics.map((name, order) => ({
    metricId: _metricId(name), name, source: 'org', order, createdAt: iso(onDay(0)),
  }));

  // ── Nodes. A college programme is one squad, not a hierarchy of age groups; the units that
  //    actually meet separately are the position groups and the first-year intake. ─────────
  const programme = mkNode("Alma College Men's Soccer", 'The programme', null);
  const varsity   = mkNode('Varsity Squad', 'The full travelling roster', programme);
  const keepers   = mkNode('Goalkeepers', 'Keeper unit', varsity);
  const backline  = mkNode('Back Line', 'Defensive unit', varsity);
  const midfield  = mkNode('Midfield', 'Midfield unit', varsity);
  const frontline = mkNode('Front Line', 'Attacking unit', varsity);
  const firstYears = mkNode('First Years', 'The incoming class, across every position', programme);
  const unitOf = { Goalkeeper: keepers, Defender: backline, Midfielder: midfield, Forward: frontline };

  // ── Staff. A Division III programme runs on a small staff. ────────────────
  // FIXED, MEMORABLE LOGINS for the two accounts anybody demoing this will actually sign into.
  // Everyone else keeps a generated address. A demo you have to look up the credentials for is
  // a demo you do not give — and the founder's use for this is handing it to somebody standing
  // next to them.
  const headCoachP = { ...person(), email: 'coach@alma.edu' };
  const headCoach = mkUser(headCoachP, 'superadmin', { levelId: 1, title: 'Head Coach' });
  const assistantP = person();
  const assistant = mkUser(assistantP, 'leader', { levelId: 2, title: 'Assistant Coach', supervisorId: headCoach });
  const trainerP = person();
  const trainer = mkUser(trainerP, 'leader', { levelId: 2, title: 'Athletic Trainer', supervisorId: headCoach });

  [programme, varsity].forEach(n => addLeader(n, headCoach));
  [midfield, frontline, firstYears].forEach(n => addLeader(n, assistant));
  addLeader(keepers, assistant);
  addLeader(backline, assistant);
  userPermissions[CODE][headCoach] = ['manage_settings', 'manage_people', 'view_org'];
  userPermissions[CODE][assistant] = ['view_org'];
  userPermissions[CODE][trainer]   = ['view_org'];

  // ── The roster ────────────────────────────────────────────────────────────
  const players = [];
  for (const { pos, n } of POSITIONS) {
    for (let i = 0; i < n; i++) {
      const p = person();
      const classYear = CLASSES[(players.length + i) % CLASSES.length];
      const uid = mkUser(p, 'member', { supervisorId: headCoach, position: pos, classYear });
      addMember(varsity, uid);
      addMember(unitOf[pos], uid);
      if (classYear === 'First year') addMember(firstYears, uid);
      players.push({ uid, ...p, pos, classYear });
    }
  }

  /* ── THE THINGS PEOPLE TALKED ABOUT ────────────────────────────────────────────────────── */
  const TOPIC = {
    fatigue:   { concept: 'soccer.late_game_fatigue',    label: 'Late-game fatigue' },
    travel:    { concept: 'soccer.travel_academics',     label: 'Travel and academics' },
    spacing:   { concept: 'soccer.lift_session_spacing', label: 'Lift and session spacing' },
    surface:   { concept: 'soccer.load_surface',         label: 'Training surface and load' },
    touch:     { concept: 'soccer.first_touch_pressure', label: 'First touch under pressure' },
    setpiece:  { concept: 'soccer.set_piece_defending',  label: 'Defending set pieces' },
    recovery:  { concept: 'soccer.midweek_recovery',     label: 'Midweek recovery' },
    talking:   { concept: 'soccer.team_communication',   label: 'Talking on the field' },
    minutes:   { concept: 'soccer.freshman_minutes',     label: 'First years and minutes' },
    sleep:     { concept: 'soccer.sleep_before_away',    label: 'Sleep before away trips' },
  };

  /* A telling. `direction` is DECLARED here because a person declared it in the app — it is
     never read out of the words. Most tellings declare nothing, which is the ordinary case and
     the reason most beliefs stay open questions rather than becoming Highs or Lows. */
  const tell = (pl, dayIdx, text, opts = {}) => ({
    ref: signal(pl.uid, pl.uid, dayIdx, text, { sensitivity: opts.sensitivity }),
    text, direction: opts.direction || 'neutral', by: pl.uid, day: dayIdx,
    authority: opts.authority || 'self_report', source: opts.source || 'self',
    // Whether this account CUTS AGAINST what the inquiry currently reads. That is a different
    // thing from pointing the other way: two people can each say which way a thing is going
    // and simply disagree about the direction, which blocks a High or a Low without anybody
    // contradicting anybody. A contradiction is one account saying the other is wrong, and it
    // is what makes a belief disputed.
    contradicts: opts.contradicts === true,
  });

  /* An inquiry, built the way the live intake builds one. The seed supplies tellings and
     questions; the kernel supplies the standing. */
  const buildInquiry = (subjectRef, topic, tellings, { hypothesis, unknown = [], falsifiers = [], openedOn = 2 }) => {
    let inq = diagnose.newInquiry({
      id: 'inq_' + rid(), subjectRef, concept: topic.concept, label: topic.label,
      domain: 'sports', now: msDay(openedOn),
    });
    // originKind/originRef are FLAT fields, not a nested object — diagnose.originOf reads them
    // that way, and a nested one is silently discarded as "origin not established". The first
    // version of this seed got it wrong, and the group inquiry below then reported three
    // players saying the same thing independently as "1 source" — the demo showing the exact
    // opposite of the property it exists to demonstrate.
    const proposals = tellings.map(t => ({
      id: 'p_' + rid(), level: 'observation', directness: 'direct', authority: t.authority,
      source: t.source, specificity: 0.7, statement: t.text,
      direction: t.direction, contradicts: t.contradicts === true,
      originKind: t.authority === 'third_party' ? 'reported' : 'self_report',
      originRef: t.ref, turnId: 'seed_' + t.ref,
    }));
    inq = diagnose.applyProposals(inq, proposals, {
      now: msDay(tellings[tellings.length - 1].day), evidenceRefOf: p => p.originRef,
    });
    if (hypothesis) {
      inq.hypotheses = [diagnose.newHypothesis({ id: 'h_' + rid(), statement: hypothesis, now: NOW })];
      inq.leadingHypothesisId = inq.hypotheses[0].id;
    }
    inq.missingSignals = unknown.map(question => ({ question }));
    inq.falsifiers = falsifiers;
    return inq;
  };
  const fileFor = (uid, topic, inq) => {
    const key = `member:${uid}`;
    (inquiryStates[CODE][key] = inquiryStates[CODE][key] || {})[topic.concept] = inq;
    return inq;
  };
  /* A CALL. The person says which way their own belief points. This is the second of the two
     declared things a High or a Low needs, and the reason the previous seed had none of
     either: nothing in it had ever been called. */
  const call = (uid, inq, valence, dayIdx) => {
    memOf(uid).valenceCalls[inq.inquiryId] = { valence, at: msDay(dayIdx) };
  };

  // ── The player a demo signs into ─────────────────────────────────────────
  // Fixed address for the same reason the coach's is. The person behind it is one of the
  // generated roster, and their season is the fullest one — a High, a Low, an open question,
  // a contested belief and a focus — because this is the account somebody clicks through.
  const me = players[12];
  orgUsers[CODE][me.uid].email = 'player@alma.edu';
  delete emailIndex[me.email];
  emailIndex['player@alma.edu'] = { orgCode: CODE, userId: me.uid };
  me.email = 'player@alma.edu';

  /* THEIR LOW. Two separate tellings, on different days, both DECLARED as getting worse. Two
     origins pointing the same way is what files it — not the wording, and not a call. */
  const myLow = fileFor(me.uid, TOPIC.fatigue, buildInquiry(`member:${me.uid}`, TOPIC.fatigue, [
    tell(me, 6,  "I get through the first half fine and then I'm gone by the 60th minute", { direction: 'decline', sensitivity: 'sensitive' }),
    tell(me, 24, "Same thing Saturday, legs went about an hour in and it's worse than September", { direction: 'decline', sensitivity: 'sensitive' }),
  ], {
    hypothesis: 'the drop-off is conditioning specific to the second half rather than general fitness',
    unknown: ['is it the same in training as in matches, or only in matches?',
      'what does the week before a Saturday match usually look like?'],
    falsifiers: ['a full ninety in training at the same intensity with no drop-off'],
    openedOn: 6,
  }));

  /* THEIR HIGH. Also two declared origins, the other way. A High is not a compliment the
     product pays somebody; it is the same machinery with the direction reversed. */
  const myHigh = fileFor(me.uid, TOPIC.recovery, buildInquiry(`member:${me.uid}`, TOPIC.recovery, [
    tell(me, 15, "Started doing the Wednesday pool session and Thursday feels completely different", { direction: 'improvement' }),
    tell(me, 33, "Third week of the pool session, back-to-back weeks I've trained Thursday properly", { direction: 'improvement' }),
  ], {
    hypothesis: 'the midweek pool session is what is protecting Thursday, rather than the lighter fixture load',
    unknown: ['does it hold in a week with a midweek fixture?'],
    falsifiers: ['a good Thursday in a week the pool session was missed'],
    openedOn: 15,
  }));
  call(me.uid, myHigh, 'working_well', 34);

  /* THEIR OPEN QUESTION. Two tellings, no direction declared on either. It has standing —
     the kernel rates it — but it points nowhere, so it is an inquiry and not a Low. This is
     the case the product is most often in and the one a demo usually hides. */
  fileFor(me.uid, TOPIC.touch, buildInquiry(`member:${me.uid}`, TOPIC.touch, [
    tell(me, 11, "First touch under pressure is where it breaks down for me"),
    tell(me, 29, "Coach mentioned the same thing about receiving with my back to goal"),
  ], {
    hypothesis: 'the first touch breaks down under pressure rather than in general',
    unknown: ['is it worse receiving with your back to goal, or facing play?',
      'does it happen in training at the same rate?'],
    falsifiers: ['the same error rate in unpressured possession drills'],
    openedOn: 11,
  }));

  /* THEIR CALLED BELIEF, and this is the third distinct road to a bucket. Nothing on it points
     anywhere — neither telling declares a direction — so the evidence files nothing. The person
     called it themselves, and with two independent origins and the kernel's standing behind it,
     their own account is what there is. The card says so in as many words: "you called this
     one, and nothing else on it points either way yet". Without a case like this the demo never
     shows the difference between a belief the evidence decided and one a person did. */
  const myCalled = fileFor(me.uid, TOPIC.talking, buildInquiry(`member:${me.uid}`, TOPIC.talking, [
    tell(me, 9,  "I've started organising the line from the back instead of waiting for someone else to"),
    tell(me, 31, "Did it again on Saturday, the whole back four stepped together"),
  ], {
    hypothesis: 'taking the organising role is what is holding the line together',
    unknown: ['does it hold when the crowd is loud and nobody can hear?'],
    falsifiers: ['the line breaking at the same rate in the games I organised it'],
    openedOn: 9,
  }));
  call(me.uid, myCalled, 'working_well', 32);

  /* THEIR CONTESTED BELIEF. Their own account and the trainer's point opposite ways about the
     same thing. That disagreement is the finding: it is neither a High nor a Low, it climbs
     rather than averages, and it is the single clearest demonstration of what this product
     does that a dashboard does not. */
  const disputed = buildInquiry(`member:${me.uid}`, TOPIC.spacing, [
    tell(me, 19, "Tuesday lift then an afternoon session is fine for me now, I've adapted", { direction: 'improvement' }),
    { ...tell(me, 27, "Reported soreness after every Tuesday double this month",
        { direction: 'decline', contradicts: true }),
      by: trainer, authority: 'third_party', source: 'other' },
  ], {
    hypothesis: 'the Tuesday lift and afternoon session are too close together',
    unknown: ['what does the soreness look like on a week the lift moves to Monday?'],
    falsifiers: ['no soreness reported across a block with the lift kept on Tuesday'],
    openedOn: 19,
  });
  fileFor(me.uid, TOPIC.spacing, disputed);

  /* A FOCUS THEY ARE ALREADY RUNNING, out of the Low. The origin is the point: a seeded focus
     with origin 'leader' is indistinguishable from one invented, and outcome learning would
     eventually credit it to nobody. */
  memOf(me.uid).focuses = [teamState.newFocus({
    focusId: 'pf_' + rid(), nodeId: null,
    text: 'Ten minutes of extra running after Tuesday, and report how the last twenty of Saturday feels',
    by: me.uid, now: msDay(26), reviewAt: msDay(SEASON_DAYS + 5), inquiry: myLow,
  })];

  /* ── THE REST OF THE ROSTER ───────────────────────────────────────────────────────────────

     Twenty of the twenty-eight have something on record; eight say nothing all season and
     their app is honestly empty. Of those twenty, a deliberate minority clear the gates: most
     have an open question, several rest on one telling and visibly cannot reach a band. This
     distribution is the demo's most important content, because it is what six real weeks look
     like and it is what makes the full surfaces believable. */
  const SPEAK = [
    // [player index, topic, [ [day, text, direction?] ... ], call? ]
    [0,  TOPIC.surface,  [[4, "The turf at practice has my shins wrecked by Thursday every week", 'decline'], [22, "Shins again this week, it's the turf not the volume", 'decline']], 'worth_attention'],
    [1,  TOPIC.touch,    [[9, "Losing the ball too often when it comes in fast"]]],
    [2,  TOPIC.setpiece, [[7, "We keep getting beaten to the near post on corners"], [25, "Same near post ball again on Saturday"]]],
    [3,  TOPIC.sleep,    [[12, "Never sleep well the night before we travel"]]],
    [5,  TOPIC.minutes,  [[10, "Not sure what I need to do to get on the field"], [31, "Had twenty minutes Wednesday and it felt like I belonged", 'improvement']]],
    [6,  TOPIC.recovery, [[14, "Wednesdays off have made a real difference to Thursday", 'improvement'], [30, "Still true, Thursday is my best session now", 'improvement']], 'working_well'],
    [7,  TOPIC.fatigue,  [[13, "Legs go around seventy in matches"]]],
    [9,  TOPIC.talking,  [[8, "The back four have got a lot louder this month", 'improvement'], [28, "Communication is genuinely better than September", 'improvement']], 'working_well'],
    [10, TOPIC.surface,  [[17, "Turf on Tuesday and Thursday is a lot on the joints", 'decline']]],
    [11, TOPIC.setpiece, [[16, "Marking assignments on corners still aren't clear to me"]]],
    [14, TOPIC.spacing,  [[5, "Lifting Tuesday morning before an afternoon session is too much back to back", 'decline'], [23, "Tuesday doubles are still the hardest day of the week", 'decline']], 'worth_attention'],
    [15, TOPIC.minutes,  [[18, "Hard to know where I stand in the rotation"]]],
    [16, TOPIC.touch,    [[20, "My weaker foot is costing me in tight areas"]]],
    [18, TOPIC.talking,  [[11, "We go quiet when we're under pressure"]]],
    [19, TOPIC.sleep,    [[21, "Getting in at 1am and up for an 8am is rough"]]],
    [20, TOPIC.recovery, [[26, "The pool session is the best thing we've added", 'improvement']]],
    [22, TOPIC.fatigue,  [[15, "I fade in the last twenty when we play Wednesday and Saturday", 'decline'], [32, "Same again this week after the midweek game", 'decline']], 'worth_attention'],
    [24, TOPIC.setpiece, [[19, "We've defended the last three sets of corners well", 'improvement']]],
    [25, TOPIC.minutes,  [[24, "Getting more minutes and it's showing in training", 'improvement'], [35, "Started Saturday for the first time", 'improvement']], 'working_well'],
    [27, TOPIC.talking,  [[27, "Still find it hard to organise the line when it gets loud"]]],
  ];

  const HYPOTHESIS = {
    [TOPIC.surface.concept]:  'the artificial surface, not the session volume, is what is loading the lower legs',
    [TOPIC.touch.concept]:    'the first touch breaks down under pressure rather than in general',
    [TOPIC.setpiece.concept]: 'the near post is being lost at the first contact rather than in the marking scheme',
    [TOPIC.sleep.concept]:    'the night before travel is the sleep being lost, not the night after',
    [TOPIC.minutes.concept]:  'the uncertainty is about what earns minutes rather than about the minutes themselves',
    [TOPIC.recovery.concept]: 'the midweek session is what protects Thursday',
    [TOPIC.fatigue.concept]:  'the drop-off is specific to the second half rather than general fitness',
    [TOPIC.talking.concept]:  'communication holds until the game gets loud and then falls away',
    [TOPIC.spacing.concept]:  'the Tuesday lift and afternoon session are too close together',
    [TOPIC.travel.concept]:   'late returns cost the squad more in the following days than the travel itself',
  };
  const UNKNOWN = {
    [TOPIC.surface.concept]:  ['is it worse on the days that follow a match?'],
    [TOPIC.touch.concept]:    ['is it worse receiving with your back to goal, or facing play?'],
    [TOPIC.setpiece.concept]: ['is it the first contact or the second ball?'],
    [TOPIC.sleep.concept]:    ['is it the night before or the night after that is lost?'],
    [TOPIC.minutes.concept]:  ['what would make the path to minutes clear?'],
    [TOPIC.recovery.concept]: ['does it hold in a week with a midweek fixture?'],
    [TOPIC.fatigue.concept]:  ['is it the same in training as in matches?'],
    [TOPIC.talking.concept]:  ['which moments does it go quiet in?'],
    [TOPIC.spacing.concept]:  ['what does the week look like with the lift moved to Monday?'],
    [TOPIC.travel.concept]:   ['which days after an away fixture are actually the worst?'],
  };

  for (const [idx, topic, lines, calls] of SPEAK) {
    const pl = players[idx];
    if (!pl || pl.uid === me.uid) continue;
    const tellings = lines.map(([day, text, direction]) => tell(pl, day, text, { direction }));
    const inq = buildInquiry(`member:${pl.uid}`, topic, tellings, {
      hypothesis: HYPOTHESIS[topic.concept],
      unknown: UNKNOWN[topic.concept] || [],
      falsifiers: [],
      openedOn: lines[0][0],
    });
    fileFor(pl.uid, topic, inq);
    if (calls) call(pl.uid, inq, calls, Math.min(SEASON_DAYS, lines[lines.length - 1][0] + 2));
  }

  /* ── THE SQUAD ────────────────────────────────────────────────────────────────────────────

     A group belief is not the sum of personal ones. Somebody has to CONTRIBUTE a noticing to
     the group and say which way they think it points, and the group inquiry opens only on
     independent corroboration. Below, three patterns are contributed at three different
     scales, so a coach sees the floor working in both directions rather than only when it
     lets something through. */
  const groupRef = `group:${varsity}`;
  const cand = (pl, topic, dayIdx, valence, text) => {
    const ref = signal(pl.uid, pl.uid, dayIdx, text);
    const c = {
      candidateId: 'gc_' + rid(), nodeId: varsity, concept: topic.concept, label: topic.label,
      contributorId: pl.uid, status: 'contributed', detectedAt: msDay(dayIdx),
      contributedAt: msDay(dayIdx), contributorRole: 'member',
      // Anonymous by default. Anonymity changes attribution and never counting — five
      // anonymous people are still five contributors, which is what the floor counts.
      contributorVisibility: 'anonymous',
      valence, explicitOpen: false, fromSubject: `member:${pl.uid}`,
      evidenceRef: ref, originRef: ref, originKind: 'self_report',
      authority: 'self_report', specificity: 0.7, occasion: 'seed_' + ref,
    };
    groupCandidates[CODE].push(c);
    return c;
  };

  /* Admission, run the way the server runs it: the same two library calls _admitGroupContributions
     makes, so a seeded group belief cannot be in a shape the live path could never produce. */
  const admitGroup = (topic, cands, { hypothesis, unknown = [], falsifiers = [] }) => {
    const decision = contribution.shouldOpenGroupInquiry(cands, { now: NOW });
    if (!decision.open) return { opened: false, decision };
    let inq = diagnose.newInquiry({
      id: 'inq_' + rid(), subjectRef: groupRef, concept: topic.concept, label: topic.label,
      domain: 'sports', now: Math.min(...cands.map(c => c.contributedAt)),
    });
    inq = diagnose.applyProposals(inq, cands.map(c => contribution.toGroupProposal(c, { now: NOW })), { now: NOW });
    inq.hypotheses = [diagnose.newHypothesis({ id: 'h_' + rid(), statement: hypothesis, now: NOW })];
    inq.leadingHypothesisId = inq.hypotheses[0].id;
    inq.missingSignals = unknown.map(question => ({ question }));
    inq.falsifiers = falsifiers;
    for (const c of cands) { c.status = 'admitted'; c.admittedAt = NOW; }
    (inquiryStates[CODE][groupRef] = inquiryStates[CODE][groupRef] || {})[topic.concept] = inq;
    return { opened: true, inquiry: inq };
  };

  /* THE SQUAD'S LOW — travel. Seven contributors of twenty-eight, all calling it the same way:
     clear of the floor on both sides (7 named, 21 not), so it reaches the coach. */
  const travelCands = [1, 5, 8, 13, 19, 21, 26].map((idx, i) =>
    cand(players[idx], TOPIC.travel, 6 + i * 4, 'worth_attention',
      "Honestly the away bus getting back at 1am and an 8am class is the hard part"));
  const travel = admitGroup(TOPIC.travel, travelCands, {
    hypothesis: HYPOTHESIS[TOPIC.travel.concept],
    unknown: UNKNOWN[TOPIC.travel.concept].concat(['is this the whole squad or mainly the players with early classes?']),
    falsifiers: ['no difference in the days after a home fixture at the same intensity'],
  });

  /* THE SQUAD'S HIGH — the same machinery, the other way. Six contributors calling the
     midweek recovery session working well. */
  const recoveryCands = [2, 7, 11, 17, 23, 25].map((idx, i) =>
    cand(players[idx], TOPIC.recovery, 12 + i * 3, 'working_well',
      "The Wednesday recovery session has changed how Thursday feels"));
  admitGroup(TOPIC.recovery, recoveryCands, {
    hypothesis: 'the midweek recovery session is what is protecting the Thursday session',
    unknown: ['does it hold through the back-to-back weeks in the last fortnight?'],
    falsifiers: ['a normal Thursday in a week the session was cancelled'],
  });

  /* THE ONE THE FLOOR REFUSES. Three contributors of twenty-eight — corroborated enough to
     open as a group inquiry, and nowhere near enough to put in front of a coach without
     pointing at the three who said it. The coach is told something is being withheld and why;
     they are not told what. Naming the refusal is the product; hiding it would not be. */
  const setPieceCands = [4, 12, 20].map((idx, i) =>
    cand(players[idx], TOPIC.setpiece, 16 + i * 5, 'worth_attention',
      "We keep getting beaten to the near post from corners"));
  admitGroup(TOPIC.setpiece, setPieceCands, {
    hypothesis: HYPOTHESIS[TOPIC.setpiece.concept],
    unknown: UNKNOWN[TOPIC.setpiece.concept],
    falsifiers: ['the same first-contact record across the next three fixtures'],
  });

  /* ── WHAT THE COACH DID ABOUT IT ──────────────────────────────────────────────────────────
     Two focuses, so the loop is visible from both ends: one that ran its course and had its
     outcome recorded, and one live and past its review date with nothing recorded — which is
     a fact about a commitment, not a judgement about a person. */
  const landed = teamState.newFocus({
    focusId: 'tf_' + rid(), nodeId: varsity,
    text: 'Move the session after an away fixture to the afternoon, and protect the morning',
    by: headCoach, now: msDay(14), reviewAt: msDay(32),
    inquiry: travel.opened ? travel.inquiry : null,
  });
  teamState.recordFocusOutcome(landed, {
    result: 'better', by: headCoach, now: msDay(33),
    note: 'Two away trips since. Thursday attendance and quality both held where they used to dip.',
  });
  const running = teamState.newFocus({
    focusId: 'tf_' + rid(), nodeId: varsity,
    text: 'Near post is the first contact — one man attacks the ball, nobody ball-watches',
    by: headCoach, now: msDay(24), reviewAt: msDay(SEASON_DAYS - 3),
  });
  teamFocuses[CODE][varsity] = [landed, running];

  // A little assigned work, because "your work" is a real surface and an empty one teaches
  // nothing. Titles that say what they are about — the composer holds back titles it cannot
  // reason from, and a demo full of those would demonstrate the quarantine, not the product.
  assessmentAssignments[CODE] = [
    { id: 'as_' + rid(), assigneeId: me.uid, title: 'Preseason fitness benchmark', status: 'returned', assignedAt: iso(onDay(1)) },
    { id: 'as_' + rid(), assigneeId: me.uid, title: 'Mid-season self review', status: 'assigned', assignedAt: iso(onDay(28)) },
    { id: 'as_' + rid(), assigneeId: players[4].uid, title: 'Technical development plan', status: 'assigned', assignedAt: iso(onDay(21)) },
  ];

  const summary = {
    orgName: orgMeta[CODE].orgName, code: CODE,
    window: { from: iso(onDay(0)).slice(0, 10), to: iso(onDay(SEASON_DAYS)).slice(0, 10),
      days: SEASON_DAYS, matches: MATCH_DAYS.length, away: AWAY.length,
      shape: `the pilot's ${SEASON_DAYS} days (${PILOT_FROM} to ${PILOT_TO})`,
      literalDates: LITERAL },
    users: Object.keys(orgUsers[CODE]).length,
    players: players.length, staff: 3,
    nodes: Object.keys(orgNodes[CODE]).length,
    evidence: orgSignals[CODE].length,
    inquiries: Object.values(inquiryStates[CODE]).reduce((n, m) => n + Object.keys(m).length, 0),
    peopleWithSomething: Object.keys(inquiryStates[CODE]).filter(k => k.startsWith('member:')).length,
    peopleWithNothing: players.length - Object.keys(inquiryStates[CODE]).filter(k => k.startsWith('member:')).length,
    calls: Object.values(userAiProfiles).reduce((n, m) => n + Object.keys(m.valenceCalls || {}).length, 0),
    groupContributions: groupCandidates[CODE].length,
    focuses: Object.values(teamFocuses[CODE]).reduce((n, l) => n + l.length, 0)
      + Object.values(userAiProfiles).reduce((n, m) => n + (m.focuses || []).length, 0),
    login: { headCoach: headCoachP.email, player: me.email, password: 'demo1234' },
  };

  return {
    store: {
      orgMeta, orgUsers, emailIndex, orgNodes, orgValues, orgGoals, orgMetrics,
      userPermissions, orgSignals, inquiryStates, teamFocuses, groupCandidates,
      userAiProfiles, assessmentAssignments,
    },
    summary,
  };
}

module.exports = { buildAlmaStore, ALMA_CODE: CODE };
