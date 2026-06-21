# Advisor — Smoke Test & Verification

The Individual Advisor (Phase 1, alignment-aware) has only been verified at the
syntax/contract level so far. These two passes confirm it actually works against
a **live instance** (real `DATABASE_URL` + `ANTHROPIC_API_KEY`).

---

## A. Automated smoke test (≈30 seconds)

Runs the full endpoint flow and asserts the contract. Point it at a local
server or your deploy — it does **not** boot the server itself.

```bash
# Local, logging in:
BASE_URL=http://localhost:3000 EMAIL=you@example.com PASSWORD=secret \
  npm run smoke:advisor

# Deploy, with an existing token + explicit member:
BASE_URL=https://your-app.onrender.com TOKEN=xxxxx MEMBER_ID=u_123 \
  npm run smoke:advisor
```

**Env vars**

| Var | Purpose |
|---|---|
| `BASE_URL` | target server (default `http://localhost:3000`) |
| `TOKEN` | skip login if you already have a session token |
| `EMAIL` / `PASSWORD` | login credentials (a coach/admin/leader) when no `TOKEN` |
| `MEMBER_ID` | member to advise on (auto-picked from your visible members if omitted) |

**What it checks (hard = must pass, soft = warning)**

1. Auth — login or provided token works.
2. Resolves a visible member.
3. **Question mode** — `POST /api/advisor/:id/ask` returns 200 + non-empty answer + a role lens. *Soft:* warns if the answer contains a `%` or `/100` (possible alignment-score leak; mood `x/5` is fine).
4. **Briefing mode** — `mode:'briefing'` returns 200, `mode=briefing`, and text that references the 4-question structure.
5. **History** — both new threads appear in `GET /api/advisor/:id/threads`.
6. **Guardrails** — empty question → 400; unauthenticated request → 401.

Exit code `0` = all hard checks passed, `1` = a failure.

> Note on the model tier: the Advisor uses the `reason` tier (default
> `claude-sonnet-4-6`). If your key is Haiku-only, set
> `AI_MODEL_REASON=claude-haiku-4-5-20251001` — the gateway also auto-downshifts
> on a model-unavailable error, so the call still succeeds.

---

## B. Manual UI click-through (≈5 minutes)

Confirms the experience and the product laws the script can't fully judge.

1. **Open** the platform as a coach/admin/leader → People/Team → click a member → **Ask Advisor** tab.
2. **Chips** — click each of the four prompt chips; each fills the textbox.
3. **Ask** — submit "How do I motivate this person?".
   - [ ] Loading state shows ("Thinking…").
   - [ ] An answer renders with the role-lens badge.
   - [ ] Answer is **specific to this person**, not generic coaching.
   - [ ] **No numeric score / percentage / ranking** in the answer.
   - [ ] Language is **directional** (e.g. "converging", "stalled"), not a grade.
4. **Full Briefing** — click **📋 Full Briefing**.
   - [ ] Renders the four parts: what we're seeing / why / how it aligns (member · team · org) / what to try next.
   - [ ] If the member has **no goal set**, the briefing names them **unanchored** rather than inventing a goal.
5. **Privacy** — if the member has private check-ins or notes:
   - [ ] The advice may reflect them, but **no private text is quoted or revealed**.
   - [ ] The inline privacy note is visible under the textbox.
6. **History** — both your question and the briefing appear under "Previous questions".
7. **Empty state** — open the tab on a brand-new member with no data:
   - [ ] No crash; answer is honest about thin evidence / unanchored state.
8. **Error state** — (optional) submit with a blank box → inline "type a question" message, no crash.

---

## C. What a live run uniquely proves

Everything before this was static. A real run is the only way to confirm:

- the `reason`-tier model actually resolves on your account (or downshifts cleanly);
- the output obeys the **no-scalar / directional-language** law in practice;
- the **conflict doctrine** shows up (integration framing, "unanchored = high care");
- the **privacy gate** holds against real private content.
