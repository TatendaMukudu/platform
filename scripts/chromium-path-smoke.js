/* Truth layer — THE BROWSER GATE CAN ACTUALLY FIND A BROWSER.

   WHY THIS FILE EXISTS. The four pilot browser gates resolved Chromium as

     process.env.CHROMIUM_PATH || chromium.executablePath()

   and launched it. `executablePath()` returns the build playwright-core was published against,
   whether or not it is installed. In this container it is not: playwright-core expects
   chromium-1228 and the image ships chromium-1194.

   Playwright does not refuse a missing executable quickly — the launch HANGS. So the gate emitted
   no output at all, and the previous handoff recorded "local Chromium remains unavailable under
   /opt/pw-browsers; the registered frontend smoke therefore skips its rendered-browser work."
   That was not an absence. The binary was there the whole time, one directory along, and all four
   gates pass against it once it is found.

   That is the worst shape a test-infrastructure defect can take: it removes proof while reporting
   nothing, and the missing proof is then written down as an environment limitation rather than
   investigated. This suite is the guard that stops it recurring silently.

   WHAT IS ASSERTED. Not "Chromium exists here" — that would make this file fail on a machine
   with no browser, which is a legitimate state. What is asserted is the RESOLVER's contract:
   it never returns a path that does not exist, it finds an installed build when playwright-core
   points at a missing one, it honours an explicit CHROMIUM_PATH, and when there is genuinely
   nothing it throws a named error IMMEDIATELY rather than handing back a path to hang on.

   Run: node scripts/chromium-path-smoke.js */

'use strict';
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { chromiumPath, installedChromiums } = require('./lib/chromium-path.js');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

/* A fake browsers root, so the discovery is exercised against a layout this file controls rather
   than against whatever the host happens to have installed. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iq-chromium-'));
const mk = (build, rel) => {
  const p = path.join(tmp, `chromium-${build}`, ...rel.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '#!/bin/sh\n');
  return p;
};

const ENV = { ...process.env };
const restore = () => {
  for (const k of ['CHROMIUM_PATH', 'PLAYWRIGHT_BROWSERS_PATH']) {
    if (ENV[k] === undefined) delete process.env[k]; else process.env[k] = ENV[k];
  }
};

try {
  console.log('\n  A — IT NEVER RETURNS A PATH THAT IS NOT THERE');
  /* The exact production failure: playwright-core names a build that is not installed, and a
     different one is. Before the fix this returned the missing path and the gate hung on it. */
  const real1194 = mk(1194, 'chrome-linux/chrome');
  process.env.PLAYWRIGHT_BROWSERS_PATH = tmp;
  delete process.env.CHROMIUM_PATH;
  const missing = { executablePath: () => path.join(tmp, 'chromium-1228', 'chrome-linux64', 'chrome') };
  ok('CP-A1 playwright-core pointing at a build that is not installed does not win',
    chromiumPath(missing) !== missing.executablePath());
  ok('CP-A2 …the installed build is found instead', chromiumPath(missing) === real1194);
  ok('CP-A3 …and whatever comes back exists, which is the whole contract',
    fs.existsSync(chromiumPath(missing)));

  console.log('\n  B — AND WHEN PLAYWRIGHT IS RIGHT, PLAYWRIGHT WINS');
  const real1228 = mk(1228, 'chrome-linux64/chrome');
  ok('CP-B1 an executablePath that really exists is used as-is',
    chromiumPath({ executablePath: () => real1228 }) === real1228);
  /* NEWEST FIRST. A container with two builds should keep using the newer one rather than
     whichever readdir happened to return, or a gate silently changes browser between runs. */
  ok('CP-B2 …and with two installed builds, discovery prefers the newer',
    installedChromiums()[0] === real1228);
  ok('CP-B3 …while still listing the older one rather than hiding it',
    installedChromiums().includes(real1194));

  console.log('\n  C — AN EXPLICIT PATH IS AN INSTRUCTION, NOT A HINT');
  process.env.CHROMIUM_PATH = real1194;
  ok('CP-C1 a named binary wins over anything discovery would have chosen',
    chromiumPath({ executablePath: () => real1228 }) === real1194);
  /* AND BEING WRONG ABOUT IT IS THE CALLER'S ERROR. Routing around a path somebody set by hand
     would hide their mistake and launch a browser they did not ask for. */
  process.env.CHROMIUM_PATH = path.join(tmp, 'nope', 'chrome');
  ok('CP-C2 …and a named binary that is not there fails rather than being quietly replaced',
    () => { try { chromiumPath({ executablePath: () => real1228 }); return false; }
            catch (e) { return /CHROMIUM_PATH is set/.test(e.message); } });

  console.log('\n  D — NO BROWSER IS A LOUD FAILURE, NEVER A HANG');
  delete process.env.CHROMIUM_PATH;
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'iq-chromium-empty-'));
  process.env.PLAYWRIGHT_BROWSERS_PATH = empty;
  const nothing = { executablePath: () => path.join(empty, 'chromium-1228', 'chrome-linux64', 'chrome') };
  ok('CP-D1 with no build anywhere it throws rather than returning something to hang on',
    () => { try { chromiumPath(nothing); return false; } catch (_) { return true; } });
  ok('CP-D2 …and the message names what it looked for, so the next person does not repeat this',
    () => { try { chromiumPath(nothing); return false; }
            catch (e) { return /No Chromium/.test(e.message)
              && e.message.includes(empty) && /playwright install chromium/.test(e.message); } });
  /* A provider that throws from executablePath() must not take the discovery down with it. */
  ok('CP-D3 …and a playwright build that cannot answer at all is survived, not propagated',
    () => { try { chromiumPath({ executablePath: () => { throw new Error('no build'); } }); return false; }
            catch (e) { return /No Chromium/.test(e.message); } });

  console.log('\n  E — AND EVERY GATE ASKS THE SAME OWNER');
  /* The duplication is what let the four gates drift from the one file that already did this
     correctly. Asserted over the directory so a NEW gate cannot reintroduce the old line. */
  const dir = fs.readdirSync(__dirname).filter(f => /browser-check\.js$|^frontend-smoke\.js$/.test(f));
  ok('CP-E1 there are browser gates to check', dir.length >= 4);
  const offenders = dir.filter(f => {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    return /chromium\.executablePath\(\)/.test(src);
  });
  ok('CP-E2 …and none of them resolves the binary itself any more',
    offenders.length === 0 || console.error('    still resolving directly:', offenders.join(', ')) === undefined && offenders.length === 0);
  const users = dir.filter(f => /chromiumPath\(/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
  ok('CP-E3 …they all ask the one resolver', users.length === dir.length);
} catch (e) {
  fail++; console.error('  FAIL chromium-path suite threw:', e && e.stack);
} finally {
  restore();
}

console.log(`\nchromium-path-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
