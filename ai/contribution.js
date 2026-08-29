/* ============================================================
   ai/contribution.js — THE CONTRIBUTION BOUNDARY (pure)

   The missing step between what a person says and what IntelliQ is allowed to treat as evidence
   about a group.

   The kernel is already subject-agnostic: member:<userId> and group:<nodeId> run through the same
   inquiry machinery, the same hypotheses, the same confidence, the same corrections. Nothing here
   reimplements any of that, and it must never start to. What was missing was not intelligence but
   a boundary — and the failure mode it exists to prevent is specific:

     member belongs to U18  →  everything the member says  →  group:u18 evidence

   That is forbidden. Membership is not consent, and it is not relevance either. Someone saying
   "I get nervous before matches" inside a private conversation has told us something about
   themselves; the fact that they happen to be in a squad does not make it the squad's material.

   So two questions are asked separately, because they have different answers:

     RELEVANCE     — is this about the person, the group, or both?
     AUTHORISATION — is this allowed to enter the group subject?

   Collapsing them is the mistake that turns a private remark about the captain into a shared team
   inquiry quoting the speaker. Something can be obviously group-relevant and still not be anyone's
   to publish.

   PURE: imports nothing, no IO. Persistence and routing live at the server edge.
   ============================================================ */

/* ── SCOPE ───────────────────────────────────────────────────────────────────
   What a piece of evidence is ABOUT. Relevance only — it grants nothing. */
const SCOPES = ['SELF_ONLY', 'GROUP_CANDIDATE', 'BOTH', 'NOT_RELEVANT'];

/* ── CANDIDATE LIFECYCLE ─────────────────────────────────────────────────────
   A candidate is a noticing, not a publication. It is private to the person who produced it,
   contributes nothing to group confidence, and is invisible to everyone else until they choose
   to contribute it.

     detected    — the system thinks this might concern the group. Nobody else can see it.
     contributed — the person deliberately offered it. Now it is group material.
     admitted    — it met the opening rule and is in the group inquiry.
     dismissed   — the person said no. It does not come back.
     expired     — nobody acted, and a stale suggestion is worse than none. */
const CANDIDATE_STATES = ['detected', 'contributed', 'admitted', 'dismissed', 'expired'];

/* How long an unactioned candidate stands. Deliberately local to this boundary rather than a
   platform retention policy: an unanswered suggestion going quiet is a UX property, not a legal
   one. Fourteen days is about a fortnight of sessions — long enough to come back to after a
   holiday, short enough that a stale prompt does not resurface about a match nobody remembers. */
const CANDIDATE_TTL_MS = 14 * 86400000;

/* ── WHO MAY PUT SOMETHING INTO A GROUP ──────────────────────────────────────
   Deliberately three coarse bands rather than a permission system. The architecture already
   knows who leads a node and who belongs to it; this reads that, it does not replace it. */
const CONTRIBUTOR_ROLES = ['member', 'leader', 'system'];

/* ── COLLECTIVE LANGUAGE ─────────────────────────────────────────────────────
   A deliberately narrow grammatical test: does this sentence make a claim about a collective at
   all? It is NOT an attempt to understand the sentence — that lesson was learned when a ~40-stem
   lexicon decided "struggling with my first touch" meant support_need and destroyed the
   information before anything could reason over it.

   The distinction matters. This lexicon extracts no meaning and creates no belief. It answers one
   grammatical question — first person plural or collective noun, versus first person singular —
   and its only power is to REFUSE. A model may propose that something concerns the group; without
   collective language actually present in the person's own words, that proposal is declined and
   the evidence stays Self. It can only ever make the system quieter. */
const COLLECTIVE = /\b(we|we're|weve|we've|our|ours|us|the team|the squad|the group|the side|the class|the department|the lads|everyone|everybody|nobody|no one|the boys|the girls|as a team|each other|one another)\b/i;
const FIRST_PERSON = /\b(i|i'm|im|i've|ive|my|mine|me|myself)\b/i;

