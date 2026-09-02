/* Truth layer — A COMPOSER THAT IS OFF LOOKS EXACTLY LIKE A COMPOSER THAT IS DULL.

   The founder sent a screenshot of a reply that read like a template and asked what was going
   on. There was no way to answer it from the screenshot, and no way to answer it from the app:
   the composer has four separate exits, all of them silent, all of them producing the same
   deterministic reply on the phone.

     · IQ_COMPOSER is not 1 on the host          → the model never writes anything, ever
     · no key / deterministic-only mode           → same, for a different reason
     · the org is over its LLM budget             → intermittent, looks like the model got worse
     · the grounding cage refused what was written → the system working correctly

   The first two are configuration and want a redeploy. The third is a rate limit and wants
   waiting. The fourth is the cage doing its job and wants a retrieval fix. They are opposite
   diagnoses and until now the only place that distinguished them was the host's stdout, which
   the person holding the phone cannot read.

   This is the same defect class as the cache stamp and the undefined CSS tokens: everything
   green, everything deployed, and the truth about what the user is actually getting living
   somewhere they cannot see. So:

     · /api/health — public, switches only — names WHICH switch silenced the composer
     · each of the exits increments its OWN counter, so a tally can tell "never ran" from
       "ran and was refused"
     · health carries no key, no org data, and no refusal text (a grounding violation quotes
       what the model invented, which can name a person)

   Run: node scripts/composer-visibility-smoke.js */

'use strict';
process.env.DB_OPTIONAL  = '1';
process.env.NODE_ENV     = 'test';
process.env.IQ_COMPOSER  = '1';

const path = require('path');
const { execFileSync } = require('child_process');
const gateway = require('../ai/gateway.js');

// A key is "present" so enabled() is true to start with; nothing is ever called.
let _enabled = true;
gateway.enabled = () => _enabled;
gateway.complete = async () => 'Understood.';
gateway.completeJSON = async () => null;

