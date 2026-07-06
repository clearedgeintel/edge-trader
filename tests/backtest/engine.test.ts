import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { runBacktest } from '../../src/backtest/engine.js';
import { computeMetrics } from '../../src/backtest/metrics.js';
import type { Bar } from '../../src/data/types.js';

function makeTrendBars(
  count: number,
  start: number,
  step: number,
  intervalMinutes: number,
  baseVol: number,
): Bar[] {
  const startDate = new Date('2024-01-02T09:30:00Z');
  return Array.from({ length: count }, (_, i) => {
    const close = start + i * step;
    const isPullback = i > count * 0.75;
    const adjustedClose = isPullback ? close - step * 3 : close;
    const vol = isPullback ? baseVol * 0.3 : baseVol * 2;
    const ts = new Date(startDate.getTime() + i * intervalMinutes * 60_000);

    return {
      timestamp: ts.toISOString(),
      open: adjustedClose - 0.05,
      high: adjustedClose + (isPullback ? 0.2 : 0.5),
      low: adjustedClose - 0.3,
      close: adjustedClose + (isPullback ? 0.1 : 0),
      volume: vol,
    };
  });
}

describe('runBacktest', () => {
  it('runs event-driven replay and returns metrics', () => {
    const daily = makeTrendBars(250, 100, 0.8, 24 * 60, 2_000_000);
    const hourly = makeTrendBars(200, 200, 0.2, 60, 500_000);
    const intraday = makeTrendBars(200, 220, 0.03, 15, 100_000);
    const benchmark = makeTrendBars(250, 400, 0.15, 24 * 60, 5_000_000);

    const result = runBacktest({
      config: DEFAULT_CONFIG,
      btConfig: {
        symbol: 'TEST',
        startingEquity: 1000,
        slippageBps: 5,
        signalEveryNBars: 1,
      },
      daily,
      hourly,
      intraday,
      benchmarkDaily: benchmark,
    });

    expect(result.metrics).toBeDefined();
    expect(result.equityCurve.length).toBeGreaterThan(0);
    expect(result.metrics.finalEquity).toBeGreaterThan(0);

    for (const trade of result.trades) {
      expect(trade.mae).toBeLessThanOrEqual(0);
      expect(trade.mfe).toBeGreaterThanOrEqual(0);
      expect(trade.rationale).toBeDefined();
      expect(['stop_hit', 'target_hit', 'end_of_data']).toContain(trade.exitReason);
    }
  });
});

describe('computeMetrics', () => {
  it('calculates win rate and drawdown', () => {
    const trades = [
      {
        symbol: 'A',
        entryPrice: 100,
        exitPrice: 110,
        qty: 1,
        pnl: 10,
        pnlPct: 10,
        entryTime: '2024-01-01',
        exitTime: '2024-01-02',
        exitReason: 'target_hit' as const,
        regime: 'trending_bull' as const,
        score: 80,
        mae: -2,
        mfe: 12,
        rationale: {} as never,
        holdingBars: 5,
      },
      {
        symbol: 'A',
        entryPrice: 100,
        exitPrice: 95,
        qty: 1,
        pnl: -5,
        pnlPct: -5,
        entryTime: '2024-01-03',
        exitTime: '2024-01-04',
        exitReason: 'stop_hit' as const,
        regime: 'choppy' as const,
        score: 75,
        mae: -6,
        mfe: 1,
        rationale: {} as never,
        holdingBars: 3,
      },
    ];

    const curve = [
      { timestamp: 't1', equity: 1000 },
      { timestamp: 't2', equity: 1010 },
      { timestamp: 't3', equity: 1005 },
    ];

    const metrics = computeMetrics(trades, 1000, curve);
    expect(metrics.totalTrades).toBe(2);
    expect(metrics.wins).toBe(1);
    expect(metrics.winRate).toBe(0.5);
    expect(metrics.totalPnl).toBe(5);
    expect(metrics.byRegime.trending_bull?.trades).toBe(1);
    expect(metrics.byRegime.choppy?.trades).toBe(1);
  });
});