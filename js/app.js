/* ============================================================
   PLATFORM — MAIN APPLICATION
   ============================================================ */

/* ── NAVIGATION ──────────────────────────────────────────── */
function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pg = document.getElementById('page-'+page);
  if(pg) pg.classList.add('active');
  document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n=>n.classList.add('active'));
  AppState.currentPage = page;
  document.querySelector('.topbar-title').textContent = PAGE_TITLES[page] || 'Platform';

  if(page==='dashboard') renderDashboard();
  else if(page==='members')   renderMembers();
  else if(page==='analytics') renderAnalytics();
  else if(page==='intelliq')  renderIntelliQ();
  else if(page==='scenarios') renderScenarios();
  else if(page==='people')    renderPeople();
  else if(page==='alerts')    renderAlerts();
  else if(page==='reports')   renderReports();
  else if(page==='settings')  renderSettings();
}

const PAGE_TITLES = {
  dashboard: 'Overview Dashboard',
  members:   'Members & Profiles',
  analytics: 'Analytics & Insights',
  intelliq:  'IntelliQ Engine',
  scenarios: 'Decision Scenarios',
  people:    'People & Hierarchy',
  alerts:    'Alerts & Notifications',
  reports:   'Reports & Stat Sheets',
  settings:  'Platform Settings',
};

/* ── LOGIN ────────────────────────────────────────────────── */
function showLoginPanel(panel) {
  ['login','setup'].forEach(p => {
    document.getElementById(`login-panel-${p}`).style.display = p === panel ? 'block' : 'none';
  });
}

function initLogin() {
  // Org tile selection (setup panel)
  let selectedMode = 'school';
  document.querySelectorAll('.org-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      document.querySelectorAll('.org-tile').forEach(t => t.classList.remove('active'));
      tile.classList.add('active');
      selectedMode = tile.dataset.mode;
    });
  });

  // Check if already logged in via Auth
  if (Auth.init()) {
    const mode  = Auth.currentOrg?.orgMode || 'school';
    const grade = 'A';
    AppState.init(mode, Auth.currentOrg?.orgName || 'Organisation', Auth.currentUser?.name || 'User', grade);
    AppState.adminRole = Auth.ROLE_LABELS[Auth.currentUser?.role] || 'Admin';
    launchApp();
    return;
  }

  // Expose selectedMode for setup handler
  window._selectedOrgMode = selectedMode;
  document.querySelectorAll('.org-tile').forEach(tile => {
    tile.addEventListener('click', () => { window._selectedOrgMode = tile.dataset.mode; });
  });
}

async function handleLogin() {
  const orgCode  = (document.getElementById('login-org-code')?.value  || '').trim();
  const name     = (document.getElementById('login-name')?.value      || '').trim();
  const password = (document.getElementById('login-password')?.value  || '').trim();
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!orgCode || !name || !password) {
    errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return;
  }

  try {
    const { org } = await Auth.login(orgCode, name, password);
    const mode  = org?.orgMode || 'school';
    AppState.init(mode, org?.orgName || orgCode, name, 'A');
    AppState.adminRole = Auth.ROLE_LABELS[Auth.currentUser?.role] || 'Admin';

    if (Auth.isMember()) { launchMemberView(); return; }
    launchApp();
  } catch(e) {
    errEl.textContent  = e.message || 'Login failed.';
    errEl.style.display = 'block';
  }
}

async function handleSetup() {
  const orgName  = (document.getElementById('setup-org-name')?.value   || '').trim();
  const name     = (document.getElementById('setup-admin-name')?.value  || '').trim();
  const password = (document.getElementById('setup-password')?.value    || '').trim();
  const grade    = document.getElementById('setup-grade')?.value        || 'A';
  const orgMode  = window._selectedOrgMode || 'school';
  const errEl    = document.getElementById('setup-error');
  errEl.style.display = 'none';

  if (!orgName || !name || !password) {
    errEl.textContent = 'Please fill in all fields.'; errEl.style.display = 'block'; return;
  }

  try {
    const data = await Auth.setupOrg(orgName, orgMode, name, password);
    await Auth.login(data.orgCode, name, password);
    AppState.init(orgMode, orgName, name, grade);
    AppState.adminRole = 'Super Admin';

    showToast(`Org created! Your code: ${data.orgCode}`, 'success');
    launchApp();
  } catch(e) {
    errEl.textContent   = e.message || 'Setup failed.';
    errEl.style.display = 'block';
  }
}

/* ── MEMBER VIEW (Canvas-style — member logs in, sees their world) ─────── */
function launchMemberView() {
  // Hide the login, show a simplified member dashboard inside the same shell
  document.getElementById('login-screen').style.display = 'none';
  // Redirect to member app
  window.location.href = `/member/?orgCode=${encodeURIComponent(Auth.currentUser.orgCode)}&name=${encodeURIComponent(Auth.currentUser.name)}`;
}

function launchApp(){
  document.getElementById('login-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.classList.add('visible');
  renderSidebar();
  renderTopbar();
  renderAllPages();
  navigate('dashboard');

  // Register org with server so member app can join
  const orgCode = AppState.orgName.toLowerCase().replace(/\s+/g,'-');
  AppState.orgCode = orgCode;
  fetch('/api/platform/register-org', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgCode, orgName: AppState.orgName, orgMode: AppState.mode }),
  }).catch(() => {});

  // Show org join code to admin
  setTimeout(() => showToast(`Member join code: ${orgCode}`, 'info'), 1200);
}

/* ── SIDEBAR ──────────────────────────────────────────────── */
function renderSidebar(){
  const mode = AppState.mode;
  const modeInfo = ORG_MODES[mode];
  const color = modeInfo.color;

  document.querySelector('.sb-logo-text').textContent = 'Platform';
  document.querySelector('.sb-logo-sub').textContent  = modeInfo.label + ' · ' + AppState.grade + '-Grade';

  const badge = document.querySelector('.mode-badge');
  badge.textContent = modeInfo.icon + '  ' + modeInfo.label;
  badge.style.background = color+'22';
  badge.style.color = color;
  badge.style.border = `1px solid ${color}44`;

  document.querySelector('.user-name').textContent = AppState.adminName;
  document.querySelector('.user-role').textContent = AppState.adminRole;
  const av = document.querySelector('.sidebar-footer .user-avatar');
  av.textContent = AppState.adminName.split(' ').map(w=>w[0]).join('').slice(0,2);
  av.style.background = color;

  updateAlertBadge();
}

function updateAlertBadge(){
  const count = AppState.getUnreadAlertCount();
  document.querySelectorAll('.nav-badge').forEach(b => {
    b.textContent = count;
    b.style.display = count ? 'inline' : 'none';
  });
}

/* ── TOPBAR ──────────────────────────────────────────────── */
function renderTopbar(){
  document.getElementById('topbar-org').textContent = AppState.orgName;
}

