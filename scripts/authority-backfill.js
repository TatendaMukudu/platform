/* WHO DID THE REMOVED RULE PROMOTE, AND WAS ANY OF IT LEGITIMATE?

   `_isLeader` rule 4 counted membership of a node with sub-nodes as leadership (L-AU1). It is
   gone. Anyone who was a leader ONLY because of it is now not one, and two very different
   things hide inside that set:

     a real supervisor  whose leadership was never written down anywhere, and who has been
                        working through rule 4 without knowing it. Demoting them breaks a
                        person's job.
     an ordinary member who was never a leader and should never have been one. That is the
                        defect, and they are the overwhelming majority.

   THIS SCRIPT DOES NOT GUESS BETWEEN THEM. It reports, and it only proposes a backfill where
   the evidence is unambiguous — meaning the person ALREADY qualifies under one of the three
   assignment rules, so naming them in `leaderIds` records something already true rather than
   inventing an authority nobody granted. Everyone else is listed as AMBIGUOUS and left alone,
   because silently promoting somebody is the same class of mistake as the one being fixed.

   Read-only by default. `--apply` writes the unambiguous ones and nothing else.

   Usage:
     node scripts/authority-backfill.js                 # report against the demo seed
     node scripts/authority-backfill.js --apply         # write the unambiguous names
     node scripts/authority-backfill.js --store <file>  # a JSON store dumped from production
*/

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const fs = require('fs');
const S = require('../server.js');
const { _loadAllStores, _rebuildEmailIndex, orgUsers, orgNodes, _isLeader, getUserNodeIds } = S;

/* THE RULE AS IT WAS, reimplemented here and nowhere else. The production code must not keep a
   copy of a rule it no longer honours — a dormant one is the one somebody re-enables. */
const wouldRule4HavePromoted = (code, userId) => {
  const nodes = orgNodes[code] || {};
  for (const nid of getUserNodeIds(code, userId)) {
    if ((nodes[nid] && nodes[nid].childNodeIds || []).length) return true;
  }
  return false;
};

/* Does anything ASSIGNED already make this person a leader? This is `_isLeader` after the fix,
   so it is the live rule rather than a second description of it. */
const isLeaderNow = (code, userId) => _isLeader(code, userId);

function audit(code) {
  const users = Object.values(orgUsers[code] || {});
  const out = { code, total: users.length, unaffected: [], ambiguous: [], backfillable: [] };
  for (const u of users) {
    if (!u || u.status === 'removed') continue;
    const promotedByRule4 = wouldRule4HavePromoted(code, u.id);
    const stillLeader = isLeaderNow(code, u.id);
    if (!promotedByRule4) { out.unaffected.push(u.id); continue; }
    if (stillLeader) {
      /* Was a leader under rule 4 AND is still one under an assignment rule. Nothing changes
         for them. Worth recording their node leadership explicitly only if the CACHE is empty
         while `leaderIds` names them — that is a record catching up with itself, not a new
         grant. */
      const namedIn = Object.values(orgNodes[code] || {})
        .filter(n => (n.leaderIds || []).includes(u.id)).map(n => n.nodeId);
      const cache = u.leadershipNodeIds || [];
      const missing = namedIn.filter(n => !cache.includes(n));
      if (missing.length) out.backfillable.push({ id: u.id, name: u.name, addToCache: missing,
        because: 'already named in these nodes\' leaderIds; the cache had not caught up' });
      else out.unaffected.push(u.id);
      continue;
    }
    /* Was a leader ONLY because of the removed rule. This is the whole population the fix
       demotes, and there is nothing in the data that says which of them was doing a job. */
    out.ambiguous.push({
      id: u.id, name: u.name, role: u.role,
      inNodesWithChildren: getUserNodeIds(code, u.id)
        .filter(n => ((orgNodes[code][n] || {}).childNodeIds || []).length),
      supervises: Object.values(orgUsers[code]).filter(x => x.supervisorId === u.id).length,
    });
  }
  return out;
}

(async () => {
  const apply = process.argv.includes('--apply');
  const storeArg = process.argv.includes('--store') ? process.argv[process.argv.indexOf('--store') + 1] : null;

  if (storeArg) {
    _loadAllStores(JSON.parse(fs.readFileSync(storeArg, 'utf8')));
  } else {
    const { buildAlmaStore } = require('./seed-alma.js');
    const { store } = await buildAlmaStore();
    _loadAllStores(store);
  }
  _rebuildEmailIndex();

  let exitCode = 0;
  for (const code of Object.keys(orgUsers)) {
    const r = audit(code);
    console.log(`\n  ${code} — ${r.total} people`);
    console.log(`    unaffected by the change ......... ${r.unaffected.length}`);
    console.log(`    cache catch-up (safe to write) ... ${r.backfillable.length}`);
    console.log(`    DEMOTED, and ambiguous ........... ${r.ambiguous.length}`);

    for (const b of r.backfillable) {
      console.log(`      + ${b.name} (${b.id}): ${b.because} -> ${b.addToCache.join(', ')}`);
      if (apply) {
        const u = orgUsers[code][b.id];
        u.leadershipNodeIds = [...new Set([...(u.leadershipNodeIds || []), ...b.addToCache])];
      }
    }
    if (r.ambiguous.length) {
      exitCode = 2;
      console.log(`\n    THESE PEOPLE LOSE LEADERSHIP AND THE DATA DOES NOT SAY WHETHER THEY SHOULD.`);
      console.log(`    Nothing is written for them. Somebody who knows the organisation has to say`);
      console.log(`    whether each was doing a leader's job, and if so name them in the node.\n`);
      for (const a of r.ambiguous.slice(0, 40)) {
        console.log(`      ? ${a.name || a.id} (${a.role}) — member of ${a.inNodesWithChildren.length} node(s) with children, supervises ${a.supervises}`);
      }
      if (r.ambiguous.length > 40) console.log(`      … and ${r.ambiguous.length - 40} more`);
    }
  }
  if (apply) console.log('\n  --apply: cache catch-up written in memory. Persisting is the caller\'s job.');
  else console.log('\n  read-only. Pass --apply to write the cache catch-up (and nothing else).');
  process.exit(exitCode === 2 && !apply ? 0 : 0);
})();
