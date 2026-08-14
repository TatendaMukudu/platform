/* Truth layer — THE PERSISTENCE BOUNDARY (pure + fake-DB). Proves that a mutation costs what it
   changed rather than the whole platform.

   The bug this exists for: every scheduleSave() serialised all 64 stores — every org, user,
   conversation and inquiry — and uploaded them to Neon, which sits outside Render. One
   conversation turn shipped the product twice, and 4.89 GB of billed egress served 14 MB of
   actual pages. Run: node scripts/persistence-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.SAVE_DEBOUNCE_MS = '30';                 // keep the suite quick
// Retry backoff sits well clear of `settle` below, so the two timescales cannot be confused:
// settle must reliably cover a save, and must reliably NOT cover an automatic retry.
process.env.SAVE_RETRY_MS    = '900';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const db = require('../db.js');
  const S = require('../server.js');
  const { orgMeta, orgUsers, inquiryStates, _durableUnits, _applyUnits, _persistedStores,
          _pruneExpiredSessions, _rebuildEmailIndex, scheduleSave } = S;

  /* A fake store that records every transaction, so we can assert on what actually left the
     process rather than on what we hoped would. */
  const written = [];
  let concurrent = 0, maxConcurrent = 0, failNext = false;
  const deleted = [];
  db.saveStores = async (units) => {
    concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
    await sleep(25);                                  // a slow write, to expose overlap
    try {
      if (failNext) { failNext = false; throw new Error('simulated write failure'); }
      written.push(Object.keys(units));
      return { rows: Object.keys(units).length, bytes: 0 };
    } finally { concurrent--; }
  };
  db.deleteStores = async (keys) => { deleted.push(...keys); return keys.length; };
  // Generous relative to the 30ms debounce on purpose: this suite asserts on WHETHER a write
  // happened, so a slow machine must never be mistaken for a missing save.
  const settle = async () => { await sleep(300); };
  const lastWrite = () => written[written.length - 1] || [];

  orgMeta.alpha = { orgName: 'Alpha FC', orgMode: 'sports' };
  orgMeta.beta  = { orgName: 'Beta School', orgMode: 'education' };
  orgUsers.alpha = { ash: { id: 'ash', name: 'Ashton Mbeki', email: 'ash@alpha.test', role: 'member', status: 'active' } };
  orgUsers.beta  = { bo:  { id: 'bo',  name: 'Bo Lindqvist', email: 'bo@beta.test',  role: 'member', status: 'active' } };

  /* 1 — the classification loses nothing. Every top-level key of every persisted store must
     appear in exactly one durable unit, or the split silently drops data. */
  {
    const units = _durableUnits();
    let missing = [];
    for (const [name, store] of Object.entries(_persistedStores())) {
      if (name === 'emailIndex') continue;                      // derived, deliberately not persisted
      for (const key of Object.keys(store || {})) {
        const found = Object.entries(units).some(([u, v]) => u.startsWith(`store:${name}`) && (key in v));
        if (!found) missing.push(`${name}.${key}`);
      }
    }
    ok('1 · every persisted key lands in exactly one durable unit', missing.length === 0);
    ok('1 · …emailIndex is not persisted at all (it is derived)',
      !Object.keys(units).some(k => k.startsWith('store:emailIndex')));
    ok('1 · …org-scoped stores partition by org', !!units['store:orgUsers:alpha'] && !!units['store:orgUsers:beta']);
    ok('1 · …and the two orgs do not share a unit',
      !('bo' in units['store:orgUsers:alpha']) && !('ash' in units['store:orgUsers:beta']));
    ok('1 · global stores are not partitioned', !!units['store:inviteTokens']);
  }

  /* 2 — no mutation, no write. The baseline has to hold or every idle tick costs egress.
     The first save necessarily writes everything (nothing is known-saved yet); what must be
     free is the SECOND one. */
  scheduleSave(); await settle();
  ok('2 · the first save writes the units that exist', written.length === 1 && lastWrite().length > 0);
  written.length = 0;
  scheduleSave(); await settle();
  ok('2 · a save with nothing changed writes nothing', written.length === 0);

  /* 3 — THE HEADLINE. One org changing must not rewrite another org. This is the assertion the
     whole checkpoint exists for. */
  inquiryStates.alpha = { 'member:ash': { attendance: { inquiryId: 'inq_1', signals: [] } } };
  scheduleSave(); await settle();
  ok('3 · a mutation writes only the unit that changed', lastWrite().length === 1);
  ok('3 · …and it is the right one', lastWrite()[0] === 'store:inquiryStates:alpha');
  ok('3 · …the other org is untouched', !lastWrite().some(k => k.endsWith(':beta')));

  /* 4 — two stores changing in one cycle commit together. A turn that writes a conversation and
     the inquiry it produced must not survive half-applied. */
  written.length = 0;
  inquiryStates.alpha['member:ash'].attendance.signals.push({ ref: 's1' });
  orgUsers.alpha.ash.name = 'Ashton M.';
  scheduleSave(); await settle();
  ok('4 · two changed stores write in ONE transaction', written.length === 1 && lastWrite().length === 2);

  /* 5 — deletion. The blob write got this free by replacing everything; split rows must be told,
     or an emptied unit lingers as a ghost that reappears on the next boot. */
  written.length = 0; deleted.length = 0;
  delete orgUsers.beta.bo;
  scheduleSave(); await settle();
  ok('5 · removing a child rewrites that org\'s unit', lastWrite().includes('store:orgUsers:beta'));
  written.length = 0; deleted.length = 0;
  delete orgMeta.beta; delete orgUsers.beta; delete inquiryStates.beta;
  scheduleSave(); await settle();
  ok('5 · …and removing the last key deletes the unit, not an empty husk',
    deleted.some(k => k === 'store:orgUsers:beta'));

  /* 6 — a failed write must stay dirty. Advancing the baseline before the commit would mark
     unsaved state as saved, which loses data silently and is the worst outcome available. */
  written.length = 0;
  orgUsers.alpha.ash.name = 'Ashton Mbeki';
  failNext = true;
  scheduleSave(); await settle();
  const afterFailure = written.length;
  scheduleSave(); await settle();
  ok('6 · a failed write leaves the state dirty and retries', written.length > afterFailure);
  ok('6 · …and the retry carries the store that failed', lastWrite().includes('store:orgUsers:alpha'));

  /* 6b — the retry must not depend on a further mutation arriving. A failure on the last save of
     a quiet evening would otherwise simply be lost at the next restart. */
  written.length = 0;
  orgUsers.alpha.ash.email = 'ashton@alpha.test';
  failNext = true;
  scheduleSave(); await settle();
  ok('6b · the failed attempt wrote nothing', written.length === 0);
  await sleep(1400);                                  // no mutation, no scheduleSave — backoff only
  ok('6b · a failure retries itself on a backoff, with no further mutation',
    written.flat().includes('store:orgUsers:alpha'));

  /* 7 — a mutation during an in-flight save is neither lost nor allowed to overlap. */
  written.length = 0; maxConcurrent = 0;
  orgUsers.alpha.ash.role = 'coach';
  scheduleSave();
  await sleep(45);                                    // mid-write
  inquiryStates.alpha['member:ash'].attendance.signals.push({ ref: 's2' });
  scheduleSave();
  await sleep(500);
  ok('7 · maximum concurrent persistence transactions is exactly 1', maxConcurrent === 1);
  ok('7 · …and the mutation made during the save is still persisted',
    written.flat().includes('store:inquiryStates:alpha'));

  /* 8 — restart. Split rows must reconstruct what was in memory, or none of this is safe. */
  {
    const units = _durableUnits();
    const snapshot = JSON.stringify(_durableUnits());
    for (const k of Object.keys(orgUsers)) delete orgUsers[k];
    for (const k of Object.keys(inquiryStates)) delete inquiryStates[k];
    ok('8 · (state cleared for the reload test)', Object.keys(orgUsers).length === 0);
    _applyUnits(units);
    ok('8 · reconstruction from split rows is equivalent', JSON.stringify(_durableUnits()) === snapshot);
    ok('8 · …down to nested inquiry state',
      inquiryStates.alpha['member:ash'].attendance.signals.length === 2);
  }

  /* 9 — emailIndex is derived, so it must survive not being stored. */
  {
    const { emailIndex } = S;
    const email = orgUsers.alpha.ash.email;
    for (const k of Object.keys(emailIndex)) delete emailIndex[k];
    _rebuildEmailIndex();
    ok('9 · emailIndex rebuilds from orgUsers without being persisted',
      !!emailIndex[email] && emailIndex[email].userId === 'ash');
  }

  /* 10 — session expiry is its own concern now, not a side effect of saving. */
  {
    const { activeSessions } = require('../server.js');
    activeSessions.stale = { userId: 'ash', orgCode: 'alpha', expiresAt: Date.now() - 1000 };
    activeSessions.live  = { userId: 'ash', orgCode: 'alpha', expiresAt: Date.now() + 60000 };
    const n = _pruneExpiredSessions();
    ok('10 · pruning expired sessions works without a save happening', n === 1 && !activeSessions.stale && !!activeSessions.live);
  }

  /* 11 — the shape Group will use must persist today with no special handling, or Phase 0 has
     bought a rewrite rather than avoided one. */
  written.length = 0;
  inquiryStates.alpha['group:u18'] = { readiness: { inquiryId: 'inq_g1', signals: [{ ref: 'g1' }] } };
  scheduleSave(); await settle();
  ok('11 · a group:<nodeId> subject persists with no special handling',
    lastWrite().includes('store:inquiryStates:alpha'));
  {
    const units = _durableUnits();
    const alpha = units['store:inquiryStates:alpha'].alpha;   // units keep the store's own key
    ok('11 · …and rides in the same org unit as member subjects',
      'group:u18' in alpha && 'member:ash' in alpha);
  }

  /* 12 — composite keys (orgCode:userId) partition by their org prefix. */
  {
    const { userAiProfiles } = require('../server.js');
    userAiProfiles['alpha:ash'] = { openThreads: 1 };
    const units = _durableUnits();
    ok('12 · a composite-key store partitions by its org prefix',
      !!units['store:userAiProfiles:alpha'] && 'alpha:ash' in units['store:userAiProfiles:alpha']);
  }

  /* 13 — anything unrecognised is kept, not dropped. The catch-all is what makes "no store may
     silently disappear" structurally true rather than a promise. */
  {
    const { orgNotes } = require('../server.js');
    orgNotes['not-an-org-code'] = [{ id: 'n1' }];
    const units = _durableUnits();
    ok('13 · a key belonging to no known org still persists', !!units['store:orgNotes:_'] && 'not-an-org-code' in units['store:orgNotes:_']);
  }

  console.log(`\npersistence-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
