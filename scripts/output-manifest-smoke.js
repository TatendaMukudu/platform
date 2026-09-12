/* Truth layer — ONE RECORD OF WHAT MAY BE SAID, AND FIVE CHANNELS THAT SAY IT.

   One answer leaves this product through five doors — the prose, the card, the graph, the source
   chips and the voice — and until now each door decided for itself what it was allowed to carry.
   That is five chances to disagree about one answer, and they were already disagreeing:

     verifyGrounding   checked the model's prose against a BLOB OF CONTEXT TEXT, by substring
     the chart gate    checked plotted values against a list of refs
     the citation gate checked external text against its own sources
     voice             checked nothing at all, because it read whatever the screen contained

   Four verifiers, four vocabularies, and no way to ask the question that matters: is the thing
   this person is being told the same thing we approved?

   WHY A MANIFEST RATHER THAN A BETTER KEYWORD CHECK — the founder's explicit instruction, "do not
   rely only on keyword checks". Asking "does this number appear anywhere in the context?" is a
   keyword check, and the context is thousands of words containing timestamps, ids and unrelated
   figures, so almost any small number is somewhere in it. A manifest lists the numbers THIS CLAIM
   may state. That set is small, exact, and decided by whoever approved the claim.

   THE NINE MUTATIONS the brief names are each driven below: an invented count, an invented date,
   an unsupported result, an unauthorised source, a removed source, an uncited web claim, a graph
   value absent from the manifest, a voice sentence absent from it, and a card/prose mismatch.

   Run: node scripts/output-manifest-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const fs = require('fs'), path = require('path');
const M = require('../ai/manifest.js');

let pass = 0, fail = 0;
const ok = (n, c) => { let v = false; try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); } };
const R = f => { try { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (_) { return ''; } };
const decomment = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const ROSTER = ['Ashton Mbeki', 'Priya Raman', 'Head Coach'];

/* ONE ANSWER, APPROVED. Two recorded claims, one inferred claim that carries the uncertainty, one
   external claim with its source, and a graph drawn from the same two origins. Everything below
   is checked against this and nothing else. */
const MF = M.manifest({
  subject: 'member:me',
  at: 1_700_000_000_000,
  privacyScope: 'you alone unless you share it',
  limitations: ['Counts occasions on the record. Something that happened and was never said is not here.'],
  claims: [
    M.claim({ id: 'c_origins', stance: 'recorded',
      text: 'Two separate accounts point the same way about your recovery between games.',
      basis: ['ev_a', 'ev_b'], at: 1_700_000_000_000, numbers: [2] }),
    M.claim({ id: 'c_named', stance: 'recorded',
      text: 'Priya Raman recorded one of them.', basis: ['ev_b'], names: ['Priya Raman'], numbers: [1] }),
    M.claim({ id: 'c_hedge', stance: 'inferred', carriesUncertainty: true,
      text: 'This rests on two accounts and one of them is a fortnight old, so treat it as a starting point rather than settled.',
      basis: ['ev_a', 'ev_b'], numbers: [2, 1] }),
    M.claim({ id: 'c_outside', stance: 'external',
      text: 'Recovery guidance generally suggests a lighter middle day between fixtures.',
      citation: { url: 'https://example.org/recovery', title: 'Recovery guidance', at: '2025-02-01' } }),
  ],
  graph: { moments: [1_699_000_000_000, 1_700_000_000_000],
    series: [{ key: 'origins', unit: 'count', shape: 'trend', claim: 'c_origins', points: [
      { at: 1_699_000_000_000, value: 1, refs: ['ev_a'] },
      { at: 1_700_000_000_000, value: 2, refs: ['ev_a', 'ev_b'] },
    ] }] },
});

const V = (ch, out, extra) => M.verify(ch, out, MF, extra || { roster: ROSTER });

