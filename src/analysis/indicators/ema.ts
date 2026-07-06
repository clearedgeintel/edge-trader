import type { Bar } from '../../data/types.js';
import { closes } from './utils.js';

export function ema(bars: Bar[], period: number): (number | null)[] {
  const values = closes(bars);
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;

  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  result[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}

/** Slope of EMA over the last `lookback` bars (positive = rising). */
export function emaSlope(
  bars: Bar[],
  period: number,
  lookback = 5,
): number | null {
  const series = ema(bars, period);
  const end = series.length - 1;
  const start = end - lookback;
  if (start < 0) return null;

  const endVal = series[end];
  const startVal = series[start];
  if (endVal === null || startVal === null) return null;

  return (endVal - startVal) / lookback;
}