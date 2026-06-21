/* ============================================================
   PLATFORM — DATA LAYER
   Static config, mode definitions, and org AppState.
   All member data is real — loaded via loadRealOrgData() after login.
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

// Sample data generators removed in Sprint 2.
// All member data is real — loaded via loadRealOrgData() from server.

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
    email:        authUser.email        || '',
    passwordSet:  authUser.passwordSet  !== false,  // false = pending setup
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

/* ── Workspace modules — single source of truth for navigation ────────────
   Every module has: id (matches data-page / navigate() target), label,
   icon, section (used as nav group header), and permission (or null for
   always-visible items).  renderSidebar() filters this list by Auth.canDo()
   so no hardcoded role/type branching ever appears in nav HTML.
   ─────────────────────────────────────────────────────────────────────── */
const WORKSPACE_MODULES = [
  // ── My Space — visible to every authenticated user ────────────────────
  { section: 'My Space', id: 'home',        icon: '🏠', label: 'Home',        permission: null },
  { section: null,        id: 'assessments', icon: '🎯', label: 'Assessments', permission: null },
  { section: null,        id: 'checkin',     icon: '💬', label: 'Check-In',    permission: null },
  { section: null,        id: 'notes',       icon: '📝', label: 'Notes',       permission: null },
  { section: null,        id: 'inbox',       icon: '📬', label: 'Inbox',       permission: null },
  { section: null,        id: 'stats',       icon: '📊', label: 'Progress',    permission: null },

  // ── Leader Workspace — only shown when user leads ≥1 node ────────────
  // leaderOnly: true means renderSidebar() gates this on Auth.isLeaderNode().
  // All data in these pages is scoped server-side to the leader's subtree.
  { section: 'Leader Workspace', id: 'leader-home',   icon: '👁',  label: 'Dashboard',    leaderOnly: true },
  { section: null,                id: 'leader-people', icon: '👥', label: 'My Members',  leaderOnly: true },
  { section: null,                id: 'assignments',   icon: '📌', label: 'Assignments',  leaderOnly: true, permission: 'assign_scenarios' },
  // Intelligence: what IntelliQ is noticing — AI patterns, themes, follow-ups
  { section: null, id: 'org-insights', icon: '🧠', label: 'Intelligence', leaderOnly: true, permission: 'view_insights' },
  // Group Health: quantitative metrics on the leader's own subtree (item D)
  { section: null, id: 'group-health', icon: '📊', label: 'Group Health', leaderOnly: true, permission: 'view_insights' },
  // My Groups: set goals & traits for groups the leader LEADS (the TEAM frame)
  { section: null, id: 'leader-groups', icon: '🎯', label: 'My Groups',    leaderOnly: true },
  // Data Sources: upload / connect / see what the AI can use (universal input)
  { section: null, id: 'data-sources', icon: '🔌', label: 'Data Sources', leaderOnly: true },

  // ── Intelligence — analytics / AI (admin+ or explicit grant) ─────────
  { section: 'Intelligence', id: 'analytics', icon: '📊', label: 'Insights',           permission: 'view_analytics'   },
  { section: null,            id: 'intelliq',  icon: '🧠', label: 'Intelligence',       permission: 'view_analytics'   },
  { section: null,            id: 'scenarios', icon: '🎯', label: 'Manage Assessments', permission: 'assign_scenarios' },

  // ── Management — admin / superadmin ───────────────────────────────────
  { section: 'Management',  id: 'organisation', icon: '🏛️', label: 'Organisation',      permission: 'view_team'       },
  { section: null,           id: 'org-health',   icon: '🏥', label: 'Organisation Health', permission: 'view_analytics' },
  { section: null,           id: 'people',       icon: '🏗️', label: 'Members',             permission: 'view_members'    },
  { section: null,           id: 'alerts',       icon: '🔔', label: 'Alerts',               permission: 'view_members',   badge: true },
  { section: null,           id: 'reports',      icon: '📋', label: 'Reports',              permission: 'view_reports'    },
  { section: null,           id: 'settings',     icon: '⚙️', label: 'Settings',             permission: 'manage_settings' },
];

/* ─────────────────────────────────────────────────────────────
   AppState — session-level state.
   members[] starts EMPTY. Populated by loadRealOrgData() after login.
   No sample data generators — all data is real.
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
