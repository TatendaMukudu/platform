/* WHERE CHROMIUM ACTUALLY IS, AND A LOUD FAILURE WHEN IT IS NOWHERE.

   Every browser gate resolved its binary as `process.env.CHROMIUM_PATH || chromium.executablePath()`
   and launched it. That is right until the two disagree, and in this container they do:
   playwright-core resolves the build it was published against (chromium-1228) while the image has
   chromium-1194 installed. `executablePath()` happily returns a path that does not exist.

   WHAT THAT LOOKED LIKE FROM THE OUTSIDE. Playwright does not refuse a missing executable quickly
   — the launch hangs. A gate that hangs produces no output at all, so in CI it is a timeout with
   no diagnosis, and by hand it looks exactly like "Chromium is not available in this container",
   which is what the previous handoff concluded and recorded as an external proof gap. It was not
   an absence. It was a version mismatch behind a silent hang, and the four pilot gates all pass
   here once the real binary is found.

   That is the worst shape a test-infrastructure defect can take: it removes proof while reporting
   nothing, and the missing proof gets written down as an environment limitation.

   SO THIS DOES TWO THINGS AND BOTH MATTER:

     it DISCOVERS an installed build when the expected one is absent, so a container whose image
     is one Playwright release behind still runs its gates rather than losing them;

     it FAILS LOUDLY AND IMMEDIATELY when there is genuinely no browser, naming what it looked
     for. A gate that cannot run must say so in one line; it must never hang, and it must never
     quietly pass.

   An explicit CHROMIUM_PATH always wins — if somebody names a binary, that is the binary, and
   being wrong about it should be their error rather than something this file routes around. */

'use strict';
const fs = require('fs');
const path = require('path');

/* The roots a Playwright install uses, in the order they are worth trying.

   PLAYWRIGHT_BROWSERS_PATH REPLACES the default location rather than adding to it — that is
   Playwright's own meaning for the variable, and treating it as one more place to look would
   quietly launch a browser from somewhere the caller had deliberately pointed away from. */
function _roots() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return [process.env.PLAYWRIGHT_BROWSERS_PATH];
  return ['/opt/pw-browsers', path.join(process.env.HOME || '/root', '.cache', 'ms-playwright')];
}

/* The executable inside one browser directory, across the layouts Playwright has shipped
   (`chrome-linux/chrome` and the newer `chrome-linux64/chrome`). */
function _exeIn(dir) {
  for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
    const p = path.join(dir, rel);
    try { if (fs.existsSync(p)) return p; } catch (_) { /* unreadable root: try the next */ }
  }
  return null;
}

/* Every chromium build present under the known roots, newest build number first, so a container
   with more than one keeps using the most recent rather than whichever `readdir` returned. */
function installedChromiums() {
  const found = [];
  for (const root of _roots()) {
    let entries = [];
    try { entries = fs.readdirSync(root); } catch (_) { continue; }
    for (const name of entries) {
      if (!/^chromium-\d+$/.test(name)) continue;
      const exe = _exeIn(path.join(root, name));
      if (exe) found.push({ build: Number(name.split('-')[1]) || 0, exe });
    }
  }
  return found.sort((a, b) => b.build - a.build).map(x => x.exe);
}

/* THE ONE ANSWER TO "WHICH BROWSER DO I LAUNCH". Returns a path that exists, or throws with what
   it tried. It never returns a path it has not checked. */
function chromiumPath(chromium) {
  const named = process.env.CHROMIUM_PATH;
  if (named) {
    if (fs.existsSync(named)) return named;
    throw new Error(`CHROMIUM_PATH is set to ${named}, and nothing is there. `
      + 'Unset it to let the gate find an installed build.');
  }
  let expected = null;
  try { expected = chromium && chromium.executablePath && chromium.executablePath(); } catch (_) { expected = null; }
  if (expected && fs.existsSync(expected)) return expected;

  const found = installedChromiums();
  if (found.length) return found[0];

  throw new Error('No Chromium to run the browser gate with. '
    + `playwright-core expected ${expected || '(no path)'} and it is not there, `
    + `and no chromium-* build was found under ${_roots().join(', ')}. `
    + 'Install one (npx playwright install chromium) or set CHROMIUM_PATH.');
}

module.exports = { chromiumPath, installedChromiums };
