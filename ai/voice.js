/* ============================================================
   ai/voice.js — IntelliQ's OWN voice (pure, deterministic)

   The assistant speaks in this voice — not an LLM's. It composes warm, natural sentences
   from facts the caller already holds, so by construction it:
     • cannot predict (it has no notion of the future — it only arranges given facts),
     • cannot fabricate (it invents no fact; it phrases the ones passed in),
     • needs no API key, and sends nothing anywhere.

   Light, STABLE variety — a small set of phrasings chosen by a seed derived from the
   content — keeps it from sounding robotic without ever being random (the same state
   always reads the same way). PURE: imports nothing, no IO.
   ============================================================ */

const _GREET = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const _WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const _cap = s => (s && s.length ? s[0].toUpperCase() + s.slice(1) : s);
const _num = n => (n >= 0 && n <= 10 ? _WORDS[n] : String(n));

// Stable choice from a small set, seeded by a string — deterministic, never random.
function _pick(arr, seed) {
  let h = 2166136261; const s = String(seed || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return arr[(h >>> 0) % arr.length];
}

function greeting(name, timeOfDay) {
  const g = _GREET[timeOfDay] || 'Hello';
  return `${g}${name ? ', ' + name : ''}.`;
}

/* A leader's opening — an aggregate read (if given) and how much is worth a look. */
function leaderOpening({ name = '', timeOfDay = 'afternoon', count = 0, rollupHeadline = null, areaLabel = 'your area', seed = '' } = {}) {
  const g = greeting(name, timeOfDay);
  const c = Math.max(0, count | 0);
  const nThings = `${_num(c)} thing${c === 1 ? '' : 's'}`;
  if (rollupHeadline) {
    const tail = c ? _pick([` And ${nThings} worth a closer look.`, ` There ${c === 1 ? 'is one thing' : 'are ' + _num(c) + ' things'} to keep an eye on, too.`], seed + 'h') : '';
    return `${g} ${_cap(String(rollupHeadline))}.${tail}`;
  }
  if (!c) return `${g} ${_pick([`${_cap(areaLabel)} looks steady — nothing needs you this second.`, `All calm across ${areaLabel} right now.`, `${_cap(areaLabel)} is ticking along; nothing's asking for you today.`], seed)}`;
  return `${g} ${_pick([`${_cap(areaLabel)} is mostly steady — ${nThings} worth a look.`, `A calm stretch in ${areaLabel}, bar ${nThings} I'd flag.`, `Not much stirring in ${areaLabel}, though ${nThings} caught my eye.`], seed)}`;
}

/* A member's opening — for them, about their own side. */
function memberOpening({ name = '', timeOfDay = 'afternoon', count = 0, seed = '' } = {}) {
  const g = greeting(name, timeOfDay);
  const c = Math.max(0, count | 0);
  if (!c) return `${g} ${_pick(['You’re steady — nothing needs you this second.', 'All good on your side right now.', 'Nothing pressing for you today — I’m here if you want to dig into anything.'], seed)}`;
  return `${g} ${_pick(['One thing on your side worth a look.', 'There’s something I’d gently flag on your side.', 'A thing or two worth a moment on your side.'], seed)}`;
}

module.exports = { greeting, leaderOpening, memberOpening, _pick, _num };
