import { BarCache } from '../../src/data/cache.js';
import type { Bar } from '../../src/data/types.js';

function makeBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(2024, 0, i + 1).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  }));
}

describe('BarCache', () => {
  const ttlMs = { '15Min': 60_000, '1Hour': 60_000, '1Day': 60_000 };

  it('stores and retrieves bars', () => {
    const cache = new BarCache(ttlMs);
    const bars = makeBars(5);
    cache.set('AAPL', '15Min', bars);
    expect(cache.get('AAPL', '15Min')).toEqual(bars);
  });

  it('returns null for cache miss', () => {
    const cache = new BarCache(ttlMs);
    expect(cache.get('AAPL', '1Hour')).toBeNull();
  });

  it('invalidates by symbol and timeframe', () => {
    const cache = new BarCache(ttlMs);
    cache.set('AAPL', '15Min', makeBars(3));
    cache.invalidate('AAPL', '15Min');
    expect(cache.get('AAPL', '15Min')).toBeNull();
  });

  it('invalidates all timeframes for a symbol', () => {
    const cache = new BarCache(ttlMs);
    cache.set('AAPL', '15Min', makeBars(3));
    cache.set('AAPL', '1Hour', makeBars(3));
    cache.invalidate('AAPL');
    expect(cache.get('AAPL', '15Min')).toBeNull();
    expect(cache.get('AAPL', '1Hour')).toBeNull();
  });

  it('expires entries after TTL', () => {
    const cache = new BarCache({ '15Min': 1, '1Hour': 1, '1Day': 1 });
    cache.set('AAPL', '15Min', makeBars(3));
    const originalNow = Date.now;
    Date.now = () => originalNow() + 2000;
    expect(cache.get('AAPL', '15Min')).toBeNull();
    Date.now = originalNow;
  });
});