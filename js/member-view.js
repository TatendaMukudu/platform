/* ============================================================
   INTELLIQ — MEMBER VIEW  (js/member-view.js)
   Hosted inside the unified app shell (#member-shell).
   Identity comes from Auth — no own session object.
   Called by launchMemberView() in app.js after login.
   ============================================================ */

const MemberApp = {

  /* ── Auth getters (replaces this.session.*) ─────────────── */
  get _userId()  { return Auth.currentUser?.id; }
  get _name()    { return Auth.currentUser?.name || `${Auth.currentUser?.firstName || ''} ${Auth.currentUser?.lastName || ''}`.trim(); }
  get _orgCode() { return Auth.currentUser?.orgCode; }
  get _orgName() { return Auth.currentOrg?.orgName  || Auth.currentUser?.orgCode || ''; }
  get _orgMode() { return Auth.currentOrg?.orgMode  || 'school'; }
  get _role()    { return Auth.currentUser?.role    || 'member'; }

  /* ── Local state ────────────────────────────────────────── */
  pending:  [],
  results:  [],
  checkins: [],
  goals:    null,
  mood:     null,
  _noteType:    'private',
  _noteTag:     '',
  _notesFilter: 'All',
  _myGroups:    [],
  _cachedNotes: [],

  // Scenario runner
  _scenario:  null,
  _history:   [],
  _exchanges: 0,
  _sending:   false,
  _completed: false,

  /* ── Auth headers ───────────────────────────────────────── */
  _authHeaders() {
    return Auth.token ? { Authorization: `Bearer ${Auth.token}` } : {};
  },

  /* ── localStorage keys (userId-scoped) ──────────────────── */
  _lsResults()  { return `iq_results_${this._userId}`; },
  _lsCheckins() { return `iq_checkins_${this._userId}`; },
  _lsGoals()    { return `iq_goals_${this._userId}`; },

  /* ── Load local data (with legacy migration) ─────────────── */
  _loadLocalData() {
    // Try userId-scoped keys first
    let results  = this._parseLS(this._lsResults(),  '[]');
    let checkins = this._parseLS(this._lsCheckins(), '[]');
    let goals    = this._parseLS(this._lsGoals(),    'null');

    // Legacy migration: if no userId-keyed data, check old anonymous keys
    if (!results.length) {
      const leg = this._parseLS('iq_member_results', '[]');
      if (leg.length) { results = leg; localStorage.setItem(this._lsResults(), JSON.stringify(results)); }
    }
    if (!checkins.length) {
      const leg = this._parseLS('iq_member_checkins', '[]');
      if (leg.length) { checkins = leg; localStorage.setItem(this._lsCheckins(), JSON.stringify(checkins)); }
    }
    if (!goals) {
      const leg = this._parseLS('iq_member_goals', 'null');
      if (leg) { goals = leg; localStorage.setItem(this._lsGoals(), JSON.stringify(goals)); }
    }

    this.results  = results;
    this.checkins = checkins;
    this.goals    = goals;
  },

  _parseLS(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || fallback); } catch { return JSON.parse(fallback); }
  },

  /* ── Screen control ─────────────────────────────────────── */
  _showScreen(id) {
    document.querySelectorAll('#member-shell .screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  },

  /* ── Boot ───────────────────────────────────────────────── */
  init() {
    if (!Auth.currentUser) {
      // Should not happen — launchMemberView() only called when authenticated
      console.warn('MemberApp.init() called without Auth.currentUser');
      return;
    }

    this._loadLocalData();

    // Route to correct first screen
    if (Auth.currentUser.passwordSet === false) {
      document.getElementById('sp-name').textContent = this._name;
      this._showScreen('screen-setpassword');
      return;
    }

    this._afterAuth();
  },

  _afterAuth() {
    if (!this.goals) {
      this._showScreen('screen-goals');
    } else {
      this._showMain();
      this.loadPending();
    }
  },

  /* ── SET PASSWORD ───────────────────────────────────────── */
  async submitSetPassword() {
    const pass    = (document.getElementById('sp-password')?.value || '').trim();
    const confirm = (document.getElementById('sp-confirm')?.value  || '').trim();
    const errEl   = document.getElementById('sp-error');
    errEl.style.display = 'none';

    if (!pass)            { errEl.textContent = 'Enter a password.';               errEl.style.display = 'block'; return; }
    if (pass.length < 6)  { errEl.textContent = 'Password must be 6+ characters.'; errEl.style.display = 'block'; return; }
    if (pass !== confirm) { errEl.textContent = "Passwords don't match.";          errEl.style.display = 'block'; return; }

    try {
      // Token-only path: server trusts token when passwordSet === false (no currentPassword needed)
      const res = await fetch('/api/auth/set-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ newPassword: pass }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Failed');

      // Refresh Auth state so passwordSet is updated
      await Auth.getMe().catch(() => {});
      // Update token if returned
      if (data.token) { Auth.token = data.token; Auth.save(); }

      this._afterAuth();
      this.showToast('Password set ✓', 'success');
    } catch(err) {
      errEl.textContent   = err.message || 'Could not set password — try again.';
      errEl.style.display = 'block';
    }
  },

  /* ── GOAL INTAKE ────────────────────────────────────────── */
  async submitGoals() {
    const goal     = (document.getElementById('goals-goal')?.value     || '').trim();
    const identity = (document.getElementById('goals-identity')?.value || '').trim();
    const errEl    = document.getElementById('goals-error');
    errEl.style.display = 'none';

    if (!goal) { errEl.textContent = 'Tell us your goal — even a rough one.'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('goals-submit-btn');
    btn.textContent = 'Saving…'; btn.disabled = true;

    this.goals = { goal, identity, setAt: new Date().toISOString() };
    localStorage.setItem(this._lsGoals(), JSON.stringify(this.goals));

    // Save to server (non-blocking)
    fetch('/api/member/goals', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
      body:    JSON.stringify({
        orgCode:    this._orgCode,
        memberName: this._name,
        memberId:   this._userId,
        goal, identity,
      }),
    }).catch(() => {});

    btn.textContent = 'Save & Continue →'; btn.disabled = false;
    this._showMain();
    this.loadPending();
    this.showToast('Goal saved ✓', 'success');
  },

  skipGoals() {
    this.goals = { goal: '', identity: '', setAt: new Date().toISOString() };
    localStorage.setItem(this._lsGoals(), JSON.stringify(this.goals));
    this._showMain();
    this.loadPending();
  },

  /* ── PENDING SCENARIOS ──────────────────────────────────── */
  async loadPending() {
    const pendingEl = document.getElementById('home-pending');
    if (pendingEl) pendingEl.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);padding:0.5rem 0">Loading…</div>`;
    try {
      // Use userId for lookup — server resolves memberName from orgUsers
      const res  = await fetch(
        `/api/member/pending?orgCode=${encodeURIComponent(this._orgCode)}&userId=${encodeURIComponent(this._userId)}`,
        { headers: this._authHeaders() }
      );
      const data = await res.json();
      this.pending = data.scenarios || [];
    } catch(e) {
      if (!this.pending.length) {
        this.pending = [{
          id: 'demo_sc_1', title: 'Sample Scenario', domain: 'General',
          difficulty: 'Medium', context: 'A challenging situation requiring good decision-making.',
          opening: null, probes: null, status: 'pending', fromAlert: false,
        }];
      }
    }
    this._updateBadge();
    this._renderHome();
    this._renderScenariosList();
  },

  /* ── MAIN SCREEN ────────────────────────────────────────── */
  _showMain() {
    this._showScreen('screen-main');
    this._renderHome();
    this._renderStats();
    this._setupCheckinPrompt();
  },

  _setupCheckinPrompt() {
    const done   = this._checkedInToday();
    const form   = document.getElementById('checkin-form');
    const doneEl = document.getElementById('checkin-done');

    if (done) {
      if (form)   form.style.display   = 'none';
      if (doneEl) doneEl.style.display = 'block';
      const today        = new Date().toLocaleDateString('en-GB');
      const todayCheckin = [...this.checkins].reverse().find(c => c.date === today && c.aiResponse);
      const replayEl     = document.getElementById('checkin-ai-replay');
      if (replayEl && todayCheckin?.aiResponse) {
        replayEl.style.display = 'block';
        replayEl.innerHTML = `
          <div class="card" style="border-color:rgba(124,90,245,0.3);background:rgba(124,90,245,0.06);margin-top:0.8rem">
            <div style="display:flex;align-items:flex-start;gap:0.7rem">
              <div style="width:28px;height:28px;border-radius:50%;background:rgba(124,90,245,0.2);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:var(--accent);flex-shrink:0">IQ</div>
              <div>
                <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--accent);margin-bottom:0.4rem">IntelliQ said</div>
                <div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.6">${this._escape(todayCheckin.aiResponse)}</div>
              </div>
            </div>
          </div>`;
      }
      return;
    }

    if (form)   form.style.display   = 'block';
    if (doneEl) doneEl.style.display = 'none';

    const labelEl = document.getElementById('checkin-prompt-label');
    if (labelEl && this.goals?.goal) {
      const prompts = [
        'How did things go today? Did you get any closer to your goal?',
        'How are you feeling? What happened today?',
        'Tell IntelliQ how your day went.',
        "What worked today? What didn't?",
      ];
      labelEl.textContent = prompts[Math.floor(Math.random() * prompts.length)];
    }
  },

  /* ── HOME ───────────────────────────────────────────────── */
  _renderHome() {
    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('home-greeting').textContent = greeting;
    document.getElementById('home-name').textContent     = this._name;
    document.getElementById('home-org').textContent      = this._orgName;

    const avgScore = this.results.length
      ? Math.round(this.results.reduce((sum, r) => sum + r.score, 0) / this.results.length) : null;
    const streak   = this.checkins.length;

    document.getElementById('home-stat-row').innerHTML = `
      <div class="stat-row">
        <div class="stat-pill">
          <div class="stat-pill-val" style="color:${avgScore ? this._scoreColor(avgScore) : 'var(--text-muted)'}">
            ${avgScore ?? '—'}
          </div>
          <div class="stat-pill-label">IntelliQ Score</div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-val" style="color:var(--warning)">🔥 ${streak}</div>
          <div class="stat-pill-label">Check-In Streak</div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-val">${this.results.length}</div>
          <div class="stat-pill-label">Completed</div>
        </div>
      </div>`;

    this._renderWeeklyPrompt();

    const pendingEl = document.getElementById('home-pending');
    const pending   = this.pending.filter(s => s.status === 'pending');
    pendingEl.innerHTML = pending.length
      ? pending.slice(0, 3).map(sc => this._scenarioCardHTML(sc)).join('')
      : `<div class="empty-card"><div class="empty-icon">🎯</div><div>No pending scenarios.<br>Check back after your next session.</div></div>`;

    const checkinEl    = document.getElementById('home-checkin-prompt');
    const checkedToday = this._checkedInToday();
    checkinEl.innerHTML = checkedToday
      ? `<div class="card" style="border-color:rgba(79,247,122,0.3)">
           <div style="display:flex;align-items:center;gap:0.6rem">
             <span style="font-size:1.3rem">✅</span>
             <div>
               <div style="font-size:0.85rem;font-weight:600">Check-in done for today</div>
               <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Come back tomorrow</div>
             </div>
           </div>
         </div>`
      : `<div class="card" style="cursor:pointer;border-color:rgba(124,90,245,0.35)" onclick="MemberApp.switchTab('checkin')">
           <div style="display:flex;align-items:center;gap:0.6rem">
             <span style="font-size:1.3rem">💬</span>
             <div style="flex:1">
               <div style="font-size:0.85rem;font-weight:600">Daily check-in ready</div>
               <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Takes 30 seconds — tap to start</div>
             </div>
             <span style="color:var(--text-muted)">›</span>
           </div>
         </div>`;

    const recentEl = document.getElementById('home-recent-result');
    if (this.results.length) {
      const r = this.results[this.results.length - 1];
      const { label, color } = this._scoreLabel(r.score);
      recentEl.innerHTML = `
        <div class="card-label" style="margin-bottom:0.5rem">Most Recent Score</div>
        <div class="card" style="border-color:${color}44">
          <div style="display:flex;align-items:center;gap:0.8rem">
            <div class="result-score-ring" style="border-color:${color};color:${color}">${r.score}</div>
            <div style="flex:1">
              <div style="font-size:0.88rem;font-weight:700">${r.scenarioTitle}</div>
              <div style="font-size:0.73rem;color:var(--text-muted);margin-top:2px">${r.domain} · ${r.date}</div>
            </div>
            <span class="diff-badge" style="color:${color};border-color:${color}44">${label}</span>
          </div>
        </div>`;
    } else {
      recentEl.innerHTML = '';
    }
  },

  /* ── WEEKLY ASSESSMENT ──────────────────────────────────── */
  _currentWeek() {
    const d   = new Date();
    const jan = new Date(d.getFullYear(), 0, 1);
    const wk  = Math.ceil(((d - jan) / 86400000 + jan.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(wk).padStart(2,'0')}`;
  },

  _weeklyDoneThisWeek() {
    return !!localStorage.getItem(`iq_weekly_${this._currentWeek()}_${this._userId}`);
  },

  _renderWeeklyPrompt() {
    const el = document.getElementById('home-weekly-prompt');
    if (!el) return;
    if (this._weeklyDoneThisWeek()) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="card" style="cursor:pointer;border-color:rgba(79,247,122,0.35);margin-bottom:0.8rem" onclick="MemberApp.startWeekly()">
        <div style="display:flex;align-items:center;gap:0.6rem">
          <span style="font-size:1.3rem">📋</span>
          <div style="flex:1">
            <div style="font-size:0.85rem;font-weight:600">Weekly reflection ready</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">2 minutes — IntelliQ synthesises everyone's input</div>
          </div>
          <span style="color:var(--success);font-weight:700;font-size:0.8rem">NEW</span>
        </div>
      </div>`;
  },

  startWeekly() {
    this._showScreen('screen-weekly');
    document.getElementById('weekly-ai-response').style.display = 'none';
    document.getElementById('weekly-error').style.display       = 'none';
    document.getElementById('weekly-submit-btn').style.display  = 'block';
    document.getElementById('weekly-submit-btn').disabled       = false;
    document.getElementById('weekly-submit-btn').textContent    = 'Submit Weekly Reflection →';
    document.getElementById('weekly-header-meta').textContent   = this._currentWeek().replace('W', 'Week ');
    this._renderWeeklyFields();
  },

  _weeklyRating: null,

  _renderWeeklyFields() {
    const el   = document.getElementById('weekly-fields');
    if (!el) return;
    const role = this._role;

    const ratingBlock = `
      <div class="form-group" style="margin-bottom:1rem">
        <label class="form-label">Rate the week 1–10 <span style="color:var(--text-muted);font-weight:400">(1 = rough, 10 = best)</span></label>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.4rem" id="weekly-rating-btns">
          ${[1,2,3,4,5,6,7,8,9,10].map(n => `
            <button class="weekly-rating-btn" data-val="${n}"
              onclick="MemberApp._selectWeeklyRating(${n})"
              style="width:38px;height:38px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-secondary);font-size:0.82rem;font-weight:600;cursor:pointer;font-family:inherit"
            >${n}</button>`).join('')}
        </div>
      </div>`;

    const goalBlock = this.goals?.goal ? `
      <div class="form-group" style="margin-bottom:1.2rem">
        <label class="form-label">Your goal: <em style="font-weight:400">"${this._escape(this.goals.goal)}"</em></label>
        <textarea class="form-input" id="weekly-goal-progress" rows="2" style="resize:none"
          placeholder="Did you get closer to it this week? What did you do toward it?"></textarea>
      </div>` : '';

    if (role === 'coach') {
      el.innerHTML = `
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">How did training go this week? What worked?</label>
          <textarea class="form-input" id="weekly-overall" rows="3" style="resize:none"
            placeholder="Sessions, drills, team energy — what clicked, what didn't?"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">Any players you're watching closely?</label>
          <textarea class="form-input" id="weekly-improved" rows="2" style="resize:none"
            placeholder="Names, behaviours, concerns — anything worth noting…"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">What's the team's energy like right now?</label>
          <textarea class="form-input" id="weekly-hard" rows="2" style="resize:none"
            placeholder="Morale, cohesion, any tension or standout positives…"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">What would you do differently next week?</label>
          <textarea class="form-input" id="weekly-different" rows="2" style="resize:none"
            placeholder="Adjustments to plan, approach, or focus areas…"></textarea>
        </div>
        ${ratingBlock}`;
    } else if (role === 'admin' || role === 'superadmin') {
      el.innerHTML = `
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">How is the programme running overall?</label>
          <textarea class="form-input" id="weekly-overall" rows="3" style="resize:none"
            placeholder="Operations, logistics, culture — what's running well?"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">Any operational concerns?</label>
          <textarea class="form-input" id="weekly-improved" rows="2" style="resize:none"
            placeholder="Anything that needs attention at an org level…"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:1.2rem">
          <label class="form-label">What's your focus for next week?</label>
          <textarea class="form-input" id="weekly-hard" rows="2" style="resize:none"
            placeholder="Priorities, decisions to make, people to connect with…"></textarea>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">How did this week go overall? <span style="color:var(--text-muted);font-weight:400">(be honest)</span></label>
          <textarea class="form-input" id="weekly-overall" rows="3" style="resize:none"
            placeholder="Training, school, games, life — whatever felt significant this week…"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">What improved or clicked?</label>
          <textarea class="form-input" id="weekly-improved" rows="2" style="resize:none"
            placeholder="Something you did better, understood more clearly, or felt more confident with…"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">What's still hard or not working?</label>
          <textarea class="form-input" id="weekly-hard" rows="2" style="resize:none"
            placeholder="Be specific — what keeps tripping you up?"></textarea>
        </div>
        ${ratingBlock}
        ${goalBlock}`;
    }
    this._weeklyRating = null;
  },

  _selectWeeklyRating(n) {
    this._weeklyRating = n;
    document.querySelectorAll('.weekly-rating-btn').forEach(btn => {
      const active = parseInt(btn.dataset.val) === n;
      const col    = n >= 7 ? 'var(--success)' : n >= 5 ? 'var(--warning)' : 'var(--danger)';
      btn.style.background  = active ? col    : 'var(--surface-2)';
      btn.style.color       = active ? '#fff' : 'var(--text-secondary)';
      btn.style.borderColor = active ? col    : 'var(--border)';
    });
  },

  async submitWeekly() {
    const overall   = (document.getElementById('weekly-overall')?.value    || '').trim();
    const improved  = (document.getElementById('weekly-improved')?.value   || '').trim();
    const hard      = (document.getElementById('weekly-hard')?.value       || '').trim();
    const different = (document.getElementById('weekly-different')?.value  || '').trim();
    const goalProg  = (document.getElementById('weekly-goal-progress')?.value || '').trim();
    const errEl     = document.getElementById('weekly-error');
    errEl.style.display = 'none';

    if (!overall) { errEl.textContent = 'Tell us how the week went — even a sentence.'; errEl.style.display = 'block'; return; }

    const btn = document.getElementById('weekly-submit-btn');
    btn.textContent = 'Submitting…'; btn.disabled = true;

    const payload = {
      'How the week went':  overall,
      'What improved':      improved  || '—',
      "What's still hard":  hard      || '—',
      'Week rating':        this._weeklyRating ? `${this._weeklyRating}/10` : '—',
    };
    if (different) payload["What I'd do differently"] = different;
    if (goalProg)  payload['Goal progress']           = goalProg;

    try {
      const res = await fetch('/api/weekly/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body:    JSON.stringify({
          orgCode:    this._orgCode,
          memberName: this._name,
          memberId:   this._userId,
          role:       this._role,
          orgMode:    this._orgMode,
          orgName:    this._orgName,
          goals:      this.goals,
          data:       payload,
        }),
      });
      const result = res.ok ? await res.json() : {};

      localStorage.setItem(`iq_weekly_${this._currentWeek()}_${this._userId}`, '1');
      btn.style.display = 'none';
      const aiEl  = document.getElementById('weekly-ai-response');
      const txtEl = document.getElementById('weekly-ai-text');
      aiEl.style.display = 'block';
      txtEl.textContent  = result.aiResponse || "Reflection saved. Keep building on what's working.";
      this._renderWeeklyPrompt();
    } catch(err) {
      errEl.textContent   = 'Could not submit — check your connection.';
      errEl.style.display = 'block';
      btn.textContent     = 'Submit Weekly Reflection →';
      btn.disabled        = false;
    }
  },

  exitWeekly() {
    this._showScreen('screen-main');
    this._renderHome();
  },

  /* ── SCENARIOS ──────────────────────────────────────────── */
  _renderScenariosList() {
    const el      = document.getElementById('scenarios-list');
    const pending = this.pending.filter(s => s.status === 'pending');
    const done    = this.pending.filter(s => s.status === 'completed');
    let html = '';
    if (pending.length) {
      html += `<div class="card-label" style="margin-bottom:0.5rem">Pending (${pending.length})</div>`;
      html += pending.map(sc => this._scenarioCardHTML(sc)).join('');
    }
    if (done.length) {
      html += `<div class="card-label" style="margin:1rem 0 0.5rem">Completed (${done.length})</div>`;
      html += done.map(sc => {
        const r = this.results.find(r => r.scenarioId === sc.id);
        return this._scenarioCardHTML(sc, r);
      }).join('');
    }
    if (!pending.length && !done.length) {
      html = `<div class="empty-card"><div class="empty-icon">🎯</div><div>No scenarios assigned yet.<br>Your coach will send one when ready.</div></div>`;
    }
    el.innerHTML = html;
  },

  _scenarioCardHTML(sc, result = null) {
    const diffColors = { Easy:'var(--success)', Medium:'var(--warning)', Hard:'var(--danger)' };
    const color      = diffColors[sc.difficulty] || 'var(--accent)';
    const done       = sc.status === 'completed';
    return `
      <div class="scenario-pending-card ${sc.fromAlert ? 'from-alert' : ''}"
           onclick="${done ? '' : `MemberApp.startScenario('${sc.id}')`}"
           style="${done ? 'opacity:0.6;cursor:default' : ''}">
        <div class="sc-icon">${done ? '✅' : '🎯'}</div>
        <div class="sc-info">
          <div class="sc-title">${sc.title}</div>
          <div class="sc-meta">
            <span class="diff-badge" style="color:${color};border-color:${color}44;background:${color}11">${sc.difficulty}</span>
            ${sc.domain} ${done && result ? `· Score: <span style="color:${this._scoreColor(result.score)};font-weight:700">${result.score}</span>` : ''}
          </div>
        </div>
        ${done ? '' : '<div class="sc-arrow">›</div>'}
      </div>`;
  },

  /* ── SCENARIO RUNNER ────────────────────────────────────── */
  startScenario(scenarioId) {
    const sc = this.pending.find(s => s.id === scenarioId);
    if (!sc || sc.status === 'completed') return;

    this._scenario  = sc;
    this._history   = [];
    this._exchanges = 0;
    this._sending   = false;
    this._completed = false;

    this._showScreen('screen-scenario');
    document.getElementById('sc-header-title').textContent     = sc.title;
    document.getElementById('sc-header-meta').textContent      = `${sc.domain} · ${sc.difficulty}`;
    document.getElementById('sc-messages').innerHTML           = '';
    document.getElementById('sc-exchange-badge').textContent   = 'Starting…';
    document.getElementById('sc-input').value                  = '';
    document.getElementById('sc-input-bar').style.display      = 'flex';

    if (sc.attachment) this._showAttachment(sc.attachment);
    this._openScenario();
  },

  _showAttachment(att) {
    const msgs = document.getElementById('sc-messages');
    let html = '';
    if (att.kind === 'image' && att.preview) {
      html = `<div class="scenario-media"><img src="${att.preview}" style="width:100%;display:block"/></div>`;
    } else if (att.embedHTML) {
      html = `<div class="scenario-media">${att.embedHTML}</div>`;
    } else if (att.claudeMsg) {
      html = `<div class="scenario-media" style="padding:0.7rem 0.9rem;background:var(--surface-2);border-radius:8px;font-size:0.8rem;color:var(--text-muted)">${att.summary || att.name}</div>`;
    }
    if (html) { const d = document.createElement('div'); d.innerHTML = html; msgs.appendChild(d.firstElementChild); }
  },

  async _openScenario() {
    this._showTyping();
    const result = await this._callAPI([{ role: 'user', content: 'Begin the scenario.' }]);
    this._hideTyping();
    if (result?.text) {
      this._history.push({ role: 'user',      content: 'Begin the scenario.' });
      this._history.push({ role: 'assistant', content: result.text });
      this._addMsg('ai', result.text);
      this._updateExchangeCounter();
    }
  },

  async sendScenarioMessage() {
    if (this._sending || this._completed) return;
    const input = document.getElementById('sc-input');
    const text  = (input.value || '').trim();
    if (!text) return;

    this._sending = true;
    input.value   = '';
    input.style.height = '';
    document.getElementById('sc-send-btn').disabled = true;

    this._addMsg('user', this._escape(text));
    this._history.push({ role: 'user', content: text });
    this._exchanges++;
    this._updateExchangeCounter();

    this._showTyping();
    const result = await this._callAPI(this._history);
    this._hideTyping();

    this._sending = false;
    document.getElementById('sc-send-btn').disabled = false;

    if (!result) return;
    if (result.mandated) this._triggerMandatedBanner(result.text);
    if (result.score) {
      this._completed = true;
      if (result.text) { this._history.push({ role: 'assistant', content: result.text }); this._addMsg('ai', result.text); }
      document.getElementById('sc-input-bar').style.display = 'none';
      setTimeout(() => this._showResults(result.score), 1200);
    } else if (result.text) {
      this._history.push({ role: 'assistant', content: result.text });
      this._addMsg('ai', result.text);
    }
  },

  async _callAPI(messages) {
    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages,
          orgMode:    this._orgMode,
          orgName:    this._orgName,
          memberName: this._name,
          promptType: 'scenario',
          scenarioRunContext: {
            title:      this._scenario.title,
            context:    this._scenario.context || this._scenario.brief || '',
            difficulty: (this._scenario.difficulty || 'medium').toLowerCase(),
            opening:    this._scenario.opening || null,
            probes:     this._scenario.probes  || null,
            image:      (this._scenario.attachment?.kind === 'image' || this._scenario.attachment?.kind === 'pdf')
                          ? { data: this._scenario.attachment.data, mediaType: this._scenario.attachment.mediaType }
                          : null,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch(err) {
      console.warn('Scenario API error:', err.message);
      this._addMsg('ai', "I'm having trouble connecting. Please check your connection and try again.");
      return null;
    }
  },

  _showResults(score) {
    const { label, color } = this._scoreLabel(score.overall);
    const result = {
      scenarioId:    this._scenario.id,
      scenarioTitle: this._scenario.title,
      domain:        this._scenario.domain,
      date:          new Date().toLocaleDateString('en-GB'),
      score:         score.overall,
      dimensions:    score,
      label,
    };
    this.results.push(result);
    localStorage.setItem(this._lsResults(), JSON.stringify(this.results));

    const pending = this.pending.find(s => s.id === this._scenario.id);
    if (pending) pending.status = 'completed';

    // Submit to server (non-blocking) — uses userId
    fetch('/api/member/submit-result', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
      body:    JSON.stringify({
        orgCode:    this._orgCode,
        memberId:   this._userId,
        memberName: this._name,
        scenarioId: this._scenario.id,
        result,
      }),
    }).catch(() => {});

    const msgs = document.getElementById('sc-messages');
    const dims = ['ethical_reasoning','stakeholder_awareness','pressure_response','self_awareness'];
    const strengthsHTML = (score.strengths    || []).map(s => `<li>${this._escape(s)}</li>`).join('');
    const devHTML       = (score.development  || []).map(s => `<li>${this._escape(s)}</li>`).join('');

    const div = document.createElement('div');
    div.className = 'results-screen';
    div.innerHTML = `
      <div class="results-header-title">Scenario Complete</div>
      <div class="results-header-sub">Here's how you did, ${this._escape(this._name)}</div>
      <div class="score-ring-large">${this._svgRing(score.overall, color, 120)}</div>
      <div style="font-size:1rem;font-weight:700;margin-bottom:0.3rem;color:${color}">${label}</div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1.5rem">Overall IntelliQ Score</div>
      ${score.summary ? `<div class="results-summary"><div class="card-label" style="margin-bottom:0.4rem">Assessment</div><p>${this._escape(score.summary)}</p></div>` : ''}
      <div class="dim-grid">
        ${dims.map(d => `
          <div class="dim-cell">
            <div class="dim-cell-name">${d.replace(/_/g,' ')}</div>
            <div class="dim-cell-score" style="color:${this._scoreColor(score[d] || 0)}">${score[d] || '—'}</div>
          </div>`).join('')}
      </div>
      ${strengthsHTML ? `<div class="card" style="margin-bottom:0.5rem"><div class="card-label" style="margin-bottom:0.5rem">Strengths</div><ul class="strength-list">${strengthsHTML}</ul></div>` : ''}
      ${devHTML ? `<div class="card" style="margin-bottom:1rem"><div class="card-label" style="margin-bottom:0.5rem">Areas to Develop</div><ul class="strength-list dev-list">${devHTML}</ul></div>` : ''}
      <button class="btn-primary" onclick="MemberApp.exitScenario()">Back to Home</button>`;

    msgs.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth' });
    this._updateBadge();
    this._renderHome();
  },

  exitScenario() {
    this._showScreen('screen-main');
    this._renderHome();
  },

  /* ── CHECK-IN ───────────────────────────────────────────── */
  selectMood(val) {
    this.mood = val;
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.mood) === val);
    });
    const btn = document.getElementById('checkin-submit-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Check-In'; }
  },

  _checkedInToday() {
    const today = new Date().toLocaleDateString('en-GB');
    return this.checkins.some(c => c.date === today);
  },

  async submitCheckin() {
    if (!this.mood) { this.showToast('Pick a mood first', 'warning'); return; }
    const noteEl = document.getElementById('checkin-note');
    const note   = (noteEl?.value || '').trim();
    if (!note) { this.showToast('Add a line or two — IntelliQ reads it', 'warning'); return; }

    const btn = document.getElementById('checkin-submit-btn');
    btn.textContent = 'Sending…'; btn.disabled = true;

    const entry = {
      mood:      this.mood,
      moodLabel: ['','Rough','Low','Okay','Good','Great'][this.mood],
      text:      note,
      date:      new Date().toLocaleDateString('en-GB'),
      aiResponse: null,
    };
    this.checkins.push(entry);
    localStorage.setItem(this._lsCheckins(), JSON.stringify(this.checkins));

    if (noteEl) noteEl.disabled = true;
    document.querySelectorAll('.mood-btn').forEach(b => b.disabled = true);

    try {
      const res = await fetch('/api/checkin/freeform', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body:    JSON.stringify({
          orgCode:    this._orgCode,
          memberName: this._name,
          memberId:   this._userId,
          text:       note,
          mood:       this.mood,
          role:       'member',
          orgMode:    this._orgMode,
          orgName:    this._orgName,
          goals:      this.goals,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.aiResponse) {
          entry.aiResponse = data.aiResponse;
          this.checkins[this.checkins.length - 1].aiResponse = data.aiResponse;
          localStorage.setItem(this._lsCheckins(), JSON.stringify(this.checkins));
          const aiEl  = document.getElementById('checkin-ai-response');
          const txtEl = document.getElementById('checkin-ai-text');
          if (aiEl && txtEl) { txtEl.textContent = data.aiResponse; aiEl.style.display = 'block'; }
        }
      }
    } catch(err) { /* non-critical */ }

    document.getElementById('checkin-done').style.display = 'block';
    document.getElementById('checkin-form').style.display = 'none';
    this.showToast('Check-in saved ✓', 'success');
    this._renderHome();
  },

  /* ── STATS ──────────────────────────────────────────────── */
  _renderStats() {
    const el = document.getElementById('stats-content');
    if (!this.results.length) {
      el.innerHTML = `<div class="empty-card"><div class="empty-icon">📊</div><div>Complete a scenario to see your stats.</div></div>`;
      return;
    }

    const avgScore = Math.round(this.results.reduce((s, r) => s + r.score, 0) / this.results.length);
    const { label, color } = this._scoreLabel(avgScore);
    const dims    = ['ethical_reasoning','stakeholder_awareness','pressure_response','self_awareness'];
    const dimAvgs = dims.map(d => {
      const vals = this.results.map(r => r.dimensions?.[d]).filter(v => v != null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    });

    el.innerHTML = `
      <div class="card" style="text-align:center;margin-bottom:0.8rem">
        <div style="margin:0 auto 0.8rem;width:100px">${this._svgRing(avgScore, color, 100)}</div>
        <div style="font-size:0.9rem;font-weight:700;color:${color}">${label}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">Avg across ${this.results.length} scenario${this.results.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="card" style="margin-bottom:0.8rem">
        <div class="card-label" style="margin-bottom:0.8rem">Dimension Breakdown</div>
        ${dims.map((d, i) => {
          const v = dimAvgs[i];
          if (v == null) return '';
          const c = this._scoreColor(v);
          return `<div class="dimension-row">
            <div class="dimension-name">${d.replace(/_/g,' ')}</div>
            <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${v}%;background:${c}"></div></div>
            <div class="dimension-val" style="color:${c}">${v}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="card">
        <div class="card-label" style="margin-bottom:0.6rem">History</div>
        ${[...this.results].reverse().map(r => {
          const { label: l, color: c } = this._scoreLabel(r.score);
          return `<div class="result-history-item">
            <div class="result-score-ring" style="border-color:${c};color:${c}">${r.score}</div>
            <div class="result-info">
              <div class="result-title">${r.scenarioTitle}</div>
              <div class="result-meta">${r.domain} · ${r.date}</div>
            </div>
            <span class="diff-badge" style="color:${c};border-color:${c}44">${l}</span>
          </div>`;
        }).join('')}
      </div>`;
  },

  /* ── TAB SWITCHING ──────────────────────────────────────── */
  async switchTab(tab) {
    document.querySelectorAll('#member-shell .tab-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('#member-shell .nav-tab').forEach(b => b.classList.remove('active'));
    const tabEl  = document.getElementById(`tab-${tab}`);
    const navBtn = document.querySelector(`#member-shell .nav-tab[data-tab="${tab}"]`);
    if (tabEl)  tabEl.classList.add('active');
    if (navBtn) navBtn.classList.add('active');

    if (tab === 'scenarios') this._renderScenariosList();
    if (tab === 'stats')     this._renderStats();
    if (tab === 'inbox')     await this._renderInbox();
  },

  /* ── INBOX ──────────────────────────────────────────────── */
  async _loadMyGroups() {
    try {
      const res  = await fetch(
        `/api/groups?orgCode=${encodeURIComponent(this._orgCode)}&memberId=${encodeURIComponent(this._userId)}`,
        { headers: this._authHeaders() }
      );
      const data = res.ok ? await res.json() : { groups: [] };
      this._myGroups = data.groups || [];
    } catch(e) { this._myGroups = []; }
  },

  async _renderInbox() {
    await this._loadMyGroups();
    this._populateGroupSelectors();
    const noticeEl = document.getElementById('inbox-group-notice');
    if (noticeEl) noticeEl.style.display = this._myGroups.length ? 'none' : 'block';
    this.switchInboxTab('notes');
    await this._loadNotes();
    await this._loadMessages();
  },

  switchInboxTab(sub) {
    document.querySelectorAll('.inbox-sub-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
    document.getElementById('inbox-notes').style.display    = sub === 'notes'    ? 'block' : 'none';
    document.getElementById('inbox-messages').style.display = sub === 'messages' ? 'block' : 'none';
  },

  _populateGroupSelectors() {
    const opts = this._myGroups.length
      ? this._myGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')
      : `<option value="">You're not in any groups yet</option>`;
    const noteGrp = document.getElementById('note-group-id');
    const msgGrp  = document.getElementById('msg-to-group');
    if (noteGrp) noteGrp.innerHTML = `<option value="">— Select group —</option>` + opts;
    if (msgGrp)  msgGrp.innerHTML  = `<option value="">— Select group —</option>` + opts;
  },

  selectNoteTag(tag) {
    this._noteTag = tag;
    document.querySelectorAll('#note-tags-row .note-tag-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tag === tag);
    });
  },

  _filterNotes(filter) {
    this._notesFilter = filter;
    document.querySelectorAll('#notes-filter-row .note-tag-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === filter);
    });
    this._renderNotesList();
  },

  selectNoteType(type) {
    this._noteType = type;
    document.querySelectorAll('.note-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const descs = {
      private:   'Only you and IntelliQ see this.',
      shared:    'Your group members and leads can see this.',
      anonymous: 'Your group sees the content — your name is hidden.',
    };
    const descEl = document.getElementById('note-type-desc');
    if (descEl) descEl.textContent = descs[type] || '';
    const grpRow = document.getElementById('note-group-row');
    if (grpRow) grpRow.style.display = type !== 'private' ? 'block' : 'none';
    const aiEl = document.getElementById('note-ai-response');
    if (aiEl) aiEl.style.display = 'none';
  },

  async submitNote() {
    const content = (document.getElementById('note-content')?.value || '').trim();
    const groupId = document.getElementById('note-group-id')?.value || null;
    if (!content) { this.showToast('Write something first', 'warning'); return; }
    if (this._noteType !== 'private' && !groupId) { this.showToast('Select a group', 'warning'); return; }

    const btn = document.querySelector('#inbox-notes .btn-primary');
    if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

    try {
      const res = await fetch('/api/notes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body:    JSON.stringify({
          orgCode:    this._orgCode,
          authorId:   this._userId,
          authorName: this._name,
          content,
          type:       this._noteType,
          tag:        this._noteTag || null,
          groupId:    groupId || null,
          orgMode:    this._orgMode,
          orgName:    this._orgName,
          goals:      this.goals,
        }),
      });
      const data = res.ok ? await res.json() : {};

      const noteEl = document.getElementById('note-content');
      if (noteEl) noteEl.value = '';
      this._noteTag = '';
      this.selectNoteTag('');

      if (data.note?.aiResponse) {
        const aiEl  = document.getElementById('note-ai-response');
        const txtEl = document.getElementById('note-ai-text');
        if (aiEl && txtEl) { txtEl.textContent = data.note.aiResponse; aiEl.style.display = 'block'; }
      }
      this.showToast('Note saved ✓', 'success');
      this._loadNotes();
    } catch(e) {
      this.showToast('Could not save note', 'warning');
    } finally {
      if (btn) { btn.textContent = 'Save Note'; btn.disabled = false; }
    }
  },

  async _loadNotes() {
    const el = document.getElementById('notes-list');
    if (!el) return;
    el.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);padding:1rem 0">Loading…</div>`;
    try {
      const res = await fetch(
        `/api/notes?orgCode=${encodeURIComponent(this._orgCode)}&requesterId=${encodeURIComponent(this._userId)}`,
        { headers: this._authHeaders() }
      );
      if (res.status === 401) { this._cachedNotes = []; this._renderNotesList(); return; }
      const data = res.ok ? await res.json() : { notes: [] };
      this._cachedNotes = data.notes || [];
      this._renderNotesList();
    } catch(e) {
      el.innerHTML = `<div style="font-size:0.8rem;color:var(--danger)">Could not load notes.</div>`;
    }
  },

  _renderNotesList() {
    const el = document.getElementById('notes-list');
    if (!el) return;
    const filter = this._notesFilter || 'All';
    const notes  = filter === 'All'
      ? this._cachedNotes
      : this._cachedNotes.filter(n => n.tag === filter);

    if (!this._cachedNotes.length) {
      el.innerHTML = `<div class="empty-card"><div class="empty-icon">📝</div><div>No notes yet. Write your first one above.</div></div>`;
      return;
    }
    if (!notes.length) {
      el.innerHTML = `<div class="empty-card"><div class="empty-icon">🔍</div><div>No ${filter} notes yet.</div></div>`;
      return;
    }

    const typeIcons  = { private:'🔒', shared:'📤', anonymous:'👤' };
    const typeColors = { private:'var(--text-muted)', shared:'var(--accent)', anonymous:'var(--warning)' };
    el.innerHTML = notes.map(n => {
      const icon     = typeIcons[n.type]  || '📝';
      const color    = typeColors[n.type] || 'var(--text-muted)';
      const time     = new Date(n.createdAt).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
      const tagBadge = n.tag ? `<span class="note-tag-badge">${n.tag}</span>` : '';
      const isMine   = n.authorId === this._userId;
      const borderColor = n.type === 'private' ? 'var(--border)' : n.type === 'shared' ? 'rgba(124,90,245,0.25)' : 'rgba(247,178,79,0.25)';
      return `
        <div class="card" style="margin-bottom:0.6rem;padding:1rem;border-radius:12px;background:var(--surface-1);border-color:${borderColor}">
          <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem">
            <span>${icon}</span>
            <span style="font-size:0.72rem;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:0.5px">${n.type}</span>
            ${tagBadge}
            <span style="font-size:0.7rem;color:var(--text-muted);margin-left:auto">${time}</span>
          </div>
          <div style="font-size:0.83rem;color:var(--text-primary);line-height:1.55;margin-bottom:${n.aiResponse?'0.6rem':'0'}">${this._escape(n.content)}</div>
          ${n.aiResponse && isMine ? `
            <div style="display:flex;gap:0.5rem;align-items:flex-start;padding-top:0.5rem;border-top:1px solid var(--border)">
              <span style="font-size:0.68rem;font-weight:700;color:var(--accent);white-space:nowrap">IQ:</span>
              <span style="font-size:0.78rem;color:var(--text-secondary);line-height:1.5">${this._escape(n.aiResponse)}</span>
            </div>` : ''}
        </div>`;
    }).join('');
  },

  updateMsgRecipient() {
    const toType = document.getElementById('msg-to-type')?.value;
    const grpEl  = document.getElementById('msg-to-group');
    if (grpEl) grpEl.style.display = toType === 'group' ? 'block' : 'none';
  },

  async sendMessage(anonymous) {
    const content = (document.getElementById('msg-content')?.value || '').trim();
    const toType  = document.getElementById('msg-to-type')?.value  || 'group';
    const toId    = toType === 'group' ? (document.getElementById('msg-to-group')?.value || '') : null;
    if (!content) { this.showToast('Write something first', 'warning'); return; }
    if (toType === 'group' && !toId) { this.showToast('Select a group', 'warning'); return; }

    await fetch('/api/messages/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
      body:    JSON.stringify({
        orgCode:  this._orgCode,
        fromId:   this._userId,
        fromName: this._name,
        toType, toId: toId || null, content, anonymous,
      }),
    });
    document.getElementById('msg-content').value = '';
    this.showToast(anonymous ? 'Sent anonymously ✓' : 'Sent ✓', 'success');
    this._loadMessages();
  },

  async _loadMessages() {
    const el = document.getElementById('messages-list');
    if (!el) return;
    el.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);padding:1rem 0">Loading…</div>`;
    try {
      const res = await fetch(
        `/api/messages?orgCode=${encodeURIComponent(this._orgCode)}&requesterId=${encodeURIComponent(this._userId)}`,
        { headers: this._authHeaders() }
      );
      if (res.status === 401) {
        el.innerHTML = `<div class="empty-card"><div class="empty-icon">🔒</div><div>Session expired — please log in again.</div></div>`;
        return;
      }
      const data = res.ok ? await res.json() : { messages: [] };
      const msgs = data.messages || [];

      if (!msgs.length) {
        el.innerHTML = `<div class="empty-card"><div class="empty-icon">💬</div><div>No messages yet. Messages from your coach and groups will appear here.</div></div>`;
        return;
      }

      el.innerHTML = msgs.map(m => {
        const isMine = m.fromId === this._userId;
        const label  = m.anonymous ? '👤 Anonymous' : m.fromName;
        const target = m.toType === 'org' ? 'Whole Org' : (this._myGroups.find(g => g.id === m.toId)?.name || m.toId || '—');
        const time   = new Date(m.createdAt).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
        return `
          <div class="card" style="margin-bottom:0.6rem;${isMine?'border-color:rgba(124,90,245,0.2)':''}">
            <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.4rem;flex-wrap:wrap">
              <span style="font-size:0.82rem;font-weight:600">${label}</span>
              <span style="font-size:0.7rem;color:var(--text-muted)">→ ${target}</span>
              <span style="font-size:0.7rem;color:var(--text-muted);margin-left:auto">${time}</span>
            </div>
            <div style="font-size:0.83rem;color:var(--text-secondary);line-height:1.55">${this._escape(m.content)}</div>
          </div>`;
      }).join('');
    } catch(e) {
      el.innerHTML = `<div style="font-size:0.8rem;color:var(--danger)">Could not load messages.</div>`;
    }
  },

  /* ── Helpers ────────────────────────────────────────────── */
  _updateBadge() {
    const count = this.pending.filter(s => s.status === 'pending').length;
    const badge = document.getElementById('scenarios-badge');
    if (badge) { badge.textContent = count; badge.style.display = count ? 'inline' : 'none'; }
  },

  _scoreColor(v) {
    if (v >= 80) return '#4ff77a';
    if (v >= 65) return '#4f8ef7';
    if (v >= 50) return '#f7b24f';
    return '#f74f4f';
  },

  _scoreLabel(v) {
    if (v >= 85) return { label: 'Exceptional', color: '#4ff77a' };
    if (v >= 70) return { label: 'Strong',      color: '#4f8ef7' };
    if (v >= 55) return { label: 'Developing',  color: '#f7b24f' };
    return              { label: 'Needs Work',  color: '#f74f4f' };
  },

  _svgRing(score, color, size = 100) {
    const r    = size * 0.38;
    const cx   = size / 2;
    const circ = 2 * Math.PI * r;
    const dash = (score / 100) * circ;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${size * 0.08}"/>
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="${size * 0.08}"
        stroke-dasharray="${dash} ${circ}" stroke-linecap="round"
        transform="rotate(-90 ${cx} ${cx})"/>
      <text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="middle"
        fill="${color}" font-size="${size * 0.2}" font-weight="800" font-family="Inter,sans-serif">${score}</text>
    </svg>`;
  },

  _addMsg(role, text) {
    const msgs = document.getElementById('sc-messages');
    const div  = document.createElement('div');
    div.className = `msg msg-${role}`;
    div.innerHTML = text.replace(/\n/g, '<br/>');
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  },

  _showTyping() {
    const msgs = document.getElementById('sc-messages');
    const div  = document.createElement('div');
    div.id        = 'typing-indicator';
    div.className = 'msg-typing';
    div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  },

  _hideTyping() { document.getElementById('typing-indicator')?.remove(); },

  _triggerMandatedBanner() {
    const msgs = document.getElementById('sc-messages');
    const div  = document.createElement('div');
    div.className = 'mandated-banner';
    div.innerHTML = `<strong>⚠ Important:</strong> What you've shared has been flagged for a trusted adult who cares about your wellbeing. You're not in trouble — someone will follow up with you.`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  },

  _updateExchangeCounter() {
    const remaining = Math.max(0, 6 - this._exchanges);
    document.getElementById('sc-exchange-badge').textContent = `Exchange ${this._exchanges} · ~${remaining} left`;
  },

  autoResizeInput(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  },

  _escape(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  showToast(msg, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className   = `toast ${type} show`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  },
};