/* ── 1. RELEVANCE ────────────────────────────────────────────────────────────
   Is this about the person, the group, or both?

   The model may propose. The kernel decides what the proposal is worth, and the conservative
   direction is the only one that is free: a claim of group relevance must be corroborated by
   collective language in what the person ACTUALLY SAID, quoted verbatim in the source span. A
   model deciding on its own that a private remark concerns the team is exactly the judgement it
   should not be making unilaterally, because the cost of it being wrong is someone's private
   sentence becoming team material.

   Returns { scope, reason, groupLanguage } — never a permission. */
function classifyScope(proposal = {}, { nodeId = null } = {}) {
  const said = String(proposal.sourceSpan || proposal.text || '');
  const claimed = String(proposal.concerns || '').toLowerCase();
  const collective = COLLECTIVE.test(said);
  const personal = FIRST_PERSON.test(said);

  if (!nodeId) return { scope: 'SELF_ONLY', reason: 'no group in scope', groupLanguage: collective };

  // An interpretation or hypothesis is the system's own wording, not the person's, so it cannot
  // be the thing that authorises group relevance. Only what they actually said can do that.
  if (proposal.level && proposal.level !== 'observation') {
    return { scope: 'SELF_ONLY', reason: 'not an observation — only what was said can concern a group', groupLanguage: collective };
  }

  if (claimed === 'group' || claimed === 'both') {
    if (!collective) {
      // The model saw a group; the sentence does not contain one. Decline, quietly and safely.
      return { scope: 'SELF_ONLY', reason: 'claimed group relevance without collective language in their own words', groupLanguage: false };
    }
    return {
      scope: claimed === 'both' || personal ? 'BOTH' : 'GROUP_CANDIDATE',
      reason: 'collective language present and group relevance proposed',
      groupLanguage: true,
    };
  }

  if (claimed === 'self') return { scope: 'SELF_ONLY', reason: 'proposed as personal', groupLanguage: collective };
  // Nothing claimed. Collective language alone is a noticing, never a conclusion — and it stays
  // SELF_ONLY unless something says otherwise, because silence must not publish.
  return { scope: 'SELF_ONLY', reason: 'no scope proposed', groupLanguage: collective };
}

/* ── 2. AUTHORISATION ────────────────────────────────────────────────────────
   Entirely separate from relevance, and it never consults it. "Is this about the group?" and
   "may this enter the group?" are different questions with different answers, and the whole
   privacy model rests on their not being the same function.

   Three things must hold: the contributor is really in this node, the material came from them,
   and they asked for it. Nothing here is inferred from membership. */
function mayContribute({ actorId, ownerId, role = 'member', inNode = false, leadsNode = false, explicit = false } = {}) {
  if (!actorId) return { allowed: false, reason: 'no actor' };
  if (!inNode && !leadsNode && role !== 'system') {
    return { allowed: false, reason: 'contributor does not belong to this node' };
  }
  // Evidence belongs to whoever produced it. A leader may lead the node and still not get to
  // publish a member's private remark on their behalf — leadership governs the group, not the
  // contents of somebody else's conversation.
  if (ownerId && ownerId !== actorId && role !== 'system') {
    return { allowed: false, reason: 'only the person whose evidence this is may contribute it' };
  }
  if (!explicit) return { allowed: false, reason: 'contribution must be deliberate, never automatic' };
  return { allowed: true, reason: leadsNode ? 'node leader contributing their own account' : 'member contributing their own account' };
}

/* ── 3. THE CANDIDATE ────────────────────────────────────────────────────────
   Detected, private, and inert. It records WHY the system thought this concerned the group, so
   the decision is inspectable rather than a vibe, and it carries the origin of the evidence it
   came from so that contributing later cannot launder a retelling into an observation. */
