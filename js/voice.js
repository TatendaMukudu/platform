/* ============================================================
   js/voice.js — VOICE INPUT, ONE OWNER (window.IQVoice)

   Voice is an INPUT METHOD. It carries no special authority, creates no evidence, and reaches
   nothing that typing does not already reach. What it produces is text in a textarea; from
   there the ordinary workflow — the same composer, the same contribution boundary, the same
   kernel — does everything it already did. If that stops being true, this file is the bug.

   THE LAWS, and each is a property of this file rather than a rule to remember:

     · NOTHING STARTS ITSELF. `start()` runs only from a user gesture. There is no timer, no
       autoplay, no "listen while the page is open". Ambient listening is not a setting that is
       switched off here; it is a capability that does not exist.
     · NO AUDIO IS KEPT. This uses the browser's SpeechRecognition, which hands back a
       transcript. No MediaRecorder, no Blob, no upload, no audio anywhere — so "is the
       recording retained?" has the strongest possible answer: there is no recording.
     · THE TRANSCRIPT IS A DRAFT. It lands in the textarea, where it can be edited, added to,
       or deleted before anything is sent. Speaking is never sending.
     · TYPING NEVER STOPS WORKING. The textarea is never disabled, never read-only, never
       covered. Every failure below leaves the person exactly where they would have been had
       they never tapped the microphone.
     · THE STATE IS ALWAYS ON SCREEN. Nobody should ever have to wonder whether IntelliQ is
       listening.

   Two copies of this logic already existed — in the signal form and in IQComposer — with no
   permission handling, no error state and `start()` inside an empty catch. This is their one
   home; both call it.
   ============================================================ */

(function (global) {
  'use strict';

  var STATES = ['idle', 'listening', 'processing', 'ready', 'error', 'unsupported'];

  function support() {
    return !!(global.SpeechRecognition || global.webkitSpeechRecognition);
  }

  /* What a person is told, per state. Deliberately plain, and an error says what to do next
     rather than what went wrong internally — "try again" is actionable, "aborted" is not. */
  var TEXT = {
    idle: '',
    listening: 'Listening — tap to stop',
    processing: 'Just a moment…',
    ready: 'Ready to send, or keep typing',
    unsupported: 'Voice input is not available in this browser — typing works as normal.',
  };

  var ERRORS = {
    'not-allowed': 'Microphone access was declined. You can allow it in your browser settings, or just type.',
    'service-not-allowed': 'Microphone access was declined. You can allow it in your browser settings, or just type.',
    'no-speech': 'I did not catch anything. Tap the microphone and try again, or type instead.',
    'audio-capture': 'No microphone was found. Typing works as normal.',
    'network': 'Voice needs a connection and could not reach it. Typing works as normal.',
    'aborted': '',
  };

  function IQVoice() {}

  /* One live session at a time, tracked per target so two microphones cannot both be running. */
  IQVoice._sessions = {};

  IQVoice.isSupported = support;
  IQVoice.STATES = STATES;

  IQVoice.isListening = function (targetId) {
    var s = IQVoice._sessions[targetId];
    return !!(s && s.rec);
  };

  /* start/stop is a TOGGLE from one user gesture. Everything below is driven by that gesture
     and by the browser's own events — nothing here schedules itself. */
  IQVoice.toggle = function (targetId, opts) {
    if (IQVoice.isListening(targetId)) return IQVoice.stop(targetId);
    return IQVoice.start(targetId, opts);
  };

  IQVoice.start = function (targetId, opts) {
    opts = opts || {};
    var onState = typeof opts.onState === 'function' ? opts.onState : function () {};
    var ta = global.document && global.document.getElementById(targetId);
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;

    if (!SR) { onState('unsupported', TEXT.unsupported, ''); return false; }
    if (!ta) { onState('error', 'Nothing to write into.', ''); return false; }

    // What was already typed is kept. Voice ADDS to a draft; it never replaces one, because
    // silently clearing somebody's half-written sentence is unforgivable and easy to do.
    var base = String(ta.value || '');
    var rec;
    try { rec = new SR(); } catch (e) { onState('error', 'Voice could not start. Typing works as normal.', ''); return false; }

    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = opts.lang || (global.document && global.document.documentElement && global.document.documentElement.lang) || 'en-GB';

    var session = { rec: rec, base: base, final: '', errored: false };
    IQVoice._sessions[targetId] = session;

    rec.onresult = function (e) {
      var text = '';
      for (var i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      session.final = text;
      // The draft updates live so a person can see they are being heard correctly while they
      // speak, rather than discovering a misheard sentence at the end.
      ta.value = (base ? base.replace(/\s+$/, '') + ' ' : '') + text.replace(/^\s+/, '');
      if (typeof opts.onInput === 'function') opts.onInput(ta.value);
      onState('listening', TEXT.listening, ta.value);
    };

    rec.onerror = function (e) {
      session.errored = true;
      var code = (e && e.error) || 'unknown';
      var msg = Object.prototype.hasOwnProperty.call(ERRORS, code)
        ? ERRORS[code]
        : 'Voice had a problem. Typing works as normal.';
      // An aborted session is a person tapping stop — that is not an error to report at them.
      if (code === 'aborted') { onState('idle', '', ta.value); return; }
      onState('error', msg, ta.value);
    };

    rec.onend = function () {
      IQVoice._sessions[targetId] = null;
      if (session.errored) return;                       // onerror already said what happened
      if (!session.final) { onState('error', ERRORS['no-speech'], ta.value); return; }
      onState('ready', TEXT.ready, ta.value);
      if (typeof opts.onDone === 'function') opts.onDone(ta.value);
    };

    try {
      rec.start();
    } catch (e) {
      IQVoice._sessions[targetId] = null;
      onState('error', 'Voice could not start. Typing works as normal.', ta.value);
      return false;
    }
    onState('listening', TEXT.listening, ta.value);
    return true;
  };

  IQVoice.stop = function (targetId) {
    var s = IQVoice._sessions[targetId];
    if (!s || !s.rec) return false;
    try { s.rec.stop(); } catch (e) { IQVoice._sessions[targetId] = null; }
    return true;
  };

  /* Cancel throws the spoken text away and restores what was there before. The distinction
     from stop() matters: stop keeps what was said, cancel means "forget that". */
  IQVoice.cancel = function (targetId) {
    var s = IQVoice._sessions[targetId];
    if (!s) return false;
    var ta = global.document && global.document.getElementById(targetId);
    if (ta) ta.value = s.base;
    if (s.rec) { try { s.rec.abort(); } catch (e) {} }
    IQVoice._sessions[targetId] = null;
    return true;
  };

  global.IQVoice = IQVoice;
})(typeof window !== 'undefined' ? window : this);
