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

console.log(`\nvoice-input-smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
