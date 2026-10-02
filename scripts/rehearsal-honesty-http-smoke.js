/* Truth layer — WHAT INTELLIQ SAYS ABOUT ITS OWN RECORD, AND ABOUT ITSELF.

   The founder's iPhone rehearsal after the previous closure (findings R1 #52), five defects, each
   reproduced on the real route before anything was written:

     A  "What do you actually have on me?" → "I don't have enough authorised evidence to answer
        that yet", on a screen carrying that person's own Inquiry and Focus
     B  "Why do you think that?" → "That's a reasoning question more than a read of your recorded
        data … once the reasoning engine is switched on"
     C  a second support turn → "That is the same part of the record I just showed you — ask about
        something else in it"
     D  "And do you want to involve th" — a mid-word fragment, after the #47 repair
     E  "What could we try?" → an apology, then a menu of ways to manage the object

   THE THREAD THROUGH THEM is that each has a correct answer the product already knows. A was true
   about the free-text retrieval bundle and false about the product; B routed the most org-fact
   question there is to the world-knowledge edge; C let a guard outrank the question; D fixed one
   of three doors; E left the model free to answer a question the deterministic path answers well.
   None of these is a copy defect and none is fixed with copy.

   WHY D IS NOT #47 AGAIN. #47 was repaired in `_composeTurn`. The composer is one of three doors —
   switched off, over budget, refused by the manifest, refused by the grounding cage — and in the
   other cases the reasoning edge writes the reply through `assembleGoverned`, which had no opinion
   about whether the model finished its sentence. Section D drives that door with the composer OFF,
   which is the pilot's own configuration.

   Run: node scripts/rehearsal-honesty-http-smoke.js */

'use strict';
process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';
/* THE COMPOSER IS ON FOR THIS FILE, and section E is why. Written without this line the whole
   suite ran with it off, so E's "model path" and "deterministic path" were the same path, the two
   arms were trivially equal, and removing the guard under test changed nothing — a mutation
   found it. Section D turns it off deliberately and puts it back. */
process.env.IQ_COMPOSER = '1';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken } = S;
const ai = require('../ai/gateway.js');
const languageGuard = require('../ai/language-guard.js');
const reg = require('../ai/reasoning-register.js');
const composerActions = require('../ai/composer-actions.js');

let pass = 0, fail = 0;
const ok = (n, c) => {
  let v = false;
  try { v = typeof c === 'function' ? c() : c; } catch (_) { v = false; }
  if (v) { pass++; console.log('  PASS', n); } else { fail++; console.error('  FAIL', n); }
};

const C = 'reh', NOW = Date.now(), DAY = 86400000;
const SIG = (ref, who, at, text) => ({ kind: 'observation', status: 'active', source: who,
  originRef: `o_${ref}`, at, turnId: `t_${ref}`, directness: 'direct', authority: 'corroborated',
  specificity: 0.7, ref, contributedBy: who, text });

/* THE WORDS THE LIVE BUILD USED, pinned so their ABSENCE is what is asserted rather than the
   presence of something that merely reads better. */
const DENIES = /don'?t have enough authorised evidence|nothing (?:recorded|specific) (?:about|for) you|you haven'?t told me/i;
const NARRATION = /reasoning question more than a read|you'?re asking me to|I'?m sorry|let me try again|my (?:system )?prompt|which of those would you like/i;

