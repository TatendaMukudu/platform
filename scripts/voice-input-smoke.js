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
  /* V23 REWRITTEN, NOT WEAKENED. It pinned the row asking `window.speechSynthesis &&
     window.SpeechSynthesisUtterance` ITSELF — right about the law (the browser answers for the
     browser) and wrong about who should be doing the asking, because that is a second
     implementation of a question js/voice-output.js already owns. It is the same shape as the
     row above it, which has always asked IQVoice. A Settings panel that answers a capability
     question for itself is how it comes to report ON for a control that has already refused to
     draw itself. */
  ok('V23 reading aloud is a THIRD row, answered by the BROWSER through the owner that draws the control',
    /IQVoiceOut\.isSupported\(\)/.test(panel));
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
console.log('\n  READING ALOUD SPEAKS WHAT IT WAS APPROVED TO SPEAK, OR SAYS WHY NOT');
{
  /* ══ THE OWNER MOVED, SO THE TEST LOADS THE OWNER ═══════════════════════════════════════
     This block used to lift the read-aloud methods out of js/app.js as a SOURCE SLICE and eval
     them — which drove the real code, and was still a test of a substring. The state machine is
     now js/voice-output.js, a module with one job, so it is loaded the same way js/voice.js is:
     as the thing itself, in a stubbed browser.

     What is spoken is composed on the SERVER beside the prose and put through ai/manifest.js with
     every other channel. So this file's law is not "compose it correctly" — it is COMPOSE
     NOTHING, say every state out loud, and never draw a control that cannot work. */
  const OUT_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'voice-output.js'), 'utf8');

  /* The stub. A fake utterance records what it was asked to say; a fake row records what the live
     region was told. Nothing here is a copy of the production code — it is the environment the
     production code runs in. */
  const synth = { spoken: [], cancels: 0, cancel() { this.cancels++; }, speak(u) { this.spoken.push(u); this.last = u; } };
  function Utt(t) { this.text = t; }
  const W = { speechSynthesis: synth, SpeechSynthesisUtterance: Utt, document: { documentElement: { lang: 'en-GB' } } };
  // eslint-disable-next-line no-new-func
  new Function('window', OUT_SRC + '\n;window.__loaded = true;')(W);
  const V = W.IQVoiceOut;
  ok('V24 js/voice-output.js loads as a module and exposes one owner (a wrong load must fail loudly, not pass vacuously)',
    !!V && typeof V.speak === 'function' && typeof V.control === 'function' && typeof V.stop === 'function');

  const mkBtn = () => {
    const said = { textContent: '' };
    const btn = {
      attrs: { 'data-voice-state': 'idle' }, classes: new Set(),
      closest: () => ({ querySelector: () => said }),
      setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
      classList: { toggle(c, on) { if (on) btn.classes.add(c); else btn.classes.delete(c); } },
    };
    btn.said = said;
    return btn;
  };

  const APPROVED = 'You have been recovering well. This rests on 2 sources, shown under the reply.';
  /* What the ONCLICK ATTRIBUTE evaluates to at the moment the browser calls the handler: the
     attribute source is JSON.stringify(JSON.stringify(s)), so the runtime argument is ONE level
     of JSON, not two. Getting this wrong is how a control that "works" in a test is silent on a
     phone, so the encoding is taken from the control that actually renders it. */
  const arg = t => JSON.stringify(String(t));

  if (V) {
    const b1 = mkBtn();
    const started = V.speak(b1, arg(APPROVED));
    ok('V25 what is spoken is the rendering it was HANDED, verbatim — the owner composes nothing',
      started === true && synth.last && synth.last.text === APPROVED);
    ok('V25b …and the control says it has started, in the live region beside it',
      b1.said.textContent === V.WORDS.starting && b1.getAttribute('data-voice-state') === 'starting');
    /* THE HANDLERS ARE ASSERTED BEFORE THEY ARE CALLED. Calling a missing one throws, and a throw
       kills the script before any FAIL is printed — PROTOCOL lie #8, and two of my own mutations
       landed exactly there. A missing handler is a real defect (the browser would have no way to
       report that state), so it gets a FAIL of its own rather than a stack trace. */
    ok('V25b2 the browser is given a handler for every state it can report back',
      typeof synth.last.onstart === 'function' && typeof synth.last.onerror === 'function'
      && typeof synth.last.onend === 'function');
    if (typeof synth.last.onstart === 'function') synth.last.onstart();
    ok('V25c …then that it is speaking, which is a different fact from having asked it to',
      b1.said.textContent === V.WORDS.speaking && b1.getAttribute('aria-label') === 'Stop reading aloud');

    // PRESSING IT AGAIN IS THE STOP CONTROL — and the retry path, since a stopped row can start again.
    const stopped = V.speak(b1, arg(APPROVED));
    ok('V26 pressing the control that is speaking stops it, and the row SAYS it stopped',
      stopped === false && b1.said.textContent === V.WORDS.stopped && b1.getAttribute('data-voice-state') === 'stopped');
    ok('V26b …and it can be started again from there, so a person who stopped it is not stuck',
      V.speak(b1, arg(APPROVED)) === true);

    // A NEWER UTTERANCE REPLACES AN OLDER ONE, DETERMINISTICALLY, and the row it replaced is told.
    const b2 = mkBtn();
    V.speak(b2, arg('A different approved answer.'));
    ok('V27 a second reply read aloud replaces the first — one voice at a time across the whole app',
      synth.last.text === 'A different approved answer.');
    ok('V27b …and the reply it interrupted says so rather than being left announcing that it is still reading',
      b1.said.textContent === V.WORDS.interrupted);

    // A FAILURE AFTER SPEAKING HAS STARTED IS STILL A FAILURE.
    if (typeof synth.last.onerror === 'function') synth.last.onerror();
    ok('V28 a failure after speaking started is announced, with a retry the person can act on',
      b2.said.textContent === V.WORDS.error && /retry/i.test(V.WORDS.error));
    ok('V28a …and the owner no longer believes anything is speaking, so the next press starts cleanly',
      V.speaking() === null);

    // A NEW ANSWER ARRIVING STOPS THE OLD ONE — the same owner, called by the renderer.
    const b3 = mkBtn();
    V.speak(b3, arg(APPROVED));
    V.stop('interrupted');
    ok('V28b stop() cancels the engine and tells the row, which is what navigation and a new answer both call',
      b3.said.textContent === V.WORDS.interrupted && synth.cancels > 0 && V.speaking() === null);

    /* A CONTROL THAT CANNOT WORK IS NOT DRAWN. Two ways this happens and neither may be silent. */
    ok('V29 with an approved rendering and a browser that can speak, a real button is drawn',
      /<button/.test(V.control(APPROVED, 'r1')) && /data-voice-state="idle"/.test(V.control(APPROVED, 'r1')));
    ok('V29a …whose onclick reaches the OWNER, not a second implementation in the app',
      /IQVoiceOut\.speak\(this,/.test(V.control(APPROVED, 'r1')));
    ok('V29b with NO approved rendering there is no button at all — the reason is drawn instead',
      !/<button/.test(V.control('', 'r1')) && /data-voice="none"/.test(V.control('', 'r1')));
    const realSynth = W.speechSynthesis;
    W.speechSynthesis = undefined;
    ok('V29c and a browser that cannot speak is TOLD to the person, not given a button that does nothing',
      !/<button/.test(V.control(APPROVED, 'r1')) && /data-voice="unsupported"/.test(V.control(APPROVED, 'r1')));
    ok('V29d …and pressing anyway, if one somehow survived, still says something rather than failing in silence',
      (() => { const b = mkBtn(); const r = V.speak(b, arg(APPROVED));
        return r === false && b.said.textContent === V.WORDS.error; })());
    W.speechSynthesis = realSynth;

    /* THE ENGINE ITSELF REFUSING, which is a different failure from onerror firing after it
       started: `speak()` can throw synchronously. MUTATION M102 — making that catch swallow the
       error and return true — SURVIVED this file until this case existed, because the stub never
       threw. A law defended only in the browser suite travels only as far as that suite gets run,
       which is exactly what VM5 taught. */
    ok('V28c a synchronous throw from the engine is reported, not swallowed into something that looks like success',
      (() => {
        const b = mkBtn();
        const good = synth.speak;
        synth.speak = () => { throw new Error('engine refused'); };
        const r = V.speak(b, arg(APPROVED));
        synth.speak = good;
        return r === false && b.said.textContent === V.WORDS.error
          && b.getAttribute('data-voice-state') === 'error' && V.speaking() === null;
      })());
    ok('V28d …and the control still works afterwards, so a refusal is not a dead end',
      (() => { const b = mkBtn(); return V.speak(b, arg(APPROVED)) === true; })());

    ok('V29e every state a person can be in has words — none is the empty string except idle and a finished reading',
      ['unsupported', 'starting', 'speaking', 'stopped', 'interrupted', 'error'].every(k => (V.WORDS[k] || '').length > 3)
      && V.WORDS.ended === '' && V.WORDS.idle === '');
    ok('V29f …and the vocabulary is closed, so a seventh state cannot arrive without a word for it',
      V.STATES.length === 8 && V.STATES.every(k => Object.prototype.hasOwnProperty.call(V.WORDS, k)));

    /* THE LAW THAT MAKES THE REST OF IT TRUE: this owner never reads message text. It writes a
       STATE into the live region and nothing else. If it could read the reply it would be a
       second author for the answer again, which is the defect the whole channel was moved for. */
    const OUT = OUT_SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    ok('V29g the owner never READS text out of the page — no innerText, no textContent read, no querySelector for a message',
      !/\.innerText/.test(OUT) && !/=\s*[^;]*\.textContent/.test(OUT)
      && !/querySelector\((?!'\.iq-act-said')/.test(OUT.replace(/querySelector\('\.iq-act-said'\)/g, 'QS_OK')));
    ok('V29h …and it composes no sentence of its own: every word it can say is in WORDS',
      !/rests on/.test(OUT) && !/sources?\b[^']*\$\{/.test(OUT));
  }

  /* AND THE APP REACHES THE OWNER RATHER THAN REIMPLEMENTING IT. */
  const APP_RAW = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const APP = APP_RAW.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  ok('V30 the action row draws the control through the owner, and hands it the SERVER\'s approved rendering',
    /IQVoiceOut\.control\(speech, rid\)/.test(APP) && /speech: m\.speech/.test(APP) && /speech: r\.speech/.test(APP));
  ok('V30a the app holds NO voice-output state machine of its own any more',
    !/SpeechSynthesisUtterance/.test(APP) && !/_VOICE_WORDS/.test(APP) && !/_voiceState\(/.test(APP));
  ok('V30b leaving the page stops anything being read aloud, through the one owner',
    /MemberApp\._voiceStop\('stopped'\)/.test(APP));
  ok('V30c …and so does a NEW ANSWER arriving, or a person hears the old reply finish over the new one on screen',
    /_renderAssistant\(j\) \{[\s\S]{0,400}_voiceStop\('interrupted'\)/.test(APP));
  ok('V30d and the owner is actually loaded by the page, or every assertion above is about a file nobody runs',
    /<script src="js\/voice-output\.js/.test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')));
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

  /* AND THE OTHER WAY A SESSION ENDS. `cancel` is the person tapping stop; `cancelAll` is the
     app deciding for them — sign-out and every navigation call it. The founder's defect was on
     THAT path (tap the microphone, change your mind, tap Home), so testing only the deliberate
     stop tests the case that was already working. */
  const ta2 = area(env, 'box2', 'draft before leaving');
  V.start('box2', { onState });
  const inst3 = env._instances[env._instances.length - 1];
  inst3.onresult({ resultIndex: 0, results: [[{ transcript: 'mid sentence' }]] });
  ok('V31f a live session writes while it is live', ta2.value.includes('mid sentence'));
  V.cancelAll();
  ok('V31g …and cancelAll — what sign-out and every navigation call — restores the draft',
    ta2.value === 'draft before leaving');
  inst3.onresult({ resultIndex: 0, results: [[{ transcript: 'delivered after they left' }]] });
  ok('V31h …and a result delivered AFTER the session ended writes nothing, on a page they are no longer on',
    ta2.value === 'draft before leaving');
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
  /* V27c USED TO PIN A SECOND `speechSynthesis.cancel()` INSIDE navigate(), which was right when
     navigation was the only thing that stopped a reading. It is now one owner: `_voiceStop`
     cancels the engine AND tells the row it was stopped, so a page change no longer leaves a
     control announcing "Reading aloud…" on a screen nobody is looking at. Pinning the raw call
     here would have pinned the weaker of the two behaviours. */
  ok('V27c …and anything being read aloud stops too, through the owner that also tells the row it stopped',
    /MemberApp\._voiceStop\('stopped'\)/.test(nav) && !/speechSynthesis\.cancel\(\);/.test(nav));
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
