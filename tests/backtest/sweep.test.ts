import { aggregateTrades } from '../../src/backtest/sweep.js';
import type { BacktestTrade } from '../../src/backtest/types.js';

function trade(over: Partial<BacktestTrade> = {}): BacktestTrade {
  return {
    symbol: 'AAA',
    entryPrice: 100,
    exitPrice: 110,
    qty: 1,
    pnl: 10,
    pnlPct: 10,
    entryTime: '2026-01-01T00:00:00Z',
    exitTime: '2026-01-02T00:00:00Z',
    exitReason: 'target_hit',
    regime: 'trending_bull',
    score: 85,
    mae: -2,
    mfe: 12,
    rationale: {
      symbol: 'AAA',
      score: 85,
      reasons: [],
      indicators: {},
      regime: 'trending_bull',
      suggested_stop: 90, // risk = (100 - 90) * qty
      suggested_target: 110,
      risk_dollars: 10,
    },
    holdingBars: 5,
    ...over,
  };
}

describe('aggregateTrades', () => {
  it('pools trades into edge stats with R-multiples and breakdowns', () => {
    const trades = [
      trade({ symbol: 'WIN', pnl: 20, exitPrice: 120, score: 90, exitReason: 'target_hit' }), // +2R
      trade({ symbol: 'LOSS', pnl: -10, exitPrice: 90, score: 80, exitReason: 'stop_hit' }), // -1R
    ];
    const a = aggregateTrades(trades);

    expect(a.trades).toBe(2);
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(1);
    expect(a.winRate).toBe(0.5);
    expect(a.netPnl).toBeCloseTo(10);
    expect(a.profitFactor).toBeCloseTo(2);
    expect(a.expectancy).toBeCloseTo(5);
    expect(a.avgR).toBeCloseTo(0.5); // (+2R + -1R) / 2
    expect(a.bySymbol.map((r) => r.key)).toEqual(['WIN', 'LOSS']); // sorted by netPnl desc
    expect(a.byScoreBand.map((r) => r.key).sort()).toEqual(['80-89', '90-100']);
    expect(a.byExitReason.map((r) => r.key).sort()).toEqual(['stop_hit', 'target_hit']);
  });

  it('handles an empty trade set', () => {
    const a = aggregateTrades([]);
    expect(a.trades).toBe(0);
    expect(a.winRate).toBe(0);
    expect(a.profitFactor).toBeNull();
  });
});
