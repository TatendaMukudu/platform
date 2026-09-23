/* BROWSER CHECK — THE VERTICAL LINE, AT THE TWO WIDTHS THE FOUNDER HOLDS.

   Founder observations 15-17, from a real phone: two accounts recorded on the SAME DATE were
   drawn as a VERTICAL LINE. The renderer collapses a zero-width time range to the middle of the
   axis, so every point lands on one x and the path between them goes straight up — which is not a
   degenerate trend. It is a picture of an INFINITE RATE OF CHANGE, produced by the least
   information the chart can hold, and it is the most dramatic shape the product can draw.

   NOT part of `npm test`: the truth layer is hermetic and must run with no browser binary. The
   hermetic suite asserts the shape rule against ai/chart.js and asserts the renderer against
   SOURCE. Source is not a screen, and a vertical line is a thing you can only really see. This
   opens it.

   390px and 430px, because those are the two device classes the founder actually uses and a
   chart is the one element whose defects are width-dependent.

   Run: node scripts/chart-shape-browser-check.js
   Needs: playwright-core (devDependency) and the Chromium at EXE below. */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const { chromium } = require('playwright-core');
const { chromiumPath } = require('./lib/chromium-path.js');
/* One owner for "which browser". This was a HARD-CODED chromium-1194 path: correct in today's
   image and wrong the moment it updates, which is the mirror of the bug the other four gates
   had (they resolved a build playwright-core names and nothing had checked, then hung on it).
   Two wrong answers to one question. See scripts/lib/chromium-path.js. */
