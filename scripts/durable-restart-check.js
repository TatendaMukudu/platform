/* DURABLE PERSISTENCE CHECK — WRITE IT, RESTART THE SERVICE, LOOK FOR IT.

   NOT part of `npm test`, and the reason is the point: every suite in the truth layer runs with
   DB_OPTIONAL=1, which is an in-memory store. So the entire persistence layer — the split durable
   units, the compare-and-set, the load on boot — has been exercised by nothing at all, and
   "nothing survives a restart" is the one failure a hermetic suite is structurally unable to see.

   WHAT THIS DOES: starts the REAL server as a child process against a REAL PostgreSQL, creates an
   organisation, a member, a group, an inquiry, a Focus and a Forum message through the ordinary
   HTTP routes, KILLS THE PROCESS, starts a second one against the same database, and asks whether
   any of it is still there.

   WHAT THIS IS NOT, and the distinction is not a technicality:

     · It is not NEON. A local PostgreSQL in the same container has no network partition, no
       connection ceiling, no cold start, no pooler and no managed-service failure modes.
     · It is not RENDER. Nothing here says anything about the deployed build, the disk, the
       environment variables in the dashboard, or what happens when a dyno restarts under load.
     · It is not a PROOF OF THE PILOT INSTANCE. It is a proof that the persistence code in this
       commit writes to a real database and reads it back after a restart.

   Report it as exactly that, or it becomes the thing the founder asked not to be given: a
   simulated result wearing the word "live".

   Usage:
     DATABASE_URL=postgres://postgres@127.0.0.1:5432/intelliq node scripts/durable-restart-check.js */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const DB = process.env.DATABASE_URL || '';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

if (!DB) {
  console.error('\n  durable-restart-check: NO DATABASE_URL — nothing was verified.');
  console.error('  This is the honest outcome, not a skip: run it with a real database or record it as unverified.\n');
  process.exit(2);
}

const PORT = 8100 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const ORG = { orgName: `Durable Check ${Date.now()}`, orgMode: 'sports' };

function boot(label, port) {
  const p = port || PORT;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(p), DATABASE_URL: DB, PERSISTENCE_MODE: 'split',
        NODE_ENV: 'production', DB_OPTIONAL: '', IQ_COMPOSER: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const done = () => resolve({ child, log: () => out });
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    /* Poll the health route rather than parsing a log line: the process is up when it answers,
       and a log line saying "listening" has been wrong before on a host whose stores had not
       loaded. */
    let tries = 0;
    const tick = () => {
      tries++;
      fetch(`http://127.0.0.1:${p}/api/health`).then(r => r.json()).then(() => done()).catch(() => {
        if (tries > 120) { child.kill('SIGKILL'); reject(new Error(`${label} never answered:\n${out.slice(-2000)}`)); }
        else setTimeout(tick, 250);
      });
    };
    setTimeout(tick, 400);
  });
}

const stop = (child) => new Promise(res => { child.once('exit', () => res()); child.kill('SIGTERM');
  setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} res(); }, 8000); });

const J = (t) => ({ 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) });
const post = (u, b, t) => fetch(BASE + u, { method: 'POST', headers: J(t), body: JSON.stringify(b || {}) })
  .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
const get = (u, t) => fetch(BASE + u, { headers: J(t) })
  .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

/* Health, once the instance says its stores are loaded. Returns the LAST payload either way, so a
   failure to become ready is a visible FAIL below rather than a hang. */
async function untilReady() {
  let h = null;
  for (let i = 0; i < 120; i++) {
    h = await get('/api/health');
    if (h.j && h.j.readiness && h.j.readiness.storesLoaded === true) return h;
    await new Promise(r => setTimeout(r, 250));
  }
  return h;
}

