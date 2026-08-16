/* Truth layer — LAW U2 AT THE SERVER BOUNDARY. The pure fold is proven in contest-smoke;
   this proves the surfaces a human actually reads.

   TTD v1 §7 LAW U2, plus the founder's visibility decision of 2026-08-15:

       authorized + active     → ordinary finding
       authorized + contested  → visible, explicitly marked contested
       unauthorized            → not disclosed, whatever the epistemic state

       "Do not satisfy U2 by silently erasing or permanently withholding an otherwise
        authorized historical finding merely because the subject challenged it."

   ── Why this file exists ────────────────────────────────────────────────────────────────

   contest-smoke.js is pure: it can only see ai/reason.js. The first U2 implementation was
   correct there — agendaItem gained `status` and `contested` — and took the forbidden path
   in server.js, where four ledger filters changed from `b.status !== 'dormant'` to
   `b.status === 'open'` (`:13823, :13839, :13886, :14112`). `contested` is not `open`, so a
   contested belief was permanently withheld from the member brief, the delivery reads and
   the person report.

   The sharpest consequence: a person contests a belief about themselves and it disappears
   from their OWN brief. They lose sight of the very thing they disputed, which inverts the
   right U2 exists to grant.

   That gap existed because the pure test could not reach these surfaces. An untested surface
   is where the shortcut goes.

   ── Coverage, stated honestly ───────────────────────────────────────────────────────────

   Covered: the leader agenda, the person report, and cross-branch isolation.
   NOT covered: /api/brief, whose reads pass through composition before reaching `items`, so
   an assertion there would test the composer as much as the filter. The person report maps
   ledger → output directly and exercises the same `status === 'open'` mistake, so it is the
   honest place to catch this class. If the brief regresses independently, this suite will
   not see it — that is a known limit, not an oversight.

   NOT REGISTERED in scripts/test.js yet. Register it in the commit that makes it green.

   Boots the real app in-process (DB_OPTIONAL) with an injected ledger.
   Run: node scripts/contest-http-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const DAY = 86400000, now = Date.now(), d = n => now - n * DAY;
const C = 'ctsta';
const JOE = 'joe::momentum_drop';

/*  root(ceo)
      ├─ teamA(coachA, member joe)   ← joe contests the belief about him
      └─ teamB(coachB, member bob)   ← control: never contested, other branch  */
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Contest Co', orgMode: 'sports' } },
  orgUsers: { [C]: {
    ceo:    { id: 'ceo',    name: 'Cleo', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['root'] },
    coachA: { id: 'coachA', name: 'Alex', role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamA'] },
    coachB: { id: 'coachB', name: 'Bev',  role: 'coach',  orgCode: C, status: 'active', leadershipNodeIds: ['teamB'] },
    joe:    { id: 'joe',    name: 'Joe',  role: 'member', orgCode: C, status: 'active' },
    bob:    { id: 'bob',    name: 'Bob',  role: 'member', orgCode: C, status: 'active' },
  } },
  orgNodes: { [C]: {
    root:  { nodeId: 'root',  parentId: null,   leaderIds: ['ceo'],    memberIds: [], childNodeIds: ['teamA', 'teamB'] },
    teamA: { nodeId: 'teamA', parentId: 'root', leaderIds: ['coachA'], memberIds: ['joe'] },
    teamB: { nodeId: 'teamB', parentId: 'root', leaderIds: ['coachB'], memberIds: ['bob'] },
  } },
  reasonLedger: { [C]: [
    { id: JOE, subjectId: 'joe', subjectName: 'Joe', scope: 'teamA',
      kind: 'momentum_drop', axis: 'momentum', polarity: 'risk', status: 'open',
      claim: "Joe's momentum has been running below their own normal.",
      support: [ { id: 'j1', t: d(9), severity: 'medium', basis: 'mood 2.7/5' },
                 { id: 'j2', t: d(5), severity: 'medium', basis: 'dip' },
                 { id: 'j3', t: d(1), severity: 'high',   basis: 'mood 2.3/5' } ],
      counter: [], careFlag: false, firstSeen: d(9), lastSeen: d(1), confidence: 'emerging',
      whatWouldRefute: "the signal easing back, or them telling us the read is off" },
    { id: 'bob::plateau', subjectId: 'bob', subjectName: 'Bob', scope: 'teamB',
      kind: 'plateau', axis: 'growth', polarity: 'risk', status: 'open',
      claim: "Bob's growth has flattened despite steady effort.",
      support: [ { id: 'b1', t: d(8), severity: 'low', basis: 'flat' },
                 { id: 'b2', t: d(4), severity: 'low', basis: 'flat' },
                 { id: 'b3', t: d(1), severity: 'low', basis: 'flat' } ],
      counter: [], careFlag: false, firstSeen: d(8), lastSeen: d(1), confidence: 'emerging',
      whatWouldRefute: "the signal easing back, or them telling us the read is off" },
  ] },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = {
    ceo: issueToken('ceo', C, 'coach'), coachA: issueToken('coachA', C, 'coach'),
    coachB: issueToken('coachB', C, 'coach'),
    joe: issueToken('joe', C, 'member'), bob: issueToken('bob', C, 'member'),
  };
  const get = async (who, path) => {
    const r = await fetch(base + path, { headers: { Authorization: `Bearer ${tok[who]}` } });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  const contest = async (who, beliefId) => {
    const r = await fetch(base + `/api/reason/${encodeURIComponent(beliefId)}/feedback`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok[who]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'wrong' }),
    });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, j };
  };
  /* The person report renders a human artifact (HTML, or CSV with ?format=csv) rather than
     JSON, so these assertions read the rendered document. That is the right level: it is
     literally what a reader is handed, and a finding that survives the filter but never
     reaches the page has still been erased from the reader's point of view. */
  const getText = async (who, path) => {
    const r = await fetch(base + path, { headers: { Authorization: `Bearer ${tok[who]}` } });
    return { status: r.status, text: await r.text().catch(() => '') };
  };
  const mentions = (body, fragment) => new RegExp(fragment, 'i').test(body || '');
  const marksContested = body => /contest|disput|unresolved/i.test(body || '');

  console.log('contest-http-smoke — LAW U2 at the boundary\n');
  try {
    /* ── 1 · Before the contest: the belief is an ordinary finding on both surfaces. ── */
    const before = await getText('coachA', `/api/report/person/joe`);
    ok('1 · a leader\'s person report carries the belief before any contest',
      before.status === 200 && mentions(before.text, 'momentum'));
    ok('1 · …and says nothing about a dispute, because there is none yet',
      !marksContested(before.text));

    /* ── 2 · The subject contests it. ── */
    const c = await contest('joe', JOE);
    ok('2 · the subject may contest a belief about themselves', c.status === 200);

    /* ── 3 · THE HEADLINE. The finding is preserved and marked — not erased.

       A report that silently omits a disputed finding misleads in the other direction: the
       reader cannot tell a dispute exists, and the record loses the history the product
       promises to keep. Presence alone is not enough; it must say it is contested. ── */
    const after = await getText('coachA', `/api/report/person/joe`);
    ok('3 · after the contest the finding is still in the person report',
      mentions(after.text, 'momentum'));
    ok('3 · …and is explicitly marked as contested there',
      marksContested(after.text));

    /* ── 4 · The leader agenda discloses rather than hides. ── */
    const ag = await get('coachA', '/api/reason/agenda');
    const item = ((ag.j && ag.j.agenda) || []).find(a => a.beliefId === JOE);
    ok('4 · the belief still reaches the authorised leader\'s agenda', !!item);
    ok('4 · …carrying an unmistakable contested marker',
      !!item && (item.contested === true || item.status === 'contested'));

    /* ── 5 · A contest does not BROADEN disclosure. Bev leads a sibling branch and could
       never see Joe's belief; a dispute must not change that in either direction. ── */
    const bev = await get('coachB', '/api/reason/agenda');
    ok('5 · a sibling-branch leader still cannot see the contested belief',
      !((bev.j && bev.j.agenda) || []).some(a => a.beliefId === JOE));
    const bevReport = await getText('coachB', `/api/report/person/joe`);
    ok('5 · …nor pull it through a person report',
      bevReport.status === 403 || !mentions(bevReport.text, 'momentum'));

    /* ── 6 · No overcorrection: the uncontested control belief is untouched on the same
       surfaces, so a fix cannot pass by quieting everything. ── */
    const bobReport = await getText('coachB', `/api/report/person/bob`);
    ok('6 · an uncontested belief still appears normally',
      mentions(bobReport.text, 'growth'));
    ok('6 · …and is not marked contested', !marksContested(bobReport.text));

  } catch (e) {
    fail++; console.log('  ✗ threw:', e && e.message);
  } finally {
    server.close();
    console.log(`\ncontest-http-smoke: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
