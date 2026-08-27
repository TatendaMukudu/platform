'use strict';

// Credentials make the switches load-bearing; the provider itself is replaced
// before any call, so this suite cannot make network requests.
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.OPENAI_API_KEY = 'test-openai-key';

const gateway = require('../ai/gateway');

let pass = 0, fail = 0;
const ok = (name, value) => { if (value) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

(async () => {
  console.log('\n=== Gateway budget and token telemetry ===\n');
  let providerCalls = 0;
  gateway.client.messages.create = async opts => {
    providerCalls++;
    return { content: [{ type: 'text', text: 'grounded' }], usage: { input_tokens: opts.model.includes('haiku') ? 11 : 17, output_tokens: 5 } };
  };

  gateway.setDeterministicOnly(false);
  gateway._resetGatewayState({ hourly: 1, daily: 2 });
  const first = await gateway.complete({ org: 'Alpha', taskType: 'answer', tier: 'reason', user: 'bounded' });
  ok('G1 a call inside the budget reaches the provider', first === 'grounded' && providerCalls === 1);
  let budgetError;
  try { await gateway.complete({ org: 'Alpha', taskType: 'answer', tier: 'reason', user: 'blocked' }); } catch (err) { budgetError = err; }
  ok('G2 exhausted budget is refused inside the gateway', budgetError?.code === 'LLM_BUDGET_EXHAUSTED');
  ok('G3 an exhausted call never reaches the provider', providerCalls === 1);

  gateway._resetGatewayState({ hourly: 5, daily: 5 });
  await gateway.complete({ org: 'Alpha', taskType: 'summarise', tier: 'reason', user: 'one' });
  await gateway.complete({ org: 'Beta', taskType: 'phrase', tier: 'micro', user: 'two' });
  const alpha = gateway.usageFor('alpha'), beta = gateway.usageFor('beta');
  ok('G4 telemetry remains tenant and task scoped', alpha.length === 1 && alpha[0].taskType === 'summarise' && beta.length === 1 && beta[0].taskType === 'phrase');
  ok('G5 telemetry accumulates provider-reported token counts', alpha[0].promptTokens === 17 && alpha[0].completionTokens === 5 && beta[0].promptTokens === 11 && beta[0].completionTokens === 5);

  gateway.setDeterministicOnly(true);
  ok('G6 transcription capability is unavailable in deterministic-only mode', gateway.canTranscribe() === false);
  gateway.setDeterministicOnly(false);

  console.log(`\n=== gateway-budget-smoke: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
