import { PerformanceStore } from '../../src/performance/store.js';
import type { MonitoredPosition } from '../../src/monitor/types.js';

function pos(overrides: Partial<MonitoredPosition> = {}): MonitoredPosition {
  return {
    symbol: 'AAA',
    qty: 1,
    originalQty: 1,
    entryPrice: 100,
    stopPrice: 90,
    targetPrice: 125,
    atr: 5,
    stopDistance: 10,
    trailingStop: null,
    partialTaken: false,
    bracketManaged: false,
    rationale: {
      symbol: 'AAA',
      score: 85,
      reasons: [],
      indicators: {},
      regime: 'trending_bull',
      suggested_stop: 90, // risk = (100 - 90) * qty
      suggested_target: 125,
      risk_dollars: 10,
    },
    openedAt: '2026-08-01T14:00:00Z',
    ...overrides,
  };
}

describe('PerformanceStore.getAnalytics', () => {
  it('computes win rate, profit factor, expectancy and R-multiples', () => {
    const store = new PerformanceStore();
    // Win: exit 120 -> +$20 on $10 risk -> +2R
    store.recordClosedTrade(pos({ symbol: 'WIN' }), 120, 1, 'target_hit');
    // Loss: exit 90 -> -$10 -> -1R
    store.recordClosedTrade(pos({ symbol: 'LOSS' }), 90, 1, 'stop_hit');

    const a = store.getAnalytics();
    expect(a.trades).toBe(2);
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(1);
    expect(a.winRate).toBe(0.5);
    expect(a.netPnl).toBeCloseTo(10);
    expect(a.grossProfit).toBeCloseTo(20);
    expect(a.grossLoss).toBeCloseTo(-10);
    expect(a.profitFactor).toBeCloseTo(2);
    expect(a.expectancy).toBeCloseTo(5);
    expect(a.avgR).toBeCloseTo(0.5); // (+2R + -1R) / 2
    expect(a.byExitReason.map((r) => r.key).sort()).toEqual(['stop_hit', 'target_hit']);
    expect(a.byScoreBand[0].key).toBe('80-89');
  });

  it('returns zeroed analytics with no trades', () => {
    const a = new PerformanceStore().getAnalytics();
    expect(a.trades).toBe(0);
    expect(a.winRate).toBe(0);
    expect(a.profitFactor).toBeNull();
  });
});
