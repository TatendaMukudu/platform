/* Truth layer — THE LANGUAGE SURVIVES THE WHOLE LOOP, NOT JUST THE FIRST REPLY.

   The sister suite (`language-continuity-http-smoke`) proves the decision is deterministic and
   that the directive is emitted. This one proves the property the founder actually reported
   losing: the language holds across every boundary the product crosses on the way to doing
   something — an attachment, retrieval, creating a Focus, posting to a Forum, confirming a
   consequential action, and a provider dropping and coming back.

   TWO THINGS THIS FILE CANNOT DO, STATED SO NOBODY READS MORE INTO IT THAN IT PROVES.

     · Models are off (IQ_DETERMINISTIC_ONLY), which is the pilot's real state. So this asserts
       the DIRECTIVE THAT WOULD REACH THE MODEL, captured at each boundary — not the prose a
       model writes. "Reply in Shona" arriving at every step is the half this codebase owns; that
       the model then obeys it is the model's half and is not tested here.
     · It does not judge Shona or Ndebele prose. It judges which language the product DECIDED on,
       which is deterministic code and therefore testable.

   THE PILOT IS IN ZIMBABWE AND NEITHER LANGUAGE EXISTED. Measured at b6dfaaa, before this pass:
   `detect('Ndinofunga kuti tinonyarara kana tabayiwa zvibodzwa')` returned null — no language,
   therefore no directive, therefore an English answer to somebody writing Shona, every turn,
   with nothing anywhere noticing. Ndebele the same. That is the defect this file exists over.

   Run: node scripts/language-journey-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const language = require('../ai/language.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, userAiProfiles, _domainDirective } = S;

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'lgj';
const mk = (id, name) => ({ id, name, email: `${id}@lgj.io`, role: 'member', orgCode: O,
  status: 'active', assignedNodeIds: ['first'], profileComplete: true });
_loadAllStores({
  orgMeta: { [O]: { orgName: 'Highlanders', orgMode: 'sports' } },
  orgUsers: { [O]: {
    sn1: mk('sn1', 'Tendai'), sn2: mk('sn2', 'Rudo'),
    nd1: mk('nd1', 'Sipho'),  mix: mk('mix', 'Farai'), en1: mk('en1', 'Ben'),
    unl: mk('unl', 'Amani'),
    coach: { id: 'coach', name: 'Coach', email: 'c@lgj.io', role: 'coach', orgCode: O,
      status: 'active', leadershipNodeIds: ['first'], assignedNodeIds: ['first'], profileComplete: true },
  } },
  orgNodes: { [O]: { first: { nodeId: 'first', name: 'First Team', parentId: null,
    childNodeIds: [], memberIds: ['sn1', 'sn2', 'nd1', 'mix', 'en1', 'unl', 'coach'], leaderIds: ['coach'] } } },
});
_rebuildEmailIndex();

/* REAL SENTENCES, long enough to be evidence, in the shape somebody actually writes them. */
const SHONA   = 'Ndinofunga kuti tinonyarara kana tabayiwa zvibodzwa uye izvi zvakaoma';
const SHONA_2 = 'Hapana chakanaka pamwe tinofanira kutaura zvakare nokuti zvino zvakaoma';
const NDEB    = 'Ngicabanga ukuthi siyathula nxa sesifakwe igoli kodwa manje sengathi kuhle';
const NDEB_2  = 'Abantu bami kabakhulumi lapho kodwa mina ngithi njalo kuphela lokhu';
const ENGLISH = 'I think we go quiet after we concede and it is hurting us badly';
const MIXED   = 'Ndinofunga we need to talk more after conceding kana tabayiwa';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, O,
    who === 'coach' ? 'coach' : 'member')}`, 'Content-Type': 'application/json' });
  const call = (m, u, b, who) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const turn = (text, who, extra) => call('POST', '/api/assistant/turn',
    Object.assign({ text }, extra || {}), who);

  /* WHAT THE MODEL WOULD BE TOLD, right now, for this person. This is the captured boundary. */
  const tellsModel = who => _domainDirective(O, { userId: who });
  const decided    = who => ((userAiProfiles[`${O}:${who}`] || {}).writesIn || {}).code || null;

  try {
    /* ══ A — THE TWO LANGUAGES THE PILOT IS ACTUALLY IN ════════════════════════════════════ */
    console.log('\n  A — SHONA AND NDEBELE ARE LANGUAGES THIS PRODUCT CAN TELL APART');
    await turn(SHONA, 'sn1');
    ok('A1 a Shona speaker is read as writing Shona', decided('sn1') === 'sn');
    ok('A2 …and the model is told to reply in Shona', /reply in Shona/i.test(tellsModel('sn1')));
    await turn(NDEB, 'nd1');
    ok('A3 a Ndebele speaker is read as writing Ndebele', decided('nd1') === 'nd');
    ok('A4 …and the model is told to reply in Ndebele', /reply in Ndebele/i.test(tellsModel('nd1')));
    /* THE HALF THE FOUNDER WARNED ABOUT. Two Bantu languages a model can approximately read must
       not be collapsed into one because they look similar from outside. */
    ok('A5 …and the Shona speaker was not read as Ndebele', decided('sn1') !== 'nd');
    ok('A6 …nor the Ndebele speaker as Shona', decided('nd1') !== 'sn');
    ok('A7 …and neither is told to reply in the other\'s language',
      !/reply in Ndebele/i.test(tellsModel('sn1')) && !/reply in Shona/i.test(tellsModel('nd1')));
    /* A1-A7 TURN ON TWO SENTENCES, AND TWO SENTENCES ARE NOT A PROPERTY. Moving one Shona word
       into the Ndebele list left all of them green, because the remaining words still carried the
       fixture — so the discrimination was asserted only as far as this fixture happened to
       exercise it. Two sharper checks below: the lists may not overlap at all, and a battery of
       sentences in each language must each land on their own. */
    const { STOPWORDS } = language;
    const shared = STOPWORDS.sn.filter(w => STOPWORDS.nd.includes(w));
    ok('A7b the two word lists share no word at all, so neither can score for the other',
      shared.length === 0);
    if (shared.length) console.error('     shared:', shared.join(', '));
    const SN_BATTERY = [
      'Ndinofunga kuti vanhu vedu havasi kutaura zvakanaka pamwe',
      'Hapana chinhu chakanaka asi ini ndinoda kuti tigadzirise izvi zvino',
      'Tinofanira kutaura zvakare nokuti izvi zvakaoma kwazvo kwete',
    ];
    const ND_BATTERY = [
      'Ngicabanga ukuthi abantu bethu kabakhulumi kuhle njalo lapho',
      'Akula lutho oluhle kodwa mina ngithi sithi silungise lokhu manje',
      'Kumele sikhulume njalo ngoba lokhu kunzima kakhulu hatshi',
    ];
    ok('A7c three different Shona sentences each land on Shona',
      SN_BATTERY.every(t => (language.detect(t) || {}).code === 'sn'));
    ok('A7d …and three different Ndebele sentences each land on Ndebele',
      ND_BATTERY.every(t => (language.detect(t) || {}).code === 'nd'));
    /* THE CONTROL. Everything above would pass against a detector that answers "Shona" to
       everything, so English must still be English and still add nothing. */
    await turn(ENGLISH, 'en1');
    ok('A8 an English speaker is still English, so A1-A7 are readings and not a default',
      decided('en1') === 'en');
    ok('A9 …and adds no directive at all, so the ordinary path costs nothing',
      !/reply in /i.test(tellsModel('en1')));

    /* ══ B — SWITCHING MID-CONVERSATION IS FOLLOWED, NOT CORRECTED ═════════════════════════
       The founder's law: a person who changes language has changed language. The directive used
       to say "do not switch language part-way through" without qualification, which told the
       model to do the opposite of this. */
    console.log('\n  B — A PERSON WHO CHANGES LANGUAGE IS FOLLOWED');
    await turn(ENGLISH, 'sn2');
    ok('B1 they start in English and are read as English', decided('sn2') === 'en');
    await turn(SHONA_2, 'sn2');
    ok('B2 …they move to Shona and the product moves with them', decided('sn2') === 'sn');
    ok('B3 …and the model is now told Shona rather than English',
      /reply in Shona/i.test(tellsModel('sn2')));
    await turn(ENGLISH, 'sn2');
    ok('B4 …and back to English is equally followed', decided('sn2') === 'en');
    ok('B5 …with the directive going quiet again', !/reply in /i.test(tellsModel('sn2')));
    await turn(NDEB_2, 'sn2');
    ok('B6 …and English to Ndebele is followed too', decided('sn2') === 'nd');

    /* ══ C — MIXING IS NOT A SWITCH, AND IS NOT CORRECTED EITHER ═══════════════════════════
       Somebody writing Shona who reaches for an English word has not changed language. The
       detector returns a LEAN rather than a confident answer, `_noteLanguage` declines to record
       it, and what they were already writing in stands. */
    console.log('\n  C — BORROWING ENGLISH WORDS DOES NOT DRAG THEM INTO ENGLISH');
    await turn(SHONA, 'mix');
    ok('C1 they are established as writing Shona', decided('mix') === 'sn');
    await turn(MIXED, 'mix');
    ok('C2 …a mixed sentence does not flip them to English', decided('mix') === 'sn');
    ok('C3 …and the model is still told Shona', /reply in Shona/i.test(tellsModel('mix')));
    ok('C4 …because a mixed sentence is a lean, not a confident reading',
      !((language.detect(MIXED) || {}).confident));
    ok('C5 …and the directive tells the model to mirror the mixing rather than force one language',
      /mix languages/i.test(tellsModel('mix')) && /mirror/i.test(tellsModel('mix')));

    /* ══ D — EVERY BOUNDARY IN THE LOOP ════════════════════════════════════════════════════
       The reported failure was a reset to English after something happened. Each step below is a
       real boundary the product crosses, and the language must be intact on the far side. */
    console.log('\n  D — THE LANGUAGE SURVIVES EVERY BOUNDARY THE LOOP CROSSES');
    const stillShona = where => ok(`D:${where} still Shona on the far side`,
      decided('sn1') === 'sn' && /reply in Shona/i.test(tellsModel('sn1')));

    const att = await call('POST', '/api/assistant/attachments',
      { filename: 'results.txt', text: 'Draw 1-1. Draw 0-0. Draw 2-2. Draw 1-1.' }, 'sn1');
    ok('D1 an attachment is accepted', att.status === 200);
    stillShona('attachment');

    await turn('Ndinoda kunzwa zvakawanda pamusoro pezvi zvakare', 'sn1');
    stillShona('retrieval');

    const f = await call('POST', '/api/me/focus',
      { text: 'Kutaura pakarepo kana tabayiwa zvibodzwa' }, 'sn1');
    ok('D2 a Focus can be created while writing Shona', f.status === 200);
    stillShona('focus creation');

    const fid = f.j && f.j.focus && f.j.focus.id;
    await call('POST', `/api/me/focus/${fid}/visibility`, { visibility: 'shared' }, 'sn1');
    stillShona('audience change');

    await turn('Hongu, ndinobvuma, itai izvozvo', 'sn1');
    stillShona('confirmation');

    /* ══ E — AND A PROVIDER DROPPING DOES NOT RESET IT ═════════════════════════════════════
       The specific failure the founder reported. The decision lives in the person's stored
       profile, not in a model or a request, so it cannot be lost when a provider goes and comes
       back — and this is the assertion that keeps that true. */
    console.log('\n  E — A PROVIDER DROPPING AND RETURNING DOES NOT RESET THE LANGUAGE');
    const ai = require('../ai/gateway.js');
    const wasEnabled = ai.enabled;
    ai.enabled = () => false;
    const down = await turn('Chii chiri kuitika izvozvi', 'sn1');
    ok('E1 a turn is still answered with no provider', down.status === 200);
    ok('E2 …and the language decision is untouched by the outage', decided('sn1') === 'sn');
    ai.enabled = wasEnabled;
    await turn('Zvakanaka, ngatienderere mberi nazvo', 'sn1');
    ok('E3 …and it is still Shona after the provider comes back', decided('sn1') === 'sn');
    ok('E4 …with the model told Shona on the very next turn',
      /reply in Shona/i.test(tellsModel('sn1')));

    /* ══ F — ONE FOCUS IS ONE FOCUS, WHATEVER LANGUAGE IT IS DISCUSSED IN ══════════════════
       The founder's law: language is the conversational layer around the same governed object.
       A Shona conversation must not mint a second copy of anything. */
    console.log('\n  F — THE CANONICAL OBJECTS ARE NOT LANGUAGE-SPECIFIC COPIES');
    /* `kind` IS REQUIRED BY THIS ROUTE and the first version of this omitted it, so the request
       404'd into a 400 and both counts were zero — F1 compared nothing with nothing and passed.
       F1pre exists so that can never happen quietly again. */
    const focusList = async () => (await call('GET', '/api/objects?kind=focus&scope=self', undefined, 'sn1'));
    const before = await focusList();
    const countFocuses = r => (((r || {}).j || {}).objects || []).length;
    ok('F1pre the focus list route answers, so the counts below are counting something',
      before.status === 200 && countFocuses(before) > 0);
    const n1 = countFocuses(before);
    await turn('Ndiratidzewo maererano neizvi zvandiri kushanda pazviri', 'sn1');
    await turn('Tell me about that same thing in English now please', 'sn1');
    const after = await focusList();
    ok('F1 discussing it in two languages did not create a second Focus',
      countFocuses(after) === n1 && n1 > 0);
    /* AND THE PERSON'S OWN WORDS ARE KEPT AS THEY WROTE THEM, not translated into the language
       of whoever looks next. */
    const mine = ((after.j || {}).objects || []).find(o => String(o.id) === String(fid));
    ok('F2 …and the Focus still carries the Shona the person actually typed',
      !!mine && /Kutaura pakarepo/.test(JSON.stringify(mine)));

    /* ══ G — THE ENGLISH-ONLY NOTE NAMES THE RIGHT LANGUAGE ════════════════════════════════
       The deterministic copy is English and stays English. A Shona speaker owed an English
       paragraph is owed the reason, and the reason has to name Shona. */
    console.log('\n  G — WHERE THE PRODUCT CAN ONLY ANSWER IN ENGLISH, IT SAYS SO IN THE RIGHT WORDS');
    ok('G1 the note names Shona for a Shona speaker',
      /Shona/.test(language.fallbackNote({ code: 'sn', name: 'Shona' })));
    ok('G2 …and Ndebele for a Ndebele speaker',
      /Ndebele/.test(language.fallbackNote({ code: 'nd', name: 'Ndebele' })));
    ok('G3 …and says nothing at all to an English speaker',
      language.fallbackNote({ code: 'en', name: 'English' }) === '');
    ok('G4 …and both languages have real names rather than codes',
      language.nameOf('sn') === 'Shona' && language.nameOf('nd') === 'Ndebele');

    /* ══ H — A LANGUAGE NOBODY LISTED ══════════════════════════════════════════════════════
       THE ARCHITECTURE QUESTION, not a language question. Shona and Ndebele were added to a word
       table, and that fixed Shona and Ndebele. Measured at e4d647a with the table in place:
       Swahili, Xhosa, Turkish, Indonesian and Vietnamese still produced NO directive at all, so
       each of them was silently answered in English. Adding five more lists would fix five more
       languages and leave the sixth broken — an allowlist, not an architecture.

       Identifying a language is something a language model does well and a stopword table does
       badly: this table reads Zulu as Ndebele, which is the same close-language confusion it was
       extended to avoid. So deterministic code no longer tries to name every language. When it
       cannot name one it states the law it does own — answer them in the language they are
       writing in — and the model, which can tell Zulu from Ndebele, does the identifying.

       These assertions are about a PROPERTY. They must keep passing for languages nobody has
       thought of, which is why none of them names a language in the expected output. */
    console.log('\n  H — A LANGUAGE WITH NO WORD LIST STILL GETS ANSWERED IN IT');
    const UNLISTED = {
      Swahili:    'Nadhani tunakaa kimya baada ya kufungwa bao na hii inatuumiza sana',
      Xhosa:      'Ndicinga ukuba siyathula xa sifakwe igoli kwaye oku kuyasenzakalisa',
      Turkish:    'Gol yedikten sonra sessiz kaldigimizi dusunuyorum ve bu bize zarar veriyor',
      Indonesian: 'Saya pikir kami menjadi diam setelah kebobolan dan ini sangat merugikan kami',
      Vietnamese: 'Toi nghi rang chung toi im lang sau khi bi thung luoi va dieu nay rat te',
    };
    ok('H1 none of these languages is in the word table, which is the point',
      Object.values(UNLISTED).every(t => language.detect(t) === null));
    const unnamed = language.directive(null);
    ok('H2 …and a person the table cannot read still gets a language instruction',
      /answer this person in the language they are writing in/i.test(unnamed));
    ok('H3 …which says explicitly not to fall back to English',
      /do not default to English/i.test(unnamed));
    ok('H4 …and names no language, so it holds for one nobody has thought of yet',
      !Object.keys(language.NAMES).some(c => c !== 'en'
        && new RegExp('\\b' + language.NAMES[c] + '\\b').test(unnamed)));
    /* THE SAME INSTRUCTION HAS TO REACH A REAL PERSON THROUGH THE REAL SEAM, not just exist in a
       pure function — the whole defect was that the seam emitted nothing. */
    await turn(UNLISTED.Swahili, 'unl');
    ok('H5 a Swahili speaker reaches the model with an instruction to answer in their language',
      /answer this person in the language they are writing in/i.test(tellsModel('unl')));
    ok('H6 …and the table still, honestly, does not claim to know which language it is',
      decided('unl') === null);
    /* AND THE ORDINARY ENGLISH PATH IS STILL FREE. A universal clause on every prompt would be
       the lazy version of this; English is known, so it is told nothing. */
    /* MATCHED ON THIS DIRECTIVE'S OWN WORDS. The first version tested for the absence of
       "LANGUAGE —", which ai/packs.js also emits ("ORGANISATION LANGUAGE — this is a sports
       organisation"), so it was reading the VOCABULARY directive and failing against correct
       code. The sister suite's LC-C4 carries a comment warning about exactly this trap, written
       after it caught somebody once already. */
    const enDir = _domainDirective(O, { userId: 'en1' });
    ok('H7 …while a known English speaker still adds no language instruction at all',
      !/reply in /i.test(enDir) && !/answer this person in the language/i.test(enDir));
    /* THE CLAUSES THE FOUNDER NAMED, carried by BOTH forms so they cannot drift apart. */
    for (const [what, rx] of [['an explicit request for another language', /ASK you to answer/i],
                              ['the language of an attachment', /document they attach/i],
                              ['the language of a cited source', /source you cite/i]]) {
      ok(`H8 both the named and unnamed instruction cover ${what}`,
        rx.test(unnamed) && rx.test(language.directive({ code: 'sn', name: 'Shona' })));
    }

  } catch (e) { fail++; console.error('  FAIL language-journey suite threw:', e && e.stack); }

  server.close();
  console.log(`\nlanguage-journey-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