const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = require('../server.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'cvz';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Demo Athletic Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    boss: { id: 'boss', name: 'Ada Boss', role: 'superadmin', orgCode: C, status: 'active' },
    maya: { id: 'maya', name: 'Maya Chen', role: 'member',     orgCode: C, status: 'active' },
  } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = () => fetch(base + '/api/health').then(r => r.json());
  const HM = { Authorization: `Bearer ${issueToken('maya', C, 'member')}`, 'Content-Type': 'application/json' };
  const HB = { Authorization: `Bearer ${issueToken('boss', C, 'superadmin')}` };
  const turn = (text) => fetch(base + '/api/assistant/turn', {
    method: 'POST', headers: HM, body: JSON.stringify({ text }) }).then(r => r.json());
  const tally = () => fetch(base + '/api/admin/metrics', { headers: HB }).then(r => r.json());
  // snapshot() returns an ARRAY of per-org rows, busiest first — not a map. Getting this wrong
  // made CV8 red and CV9 green for the same reason, which is the tell: a lookup that finds
  // nothing satisfies every "should be zero" assertion for free.
  const countOf = (snap, event) => {
    const row = ((snap && snap.metrics) || []).find(r => r && r.orgCode === C);
    return Number((row && row.events && row.events[event]) || 0);
  };

  try {
    /* ── CV1-3: the composer's state is legible from a browser, with no login. ── */
    const h1 = await health();
    ok('CV1 health reports whether the composer is on at all — the switch that decides who writes every reply',
      h1.composer && typeof h1.composer.on === 'boolean');
    ok('CV2 …with the composer on and a key present, it says so',
      h1.composer.on === true && /^on —/.test(h1.composer.writes));
    ok('CV3 …and reports the deterministic-only switch separately, since it silences the model even WITH a key',
      h1.composer.deterministicOnly === false);

    /* ── CV4: the reason is named, not just the state. "Off" sends someone to read logs;
       "off — no language-model key is configured" is a diagnosis. ── */
    _enabled = false;
    const h2 = await health();
    ok('CV4 with the key gone, health names THAT as the reason rather than reporting a bare "off"',
      /^off —/.test(h2.composer.writes) && /key/.test(h2.composer.writes));
    ok('CV5 …and says plainly what the person is getting instead',
      /deterministic templates/.test(h2.composer.writes));

    /* ── CV6: deterministic-only is reported as its own cause. A key IS configured here, so a
       health check that only looked at the key would say "connected" while every reply came
       from a template. ── */
    _enabled = true;
    gateway.setDeterministicOnly(true);
    const h3 = await health();
    ok('CV6 deterministic-only mode is named as its own cause — the key is present, so nothing else would catch it',
      h3.composer.deterministicOnly === true && /deterministic-only/.test(h3.composer.writes));
    gateway.setDeterministicOnly(false);

    /* ── CV7: health is public. It must carry switches and nothing else. ── */
    const flat = JSON.stringify(h1);
    ok('CV7 health leaks nothing — no key material, no org, no person, no refusal text',
      !/sk-|api[_-]?key|ANTHROPIC_API_KEY=|Maya|Ada|cvz/i.test(flat));

    /* ── CV8-10: the exits are COUNTED, separately. This is the half that survives after the
       switches are set correctly — a refusal and a budget stop both leave the switches
       reading "on". ── */
    _enabled = false;                       // composer on, model unavailable → skipped
    await turn('How is my week looking?');
    const t1 = await tally();
    ok('CV8 an exit taken with the composer ON is counted as a skip, not silently dropped',
      countOf(t1, 'composer_skipped') >= 1);
    ok('CV9 …and is NOT counted as the composer having been off, which is a different fix',
      countOf(t1, 'composer_off') === 0);
    _enabled = true;

    /* ── CV11: every exit in the source has a counter. Mechanical, because the failure mode is
       somebody adding a fifth exit that returns null quietly — which is precisely how the
       first four came to be silent. ── */
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function _composeTurn('), src.indexOf('/* ── THE EARS'));
    const exits = (fn.match(/return null;/g) || []).length;
    // composer_used marks the SUCCESS path, not an exit. Counting it here let a deleted exit
    // counter hide behind it — the mutation that removed the skip counter left this green
    // while CV8 went red. An assertion that a stronger assertion has to rescue is not one.
    const counters = (fn.match(/_metric\(code, [^)]*['"]composer_(?!used)/g) || []).length;
    ok('CV10 the composer body is found (the slice is not empty, which would make CV11 vacuous)',
      fn.length > 500 && exits >= 3);
    ok('CV11 every silent exit from the composer increments a counter — no exit may be added without one',
      counters >= exits);

    /* ── CV12: IQ_COMPOSER unset. A separate process, because the flag is read once at boot —
       which is itself the reason it can be wrong on a host for weeks without anyone noticing. ── */
    const child = `
      process.env.DB_OPTIONAL='1'; process.env.NODE_ENV='test'; delete process.env.IQ_COMPOSER;
      const g=require('${path.join(__dirname, '..', 'ai', 'gateway.js')}'); g.enabled=()=>true;
      const {app}=require('${path.join(__dirname, '..', 'server.js')}');
      const s=app.listen(0,async()=>{
        const r=await fetch('http://127.0.0.1:'+s.address().port+'/api/health').then(r=>r.json());
        console.log(JSON.stringify(r.composer)); s.close(); process.exit(0);
      });`;
    let childComposer = null;
    try {
      const out = execFileSync(process.execPath, ['-e', child], { encoding: 'utf8', timeout: 30000 });
      childComposer = JSON.parse(out.trim().split('\n').pop());
    } catch (e) { console.error('       child probe failed:', e.message); }
    ok('CV12 on a host where IQ_COMPOSER was never set, health says so — with a key present and everything else green',
      !!childComposer && childComposer.on === false && /IQ_COMPOSER/.test(childComposer.writes || ''));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\ncomposer-visibility-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
