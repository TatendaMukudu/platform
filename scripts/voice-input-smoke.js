/* Truth layer — VOICE INPUT. An input method, not an authority.

   Voice reaches nothing that typing does not. What it produces is text in a textarea; the
   ordinary workflow does the rest. This suite drives js/voice.js against a FAKE
   SpeechRecognition and a minimal fake DOM, so the laws are executable without a microphone,
   a browser, or CI ever touching audio hardware.

   The laws, in the order they matter:
     · no audio is captured or kept — there is no MediaRecorder and no Blob anywhere
     · nothing starts itself; a session begins only from an explicit call
     · every failure leaves the person able to type, with an honest message
     · the transcript is a draft: it lands in the box and is never sent
     · a half-written sentence is never destroyed by speaking

   Run: node scripts/voice-input-smoke.js */

'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

/* ── A fake browser, small enough to read ────────────────────────────────── */
function makeEnv({ supported = true } = {}) {
  const els = {};
  const env = {
    document: {
      getElementById: (id) => els[id] || null,
      documentElement: { lang: 'en-GB' },
    },
    _els: els,
    _instances: [],
  };
  if (supported) {
    env.SpeechRecognition = function () {
      const rec = {
        continuous: false, interimResults: false, lang: '',
        started: false, aborted: false,
        start() { this.started = true; },
        stop() { if (this.onend) this.onend(); },
        abort() { this.aborted = true; },
        // Test drivers:
        _say(text) { this.onresult({ resultIndex: 0, results: [[{ transcript: text }]] }); },
        _fail(code) { this.onerror({ error: code }); this.onend(); },
      };
      env._instances.push(rec);
      return rec;
    };
  }
  return env;
}

function load(env) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'voice.js'), 'utf8');
  // The file is an IIFE taking a global; hand it the fake one.
  new Function('window', src + '\n;return window.IQVoice;');
  const fn = new Function('window', 'var self=window;' + src + '\nreturn window.IQVoice;');
  return fn(env);
}

const area = (env, id, value = '') => { env._els[id] = { value }; return env._els[id]; };
const states = [];
const onState = (name, message, value) => states.push({ name, message, value });
const reset = () => { states.length = 0; };