/* ── DASHBOARD ───────────────────────────────────────────── */
function renderDashboard(){
  const s = AppState.stats;
  const mode = AppState.mode;
  const color = ORG_MODES[mode].color;
  const metrics = ORG_MODES[mode].metrics;

  // Stat cards
  const statsGrid = document.getElementById('dash-stats');
  statsGrid.innerHTML = `
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Total Members</div>
        <span class="stat-icon">👥</span>
      </div>
      <div class="stat-value" style="color:${color}">${s.totalMembers}</div>
      <div class="stat-change up">↑ Active organization</div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Avg IntelliQ Score</div>
        <span class="stat-icon">🧠</span>
      </div>
      <div class="stat-value" style="color:${scoreColor(s.avgIQ)}">${s.avgIQ}</div>
      <div class="stat-change ${s.avgIQ>=70?'up':'down'}">
        ${s.avgIQ>=70?'↑':'↓'} ${scoreLabel(s.avgIQ)}
      </div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Avg Wellness</div>
        <span class="stat-icon">💚</span>
      </div>
      <div class="stat-value" style="color:${scoreColor(s.avgWellness)}">${s.avgWellness}</div>
      <div class="stat-change ${s.avgWellness>=60?'up':'down'}">
        ${s.atRisk} at risk · ${s.improving} improving
      </div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Avg Performance</div>
        <span class="stat-icon">📈</span>
      </div>
      <div class="stat-value" style="color:${scoreColor(s.avgOverall)}">${s.avgOverall}</div>
      <div class="stat-change up">↑ Org-wide metric</div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Active Alerts</div>
        <span class="stat-icon">🔔</span>
      </div>
      <div class="stat-value" style="color:var(--warning)">${s.alerts}</div>
      <div class="stat-change">${AppState.getUnreadAlertCount()} unread</div>
    </div>
    <div class="stat-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div class="stat-label">Top Performer</div>
        <span class="stat-icon">⭐</span>
      </div>
      <div class="stat-value" style="font-size:1.1rem;padding-top:4px">${s.topPerformer.name.split(' ')[0]}</div>
      <div class="stat-change up">Score: ${s.topPerformer.overall}</div>
    </div>`;

  // Performance history chart
  setTimeout(() => {
    createLineChart('chart-perf-history', MONTHS, [
      {
        label: 'Avg Performance',
        data: AppState.perfHistory,
        borderColor: color,
        backgroundColor: color+'22',
        fill: true, tension: 0.4, borderWidth: 2, pointRadius: 3,
      },
      {
        label: 'IntelliQ Trend',
        data: AppState.perfHistory.map(v => Math.round(v * 0.97 + Math.random()*4-2)),
        borderColor: '#7c5af5',
        backgroundColor: 'transparent',
        tension: 0.4, borderWidth: 2, pointRadius: 0, borderDash: [5,5],
      },
    ]);

    // Group avg bar chart
    const groups = AppState.getGroups().filter(g=>g!=='All');
    const groupAvgs = groups.map(g => {
      const ms = AppState.members.filter(m=>m.group===g);
      return Math.round(ms.reduce((s,m)=>s+m.overall,0)/ms.length);
    });
    createBarChart('chart-group-avg', groups, [{
      label: 'Avg Performance',
      data: groupAvgs,
      backgroundColor: groups.map((_,i)=>COLORS[i]+'99'),
      borderColor: groups.map((_,i)=>COLORS[i]),
      borderWidth: 1, borderRadius: 4,
    }], { legend: false });

    // Wellness distribution doughnut
    const excellent = AppState.members.filter(m=>m.wellnessScore>=80).length;
    const good      = AppState.members.filter(m=>m.wellnessScore>=60 && m.wellnessScore<80).length;
    const moderate  = AppState.members.filter(m=>m.wellnessScore>=40 && m.wellnessScore<60).length;
    const critical  = AppState.members.filter(m=>m.wellnessScore<40).length;
    createDoughnutChart('chart-wellness', ['Excellent','Good','Moderate','Critical'],
      [excellent, good, moderate, critical],
      ['#4ff77a','#4f8ef7','#f7b24f','#f74f4f']);

    // IQ vs Performance scatter
    createScatterChart('chart-scatter', AppState.members);
  }, 50);

  // Recent alerts
  const alertsContainer = document.getElementById('dash-alerts');
  alertsContainer.innerHTML = AppState.alerts.slice(0,6).map((a,i)=>alertItemHTML(a,i)).join('');

  // Top 5 performers
  const top5 = [...AppState.members].sort((a,b)=>b.overall-a.overall).slice(0,5);
  document.getElementById('dash-top5').innerHTML = top5.map(m => `
    <tr onclick="showProfile(${m.id})">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="user-avatar" style="width:28px;height:28px;font-size:0.7rem;background:${m.color}">${m.initials}</div>
          ${m.name}
        </div>
      </td>
      <td>${m.role}</td>
      <td><span style="color:${scoreColor(m.iqScore)};font-weight:600">${m.iqScore}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1">${progressHTML(m.overall, scoreColor(m.overall))}</div>
          <span style="font-size:0.8rem;font-weight:600;width:28px;text-align:right">${m.overall}</span>
        </div>
      </td>
      <td>${gradeBadgeHTML(m.iqGrade)}</td>
    </tr>`).join('');
}

/* ── MEMBERS PAGE ────────────────────────────────────────── */
let memberSearch = '', memberGroup = 'All';

function renderMembers(){
  const mode = AppState.mode;
  const metrics = ORG_MODES[mode].metrics;
  const groups = AppState.getGroups();

  // Group filter tabs
  const groupTabs = document.getElementById('members-group-tabs');
  groupTabs.innerHTML = groups.map(g =>
    `<button class="tab-btn ${g===memberGroup?'active':''}" onclick="filterMembers('${g}')">${g}</button>`
  ).join('');

  const filtered = AppState.getFilteredMembers(memberGroup, memberSearch);
  document.getElementById('members-count').textContent = `${filtered.length} members`;

  const grid = document.getElementById('members-grid');
  grid.innerHTML = filtered.length
    ? filtered.map(m => memberCardHTML(m, metrics)).join('')
    : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><p>No members match your search.</p></div>`;
}

function filterMembers(group){
  memberGroup = group;
  renderMembers();
}

function searchMembers(val){
  memberSearch = val;
  renderMembers();
}

/* ── ANALYTICS PAGE ──────────────────────────────────────── */
function renderAnalytics(){
  const mode = AppState.mode;
  const color = ORG_MODES[mode].color;
  const metrics = ORG_MODES[mode].metrics;

  setTimeout(() => {
    // Metric averages bar
    const metricAvgs = metrics.map(m => {
      const vals = AppState.members.map(mem=>mem.scores[m]);
      return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    });
    createHorizBarChart('chart-metric-avgs', metrics, metricAvgs, color);

    // Top vs Bottom performers
    const top = [...AppState.members].sort((a,b)=>b.overall-a.overall).slice(0,5);
    const bot = [...AppState.members].sort((a,b)=>a.overall-b.overall).slice(0,5);
    createBarChart('chart-top-bot', [...top.map(m=>m.name.split(' ')[0]), ...bot.map(m=>m.name.split(' ')[0])],
      [{
        label: 'Performance',
        data: [...top.map(m=>m.overall), ...bot.map(m=>m.overall)],
        backgroundColor: [...top.map(()=>color+'99'), ...bot.map(()=>'#f74f4f99')],
        borderColor: [...top.map(()=>color), ...bot.map(()=>'#f74f4f')],
        borderWidth: 1, borderRadius: 4,
      }], { legend: false });

    // IQ distribution
    const buckets = [0,0,0,0,0]; // 0-19,20-39,40-59,60-79,80-100
    AppState.members.forEach(m => {
      const b = Math.min(4, Math.floor(m.iqScore/20));
      buckets[b]++;
    });
    createBarChart('chart-iq-dist', ['0-19','20-39','40-59','60-79','80-100'],
      [{ label:'Members', data:buckets, backgroundColor:'#7c5af599', borderColor:'#7c5af5', borderWidth:1, borderRadius:4 }],
      { legend:false });

    // Trend over 6 months per group
    const groups = AppState.getGroups().filter(g=>g!=='All');
    const last6 = MONTHS.slice(-6);
    const datasets = groups.slice(0,4).map((g,i) => ({
      label: g,
      data: Array.from({length:6}, () => rnd(55,92)),
      borderColor: COLORS[i],
      backgroundColor: 'transparent',
      tension: 0.4, borderWidth: 2, pointRadius: 2,
    }));
    createLineChart('chart-group-trend', last6, datasets, { yMin:40 });
  }, 50);

  // At-risk table
  const atRisk = AppState.members.filter(m=>m.wellnessScore<50||m.overall<55||m.alerts>1)
    .sort((a,b)=>a.wellnessScore-b.wellnessScore).slice(0,8);
  document.getElementById('analytics-risk-table').innerHTML = atRisk.map(m=>`
    <tr onclick="showProfile(${m.id})">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="user-avatar" style="width:28px;height:28px;font-size:0.7rem;background:${m.color}">${m.initials}</div>
          ${m.name}
        </div>
      </td>
      <td>${m.group}</td>
      <td><span style="color:${scoreColor(m.wellnessScore)};font-weight:600">${m.wellnessScore}</span></td>
      <td><span style="color:${scoreColor(m.overall)};font-weight:600">${m.overall}</span></td>
      <td>${m.alerts > 0 ? `<span style="color:var(--danger)">${m.alerts} active</span>` : '—'}</td>
      <td><button class="btn btn-sm btn-accent" onclick="event.stopPropagation();showProfile(${m.id})">View Profile</button></td>
    </tr>`).join('');
}

/* ── INTELLIQ PAGE ───────────────────────────────────────── */
function renderIntelliQ(){
  const members = AppState.members;
  const mode = AppState.mode;
  const color = ORG_MODES[mode].color;
  const metrics = ORG_MODES[mode].metrics;

  // Top IQ scores
  const top = [...members].sort((a,b)=>b.iqScore-a.iqScore);

  // IQ Rings for top 4
  document.getElementById('iq-top-rings').innerHTML = top.slice(0,4).map(m=>`
    <div style="text-align:center">
      ${iqRingHTML(m.iqScore, scoreColor(m.iqScore), 110)}
      <div style="font-size:0.82rem;font-weight:600;margin-top:6px">${m.name.split(' ')[0]}</div>
      <div style="font-size:0.72rem;color:var(--text-secondary)">${m.role}</div>
      ${gradeBadgeHTML(m.iqGrade)}
    </div>`).join('');

  // IQ leaderboard table
  document.getElementById('iq-leaderboard').innerHTML = top.map((m,i)=>`
    <tr onclick="showProfile(${m.id})">
      <td><span style="font-weight:700;color:var(--text-muted)">#${i+1}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="user-avatar" style="width:28px;height:28px;font-size:0.7rem;background:${m.color}">${m.initials}</div>
          ${m.name}
        </div>
      </td>
      <td>${m.group}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          ${progressHTML(m.iqScore, scoreColor(m.iqScore))}
          <span style="font-size:0.82rem;font-weight:700;color:${scoreColor(m.iqScore)};width:30px">${m.iqScore}</span>
        </div>
      </td>
      <td>${gradeBadgeHTML(m.iqGrade)}</td>
      <td><span style="color:${scoreColor(m.wellnessScore)}">${m.wellnessScore}</span></td>
    </tr>`).join('');

  // ── IntelliQ Executive Health Panel ──────────────────────
  AppState.runHealthCheck();
  const openAlerts     = AppState.alerts.filter(a => a.proactive && !a.responded);
  const unactioned     = AppState.alerts.filter(a => (a.type === 'danger' || a.type === 'warning') && !a.responded);
  const atRiskMembers  = AppState.members.filter(m => m.wellnessScore < 45 || m.overall < 55);
  const noEngagement   = AppState.members.filter(m => !m.lastActive || m.lastActive === '1 week ago');

  document.getElementById('iq-health-panel').innerHTML = `
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:1rem">IntelliQ Org Health View</div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.7rem;margin-bottom:1.2rem">
      ${[
        { label:'Open Warnings',   val: openAlerts.length,   color: openAlerts.length ? 'var(--warning)' : 'var(--success)', icon:'⚠' },
        { label:'Unactioned Flags',val: unactioned.length,   color: unactioned.length > 2 ? 'var(--danger)' : unactioned.length ? 'var(--warning)' : 'var(--success)', icon:'🔔' },
        { label:'At-Risk Members', val: atRiskMembers.length,color: atRiskMembers.length > 3 ? 'var(--danger)' : 'var(--warning)', icon:'🚨' },
        { label:'Low Engagement',  val: noEngagement.length, color: noEngagement.length > 4 ? 'var(--warning)' : 'var(--text-secondary)', icon:'💤' },
      ].map(s => `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:0.8rem;text-align:center">
          <div style="font-size:1.2rem">${s.icon}</div>
          <div style="font-size:1.4rem;font-weight:700;color:${s.color};margin:4px 0">${s.val}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">${s.label}</div>
        </div>`).join('')}
    </div>

    ${openAlerts.length ? `
      <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.5rem">Active IntelliQ Warnings — requires coach response</div>
      ${openAlerts.slice(0,4).map((a, i) => {
        const idx = AppState.alerts.indexOf(a);
        return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.6rem 0.8rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin-bottom:0.4rem;font-size:0.8rem">
          <span style="color:${a.type==='danger'?'var(--danger)':'var(--warning)'}">●</span>
          <div style="flex:1;min-width:0">
            <span style="font-weight:600">${a.member?.name || '—'}</span>
            <span style="color:var(--text-muted);margin-left:0.4rem">${a.title}</span>
          </div>
          <button class="btn btn-accent btn-sm" style="font-size:0.72rem"
            onclick="openAlertCompose(${idx})">Respond →</button>
        </div>`;
      }).join('')}
      ${openAlerts.length > 4 ? `<div style="font-size:0.75rem;color:var(--accent);cursor:pointer;margin-top:0.3rem" onclick="navigate('alerts')">+ ${openAlerts.length-4} more — view all alerts →</div>` : ''}
    ` : `<div style="font-size:0.82rem;color:var(--success);text-align:center;padding:1rem">✓ No open warnings — org looks healthy</div>`}`;

  setTimeout(()=>{
    // Radar for org average
    const avgScores = metrics.map(k => {
      return Math.round(members.reduce((s,m)=>s+(m.scores[k]||0),0)/members.length);
    });
    createRadarChart('chart-org-radar', metrics, [{
      label: AppState.orgName,
      data: avgScores,
      borderColor: color,
      backgroundColor: color+'33',
      borderWidth: 2,
      pointBackgroundColor: color,
      pointRadius: 4,
    }]);

    // Mental readiness histogram
    const buckets = [0,0,0,0,0];
    members.forEach(m => { buckets[Math.min(4,Math.floor(m.wellnessScore/20))]++; });
    createBarChart('chart-readiness', ['Very Low','Low','Moderate','High','Peak'],
      [{ label:'Members', data:buckets, backgroundColor:['#f74f4f99','#f7a84f99','#f7b24f99','#4f8ef799','#4ff77a99'],
         borderColor:['#f74f4f','#f7a84f','#f7b24f','#4f8ef7','#4ff77a'], borderWidth:1, borderRadius:4 }],
      { legend:false });
  }, 50);
}

