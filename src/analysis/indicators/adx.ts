import type { Bar } from '../../data/types.js';
import { wilderSmooth } from './utils.js';

interface DmResult {
  plusDm: number[];
  minusDm: number[];
  tr: number[];
}

function directionalMovement(bars: Bar[]): DmResult {
  const plusDm: number[] = [0];
  const minusDm: number[] = [0];
  const tr: number[] = [bars[0]!.high - bars[0]!.low];

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i]!.high - bars[i - 1]!.high;
    const downMove = bars[i - 1]!.low - bars[i]!.low;

    plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const high = bars[i]!.high;
    const low = bars[i]!.low;
    const prevClose = bars[i - 1]!.close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  return { plusDm, minusDm, tr };
}

export function adx(bars: Bar[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period * 2) return result;

  const { plusDm, minusDm, tr } = directionalMovement(bars);
  const smoothTr = wilderSmooth(tr, period);
  const smoothPlus = wilderSmooth(plusDm, period);
  const smoothMinus = wilderSmooth(minusDm, period);

  const dxValues: number[] = [];
  for (let i = 0; i < smoothTr.length; i++) {
    if (smoothTr[i] === 0) {
      dxValues.push(0);
      continue;
    }
    const plusDi = (100 * smoothPlus[i]!) / smoothTr[i]!;
    const minusDi = (100 * smoothMinus[i]!) / smoothTr[i]!;
    const sum = plusDi + minusDi;
    dxValues.push(sum === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / sum);
  }

  const smoothDx = wilderSmooth(dxValues, period);
  const offset = period - 1 + period - 1 + period - 1;

  for (let i = 0; i < smoothDx.length; i++) {
    const idx = offset + i;
    if (idx < bars.length) result[idx] = smoothDx[i]!;
  }

  return result;
}