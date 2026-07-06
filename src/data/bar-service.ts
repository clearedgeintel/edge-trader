import { DateTime } from 'luxon';
import type { DataConfig } from '../config/schema.js';
import type { AlpacaBar, AlpacaClient } from './alpaca/client.js';
import { BarCache } from './cache.js';
import type { Bar, MultiTimeframeBars, Timeframe } from './types.js';

function toBar(alpacaBar: AlpacaBar): Bar {
  return {
    timestamp: alpacaBar.t,
    open: alpacaBar.o,
    high: alpacaBar.h,
    low: alpacaBar.l,
    close: alpacaBar.c,
    volume: alpacaBar.v,
    vwap: alpacaBar.vw,
  };
}

function lookbackStart(timeframe: Timeframe, bars: number, timezone: string): string {
  const now = DateTime.now().setZone(timezone);
  switch (timeframe) {
    case '15Min':
      return now.minus({ minutes: bars * 15 }).toISO()!;
    case '1Hour':
      return now.minus({ hours: bars }).toISO()!;
    case '1Day':
      return now.minus({ days: Math.ceil(bars * 1.4) }).toISO()!;
  }
}

export class BarDataService {
  private readonly cache: BarCache;

  constructor(
    private readonly client: AlpacaClient,
    private readonly config: DataConfig,
    private readonly timezone: string,
  ) {
    const ttlMs: Record<Timeframe, number> = {
      '15Min': config.cacheTtlMinutes['15Min'] * 60_000,
      '1Hour': config.cacheTtlMinutes['1Hour'] * 60_000,
      '1Day': config.cacheTtlMinutes['1Day'] * 60_000,
    };
    this.cache = new BarCache(ttlMs);
  }

  async getBars(symbol: string, timeframe: Timeframe): Promise<Bar[]> {
    const cached = this.cache.get(symbol, timeframe);
    if (cached) return cached;

    const lookback = this.config.lookbackBars[timeframe];
    const start = lookbackStart(timeframe, lookback, this.timezone);
    const raw = await this.client.getBars(symbol, timeframe, start, undefined, lookback);
    const bars = raw.map(toBar).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    this.cache.set(symbol, timeframe, bars);
    return bars;
  }

  async getMultiTimeframe(symbol: string): Promise<MultiTimeframeBars> {
    const [daily, hourly, intraday] = await Promise.all([
      this.getBars(symbol, '1Day'),
      this.getBars(symbol, '1Hour'),
      this.getBars(symbol, '15Min'),
    ]);

    return {
      symbol,
      daily,
      hourly,
      intraday,
      fetchedAt: new Date().toISOString(),
    };
  }

  getCache(): BarCache {
    return this.cache;
  }
}