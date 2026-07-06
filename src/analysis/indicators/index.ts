import type { Bar } from '../../data/types.js';
import { adx } from './adx.js';
import { atr } from './atr.js';
import { bollingerBands } from './bollinger.js';
import { ema } from './ema.js';
import { rsi } from './rsi.js';
import { lastValue, sma, volumes } from './utils.js';
import { vwap } from './vwap.js';

export * from './ema.js';
export * from './rsi.js';
export * from './adx.js';
export * from './atr.js';
export * from './bollinger.js';
export * from './vwap.js';
export * from './utils.js';

export interface IndicatorSnapshot {
  price: number | null;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  adx14: number | null;
  atr14: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  vwap: number | null;
  avgVolume20: number | null;
}

export function computeIndicators(bars: Bar[]): IndicatorSnapshot {
  if (bars.length === 0) {
    return {
      price: null,
      ema9: null,
      ema21: null,
      ema50: null,
      ema200: null,
      rsi14: null,
      adx14: null,
      atr14: null,
      bbUpper: null,
      bbMiddle: null,
      bbLower: null,
      vwap: null,
      avgVolume20: null,
    };
  }

  const last = bars[bars.length - 1]!;
  const bb = bollingerBands(bars);

  return {
    price: last.close,
    ema9: lastValue(ema(bars, 9)),
    ema21: lastValue(ema(bars, 21)),
    ema50: lastValue(ema(bars, 50)),
    ema200: lastValue(ema(bars, 200)),
    rsi14: lastValue(rsi(bars, 14)),
    adx14: lastValue(adx(bars, 14)),
    atr14: lastValue(atr(bars, 14)),
    bbUpper: lastValue(bb.upper),
    bbMiddle: lastValue(bb.middle),
    bbLower: lastValue(bb.lower),
    vwap: lastValue(vwap(bars)),
    avgVolume20: lastValue(sma(volumes(bars), 20)),
  };
}