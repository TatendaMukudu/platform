/* Truth layer — UNIVERSAL MEANS UNIVERSAL, OR THE DIRECTIVE IS A CLAIM WE CANNOT MEET.

   The sister suite (language-journey) proves the LANGUAGE DECISION is universal: a person writing
   a language nobody listed still reaches the model with "answer this person in the language they
   are writing in", naming no language, so it holds for one nobody has thought of. That is the
   half this product owns about PROSE.

   This file is about the half that is not prose. Deterministic capabilities -- re-reading a
   document, finding what was learned -- work by matching the words somebody just wrote against
   the words already stored. Those capabilities need no model and are therefore the ones that keep
   working when the provider is down, which makes them exactly the ones a universality claim rests
   on. They were ENGLISH-SHAPED, and nothing said so.

   MEASURED BEFORE ANYTHING WAS CHANGED, one question against one document holding its answer:

     Arabic, Greek, Cyrillic, Hebrew, Latin      found it
     Chinese, Japanese                           NOTHING, every time
     Korean                                      NOTHING, every time

   Two causes, one remedy. Chinese and Japanese do not put spaces between words, so a sentence
   arrives as ONE token and `includes` can only match the identical sentence. Korean spaces its
   words but attaches its particles: the question says 점유율에, the document says 점유율이, the
   same word one character apart. Character bigrams over runs of Han, Kana and Hangul -- the
   ordinary way those scripts are indexed -- fix both, in the ONE function that decides what a
   word is. The learning read was carrying a second copy of that function, so the same defect
   existed twice for one reason; it now calls the one owner and keeps only its own noise list.

   Section C is a different kind of universality and was also measured rather than assumed: a
   length cap that counts UTF-16 code units cuts a character above U+FFFF in half, and a topic
   came back ending in a lone surrogate -- half a character, in somebody's own question, stored
   canonically.

   WHAT THIS FILE DOES NOT CLAIM. Models are off here, so what is asserted is the DETERMINISTIC
   half: which parts of a document a question reaches, what the learning read finds, and what the
   canonical record holds. That the model writes good Korean is the model's half and is not
   testable here. Section D is the honest boundary in the other direction: a question in a
   language the document is not written in finds nothing, and saying so is the correct answer.

   Run: node scripts/multilingual-universality-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const gateway = require('../ai/gateway.js');
let NEXT = { actions: [] };
gateway.enabled = () => true;
gateway.deterministicOnly = () => false;
gateway.completeJSON = async () => NEXT;
gateway.complete = async () => 'Understood.';

const material = require('../ai/material.js');
const composerActions = require('../ai/composer-actions.js');
const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

/* NINE WRITING SYSTEMS, each a question and a document that holds its answer. The pairs are
   ordinary sentences about the same subject rather than the question echoed back, because a
   document that repeats the question proves only that a string equals itself. */
const SCRIPTS = {
  Arabic:   { q: 'ماذا يقول التقرير عن الاستحواذ',
              doc: 'التقرير يقول ان الاستحواذ كان ضعيفا في الشوط الثاني' },
  Greek:    { q: 'τι λεει για την κατοχη',
              doc: 'Η εκθεση λεει οτι η κατοχη ηταν χαμηλη στο δευτερο ημιχρονο' },
  Russian:  { q: 'что говорится о владении мячом',
              doc: 'В отчете говорится что владение мячом было низким во втором тайме' },
  Hebrew:   { q: 'מה נאמר על החזקת הכדור',
              doc: 'הדוח אומר שהחזקת הכדור הייתה נמוכה במחצית השנייה' },
  Chinese:  { q: '报告怎么说控球', doc: '报告说下半场控球率很低' },
  Japanese: { q: 'ポゼッションについて何と書いてありますか',
              doc: 'レポートには後半のポゼッションが低かったと書かれています' },
  Korean:   { q: '점유율에 대해 무엇이라고 하나요',
              doc: '보고서는 후반전 점유율이 낮았다고 말합니다' },
  Shona:    { q: 'chii chinotaurwa nezve kubata bhora',
              doc: 'Gwaro rinoti kubata bhora kwakanga kwakaderera muhafu yechipiri' },
  English:  { q: 'what does it say about possession',
              doc: 'The report says possession was low in the second half' },
};
/* AND SOMETHING ELSE ENTIRELY IN THE SAME SCRIPT, so "it found the part" is a fact about the
   words rather than about the function returning whatever it has. */