/* ── ALERTS PAGE ─────────────────────────────────────────── */
function renderAlerts(){
  // Run a health check each time the page is opened so it's always fresh
  AppState.runHealthCheck();

  const alerts  = AppState.alerts;
  const container = document.getElementById('alerts-list');
  document.getElementById('alerts-unread-count').textContent = AppState.getUnreadAlertCount();

  if (!alerts.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>No alerts — org looks healthy.</p></div>`;
    return;
  }

  // Group: proactive (IntelliQ-generated) vs manual
  const proactive = alerts.filter(a => a.proactive);
  const manual    = alerts.filter(a => !a.proactive);

  const sectionHTML = (title, icon, items) => {
    if (!items.length) return '';
    return `
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin:1rem 0 0.6rem">${icon} ${title} (${items.length})</div>
      ${items.map((a, i) => {
        const idx = alerts.indexOf(a);
        return alertActionItemHTML(a, idx);
      }).join('')}`;
  };

  container.innerHTML =
    sectionHTML('IntelliQ Early Warnings', '🧠', proactive) +
    sectionHTML('Manual Flags & Notifications', '🔔', manual);
}

function alertActionItemHTML(a, idx) {
  const typeColors = { danger:'#f74f4f', warning:'#f7b24f', success:'#4ff77a', info:'#4f8ef7' };
  const color = typeColors[a.type] || '#4f8ef7';
  const unreadDot = a.unread ? `<span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;margin-top:4px"></span>` : `<span style="width:8px;height:8px;display:inline-block;flex-shrink:0"></span>`;
  const proactiveBadge = a.proactive ? `<span style="font-size:0.65rem;background:rgba(124,90,245,0.15);color:var(--accent);border:1px solid rgba(124,90,245,0.3);border-radius:4px;padding:2px 6px;margin-left:6px">IntelliQ</span>` : '';
  const respondedBadge = a.responded ? `<span style="font-size:0.65rem;background:rgba(79,247,122,0.15);color:var(--success);border:1px solid rgba(79,247,122,0.3);border-radius:4px;padding:2px 6px;margin-left:6px">Responded</span>` : '';

  const actionBtn = a.memberId && !a.responded
    ? `<button class="btn btn-accent btn-sm" style="flex-shrink:0"
        onclick="openAlertCompose(${idx})">Respond →</button>`
    : a.member
    ? `<button class="btn btn-outline btn-sm" style="flex-shrink:0;font-size:0.73rem"
        onclick="showProfile(${a.member.id})">View Profile</button>`
    : '';

  return `
    <div style="display:flex;gap:0.7rem;align-items:flex-start;padding:0.9rem 0;border-bottom:1px solid var(--border)"
         onclick="markAlertRead(${idx})">
      ${unreadDot}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:0.25rem">
          <span style="font-size:0.85rem;font-weight:600;color:${color}">${a.title}</span>
          ${proactiveBadge}${respondedBadge}
        </div>
        <div style="font-size:0.8rem;color:var(--text-secondary);line-height:1.5;margin-bottom:0.35rem">${a.detail}</div>
        <div style="font-size:0.7rem;color:var(--text-muted)">${a.time}</div>
      </div>
      ${actionBtn}
    </div>`;
}

function markAlertRead(idx){
  if(AppState.alerts[idx]) AppState.alerts[idx].unread = false;
  updateAlertBadge();
  if (AppState.currentPage === 'alerts') renderAlerts();
}

function markAllRead(){
  AppState.alerts.forEach(a=>a.unread=false);
  updateAlertBadge();
  renderAlerts();
  showToast('All alerts marked as read','success');
}

/* ── ALERT COMPOSE FLOW ──────────────────────────────────── */
let _alertComposeIdx    = null;
let _alertAttachment    = null;
let _alertDifficulty    = 'Medium';

function openAlertCompose(alertIdx) {
  const a = AppState.alerts[alertIdx];
  if (!a) return;

  _alertComposeIdx = alertIdx;
  _alertAttachment = null;
  _alertDifficulty = 'Medium';

  // Header
  document.getElementById('acm-title').textContent = `Respond: ${a.title}`;
  document.getElementById('acm-sub').textContent   = a.member ? a.member.name : '';

  // Context banner
  document.getElementById('acm-context-banner').textContent = a.detail;

  // Member selector — pre-select flagged member
  const memberSel = document.getElementById('acm-member');
  memberSel.innerHTML = AppState.members
    .sort((x,y) => x.name.localeCompare(y.name))
    .map(m => `<option value="${m.id}" ${m.id === a.memberId ? 'selected' : ''}>${m.name}</option>`)
    .join('');

  // Pre-fill brief from suggested
  document.getElementById('acm-brief').value = a.suggestedBrief || '';

  // Reset panels
  document.getElementById('acm-draft-panel').style.display   = 'none';
  document.getElementById('acm-attachment-preview').innerHTML = '';
  document.getElementById('acm-embed-preview').innerHTML      = '';
  document.getElementById('acm-embed-url').value              = '';

  selectAlertDifficulty('Medium');
  openModal('alert-compose-modal');
}

function selectAlertDifficulty(diff) {
  _alertDifficulty = diff;
  document.querySelectorAll('.acm-diff-btn').forEach(btn => {
    const active = btn.dataset.diff === diff;
    const color  = ORG_MODES[AppState.mode].color;
    btn.style.background  = active ? `${color}22` : '';
    btn.style.color       = active ? color : '';
    btn.style.borderColor = active ? `${color}44` : '';
  });
}

async function handleAlertFileSelect(file) {
  if (!file) return;
  const preview = document.getElementById('acm-attachment-preview');
  preview.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted)">Processing ${file.name}…</div>`;
  try {
    _alertAttachment = await AttachmentHandler.process(file);
    preview.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.6rem;padding:0.6rem 0.8rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;font-size:0.8rem">
        <span>${AttachmentHandler.ICONS[_alertAttachment.kind] || '📎'}</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_alertAttachment.name}</span>
        <span style="color:var(--success);font-size:0.72rem">✓ Ready</span>
        <button onclick="_alertAttachment=null;document.getElementById('acm-attachment-preview').innerHTML=''" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.9rem">✕</button>
      </div>
      ${_alertAttachment.kind === 'image' ? `<img src="${_alertAttachment.preview}" style="max-height:120px;border-radius:6px;margin-top:0.4rem"/>` : ''}`;
  } catch(e) {
    preview.innerHTML = `<div style="font-size:0.8rem;color:var(--danger)">${e.message}</div>`;
  }
}

function handleAlertDrop(event) {
  event.preventDefault();
  document.getElementById('acm-dropzone').classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (file) handleAlertFileSelect(file);
}

function attachAlertEmbed() {
  const url = (document.getElementById('acm-embed-url').value || '').trim();
  if (!url) return;
  const embed = AttachmentHandler.processEmbed(url);
  if (!embed) return;
  _alertAttachment = embed;
  document.getElementById('acm-embed-preview').innerHTML = `
    <div style="margin-top:0.4rem">${embed.embedHTML}</div>
    <div style="font-size:0.72rem;color:var(--success);margin-top:4px">✓ Will be shown to member during scenario</div>`;
}

async function draftAlertScenario() {
  const brief    = (document.getElementById('acm-brief')?.value || '').trim();
  const memberId = parseInt(document.getElementById('acm-member')?.value) || null;
  if (!brief)    { showToast('Write a brief first', 'warning'); return; }
  if (!memberId) { showToast('Select a member', 'warning'); return; }

  const btn = document.getElementById('acm-draft-btn');
  if (btn) { btn.textContent = '✦ Drafting…'; btn.disabled = true; }

  const member = AppState.getMember(memberId);

  // Build image payload if attachment is image/pdf
  let imagePayload = null;
  if (_alertAttachment?.kind === 'image' || _alertAttachment?.kind === 'pdf') {
    imagePayload = { data: _alertAttachment.data, mediaType: _alertAttachment.mediaType };
  }

  try {
    const res = await fetch('/api/draft-scenario', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brief,
        orgMode:    AppState.mode,
        orgName:    AppState.orgName,
        memberName: member?.name?.split(' ')[0] || 'the member',
        difficulty: _alertDifficulty,
        image:      imagePayload,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { draft } = await res.json();

    document.getElementById('acm-draft-title').value   = draft.title   || '';
    document.getElementById('acm-draft-opening').value = draft.opening || '';
    document.getElementById('acm-draft-coachnote').textContent = draft.coachNote || '';
    document.getElementById('acm-draft-probes').innerHTML = (draft.probes || []).map((p, i) => `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem;align-items:flex-start">
        <span style="font-size:0.72rem;color:var(--text-muted);padding-top:8px;flex-shrink:0">${i+1}.</span>
        <input type="text" class="form-input acm-probe-input" value="${p.replace(/"/g,'&quot;')}" style="flex:1;font-size:0.82rem"/>
      </div>`).join('');

    document.getElementById('acm-draft-panel').style.display = 'block';
    document.getElementById('acm-actions').style.display     = 'none';

  } catch(err) {
    // Fallback: let coach edit manually
    document.getElementById('acm-draft-title').value   = 'Follow-up Scenario';
    document.getElementById('acm-draft-opening').value = `[AI unavailable — edit manually]\n\nBrief: ${brief}`;
    document.getElementById('acm-draft-coachnote').textContent = 'AI service offline. Edit the scenario manually.';
    document.getElementById('acm-draft-probes').innerHTML = `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem">
        <span style="font-size:0.72rem;color:var(--text-muted);padding-top:8px">1.</span>
        <input type="text" class="form-input acm-probe-input" value="Walk me through your thinking on this." style="flex:1;font-size:0.82rem"/>
      </div>`;
    document.getElementById('acm-draft-panel').style.display = 'block';
    document.getElementById('acm-actions').style.display     = 'none';
  } finally {
    if (btn) { btn.textContent = '✦ Draft Scenario with AI →'; btn.disabled = false; }
  }
}

function approveAlertDraft() {
  const title    = (document.getElementById('acm-draft-title')?.value   || '').trim();
  const opening  = (document.getElementById('acm-draft-opening')?.value || '').trim();
  const brief    = (document.getElementById('acm-brief')?.value         || '').trim();
  const memberId = parseInt(document.getElementById('acm-member')?.value) || null;
  const probes   = [...document.querySelectorAll('.acm-probe-input')].map(i => i.value.trim()).filter(Boolean);

  if (!title || !opening || !memberId) { showToast('Fill in title, opening, and member', 'warning'); return; }

  const scenario = {
    id:         `sc_alert_${Date.now()}`,
    title,
    brief,
    domain:     'Follow-up',
    context:    brief,
    opening,
    probes,
    difficulty: _alertDifficulty,
    attachment: _alertAttachment || null,
    createdBy:  AppState.adminName,
    createdAt:  new Date().toLocaleDateString('en-GB'),
    fromAlert:  true,
  };

  AppState.scenarios.push(scenario);

  // Mark the source alert as responded
  if (_alertComposeIdx !== null && AppState.alerts[_alertComposeIdx]) {
    AppState.alerts[_alertComposeIdx].responded = true;
    AppState.alerts[_alertComposeIdx].unread    = false;
  }

  updateAlertBadge();
  closeAllModals();
  showToast(`Scenario approved — launching for ${AppState.getMember(memberId)?.name}`, 'success');
  ScenarioEngine.start(scenario, memberId);
}

/* ── REPORTS PAGE ────────────────────────────────────────── */
function renderReports(){
  const mode = AppState.mode;
  const color = ORG_MODES[mode].color;
  const metrics = ORG_MODES[mode].metrics;

  // Summary stat sheet
  const s = AppState.stats;
  document.getElementById('report-org').textContent = AppState.orgName;
  document.getElementById('report-mode').textContent = ORG_MODES[mode].label;
  document.getElementById('report-grade').innerHTML = gradeBadgeHTML(AppState.grade);
  document.getElementById('report-date').textContent = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('report-total').textContent = s.totalMembers;
  document.getElementById('report-avg-iq').textContent = s.avgIQ;
  document.getElementById('report-avg-perf').textContent = s.avgOverall;
  document.getElementById('report-at-risk').textContent = s.atRisk;

  // Member stat sheet table
  const sorted = [...AppState.members].sort((a,b)=>b.overall-a.overall);
  document.getElementById('stat-sheet-thead').innerHTML = `
    <tr>
      <th>Rank</th><th>Name</th><th>Group</th>
      ${metrics.map(m=>`<th>${m}</th>`).join('')}
      <th>IntelliQ</th><th>Overall</th><th>Grade</th>
    </tr>`;
  document.getElementById('stat-sheet-tbody').innerHTML = sorted.map((m,i)=>`
    <tr onclick="showProfile(${m.id})">
      <td><span style="font-weight:700;color:var(--text-muted)">${i+1}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="user-avatar" style="width:24px;height:24px;font-size:0.65rem;background:${m.color}">${m.initials}</div>
          ${m.name}
        </div>
      </td>
      <td style="color:var(--text-secondary)">${m.group}</td>
      ${metrics.map(k=>`<td><span style="color:${scoreColor(m.scores[k])};font-weight:600">${m.scores[k]}</span></td>`).join('')}
      <td><span style="color:${scoreColor(m.iqScore)};font-weight:600">${m.iqScore}</span></td>
      <td><span style="font-weight:700;color:${scoreColor(m.overall)}">${m.overall}</span></td>
      <td>${gradeBadgeHTML(m.iqGrade)}</td>
    </tr>`).join('');
}

/* ── PEOPLE PAGE ─────────────────────────────────────────── */
async function renderPeople() {
  const subEl = document.getElementById('people-sub');
  if (subEl) subEl.textContent = `${AppState.orgName} · ${Auth.currentUser?.name || 'Admin'}`;

  const container = document.getElementById('hierarchy-tree-container');
  if (!container) return;
  container.innerHTML = `<div style="padding:1rem;color:var(--text-muted);font-size:0.85rem">Loading tree…</div>`;

  try {
    await HierarchyTree.load();
    // Expand current user's node by default
    if (Auth.currentUser?.id) HierarchyTree._expanded.add(Auth.currentUser.id);
    HierarchyTree.render('hierarchy-tree-container');
  } catch(e) {
    // Demo mode — build tree from AppState.members
    container.innerHTML = `
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.8rem;padding:0.5rem;background:rgba(247,178,79,0.1);border-radius:6px">
        Demo mode — tree shows mock members. Real hierarchy available after org setup.
      </div>
      ${_demoTreeHTML()}`;
  }
}

function _demoTreeHTML() {
  const color = ORG_MODES[AppState.mode].color;
  return `
    <div class="tree-node" style="border-color:rgba(124,90,245,0.4);background:rgba(124,90,245,0.05);margin-bottom:0.4rem">
      <div class="tree-node-left">
        <span style="width:20px;display:inline-block"></span>
        <div class="tree-avatar" style="background:rgba(124,90,245,0.2);color:var(--accent)">🔑</div>
        <div class="tree-info">
          <div class="tree-name">${AppState.adminName} <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem">(you)</span></div>
          <div class="tree-role">Super Admin</div>
        </div>
      </div>
      <div class="tree-actions">
        <span class="tree-count">${AppState.members.length} below</span>
      </div>
    </div>
    <div style="margin-left:28px">
      ${AppState.members.slice(0,8).map(m => `
        <div class="tree-node" style="margin-bottom:0.4rem">
          <div class="tree-node-left">
            <span style="width:20px;display:inline-block"></span>
            <div class="tree-avatar" style="background:${m.color}22;color:${m.color}">${m.initials}</div>
            <div class="tree-info">
              <div class="tree-name">${m.name}</div>
              <div class="tree-role">${m.role} · ${m.group}</div>
            </div>
          </div>
          <div class="tree-actions">
            <button class="tree-btn" onclick="showProfile(${m.id})">View</button>
          </div>
        </div>`).join('')}
      ${AppState.members.length > 8 ? `<div style="font-size:0.78rem;color:var(--text-muted);padding:0.5rem 0">+ ${AppState.members.length-8} more members</div>` : ''}
    </div>`;
}

/* ── SETTINGS PAGE ───────────────────────────────────────── */
function renderSettings(){
  const mode = AppState.mode;
  const info = ORG_MODES[mode];
  const grade = AppState.grade;

  document.getElementById('settings-org-name').textContent  = AppState.orgName;
  document.getElementById('settings-mode').textContent      = info.label;
  document.getElementById('settings-grade').innerHTML       = gradeBadgeHTML(grade);
  document.getElementById('settings-admin').textContent     = AppState.adminName;

  // Feature list for current grade
  const features = PLATFORM_GRADES[grade].features;
  document.getElementById('settings-features').innerHTML = features.map(f=>`
    <div style="display:flex;align-items:center;gap:8px;padding:0.5rem 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--success);font-size:0.9rem">✓</span>
      <span style="font-size:0.85rem">${f}</span>
    </div>`).join('');

  // Mode cards
  document.getElementById('settings-modes').innerHTML = Object.entries(ORG_MODES).map(([k,v])=>`
    <div class="org-tile ${k===mode?'active':''}" onclick="switchMode('${k}')" style="${k===mode?'border-color:'+v.color+';background:'+v.color+'22;color:'+v.color:''}">
      <div class="tile-icon">${v.icon}</div>
      <div style="font-size:0.72rem">${v.label}</div>
    </div>`).join('');

  // Hierarchy builder
  const hierarchyEl = document.getElementById('settings-hierarchy');
  if (hierarchyEl) hierarchyEl.innerHTML = renderHierarchyBuilder();
}

function switchMode(newMode){
  AppState.mode = newMode;
  AppState.members = generateMembers(newMode, 24);
  AppState.alerts  = generateAlerts(newMode, AppState.members);
  AppState.stats   = generateOrgStats(newMode, AppState.members);
  AppState.perfHistory = generatePerformanceHistory(12);
  AppState.members.forEach((m, i) => {
    m.levelId      = i < 2 ? 2 : i < 6 ? 3 : 4;
    m.supervisorId = i < 2 ? null : (i % 2 === 0 ? 1 : 2);
  });
  renderSidebar();
  renderSettings();
  showToast(`Switched to ${ORG_MODES[newMode].label} mode`, 'success');
}

/* ── HIERARCHY BUILDER (in Settings) ────────────────────── */
function renderHierarchyBuilder() {
  const levels = AppState.orgLevels;
  return `
    <div style="margin-top:1.5rem">
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.8rem">Organisation Hierarchy</div>
      <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.6">
        Define your org's levels. Assign members to levels from their profile. Higher levels can see everyone below them.
        IntelliQ watches all levels and escalates upward automatically.
      </div>

      <div id="hierarchy-levels-list">
        ${levels.map((l, i) => `
          <div style="display:flex;align-items:center;gap:0.6rem;padding:0.6rem 0.8rem;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin-bottom:0.4rem">
            <span style="font-size:0.72rem;color:var(--text-muted);width:16px;text-align:center;flex-shrink:0">${l.id}</span>
            <input type="text" class="form-input" value="${l.label}" id="level-label-${l.id}"
              style="flex:1;font-size:0.82rem;padding:5px 8px"
              onchange="AppState.orgLevels[${i}].label=this.value"/>
            <label style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-secondary);cursor:pointer;flex-shrink:0">
              <input type="checkbox" ${l.canSeeBelow ? 'checked' : ''}
                onchange="AppState.orgLevels[${i}].canSeeBelow=this.checked"/>
              Can see below
            </label>
            ${levels.length > 2 ? `<button onclick="removeHierarchyLevel(${i})"
              style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.9rem;padding:0 4px">✕</button>` : ''}
          </div>`).join('')}
      </div>

      <div style="display:flex;gap:0.5rem;margin-top:0.6rem">
        <button class="btn btn-outline btn-sm" onclick="addHierarchyLevel()">+ Add Level</button>
        <button class="btn btn-accent btn-sm" onclick="saveHierarchy()">Save Hierarchy</button>
      </div>

      <!-- Member level assignment -->
      <div style="margin-top:1.4rem">
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.7rem">Assign Members to Levels</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:0.5rem;max-height:220px;overflow-y:auto;padding:2px">
          ${AppState.members.map(m => `
            <div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.7rem;background:var(--surface-2);border:1px solid var(--border);border-radius:6px">
              <div class="user-avatar" style="width:24px;height:24px;font-size:0.65rem;background:${m.color};flex-shrink:0">${m.initials}</div>
              <span style="font-size:0.78rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.name}</span>
              <select style="font-size:0.72rem;padding:2px 4px;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;color:var(--text-primary)"
                onchange="AppState.getMember(${m.id}).levelId=parseInt(this.value)">
                ${AppState.orgLevels.map(l =>
                  `<option value="${l.id}" ${m.levelId === l.id ? 'selected' : ''}>${l.label}</option>`
                ).join('')}
              </select>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function addHierarchyLevel() {
  const nextId = Math.max(...AppState.orgLevels.map(l => l.id)) + 1;
  AppState.orgLevels.push({ id: nextId, label: `Level ${nextId}`, canSeeBelow: false });
  document.getElementById('settings-hierarchy').innerHTML = renderHierarchyBuilder();
}

function removeHierarchyLevel(idx) {
  if (AppState.orgLevels.length <= 2) return;
  AppState.orgLevels.splice(idx, 1);
  AppState.orgLevels.forEach((l, i) => l.id = i + 1);
  document.getElementById('settings-hierarchy').innerHTML = renderHierarchyBuilder();
}

function saveHierarchy() {
  showToast('Hierarchy saved', 'success');
}

/* ── PROFILE MODAL ───────────────────────────────────────── */
function showProfile(id){
  const m = AppState.getMember(id);
  if(!m) return;
  const mode = AppState.mode;
  const metrics = ORG_MODES[mode].metrics;
  const color = m.color;

  AppState.currentMemberId = id;

  const modal = document.getElementById('profile-modal');
  document.getElementById('pm-name').textContent    = m.name;
  document.getElementById('pm-role').textContent    = `${m.role} · ${m.group}`;
  document.getElementById('pm-avatar').textContent  = m.initials;
  document.getElementById('pm-avatar').style.background = color;
  document.getElementById('pm-grade').innerHTML     = gradeBadgeHTML(m.iqGrade);
  document.getElementById('pm-joined').textContent  = `Joined ${m.joinDate}`;
  document.getElementById('pm-active').textContent  = `Active: ${m.lastActive}`;
  document.getElementById('pm-streak').textContent  = `🔥 ${m.streak}-day streak`;
  document.getElementById('pm-iq-ring').innerHTML   = iqRingHTML(m.iqScore, scoreColor(m.iqScore), 100);
  document.getElementById('pm-overall').textContent = m.overall;
  document.getElementById('pm-wellness').innerHTML  = wellnessMeterHTML(m.wellnessScore);
  document.getElementById('pm-notes').textContent   = m.notes;
  document.getElementById('pm-dev-plan').innerHTML  = devPlanHTML(m.devPlan);

  // Score breakdown
  document.getElementById('pm-scores').innerHTML = metrics.map(k=>`
    <div style="margin-bottom:0.7rem">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px">
        <span style="font-size:0.8rem">${k}</span>
        <span style="font-size:0.8rem;font-weight:600;color:${scoreColor(m.scores[k])}">${m.scores[k]}</span>
      </div>
      ${progressHTML(m.scores[k], scoreColor(m.scores[k]))}
    </div>`).join('');

  // AI recommendations
  const recs = generateRecommendation(m, metrics);
  document.getElementById('pm-recs').innerHTML = recs.map(r=>`
    <div style="padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.83rem;line-height:1.55;color:var(--text-secondary)">
      → ${r}
    </div>`).join('');

  // Chat history summary
  const chatEl = document.getElementById('pm-chat-history');
  if (chatEl) {
    const chats = (m.chatHistory || []).filter(h => h.role === 'user').slice(-4).reverse();
    chatEl.innerHTML = chats.length
      ? chats.map(h => `
          <div style="padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.8rem;color:var(--text-secondary)">
            <span style="color:var(--text-muted);font-size:0.68rem">${h.date} · Member said: </span>${h.text.slice(0, 120)}${h.text.length > 120 ? '…' : ''}
          </div>`).join('')
      : `<div style="font-size:0.8rem;color:var(--text-muted)">No check-ins recorded yet.</div>`;
  }

  // Coach input tab
  _coachConcern = 'none';
  const coachEl = document.getElementById('pm-coach-content');
  if (coachEl) coachEl.innerHTML = renderCoachInputTab(id);

  // History sparkline data
  document.getElementById('pm-history-vals').innerHTML = m.history.map((v,i)=>`
    <div style="text-align:center;font-size:0.68rem;color:var(--text-muted)">${MONTHS[i]||i+1}<br>
      <span style="color:${scoreColor(v)};font-weight:600">${v}</span></div>`).join('');

  openModal('profile-modal');

  setTimeout(()=>{
    createRadarChart('pm-radar', metrics, [{
      label: m.name,
      data: metrics.map(k=>m.scores[k]),
      borderColor: color,
      backgroundColor: color+'33',
      borderWidth: 2,
      pointBackgroundColor: color,
      pointRadius: 4,
    }]);
    createLineChart('pm-chart', MONTHS, [{
      label:'Performance',
      data: m.history,
      borderColor: color,
      backgroundColor: color+'22',
      fill:true, tension:0.4, borderWidth:2, pointRadius:3,
    }]);
  }, 80);
}

function toggleDevPlan(idx){
  const m = AppState.getMember(AppState.currentMemberId);
  if(m && m.devPlan[idx]){
    m.devPlan[idx].done = !m.devPlan[idx].done;
    document.getElementById('pm-dev-plan').innerHTML = devPlanHTML(m.devPlan);
    showToast(m.devPlan[idx].done ? 'Task completed!' : 'Task unchecked','success');
  }
}

/* ── NOTIFICATION PANEL ──────────────────────────────────── */
function toggleNotifPanel(){
  document.getElementById('notif-panel').classList.toggle('open');
}

/* ── RENDER ALL PAGES (structure) ───────────────────────── */
function renderAllPages(){
  // Pages are in HTML already; just initialize tab listeners
  document.querySelectorAll('[data-tabs]').forEach(container => {
    container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabs = btn.closest('.tabs');
        tabs.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        container.querySelectorAll('.tab-panel').forEach(p=>{
          p.classList.toggle('active', p.dataset.panel===target);
        });
      });
    });
  });
}