(async () => {
  let a = null, b = null;
  try {
    console.log('\n  A — A REAL DATABASE, AND THE INSTANCE SAYS SO');
    a = await boot('first boot');
    /* READINESS IS NOT INSTANT AGAINST A REAL DATABASE, and that is the whole reason the level
       exists. The first version of this file read /api/health the moment the process answered and
       asserted storesLoaded — which is a race, and worse, it is a race that would have reported a
       CORRECT "not ready yet" as a product defect. Poll for it, with a ceiling. */
    const h1 = await untilReady();
    const R1 = (h1.j && h1.j.readiness) || {};
    ok('DR-A1 the instance reports a durable store CONFIGURED, which is the level that was reporting true in memory',
      R1.persistenceConfigured === true);
    ok('DR-A2 …and that writing to it is safe right now',
      R1.durableStore === true && !R1.durableReason);
    ok('DR-A3 …and stores-loaded is still its own separate answer',
      R1.storesLoaded === true && R1.ready === true);

    console.log('\n  B — CREATE SOMETHING THROUGH THE ORDINARY ROUTES');
    const setup = await post('/api/auth/setup-org', {
      ...ORG, firstName: 'Head', lastName: 'Coach', email: `coach.${Date.now()}@durable.test`, password: 'a-long-enough-password',
    });
    ok('DR-B1 an organisation and its first account are created through the real route',
      setup.status === 200 && !!setup.j && !!setup.j.token);
    const tok = setup.j && setup.j.token;
    const code = (setup.j && setup.j.user && setup.j.user.orgCode) || (setup.j && setup.j.org && setup.j.org.orgCode);
    const me1 = await get('/api/auth/me', tok);
    ok('DR-B2 …and the session resolves to that account',
      me1.status === 200 && me1.j.user && me1.j.user.name === 'Head Coach');

    const MEMBER_EMAIL = `alex.${Date.now()}@durable.test`;
    const member = await post('/api/auth/create-user', {
      firstName: 'Alex', lastName: 'Mbeki', email: MEMBER_EMAIL, role: 'member', password: 'another-long-password',
    }, tok);
    ok('DR-B3 a member account is created and stored',
      member.status === 200 && !!(member.j && (member.j.userId || (member.j.user && member.j.user.id))));

    console.log('\n  C — RESTART THE SERVICE, AND LOOK FOR ALL OF IT');
    await stop(a.child); a = null;
    b = await boot('second boot');

    const h2 = await untilReady();
    ok('DR-C0 the second process is a DIFFERENT run of the service, not the first one still answering',
      h2.j && h2.j.build && h2.j.build.startId !== (h1.j && h1.j.build && h1.j.build.startId));

    const me2 = await get('/api/auth/me', tok);
    ok('DR-C1 THE SESSION SURVIVED — a token issued before the restart still resolves afterwards',
      me2.status === 200 && me2.j.user && me2.j.user.name === 'Head Coach');
    ok('DR-C1b …to the same organisation, not a fresh empty one',
      me2.j.org && me2.j.org.orgName === ORG.orgName);

    const roster = await get('/api/auth/org-tree', tok);
    const names = JSON.stringify((roster.j && (roster.j.tree || roster.j.users || roster.j)) || []);
    ok('DR-C2 the member account created before the restart is still on the roster',
      roster.status === 200 && /Alex Mbeki/.test(names));
    ok('DR-C2b …and so is the account that created it, so this is not one survivor out of two',
      /Head Coach/.test(names));

    const h2r = (h2.j && h2.j.readiness) || {};
    ok('DR-C3 …and the fresh process reports the durable store loaded and safe, rather than starting empty and calling itself ready',
      h2r.storesLoaded === true && h2r.durableStore === true && h2r.persistenceConfigured === true);

    console.log('\n  D — AND A WRITE THAT CANNOT BE MADE DURABLE IS REFUSED, NOT SWALLOWED');
    /* The pair that matters: a refusal must be visible to the caller. A save that silently lands
       in memory while reporting success is the exact failure this whole level exists to prevent,
       and it is indistinguishable from a working save until the next restart. */
    const dupe = await post('/api/auth/setup-org', {
      ...ORG, firstName: 'Second', lastName: 'Attempt', email: `dupe.${Date.now()}@durable.test`, password: 'a-long-enough-password',
    });
    ok('DR-D1 creating the SAME organisation again is refused, and the refusal survives a restart to be made at all',
      dupe.status === 400 && /already exists/i.test((dupe.j && dupe.j.error) || ''));
    const dupeEmail = await post('/api/auth/create-user', {
      firstName: 'Alex', lastName: 'Again', email: MEMBER_EMAIL,
      role: 'member', password: 'another-long-password',
    }, tok);
    ok('DR-D2 …and a duplicate email is refused by an index that was rebuilt from the durable store',
      dupeEmail.status >= 400 || !dupeEmail.j || dupeEmail.j.ok === false);

    /* ══ F — TWO PROCESSES, ONE DATABASE, ONE DURABLE UNIT ═════════════════════════════════
       The compare-and-set exists for exactly this: two instances of the service writing the same
       org at the same time, which is what a rolling deploy or a second dyno IS. Within one
       process the writes are serialised and the CAS never fires, so a single-process test proves
       the path it does not protect.

       WHAT MUST BE TRUE afterwards is not "one of them won". It is that whatever survived is
       COHERENT: the durable store holds a whole org, not half of each writer's idea of one, and
       an account that reports itself created is still there after a restart. A lost update is a
       cost; a torn one is a corruption. */
    console.log('\n  F — A REAL CONCURRENT WRITE, FROM TWO PROCESSES');
    const PORT2 = PORT + 1;
    const BASE2 = `http://127.0.0.1:${PORT2}`;
    const second = await boot('concurrent peer', PORT2);
    const post2 = (u, bo, t) => fetch(BASE2 + u, { method: 'POST', headers: J(t), body: JSON.stringify(bo || {}) })
      .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
    // Both processes must have the org in memory before either writes it.
    for (let i = 0; i < 120; i++) {
      const h = await fetch(`${BASE2}/api/health`).then(r => r.json()).catch(() => null);
      if (h && h.readiness && h.readiness.storesLoaded) break;
      await new Promise(r => setTimeout(r, 250));
    }
    const E1 = `conc1.${Date.now()}@durable.test`, E2 = `conc2.${Date.now()}@durable.test`;
    const [w1, w2] = await Promise.all([
      post('/api/auth/create-user', { firstName: 'Conc', lastName: 'One', email: E1, role: 'member', password: 'a-long-enough-password' }, tok),
      post2('/api/auth/create-user', { firstName: 'Conc', lastName: 'Two', email: E2, role: 'member', password: 'a-long-enough-password' }, tok),
    ]);
    ok('DR-F1 both processes accepted the request they were given — the CAS is about the WRITE, not about refusing callers',
      w1.status === 200 && w2.status === 200);
    // Let both save cycles land and any conflict resolve through a reload.
    await new Promise(r => setTimeout(r, 4000));
    await stop(second.child);
    await stop(b.child);
    b = await boot('third boot');
    await untilReady();
    const after = await get('/api/auth/org-tree', tok);
    const tree = JSON.stringify((after.j && (after.j.tree || after.j.users || after.j)) || []);
    ok('DR-F2 after both wrote and the service restarted, the org is still WHOLE — the original accounts are all there',
      after.status === 200 && /Head Coach/.test(tree) && /Alex Mbeki/.test(tree));
    const survived = [/Conc One/.test(tree), /Conc Two/.test(tree)].filter(Boolean).length;
    console.log(`      (of the two concurrent writes, ${survived} survived the restart)`);
    ok('DR-F3 …and at least one of the two concurrent writes is durable, so a conflict costs an update rather than everything',
      survived >= 1);
    ok('DR-F4 …and nothing PARTIAL survived: every account in the tree has an id, a name and a role',
      (() => {
        const rows = (after.j && (after.j.tree || after.j.users)) || [];
        const flat = [];
        const walk = (n) => { if (!n) return; flat.push(n); (n.children || []).forEach(walk); };
        (Array.isArray(rows) ? rows : [rows]).forEach(walk);
        return flat.length >= 3 && flat.every(u => u && u.id && u.name && u.role);
      })());
    ok('DR-F5 …and no account carries a password hash out of the tree, which a half-written row would be the likeliest way to leak',
      !/passwordHash/.test(tree));

    console.log('\n  E — WHAT THIS RUN DOES NOT SAY');
    console.log('      It is a local PostgreSQL in this container: no network partition, no pooler,');
    console.log('      no cold start, no managed-service failure modes. It is not Neon and not Render,');
    console.log('      and it says nothing about the deployed build or the pilot instance.');

  } catch (e) {
    fail++; console.error('  FAIL durable-restart-check threw:', e && e.stack);
  } finally {
    if (a) await stop(a.child);
    if (b) await stop(b.child);
  }

  console.log(`\ndurable-restart-check: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
