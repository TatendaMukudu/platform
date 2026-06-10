/* ============================================================
   PLATFORM — AI-DRIVEN SCENARIO ENGINE
   Conversational scenarios run entirely by Claude.
   Coaches define domain + context; AI generates the situation,
   probes reasoning, escalates complexity, and scores the result.
   ============================================================ */

const ScenarioEngine = {
  memberId:   null,
  scenario:   null,
  history:    [],
  _sending:   false,
  _completed: false,
  _exchanges: 0,

  start(scenario, memberId) {
    this.memberId   = memberId;
    this.scenario   = scenario;
    this.history    = [];
    this._sending   = false;
    this._completed = false;
    this._exchanges = 0;

    const content = document.getElementById('scenario-runner-content');
    const member  = AppState.getMember(memberId);

    content.innerHTML = `
      <div class="sr-header" style="flex-shrink:0">
        <div>
          <div style="font-size:1rem;font-weight:700;color:var(--text-primary)">${scenario.title}</div>
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">
            ${member?.name || 'Member'} &nbsp;·&nbsp;
            <span class="domain-badge">${scenario.domain}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.8rem">
          <span id="sr-exchange-count" style="font-size:0.72rem;color:var(--text-muted)">Starting…</span>
          <button class="btn-icon" onclick="closeModal('scenario-runner-modal')">✕</button>
        </div>
      </div>

      <div class="sr-body" id="sr-chat-messages" style="padding:1rem;display:flex;flex-direction:column;gap:0.6rem"></div>

      <div class="sr-footer" style="flex-shrink:0;padding:0.8rem 1.2rem;border-top:1px solid var(--border)">
        <div style="display:flex;gap:0.5rem;width:100%">
          <input type="text" id="sr-chat-input"
            class="form-input"
            placeholder="Type your response…"
            style="flex:1"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ScenarioEngine.send()}" />
          <button class="btn btn-accent" onclick="ScenarioEngine.send()">Send</button>
        </div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.4rem;text-align:center">
          Respond naturally — the AI will adapt to what you say
        </div>
      </div>`;

    openModal('scenario-runner-modal');
    setTimeout(() => this._openScenario(), 400);
  },

  async _openScenario() {
    const member    = AppState.getMember(this.memberId);
    const firstName = member?.name?.split(' ')[0] || 'the member';

    this._showTyping();
    const result = await this._callAPI([{
      role:    'user',
      content: `Begin the scenario for ${firstName}. Present the opening situation now.`,
    }]);
    this._hideTyping();

    if (result?.text) {
      this.history.push({ role: 'assistant', content: result.text });
      this._addMessage('ai', result.text);
      this._updateCounter();
    }
  },

  async send() {
    const input = document.getElementById('sr-chat-input');
    const text  = (input?.value || '').trim();
    if (!text || this._sending || this._completed) return;

    this._sending = true;
    input.value   = '';
    this._exchanges++;

    this._addMessage('user', this._escape(text));
    this.history.push({ role: 'user', content: text });
    this._updateCounter();

    this._showTyping();
    const result = await this._callAPI(this.history);
    this._hideTyping();
    this._sending = false;

    if (!result) return;

    if (result.mandated) this._triggerMandatedAlert();

    if (result.score) {
      this._completed = true;
      if (result.text) {
        this.history.push({ role: 'assistant', content: result.text });
        this._addMessage('ai', result.text);
      }
      setTimeout(() => this._showResults(result.score), 1400);
    } else if (result.text) {
      this.history.push({ role: 'assistant', content: result.text });
      this._addMessage('ai', result.text);
    }
  },

  async _callAPI(messages) {
    const member = AppState.getMember(this.memberId);
    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          orgMode:    AppState.mode,
          orgName:    AppState.orgName,
          memberName: member?.name?.split(' ')[0] || 'Member',
          promptType: 'scenario',
          scenarioRunContext: {
            title:      this.scenario.title,
            context:    this.scenario.context,
            difficulty: this.scenario.difficulty || 'medium',
            opening:    this.scenario.opening  || null,
            probes:     this.scenario.probes   || null,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Scenario API unavailable:', err.message);
      return {
        text:     "I'm having trouble connecting right now. Please check your connection and try again.",
        score:    null,
        mandated: false,
      };
    }
  },

  _showResults(score) {
    const member            = AppState.getMember(this.memberId);
    const { label, color }  = this.getScoreLabel(score.overall);

    // Save result to member record
    const result = {
      scenarioId: this.scenario.id,
      title:      this.scenario.title,
      domain:     this.scenario.domain,
      date:       new Date().toLocaleDateString('en-GB'),
      score:      score.overall,
      label,
      dimensions: score,
      exchanges:  this._exchanges,
    };
    if (!member.scenarioResults) member.scenarioResults = [];
    member.scenarioResults.push(result);

    // Proactive health check — fires after every completion
    AppState.recordScenarioResult(this.memberId, result);

    // Update scenario completion stats
    const sc = AppState.scenarios.find(s => s.id === this.scenario.id);
    if (sc) {
      const allForThis = member.scenarioResults.filter(r => r.scenarioId === sc.id);
      sc.completions = (sc.completions || 0) + 1;
      sc.avgScore    = Math.round(allForThis.reduce((s, r) => s + r.score, 0) / allForThis.length);
    }

    // Nudge IQ score
    member.iqScore = Math.round(member.iqScore * 0.85 + score.overall * 0.15);
    member.iqGrade = member.iqScore >= 80 ? 'A' : member.iqScore >= 60 ? 'B' : 'C';
    AppState.stats = buildEmptyOrgStats(AppState.members.length);

    const dims = [
      ['Ethical Reasoning',     score.ethical_reasoning],
      ['Stakeholder Awareness', score.stakeholder_awareness],
      ['Pressure Response',     score.pressure_response],
      ['Self Awareness',        score.self_awareness],
    ];

    const resultData = JSON.stringify({ title: this.scenario.title, score: score.overall, label });

    document.getElementById('scenario-runner-content').innerHTML = `
      <div class="sr-header" style="flex-shrink:0">
        <div style="font-size:1rem;font-weight:700;color:var(--text-primary)">Scenario Complete</div>
        <button class="btn-icon" onclick="closeModal('scenario-runner-modal')">✕</button>
      </div>

      <div class="sr-body" style="padding:1.2rem">
        <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:1.4rem">
          ${iqRingHTML(score.overall, color, 100)}
          <div style="font-size:1.5rem;font-weight:800;color:${color};margin-top:0.5rem">${label}</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px">
            ${this.scenario.title} &nbsp;·&nbsp; ${member?.name}
          </div>
        </div>

        <div style="background:var(--surface-2);border-radius:10px;padding:1rem;margin-bottom:1rem;border-left:3px solid ${color}">
          <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.5rem">AI Assessment</div>
          <p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.65;margin:0">${score.summary || ''}</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:1rem">
          ${dims.map(([lbl, val]) => `
            <div style="background:var(--surface-2);border-radius:8px;padding:0.75rem">
              <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:3px">${lbl}</div>
              <div style="font-size:1.4rem;font-weight:800;color:${scoreColor(val)};margin-bottom:4px">${val}</div>
              ${progressHTML(val, scoreColor(val))}
            </div>`).join('')}
        </div>

        ${score.strengths?.length ? `
          <div style="margin-bottom:0.9rem">
            <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.5rem">Strengths Identified</div>
            ${score.strengths.map(s => `<div style="font-size:0.82rem;color:var(--success);padding:0.35rem 0;border-bottom:1px solid var(--border)">✓ ${s}</div>`).join('')}
          </div>` : ''}

        ${score.development?.length ? `
          <div>
            <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.5rem">Areas to Develop</div>
            ${score.development.map(d => `<div style="font-size:0.82rem;color:var(--warning);padding:0.35rem 0;border-bottom:1px solid var(--border)">→ ${d}</div>`).join('')}
          </div>` : ''}
      </div>

      <div class="sr-footer" style="flex-shrink:0;padding:0.8rem 1.2rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <button class="btn btn-outline" onclick="closeModal('scenario-runner-modal')">Close</button>
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-outline" onclick="closeModal('scenario-runner-modal');showProfile(${this.memberId})">View Profile</button>
          <button class="btn btn-accent" id="sr-reflect-btn">🤖 Start Reflection →</button>
        </div>
      </div>`;

    document.getElementById('sr-reflect-btn').addEventListener('click', () => {
      const r = { title: this.scenario.title, score: score.overall, label };
      closeModal('scenario-runner-modal');
      ChatEngine.open(this.memberId, r);
    });

    // Generate coach debrief asynchronously — appears below results
    this._generateCoachDebrief(score, member);
  },

  async _generateCoachDebrief(score, member) {
    try {
      const res = await fetch('/api/coach-debrief', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation:   this.history,
          scores:         score,
          memberName:     member?.name?.split(' ')[0],
          scenarioTitle:  this.scenario.title,
          orgMode:        AppState.mode,
          orgName:        AppState.orgName,
          coachRole:      AppState.adminRole || 'coach',
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { debrief } = await res.json();

      const body = document.querySelector('#scenario-runner-content .sr-body');
      if (!body) return;

      const panel = document.createElement('div');
      panel.style.cssText = 'margin-top:1rem;padding-top:1rem;border-top:2px solid rgba(124,90,245,0.3)';
      panel.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.9rem">
          <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent)">🔒 Coach Debrief — Private</span>
          ${debrief.escalate ? `<span style="font-size:0.7rem;background:rgba(247,79,122,0.15);color:var(--danger);border:1px solid rgba(247,79,122,0.3);border-radius:4px;padding:2px 8px">⚠ Review Recommended</span>` : ''}
        </div>

        <div style="background:rgba(124,90,245,0.06);border:1px solid rgba(124,90,245,0.2);border-radius:8px;padding:0.9rem;margin-bottom:0.8rem">
          <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:0.5rem">${debrief.headline || ''}</div>
          <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.65">${debrief.whatThisReveals || ''}</div>
        </div>

        ${debrief.watchFor?.length ? `
          <div style="margin-bottom:0.8rem">
            <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.5rem">Watch For</div>
            ${debrief.watchFor.map(w => `<div style="font-size:0.8rem;color:var(--warning);padding:0.3rem 0;border-bottom:1px solid var(--border)">👁 ${w}</div>`).join('')}
          </div>` : ''}

        ${debrief.coachingActions?.length ? `
          <div>
            <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.5rem">Recommended Actions</div>
            ${debrief.coachingActions.map((a, i) => `<div style="font-size:0.8rem;color:var(--text-secondary);padding:0.3rem 0;border-bottom:1px solid var(--border)"><span style="color:var(--accent);font-weight:600">${i+1}.</span> ${a}</div>`).join('')}
          </div>` : ''}`;

      body.appendChild(panel);
      body.scrollTop = body.scrollHeight;

      if (debrief.escalate) {
        showToast(`Review recommended for ${member?.name} — see debrief`, 'warning');
      }

    } catch (err) {
      console.warn('Coach debrief unavailable:', err.message);
    }
  },

  getScoreLabel(score) {
    if (score >= 85) return { label: 'Exceptional', color: '#0ecfb0' };
    if (score >= 70) return { label: 'Strong',      color: '#4f8ef7' };
    if (score >= 55) return { label: 'Developing',  color: '#f7b24f' };
    return             { label: 'Needs Work',    color: '#f74f7a' };
  },

  _updateCounter() {
    const el    = document.getElementById('sr-exchange-count');
    if (!el) return;
    const turns = this.history.filter(h => h.role === 'user').length;
    el.textContent = turns === 0
      ? 'Scenario in progress'
      : `Exchange ${turns} · ~${Math.max(0, 6 - turns)} remaining`;
  },

  _addMessage(role, html) {
    const container = document.getElementById('sr-chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${role}`;
    div.innerHTML = `
      <div class="chat-bubble">${html}</div>
      <div class="chat-time">${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  _showTyping() {
    const container = document.getElementById('sr-chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.id        = 'sr-typing';
    div.className = 'chat-msg chat-msg-ai';
    div.innerHTML = `<div class="chat-bubble typing-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  _hideTyping() {
    document.getElementById('sr-typing')?.remove();
  },

  _triggerMandatedAlert() {
    const member = AppState.getMember(this.memberId);
    if (!member) return;
    member.alerts        = (member.alerts || 0) + 1;
    member.wellnessScore = Math.max(5, (member.wellnessScore || 50) - 15);
    AppState.alerts.unshift({
      type:     'danger',
      title:    '⚠ Mandated Reporter Alert',
      detail:   `${member.name} used concerning language during an AI scenario session.`,
      time:     'Just now',
      unread:   true,
      member,
      mandated: true,
    });
    AppState.stats = buildEmptyOrgStats(AppState.members.length);
    updateAlertBadge();
    showToast(`Mandated reporter alert raised for ${member.name}`, 'danger');
  },

  _escape(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
};
