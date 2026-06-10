/* ============================================================
   PLATFORM — ORG TREE (Sprint 2)
   Generic node-based org tree. No type assumptions — just
   nodes with names, parents, members, and leaders.

   OrgNode: {
     nodeId, name, parentId, childNodeIds[],
     memberIds[], leaderIds[], createdAt, updatedAt
   }
   ============================================================ */

const OrgTree = {

  _nodes:    {},   // nodeId → OrgNode
  _expanded: new Set(),

  /* ── Load from server ───────────────────────────────────── */
  async load() {
    const res  = await fetch('/api/tree', { headers: Auth._headers() });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load tree');
    // Convert array to map
    this._nodes = {};
    (data.nodes || []).forEach(n => { this._nodes[n.nodeId] = n; });
    return this;
  },

  /* ── Build tree structure (roots = nodes with no parent) ── */
  _buildTree() {
    const roots = [];
    const byId  = this._nodes;
    Object.values(byId).forEach(node => {
      if (!node.parentId || !byId[node.parentId]) roots.push(node);
    });
    return roots;
  },

  /* ── Render into a container element ───────────────────── */
  render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const roots = this._buildTree();
    const users = AppState?.members || [];

    if (!Object.keys(this._nodes).length) {
      el.innerHTML = `
        <div style="text-align:center;padding:2.5rem;color:var(--text-muted)">
          <div style="font-size:2rem;margin-bottom:0.5rem">🏗️</div>
          <div style="font-size:0.9rem;font-weight:600;margin-bottom:0.25rem">No org structure yet</div>
          <div style="font-size:0.8rem">Create nodes to organise your people — teams, departments, cohorts, or anything that makes sense for your org.</div>
          ${Auth.canDo('manage_tree') ? `<button class="btn btn-accent btn-sm" style="margin-top:1rem" onclick="OrgTree.openAddNode(null)">+ Create First Node</button>` : ''}
        </div>`;
      return;
    }

    el.innerHTML = `
      <div style="padding:1rem">
        ${Auth.canDo('manage_tree') ? `
          <div style="display:flex;justify-content:flex-end;margin-bottom:1rem">
            <button class="btn btn-accent btn-sm" onclick="OrgTree.openAddNode(null)">+ Add Node</button>
          </div>` : ''}
        <div class="org-tree-list">${this._renderNodes(roots, 0, users)}</div>
      </div>`;
  },

  _renderNodes(nodes, depth, users) {
    return nodes
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(node => this._renderNode(node, depth, users))
      .join('');
  },

  _renderNode(node, depth, users) {
    const children  = this._getChildren(node.nodeId);
    const hasKids   = children.length > 0;
    const expanded  = this._expanded.has(node.nodeId);
    const memberCount = (node.memberIds || []).length;

    const memberPills = (node.memberIds || []).slice(0, 5).map(uid => {
      const u = users.find(m => m.userId === uid || m.id === uid);
      return u ? `<span style="font-size:0.72rem;background:var(--surface-2);border:1px solid var(--border);border-radius:20px;padding:2px 8px">${u.name}</span>` : '';
    }).join('');

    const canManage = Auth.canDo('manage_tree');

    return `
      <div style="margin-left:${depth * 24}px;margin-bottom:0.4rem">
        <div style="display:flex;align-items:center;gap:0.5rem;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;padding:0.6rem 0.8rem">
          ${hasKids ? `
            <button onclick="OrgTree._toggle('${node.nodeId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.9rem;padding:0;width:18px;flex-shrink:0">
              ${expanded ? '▾' : '▸'}
            </button>` : '<span style="width:18px;flex-shrink:0"></span>'}
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:0.88rem">${this._escHtml(node.name)}</div>
            ${memberCount ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;display:flex;flex-wrap:wrap;gap:4px">${memberPills}${memberCount > 5 ? `<span style="font-size:0.72rem;color:var(--text-muted)">+${memberCount - 5} more</span>` : ''}</div>` : ''}
          </div>
          <div style="display:flex;gap:0.4rem;flex-shrink:0">
            <span style="font-size:0.72rem;color:var(--text-muted)">${memberCount} ${memberCount === 1 ? 'person' : 'people'}</span>
            ${canManage ? `
              <button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:0.72rem" onclick="OrgTree.openAddNode('${node.nodeId}')">+ Child</button>
              <button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:0.72rem" onclick="OrgTree.openManageNode('${node.nodeId}')">⋯</button>` : ''}
            <button class="btn btn-outline btn-sm" style="padding:2px 8px;font-size:0.72rem" onclick="OrgTree.openAssignMembers('${node.nodeId}')">👥 Assign</button>
          </div>
        </div>
        ${hasKids && expanded ? `
          <div style="margin-top:0.3rem;border-left:2px solid var(--border);margin-left:8px;padding-left:4px">
            ${this._renderNodes(children, 0, users)}
          </div>` : ''}
      </div>`;
  },

  _getChildren(parentId) {
    return Object.values(this._nodes).filter(n => n.parentId === parentId);
  },

  _toggle(nodeId) {
    if (this._expanded.has(nodeId)) this._expanded.delete(nodeId);
    else this._expanded.add(nodeId);
    this.render('org-tree-container');
  },

  _escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  /* ── Add node modal ─────────────────────────────────────── */
  openAddNode(parentId) {
    const parentNode = parentId ? this._nodes[parentId] : null;
    _showInlineModal(`
      <div class="card-title" style="margin-bottom:1rem">${parentId ? `Add node under "${parentNode?.name || parentId}"` : 'Add top-level node'}</div>
      <div class="form-group">
        <label class="form-label">NODE NAME</label>
        <input id="_tree-add-name" class="form-input" placeholder="e.g. First Team, Year 10, Product Division…" autofocus />
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn btn-accent btn-sm" onclick="OrgTree._submitAddNode('${parentId || ''}')">Create Node</button>
        <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Cancel</button>
      </div>`);
    setTimeout(() => document.getElementById('_tree-add-name')?.focus(), 50);
  },

  async _submitAddNode(parentId) {
    const name = (document.getElementById('_tree-add-name')?.value || '').trim();
    if (!name) { showToast('Enter a node name', 'warning'); return; }
    try {
      const res  = await fetch('/api/tree/node', {
        method: 'POST', headers: Auth._headers(),
        body: JSON.stringify({ name, parentId: parentId || null }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      this._nodes[data.node.nodeId] = data.node;
      if (parentId) this._expanded.add(parentId);
      _closeInlineModal();
      this.render('org-tree-container');
      showToast(`"${name}" created`, 'success');
    } catch(e) { showToast(e.message, 'warning'); }
  },

  /* ── Manage (rename / delete) ───────────────────────────── */
  openManageNode(nodeId) {
    const node = this._nodes[nodeId];
    if (!node) return;
    _showInlineModal(`
      <div class="card-title" style="margin-bottom:1rem">Manage node</div>
      <div class="form-group">
        <label class="form-label">NAME</label>
        <input id="_tree-mgmt-name" class="form-input" value="${this._escHtml(node.name)}" />
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
        <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)44"
          onclick="OrgTree._deleteNode('${nodeId}','${this._escHtml(node.name)}')">Delete</button>
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Cancel</button>
          <button class="btn btn-accent btn-sm" onclick="OrgTree._submitRenameNode('${nodeId}')">Save</button>
        </div>
      </div>`);
    setTimeout(() => document.getElementById('_tree-mgmt-name')?.focus(), 50);
  },

  async _submitRenameNode(nodeId) {
    const name = (document.getElementById('_tree-mgmt-name')?.value || '').trim();
    if (!name) { showToast('Name cannot be empty', 'warning'); return; }
    try {
      const res  = await fetch(`/api/tree/node/${nodeId}`, {
        method: 'PUT', headers: Auth._headers(),
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      this._nodes[nodeId].name = data.node.name;
      _closeInlineModal();
      this.render('org-tree-container');
      showToast('Renamed ✓', 'success');
    } catch(e) { showToast(e.message, 'warning'); }
  },

  async _deleteNode(nodeId, name) {
    if (!confirm(`Delete "${name}"? Children will be moved up. Members will be unassigned.`)) return;
    try {
      const res  = await fetch(`/api/tree/node/${nodeId}`, {
        method: 'DELETE', headers: Auth._headers(),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      delete this._nodes[nodeId];
      _closeInlineModal();
      await this.load();
      this.render('org-tree-container');
      showToast(`"${name}" deleted`, 'success');
    } catch(e) { showToast(e.message, 'warning'); }
  },

  /* ── Assign members to node ─────────────────────────────── */
  openAssignMembers(nodeId) {
    const node    = this._nodes[nodeId];
    if (!node) return;
    const members = (AppState?.members || []).filter(m => m.role === 'member' || m.role === 'coach');
    const current = node.memberIds || [];

    _showInlineModal(`
      <div class="card-title" style="margin-bottom:0.5rem">Assign people to "${this._escHtml(node.name)}"</div>
      <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:1rem">Select all people who belong in this node.</div>
      <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:0.4rem" id="_tree-assign-list">
        ${members.length ? members.map(m => `
          <label style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem;border-radius:6px;cursor:pointer;border:1px solid var(--border)">
            <input type="checkbox" value="${m.userId || m.id}" ${current.includes(m.userId || m.id) ? 'checked' : ''} />
            <span style="font-size:0.85rem">${this._escHtml(m.name)}</span>
            <span style="font-size:0.72rem;color:var(--text-muted)">${m.role}</span>
          </label>`).join('') : '<div style="color:var(--text-muted);font-size:0.82rem">No members in org yet.</div>'}
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn btn-accent btn-sm" onclick="OrgTree._submitAssign('${nodeId}')">Save</button>
        <button class="btn btn-outline btn-sm" onclick="_closeInlineModal()">Cancel</button>
      </div>`);
  },

  async _submitAssign(nodeId) {
    const checkboxes = document.querySelectorAll('#_tree-assign-list input[type=checkbox]');
    const memberIds  = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
    try {
      const res  = await fetch(`/api/tree/node/${nodeId}`, {
        method: 'PUT', headers: Auth._headers(),
        body: JSON.stringify({ memberIds }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      this._nodes[nodeId].memberIds = data.node.memberIds;
      _closeInlineModal();
      this.render('org-tree-container');
      showToast('Assignments saved ✓', 'success');
    } catch(e) { showToast(e.message, 'warning'); }
  },
};

/* ── Inline modal helper (lightweight, scoped) ───────────────────────────── */
function _showInlineModal(html) {
  let overlay = document.getElementById('_inline-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_inline-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:900;display:flex;align-items:center;justify-content:center;padding:1rem';
    overlay.addEventListener('click', e => { if (e.target === overlay) _closeInlineModal(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<div style="background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:1.5rem;max-width:480px;width:100%;max-height:80vh;overflow-y:auto">${html}</div>`;
  overlay.style.display = 'flex';
}

function _closeInlineModal() {
  const el = document.getElementById('_inline-modal-overlay');
  if (el) el.style.display = 'none';
}
