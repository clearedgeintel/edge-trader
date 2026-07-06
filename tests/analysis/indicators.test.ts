import { adx } from '../../src/analysis/indicators/adx.js';
import { atr } from '../../src/analysis/indicators/atr.js';
import { bollingerBands } from '../../src/analysis/indicators/bollinger.js';
import { ema, emaSlope } from '../../src/analysis/indicators/ema.js';
import { computeIndicators } from '../../src/analysis/indicators/index.js';
import { rsi } from '../../src/analysis/indicators/rsi.js';
import { lastValue } from '../../src/analysis/indicators/utils.js';
import { vwap } from '../../src/analysis/indicators/vwap.js';
import type { Bar } from '../../src/data/types.js';

function makeTrendingBars(count: number, start = 100, step = 0.5): Bar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = start + i * step;
    return {
      timestamp: new Date(2024, 0, i + 1).toISOString(),
      open: close - 0.2,
      high: close + 0.5,
      low: close - 0.5,
      close,
      volume: 1000 + i * 10,
    };
  });
}

describe('EMA', () => {
  it('computes rising EMA on uptrend', () => {
    const bars = makeTrendingBars(50);
    const series = ema(bars, 9);
    const val = lastValue(series);
    expect(val).not.toBeNull();
    expect(val!).toBeGreaterThan(bars[0]!.close);
  });

  it('returns positive slope on uptrend', () => {
    const bars = makeTrendingBars(60);
    const slope = emaSlope(bars, 21, 5);
    expect(slope).not.toBeNull();
    expect(slope!).toBeGreaterThan(0);
  });
});

describe('RSI', () => {
  it('stays elevated on sustained uptrend', () => {
    const bars = makeTrendingBars(30, 100, 1);
    const series = rsi(bars, 14);
    const val = lastValue(series);
    expect(val).not.toBeNull();
    expect(val!).toBeGreaterThan(50);
  });
});

describe('ATR', () => {
  it('returns positive values', () => {
    const bars = makeTrendingBars(30);
    const series = atr(bars, 14);
    const val = lastValue(series);
    expect(val).not.toBeNull();
    expect(val!).toBeGreaterThan(0);
  });
});

describe('ADX', () => {
  it('produces values on trending data', () => {
    const bars = makeTrendingBars(60, 100, 1);
    const series = adx(bars, 14);
    const val = lastValue(series);
    expect(val).not.toBeNull();
    expect(val!).toBeGreaterThan(0);
  });
});

describe('Bollinger Bands', () => {
  it('upper > middle > lower on last bar', () => {
    const bars = makeTrendingBars(30);
    const bb = bollingerBands(bars, 20);
    const upper = lastValue(bb.upper);
    const middle = lastValue(bb.middle);
    const lower = lastValue(bb.lower);
    expect(upper).not.toBeNull();
    expect(middle).not.toBeNull();
    expect(lower).not.toBeNull();
    expect(upper!).toBeGreaterThan(middle!);
    expect(middle!).toBeGreaterThan(lower!);
  });
});

describe('VWAP', () => {
  it('tracks within price range', () => {
    const bars = makeTrendingBars(10);
    const series = vwap(bars);
    const val = lastValue(series);
    expect(val).not.toBeNull();
    expect(val!).toBeGreaterThan(bars[0]!.low);
    expect(val!).toBeLessThan(bars[bars.length - 1]!.high + 1);
  });
});

describe('computeIndicators', () => {
  it('returns full snapshot for sufficient bars', () => {
    const bars = makeTrendingBars(250);
    const snap = computeIndicators(bars);
    expect(snap.price).not.toBeNull();
    expect(snap.ema9).not.toBeNull();
    expect(snap.ema200).not.toBeNull();
    expect(snap.rsi14).not.toBeNull();
    expect(snap.atr14).not.toBeNull();
    expect(snap.avgVolume20).not.toBeNull();
  });

  it('returns nulls for empty bars', () => {
    const snap = computeIndicators([]);
    expect(snap.price).toBeNull();
    expect(snap.ema9).toBeNull();
  });
});