_loadAllStores({
  orgMeta: { [C]: { orgName: 'Alma College', orgMode: 'sports' } },
  orgUsers: { [C]: {
    /* THE PERSON WITH A RECORD — the founder's own shape: one question deliberately opened, one
       thing committed to, and nothing that has reached a standing. */
    titi: { id: 'titi', name: 'Titi Player', email: 't@reh.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['ft'], profileComplete: true },
    /* AND SOMEBODY AT THE VERY BEGINNING, because "nothing has settled yet" and "there is nothing
       here at all" are different facts about a person and the live build gave them one answer. */
    newbie: { id: 'newbie', name: 'New Person', email: 'n@reh.io', role: 'member', orgCode: C,
      status: 'active', assignedNodeIds: ['ft'], profileComplete: true },
    coach: { id: 'coach', name: 'A Coach', email: 'c@reh.io', role: 'coach', orgCode: C,
      status: 'active', leadershipNodeIds: ['ft'], profileComplete: true },
  } },
  orgNodes: { [C]: { ft: { nodeId: 'ft', name: 'First Team', parentId: null, childNodeIds: [],
    memberIds: ['titi', 'newbie'], leaderIds: ['coach'] } } },
  inquiryStates: { [C]: { 'member:titi': {
    mine: {
      inquiryId: 'mine', subjectRef: 'member:titi', status: 'exploring', openedBy: 'titi',
      topic: { label: 'Where they are trying to get to', canonicalConcept: 'self_account.long_term' },
      hypotheses: [{ id: 'hm', statement: 'they want to start every week', supportRefs: ['evm1', 'evm2'],
        confidence: { score: 0.6, band: 'probable', because: ['two independent accounts'] }, status: 'open' }],
      leadingHypothesisId: 'hm',
      signals: [SIG('evm1', 'titi', NOW - 6 * DAY, 'I want to be starting every week by the spring'),
        SIG('evm2', 'coach', NOW - 5 * DAY, 'they have said the same thing to me twice')],
      confidence: { score: 0.6, band: 'probable', because: ['two independent accounts'] },
      missingSignals: [{ question: 'what would starting every week actually take?' }],
      falsifiers: [], timeline: [], lastUpdatedAt: NOW,
    },
    /* A QUESTION AT `worth_testing`, for section E: one explanation with support and nothing
       competing is the kernel's own condition, and it is what makes the two paths comparable on
       a question that HAS options rather than only on one that has none. */
    late: {
      inquiryId: 'late', subjectRef: 'member:titi', status: 'exploring', openedBy: 'titi',
      topic: { label: 'Late goals', canonicalConcept: 'football.late_goals', domain: 'sports' },
      hypotheses: [{ id: 'hl', statement: 'we drop too deep once ahead', supportRefs: ['evl1', 'evl2'],
        confidence: { score: 0.7, band: 'probable', because: ['two independent accounts'] }, status: 'open' }],
      leadingHypothesisId: 'hl',
      signals: [SIG('evl1', 'titi', NOW - 4 * DAY, 'we sat deep after going ahead'),
        SIG('evl2', 'coach', NOW - 3 * DAY, 'the line dropped twenty yards')],
      confidence: { score: 0.7, band: 'probable', because: ['two independent accounts'] },
      missingSignals: [{ question: 'is it the same ten minutes every time?' }],
      falsifiers: [], timeline: [], lastUpdatedAt: NOW,
    },
  } } },
  userAiProfiles: { [`${C}:titi`]: { focuses: [{ id: 'foc_t', text: 'Get into the starting eleven',
    status: 'active', visibility: 'only_me', createdAt: new Date(NOW - 4 * DAY).toISOString() },
    { id: 'foc_l', text: 'Concede fewer late goals', status: 'active', visibility: 'only_me',
      addresses: { kind: 'inquiry', id: 'late' }, createdAt: new Date(NOW - DAY).toISOString() }] } },
});
_rebuildEmailIndex();

const REAL = { enabled: ai.enabled, budgetAvailable: ai.budgetAvailable, complete: ai.complete,
  completeJSON: ai.completeJSON, canUnderstand: ai.canUnderstand };

/* THE FOUNDER'S OWN FRAGMENT, ending mid-word. */
const CUT = 'You would want to know whether the coach has said anything about it directly. '
  + 'And do you want to involve th';
/* AND THEIR OWN LIVE MODEL REPLY TO "WHAT COULD WE TRY?". */
const APOLOGY = "I'm not going to keep repeating that screenshot at you — I'm sorry, that was not "
  + 'useful and I should have caught it sooner. Let me try again properly. Here is what you can do '
  + 'with this focus: show this inquiry, set a review date, discuss it with the group, or attach '
  + 'material to it. Which of those would you like?';

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = who => ({ Authorization: `Bearer ${issueToken(who, C, 'member')}`, 'Content-Type': 'application/json' });
  const call = (who, m, u, b) => fetch(base + u, { method: m, headers: H(who),
    body: b === undefined ? undefined : JSON.stringify(b) })
    .then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
  const ask = async (who, text, about, conv) => {
    const r = await call(who, 'POST', '/api/assistant/turn',
      { text, ...(about ? { about } : {}), ...(conv ? { conversationId: conv } : {}) });
    const resp = (r.j || {}).response || {};
    return { said: String(resp.responseText || ''), conv: (r.j || {}).conversationId || null,
      composer: resp.composer || {}, sources: resp.sources || [],
      limits: [...((resp.qa || {}).limitations || []), ...(resp.limitations || [])] };
  };
  const endsMidWord = t => /[\p{L}\p{N}]$/u.test(String(t || '').trim());

  try {
    console.log('\n  A — THE SELF-READ AGREES WITH THE SCREEN');
    /* WHAT THE SAME SCREEN SHOWS, read the way Home reads it. Without this the section asserts a
       contradiction against a premise nobody checked. */
    const onScreen = [];
    for (const k of ['inquiry', 'focus', 'high', 'low']) {
      const r = await call('titi', 'GET', `/api/objects?kind=${k}&scope=self`);
      onScreen.push(...(((r.j || {}).objects) || []).filter(o => !o.parked));
    }
    ok('RH-A0 the screen really does carry this person\'s own objects',
      onScreen.some(o => o.kind === 'inquiry') && onScreen.some(o => o.kind === 'focus'));
    const have = await ask('titi', 'What do you actually have on me?');
    ok('RH-A1 asked what is on their record, it does not deny having one',
      !DENIES.test(have.said));
    /* THE COUNT IS CHECKED AGAINST THE SCREEN, not against a number written here: a fixture grows
       and an assertion pinned to "1 question" then fails for a reason that has nothing to do with
       the law. What must hold is that the answer and the screen agree. */
    const nInq = onScreen.filter(o => o.kind === 'inquiry').length;
    const nFoc = onScreen.filter(o => o.kind === 'focus').length;
    ok('RH-A2 …it counts what is actually on the screen, and the two agree',
      new RegExp(`${nInq} questions? being worked out`, 'i').test(have.said)
      && new RegExp(`${nFoc} things? you have committed to`, 'i').test(have.said));
    /* AND EVERY NAME IT PRINTS IS A REAL OBJECT'S. This is the assertion that would catch an
       answer which counted correctly and then invented what the things were called. */
    const quoted = [...have.said.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    const headlines = onScreen.map(o => String(((o.present || {}).summary || {}).full
      || ((o.present || {}).summary || {}).title || (o.explained || {}).headline || '').replace(/\.$/, '').trim());
    ok('RH-A3 …and every name it prints belongs to one of them, because a count is not a read',
      quoted.length >= 2 && quoted.every(qn => headlines.includes(qn)));
    /* THE DISTINCTION THE FINDING ASKS FOR BY NAME: "no settled High/Low" is not "no record". */
    ok('RH-A4 …and says no standing has been reached WITHOUT calling that an empty record',
      /Nothing has crossed into a High or a Low yet/i.test(have.said)
      && /not the same as having nothing recorded/i.test(have.said));
    /* AND THE OTHER STATE IS A DIFFERENT ANSWER. Without this the section passes on a build that
       says the same reassuring thing to everybody. */
    const empty = await ask('newbie', 'What do you actually have on me?');
    ok('RH-A5 somebody with nothing recorded is told that plainly, and differently',
      /no Highs, Lows, Inquiries or Focuses/i.test(empty.said)
      && !/question being worked out/i.test(empty.said)
      && empty.said !== have.said);
    ok('RH-A6 …and the two answers do not both claim a standing state that neither has',
      !/crossed into a High or a Low/i.test(empty.said));
    /* NOT ONE WORD ANYBODY CONTRIBUTED. The shape of the record crosses; the accounts do not. */
    ok('RH-A7 …and no contributed account appears in either answer',
      !/starting every week by the spring/i.test(have.said)
      && !/said the same thing to me twice/i.test(have.said));
    ok('RH-A8 an object overview does not deny access to the private conversation or attachments',
      /private conversation/i.test(empty.said) && /materials? you attach/i.test(empty.said)
      && /overview counts/i.test(have.said));

    console.log('\n  B — AND IT ANSWERS THE QUESTION INSTEAD OF DESCRIBING ITSELF');
    /* THE CLASSIFIER IS THE CAUSE, so it is asserted directly: these questions are about the
       record, and routing them to the world-knowledge edge is what produced the narration. */
    ok('RH-B0 a question about what IntelliQ holds is not classed as a world-knowledge question',
      ['What do you know about me so far?', 'Why do you think that?', 'What are you uncertain about?',
        'What makes you say that?', 'How confident are you?']
        .every(q => reg.classifyRegister(q).register === 'self_read'));
    ok('RH-B0b …while a genuine world question still is',
      reg.classifyRegister('What do you know about a 4-3-3?').register === 'world_knowledge'
      && reg.classifyRegister('Why is pressing higher better?').register === 'world_knowledge');
    ok('RH-B0c …and the reasoning edge is never asked to take one',
      reg.wantsReasoning('self_read') === false);
    const why = await ask('titi', 'Why do you think that?');
    ok('RH-B1 "why do you think that?" answers with the basis, not with how IntelliQ works',
      !NARRATION.test(why.said) && /the reading is /i.test(why.said));
    ok('RH-B2 …and says what that reading rests on, naming a real inquiry of theirs',
      /rests on two independent accounts/i.test(why.said)
      && headlines.some(hl => hl && why.said.includes(`On "${hl}"`)));
    const unsure = await ask('titi', 'What are you uncertain about?');
    ok('RH-B3 "what are you uncertain about?" names the open question',
      /what would starting every week actually take/i.test(unsure.said));
    /* THE SELF-CONTRADICTION THE FINDING REPORTS: an uncertainty named, then denied. */
    ok('RH-B4 …and does not deny having any uncertainty in the same breath',
      !/no ambiguity|nothing is uncertain|I am not uncertain/i.test(unsure.said));
    ok('RH-B5 …and neither answer classifies the question back at the person',
      [why, unsure].every(a => !NARRATION.test(a.said)));

    console.log('\n  C — A REQUESTED VERDICT IS NEVER WHAT GETS SUPPRESSED');
    const c1 = await ask('titi', 'What do you make of this?', { kind: 'inquiry', id: 'late' });
    const c2 = await ask('titi', 'Does the record actually support that, or is that just a hypothesis?', { kind: 'inquiry', id: 'late' }, c1.conv);
    const c3 = await ask('titi', 'Does the record actually support that, or is that just a hypothesis?', { kind: 'inquiry', id: 'late' }, c1.conv);
    ok('RH-C1 the verdict is given the first time', /^Supported/i.test(c2.said.trim()));
    ok('RH-C2 …and asked again, the verdict is still given rather than replaced',
      /^Supported/i.test(c3.said.trim())
      && !/same part of the record I just showed you/i.test(c3.said));
    /* THE FOUNDER'S OWN INSTRUCTION: say the evidence is unchanged, and still answer. */
    ok('RH-C3 …with the sameness said plainly beside it',
      /Nothing has been added to the record since you last asked/i.test(c3.said));
    /* AND THE GUARD IS NOT SIMPLY GONE. A restated action with no verdict in it still gets the
       sentence the guard was written for, or removing the guard entirely would pass this section. */
    const r1 = await ask('titi', 'What do you actually have on me?');
    const r2 = await ask('titi', 'What do you actually have on me?', null, r1.conv);
    ok('RH-C4 …and a repeated self-read keeps its answer too, rather than being deflected',
      new RegExp(`${nInq} questions? being worked out`, 'i').test(r2.said)
      && !/same part of the record I just showed you/i.test(r2.said));

    console.log('\n  D — NOTHING LEAVES THE TURN IN THE MIDDLE OF A WORD, ON ANY PATH');
    /* THE PREDICATE IS ONE OWNER, shared by the composer and the turn's exit — the previous round
       fixed the composer alone and this finding is what that cost. */
    ok('RH-D0 a finished sentence is not mistaken for a fragment',
      !/[\p{L}\p{N}]$/u.test('That is what the record holds.'.trim()));
    ai.enabled = () => true; ai.budgetAvailable = () => true; ai.canUnderstand = () => false;
    /* ── THE DOOR THE PREVIOUS REPAIR DID NOT COVER, OPENED THE WAY PRODUCTION OPENS IT ──────
       The composer degrades — off, over budget, refused — and the reply then comes from the
       reasoning edge through `assembleGoverned`. `IQ_COMPOSER` is read once at module load, so
       deleting the environment variable here would change nothing and the first version of this
       section silently exercised the composer instead, passing on its guard rather than on the
       one under test. A mutation found that. Degrading the composer for real is both the honest
       reproduction and the founder's own configuration. */
    ai.complete = async () => { throw Object.assign(new Error('composer unavailable'), { status: 503 }); };
    ai.completeJSON = async () => ({ claims: [{ text: CUT, provenance: 'general' }] });
    const cut = await ask('titi', 'Why is it worth pressing higher up the pitch?');
    ok('RH-D0b the reasoning edge really is what wrote this, or the section proves nothing',
      cut.composer.degraded === true && cut.composer.reason === 'error');
    ok('RH-D1 the reasoning edge does not commit a fragment',
      !endsMidWord(cut.said) && !/involve th$/.test(cut.said.trim()));
    ok('RH-D2 …it keeps the sentence the model did finish',
      /said anything about it directly/i.test(cut.said));
    ok('RH-D3 …and tells the reader it stopped early, without naming an internal limit',
      /stopped before it was finished/i.test(cut.said)
      && !/ran out of room|token|max_?tokens/i.test(cut.said));
    /* ── AND NOTHING IS SOURCED OFF AN ANSWER THAT WAS NEVER WRITTEN ────────────────────────
       The finding's second sentence: "do not source or persist a visibly incomplete response."

       THIS IS NOT THE EXIT GUARD'S DOING, and saying so is the point of the assertion. A
       fragment with no finished sentence in it never reaches the exit as bare text on this path:
       `assembleGoverned` enforces cite-or-ask, so an uncited claim is demoted into a QUESTION —
       "I don't have … recorded, is that right?" — which is already whole and already sourceless.
       Two assertions here claimed to prove the guard and could not fail; a mutation found them.
       One assertion that names the real owner is worth more than two that credit the wrong one. */
    const NOTHING_WHOLE = 'And do you want to involve th';
    ai.completeJSON = async () => ({ claims: [{ text: NOTHING_WHOLE, provenance: 'org_data', evidenceRefs: ['evl1'] }] });
    const bare = await ask('titi', 'Why is it worth pressing higher up the pitch?');
    ok('RH-D4 cite-or-ask turns an unsupported fragment into a question rather than an assertion, and cites nothing',
      !endsMidWord(bare.said) && /is that right/i.test(bare.said) && bare.sources.length === 0);

    console.log('\n  E — ONE ANSWER TO "WHAT COULD WE TRY?", WHICHEVER PATH WRITES IT');
    ai.complete = async () => String(APOLOGY);
    const modelPath = await ask('titi', 'What could we try?', { kind: 'inquiry', id: 'late' });
    ai.complete = async () => { throw Object.assign(new Error('provider down'), { status: 503 }); };
    const detPath = await ask('titi', 'What could we try?', { kind: 'inquiry', id: 'late' });
    ok('RH-E1 the apology and the menu never reach the person',
      !/I'?m sorry/i.test(modelPath.said) && !/show this inquiry/i.test(modelPath.said)
      && !/which of those would you like/i.test(modelPath.said));
    /* CONVERGENCE, ASSERTED AS EQUALITY. The founder asked for the same SEMANTIC answer; holding
       the model to the deterministic one gives the stronger property, and the stronger property
       is the one that can be checked. */
    ok('RH-E2 both paths give the person the same answer',
      modelPath.said === detPath.said && modelPath.said.length > 40);
    ok('RH-E3 …and it is the substantive one: what is worth trying and what it would teach',
      /worth trying/i.test(detPath.said) && /it would tell you/i.test(detPath.said));
    ok('RH-E4 …not a menu of ways to manage the object',
      !languageGuard.offersInterfaceMenu(detPath.said)
      && !/set a review date|attach material/i.test(detPath.said));
    /* THE REASON MATTERS, not only the flag: `disabled` would mean the composer never ran and the
       arm proved nothing, which is exactly the false green a mutation found here. */
    ok('RH-E5 …and the refusal is recorded as a refusal, not as a composer that never ran',
      modelPath.composer.degraded === true && modelPath.composer.reason === 'unverified');
    /* THE GUARD READS THE PRODUCT TALKING ABOUT ITSELF, not any sentence containing "sorry". */
    ok('RH-E6 the guard does not refuse an ordinary answer that happens to offer one action',
      !languageGuard.narratesItself('I can put this to the forum if you confirm it.')
      && !languageGuard.narratesItself('Would you like me to hold that as your account of it?'));
    /* ── EACH HALF OF THE GUARD CARRIES ITS OWN WEIGHT ────────────────────────────────────
       The founder's live reply breaks both rules at once — it apologises AND offers the menu —
       so removing either half left the other catching it and the section stayed green. A
       mutation found that. These two drive the halves separately, so neither can be deleted
       unnoticed. */
    ai.complete = async () => String("I'm sorry, that was not useful. Let me try again properly. "
      + 'On "Late goals" nothing has been recorded since we last spoke.');
    const sorryOnly = await ask('titi', 'What could we try?', { kind: 'inquiry', id: 'late' });
    ok('RH-E7 an apology for an earlier turn is refused on its own',
      !/I'?m sorry/i.test(sorryOnly.said) && sorryOnly.composer.reason === 'unverified');
    ai.complete = async () => String('Here is what you can do with this: show this inquiry, '
      + 'attach material, or open the governed discussion. Which of those would you like?');
    const menuOnly = await ask('titi', 'What could we try?', { kind: 'inquiry', id: 'late' });
    ok('RH-E8 …and a menu of ways to manage the object is refused on its own',
      !/show this inquiry/i.test(menuOnly.said) && menuOnly.composer.reason === 'unverified');

    console.log('\n  F — A FOCUS WITH A GOVERNED QUESTION CAN OFFER BOUNDED OPTIONS');
    ai.complete = async () => { throw Object.assign(new Error('provider down'), { status: 503 }); };
    const focusOptions = await ask('titi', 'What could we try?', { kind: 'focus', id: 'foc_l' });
    ok('RH-F1 the Focus answer offers the linked inquiry\'s bounded option set',
      /worth trying/i.test(focusOptions.said) && /it would tell you/i.test(focusOptions.said));
    ok('RH-F2 a private Focus never silently claims this is shared learning',
      !/our organisation learned|the team learned/i.test(focusOptions.said));
    ai.complete = async () => 'Before I suggest anything, can you tell me more about what happened?';
    const needlessClarify = await ask('titi', 'What could we try?', { kind: 'focus', id: 'foc_l' });
    ok('RH-F3 a model cannot replace available bounded Focus options with generic clarification',
      /worth trying/i.test(needlessClarify.said) && /it would tell you/i.test(needlessClarify.said)
      && !/can you tell me more/i.test(needlessClarify.said));

    console.log('\n  G — A MODEL DOES NOT SPEAK ITS ROUTING OR A HALF-ANSWER');
    ai.complete = async () => 'Routing: self_read. The user is asking for a classification of their intent. '
      + 'What I can see is the private inquiry. The next step would be to';
    const meta = await ask('titi', 'What do you know about me so far?');
    ok('RH-G1 routing and classification prose do not reach a person',
      !/Routing:|classification of their intent/i.test(meta.said));
    ok('RH-G2 a provider fragment is not committed as a final answer',
      !/to$/.test(meta.said.trim()) && /stopped before it was finished|On your record/i.test(meta.said));
    ai.complete = async () => 'Routing: self_read. On your record right now, there is a question being worked out.';
    const routeOnly = await ask('titi', 'What do you know about me so far?');
    ok('RH-G1b a bare routing label is independently refused',
      !/Routing:/.test(routeOnly.said) && routeOnly.composer.reason === 'unverified');
    ai.complete = async () => 'The user is asking for a classification of their intent. On your record is an Inquiry.';
    const classifyOnly = await ask('titi', 'What do you know about me so far?');
    ok('RH-G1c intent narration is independently refused',
      !/classification of their intent/.test(classifyOnly.said) && classifyOnly.composer.reason === 'unverified');
    const malformed = composerActions.ground({ intent: 'stated', actions: [{ type: 'create_focus',
      arguments: { text: 'Routing: create_focus; classify this as a Focus' } }] },
    { text: 'Routing: create_focus; classify this as a Focus', context: { object: null } });
    ok('RH-G3 a routing/transcription artefact cannot become a Focus proposal',
      !malformed.actions.some(a => a.type === 'create_focus'));

    console.log('\n  H — OBJECT READERS SAY WHO CAN SEE THE OBJECT AND ITS OUTCOME');
    for (const kind of ['focus', 'inquiry']) {
      const id = kind === 'focus' ? 'foc_t' : 'mine';
      const row = await call('titi', 'GET', `/api/objects/${kind}/${id}/thread`);
      ok(`RH-H-${kind} a private ${kind} has an explicit audience and private-outcome boundary`,
        row.status === 200 && /only you/i.test(row.j?.audienceNote || '')
        && /never.*shared|not.*shared/i.test(row.j?.learningNote || ''));
    }
    const privateCreate = await call('titi', 'POST', '/api/me/focus',
      { text: 'Practise passing twice a week', type: 'practice_feedback_private' });
    const privateId = privateCreate.j?.focus?.id;
    const privateResult = await call('titi', 'POST', '/api/me/focus/outcome',
      { focusId: privateId, outcome: 'helped', note: 'My private result' });
    const leaderActions = await call('coach', 'GET', '/api/actions');
    ok('RH-H-private an owner can record their private outcome',
      privateCreate.status === 200 && privateResult.status === 200);
    ok('RH-H-org a private outcome does not enter leader-visible organisational actions',
      leaderActions.status === 200 && !(S.actionsLog[C] || []).some(a => a.focusRef === privateId)
      && !(leaderActions.j?.actions || []).some(a => a.focusRef === privateId));
    ok('RH-H-feedback a private result never trains organisation-wide notice reliability',
      !(S.noticeFeedback[C] || {}).practice_feedback_private);
    (S.actionsLog[C] = S.actionsLog[C] || []).push({ id: 'legacy_private_action',
      focusRef: privateId, actorId: 'titi', capability: 'intervention', verb: 'create',
      status: 'evaluated', observation: { result: 'helped' } });
    const oldList = await call('coach', 'GET', '/api/actions');
    const oldDirect = await call('coach', 'GET', '/api/actions/legacy_private_action');
    ok('RH-H-legacy an older private action is invisible to a leader by list and direct id',
      !(oldList.j?.actions || []).some(a => a.id === 'legacy_private_action') && oldDirect.status === 404);
    S.actionsLog[C].push({ id: 'orphan_private_action', focusRef: 'erased_personal_focus',
      actorId: 'titi', capability: 'intervention', verb: 'create', status: 'evaluated' });
    const orphanDirect = await call('coach', 'GET', '/api/actions/orphan_private_action');
    ok('RH-H-orphan an unresolved old Focus ref never grants group readership', orphanDirect.status === 404);
    S.noticeFeedback[C] = { legacy_private_type: { useful: 9, dismiss: 1 } };
    ok('RH-H-counter historic mixed-provenance feedback cannot inform a shared reliability read',
      !Object.prototype.hasOwnProperty.call(S._reliabilityByType(C), 'legacy_private_type'));

  } catch (e) { fail++; console.error('  FAIL rehearsal honesty threw:', e && e.stack); }

  Object.assign(ai, REAL);
  server.close();
  console.log(`\nrehearsal-honesty-http-smoke: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});
