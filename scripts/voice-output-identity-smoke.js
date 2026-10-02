'use strict';
/* Active utterance identity: callbacks from a cancelled read may arrive after restart. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
let active = [];
const speechSynthesis = {cancel() {}, speak(u) { active.push(u); }};
const SpeechSynthesisUtterance = function (text) { this.text = text; };
const window = {speechSynthesis, SpeechSynthesisUtterance, document: {documentElement: {lang:'en-GB'}}};
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '../js/voice-output.js'), 'utf8'), {window});
const states = {};
const btn = {
  closest() { return {querySelector() { return {set textContent(v) { states.live = v; }}; }}; },
  setAttribute(k, v) { states[k] = v; },
  getAttribute(k) { return states[k]; },
  classList: {toggle() {}}
};
const out = window.IQVoiceOut;
assert.equal(out.speak(btn, JSON.stringify('first')), true);
const u1 = active[0];
out.stop('stopped');
assert.equal(out.speak(btn, JSON.stringify('second')), true);
const u2 = active[1];
assert.equal(out.stateOf(btn), 'starting');
u1.onstart(); u1.onerror(); u1.onend();
assert.equal(out.speaking(), btn, 'cancelled U1 callbacks must not clear U2');
assert.equal(out.stateOf(btn), 'starting', 'cancelled U1 callbacks must not change U2 state');
u2.onstart();
assert.equal(out.stateOf(btn), 'speaking');
u1.onend();
assert.equal(out.stateOf(btn), 'speaking');
u2.onend();
assert.equal(out.speaking(), null);
assert.equal(out.stateOf(btn), 'ended');
console.log('voice utterance identity: 7 assertions passed');