/* ── EXPORT REPORT ───────────────────────────────────────── */
function exportReport(){
  showToast('Generating PDF report... (demo mode)','info');
  setTimeout(()=>showToast('Report ready for download','success'), 2000);
}

/* ── ADD MEMBER MODAL ────────────────────────────────────── */
function showAddMember(){
  openModal('add-member-modal');
}
function submitAddMember(e){
  e.preventDefault();
  const name  = document.getElementById('am-name').value;
  const role  = document.getElementById('am-role').value;
  const group = document.getElementById('am-group').value;
  if(!name||!role||!group){ showToast('Please fill all fields','warning'); return; }
  const mode = AppState.mode;
  const metrics = ORG_MODES[mode].metrics;
  const scores = {};
  metrics.forEach(m=>{ scores[m]=rnd(55,90); });
  const iq = rnd(55,90);
  AppState.members.push({
    id: AppState.members.length+1,
    name, role, group,
    initials: name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
    color: COLORS[AppState.members.length % COLORS.length],
    iqScore: iq, iqGrade: iq>=80?'A':iq>=60?'B':'C',
    scores, overall: Math.round(Object.values(scores).reduce((a,b)=>a+b,0)/metrics.length),
    wellnessScore: rnd(55,90), streak: 0, alerts: 0,
    lastActive:'Today', trend:'stable', trendVal:0,
    history: Array.from({length:12},()=>rnd(55,90)),
    joinDate:`${pick(['Jan','Feb','Mar','Apr','May','Jun'])} 2025`,
    notes:'New member. Awaiting initial assessment.',
    devPlan:[
      {text:'Complete onboarding assessment',done:false},
      {text:'Initial IntelliQ evaluation',done:false},
      {text:'Set performance baseline',done:false},
    ],
  });
  AppState.stats = generateOrgStats(mode, AppState.members);
  closeAllModals();
  renderMembers();
  showToast(`${name} added successfully!`,'success');
  e.target.reset();
}

