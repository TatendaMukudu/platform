/* ============================================================
   ai/language.js — WHAT LANGUAGE IS THIS PERSON SPEAKING (PURE)

   The product had no notion of language at all. Not a preference, not a detection, not a
   directive — `ai/report.js` hard-codes `lang="en"` and nothing else ever asked. A person
   writing in Spanish was answered in English, every turn, with no acknowledgement that anything
   had been ignored, because nothing in the system had noticed.

   THIS IS A READER, NOT A TRANSLATOR. It answers one question — which language did somebody just
   write in — so that two other things can be true:

     · the model, which writes the prose, can be told to answer in it (see `directive`);
     · the DETERMINISTIC fallback copy, which is English and will stay English, can say so
       instead of silently answering a Spanish question in English and looking broken.

   The second is the honest half and the reason this is deliberately small. Detecting a language
   is cheap; translating a product is not, and pretending otherwise by shipping a detector with no
   fallback story would make the product worse at the moment it is least able to explain itself.

   DETERMINISTIC AND MODEL-FREE. The founder's law is that deterministic code decides and the LLM
   writes the prose; a detector that needed a provider would be unable to decide anything exactly
   when the provider was down, which is when the fallback copy is what a person sees.

   FAILS CLOSED TO NULL. "I do not know" is a first-class answer and the common one for short
   text: two words are not evidence of a language. A null means every caller behaves exactly as it
   did before this file existed, which is what makes adding it safe.
   ============================================================ */

'use strict';

/* Scripts first, because they are decisive where they apply — a line in Greek is Greek, and no
   stopword list is needed to say so. Latin script proves nothing on its own and falls through. */
const SCRIPTS = [
  ['el', 'Greek',      /[Ͱ-Ͽἀ-῿]/],
  ['ru', 'Russian',    /[Ѐ-ӿ]/],
  ['he', 'Hebrew',     /[֐-׿]/],
  ['ar', 'Arabic',     /[؀-ۿ]/],
  ['hi', 'Hindi',      /[ऀ-ॿ]/],
  ['th', 'Thai',       /[฀-๿]/],
  ['ko', 'Korean',     /[가-힯ᄀ-ᇿ]/],
  ['ja', 'Japanese',   /[぀-ゟ゠-ヿ]/],
  ['zh', 'Chinese',    /[一-鿿]/],
];

/* Function words, which is what actually separates the Latin-script languages in short text.
   Content words are the ones a bilingual speaker borrows; function words are not. Each list is
   deliberately short and high-frequency — a longer list would win more often and be wrong more
   often, because rare words overlap across languages far more than common ones do. */
const STOPWORDS = {
  en: ['the', 'and', 'is', 'to', 'of', 'in', 'it', 'that', 'for', 'with', 'not', 'but', 'this',
    'have', 'was', 'are', 'my', 'we', 'you', 'be', 'i', 'a', 'an', 'on', 'at', 'before', 'after',
    'can', 'cannot', 'me', 'so', 'do', 'am', 'if', 'when', 'about', 'from', 'they', 'he', 'she'],
  es: ['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'es', 'por', 'con',
    'no', 'para', 'mi', 'se', 'más', 'pero', 'está', 'al', 'antes', 'yo', 'muy', 'o', 'si', 'ya',
    'cuando', 'porque', 'como', 'me', 'lo', 'su', 'sus', 'este', 'esta', 'puedo', 'tengo', 'hay'],
  fr: ['le', 'la', 'les', 'de', 'des', 'et', 'est', 'en', 'un', 'une', 'que', 'pour', 'pas',
    'dans', 'qui', 'sur', 'avec', 'je', 'mais', 'plus', 'ne', 'du', 'au', 'aux', 'ce', 'cette',
    'il', 'elle', 'nous', 'vous', 'avant', 'après', 'peux', 'ai', 'très', 'si', 'quand', 'parce'],
  de: ['der', 'die', 'das', 'und', 'ist', 'ich', 'nicht', 'zu', 'den', 'mit', 'ein', 'eine',
    'für', 'auf', 'dem', 'aber', 'wir', 'auch', 'sich', 'von', 'im', 'am', 'kann', 'vor', 'nach',
    'es', 'sie', 'er', 'wenn', 'weil', 'sehr', 'noch', 'schon', 'mir', 'mein', 'meine', 'habe'],
  pt: ['o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'que', 'e', 'em', 'um', 'uma',
    'não', 'para', 'com', 'por', 'mais', 'mas', 'eu', 'está', 'no', 'na', 'ao', 'antes', 'depois',
    'se', 'muito', 'quando', 'porque', 'como', 'me', 'meu', 'minha', 'consigo', 'tenho', 'há'],
  it: ['il', 'la', 'lo', 'gli', 'le', 'di', 'che', 'e', 'in', 'un', 'una', 'non', 'per', 'con',
    'sono', 'più', 'ma', 'mi', 'si', 'come', 'del', 'della', 'al', 'alla', 'nel', 'prima', 'dopo',
    'io', 'molto', 'quando', 'perché', 'posso', 'ho', 'anche', 'se', 'da', 'suo', 'sua'],
  nl: ['de', 'het', 'een', 'en', 'is', 'van', 'ik', 'niet', 'dat', 'te', 'op', 'met', 'voor',
    'maar', 'ze', 'er', 'aan', 'ook', 'zijn', 'naar', 'in', 'om', 'kan', 'heb', 'mijn', 'wij',
    'hij', 'zij', 'als', 'omdat', 'heel', 'nog', 'al', 'dan', 'wel', 'bij', 'over'],
  pl: ['i', 'w', 'nie', 'to', 'jest', 'na', 'że', 'się', 'do', 'z', 'ale', 'jak', 'co', 'tak',
    'po', 'dla', 'od', 'przez', 'jego', 'być', 'mnie', 'mój', 'moja', 'przed', 'bardzo', 'już',
    'kiedy', 'bo', 'mam', 'mogę', 'jeszcze', 'tylko', 'czy', 'ten', 'ta', 'o'],
};

const NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
  it: 'Italian', nl: 'Dutch', pl: 'Polish', el: 'Greek', ru: 'Russian', he: 'Hebrew',
  ar: 'Arabic', hi: 'Hindi', th: 'Thai', ko: 'Korean', ja: 'Japanese', zh: 'Chinese' };

/* The floor. Below this many words, a guess is a coin toss dressed as a finding — "ok thanks"
   is not evidence of anything — so the honest answer is that we do not know. */
const MIN_WORDS = 4;

function nameOf(code) { return NAMES[String(code || '')] || null; }

/* Which language is this, if it can be told? Returns { code, name, confident } or null.
   `confident` is separate from returning an answer at all: a clear winner among function words
   is confident, a narrow one is a lean, and a caller that will CHANGE the product's behaviour
   should ask for confidence while one that is merely labelling need not. */
function detect(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;

  for (const [code, name, re] of SCRIPTS) {
    if (re.test(raw)) return { code, name, confident: true };
  }

  const words = raw.toLowerCase()
    .replace(/[^\p{L}\p{M}\s']/gu, ' ')
    .split(/\s+/).filter(Boolean);
  if (words.length < MIN_WORDS) return null;

  const set = new Set(words);
  const scores = [];
  for (const [code, list] of Object.entries(STOPWORDS)) {
    let hits = 0;
    for (const w of list) if (set.has(w)) hits++;
    if (hits) scores.push([code, hits]);
  }
  if (!scores.length) return null;
  scores.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [code, top] = scores[0];
  const runnerUp = scores[1] ? scores[1][1] : 0;
  // One hit on one list is a word, not a language. Two clear of the field is a language.
  if (top < 2) return null;
  return { code, name: NAMES[code], confident: top - runnerUp >= 2 };
}

/* THE DIRECTIVE THE MODEL RECEIVES. Nothing here decides anything about content — it says which
   language the prose should be in, which is a property OF prose and therefore the model's job
   under the founder's law. Empty for English and for an unknown, so the ordinary path is
   unchanged and costs no tokens. */
function directive(lang) {
  if (!lang || !lang.code || lang.code === 'en') return '';
  return `LANGUAGE — this person is writing in ${lang.name}. Reply in ${lang.name}. `
    + 'Do not translate names of people, groups or organisations, and do not switch language '
    + 'part-way through. If you are quoting something they wrote, quote it as they wrote it.';
}

/* AND THE HONEST LINE WHEN THE PROSE IS NOT AVAILABLE. The deterministic copy in this product is
   English and will stay English: it is not model-written, so there is nothing to instruct. A
   person writing in Spanish who gets an English sentence back is owed the reason, because the
   alternative is a product that looks broken rather than one that is limited. Empty for English
   and for an unknown, so nothing is said where nothing needs saying. */
function fallbackNote(lang) {
  if (!lang || !lang.code || lang.code === 'en') return '';
  return `This part of IntelliQ can only answer in English at the moment, so this reply is in `
    + `English rather than ${lang.name}.`;
}

module.exports = { detect, directive, fallbackNote, nameOf, MIN_WORDS, STOPWORDS, NAMES };
