/* Truth layer — THE PRODUCT ANSWERS IN THE LANGUAGE IT WAS SPOKEN TO IN.

   At 1c3a5a0 the product had NO notion of language anywhere. Not a preference, not a detection,
   not a directive; `ai/report.js` hard-codes `lang="en"` and nothing else ever asked. A person
   writing in Spanish was answered in English, every turn, with nothing in the system having
   noticed that anything had been ignored — and no sentence anywhere acknowledging it.

   THE SPLIT IS THE FOUNDER'S LAW, APPLIED TO LANGUAGE.

     · Language is a property OF PROSE, so choosing the words is the model's half. It is told
       which language to write in and writes in it.
     · WHICH language is a decision, so it is deterministic: ai/language.js, model-free, failing
       closed to null. A detector that needed a provider could not decide anything exactly when
       the provider was down — which is precisely when the deterministic copy is what a person is
       reading.
     · And the deterministic copy IS English and will stay English. It is written in server.js,
       not by a model, so there is nothing to instruct. A person owed an English paragraph is
       owed the reason for it, because a bounded product that explains itself is usable and a
       silent one looks broken.

   DETECTION IS REMEMBERED, NOT RE-GUESSED PER TURN. "ok, thanks" tells you nothing, and
   re-deciding on every message would make the product switch language mid-conversation on one
   ambiguous line — which is the exact failure the directive tells the model not to commit. It is
   recorded when somebody writes enough to be evidence, from THEIR OWN WORDS only: what the
   product said back is not evidence of what they speak.

   Run: node scripts/language-continuity-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
/* MODELS OFF. Everything asserted here must hold on the deterministic path, which is the path a
   pilot actually runs on when a provider is unreachable. */
process.env.IQ_DETERMINISTIC_ONLY = '1';

