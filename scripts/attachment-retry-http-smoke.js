/* Truth layer — AN UPLOAD WHOSE ANSWER NEVER ARRIVED, AND WHAT HAPPENS WHEN THEY TRY AGAIN.

   The founder's device class is a phone on a stadium connection, and the failure that matters
   there is not a refused request — it is a request the server ACCEPTED and whose reply never came
   back. The client's 30-second ceiling fires, and the card says, in these words:

       "That took too long to send. Nothing was saved."

   THE CLIENT CANNOT KNOW THAT. An aborted fetch says nothing whatever about what the server did
   with the bytes it already had; the material may be committed, the conversation may exist, and
   the only thing that actually failed is the journey home. Telling somebody their work was lost
   when it was not is worse than telling them nothing, because it is the sentence that makes them
   do it again — and doing it again is the other half of this file.

   WHAT A RETRY MUST NOT DO. Attach the same document twice; create a second conversation for one
   upload; or leave the first attempt's conversation orphaned in the list with the material
   hanging off it. The material was already safe — it is deduplicated by checksum, owner and
   private visibility, and that has been true for some time. The CONVERSATION was not: the first
   attempt carried no conversationId (there was no thread yet), so the server made one; the reply
   stalled; the retry carried no conversationId either, so the server made another.

   Every assertion below drives POST /api/assistant/attachments, which is the whole of the
   server's part in this. The stall itself is a property of the wire and is simulated the only
   honest way available here — by sending the second request exactly as a client that never heard
   the first answer would send it.

   Run: node scripts/attachment-retry-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _materials } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'atr';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    ash: { id: 'ash', name: 'Ashton Mbeki', email: 'a@t.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: [] },
    rio: { id: 'rio', name: 'Rio Salvatierra', email: 'r@t.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: [] },
  } },
  orgNodes: { [C]: {} },
});
_rebuildEmailIndex();

/* A REAL DOCUMENT'S WORTH OF TEXT. Long enough to segment into parts, so "the same document" is
   established by its bytes rather than by a one-line fixture that could collide by accident. */