function newCandidate({ id, orgCode, nodeId, contributorId, concept, label = '', evidenceRef,
                        originRef = null, originKind = 'unknown', occasion = null, scope = 'GROUP_CANDIDATE',
                        reason = '', authority = 'self_report', now = Date.now() } = {}) {
  return {
    candidateId: String(id || `gc_${now}`),
    orgCode: String(orgCode || ''),
    nodeId: String(nodeId || ''),
    contributorId: String(contributorId || ''),
    concept: String(concept || ''),
    label: String(label || concept || ''),
    // A REFERENCE to the member's evidence, never a copy of it. The same discipline the inquiry
    // kernel holds: nothing here carries a person's words, so nothing here can leak them.
    evidenceRef: String(evidenceRef || ''),
    originRef: originRef ? String(originRef) : null,
    originKind: String(originKind || 'unknown'),
    occasion: occasion ? String(occasion) : null,
    authority: String(authority || 'self_report'),
    scope: SCOPES.includes(scope) ? scope : 'GROUP_CANDIDATE',
    status: 'detected',
    reason: String(reason || '').slice(0, 300),
    createdAt: now,
    expiresAt: now + CANDIDATE_TTL_MS,
    contributedAt: null,
    admittedAt: null,
  };
}

/* Candidates that nobody acted on stop being suggestions. Pure — returns the list to keep. */
function expireCandidates(list = [], now = Date.now()) {
  return (Array.isArray(list) ? list : []).map(c =>
    (c && c.status === 'detected' && c.expiresAt && c.expiresAt < now) ? { ...c, status: 'expired' } : c);
}

/* ── 4. THE OPENING RULE ─────────────────────────────────────────────────────
   When does contributed material become a group inquiry?

   Not on one person's say-so. "Training felt flat" from a single member is a real thing to have
   said and a bad reason to open a team-level line of inquiry that then accumulates evidence and
   grows confident. A group inquiry asserts that something is worth understanding ABOUT THE GROUP,
   and that claim needs more behind it than one voice.

   The rule is deliberately expressed in the epistemic vocabulary that already exists, not a new
   one — INDEPENDENT ORIGINS, not contributors. This is the whole point: five teammates repeating
   what the captain said are five contributors and one origin, and if contributors were the unit
   of measure, a room agreeing with itself would open an inquiry and then confirm it.

   Three ways in, all explainable:
     · two independent origins from two different people — genuine corroboration;
     · one authoritative source — a coach's assessment, an import, a system-derived record, which
       carries authority a self-report does not and does not need a second voice to be worth
       looking at;
     · a node leader deliberately opening it, which is a human taking responsibility. */
const MIN_INDEPENDENT_ORIGINS = 2;

function shouldOpenGroupInquiry(contributions = [], { now = Date.now() } = {}) {
  const live = (Array.isArray(contributions) ? contributions : [])
    .filter(c => c && (c.status === 'contributed' || c.status === 'admitted'));

  if (!live.length) return { open: false, reason: 'nothing contributed', contributors: 0, independentOrigins: 0 };

  const contributors = new Set(live.map(c => c.contributorId));
  // Origins, not contributors. A contribution with no established origin cannot count toward
  // independence — the same conservatism the confidence layer applies, for the same reason.
  const origins = new Set(live.filter(c => c.originRef).map(c => c.originRef));
  const authoritative = live.filter(c => c.authority === 'authoritative');
  const byLeader = live.filter(c => c.contributorRole === 'leader' && c.explicitOpen);

  const facts = {
    contributors: contributors.size,
    independentOrigins: origins.size,
    authorities: authoritative.length,
  };

  if (byLeader.length) {
    return { open: true, rule: 'LEADER_OPENED', reason: 'a node leader deliberately opened this', ...facts };
  }
  if (authoritative.length) {
    return { open: true, rule: 'AUTHORITATIVE_SOURCE', reason: 'an authoritative account of the group', ...facts };
  }
  if (origins.size >= MIN_INDEPENDENT_ORIGINS && contributors.size >= 2) {
    return { open: true, rule: 'INDEPENDENT_CORROBORATION',
      reason: `${origins.size} independent origins from ${contributors.size} people`, ...facts };
  }
  // The case worth naming explicitly, because it is the one that looks like agreement.
  if (contributors.size >= MIN_INDEPENDENT_ORIGINS && origins.size < MIN_INDEPENDENT_ORIGINS) {
    return { open: false, rule: 'ECHO',
      reason: `${contributors.size} people, but ${origins.size || 'no'} independent origin${origins.size === 1 ? '' : 's'} — repetition, not corroboration`,
      ...facts };
  }
  return { open: false, rule: 'BELOW_THRESHOLD',
    reason: `needs ${MIN_INDEPENDENT_ORIGINS} independent origins, an authoritative account, or a leader opening it`, ...facts };
}

