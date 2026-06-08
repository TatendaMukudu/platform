/* ============================================================
   INTELLIQ — MEMBER APP
   Timmy's side. Receive scenarios, complete check-ins,
   track personal scores.
   ============================================================ */

const MemberApp = {

  /* ── State ─────────────────────────────────────────────── */
  session: null,      // { memberName, orgCode, orgName, orgMode }
  pending: [],        // assigned scenarios from server
  results: [],        // completed scenario results (local)
  checkins: [],       // local check-in history
  goals: null,        // { goal, identity } — set on first login
  mood: null,         // selected mood (1-5)

  // Scenario runner state
  _scenario:   null,
  _history:    [],
  _exchanges:  0,
  _sending:    false,
  _completed:  false,

  /* ── Boot ──────────────────────────────────────────────── */
  init() {
    // Restore session from localStorage
    const saved = localStorage.getItem('iq_member_session');
    if (saved) {
      try {
        this.session  = JSON.parse(saved);
        this.results  = JSON.parse(localStorage.getItem('iq_member_results')  || '[]');
        this.checkins = JSON.parse(localStorage.getItem('iq_member_checkins') || '[]');
        this.goals    = JSON.parse(localStorage.getItem('iq_member_goals')    || 'null');
        this._afterJoin();
        return;
      } catch(e) { localStorage.clear(); }
    }
    // Show join screen
    document.getElementById('join-org-code').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('join-name').focus(); });
    document.getElementById('join-name').addEventListener('keydown', e => { if (e.key === 'Enter') this.join(); });
  },

  // After join/restore — check if goals set, then show main
  _afterJoin() {
    if (!this.goals) {
      this._showGoalIntake();
    } else {
      this._showMain();
      this.loadPending();
    }
  },

  /* ── GOAL INTAKE ───────────────────────────────────────────── */
  _showGoalIntake() {
    document.getElementById('screen-join').classList.remove('active');
    document.getElementById('screen-goals').classList.add('active');
  },

  async submitGoals() {
    const goal     = (document.getElementById('goals-goal')?.value     || '').trim();
    const identity = (document.getElementById('goals-identity')?.value || '').trim();
    const errEl    = document.getElementById('goals-error');
    errEl.style.display = 'none';

    if (!goal) {
      errEl.textContent  = 'Tell us your goal — even a rough one.';
      errEl.style.display = 'block';
      return;
    }

    const btn = document.getElementById('goals-submit-btn');
    btn.textContent = 'Saving…'; btn.disabled = true;

    this.goals = { goal, identity, setAt: new Date().toISOString() };
    localStorage.setItem('iq_member_goals', JSON.stringify(this.goals));

    // Save to server (non-blocking)
    const s = this.session;
    if (s) {
      fetch('/api/member/goals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgCode: s.orgCode, memberName: s.memberName, goal, identity }),
      }).catch(() => {});
    }

    document.getElementById('screen-goals').classList.remove('active');
    this._showMain();
    this.loadPending();
    this.showToast('Goal saved ✓', 'success');
  },

  skipGoals() {
    // Allow skip — they can set goals later
    this.goals = { goal: '', identity: '', setAt: new Date().toISOString() };
    localStorage.setItem('iq_member_goals', JSON.stringify(this.goals));
    document.getElementById('screen-goals').classList.remove('active');
    this._showMain();
    this.loadPending();
  },

  /* ── Join ──────────────────────────────────────────────── */
  async join() {
    const orgCode    = (document.getElementById('join-org-code').value || '').trim();
    const memberName = (document.getElementById('join-name').value     || '').trim();
    const errorEl    = document.getElementById('join-error');

    if (!orgCode)    { this._showJoinError('Enter your organisation code'); return; }
    if (!memberName) { this._showJoinError('Enter your name'); return; }

    errorEl.style.display = 'none';

    try {
      const res  = await fetch('/api/member/join', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orgCode, memberName }),
      });
      const data = await res.json();
      if (!data.ok) { this._showJoinError(data.error || 'Could not join'); return; }

      this.session = { memberName: data.memberName, orgCode: data.orgCode, orgName: data.orgName, orgMode: data.orgMode };
      localStorage.setItem('iq_member_session', JSON.stringify(this.session));
      this._afterJoin();

    } catch(err) {
      // Demo mode — work offline
      this.session = { memberName, orgCode: orgCode.toLowerCase(), orgName: orgCode, orgMode: 'school' };
      localStorage.setItem('iq_member_session', JSON.stringify(this.session));
      this._afterJoin();
      this.showToast('Joined in demo mode', 'warning');
    }
  },

  _showJoinError(msg) {
    const el = document.getElementById('join-error');
    el.textContent    = msg;
    el.style.display  = 'block';
  },

  /* ── Load pending scenarios from server ─────────────────── */
  async loadPending() {
    if (!this.session) return;
    try {
      const res  = await fetch(`/api/member/pending?orgCode=${encodeURIComponent(this.session.orgCode)}&memberName=${encodeURIComponent(this.session.memberName)}`);
      const data = await res.json();
      this.pending = data.scenarios || [];
    } catch(e) {
      // Demo: generate a sample scenario if none
      if (!this.pending.length) {
        this.pending = [{
          id:         'demo_sc_1',
          title:      'Sample Scenario',
          domain:     'General',
          difficulty: 'Medium',
          context:    'A challenging situation requiring good decision-making.',
          opening:    null,
          probes:     null,
          status:     'pending',
          fromAlert:  false,
        }];
      }
    }
    this._updateBadge();
    this._renderHome();
    this._renderScenariosList();
  },

  /* ── Show main app ─────────────────────────────────────── */
  _showMain() {
    document.getElementById('screen-join').classList.remove('active');
    document.getElementById('screen-goals').classList.remove('active');
    document.getElementById('screen-main').classList.add('active');
    this._renderHome();
    this._renderStats();
    this._setupCheckinPrompt();
  },

  // Personalise the check-in prompt label based on their goal
  _setupCheckinPrompt() {
    const done = this._checkedInToday();
    const form = document.getElementById('checkin-form');
    const doneEl = document.getElementById('checkin-done');

    if (done) {
      if (form)   form.style.display   = 'none';
      if (doneEl) doneEl.style.display = 'block';
      // Show today's AI response if we have it
      const today = new Date().toLocaleDateString('en-GB');
      const todayCheckin = [...this.checkins].reverse().find(c => c.date === today && c.aiResponse);
      const replayEl = document.getElementById('checkin-ai-replay');
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

    // Set personalised prompt label
    const labelEl = document.getElementById('checkin-prompt-label');
    if (labelEl && this.goals?.goal) {
      const prompts = [
        'How did things go today? Did you get any closer to your goal?',
        'How are you feeling? What happened today?',
        'Tell IntelliQ how your day went.',
        'What worked today? What didn\'t?',
      ];
      labelEl.textContent = prompts[Math.floor(Math.random() * prompts.length)];
    }
  },

  /* ── Tab switching ─────────────────────────────────────── */
  switchTab(tab) {
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');

    if (tab === 'scenarios') this._renderScenariosList();
    if (tab === 'stats')     this._renderStats();
  },

  /* ── HOME ──────────────────────────────────────────────── */
  _renderHome() {
    const s = this.session;
    if (!s) return;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('home-greeting').textContent = greeting;
    document.getElementById('home-name').textContent     = s.memberName;
    document.getElementById('home-org').textContent      = s.orgName;

    // Stat pills — streak + avg score
    const avgScore = this.results.length
      ? Math.round(this.results.reduce((sum, r) => sum + r.score, 0) / this.results.length)
      : null;
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

    // Pending scenarios on home
    const pendingEl = document.getElementById('home-pending');
    const pending   = this.pending.filter(s => s.status === 'pending');
    pendingEl.innerHTML = pending.length
      ? pending.slice(0, 3).map(sc => this._scenarioCardHTML(sc)).join('')
      : `<div class="empty-card"><div class="empty-icon">🎯</div><div>No pending scenarios.<br>Check back after your next session.</div></div>`;

    // Check-in prompt
    const checkinEl   = document.getElementById('home-checkin-prompt');
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

    // Most recent result
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

  /* ── SCENARIOS LIST ────────────────────────────────────── */
  _renderScenariosList() {
    const el      = document.getElementById('scenarios-list');
    const pending  = this.pending.filter(s => s.status === 'pending');
    const done     = this.pending.filter(s => s.status === 'completed');

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
      <div class="scenario-pending-card ${sc.fromAlert ? 'from-alert' : ''} ${done ? 'opacity-60' : ''}"
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

  /* ── START SCENARIO ────────────────────────────────────── */
  startScenario(scenarioId) {
    const sc = this.pending.find(s => s.id === scenarioId);
    if (!sc || sc.status === 'completed') return;

    this._scenario  = sc;
    this._history   = [];
    this._exchanges = 0;
    this._sending   = false;
    this._completed = false;

    // Show scenario screen
    document.getElementById('screen-main').classList.remove('active');
    document.getElementById('screen-scenario').classList.add('active');

    document.getElementById('sc-header-title').textContent = sc.title;
    document.getElementById('sc-header-meta').textContent  = `${sc.domain} · ${sc.difficulty}`;
    document.getElementById('sc-messages').innerHTML        = '';
    document.getElementById('sc-exchange-badge').textContent = 'Starting…';
    document.getElementById('sc-input').value               = '';
    document.getElementById('sc-input-bar').style.display   = 'flex';

    // Show attached media if any
    if (sc.attachment) this._showAttachment(sc.attachment);

    // Kick off scenario
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
    if (html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      msgs.appendChild(div.firstElementChild);
    }
  },

  async _openScenario() {
    this._showTyping();
    const result = await this._callAPI([{ role: 'user', content: 'Begin the scenario.' }]);
    this._hideTyping();
    if (result?.text) {
      this._history.push({ role: 'user', content: 'Begin the scenario.' });
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
    const result = await this._callAPI(this.history);
    this._hideTyping();

    this._sending = false;
    document.getElementById('sc-send-btn').disabled = false;

    if (!result) return;
    if (result.mandated) this._triggerMandatedBanner(result.text);
    if (result.score) {
      this._completed = true;
      if (result.text) {
        this._history.push({ role: 'assistant', content: result.text });
        this._addMsg('ai', result.text);
      }
      document.getElementById('sc-input-bar').style.display = 'none';
      setTimeout(() => this._showResults(result.score), 1200);
    } else if (result.text) {
      this._history.push({ role: 'assistant', content: result.text });
      this._addMsg('ai', result.text);
    }
  },

  async _callAPI(messages) {
    const s = this.session;
    try {
      const body = {
        messages,
        orgMode:    s.orgMode,
        orgName:    s.orgName,
        memberName: s.memberName,
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
      };
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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

    // Save result locally and to server
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
    localStorage.setItem('iq_member_results', JSON.stringify(this.results));

    // Mark pending as completed
    const pending = this.pending.find(s => s.id === this._scenario.id);
    if (pending) pending.status = 'completed';

    // Submit to server (non-blocking)
    const s = this.session;
    fetch('/api/member/submit-result', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgCode: s.orgCode, memberName: s.memberName, scenarioId: this._scenario.id, result }),
    }).catch(() => {});

    // Build results UI
    const msgs = document.getElementById('sc-messages');
    const dims = ['ethical_reasoning','stakeholder_awareness','pressure_response','self_awareness'];
    const strengthsHTML = (score.strengths || []).map(s => `<li>${this._escape(s)}</li>`).join('');
    const devHTML       = (score.development || []).map(s => `<li>${this._escape(s)}</li>`).join('');

    const div = document.createElement('div');
    div.className = 'results-screen';
    div.innerHTML = `
      <div class="results-header-title">Scenario Complete</div>
      <div class="results-header-sub">Here's how you did, ${s.memberName}</div>

      <div class="score-ring-large">
        ${this._svgRing(score.overall, color, 120)}
      </div>
      <div style="font-size:1rem;font-weight:700;margin-bottom:0.3rem;color:${color}">${label}</div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1.5rem">Overall IntelliQ Score</div>

      ${score.summary ? `
      <div class="results-summary">
        <div class="card-label" style="margin-bottom:0.4rem">Assessment</div>
        <p>${this._escape(score.summary)}</p>
      </div>` : ''}

      <div class="dim-grid">
        ${dims.map(d => `
          <div class="dim-cell">
            <div class="dim-cell-name">${d.replace(/_/g,' ')}</div>
            <div class="dim-cell-score" style="color:${this._scoreColor(score[d] || 0)}">${score[d] || '—'}</div>
          </div>`).join('')}
      </div>

      ${strengthsHTML ? `
      <div class="card" style="margin-bottom:0.5rem">
        <div class="card-label" style="margin-bottom:0.5rem">Strengths</div>
        <ul class="strength-list">${strengthsHTML}</ul>
      </div>` : ''}

      ${devHTML ? `
      <div class="card" style="margin-bottom:1rem">
        <div class="card-label" style="margin-bottom:0.5rem">Areas to Develop</div>
        <ul class="strength-list dev-list">${devHTML}</ul>
      </div>` : ''}

      <button class="btn-primary" onclick="MemberApp.exitScenario()">Back to Home</button>`;

    msgs.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth' });

    this._updateBadge();
    this._renderHome();
  },

  exitScenario() {
    document.getElementById('screen-scenario').classList.remove('active');
    document.getElementById('screen-main').classList.add('active');
    this._renderHome();
  },

  /* ── CHECK-IN ──────────────────────────────────────────── */
  selectMood(val) {
    this.mood = val;
    document.querySelectorAll('.mood-btn').forEach(btn => {
      btn.classList.toggle('selected', parseInt(btn.dataset.mood) === val);
    });
    // Enable submit (requires mood; text is also required but prompted on submit)
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
    const s      = this.session;

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
    localStorage.setItem('iq_member_checkins', JSON.stringify(this.checkins));

    // Disable form
    if (noteEl) noteEl.disabled = true;
    document.querySelectorAll('.mood-btn').forEach(b => b.disabled = true);

    // Submit to new freeform endpoint (gets AI response)
    try {
      const res = await fetch('/api/checkin/freeform', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgCode:    s.orgCode,
          memberName: s.memberName,
          text:       note,
          mood:       this.mood,
          role:       'member',
          orgMode:    s.orgMode,
          orgName:    s.orgName,
          goals:      this.goals,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.aiResponse) {
          entry.aiResponse = data.aiResponse;
          // Update local storage with AI response
          this.checkins[this.checkins.length - 1].aiResponse = data.aiResponse;
          localStorage.setItem('iq_member_checkins', JSON.stringify(this.checkins));
          // Show AI response in UI
          const aiEl = document.getElementById('checkin-ai-response');
          const textEl = document.getElementById('checkin-ai-text');
          if (aiEl && textEl) {
            textEl.textContent = data.aiResponse;
            aiEl.style.display = 'block';
          }
        }
      }
    } catch(err) {
      // Non-critical — checkin still saved locally
    }

    // Show done state
    document.getElementById('checkin-done').style.display = 'block';
    document.getElementById('checkin-form').style.display = 'none';

    this.showToast('Check-in saved ✓', 'success');
    this._renderHome();
  },

  /* ── STATS ─────────────────────────────────────────────── */
  _renderStats() {
    const el = document.getElementById('stats-content');
    if (!this.results.length) {
      el.innerHTML = `<div class="empty-card"><div class="empty-icon">📊</div><div>Complete a scenario to see your stats.</div></div>`;
      return;
    }

    const avgScore = Math.round(this.results.reduce((s, r) => s + r.score, 0) / this.results.length);
    const { label, color } = this._scoreLabel(avgScore);

    // Dimension averages
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
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" style="width:${v}%;background:${c}"></div>
            </div>
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

  /* ── Helpers ───────────────────────────────────────────── */
  _updateBadge() {
    const count  = this.pending.filter(s => s.status === 'pending').length;
    const badge  = document.getElementById('scenarios-badge');
    if (badge) {
      badge.textContent   = count;
      badge.style.display = count ? 'inline' : 'none';
    }
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
    return                { label: 'Needs Work', color: '#f74f4f' };
  },

  _svgRing(score, color, size = 100) {
    const r   = size * 0.38;
    const cx  = size / 2;
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

  _hideTyping() {
    document.getElementById('typing-indicator')?.remove();
  },

  _triggerMandatedBanner(text) {
    const msgs = document.getElementById('sc-messages');
    const div  = document.createElement('div');
    div.className = 'mandated-banner';
    div.innerHTML = `<strong>⚠ Important:</strong> What you've shared has been flagged for a trusted adult who cares about your wellbeing. You're not in trouble — someone will follow up with you.`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  },

  _updateExchangeCounter() {
    const remaining = Math.max(0, 6 - this._exchanges);
    document.getElementById('sc-exchange-badge').textContent =
      `Exchange ${this._exchanges} · ~${remaining} left`;
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
    el.textContent  = msg;
    el.className    = `toast ${type} show`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  },
};

/* ── Boot ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => MemberApp.init());
