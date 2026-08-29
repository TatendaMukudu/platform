/* ============================================================
   ai/delivery.js — outbound proactive DELIVERY (pure)

   The last mile. The reasoner already knows what's worth someone's attention; this module
   decides WHAT to send, WHETHER to send it now, and shapes a channel-agnostic payload the
   server hands to web-push / email. It is the difference between "a place you visit" and
   "an assistant that reaches you" — the single biggest lever on proactivity.

   THE LINE THIS HOLDS (same as everywhere else, enforced by importing NOTHING):
     • It manufactures nothing — the digest is composed only from the reads it's given.
     • It never predicts — content is descriptive present-state (the caller passes the
       deterministic brief/voice text); this module only selects and formats.
     • SENSITIVE STAYS IN-APP — a care-flagged (wellbeing) read is NEVER eligible for
       outbound. Only steady, non-sensitive reads leave the box. (Enforced here AND by the
       caller; belt and braces.)
     • NO SPAM — quiet hours, a once-per-cadence cap, and "nothing to say → send nothing"
       are all decided here, so a person is reached only when it's worth it.
     • CONSENT + POLICY are the caller's gate (per-person opt-in; org may disable outbound
       entirely). This module assumes it's only called once those pass.

   PURE: imports nothing, no DB / IO / network / clock of its own (now is passed in).
   ============================================================ */

'use strict';

const DAY = 86400000;

// Default per-person delivery preferences. Off until the person opts in (consent-first).
const DEFAULT_PREFS = {
  enabled: false,
  channels: { push: false, email: false },
  cadence: 'daily',        // 'daily' | 'off'
  quietStart: 21,          // local hour outbound is held from (inclusive)
  quietEnd: 7,             // …until (exclusive) — overnight window by default
  lastSentAt: 0,
};

function _hour(now, tzOffsetMin = 0) {
  // Local hour given a timezone offset in minutes (the person's, if known; else UTC).
  const d = new Date(now + tzOffsetMin * 60000);
  return d.getUTCHours();
}
function _inQuietHours(now, prefs) {
  const h = _hour(now, prefs.tzOffsetMin || 0);
  const s = Number.isFinite(prefs.quietStart) ? prefs.quietStart : 21;
  const e = Number.isFinite(prefs.quietEnd) ? prefs.quietEnd : 7;
  return s <= e ? (h >= s && h < e) : (h >= s || h < e);   // handle overnight wrap
}

/* Only steady, non-sensitive reads may leave the box. A read is eligible when it is NOT
   care-flagged and NOT a private/sensitive kind. This is the outbound privacy gate. */
function eligibleReads(reads) {
  return (reads || []).filter(r => r && r.text && !r.careFlag && !r.sensitive);
}

/* Is there something urgent enough to interrupt with an ALERT now, rather than waiting for
   the next digest? A single ripe, non-sensitive, high-urgency read. Conservative on purpose
   — an alert that isn't worth it trains people to ignore the channel. */
function alertWorthy(reads, { minUrgency = 7 } = {}) {
  const cand = eligibleReads(reads).filter(r => r.readiness === 'ripe' && Number(r.urgency) >= minUrgency);
  if (!cand.length) return null;
  cand.sort((a, b) => Number(b.urgency) - Number(a.urgency));
  return cand[0];
}

/* Decide whether to deliver a DIGEST right now. Returns { send, reason }. Never sends an
   empty digest, never inside quiet hours, and never more than once per cadence window. */
function shouldDeliver({ prefs = DEFAULT_PREFS, now = Date.now(), hasContent = false } = {}) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  if (!p.enabled) return { send: false, reason: 'not_opted_in' };
  if (p.cadence === 'off') return { send: false, reason: 'cadence_off' };
  if (!p.channels || (!p.channels.push && !p.channels.email)) return { send: false, reason: 'no_channel' };
  if (!hasContent) return { send: false, reason: 'nothing_to_say' };   // never an empty digest
  if (_inQuietHours(now, p)) return { send: false, reason: 'quiet_hours' };
  // Once per cadence window (daily) — no double-sends, no spam.
  if (p.lastSentAt && (now - p.lastSentAt) < (p.cadence === 'daily' ? DAY : 0)) {
    // Same calendar-day guard: allow one per local day even if <24h since a late-night send.
    const sameWindow = (now - p.lastSentAt) < DAY;
    if (sameWindow) return { send: false, reason: 'already_sent_this_window' };
  }
  return { send: true, reason: 'ok' };
}

const _clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/* Shape the DIGEST payload — channel-agnostic { title, body, url, itemCount, kind }. Content
   comes only from `opening` (the deterministic voice line) + the eligible reads; nothing is
   invented. `count` items are summarised into the body; the person opens the app for detail. */
function composeDigest({ name = '', opening = '', reads = [], url = '/', max = 3 } = {}) {
  const items = eligibleReads(reads).slice(0, max);
  const title = name ? `Your IntelliQ rundown, ${_clip(name, 40)}` : 'Your IntelliQ rundown';
  const lead = _clip(opening, 240) || (items.length
    ? `${items.length} thing${items.length === 1 ? '' : 's'} worth a look.`
    : 'A steady day.');
  const lines = items.map(r => '• ' + _clip(r.text, 120));
  const body = [lead, ...lines].join('\n');
  return { kind: 'digest', title, body: _clip(body, 600).replace(/ • /g, '\n• '), itemCount: items.length, url };
}

/* Shape an ALERT payload from one worthy read. Short, single-subject, opens straight in. */
function composeAlert({ name = '', read = null, url = '/' } = {}) {
  if (!read) return null;
  return {
    kind: 'alert',
    title: 'One thing needs you',
    body: _clip(read.text, 240),
    url,
    itemCount: 1,
  };
}

/* Correction notices are content-free by construction. The withdrawn finding never enters this
   composer; the recipient is told only that a projection they previously saw has changed. */
function composeFindingChangeNotice({ change = 'changed', url = '/' } = {}) {
  return {
    kind: 'finding_change',
    title: 'An IntelliQ finding changed',
    body: change === 'gone'
      ? 'A finding you were shown is no longer current. Open IntelliQ for the updated picture.'
      : 'A finding you were shown has changed. Open IntelliQ for the updated picture.',
    url,
    itemCount: 1,
  };
}

module.exports = {
  DEFAULT_PREFS, eligibleReads, alertWorthy, shouldDeliver, composeDigest, composeAlert, composeFindingChangeNotice,
  _inQuietHours, _hour,
};
