import type { StrategyConfig } from '../config/schema.js';
import type { Bar, MultiTimeframeBars } from '../data/types.js';
import type { IndicatorSnapshot } from './indicators/index.js';
import type { MarketRegime, RegimeResult } from './regime.js';
import { volumes } from './indicators/utils.js';

export interface SymbolFeatures {
  symbol: string;
  timestamp: string;
  regime: MarketRegime;
  daily: IndicatorSnapshot;
  hourly: IndicatorSnapshot;
  intraday: IndicatorSnapshot;
  priceAboveEma200: boolean;
  ema50SlopePositive: boolean;
  relativeStrengthVsBenchmark: number | null;
  pullbackVolumeDecreasing: boolean;
  rsiInPullbackZone: boolean;
  nearValueZone: boolean;
  bullishConfirmation: boolean;
  avgDailyVolume: number | null;
}

const VALUE_ZONE_TOLERANCE = 0.02;

function isNearValueZone(price: number, indicators: IndicatorSnapshot): boolean {
  const zones = [
    indicators.ema9,
    indicators.ema21,
    indicators.bbLower,
    indicators.vwap,
  ].filter((z): z is number => z !== null);

  return zones.some((zone) => Math.abs(price - zone) / zone <= VALUE_ZONE_TOLERANCE);
}

/** Compare symbol return vs benchmark over the last N daily bars. */
export function relativeStrength(
  symbolDaily: Bar[],
  benchmarkDaily: Bar[],
  lookback = 20,
): number | null {
  if (symbolDaily.length < lookback + 1 || benchmarkDaily.length < lookback + 1) {
    return null;
  }

  const symStart = symbolDaily[symbolDaily.length - lookback - 1]!.close;
  const symEnd = symbolDaily[symbolDaily.length - 1]!.close;
  const benchStart = benchmarkDaily[benchmarkDaily.length - lookback - 1]!.close;
  const benchEnd = benchmarkDaily[benchmarkDaily.length - 1]!.close;

  if (symStart === 0 || benchStart === 0) return null;

  const symReturn = (symEnd - symStart) / symStart;
  const benchReturn = (benchEnd - benchStart) / benchStart;
  return symReturn - benchReturn;
}

/** Volume on recent pullback bars vs prior rally bars. */
export function isPullbackVolumeDecreasing(bars: Bar[], lookback = 10): boolean {
  if (bars.length < lookback) return false;

  const recent = bars.slice(-lookback);
  const mid = Math.floor(lookback / 2);
  const rallyBars = recent.slice(0, mid);
  const pullbackBars = recent.slice(mid);

  const rallyVol = rallyBars.reduce((s, b) => s + b.volume, 0) / rallyBars.length;
  const pullbackVol = pullbackBars.reduce((s, b) => s + b.volume, 0) / pullbackBars.length;

  return pullbackVol < rallyVol;
}

/** Bullish candle with momentum resumption (close > open and close > prior close). */
export function hasBullishConfirmation(bars: Bar[]): boolean {
  if (bars.length < 2) return false;
  const last = bars[bars.length - 1]!;
  const prev = bars[bars.length - 2]!;
  return last.close > last.open && last.close > prev.close;
}

export function buildFeatures(
  mtf: MultiTimeframeBars,
  dailyIndicators: IndicatorSnapshot,
  hourlyIndicators: IndicatorSnapshot,
  intradayIndicators: IndicatorSnapshot,
  regimeResult: RegimeResult,
  config: StrategyConfig,
  benchmarkDaily?: Bar[],
): SymbolFeatures {
  const avgDailyVolume = dailyIndicators.avgVolume20;
  const intradayPrice = intradayIndicators.price;

  let relativeStrengthVsBenchmark: number | null = null;
  if (benchmarkDaily) {
    relativeStrengthVsBenchmark = relativeStrength(mtf.daily, benchmarkDaily);
  }

  const rsiInPullbackZone =
    intradayIndicators.rsi14 !== null &&
    intradayIndicators.rsi14 >= config.rsiMin &&
    intradayIndicators.rsi14 <= config.rsiMax;

  const nearValueZone =
    intradayPrice !== null && isNearValueZone(intradayPrice, intradayIndicators);

  return {
    symbol: mtf.symbol,
    timestamp: mtf.fetchedAt,
    regime: regimeResult.regime,
    daily: dailyIndicators,
    hourly: hourlyIndicators,
    intraday: intradayIndicators,
    priceAboveEma200: regimeResult.priceAboveEma200,
    ema50SlopePositive: regimeResult.ema50SlopePositive,
    relativeStrengthVsBenchmark,
    pullbackVolumeDecreasing: isPullbackVolumeDecreasing(mtf.intraday),
    rsiInPullbackZone,
    nearValueZone,
    bullishConfirmation: hasBullishConfirmation(mtf.intraday),
    avgDailyVolume,
  };
}

/** Average daily volume from the most recent daily bars. */
export function computeAvgDailyVolume(dailyBars: Bar[], period = 20): number | null {
  const vols = volumes(dailyBars);
  if (vols.length < period) return null;
  const slice = vols.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}