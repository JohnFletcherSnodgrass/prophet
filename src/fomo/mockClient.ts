import type { FomoClient, Trader, TraderActivity, Trade, Thesis } from '../types';

const SAMPLE_COINS: Array<{ symbol: string; name: string }> = [
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'PEPE', name: 'Pepe' },
  { symbol: 'WIF', name: 'dogwifhat' },
  { symbol: 'JUP', name: 'Jupiter' },
  { symbol: 'BONK', name: 'Bonk' },
];

const BULLISH_PHRASES = [
  'accumulating here, strong team and real volume',
  'breaking out of range, adding on the dip',
  'best risk/reward on the board right now',
];

const BEARISH_PHRASES = [
  'taking profit, chart looks exhausted',
  'exiting, thesis played out',
  'trimming, no more edge here',
];

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Deterministic fake data generator. Lets the scoring pipeline, tests, and
 * notification flow be built and verified before real Fomo API access is
 * wired up (see src/fomo/httpClient.ts).
 */
export function createMockFomoClient(): FomoClient {
  return {
    async fetchTopTraders(limit: number): Promise<Trader[]> {
      return Array.from({ length: limit }, (_, i) => ({
        id: `trader-${i + 1}`,
        handle: `trader${i + 1}`,
        rank: i + 1,
      }));
    },

    async fetchTraderActivity(trader: Trader, sinceIso: string): Promise<TraderActivity> {
      const seed = trader.rank;
      const trades: Trade[] = [];
      const theses: Thesis[] = [];

      SAMPLE_COINS.forEach((coin, coinIndex) => {
        const roll = pseudoRandom(seed * 7 + coinIndex);
        if (roll > 0.5) {
          const side = roll > 0.75 ? 'buy' : 'sell';
          trades.push({
            id: `${trader.id}-${coin.symbol}-trade`,
            traderId: trader.id,
            coinSymbol: coin.symbol,
            coinName: coin.name,
            side,
            sizeUsd: Math.round(pseudoRandom(seed * 13 + coinIndex) * 50000) + 1000,
            timestamp: sinceIso,
          });

          const phrases = side === 'buy' ? BULLISH_PHRASES : BEARISH_PHRASES;
          const phrase = phrases[coinIndex % phrases.length];
          theses.push({
            id: `${trader.id}-${coin.symbol}-thesis`,
            traderId: trader.id,
            coinSymbol: coin.symbol,
            text: `${coin.symbol}: ${phrase}`,
            timestamp: sinceIso,
          });
        }
      });

      return { trader, trades, theses };
    },
  };
}