const DOC = [
  'Recovery between fixtures — club guidance, February.',
  'A lighter middle day is the usual recommendation between games three days apart.',
  'Sleep is the single largest lever and the one most often given away to travel.',
  'Nothing in this document is about any individual player.',
].join('\n\n');
const OTHER = 'A completely different document about set pieces and nothing else.';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = t => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
  const T = { ash: issueToken('ash', C, 'member'), rio: issueToken('rio', C, 'member') };
  const post = (b, who) => fetch(base + '/api/assistant/attachments',
    { method: 'POST', headers: H(T[who || 'ash']), body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const get = (u, who) => fetch(base + u, { headers: H(T[who || 'ash']) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const convs = async (who) => ((await get('/api/assistant/conversations', who)).j || {}).conversations || [];
  const mine = (who) => Object.values(_materials(C)).filter(m => m.byId === (who || 'ash'));

  try {
    console.log('\n  A — THE FIRST ATTEMPT, WHICH THE SERVER COMMITTED');
    const first = await post({ kind: 'text', text: DOC, title: 'recovery.pdf', filename: 'recovery.pdf' });
    ok('ATR-A1 the upload is accepted and the material committed',
      first.status === 200 && !!first.j.materialId && first.j.parts >= 1);
    ok('ATR-A2 …and a conversation was created for it, because the client had none to send',
      !!first.j.conversationId);
    ok('ATR-A3 …and it is external material, not evidence — said in the reply rather than left to be assumed',
      first.j.epistemicEffect === 'none' && /not evidence/i.test(String(first.j.note || '')));
    ok('ATR-A4 exactly one material and one conversation exist',
      mine().length === 1 && (await convs()).length === 1);

    console.log('\n  B — THE REPLY NEVER ARRIVES, AND THEY PRESS TRY AGAIN');
    /* THE RETRY, EXACTLY AS A CLIENT THAT NEVER HEARD THE FIRST ANSWER SENDS IT: same bytes, same
       filename, and NO conversationId, because the client never learned one. */
    const retry = await post({ kind: 'text', text: DOC, title: 'recovery.pdf', filename: 'recovery.pdf' });
    ok('ATR-B1 the retry succeeds rather than failing on a duplicate, because the person did nothing wrong',
      retry.status === 200 && !!retry.j.materialId);
    ok('ATR-B2 …and it is the SAME material, reconciled by its bytes rather than attached twice',
      retry.j.materialId === first.j.materialId && mine().length === 1);
    ok('ATR-B3 …and the SAME conversation, so one upload did not leave two threads in the list',
      retry.j.conversationId === first.j.conversationId);
    ok('ATR-B4 …with the list itself showing one, which is what the person actually sees',
      (await convs()).length === 1);
    ok('ATR-B5 …and the material is attached once, not twice, to that conversation',
      () => {
        const m = mine()[0];
        const refs = (m.refs || []).filter(r => r.kind === 'conversation');
        return refs.length === 1 && refs[0].id === first.j.conversationId;
      });

    console.log('\n  C — AND A THIRD PRESS CHANGES NOTHING FURTHER');
    const third = await post({ kind: 'text', text: DOC, title: 'recovery.pdf', filename: 'recovery.pdf' });
    ok('ATR-C1 a third identical attempt is still one material and one conversation',
      third.j.materialId === first.j.materialId && third.j.conversationId === first.j.conversationId
      && mine().length === 1 && (await convs()).length === 1);

    console.log('\n  D — A DIFFERENT DOCUMENT IS A DIFFERENT UPLOAD, WHICH IS WHAT MAKES B MEAN ANYTHING');
    const other = await post({ kind: 'text', text: OTHER, title: 'setpieces.pdf', filename: 'setpieces.pdf' });
    ok('ATR-D1 different bytes get their own material',
      other.j.materialId !== first.j.materialId && mine().length === 2);
    ok('ATR-D2 …and their own conversation, because reconciliation is by DOCUMENT and not by person',
      other.j.conversationId !== first.j.conversationId && (await convs()).length === 2);

    console.log('\n  E — AND A CONVERSATION THE CLIENT DOES NAME IS STILL THE ONE USED');
    /* The ordinary case, which must not be disturbed by any of the above: a person attaches a
       document to the thread they are already in. */
    const named = await post({ kind: 'text', text: 'A third document, attached from inside a thread.',
      title: 'third.pdf', filename: 'third.pdf', conversationId: first.j.conversationId });
    ok('ATR-E1 an upload naming a conversation lands in THAT conversation',
      named.j.conversationId === first.j.conversationId);
    ok('ATR-E2 …and does not create another one',
      (await convs()).length === 2);

    console.log('\n  F — RECONCILIATION IS PER PERSON, AND NEVER A WAY INTO SOMEBODY ELSE\'S THREAD');
    const theirs = await post({ kind: 'text', text: DOC, title: 'recovery.pdf', filename: 'recovery.pdf' }, 'rio');
    ok('ATR-F1 the same bytes uploaded by ANOTHER person get their own material — equal bytes are not shared access',
      theirs.j.materialId !== first.j.materialId);
    ok('ATR-F2 …and their own conversation, which is not the first person\'s',
      theirs.j.conversationId !== first.j.conversationId);
    ok('ATR-F3 …and the first person\'s list is unchanged by any of it',
      (await convs('ash')).length === 2);
    ok('ATR-F4 …and neither can read the other\'s material',
      (await get(`/api/materials/${first.j.materialId}`, 'rio')).status === 404);
    /* WHICH GATE ACTUALLY HOLDS THIS, recorded because three mutations found out. Reconciliation
       checks that the earlier copy is THIS owner's private one, and then that the thread it names
       is in THIS person's list. Removing either — or BOTH at once — changes nothing any assertion
       here can see, because neither is the protection: conversations are stored per person
       (`_wsKey(code, userId)`), so `_resolveConversation` looking up somebody else's id in this
       person's list simply does not find it and makes a new thread. The two checks are cheap
       belt-and-braces that would become load-bearing if that store were ever keyed differently,
       and they are kept for that reason rather than counted as the reason this is safe.

       ATR-F5 drives the strongest version: hand a person somebody else's conversation id
       outright. */
    const stolen = await post({ kind: 'text', text: 'Rio attaching into a thread that is not his.',
      title: 'x.pdf', filename: 'x.pdf', conversationId: first.j.conversationId }, 'rio');
    ok('ATR-F5 naming another person\'s conversation outright does not reach it — the thread store is per person, which is the gate the two checks above are often mistaken for',
      stolen.status === 200 && stolen.j.conversationId !== first.j.conversationId);
    ok('ATR-F5b …and that person\'s thread is untouched by the attempt',
      (await convs('ash')).length === 2);

    console.log('\n  G — AND AN UPLOAD THAT GENUINELY CANNOT BE ACCEPTED IS STILL REFUSED');
    ok('ATR-G1 an empty attachment is refused rather than reconciled into an existing one',
      (await post({ kind: 'text', text: '   ', title: 'blank.pdf' })).status === 400);
    ok('ATR-G2 …and nothing was added by the attempt',
      mine().length === 3 && (await convs()).length === 2);

    console.log('\n  H — AND THE CARD SAYS WHAT IT KNOWS, WHICH IS NOT "NOTHING WAS SAVED"');
    /* The server half above is what makes Try again safe. The client half is what a person
       actually reads, and it was asserting a fact it cannot have: an aborted fetch says nothing
       about what the server did with the bytes it already had. This is the one assertion in this
       file that is about js/app.js rather than a route, and it is here rather than in a browser
       check because the sentence is the finding — the browser adds nothing to reading it. */
    /* DECOMMENTED FIRST, and the reason is that the comment explaining this change quotes the
       old sentence -- so a naive search for it found the explanation and reported the defect as
       still present. A source assertion that cannot tell code from the prose about it is a source
       assertion that will be wrong in whichever direction somebody last wrote. */
    const APP = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, ' ');
    const abortArm = APP.slice(APP.indexOf('async wsAttach('), APP.indexOf('  wsAttachRetry('));
    ok('ATR-H1 the timeout card no longer claims nothing was saved, because the client cannot know that',
      !/Nothing was saved/.test(abortArm));
    ok('ATR-H2 …it says it could not CONFIRM, which is the true statement',
      /cannot tell you whether it saved|could not confirm|too long to confirm/i.test(abortArm));
    ok('ATR-H3 …and tells them the retry is safe, which is now a property of the server rather than a hope',
      /will not be added twice/i.test(abortArm));
    ok('ATR-H4 …and the retry control is still offered, so the honest message is not a dead end',
      /wsAttachRetry/.test(abortArm) && /Try again/.test(abortArm));

  } catch (e) { fail++; console.error('  FAIL attachment-retry suite threw:', e && e.stack); }

  server.close();
  console.log(`\nattachment-retry-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
