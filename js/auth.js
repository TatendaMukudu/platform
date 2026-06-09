/* ============================================================
   PLATFORM — AUTH & HIERARCHY
   Handles login, org setup, user management, and the
   visual hierarchy tree.
   ============================================================ */

const Auth = {

  /* ── State ─────────────────────────────────────────────── */
  currentUser: null,
  currentOrg:  null,
  token:       null,

  ROLE_LABELS: {
    superadmin: 'Super Admin',
    admin:      'Admin',
    coach:      'Coach / Staff',
    member:     'Member',
  },
  ROLE_ICONS: {
    superadmin: '🔑',
    admin:      '📋',
    coach:      '👟',
    member:     '🔵',
  },
  ROLE_ORDER: { superadmin:1, admin:2, coach:3, member:4 },

  /* ── Boot ──────────────────────────────────────────────── */
  init() {
    const saved = localStorage.getItem('iq_auth');
    if (saved) {
      try {
        const { user, org, token } = JSON.parse(saved);
        this.currentUser = user;
        this.currentOrg  = org;
        this.token       = token || null;
        return true; // already logged in
      } catch(e) { localStorage.removeItem('iq_auth'); }
    }
    return false;
  },

  save() {
    localStorage.setItem('iq_auth', JSON.stringify({
      user:  this.currentUser,
      org:   this.currentOrg,
      token: this.token,
    }));
  },

  logout() {
    this.currentUser = null;
    this.currentOrg  = null;
    this.token       = null;
    localStorage.removeItem('iq_auth');
    location.reload();
  },

  /* ── Auth headers helper ───────────────────────────────── */
  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  },

  isMember()     { return this.currentUser?.role === 'member'; },
  isCoach()      { return ['coach','admin','superadmin'].includes(this.currentUser?.role); },
  isAdmin()      { return ['admin','superadmin'].includes(this.currentUser?.role); },
  isSuperAdmin() { return this.currentUser?.role === 'superadmin'; },

  canManageRole(role) {
    const myLevel   = this.ROLE_ORDER[this.currentUser?.role] || 99;
    const theirLevel = this.ROLE_ORDER[role] || 99;
    return myLevel < theirLevel || this.isSuperAdmin();
  },

  /* ── Setup org ─────────────────────────────────────────── */
  async setupOrg(orgName, orgMode, adminName, password) {
    const res  = await fetch('/api/auth/setup-org', {
      method: 'POST', headers: this._headers(),
      body: JSON.stringify({ orgName, orgMode, adminName, password }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    if (data.token) { this.token = data.token; this.save(); }
    return data;
  },

  /* ── Login ─────────────────────────────────────────────── */
  async login(orgCode, name, password) {
    const res  = await fetch('/api/auth/login', {
      method: 'POST', headers: this._headers(),
      body: JSON.stringify({ orgCode, name, password }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    this.currentUser = data.user;
    this.currentOrg  = data.org;
    this.token       = data.token || null;
    this.save();
    return data;
  },

  /* ── Create user ───────────────────────────────────────── */
  async createUser(name, role, supervisorId, password) {
    const res  = await fetch('/api/auth/create-user', {
      method: 'POST', headers: this._headers(),
      body: JSON.stringify({
        orgCode:     this.currentUser.orgCode,
        creatorId:   this.currentUser.id,
        name, role,
        supervisorId: supervisorId || this.currentUser.id,
        password:    password || name.toLowerCase(),
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.user;
  },

  /* ── Bulk create ───────────────────────────────────────── */
  async bulkCreate(names, role, supervisorId) {
    const res  = await fetch('/api/auth/bulk-create', {
      method: 'POST', headers: this._headers(),
      body: JSON.stringify({
        orgCode:     this.currentUser.orgCode,
        creatorId:   this.currentUser.id,
        users: names, role,
        supervisorId: supervisorId || this.currentUser.id,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data;
  },

  /* ── Generate invite link ──────────────────────────────── */
  async generateInvite(role, supervisorId) {
    const res  = await fetch('/api/auth/invite', {
      method: 'POST', headers: this._headers(),
      body: JSON.stringify({
        orgCode:     this.currentUser.orgCode,
        role,
        supervisorId: supervisorId || this.currentUser.id,
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return `${location.origin}/join?invite=${data.token}`;
  },

  /* ── Get hierarchy tree ────────────────────────────────── */
  async getOrgTree() {
    const res  = await fetch(
      `/api/auth/org-tree?orgCode=${encodeURIComponent(this.currentUser.orgCode)}`,
      { headers: this._headers() }
    );
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data;
  },

  /* ── Update user ───────────────────────────────────────── */
  async updateUser(userId, updates) {
    const res  = await fetch('/api/auth/update-user', {
      method: 'PUT', headers: this._headers(),
      body: JSON.stringify({ orgCode: this.currentUser.orgCode, userId, updates }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data.user;
  },

  /* ── Delete user ───────────────────────────────────────── */
  async deleteUser(userId) {
    const res  = await fetch('/api/auth/delete-user', {
      method: 'DELETE', headers: this._headers(),
      body: JSON.stringify({ orgCode: this.currentUser.orgCode, userId }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    return data;
  },
};

/* ============================================================
   HIERARCHY TREE RENDERER
   Visual org tree — each node shows avatar, name, role,
   with add/manage buttons. Recursive.
   ============================================================ */

const HierarchyTree = {

  _tree:     [],
  _flat:     [],
  _expanded: new Set(),

  async load() {
    const { tree, flat } = await Auth.getOrgTree();
    this._tree = tree;
    this._flat = flat;
    return this;
  },

  render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!this._tree.length) {
      el.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted)">No members yet. Add your first person below.</div>`;
      return;
    }
    el.innerHTML = `<div class="hierarchy-tree">${this._renderNodes(this._tree, 0)}</div>`;
  },

  _renderNodes(nodes, depth) {
    return nodes.map(node => this._renderNode(node, depth)).join('');
  },

  _renderNode(node, depth) {
    const icon    = Auth.ROLE_ICONS[node.role]  || '👤';
    const label   = Auth.ROLE_LABELS[node.role] || node.role;
    const color   = this._roleColor(node.role);
    const isMe    = node.id === Auth.currentUser?.id;
    const canAdd  = Auth.canManageRole('member') && (Auth.ROLE_ORDER[Auth.currentUser?.role] < Auth.ROLE_ORDER[node.role] || Auth.isSuperAdmin() || isMe);
    const hasKids = node.children?.length > 0;
    const expanded = this._expanded.has(node.id);

    return `
      <div class="tree-node-wrap" style="margin-left:${depth * 28}px">
        <div class="tree-node ${isMe ? 'tree-node-me' : ''}" style="border-color:${color}22">
          <div class="tree-node-left">
            ${hasKids ? `
              <button class="tree-toggle" onclick="HierarchyTree._toggle('${node.id}')">
                ${expanded ? '▾' : '▸'}
              </button>` : '<span style="width:20px;display:inline-block"></span>'}
            <div class="tree-avatar" style="background:${color}22;color:${color}">${icon}</div>
            <div class="tree-info">
              <div class="tree-name">${node.name}${isMe ? ' <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem">(you)</span>' : ''}</div>
              <div class="tree-role">${label}</div>
            </div>
          </div>
          <div class="tree-actions">
            ${node.children?.length ? `<span class="tree-count">${node.children.length} below</span>` : ''}
            ${canAdd ? `<button class="tree-btn tree-btn-add" onclick="HierarchyTree.openAddBelow('${node.id}','${node.name}')">+ Add</button>` : ''}
            ${Auth.isAdmin() && !isMe ? `
              <button class="tree-btn" onclick="HierarchyTree.openManage('${node.id}')">⋯</button>` : ''}
          </div>
        </div>
        ${hasKids && expanded ? `
          <div class="tree-children">
            <div class="tree-line"></div>
            <div class="tree-children-inner">
              ${this._renderNodes(node.children, 0)}
            </div>
          </div>` : ''}
      </div>`;
  },

  _toggle(nodeId) {
    if (this._expanded.has(nodeId)) this._expanded.delete(nodeId);
    else this._expanded.add(nodeId);
    this.render('hierarchy-tree-container');
  },

  _roleColor(role) {
    return { superadmin:'#7c5af5', admin:'#4f8ef7', coach:'#f7b24f', member:'#4ff77a' }[role] || '#9898b0';
  },

  /* ── Add person below a node ───────────────────────────── */
  openAddBelow(supervisorId, supervisorName) {
    const el = document.getElementById('hierarchy-add-panel');
    if (!el) return;

    // Which roles can be added below this supervisor?
    const sup = this._flat.find(u => u.id === supervisorId);
    const supLevel = Auth.ROLE_ORDER[sup?.role] || 4;
    const availableRoles = Object.entries(Auth.ROLE_ORDER)
      .filter(([role, level]) => level > supLevel && role !== 'superadmin')
      .map(([role]) => role);

    el.style.display = 'block';
    el.innerHTML = `
      <div style="background:var(--surface-1);border:1px solid var(--accent);border-radius:var(--radius);padding:1.2rem;margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <div>
            <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--accent)">Add Person Below ${supervisorName}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">They'll report to ${supervisorName}</div>
          </div>
          <button onclick="document.getElementById('hierarchy-add-panel').style.display='none'" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem">✕</button>
        </div>

        <!-- Tabs: single / bulk / invite -->
        <div style="display:flex;gap:0.4rem;margin-bottom:1rem">
          ${['single','bulk','invite'].map(t => `
            <button class="domain-badge hadd-tab" data-tab="${t}"
              onclick="HierarchyTree._switchAddTab('${t}')"
              style="cursor:pointer;padding:5px 12px;font-size:0.75rem">${t==='single'?'Add One':t==='bulk'?'Add Many':'Invite Link'}</button>`).join('')}
        </div>

        <!-- Single -->
        <div id="hadd-single">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.7rem">
            <div>
              <label class="form-label">Name</label>
              <input type="text" id="hadd-name" class="form-input" placeholder="Full name"/>
            </div>
            <div>
              <label class="form-label">Role</label>
              <select id="hadd-role" class="form-input">
                ${availableRoles.map(r => `<option value="${r}">${Auth.ROLE_LABELS[r]}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="margin-bottom:0.7rem">
            <label class="form-label">Password <span style="font-weight:400;text-transform:none;color:var(--text-muted)">(default: their name in lowercase)</span></label>
            <input type="text" id="hadd-password" class="form-input" placeholder="Leave blank for default"/>
          </div>
          <button class="btn btn-accent btn-sm" onclick="HierarchyTree.addSingle('${supervisorId}')">Add Person</button>
        </div>

        <!-- Bulk -->
        <div id="hadd-bulk" style="display:none">
          <div style="margin-bottom:0.7rem">
            <label class="form-label">Role for all</label>
            <select id="hadd-bulk-role" class="form-input">
              ${availableRoles.map(r => `<option value="${r}">${Auth.ROLE_LABELS[r]}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:0.7rem">
            <label class="form-label">Names — one per line</label>
            <textarea id="hadd-bulk-names" class="form-input" rows="5" placeholder="James Smith&#10;Emma Johnson&#10;Liam Williams"></textarea>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.7rem">Default password = their name in lowercase. They can change it after first login.</div>
          <button class="btn btn-accent btn-sm" onclick="HierarchyTree.addBulk('${supervisorId}')">Add All</button>
          <div id="hadd-bulk-result" style="margin-top:0.7rem;font-size:0.8rem"></div>
        </div>

        <!-- Invite -->
        <div id="hadd-invite" style="display:none">
          <div style="margin-bottom:0.7rem">
            <label class="form-label">Role for invited person</label>
            <select id="hadd-invite-role" class="form-input">
              ${availableRoles.map(r => `<option value="${r}">${Auth.ROLE_LABELS[r]}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-accent btn-sm" onclick="HierarchyTree.generateInvite('${supervisorId}')">Generate Invite Link</button>
          <div id="hadd-invite-result" style="margin-top:0.7rem"></div>
        </div>
      </div>`;

    HierarchyTree._switchAddTab('single');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  _switchAddTab(tab) {
    ['single','bulk','invite'].forEach(t => {
      const el  = document.getElementById(`hadd-${t}`);
      const btn = document.querySelector(`.hadd-tab[data-tab="${t}"]`);
      if (el)  el.style.display  = t === tab ? 'block' : 'none';
      if (btn) {
        btn.style.background  = t === tab ? 'rgba(124,90,245,0.2)' : '';
        btn.style.color       = t === tab ? 'var(--accent)' : '';
        btn.style.borderColor = t === tab ? 'rgba(124,90,245,0.4)' : '';
      }
    });
  },

  async addSingle(supervisorId) {
    const name     = (document.getElementById('hadd-name')?.value     || '').trim();
    const role     = document.getElementById('hadd-role')?.value      || 'member';
    const password = (document.getElementById('hadd-password')?.value || '').trim() || name.toLowerCase();
    if (!name) { showToast('Enter a name', 'warning'); return; }

    try {
      const user = await Auth.createUser(name, role, supervisorId, password);
      showToast(`${name} added ✓`, 'success');
      document.getElementById('hierarchy-add-panel').style.display = 'none';
      await this.load();
      this.render('hierarchy-tree-container');
      // Also add to AppState.members for demo
      _addMemberToAppState(user);
    } catch(e) {
      showToast(e.message, 'warning');
    }
  },

  async addBulk(supervisorId) {
    const raw  = document.getElementById('hadd-bulk-names')?.value || '';
    const role = document.getElementById('hadd-bulk-role')?.value  || 'member';
    const names = raw.split('\n').map(n => n.trim()).filter(Boolean);
    if (!names.length) { showToast('Enter at least one name', 'warning'); return; }

    try {
      const { created, skipped } = await Auth.bulkCreate(names, role, supervisorId);
      const resultEl = document.getElementById('hadd-bulk-result');
      resultEl.innerHTML = `
        <div style="color:var(--success)">✓ Added ${created.length}: ${created.map(u=>u.name).join(', ')}</div>
        ${skipped.length ? `<div style="color:var(--warning);margin-top:4px">Skipped (already exist): ${skipped.join(', ')}</div>` : ''}
        <div style="color:var(--text-muted);margin-top:6px;font-size:0.75rem">Default password = name in lowercase</div>`;
      created.forEach(u => _addMemberToAppState({ ...u, role }));
      await this.load();
      this.render('hierarchy-tree-container');
    } catch(e) {
      showToast(e.message, 'warning');
    }
  },

  async generateInvite(supervisorId) {
    const role = document.getElementById('hadd-invite-role')?.value || 'member';
    try {
      const url = await Auth.generateInvite(role, supervisorId);
      const resultEl = document.getElementById('hadd-invite-result');
      resultEl.innerHTML = `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:0.8rem">
          <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.4rem">Share this link — expires in 7 days</div>
          <div style="font-size:0.8rem;word-break:break-all;color:var(--accent)">${url}</div>
          <button class="btn btn-outline btn-sm" style="margin-top:0.6rem"
            onclick="navigator.clipboard.writeText('${url}').then(()=>showToast('Copied!','success'))">
            Copy Link
          </button>
        </div>`;
    } catch(e) {
      showToast(e.message, 'warning');
    }
  },

  /* ── Manage existing node ──────────────────────────────── */
  openManage(userId) {
    const user = this._flat.find(u => u.id === userId);
    if (!user) return;
    const color = this._roleColor(user.role);

    const modal = document.getElementById('hierarchy-manage-modal');
    if (!modal) return;

    modal.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <div class="modal-title">Manage: ${user.name}</div>
          <button class="icon-btn" onclick="document.getElementById('hierarchy-manage-modal').style.display='none'">✕</button>
        </div>
        <div style="padding:1.2rem">
          <div style="display:flex;align-items:center;gap:0.8rem;margin-bottom:1.2rem;padding:0.8rem;background:var(--surface-2);border-radius:8px">
            <div style="width:44px;height:44px;border-radius:50%;background:${color}22;color:${color};display:flex;align-items:center;justify-content:center;font-size:1.3rem">${Auth.ROLE_ICONS[user.role]}</div>
            <div>
              <div style="font-weight:700">${user.name}</div>
              <div style="font-size:0.75rem;color:var(--text-muted)">${Auth.ROLE_LABELS[user.role]} · Joined ${new Date(user.createdAt).toLocaleDateString('en-GB')}</div>
            </div>
          </div>

          <div style="margin-bottom:0.8rem">
            <label class="form-label">Change Role</label>
            <select id="mgmt-role" class="form-input">
              ${['admin','coach','member'].map(r =>
                `<option value="${r}" ${r===user.role?'selected':''}>${Auth.ROLE_LABELS[r]}</option>`).join('')}
            </select>
          </div>

          <div style="margin-bottom:0.8rem">
            <label class="form-label">Reset Password</label>
            <input type="text" id="mgmt-password" class="form-input" placeholder="Leave blank to keep current"/>
          </div>

          <div style="display:flex;gap:0.5rem;justify-content:space-between">
            <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)44"
              onclick="HierarchyTree.removeUser('${user.id}','${user.name}')">Remove</button>
            <button class="btn btn-accent btn-sm"
              onclick="HierarchyTree.saveManage('${user.id}')">Save Changes</button>
          </div>
        </div>
      </div>`;
    modal.style.display = 'flex';
  },

  async saveManage(userId) {
    const role     = document.getElementById('mgmt-role')?.value || '';
    const password = (document.getElementById('mgmt-password')?.value || '').trim();
    const updates  = { role };
    if (password) updates.password = password;
    try {
      await Auth.updateUser(userId, updates);
      showToast('Updated ✓', 'success');
      document.getElementById('hierarchy-manage-modal').style.display = 'none';
      await this.load();
      this.render('hierarchy-tree-container');
    } catch(e) { showToast(e.message, 'warning'); }
  },

  async removeUser(userId, name) {
    if (!confirm(`Remove ${name} from the organisation? This cannot be undone.`)) return;
    try {
      await Auth.deleteUser(userId);
      showToast(`${name} removed`, 'success');
      document.getElementById('hierarchy-manage-modal').style.display = 'none';
      await this.load();
      this.render('hierarchy-tree-container');
    } catch(e) { showToast(e.message, 'warning'); }
  },
};

/* ── Helper: add a newly-created auth user into AppState.members ──────
   Uses buildRealMemberRecord so scores start null (real, not random).
   Never called at login — only called when a member is added via the UI
   so the page updates immediately without a full reload.
────────────────────────────────────────────────────────────────────── */
function _addMemberToAppState(authUser) {
  if (!AppState?.members) return;
  const existing = AppState.members.find(m =>
    m.userId === authUser.id || m.name.toLowerCase() === authUser.name.toLowerCase()
  );
  if (existing) return;
  const record = buildRealMemberRecord(authUser, AppState.members.length, AppState.mode);
  AppState.members.push(record);
  AppState.stats = buildEmptyOrgStats(AppState.members.length);
}
