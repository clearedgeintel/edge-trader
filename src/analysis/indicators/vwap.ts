import type { Bar } from '../../data/types.js';

function typicalPrice(bar: Bar): number {
  return (bar.high + bar.low + bar.close) / 3;
}

/** Session/cumulative VWAP across the provided bar series. */
export function vwap(bars: Bar[]): (number | null)[] {
  const result: (number | null)[] = new Array(bars.length).fill(null);
  let cumTpVol = 0;
  let cumVol = 0;

  for (let i = 0; i < bars.length; i++) {
    const tp = typicalPrice(bars[i]!);
    const vol = bars[i]!.volume;
    cumTpVol += tp * vol;
    cumVol += vol;
    result[i] = cumVol > 0 ? cumTpVol / cumVol : null;
  }

  return result;
}