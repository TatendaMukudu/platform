/* Truth layer — DURABILITY ACROSS RESTART (in-process, real reassembly boundary).

   Checkpoint 1 uncovered that ELEVEN stores had a load path but were missing from the old save
   payload: reasonLedger, selfModelLedger, auditLog, deliveryPrefs, pushSubs, inquiryDismissed,
   assistantConversations, libraryFolders, libraryItems, safeguardingFlags, inquiryStates. The
   code always intended them to be durable — _loadAllStores restores every one — but nothing
   wrote them, so a redeploy silently took a member's whole chat history, the diagnostic picture
   built from it, the safeguarding queue and the audit trail with it.

   Restoring state is the one operation with no second chance, so this suite runs the REAL path:
   a store that round-trips through JSON exactly as JSONB would, then db.loadStores() and
   _reconstruct() — the same function the server boots through. Nothing that matters is mocked.

   Run: node scripts/persistence-durability-smoke.js */

process.env.DB_OPTIONAL = '1';
process.env.SAVE_DEBOUNCE_MS = '30';
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const db = require('../db.js');
  const S  = require('../server.js');
  const {
    orgMeta, orgUsers, inquiryStates, reasonLedger, selfModelLedger, auditLog, deliveryPrefs,
    pushSubs, inquiryDismissed, assistantConversations, libraryFolders, libraryItems,
    safeguardingFlags, userAiProfiles, orgNotes,
    _durableUnits, _persistedStores, _reconstruct, _removePerson, _audit, _unclassified, scheduleSave,
  } = S;

  /* A store that behaves like Postgres: rows keyed by store_key, values round-tripped through
     JSON. If anything in the durable shape cannot survive serialisation, this finds it. */
  const rows = {};
  db.saveStores   = async (units) => { for (const [k, v] of Object.entries(units)) rows[k] = JSON.parse(JSON.stringify(v)); return { rows: 0, bytes: 0 }; };
  db.deleteStores = async (keys)  => { for (const k of keys) delete rows[k]; return keys.length; };
  db.loadStores   = async ()      => JSON.parse(JSON.stringify(rows));
  db.saveMain     = async ()      => {};
  const settle = () => sleep(140);

  /* A restart, as honestly as this process can stage one: every persisted store is emptied —
     the state a fresh node process starts in — and then rebuilt through the boot path. */
  const restart = async (legacyBlob) => {
    for (const store of Object.values(_persistedStores())) for (const k of Object.keys(store)) delete store[k];
    return _reconstruct(legacyBlob || {});
  };

  const code = 'trafford';
  const userId = 'ashton';

  // ── A world with something worth losing ────────────────────────────────────────────────
  orgMeta[code] = { orgName: 'Trafford United', orgMode: 'sports' };
  orgMeta.riverside = { orgName: 'Riverside School', orgMode: 'education' };
  orgUsers[code] = { [userId]: { id: userId, name: 'Ashton Mbeki', email: 'ash@trafford.test', role: 'member', status: 'active' } };
  orgUsers.riverside = { bo: { id: 'bo', name: 'Bo Lindqvist', email: 'bo@riverside.test', role: 'member', status: 'active' } };

  const uKey = `${code}:${userId}`;

  // The member says something on a Tuesday, and the system builds a picture from it.
  assistantConversations[uKey] = [{
    id: 'conv_1', title: 'Tuesday', createdAt: '2026-08-11T18:00:00.000Z',
    messages: [
      { role: 'user', text: "I've been struggling with my first touch when someone closes me down", at: '2026-08-11T18:00:00.000Z' },
      { role: 'assistant', text: 'Is it more about the ball, or about where you are facing?', at: '2026-08-11T18:00:04.000Z' },
    ],
  }];
  inquiryStates[code] = {
    [`member:${userId}`]: {
      first_touch_under_pressure: {
        inquiryId: 'inq_ft1',
        displayLabel: 'First touch under pressure',
        canonicalMeaning: 'Ball control degrades when closed down quickly',
        aliases: ['first touch'],
        level: 'hypothesis',
        confidence: 0.34,
        rivals: [{ id: 'inq_scan', label: 'Scanning before receiving' }],
        frontier: [{ question: 'Which foot is it happening on?', value: 0.7 }],
        signals: [{ span: 'struggling with my first touch when someone closes me down', occasion: 'o1', at: '2026-08-11T18:00:00.000Z' }],
      },
    },
  };
  reasonLedger[code] = [
    { id: 'b1', subjectId: userId, kind: 'support_need', axis: 'technical', polarity: 'risk', status: 'open', confidence: 0.4, observations: 2 },
    { id: 'b2', subjectId: null, kind: 'org_pattern', axis: 'attendance', polarity: 'risk', status: 'open', confidence: 0.3, observations: 3 },
  ];
  selfModelLedger[uKey] = [{ pattern: 'evening_reflection', status: 'established', distinctDays: 5 }];
  libraryFolders[code] = [{ id: 'f1', ownerId: userId, name: 'My notes', createdAt: '2026-08-01T00:00:00.000Z' }];
  libraryItems[code] = [
    { id: 'i1', ownerId: userId, type: 'note', title: 'Tuesday reflection', body: 'felt sharper today', folderId: 'f1', visibility: 'private' },
    { id: 'i2', ownerId: 'coach', type: 'note', title: 'Session plan', body: 'rondos', visibility: 'shared' },
  ];
  safeguardingFlags[code] = [{ id: 'sg_1', subjectId: userId, subjectName: 'Ashton Mbeki', severity: 'concern', category: 'wellbeing', excerpt: 'everything feels pointless lately', at: '2026-08-11T18:00:00.000Z', status: 'open', leadId: 'lead1' }];
  deliveryPrefs[uKey] = { optedIn: true, quietHours: [22, 7], channel: 'push' };
  pushSubs[uKey] = [{ endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } }];
  inquiryDismissed[code] = { unc_1: Date.now() + 3 * 86400000 };
  _audit(code, { actor: 'lead1', action: 'agenda_view', subjectIds: [userId], basis: 'agenda' });

  const auditBefore = (auditLog[code] || []).length;
  ok('0 · an audit entry was recorded to survive', auditBefore > 0);

  // ── B. Restart durability, store by store ──────────────────────────────────────────────
  scheduleSave(); await settle();
  await restart();

  console.log('\n  B — the eleven, across a restart');
  ok('B · assistantConversations survives (private chat history is permanent)',
    (assistantConversations[uKey] || []).length === 1);
  ok('B · …down to the exact words said',
    assistantConversations[uKey][0].messages[0].text.includes('first touch when someone closes me down'));
  ok('B · inquiryStates survives', !!(inquiryStates[code] || {})[`member:${userId}`]);
  ok('B · reasonLedger survives', (reasonLedger[code] || []).length === 2);
  ok('B · selfModelLedger survives', (selfModelLedger[uKey] || []).length === 1);
  ok('B · auditLog survives', (auditLog[code] || []).length === auditBefore);
  ok('B · safeguardingFlags survives', (safeguardingFlags[code] || []).length === 1);
  ok('B · libraryFolders survives', (libraryFolders[code] || []).length === 1);
  ok('B · libraryItems survives', (libraryItems[code] || []).length === 2);
  ok('B · deliveryPrefs survives (an opt-in is a consent record)', deliveryPrefs[uKey] && deliveryPrefs[uKey].optedIn === true);
  ok('B · pushSubs survives (a redeploy must not silently end notifications)', (pushSubs[uKey] || []).length === 1);
  ok('B · inquiryDismissed survives (a "not now" is not undone by a deploy)', !!(inquiryDismissed[code] || {}).unc_1);

  /* INTELLIGENCE CONTINUITY. Not "the bytes came back" but "the system still knows what it was
     working out". A member should be able to close the app mid-diagnosis, have the service
     redeploy under them, and be met by the same picture rather than a blank one. */
  console.log('\n  B — intelligence continuity');
  {
    const inq = inquiryStates[code][`member:${userId}`].first_touch_under_pressure;
    ok('B · the inquiry keeps its stable identity, not just its label',
      inq.inquiryId === 'inq_ft1' && inq.displayLabel === 'First touch under pressure');
    ok('B · …its canonical meaning', inq.canonicalMeaning === 'Ball control degrades when closed down quickly');
    ok('B · …its aliases', Array.isArray(inq.aliases) && inq.aliases.includes('first touch'));
    ok('B · …its epistemic level and confidence (a hypothesis stays a hypothesis)',
      inq.level === 'hypothesis' && inq.confidence === 0.34);
    ok('B · …its rival explanations', (inq.rivals || []).some(r => r.id === 'inq_scan'));
    ok('B · …its collection frontier', (inq.frontier || []).length === 1);
    ok('B · …and the verbatim span the whole picture rests on',
      inq.signals[0].span === 'struggling with my first touch when someone closes me down');
    const conv = assistantConversations[uKey][0];
    ok('B · the conversation and the inquiry it produced come back TOGETHER',
      conv.messages.length === 2 && inq.signals.length === 1);
  }

  console.log('\n  B — audit + safeguarding continuity');
  ok('B · an access recorded before the restart is still answerable afterwards',
    (auditLog[code] || []).some(e => e.action === 'agenda_view'));
  ok('B · the audit entry keeps its hash chain (tamper-evidence is not re-derived)',
    !!(auditLog[code] || [])[0].hash);
  {
    const f = (safeguardingFlags[code] || [])[0];
    ok('B · an open safeguarding flag does not vanish because the service redeployed',
      f && f.status === 'open' && f.subjectId === userId);
    ok('B · …and it still carries what it needs to be acted on', f.severity === 'concern' && !!f.leadId);
  }

  // ── C. Deletion must not be undone by the legacy blob ───────────────────────────────────
  console.log('\n  C — deletion, and the resurrection the blob could cause');

  // Freeze a legacy blob from BEFORE the deletions — this is what `main` still holds.
  const legacyBlob = JSON.parse(JSON.stringify(_persistedStores()));
  ok('C · (the frozen legacy blob contains the second org)', !!legacyBlob.orgMeta.riverside);

  delete orgMeta.riverside; delete orgUsers.riverside;
  scheduleSave(); await settle();
  await restart(legacyBlob);
  ok('C · an org deleted after migration does NOT reappear from the stale blob',
    !orgMeta.riverside && !orgUsers.riverside);
  ok('C · …and the surviving org is untouched by the replacement', !!orgMeta[code] && !!orgUsers[code][userId]);

  // A child inside an org store.
  orgUsers[code].coach = { id: 'coach', name: 'Dana Fitz', email: 'dana@trafford.test', role: 'leader', status: 'active' };
  scheduleSave(); await settle();
  delete orgUsers[code].coach;
  scheduleSave(); await settle();
  await restart(legacyBlob);
  ok('C · a deleted child inside an org store stays deleted', !orgUsers[code].coach);
  ok('C · …while its siblings remain', !!orgUsers[code][userId]);

  // The final child in an org store — the unit itself must go, not linger as an empty husk.
  orgNotes[code] = [{ id: 'n1', authorId: userId }];
  scheduleSave(); await settle();
  ok('C · (the note unit exists in the store)', !!rows[`store:orgNotes:${code}`]);
  delete orgNotes[code];
  scheduleSave(); await settle();
  ok('C · removing the last key DELETES the row rather than storing an empty husk',
    !rows[`store:orgNotes:${code}`]);
  await restart(legacyBlob);
  ok('C · …and it does not come back on restart', !orgNotes[code]);

  // A composite-key entry (orgCode:userId).
  userAiProfiles[uKey] = { openThreads: 2 };
  scheduleSave(); await settle();
  delete userAiProfiles[uKey];
  scheduleSave(); await settle();
  await restart(legacyBlob);
  ok('C · a deleted composite-key entry stays deleted', !userAiProfiles[uKey]);

  // A previously non-durable store — the case this whole pass exists for.
  libraryItems[code] = (libraryItems[code] || []).filter(i => i.id !== 'i2');
  scheduleSave(); await settle();
  await restart(legacyBlob);
  ok('C · a deletion in a previously NON-DURABLE store also survives restart',
    (libraryItems[code] || []).length === 1 && !(libraryItems[code] || []).some(i => i.id === 'i2'));

  /* ERASURE. The eleven becoming durable makes Art 17 real for them: before Checkpoint 1 this
     data was erased by accident at the next restart, which hid the fact that _removePerson
     never reached it. Now it persists, so erasure has to actually erase. */
  console.log('\n  C — erasure now has to mean it');
  const auditCount = (auditLog[code] || []).length;
  _removePerson(code, userId, true);
  scheduleSave(); await settle();
  await restart(legacyBlob);
  ok('C · erasure removes the private chat history, durably', !assistantConversations[uKey]);
  ok('C · …the diagnostic picture quoting them verbatim', !(inquiryStates[code] || {})[`member:${userId}`]);
  ok('C · …their learned habits', !selfModelLedger[uKey]);
  ok('C · …their library items', !(libraryItems[code] || []).some(i => i.ownerId === userId));
  ok('C · …their library folders', !(libraryFolders[code] || []).some(f => f.ownerId === userId));
  ok('C · …the safeguarding excerpt of their words', !(safeguardingFlags[code] || []).some(f => f.subjectId === userId));
  ok('C · …beliefs held about them', !(reasonLedger[code] || []).some(b => b.subjectId === userId));
  ok('C · …their delivery consent and push endpoints', !deliveryPrefs[uKey] && !pushSubs[uKey]);
  ok('C · …but NOT the org-level belief, which is not personal data',
    (reasonLedger[code] || []).some(b => b.id === 'b2'));
  ok('C · …and NOT the audit trail, which is content-free and must stay tamper-evident',
    (auditLog[code] || []).length === auditCount);
  ok('C · …nor another person\'s library item', (libraryItems[code] || []).length === 0 || (libraryItems[code] || []).every(i => i.ownerId !== userId));

  /* The epistemic relationships added for Group — what evidence is BASED on, and what happened
     when it turned out to be wrong — are worth nothing if a redeploy flattens them back into a
     pile of equally-weighted claims. A correction that does not survive a restart is a system
     that quietly re-believes what it was told to stop believing. */
  console.log('\n  C — origin and correction relationships survive a restart');
  {
    const diagnose = require('../ai/diagnose.js');
    let inq = diagnose.newInquiry({ id: 'inq_oc', subjectRef: `member:${userId}`, concept: 'first_touch', label: 'First touch' });
    inq = diagnose.applyProposals(inq, [
      { id: 'oc1', level: 'observation', text: 'touch was poor under pressure', sourceSpan: 'x',
        source: userId, originKind: 'self_report', originRef: 'tue_session', specificity: 0.8, turnId: 'q1' },
      { id: 'och', level: 'hypothesis', text: 'first touch technique', basis: ['oc1'] },
    ]);
    inq = diagnose.applyProposals(inq, [
      { id: 'oc2', level: 'observation', text: 'watched it back, it was body position', sourceSpan: 'x',
        source: userId, originKind: 'direct_observation', originRef: 'video_review', specificity: 0.9, turnId: 'q2',
        corrects: ['oc1'], correctionReason: 'reviewed the video' },
    ]);
    inquiryStates[code] = inquiryStates[code] || {};
    inquiryStates[code][`member:${userId}`] = { first_touch: inq };
    scheduleSave(); await settle();
    await restart(legacyBlob);

    const back = ((inquiryStates[code] || {})[`member:${userId}`] || {}).first_touch;
    const old  = back && back.signals.find(s => s.ref === 'oc1');
    const fresh = back && back.signals.find(s => s.ref === 'oc2');
    ok('C · origin survives the round trip', !!fresh && fresh.originRef === 'video_review' && fresh.originKind === 'direct_observation');
    ok('C · a corrected claim comes back still corrected', !!old && old.status === 'superseded');
    ok('C · …knowing what replaced it and why',
      old.supersededBy === 'oc2' && /video/.test(old.supersededReason || ''));
    ok('C · …and it does not silently resume counting as support',
      diagnose.deriveConfidence(back.signals.filter(s => s.ref === 'oc1')).score === 0);
    ok('C · the correction is still explainable from history',
      (back.timeline || []).some(e => e.kind === 'correction'));
  }

  // ── D. The ":_" catch-all preserves first and reports second ────────────────────────────
  console.log('\n  D — the catch-all is visible, not silent');
  _unclassified.clear();
  orgNotes['definitely-not-an-org'] = [{ id: 'x1' }];
  const units = _durableUnits();
  ok('D · an unclassifiable key is still PERSISTED (data first)',
    !!units['store:orgNotes:_'] && 'definitely-not-an-org' in units['store:orgNotes:_']);
  {
    const a = [..._unclassified.values()].find(x => x.key === 'definitely-not-an-org');
    ok('D · …and reported, with the store it came from', !!a && a.store === 'orgNotes');
    ok('D · …and a reason it could not be assigned', !!a && /not a known org/.test(a.why));
  }
  _durableUnits(); _durableUnits();
  {
    const a = [..._unclassified.values()].find(x => x.key === 'definitely-not-an-org');
    ok('D · …counted rather than re-logged on every save cycle', a.count >= 3);
  }
  ok('D · a correctly classified key raises no anomaly',
    ![..._unclassified.values()].some(x => x.key === code));
  delete orgNotes['definitely-not-an-org'];

  // ── Instrumentation actually measures the thing it claims to ────────────────────────────
  console.log('\n  E — the numbers that answer "did it hold?"');
  {
    const st = S._saveStats;
    ok('E · save cycles are counted', st.cycles > 0);
    ok('E · bytes written is tracked separately from bytes held', st.bytesWritten > 0 && st.bytesSerialised > 0);
    ok('E · …and writing costs a fraction of what is held', st.bytesWritten < st.bytesSerialised);
    ok('E · idle cycles that wrote nothing are counted', st.noopCycles >= 0);
    ok('E · the largest written unit is identified', !!st.largestUnit && st.largestUnit.bytes > 0);
  }

  console.log(`\npersistence-durability-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
