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
    interrupted: 'Stopped here — listening moved to another composer.',
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

  /* `_sessions` answers target-specific UI questions. `_active` is the app-wide microphone
     lease: a map alone cannot stop target A merely because target B has a different id. */
  IQVoice._sessions = {};
  IQVoice._active = null;

  IQVoice.isSupported = support;
  IQVoice.STATES = STATES;

  IQVoice.isListening = function (targetId) {
    var s = IQVoice._sessions[targetId];
    return !!(s && s.rec && IQVoice._active === s);
  };

  function isLive(targetId, session) {
    return IQVoice._sessions[targetId] === session && IQVoice._active === session;
  }

  function release(targetId, session) {
    if (IQVoice._sessions[targetId] === session) IQVoice._sessions[targetId] = null;
    if (IQVoice._active === session) IQVoice._active = null;
  }

  /* Starting in another Composer revokes the previous microphone lease BEFORE aborting it.
     Browsers may synchronously or belatedly emit result/error/end from abort(); those callbacks
     must see an already-dead session and become inert. Keep the visible draft already produced,
     but tell the old control why it stopped. */
  function interruptActive(nextTargetId) {
    var old = IQVoice._active;
    if (!old) return;
    release(old.targetId, old);
    try { old.rec.abort(); } catch (e) {}
    old.onState('idle', old.targetId === nextTargetId
      ? 'Stopped here — listening restarted.' : TEXT.interrupted, old.ta.value);
  }

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

    interruptActive(targetId);

    // What was already typed is kept. Voice ADDS to a draft; it never replaces one, because
    // silently clearing somebody's half-written sentence is unforgivable and easy to do.
    var base = String(ta.value || '');
    var rec;
    try { rec = new SR(); } catch (e) { onState('error', 'Voice could not start. Typing works as normal.', ''); return false; }

    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = opts.lang || (global.document && global.document.documentElement && global.document.documentElement.lang) || 'en-GB';

    var session = { targetId: targetId, rec: rec, ta: ta, onState: onState,
      base: base, final: '', errored: false };
    IQVoice._sessions[targetId] = session;
    IQVoice._active = session;

    rec.onresult = function (e) {
      /* A CANCELLED SESSION DOES NOT GET TO WRITE. `cancel()` aborts the recogniser and clears
         this session, but abort is a REQUEST to the browser's engine, not a guarantee that no
         further result is delivered — a final result already in flight still arrives, and this
         handler used to write it into the textarea regardless. So a session that ended while
         somebody was mid-sentence could put their words into a composer afterwards, on a page
         that had already told them to sign in. The session registry is the authority: if this
         session is no longer the live one, nothing is written. */
      if (!isLive(targetId, session)) return;
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
      if (!isLive(targetId, session)) return;
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
      if (!isLive(targetId, session)) return;
      release(targetId, session);
      if (session.errored) return;                       // onerror already said what happened
      if (!session.final) { onState('error', ERRORS['no-speech'], ta.value); return; }
      onState('ready', TEXT.ready, ta.value);
      if (typeof opts.onDone === 'function') opts.onDone(ta.value);
    };

    try {
      rec.start();
    } catch (e) {
      release(targetId, session);
      onState('error', 'Voice could not start. Typing works as normal.', ta.value);
      return false;
    }
    onState('listening', TEXT.listening, ta.value);
    return true;
  };

  IQVoice.stop = function (targetId) {
    var s = IQVoice._sessions[targetId];
    if (!s || !s.rec) return false;
    /* A NORMAL STOP ENDS THROUGH `onend`, which releases both the session and the lease. A stop
       the browser REFUSES never gets there, so this path has to end the session itself — and
       "end" means two things that were both half-done.

       IT HAS TO RELEASE BOTH. Clearing only the session left `_active` pointing at a dead
       recognizer: `cancelAll` (sign-out, every navigation) iterates the session registry, found
       nothing for this target and released nothing, and the next Composer to start told a control
       that had already stopped that listening "moved to another composer".

       AND IT HAS TO ACTUALLY STOP THE MICROPHONE. `stop()` throwing does not mean the recognizer
       ended — it means the polite request failed. Forgetting the session then leaves a live
       recogniser that nothing in the app can reach, which is the one outcome voice input must
       never produce. `abort()` is the stronger primitive `cancel()` already uses: ask it before
       giving up the handle, and release afterwards so a late callback from either is inert.

       A browser throws here for real — `stop()` on a recognizer whose service has already gone
       away raises InvalidStateError, which is the flaky-connection case voice input lives in. */
    try { s.rec.stop(); } catch (e) {
      try { s.rec.abort(); } catch (e2) {}
      release(targetId, s);
    }
    return true;
  };

  /* Cancel throws the spoken text away and restores what was there before. The distinction
     from stop() matters: stop keeps what was said, cancel means "forget that". */
  IQVoice.cancel = function (targetId) {
    var s = IQVoice._sessions[targetId];
    if (!s) return false;
    var ta = global.document && global.document.getElementById(targetId);
    if (ta) ta.value = s.base;
    // Invalidate first: abort() is allowed to synchronously invoke callbacks.
    release(targetId, s);
    if (s.rec) { try { s.rec.abort(); } catch (e) {} }
    return true;
  };

  /* CANCEL EVERYTHING, from one call. The session can end while somebody is mid-sentence into a
     microphone on a surface nothing else knows about, and a recogniser left running will happily
     deliver a final result minutes later, into a composer that no longer has a session to send it
     with. There is exactly one registry of live sessions, so there is exactly one place to end
     them all. */
  IQVoice.cancelAll = function () {
    var n = 0;
    Object.keys(IQVoice._sessions || {}).forEach(function (id) {
      if (IQVoice._sessions[id] && IQVoice.cancel(id)) n++;
    });
    return n;
  };

  global.IQVoice = IQVoice;
})(typeof window !== 'undefined' ? window : this);