try {
  console.log('\n  A — THE SHAPE ITSELF');
  ok('OM-A1 a manifest carries its claims, its basis, its limitations and its privacy scope',
    MF.claims.length === 4 && MF.basis.includes('ev_a') && MF.basis.includes('ev_b')
    && MF.limitations.length === 1 && !!MF.privacyScope);
  ok('OM-A2 every claim has an id, so five channels can refer to the SAME claim rather than to similar words',
    MF.claims.every(c => c.id && typeof c.id === 'string'));
  ok('OM-A2b …and a claim built without one still gets a stable id derived from its text',
    (() => { const a = M.claim({ text: 'the same words' }), b = M.claim({ text: 'the same words' });
      return !!a.id && a.id === b.id; })());
  ok('OM-A3 stance is a closed vocabulary of five, and an unknown one falls to inferred rather than through',
    M.STANCES.length === 5 && M.claim({ text: 'x', stance: 'authoritative' }).stance === 'inferred');
  ok('OM-A4 a claim carries a timestamp, so "when was this true" is answerable',
    MF.claims.find(c => c.id === 'c_origins').at === 1_700_000_000_000);
  ok('OM-A5 …and the graph carries its own provenance, ref by ref',
    MF.graph.series[0].points.every(p => p.refs.length >= 1));
  ok('OM-A6 an external claim carries its citation metadata — url, title and date',
    (() => { const c = MF.claims.find(x => x.id === 'c_outside');
      return c.citation.url && c.citation.title && c.citation.at; })());

  console.log('\n  B — AN HONEST ANSWER PASSES, ON EVERY CHANNEL');
  const HONEST = 'Two separate accounts point the same way about your recovery between games. '
    + 'Priya Raman recorded one of them. This rests on two accounts and one of them is a fortnight '
    + 'old, so treat it as a starting point rather than settled.';
  ok('OM-B1 the prose that says what was approved is approved', V('prose', HONEST).ok === true);
  ok('OM-B2 …so is the card saying the same thing', V('card', HONEST).ok === true);
  ok('OM-B3 …so is the graph drawn from the manifest’s own points',
    V('graph', { series: [{ key: 'origins', points: [
      { at: 1_699_000_000_000, value: 1 }, { at: 1_700_000_000_000, value: 2 }] }] }).ok === true);
  ok('OM-B4 …so are the citations the manifest holds',
    V('citations', [{ url: 'https://example.org/recovery', title: 'Recovery guidance' }]).ok === true);
  /* THE SPOKEN RENDERING CARRIES MORE THAN THE PROSE, and has to. A reader can see the
     limitation sitting under the answer; a listener gets only what is said, so the answer's own
     limits travel in the utterance or they were not told. This is what production composes. */
  const SPOKEN = HONEST + ' Counts occasions on the record. Something that happened and was never '
    + 'said is not here. This rests on 2 sources, shown under the reply.';
  ok('OM-B5 …and so is the voice, which keeps the uncertainty AND the answer\'s stated limits',
    V('voice', SPOKEN).ok === true);
  ok('OM-B5b …while the same words WITHOUT the limitation are refused on voice, and only on voice',
    (() => { const r = V('voice', HONEST);
      return r.ok === false && r.violations.some(v => v.kind === 'voice_dropped_limitation')
        && V('prose', HONEST).ok === true; })());
  ok('OM-B6 general knowledge that states no organisational figure is untouched',
    V('prose', 'Warm-ups usually have three phases and build intensity gradually.').ok === true);

  console.log('\n  C — THE NINE MUTATIONS THE BRIEF NAMES');

  /* 1. AN INVENTED COUNT. Both spellings, because a model writes small numbers as words most of
     the time and a digit-only check fails in the common case. */
  ok('OM-C1 an invented count is refused (digits)',
    V('prose', 'Four separate accounts point the same way.').ok === false);
  ok('OM-C1b …and in words, which is how a model usually writes one',
    V('prose', 'Four separate accounts point the same way.').violations.some(v => v.kind === 'number_not_in_manifest')
    && V('prose', '9 separate accounts point the same way.').ok === false);
  ok('OM-C1c …while the APPROVED count is still sayable, or the gate would refuse the truth too',
    V('prose', 'Two separate accounts point the same way.').ok === true);

  /* 2. AN INVENTED DATE. */
  ok('OM-C2 an invented date is refused',
    V('prose', 'You said this on 3 March 2025.').ok === false
    && V('prose', 'You said this on 3 March 2025.').violations.some(v => v.kind === 'date_not_in_manifest'));
  ok('OM-C2b …in every shape a person writes one',
    ['2025-03-03', '03/03/2025', 'March 3, 2025'].every(d => V('prose', `Recorded ${d}.`).ok === false));

  /* 3. AN UNSUPPORTED RESULT. The shape that turns a record into a scoreline. */
  ok('OM-C3 an unsupported result is refused',
    V('prose', 'You won 3 and lost 1 since then.').ok === false);

  /* 4. AN UNAUTHORISED SOURCE — a person on the roster whom this answer was not approved to name. */
  ok('OM-C4 naming somebody the answer was not authorised to name is refused',
    V('prose', 'Ashton Mbeki said the same thing.').ok === false
    && V('prose', 'Ashton Mbeki said the same thing.').violations.some(v => v.kind === 'name_not_in_manifest'));
  ok('OM-C4b …while the person the manifest DID approve is still nameable',
    V('prose', 'Priya Raman recorded one of them.').ok === true);
  ok('OM-C4c …and a name that is not on this organisation’s roster at all is not this gate’s business',
    V('prose', 'Pep Guardiola talks about this a lot.').ok === true);

  /* 5. A REMOVED SOURCE. The manifest is rebuilt without the evidence; the same words are now
     unsupported. This is the case that catches a stale answer surviving an erasure. */
  const WITHOUT_B = M.manifest({ subject: 'member:me',
    claims: MF.claims.filter(c => !c.basis.includes('ev_b') && c.id !== 'c_named')
      .map(c => M.claim({ ...c })) });
  ok('OM-C5 once a source is removed, the claim that rested on it is no longer approved',
    M.verify('prose', 'Priya Raman recorded one of them.', WITHOUT_B, { roster: ROSTER }).ok === false);
  ok('OM-C5b …and the count it supported goes with it',
    M.verify('prose', 'Two separate accounts point the same way.', WITHOUT_B, { roster: ROSTER })
      .violations.some(v => v.kind === 'number_not_in_manifest'));

  /* 6. AN UNCITED WEB CLAIM. Both directions: a citation that is not in the manifest, and an
     external claim whose source did not travel with it. */
  ok('OM-C6 a citation the manifest does not hold is refused',
    V('citations', [{ url: 'https://elsewhere.example/made-up', title: 'Something' }]).ok === false);
  ok('OM-C6b …a citation with no url at all is refused',
    V('citations', [{ title: 'A source with no link' }]).ok === false);
  ok('OM-C6c …and an EXTERNAL claim carrying no citation is refused, so the other gate cannot be walked around',
    (() => {
      const bad = M.manifest({ claims: [M.claim({ id: 'x', stance: 'external', text: 'Outside says so.' })] });
      return M.verify('citations', [], bad).violations.some(v => v.kind === 'external_claim_without_citation');
    })());

  /* 7. A GRAPH VALUE ABSENT FROM THE MANIFEST. */
  ok('OM-C7 a plotted value the manifest does not hold is refused',
    V('graph', { series: [{ key: 'origins', points: [{ at: 1_700_000_000_000, value: 9 }] }] }).ok === false);
  ok('OM-C7b …a plotted MOMENT the manifest does not hold is refused too — a real value at an invented time is still invented',
    V('graph', { series: [{ key: 'origins', points: [{ at: 1_777_000_000_000, value: 2 }] }] }).ok === false);
  ok('OM-C7c …and a whole series the manifest never approved is refused',
    V('graph', { series: [{ key: 'mood', points: [{ at: 1_700_000_000_000, value: 2 }] }] }).ok === false);

  /* 8. A VOICE SENTENCE ABSENT FROM THE MANIFEST, and the other half of L-MF5: voice may not DROP
     the claim that carries the uncertainty. A spoken sentence sounds more certain than a written
     one, and the qualification is the first thing a summariser cuts. */
  ok('OM-C8 voice adding a claim the manifest does not hold is refused',
    V('voice', HONEST + ' You have four focuses open.').ok === false);
  ok('OM-C8b …and voice DROPPING the uncertainty is refused, which no other channel checks',
    (() => { const r = V('voice', 'Two separate accounts point the same way about your recovery between games.');
      return r.ok === false && r.violations.some(v => v.kind === 'voice_dropped_uncertainty'); })());
  ok('OM-C8c …while a REPHRASING that keeps the substance is allowed, or an honest reading would fail',
    V('voice', 'Two separate accounts point the same way. This rests on two accounts, one of them a '
      + 'fortnight old, so treat it as a starting point rather than settled. Counts occasions on '
      + 'the record. Something that happened and was never said is not here.').ok === true);
  ok('OM-C8d …and the same omission is NOT refused on prose, because that is the channel the caveat is visible on',
    V('prose', 'Two separate accounts point the same way about your recovery between games.').ok === true);

  /* 9. A CARD / PROSE MISMATCH. Compared by claim ids, because they are MEANT to read
     differently — comparing words would pass everything or fail everything. */
  ok('OM-C9 a card and a prose answer built from the same claims agree',
    M.channelsAgree(['c_origins', 'c_hedge'], ['c_hedge', 'c_origins']).ok === true);
  ok('OM-C9b …and one carrying a claim the other does not is a mismatch, named in both directions',
    (() => { const r = M.channelsAgree(['c_origins', 'c_hedge'], ['c_origins']);
      return r.ok === false && r.onlyA.includes('c_hedge') && !r.onlyB.length; })());
  ok('OM-C9c …including the direction where the CARD says more than the prose',
    (() => { const r = M.channelsAgree(['c_origins'], ['c_origins', 'c_named']);
      return r.ok === false && r.onlyB.includes('c_named'); })());

  console.log('\n  D — A REFUSAL SAYS SOMETHING TRUE');
  ok('OM-D1 every violation kind has a sentence a person could read',
    ['number_not_in_manifest', 'date_not_in_manifest', 'name_not_in_manifest', 'quote_not_in_manifest',
     'graph_value_not_in_manifest', 'citation_not_in_manifest', 'voice_dropped_uncertainty', 'no_manifest']
      .every(k => M.refusalNote([{ kind: k }]).length > 20));
  ok('OM-D1b …and none of them blames the reader or names the model',
    ['number_not_in_manifest', 'voice_dropped_uncertainty', 'no_manifest']
      .every(k => !/you asked|your fault|the model|the AI|GPT|Claude/i.test(M.refusalNote([{ kind: k }]))));
  ok('OM-D2 no manifest at all is a refusal, not a pass — an unapproved answer is not approved by default',
    M.verify('prose', 'Anything at all.', null).ok === false
    && M.verify('prose', 'Anything at all.', { claims: [] }).ok === false);
  ok('OM-D3 an unknown channel is refused rather than defaulting to the loosest one',
    M.verify('telepathy', 'x', MF).ok === false);

  console.log('\n  E — PURE, AND ONE OWNER');
  const SRC = decomment(R('ai/manifest.js'));
  ok('OM-E1 the module does no IO, calls no model and has no clock of its own',
    !/require\(/.test(SRC) && !/Date\.now\(\)/.test(SRC) && !/fetch\(/.test(SRC));
  ok('OM-E2 …it decides nothing about what is true — it is handed claims and checks output against them',
    !/confidence|corroborat|band\b/i.test(SRC));
  ok('OM-E3 the verifier is ONE function serving all five channels, not five verifiers',
    (SRC.match(/^function verify\(/gm) || []).length === 1 && M.CHANNELS.length === 5);

  console.log('\n  F — AND IT IS ACTUALLY WIRED, NOT A MODULE NOTHING CALLS');
  const SERVER = decomment(R('server.js'));
  ok('OM-F1 the composer builds a manifest from the same authorised material the model was handed',
    /manifest\.manifest\(\{/.test(SERVER) && /subject: `member:\$\{userId\}`/.test(SERVER));
  ok('OM-F1b …with a claim for each belief, each record and each piece of assigned work',
    /beliefs\.slice\(0, 8\)\.map/.test(SERVER) && /evidence\.slice\(0, 12\)\.map/.test(SERVER));
  /* OM-F2 WAS A SOURCE-SHAPE ASSERTION PINNING A SINGLE-CHANNEL CALL, and the call it pinned is
     gone — not because the law weakened but because it got stronger: the composer no longer
     verifies one channel, it puts the whole answer through `approve`, which checks every channel
     this reply will leave by and their agreement. The behaviour is driven for real in
     output-channels-http-smoke.js against the live routes; what stays here is the structural
     backstop that the gate is REACHED and that a refusal degrades rather than ships. */
  ok('OM-F2 …and puts the whole answer — prose, voice and citations — through ONE gate before returning',
    /manifest\.approve\(_mf, \{[\s\S]{0,400}prose:[\s\S]{0,200}voice:[\s\S]{0,200}citations:/.test(SERVER));
  ok('OM-F2b …degrading rather than shipping when it refuses',
    /_approved\.ok[\s\S]{0,400}_degraded\('unverified'\)/.test(SERVER));
  ok('OM-F2c …and the spoken rendering is composed on the SERVER, so the browser has nothing to author',
    /_speechFor\(\{ text: written/.test(SERVER) && !/new SpeechSynthesisUtterance\(text \+ disclosure\)/.test(decomment(R('js/app.js'))));
  ok('OM-F3 the older cage is still there too — two gates with different failure modes, neither load-bearing alone',
    /composer\.verifyGrounding\(written/.test(SERVER));

  /* ══ G — A GRAPH MAY NOT OUTRUN ITS SENTENCE (L-MF7) ════════════════════════════════════
     The values being individually approved does not approve the LINE. Two approved points drawn
     as states say each was recorded; the same two drawn as a trend say the thing moved, which is
     a different and stronger claim, and it is the one a reader takes away. */
  console.log('\n  G — THE GRAPH MAY NOT SAY MORE THAN THE WORDS BESIDE IT');
  const MOMENTS = [1_699_000_000_000, 1_700_000_000_000];
  const withGraph = (series, extra = {}) => M.manifest({
    subject: 's', claims: [M.claim({ id: 'moved', text: 'This record holds two separate dated occasions to compare.', stance: 'inferred', ...extra })],
    graph: { moments: MOMENTS, series },
  });
  const TREND_PTS = [{ at: MOMENTS[0], value: 1 }, { at: MOMENTS[1], value: 2 }];
  const mfTrend = withGraph([{ key: 'origins', unit: 'count', shape: 'trend', claim: 'moved', points: TREND_PTS }]);
  ok('OM-G1 a trend whose movement IS claimed, drawn from the manifest, is approved',
    M.verify('graph', { series: [{ key: 'origins', shape: 'trend', points: TREND_PTS }] }, mfTrend).ok === true);
  ok('OM-G2 the SAME approved points drawn as a trend with no claim behind the movement are refused',
    (() => {
      const mf = withGraph([{ key: 'origins', unit: 'count', shape: 'trend', points: TREND_PTS }]);   // no `claim`
      const r = M.verify('graph', { series: [{ key: 'origins', shape: 'trend', points: TREND_PTS }] }, mf);
      return r.ok === false && r.violations.some(v => v.kind === 'graph_trend_without_claim');
    })());
  ok('OM-G2b …and the same points drawn as STATES are fine, because states assert no movement',
    M.verify('graph', { series: [{ key: 'origins', shape: 'state', points: TREND_PTS }] },
      withGraph([{ key: 'origins', unit: 'count', shape: 'state', points: TREND_PTS }])).ok === true);
  ok('OM-G3 a trend resting on a claim that carries the uncertainty must show a limit, or it is refused',
    (() => {
      const mf = withGraph([{ key: 'origins', unit: 'count', shape: 'trend', claim: 'moved', points: TREND_PTS }], { carriesUncertainty: true });
      const bare = M.verify('graph', { series: [{ key: 'origins', shape: 'trend', points: TREND_PTS }] }, mf);
      const shown = M.verify('graph', { limitations: ['One origin only.'], series: [{ key: 'origins', shape: 'trend', points: TREND_PTS }] }, mf);
      return bare.ok === false && bare.violations.some(v => v.kind === 'graph_dropped_uncertainty') && shown.ok === true;
    })());
  ok('OM-G4 a moment the RECORD does not hold is refused even when the value is approved',
    (() => {
      const r = M.verify('graph', { series: [{ key: 'origins', shape: 'trend',
        points: [{ at: MOMENTS[0], value: 1 }, { at: 1_695_000_000_000, value: 2 }] }] }, mfTrend);
      return r.ok === false && r.violations.some(v => v.kind === 'graph_time_not_in_record');
    })());
  ok('OM-G4b …and the moments come from the record, not from the series, or the check would be the drawing marking its own work',
    mfTrend.graph.moments.length === 2 && mfTrend.graph.moments.every(t => MOMENTS.includes(t)));

  /* ══ H — THE SOURCE ACTUALLY USED IS THE ONE SHOWN (L-MF6, both directions) ══════════════ */
  console.log('\n  H — THE SOURCE ACTUALLY USED IS THE ONE SHOWN');
  ok('OM-H1 an external claim whose approved source is NOT shown is refused — nothing on screen distinguishes it from an answer that rested on the source above it',
    (() => { const r = V('citations', []);
      return r.ok === false && r.violations.some(v => v.kind === 'citation_omitted'); })());
  ok('OM-H2 …and showing it passes, which is the only difference between the two cases',
    V('citations', [{ url: 'https://example.org/recovery' }]).ok === true);
  ok('OM-H3 an answer with no external claim at all is not made to cite anything',
    M.verify('citations', [], M.manifest({ claims: [M.claim({ id: 'a', text: 'recorded thing', stance: 'recorded' })] })).ok === true);

  /* ══ I — ONE ANSWER, EVERY DOOR, ONE CALL (L-MF8) ═══════════════════════════════════════ */
  console.log('\n  I — ONE ANSWER, EVERY DOOR, ONE CALL');
  ok('OM-I1 approve passes an answer whose channels agree and each verify',
    M.approve(MF, { prose: { value: HONEST, claims: M.claimsIn(HONEST, MF) },
      voice: { value: SPOKEN, claims: M.claimsIn(HONEST, MF) },
      citations: { value: [{ url: 'https://example.org/recovery' }] } }, { roster: ROSTER }).ok === true);
  ok('OM-I2 one bad channel fails the WHOLE answer — a caller handed "the prose was fine" ships the prose',
    (() => { const r = M.approve(MF, { prose: { value: HONEST }, voice: { value: HONEST } }, { roster: ROSTER });
      return r.ok === false && r.violations.some(v => v.kind === 'voice_dropped_limitation')
        && Object.keys(r.channels).length === 0; })());
  ok('OM-I3 …and a refusal carries a sentence a person can be shown, never a bare false',
    M.approve(MF, { prose: { value: HONEST }, voice: { value: HONEST } }, { roster: ROSTER }).note.length > 20);
  ok('OM-I4 two channels resting on DIFFERENT claims are refused even when each verifies alone',
    (() => {
      const r = M.approve(MF, { prose: { value: HONEST, claims: ['c_origins', 'c_hedge'] },
        voice: { value: SPOKEN, claims: ['c_origins'] } }, { roster: ROSTER });
      return r.ok === false && r.violations.some(v => v.kind === 'channels_disagree' && v.b === 'voice');
    })());
  ok('OM-I5 a channel declaring a claim this answer does not hold is refused',
    (() => { const r = M.approve(MF, { prose: { value: HONEST, claims: ['c_invented'] } }, { roster: ROSTER });
      return r.ok === false && r.violations.some(v => v.kind === 'claim_not_in_manifest'); })());
  ok('OM-I6 claimsIn is derived from the TEXT, so a caller cannot declare a list that stays right while its output drifts',
    (() => { const full = M.claimsIn(HONEST, MF), stale = M.claimsIn('Nothing in particular happened.', MF);
      return full.includes('c_origins') && full.includes('c_hedge') && stale.length === 0; })());
  /* THE COUNTEREXAMPLE THE BRIEF NAMES: THE PROSE IS RIGHT AND ANOTHER CHANNEL IS STALE. This is
     the shape that survives every per-channel check, because the stale channel is not saying
     anything FALSE — it is saying something that was true of the previous answer. Only a
     comparison between channels can see it, which is why `approve` exists. */
  ok('OM-I7a prose correct, VOICE still reading the previous answer — each channel verifies alone and the answer is still refused',
    (() => {
      /* A rendering of the PREVIOUS answer: it keeps the uncertainty and the limits, so every
         per-channel law is satisfied — and it is missing the finding the prose actually made. */
      const stale = 'This rests on two accounts and one of them is a fortnight old, so treat it as '
        + 'a starting point rather than settled. Counts occasions on the record. Something that '
        + 'happened and was never said is not here.';
      return M.verify('prose', HONEST, MF, { roster: ROSTER }).ok === true
        && M.verify('voice', stale, MF, { roster: ROSTER }).ok === true
        && M.approve(MF, { prose: { value: HONEST, claims: M.claimsIn(HONEST, MF) },
             voice: { value: stale, claims: M.claimsIn(stale, MF) } }, { roster: ROSTER }).ok === false;
    })());
  ok('OM-I7b prose correct, GRAPH overconfident — the same approved points drawn as a movement nobody claimed',
    (() => {
      const mf = M.manifest({ subject: 's', limitations: [],
        claims: [M.claim({ id: 'card', text: 'Two accounts point the same way about recovery.', numbers: [2] })],
        graph: { moments: MOMENTS, series: [{ key: 'origins', unit: 'count', shape: 'trend', points: TREND_PTS }] } });
      return M.verify('prose', 'Two accounts point the same way about recovery.', mf).ok === true
        && M.approve(mf, { prose: { value: 'Two accounts point the same way about recovery.' },
             graph: { value: { series: [{ key: 'origins', shape: 'trend', points: TREND_PTS }] } } }).ok === false;
    })());
  ok('OM-I7 an answer with no manifest behind it cannot be approved by handing it no channels either',
    M.approve(M.manifest({ claims: [] }), { prose: { value: 'anything' } }).ok === false
    && M.approve(MF, {}).ok === false);

  /* ── J — L-MF2b · A FIGURE BELONGS TO THE CLAIM IT IS ABOUT ────────────────────────────────
     An independent gate found this and it is the most interesting failure this file has held: an
     answer in which every word is approved, every figure is approved, and the sentence is false.
     Two claims, two figures, and the model swaps them. A membership test — "is 3 anywhere in this
     manifest" — cannot see a swap, because both halves are genuinely there. It is the same class
     as OM-I7a: nothing is invented, and the relation between true things is wrong.

     The four negatives below are the whole reason this is a comparison rather than a threshold.
     A rephrasing loses context coverage against every claim at once and must therefore accuse
     nobody; a figure with no context at all — a source count — has nothing to be about; and one
     sentence carrying both figures honestly must survive, because that sentence is the ordinary
     case this law would otherwise make unwritable. */
  console.log('\n  J — A FIGURE IS BOUND TO ITS OWN CLAIM, NOT TO THE MANIFEST AS A BAG OF NUMBERS');
  {
    const CROSS = M.manifest({
      subject: 'member:ash',
      claims: [
        M.claim({ id: 'c_rec', text: 'Two separate accounts concern recovery between fixtures', stance: 'recorded', numbers: [2], basis: ['s1', 's2'] }),
        M.claim({ id: 'c_att', text: 'Three separate accounts concern attendance at training', stance: 'recorded', numbers: [3], basis: ['s3', 's4', 's5'] }),
      ],
    });
    const v = (t) => M.verify('prose', t, CROSS);
    ok('OM-J1 THE GATE\'S OWN COUNTEREXAMPLE: "Three separate accounts concern recovery" is refused, though 3 and recovery are each approved',
      () => { const r = v('Three separate accounts concern recovery.');
        return r.ok === false && r.violations.some(x => x.kind === 'number_crossed_claims' && x.value === 3); });
    ok('OM-J1b …and it names both ends of the crossing, so a log line says which claim the figure was stated about and which one it belongs to',
      () => { const x = v('Three separate accounts concern recovery.').violations[0];
        return x.statedAbout === 'c_rec' && x.approvedFor === 'c_att'; });
    ok('OM-J1c …and it is refused in the other direction too, so this is a rule rather than one hard-coded sentence',
      () => { const r = v('Two separate accounts concern attendance.');
        return r.ok === false && r.violations.some(x => x.kind === 'number_crossed_claims' && x.value === 2); });
    ok('OM-J1d a subject before the count cannot borrow another claim\'s approved figure',
      () => { const r = v('Recovery concerned three separate accounts.');
        return !r.ok && r.violations.some(x => x.kind === 'number_crossed_claims' && x.value === 3 && x.statedAbout === 'c_rec'); });
    ok('OM-J1e the opposite subject-first crossing is refused across punctuation',
      () => { const r = v('Attendance, at training, concerned two separate accounts!');
        return !r.ok && r.violations.some(x => x.kind === 'number_crossed_claims' && x.value === 2); });
    ok('OM-J1f an honest subject-first account count remains usable',
      v('Recovery concerned two separate accounts.').ok === true
      && v('Attendance concerned three separate accounts.').ok === true);
    ok('OM-J2 the honest sentence about recovery passes',        v('Two separate accounts concern recovery.').ok === true);
    ok('OM-J2b the honest sentence about attendance passes',     v('Three separate accounts concern attendance.').ok === true);
    ok('OM-J2c BOTH figures in ONE sentence, each with its own, passes — the clause is the unit, not the sentence',
      v('Two separate accounts concern recovery, and three separate accounts concern attendance.').ok === true);
    ok('OM-J2d a REPHRASED honest figure passes — losing coverage against every claim equally accuses nobody',
      v('Two separate records mentioning recovery are on file.').ok === true);
    ok('OM-J2e a figure with no context of its own falls back to membership rather than to a guess',
      v('This rests on 3 sources.').ok === true);
    /* THE CLAUSE IS THE UNIT, AND THIS IS THE ASSERTION THAT MAKES THAT LOAD-BEARING. The figure
       here has almost no context of its own — "2 accounts", then the sentence moves on — while
       the clause AFTER it is long, specific, and about the other topic entirely. Read to the end
       of the sentence, the rival claim out-covers the holder and an honest sentence is refused.
       Read to the end of the CLAUSE, which is what a figure is actually about, nothing happens.
       Without this case a mutation widening the boundary to the whole sentence survives the whole
       suite, which is how a loosened rule stays green. */
    ok('OM-J2f a bare figure whose sentence CONTINUES into the other topic is not accused by the words after it',
      v('There are 2 accounts, and attendance at training concerns three separate accounts.').ok === true);
    ok('OM-J3 a figure in NO claim is still refused by L-MF2, and reported as absent rather than as crossed',
      () => { const r = v('Nine separate accounts concern recovery.');
        return r.ok === false && r.violations.length === 1 && r.violations[0].kind === 'number_not_in_manifest'; });
    ok('OM-J4 the refusal has its own sentence — "the wrong thing" is a different fact from "not in the record"',
      M.refusalNote([{ kind: 'number_crossed_claims' }]) !== M.refusalNote([{ kind: 'number_not_in_manifest' }])
      && /wrong thing/i.test(M.refusalNote([{ kind: 'number_crossed_claims' }])));
    ok('OM-J5 a single-claim manifest has nothing to cross, and is not made stricter by this law',
      () => { const one = M.manifest({ claims: [M.claim({ id: 'only', text: 'Two separate accounts concern recovery', numbers: [2] })] });
        return M.verify('prose', 'Two separate accounts concern recovery.', one).ok === true; });
    ok('OM-J6 and it applies to every channel that says words, not to prose alone — a spoken crossing is the worse one',
      () => {
        const r = M.verify('card', 'Three separate accounts concern recovery.', CROSS);
        const s = M.verify('voice', 'Three separate accounts concern recovery.', CROSS);
        return r.ok === false && s.ok === false;
      });
    ok('OM-J7 the whole bundle is refused, not the prose alone — a caller handed a partly approved answer ships it',
      M.approve(CROSS, { prose: { value: 'Three separate accounts concern recovery.' } }).ok === false);
  }

} catch (e) { fail++; console.error('  FAIL output-manifest suite threw:', e && e.stack); }

console.log(`\noutput-manifest-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
