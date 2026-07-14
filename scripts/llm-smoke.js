/* LLM smoke — run the demo data through the REAL language-model paths and print
   what the models produce, so coaching quality can be judged directly.

   Unlike the truth layer (which runs with NO key and asserts deterministic
   behaviour), this exercises the live gateway. It needs a key:

     ANTHROPIC_API_KEY=…  node scripts/llm-smoke.js      # Claude (primary)
     OPENAI_API_KEY=…     node scripts/llm-smoke.js      # OpenAI (fallback)

   With no key it reports that the kernel is on its deterministic fallbacks and
   exits 0 — so it's safe to run anywhere. It never touches Postgres. */

process.env.DB_OPTIONAL = process.env.DB_OPTIONAL || '1';

const ai   = require('../ai/gateway');
const seed = require('../scripts/seed');

// Demo-shaped prompts — the kind of content the seeded orgs (Demo Athletic Club,
// Atlas Robotics) actually produce. One per tier so both paths are exercised.
const TRIALS = [
  { tier: 'micro', label: 'Check-in acknowledgement (fast tier)',
    system: 'You are a supportive coach. Reply in ONE warm, genuine sentence. No emojis.',
    user:   'A team member wrote: "Tough week — legs feel heavy but I got through every session." Acknowledge it warmly.' },
  { tier: 'reason', label: 'Coaching reflection (reasoning tier)',
    system: 'You are a thoughtful performance coach. In 2–3 sentences, reflect on what this pattern suggests and offer one gentle next step. No emojis, no lists.',
    user:   "Over six weeks a player's participation stayed high, but their self-reported energy has drifted down three weeks running. What might be going on, and what's one supportive step?" },
  { tier: 'reason', label: 'Cross-industry: the same kernel on a company (reasoning tier)',
    system: 'You are a thoughtful manager coach. In 2–3 sentences, reflect on what this pattern suggests and one supportive step. No emojis, no lists.',
    user:   "An engineer's output looks steady, but their workload signal has been climbing for a month and they've gone quiet in stand-ups. What might be going on, and what's one supportive step?" },
];

(async () => {
  // Confirm the demo builders load (proves this runs against real seed content).
  let demoUsers = 0, companyUsers = 0;
  try {
    const d = await seed.buildDemoStore();
    const c = await seed.buildCompanyDemoStore();
    demoUsers    = Object.keys(d.orgUsers[seed.DEMO_CODE]    || {}).length;
    companyUsers = Object.keys(c.orgUsers[seed.COMPANY_CODE] || {}).length;
  } catch (e) { console.warn('[llm-smoke] demo seed load failed (non-fatal):', e.message); }

  console.log('\n── LLM smoke ─────────────────────────────────────────────');
  console.log(`demo seed: ${demoUsers} athletes + ${companyUsers} staff loaded`);
  console.log(`provider: ${process.env.ANTHROPIC_API_KEY ? 'Claude' : ''}${process.env.OPENAI_API_KEY ? ' OpenAI' : ''}`.trim() || 'none');
  console.log(`models: reason=${ai.MODELS.reason}  micro=${ai.MODELS.micro}`);

  if (!ai.enabled()) {
    console.log('\nNo LLM key set — the kernel runs on deterministic fallbacks.');
    console.log('Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) to see live model output.\n');
    process.exit(0);
  }

  let failed = 0;
  for (const t of TRIALS) {
    const started = Date.now();
    process.stdout.write(`\n▶ ${t.label} [${ai.MODELS[t.tier]}]\n`);
    try {
      const out = await ai.complete({ tier: t.tier, system: t.system, user: t.user, maxTokens: 200 });
      console.log(`  (${Date.now() - started}ms)\n  ${out.replace(/\n/g, '\n  ')}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ failed (${Date.now() - started}ms): ${e.message}`);
    }
  }
  console.log(`\n── done: ${TRIALS.length - failed}/${TRIALS.length} prompts answered ──\n`);
  process.exit(failed ? 1 : 0);
})();