/* ── SCENARIOS PAGE ──────────────────────────────────────── */
function renderScenarios() {
  const color     = ORG_MODES[AppState.mode].color;
  const scenarios = AppState.scenarios;

  const gradeBadgeEl = document.getElementById('scenarios-grade-badge');
  if (gradeBadgeEl) gradeBadgeEl.innerHTML = gradeBadgeHTML(AppState.grade);

  const container = document.getElementById('scenarios-content');
  if (!container) return;

  const domainOptions = {
    school:     ['Moral IQ','Social IQ','Behavior IQ','Academic IQ'],
    sports:     ['Tactical','Mental Resilience','Team Dynamics','Leadership'],
    workplace:  ['Ethics','Leadership','Conflict','Performance'],
    military:   ['Tactical','Ethics','Command','Stress'],
    healthcare: ['Triage','Ethics','Patient Care','Decision'],
    government: ['Policy','Crisis','Integrity','Leadership'],
  }[AppState.mode] || ['General'];

  const scenarioCards = scenarios.length ? scenarios.map(s => {
    const completions = AppState.members.reduce((n, m) =>
      n + ((m.scenarioResults || []).filter(r => r.scenarioId === s.id).length), 0);
    return `
      <div class="scenario-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
          <div>
            <div class="scenario-card-title">${s.title}</div>
            <div style="display:flex;gap:0.4rem;margin-top:0.3rem;flex-wrap:wrap">
              <span class="domain-badge" style="background:${color}22;color:${color};border-color:${color}44">${s.domain}</span>
              <span class="domain-badge">${s.difficulty}</span>
              ${s.avgScore ? `<span class="domain-badge" style="color:var(--success);border-color:rgba(79,247,122,0.3)">Avg ${s.avgScore}</span>` : ''}
            </div>
          </div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-align:right;flex-shrink:0">
            ${completions} run${completions !== 1 ? 's' : ''}<br>
            <span style="font-size:0.65rem">${s.createdAt}</span>
          </div>
        </div>
        <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.8rem;line-height:1.5">${s.brief}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:0.72rem;color:var(--text-muted)">Created by ${s.createdBy}</div>
          <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap">
            <select class="form-input" id="sc-launch-member-${s.id}" style="font-size:0.75rem;padding:4px 8px;height:auto">
              <option value="">— Member —</option>
              ${[...AppState.members].sort((a,b)=>a.name.localeCompare(b.name))
                .map(m=>`<option value="${m.id}">${m.name}</option>`).join('')}
            </select>
            <button class="btn btn-accent btn-sm" onclick="launchScenario('${s.id}')">▶ Run Here</button>
            <button class="btn btn-outline btn-sm" onclick="assignToMemberApp('${s.id}')" title="Send to member's app">📱 Assign</button>
          </div>
        </div>
      </div>`;
  }).join('') : `
    <div style="padding:2.5rem 1rem;text-align:center;background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius)">
      <div style="font-size:2.5rem;margin-bottom:0.8rem">🎯</div>
      <div style="font-size:0.95rem;font-weight:600;color:var(--text-primary);margin-bottom:0.4rem">No scenarios yet</div>
      <div style="font-size:0.82rem;color:var(--text-secondary)">Write a brief above — the AI drafts it, you approve it, then it runs with the member.</div>
    </div>`;

  container.innerHTML = `
    <!-- BRIEF INPUT -->
    <div style="background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem;margin-bottom:1rem">
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.9rem">New Scenario — Coach Brief</div>

      <div style="margin-bottom:0.8rem">
        <label class="form-label">Write your brief in plain language</label>
        <textarea id="sc-brief" class="form-input" rows="3" style="resize:vertical"
          placeholder="e.g. Timmy isn't tracking second ball movements in our 4-3-3. When the ball goes wide he stays static instead of rotating. I want to test if he understands why that movement matters and how he thinks about team shape…"></textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.7rem;margin-bottom:0.9rem">
        <div>
          <label class="form-label">Domain</label>
          <select id="sc-domain" class="form-input">
            ${domainOptions.map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Difficulty</label>
          <div style="display:flex;gap:0.4rem;margin-top:2px">
            ${['Easy','Medium','Hard'].map(d => `
              <button class="domain-badge sc-diff-btn" data-diff="${d}"
                style="cursor:pointer;padding:5px 10px;font-size:0.73rem"
                onclick="selectDifficulty('${d}')">${d}</button>`).join('')}
          </div>
        </div>
        <div>
          <label class="form-label">Assign to Member</label>
          <select id="sc-member" class="form-input">
            <option value="">— Select member —</option>
            ${[...AppState.members].sort((a,b)=>a.name.localeCompare(b.name))
              .map(m=>`<option value="${m.id}">${m.name} · ${m.role}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-accent" id="sc-draft-btn" onclick="draftScenario()">
          ✦ Draft Scenario with AI →
        </button>
      </div>
    </div>

    <!-- DRAFT REVIEW PANEL (hidden until AI drafts) -->
    <div id="sc-draft-panel" style="display:none;background:var(--surface-1);border:1px solid var(--accent);border-radius:var(--radius);padding:1.2rem;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent)">AI Draft — Review &amp; Approve</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Edit anything before it goes to the member. They will never see your brief or this review.</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="draftScenario()">↺ Regenerate</button>
      </div>

      <div style="margin-bottom:0.9rem">
        <label class="form-label">Scenario Title</label>
        <input type="text" id="sc-draft-title" class="form-input" />
      </div>

      <div style="margin-bottom:0.9rem">
        <label class="form-label">Opening Situation <span style="font-weight:400;text-transform:none;color:var(--text-muted)">(what the member will see first)</span></label>
        <textarea id="sc-draft-opening" class="form-input" rows="4" style="resize:vertical"></textarea>
      </div>

      <div style="margin-bottom:0.9rem">
        <label class="form-label">Probe Questions <span style="font-weight:400;text-transform:none;color:var(--text-muted)">(AI will use these as follow-up framework)</span></label>
        <div id="sc-draft-probes-list"></div>
      </div>

      <div style="background:rgba(124,90,245,0.08);border:1px solid rgba(124,90,245,0.25);border-radius:8px;padding:0.9rem;margin-bottom:1rem">
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent);margin-bottom:0.4rem">🔒 Coach Note — Private</div>
        <div id="sc-draft-coachnote" style="font-size:0.82rem;color:var(--text-secondary);line-height:1.6"></div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:0.5rem">
        <button class="btn btn-outline" onclick="document.getElementById('sc-draft-panel').style.display='none'">Cancel</button>
        <button class="btn btn-accent" onclick="approveDraft()">✓ Approve &amp; Launch</button>
      </div>
    </div>

    <!-- SCENARIO LIST -->
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.8rem">
      ${scenarios.length} Scenario${scenarios.length !== 1 ? 's' : ''} Created
    </div>
    <div class="scenario-grid">${scenarioCards}</div>`;

  selectDifficulty('Medium');
}

let _scenarioDifficulty = 'Medium';

function selectDifficulty(diff) {
  _scenarioDifficulty = diff;
  document.querySelectorAll('.sc-diff-btn').forEach(btn => {
    const active = btn.dataset.diff === diff;
    const color  = ORG_MODES[AppState.mode].color;
    btn.style.background  = active ? `${color}22` : '';
    btn.style.color       = active ? color : '';
    btn.style.borderColor = active ? `${color}44` : '';
  });
}

async function draftScenario() {
  const brief    = (document.getElementById('sc-brief')?.value || '').trim();
  const memberId = parseInt(document.getElementById('sc-member')?.value) || null;

  if (!brief)    { showToast('Write a brief first', 'warning'); return; }
  if (!memberId) { showToast('Select a member', 'warning'); return; }

  const btn = document.getElementById('sc-draft-btn');
  if (btn) { btn.textContent = '✦ Drafting…'; btn.disabled = true; }

  const member = AppState.getMember(memberId);

  try {
    const res = await fetch('/api/draft-scenario', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brief,
        orgMode:    AppState.mode,
        orgName:    AppState.orgName,
        memberName: member?.name?.split(' ')[0] || 'the member',
        difficulty: _scenarioDifficulty,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { draft } = await res.json();

    // Populate draft review panel
    document.getElementById('sc-draft-title').value   = draft.title   || '';
    document.getElementById('sc-draft-opening').value = draft.opening || '';
    document.getElementById('sc-draft-coachnote').textContent = draft.coachNote || '';

    const probesList = document.getElementById('sc-draft-probes-list');
    probesList.innerHTML = (draft.probes || []).map((p, i) => `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem;align-items:flex-start">
        <span style="font-size:0.72rem;color:var(--text-muted);padding-top:8px;flex-shrink:0">${i+1}.</span>
        <input type="text" class="form-input sc-probe-input" value="${p.replace(/"/g,'&quot;')}" style="flex:1;font-size:0.82rem" />
      </div>`).join('');

    document.getElementById('sc-draft-panel').style.display = 'block';
    document.getElementById('sc-draft-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    console.warn('Draft API unavailable:', err.message);
    // Fallback: populate with a basic structure so the flow still works
    const domain = document.getElementById('sc-domain')?.value || 'General';
    document.getElementById('sc-draft-title').value   = `${domain} Scenario`;
    document.getElementById('sc-draft-opening').value = `Based on your brief: ${brief}\n\n[AI unavailable — edit this opening manually before launching]`;
    document.getElementById('sc-draft-coachnote').textContent = 'AI service unavailable. You can still edit and launch this scenario manually.';
    document.getElementById('sc-draft-probes-list').innerHTML = `
      <div style="display:flex;gap:0.5rem;margin-bottom:0.4rem">
        <span style="font-size:0.72rem;color:var(--text-muted);padding-top:8px">1.</span>
        <input type="text" class="form-input sc-probe-input" value="Why did you make that decision?" style="flex:1;font-size:0.82rem" />
      </div>`;
    document.getElementById('sc-draft-panel').style.display = 'block';
  } finally {
    if (btn) { btn.textContent = '✦ Draft Scenario with AI →'; btn.disabled = false; }
  }
}

function approveDraft() {
  const title    = (document.getElementById('sc-draft-title')?.value || '').trim();
  const opening  = (document.getElementById('sc-draft-opening')?.value || '').trim();
  const brief    = (document.getElementById('sc-brief')?.value || '').trim();
  const domain   = document.getElementById('sc-domain')?.value || 'General';
  const memberId = parseInt(document.getElementById('sc-member')?.value) || null;

  const probeInputs = document.querySelectorAll('.sc-probe-input');
  const probes = [...probeInputs].map(i => i.value.trim()).filter(Boolean);

  if (!title)    { showToast('Scenario needs a title', 'warning'); return; }
  if (!opening)  { showToast('Opening situation is empty', 'warning'); return; }
  if (!memberId) { showToast('Select a member', 'warning'); return; }

  const scenario = {
    id:          `sc_${Date.now()}`,
    title,
    brief,
    domain,
    context:     brief,
    opening,
    probes,
    difficulty:  _scenarioDifficulty,
    createdBy:   AppState.adminName,
    createdAt:   new Date().toLocaleDateString('en-GB'),
    completions: 0,
    avgScore:    null,
  };

  AppState.scenarios.push(scenario);
  document.getElementById('sc-draft-panel').style.display = 'none';
  showToast(`Scenario approved — launching for ${AppState.getMember(memberId)?.name}`, 'success');
  ScenarioEngine.start(scenario, memberId);
  renderScenarios();
}

function launchScenario(scenarioId) {
  const scenario = AppState.scenarios.find(s => s.id === scenarioId);
  if (!scenario) return;

  const selEl    = document.getElementById(`sc-launch-member-${scenarioId}`);
  const memberId = selEl ? parseInt(selEl.value) || null : null;

  if (!memberId) { showToast('Select a member to launch with', 'warning'); return; }
  ScenarioEngine.start(scenario, memberId);
}

async function assignToMemberApp(scenarioId) {
  const scenario = AppState.scenarios.find(s => s.id === scenarioId);
  if (!scenario) return;

  const selEl    = document.getElementById(`sc-launch-member-${scenarioId}`);
  const memberId = selEl ? parseInt(selEl.value) || null : null;
  if (!memberId) { showToast('Select a member first', 'warning'); return; }

  const member  = AppState.getMember(memberId);
  const orgCode = AppState.orgCode || AppState.orgName.toLowerCase().replace(/\s+/g,'-');

  try {
    const res = await fetch('/api/platform/assign-scenario', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgCode, memberName: member.name, scenario }),
    });
    if (!res.ok) throw new Error();
    showToast(`Assigned to ${member.name.split(' ')[0]}'s app ✓`, 'success');
  } catch(e) {
    showToast('Could not assign — server may be offline', 'warning');
  }
}

