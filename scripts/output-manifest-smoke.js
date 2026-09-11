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
  graph: { series: [{ key: 'origins', unit: 'count', shape: 'trend', points: [
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
  ok('OM-B5 …and so is the voice, which keeps the uncertainty', V('voice', HONEST).ok === true);
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
      + 'fortnight old, so treat it as a starting point rather than settled.').ok === true);
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
  ok('OM-F2 …and VERIFIES the written reply against it before anything is returned',
    /manifest\.verify\('prose', written, _mf/.test(SERVER));
  ok('OM-F2b …degrading rather than shipping when it refuses',
    /mfCheck\.ok[\s\S]{0,400}_degraded\('unverified'\)/.test(SERVER));
  ok('OM-F3 the older cage is still there too — two gates with different failure modes, neither load-bearing alone',
    /composer\.verifyGrounding\(written/.test(SERVER));

} catch (e) { fail++; console.error('  FAIL output-manifest suite threw:', e && e.stack); }

console.log(`\noutput-manifest-smoke: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