/* ── 5. CROSSING THE BOUNDARY ────────────────────────────────────────────────
   Turn a contribution into a proposal the EXISTING kernel can apply. It builds no hypotheses,
   computes no confidence and decides nothing — applyProposals does all of that, exactly as it
   does for a member.

   ORIGIN SURVIVES INTACT. Nothing here mints a new originRef: if the material was a retelling
   when it was a member's, it is a retelling when it is the group's. Contribution is a change of
   audience, not a change of what the evidence is based on, and inventing independence at this
   boundary would undo the entire previous checkpoint in one line. */
function toGroupProposal(contribution = {}, { now = Date.now() } = {}) {
  const c = contribution;
  return {
    id: c.evidenceRef,
    level: 'observation',
    // The concept, not the person's words. The kernel stores refs, so the group inquiry never
    // holds a verbatim span — which is what makes "no private text can reach a group read" a
    // property of the structure rather than a rule someone has to remember.
    text: c.label || c.concept,
    sourceSpan: null,
    concept: c.concept,
    domainConcept: c.concept,
    // Provenance, carried across unchanged.
    source: c.contributorId,
    originRef: c.originRef,
    originKind: c.originKind,
    turnId: c.occasion || c.evidenceRef,
    authority: c.authority || 'self_report',
    directness: c.originKind === 'reported' ? 'inferred' : 'direct',
    specificity: typeof c.specificity === 'number' ? c.specificity : 0.6,
    contributedBy: c.contributorId,
    contributedAt: c.contributedAt || now,
    contributorRole: c.contributorRole || 'member',
    // Whether the contributor is named to other members, or the account stands without them.
    contributorVisibility: c.contributorVisibility === 'named' ? 'named' : 'anonymous',
    // Contributions are never verbatim: the group holds the claim and a reference, not the text.
    verbatim: false,
    fromSubject: c.fromSubject || null,
  };
}

/* Withdrawing what you contributed. The group signal is superseded by the same machinery a
   member's own correction uses — nothing is deleted, and the record still explains what was
   believed and why it stopped being believed. */
function withdrawalProposal(contribution = {}, { reason = '', now = Date.now() } = {}) {
  return {
    id: `${contribution.evidenceRef}_withdrawn`,
    level: 'observation',
    text: contribution.label || contribution.concept,
    concept: contribution.concept,
    domainConcept: contribution.concept,
    source: contribution.contributorId,
    originRef: contribution.originRef,
    originKind: contribution.originKind,
    turnId: `withdraw_${now}`,
    authority: contribution.authority || 'self_report',
    corrects: [contribution.evidenceRef],
    withdraws: true,
    correctionReason: String(reason || 'withdrawn by the contributor').slice(0, 300),
  };
}

module.exports = {
  SCOPES, CANDIDATE_STATES, CONTRIBUTOR_ROLES, CANDIDATE_TTL_MS, MIN_INDEPENDENT_ORIGINS,
  classifyScope, mayContribute, newCandidate, expireCandidates,
  shouldOpenGroupInquiry, toGroupProposal, withdrawalProposal,
};
