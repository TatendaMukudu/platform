/* ============================================================
   scripts/seed-alma.js — the demo organisation: a college men's soccer programme

   Modelled on Alma College men's soccer (the Alma Scots) — NCAA Division III, MIAA, central
   Michigan. The PROGRAMME is real and the shape here matches it: a single varsity squad of
   around twenty-eight, a small staff, a fall season that runs preseason in August to the
   conference tournament in November, and a roster spread across four class years.

   EVERY PERSON IN IT IS FICTIONAL. That is deliberate and not negotiable. This seed exists to
   demonstrate a system that forms beliefs about people's wellbeing, workload and performance,
   and attaching invented records of that kind to real, named college students would be
   fabricating a record about an identifiable private individual. The programme is the thing
   worth being accurate about; the people are not.

   It replaces three earlier seeds (a small squad, a company, and a 226-person club). The club
   was 21.5 MB — 16 MB of it check-ins, a feature retired in September 2026 — and every cold
   start loaded all of it out of Postgres, which is how a pilot with one user reached 86% of a
   5 GB monthly transfer allowance. So this one is built to a budget as well as to a shape:
   under a megabyte, asserted by seed-alma-smoke rather than hoped for.

   It also builds only objects the product still HAS. The old seeds populated notes,
   assessments and daily check-ins, so a demo taught a vocabulary the app no longer speaks.
   Here it is focuses, inquiries and evidence, through the same constructors the live routes
   use — ai/diagnose.newInquiry and ai/team-state.newFocus — so a seeded record cannot be in a
   shape the real path could never produce.
   ============================================================ */

'use strict';
const bcrypt = require('bcryptjs');
const diagnose = require('../ai/diagnose.js');
const teamState = require('../ai/team-state.js');

const SALT = 8;                                        // demo speed over hardness
const CODE = process.env.ALMA_CODE || 'alma-mens-soccer';
const DAYS = Number(process.env.ALMA_DAYS || 120);     // preseason through the conference tournament

