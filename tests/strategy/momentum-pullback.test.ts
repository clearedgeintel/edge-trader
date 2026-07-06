import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { MomentumPullbackStrategy } from '../../src/strategy/momentum-pullback.js';
import type { SymbolFeatures } from '../../src/analysis/features.js';

function makeFeatures(overrides: Partial<SymbolFeatures> = {}): SymbolFeatures {
  return {
    symbol: 'AAPL',
    timestamp: new Date().toISOString(),
    regime: 'trending_bull',
    daily: {
      price: 180,
      ema9: 178,
      ema21: 175,
      ema50: 170,
      ema200: 160,
      rsi14: 55,
      adx14: 28,
      atr14: 3,
      bbUpper: 185,
      bbMiddle: 178,
      bbLower: 171,
      vwap: 179,
      avgVolume20: 2_000_000,
    },
    hourly: {
      price: 180,
      ema9: 179,
      ema21: 178,
      ema50: 175,
      ema200: 170,
      rsi14: 45,
      adx14: 25,
      atr14: 1.5,
      bbUpper: 182,
      bbMiddle: 179,
      bbLower: 176,
      vwap: 179.5,
      avgVolume20: 500_000,
    },
    intraday: {
      price: 180,
      ema9: 179.5,
      ema21: 179,
      ema50: 178,
      ema200: 175,
      rsi14: 42,
      adx14: 22,
      atr14: 0.8,
      bbUpper: 181,
      bbMiddle: 179.5,
      bbLower: 178,
      vwap: 179.8,
      avgVolume20: 100_000,
    },
    priceAboveEma200: true,
    ema50SlopePositive: true,
    relativeStrengthVsBenchmark: 0.05,
    pullbackVolumeDecreasing: true,
    rsiInPullbackZone: true,
    nearValueZone: true,
    bullishConfirmation: true,
    avgDailyVolume: 2_000_000,
    ...overrides,
  };
}

describe('MomentumPullbackStrategy', () => {
  const strategy = new MomentumPullbackStrategy(
    DEFAULT_CONFIG.strategy,
    DEFAULT_CONFIG.risk,
  );

  it('generates signal when confluence score meets threshold', () => {
    const result = strategy.evaluate(makeFeatures(), 1000);
    expect(result.score).toBeGreaterThanOrEqual(DEFAULT_CONFIG.strategy.minConfluenceScore);
    expect(result.signal).not.toBeNull();
    expect(result.signal!.rationale.symbol).toBe('AAPL');
    expect(result.signal!.rationale.suggested_stop).toBeLessThan(180);
    expect(result.signal!.rationale.suggested_target).toBeGreaterThan(180);
    expect(result.signal!.proposal.atr).toBe(0.8);
  });

  it('rejects signal when score below threshold', () => {
    const result = strategy.evaluate(
      makeFeatures({
        regime: 'choppy',
        priceAboveEma200: false,
        nearValueZone: false,
        pullbackVolumeDecreasing: false,
        rsiInPullbackZone: false,
        bullishConfirmation: false,
        relativeStrengthVsBenchmark: -0.1,
        daily: { ...makeFeatures().daily, adx14: 10 },
      }),
      1000,
    );
    expect(result.signal).toBeNull();
    expect(result.score).toBeLessThan(DEFAULT_CONFIG.strategy.minConfluenceScore);
  });

  it('includes structured rationale with indicators', () => {
    const result = strategy.evaluate(makeFeatures(), 1000);
    expect(result.signal!.rationale.indicators).toHaveProperty('adx');
    expect(result.signal!.rationale.indicators).toHaveProperty('rsi_15m');
    expect(result.signal!.rationale.reasons.length).toBeGreaterThan(0);
    expect(result.signal!.rationale.risk_dollars).toBe(5);
  });
});