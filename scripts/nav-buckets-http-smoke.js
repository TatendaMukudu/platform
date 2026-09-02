'use strict';
process.env.DB_OPTIONAL = '1';
const fs = require('fs');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, userAiProfiles, inquiryStates, assistantConversations } = require('../server');
let pass = 0, fail = 0;
function ok(name, yes) { if (yes) { console.log(`  PASS ${name}`); pass++; } else { console.error(`  FAIL ${name}`); fail++; } }
const CODE = 'nav-four';
const now = new Date().toISOString();
const inquiry = (id, parked) => ({ inquiryId: id, topic: { label: id }, status: 'exploring', polarity: 'neutral',
  signals: [{ id: `s-${id}`, kind: 'observation', status: 'active', originRef: `o-${id}` }], hypotheses: [],
  confidence: { score: parked ? 0.1 : 0.8, band: parked ? 'tentative' : 'clear', because: [] }, missingSignals: [],
  falsifiers: [], lastUpdatedAt: now, ...(parked ? { parkedAt: Date.now(), parkedBecause: 'another question would tell us more' } : {}) });
_loadAllStores({
  orgMeta: { [CODE]: { orgName: 'Four buckets', createdAt: now } },
  orgUsers: { [CODE]: { member: { id: 'member', email: 'member@four.test', name: 'Member', role: 'member', orgCode: CODE, status: 'active' } } },
  inquiryStates: { [CODE]: { 'member:member': { live: inquiry('inq-live'), parked: inquiry('inq-parked', true) } } },
  userAiProfiles: { [`${CODE}:member`]: { focuses: [
    { focusId: 'focus-low', text: 'Lower priority focus', priority: 'low', createdAt: now },
    { focusId: 'focus-high', text: 'Higher priority focus', priority: 'urgent', createdAt: now },
  ] } }, assistantConversations: { [`${CODE}:member`]: [] },
});
_rebuildEmailIndex();
const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`; const token = issueToken('member', CODE, 'member');
  const get = async p => { const r = await fetch(base + p, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, body: await r.json() }; };
  try {
    const kinds = ['inquiry', 'focus', 'high', 'low'];
    const reads = await Promise.all(kinds.map(k => get(`/api/objects?kind=${k}&scope=self`)));
    ok('A1 each nav bucket contains only its requested kind', reads.every((r, n) => r.status === 200 && r.body.objects.every(o => o.kind === kinds[n])) && reads[0].body.objects.length === 2 && reads[1].body.objects.length === 2);
    ok('A2 objects are ordered by priority rather than kind or insertion order', reads[1].body.objects.map(o => o.id).join(',') === 'focus-high,focus-low');
    const inquiries = reads[0].body.objects;
    ok('A3 parked objects render after live objects with the kernel reason', inquiries[0].id === 'inq-live' && inquiries[1].id === 'inq-parked' && inquiries[1].parkedBecause === 'another question would tell us more');
    const first = await get('/api/objects/focus/focus-high/thread?scope=self');
    userAiProfiles[`${CODE}:member`].focuses[1].text = 'Recomposed current focus';
    const second = await get('/api/objects/focus/focus-high/thread?scope=self');
    ok('A4 every object thread recomposes its opening and stores no projection', first.status === 200 && second.body.opening.claim.includes('Recomposed current focus') && first.body.opening.claim !== second.body.opening.claim && assistantConversations[`${CODE}:member`].length === 0);
    const member = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
    /* The card renderer moved from an inline `const card = item =>` to a named method when the
       bucket page gained per-kind copy, so the pattern is updated to the new idiom. The LAW is
       unchanged and still the point: ONE renderer for four buckets. Two is how the polarity
       vocabulary came to exist five times, and how two different inquiry cards came to exist
       on this very surface. */
    /* STRUCTURAL, not by name. Counting a named method let a second renderer called something
       else walk straight past — verified by mutation. What cannot be faked is the card's own
       markup: any second renderer has to emit the card class too, so counting that counts
       renderers however they are spelled. */
    const emitters = (member.match(/class="iq-inq"/g) || []).length;
    ok('A5 the four routes share one card renderer and carry no count badges',
      emitters === 1
      && (member.match(/this\._objectCard\(/g) || []).length >= 1
      && ['Inquiries','Focuses','Highs','Lows'].every(x => member.includes(`label: '${x}'`))
      && !/badge/i.test(member.slice(member.indexOf('_NAV:'), member.indexOf('navToggle()'))));
  } catch (e) { console.error(e); fail++; }
  server.close(() => { console.log(`\nnav-buckets-http-smoke: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); });
});
