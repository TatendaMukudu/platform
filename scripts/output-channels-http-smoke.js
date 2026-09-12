/* Truth layer — ONE ANSWER, EVERY DOOR IT LEAVES BY (HTTP, the real routes).

   ai/manifest.js has been a real owner with a real suite since the pass that introduced it, and
   the independent gate was right about what that did not prove: the module existed, the prose
   path called it, and the card, the graph, the citations and the voice were checked ONLY against
   the module in a test. A verifier nothing calls on the way to a screen is a verifier that will
   be correct about an answer nobody was shown.

   So this file drives the production routes and reads the channels off the wire.

     POST /api/assistant/turn                  prose, citations, voice
     GET  /api/objects/:kind/:id/thread        the opening card, and its spoken rendering
     GET  /api/objects/:kind/:id/chart         the graph

   WHY THE SPOKEN CHANNEL MOVED TO THE SERVER, which is the substantive change under these
   assertions. It used to be assembled in the browser out of whatever the action row was holding
   — the message text plus a source count the browser counted itself. That is a second author for
   one answer, on the one channel nothing verified, and it is the channel where drift costs most:
   a spoken sentence carries more confidence than a written one, and the qualification is the
   first thing an assembler drops. What is spoken is now composed beside the prose, put through
   the same gate, and read out verbatim.

   The provider boundary is steered by replacing ai.complete on the gateway module object — the
   same object server.js holds. No fake server, no fake route, the real handler all the way down.

   Run: node scripts/output-channels-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
process.env.IQ_COMPOSER = '1';

const ai = require('../ai/gateway.js');
const M  = require('../ai/manifest.js');
/* The chart BUILDER, held as a module object so section F can make it compute a timestamp instead
   of reading one — the same technique the provider boundary above uses, and for the same reason:
   the only honest way to prove a gate fires is to create the condition it exists to catch, in
   production code, and then drive the real route. */
const chartMod = require('../ai/chart.js');
const S  = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, inquiryStates } = S;

let pass = 0, fail = 0;
/* A THROW IS A FAILURE, NOT A SILENT EXIT — PROTOCOL lie #8. */
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'och';
const NOW = Date.UTC(2026, 2, 10, 9, 0, 0);
const DAY = 86400000;

/* TWO SIGNALS, TWO SEPARATE ORIGINS, TWO SEPARATE DAYS. Every number here is load-bearing:
   one origin would make the manifest carry its single-origin limitation and change what the
   voice channel is required to say, and one date would make the chart a `state` and take the
   trend laws out of the run entirely. Both of those cases get their own fixture below, because a
   suite that only ever sees one shape is a suite that proves one shape. */
