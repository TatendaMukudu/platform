/* ============================================================
   js/voice-output.js — READING ALOUD, ONE OWNER (window.IQVoiceOut)

   The counterpart of js/voice.js, and deliberately a separate file: they share the word "voice"
   and nothing else. One turns speech into a draft on this device; this one turns an ANSWER THAT
   HAS ALREADY BEEN APPROVED into sound on this device. Neither has anything to do with the
   server-side transcription in ai/gateway.js, which is an OpenAI key turning an audio file into
   text on a host. A host with a key has given nobody a loudspeaker.

   WHY THIS FILE EXISTS AT ALL. The state machine below lived inside js/app.js, next to the row
   that renders the button — which made it the second place an answer was composed, and the first
   version of it DID compose: it built the spoken sentence out of the message text plus a source
   count the browser counted for itself. That is two authors for one answer on the channel where
   drift costs most, because a spoken sentence carries more confidence than a written one and the
   qualification is the first thing an assembler drops.

   THE LAWS, and each is a property of this file rather than a rule to remember:

     · IT SPEAKS WHAT IT IS HANDED, AND COMPOSES NOTHING. There is no DOM read of message text
       anywhere below; the only thing this file writes into the page is a STATE, into the live
       region the row already carries. What is spoken is the rendering the server approved beside
       the prose, through ai/manifest.js, carrying the answer's uncertainty, its limitations and
       what it rests on. If this file ever needs to know what a reply said, it is the bug.
     · A CONTROL THAT CANNOT WORK IS NOT DRAWN. Two ways that happens — this browser has no
       speech synthesis, or the server sent no approved rendering — and neither may be silent. The
       reason is drawn where the button would have been.
     · EVERY EXIT SAYS SOMETHING. `unsupported`, `starting`, `speaking`, `stopped`, `interrupted`,
       `error`. A control that does nothing when pressed is indistinguishable from a broken
       product, and that is the defect class this whole engagement exists to remove.
     · ONE UTTERANCE AT A TIME, ACROSS THE WHOLE APP, and the one it replaces is TOLD it was
       replaced rather than left announcing that it is still reading.
     · A FAILURE IS NOT A SILENCE. Errors are reported with a retry the person can act on, and
       nothing here swallows one into a state that looks like success.

   PURE OF THE APP: it takes a button element and a string. It knows nothing about conversations,
   messages, or IntelliQ.
   ============================================================ */

