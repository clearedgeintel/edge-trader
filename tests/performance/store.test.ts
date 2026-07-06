import { PerformanceStore } from '../../src/performance/store.js';
import type { MonitoredPosition } from '../../src/monitor/types.js';
import type { Signal } from '../../src/strategy/types.js';

function makeSignal(): Signal {
  return {
    symbol: 'AAPL',
    score: 80,
    rationale: {
      symbol: 'AAPL',
      score: 80,
      reasons: ['test'],
      indicators: {},
      regime: 'trending_bull',
      suggested_stop: 175,
      suggested_target: 190,
      risk_dollars: 5,
    },
    proposal: {
      symbol: 'AAPL',
      entryPrice: 180,
      stopPrice: 175,
      targetPrice: 190,
      atr: 2,
      avgDailyVolume: 1_000_000,
    },
  };
}

function makePosition(): MonitoredPosition {
  return {
    symbol: 'AAPL',
    qty: 1,
    originalQty: 1,
    entryPrice: 180,
    stopPrice: 175,
    targetPrice: 190,
    atr: 2,
    stopDistance: 5,
    trailingStop: null,
    partialTaken: false,
    bracketManaged: false,
    rationale: makeSignal().rationale,
    openedAt: new Date().toISOString(),
  };
}

describe('PerformanceStore', () => {
  it('records signals and trades', () => {
    const store = new PerformanceStore();
    store.recordSignal(makeSignal(), false);
    store.recordClosedTrade(makePosition(), 185, 1, 'target_hit');

    expect(store.getSignals()).toHaveLength(1);
    expect(store.getTrades()).toHaveLength(1);
    expect(store.getTrades()[0]!.pnl).toBe(5);
  });

  it('computes performance snapshot', () => {
    const store = new PerformanceStore();
    store.setStartingEquity(1000);
    store.recordClosedTrade(makePosition(), 185, 1, 'target_hit');
    store.recordClosedTrade(makePosition(), 170, 1, 'stop_hit');

    const snap = store.getSnapshot(0, 995);
    expect(snap.totalTrades).toBe(2);
    expect(snap.wins).toBe(1);
    expect(snap.winRate).toBe(0.5);
  });

  it('rolls up daily performance', () => {
    const store = new PerformanceStore();
    store.recordClosedTrade(makePosition(), 185, 1, 'target_hit');
    const daily = store.getDailyPerformance();
    expect(daily.length).toBe(1);
    expect(daily[0]!.pnl).toBe(5);
    expect(daily[0]!.wins).toBe(1);
  });
});