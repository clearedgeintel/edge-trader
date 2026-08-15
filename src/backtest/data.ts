import { DateTime } from 'luxon';
import type { AlpacaBar, AlpacaClient } from '../data/alpaca/client.js';
import type { Bar } from '../data/types.js';

export interface SymbolBars {
  daily: Bar[];
  hourly: Bar[];
  intraday: Bar[];
}

function toBar(b: AlpacaBar): Bar {
  return {
    timestamp: b.t,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
    vwap: b.vw,
  };
}

const iso = (dt: DateTime): string => dt.toUTC().toISO()!;

/**
 * Fetch real historical bars for a backtest. The 15-minute series defines the
 * simulation window; daily/hourly reach further back so indicators (EMA200 etc.)
 * are warm from the first simulated bar. Returns null if there isn't enough
 * daily history to compute the trend filter.
 */
export async function fetchBacktestBars(
  client: AlpacaClient,
  symbol: string,
  intradayDays: number,
): Promise<SymbolBars | null> {
  const now = DateTime.utc();
  const intradayStart = now.minus({ days: intradayDays });

  const [daily, hourly, intraday] = await Promise.all([
    // ~300 extra calendar days so ≥200 trading days precede the window (EMA200).
    client.getBarsRange(symbol, '1Day', iso(intradayStart.minus({ days: 320 }))),
    client.getBarsRange(symbol, '1Hour', iso(intradayStart.minus({ days: 45 }))),
    client.getBarsRange(symbol, '15Min', iso(intradayStart)),
  ]);

  if (daily.length < 210 || intraday.length < 100) return null;

  const sortByTs = (a: Bar, b: Bar) => a.timestamp.localeCompare(b.timestamp);
  return {
    daily: daily.map(toBar).sort(sortByTs),
    hourly: hourly.map(toBar).sort(sortByTs),
    intraday: intraday.map(toBar).sort(sortByTs),
  };
}

/** Fetch the benchmark's daily bars once, reused across every symbol in a sweep. */
export async function fetchBenchmarkDaily(
  client: AlpacaClient,
  symbol: string,
  intradayDays: number,
): Promise<Bar[]> {
  const start = DateTime.utc().minus({ days: intradayDays + 320 });
  const bars = await client.getBarsRange(symbol, '1Day', iso(start));
  return bars.map(toBar).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
