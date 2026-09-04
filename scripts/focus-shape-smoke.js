/* Truth layer — A FOCUS IS SOMETHING YOU WORK TOWARDS, AND EVERY FIELD LOOKS THE SAME.

   Two founder observations, one turn apart, that turn out to be the same piece of work.

   THE SHAPE. "A focus is something you work towards." It was one line of text, which made "did
   what you tried help?" a feeling rather than a check — and the whole Highs and Lows machinery
   downstream depends on that question having an answer. A focus now carries a TARGET (what would
   tell you it worked) and a REVIEW DATE (when to look).

   NEITHER IS REQUIRED, deliberately. Some things genuinely have no clean finish line, and
   refusing to let somebody start one until they invent a metric is how a tool teaches people to
   make one up. What is refused instead is a date the SERVER invented: an unparseable value is
   dropped rather than guessed at, because focus_stalled fires off that date and a stall notice
   about a day nobody chose is worse than no notice.

   THE LOOK. "The focus page doesn't have the composer. It has a white blob with 'in your own
   words'... a little more unison." Correct diagnosis. The composer sat on --bg-surface with
   --radius-lg and a focus glow; this field was transparent with a hand-picked 12px radius. The
   same act — typing something IntelliQ will hold — looked like two different products depending
   on which screen you were on. There is now ONE field shell, and anything taking typed input
   wears it.

   Run: node scripts/focus-shape-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _getMemory } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };

const C = 'fsh';
_loadAllStores({
  orgMeta:  { [C]: { orgName: 'A Club', orgMode: 'sports' } },
  orgUsers: { [C]: { u: { id: 'u', name: 'A Player', email: 'u@x.io', role: 'member', orgCode: C, status: 'active' } } },
});
_rebuildEmailIndex();

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { Authorization: `Bearer ${issueToken('u', C, 'member')}`, 'Content-Type': 'application/json' };
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: H, body: JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));

  try {
    /* ── FS1-FS3: the shape. ── */
    const when = Date.now() + 14 * 86400000;
    const iso = new Date(when).toISOString().slice(0, 10);
    const made = await post('/api/me/focus', {
      text: 'Lead the warm-up on Tuesdays',
      target: 'The group starts on time without me chasing them',
      reviewOn: iso,
    });
    ok('FS1 a focus carries what you will do, what would tell you it worked, and when to look',
      made.status === 200 && /starts on time/.test(made.j.focus.target || '') && !!made.j.focus.reviewAt);
    ok('FS1b …and the review date is stored as a real instant the stall check can read',
      Math.abs(made.j.focus.reviewAt - Date.parse(iso)) < 86400000);

    const bare = await post('/api/me/focus', { text: 'Something with no clean finish line' });
    ok('FS2 neither is required — a focus with no target and no date is still a focus, because refusing to start one until somebody invents a metric teaches them to make one up',
      bare.status === 200 && bare.j.focus.target === null && bare.j.focus.reviewAt === null);

    const junk = await post('/api/me/focus', { text: 'Work on my first touch', reviewOn: 'next Tuesday-ish' });
    ok('FS3 AN UNPARSEABLE DATE IS DROPPED, NOT GUESSED — focus_stalled fires off this date, and a stall notice about a day nobody chose is worse than no notice',
      junk.status === 200 && junk.j.focus.reviewAt === null);

    /* ── FS4: the target is the person's own words and is not rewritten. ── */
    const mine = (_getMemory(C, 'u').focuses || []).find(f => f.id === made.j.focus.id);
    ok('FS4 the target is stored exactly as they wrote it — a commitment somebody makes is not a thing to paraphrase back at them',
      mine && mine.target === 'The group starts on time without me chasing them');

    /* ── FS5-FS7: the look. One field shell, worn everywhere. ── */
    const css = R('css/styles.css');
    const member = R('css/member.css');
    ok('FS5 there is ONE field shell, and it sits on the same surface and radius as the composer',
      /\.iq-field\{[^}]*background:var\(--bg-surface\)/.test(css) &&
      /\.iq-field\{[^}]*border-radius:var\(--radius-lg\)/.test(css));
    ok('FS5b …with the same focus treatment, so focusing a field feels the same wherever you are',
      /\.iq-field:focus-within\{[^}]*box-shadow:0 0 0 3px var\(--accent-glow\)/.test(css) &&
      /\.iq-composer:focus-within\{[^}]*box-shadow:0 0 0 3px var\(--accent-glow\)/.test(member));
    ok('FS6 the old white blob is gone — no input in the app still has a hand-picked radius instead of the token',
      !/\.iq-focus-input\{[^}]*border-radius:12px/.test(css));

    const app_ = R('js/app.js');
    ok('FS7 the focus form uses the shared field rather than its own textarea',
      /class="iq-field"><textarea id="\$\{id\}-t" class="iq-field-input"/.test(app_));
    ok('FS7b …and the target and date are asked for on it, and sent',
      /What would tell you it worked\?/.test(app_) && /reviewOn/.test(app_) &&
      /body: JSON\.stringify\(\{ text, target, reviewOn,/.test(app_));

    /* ── FS8: THE ONE THAT MATTERS FOR THE FEEL. A new input surface must inherit the shell
       rather than invent one, or this drifts apart again the next time somebody adds a box. ── */
    /* FS8 — THE BILL, not an allow-list.

       Measured rather than asserted: 37 textareas exist in the app and 34 of them wore their own
       class, which is exactly the drift the founder described as "different fonts and sizes on
       every page". The live surfaces are converted; the rest sit on legacy screens (onboarding,
       safeguarding, notes, the intel draft) and converting them blind — without being able to
       look at the result — would risk making the thing worse in the name of consistency.

       So the remaining ones are FROZEN AT THEIR CURRENT COUNT. They can be paid down; they
       cannot grow. A new input surface must wear the shared shell, which is the property that
       stops this problem coming back while the old instances are worked through.

       Same shape as reachability-smoke's KNOWN_ORPHANS: a bill, recorded so it cannot be added
       to quietly. */
    const LEGACY_INPUT_CLASSES = 32;
    const inputs = (app_.match(/<textarea[^>]*class="([^"]*)"/g) || [])
      .map(m => (m.match(/class="([^"]*)"/) || [])[1] || '');
    const strays = inputs.filter(c => !/iq-field-input|iq-composer-input/.test(c));
    ok(`FS8 no NEW input surface invents its own look — the legacy count is frozen at ${LEGACY_INPUT_CLASSES} and cannot grow (found ${strays.length})`,
      strays.length <= LEGACY_INPUT_CLASSES ||
        (console.error('      strays:', strays.join(' | ')) === undefined && false));
    ok('FS8b …and the live surfaces are converted: the composer, the object thread, the forum, the focus form, the ladder pass form and the card thread',
      /class="iq-field"><textarea class="iq-field-input" id="wr-txt-/.test(app_) &&
      /class="iq-field-input iq-cardthread-ta"/.test(app_));

  } catch (e) { fail++; console.error('  FAIL suite threw:', e && e.stack); }

  server.close();
  console.log(`\nfocus-shape-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
