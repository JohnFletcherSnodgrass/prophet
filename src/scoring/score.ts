import type { CoinScore, TraderActivity } from '../types';
import { thesisSentiment } from './keywords';

/** Higher-ranked (smaller rank number) traders count for more. */
function traderWeight(rank: number): number {
  return 1 / Math.sqrt(rank);
}

interface CoinAccumulator {
  coinSymbol: string;
  coinName: string;
  buyWeight: number;
  sellWeight: number;
  buyingTraders: Set<string>;
  sellingTraders: Set<string>;
  sentimentSum: number;
  sentimentCount: number;
  sampleTheses: string[];
}

/**
 * Aggregates the top traders' recent trades and theses into a per-coin
 * "promise score" (0-100). Trades from higher-ranked traders count for more,
 * buys push the score up, sells pull it down, and thesis text nudges it via
 * lexical sentiment. Sorted highest score first.
 */
export function scoreCoins(activities: TraderActivity[]): CoinScore[] {
  const coins = new Map<string, CoinAccumulator>();
  let totalWeight = 0;

  for (const { trader, trades, theses } of activities) {
    const weight = traderWeight(trader.rank);
    totalWeight += weight;

    for (const trade of trades) {
      const acc = getOrCreate(coins, trade.coinSymbol, trade.coinName);
      if (trade.side === 'buy') {
        acc.buyWeight += weight;
        acc.buyingTraders.add(trader.id);
      } else {
        acc.sellWeight += weight;
        acc.sellingTraders.add(trader.id);
      }
    }

    for (const thesis of theses) {
      const acc = getOrCreate(coins, thesis.coinSymbol, thesis.coinSymbol);
      const sentiment = thesisSentiment(thesis.text);
      acc.sentimentSum += sentiment;
      acc.sentimentCount += 1;
      if (acc.sampleTheses.length < 3) {
        acc.sampleTheses.push(thesis.text);
      }
    }
  }

  const results: CoinScore[] = [];
  for (const acc of coins.values()) {
    const netWeight = acc.buyWeight - acc.sellWeight;
    const tradeSignal = totalWeight > 0 ? clamp(netWeight / totalWeight, -1, 1) : 0;
    const sentiment = acc.sentimentCount > 0 ? acc.sentimentSum / acc.sentimentCount : 0;
    const combined = clamp(tradeSignal * 0.7 + sentiment * 0.3, -1, 1);
    const score = Math.round(((combined + 1) / 2) * 100);

    results.push({
      coinSymbol: acc.coinSymbol,
      coinName: acc.coinName,
      score,
      buyingTraderCount: acc.buyingTraders.size,
      sellingTraderCount: acc.sellingTraders.size,
      netTradersWeight: Number(netWeight.toFixed(4)),
      thesisSentiment: Number(sentiment.toFixed(4)),
      sampleTheses: acc.sampleTheses,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

function getOrCreate(
  coins: Map<string, CoinAccumulator>,
  symbol: string,
  name: string,
): CoinAccumulator {
  let acc = coins.get(symbol);
  if (!acc) {
    acc = {
      coinSymbol: symbol,
      coinName: name,
      buyWeight: 0,
      sellWeight: 0,
      buyingTraders: new Set(),
      sellingTraders: new Set(),
      sentimentSum: 0,
      sentimentCount: 0,
      sampleTheses: [],
    };
    coins.set(symbol, acc);
  }
  return acc;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
