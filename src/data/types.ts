export type Timeframe = '15Min' | '1Hour' | '1Day';

export interface Bar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap?: number;
}

export interface MultiTimeframeBars {
  symbol: string;
  daily: Bar[];
  hourly: Bar[];
  intraday: Bar[];
  fetchedAt: string;
}

export function barKey(symbol: string, timeframe: Timeframe): string {
  return `${symbol}:${timeframe}`;
}