const rid  = () => Math.random().toString(36).slice(2, 10);
const dAgo = (d, hour = 15) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(hour, 0, 0, 0); return t; };
const iso  = dt => dt.toISOString();
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

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
  const now = Date.now();

  const orgMeta = {}, orgUsers = { [CODE]: {} }, emailIndex = {};
  const orgNodes = { [CODE]: {} }, orgValues = {}, orgGoals = {}, orgMetrics = {};
  const userPermissions = { [CODE]: {} };
  const orgSignals = { [CODE]: [] };
  const inquiryStates = { [CODE]: {} };
  const teamFocuses = { [CODE]: {} };
  const assessmentAssignments = { [CODE]: [] };

  const used = new Set();
  const person = () => {
    let p, tries = 0;
    do {
      const first = pick(FIRST), last = pick(LAST);
      p = { first, last, name: `${first} ${last}`, email: `${first}.${last}`.toLowerCase() + '@alma.edu' };
    } while (used.has(p.email) && ++tries < 60);
    used.add(p.email);
    return p;
  };

  const mkNode = (name, description, parentId) => {
    const nodeId = 'nd_' + rid();
    orgNodes[CODE][nodeId] = { nodeId, name, description, parentId: parentId || null,
      childNodeIds: [], memberIds: [], leaderIds: [],
      createdAt: iso(dAgo(DAYS)), updatedAt: iso(dAgo(1)) };
    if (parentId && orgNodes[CODE][parentId]) orgNodes[CODE][parentId].childNodeIds.push(nodeId);
    return nodeId;
  };
  const mkUser = (p, role, extra = {}) => {
    const id = rid();
    orgUsers[CODE][id] = {
      id, firstName: p.first, lastName: p.last, name: p.name, email: p.email,
      role, orgCode: CODE, supervisorId: extra.supervisorId || null,
      passwordHash: pass, passwordSet: true, status: 'active',
      createdAt: iso(dAgo(DAYS)), levelId: extra.levelId || 3, profileComplete: true,
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

  /* Evidence, through the canonical envelope shape the rest of the system reads. Text is short
     on purpose: this is what a player actually types into the composer, not a paragraph
     written to look impressive in a demo. */
  const signal = (subjectId, createdBy, dt, text, { sensitivity = 'normal', source = 'workspace' } = {}) => {
    const id = 'sig_' + rid();
    orgSignals[CODE].push({
      id, orgCode: CODE, ts: iso(dt), source, modality: 'text',
      subjectType: 'member', subjectId, category: null, label: null,
      valueNum: null, valueText: text, data: null,
      sensitivity, public: false, weightNum: 2, weight: 'medium',
      createdBy, createdAt: iso(dt),
    });
    return id;
  };

  // ── The programme ─────────────────────────────────────────────────────────
  const VALUES = ['Compete every rep', 'Take care of each other', 'Be coachable', 'Own your recovery'];
  orgMeta[CODE] = {
    orgName: "Alma College Men's Soccer", orgMode: 'sports', createdAt: iso(dAgo(DAYS)),
    organizationProfile: {
      description: "The Alma Scots men's soccer programme. NCAA Division III, competing in the Michigan Intercollegiate Athletic Association. A roster of around thirty student-athletes across four class years, playing a fall season from August preseason through the conference tournament in November, with the academic year running alongside all of it.",
      values: VALUES,
      goals: ['Compete for the MIAA title', 'Keep the squad healthy through a compressed fall schedule',
        'Develop first years into contributors by their sophomore season',
        'Protect academic performance during the season'],
      successDefinition: 'Players who get better across four years, stay available, and hold each other to the standard when no coach is watching.',
      behaviours: ['Arrives ready to train', 'Communicates on the field', 'Takes feedback and applies it', 'Recovers deliberately'],
      metrics: ['Training Load', 'Availability', 'Minutes', 'Sleep'],
      setAt: iso(dAgo(DAYS - 3)), setBy: 'seed',
    },
    organizationProfileComplete: true,
  };
  orgValues[CODE] = VALUES;
  orgGoals[CODE] = orgMeta[CODE].organizationProfile.goals.map(text => ({ goalId: 'g_' + rid(), text, createdAt: iso(dAgo(DAYS - 3)) }));
  orgMetrics[CODE] = orgMeta[CODE].organizationProfile.metrics;

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
  const headCoachP = person();
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

  /* ── Something real to react to ──────────────────────────────────────────────────────────
     Not a wall of generated data. A handful of genuine lines of inquiry with actual evidence
     behind them, so every layer has something true to show: an open question with two
     independent origins, one with a single telling (and therefore low confidence, visibly), a
     squad-level pattern, and a focus that came out of an inquiry rather than out of thin air.

     The point of restraint here is that the product's honesty is the thing being demoed. An
     inquiry built from one remark should LOOK like an inquiry built from one remark. */
  const say = [
    { text: "The turf at practice has my shins wrecked by Thursday every week", concept: 'soccer.load_surface', label: 'Training surface and load' },
    { text: "I get through the first half fine and then I'm gone by the 60th minute", concept: 'soccer.late_game_fatigue', label: 'Late-game fatigue' },
    { text: "Lifting Tuesday morning before an afternoon session is too much back to back", concept: 'soccer.lift_session_spacing', label: 'Lift and session spacing' },
    { text: "Honestly the away bus getting back at 1am and an 8am class is the hard part", concept: 'soccer.travel_academics', label: 'Travel and academics' },
    { text: "First touch under pressure is where it breaks down for me", concept: 'soccer.first_touch_pressure', label: 'First touch under pressure' },
  ];

  const inquiryFor = (subjectId, subjectRef, spec, tellings) => {
    let inq = diagnose.newInquiry({
      id: 'inq_' + rid(), subjectRef, concept: spec.concept, label: spec.label,
      domain: 'sports', now: now - (DAYS - 20) * 86400000,
    });
    // originKind/originRef are FLAT fields, not a nested object — diagnose.originOf reads them
    // that way, and a nested one is silently discarded as "origin not established". The first
    // version of this seed got it wrong, and the group inquiry below then reported three
    // players saying the same thing independently as "1 source" — the demo showing the exact
    // opposite of the property it exists to demonstrate.
    const proposals = tellings.map(t => ({
      id: 'p_' + rid(), level: 'observation', directness: 'direct', authority: 'self_report',
      source: 'self', specificity: 0.7, statement: t.text,
      originKind: 'self_report', originRef: t.ref, turnId: 'seed_' + t.ref,
    }));
    inq = diagnose.applyProposals(inq, proposals, {
      now: now - (DAYS - 25) * 86400000, evidenceRefOf: p => p.originRef,
    });
    inq.hypotheses = [diagnose.newHypothesis({ id: 'h_' + rid(), statement: spec.hypothesis, now })];
    inq.leadingHypothesisId = inq.hypotheses[0].id;
    inq.missingSignals = spec.unknown.map(question => ({ question }));
    inq.falsifiers = spec.falsifiers;
    return inq;
  };

  // Two players carry a real line of inquiry each: one with two separate tellings on different
  // days (so it can reach a real band), one with a single telling (so it visibly cannot).
  const wellEvidenced = players[12];
  const thinlyEvidenced = players[4];

  const refsA = [
    { ref: signal(wellEvidenced.uid, wellEvidenced.uid, dAgo(41), say[1].text, { sensitivity: 'sensitive' }), text: say[1].text },
    { ref: signal(wellEvidenced.uid, wellEvidenced.uid, dAgo(19), "Same thing Saturday, legs went about an hour in", { sensitivity: 'sensitive' }), text: 'Same thing Saturday, legs went about an hour in' },
  ];
  const refsB = [
    { ref: signal(thinlyEvidenced.uid, thinlyEvidenced.uid, dAgo(8), say[4].text), text: say[4].text },
  ];

  inquiryStates[CODE][`member:${wellEvidenced.uid}`] = {
    [say[1].concept]: inquiryFor(wellEvidenced.uid, `member:${wellEvidenced.uid}`, {
      ...say[1],
      hypothesis: 'the drop-off is conditioning specific to the second half rather than general fitness',
      unknown: ['is it the same in training as in matches, or only in matches?',
        'what does the week before a Saturday match usually look like?'],
      falsifiers: ['a full ninety in training at the same intensity with no drop-off'],
    }, refsA),
  };
  inquiryStates[CODE][`member:${thinlyEvidenced.uid}`] = {
    [say[4].concept]: inquiryFor(thinlyEvidenced.uid, `member:${thinlyEvidenced.uid}`, {
      ...say[4],
      hypothesis: 'the first touch breaks down under pressure rather than in general',
      unknown: ['is it worse receiving with your back to goal, or facing play?'],
      falsifiers: ['the same error rate in unpressured possession drills'],
    }, refsB),
  };

  // A squad-level line, held about the group rather than about any person. Three players said
  // versions of the same thing, independently — which is what makes it a group inquiry and not
  // three personal ones.
  const groupRef = `group:${varsity}`;
  const travelRefs = [8, 21, 27].map((idx, i) => {
    const pl = players[idx];
    return { ref: signal(pl.uid, pl.uid, dAgo(34 - i * 9), say[3].text), text: say[3].text };
  });
  inquiryStates[CODE][groupRef] = {
    [say[3].concept]: inquiryFor(null, groupRef, {
      ...say[3],
      hypothesis: 'late returns from away fixtures are costing the squad more in the following days than the travel itself',
      unknown: ['which days after an away fixture are actually the worst?',
        'is this the whole squad or mainly the players with early classes?'],
      falsifiers: ['no difference in the days after a home fixture at the same intensity'],
    }, travelRefs),
  };

  // A focus that came OUT of that inquiry — the origin is the point. A seeded focus with
  // origin 'leader' would be indistinguishable from one invented, and outcome learning would
  // eventually credit it to nobody.
  const travelInquiry = inquiryStates[CODE][groupRef][say[3].concept];
  teamFocuses[CODE][varsity] = [teamState.newFocus({
    focusId: 'tf_' + rid(), nodeId: varsity,
    text: 'Move the session after an away fixture to the afternoon, and protect the morning',
    by: headCoach, now: now - 12 * 86400000,
    reviewAt: now + 9 * 86400000, inquiry: travelInquiry,
  })];

  // A little assigned work, because "your work" is a real surface and an empty one teaches
  // nothing. Titles that say what they are about — the composer holds back titles it cannot
  // reason from, and a demo full of those would demonstrate the quarantine, not the product.
  assessmentAssignments[CODE] = [
    { id: 'as_' + rid(), assigneeId: wellEvidenced.uid, title: 'Preseason fitness benchmark', status: 'returned', assignedAt: iso(dAgo(70)) },
    { id: 'as_' + rid(), assigneeId: wellEvidenced.uid, title: 'Mid-season self review', status: 'assigned', assignedAt: iso(dAgo(14)) },
    { id: 'as_' + rid(), assigneeId: thinlyEvidenced.uid, title: 'Technical development plan', status: 'assigned', assignedAt: iso(dAgo(21)) },
  ];

  const summary = {
    orgName: orgMeta[CODE].orgName, code: CODE,
    users: Object.keys(orgUsers[CODE]).length,
    players: players.length, staff: 3,
    nodes: Object.keys(orgNodes[CODE]).length,
    evidence: orgSignals[CODE].length,
    inquiries: Object.values(inquiryStates[CODE]).reduce((n, m) => n + Object.keys(m).length, 0),
    focuses: Object.values(teamFocuses[CODE]).reduce((n, l) => n + l.length, 0),
    login: { headCoach: headCoachP.email, player: wellEvidenced.email, password: 'demo1234' },
  };

  return {
    store: {
      orgMeta, orgUsers, emailIndex, orgNodes, orgValues, orgGoals, orgMetrics,
      userPermissions, orgSignals, inquiryStates, teamFocuses, assessmentAssignments,
    },
    summary,
  };
}

module.exports = { buildAlmaStore, ALMA_CODE: CODE };
