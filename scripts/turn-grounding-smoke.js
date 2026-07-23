/* Truth layer — GROUNDED CONVERSATIONAL TURN.

   Proves POST /api/assistant/turn answers questions from AUTHORISED canonical
   evidence through the SAME grounded boundary as every other question path
   (_assistantAnswer → _retrieveGrounding), while capture behaviour is unchanged and
   the privacy boundary holds BEFORE ranking. Extends the leak matrix to the turn:
   excluded evidence must never enter ranking, synthesis, citations, or wording — for
   any unauthorised audience. Boots the real app (DB_OPTIONAL, no AI key). Hermetic.
   Run:  node scripts/turn-grounding-smoke.js   (part of `npm test`) */

process.env.DB_OPTIONAL = '1';
process.env.NODE_ENV    = 'test';

const S = require('../server.js');
const { app, _loadAllStores, _rebuildEmailIndex, issueToken, _captureKnowledge, _assistantAnswer, evidenceLog } = S;

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n); } };

const A = 'orga', iso = new Date().toISOString();
_loadAllStores({
  orgMeta:  { [A]: { orgName: 'A', createdAt: iso } },
  orgUsers: { [A]: {
    coach: { id: 'coach', name: 'Coach', role: 'superadmin', orgCode: A, supervisorId: null,   status: 'active' },
    mia:   { id: 'mia',   name: 'Mia',   role: 'member',     orgCode: A, supervisorId: 'coach', status: 'active' },
    sam:   { id: 'sam',   name: 'Sam',   role: 'member',     orgCode: A, supervisorId: 'coach', status: 'active' },
  } },
});
_rebuildEmailIndex();