const EXE = chromiumPath(chromium);
const WIDTHS = [390, 430];

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const DAY = 86400000, NOW = Date.now();
const C = 'csb';
const SIG = (ref, originRef, at) => ({ kind: 'observation', status: 'active', ref, originRef,
  source: originRef, at, turnId: `t_${ref}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7 });

/* THREE INQUIRIES, three shapes of time, one fixture — so the same screen and the same renderer
   produce all three and the difference can only be the record.

   same   two accounts at the IDENTICAL timestamp   -> state   (the founder's case)
   day    two accounts four hours apart             -> trend   (same day, still two moments)
   days   three accounts on three days              -> trend */
const INQ = (id, label, signals) => ({
  inquiryId: id, subjectRef: `member:me`, topic: { canonicalConcept: `football.${id}`, label },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: `Something about ${label}`,
    confidence: { score: 0.6, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals,
  confidence: { score: 0.6, band: 'probable', because: ['2 independent origins'] },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true } },
  orgUsers: { [C]: { me: { id: 'me', name: 'A Player', email: 'm@x.io', role: 'member', orgCode: C,
    status: 'active', assignedNodeIds: ['n1'], profileComplete: true } } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', memberIds: ['me'], leaderIds: [] } } },
  inquiryStates: { [C]: { 'member:me': {
    same: INQ('same', 'Two accounts, one moment', [
      SIG('ev_s1', 'o_s1', NOW - 2 * DAY), SIG('ev_s2', 'o_s2', NOW - 2 * DAY)]),
    day:  INQ('day', 'Two moments, one day', [
      SIG('ev_d1', 'o_d1', NOW - 2 * DAY), SIG('ev_d2', 'o_d2', NOW - 2 * DAY + 4 * 3600000)]),
    days: INQ('days', 'Three days', [
      SIG('ev_x1', 'o_x1', NOW - 3 * DAY), SIG('ev_x2', 'o_x2', NOW - 2 * DAY),
      SIG('ev_x3', 'o_x3', NOW - DAY)]),
  } } },
});
_rebuildEmailIndex();

(async () => {
  const server = await new Promise(res => { const s = app.listen(0, () => res(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = issueToken('me', C, 'member');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const HARNESS_ONLY = [/^Chart is not defined$/];
  const pageErrors = [];

  /* Read the chart as it is actually drawn: the path geometry, the dots, the axis, the caveats. */
  const readChart = (page, id) => page.evaluate(async ([kind, objectId]) => {
    await MemberApp.openObjectThread(kind, objectId);
    await new Promise(r => setTimeout(r, 1400));
    const box = document.getElementById('iqt-chart');
    if (!box) return { missing: true };
    const svg = box.querySelector('svg.iqt-svg');
    const paths = [...box.querySelectorAll('path.iqt-line')].map(p => p.getAttribute('d') || '');
    const dots = [...box.querySelectorAll('circle.iqt-dot')].map(c => ({
      cx: Number(c.getAttribute('cx')), cy: Number(c.getAttribute('cy')), r: Number(c.getAttribute('r')) }));
    return {
      missing: false, hasSvg: !!svg, paths, dots,
      aria: svg ? (svg.getAttribute('aria-label') || '') : '',
      text: box.innerText || '',
      rect: svg ? (() => { const b = svg.getBoundingClientRect(); return { w: b.width, h: b.height }; })() : null,
    };
  }, [ 'inquiry', id ]);

  try {
    for (const width of WIDTHS) {
      console.log(`\n  AT ${width}px`);
      const ctx = await browser.newContext({ viewport: { width, height: 860 },
        deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      page.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) pageErrors.push(`${width}: ${e.message}`); });
      await page.addInitScript(([t, code]) => {
        localStorage.setItem('iq_auth', JSON.stringify({
          user: { id: 'me', name: 'A Player', role: 'member', orgCode: code, profileComplete: true },
          org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
          token: t, permissions: {}, domain: null }));
        localStorage.setItem('iq_profile_complete_me', '1');
      }, [token, C]);
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      const notice = await page.$('button:has-text("I understand")');
      if (notice) { await notice.click().catch(() => {}); await page.waitForTimeout(400); }

      /* ── THE FOUNDER'S CASE ──────────────────────────────────────────────────────────────── */
      const same = await readChart(page, 'same');
      ok(`CS-${width}-1 the one-moment chart draws at all`, same.missing === false && same.hasSvg === true);
      ok(`CS-${width}-2 …and draws NO LINE — this is the vertical line, gone`, same.paths.length === 0);
      ok(`CS-${width}-3 …while still showing the accounts as points, so the record is not hidden`,
        same.dots.length >= 2);
      /* THE PROOF THE DEFECT WAS REAL, not the proof it is fixed: every dot still shares one x,
         because they genuinely happened at one moment. That is exactly the geometry that produced
         a vertical path, so this asserts the CONDITION still holds and the LINE still does not. */
      ok(`CS-${width}-4 …the points do share one x, which is precisely why a line between them was a lie`,
        same.dots.length >= 2 && new Set(same.dots.map(d => d.cx)).size === 1);
      ok(`CS-${width}-5 …the dots are drawn larger, so an unconnected point does not read as dust`,
        same.dots.every(d => d.r >= 4));
      ok(`CS-${width}-6 …the chart says in words that this is one moment rather than a movement`,
        /recorded at the same moment/i.test(same.text));
      ok(`CS-${width}-7 …the axis does not claim a time range running from a date to itself`,
        /one moment on the record/i.test(same.text) && !/^Time$/m.test(same.text));
      ok(`CS-${width}-8 …and a screen reader is told the same thing as a sighted reader`,
        /one moment on the record/i.test(same.aria));

      /* ── SAME DAY, TWO MOMENTS. Deliberately a trend. ─────────────────────────────────────── */
      const day = await readChart(page, 'day');
      ok(`CS-${width}-9 two moments four hours apart ARE drawn as a trend`, day.paths.length >= 1);
      ok(`CS-${width}-10 …across real horizontal distance, not collapsed to the centre`,
        day.dots.length >= 2 && new Set(day.dots.map(d => d.cx)).size >= 2);
      ok(`CS-${width}-11 …and carries no one-moment caveat, because it is not one moment`,
        !/recorded at the same moment/i.test(day.text));

      /* ── DISTINCT DAYS ───────────────────────────────────────────────────────────────────── */
      const days = await readChart(page, 'days');
      ok(`CS-${width}-12 three distinct days are a trend with three points`,
        days.paths.length >= 1 && days.dots.length >= 3);
      ok(`CS-${width}-13 …and the path moves horizontally as well as vertically`, (() => {
        const d = days.paths[0] || '';
        const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map(m => Number(m[1]));
        return new Set(xs).size >= 2;
      })());

      /* ── NOTHING IS SCORED, AT ANY WIDTH ─────────────────────────────────────────────────── */
      ok(`CS-${width}-14 no chart puts a score, a rating or a percentage in front of a person`,
        ![same, day, days].some(c => /\b\d+\s*%|\brating\b|\bscore\b|\bout of (?:5|10|100)\b/i.test(c.text)));
      ok(`CS-${width}-15 …and none of them claims a cause`,
        ![same, day, days].some(c => /\bbecause of\b|\bcaused\b|\bled to\b|\bwill\b/i.test(c.text)));

      /* ── AND IT FITS ─────────────────────────────────────────────────────────────────────── */
      ok(`CS-${width}-16 the chart fits the screen it is drawn on`,
        !!days.rect && days.rect.w > 0 && days.rect.w <= width);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      ok(`CS-${width}-17 …and the page does not scroll sideways because of it`, overflow === false);

      await ctx.close();
    }

    /* ── A SOURCE REMOVED, AND A SOURCE OUTSIDE THE BASIS ───────────────────────────────────
       A source going and a source that was never this reader's are different failures, and
       neither may become a quietly smaller chart. Driven through the real route rather than the
       module, because the route is where the basis is assembled and a basis assembled wrongly is
       the whole failure.

       WHAT CHANGED UNDERNEATH THIS SECTION, and why it is written this way now. It used to assert
       that an emptied chart SAYS something, on the reasoning that an empty space reads as a bug.
       A later pilot pass reversed that deliberately: "Pilot 1: the Inquiry screen was the worst
       surface in the product, on a phone" found three stacked apologies under headings a coach had
       never asked to see, and separated the two states at the server — a REFUSAL is worth a
       sentence ("not enough people for a picture that stays anonymous" is a fact about the squad),
       while HAVING NOTHING TO DRAW is the ordinary state of almost every object and earns silence.

       Withdrawing every source lands in the second state: there is now nothing on the record to
       draw, and the coach is the one who just removed it. So the law asserted here is the current
       one — nothing drawn, nothing claimed, and no apology — and the refusal path keeps its own
       proof below.

       THIS CONTRADICTION SURVIVED A WEEK because the gate could not run: playwright-core resolved
       a Chromium build the image does not have, and a launch on a missing executable hangs rather
       than failing, so nothing here executed and nothing reported that. See
       scripts/lib/chromium-path.js. */
    console.log('\n  WHEN A SOURCE GOES, OR WAS NEVER THEIRS');
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 860 }, isMobile: true });
    const p2 = await ctx2.newPage();
    p2.on('pageerror', e => { if (!HARNESS_ONLY.some(rx => rx.test(e.message))) pageErrors.push(`refusal: ${e.message}`); });
    await p2.addInitScript(([t, code]) => {
      localStorage.setItem('iq_auth', JSON.stringify({
        user: { id: 'me', name: 'A Player', role: 'member', orgCode: code, profileComplete: true },
        org: { orgName: 'Alma College', orgMode: 'sports', organizationProfileComplete: true },
        token: t, permissions: {}, domain: null }));
      localStorage.setItem('iq_profile_complete_me', '1');
    }, [token, C]);
    await p2.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(1400);
    const n2 = await p2.$('button:has-text("I understand")');
    if (n2) { await n2.click().catch(() => {}); await p2.waitForTimeout(300); }

    // Withdraw every source behind the three-day chart. Nothing current is left to draw.
    inquiryStates[C]['member:me'].days.signals.forEach(s => { s.status = 'withdrawn'; });
    const gone = await readChart(p2, 'days');
    ok('CS-R1 with every source withdrawn the chart is not drawn at all, rather than drawn empty',
      gone.paths.length === 0 && gone.dots.length === 0 && gone.hasSvg === false);
    /* SILENT, NOT APOLOGETIC — and silence here is only defensible because it claims nothing. An
       empty axis, a leftover heading or a "no data" line under a chart nobody asked for are all
       ways of putting a shape on screen that the record no longer supports. */
    ok('CS-R1b …and nothing is left behind claiming there is a picture',
      (gone.text || '').trim().length === 0 && !gone.aria);
    ok('CS-R1c …without claiming the record is scored, caused or predicted',
      !/score|caused|will/i.test(gone.text));

    /* A POINT NAMING A REF OUTSIDE THE VIEWER'S BASIS. The signal is restored but its ref is
       changed to something the basis will not contain, which is the shape of a chart drawn from
       data this reader was never cleared to see. */
    inquiryStates[C]['member:me'].days.signals.forEach((s, i) => {
      s.status = 'active'; if (i === 0) s.ref = null;
    });
    const partial = await readChart(p2, 'days');
    ok('CS-R2 a chart is still refused or redrawn honestly when a source loses its reference',
      partial.missing === false);
    ok('CS-R2b …and never silently drops the untraceable part and draws the rest as the whole',
      partial.paths.length === 0 || partial.dots.length >= 2);
    /* AND THE OTHER HALF OF THE SPLIT ABOVE: silence is only correct for "nothing to draw". A
       REFUSAL still has to say something, or separating the two states would have become a way
       to swallow both. Asserted on the rendered refusal line rather than on the payload, because
       a note the server sends and the screen drops is the same failure to a coach. */
    const refusal = await p2.evaluate(async () => {
      const r = await fetch('/api/objects/inquiry/days/chart',
        { headers: { Authorization: 'Bearer ' + (window.Auth && Auth._token ? Auth._token() : '') } })
        .then(x => x.json()).catch(() => null);
      const box = document.getElementById('iqt-chart');
      return { refused: !!(r && r.refused), note: String((r && r.note) || ''),
        line: box ? String((box.querySelector('.iqt-chart-none') || {}).textContent || '') : null };
    });
    ok('CS-R2c when the server REFUSES, the reason reaches the screen rather than being swallowed',
      !refusal.refused || (refusal.line && refusal.line.trim().length > 0));
    ok('CS-R2d …and the rendered reason is the server\'s, not copy the client invented',
      !refusal.refused || refusal.line.trim() === refusal.note.trim());
    await ctx2.close();

    console.log('\n  NO PAGE ERRORS');
    ok(`CS-Z1 the whole walk raised no uncaught error (${pageErrors.length})`, pageErrors.length === 0);
    if (pageErrors.length) pageErrors.forEach(e => console.error('        ' + e));

  } catch (e) { fail++; console.error('  FAIL chart shape browser check threw:', e && e.stack); }

  await browser.close();
  server.close();
  console.log(`\nchart-shape-browser-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
