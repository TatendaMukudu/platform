/* The bell and the panel read one visible alert collection. Run without a browser binary. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require('path').join(__dirname, '../js/app.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
let pass = 0, fail = 0;
const ok = (name, value) => value ? (pass++, console.log('  PASS', name)) : (fail++, console.error('  FAIL', name));
const dot = { style: {}, setAttribute(k, v) { this[k] = v; } };
const bell = { setAttribute(k, v) { this[k] = v; } };
const panel = { children: [], replaceChildren() { this.children = []; }, appendChild(el) { this.children.push(el); } };
const document = {
  querySelector(s) { return s === '#notif-btn .badge' ? dot : null; },
  querySelectorAll() { return []; },
  getElementById(id) { return id === 'notif-btn' ? bell : id === 'notif-panel-content' ? panel : null; },
  createElement() { return { textContent: '', className: '' }; },
};
const AppState = { alerts: [], getUnreadAlertCount() { return this.alerts.filter(a => a.unread).length; } };
const context = vm.createContext({ document, AppState, showToast() {} });
vm.runInContext(section('function updateAlertBadge(){', '/* ── TOPBAR')
  + section('function markAllRead(){', '/* ── SAFEGUARDING')
  + section('function toggleNotifPanel(){', '/* ── RENDER ALL PAGES'), context);
context.updateAlertBadge(); context.renderNotifPanel();
ok('NB1 no alerts means no unread dot and a discoverable empty panel', dot.style.display === 'none'
  && /No notifications/.test(panel.children[0]?.textContent || '') && bell['aria-label'] === 'Notifications');
AppState.alerts.push({ title: 'A real alert', unread: true });
context.updateAlertBadge(); context.renderNotifPanel();
ok('NB2 a real unread item appears in the same panel the dot counts', dot.style.display === 'block'
  && panel.children.length === 1 && panel.children[0].textContent === 'A real alert'
  && bell['aria-label'] === '1 unread notifications');
context.markAllRead();
ok('NB3 marking it read removes the dot while keeping the item discoverable', dot.style.display === 'none'
  && panel.children[0].textContent === 'A real alert');
console.log(`\nnotification-badge-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
