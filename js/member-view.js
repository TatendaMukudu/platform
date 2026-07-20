/* ============================================================
   INTELLIQ — MEMBER VIEW  (js/member-view.js)
   Hosted inside the unified app shell (#member-shell).
   Identity comes from Auth — no own session object.
   Called by launchMemberView() in app.js after login.
   ============================================================ */

const MemberApp = {

  /* ── Auth getters (replaces this.session.*) ─────────────── */
  get _userId()  { return Auth.currentUser?.id; },
  get _name()    { return Auth.currentUser?.name || `${Auth.currentUser?.firstName || ''} ${Auth.currentUser?.lastName || ''}`.trim(); },
  get _orgCode() { return Auth.currentUser?.orgCode; },
  get _orgName() { return Auth.currentOrg?.orgName  || Auth.currentUser?.orgCode || ''; },
  get _orgMode() { return Auth.currentOrg?.orgMode  || ''; },
  get _role()    { return Auth.currentUser?.role    || 'member'; },

  /* ── Local state ────────────────────────────────────────── */
  pending:       [],
  results:       [],
  checkins:      [],
  goals:         null,
  latestInsight: null,   // Phase 4: last structured check-in insight
  mood:          null,
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
  _lsInsight()  { return `iq_insight_${this._userId}`; },  // Phase 4

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

    this.results       = results;
    this.checkins      = checkins;
    this.goals         = goals;
    this.latestInsight = this._parseLS(this._lsInsight(), 'null'); // Phase 4
  },

  _parseLS(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || fallback); } catch { return JSON.parse(fallback); }
  },

  /* ── Screen control ─────────────────────────────────────── */
  _showScreen(id) {
    // Map legacy screen IDs to unified workspace actions
    if (id === 'screen-main') {
      // "main" just means the workspace — nothing to do, we're already there
      return;
    }
    // Overlay screens (scenario, weekly, setpassword, goals) are now top-level
    // .member-fullscreen-overlay elements — toggle .active class on them.
    document.querySelectorAll('.member-fullscreen-overlay').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
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
    // If the new onboarding flow already completed, skip the legacy goals intake screen.
    // profileComplete is set by /api/auth/complete-profile and persisted in Auth.currentUser.
    if (Auth.currentUser?.profileComplete === true) {
      this._showMain();
      this.loadPending();
      return;
    }
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
      this.showToast('Password set ', 'success');
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
    this.showToast('Goal saved ', 'success');
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
      console.warn('[MemberApp] loadPending failed:', e.message);
      // Do NOT show a fake scenario — leave pending empty so the UI shows
      // a genuine empty state rather than misleading demo content.
    }
    this._updateBadge();
    this._renderHome();
    this._renderScenariosList();
  },

  /* ── MAIN SCREEN ────────────────────────────────────────── */
  _showMain() {
    // In the unified workspace there is no separate "main" screen to show.
    // The workspace topbar handles identity display — no member-topbar DOM refs needed.
    // Close any open overlays (e.g. after set-password or goal intake).
    document.querySelectorAll('.member-fullscreen-overlay').forEach(s => s.classList.remove('active'));

    this._renderHome();
    this._renderStats();
    this._setupCheckinPrompt();
  },

  toggleAccountMenu() {
    const menu = document.getElementById('member-account-menu');
    if (!menu) return;
    const opening = !menu.classList.contains('open');
    menu.classList.toggle('open', opening);
    if (opening) {
      const close = (e) => {
        const btn = document.getElementById('member-avatar-btn');
        if (!btn?.contains(e.target) && !menu.contains(e.target)) {
          menu.classList.remove('open');
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 10);
    }
  },

  _setupCheckinPrompt() {
    const done   = this._checkedInToday();
    const form   = document.getElementById('checkin-form');
    const doneEl = document.getElementById('checkin-done');

    if (done) {
      if (form)   form.style.display   = 'none';
      if (doneEl) doneEl.style.display = 'block';
      const today        = new Date().toLocaleDateString('en-GB');
      const todayCheckin = [...this.checkins].reverse().find(c => c.date === today);
      const replayEl     = document.getElementById('checkin-ai-replay');
      if (replayEl) {
        // Phase 4: prefer structured insight; fall back to plain aiResponse
        const insight = todayCheckin?.insight || this.latestInsight;
        if (insight) {
          replayEl.style.display = 'block';
          this._renderInsightPanel(replayEl, null, insight);
        } else if (todayCheckin?.aiResponse) {
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
  // ── The "Me" context — proactive, reasoning-first home (Individual Experience) ──
  _renderHome() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const g = document.getElementById('home-greeting'); if (g) g.textContent = greeting;
    const n = document.getElementById('home-name');     if (n) n.textContent = this._name;
    // Reveal the voice affordance only where the browser supports it.
    const mic = document.getElementById('composer-mic');
    if (mic && (window.SpeechRecognition || window.webkitSpeechRecognition)) mic.style.display = '';
    this._renderMeContext();
  },

  /* Fetch and render the proactive open-state: the kernel has "already worked".
   Deterministic + privacy-safe — works with no AI key. */
  async _renderMeContext() {
    const briefEl = document.getElementById('me-briefing');
    const notEl   = document.getElementById('me-noticed');
    const qEl      = document.getElementById('me-questions');
    const prepEl   = document.getElementById('me-prepared');
    let d = null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);   // never hang the Me space
      const res = await fetch('/api/me/context', { headers: this._authHeaders(), signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) d = await res.json();
    } catch (_) {}

    if (!d || !d.ok) {
      if (briefEl) briefEl.innerHTML = `<div class="card iq-briefing"><div class="iq-briefing-text">Welcome. Add anything on your mind below — IntelliQ takes it from there.</div></div>`;
      [notEl, qEl, prepEl].forEach(e => { if (e) e.innerHTML = ''; });
      this._renderMeNotes();
      return;
    }

    if (briefEl) briefEl.innerHTML = `
      <div class="card iq-briefing">
        <div class="iq-briefing-badge">IntelliQ · already reviewed</div>
        <div class="iq-briefing-text">${this._escape(d.opening || '')}</div>
      </div>`;

    // Adaptive check-in — the composer asks what fits where the person is right now.
    const askEl = document.getElementById('composer-ask');
    if (askEl && d.ask) askEl.textContent = d.ask;

    // Recognition from others — a positive, human moment (the reason to open it).
    const recEl = document.getElementById('me-recognition');
    if (recEl) recEl.innerHTML = (d.recognitions && d.recognitions.length) ? `
      <div class="me-section-label">You were noticed</div>
      ${d.recognitions.map(r => `
        <div class="card me-recognition-card">
          <div class="me-row-text">${this._escape(r.text)}</div>
          <div class="me-row-conf">— ${this._escape(r.by)}</div>
        </div>`).join('')}` : '';

    if (notEl) notEl.innerHTML = (d.noticed && d.noticed.length) ? `
      <div class="me-section-label">Things I've noticed</div>
      ${d.noticed.map(x => `
        <div class="card me-row">
          <span class="me-dot me-dot-${x.kind === 'pattern' ? 'pattern' : 'shift'}"></span>
          <div style="flex:1">
            <div class="me-row-text">${this._escape(x.text)}</div>
            <div class="me-row-conf">${this._escape(x.confidence || '')}</div>
          </div>
        </div>`).join('')}` : '';

    if (qEl) qEl.innerHTML = (d.questions && d.questions.length) ? `
      <div class="me-section-label">Still open for you</div>
      ${d.questions.map(q => `
        <div class="card me-row">
          <div style="flex:1" class="me-row-text">${this._escape(q.text)}</div>
          <button class="btn btn-outline btn-sm" onclick="MemberApp.resolveThread('${q.id}')">Resolved</button>
        </div>`).join('')}` : '';

    // Prepared (approvable) + active focuses (report outcome) — the visible
    // Recommend → Approve → Execute → Observe → Learn lifecycle.
    this._prepared = d.prepared || [];
    this._focuses  = d.focuses || [];
    if (prepEl) {
      let html = '';
      if (this._prepared.length) {
        html += `<div class="me-section-label">Prepared for you</div>` + this._prepared.map((p, i) => `
          <div class="card me-row">
            <div style="flex:1" class="me-row-text">${this._escape(p.text)}</div>
            <div class="me-row-actions">
              <button class="btn-primary btn-sm" onclick="MemberApp.approvePrepared(${i})">Approve</button>
              <button class="btn btn-outline btn-sm" onclick="MemberApp.dismissPrepared(${i})">Not now</button>
            </div>
          </div>`).join('');
      }
      if (this._focuses.length) {
        html += `<div class="me-section-label">Your focus</div>` + this._focuses.map(f => `
          <div class="card me-row me-focus-row">
            <div style="flex:1" class="me-row-text">${this._escape(f.text)}</div>
            <div class="me-row-actions">
              <button class="btn btn-outline btn-sm" onclick="MemberApp.focusOutcome('${f.id}','helped')">Helped</button>
              <button class="btn btn-outline btn-sm" onclick="MemberApp.focusOutcome('${f.id}','no')">Didn't</button>
            </div>
          </div>`).join('');
      }
      prepEl.innerHTML = html;
    }
    this._renderMeNotes();
  },

  /* Notes, clumped into the Me tab — your saved memory, right where you live.
     The composer above is the main input; this is a quick note + a browse of
     what you've kept. Full options (tags, sharing) open the Notes page. */
  async _renderMeNotes() {
    const el = document.getElementById('me-notes');
    if (!el) return;
    const esc = t => this._escape(t || '');
    let notes = [];
    try {
      const res = await fetch(`/api/notes?orgCode=${encodeURIComponent(this._orgCode)}&requesterId=${encodeURIComponent(this._userId)}`, { headers: this._authHeaders() });
      if (res.ok) { const data = await res.json(); notes = (data.notes || []).filter(n => n.authorId === this._userId); }
    } catch (_) {}
    const list = notes.slice(0, 6).map(n => {
      const time = n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
      return `<div class="card me-row" style="display:block;padding:0.7rem 0.9rem;margin-bottom:0.5rem">
        <div class="me-row-text" style="font-size:0.84rem">${esc(n.content)}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:3px">${esc(n.type)}${time ? ' · ' + time : ''}</div>
      </div>`;
    }).join('');
    el.innerHTML = `
      <div class="me-section-label" style="display:flex;align-items:center;justify-content:space-between">
        <span>Notes</span>
        <button class="btn-ghost" style="font-size:0.72rem" onclick="MemberApp._meNoteToggle()">＋ Note</button>
      </div>
      <div id="me-note-add" style="display:none;margin-bottom:0.6rem">
        <textarea class="note-input" id="me-note-input" placeholder="A note to keep — only you and IntelliQ see it." style="min-height:56px;margin-bottom:0.4rem"></textarea>
        <div style="display:flex;gap:0.4rem;align-items:center">
          <button class="btn-primary btn-sm" onclick="MemberApp._meNoteSave(this)">Save note</button>
          <button class="btn btn-outline btn-sm" onclick="navigate('notes')">More options</button>
        </div>
      </div>
      ${notes.length
        ? list + (notes.length > 6 ? `<button class="btn-ghost" style="font-size:0.74rem" onclick="navigate('notes')">See all ${notes.length}</button>` : '')
        : `<div style="font-size:0.82rem;color:var(--text-muted)">No notes yet — keep a thought and IntelliQ remembers it.</div>`}`;
  },

  _meNoteToggle() { const el = document.getElementById('me-note-add'); if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'; },

  async _meNoteSave(btn) {
    const content = (document.getElementById('me-note-input')?.value || '').trim();
    if (!content) { this.showToast('Write something first', 'warning'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const res = await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ orgCode: this._orgCode, authorId: this._userId, authorName: this._name, content, type: 'private', tag: null, groupId: null }),
      });
      if (!res.ok) throw new Error();
      this.showToast('Saved ', 'success');
      this._renderMeNotes();
    } catch (e) { this.showToast('Could not save', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Save note'; } }
  },

  /* Approve a prepared suggestion → it becomes one of your active focuses. */
  async approvePrepared(i) {
    const p = (this._prepared || [])[i]; if (!p) return;
    try {
      await fetch('/api/me/prepared/act', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ text: p.text, type: p.type || null, decision: 'approve' }),
      });
    } catch (_) {}
    this._renderMeContext();
  },

  /* Dismiss a prepared suggestion (teaches IntelliQ this nudge didn't land). */
  async dismissPrepared(i) {
    const p = (this._prepared || [])[i]; if (!p) return;
    try {
      await fetch('/api/me/prepared/act', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ text: p.text, type: p.type || null, decision: 'dismiss' }),
      });
    } catch (_) {}
    this._renderMeContext();
  },

  /* Close the loop on a focus — how did it go? (Observe outcome → Learn.) */
  async focusOutcome(focusId, outcome) {
    try {
      await fetch('/api/me/focus/outcome', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ focusId, outcome }),
      });
    } catch (_) {}
    this._renderMeContext();
  },

  /* Reveal/hide the Notes extras (tags, visibility, group) — clean by default. */
  toggleNoteOptions() {
    const el = document.getElementById('note-options');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  },

  /* Optional mood on the composer (tap-to-toggle). */
  composeMood(n) {
    this._composerMood = (this._composerMood === n) ? null : n;
    document.querySelectorAll('#composer-mood .composer-mood-faces button').forEach(b => {
      b.classList.toggle('selected', Number(b.dataset.m) === this._composerMood);
    });
  },

  /* The universal composer — one input; the AI decides what it is + what's next. */
  async composeSubmit() {
    const input   = document.getElementById('composer-input');
    const statusEl = document.getElementById('composer-status');
    const respEl   = document.getElementById('composer-response');
    const text = (input?.value || '').trim();
    const mood = this._composerMood || null;
    if (!text && !mood) { if (statusEl) statusEl.textContent = 'Add a line or tap a mood.'; return; }

    const btn = document.getElementById('composer-add');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    try {
      const res = await fetch('/api/compose', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body:    JSON.stringify({ text, mood }),
      });
      if (!res.ok) throw new Error('compose failed');
      const d = await res.json();
      if (input) input.value = '';
      this._composerMood = null;
      document.querySelectorAll('#composer-mood .composer-mood-faces button.selected').forEach(b => b.classList.remove('selected'));
      if (statusEl) statusEl.textContent = '';
      if (respEl) {
        respEl.style.display = 'block';
        respEl.innerHTML = `
          <div class="card iq-briefing" style="margin-top:0.7rem">
            <div class="iq-briefing-badge">IntelliQ</div>
            <div class="iq-briefing-text">${this._escape(d.acknowledgement || 'Added.')}</div>
            ${(d.noticed && d.noticed.length) ? `<div class="me-compose-noticed">${d.noticed.map(t => `<div>• ${this._escape(t)}</div>`).join('')}</div>` : ''}
          </div>`;
      }
      this._renderMeContext();  // refresh the proactive surface with the new input folded in
    } catch (_) {
      if (statusEl) statusEl.textContent = "Couldn't add that — try again.";
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
    }
  },

  /* Voice → text via the browser's SpeechRecognition (no backend; degrades if absent). */
  composeVoice() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return;
    const input    = document.getElementById('composer-input');
    const statusEl = document.getElementById('composer-status');
    const rec = new Rec();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    if (statusEl) statusEl.textContent = 'Listening…';
    rec.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript || '';
      if (input && t) input.value = (input.value ? input.value + ' ' : '') + t;
      if (statusEl) statusEl.textContent = '';
    };
    rec.onerror = () => { if (statusEl) statusEl.textContent = ''; };
    rec.onend   = () => { if (statusEl && statusEl.textContent === 'Listening…') statusEl.textContent = ''; };
    try { rec.start(); } catch (_) {}
  },

  /* Resolve one of the person's own open threads (self-owned memory). */
  async resolveThread(id) {
    try {
      await fetch('/api/user/memory/resolve', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body:    JSON.stringify({ threadId: id }),
      });
    } catch (_) {}
    this._renderMeContext();
  },

  /* The IntelliQ lens: a warm, self-relative reflection + the person's own
     behavioural portrait. Their data, reflected to them — never a score, never
     shared without consent. Renders into the home insight slot. */
  async _loadIntelliQRecord() {
    const el = document.getElementById('home-insight');
    if (!el) return;
    try {
      const res = await fetch('/api/me/record', { headers: this._authHeaders() });
      if (!res.ok) return;
      const d = await res.json();
      if (!d.ok) return;

      const portraitChips = Object.values(d.portrait || {})
        .map(f => `<span class="iq-portrait-chip">${this._escape(f.label)} · usually ${f.normal}</span>`).join('');
      const shiftChips = (d.shifts || []).map(s => {
        const arrow = s.direction === 'below' ? '↓' : '↑';
        const pct = s.deviationPct != null ? Math.abs(s.deviationPct) + '% ' : '';
        return `<span class="iq-shift-chip iq-shift-${s.direction}">${arrow} ${this._escape(s.label)} ${pct}${s.direction} your usual</span>`;
      }).join('');

      const connLines = (d.connections || []).slice(0, 2).map(c =>
        `<div class="iq-conn">${this._escape(c.a)} &amp; ${this._escape(c.b)} have been moving ${c.relation === 'inversely' ? 'in opposite directions' : 'together'} for you lately <span class="iq-conn-hint">— a connection worth noticing, not a cause</span></div>`
      ).join('');

      el.innerHTML = `
        <div class="iq-mirror">
          <div class="iq-mirror-title">What IntelliQ notices about you</div>
          <div class="iq-mirror-text">${this._escape(d.reflection || '')}</div>
          ${portraitChips ? `<div class="iq-portrait">${portraitChips}</div>` : ''}
          ${shiftChips ? `<div class="iq-shifts"><span class="iq-shifts-label">Lately, vs your own normal:</span> ${shiftChips}</div>` : ''}
          ${connLines ? `<div class="iq-conns">${connLines}<button class="iq-dismiss" onclick="MemberApp._dismissNoticing('connection')">not helpful</button></div>` : ''}
          <div class="iq-mirror-foot">This is yours. It reflects you to you — never a score, and never shared without your say.</div>
        </div>`;

      const TRAJ = { converging:'Converging', sustaining:'Sustaining', up:'Rising', flat:'Steady',
        down:'Dipping', diverging:'Diverging', stalled:'Stalled', unanchored:'Finding footing', unknown:'Building' };
      const traj = document.getElementById('home-traj');
      if (traj && d.trajectory) { traj.textContent = TRAJ[d.trajectory] || 'Building'; traj.style.color = 'var(--accent)'; }
    } catch (_) { /* the mirror is optional — never block the home */ }
  },

  /* The person can teach the Confidence Engine too — their record, their say. */
  async _dismissNoticing(type) {
    try {
      await fetch('/api/intelligence/notice-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ orgCode: this._orgCode, type, feedback: 'dismiss' }),
      });
    } catch (_) {}
    const c = document.querySelector('.iq-conns');
    if (c) c.innerHTML = `<span class="iq-conn-hint">Thanks — noted.</span>`;
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
          <span style="font-size:1.3rem"></span>
          <div style="flex:1">
            <div style="font-size:0.85rem;font-weight:600">Weekly reflection ready</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">2 minutes — IntelliQ synthesises everyone's input</div>
          </div>
          <span style="color:var(--success);font-weight:700;font-size:0.8rem">NEW</span>
        </div>
      </div>`;
  },

  /* ── Phase 4: Progress Signals ─────────────────────────── *
   *  Derived from check-in mood history. Only shows trends     *
   *  when there is genuine data (≥3 check-ins). Honest empty   *
   *  states for new members.                                    *
   * ───────────────────────────────────────────────────────── */
  _renderProgressSignals() {
    const MIN_FOR_TREND = 3;
    if (this.checkins.length < MIN_FOR_TREND) {
      return `
        <div class="empty-card" style="margin-bottom:0.8rem;padding:0.9rem">
          <div class="empty-icon" style="font-size:1.2rem;margin-bottom:0.3rem"></div>
          <div style="font-size:0.78rem">Complete a few check-ins so IntelliQ can identify patterns.</div>
        </div>`;
    }

    // Take last 5 check-ins with a valid mood score
    const recent    = this.checkins.filter(c => c.mood).slice(-5);
    const moodNums  = recent.map(c => c.mood);
    const avgMood   = moodNums.reduce((s, v) => s + v, 0) / moodNums.length;

    // Simple trend: compare first half avg vs second half avg
    const half1 = moodNums.slice(0, Math.floor(moodNums.length / 2));
    const half2 = moodNums.slice(Math.floor(moodNums.length / 2));
    const avg1  = half1.reduce((s, v) => s + v, 0) / (half1.length || 1);
    const avg2  = half2.reduce((s, v) => s + v, 0) / (half2.length || 1);
    const diff  = avg2 - avg1;

    let signal, signalColor, signalIcon;
    if (diff >= 0.8) {
      signal = 'Improving';       signalColor = 'var(--success)'; signalIcon = '';
    } else if (diff <= -0.8) {
      signal = 'Needs attention'; signalColor = 'var(--danger)';  signalIcon = '';
    } else {
      signal = 'Steady';          signalColor = 'var(--warning)'; signalIcon = '';
    }

    // Streak: consecutive days with a check-in
    const streak = this.checkins.length;

    return `
      <div class="card-label" style="margin-bottom:0.5rem">Progress Signals</div>
      <div class="card iq-progress-card" style="margin-bottom:0.8rem">
        <div class="iq-signal-row">
          <div class="iq-signal">
            <div class="iq-signal-icon">${signalIcon}</div>
            <div>
              <div class="iq-signal-label" style="color:${signalColor}">${signal}</div>
              <div class="iq-signal-sub">Mood trend (last ${recent.length} check-ins)</div>
            </div>
          </div>
          <div class="iq-signal">
            <div class="iq-signal-icon"></div>
            <div>
              <div class="iq-signal-label">${streak}</div>
              <div class="iq-signal-sub">Total check-ins</div>
            </div>
          </div>
          ${this.results.length ? `
          <div class="iq-signal">
            <div class="iq-signal-icon"></div>
            <div>
              <div class="iq-signal-label">${this.results.length}</div>
              <div class="iq-signal-sub">Assessments done</div>
            </div>
          </div>` : ''}
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
          <label class="form-label">How did this week's programme go? What worked?</label>
          <textarea class="form-input" id="weekly-overall" rows="3" style="resize:none"
            placeholder="Sessions, activities, group energy — what clicked, what didn't?"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">Anyone on your team you're watching closely?</label>
          <textarea class="form-input" id="weekly-improved" rows="2" style="resize:none"
            placeholder="Names, behaviours, concerns — anything worth noting…"></textarea>
        </div>
        <div class="form-group" style="margin-bottom:1rem">
          <label class="form-label">What's the group's energy like right now?</label>
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
            placeholder="Work, sessions, events, life — whatever felt significant this week…"></textarea>
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
          userId:     this._userId,
          role:       this._role,
          orgMode:    this._orgMode,
          orgName:    this._orgName,
          goals:      this.goals,
          data:       payload,
        }),
      });
      if (!res.ok) throw new Error('submit failed (' + res.status + ')');
      const result = await res.json();

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
    // Close any open overlay and return to the workspace home page.
    // _showScreen('screen-main') used to early-return without doing anything,
    // so the overlay stayed visible. We close it explicitly here, then use
    // navigate() so the topbar title and sidebar nav highlight also update.
    document.querySelectorAll('.member-fullscreen-overlay')
      .forEach(s => s.classList.remove('active'));
    if (typeof navigate === 'function') navigate('home');
    else this._renderHome();
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
      html = `<div class="empty-card"><div class="empty-icon"></div><div>No assessments assigned yet.<br>Assessments will appear here when assigned.</div></div>`;
    }
    el.innerHTML = html;
  },

  _scenarioCardHTML(sc, result = null) {
    const diffColors = { Easy:'var(--success)', Medium:'var(--warning)', Hard:'var(--danger)' };
    const color      = diffColors[sc.difficulty] || 'var(--accent)';
    const done       = sc.status === 'completed';

    // Assigner attribution — Phase 3.
    // Priority: assignedByNodeName (group context) → assignedByName (person) → 'Organisation'
    const assignerLabel = sc.assignedByNodeName || sc.assignedByName || 'Organisation';
    const assignedDate  = sc.assignedAt
      ? new Date(sc.assignedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short' })
      : null;

    return `
      <div class="scenario-pending-card ${sc.fromAlert ? 'from-alert' : ''}"
           onclick="${done ? '' : `MemberApp.startScenario('${sc.id}')`}"
           style="${done ? 'opacity:0.6;cursor:default' : ''}">
        <div class="sc-icon">${done ? '' : ''}</div>
        <div class="sc-info">
          <div class="sc-title">${sc.title}</div>
          <div class="sc-meta">
            <span class="diff-badge" style="color:${color};border-color:${color}44;background:${color}11">${sc.difficulty}</span>
            ${sc.domain} ${done && result ? `· Score: <span style="color:${this._scoreColor(result.score)};font-weight:700">${result.score}</span>` : ''}
          </div>
          <div class="sc-assigner">
            Assigned by: <strong>${assignerLabel}</strong>${assignedDate ? ` · ${assignedDate}` : ''}
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
        userId:     this._userId,
        memberName: this._name,
        scenarioId: this._scenario.id,
        result,
      }),
    })
      // After the result is canonicalised server-side, load the SERVER-supplied verdict.
      .then(() => this._loadAssessmentPresentation(this._userId))
      .catch(() => {});

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
      <div data-assessment-verdict style="font-size:1rem;font-weight:700;margin-bottom:0.3rem;color:${color}">${this._escape(label)}</div>
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1.5rem">Overall IntelliQ Score${score.overall != null ? ` · ${score.overall}/100` : ''}</div>
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
    // Mirror exitWeekly: _showScreen('screen-main') early-returns without
    // closing the overlay. Explicitly strip .active from all overlays,
    // then navigate so topbar + sidebar also update.
    document.querySelectorAll('.member-fullscreen-overlay')
      .forEach(s => s.classList.remove('active'));
    if (typeof navigate === 'function') navigate('home');
    else this._renderHome();
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
          userId:     this._userId,
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

        // ── Phase 4: structured insight ──────────────────────────
        if (data.insight) {
          const insight = data.insight;

          // Stamp insight with today's date for display
          insight._date = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' });

          // Persist on the checkin entry
          entry.insight    = insight;
          entry.aiResponse = data.aiResponse || insight.summary || null;
          this.checkins[this.checkins.length - 1] = entry;
          localStorage.setItem(this._lsCheckins(), JSON.stringify(this.checkins));

          // Persist as latest insight (survives refresh)
          this.latestInsight = insight;
          localStorage.setItem(this._lsInsight(), JSON.stringify(insight));

          // Show rich insight panel on check-in tab immediately
          this._renderInsightPanel(
            document.getElementById('checkin-ai-response'),
            document.getElementById('checkin-ai-text'),
            insight
          );

        } else if (data.aiResponse) {
          // Legacy plain-text fallback
          entry.aiResponse = data.aiResponse;
          this.checkins[this.checkins.length - 1].aiResponse = data.aiResponse;
          localStorage.setItem(this._lsCheckins(), JSON.stringify(this.checkins));
          const aiEl  = document.getElementById('checkin-ai-response');
          const txtEl = document.getElementById('checkin-ai-text');
          if (aiEl && txtEl) { txtEl.textContent = data.aiResponse; aiEl.style.display = 'block'; }
        }
      }
    } catch(err) { /* non-critical — check-in is saved locally */ }

    document.getElementById('checkin-done').style.display = 'block';
    document.getElementById('checkin-form').style.display = 'none';
    this.showToast('Check-in saved ', 'success');
    this._renderHome();  // refreshes home with new insight + progress
  },

  /* ── Phase 4: render structured insight into a container ─── */
  // Convert third-person references to the member's own name into second-person
  // so the member sees "Your mood improved" rather than "Tyler's mood improved".
  _personalizeInsight(text) {
    if (!text) return text;
    const first = (this._name || '').split(' ')[0].trim();
    if (!first || first.length < 2) return text;
    // Escape any regex-special chars in the name (rare but safe)
    const esc = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Possessive: "[Name]'s" → "your" / "Your" depending on position
    text = text.replace(
      new RegExp(`((?:^|[.!?]\\s+))${esc}'s\\b|(\\s)${esc}'s\\b`, 'gi'),
      (m, sentStart, wordSpace) => sentStart ? sentStart + 'Your' : (wordSpace || '') + 'your'
    );
    // Plain name: "[Name]" → "you" / "You" depending on position
    text = text.replace(
      new RegExp(`((?:^|[.!?]\\s+))${esc}\\b|(\\s)${esc}\\b`, 'gi'),
      (m, sentStart, wordSpace) => sentStart ? sentStart + 'You' : (wordSpace || '') + 'you'
    );
    return text;
  },

  _renderInsightPanel(containerEl, _legacyTextEl, insight) {
    if (!containerEl || !insight) return;
    // Personalize all text fields so the member reads "your" instead of "[Name]'s"
    const p = t => this._escape(this._personalizeInsight(t) || '');
    containerEl.style.display = 'block';
    containerEl.innerHTML = `
      <div class="iq-insight-card">
        <div class="iq-insight-header">
          <div class="iq-badge-circle">IQ</div>
          <div class="iq-insight-meta">IntelliQ${insight._date ? ` · ${insight._date}` : ''}</div>
        </div>
        <div class="iq-insight-summary">${p(insight.summary)}</div>
        ${insight.whatIntelliQNoticed ? `
          <div class="iq-insight-detail noticed">
            ${p(insight.whatIntelliQNoticed)}
          </div>` : ''}
        ${insight.suggestedNextAction ? `
          <div class="iq-insight-action">
            <span class="iq-action-icon"></span>
            <span>${p(insight.suggestedNextAction)}</span>
          </div>` : ''}
        ${insight.goalConnection ? `
          <div class="iq-insight-detail goal-line">
            <span style="margin-right:0.35rem"></span>${p(insight.goalConnection)}
          </div>` : ''}
        ${insight.encouragement ? `
          <div class="iq-insight-detail encourage-line">
            ${p(insight.encouragement)}
          </div>` : ''}
        ${insight.watchOutFor ? `
          <div class="iq-insight-detail watch-line">
            <span style="margin-right:0.35rem"></span>${p(insight.watchOutFor)}
          </div>` : ''}
      </div>`;
  },

  /* ── STATS ──────────────────────────────────────────────── */
  _renderStats() {
    const el = document.getElementById('stats-content');
    let html = '';

    // ── 1. Your Focus (goals) ─────────────────────────────────
    if (this.goals?.goal) {
      html += `
        <div class="card" style="margin-bottom:0.8rem">
          <div class="card-label" style="margin-bottom:0.5rem">Your Focus</div>
          <div style="font-size:0.87rem;color:var(--text-primary);font-weight:600;line-height:1.5">
            ${this._escape(this.goals.goal)}
          </div>
          ${this.goals.identity ? `
          <div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.5;margin-top:0.35rem">
            Becoming: ${this._escape(this.goals.identity)}
          </div>` : ''}
        </div>`;
    }

    // ── 2. Latest IntelliQ Insight ────────────────────────────
    const insight = this.latestInsight;
    if (insight) {
      html += `<div class="card-label" style="margin-bottom:0.5rem">Latest IntelliQ Insight</div>`;
      const placeholder = `<div id="stats-insight-slot" style="margin-bottom:0.8rem"></div>`;
      html += placeholder;
    }

    // ── 3. Check-In History ───────────────────────────────────
    const moodIcons  = { 1:'', 2:'', 3:'', 4:'', 5:'' };
    const moodColors = { 1:'var(--danger)', 2:'#f7b24f', 3:'var(--text-muted)', 4:'var(--success)', 5:'var(--success)' };
    if (this.checkins.length) {
      const recent = [...this.checkins].reverse().slice(0, 7);
      html += `
        <div class="card" style="margin-bottom:0.8rem">
          <div class="card-label" style="margin-bottom:0.6rem">Check-In History</div>
          ${recent.map(c => `
            <div style="display:flex;align-items:center;gap:0.6rem;padding:0.45rem 0;border-bottom:1px solid var(--border)">
              <span style="font-size:1rem;flex-shrink:0">${moodIcons[c.mood] || '—'}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:0.78rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  ${this._escape((c.text || '').slice(0, 65))}${(c.text || '').length > 65 ? '…' : ''}
                </div>
                <div style="font-size:0.68rem;color:var(--text-muted)">${c.date}</div>
              </div>
              <span style="font-size:0.72rem;color:${moodColors[c.mood] || 'var(--text-muted)'};flex-shrink:0">
                ${c.moodLabel || ''}
              </span>
            </div>`).join('')}
          ${this.checkins.length < 3 ? `
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem;text-align:center;padding:0.3rem 0">
              Complete a few check-ins so IntelliQ can identify patterns.
            </div>` : ''}
        </div>`;
    } else {
      html += `
        <div class="empty-card" style="margin-bottom:0.8rem">
          <div class="empty-icon">${ICON.checkin}</div>
          <div>No check-ins yet. Start from the Check-In tab.</div>
        </div>`;
    }

    // ── 4. Assessment / scenario stats ───────────────────────
    if (!this.results.length) {
      html += `<div class="empty-card"><div class="empty-icon"></div><div>Complete an assessment to see your performance stats.</div></div>`;
      el.innerHTML = html;
    } else {
      const avgScore = Math.round(this.results.reduce((s, r) => s + r.score, 0) / this.results.length);
      const { label, color } = this._scoreLabel(avgScore);
      const dims    = ['ethical_reasoning','stakeholder_awareness','pressure_response','self_awareness'];
      const dimAvgs = dims.map(d => {
        const vals = this.results.map(r => r.dimensions?.[d]).filter(v => v != null);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      });

      html += `
        <div class="card" style="text-align:center;margin-bottom:0.8rem">
          <div style="margin:0 auto 0.8rem;width:100px">${this._svgRing(avgScore, color, 100)}</div>
          <div style="font-size:0.9rem;font-weight:700;color:${color}">${label}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">
            Avg across ${this.results.length} assessment${this.results.length !== 1 ? 's' : ''}
          </div>
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
          <div class="card-label" style="margin-bottom:0.6rem">Assessment History</div>
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

      el.innerHTML = html;
    }

    // Insert insight panel into its placeholder slot (can't innerHTML after DOM render)
    if (insight) {
      const slot = document.getElementById('stats-insight-slot');
      if (slot) this._renderInsightPanel(slot, null, insight);
    }
  },

  /* ── TAB SWITCHING ──────────────────────────────────────── */
  async switchTab(tab) {
    // Translate old bottom-nav tab names to unified workspace page IDs,
    // then delegate to the workspace navigate() function.
    const pageMap = {
      home:      'home',
      scenarios: 'assessments',
      checkin:   'checkin',
      inbox:     'inbox',
      stats:     'stats',
    };
    const page = pageMap[tab] || tab;
    if (typeof navigate === 'function') navigate(page);
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

  // _renderInbox: Inbox is now communication-only (messages).
  // Notes have their own dedicated page — see _renderNotesPage().
  async _renderInbox() {
    await this._loadMyGroups();
    this._populateMsgGroupSelector();
    const noticeEl = document.getElementById('inbox-group-notice');
    if (noticeEl) noticeEl.style.display = this._myGroups.length ? 'none' : 'block';
    await this._loadMessages();
  },

  // _renderNotesPage: called when the user navigates to the Notes page.
  async _renderNotesPage() {
    await this._loadMyGroups();
    this._populateNoteGroupSelector();
    if (typeof IQComposer !== 'undefined') IQComposer.mountAll();
    await this._loadNotes();
  },

  /* ══════════════════════════════════════════════════════════════════════
     ASSESSMENTS — work a leader wants done a certain way (a spreadsheet, a
     film breakdown, a way of playing). A leader creates + assigns; the assignee
     fills and returns; the leader reviews. Tutorials are pinned how-to's anyone
     can refer back to. Backed by /api/assessments.
     ══════════════════════════════════════════════════════════════════════ */
  _assessState: null,
  _assessKindLabel: { spreadsheet: 'Data / spreadsheet', film: 'Video / recording', play: 'Approach / method', skill: 'Skill', general: 'General' },

  // The Studio is conversation-first: IntelliQ leads, and the caller's assigned
  // work, pins, and leader tools sit below the chat as cards they can act on.
  async _renderAssessments() {
    const root = document.getElementById('assessments-root');
    if (!root) return;
    root.innerHTML = `<div class="empty-hint" style="padding:1rem;color:var(--text-muted)">Loading…</div>`;
    try {
      const [sRes, aRes] = await Promise.all([
        fetch('/api/studio', { headers: this._authHeaders() }),
        fetch('/api/assessments', { headers: this._authHeaders() }),
      ]);
      const s = sRes.ok ? await sRes.json() : { ok: false };
      const d = await aRes.json();
      this._assessState = d;
      this._studioState = s;
      root.innerHTML = (s && s.ok ? this._studioHtml(s) : '') + this._assessHtml(d);
      if (typeof hydrateIcons === 'function') hydrateIcons(root);
      this._studioScrollBottom();
      if (d.canCreate) this._loadAssessLearning();
    } catch (e) {
      root.innerHTML = `<div class="empty-hint" style="padding:1rem;color:var(--text-muted)">Couldn't load your workspace.</div>`;
    }
  },

  // ── The Studio conversation — chat-first, with media + voice input ─────────
  _studioState: null,
  _studioRec: null,        // active MediaRecorder
  _studioChunks: [],

  _studioHtml(s) {
    const esc = t => this._escape(t || '');
    const msgs = s.messages || [];
    let log = '';
    if (s.opening) log += `<div class="conv-ai"><strong>IntelliQ</strong>${esc(s.opening)}</div>`;
    log += msgs.map(m => m.role === 'assistant'
      ? `<div class="conv-ai"><strong>IntelliQ</strong>${esc(m.text)}</div>`
      : `<div class="conv-you">${m.media ? `<span class="studio-media-tag">${esc((m.media.kind || 'file').toUpperCase())}</span> ` : ''}${esc(m.text || (m.media ? m.media.name : ''))}</div>`
    ).join('');

    const plans = (s.plans || []);
    const planHtml = plans.length ? `<div class="studio-plans">
      <div class="card-label" style="margin-bottom:0.3rem">Your plans</div>
      ${plans.map(p => `<div class="studio-plan"><button class="studio-plan-check" title="Mark done" onclick="MemberApp._studioPlanDone('${p.id}', this)">○</button><span>${esc(p.text)}</span></div>`).join('')}
    </div>` : '';

    const recLabel = s.canTranscribe ? 'Record' : 'Record (voice)';
    const proactive = s.proactive ? `<div class="studio-proactive">${esc(s.proactive)}</div>` : '';
    return `<details class="card studio-card collapse-card" open>
      <summary class="card-label">MyWorkspace · talk it through with IntelliQ</summary>
      ${proactive}
      <div class="studio-log" id="studio-log">${log}</div>
      ${planHtml}
      <div id="studio-staged"></div>
      <div class="studio-input-row">
        <textarea class="form-input" id="studio-in" placeholder="Type, think a plan out loud, or attach a file…" rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();MemberApp._studioSend(this)}"></textarea>
      </div>
      <div class="studio-actions">
        <label class="btn-ghost studio-attach" title="Attach a file or photo">Attach
          <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv" style="display:none" onchange="MemberApp._studioAttach(this)">
        </label>
        <button class="btn-ghost" id="studio-rec-btn" onclick="MemberApp._studioRecordToggle(this)">${recLabel}</button>
        <label class="studio-saveplan"><input type="checkbox" id="studio-saveplan"> Save as a plan</label>
        <button class="btn-primary btn-sm" style="margin-left:auto" onclick="MemberApp._studioSend(document.getElementById('studio-in'))">Send</button>
      </div>
      <div id="studio-rec-status" class="studio-rec-status"></div>
    </details>`;
  },

  _studioScrollBottom() {
    const log = document.getElementById('studio-log');
    if (log) log.scrollTop = log.scrollHeight;
  },

  // Short relative time ("3 days ago", "today") for track-record lines.
  _ago(iso) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return 'recently';
    const days = Math.floor((Date.now() - t) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return 'last week';
    if (days < 60) return `${Math.round(days / 7)} weeks ago`;
    return `${Math.round(days / 30)} months ago`;
  },

  // Update only the plans strip (no full re-render) so the conversation stays put.
  async _studioRefreshPlans() {
    try {
      const res = await fetch('/api/studio', { headers: this._authHeaders() });
      if (!res.ok) return;
      const s = await res.json();
      const esc = t => this._escape(t || '');
      const plans = s.plans || [];
      const html = plans.length ? `<div class="card-label" style="margin-bottom:0.3rem">Your plans</div>
        ${plans.map(p => `<div class="studio-plan"><button class="studio-plan-check" title="Mark done" onclick="MemberApp._studioPlanDone('${p.id}', this)">○</button><span>${esc(p.text)}</span></div>`).join('')}` : '';
      let strip = document.querySelector('.studio-plans');
      if (!strip) {
        const log = document.getElementById('studio-log');
        if (log && html) { strip = document.createElement('div'); strip.className = 'studio-plans'; log.insertAdjacentElement('afterend', strip); }
      }
      if (strip) strip.innerHTML = html;
    } catch (_) {}
  },

  _studioAppend(role, text, media) {
    const log = document.getElementById('studio-log');
    if (!log) return;
    const esc = t => this._escape(t || '');
    const div = document.createElement('div');
    if (role === 'assistant') { div.className = 'conv-ai'; div.innerHTML = `<strong>IntelliQ</strong>${esc(text)}`; }
    else { div.className = 'conv-you'; div.innerHTML = `${media ? `<span class="studio-media-tag">${esc((media.kind || 'file').toUpperCase())}</span> ` : ''}${esc(text || (media ? media.name : ''))}`; }
    log.appendChild(div);
    this._studioScrollBottom();
  },

  async _studioSend(inputEl, media, attachment) {
    const input = inputEl || document.getElementById('studio-in');
    const message = (input?.value || '').trim();
    // A staged attachment (chosen earlier) rides along with whatever they typed, so
    // you can write a summary AND attach your notes in one message.
    if (!media && this._studioStaged) { media = this._studioStaged.media; attachment = this._studioStaged.attachment; }
    if (!message && !media) return;
    const savePlan = !!document.getElementById('studio-saveplan')?.checked;
    if (message || media) this._studioAppend('you', message, media);
    if (input) input.value = '';
    this._studioClearStaged();
    const pending = document.createElement('div');
    pending.className = 'conv-ai'; pending.style.opacity = '0.6';
    pending.textContent = attachment ? 'IntelliQ is reading it…' : 'IntelliQ is thinking…';
    document.getElementById('studio-log')?.appendChild(pending); this._studioScrollBottom();
    try {
      const res = await fetch('/api/studio/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ message, media: media || undefined, attachment: attachment || undefined, savePlan }),
      });
      const d = await res.json();
      pending.remove();
      if (!res.ok || !d.ok) throw new Error();
      this._studioAppend('assistant', d.reply);
      const sp = document.getElementById('studio-saveplan'); if (sp) sp.checked = false;
      // Plans emerge from the conversation — the reply already names it, so we keep
      // the chat as the primary object and just fold the new plan into the list.
      if (d.planSaved) this._studioRefreshPlans();
    } catch (e) {
      pending.remove();
      this._studioAppend('assistant', 'Something went wrong sending that — try again in a moment.');
    }
  },

  async _studioAttach(inputEl) {
    const file = inputEl?.files?.[0];
    if (!file) return;
    inputEl.value = '';
    if (file.size > 12 * 1024 * 1024) { this._studioAppend('assistant', 'That file is a bit large for me to read (max ~12MB) — try a smaller version or a screenshot.'); return; }
    const kind = /^image\//.test(file.type) ? 'photo' : (file.name.split('.').pop() || 'file').toLowerCase();
    const media = { name: file.name.slice(0, 160), kind };
    // Send the actual bytes so IntelliQ can READ it (vision / PDF / text), not just
    // note that a file arrived.
    let attachment = null;
    try {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const b64 = String(dataUrl).includes(',') ? String(dataUrl).split(',')[1] : String(dataUrl);
      attachment = { name: media.name, mimetype: file.type || 'application/octet-stream', data: b64 };
    } catch (_) { attachment = null; }
    if (!attachment) { this._studioAppend('assistant', 'Couldn\'t read that file — try again.'); return; }
    // STAGE it (don't send yet) so they can add their own notes alongside it.
    this._studioStaged = { media, attachment };
    const chip = document.getElementById('studio-staged');
    if (chip) chip.innerHTML = `<div class="studio-chip"><span class="studio-media-tag">${this._escape((media.kind || 'file').toUpperCase())}</span> ${this._escape(media.name)}<button class="studio-chip-x" title="Remove" onclick="MemberApp._studioClearStaged()">✕</button></div><div class="studio-chip-hint">Add a note if you like, then Send — they'll go together.</div>`;
    const inp = document.getElementById('studio-in'); if (inp) inp.focus();
  },

  _studioClearStaged() {
    this._studioStaged = null;
    const chip = document.getElementById('studio-staged');
    if (chip) chip.innerHTML = '';
  },

  async _studioRecordToggle(btn) {
    const status = document.getElementById('studio-rec-status');
    if (this._studioRec && this._studioRec.state === 'recording') {
      this._studioRec.stop();
      btn.textContent = 'Record';
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      if (status) status.textContent = 'Recording isn\'t supported on this device — type your note instead.';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._studioChunks = [];
      const rec = new MediaRecorder(stream);
      this._studioRec = rec;
      rec.ondataavailable = e => { if (e.data.size) this._studioChunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(this._studioChunks, { type: rec.mimeType || 'audio/webm' });
        await this._studioTranscribe(blob);
      };
      rec.start();
      btn.textContent = 'Stop';
      if (status) status.textContent = 'Recording… tap Stop when you\'re done.';
    } catch (e) {
      if (status) status.textContent = 'Couldn\'t access the mic — check permissions, or type your note.';
    }
  },

  async _studioTranscribe(blob) {
    const status = document.getElementById('studio-rec-status');
    if (status) status.textContent = 'Transcribing…';
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob);
      });
      const res = await fetch('/api/studio/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ audio: b64, mimetype: blob.type || 'audio/webm' }),
      });
      const d = await res.json();
      if (res.status === 503) { if (status) status.textContent = d.note || 'Voice transcription needs an OpenAI key — type your note for now.'; return; }
      if (!res.ok || !d.ok) throw new Error();
      if (status) status.textContent = '';
      const input = document.getElementById('studio-in');
      if (input) { input.value = (input.value ? input.value + ' ' : '') + (d.text || ''); input.focus(); }
    } catch (e) {
      if (status) status.textContent = 'Couldn\'t transcribe that — try again or type it.';
    }
  },

  async _studioPlanDone(id, btn) {
    try {
      await fetch('/api/studio/plan/' + id, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ done: true }),
      });
      const row = btn.closest('.studio-plan');
      if (row) { row.style.opacity = '0.5'; btn.textContent = '✓'; btn.disabled = true; }
    } catch (e) {}
  },

  // The assessment-learning loop, surfaced: which assessments precede improvement
  // (repeat them) and which precede a dip (revisit them) — grounded in real
  // trajectories and scores, honestly labelled correlational.
  async _loadAssessLearning() {
    const box = document.getElementById('assess-learning');
    if (!box) return;
    try {
      const res = await fetch('/api/intelligence/whats-working', { headers: this._authHeaders() });
      if (!res.ok) throw new Error('failed');
      const d = await res.json();
      const esc = t => this._escape(t || '');
      if (!(d.working || []).length && !(d.revisit || []).length) {
        box.innerHTML = `Not enough returned assessments yet to spot a pattern. As people complete and you return them, IntelliQ will learn which ones lift performance and which to rethink.`;
        return;
      }
      let h = '';
      if ((d.working || []).length) {
        h += `<div class="card-label" style="color:#0ecfb0;margin-top:0.2rem">Repeat these</div>`;
        h += d.working.map(i => `<div class="me-row" style="display:block;padding:0.5rem 0;border-bottom:1px solid var(--border)">
          <div><strong>${esc(i.title)}</strong>${i.avgScore != null ? ` <span style="font-size:0.72rem;color:var(--text-muted)">· avg ${i.avgScore}</span>` : ''}</div>
          <div class="me-row-text" style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px">${esc(i.why)}</div>
        </div>`).join('');
      }
      if ((d.revisit || []).length) {
        h += `<div class="card-label" style="color:#f7b24f;margin-top:0.7rem">Worth revisiting</div>`;
        h += d.revisit.map(i => `<div class="me-row" style="display:block;padding:0.5rem 0;border-bottom:1px solid var(--border)">
          <div><strong>${esc(i.title)}</strong>${i.avgScore != null ? ` <span style="font-size:0.72rem;color:var(--text-muted)">· avg ${i.avgScore}</span>` : ''}</div>
          <div class="me-row-text" style="font-size:0.82rem;color:var(--text-secondary);margin-top:2px">${esc(i.why)}</div>
        </div>`).join('');
      }
      if (d.note) h += `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem">${esc(d.note)}</div>`;
      box.innerHTML = h;
    } catch (e) {
      box.innerHTML = `<span style="color:var(--text-muted)">Couldn't load outcomes right now.</span>`;
    }
  },

  _assessHtml(d) {
    const esc = t => this._escape(t || '');
    const kind = k => this._assessKindLabel[k] || 'General';
    let html = '';

    // ── Assigned to you ──────────────────────────────────────────────────
    const assigned = d.assigned || [];
    html += `<details class="card collapse-card" open><summary class="card-label">Assigned to you${assigned.length ? ` <span class="collapse-count">${assigned.length}</span>` : ''}</summary>`;
    if (!assigned.length) {
      html += `<div style="color:var(--text-muted);font-size:0.84rem;padding:0.3rem 0">Nothing assigned right now.</div>`;
    } else {
      html += assigned.map(a => {
        const badge = a.status === 'returned'
          ? `<span class="pill" style="background:rgba(14,207,176,0.15);color:#0ecfb0">Returned${a.score != null ? ' · ' + a.score : ''}</span>`
          : a.status === 'submitted'
          ? `<span class="pill" style="background:rgba(124,90,245,0.15);color:var(--accent)">Submitted</span>`
          : `<span class="pill" style="background:rgba(247,178,79,0.15);color:#f7b24f">To do</span>`;
        let body = '';
        if (a.status === 'assigned') {
          const leaderFirst = esc((a.assignerName || 'Your leader').split(' ')[0]);
          const firstAsk = (a.fields && a.fields.length) ? esc(a.fields[0].label) : 'How are things going with this?';
          body = `<div style="margin-top:0.6rem">
            <div class="assess-conv" id="assess-chat-${a.id}">
              <div id="assess-chat-log-${a.id}">
                <div class="conv-ai"><strong>IntelliQ</strong>${leaderFirst} asked you to reflect on this — let's just talk it through, no pressure and no wrong answers.${a.description ? ` They said: <em>${esc(a.description)}</em>` : ''} To start: ${firstAsk.endsWith('?') ? firstAsk : firstAsk + '?'}</div>
              </div>
            </div>
            <div style="display:flex;gap:0.4rem;margin:0.5rem 0">
              <input class="form-input" id="assess-chat-in-${a.id}" placeholder="Type your reply…" style="flex:1;margin:0" onkeydown="if(event.key==='Enter')MemberApp._assessDiscussSend('${a.id}', this.nextElementSibling)">
              <button class="btn-primary btn-sm" onclick="MemberApp._assessDiscussSend('${a.id}', this)">Send</button>
            </div>
            <details style="margin-bottom:0.5rem">
              <summary style="cursor:pointer;font-size:0.78rem;color:var(--text-muted)">Prefer to just write? Fill it in directly</summary>
              <div style="margin-top:0.5rem">
                ${(a.fields && a.fields.length ? a.fields : [{ label: 'Your response', hint: '' }]).map((f) => `
                  <div style="margin-bottom:0.5rem">
                    <div class="card-label" style="margin-bottom:2px">${esc(f.label)}</div>
                    ${f.hint ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:3px">${esc(f.hint)}</div>` : ''}
                    <textarea class="note-input" data-field="${esc(f.label)}" style="min-height:60px"></textarea>
                  </div>`).join('')}
              </div>
            </details>
            <button class="btn-primary" onclick="MemberApp._assessSubmit('${a.id}', this)">Send to ${leaderFirst}</button>
          </div>`;
        } else if (a.status === 'submitted') {
          body = `<div style="margin-top:0.5rem;font-size:0.82rem;color:var(--text-muted)">Waiting for review from ${esc(a.assignerName)}.</div>`;
        } else if (a.status === 'returned') {
          body = `<div style="margin-top:0.5rem">
            ${a.feedback ? `<div class="me-row-text" style="font-size:0.86rem"><strong>${esc(a.assignerName)}:</strong> ${esc(a.feedback)}</div>` : ''}
            ${a.score != null ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:3px">Score: ${a.score}/100</div>` : ''}
          </div>`;
        }
        return `<div class="me-row" style="display:block;padding:0.7rem 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div style="flex:1"><strong>${esc(a.title)}</strong> <span style="font-size:0.72rem;color:var(--text-muted)">· ${kind(a.kind)}</span></div>
            ${badge}
          </div>${body}</div>`;
      }).join('');
    }
    html += `</details>`;

    // ── Leader tools: create a template, assign, review returns ──────────
    if (d.canCreate) {
      html += `<div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="card-label" style="margin:0">Create an assessment</div>
          <button class="btn-ghost" onclick="MemberApp._assessToggleCreate()">＋ New</button>
        </div>
        <div id="assess-create" style="display:none;margin-top:0.7rem">
          <div style="padding:0.6rem 0.7rem;border:1px dashed var(--accent);border-radius:8px;margin-bottom:0.7rem;background:rgba(124,90,245,0.05)">
            <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.5rem">Think it through with IntelliQ. It reasons over your team's history — strengths, what people have struggled with, who's stretched — and will push back if an idea doesn't fit the data. When you agree on something, it drops it into the form below.</div>
            <div id="assess-plan-out" style="max-height:280px;overflow:auto;margin-bottom:0.5rem"></div>
            <div style="display:flex;gap:0.4rem">
              <input class="form-input" id="assess-goal" placeholder="What are you trying to set up? Or challenge my thinking…" style="flex:1;margin:0" onkeydown="if(event.key==='Enter')MemberApp._assessPlan(this.nextElementSibling)">
              <button class="btn-primary btn-sm" onclick="MemberApp._assessPlan(this)">Send</button>
            </div>
            <span id="assess-draft-status" style="font-size:0.74rem;color:var(--text-muted)"></span>
          </div>
          <input class="form-input" id="assess-title" placeholder="Title" style="margin-bottom:0.5rem">
          <select class="form-input" id="assess-kind" style="margin-bottom:0.5rem">
            <option value="general">General</option>
            <option value="spreadsheet">Data / spreadsheet</option>
            <option value="film">Video / recording</option>
            <option value="play">Approach / method</option>
            <option value="skill">Skill</option>
          </select>
          <textarea class="note-input" id="assess-desc" placeholder="Short instructions the person sees." style="min-height:52px;margin-bottom:0.5rem"></textarea>
          <textarea class="note-input" id="assess-guidance" placeholder="Teach IntelliQ how you want it done — your method, standard, or the way you'd coach it. IntelliQ tutors the person from this and grades against it, so you don't have to explain it every time." style="min-height:70px;margin-bottom:0.5rem"></textarea>
          <textarea class="note-input" id="assess-fields" placeholder="Things for the person to cover — one per line (optional)." style="min-height:52px;margin-bottom:0.5rem"></textarea>
          <button class="btn-primary" onclick="MemberApp._assessCreate(this)">Create</button>
        </div>
      </div>`;

      // Existing templates → assign, each with its evidence label + playbook stage.
      const tpls = d.templates || [];
      if (tpls.length) {
        const EVID = {
          'Works consistently': '#0ecfb0', 'Works sometimes': 'var(--accent)',
          'Needs redesign': '#f7b24f', 'Not enough data yet': 'var(--text-muted)',
        };
        const evidenceBadge = t => t.evidence ? `<span class="pill" style="background:${(EVID[t.evidence]||'var(--text-muted)')}22;color:${EVID[t.evidence]||'var(--text-muted)'}">${esc(t.evidence)}</span>` : '';
        const stageTag = t => t.stage === 'experimental'
          ? `<span class="pill" style="background:rgba(124,90,245,0.12);color:var(--accent)">Experimental</span>`
          : t.stage === 'archived' ? `<span class="pill" style="background:rgba(127,127,127,0.15);color:var(--text-muted)">Archived</span>` : '';
        const row = t => {
          const meta = [];
          if (t.avgOutcome != null) meta.push(`${t.avgOutcome} avg outcome`);
          if (t.uses) meta.push(`used ${t.uses}×`);
          meta.push(t.lastUsed ? `last used ${this._ago(t.lastUsed)}` : 'never used');
          const archived = t.stage === 'archived';
          return `<div class="me-row" style="display:flex;align-items:center;gap:0.5rem;padding:0.55rem 0;border-bottom:1px solid var(--border);${archived ? 'opacity:0.65' : ''}">
            <div style="flex:1;min-width:0">
              <div><strong>${esc(t.title)}</strong> <span style="font-size:0.72rem;color:var(--text-muted)">· ${kind(t.kind)}</span> ${evidenceBadge(t)} ${stageTag(t)}</div>
              <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">${meta.join(' · ')}</div>
            </div>
            ${archived ? '' : `<button class="btn-ghost" onclick="MemberApp._assessOpenAssign('${t.id}')">Assign</button>`}
            <select class="assess-stage" title="Playbook stage" onchange="MemberApp._assessSetStage('${t.id}', this.value)">
              <option value="active"${t.stage !== 'experimental' && t.stage !== 'archived' ? ' selected' : ''}>Active</option>
              <option value="experimental"${t.stage === 'experimental' ? ' selected' : ''}>Experimental</option>
              <option value="archived"${t.stage === 'archived' ? ' selected' : ''}>Archive</option>
            </select>
          </div>`;
        };
        const live = tpls.filter(t => t.stage !== 'archived');
        const archived = tpls.filter(t => t.stage === 'archived');
        html += `<details class="card collapse-card" open><summary class="card-label">Your playbook — assign, and curate what works <span class="collapse-count">${live.length}</span></summary>` +
          (live.length ? live.map(row).join('') : `<div style="color:var(--text-muted);font-size:0.84rem;padding:0.3rem 0">Nothing active yet.</div>`) +
          (archived.length ? `<details style="margin-top:0.5rem"><summary style="cursor:pointer;font-size:0.78rem;color:var(--text-muted)">Archived (${archived.length})</summary>${archived.map(row).join('')}</details>` : '') +
          `<div id="assess-assign-panel" style="display:none;margin-top:0.7rem"></div></details>`;
      }

      // Returns to review
      const toReview = (d.issued || []).filter(a => a.status === 'submitted');
      const reviewed = (d.issued || []).filter(a => a.status !== 'submitted');
      html += `<details class="card collapse-card"${toReview.length ? ' open' : ''}><summary class="card-label">To review${toReview.length ? ` <span class="collapse-count">${toReview.length}</span>` : ''}</summary>`;
      if (!toReview.length) html += `<div style="color:var(--text-muted);font-size:0.84rem;padding:0.3rem 0">Nothing waiting.</div>`;
      else html += toReview.map(a => `<div class="me-row" style="display:block;padding:0.7rem 0;border-bottom:1px solid var(--border)">
        <div><strong>${esc(a.assigneeName)}</strong> — ${esc(a.title)}</div>
        ${Object.entries(a.response || {}).map(([k, v]) => `<div style="margin-top:0.4rem"><div class="card-label" style="margin-bottom:1px">${esc(k)}</div><div class="me-row-text" style="font-size:0.84rem">${esc(v)}</div></div>`).join('')}
        ${a.note ? `<div class="me-row-text" style="font-size:0.84rem;margin-top:0.3rem">${esc(a.note)}</div>` : ''}
        <button class="btn-ghost" style="font-size:0.74rem;margin-top:0.4rem" onclick="MemberApp._assessSummarize('${a.id}', this)">IntelliQ: suggest a score &amp; summary</button>
        <div id="assess-sum-${a.id}" style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.3rem"></div>
        <div style="margin-top:0.5rem;display:flex;gap:0.4rem;align-items:center">
          <input class="form-input" data-return-fb="${a.id}" placeholder="Feedback" style="flex:1;margin:0">
          <input class="form-input" data-return-score="${a.id}" placeholder="Score" type="number" min="0" max="100" style="width:80px;margin:0">
          <button class="btn-primary" onclick="MemberApp._assessReturn('${a.id}', this)">Return</button>
        </div></div>`).join('');
      const returnedList = reviewed.filter(a => a.status === 'returned');
      if (returnedList.length) {
        html += `<div class="card-label" style="margin-top:0.8rem">Returned — open to see their answers</div>`;
        html += returnedList.map(a => `<details class="me-row" style="display:block;padding:0.5rem 0;border-bottom:1px solid var(--border)">
          <summary style="cursor:pointer;font-size:0.86rem"><strong>${esc(a.assigneeName)}</strong> — ${esc(a.title)}${a.score != null ? ` <span style="color:var(--text-muted)">· ${a.score}/100</span>` : ''}</summary>
          ${Object.entries(a.response || {}).map(([k, v]) => `<div style="margin-top:0.4rem"><div class="card-label" style="margin-bottom:1px">${esc(k)}</div><div class="me-row-text" style="font-size:0.84rem">${esc(v)}</div></div>`).join('') || '<div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.3rem">No written answers.</div>'}
          ${a.feedback ? `<div class="me-row-text" style="font-size:0.82rem;margin-top:0.4rem"><strong>Your feedback:</strong> ${esc(a.feedback)}</div>` : ''}
        </details>`).join('');
      }
      html += `</details>`;

      // ── What's working / worth revisiting — the assessment-learning loop ──
      html += `<details class="card collapse-card" id="assess-learning-card">
        <summary class="card-label">What's working — from real outcomes</summary>
        <div id="assess-learning" style="color:var(--text-muted);font-size:0.84rem;padding:0.3rem 0">Checking which assessments line up with people improving…</div>
      </details>`;
    }

    // ── Tutorials (pinned how-to's) ──────────────────────────────────────
    const tuts = d.tutorials || [];
    html += `<details class="card collapse-card"${tuts.length ? '' : ' open'}><summary class="card-label">Pinned how-to's${tuts.length ? ` <span class="collapse-count">${tuts.length}</span>` : ''}</summary>`;
    if (d.canCreate) html += `<button class="btn-ghost" onclick="MemberApp._tutorialToggle()" style="margin-bottom:0.4rem">＋ Pin a how-to</button>`;
    if (d.canCreate) html += `<div id="tutorial-create" style="display:none;margin-top:0.7rem">
      <input class="form-input" id="tutorial-title" placeholder="Title — e.g. How we do this properly" style="margin-bottom:0.5rem">
      <textarea class="note-input" id="tutorial-body" placeholder="The steps someone can refer back to." style="min-height:70px;margin-bottom:0.5rem"></textarea>
      <input class="form-input" id="tutorial-url" placeholder="Link (optional)" style="margin-bottom:0.5rem">
      <button class="btn-primary" onclick="MemberApp._tutorialPin(this)">Pin it</button></div>`;
    if (!tuts.length) html += `<div style="color:var(--text-muted);font-size:0.84rem;padding:0.3rem 0;margin-top:0.4rem">No how-to's pinned yet.</div>`;
    else html += tuts.map(t => `<details class="me-row" style="display:block;padding:0.6rem 0;border-bottom:1px solid var(--border)">
      <summary style="cursor:pointer;font-weight:600">${esc(t.title)} <span style="font-size:0.72rem;color:var(--text-muted);font-weight:400">· ${kind(t.kind)}</span></summary>
      ${t.body ? `<div class="me-row-text" style="font-size:0.85rem;margin-top:0.4rem;white-space:pre-wrap">${esc(t.body)}</div>` : ''}
      ${t.url ? `<div style="margin-top:0.3rem"><a href="${esc(t.url)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:0.82rem">Open link ↗</a></div>` : ''}
      ${d.canCreate ? `<button class="btn-ghost" onclick="MemberApp._tutorialDelete('${t.id}')" style="font-size:0.72rem;color:var(--text-muted);margin-top:0.3rem">Remove</button>` : ''}
    </details>`).join('');
    html += `</details>`;
    return html;
  },

  _assessToggleCreate() { const el = document.getElementById('assess-create'); if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'; },
  _tutorialToggle()     { const el = document.getElementById('tutorial-create'); if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none'; },

  async _assessCreate(btn) {
    const title = (document.getElementById('assess-title')?.value || '').trim();
    if (!title) { this.showToast('Give it a title', 'warning'); return; }
    const kind = document.getElementById('assess-kind')?.value || 'general';
    const description = (document.getElementById('assess-desc')?.value || '').trim();
    const guidance = (document.getElementById('assess-guidance')?.value || '').trim();
    const fields = (document.getElementById('assess-fields')?.value || '').split('\n').map(s => s.trim()).filter(Boolean).map(label => ({ label, hint: '' }));
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
      const res = await fetch('/api/assessments/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ title, kind, description, guidance, fields }) });
      if (!res.ok) throw new Error();
      this.showToast('Assessment created ', 'success');
      this._renderAssessments();
    } catch (e) { this.showToast('Could not create', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Create'; } }
  },

  /* The planning agent — reasons over the whole team's history and the goal, then
     returns insight + a plan + who-does-what + a sensible order, and fills the
     builder. IntelliQ does the reasoning; the leader edits and creates. */
  /* The builder as a reasoning PARTNER — a back-and-forth where IntelliQ grounds
     its suggestions in the team's data and pushes back when your idea conflicts
     with it. When you converge on something concrete it offers "Use this plan". */
  _planChat: [],
  async _assessPlan(btn) {
    const input = document.getElementById('assess-goal');
    const status = document.getElementById('assess-draft-status');
    const out = document.getElementById('assess-plan-out');
    const msg = (input?.value || '').trim();
    if (!msg) { this.showToast('Say what you have in mind', 'warning'); return; }
    const esc = t => this._escape(t || '');
    this._planChat = this._planChat || [];
    if (out) out.innerHTML = (out.innerHTML || '') + `<div style="margin:0.5rem 0"><strong>You:</strong> ${esc(msg)}</div>`;
    this._planChat.push({ role: 'user', content: msg });
    if (input) input.value = '';
    if (btn) { btn.disabled = true; btn.textContent = 'Thinking…'; }
    if (status) status.textContent = '';
    if (out) { out.innerHTML += `<div id="plan-pending" style="color:var(--text-muted);margin:0.2rem 0">IntelliQ is reading your team's history…</div>`; out.scrollTop = out.scrollHeight; }
    try {
      const res = await fetch('/api/assessments/plan/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ message: msg, history: this._planChat.slice(0, -1) }) });
      const d = await res.json();
      document.getElementById('plan-pending')?.remove();
      if (!res.ok || !d.ok) throw new Error(d.error || 'failed');
      this._planChat.push({ role: 'assistant', content: d.reply });
      let html = `<div style="margin:0.5rem 0;color:var(--text-secondary);line-height:1.55"><strong style="color:var(--accent)">IntelliQ:</strong> ${esc(d.reply)}</div>`;
      if (d.plan && d.plan.title) {
        this._planDraft = d.plan;
        html += `<div style="border:1px dashed var(--accent);border-radius:8px;padding:0.5rem 0.6rem;margin:0.3rem 0">
          <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.3rem">Proposed: <strong>${esc(d.plan.title)}</strong></div>
          <button class="btn-primary btn-sm" onclick="MemberApp._assessUsePlan()">Use this plan</button>
        </div>`;
      }
      if (out) { out.innerHTML += html; out.scrollTop = out.scrollHeight; }
    } catch (e) {
      document.getElementById('plan-pending')?.remove();
      if (out) out.innerHTML += `<div style="color:var(--danger);margin:0.3rem 0">Couldn't reach IntelliQ just now.</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
    }
  },

  _assessUsePlan() {
    const p = this._planDraft || {};
    const setV = (id, v) => { const el = document.getElementById(id); if (el != null && v != null) el.value = v; };
    setV('assess-title', p.title);
    setV('assess-kind', p.kind);
    setV('assess-desc', p.description);
    setV('assess-fields', (p.fields || []).map(f => f.label).join('\n'));
    this.showToast('Filled in — edit anything, then Create', 'success');
  },

  async _assessDeleteTemplate(id) {
    if (!confirm('Delete this assessment?')) return;
    try { await fetch('/api/assessments/templates/' + id, { method: 'DELETE', headers: this._authHeaders() }); this._renderAssessments(); } catch (e) {}
  },

  // Curate the playbook — move a template between Active / Experimental / Archived.
  async _assessSetStage(id, stage) {
    try {
      await fetch('/api/assessments/templates/' + id + '/stage', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
        body: JSON.stringify({ stage }),
      });
      this._renderAssessments();
    } catch (e) {}
  },

  async _assessOpenAssign(templateId) {
    const panel = document.getElementById('assess-assign-panel');
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">Loading people…</div>`;
    try {
      const res = await fetch('/api/workspace/visible-members', { headers: this._authHeaders() });
      const d = await res.json();
      const people = (d.members || []).filter(m => m.userId !== this._userId);
      if (!people.length) { panel.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem">No one in your range to assign to.</div>`; return; }
      panel.innerHTML = `<div class="card-label">Assign to</div>
        <div style="max-height:180px;overflow:auto;margin-bottom:0.5rem">${people.map(p => `<label style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0;font-size:0.85rem"><input type="checkbox" value="${p.userId}" class="assess-assignee"> ${this._escape(p.name)}</label>`).join('')}</div>
        <button class="btn-primary" onclick="MemberApp._assessDoAssign('${templateId}', this)">Assign</button>`;
    } catch (e) { panel.innerHTML = `<div style="color:var(--text-muted)">Could not load people.</div>`; }
  },

  async _assessDoAssign(templateId, btn) {
    const ids = Array.from(document.querySelectorAll('.assess-assignee:checked')).map(c => c.value);
    if (!ids.length) { this.showToast('Pick at least one person', 'warning'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Assigning…'; }
    try {
      const res = await fetch('/api/assessments/assign', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ templateId, assigneeIds: ids }) });
      if (!res.ok) throw new Error();
      this.showToast(`Assigned to ${ids.length} `, 'success');
      this._renderAssessments();
    } catch (e) { this.showToast('Could not assign', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Assign'; } }
  },

  async _assessSubmit(id, btn) {
    const row = btn.closest('.me-row');
    const response = {};
    row.querySelectorAll('textarea[data-field]').forEach(t => { if (t.value.trim()) response[t.dataset.field] = t.value.trim(); });
    // The conversation IS the reflection — capture it so the leader sees the reasoning.
    const chat = (this._assessChat[id] || []).filter(m => m.role === 'user');
    if (chat.length) response['In their words (from the conversation)'] = chat.map(m => m.content).join('\n\n');
    if (!Object.keys(response).length) { this.showToast('Say something to IntelliQ or fill it in first', 'warning'); return; }
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      const res = await fetch(`/api/assessments/${id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ response }) });
      if (!res.ok) throw new Error();
      this.showToast('Sent', 'success');
      this._renderAssessments();
    } catch (e) { this.showToast('Could not send', 'error'); if (btn) { btn.disabled = false; btn.textContent = orig; } }
  },

  /* The assignment as a full conversation — IntelliQ knows what the leader set and
     guides the person through it, warmly, one thing at a time. The transcript
     becomes their reflection on submit. */
  _assessChat: {},
  async _assessDiscussSend(id, btn) {
    const input = document.getElementById('assess-chat-in-' + id);
    const log = document.getElementById('assess-chat-log-' + id);
    const msg = (input?.value || '').trim();
    if (!msg || !log) return;
    const esc = t => this._escape(t || '');
    this._assessChat[id] = this._assessChat[id] || [];
    log.innerHTML += `<div class="conv-you">${esc(msg)}</div>`;
    this._assessChat[id].push({ role: 'user', content: msg });
    if (input) input.value = '';
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    log.innerHTML += `<div id="assess-chat-pending-${id}" class="conv-ai" style="opacity:0.6">IntelliQ is thinking…</div>`;
    log.scrollTop = log.scrollHeight;
    try {
      const res = await fetch(`/api/assessments/${id}/discuss`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ message: msg, history: this._assessChat[id].slice(0, -1) }) });
      const d = await res.json();
      document.getElementById('assess-chat-pending-' + id)?.remove();
      if (!res.ok || !d.ok) throw new Error();
      log.innerHTML += `<div class="conv-ai"><strong>IntelliQ</strong>${esc(d.reply)}</div>`;
      this._assessChat[id].push({ role: 'assistant', content: d.reply });
    } catch (e) {
      document.getElementById('assess-chat-pending-' + id)?.remove();
      log.innerHTML += `<div style="color:var(--danger);margin:0.3rem 0">Couldn't reach IntelliQ just now.</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
      log.scrollTop = log.scrollHeight;
    }
  },

  async _assessReturn(id, btn) {
    const feedback = (document.querySelector(`[data-return-fb="${id}"]`)?.value || '').trim();
    const scoreRaw = document.querySelector(`[data-return-score="${id}"]`)?.value;
    const score = scoreRaw === '' || scoreRaw == null ? null : Number(scoreRaw);
    if (btn) { btn.disabled = true; btn.textContent = 'Returning…'; }
    try {
      const res = await fetch(`/api/assessments/${id}/return`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ feedback, score }) });
      if (!res.ok) throw new Error();
      this.showToast('Sent back ', 'success');
      this._renderAssessments();
    } catch (e) { this.showToast('Could not return', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Return'; } }
  },

  /* IntelliQ reads the responses, grades them against how the leader wanted it done,
     and pre-fills a suggested summary + score. The leader edits before returning;
     the raw answers stay published above. */
  async _assessSummarize(id, btn) {
    const box = document.getElementById('assess-sum-' + id);
    if (btn) { btn.disabled = true; btn.textContent = 'Reading the responses…'; }
    try {
      const res = await fetch(`/api/assessments/${id}/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() } });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'failed');
      const esc = t => this._escape(t || '');
      const fb = document.querySelector(`[data-return-fb="${id}"]`);
      const sc = document.querySelector(`[data-return-score="${id}"]`);
      if (fb && !fb.value) fb.value = d.summary || '';
      if (sc && d.score != null) sc.value = d.score;
      let extra = '';
      if ((d.strengths || []).length) extra += `<div><strong>Strengths:</strong> ${esc(d.strengths.join(', '))}</div>`;
      if ((d.development || []).length) extra += `<div><strong>To develop:</strong> ${esc(d.development.join(', '))}</div>`;
      if (box) box.innerHTML = `<div style="padding:0.4rem 0.5rem;border-left:2px solid var(--accent)">${esc(d.summary)}${d.score != null ? ` <em>(suggested ${d.score}/100)</em>` : ''}${extra}</div><div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">Suggested — edit the feedback and score before returning.</div>`;
    } catch (e) {
      if (box) box.innerHTML = `<div style="color:var(--text-muted);font-size:0.78rem">Couldn't summarise${' '}${'—'} you can still write your own.</div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'IntelliQ: suggest a score & summary'; }
    }
  },

  async _tutorialPin(btn) {
    const title = (document.getElementById('tutorial-title')?.value || '').trim();
    if (!title) { this.showToast('Give it a title', 'warning'); return; }
    const body = (document.getElementById('tutorial-body')?.value || '').trim();
    const url  = (document.getElementById('tutorial-url')?.value || '').trim();
    if (btn) { btn.disabled = true; btn.textContent = 'Pinning…'; }
    try {
      const res = await fetch('/api/tutorials', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ title, body, url }) });
      if (!res.ok) throw new Error();
      this.showToast('Pinned ', 'success');
      this._renderAssessments();
    } catch (e) { this.showToast('Could not pin', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Pin it'; } }
  },

  async _tutorialDelete(id) {
    if (!confirm('Remove this how-to?')) return;
    try { await fetch('/api/tutorials/' + id, { method: 'DELETE', headers: this._authHeaders() }); this._renderAssessments(); } catch (e) {}
  },

  /* ══════════════════════════════════════════════════════════════════════
     APPS — connect your OWN external apps (calendar / health / fitness) so
     IntelliQ can use them. Consent-based and self-scoped: you only ever connect
     your own data, and disconnecting withdraws consent and stops any drawing.
     One click = grant consent + connect (the two real backend steps). Live OAuth
     auto-sync is the provider integration point; the consent + mapping are real.
     Backed by /api/me/sources · /api/me/consent · /api/me/connect.
     ══════════════════════════════════════════════════════════════════════ */
  _appIcon: { calendar: '', email: '', health: '', fitness: '' },

  async _renderApps() {
    const root = document.getElementById('apps-root');
    if (!root) return;
    const esc = t => this._escape(t || '');
    root.innerHTML = `<div class="empty-hint" style="padding:1rem;color:var(--text-muted)">Loading…</div>`;
    let res, d;
    try {
      res = await fetch('/api/me/sources', { headers: this._authHeaders() });
      d = await res.json();
    } catch (e) {
      root.innerHTML = `<div class="card"><div style="color:var(--text-muted);font-size:0.85rem">Couldn't reach the server. <button class="btn-ghost" onclick="MemberApp._renderApps()">Try again</button></div></div>`;
      return;
    }
    if (!res.ok || !d || !d.ok) {
      root.innerHTML = `<div class="card"><div style="color:var(--text-muted);font-size:0.85rem">Couldn't load your apps${res && res.status === 401 ? ' — your session may have expired. Log in again.' : '.'} <button class="btn-ghost" onclick="MemberApp._renderApps()">Try again</button></div></div>`;
      return;
    }
    {
      const sources = d.sources || [];
      const row = s => {
        const connected = !!s.connected;
        const assist = s.assist;
        return `<div class="me-row" style="display:block;padding:0.8rem 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:flex-start;gap:0.7rem">
            <div style="flex:1">
              <div style="font-weight:700">${esc(s.label)} ${connected ? '<span class="pill" style="background:rgba(14,207,176,0.15);color:#0ecfb0;margin-left:4px">Connected</span>' : ''}</div>
              <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">${esc(s.describes)}</div>
            </div>
            ${connected
              ? `<button class="btn-ghost" onclick="MemberApp._appDisconnect('${s.id}','${esc(s.scope)}', this)">Disconnect</button>`
              : `<button class="btn-primary" onclick="MemberApp._appConnect('${s.id}','${esc(s.scope)}', this)">Connect</button>`}
          </div>
          ${connected && assist ? `
            <div style="margin-top:0.55rem;padding:0.55rem 0.7rem;border:1px dashed var(--border);border-radius:8px;display:flex;align-items:flex-start;gap:0.6rem">
              <div style="flex:1;font-size:0.78rem;color:var(--text-secondary)">
                <strong>Assistant</strong> ${s.assistConsented ? '<span class="pill" style="background:rgba(124,90,245,0.15);color:var(--accent);margin-left:2px">on</span>' : ''}<br>${esc(assist.describes)}
              </div>
              ${s.assistConsented
                ? `<button class="btn-ghost" onclick="MemberApp._appAssist('${s.id}','${esc(assist.scope)}', false, this)">Turn off</button>`
                : `<button class="btn-ghost" onclick="MemberApp._appAssist('${s.id}','${esc(assist.scope)}', true, this)">Allow</button>`}
            </div>` : ''}
          ${connected && s.contribute ? `
            <div style="margin-top:0.5rem;padding:0.55rem 0.7rem;border:1px dashed var(--border);border-radius:8px">
              <div style="display:flex;align-items:flex-start;gap:0.6rem">
                <div style="flex:1;font-size:0.78rem;color:var(--text-secondary)">
                  <strong>Contribute to my record</strong> ${s.contributeConsented ? '<span class="pill" style="background:rgba(14,207,176,0.15);color:#0ecfb0;margin-left:2px">on</span>' : ''}<br>${esc(s.contribute.describes)}
                </div>
                ${s.contributeConsented
                  ? `<button class="btn-ghost" onclick="MemberApp._appContribute('${s.id}','${esc(s.contribute.scope)}', false, this)">Turn off</button>`
                  : `<button class="btn-ghost" onclick="MemberApp._appContribute('${s.id}','${esc(s.contribute.scope)}', true, this)">Allow</button>`}
              </div>
              ${s.contributeConsented ? `<button class="btn-ghost" style="font-size:0.72rem;margin-top:0.4rem" onclick="MemberApp._appSeeCrossed(this)">See exactly what's crossed</button><div class="me-crossed" style="display:none;margin-top:0.4rem"></div>` : ''}
            </div>` : ''}
        </div>`;
      };
      // Group by category so different kinds of app read clearly (and so an
      // industry can add its own group without any UI change).
      const cats = {};
      sources.forEach(s => { (cats[s.category || 'Other'] = cats[s.category || 'Other'] || []).push(s); });
      let html = '';
      if (!sources.length) {
        html += `<div class="card"><div class="card-label">Your apps</div><div style="color:var(--text-muted);font-size:0.84rem;padding:0.3rem 0">No apps available to connect yet. <button class="btn-ghost" onclick="MemberApp._renderApps()">Refresh</button></div></div>`;
      }
      Object.keys(cats).forEach(cat => {
        html += `<div class="card"><div class="card-label">${esc(cat)}</div>${cats[cat].map(row).join('')}</div>`;
      });
      html += `
        <div class="card" style="margin-top:0.2rem">
          <div class="card-label">How this works — three layers, three permissions you control</div>
          <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.6">
            <strong>Insight</strong> reads <strong>only numbers</strong> — how busy your days are, activity
            levels. It never includes your messages, titles, or locations.<br><br>
            <strong>Assistant</strong>, if you allow it, reads fuller detail (times, titles, locations) so it
            can act <em>for you</em> — schedule a meeting, prepare you for one, draft a message you approve.
            This stays <strong>private to you and is never shown to your team</strong>.<br><br>
            <strong>Contribute</strong>, if you allow it, turns what the assistant sees into <strong>numbers
            only</strong> for your growth record — combined with how you feel, so IntelliQ understands you
            better. The raw detail never crosses; only numbers do, you can see <em>exactly</em> what crossed,
            and your team only ever sees aggregate patterns — never your content.<br><br>
            Each is a separate switch; turning one off stops it immediately. Different teams use different
            apps — this list can be extended for your organisation.
          </div>
        </div>`;
      root.innerHTML = html;
      if (typeof hydrateIcons === 'function') hydrateIcons(root);
    }
  },

  /* Grant/revoke the CONTRIBUTE tier — the distillation membrane. Separate consent;
     only numbers ever cross, and the person can see exactly what did. */
  async _appContribute(source, scope, grant, btn) {
    if (btn) { btn.disabled = true; btn.textContent = grant ? 'Allowing…' : 'Turning off…'; }
    try {
      const r = await fetch('/api/me/consent', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ scope, granted: grant }) });
      if (!r.ok) throw new Error();
      this.showToast(grant ? 'Contribute allowed ' : 'Contribute turned off', 'success');
      this._renderApps();
    } catch (e) {
      this.showToast('Could not update', 'error');
      if (btn) { btn.disabled = false; btn.textContent = grant ? 'Allow' : 'Turn off'; }
    }
  },

  /* The visible audit — exactly the numbers the Contribute tier moved into the
     record (never any content). Transparency is what makes it consent, not surveillance. */
  async _appSeeCrossed(btn) {
    const box = btn.parentElement.querySelector('.me-crossed');
    if (!box) return;
    if (box.style.display === 'block') { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.innerHTML = `<div style="color:var(--text-muted);font-size:0.74rem">Loading…</div>`;
    try {
      const r = await fetch('/api/me/contributions', { headers: this._authHeaders() });
      const d = await r.json();
      const rows = d.contributions || [];
      if (!rows.length) { box.innerHTML = `<div style="color:var(--text-muted);font-size:0.74rem">Nothing has crossed yet — numbers appear here the moment they do.</div>`; return; }
      box.innerHTML = rows.slice(0, 20).map(x => {
        const when = x.ts ? new Date(x.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
        return `<div style="font-size:0.74rem;color:var(--text-secondary);padding:2px 0">${this._escape(x.label || x.connector || 'number')}: <strong>${this._escape(String(x.valueNum))}</strong>${when ? ' · ' + when : ''}</div>`;
      }).join('') + `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:3px">Numbers only — never any content.</div>`;
    } catch (e) {
      box.innerHTML = `<div style="color:var(--danger);font-size:0.74rem">Couldn't load.</div>`;
    }
  },

  /* Grant/revoke the ASSISTANT tier for a connector — a separate consent that lets
     IntelliQ use fuller detail to act for the person (never surfaced to the org). */
  async _appAssist(source, scope, grant, btn) {
    if (btn) { btn.disabled = true; btn.textContent = grant ? 'Allowing…' : 'Turning off…'; }
    try {
      const r = await fetch('/api/me/consent', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ scope, granted: grant }) });
      if (!r.ok) throw new Error();
      this.showToast(grant ? 'Assistant allowed ' : 'Assistant turned off', 'success');
      this._renderApps();
    } catch (e) {
      this.showToast('Could not update', 'error');
      if (btn) { btn.disabled = false; btn.textContent = grant ? 'Allow' : 'Turn off'; }
    }
  },

  async _appConnect(source, scope, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
    try {
      // Step 1 — record consent for this scope (informed + revocable).
      const c = await fetch('/api/me/consent', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ scope, granted: true }) });
      if (!c.ok) throw new Error();
      // Step 2 — connect the source (now allowed).
      const r = await fetch('/api/me/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ source }) });
      if (!r.ok) throw new Error();
      this.showToast('Connected — you can disconnect any time', 'success');
      this._renderApps();
    } catch (e) {
      this.showToast('Could not connect', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
    }
  },

  async _appDisconnect(source, scope, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Disconnecting…'; }
    try {
      // Withdraw consent (this also disconnects the source server-side)…
      await fetch('/api/me/consent', { method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() }, body: JSON.stringify({ scope, granted: false }) });
      // …and remove the connection explicitly for good measure.
      await fetch('/api/me/connect/' + encodeURIComponent(source), { method: 'DELETE', headers: this._authHeaders() });
      this.showToast('Disconnected — no more data is drawn', 'success');
      this._renderApps();
    } catch (e) {
      this.showToast('Could not disconnect', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Disconnect'; }
    }
  },

  // Separate group-selector population helpers so each page only populates its own selectors
  _populateMsgGroupSelector() {
    const opts = this._myGroups.length
      ? this._myGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')
      : `<option value="">You're not in any groups yet</option>`;
    const msgGrp = document.getElementById('msg-to-group');
    if (msgGrp) msgGrp.innerHTML = `<option value="">— Select group —</option>` + opts;
  },

  _populateNoteGroupSelector() {
    const opts = this._myGroups.length
      ? this._myGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')
      : `<option value="">You're not in any groups yet</option>`;
    const noteGrp = document.getElementById('note-group-id');
    if (noteGrp) noteGrp.innerHTML = `<option value="">— Select group —</option>` + opts;
  },

  // Legacy switchInboxTab stub — Notes are now on their own page.
  // Kept so any stale onclick="MemberApp.switchInboxTab(...)" doesn't throw.
  switchInboxTab(sub) {
    if (sub === 'notes') navigate('notes');
  },

  // Legacy — called in a few places before the Notes/Inbox split.
  // Now delegates to the two separate helpers.
  _populateGroupSelectors() {
    this._populateNoteGroupSelector();
    this._populateMsgGroupSelector();
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

    const btn = document.getElementById('notes-submit-btn');
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
      if (!res.ok) throw new Error('save failed (' + res.status + ')');
      const data = await res.json();

      // Attach any composer files as signals about the author (so the AI uses them).
      if (typeof IQComposer !== 'undefined') {
        const atts = IQComposer.takeAttachments('note-content');
        for (const a of atts) {
          try {
            await fetch('/api/signals/ingest', {
              method: 'POST', headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
              body: JSON.stringify({
                subjectType: 'member', subjectId: this._userId,
                source: a.kind === 'xlsx' || a.kind === 'csv' ? 'sheet' : 'document',
                modality: 'file', label: a.name,
                valueText: (a.content || '').slice(0, 4000) || `Attached ${a.name}`,
                sensitivity: this._noteType === 'private' ? 'sensitive' : 'normal',
              }),
            });
          } catch (_) {}
        }
      }

      const noteEl = document.getElementById('note-content');
      if (noteEl) noteEl.value = '';
      this._noteTag = '';
      this.selectNoteTag('');

      if (data.note?.aiResponse) {
        const aiEl  = document.getElementById('note-ai-response');
        const txtEl = document.getElementById('note-ai-text');
        if (aiEl && txtEl) { txtEl.textContent = data.note.aiResponse; aiEl.style.display = 'block'; }
      }
      this.showToast('Note saved ', 'success');
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
      el.innerHTML = `<div class="empty-card"><div class="empty-icon"></div><div>No notes yet. Write your first one above.</div></div>`;
      return;
    }
    if (!notes.length) {
      el.innerHTML = `<div class="empty-card"><div class="empty-icon"></div><div>No ${filter} notes yet.</div></div>`;
      return;
    }

    const typeIcons  = { private:'', shared:'', anonymous:'' };
    const typeColors = { private:'var(--text-muted)', shared:'var(--accent)', anonymous:'var(--warning)' };
    el.innerHTML = notes.map(n => {
      const icon     = typeIcons[n.type]  || '';
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
    this.showToast(anonymous ? 'Sent anonymously ' : 'Sent ', 'success');
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
        el.innerHTML = `<div class="empty-card"><div class="empty-icon"></div><div>Session expired — please log in again.</div></div>`;
        return;
      }
      const data = res.ok ? await res.json() : { messages: [] };
      const msgs = data.messages || [];

      if (!msgs.length) {
        el.innerHTML = `<div class="empty-card"><div class="empty-icon">${ICON.message}</div><div>No messages yet. Messages from your organisation and groups will appear here.</div></div>`;
        return;
      }

      el.innerHTML = msgs.map(m => {
        const isMine = m.fromId === this._userId;
        const label  = m.anonymous ? 'Anonymous' : m.fromName;
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

  // NEUTRALIZED: the client no longer derives a colour or a verdict from a raw score. Numbers
  // render neutrally; the authoritative verdict/label/colour come from the server assessment
  // presentation state (see _loadAssessmentPresentation + verdictStyle).
  _scoreColor(v) {
    return (v === null || v === undefined) ? 'var(--text-muted)' : 'var(--text)';
  },

  _scoreLabel(v) {
    // No threshold verdict. A neutral, non-judgmental placeholder; server verdict is authoritative.
    return { label: (v == null ? 'Score unavailable' : `Score ${v} recorded`), color: 'var(--text)' };
  },

  /* Fetch the SERVER-SUPPLIED assessment presentation state for a member and render its verdict
     into any [data-assessment-verdict] slot. The client maps the bounded verdict enum to a badge
     style via verdictStyle — it never maps a raw score to a judgment. Fallback (no presentation):
     the raw score + scale is shown with "interpretation unavailable", never a client verdict. */
  async _loadAssessmentPresentation(memberId) {
    try {
      const r = await fetch(`/api/assessments/${memberId || this._userId}/presentation`, { headers: this._authHeaders() });
      if (!r.ok) return null;
      const j = await r.json();
      const p = j && j.presentation;
      if (!p) return null;
      document.querySelectorAll('[data-assessment-verdict]').forEach(el => {
        const st = (typeof verdictStyle === 'function') ? verdictStyle(p.verdict) : { color: 'var(--text)', text: p.label };
        el.textContent = p.label || st.text;
        el.style.color = st.color;
        if (p.scoreDisplay) el.setAttribute('title', p.scoreDisplay);
      });
      return p;
    } catch (_) { return null; }
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
    div.innerHTML = `<strong>Important:</strong> What you've shared has been flagged for a trusted adult who cares about your wellbeing. You're not in trouble — someone will follow up with you.`;
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
