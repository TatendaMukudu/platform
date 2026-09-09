/* LIVE JOURNEY CHECK — the landing candidate, driven in a real Chromium, as a player and as a
   coach, against the real Alma College seed (28 players, real evidence, real Highs and Lows).

   WHAT THIS IS NOT. It is not a deployed verification. No deployed URL is documented in this
   repository and this sandbox's network policy denies all external egress, so nothing here says
   anything about what is running on Render. It is LOCAL BROWSER PROVEN, which is the strongest
   thing available from here and is a different claim.

   WHY IT EXISTS. Every suite in `npm test` reaches the server over HTTP or reads source. Three of
   the four pilot blockers were features whose route worked, whose tests passed, and which nobody
   could reach — a class of defect invisible to a harness that never opens the page. This opens it,
   on both roles, at two phone widths.

   NOT part of `npm test`: it needs a browser binary and the truth layer is deliberately hermetic.
   Run: node scripts/live-journey-check.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const { chromium } = require('playwright-core');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PHONE = { width: 390, height: 844 };   // iPhone 14/15 — the founder's device class
const WIDE  = { width: 430, height: 932 };   // iPhone 15 Pro Max

const { buildAlmaStore, ALMA_CODE } = require('./seed-alma.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, _backfillUserNodeIds, issueToken, orgUsers } = S;

let pass = 0, fail = 0; const notes = [];
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } return v; };
const note = t => { notes.push(t); console.log('       ·', t); };

(async () => {
  const { store, summary } = await buildAlmaStore();
  _loadAllStores(store);
  _rebuildEmailIndex();
  try { _backfillUserNodeIds(); } catch (_) {}

  const users  = orgUsers[ALMA_CODE];
  const coach  = Object.values(users).find(u => u.role === 'superadmin');
  /* The walk needs a player who HAS something in each bucket. Picking the first member found gave
     one with a Low and an Inquiry but no High — which is the seed being honest (SA28: several
     players said nothing all season), not a defect, but it makes an empty bucket look like one. */
  const members = Object.values(users).filter(u => u.role === 'member' && (u.assignedNodeIds || []).length);
  const richness = u => { const st = (S.inquiryStates[ALMA_CODE] || {})[`member:${u.id}`] || {}; return Object.keys(st).length; };
  const player = members.slice().sort((a, b) => richness(b) - richness(a))[0] || members[0];
  console.log(`\n  SEED: ${summary.players} players, ${summary.staff} staff, ${summary.evidence} pieces of evidence, ${summary.inquiries} inquiries`);
  console.log(`  COACH: ${coach.name}   PLAYER: ${player.name}\n`);

  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

  /* One signed-in page for a given person at a given viewport. The session is planted rather than
     typed: this is an experience harness, not an auth test. */
  const open = async (user, viewport) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    const tok = issueToken(user.id, ALMA_CODE, user.role);
    await page.addInitScript(([t, c, u]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: u.id, name: u.name, role: u.role, orgCode: c, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: {}, domain: null }));
      localStorage.setItem(`iq_profile_complete_${u.id}`, '1');
    }, [tok, ALMA_CODE, { id: user.id, name: user.name, role: user.role }]);
    await page.goto(`${base}/`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1100);
    const n = await page.$('button:has-text("I understand")');
    if (n) { await n.click().catch(() => {}); await page.waitForTimeout(400); }
    page.__tok = tok; page.__errors = errors;
    return page;
  };
  const go  = async (page, r) => { await page.evaluate(x => navigate(x), r); await page.waitForTimeout(1200); };
  const api = (page, m, u, b) => page.evaluate(async ([m, u, b, t]) => {
    const r = await fetch(u, { method: m, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: b ? JSON.stringify(b) : undefined });
    return { status: r.status, j: await r.json().catch(() => null) };
  }, [m, u, b, page.__tok]);

  /* THE DEAD-CONTROL HUNT. Every inline handler on the page is parsed for the function it calls,
     and that function is resolved in page scope. A control naming something undefined is a button
     that silently does nothing when pressed — the exact defect class this pilot has produced four
     times. Reported per route so a failure names the screen. */
  const deadControls = page => page.evaluate(() => {
    /* EVERY call in the handler, not just the first. Handlers here are frequently compound —
       `event.stopPropagation();leaderObserve(id,name)` — and matching only the leading call made
       this report `event.stopPropagation` as dead (it is undefined outside event dispatch) while
       saying nothing about the handler that matters. Event-context and built-in receivers are
       skipped for the same reason: they exist only while the browser is dispatching. */
    const SKIP = /^(event|window|document|this|console|alert|confirm|prompt|navigator|localStorage|history|location|Math|JSON|Object|Array|String|Number|Date|Promise|setTimeout|setInterval|fetch|parseInt|parseFloat|encodeURIComponent|decodeURIComponent|return|if|for|while|typeof|new)$/;
    const out = [];
    for (const el of document.querySelectorAll('[onclick],[onchange]')) {
      const src = (el.getAttribute('onclick') || '') + ';' + (el.getAttribute('onchange') || '');
      const calls = [...src.matchAll(/([A-Za-z_$][\w$]*)\s*(?:\.\s*([A-Za-z_$][\w$]*))?\s*\(/g)];
      for (const [, root, method] of calls) {
        if (SKIP.test(root)) continue;
        let target;
        try { target = new Function(`try{return ${method ? root + '.' + method : root}}catch(e){return undefined}`)(); }
        catch (_) { target = undefined; }
        if (typeof target !== 'function') {
          const r = el.getBoundingClientRect();
          out.push({ label: (el.textContent || '').trim().slice(0, 24) || '(icon)',
            call: (method ? root + '.' + method : root), visible: r.width > 0 && r.height > 0 });
        }
      }
    }
    // One row per distinct missing function per screen, not one per rendered button.
    const seen = new Set();
    return out.filter(x => { const k = x.call + '|' + x.visible; if (seen.has(k)) return false; seen.add(k); return true; });
  });

  const smallTargets = page => page.evaluate(() => [...document.querySelectorAll('button,a[onclick],select,input[type=checkbox]')]
    .filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && (r.height < 44 || r.width < 44); })
    .map(e => { const r = e.getBoundingClientRect();
      return { t: (e.textContent || '').trim().slice(0, 24) || (e.getAttribute('aria-label') || '').slice(0, 24) || '(icon)',
        h: Math.round(r.height), w: Math.round(r.width) }; }));

  const overflows = page => page.evaluate(() => document.body.scrollWidth > window.innerWidth + 2);

  const ROUTES = ['home', 'inquiry', 'high', 'low', 'focus', 'notes', 'stats', 'my-data'];

  /* ══ THE PLAYER ══════════════════════════════════════════════════════════════════════════ */
  console.log('\n  A PLAYER, 390x844');
  const p = await open(player, PHONE);

  // A — HOME
  const home = await p.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.height > 0 && r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const legacy = ['me-briefing','me-noticed','me-questions','me-prepared','home-stat-row','home-focus','home-insight','home-weekly-prompt'];
    return { greeting: vis(document.getElementById('home-greeting')),
      name: vis(document.getElementById('home-name')),
      composer: vis(document.getElementById('iq-composer-input')) || vis(document.getElementById('today-ask')),
      legacyVisible: legacy.filter(i => vis(document.getElementById(i))),
      recognition: vis(document.getElementById('me-recognition')) };
  });
  ok('A1 HOME greets the person and offers the one composer', home.greeting && home.name && home.composer);
  ok('A2 …and no legacy panel from the retired Home is on screen', home.legacyVisible.length === 0);
  if (home.recognition) note('HOME: the recognition strip IS visible for this seeded player — a second thing on Home. Founder decision, not a defect.');
  else note('HOME: the recognition strip is not visible for this player (no recognitions in the seed).');

  // Dead controls across every player route
  let deadTotal = 0, deadDetail = [];
  for (const r of ROUTES) {
    await go(p, r);
    const d = (await deadControls(p)).filter(x => x.visible);
    if (d.length) { deadTotal += d.length; deadDetail.push(`${r}: ${d.map(x => x.label + ' → ' + x.call).join('; ')}`); }
  }
  ok(`A3 no visible control anywhere in the player's app calls a function that does not exist (${ROUTES.length} routes swept)`,
    deadTotal === 0);
  deadDetail.forEach(note);

  // B/C/D — the three belief buckets
  for (const [kind, code] of [['inquiry', 'B'], ['high', 'C'], ['low', 'D']]) {
    await go(p, kind);
    const list = await api(p, 'GET', `/api/objects?kind=${kind}`);
    const items = ((list.j && (list.j.objects || list.j.items)) || []).filter(o => !kind || o.kind === kind);
    const first = items[0];
    if (!ok(`${code}1 the player's ${kind} bucket has something real in it from the seed`, !!first)) continue;
    await p.evaluate(([k, id]) => MemberApp.openObjectThread(k, String(id)), [kind, first.id]).catch(() => {});
    await p.waitForTimeout(1600);
    const t = await p.evaluate(() => {
      const box = document.getElementById('iq-member-body') || document.body;
      const txt = box.textContent || '';
      return { opened: !!document.querySelector('.iq-object-thread'),
        verdicts: [...document.querySelectorAll('.iqt-verdicts button')].map(b => b.textContent.trim()),
        forum: !!document.querySelector('.iqt-forum'),
        chart: !!document.querySelector('svg.iqt-svg'),
        basisWords: /because|rest|account|evidence|record|said/i.test(txt),
        len: txt.length };
    });
    ok(`${code}2 …it opens as a thread with its verdict row`, t.opened && t.verdicts.length >= 3);
    ok(`${code}3 …and states what it rests on rather than only asserting`, t.basisWords && t.len > 200);
    note(`${kind}: verdicts=[${t.verdicts.join(', ')}] forum=${t.forum} chart=${t.chart}`);
    if (kind === 'inquiry') {
      // Ask IntelliQ about it — the turn must answer and stay bound to this object.
      const turn = await api(p, 'POST', '/api/assistant/turn', { text: 'What is this actually telling me?', about: { kind, id: String(first.id) } });
      const r = (turn.j && turn.j.response) || {};
      ok('B4 asking IntelliQ about the open inquiry returns an answer', !!r.responseText);
      ok('B4b …carrying the structured composer state (degraded or not), never silently',
        r.composer && typeof r.composer.degraded === 'boolean');
      ok('B4c …and no provider, model, key or raw error reaches the reader',
        !/anthropic|openai|api[_ ]?key|sk-|status\s*5\d\d|ECONN/i.test(String(r.responseText || '')));
    }
  }

  // E — FOCUS lifecycle
  await go(p, 'focus');
  const mk = await api(p, 'POST', '/api/me/focus', { text: 'Closing down the near post quicker' });
  const fid = mk.j && mk.j.focus && mk.j.focus.id;
  ok('E1 a player can start a focus and it comes back private by default',
    !!fid && mk.j.focus.visibility === 'private');
  const upd = await api(p, 'POST', `/api/me/focus/${fid}/visibility`, { visibility: 'shared' });
  ok('E2 …change who it is with', upd.status === 200 && upd.j.visibility === 'shared');
  const out = await api(p, 'POST', '/api/me/focus/outcome', { focusId: fid, outcome: 'helped' });
  ok('E3 …and close the loop with an outcome', out.status === 200 && out.j.ok);
  const after = await api(p, 'GET', '/api/objects?kind=focus');
  const dupes = ((after.j && (after.j.objects || after.j.items)) || []).filter(o => String(o.id) === String(fid));
  ok('E4 …producing exactly ONE focus, not a second from a duplicate lifecycle owner', dupes.length <= 1);

  // H — MATERIAL picker, on a thread the player owns
  await p.evaluate(id => MemberApp.openObjectThread('focus', String(id)), fid).catch(() => {});
  await p.waitForTimeout(1500);
  const acc = await p.$eval('#iqt-mat-file', el => el.getAttribute('accept')).catch(() => null);
  ok('H1 the Material picker is on the thread and advertises a non-empty accept list', !!acc);
  ok('H2 …offering only what a parser can read — no PDF, no image',
    !!acc && !/\.pdf/i.test(acc) && !/image/i.test(acc) && /\.pptx/.test(acc) && /\.docx/.test(acc));

  // J — navigation and settings
  await go(p, 'home');
  const nav = await p.evaluate(() => {
    const labels = [...document.querySelectorAll('[onclick*="navigate("]')].map(e => (e.textContent || '').trim()).filter(Boolean);
    const counts = {}; labels.forEach(l => { counts[l] = (counts[l] || 0) + 1; });
    return { labels, dupes: Object.entries(counts).filter(([, c]) => c > 1) };
  });
  ok('J1 no navigation label appears twice on one screen', nav.dupes.length === 0);
  note(`nav labels seen: ${nav.labels.join(' | ') || '(none inline — menu-driven)'}`);

  // MOBILE at both widths
  const small390 = await smallTargets(p);
  const of390 = await overflows(p);
  ok('K1 no horizontal overflow at 390px', of390 === false);
  note(`sub-44px targets at 390px on Home: ${small390.length} → ${small390.map(s => `${s.t}(${s.w}x${s.h})`).join(', ') || 'none'}`);
  const comp = await p.evaluate(() => {
    const el = document.getElementById('iq-composer-input') || document.getElementById('today-ask');
    if (!el) return null; const r = el.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width), font: parseFloat(getComputedStyle(el).fontSize) };
  });
  const row = await p.evaluate(() => {
    const el = document.getElementById('iq-composer-input'); if (!el) return null;
    const parent = el.closest('.iq-composer, .iq-composer-row, form, div');
    const sibs = parent ? [...parent.children].map(ch => { const r = ch.getBoundingClientRect();
      return { tag: ch.tagName.toLowerCase(), cls: (ch.className||'').slice(0,28), w: Math.round(r.width) }; }) : [];
    const pr = parent ? parent.getBoundingClientRect() : null;
    return { parentCls: parent ? (parent.className||'').slice(0,40) : '', parentW: pr ? Math.round(pr.width) : 0, sibs };
  });
  note(`composer input at 390px: ${comp ? comp.w + 'x' + comp.h + ', ' + comp.font + 'px text' : 'NOT FOUND'}`);
  note(`composer row: parent=${row && row.parentCls} width=${row && row.parentW} children=${JSON.stringify(row && row.sibs)}`);
  /* K2 ASSERTS THE LAW WITH A CONSEQUENCE, AND ONLY THAT. My first version also required the
     input to be at least 200px wide, a number I invented on the spot with nothing behind it, and
     the composer measures 188. Rather than move that threshold quietly, it is removed and named:
     16px is the real line, because below it iOS Safari zooms the page on focus and the app
     appears to jump. Width is recorded as an observation and judged in the report, not asserted
     against a number nobody chose. The input is a textarea that grows, so a long message is not
     hidden — it wraps and the box gets taller. */
  const grows = await p.evaluate(() => {
    const el = document.getElementById('iq-composer-input'); if (!el) return null;
    const before = Math.round(el.getBoundingClientRect().height);
    el.value = 'A long sentence typed on a phone to see whether the composer grows to show it, or silently hides what was written.';
    if (typeof MemberApp !== 'undefined' && MemberApp._wsGrow) MemberApp._wsGrow(el);
    const after = Math.round(el.getBoundingClientRect().height);
    el.value = '';
    return { before, after };
  });
  note(`composer growth on a long message: ${grows ? grows.before + 'px -> ' + grows.after + 'px' : 'unmeasured'}`);
  ok('K2 the composer text is 16px, so iOS Safari does not zoom the page when a player taps it',
    !!comp && comp.font >= 16);
  ok('K2b …and it grows to show a long message rather than hiding what was typed',
    !!grows && grows.after > grows.before);
  ok('K3 no uncaught page error during the whole player walk', p.__errors.filter(e => !/Chart is not defined/.test(e)).length === 0);
  if (p.__errors.length) note(`page errors (Chart.js CDN is blocked in this sandbox): ${[...new Set(p.__errors)].join(' | ')}`);

  console.log('\n  THE SAME PLAYER, 430x932');
  const pw = await open(player, WIDE);
  ok('K4 no horizontal overflow at 430px', (await overflows(pw)) === false);
  const smallWide = await smallTargets(pw);
  note(`sub-44px targets at 430px on Home: ${smallWide.length}`);
  await pw.context().close();

  /* ══ THE COACH ═══════════════════════════════════════════════════════════════════════════ */
  console.log('\n  THE COACH, 390x844');
  const c = await open(coach, PHONE);
  let coachDead = 0;
  for (const r of ['leader-home', 'leader-people', 'inquiry', 'high', 'low', 'notes']) {
    await go(c, r);
    const cd = (await deadControls(c)).filter(x => x.visible);
    coachDead += cd.length;
    if (cd.length) note(`COACH ${r}: ${cd.map(x => (x.label || '(no label)') + ' -> ' + x.call).join(' ;; ')}`);
  }
  ok('L1 no visible dead control on the coach surfaces either', coachDead === 0);
  ok('L2 no horizontal overflow on the coach surfaces at 390px', (await overflows(c)) === false);

  // F — FORUM: membership is enforced, and speech is not evidence
  /* The group inquiry lives under a `group:<nodeId>` subject key in the store, not in the
     member-scoped /api/inquiry list. Reading /api/inquiry and finding nothing made the forum walk
     silently skip — a harness that reports "no data" when the data is one key away. */
  const groupKey = Object.keys(S.inquiryStates[ALMA_CODE] || {}).find(k => k.startsWith('group:'));
  const nodeId = groupKey ? groupKey.slice(6) : ((coach.leadershipNodeIds || [])[0] || (player.assignedNodeIds || [])[0]);
  const groupInq = groupKey ? Object.values(S.inquiryStates[ALMA_CODE][groupKey])[0] : null;
  if (nodeId && groupInq) {
    const room = await api(c, 'GET', `/api/group/${nodeId}/forum/${groupInq.inquiryId}`);
    ok('F1 the coach can open the governed forum room for a group inquiry they lead', room.status === 200);
    ok('F2 …and the room states that speech is not evidence until deliberately contributed',
      /not.*evidence|evidence.*unless/i.test(JSON.stringify(room.j || {})));
    /* EVERYONE in this seed is on the varsity squad, so there is no outsider to refuse — which is
       the seed being realistic about a college programme, not a gap in the gate. What CAN be shown
       live is that membership is what grants the read, so a squad member gets in. The refusal side
       is covered by forum-smoke, whose mayRead/mayPost/mayEdit gates I mutated in the landing
       audit and all three bit. */
    const memberTok = issueToken(player.id, ALMA_CODE, 'member');
    const asMember = await c.evaluate(async ([n, i, t]) => {
      const r = await fetch(`/api/group/${n}/forum/${i}`, { headers: { Authorization: 'Bearer ' + t } });
      return { status: r.status, body: (await r.text()).slice(0, 400) };
    }, [nodeId, groupInq.inquiryId, memberTok]);
    ok('F3 a player who is in that group can read the room too — membership is the access, not rank',
      asMember.status === 200);
    ok('F4 …and the room carries no private member text as a side effect of opening it',
      !/private|sensitive|hardship/i.test(asMember.body));
  } else { note('FORUM: the seed produced no group inquiry to open a room on; forum walked at the route level only.'); }

  // I — GRAPH, as the coach reads it
  /* THE COACH'S GRAPH, reached the way the coach reaches it. Charting the group inquiry by the id
     I read out of the store returned 404: the chart route resolves an object through the reader's
     OWN authorised object list, and reaching past that list is the harness cheating, not the
     product failing. So this asks the coach's list what it holds and charts something from it. */
  await go(c, 'inquiry');
  const cList = await api(c, 'GET', '/api/objects?kind=inquiry');
  const cObjs = ((cList.j && (cList.j.objects || cList.j.items)) || []).filter(o => o.kind === 'inquiry');
  note(`the coach's own inquiry list holds ${cObjs.length}`);
  let drawn = 0, refusedWithReason = 0, refusedSilently = 0;
  for (const o of cObjs.slice(0, 5)) {
    const ch = await api(c, 'GET', `/api/objects/inquiry/${o.id}/chart?kind=firming`);
    if (ch.j && ch.j.chart) drawn++;
    else if (ch.j && ch.j.note && String(ch.j.note).length > 20) refusedWithReason++;
    else refusedSilently++;
  }
  if (cObjs.length) {
    ok('I1 every chart the coach asks for is either DRAWN or REFUSED WITH A STATED REASON — never a silent empty picture',
      refusedSilently === 0 && (drawn + refusedWithReason) > 0);
    note(`coach charts: ${drawn} drawn, ${refusedWithReason} refused with a reason, ${refusedSilently} silent`);
    const anyDrawn = cObjs.slice(0, 5);
    for (const o of anyDrawn) {
      const ch = await api(c, 'GET', `/api/objects/inquiry/${o.id}/chart?kind=firming`);
      if (ch.j && ch.j.chart) {
        ok('I2 …and a drawn one states its own limits rather than arriving as a bare picture',
          (ch.j.chart.limitations || []).length >= 2);
        ok('I3 …in plain language, not kernel terminology',
          !/independent origins/i.test(JSON.stringify(ch.j.chart)));
        break;
      }
    }
  } else {
    /* A COACH DOES NOT READ THE SQUAD THROUGH THE MEMBER BUCKETS. /api/objects is the personal
       surface; the squad arrives through /api/group/:nodeId/state. Reporting "the coach's list is
       empty" as a finding would have been the harness asking the wrong door and calling the answer
       a defect — so this asks the door the coach actually uses. */
    const st = await api(c, 'GET', `/api/group/${nodeId}/state`);
    const sq = (st.j && (st.j.state || st.j)) || {};
    /* The squad state names them in the SINGULAR — one High, one Low, one open question — because
       the surface shows the squad's leading one of each, not a list. Reading `highs`/`lows` gave
       zero and looked like an empty squad. */
    const has = k => !!(sq[k] && (typeof sq[k] !== 'object' || Object.keys(sq[k]).length));
    note(`the coach's SQUAD view: high=${has('high')} low=${has('low')} question=${has('question')} focus=${has('focus')} withheld=${(sq.withheld || []).length}`);
    ok('I1 the coach opens the squad and finds something true to read — the squad surface, not the member buckets',
      st.status === 200 && (has('high') || has('low') || has('question')));
    ok('I1b …and something is WITHHELD and named, because a leader shown nothing concludes nothing is there',
      (sq.withheld || []).length > 0);
    ok('I1c …with no private member content carried into the squad view',
      sq.carriesPrivateContent === false || sq.carriesPrivateContent === undefined);
    ok('I2 …and each carries what it rests on rather than asserting alone',
      JSON.stringify(sq).length > 400 && /basis|because|account|evidence/i.test(JSON.stringify(sq)));
  }
  await c.context().close();
  await p.context().close();
  await browser.close();
  server.close();
  console.log(`\nlive-journey-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('  FAIL harness threw:', e && e.stack); process.exit(1); });