const countEvidence = () => (evidenceLog[A] || []).filter(e => e.status === 'active').length;

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const tok = { coach: issueToken('coach', A, 'superadmin'), mia: issueToken('mia', A, 'member'), sam: issueToken('sam', A, 'member') };
  const turn = async (who, text) => {
    const r = await fetch(base + '/api/assistant/turn', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok[who]}` }, body: JSON.stringify({ text }) });
    const raw = await r.text(); let j = null; try { j = JSON.parse(raw); } catch (_) {}
    return { status: r.status, j, raw };
  };

  try {
    // ── seed evidence THROUGH the turn (proves capture + grounding share one door) ──
    await turn('coach', 'Add this to our organisation knowledge: our high press works from a 4-3-3 and we press hard on the goalkeeper.');
    await turn('mia',   'Remember this: my knee has been sore after every training session lately.');   // private
    await turn('sam',   'Remember this: I am seriously thinking about quitting the team next season.');  // private

    // 1 · grounded answer THROUGH the turn + 2 · citations
    {
      const q = await turn('coach', 'how does our high press work');
      ok('1 · the turn answers from authorised org evidence', q.j.response.qa && /high press|goalkeeper|4-3-3/i.test(q.j.response.qa.answer));
      ok('2 · the grounded turn answer carries citations', q.j.response.qa && q.j.response.qa.cites.length > 0 && q.j.response.qa.citations.length > 0);
      ok('2 · citations expose a safe label, not internals', q.j.response.qa.citations.every(c => 'label' in c && !('scores' in c) && !('vector' in c)));
    }

    // 3 · a member can retrieve their OWN private evidence
    {
      const q = await turn('mia', 'what did I say about my sore knee');
      ok('3 · the owner can query their own private note', q.j.response.qa && /knee|sore/i.test(q.j.response.qa.answer));
    }

    // 4 · another member CANNOT see it — not in answer, not in citations, no hint
    {
      const q = await turn('sam', 'is Mia struggling with a sore knee injury');
      // Inspect ONLY the grounded answer surface (answer + citations + limitations) —
      // NOT the composer's privacyNotice, which is about Sam's OWN input, not Mia's data.
      const ans = q.j.response.qa || {};
      const answerSurface = JSON.stringify({ answer: ans.answer, citations: ans.citations, cites: ans.cites, limitations: ans.limitations });
      ok('4 · a member’s private note never reaches another member', !/sore|knee/i.test(ans.answer || ''));
      ok('4 · no citation and no hint that private evidence exists', !/private|hidden|restricted|not authorised|sore|knee/i.test(answerSurface));
    }

    // 5 · a LEADER cannot see a member’s private note via a general turn
    {
      const q = await turn('coach', 'is Sam thinking about quitting the team');
      ok('5 · a member’s private note never reaches a leader (general turn)', !/quit|quitting/i.test(q.j.response.qa ? q.j.response.qa.answer : ''));
      ok('5 · leader turn cites none of the member private evidence', !q.j.response.qa || (q.j.response.qa.cites || []).length === 0);
    }

    // 6 · organisation-shared evidence IS available to a member by role
    {
      const q = await turn('mia', 'how does our high press work');
      ok('6 · org-shared evidence is available to a member', q.j.response.qa && /high press|goalkeeper/i.test(q.j.response.qa.answer));
    }

    // 7 · authority ordering + 8 · privacy outranks authority
    {
      await turn('coach', 'Add this to our organisation knowledge: the cup final kickoff is at 3pm.');   // authoritative
      await turn('mia',   'Add this to our organisation knowledge: I think the cup final kickoff is at 5pm.'); // shared-unverified
      const g = _assistantAnswer(A, 'coach', 'what time is the cup final kickoff');
      ok('7 · the authoritative org record leads the grounded answer', /3pm|3 pm/i.test(g.answer) && g.answer.indexOf('3') < (g.answer.indexOf('5') === -1 ? Infinity : g.answer.indexOf('5')));
      // privacy still outranks authority: Sam's private stays invisible to the coach even though it is highly relevant
      const q = await turn('coach', 'who wants to quit the team next season');
      ok('8 · privacy outranks authority — a relevant private note is still excluded for a leader', !/quit/i.test(q.j.response.qa ? q.j.response.qa.answer : ''));
    }

    // 9 · no authorised evidence → honest, no fabrication, no hint
    {
      const q = await turn('mia', 'what is the away travel plan for the european tour');
      ok('9 · honest insufficient-evidence answer (no fabrication)', q.j.response.qa && /don't have enough authorised|not enough/i.test(q.j.response.qa.answer) && q.j.response.qa.confidence === 'none');
      ok('9 · the no-evidence answer hints nothing about inaccessible evidence', !/private|hidden|restricted/i.test(JSON.stringify(q.j.response.qa)));
    }

    // 10 · malformed evidence record resilience — one bad row must not crash the turn
    {
      (evidenceLog[A] = evidenceLog[A] || []).push({ id: 'bad_1', orgCode: A, status: 'active', provider: 'import', source: 'reported', type: 'document', /* no valueText, no attributes */ visibility: 'normal', promoted: true, ownerRef: 'coach' });
      const q = await turn('coach', 'how does our high press work');
      ok('10 · a malformed evidence row does not break the grounded turn', q.status === 200 && q.j.ok === true && q.j.response.qa);
      evidenceLog[A] = evidenceLog[A].filter(e => e.id !== 'bad_1');
    }

    // 11 · capture-only turn stays capture-only (saved, no answer)
    {
      const before = countEvidence();
      const q = await turn('coach', 'Add this to our organisation knowledge: the club AGM is on the last Friday of June.');
      ok('11 · an explicit org command saves (authoritative) and produces NO answer', q.j.saved && q.j.saved.authority === 'organisation' && !q.j.response.qa);
      ok('11 · the capture-only turn actually persisted one evidence item', countEvidence() === before + 1);
    }

    // 12 · question-only turn creates NO evidence
    {
      const before = countEvidence();
      await turn('coach', 'how does our high press work');
      ok('12 · a question-only turn writes no evidence', countEvidence() === before);
    }

    // 13 · declarative turn OFFERS a save but does NOT persist
    {
      const before = countEvidence();
      const q = await turn('mia', 'Minutes from tonight: we agreed the new schedule, confirmed away travel, and set trials for next month.');
      ok('13 · declarative content is not auto-saved', !q.j.saved && countEvidence() === before);
      ok('13 · declarative content is offered as a one-tap capture', (q.j.response.proposedActions || []).some(p => p.actionType === 'capture'));
    }

    // 14 · explicit capture PLUS question (mixed) — ordering is defined: save, then answer
    {
      const before = countEvidence();
      const q = await turn('mia', 'Remember that my personal target is to sharpen my weak left foot. What is my personal target?');
      ok('14 · mixed turn saves the statement (personal, private)', q.j.saved && q.j.saved.scope === 'personal' && q.j.saved.visibility === 'private');
      ok('14 · mixed turn also answers the question', q.j.response.qa && /weak left foot|target/i.test(q.j.response.qa.answer));
      ok('14 · the answer used the JUST-saved statement (order: persist → ground)', q.j.response.qa.usedNewlySaved === true);
      ok('14 · exactly one new evidence item was written', countEvidence() === before + 1);
    }

    // 15 · ordinary conversation never auto-saves and produces no phantom answer
    {
      const before = countEvidence();
      const q = await turn('sam', 'Good session today, the lads were buzzing and it felt sharp.');
      ok('15 · ordinary conversation never auto-saves', !q.j.saved && countEvidence() === before);
    }

    // 16 · compatibility — the legacy _assistantAnswer callers share the SAME answer
    {
      const viaHelper = _assistantAnswer(A, 'coach', 'how does our high press work');
      const viaTurn   = await turn('coach', 'how does our high press work');
      ok('16 · turn and legacy _assistantAnswer return the same grounded answer', viaHelper.answer === viaTurn.j.response.qa.answer);
      // /api/workspace/ask (the shim) also stays alive on the one path
      const r = await fetch(base + '/api/workspace/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok.coach}` }, body: JSON.stringify({ question: 'how does our high press work' }) });
      const aj = await r.json();
      ok('16 · /api/workspace/ask still answers via the same path', r.status === 200 && /high press|goalkeeper/i.test(JSON.stringify(aj)));
    }

    // 17 · GOVERNANCE — the turn routes through the ONE grounded boundary
    {
      const fs = require('fs'), path = require('path');
      const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
      ok('17 · _assistantTurn answers via _assistantAnswer (no second retrieval)', /function _assistantTurn[\s\S]*?_assistantAnswer\(code, userId, cls\.questionText/.test(src));
      ok('17 · the turn endpoint contains no its-own retrieval call', !/app\.post\('\/api\/assistant\/turn'[\s\S]*?_retrieveGrounding\(/.test(src));
    }
  } catch (e) { fail++; console.log('  ✗ suite threw:', e && e.message); }

  server.close();
  console.log(`\nturn-grounding-smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
