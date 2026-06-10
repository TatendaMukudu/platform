/* ============================================================
   PLATFORM — DATA LAYER
   Static config, mode definitions, and org AppState.
   Mock data generators kept for explicit sample-data use only.
   ============================================================ */

const COLORS = ['#4f8ef7','#7c5af5','#0ecfb0','#f7b24f','#f74f7a','#4ff77a','#f74f4f','#b24ff7','#4fb8f7','#f7e44f'];

/* ── Org mode display config ──────────────────────────────────────────────
   orgMode is kept as optional AI/reporting context only (Option B).
   Do NOT use for metrics, hierarchy, permissions, or UI branching.
   Metrics are defined per-org in the Metrics settings, not here.
─────────────────────────────────────────────────────────────────────────── */
const ORG_MODES = {
  school:     { label:'School',      icon:'🎓', color:'#4f8ef7' },
  sports:     { label:'Sports Club', icon:'⚽', color:'#f74f7a' },
  workplace:  { label:'Workplace',   icon:'🏢', color:'#4ff7b2' },
  military:   { label:'Military',    icon:'🎖️', color:'#f7c44f' },
  healthcare: { label:'Healthcare',  icon:'🏥', color:'#b24ff7' },
  government: { label:'Government',  icon:'🏛️', color:'#4fb8f7' },
};

const PLATFORM_GRADES = {
  A: { label:'A-Grade', features:['Full IntelliQ','Real-time monitoring','Behavioral trend analysis','Wellness alerts','AI development plans','External data integration','Mandated reporter tools','Advanced analytics','Complete security'] },
  B: { label:'B-Grade', features:['Performance tracking','Basic IntelliQ','Limited dashboards','Limited reporting'] },
  C: { label:'C-Grade', features:['Simple monitoring','Basic evaluation','Minimal AI','No advanced analytics'] },
};

