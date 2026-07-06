import type { Bar } from '../../data/types.js';
import { closes, sma, stdDev } from './utils.js';

export interface BollingerBands {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

export function bollingerBands(
  bars: Bar[],
  period = 20,
  stdMultiplier = 2,
): BollingerBands {
  const values = closes(bars);
  const middle = sma(values, period);
  const std = stdDev(values, period);

  const upper: (number | null)[] = new Array(values.length).fill(null);
  const lower: (number | null)[] = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (middle[i] === null || std[i] === null) continue;
    upper[i] = middle[i]! + stdMultiplier * std[i]!;
    lower[i] = middle[i]! - stdMultiplier * std[i]!;
  }

  return { upper, middle, lower };
}