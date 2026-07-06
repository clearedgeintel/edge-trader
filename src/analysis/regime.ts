import type { StrategyConfig } from '../config/schema.js';
import type { Bar } from '../data/types.js';
import { ema, emaSlope } from './indicators/ema.js';
import { adx } from './indicators/adx.js';
import { lastValue } from './indicators/utils.js';
import type { IndicatorSnapshot } from './indicators/index.js';

export type MarketRegime = 'trending_bull' | 'trending_bear' | 'choppy' | 'unknown';

export interface RegimeResult {
  regime: MarketRegime;
  adx: number | null;
  priceAboveEma200: boolean;
  ema50SlopePositive: boolean;
  ema200SlopePositive: boolean;
}

/**
 * Classify market regime from daily bars using trend filter rules from the spec:
 * - Price above EMA(200) or positive EMA slope
 * - ADX > threshold for trending; below = choppy
 */
export function detectRegime(
  dailyBars: Bar[],
  dailyIndicators: IndicatorSnapshot,
  config: StrategyConfig,
): RegimeResult {
  if (dailyBars.length === 0 || dailyIndicators.price === null) {
    return {
      regime: 'unknown',
      adx: null,
      priceAboveEma200: false,
      ema50SlopePositive: false,
      ema200SlopePositive: false,
    };
  }

  const price = dailyIndicators.price;
  const ema200 = dailyIndicators.ema200;
  const adxVal = dailyIndicators.adx14 ?? lastValue(adx(dailyBars, 14));
  const ema50SlopeVal = emaSlope(dailyBars, 50, 5);
  const ema200SlopeVal = emaSlope(dailyBars, 200, 5);

  const priceAboveEma200 = ema200 !== null ? price > ema200 : false;
  const ema50SlopePositive = ema50SlopeVal !== null && ema50SlopeVal > 0;
  const ema200SlopePositive = ema200SlopeVal !== null && ema200SlopeVal > 0;

  const trendConfirmed =
    priceAboveEma200 || ema50SlopePositive || ema200SlopePositive;

  if (adxVal === null) {
    return {
      regime: 'unknown',
      adx: null,
      priceAboveEma200,
      ema50SlopePositive,
      ema200SlopePositive,
    };
  }

  if (adxVal < config.adxThreshold) {
    return {
      regime: 'choppy',
      adx: adxVal,
      priceAboveEma200,
      ema50SlopePositive,
      ema200SlopePositive,
    };
  }

  if (trendConfirmed) {
    const ema50 = lastValue(ema(dailyBars, 50));
    const bearish = ema50 !== null && price < ema50 && !ema50SlopePositive;
    return {
      regime: bearish ? 'trending_bear' : 'trending_bull',
      adx: adxVal,
      priceAboveEma200,
      ema50SlopePositive,
      ema200SlopePositive,
    };
  }

  return {
    regime: 'choppy',
    adx: adxVal,
    priceAboveEma200,
    ema50SlopePositive,
    ema200SlopePositive,
  };
}