import {
  buildFeatures,
  hasBullishConfirmation,
  isPullbackVolumeDecreasing,
  relativeStrength,
} from '../../src/analysis/features.js';
import { computeIndicators } from '../../src/analysis/indicators/index.js';
import { detectRegime } from '../../src/analysis/regime.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { Bar, MultiTimeframeBars } from '../../src/data/types.js';

function makeBars(count: number, start: number, step: number, baseVol: number): Bar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = start + i * step;
    const vol = i < count / 2 ? baseVol * 2 : baseVol * 0.5;
    return {
      timestamp: new Date(2024, 0, i + 1).toISOString(),
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: vol,
    };
  });
}

describe('relativeStrength', () => {
  it('returns positive when symbol outperforms benchmark', () => {
    const symbol = makeBars(25, 100, 1, 1000);
    const benchmark = makeBars(25, 100, 0.2, 1000);
    const rs = relativeStrength(symbol, benchmark, 20);
    expect(rs).not.toBeNull();
    expect(rs!).toBeGreaterThan(0);
  });

  it('returns null with insufficient data', () => {
    expect(relativeStrength(makeBars(5, 100, 1, 1000), makeBars(5, 100, 1, 1000))).toBeNull();
  });
});

describe('isPullbackVolumeDecreasing', () => {
  it('detects lower volume in second half of window', () => {
    const bars = makeBars(10, 100, 0.1, 1000);
    expect(isPullbackVolumeDecreasing(bars, 10)).toBe(true);
  });

  it('returns false with insufficient bars', () => {
    expect(isPullbackVolumeDecreasing(makeBars(3, 100, 0.1, 1000))).toBe(false);
  });
});

describe('buildFeatures', () => {
  it('assembles multi-TF features', () => {
    const daily = makeBars(250, 100, 0.5, 2_000_000);
    const hourly = makeBars(200, 150, 0.1, 500_000);
    const intraday = makeBars(200, 155, 0.02, 100_000);

    const mtf: MultiTimeframeBars = {
      symbol: 'AAPL',
      daily,
      hourly,
      intraday,
      fetchedAt: new Date().toISOString(),
    };

    const dailyIndicators = computeIndicators(daily);
    const hourlyIndicators = computeIndicators(hourly);
    const intradayIndicators = computeIndicators(intraday);
    const regimeResult = detectRegime(daily, dailyIndicators, DEFAULT_CONFIG.strategy);

    const features = buildFeatures(
      mtf,
      dailyIndicators,
      hourlyIndicators,
      intradayIndicators,
      regimeResult,
      DEFAULT_CONFIG.strategy,
      daily,
    );

    expect(features.symbol).toBe('AAPL');
    expect(features.daily.atr14).not.toBeNull();
    expect(features.intraday.rsi14).not.toBeNull();
    expect(features.avgDailyVolume).not.toBeNull();
    expect(typeof features.bullishConfirmation).toBe('boolean');
  });
});

describe('hasBullishConfirmation', () => {
  it('detects bullish momentum candle', () => {
    const bars = [
      { timestamp: 't1', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { timestamp: 't2', open: 100, high: 102, low: 99.5, close: 101.5, volume: 1000 },
    ];
    expect(hasBullishConfirmation(bars)).toBe(true);
  });
});