/* ── COACH INPUT TAB ─────────────────────────────────────── */
let _coachConcern = 'none';

function renderCoachInputTab(memberId) {
  const m = AppState.getMember(memberId);
  if (!m) return '';

  const mode    = AppState.mode;
  const metrics = ORG_MODES[mode].metrics;

  // Previous coach inputs
  const prevInputs = (m.coachInputs || []).slice().reverse();
  const prevHTML   = prevInputs.length
    ? prevInputs.map(ci => `
        <div class="coach-log-item">
          <div class="coach-log-meta">
            <span class="coach-log-date">${ci.date}</span>
            <span class="coach-log-author">${ci.author}</span>
          </div>
          ${ci.notes ? `<div class="coach-log-notes">${ci.notes}</div>` : ''}
          ${ci.concern !== 'none' ? `<span class="coach-log-concern concern-${ci.concern}">${ci.concern === 'monitor' ? '⚠ Monitor' : '🔴 Urgent'}</span>` : ''}
          ${Object.keys(ci.scores || {}).length ? `
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.5rem">
              ${Object.entries(ci.scores).map(([k,v]) => `
                <span class="score-pill" style="color:${scoreColor(v)};border-color:${scoreColor(v)}40">${k.split(' ')[0]}: ${v}</span>`).join('')}
            </div>` : ''}
        </div>`).join('')
    : `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0">No coach inputs recorded yet.</div>`;

  // External data table
  const extData = (m.externalData || []);
  const extHTML = extData.length
    ? `<table class="ext-data-table">
        <thead><tr><th>Test / Assessment</th><th>Score</th><th>Source</th><th>Date</th></tr></thead>
        <tbody>
          ${extData.slice().reverse().map(d => `
            <tr>
              <td>${d.name}</td>
              <td><span style="color:${scoreColor(d.score)};font-weight:600">${d.score}</span></td>
              <td style="color:var(--text-secondary)">${d.source || '—'}</td>
              <td style="color:var(--text-muted)">${d.date}</td>
            </tr>`).join('')}
        </tbody>
      </table>`
    : `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0">No external data added yet.</div>`;

  // Scenario results
  const scenRes = (m.scenarioResults || []);
  const scenHTML = scenRes.length
    ? scenRes.slice().reverse().map(r => {
        const { label, color } = ScenarioEngine.getScoreLabel(r.score);
        return `<div class="scenario-result-row">
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.83rem">${r.scenarioTitle}</div>
            <div style="font-size:0.72rem;color:var(--text-muted)">${r.domain} · ${r.date}</div>
          </div>
          <span style="color:${color};font-weight:700;font-size:0.9rem">${r.score}</span>
          <span class="domain-badge" style="color:${color};border-color:${color}44;background:${color}11">${label}</span>
        </div>`;
      }).join('')
    : `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0">No scenarios completed yet. Assign one from the Scenarios page.</div>`;

  return `
    <!-- ─ NEW INPUT ─ -->
    <div style="margin-bottom:1.4rem">
      <div class="section-divider">Add Coach / Counsellor Input</div>
      <div class="coach-form" style="margin-top:0.8rem">

        <div>
          <label>METRIC SCORE OVERRIDES <span style="font-weight:400;text-transform:none;letter-spacing:0">(leave blank to keep current)</span></label>
          <div class="metric-score-grid" id="coach-metric-grid">
            ${metrics.map(metric => `
              <div class="metric-score-item">
                <label>${metric}</label>
                <input type="number" min="0" max="100" placeholder="${m.scores[metric]}"
                  id="ci-score-${metric.replace(/\s+/g,'_')}"
                  style="width:100%;padding:0.45rem 0.7rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.82rem"/>
              </div>`).join('')}
          </div>
        </div>

        <div>
          <label>OBSERVATIONS & NOTES</label>
          <textarea id="ci-notes" placeholder="Record observations, patterns, concerns, or feedback for this individual…"></textarea>
        </div>

        <div>
          <label>CONCERN LEVEL</label>
          <div class="concern-selector">
            <button class="concern-btn active-none" id="concern-none"    onclick="setConcernLevel('none')"   >✓ No Concern</button>
            <button class="concern-btn"             id="concern-monitor" onclick="setConcernLevel('monitor')">⚠ Monitor</button>
            <button class="concern-btn"             id="concern-urgent"  onclick="setConcernLevel('urgent')" >🔴 Urgent</button>
          </div>
        </div>

        <button class="btn btn-accent btn-sm" onclick="submitCoachInput(${memberId})" style="align-self:flex-start">
          Save Coach Input
        </button>
      </div>
    </div>

    <!-- ─ PREVIOUS INPUTS ─ -->
    <div style="margin-bottom:1.4rem">
      <div class="section-divider">Previous Coach Inputs</div>
      <div class="coach-input-log" style="margin-top:0.6rem">${prevHTML}</div>
    </div>

    <!-- ─ EXTERNAL DATA ─ -->
    <div style="margin-bottom:1.4rem">
      <div class="section-divider">External Test & Assessment Data</div>
      <div style="margin-top:0.6rem;margin-bottom:0.8rem">${extHTML}</div>
      <details style="margin-top:0.5rem">
        <summary style="font-size:0.8rem;color:var(--accent);cursor:pointer;user-select:none">+ Add External Test / Assessment</summary>
        <div class="coach-form" style="margin-top:0.8rem;padding:0.9rem;background:var(--bg-surface);border-radius:var(--radius-sm);border:1px solid var(--border)">
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:0.6rem">
            <div>
              <label>TEST / ASSESSMENT NAME</label>
              <input type="text" id="ext-name" placeholder="e.g. Fitness Test, Match Rating…"/>
            </div>
            <div>
              <label>SCORE (0–100)</label>
              <input type="number" id="ext-score" min="0" max="100" placeholder="0–100"/>
            </div>
            <div>
              <label>DATE</label>
              <input type="date" id="ext-date"/>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem">
            <div>
              <label>SOURCE / EVALUATOR</label>
              <input type="text" id="ext-source" placeholder="e.g. Fitness Coach, Match Analyst…"/>
            </div>
            <div>
              <label>NOTES</label>
              <input type="text" id="ext-notes" placeholder="Optional notes…"/>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="submitExternalData(${memberId})" style="align-self:flex-start">Add Data</button>
        </div>
      </details>
    </div>

    <!-- ─ SCENARIO RESULTS ─ -->
    <div>
      <div class="section-divider">Scenario Results</div>
      <div style="margin-top:0.6rem">${scenHTML}</div>
    </div>`;
}

