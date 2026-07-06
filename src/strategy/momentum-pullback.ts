import type { SymbolFeatures } from '../analysis/features.js';
import type { StrategyConfig } from '../config/schema.js';
import type { RiskConfig } from '../config/schema.js';
import type { Strategy, StrategyResult } from './types.js';
import type { Signal, SignalRationale } from './types.js';

interface ScoreComponent {
  weight: number;
  passed: boolean;
  reason: string;
}

const WEIGHTS = {
  trendingBull: 25,
  adxStrong: 15,
  relativeStrength: 10,
  nearValueZone: 20,
  volumeDecreasing: 15,
  rsiInZone: 10,
  bullishConfirmation: 5,
} as const;

export class MomentumPullbackStrategy implements Strategy {
  readonly name = 'MomentumPullback';

  constructor(
    private readonly strategyConfig: StrategyConfig,
    private readonly riskConfig: RiskConfig,
  ) {}

  evaluate(features: SymbolFeatures, equity: number): StrategyResult {
    const components = this.scoreComponents(features);
    const score = Math.round(
      components.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0),
    );
    const reasons = components.filter((c) => c.passed).map((c) => c.reason);

    if (score < this.strategyConfig.minConfluenceScore) {
      return { signal: null, score, reasons };
    }

    const price = features.intraday.price;
    const atr = features.intraday.atr14;
    if (price === null || atr === null || atr <= 0) {
      return { signal: null, score, reasons: [...reasons, 'Missing price or ATR'] };
    }

    const stopDistance = atr * this.riskConfig.atrMultiplier;
    const suggestedStop = price - stopDistance;
    const suggestedTarget = price + stopDistance * this.riskConfig.minRewardRisk;
    const riskDollars = equity > 0 ? equity * this.riskConfig.riskPerTradePct : null;

    const rationale: SignalRationale = {
      symbol: features.symbol,
      score,
      reasons,
      indicators: this.buildIndicators(features),
      regime: features.regime,
      suggested_stop: roundPrice(suggestedStop),
      suggested_target: roundPrice(suggestedTarget),
      risk_dollars: riskDollars !== null ? roundPrice(riskDollars) : null,
    };

    const signal: Signal = {
      symbol: features.symbol,
      score,
      rationale,
      proposal: {
        symbol: features.symbol,
        entryPrice: price,
        stopPrice: suggestedStop,
        targetPrice: suggestedTarget,
        atr,
        avgDailyVolume: features.avgDailyVolume ?? 0,
      },
    };

    return { signal, score, reasons };
  }

  private scoreComponents(features: SymbolFeatures): ScoreComponent[] {
    const adx = features.daily.adx14;

    return [
      {
        weight: WEIGHTS.trendingBull,
        passed: features.regime === 'trending_bull' && features.priceAboveEma200,
        reason: 'Daily trend strong (bullish regime, above EMA200)',
      },
      {
        weight: WEIGHTS.adxStrong,
        passed: adx !== null && adx >= this.strategyConfig.adxThreshold,
        reason: `ADX trending (${adx?.toFixed(1) ?? 'n/a'} >= ${this.strategyConfig.adxThreshold})`,
      },
      {
        weight: WEIGHTS.relativeStrength,
        passed:
          features.relativeStrengthVsBenchmark !== null &&
          features.relativeStrengthVsBenchmark > 0,
        reason: 'Positive relative strength vs benchmark',
      },
      {
        weight: WEIGHTS.nearValueZone,
        passed: features.nearValueZone,
        reason: 'Pullback into value zone (EMA/BB/VWAP)',
      },
      {
        weight: WEIGHTS.volumeDecreasing,
        passed: features.pullbackVolumeDecreasing,
        reason: 'Volume decreasing on pullback',
      },
      {
        weight: WEIGHTS.rsiInZone,
        passed: features.rsiInPullbackZone,
        reason: `RSI resilient (${features.intraday.rsi14?.toFixed(1) ?? 'n/a'} in ${this.strategyConfig.rsiMin}–${this.strategyConfig.rsiMax})`,
      },
      {
        weight: WEIGHTS.bullishConfirmation,
        passed: features.bullishConfirmation,
        reason: 'Bullish confirmation candle',
      },
    ];
  }

  private buildIndicators(features: SymbolFeatures): Record<string, number> {
    const ind: Record<string, number> = {};
    if (features.daily.adx14 !== null) ind.adx = features.daily.adx14;
    if (features.intraday.rsi14 !== null) ind.rsi_15m = features.intraday.rsi14;
    if (features.intraday.ema9 !== null) ind.ema9 = features.intraday.ema9;
    if (features.intraday.ema21 !== null) ind.ema21 = features.intraday.ema21;
    if (features.daily.ema200 !== null) ind.ema200 = features.daily.ema200;
    if (features.intraday.atr14 !== null) ind.atr14 = features.intraday.atr14;
    if (features.intraday.vwap !== null) ind.vwap = features.intraday.vwap;
    if (features.relativeStrengthVsBenchmark !== null) {
      ind.relative_strength = features.relativeStrengthVsBenchmark;
    }
    return ind;
  }
}

function roundPrice(n: number): number {
  return Math.round(n * 100) / 100;
}