const SIG = (origin, at) => ({ kind: 'observation', status: 'active', source: 'training log',
  originRef: origin, at, turnId: `t_${origin}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref: `ev_${origin}`, text: 'Recovery felt short between the midweek games' });

const INQ = (id, subjectRef, label, signals) => ({
  inquiryId: id, subjectRef, topic: { canonicalConcept: `football.${id}`, label },
  status: 'exploring',
  hypotheses: [{ id: `h_${id}`, statement: 'Recovery between fixtures is the thing to look at',
    confidence: { score: 0.6, band: 'probable' }, status: 'open' }],
  leadingHypothesisId: `h_${id}`,
  signals,
  confidence: { score: 0.6, band: 'probable', because: ['2 independent origins'] },
  missingSignals: [], falsifiers: [], timeline: [], lastUpdatedAt: NOW,
});

_loadAllStores({
  orgMeta:  { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    ash: { id: 'ash', name: 'Ashton Mbeki', email: 'a@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
    rio: { id: 'rio', name: 'Rodrigo Salvatierra', email: 'r@x.io', role: 'member', orgCode: C, status: 'active', assignedNodeIds: ['n1'] },
  } },
  orgNodes: { [C]: { n1: { nodeId: 'n1', name: 'First Team', parentId: null, childNodeIds: [], memberIds: ['ash', 'rio'], leaderIds: [] } } },
  inquiryStates: { [C]: { 'member:ash': {
    two: INQ('two', 'member:ash', 'Recovery between games', [SIG('o_a', NOW - 3 * DAY), SIG('o_b', NOW - 2 * DAY)]),
    // ONE origin, ONE moment: the shape whose picture may not be a line and whose voice owes an
    // extra sentence. Without it both of those laws would run only against the happy fixture.
    one: INQ('one', 'member:ash', 'A single telling', [SIG('o_solo', NOW - DAY)]),
  } } },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete };
const restore = () => Object.assign(ai, REAL);
/* The model always "reaches" and always has budget; only what it WRITES varies, because the
   thing under test here is what happens to a written reply on its way to five screens. */
const say = (what) => Object.assign(ai, {
  enabled: () => true, budgetAvailable: () => true, complete: async () => what,
});

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = issueToken('ash', C, 'member');
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const get  = u => fetch(base + u, { headers: H }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const turn = text => fetch(base + '/api/assistant/turn', { method: 'POST', headers: H, body: JSON.stringify({ text }) })
    .then(r => r.json()).catch(() => null);

  const ASK = 'How has my recovery between games been going?';
  /* GROUNDED PROSE. It restates the working read the kernel handed the model and states no figure
     of its own, which is exactly what an honest composed reply looks like. */
  const HONEST = 'Recovery between fixtures is the thing to look at, and that is the working read '
    + 'rather than something settled.';

  try {
    console.log('\n  A — THE COMPOSED TURN LEAVES BY THREE DOORS, AND THEY ARE ONE ANSWER');
    say(HONEST);
    const r1 = await turn(ASK);
    const resp1 = (r1 && r1.response) || {};
    ok('OC-A1 the composer wrote the reply (otherwise every assertion below is about the deterministic path)',
      resp1.composer && resp1.composer.degraded === false && /working read/i.test(resp1.responseText || ''));
    ok('OC-A2 the reply arrives with a SPOKEN rendering composed by the server',
      typeof resp1.speech === 'string' && resp1.speech.length > resp1.responseText.length);
    ok('OC-A2b …which begins with the words that are on the screen, so the two channels are one answer',
      String(resp1.speech).startsWith(String(resp1.responseText)));
    ok('OC-A3 …and states what it rests on, with the count the citation channel actually carries',
      () => {
        const m = String(resp1.speech).match(/rests on (\d+) sources?/);
        return !!m && Number(m[1]) === (resp1.sources || []).length && (resp1.sources || []).length > 0;
      });
    ok('OC-A3b …a figure that is APPROVED, not merely printed — the same manifest refuses any other one',
      () => {
        const mf = M.manifest({ claims: [M.claim({ id: 'reader', text: 'x', numbers: [(resp1.sources || []).length] })] });
        const good = M.verify('voice', `This rests on ${(resp1.sources || []).length} sources, shown under the reply.`, mf);
        const bad  = M.verify('voice', `This rests on ${(resp1.sources || []).length + 7} sources, shown under the reply.`, mf);
        return good.ok === true && bad.ok === false;
      });
    ok('OC-A4 the citation channel and the chips under the reply are the same list, not two answers to "what is this built on"',
      Array.isArray(resp1.sources) && resp1.sources.every(s => s && s.kind && s.label));

    /* THE HISTORY. Read-aloud that works only while the bubble is on screen is read-aloud that is
       missing whenever somebody actually wants it, because the reason you reopen a thread is to
       check something. The approved rendering is stored with the message, exactly as the sources
       already were — and it is the SAME approved rendering, not a fresh one composed on read. */
    const convs = await get('/api/assistant/conversations');
    const cid = ((convs.j && convs.j.conversations) || [])[0] && ((convs.j.conversations)[0].id);
    const hist = cid ? await get(`/api/assistant/conversations/${encodeURIComponent(cid)}`) : { j: null };
    const said = (((hist.j && hist.j.messages) || [])
      .filter(m => m && m.role === 'assistant').slice(-1))[0] || null;
    ok('OC-A5 the approved spoken rendering is stored with the message, so reopening the thread can still read it',
      !!said && typeof said.speech === 'string' && said.speech.length > 0);
    ok('OC-A5b …and it is the one that was approved, not a second one composed on the way out',
      !!said && said.speech === resp1.speech);

    console.log('\n  B — A CHANNEL THAT CANNOT HONESTLY CARRY THE ANSWER REFUSES THE WHOLE TURN');
    /* The model states a count about this person's records that no claim in the manifest holds.
       The prose gate catches it — and the point of the assertion is what happens NEXT: nothing is
       shipped on any channel, including the spoken one. */
    say('You have seven separate accounts pointing the same way about your recovery.');
    const r2 = await turn(ASK);
    const resp2 = (r2 && r2.response) || {};
    ok('OC-B1 a reply stating a figure this record does not hold is refused, and the turn degrades',
      resp2.composer && resp2.composer.degraded === true && resp2.composer.reason === 'unverified');
    ok('OC-B1b …and the refused words reach no channel at all, spoken or written',
      !/seven separate accounts/i.test(String(resp2.responseText || '') + ' ' + String(resp2.speech || '')));
    ok('OC-B2 …while the deterministic reply that replaces it still gets a spoken rendering, because a listener does not lose the product when the model does',
      typeof resp2.speech === 'string' && resp2.speech.length > 0);

    console.log('\n  C — THE OPENING CARD AND ITS SPOKEN RENDERING ARE COMPOSED TOGETHER');
    const th = await get('/api/objects/inquiry/two/thread?scope=self');
    ok('OC-C1 the thread hands the client a composed opening rather than four fields to assemble',
      th.status === 200 && typeof th.j.openingText === 'string' && th.j.openingText.length > 0);
    ok('OC-C2 …with the sources that opening stands on',
      Array.isArray(th.j.openingSources) && th.j.openingSources.length > 0
      && th.j.openingSources.every(s => s.kind && s.label));
    ok('OC-C3 …and a spoken rendering of the SAME card, with its source count',
      typeof th.j.openingSpeech === 'string'
      && th.j.openingSpeech.startsWith(th.j.openingText)
      && new RegExp(`rests on ${th.j.openingSources.length} sources?`).test(th.j.openingSpeech));
    ok('OC-C4 nothing is refused on the honest path, so the note is empty rather than decorative',
      th.j.openingNote === '');

    /* THE SINGLE-ORIGIN OBJECT. Its manifest carries a limitation, so its spoken rendering has to
       carry it too — the one asymmetry between reading and listening that actually matters. */
    const th1 = await get('/api/objects/inquiry/one/thread?scope=self');
    ok('OC-C5 an object everything traces to ONE origin says so aloud, because a listener cannot see the caveat under the answer',
      th1.status === 200 && /single origin/i.test(th1.j.openingSpeech || ''));
    ok('OC-C5b …and the two-origin object does not say it, so the sentence means something',
      !/single origin/i.test(th.j.openingSpeech || ''));

    console.log('\n  D — THE PICTURE ANSWERS TO THE SAME RECORD');
    const ch = await get('/api/objects/inquiry/two/chart?kind=firming');
    ok('OC-D1 a belief with two dated origins gets its picture, and it is a line',
      ch.status === 200 && !!ch.j.chart && (ch.j.chart.series || []).some(s => s.shape === 'trend'));
    ok('OC-D1b …drawn only at moments the record actually holds',
      () => {
        const moments = new Set(inquiryStates[C]['member:ash'].two.signals.map(s => s.at));
        return ((ch.j.chart || {}).series || []).every(s => (s.points || []).every(p => p.at == null || moments.has(p.at)));
      });
    ok('OC-D2 …and it carries what it cannot show, which is what lets a trend rest on a qualified claim',
      () => Array.isArray((ch.j.chart || {}).limitations) && ch.j.chart.limitations.length > 0);
    const ch1 = await get('/api/objects/inquiry/one/chart?kind=firming');
    ok('OC-D3 one moment on the record is drawn as a STATE, never a line — an infinite rate of change is the most dramatic shape this product can draw',
      ch1.status === 200 && (!ch1.j.chart || (ch1.j.chart.series || []).every(s => s.shape !== 'trend')));

    console.log('\n  E — AND THE BROWSER AUTHORS NONE OF IT');
    const APP = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    /* THE OWNER MOVED OUT OF app.js into js/voice-output.js, which is the point rather than an
       accident: the state machine sitting beside the row that renders the button is how it came
       to compose the spoken sentence in the first place. So the app is checked for DELEGATION and
       for the absence of a second implementation; the owner's own behaviour is driven in
       voice-input-smoke against a stubbed speechSynthesis. */
    const VOUT = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'voice-output.js'), 'utf8');
    ok('OC-E1 read-aloud speaks the rendering it was handed and composes nothing',
      /IQVoiceOut\.control\(speech, rid\)/.test(APP)
      && !/This rests on \$\{sources\.length\}/.test(APP)
      && !/SpeechSynthesisUtterance/.test(APP));
    ok('OC-E2 …and the opening card is rendered from the server\'s composed text, not rebuilt from the payload',
      /data\.openingText/.test(APP) && !/\[sum\.thinking \|\| x\.claim/.test(APP));
    ok('OC-E3 a control that cannot work is not drawn — the reason is drawn instead',
      /IQVoiceOut\.control\(speech, rid\)/.test(APP)
      && /data-voice="unsupported"/.test(VOUT) && /data-voice="none"/.test(VOUT));

    /* ── OC-E4/E5 ARE STRUCTURAL, AND SECTION F IS WHY THEY ARE NO LONGER THE ONLY THING ──────
       These two pin that the gate is CALLED. Round 4 left them as the whole of the graph story,
       with the honest note that no fixture here could make the chart route refuse — and an
       independent gate was right that "a graph-gate removal must be caught by a behavioural
       assertion, not solely a source check". Section F does that. These stay because a call site
       that has been deleted and a call site that cannot fire read the same in a test log, and
       saying which is which is cheaper than working it out again next round. */
    const SRV = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    ok('OC-E4 the chart route puts the picture through the manifest before returning it, and refuses with a reason rather than half-drawing',
      /manifest\.approve\(_mf, \{ graph: \{ value: governed\.chart \} \}\)/.test(SRV)
      && /_ok\.ok[\s\S]{0,200}chart: null, note: _ok\.note/.test(SRV));
    ok('OC-E5 …and the thread route does the same for the card and its spoken rendering, per channel rather than all-or-nothing',
      /manifest\.approve\(_omf, \{[\s\S]{0,200}card:[\s\S]{0,200}voice:/.test(SRV)
      && /_cardRefused \? _oApproved\.note : _open\.text/.test(SRV));

    /* ══ F — THE GRAPH GATE, FIRED THROUGH THE REAL ROUTE ═══════════════════════════════════
       Why this needs doing at all, and why it could not be done with a fixture: the chart route
       reads the moments the record holds and the points the picture plots from the SAME object,
       through one owner, so no arrangement of signals can make them disagree. That is the good
       news and it is exactly what makes the gate untestable by arranging data — the condition it
       exists to catch is a BUILDER that computes a timestamp rather than reading one, and no
       builder in this repository does.

       So the builder is made to do it, at the module boundary, for one call: `buildFirming` shifts
       one plotted moment by a single millisecond. Nothing else changes — the value, the refs, the
       shape and the series key are untouched, so `governChart` still passes it and the picture is
       drawn from real evidence at a moment the record does not have. One millisecond, because a
       gate that only catches an obviously wrong date is a gate that catches nothing: the real
       defect is a builder rounding, bucketing or re-stamping, and those are off by a little.

       This is the same instrument as `say()` above. It steers PRODUCTION code through the module
       object server.js holds; the route, the handler, the governance step and the gate are all the
       real ones. */
    console.log('\n  F — AND THE PICTURE IS CHECKED AGAINST THE RECORD, NOT AGAINST ITSELF');
    const realBuildFirming = chartMod.buildFirming;
    const clean = await get('/api/objects/inquiry/two/chart?kind=firming');
    ok('OC-F0 the honest picture is drawn, so what follows is about the gate and not about a broken fixture',
      clean.status === 200 && !!clean.j.chart && !clean.j.note);
    try {
      chartMod.buildFirming = (args) => {
        const spec = realBuildFirming(args);
        // ONE moment, moved by ONE millisecond. Still evidenced, still the right shape.
        for (const s of (spec.series || [])) {
          for (const p of (s.points || [])) { if (p && Number.isFinite(p.at)) { p.at = p.at + 1; break; } }
        }
        return spec;
      };
      const bad = await get('/api/objects/inquiry/two/chart?kind=firming');
      ok('OC-F1 a picture plotting a moment the record does not hold is REFUSED by the route, not returned',
        bad.status === 200 && bad.j.chart === null);
      ok('OC-F1b …naming the law it broke, so the next builder is told what it did',
        Array.isArray(bad.j.violations) && bad.j.violations.includes('graph_time_not_in_record'));
      ok('OC-F1c …with a sentence for the reader rather than a silent empty panel',
        typeof bad.j.note === 'string' && /moment the record does not have/i.test(bad.j.note));
      ok('OC-F1d …and NOTHING is half-drawn: a reader takes what is on the screen for the whole',
        bad.j.chart === null && !(bad.j.chart && bad.j.chart.series));
    } finally {
      chartMod.buildFirming = realBuildFirming;
    }
    const after = await get('/api/objects/inquiry/two/chart?kind=firming');
    ok('OC-F2 and with the builder honest again the same picture is drawn, so the refusal was about the moment and not about the route breaking',
      after.status === 200 && !!after.j.chart
      && JSON.stringify(after.j.chart) === JSON.stringify(clean.j.chart));

    /* A state point is a dated assertion too. Previously the independent moment check ran
       only for a trend, letting a one-point chart invent a date that its inquiry never held. */
    try {
      chartMod.buildFirming = args => {
        const spec = realBuildFirming(args);
        const origins = (spec.series || []).find(x => x.key === 'origins');
        if (origins && origins.points.length === 1) origins.points[0].at += 1;
        return spec;
      };
      const badState = await get('/api/objects/inquiry/one/chart?kind=firming');
      ok('OC-F2-state a one-point state chart cannot shift its only recorded moment',
        badState.status === 200 && badState.j.chart === null
        && (badState.j.violations || []).includes('graph_time_not_in_record'));
    } finally { chartMod.buildFirming = realBuildFirming; }

    /* Swapping two REAL recorded dates between points is more subtle: membership alone
       passes, but the 2-origin count is then falsely shown at the earlier date. */
    try {
      chartMod.buildFirming = args => {
        const spec = realBuildFirming(args);
        const origins = (spec.series || []).find(x => x.key === 'origins');
        if (origins && origins.points.length >= 2)
          [origins.points[0].at, origins.points[1].at] = [origins.points[1].at, origins.points[0].at];
        return spec;
      };
      const swapped = await get('/api/objects/inquiry/two/chart?kind=firming');
      ok('OC-F2-swap the chart cannot put a later count on an earlier recorded moment',
        swapped.status === 200 && swapped.j.chart === null
        && (swapped.j.violations || []).includes('graph_point_not_in_record'));
    } finally { chartMod.buildFirming = realBuildFirming; }

    /* ══ CROSS-ROUTE: THE CARD AND THE PICTURE ANSWER TO THE SAME RECORD ════════════════════
       The gate's other objection: the thread route builds a manifest for the card and the voice,
       the chart route builds another for the graph. These are TWO manifests constructed
       by the same owner, not one shared instance. Verify agreement about the actual object's
       count and dated evidence on the two routes; no route may endorse a chart builder's
       point as its own proof of that point. */
    const thTwo = await get('/api/objects/inquiry/two/thread?scope=self');
    const chTwo = await get('/api/objects/inquiry/two/chart?kind=firming');
    ok('OC-F3 the card route and the chart route describe the SAME object from the same record',
      () => {
        if (thTwo.status !== 200 || chTwo.status !== 200) return false;
        const recorded = new Set(inquiryStates[C]['member:ash'].two.signals.map(s => s.at));
        const plotted = ((chTwo.j.chart || {}).series || []).flatMap(s => (s.points || []).map(p => p.at)).filter(a => a != null);
        return plotted.length > 0 && plotted.every(a => recorded.has(a));
      });
    ok('OC-F3b …and the card states the source count the card route actually carries, so neither door invents a figure of its own',
      () => {
        const m = String(thTwo.j.openingSpeech || '').match(/rests on (\d+) sources?/);
        return !!m && Number(m[1]) === (thTwo.j.openingSources || []).length;
      });
    /* AND THE RECORD MOVING MOVES BOTH. A new account on the same object has to show up
       in the card's evidence count AND as a new moment in the picture. Two
       routes reading two records would move one of these and not the other, and that is the
       failure "one manifest" is supposed to make impossible. */
    inquiryStates[C]['member:ash'].two.signals.push(SIG('o_c', NOW - 12 * 3600 * 1000));
    const thAfter = await get('/api/objects/inquiry/two/thread?scope=self');
    const chAfter = await get('/api/objects/inquiry/two/chart?kind=firming');
    ok('OC-F4 a new account on the record moves the CARD count, not merely a stable number of source chips',
      (thAfter.j.present?.detail?.evidenceCount || 0) === (thTwo.j.present?.detail?.evidenceCount || 0) + 1
      && (thTwo.j.openingSources || []).some(x => x.kind === 'record' && /^2 things you told me$/.test(x.label || ''))
      && (thAfter.j.openingSources || []).some(x => x.kind === 'record' && /^3 things you told me$/.test(x.label || '')));
    ok('OC-F4b …and the same account moves the PICTURE, at the moment it was recorded',
      () => {
        const plotted = new Set(((chAfter.j.chart || {}).series || []).flatMap(s => (s.points || []).map(p => p.at)));
        return plotted.has(NOW - 12 * 3600 * 1000);
      });
    ok('OC-F4c …and the picture still passes the card\'s own manifest afterwards, which is the whole point of one owner',
      chAfter.status === 200 && !!chAfter.j.chart && !chAfter.j.violations);

    /* ══ G — THE SPOKEN RENDERING KEEPS EVERY CAVEAT THE WRITTEN ONE SHOWS ══════════════════
       An independent gate asked what happens on the DETERMINISTIC path, and it was right to: the
       composed reply's rendering goes through `manifest.approve` above, while the fallback calls
       `_speechFor` directly and nothing checks the result. What that found was a silent clip —
       `.slice(0, 3)` on the limitations — and the interesting part is not the dropped sentence.

       It is that ai/manifest.js's voice law requires EVERY limitation on the manifest to survive
       into the spoken channel and refuses with `voice_dropped_limitation` otherwise. So a fourth
       limitation would not have been quietly dropped on the composed path; it would have refused
       the whole turn, and the reader would have seen a degraded answer with nothing anywhere
       saying why. Two rules about one thing, disagreeing, with today's only producer topping out
       at exactly three — which is why nobody had seen it.

       BOTH OWNERS, DRIVEN TOGETHER. This is not a source check: `_speechFor` is the production
       composer of what is spoken and `manifest.verify` is the production gate it has to satisfy,
       and the assertion is that the first satisfies the second at a size the product has not yet
       reached but is one caveat away from. */
    console.log('\n  G — WHAT IS SPOKEN KEEPS EVERY CAVEAT WHAT IS WRITTEN SHOWS');
    {
      const FOUR = [
        'This counts occasions on the record, not everything that happened.',
        'One of these accounts is a fortnight old.',
        'Nobody has said anything about the away games.',
        /* THE FOURTH IS DELIBERATELY UNLIKE THE OTHER THREE. My first one was 'this rests on
           what was said, not what was measured', whose only distinctive words are 'rests' and
           'measured' -- and 'rests' appears in the source-disclosure sentence every rendering
           already ends with, so the substance test found half of it and called it present. The
           assertion that a CLIPPED rendering is refused then passed a clipped rendering. A
           negative assertion needs a fixture whose absence is detectable. */
        'Nothing here reflects the goalkeeping sessions nobody wrote down.',
      ];
      const spoken = S._speechFor({ text: 'Two separate accounts point the same way about recovery.',
        sourceCount: 2, limitations: FOUR });
      ok('OC-G1 a reply carrying FOUR limitations speaks all four — the fourth is not silently dropped',
        FOUR.every(l => String(spoken).includes(l)));
      ok('OC-G1b …and still says what it rests on afterwards, so the disclosure is not pushed off the end',
        /rests on 2 sources/.test(String(spoken)));
      const mf = M.manifest({ limitations: FOUR,
        claims: [M.claim({ id: 'card', text: 'Two separate accounts point the same way about recovery.', numbers: [2] })] });
      ok('OC-G2 …and the rendering PASSES the same voice gate the composed path is held to, which a clipped one cannot',
        M.verify('voice', spoken, mf).ok === true);
      ok('OC-G2b …while a rendering missing one of them is refused by that gate, naming the limitation it lost',
        () => {
          const clipped = S._speechFor({ text: 'Two separate accounts point the same way about recovery.',
            sourceCount: 2, limitations: FOUR.slice(0, 3) });
          const r = M.verify('voice', clipped, mf);
          return r.ok === false && r.violations.some(v => v.kind === 'voice_dropped_limitation');
        });
      /* AND THE SAME FUNCTION IS WHAT THE DETERMINISTIC ROUTE USES. Driven through the wire so
         this is not a claim about a helper nobody calls: the model is made to refuse, the turn
         degrades, and the spoken rendering that comes back still carries the answer and the
         source disclosure rather than being dropped along with the composer. */
      say('You have seven separate accounts pointing the same way about your recovery.');
      const degraded = ((await turn(ASK)) || {}).response || {};
      ok('OC-G3 the deterministic reply still gets a spoken rendering, because a listener does not lose the product when the model does',
        degraded.composer && degraded.composer.degraded === true
        && typeof degraded.speech === 'string' && degraded.speech.length > 0);
      ok('OC-G3b …which BEGINS with the words on the screen, so the two channels are one answer on this path too',
        String(degraded.speech).startsWith(String(degraded.responseText)));
      ok('OC-G4 …and every limitation the reply SHOWS is also one it SAYS — the listener is told no less than the reader',
        () => {
          const shown = Array.isArray(degraded.limitations) ? degraded.limitations : [];
          return shown.every(l => String(degraded.speech).includes(String(l).replace(/[.!?]$/, '')));
        });
    }

  } catch (e) { fail++; console.error('  FAIL output-channels suite threw:', e && e.stack); }

  restore();
  server.close();
  console.log(`\noutput-channels-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
