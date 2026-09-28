import { createFomoClientFromEnv } from '../src/fomo';
import { runPipeline } from '../src/pipeline';

function pushTokensFromEnv(env: NodeJS.ProcessEnv): string[] {
  const raw = env.EXPO_PUSH_TOKENS ?? env.EXPO_PUSH_TOKEN ?? '';
  return raw
    .split(',')
    .map((t: string) => t.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const pushTokens = pushTokensFromEnv(process.env);
  if (pushTokens.length === 0) {
    console.warn(
      'No EXPO_PUSH_TOKEN(S) set — scoring will run but no notifications will be sent. ' +
        'Run the app, grant notification permission, and copy the token shown into ' +
        'the EXPO_PUSH_TOKEN GitHub secret.',
    );
  }

  const fomoClient = createFomoClientFromEnv(process.env);
  const result = await runPipeline({ fomoClient, pushTokens });

  console.log(`Scored ${result.scored.length} coins.`);
  for (const coin of result.scored.slice(0, 10)) {
    console.log(
      `  ${coin.coinSymbol.padEnd(6)} score=${coin.score} buyers=${coin.buyingTraderCount} sellers=${coin.sellingTraderCount}`,
    );
  }

  if (result.notified.length === 0) {
    console.log('No coins crossed the notification threshold this run.');
  } else {
    console.log(`Notified on: ${result.notified.map((c) => c.coinSymbol).join(', ')}`);
  }
}

main().catch((err) => {
  console.error('poll-and-notify failed:', err);
  process.exitCode = 1;
});