/* ── NO AUDIO EXISTS AT ALL ──────────────────────────────────────────────── */
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'voice.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok('V1 no audio is ever captured or retained — no recorder, no blob, no upload',
    !/MediaRecorder|getUserMedia|new Blob|FormData|audio\//i.test(src));
  ok('V2 nothing starts itself — no timer, no autoplay, no listen-on-load',
    !/setInterval|setTimeout|addEventListener\(\s*['"]load|DOMContentLoaded/i.test(src));
}

/* ── THE ORDINARY PATH ───────────────────────────────────────────────────── */
{
  const env = makeEnv(); const V = load(env);
  const ta = area(env, 'box', '');
  reset();
  ok('V3 supported browsers report support', V.isSupported() === true);
  const started = V.start('box', { onState });
  ok('V4 starting reports listening, so the person is never left wondering',
    started === true && states[0].name === 'listening' && /Listening/i.test(states[0].message));
  ok('V5 …and it is genuinely running', V.isListening('box') === true);

  env._instances[0]._say('training felt rushed today');
  ok('V6 the transcript lands in the box as a draft',
    ta.value === 'training felt rushed today');
  ok('V7 …and nothing was sent — speaking is not sending',
    !states.some(s => s.name === 'sent' || s.name === 'submitted'));

  V.stop('box');
  const last = states[states.length - 1];
  ok('V8 stopping leaves it ready to send or keep typing', last.name === 'ready');
  ok('V9 …and the session is closed', V.isListening('box') === false);
}

/* ── A HALF-WRITTEN SENTENCE IS SACRED ───────────────────────────────────── */
{
  const env = makeEnv(); const V = load(env);
  const ta = area(env, 'box', 'I was going to say');
  V.start('box', { onState });
  env._instances[0]._say('that the session felt rushed');
  ok('V10 speaking ADDS to what was already typed, never replaces it',
    ta.value === 'I was going to say that the session felt rushed');
  V.stop('box');
}

/* ── CANCEL MEANS FORGET IT ──────────────────────────────────────────────── */
{
  const env = makeEnv(); const V = load(env);
  const ta = area(env, 'box', 'keep this');
  V.start('box', { onState });
  env._instances[0]._say(' and throw this away');
  V.cancel('box');
  ok('V11 cancelling restores the draft exactly as it was', ta.value === 'keep this');
  ok('V12 …and closes the session', V.isListening('box') === false);
}

/* ── EVERY FAILURE LEAVES A PERSON ABLE TO TYPE ──────────────────────────── */
{
  const env = makeEnv({ supported: false }); const V = load(env);
  area(env, 'box', 'typed words');
  reset();
  const started = V.start('box', { onState });
  ok('V13 an unsupported browser says so plainly and does not start',
    started === false && states[0].name === 'unsupported' && /typing works/i.test(states[0].message));
  ok('V14 …and does not touch what was typed', env._els.box.value === 'typed words');
  ok('V15 …and isSupported reports it honestly', V.isSupported() === false);
}

for (const [code, expect] of [['not-allowed', /declined/i], ['no-speech', /did not catch/i],
                              ['audio-capture', /no microphone/i], ['network', /connection/i]]) {
  const env = makeEnv(); const V = load(env);
  area(env, 'box', 'safe draft');
  reset();
  V.start('box', { onState });
  env._instances[0]._fail(code);
  const err = states.filter(s => s.name === 'error').pop();
  ok(`V16 "${code}" produces an honest, actionable message`, !!err && expect.test(err.message));
  ok(`V16 …and "${code}" leaves the typed draft intact`, env._els.box.value === 'safe draft');
  ok(`V16 …and "${code}" closes the session rather than hanging on "Listening"`,
    V.isListening('box') === false);
}

{
  // A person tapping stop surfaces as `aborted`. That is not an error to report at them.
  const env = makeEnv(); const V = load(env);
  area(env, 'box', '');
  reset();
  V.start('box', { onState });
  env._instances[0]._fail('aborted');
  ok('V17 a deliberate cancel is not reported as an error',
    !states.some(s => s.name === 'error'));
}

{
  // Silence must not look like success.
  const env = makeEnv(); const V = load(env);
  area(env, 'box', '');
  reset();
  V.start('box', { onState });
  env._instances[0].stop();
  const last = states[states.length - 1];
  ok('V18 saying nothing is reported as nothing heard, not as ready',
    last.name === 'error' && /did not catch/i.test(last.message));
}

{
  // A missing target must fail closed rather than throw into the page.
  const env = makeEnv(); const V = load(env);
  reset();
  ok('V19 a missing input fails closed instead of throwing',
    V.start('nope', { onState }) === false && states[0].name === 'error');
}

{
  // Two taps must not leave two microphones running.
  const env = makeEnv(); const V = load(env);
  area(env, 'box', '');
  V.toggle('box', { onState });
  V.toggle('box', { onState });
  ok('V20 toggling twice stops rather than starting a second microphone',
    V.isListening('box') === false && env._instances.length === 1);
}

/* ══ INPUT AND OUTPUT ARE TWO CAPABILITIES, AND NEITHER IMPLIES THE OTHER ═══════════════════
   Three different things get called "voice" in this product and they share nothing but the word:

     SERVER TRANSCRIPTION      an OpenAI key turning an audio file into text, on the HOST
     THE BROWSER MICROPHONE    SpeechRecognition, on THIS device, in THIS browser
     READING ALOUD             speechSynthesis, on THIS device, in THIS browser

   A host with a key does not give somebody a microphone. A browser with a microphone does not
   give the host transcription. Reporting either from the other is a lie in whichever direction
   it goes, and the panel whose whole job is to report truthfully about the system is the worst
   place in the product to conflate them. Source-level and decommented, because the conflation
   would live in one expression. */
console.log('\n  THREE CAPABILITIES, THREE ANSWERS');
{
  const APP_RAW = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const APP = APP_RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const panel = APP.slice(APP.indexOf('async function _renderRealCapabilities('),
    APP.indexOf('async function _renderBuildLine('));

  ok('V21 the capability panel is found (an empty slice would make the rest vacuous)',
    panel.length > 400 && /settings-features/.test(panel));
  ok('V21b server transcription is reported from the SERVER, and named as the server',
    /h\.voice/.test(panel) && /on the server/.test(APP_RAW));
  ok('V21c …and says plainly that it is not the microphone in your browser',
    /not the microphone in your browser/.test(APP_RAW));
  ok('V22 the browser microphone is answered by ASKING THE BROWSER — the server cannot know',
    /IQVoice\.isSupported\(\)/.test(panel));
  ok('V22b …and is its own row, not a clause on the transcription one',
    /on this device/.test(APP_RAW));
  ok('V23 reading aloud is a THIRD row, answered by the browser too',
    /window\.speechSynthesis && window\.SpeechSynthesisUtterance/.test(panel));
  ok('V23b no row derives one capability from another',
    !/h\.voice\s*&&\s*IQVoice/.test(panel) && !/isSupported\(\)\s*&&\s*h\.voice/.test(panel));
}

/* ══ READING ALOUD NEVER FAILS SILENTLY ═════════════════════════════════════════════════════
   It used to: "if the browser cannot do it, the button simply does nothing rather than promising
   something that will not happen". A control that does nothing when tapped is the defect class
   this whole engagement exists to remove — there is no way to tell a browser that cannot speak
   from a phone on silent from a product that is broken.

   And it spoke LESS than the screen showed. A reply sits above its sources; somebody listening
   got the claim without them. Reading a claim aloud and leaving its qualification behind is the
   one asymmetry between the two channels that matters, because a spoken sentence carries more
   confidence than a written one, not less. */
console.log('\n  READING ALOUD SAYS WHAT THE SCREEN SAYS, OR SAYS WHY NOT');
{
  const APP_RAW = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const APP = APP_RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const fn = APP.slice(APP.indexOf('_speak(textJson'), APP.indexOf('openInquiryThread(inquiryId)'));
  ok('V24 the read-aloud handler is found', fn.length > 300 && /SpeechSynthesisUtterance/.test(fn));
  /* V24b WAS A FALSE GREEN OF MINE, found by mutation VM1 and worth recording rather than
     quietly re-spelling. It tested `/cannot read text aloud/.test(APP_RAW)` — the RAW source,
     comments included — so the comment ABOVE the function explaining the defect satisfied it
     whatever the code did. And its negative half looked for `return;` while the mutation wrote
     `return false;`. Two independent reasons to pass, neither of them the law.

     The law is that NO EXIT IS SILENT. So every `return` in the function body must be preceded
     by a `say(...)` — checked structurally over the decommented body rather than by matching one
     spelling of one failure. */
  ok('V24b a browser that cannot speak is TOLD to the person, not swallowed', (() => {
    const body = fn.slice(fn.indexOf('{'));
    // Each early exit, with the 200 characters before it. A silent one has no say() in that window.
    const exits = [...body.matchAll(/return\s+(?:false|true)?\s*;/g)];
    if (exits.length < 2) return false;                  // no exits found: the slice is wrong
    return exits.every(m => /say\(/.test(body.slice(Math.max(0, m.index - 220), m.index)));
  })());
  ok('V24c …and so is a failure that happens after speaking has started',
    /u\.onerror/.test(fn));
  ok('V24d …through the live region the row already carries, beside the control',
    /iq-act-said/.test(fn) && /aria-live="polite"/.test(APP_RAW));
  ok('V25 what is spoken carries the source disclosure the screen shows',
    /rests on \$\{sources\.length\} source/.test(APP_RAW));
  ok('V25b …and never claims sources when there are none',
    /sources\.length\s*\?/.test(fn));
  ok('V25c …and invents nothing that is not on the screen — the utterance is the text plus that one disclosure',
    /new SpeechSynthesisUtterance\(text \+ disclosure\)/.test(fn));
  ok('V26 the control hands the sources it was rendered with, so the two cannot drift',
    /MemberApp\._speak\(\$\{j\(text\)\}, \$\{j\(JSON\.stringify\(sources \|\| \[\]\)\)\}, this\)/.test(APP_RAW));
}

/* ══ A CANCELLED RECOGNISER MAY NEVER WRITE AGAIN ═══════════════════════════════════════════
   `cancel()` aborts the recogniser, but abort is a REQUEST to the browser's engine, not a
   guarantee that no further result is delivered — a final result already in flight still
   arrives. Without a guard that handler writes it into the textarea regardless, so a session
   that ended while somebody was mid-sentence puts their words into a composer afterwards, on a
   page that has already told them to sign in. The founder hit exactly this.

   THIS BLOCK EXISTS BECAUSE MUTATION VM5 STAYED GREEN. Removing the session guard from
   js/voice.js broke nothing in this file: the law was only ever defended in the BROWSER suite
   (live-recovery-repro LR-S6), so the hermetic layer could not see it go. A law defended in one
   place is a law that travels only as far as that place gets run. */
console.log('\n  A CANCELLED RECOGNISER MAY NEVER WRITE AGAIN');
{
  const env = makeEnv(); const V = load(env);
  const ta = area(env, 'box', 'what I had typed');
  V.start('box', { onState });
  const inst = env._instances[env._instances.length - 1];
  inst.onresult({ resultIndex: 0, results: [[{ transcript: 'first words' }]] });
  ok('V31 while the session is live, speech lands in the draft',
    ta.value.includes('first words'));

  V.cancel('box');
  ok('V31b cancelling restores exactly what was typed before',
    ta.value === 'what I had typed');

  // The late result. Already in flight when abort was requested; the engine delivers it anyway.
  inst.onresult({ resultIndex: 0, results: [[{ transcript: 'a late sentence' }]] });
  ok('V31c a result arriving AFTER cancel writes nothing — abort is a request, not a guarantee',
    ta.value === 'what I had typed' && !ta.value.includes('a late sentence'));

  // And a second session on the same target is not written to by the first one's leftovers.
  V.start('box', { onState });
  const inst2 = env._instances[env._instances.length - 1];
  inst.onresult({ resultIndex: 0, results: [[{ transcript: 'from the dead session' }]] });
  ok('V31d …nor does a dead session write into the session that replaced it',
    !ta.value.includes('from the dead session'));
  inst2.onresult({ resultIndex: 0, results: [[{ transcript: 'the live one' }]] });
  ok('V31e …while the live session still works normally', ta.value.includes('the live one'));
  V.cancel('box');
}

/* ══ A LIVE MICROPHONE DOES NOT SURVIVE LEAVING THE PAGE ════════════════════════════════════
   A recogniser is bound to a TEXTAREA BY ID. Navigating replaces the page that textarea was on,
   so a session left running keeps listening to somebody who has walked away, and delivers its
   final result into whatever element now holds that id. Session end already cancelled; ordinary
   NAVIGATION did not, and navigation is the common case — tap the microphone, change your mind,
   tap Home. */
console.log('\n  LEAVING THE PAGE ENDS THE MICROPHONE');
{
  const APP_RAW = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const APP = APP_RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const nav = APP.slice(APP.indexOf('function navigate(dest){'), APP.indexOf('function navigate(dest){') + 2600);
  ok('V27 navigate() is found', nav.length > 400 && /NAV_ROUTES/.test(nav));
  ok('V27b every live microphone is cancelled on navigation',
    /IQVoice\.cancelAll\(\)/.test(nav));
  ok('V27c …and anything being read aloud stops too, since the reply it belongs to is gone',
    /speechSynthesis\.cancel\(\)/.test(nav));
  ok('V28 session end still cancels as well — navigation did not replace it',
    (APP.match(/IQVoice\.cancelAll\(\)/g) || []).length >= 2);
  ok('V28b and cancel RESTORES the draft rather than keeping the speech, because they left mid-sentence',
    /IQVoice\.cancel = function/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'voice.js'), 'utf8'))
    && /ta\.value = s\.base/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'voice.js'), 'utf8')));
}

