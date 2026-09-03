/* Truth layer — "MAKE THIS A FOCUS" HAD NEVER MADE A FOCUS.

   Reported three separate times, each time correctly, and each time I looked at why the button
   was not REACHING its handler. The handler was fine. It navigated to the composer and typed
   "I want to work on " into the input. That is all it had ever done. A prompt-starter wearing
   the label of an action, and no test anywhere could tell the difference because nothing
   asserted that anything was created.

   By the time the founder reported it the third time, the composer had started saying "I can
   set this up as a focus for you, kept private until you decide otherwise" — the product
   promising, in its own voice, an outcome no code produced.

   The second half is worse and was invisible. _memberGoalsFor handed a leader EVERY personal
   focus a member had, unconditionally. So the "private to you" the interface had been
   promising all along was false the moment anyone above them opened their profile.

   Two properties, and the second is the one that matters:

     · a focus a person makes actually exists afterwards, and is on their list
     · private means private FROM A LEADER, and an unset visibility reads as private, because a
       record written before the field existed carries no consent to widen it

   Run: node scripts/focus-creation-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs');
const path = require('path');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _getMemory, _memberGoalsFor, orgUsers } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'fcs';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Real Madrid Football Club', orgMode: 'sports' } },
  orgUsers: { [C]: {
    tyler: { id: 'tyler', name: 'Tyler Mukudu', email: 't@alma.edu', role: 'member', orgCode: C, status: 'active' },
    boss:  { id: 'boss',  name: 'A Leader',     email: 'l@alma.edu', role: 'superadmin', orgCode: C, status: 'active' },
  } },
  // A memberGoals row is load-bearing in the FIXTURE: _memberGoalsFor returns the focus list
  // only on the `direct` branch, so without one it returns nothing and every "the leader
  // cannot see it" assertion passes for free. That is exactly what happened on the first run —
  // FC7, FC9 and FC10 were green against a reader that was returning an empty list to
  // everybody.
  memberGoals: { [`${C}:tyler`]: { memberName: 'Tyler Mukudu', goals: [] } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('tyler', C, 'member')}`, 'Content-Type': 'application/json' };
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: H, body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const get = (u, tok) => fetch(base + u, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());

  try {
    /* ── FC1-FC4: it creates something. ── */
    const empty = await post('/api/me/focus', { text: '   ' });
    ok('FC1 an empty focus is refused, in words a person can act on',
      empty.status === 400 && /work on/i.test((empty.j || {}).error || ''));

    const made = await post('/api/me/focus', { text: 'Tighter first touch under pressure' });
    ok('FC2 making a focus returns one, with an id — the button used to return nothing because it did nothing',
      made.status === 200 && made.j && made.j.ok === true && !!made.j.focus.id);
    ok('FC3 …with the text the person actually wrote, not a summary of the reply it sat under',
      made.j.focus.text === 'Tighter first touch under pressure');

    const mine = await get('/api/objects?kind=focus&scope=self', issueToken('tyler', C, 'member'));
    ok('FC4 …and it is on their own list immediately, through the same read the app uses',
      mine.ok === true && (mine.objects || []).some(o => /first touch under pressure/i.test(JSON.stringify(o))));

    /* ── FC5: the same commitment twice is one commitment. ── */
    const again = await post('/api/me/focus', { text: 'Tighter first touch under pressure' });
    ok('FC5 making the same one again returns the existing one and says so, rather than duplicating it',
      again.status === 200 && again.j.already === true && again.j.focus.id === made.j.focus.id);

    /* ── FC6-FC10: PRIVATE MEANS PRIVATE FROM A LEADER. ── */
    ok('FC6 a focus is private unless the person said otherwise',
      made.j.focus.visibility === 'private');
    ok('FC6b the leader read reaches the focus list at all — without this, every check below passes against an empty list',
      Array.isArray((_memberGoalsFor(C, orgUsers[C].tyler) || {}).focuses));

    const leaderSees = () => (_memberGoalsFor(C, orgUsers[C].tyler) || {}).focuses || [];
    ok('FC7 a leader reading that member does NOT see it — this was handing over every focus a person had, including the ones the product called private',
      !leaderSees().some(f => f.id === made.j.focus.id));

    const shared = await post('/api/me/focus', { text: 'Lead the warm-up on Tuesdays', share: true });
    ok('FC8 a focus the person chose to share IS visible to a leader',
      shared.j.focus.visibility === 'shared' && leaderSees().some(f => f.id === shared.j.focus.id));

    // A personal focus with no visibility recorded. "Unknown" must read as private: an absent
    // answer is not consent, and reading it as one is how a default becomes a disclosure.
    const mem = _getMemory(C, 'tyler');
    mem.focuses.push({ id: 'foc_legacy', text: 'From before visibility existed', status: 'active', createdAt: new Date().toISOString() });
    ok('FC9 a personal focus with NO visibility recorded is treated as private — an absent answer is not permission',
      !leaderSees().some(f => f.id === 'foc_legacy'));

    // AN AIM IS NOT PERSONAL WORK. A focus with kind 'goal' is set through the goals flow, in
    // the org's context and often at someone else's invitation — it is the reference frame a
    // leader reasons against, and hiding it does not protect anybody, it just removes the
    // anchor. My first cut of the filter took these out too and left the advisor with nothing
    // to reason from: the right rule with the wrong predicate.
    mem.focuses.push({ id: 'foc_aim', text: 'Break into the starting eleven', kind: 'goal', status: 'active', createdAt: new Date().toISOString() });
    ok('FC9b an AIM still reaches a leader — it was declared in the org\'s context, and it is what they support against',
      leaderSees().some(f => f.id === 'foc_aim'));

    const narrowed = await post(`/api/me/focus/${shared.j.focus.id}/visibility`, { visibility: 'private' });
    ok('FC10 the owner can take it back, and the leader stops seeing it',
      narrowed.status === 200 && narrowed.j.visibility === 'private' &&
      !leaderSees().some(f => f.id === shared.j.focus.id));

    /* ── FC11-FC13: the CLIENT actually calls it. This is the half that was broken, and a
       server test alone would have stayed green through all three reports. ── */
    const appjs = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    ok('FC11 the client posts to the create route — it used to navigate to the composer and type into the box',
      /fetch\('\/api\/me\/focus'/.test(appjs) && /method: 'POST'/.test(appjs.slice(appjs.indexOf("fetch('/api/me/focus'"), appjs.indexOf("fetch('/api/me/focus'") + 200)));
    const starter = appjs.slice(appjs.indexOf('_startObject(kind, share, el) {'), appjs.indexOf('_focusSeedFrom(el) {'));
    ok('FC12 …and making a focus no longer just prefills the composer',
      starter.length > 20 && !/I want to work on/.test(starter));
    ok('FC13 the audience choice says WHO, not just a word — "public" tells a person nothing about who that is',
      /leads a group you are in can see/.test(appjs));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nfocus-creation-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
