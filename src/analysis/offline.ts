import type { AppConfig, StrategyConfig } from '../config/schema.js';
import type { Bar, MultiTimeframeBars } from '../data/types.js';
import { computeIndicators } from './indicators/index.js';
import { buildFeatures, type SymbolFeatures } from './features.js';
import { detectRegime } from './regime.js';

export function sliceBarsUpTo(bars: Bar[], asOf: string): Bar[] {
  return bars.filter((b) => b.timestamp <= asOf);
}

export function analyzeFromBars(
  symbol: string,
  daily: Bar[],
  hourly: Bar[],
  intraday: Bar[],
  benchmarkDaily: Bar[],
  strategyConfig: StrategyConfig,
  asOf: string,
): SymbolFeatures | null {
  const slicedDaily = sliceBarsUpTo(daily, asOf);
  const slicedHourly = sliceBarsUpTo(hourly, asOf);
  const slicedIntraday = sliceBarsUpTo(intraday, asOf);
  const slicedBenchmark = sliceBarsUpTo(benchmarkDaily, asOf);

  if (slicedDaily.length < 50 || slicedIntraday.length < 30) return null;

  const mtf: MultiTimeframeBars = {
    symbol,
    daily: slicedDaily,
    hourly: slicedHourly,
    intraday: slicedIntraday,
    fetchedAt: asOf,
  };

  const dailyIndicators = computeIndicators(slicedDaily);
  const hourlyIndicators = computeIndicators(slicedHourly);
  const intradayIndicators = computeIndicators(slicedIntraday);
  const regimeResult = detectRegime(slicedDaily, dailyIndicators, strategyConfig);

  return buildFeatures(
    mtf,
    dailyIndicators,
    hourlyIndicators,
    intradayIndicators,
    regimeResult,
    strategyConfig,
    slicedBenchmark.length > 0 ? slicedBenchmark : undefined,
  );
}

export function analyzeMtfFromBars(
  mtf: MultiTimeframeBars,
  benchmarkDaily: Bar[],
  config: AppConfig,
  asOf?: string,
): SymbolFeatures | null {
  const timestamp = asOf ?? mtf.intraday[mtf.intraday.length - 1]?.timestamp;
  if (!timestamp) return null;

  return analyzeFromBars(
    mtf.symbol,
    mtf.daily,
    mtf.hourly,
    mtf.intraday,
    benchmarkDaily,
    config.strategy,
    timestamp,
  );
}