(function (global) {
  'use strict';

  /* The closed vocabulary. `idle` and `ended` are the two that are correctly silent — nothing has
     happened yet, and a reading that finished says so by stopping. */
  var STATES = ['idle', 'unsupported', 'starting', 'speaking', 'stopped', 'interrupted', 'error', 'ended'];

  var WORDS = {
    idle: '',
    unsupported: 'This browser cannot read replies aloud.',
    starting: 'Starting to read aloud…',
    speaking: 'Reading aloud…',
    stopped: 'Stopped.',
    interrupted: 'Stopped — a newer reply took over.',
    error: 'Reading aloud failed. Press again to retry.',
    ended: '',
  };

  function support() {
    try { return !!(global.speechSynthesis && global.SpeechSynthesisUtterance); } catch (e) { return false; }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* WHICH BUTTON IS SPEAKING. Module-level on purpose: one utterance at a time is a property of
     the device, not of a row, and tracking it per row is how two readings end up overlapping. */
  var liveBtn = null;
  var liveUtterance = null;

  /* The state goes to three places at once, because they answer three different questions: the
     live region says it to a screen reader, the attribute says it to a test and to CSS, and the
     label says it to whoever is looking at the control. */
  function setState(btn, state) {
    if (!btn) return;
    var word = Object.prototype.hasOwnProperty.call(WORDS, state) ? WORDS[state] : '';
    var row = btn.closest ? btn.closest('.iq-msg-acts') : null;
    var out = row && row.querySelector ? row.querySelector('.iq-act-said') : null;
    if (out) out.textContent = word;
    if (btn.setAttribute) btn.setAttribute('data-voice-state', state);
    var speaking = state === 'starting' || state === 'speaking';
    if (btn.setAttribute) {
      btn.setAttribute('aria-label', speaking ? 'Stop reading aloud' : 'Read this aloud');
      btn.setAttribute('title', speaking ? 'Stop' : 'Read aloud');
    }
    if (btn.classList && btn.classList.toggle) btn.classList.toggle('is-on', speaking);
  }

  /* Stop whatever is being read and SAY that it stopped. Called when a newer utterance takes
     over, when a new answer arrives, and when the page changes underneath. */
  function stop(why) {
    var prev = liveBtn;
    liveBtn = null;
    liveUtterance = null;
    try { if (global.speechSynthesis) global.speechSynthesis.cancel(); } catch (e) {}
    if (prev) setState(prev, why || 'stopped');
  }

  function speak(btn, speechJson) {
    /* ONE parse. The onclick attribute holds `"the words"` as a JS literal, so by the time this
       runs the argument is already a JSON string; parsing twice throws on every ordinary
       sentence and the control is silent again. */
    var text = '';
    try { text = JSON.parse(speechJson || '""'); } catch (e) { text = ''; }

    if (!support()) { setState(btn, 'error'); return false; }
    if (!String(text).trim()) { setState(btn, 'error'); return false; }

    // Pressing the control that is currently speaking is the stop control: a person who wants it
    // to stop reaches for the thing that started it.
    var state = btn && btn.getAttribute ? btn.getAttribute('data-voice-state') : 'idle';
    if (liveBtn === btn && (state === 'speaking' || state === 'starting')) { stop('stopped'); return false; }
    if (liveBtn && liveBtn !== btn) stop('interrupted');

    try {
      global.speechSynthesis.cancel();
      var u = new global.SpeechSynthesisUtterance(String(text));
      u.rate = 1.0;
      u.lang = (global.document && global.document.documentElement && global.document.documentElement.lang) || 'en-GB';
      u.onstart = function () { if (liveBtn === btn && liveUtterance === u) setState(btn, 'speaking'); };
      u.onerror = function () { if (liveBtn === btn && liveUtterance === u) { liveBtn = null; liveUtterance = null; setState(btn, 'error'); } };
      u.onend   = function () { if (liveBtn === btn && liveUtterance === u) { liveBtn = null; liveUtterance = null; setState(btn, 'ended'); } };
      liveBtn = btn;
      liveUtterance = u;
      setState(btn, 'starting');
      global.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      liveBtn = null;
      liveUtterance = null;
      setState(btn, 'error');
      return false;
    }
  }

  /* THE CONTROL, OR THE REASON THERE IS NOT ONE. `rid` is the action row's id, carried so a
     caller can associate the control with its own row. */
  function control(speech, rid) {
    if (!support()) {
      return '<span class="iq-act-note" data-voice="unsupported">' + esc(WORDS.unsupported) + '</span>';
    }
    if (!String(speech == null ? '' : speech).trim()) {
      return '<span class="iq-act-note" data-voice="none">No approved reading for this message.</span>';
    }
    return '<button type="button" class="iq-act iq-act-voice" aria-label="Read this aloud" title="Read aloud"'
      + ' data-voice-state="idle" data-voice-for="' + esc(rid) + '"'
      + ' onclick="IQVoiceOut.speak(this, ' + esc(JSON.stringify(JSON.stringify(String(speech)))) + ')">'
      + '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor"'
      + ' stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>'
      + '</button>';
  }

  global.IQVoiceOut = {
    STATES: STATES,
    WORDS: WORDS,
    isSupported: support,
    control: control,
    speak: speak,
    stop: stop,
    /* Read back, for a caller that wants to know without touching the DOM contract. */
    stateOf: function (btn) { return (btn && btn.getAttribute && btn.getAttribute('data-voice-state')) || 'idle'; },
    /* Test seam ONLY in the sense that a test may read it; production never sets it. */
    speaking: function () { return liveBtn; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
