# Update — Values flow to the AI (org + member), and the answers

**Merged to main:** `c53fce7` (deploying)

## The real fix
Both org AND member already *capture* values/goals/traits at setup — but the data
sat in `organizationProfile` / `memberGoals` and **never reached the AI**. Now it does.

- **Org:** completing the org profile now flows approved **values → the live
  values store**, goals → goals, metrics → metrics. So what you set at creation
  actually drives the Advisor/Copilot/briefings. The org lens now also reasons
  from **desired traits + "what success looks like,"** not just values.
- **Member (parity — your "same on the user side"):** member-facing AI (Advisor,
  notes, check-ins, weekly) now reasons from **the member's own goals, values,
  strengths and growth areas** (captured at member onboarding). Guidance anchors
  to what THEY are trying to become.

Same guardrail throughout: values shape *reasoning*, never the wording.

---

## Your questions, answered

**What does an org need to run?**
Minimum for the AI to be useful: **identity** (name + type/context), **values**
(the guardrails), **at least one goal/priority**, and ideally **desired traits**
+ a **success definition**. The org wizard already collects all of these
(describe → AI suggests → you approve). Values/goals were the ones not flowing
through — now fixed.

**What data should the AI capture?**
Two kinds: (1) the **anchors** — org values/traits/goals and each member's own
goals/values/strengths/growth (the "north" it measures against); and (2) the
**signals** — every input (notes, check-ins, assessments, uploads, voice, stats),
weighted. Anchors give meaning; signals give evidence.

**Are traits & goals important?**
Yes — they're essential, not optional. They're the *reference frames* the whole
alignment engine measures against. Without goals/traits the AI can observe
behaviour but has nothing to say whether someone is moving toward or away from
anything. Values = guardrails, traits = what "good" looks like, goals =
direction.

**Can we do the same on the user side?**
Done. Members already capture their goals, values, strengths and growth areas at
onboarding; now the AI actually reasons from them for that person.

---

## On "make values an explicit step"
It already is — the org wizard's review screen has **Core Values** as its first
approval section, and member onboarding has a values step. The gap was purely
that the approved values didn't reach the AI's live store. That's what this fix
closes. (If you want values to be a *required* field before an org can finish
setup, that's a small follow-up.)

## Verification
- `node --check`; org + member directive builders tested.

## Still open
- Make values a *required* setup field (optional hardening).
- Per-group values lens; AI memory/profile upgrade; Graph/Google connectors.
