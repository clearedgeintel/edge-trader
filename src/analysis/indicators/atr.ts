import type { Bar } from '../../data/types.js';
import { wilderSmooth } from './utils.js';

function trueRanges(bars: Bar[]): number[] {
  const trs: number[] = [bars[0]!.high - bars[0]!.low];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i]!.high;
    const low = bars[i]!.low;
    const prevClose = bars[i - 1]!.close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trs;
}

export function atr(bars: Bar[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period) return result;

  const smoothed = wilderSmooth(trueRanges(bars), period);
  for (let i = 0; i < smoothed.length; i++) {
    result[period - 1 + i] = smoothed[i]!;
  }
  return result;
}