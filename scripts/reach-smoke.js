/* Truth layer — REACHING THE RIGHT PERSON (HTTP, model OFF). The assistant was telling people to
   go and speak to "the physio" in an organisation that has never named one. This proves the
   replacement: a member can be offered a share with a REAL named person whose remit covers the
   matter, nothing moves until they confirm, their edit is what gets shared, and a share aimed at
   one person reaches exactly that person and nobody else.
   Run: node scripts/reach-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.IQ_COMPOSER = '';                       // deterministic path — no model needed
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

(async () => {
  const { app, orgMeta, orgUsers, issueToken, libraryItems } = require('../server.js');
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const C = 'reach-test';

  // A club with a named medical lead and a named performance coach — the shape an org actually
  // configures, rather than a role vocabulary we imposed on it.
  orgUsers[C] = {
    ash:  { id: 'ash',  name: 'Ashton Mbeki',  role: 'member', status: 'active' },
    liv:  { id: 'liv',  name: 'Liv Ferreira',  role: 'coach',  status: 'active' },
    theo: { id: 'theo', name: 'Theo Nakamura', role: 'coach',  status: 'active' },
    sam:  { id: 'sam',  name: 'Sam Okafor',    role: 'member', status: 'active' },
  };
  orgMeta[C] = { orgName: 'Reach FC', orgMode: 'sports', professionals: [
    { userId: 'liv',  title: 'Medical lead',      remit: 'injury, pain, stiffness and training load' },
    { userId: 'theo', title: 'Performance coach', remit: 'leadership, mindset and confidence' },
    { userId: 'gone', title: 'Ghost',             remit: 'nothing at all' },   // no such user
  ] };

  const H = (who) => ({ Authorization: `Bearer ${issueToken(who, C, who === 'liv' || who === 'theo' ? 'coach' : 'member')}`, 'Content-Type': 'application/json' });
  const turn = (who, text) => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H(who), body: JSON.stringify({ text }) }).then(r => r.json());
  const post = (who, p, b) => fetch(base + p, { method: 'POST', headers: H(who), body: JSON.stringify(b || {}) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const get = (who, p) => fetch(base + p, { headers: H(who) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const shareProp = (t) => ((t.response || {}).proposedActions || []).find(p => p.actionType === 'share_with_professional');

  try {
    /* 1 — the matter is routed to the person whose remit covers it, by name */
    const inj = await turn('ash', 'my left ankle has been stiff for two weeks, the pain is worse the morning after training load');
    const p1 = shareProp(inj);
    ok('1 · an injury is offered to the person whose remit is injury', !!p1 && /Liv Ferreira/.test(p1.label));
    ok('1 · …the offer says why them, in the org\'s own words', !!p1 && /injury|pain|stiffness|load/i.test(p1.why));
    ok('1 · …and nothing has moved yet', !!p1 && p1.requiredApproval === true && ((libraryItems[C] || []).length === 0));

    /* 2 — a different matter reaches a different person. One directory, not one destination. */
    const lead = await turn('ash', 'I want to work on my leadership and confidence when I have the mindset for it');
    const p2 = shareProp(lead);
    ok('2 · leadership goes to the performance coach, not the medical lead', !!p2 && /Theo Nakamura/.test(p2.label));

    /* 3 — ordinary talk is not an occasion to involve anybody */
    const chat = await turn('ash', 'we played well on Saturday and the second goal was a good move');
    ok('3 · ordinary talk offers nobody', !shareProp(chat));

    /* 4 — the member's EDIT is what gets shared. An edit box that is ignored is a lie. */
    const c = await post('ash', `/api/assistant/turn/${inj.turnId}/confirm`, { proposalId: p1.id,
      overrides: { text: 'Left ankle stiff about two weeks. Worse the morning after. Happy for you to take a look.' } });
    ok('4 · confirming shares it', c.j && c.j.ok && c.j.confirmed === 'share_with_professional');
    const item = (libraryItems[C] || []).find(i => i.id === c.j.itemId);
    ok('4 · …the shared words are the EDITED ones, not the original', !!item && /Happy for you to take a look/.test(item.body));
    ok('4 · …and it is owned by the person who shared it', !!item && item.ownerId === 'ash');

    /* 5 — THE ONE THAT MATTERS: a share aimed at one person reaches exactly that person.
       "shared" has always meant everyone here, so an audience must NARROW and never widen. */
    const seenBy = async (who) => ((await get(who, '/api/library')).j.items || []).some(i => i.id === c.j.itemId);
    ok('5 · the person it was for can see it', await seenBy('liv'));
    ok('5 · the person who shared it can see it', await seenBy('ash'));
    ok('5 · another member cannot', !(await seenBy('sam')));
    ok('5 · another member of STAFF cannot either — one person means one person', !(await seenBy('theo')));

    /* 6 — a proposal executes at most once */
    const again = await post('ash', `/api/assistant/turn/${inj.turnId}/confirm`, { proposalId: p1.id });
    ok('6 · confirming twice does not share twice', again.status === 409);

    /* 7 — the directory never points at somebody who is not here */
    ok('7 · a professional with no matching user is dropped, not shown', !JSON.stringify((inj.response || {}).proposedActions || []).includes('Ghost'));

    /* 8 — an org that has named nobody offers nobody, rather than inventing a role */
    orgMeta[C].professionals = [];
    ok('8 · with nobody named, nothing is offered', !shareProp(await turn('ash', 'my left ankle has been stiff for two weeks, the pain is worse after training load')));

    /* 9 — THE DIRECTORY FILLS ITSELF AT ONBOARDING. A directory only an administrator maintains
       is stale the week after it is written, and the words that matter for matching are the ones
       a person uses about their own job. So a leader completing their profile joins it. */
    const onboard = await post('liv', '/api/auth/complete-profile', {
      mainGoals: 'keep the squad available', selectedValues: ['care'],
      professionalTitle: 'Medical lead', professionalRemit: 'injury, pain, stiffness and training load',
    });
    ok('9 · a leader completing onboarding joins the directory', onboard.j && onboard.j.ok && onboard.j.listedAs && onboard.j.listedAs.title === 'Medical lead');
    ok('9 · …and is offered from that moment on',
      !!shareProp(await turn('ash', 'my left ankle has been stiff for two weeks, the pain is worse the morning after training load')));

    /* 10 — a member cannot list themselves. Being routed other people's problems is a duty
       somebody holds, not a status anyone can claim. */
    await post('sam', '/api/auth/complete-profile', {
      mainGoals: 'play more', selectedValues: ['effort'],
      professionalTitle: 'Chief Everything', professionalRemit: 'injury, pain, stiffness and training load',
    });
    ok('10 · a member cannot add themselves to the directory',
      !(orgMeta[C].professionals || []).some(p => p.userId === 'sam'));

    /* 11 — standing down is removal, not an empty row that still gets offered */
    await post('liv', '/api/auth/complete-profile', { mainGoals: 'x', selectedValues: ['care'], professionalTitle: '', professionalRemit: '' });
    ok('11 · clearing a title removes them from the directory',
      !(orgMeta[C].professionals || []).some(p => p.userId === 'liv'));

    /* 12 — A ROLE CHANGE HAS CONSEQUENCES BEYOND THE ROLE FIELD.
       Promotion: onboarding has already run, so nobody would ever ask a promoted leader what to
       come to them for — invisible to routing forever, with nothing saying why.
       Demotion matters more: someone who stood down kept being sent other people's injuries. */
    orgUsers[C].boss = { id: 'boss', name: 'Priya Varma', role: 'superadmin', status: 'active' };
    const asBoss = { Authorization: `Bearer ${issueToken('boss', C, 'superadmin')}`, 'Content-Type': 'application/json' };
    const setRole = (who, role) => fetch(base + '/api/auth/update-user', { method: 'PUT', headers: asBoss,
      body: JSON.stringify({ userId: who, updates: { role } }) }).then(r => r.json());

    await setRole('sam', 'coach');
    ok('12 · a promoted member is flagged as owing a remit, not left invisible',
      orgUsers[C].sam.needsProfessionalProfile === true);

    orgMeta[C].professionals = [{ userId: 'theo', title: 'Performance coach', remit: 'leadership, mindset and confidence' }];
    ok('12 · …a listed leader is offered while they hold the role',
      !!shareProp(await turn('ash', 'I want to work on my leadership and confidence and the right mindset')));
    await setRole('theo', 'member');
    ok('12 · …standing down removes them from the directory',
      !(orgMeta[C].professionals || []).some(p => p.userId === 'theo'));
    ok('12 · …and they are no longer offered anyone\'s disclosures',
      !shareProp(await turn('ash', 'I want to work on my leadership and confidence and the right mindset')));

    /* 13 — a stale row cannot route either. Directory entries outlive the reasons they were
       written (a seed, an import, a future bug), and the cost of one is a person receiving
       disclosures they no longer hold a role for. */
    orgMeta[C].professionals = [{ userId: 'theo', title: 'Performance coach', remit: 'leadership, mindset and confidence' }];
    ok('13 · a directory row for a non-leader is ignored, not honoured',
      !shareProp(await turn('ash', 'I want to work on my leadership and confidence and the right mindset')));
  } catch (e) { fail++; console.log('  ✗ suite threw:', e && e.message); }

  server.close();
  console.log(`\nreach-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