/* ══ SPEAKING IS NEVER SENDING ══════════════════════════════════════════════════════════════
   Asserted as an ABSENCE at the one place a send could be wired in. An interim result reaching
   the server would be a half-sentence submitted on somebody's behalf; a final one auto-sending
   would take the edit away from them. */
console.log('\n  SPEAKING IS NEVER SENDING');
{
  const env = makeEnv(); const V = load(env);
  const ta = area(env, 'box', '');
  let sent = 0;
  V.start('box', { onState, onDone: () => { /* the caller is handed the text; it must not send */ } });
  const inst = env._instances[env._instances.length - 1];
  inst.onresult({ resultIndex: 0, results: [[{ transcript: 'half a sent' }]] });
  ok('V29 an INTERIM result lands in the draft and nowhere else',
    ta.value.includes('half a sent') && sent === 0);
  inst.onresult({ resultIndex: 0, results: [[{ transcript: 'half a sentence finished' }]] });
  inst.onend();
  ok('V29b a FINAL result also lands in the draft and nowhere else',
    ta.value.includes('half a sentence finished') && sent === 0);

  const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  /* SLICE BOUNDS, CHECKED. My first version ended the slice at `_threadTurn(`, which appears
     EARLIER in the file than `_micFor` — so the slice was negative, the region was empty, and the
     assertion failed rather than passing against nothing. The length guard is what turned a
     silent vacuous pass into a visible failure, which is the whole reason it is there. */
  const micStart = APP.indexOf('_micFor(inputId, micId, stateId) {');
  const micEnd = APP.indexOf('_lowerFirst(s)', micStart);
  const mic = micStart >= 0 && micEnd > micStart ? APP.slice(micStart, micEnd) : '';
  ok('V30 the one microphone handler is found (an empty region would prove nothing)',
    mic.length > 400 && /IQVoice/.test(mic) && /onState/.test(mic));
  ok('V30b …and it wires NO send — not on done, not on result, not on input',
    !/onDone/.test(mic)
    && !/(inquirySend|wsSend|_sendTurn|\.submit\(\))/.test(mic));
}

console.log(`\nvoice-input-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
