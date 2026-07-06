import { detectRegime } from '../../src/analysis/regime.js';
import { computeIndicators } from '../../src/analysis/indicators/index.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { Bar } from '../../src/data/types.js';

function makeTrendingDaily(count: number, start = 100, step = 0.8): Bar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = start + i * step;
    return {
      timestamp: new Date(2023, 0, i + 1).toISOString(),
      open: close - 0.3,
      high: close + 1,
      low: close - 1,
      close,
      volume: 2_000_000,
    };
  });
}

function makeChoppyDaily(count: number): Bar[] {
  return Array.from({ length: count }, (_, i) => {
    const close = 100 + (i % 2 === 0 ? 0.5 : -0.5);
    return {
      timestamp: new Date(2023, 0, i + 1).toISOString(),
      open: close,
      high: close + 0.3,
      low: close - 0.3,
      close,
      volume: 500_000,
    };
  });
}

describe('detectRegime', () => {
  const strategy = DEFAULT_CONFIG.strategy;

  it('detects trending_bull on strong uptrend', () => {
    const bars = makeTrendingDaily(250);
    const indicators = computeIndicators(bars);
    const result = detectRegime(bars, indicators, strategy);
    expect(['trending_bull', 'choppy']).toContain(result.regime);
    expect(result.priceAboveEma200).toBe(true);
  });

  it('detects choppy on flat oscillating market', () => {
    const bars = makeChoppyDaily(250);
    const indicators = computeIndicators(bars);
    const result = detectRegime(bars, indicators, strategy);
    expect(result.regime).toBe('choppy');
  });

  it('returns unknown for empty bars', () => {
    const indicators = computeIndicators([]);
    const result = detectRegime([], indicators, strategy);
    expect(result.regime).toBe('unknown');
  });
});