function setConcernLevel(level) {
  _coachConcern = level;
  ['none','monitor','urgent'].forEach(l => {
    const btn = document.getElementById(`concern-${l}`);
    if (!btn) return;
    btn.className = 'concern-btn';
    if (l === level) btn.classList.add(`active-${l}`);
  });
}

function submitCoachInput(memberId) {
  const m = AppState.getMember(memberId);
  if (!m) return;

  const mode    = AppState.mode;
  const metrics = ORG_MODES[mode].metrics;
  const notes   = (document.getElementById('ci-notes') || {}).value || '';

  // Collect score overrides
  const newScores = {};
  metrics.forEach(metric => {
    const key = metric.replace(/\s+/g, '_');
    const el  = document.getElementById(`ci-score-${key}`);
    if (el && el.value !== '') {
      const val = Math.min(100, Math.max(0, parseInt(el.value)));
      if (!isNaN(val)) {
        newScores[metric] = val;
        m.scores[metric]  = val;  // apply override
      }
    }
  });

  // Recalculate overall if any scores changed
  if (Object.keys(newScores).length) {
    m.overall = Math.round(Object.values(m.scores).reduce((a, b) => a + b, 0) / metrics.length);
  }

  if (!notes && Object.keys(newScores).length === 0 && _coachConcern === 'none') {
    showToast('Please add notes or score overrides before saving.', 'warning');
    return;
  }

  if (!m.coachInputs) m.coachInputs = [];
  m.coachInputs.push({
    date:    new Date().toLocaleDateString('en-GB'),
    author:  AppState.adminName,
    notes,
    concern: _coachConcern,
    scores:  newScores,
  });

  // If urgent concern, raise an alert
  if (_coachConcern === 'urgent') {
    m.alerts = (m.alerts || 0) + 1;
    AppState.alerts.unshift({
      type:   'danger',
      title:  'Coach Urgent Concern',
      detail: `${m.name}: "${notes.slice(0, 80)}${notes.length > 80 ? '…' : ''}"`,
      time:   'Just now',
      unread: true,
      member: m,
    });
    updateAlertBadge();
  } else if (_coachConcern === 'monitor') {
    AppState.alerts.unshift({
      type:   'warning',
      title:  'Coach Monitor Flag',
      detail: `${m.name} flagged for monitoring by ${AppState.adminName}.`,
      time:   'Just now',
      unread: true,
      member: m,
    });
    updateAlertBadge();
  }

  AppState.stats = generateOrgStats(AppState.mode, AppState.members);
  _coachConcern  = 'none';
  showToast('Coach input saved successfully', 'success');

  // Re-render the tab
  const el = document.getElementById('pm-coach-content');
  if (el) el.innerHTML = renderCoachInputTab(memberId);
}

