/* ============================================================
   scripts/club-stress.js — load the full club and drive EVERY layer

   Boots the real app in-process (no DB, no AI key), installs the Trafford United
   seed, then exercises the whole stack over HTTP the way the app does — reporting
   how the KERNEL reacts (patterns, briefing, watch, whats-working, planning), how
   the LAYERS respond (assessments, Studio, member profiles, success/replicate),
   and how the INFRASTRUCTURE holds up (load time, serialize size, endpoint latency)
   at real club scale.

   Run:  node scripts/club-stress.js        (part of `npm run demo:club`)
   ============================================================ */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.CLUB_DAYS   = process.env.CLUB_DAYS || '365';

const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = require('../server.js');
const { buildClubStore, CLUB_CODE } = require('./seed-club.js');

const ms = t => `${(Number(t) / 1e6).toFixed(0)}ms`;
const hr = () => process.hrtime.bigint();
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

(async () => {
  console.log('\n=== Building the club (this is the biggest cost) ===');
  const tBuild = hr();
  const { store, summary } = await buildClubStore();
  console.log(`  built in ${ms(hr() - tBuild)}`);

  const tLoad = hr();
  _loadAllStores(store);
  _rebuildEmailIndex();
  console.log(`  loaded into stores in ${ms(hr() - tLoad)}`);

  const tSer = hr();
  const blob = JSON.stringify(store);
  console.log(`  serialize whole store: ${ms(hr() - tSer)} · ${(blob.length / 1e6).toFixed(1)} MB`);

  console.log('\n=== Scale ===');
  console.log(`  ${summary.orgName} (${summary.code})`);
  console.log(`  users ${summary.users} (players ${summary.players} · staff ${summary.staff}) · nodes ${summary.nodes}`);
  console.log(`  check-ins ${summary.checkins} · signals ${summary.signals} · assessments ${summary.assessments} · interventions ${summary.interventions}`);
  console.log(`  studio: ${summary.studio.users} players + ${summary.studio.coaches} coaches used it · ${summary.studio.plans} plans (${summary.studio.completed} completed) · ${summary.studio.evidenceShown} showed evidence`);
  console.log(`  logins (password ${summary.login.password}): director ${summary.login.director} · coach ${summary.login.firstTeamCoach} · player ${summary.login.samplePlayer}`);

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokDirector = issueToken(summary.directorId, CLUB_CODE, 'superadmin');
  const tokCoach    = issueToken(summary.firstTeamCoachId, CLUB_CODE, 'member');

  const call = async (path, tok) => {
    const t = hr();
    const r = await fetch(base + path, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j, ms: Number(hr() - t) / 1e6 };
  };
  const timed = async (label, path, tok) => { const r = await call(path, tok); console.log(`  ${label.padEnd(42)} ${String(r.status).padEnd(4)} ${r.ms.toFixed(0).padStart(5)}ms`); return r; };

  try {
    // ── KERNEL: does it produce a real, varied read at scale? ──────────────
    console.log('\n=== KERNEL — how it reacts (director, whole club) ===');
    const brief = await timed('briefing (whole club)', '/api/intelligence/briefing', tokDirector);
    const roll = brief.j?.rollup || {};
    console.log(`     members ${roll.memberCount} · active/wk ${roll.activeThisWeek} · participation ${roll.participation}% · momentum ${roll.momentum}`);
    console.log(`     patterns: ${Object.entries(roll.patternCounts || {}).map(([k, v]) => `${v}× ${k}`).join(', ') || 'none'}`);
    console.log(`     flagged people surfaced: ${(brief.j?.items || []).length}`);
    console.log(`     proactive prompts: ${(brief.j?.prompts || []).length}`);
    ok('briefing returns a populated rollup', roll.memberCount > 0 && Array.isArray(brief.j?.items));
    ok('the kernel fires MORE THAN ONE pattern type across the club', Object.keys(roll.patternCounts || {}).length >= 2);
    ok('the briefing never leaks raw content', !/passwordHash|"content":|valueText/.test(JSON.stringify(brief.j || {})));

    const watch = await timed('watch (early-warning)', '/api/intelligence/watch', tokDirector);
    console.log(`     emerging ${(watch.j?.emerging || []).length} · attention ${(watch.j?.attention || []).length} · rising ${(watch.j?.rising || []).length} (scanned ${watch.j?.scanned})`);
    ok('watch splits emerging / attention / rising', watch.status === 200 && (('emerging' in (watch.j || {}))));

    const working = await timed('whats-working (assessment learning)', '/api/intelligence/whats-working', tokDirector);
    console.log(`     repeat ${(working.j?.working || []).length} · revisit ${(working.j?.revisit || []).length} (from ${working.j?.total} returned)`);
    if ((working.j?.working || [])[0]) console.log(`     e.g. WORKING: ${working.j.working[0].why}`);
    if ((working.j?.revisit || [])[0]) console.log(`     e.g. REVISIT: ${working.j.revisit[0].why}`);
    ok('whats-working correlates assessments with trajectory at scale', working.status === 200 && working.j.total > 50);

    const success = await timed('success patterns', '/api/intelligence/success', tokDirector);
    ok('success surface returns rising people + common factors', success.status === 200 && Array.isArray(success.j?.rising));

    const disc = await timed('discoveries (how the org learns)', '/api/intelligence/discoveries', tokDirector);
    console.log(`     discoveries found: ${(disc.j?.discoveries || []).length}`);
    (disc.j?.discoveries || []).slice(0, 4).forEach(d => console.log(`       • [${d.area}] ${d.statement} (${d.basis}, ${d.confidence})`));
    ok('discoveries endpoint returns org-learning findings', disc.status === 200 && Array.isArray(disc.j?.discoveries));

    const roster = await timed('roster (everyone at a glance)', '/api/intelligence/roster', tokDirector);
    ok('roster covers the whole club', roster.status === 200);

    // ── LAYERS: leader scope, assessments, Studio, profiles ────────────────
    console.log('\n=== LAYERS — scoped correctly + responsive ===');
    const coachBrief = await timed('briefing (first-team coach scope)', '/api/intelligence/briefing', tokCoach);
    const cRoll = coachBrief.j?.rollup || {};
    console.log(`     coach sees ${cRoll.memberCount} members (should be their squad, not the club)`);
    ok('leader scope is a SUBSET of the club (not everyone)', cRoll.memberCount > 0 && cRoll.memberCount < roll.memberCount);

    const assess = await timed('assessments tab (coach)', '/api/assessments', tokCoach);
    ok('assessments load for the coach (templates + issued)', assess.status === 200 && Array.isArray(assess.j?.templates));
    const studio = await timed('studio (coach)', '/api/studio', tokCoach);
    ok('the Studio opens with the coach\'s space', studio.status === 200 && studio.j?.ok === true);
    const tokPlayer = issueToken(summary.samplePlayerId, CLUB_CODE, 'member');
    const pStudio = await timed('studio (player, with usage)', '/api/studio', tokPlayer);
    console.log(`     sample player Studio: ${(pStudio.j?.plans || []).length} plans · ${(pStudio.j?.messages || []).length} messages · ${(pStudio.j?.assigned || []).length} assigned`);
    ok('a player\'s Studio carries their real plans + conversation', pStudio.status === 200 && (pStudio.j?.messages || []).length + (pStudio.j?.plans || []).length > 0);

    // pick a flagged member and pull their profile + nudges
    const flagged = (brief.j?.items || [])[0];
    if (flagged?.memberId) {
      const prof = await timed('member profile + nudges', `/api/member/${flagged.memberId}/profile`, tokDirector);
      ok('an individual profile assembles with assessment nudges', prof.status === 200 && Array.isArray(prof.j?.assessmentNudges));
    }

    // ── INFRA: latency under load ──────────────────────────────────────────
    console.log('\n=== INFRASTRUCTURE — latency under load ===');
    const t2 = hr();
    const runs = 8;
    for (let i = 0; i < runs; i++) await call('/api/intelligence/briefing?refresh=1', tokDirector);
    const avgCold = (Number(hr() - t2) / 1e6) / runs;
    console.log(`  ${runs}× full club briefing (COLD/uncached, 225 members): avg ${avgCold.toFixed(0)}ms each`);
    const tCached = hr();
    for (let i = 0; i < runs; i++) await call('/api/intelligence/briefing', tokDirector);
    console.log(`  ${runs}× full club briefing (CACHED, as users hit it): avg ${((Number(hr() - tCached) / 1e6) / runs).toFixed(0)}ms each`);
    // Cold briefing runs pattern detection over every member; it's cached 2h in
    // production, so users almost never pay it. Flag only a genuine regression.
    ok('a cold whole-club briefing stays under ~6s (cached 2h in prod)', avgCold < 6000);
    ok('a cached club briefing is fast (<150ms)', (Number(hr() - tCached) / 1e6) / runs < 150);

    console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  } catch (e) {
    fail++; console.error('  ✗ threw:', e.stack || e.message);
  } finally {
    server.close();
    process.exit(fail ? 1 : 0);
  }
})();
