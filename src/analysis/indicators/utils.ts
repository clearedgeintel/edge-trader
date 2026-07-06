import type { Bar } from '../../data/types.js';

export function closes(bars: Bar[]): number[] {
  return bars.map((b) => b.close);
}

export function highs(bars: Bar[]): number[] {
  return bars.map((b) => b.high);
}

export function lows(bars: Bar[]): number[] {
  return bars.map((b) => b.low);
}

export function volumes(bars: Bar[]): number[] {
  return bars.map((b) => b.volume);
}

/** Last value or null if series is empty / all null. */
export function lastValue(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] !== null) return series[i];
  }
  return null;
}

/** Wilder smoothing: first value is SMA of first `period` values, then recursive. */
export function wilderSmooth(values: number[], period: number): number[] {
  if (values.length < period) return [];

  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  result.push(prev);

  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]!) / period;
    result.push(prev);
  }
  return result;
}

export function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  result[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    sum += values[i]! - values[i - period]!;
    result[i] = sum / period;
  }
  return result;
}

export function stdDev(values: number[], period: number): (number | null)[] {
  const means = sma(values, period);
  const result: (number | null)[] = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const mean = means[i];
    if (mean === null) continue;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j]! - mean;
      sumSq += diff * diff;
    }
    result[i] = Math.sqrt(sumSq / period);
  }
  return result;
}