/* ── Utility functions ────────────────────────────────────── */
function rnd(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function rndFloat(min,max,d=1){ return parseFloat((Math.random()*(max-min)+min).toFixed(d)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ── SAMPLE DATA GENERATORS ───────────────────────────────────
   These are ONLY used when the admin explicitly clicks
   "Load Sample Data". Never called on login or auto-load.
─────────────────────────────────────────────────────────────── */
const SAMPLE_NAMES = {
  sports:    [['Marcus','Jordan','Tyler','Isaiah','Devon','Andre','Kofi','Liam'],     ['Silva','Johnson','Wright','Thompson','Parker','Mensah','Chen','Davis']],
  school:    [['Emma','Olivia','Noah','Liam','Ava','Isabella','James','Sophia'],      ['Smith','Brown','Williams','Jones','Taylor','Wilson','Anderson','Thomas']],
  workplace: [['Sarah','Alex','Jordan','Taylor','Morgan','Jamie','Casey','Riley'],   ['Martinez','Lee','Robinson','Walker','Hall','Young','Allen','King']],
  military:  [['James','Robert','Michael','David','John','William','Richard','Thomas'],['Miller','Wilson','Moore','Jackson','White','Harris','Lewis','Robinson']],
  healthcare:[['Lisa','Amanda','Jennifer','Patricia','Barbara','Linda','Maria','Susan'],['Garcia','Martinez','Anderson','Taylor','Thomas','Moore','Jackson','Lee']],
  government:[['Charles','Daniel','Matthew','Anthony','Donald','Steven','Paul','Mark'], ['Harris','Clark','Lewis','Robinson','Walker','Hall','Young','Allen']],
};

function generateSampleMembers(mode, count=12) {
  const config  = getModeConfig(mode);
  const metrics = ORG_MODES[mode].metrics;
  const [fns, lns] = SAMPLE_NAMES[mode] || SAMPLE_NAMES.workplace;
  const groups  = config.sampleGroups;
  const levels  = config.levels;

  return Array.from({length: count}, (_, i) => {
    const fn = fns[i % fns.length];
    const ln = lns[i % lns.length];
    const scores = {};
    metrics.forEach(m => { scores[m] = rnd(45, 98); });
    const iqScore = rnd(48, 99);
    return {
      id:           i + 1,
      name:         `${fn} ${ln}`,
      initials:     fn[0] + ln[0],
      role:         levels[Math.min(i < 1 ? 0 : i < 3 ? 1 : i < 6 ? 2 : 3, levels.length - 1)],
      group:        groups[i % groups.length],
      color:        COLORS[i % COLORS.length],
      iqScore,
      iqGrade:      iqScore >= 80 ? 'A' : iqScore >= 60 ? 'B' : 'C',
      scores,
      overall:      Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / metrics.length),
      wellnessScore: rnd(30, 100),
      streak:       rnd(0, 30),
      alerts:       rnd(0, 2),
      lastActive:   pick(['Today', 'Yesterday', '2 days ago', '3 days ago']),
      trend:        pick(['up', 'up', 'stable', 'down']),
      trendVal:     rnd(1, 12),
      history:      Array.from({length: 12}, () => rnd(50, 98)),
      joinDate:     `${pick(['Jan','Feb','Mar','Sep','Oct'])} ${rnd(2022, 2024)}`,
      notes:        '',
      devPlan:      [{ text: 'Complete onboarding assessment', done: false }],
      coachInputs:  [], externalData: [], scenarioResults: [], chatHistory: [],
      isSampleData: true,
    };
  });
}

function generateSampleAlerts(mode, members) {
  const types = [
    { type:'warning', title:'Performance Drop',  detail:(m)=>`${m.name} showed a ${rnd(8,22)}% decline this week.` },
    { type:'danger',  title:'Wellness Alert',    detail:(m)=>`${m.name}'s wellness score is critically low.` },
    { type:'success', title:'Milestone Reached', detail:(m)=>`${m.name} achieved a new personal best.` },
    { type:'info',    title:'Assessment Ready',  detail:(m)=>`${m.name} is due for their next IntelliQ assessment.` },
  ];
  const times = ['1h ago','2h ago','5h ago','Yesterday'];
  return Array.from({length: 6}, () => {
    const m = pick(members);
    const t = pick(types);
    return { ...t, detail: t.detail(m), time: pick(times), unread: Math.random() > 0.5, member: m, isSampleData: true };
  });
}

function generateSampleOrgStats(mode, members) {
  const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
  return {
    totalMembers: members.length,
    avgIQ:        avg(members.map(m=>m.iqScore)),
    avgWellness:  avg(members.map(m=>m.wellnessScore)),
    avgOverall:   avg(members.map(m=>m.overall)),
    topPerformer: members.length ? members.reduce((a,b) => a.overall>b.overall?a:b) : null,
    atRisk:       members.filter(m=>m.wellnessScore<50 || m.overall<55).length,
    improving:    members.filter(m=>m.trend==='up').length,
    alerts:       members.reduce((s,m)=>s+m.alerts,0),
  };
}

function generatePerformanceHistory(months=12){
  let base = rndFloat(60,75);
  return Array.from({length:months}, () => {
    base += rndFloat(-5,7);
    base = Math.max(40, Math.min(98, base));
    return parseFloat(base.toFixed(1));
  });
}

/* ── Real-user member record constructor ─────────────────────
   Used when mirroring server users into AppState.members.
   All score fields start null — filled in as the member
   completes assessments and check-ins.
─────────────────────────────────────────────────────────────── */
function buildRealMemberRecord(authUser, index, _modeIgnored) {
  // mode argument ignored — metrics are org-defined, loaded separately
  const scores = {};  // populated when org metrics load
  const name = authUser.name || '';
  const parts = name.trim().split(/\s+/);
  return {
    id:           authUser.id || (index + 1),
    userId:       authUser.id,
    name,
    initials:     parts.map(p => p[0]).join('').slice(0, 2).toUpperCase(),
    role:         authUser.role || 'member',
    group:        authUser.group || authUser.department || '',
    color:        COLORS[index % COLORS.length],
    iqScore:      null,
    iqGrade:      null,
    scores,
    overall:      null,
    wellnessScore:null,
    streak:       0,
    alerts:       0,
    lastActive:   null,
    trend:        'stable',
    trendVal:     0,
    history:      [],
    joinDate:     authUser.createdAt ? new Date(authUser.createdAt).toLocaleDateString('en-GB') : '',
    notes:        '',
    devPlan:      [{ text: 'Complete onboarding', done: false }],
    coachInputs:  [], externalData: [], scenarioResults: [], chatHistory: [],
    authId:       authUser.id,
    isSampleData: false,
  };
}

/* ── Empty real org stats (used when members have no score data) */
function buildEmptyOrgStats(memberCount) {
  return {
    totalMembers: memberCount,
    avgIQ:        null,
    avgWellness:  null,
    avgOverall:   null,
    topPerformer: null,
    atRisk:       0,
    improving:    0,
    alerts:       0,
  };
}

/* ─────────────────────────────────────────────────────────────
   AppState — session-level state.
   members[] starts EMPTY. Populated by loadRealOrgData()
   after login. generateSampleMembers() only called when admin
   explicitly requests sample data.
───────────────────────────────────────────────────────────── */
const AppState = {
  mode:      'school',
  grade:     'A',
  orgName:   '',
  orgCode:   '',
  adminName: '',
  adminRole: '',
  members:   [],
  alerts:    [],
  stats:     {},
  scenarios: [],
  currentMemberId: null,
  currentPage:     'dashboard',
  currentGroup:    'All',
  orgDataLoaded:   false,   // true once loadRealOrgData() completes

  // Sprint 2: org-defined metrics and values (loaded async from server)
  orgMetrics: [],  // [{ metricId, name, source, order }]
  orgValues:  [],  // [string]

  init(mode, orgName, adminName, grade='A') {
    this.mode       = mode;
    this.orgName    = orgName;
    this.adminName  = adminName;
    this.grade      = grade;
    this.members    = [];          // always start empty — real data loaded async
    this.alerts     = [];
    this.stats      = buildEmptyOrgStats(0);
    this.perfHistory = [];
    this.scenarios  = [];
    this.orgMetrics = [];
    this.orgValues  = [];
    this.orgDataLoaded = false;
  },

  /* Load sample data — only called when admin clicks "Load Sample Data" */
  loadSampleData(mode) {
    const m = mode || this.mode;
    this.members     = generateSampleMembers(m, 12);
    this.alerts      = generateSampleAlerts(m, this.members);
    this.stats       = generateSampleOrgStats(m, this.members);
    this.perfHistory = generatePerformanceHistory(12);
    this.orgDataLoaded = true;
  },

  getGroups() {
    const groups = new Set(this.members.map(m => m.group).filter(Boolean));
    return ['All', ...groups];
  },

  getFilteredMembers(group='All', search='') {
    let list = this.members;
    if (group !== 'All') list = list.filter(m => m.group === group);
    if (search) list = list.filter(m =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase())
    );
    return list;
  },

  getMember(id) {
    // Support both numeric mock ids and string auth ids
    return this.members.find(m => m.id === id || m.userId === id || String(m.id) === String(id));
  },

  getUnreadAlertCount() {
    return this.alerts.filter(a => a.unread).length;
  },

  getLevelLabel(levelId) {
    const l = this.orgLevels.find(l => l.id === levelId);
    return l ? l.label : getModeConfig(this.mode).memberTerm;
  },

  /* ── PROACTIVE HEALTH CHECK ───────────────────────────────
     Scans real members for scenario-based alerts.
     Only fires if members have actual scenario results.
  ──────────────────────────────────────────────────────── */
  runHealthCheck() {
    const newAlerts = [];

    this.members.forEach(m => {
      const firstName = m.name.split(' ')[0];
      const results   = m.scenarioResults || [];

      // 1. Score drift
      if (results.length >= 3) {
        const last3 = results.slice(-3).map(r => r.score);
        const isDrifting = last3[2] < last3[1] && last3[1] < last3[0] && (last3[0] - last3[2]) >= 8;
        if (isDrifting) {
          newAlerts.push({
            type: 'warning', alertKind: 'score_drift',
            title: 'Score Drifting Down',
            detail: `${m.name}'s last 3 scenario scores: ${last3[0]} → ${last3[1]} → ${last3[2]}. Gradual decline — early window to act.`,
            time: 'Just now', unread: true, member: m, memberId: m.id, proactive: true,
            suggestedBrief: `${firstName} has been slowly declining across three scenarios (${last3.join(' → ')}). Nothing critical yet but I want to understand the pattern and run a targeted check-in before it gets worse.`,
          });
        }
      }

      // 2. Wellness dropping silently (only if real data present)
      if (m.wellnessScore !== null && m.wellnessScore < 45 && m.overall !== null && m.overall >= 60) {
        const alreadyFlagged = this.alerts.some(a => a.alertKind === 'silent_wellness' && a.memberId === m.id);
        if (!alreadyFlagged) {
          newAlerts.push({
            type: 'warning', alertKind: 'silent_wellness',
            title: 'Wellness Quietly Dropping',
            detail: `${m.name} — performance looks fine (${m.overall}) but wellness is at ${m.wellnessScore}. Often a leading indicator.`,
            time: 'Just now', unread: true, member: m, memberId: m.id, proactive: true,
            suggestedBrief: `${firstName}'s performance numbers look fine but their wellness score has dropped to ${m.wellnessScore}. I want to run a scenario that naturally opens a conversation — not a confrontation, just a check-in.`,
          });
        }
      }

      // 3. Persistent weakness in one dimension
      if (results.length >= 2) {
        const dims = ['ethical_reasoning','stakeholder_awareness','pressure_response','self_awareness'];
        dims.forEach(dim => {
          const vals = results.map(r => r.dimensions?.[dim]).filter(v => v != null);
          if (vals.length >= 2) {
            const avg = Math.round(vals.reduce((s,v) => s+v,0)/vals.length);
            if (avg < 55) {
              newAlerts.push({
                type: 'info', alertKind: 'weak_dimension',
                title: 'Consistent Weakness Detected',
                detail: `${m.name} consistently scores low on ${dim.replace(/_/g,' ')} (avg ${avg} across ${vals.length} scenarios).`,
                time: 'Just now', unread: true, member: m, memberId: m.id, proactive: true,
                weakDimension: dim,
                suggestedBrief: `${firstName} keeps scoring low on ${dim.replace(/_/g,' ')} (avg ${avg}). I want to run a scenario specifically designed to develop this area.`,
              });
            }
          }
        });
      }
    });

    // 4. Unacknowledged flags
    const oldFlags = this.alerts.filter(a =>
      (a.type === 'danger' || a.type === 'warning') && a.memberId && !a.responded && a.time !== 'Just now'
    );
    const flagCounts = {};
    oldFlags.forEach(a => { flagCounts[a.memberId] = (flagCounts[a.memberId] || 0) + 1; });
    Object.entries(flagCounts).forEach(([mid, count]) => {
      if (count >= 2) {
        const m = this.getMember(mid);
        if (!m) return;
        const alreadyNoted = newAlerts.some(a => a.alertKind === 'no_action' && a.memberId === m.id);
        if (!alreadyNoted) {
          newAlerts.push({
            type: 'danger', alertKind: 'no_action',
            title: 'No Action Taken',
            detail: `${m.name} has been flagged ${count} times with no coaching response recorded. IntelliQ is escalating.`,
            time: 'Just now', unread: true, member: m, memberId: m.id, proactive: true,
            suggestedBrief: `${m.name.split(' ')[0]} has been flagged ${count} times with no follow-up. I need to assess where things stand and decide on an action.`,
          });
        }
      }
    });

    newAlerts.forEach(na => {
      const isDup = this.alerts.slice(0,5).some(a => a.alertKind === na.alertKind && a.memberId === na.memberId);
      if (!isDup) this.alerts.unshift(na);
    });

    if (newAlerts.length && typeof updateAlertBadge === 'function') updateAlertBadge();
    return newAlerts.length;
  },

  recordScenarioResult(memberId, result) {
    this.runHealthCheck();
  },
};