const UNRELATED = {
  Chinese: '今天天气很好我们去公园散步', Korean: '오늘 날씨가 좋아서 공원에 갔습니다',
  Arabic: 'ذهبنا الى الحديقة اليوم لان الطقس كان جميلا',
  Japanese: '今日は天気が良いので公園を散歩しました',
  Greek: 'Σημερα ο καιρος ηταν ωραιος και πηγαμε βολτα στο παρκο',
  Russian: 'Сегодня была хорошая погода и мы пошли гулять в парк',
  Hebrew: 'היום מזג האוויר היה נעים והלכנו לטייל בפארק',
  Shona: 'Nhasi kwanga kwakanaka saka takaenda kupaki',
  English: 'The weather was good today so we walked in the park',
};
const sec = text => ({ id: 's1', ordinal: 1, heading: '', text });
const doc = text => ({ title: 'Match report', filename: 'report.docx', sections: [sec(text)] });

const C = 'mlu', NOW = Date.now(), DAY = 86400000;
_loadAllStores({
  orgMeta: { [C]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [C]: {
    me: { id: 'me', name: 'Player One', email: 'me@m.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
    p2: { id: 'p2', name: 'Player Two', email: 'p2@m.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['first'], profileComplete: true },
  } },
  orgNodes: { [C]: { first: { nodeId: 'first', name: 'First Team', parentId: null,
    childNodeIds: [], memberIds: ['me', 'p2'], leaderIds: [] } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = w => ({ Authorization: `Bearer ${issueToken(w, C, 'member')}`,
    'Content-Type': 'application/json' });
  const call = (m, u, b, w = 'me') => fetch(base + u, { method: m, headers: H(w),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const say = (text, about, w = 'me') => call('POST', '/api/assistant/turn',
    about ? { text, about } : { text }, w);
  const said = r => String(((((r.j || {}).response) || {}).responseText) || '');
  const props = r => (((r.j || {}).response) || {}).proposedActions || [];
  const picks = (type, args) => { NEXT = { actions: [{ type, arguments: args || {},
    reason: 'asked for' }], intent: 'stated', needsClarification: null }; };
  const none = () => { NEXT = { actions: [], intent: null, needsClarification: null }; };
  /* The model read the sentence and reports that the person is ASKING about something — the
     bounded field's other value, supplied exactly as a provider would supply it. */
  const asking = () => { NEXT = { actions: [], intent: 'asked_about', needsClarification: null }; };

  try {
    /* ══ A — GOING BACK TO THE DOCUMENT IS NOT AN ENGLISH CAPABILITY ═══════════════════════ */
    console.log('\n  A — NINE WRITING SYSTEMS, ONE RETRIEVAL');
    const found = {};
    for (const [name, { q, doc: body }] of Object.entries(SCRIPTS)) {
      found[name] = material.findIn(doc(body), q);
    }
    ok('A1 every one of the nine scripts finds the part that holds its answer',
      Object.values(found).every(Boolean));
    /* NAMED INDIVIDUALLY, because "every" over a list is one assertion and the three that were
       broken should each be able to go red on their own. */
    ok('A2 …Chinese, which has no spaces between its words', !!found.Chinese);
    ok('A3 …Japanese, the same', !!found.Japanese);
    ok('A4 …Korean, whose particles ride on the end of the word', !!found.Korean);
    ok('A5 …and the ones that already worked still do',
      !!found.Arabic && !!found.Greek && !!found.Russian && !!found.Hebrew
      && !!found.Shona && !!found.English);
    /* THE CONTROL, and it is the assertion that makes A1 mean anything: a document about the
       weather in the same script is NOT returned. Without this, a tokeniser that matched
       everything would be greener than one that works. */
    ok('A6 …while a document about something else in the SAME script is not a match',
      Object.entries(UNRELATED).every(([name, body]) =>
        material.findIn(doc(body), SCRIPTS[name].q) === null));
    /* WHAT CAME BACK IS THE DOCUMENT'S OWN WORDS, not a description of them. */
    /* NULL-SAFE ON PURPOSE. The first mutation run against this file removed the bigram branch;
       A1-A4 went red correctly and then A7 THREW on `null.text`, taking every assertion behind it
       out of the run. A failing assertion must not switch off the ones after it. */
    ok('A7 …and what comes back is the document\'s own sentence, in its own script',
      Object.entries(found).every(([name, r]) => !!r && r.text.includes(SCRIPTS[name].doc)));
    /* AND THE MATCHED UNITS ARE REPORTED, so a person can see WHY a part was shown. */
    ok('A8 …with the words it matched on, so the reason is inspectable',
      Object.values(found).every(r => !!r && Array.isArray(r.matched) && r.matched.length > 0));

    /* WHAT A WORD IS HAS ONE OWNER. The learning read used to carry a second copy of the
       tokeniser, so this defect existed twice for one reason. */
    ok('A9 the tokeniser is exported, so there is one answer to "what is a word"',
      typeof material.terms === 'function');
    ok('A10 …and the learning read no longer carries its own copy of it',
      !/replace\(\/\[\^\\p\{L\}\\p\{N\}\\s-\]\/gu, ' '\)\.split/
        .test(require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8')
          .split('function _learningRead')[1] || ''));

    /* ══ B — AND IT WORKS THROUGH THE REAL DOOR, NOT ONLY IN THE PURE FUNCTION ═════════════
       A document is uploaded and asked about over HTTP, in a script that returned nothing before
       today, with no provider involved in the retrieval. */
    console.log('\n  B — THE SAME THING THROUGH THE REAL ROUTE, IN KOREAN');
    const upload = await call('POST', '/api/assistant/attachments', {
      title: '경기 보고서', filename: 'report.txt',
      text: ['보고서는 후반전 점유율이 낮았다고 말합니다',
        '수비는 안정적이었고 실점은 한 번뿐이었습니다',
        '세트피스에서 두 번의 기회를 만들었습니다'].join('\n\n'),
    });
    ok('B1 a Korean document is accepted and held',
      upload.status === 200 && !!(upload.j || {}).materialId);
    const mid = String((upload.j || {}).materialId || '');
    const cid = String((upload.j || {}).conversationId || '');
    /* THE MODEL'S HALF, STUBBED AT THE BOUNDARY: it read the sentence and says the person is
       asking about something. That is the bounded `asked_about` value already in the schema, not
       a new field and not a Korean pattern -- section E is about why the deterministic gate
       cannot do this on its own, and what happens when there is no model at all. */
    asking();
    const asked = await call('POST', '/api/assistant/turn',
      { text: '점유율에 대해 무엇이라고 하나요', conversationId: cid });
    ok('B2 …and asking about it in Korean reaches the sentence that answers it',
      /점유율이 낮았다고/.test(said(asked)));
    ok('B3 …naming the document it came from rather than asserting it as a finding',
      /경기 보고서|report\.txt/.test(said(asked)));
    /* AND ONLY THE PART THAT BEARS ON THE QUESTION. A reply that returned the whole document
       would satisfy B2 while proving nothing about retrieval. */
    ok('B4 …and not the parts that have nothing to do with it',
      !/세트피스에서 두 번의/.test(said(asked)));

    /* ══ C — A CHARACTER IS NOT ALWAYS ONE CODE UNIT ═══════════════════════════════════════
       The cap that turns free text into a stored value counted UTF-16 code units, so a character
       above U+FFFF landing on the boundary was cut in half. */
    console.log('\n  C — A LENGTH CAP MUST NOT CUT A CHARACTER IN HALF');
    const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const capped = text => {
      const n = composerActions.normalize(
        { actions: [{ type: 'create_inquiry', arguments: { text } }] },
        { object: { kind: 'conversation', id: 'c1' } });
      return String((n.actions[0] || {}).arguments.text || '');
    };
    const split = capped('字'.repeat(299) + '\u{20000}' + '尾');
    ok('C1 a character straddling the cap does not become half a character',
      !LONE.test(split));
    ok('C2 …it is dropped whole, one character short rather than one half too many',
      split.length === 299 && split === '字'.repeat(299));
    ok('C3 …and a character that fits is kept whole',
      capped('字'.repeat(298) + '\u{20000}' + '尾') === '字'.repeat(298) + '\u{20000}');
    ok('C4 …while ordinary text at the cap is unchanged by any of this',
      capped('字'.repeat(400)) === '字'.repeat(300));
    /* AND THE CANONICAL RECORD KEEPS THE PERSON'S OWN CHARACTERS. */
    picks('create_inquiry', { text: '왜 우리는 실점 후에 조용해지나요' });
    const mk = await say('왜 우리는 실점 후에 조용해지나요');
    const p = props(mk).find(x => x.actionType === 'create_inquiry');
    const done = p && await call('POST', `/api/assistant/turn/${mk.j.turnId}/confirm`, { proposalId: p.id });
    ok('C5 a question asked in Korean opens an inquiry', !!done && done.status === 200);
    const inqs = (((await call('GET', '/api/objects?kind=inquiry&scope=self')).j || {}).objects || []);
    ok('C6 …and the inquiry on the surface carries the person\'s own characters, untranslated',
      inqs.some(o => /왜 우리는 실점 후에 조용해지나요/.test(
        String((o.explained || {}).headline || '') + String((o.present || {}).summary?.full || '')
        + JSON.stringify(o.raw || {}))));

    /* ══ D — AND THE HONEST BOUNDARY, WHICH IS NOT A BUG ═══════════════════════════════════
       Retrieval matches the words that are there. A document written in one language does not
       answer a question asked in another, and the right behaviour is to say nothing was found
       rather than to produce something. This is the founder's source-material law meeting the
       language layer: never fabricate, and never claim the information is unavailable when the
       source still holds it. */
    console.log('\n  D — A QUESTION IN A LANGUAGE THE DOCUMENT IS NOT WRITTEN IN');
    ok('D1 an English question does not silently match a Korean document',
      material.findIn(doc(SCRIPTS.Korean.doc), SCRIPTS.English.q) === null);
    ok('D2 …nor a Korean question an English one',
      material.findIn(doc(SCRIPTS.English.doc), SCRIPTS.Korean.q) === null);
    /* AND NOTHING IS INVENTED IN ITS PLACE. The reply may say it could not find it; it may not
       answer as though it had. */
    /* WHAT THE PRODUCT ACTUALLY DOES HERE, measured rather than assumed: retrieval finds nothing,
       so the reply falls through to the document DESCRIBING ITSELF -- its title, how many parts it
       is in, and the opening of each. The first version of this assertion expected the Korean
       sentences to be absent and was wrong about the product, not about the law: quoting the
       document's own opening is not an answer to the question and the reply says so in as many
       words. What must be true is that it does not CLAIM to have answered, and it does not invent
       a Korean sentence that is not in the document. */
    asking();
    const crossed = await call('POST', '/api/assistant/turn',
      { text: 'what does the report say about the free kicks', conversationId: cid });
    ok('D3 …and the reply says it is the document describing itself, not a reading of it',
      /describing itself|not my reading/i.test(said(crossed)));
    ok('D3b …and claims nothing about the people here from a document in another language',
      /nothing in it counts as evidence about anyone here|external material/i.test(said(crossed)));
    ok('D3c …and every Korean sentence in the reply is one the document really contains',
      (said(crossed).match(/[\p{Script=Hangul}][^"]*/gu) || []).every(run =>
        ['보고서는 후반전 점유율이 낮았다고 말합니다', '수비는 안정적이었고 실점은 한 번뿐이었습니다',
          '세트피스에서 두 번의 기회를 만들었습니다', '경기 보고서']
          .some(real => real.includes(run.trim()) || run.trim().includes(real))));
    /* THE HALF THAT MUST STILL BE TRUE: the document is still there and still readable by the
       person who uploaded it, so "not found" was about the words and not about access. */
    const src = await call('GET', `/api/materials/${mid}`);
    ok('D4 …while the document itself is still held and still theirs', src.status === 200);
    ok('D5 …and another member holding its real id reaches nothing',
      (await call('GET', `/api/materials/${mid}`, undefined, 'p2')).status !== 200);

    /* ══ E — AND WHETHER SOMEBODY IS ASKING SOMETHING WAS AN ENGLISH JUDGEMENT ═════════════
       This is the defect section B was written to expose, and it is the one that matters most,
       because it sits IN FRONT of every answering capability rather than inside one.

       `capture.classify` decided "is this a question" from a question mark or an ENGLISH
       interrogative opener. So the Korean question in section B did not merely retrieve badly --
       it never reached the answer path at all, while the SAME document answered the SAME question
       asked in English. Every deterministic read behind that gate was unreachable in the same
       way: the material, the bound object, the learning read.

       TWO HALVES, AND NEITHER IS A WORD LIST.

       The punctuation half is deterministic and is a class rather than an allowlist: ？ ؟ ՞ ፧ and
       the rest are question marks, and a script nobody has thought of that uses one is covered
       already. The ASCII semicolon -- modern Greek's question mark -- is deliberately excluded,
       because reading every semicolon as a question would turn ordinary notes into questions.

       The other half is the model's, because a language that marks a question with a word or an
       ending rather than a symbol cannot be read any other way without becoming the allowlist the
       founder ruled against twice. It reuses the bounded field that already exists: `asked_about`
       is the other value of the `intent` the commitment gate reads, so nothing was added.

       THE HONEST LIMIT, ASSERTED RATHER THAN CLAIMED (E5/E6). With no provider, an unmarked
       question in a non-English language is still not read as a question. The gate can only
       WIDEN, never narrow, so that is precisely the behaviour that shipped before today -- but it
       is a real limit and it belongs in the record rather than in a footnote. */
    console.log('\n  E — "IS THIS A QUESTION" WAS DECIDED IN ENGLISH');
    const capture = require('../ai/capture.js');
    const q = t => capture.classify(t).isQuestion;
    ok('E1 a full-width question mark, which is what a CJK keyboard produces, counts',
      q('報告は何と言っていますか？') && q('보고서는 뭐라고 하나요？'));
    ok('E2 …and the Arabic question mark', q('ماذا يقول التقرير عن الاستحواذ؟'));
    ok('E3 …and the Armenian and Ethiopic ones', q('Ի՞նչ է ասում զեկույցը') && q('ሪፖርቱ ምን ይላል፧'));
    /* THE EXCLUSION IS AS DELIBERATE AS THE INCLUSIONS. */
    ok('E4 …while an ordinary semicolon is still a separator, not a question',
      !q('we played three games; we lost two of them and drew one'));
    /* THE LIMIT, STATED AS AN ASSERTION SO IT CANNOT QUIETLY BECOME UNTRUE EITHER WAY. */
    ok('E5 an unmarked question in another language is still not read as one deterministically',
      !q('점유율에 대해 무엇이라고 하나요') && !q('chii chinotaurwa nezve kubata bhora'));
    ok('E6 …which is why the model\'s reading is what opens it, and only ever widens',
      q('what does it say about possession') && q('보고서는 뭐라고 하나요？'));
    /* AND THE WIDENING REACHES THE REAL ROUTE, not just the pure function: the same unmarked
       Korean sentence, once the model says they are asking, gets an answer -- and with the model
       saying nothing, it does not. Both directions, so neither is a coincidence. */
    none();
    const silent = await call('POST', '/api/assistant/turn',
      { text: '점유율에 대해 무엇이라고 하나요', conversationId: cid });
    ok('E7 with no reading from the model, the unmarked Korean question finds nothing',
      !/점유율이 낮았다고/.test(said(silent)));
    asking();
    const heard = await call('POST', '/api/assistant/turn',
      { text: '점유율에 대해 무엇이라고 하나요', conversationId: cid });
    ok('E8 …and with it, the same sentence reaches the same document',
      /점유율이 낮았다고/.test(said(heard)));
    /* AND IT CANNOT NARROW. A turn that was already a question stays one whatever the model says
       about it, so a model that reads badly cannot take an English speaker's answer away. */
    NEXT = { actions: [], intent: 'stated', needsClarification: null };
    const marked = await call('POST', '/api/assistant/turn',
      { text: 'what does the report say about possession?', conversationId: cid });
    ok('E9 …and a sentence that is plainly a question is answered whatever the model calls it',
      /경기 보고서|report\.txt|보고서는/.test(said(marked)));

  } catch (e) { fail++; console.error('  FAIL multilingual-universality suite threw:', e && e.stack); }

  server.close();
  console.log(`\nmultilingual-universality-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
