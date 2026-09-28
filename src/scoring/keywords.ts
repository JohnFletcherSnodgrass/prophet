const BULLISH_WORDS = [
  'accumulat',
  'breakout',
  'breaking out',
  'undervalued',
  'strong team',
  'strong volume',
  'best risk',
  'adding',
  'buying',
  'long',
  'bullish',
  'conviction',
  'catalyst',
  'moon',
];

const BEARISH_WORDS = [
  'taking profit',
  'take profit',
  'exiting',
  'exit',
  'trimming',
  'trim',
  'overextended',
  'exhausted',
  'bearish',
  'dumping',
  'rug',
  'short',
  'no more edge',
];

/**
 * Cheap lexical sentiment score in [-1, 1]. Not NLP — a keyword count that's
 * good enough to rank theses without pulling in a model dependency for a
 * scheduled script. Replace with a real classifier later if precision matters.
 */
export function thesisSentiment(text: string): number {
  const lower = text.toLowerCase();
  const bullishHits = BULLISH_WORDS.filter((w) => lower.includes(w)).length;
  const bearishHits = BEARISH_WORDS.filter((w) => lower.includes(w)).length;
  const total = bullishHits + bearishHits;
  if (total === 0) return 0;
  return (bullishHits - bearishHits) / total;
}
