export interface Trader {
  id: string;
  handle: string;
  /** Fomo's own leaderboard rank, 1 = best. Used to weight their activity. */
  rank: number;
}

export type TradeSide = 'buy' | 'sell';

export interface Trade {
  id: string;
  traderId: string;
  coinSymbol: string;
  coinName: string;
  side: TradeSide;
  /** Position size in whatever unit Fomo reports (USD notional preferred). */
  sizeUsd: number;
  /** ISO 8601 timestamp of the trade. */
  timestamp: string;
}

export interface Thesis {
  id: string;
  traderId: string;
  coinSymbol: string;
  /** Free-text commentary the trader posted about the coin. */
  text: string;
  timestamp: string;
}

export interface TraderActivity {
  trader: Trader;
  trades: Trade[];
  theses: Thesis[];
}

/**
 * Source of truth for Fomo data. Swap the implementation (mock vs. real HTTP
 * client) without touching the scoring/notification pipeline.
 */
export interface FomoClient {
  fetchTopTraders(limit: number): Promise<Trader[]>;
  fetchTraderActivity(trader: Trader, sinceIso: string): Promise<TraderActivity>;
}

export interface CoinScore {
  coinSymbol: string;
  coinName: string;
  /** 0-100 composite "promise" score. */
  score: number;
  buyingTraderCount: number;
  sellingTraderCount: number;
  netTradersWeight: number;
  thesisSentiment: number;
  sampleTheses: string[];
}