const S = require('../server.js');
const language = require('../ai/language.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, userAiProfiles, _domainDirective } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const O = 'lng';
_loadAllStores({
  orgMeta: { [O]: { orgName: 'Language Org', orgMode: 'sports' } },
  orgUsers: { [O]: {
    es: { id: 'es', name: 'Ana',  email: 'a@l.io', role: 'member', orgCode: O, status: 'active' },
    en: { id: 'en', name: 'Ben',  email: 'b@l.io', role: 'member', orgCode: O, status: 'active' },
    qq: { id: 'qq', name: 'Quin', email: 'q@l.io', role: 'member', orgCode: O, status: 'active' },
  } },
  orgNodes: { [O]: {} },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const turn = (text, who) => fetch(base + '/api/assistant/turn', {
    method: 'POST',
    headers: { Authorization: `Bearer ${issueToken(who, O, 'member')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const reply = r => String(((r.j || {}).response || {}).responseText || '');
  const writesIn = who => ((userAiProfiles[`${O}:${who}`] || {}).writesIn || {}).code || null;

  try {
    console.log('\n  A — THE DECISION IS DETERMINISTIC, AND IT IS ALLOWED TO SAY IT DOES NOT KNOW');
    const cases = [
      ['en', 'The team is not training well and I want to work on it'],
      ['es', 'El equipo no está entrenando bien y quiero trabajar en eso'],
      ['fr', 'Je ne peux pas dormir avant le match de samedi'],
      ['de', 'Ich kann vor dem Spiel am Samstag nicht schlafen'],
      ['pt', 'Não consigo dormir antes do jogo de sábado'],
      ['it', 'Non riesco a dormire prima della partita di sabato'],
      ['nl', 'Ik kan niet slapen voor de wedstrijd op zaterdag'],
      ['pl', 'Nie mogę spać przed meczem w sobotę'],
      ['el', 'Δεν μπορώ να κοιμηθώ πριν τον αγώνα'],
    ];
    for (const [want, text] of cases) {
      ok(`LC-A1 ${want}: "${text.slice(0, 34)}…" is read as ${language.NAMES[want]}`,
        (language.detect(text) || {}).code === want);
    }
    /* "ok thanks" and "yes" contain no function words at all, so they would come back null
       however low the floor was set — which makes them a weak proof of the floor. `is it` and
       `the` are the cases that separate the two: every word is a high-frequency English function
       word, so a detector with a lower bar names English confidently from two words of nothing. */
    ok('LC-A2 …while a handful of words is not evidence of a language, and it says so rather than guessing',
      language.detect('ok thanks') === null && language.detect('yes') === null
      && language.detect('is it') === null && language.detect('the') === null
      && language.detect('and the') === null);
    ok('LC-A3 …and empty input is not an error, it is an absence',
      language.detect('') === null && language.detect(null) === null);
    /* NO MODEL, AND THE SOURCE IS THE PROOF. A detector that awaited anything would be unable to
       decide exactly when the provider was down, which is when the fallback copy is on screen. */
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'ai', 'language.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok('LC-A4 the owner requires nothing, awaits nothing, and calls no provider',
      !/require\(/.test(src) && !/await|async|gateway|fetch/.test(src));

    console.log('\n  B — AND IT IS THE PERSON\'S OWN WORDS THAT DECIDE');
    ok('LC-B1 before they write anything, the product claims to know nothing',
      writesIn('es') === null);
    const first = await turn('El equipo no está entrenando bien y quiero trabajar en eso antes del partido', 'es');
    ok('LC-B2 a turn in Spanish is answered, and the language is noted',
      first.status === 200 && writesIn('es') === 'es');
    ok('LC-B3 …and noting it did not change anything about what was saved or shared',
      !/guardado|compartido/i.test(reply(first)));
    const englishSpeaker = await turn('The team is not training well and I want to work on it', 'en');
    ok('LC-B4 an English speaker is recorded as English, so this is a reading and not a default',
      englishSpeaker.status === 200 && writesIn('en') === 'en');
    const shrug = await turn('ok thanks', 'qq');
    ok('LC-B5 …and somebody who has said nothing substantial is left unlabelled',
      shrug.status === 200 && writesIn('qq') === null);

    console.log('\n  C — THE MODEL IS TOLD WHICH LANGUAGE TO WRITE IN');
    const esDirective = _domainDirective(O, { userId: 'es' });
    ok('LC-C1 the shared directive every AI entry point already makes now carries the language',
      /writing in Spanish/.test(esDirective) && /Reply in Spanish/.test(esDirective));
    ok('LC-C2 …and tells it not to switch part-way through, which is the failure people notice',
      /not to switch|do not switch/i.test(esDirective));
    ok('LC-C3 …and not to translate the names of people or groups',
      /[Dd]o not translate names/.test(esDirective));
    const enDirective = _domainDirective(O, { userId: 'en' });
    /* MATCHED ON THIS DIRECTIVE'S OWN WORDS. The first version tested for "LANGUAGE —", which
       ai/packs.js also emits ("ORGANISATION LANGUAGE — this is a sports organisation"), so the
       assertion was reading the vocabulary directive and would have passed whatever this one
       did. PROTOCOL lie #4: a pattern that matches something else. */
    ok('LC-C4 an English speaker adds NOTHING, so the ordinary path is unchanged and costs no tokens',
      !/Reply in /.test(enDirective) && enDirective === _domainDirective(O, { userId: 'en' }));
    const unknownDirective = _domainDirective(O, { userId: 'qq' });
    ok('LC-C5 …and so does somebody we could not read — an unknown is not a guess',
      !/Reply in /.test(unknownDirective));
    ok('LC-C6 …and the organisation\'s own vocabulary directive still arrives intact beside it',
      esDirective.length > language.directive({ code: 'es', name: 'Spanish' }).length);

    console.log('\n  D — AND WHERE THE PROSE IS NOT THE MODEL\'S, THE LIMIT IS STATED');
    /* The deterministic copy is written in server.js and will stay English. A person writing in
       Spanish who receives an English paragraph is owed the reason. */
    const second = await turn('Quiero hablar sobre el entrenamiento de la semana pasada', 'es');
    ok('LC-D1 the English answer says, in the answer, that it is English and why',
      /can only answer in English/i.test(reply(second))
      && /rather than Spanish/i.test(reply(second)));
    const englishReply = await turn('I want to talk about last week and how it went', 'en');
    ok('LC-D2 …and an English speaker is never told their English reply is in English',
      !/can only answer in English/i.test(reply(englishReply)));
    const unknownReply = await turn('ok', 'qq');
    ok('LC-D3 …nor is somebody whose language we could not read',
      !/can only answer in English/i.test(reply(unknownReply)));
    ok('LC-D4 …and the note is appended to a real answer rather than replacing it',
      reply(second).replace(/This part of IntelliQ[^]*$/, '').trim().length > 0);

    console.log('\n  E — AND IT DOES NOT FLIP ON ONE AMBIGUOUS LINE');
    /* The failure people actually report is a product that changes language mid-conversation. The
       record stands until they write something else long enough to be evidence. */
    const briefly = await turn('ok', 'es');
    ok('LC-E1 a short message does not un-set what they were writing in',
      briefly.status === 200 && writesIn('es') === 'es');
    const switched = await turn('Actually I would like to carry on in English from here please', 'es');
    ok('LC-E2 …but a deliberate switch, in full sentences, IS followed',
      switched.status === 200 && writesIn('es') === 'en');
    ok('LC-E3 …and the English-only note stops appearing the moment it is no longer true',
      !/can only answer in English/i.test(reply(switched)));

    console.log('\n  F — AND NONE OF THIS IS A SECOND OPINION ABOUT ANYTHING ELSE');
    ok('LC-F1 the detector answers about language and nothing else',
      typeof language.detect === 'function' && typeof language.directive === 'function'
      && typeof language.fallbackNote === 'function'
      && Object.keys(language).length <= 8);
    ok('LC-F2 …and says nothing at all for English, in both of its outputs',
      language.directive({ code: 'en', name: 'English' }) === ''
      && language.fallbackNote({ code: 'en', name: 'English' }) === '');
    ok('LC-F3 …and nothing at all for an unknown, which is what makes adding it safe',
      language.directive(null) === '' && language.fallbackNote(null) === '');

  } catch (e) { fail++; console.error('  FAIL language-continuity suite threw:', e && e.stack); }

  server.close();
  console.log(`\nlanguage-continuity-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
