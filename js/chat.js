/* ============================================================
   PLATFORM — AI CONVERSATION ASSISTANT
   Real Claude API via /api/chat proxy, with mandated reporter
   flag detection and graceful fallback if server is offline.
   ============================================================ */

const ChatEngine = {
  memberId:       null,
  scenarioResult: null,
  history:        [],   // [{role:'user'|'assistant', content:'...'}]
  memberName:     '',
  _sending:       false,

  open(memberId, scenarioResult) {
    this.memberId       = memberId;
    this.scenarioResult = scenarioResult || null;
    this.history        = [];
    this._sending       = false;

    const m = AppState.getMember(memberId);
    this.memberName = m ? m.name.split(' ')[0] : 'there';

    const chatTitle = document.getElementById('chat-modal-title');
    if (chatTitle) chatTitle.textContent = scenarioResult
      ? `Reflection — ${scenarioResult.title}`
      : 'IntelliQ Check-In';

    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';

    openModal('chat-modal');

    // Opening message: build from context and send as first AI turn
    setTimeout(() => this._sendOpener(m, scenarioResult), 350);
  },

  async _sendOpener(member, result) {
    // Construct a natural opening user-side "prompt" that gives Claude context
    // but present it as the assistant speaking first.
    const openerInstruction = result
      ? `Open the reflection for ${this.memberName} who just completed the "${result.title}" scenario with a score of ${result.score}/100 (${result.label}). Reference their result directly and ask how they're feeling having worked through it. Keep it concise — 2-3 sentences max.`
      : `Start a warm, natural check-in with ${this.memberName}. Ask how they're doing today and how things have been going for them recently. Keep it concise — 1-2 sentences.`;

    this._showTyping();
    const opening = await this._callAPI([
      { role: 'user', content: openerInstruction }
    ], true);
    this._hideTyping();

    if (opening) {
      // Store as assistant message but don't show the instruction in history
      this.history.push({ role: 'assistant', content: opening });
      this.addMessage('ai', opening);
    }
  },

  async sendMessage(text) {
    if (!text.trim() || this._sending) return;
    this._sending = true;

    this.addMessage('user', this._escapeHTML(text));
    document.getElementById('chat-input').value = '';

    // Append to conversation history
    this.history.push({ role: 'user', content: text });

    this._showTyping();

    const response = await this._callAPI(this.history);
    this._hideTyping();
    this._sending = false;

    if (!response) return;

    this.history.push({ role: 'assistant', content: response });
    this.addMessage('ai', response);

    // Persist in member record
    const member = AppState.getMember(this.memberId);
    if (member) {
      if (!member.chatHistory) member.chatHistory = [];
      member.chatHistory.push({ date: new Date().toLocaleDateString('en-GB'), role: 'user', text });
      member.chatHistory.push({ date: new Date().toLocaleDateString('en-GB'), role: 'ai', text: response });
    }
  },

  async _callAPI(messages, isOpener = false) {
    const member = AppState.getMember(this.memberId);

    const body = {
      messages,
      orgMode:   AppState.mode,
      orgName:   AppState.orgName,
      memberName: this.memberName,
    };

    if (this.scenarioResult && isOpener) {
      body.scenarioContext = {
        title:   this.scenarioResult.title,
        score:   this.scenarioResult.score,
        label:   this.scenarioResult.label,
        answers: this.scenarioResult.answers || [],
      };
    }

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Server responded ${res.status}`);

      const data = await res.json();

      if (data.mandated) {
        this._triggerMandatedAlert();
      }

      return data.text || null;

    } catch (err) {
      console.warn('IntelliQ AI unavailable, using fallback:', err.message);
      return this._fallback(messages[messages.length - 1]?.content || '');
    }
  },

  // ── Fallback for when server is offline (demo / no API key) ──────────
  _fallback(lastInput) {
    const input = (lastInput || '').toLowerCase();
    const picks = [
      'That\'s worth reflecting on. What was going through your mind in that moment?',
      'I appreciate you sharing that. How did that make you feel overall?',
      'That\'s a thoughtful response. Is there anything else sitting with you from today?',
      'Interesting — what do you think that says about how you approach these situations?',
    ];
    if (/stress|pressure|anxious|overwhelm/.test(input))
      return 'It sounds like there\'s real pressure on you right now. That\'s worth paying attention to — how long has it felt this way?';
    if (/tired|exhausted|sleep|drained/.test(input))
      return 'Fatigue shapes how we think and decide more than we realise. Is this something that\'s been building up?';
    if (/good|well|great|fine/.test(input))
      return 'Good to hear. What\'s been contributing to that — anything specific going well?';
    return picks[Math.floor(Math.random() * picks.length)];
  },

  _triggerMandatedAlert() {
    const member = AppState.getMember(this.memberId);
    if (!member) return;

    member.alerts      = (member.alerts || 0) + 1;
    member.wellnessScore = Math.max(5, (member.wellnessScore || 50) - 15);

    AppState.alerts.unshift({
      type:     'danger',
      title:    '⚠ Mandated Reporter Alert',
      detail:   `${member.name} used language during an AI check-in that requires immediate follow-up by a trusted adult or counsellor.`,
      time:     'Just now',
      unread:   true,
      member,
      mandated: true,
    });

    AppState.stats = buildEmptyOrgStats(AppState.members.length);
    updateAlertBadge();
    showToast(`Mandated reporter alert raised for ${member.name}`, 'danger');
  },

  addMessage(role, html) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;

    const wrapper = document.createElement('div');
    wrapper.className = `chat-msg chat-msg-${role}`;
    wrapper.innerHTML = `
      <div class="chat-bubble">${html}</div>
      <div class="chat-time">${new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}</div>`;
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  },

  _showTyping() {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg-ai';
    div.id = 'chat-typing-indicator';
    div.innerHTML = `<div class="chat-bubble typing-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  },

  _hideTyping() {
    const t = document.getElementById('chat-typing-indicator');
    if (t) t.remove();
  },

  _escapeHTML(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },
};
