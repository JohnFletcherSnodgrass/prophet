import type { FomoClient, TraderActivity, CoinScore } from './types';
import { scoreCoins } from './scoring/score';
import { loadState, saveState, type PipelineState } from './state/store';
import { buildPushMessage, sendExpoPushNotifications, type PushMessage } from './notify/expoPush';

export interface PipelineConfig {
  /** How many top-ranked traders to pull activity from. */
  traderCount: number;
  /** How far back to look for trades/theses. */
  lookbackHours: number;
  /** Minimum score (0-100) to be worth a notification. */
  scoreThreshold: number;
  /** Don't re-notify the same coin within this many hours unless the score jumps. */
  cooldownHours: number;
  /** Re-notify early if the score rises by at least this many points. */
  reNotifyScoreDelta: number;
  statePath: string;
}

export const DEFAULT_CONFIG: PipelineConfig = {
  traderCount: 100,
  lookbackHours: 24,
  scoreThreshold: 70,
  cooldownHours: 12,
  reNotifyScoreDelta: 10,
  statePath: 'data/state.json',
};

export interface PipelineDeps {
  fomoClient: FomoClient;
  pushTokens: string[];
  config?: Partial<PipelineConfig>;
  now?: () => Date;
  sendPush?: (messages: PushMessage[]) => Promise<void>;
}

export interface PipelineResult {
  scored: CoinScore[];
  notified: CoinScore[];
}

export async function runPipeline(deps: PipelineDeps): Promise<PipelineResult> {
  const config = { ...DEFAULT_CONFIG, ...deps.config };
  const now = deps.now ?? (() => new Date());
  const sendPush = deps.sendPush ?? sendExpoPushNotifications;
  const nowDate = now();
  const sinceIso = new Date(nowDate.getTime() - config.lookbackHours * 60 * 60 * 1000).toISOString();

  const traders = await deps.fomoClient.fetchTopTraders(config.traderCount);
  const activities: TraderActivity[] = await Promise.all(
    traders.map((trader) => deps.fomoClient.fetchTraderActivity(trader, sinceIso)),
  );

  const scored = scoreCoins(activities);
  const state = await loadState(config.statePath);

  const toNotify = scored.filter((coin) => shouldNotify(coin, state, config, nowDate));

  if (toNotify.length > 0 && deps.pushTokens.length > 0) {
    const messages = toNotify.flatMap((coin) =>
      deps.pushTokens.map((token) => buildPushMessage(token, coin)),
    );
    await sendPush(messages);
  }

  for (const coin of toNotify) {
    state.notified[coin.coinSymbol] = { score: coin.score, notifiedAt: nowDate.toISOString() };
  }
  await saveState(config.statePath, state);

  return { scored, notified: toNotify };
}

function shouldNotify(
  coin: CoinScore,
  state: PipelineState,
  config: PipelineConfig,
  now: Date,
): boolean {
  if (coin.score < config.scoreThreshold) return false;

  const last = state.notified[coin.coinSymbol];
  if (!last) return true;

  const hoursSince = (now.getTime() - new Date(last.notifiedAt).getTime()) / (60 * 60 * 1000);
  if (hoursSince >= config.cooldownHours) return true;
  if (coin.score - last.score >= config.reNotifyScoreDelta) return true;

  return false;
}
