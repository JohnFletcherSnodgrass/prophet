import assert from 'node:assert/strict';
import { test } from 'node:test';

import { scoreCoins } from '../scoring/score';
import { thesisSentiment } from '../scoring/keywords';
import type { TraderActivity } from '../types';

const now = '2026-01-01T00:00:00.000Z';

function activity(traderId: string, rank: number, overrides: Partial<TraderActivity> = {}): TraderActivity {
  return {
    trader: { id: traderId, handle: traderId, rank },
    trades: [],
    theses: [],
    ...overrides,
  };
}

test('a coin bought by many high-rank traders scores high', () => {
  const activities: TraderActivity[] = Array.from({ length: 10 }, (_, i) =>
    activity(`t${i}`, i + 1, {
      trader: { id: `t${i}`, handle: `t${i}`, rank: i + 1 },
      trades: [
        {
          id: `${i}-buy`,
          traderId: `t${i}`,
          coinSymbol: 'GOOD',
          coinName: 'GoodCoin',
          side: 'buy',
          sizeUsd: 1000,
          timestamp: now,
        },
      ],
    }),
  );

  const [top] = scoreCoins(activities);
  assert.equal(top.coinSymbol, 'GOOD');
  assert.ok(top.score > 70, `expected high score, got ${top.score}`);
  assert.equal(top.buyingTraderCount, 10);
  assert.equal(top.sellingTraderCount, 0);
});

test('a coin everyone is selling scores low', () => {
  const activities: TraderActivity[] = Array.from({ length: 10 }, (_, i) =>
    activity(`t${i}`, i + 1, {
      trader: { id: `t${i}`, handle: `t${i}`, rank: i + 1 },
      trades: [
        {
          id: `${i}-sell`,
          traderId: `t${i}`,
          coinSymbol: 'BAD',
          coinName: 'BadCoin',
          side: 'sell',
          sizeUsd: 1000,
          timestamp: now,
        },
      ],
    }),
  );

  const [top] = scoreCoins(activities);
  assert.equal(top.coinSymbol, 'BAD');
  assert.ok(top.score < 30, `expected low score, got ${top.score}`);
});

test('a higher-ranked (lower number) trader outweighs a lower-ranked one', () => {
  const activities: TraderActivity[] = [
    activity('whale', 1, {
      trader: { id: 'whale', handle: 'whale', rank: 1 },
      trades: [
        { id: 'w-buy', traderId: 'whale', coinSymbol: 'X', coinName: 'X', side: 'buy', sizeUsd: 1, timestamp: now },
      ],
    }),
    activity('minnow', 100, {
      trader: { id: 'minnow', handle: 'minnow', rank: 100 },
      trades: [
        { id: 'm-sell', traderId: 'minnow', coinSymbol: 'X', coinName: 'X', side: 'sell', sizeUsd: 1, timestamp: now },
      ],
    }),
  ];

  const [top] = scoreCoins(activities);
  assert.equal(top.coinSymbol, 'X');
  assert.ok(top.netTradersWeight > 0, 'rank-1 buyer should outweigh rank-100 seller');
});

test('theses nudge the score via sentiment without trades', () => {
  const activities: TraderActivity[] = [
    activity('t1', 5, {
      theses: [
        { id: 'th1', traderId: 't1', coinSymbol: 'Y', text: 'accumulating here, strong team' },
      ].map((t) => ({ ...t, timestamp: now })),
    }),
  ];

  const [top] = scoreCoins(activities);
  assert.equal(top.coinSymbol, 'Y');
  assert.ok(top.score > 50, `bullish thesis alone should push score above midpoint, got ${top.score}`);
});

test('coins with no activity are not included', () => {
  const scored = scoreCoins([activity('t1', 1)]);
  assert.equal(scored.length, 0);
});

test('thesisSentiment recognizes bullish and bearish phrasing', () => {
  assert.ok(thesisSentiment('accumulating here, strong team and real volume') > 0);
  assert.ok(thesisSentiment('taking profit, chart looks exhausted') < 0);
  assert.equal(thesisSentiment('no signal words here'), 0);
});
