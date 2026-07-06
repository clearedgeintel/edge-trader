import type { Bar, Timeframe } from './types.js';
import { barKey } from './types.js';

interface CacheEntry {
  bars: Bar[];
  expiresAt: number;
}

export class BarCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly ttlMsByTimeframe: Record<Timeframe, number>) {}

  get(symbol: string, timeframe: Timeframe): Bar[] | null {
    const entry = this.store.get(barKey(symbol, timeframe));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(barKey(symbol, timeframe));
      return null;
    }
    return entry.bars;
  }

  set(symbol: string, timeframe: Timeframe, bars: Bar[]): void {
    this.store.set(barKey(symbol, timeframe), {
      bars,
      expiresAt: Date.now() + this.ttlMsByTimeframe[timeframe],
    });
  }

  invalidate(symbol: string, timeframe?: Timeframe): void {
    if (timeframe) {
      this.store.delete(barKey(symbol, timeframe));
      return;
    }
    for (const tf of ['15Min', '1Hour', '1Day'] as Timeframe[]) {
      this.store.delete(barKey(symbol, tf));
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}