function submitExternalData(memberId) {
  const m = AppState.getMember(memberId);
  if (!m) return;

  const name   = (document.getElementById('ext-name')  || {}).value || '';
  const score  = parseInt((document.getElementById('ext-score') || {}).value);
  const date   = (document.getElementById('ext-date')  || {}).value || new Date().toLocaleDateString('en-GB');
  const source = (document.getElementById('ext-source')|| {}).value || '';
  const notes  = (document.getElementById('ext-notes') || {}).value || '';

  if (!name || isNaN(score)) {
    showToast('Please enter a test name and score.', 'warning');
    return;
  }

  if (!m.externalData) m.externalData = [];
  m.externalData.push({
    name,
    score: Math.min(100, Math.max(0, score)),
    date:  date || new Date().toLocaleDateString('en-GB'),
    source,
    notes,
  });

  showToast(`External data added for ${m.name}`, 'success');
  const el = document.getElementById('pm-coach-content');
  if (el) el.innerHTML = renderCoachInputTab(memberId);
}

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
  // Nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });
  // Notification panel toggle
  document.getElementById('notif-btn').addEventListener('click', toggleNotifPanel);
  document.getElementById('notif-panel-close').addEventListener('click', ()=>{
    document.getElementById('notif-panel').classList.remove('open');
  });
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if(e.target===ov) closeAllModals(); });
  });
  // Search
  document.getElementById('topbar-search-input').addEventListener('input', e => {
    if(AppState.currentPage==='members') searchMembers(e.target.value);
  });
  // Keyboard: Escape closes modals
  document.addEventListener('keydown', e => {
    if(e.key==='Escape') closeAllModals();
  });
});
