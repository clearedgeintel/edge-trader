import type { MarketRegime } from '../analysis/regime.js';
import type { TradeProposal } from '../risk/types.js';

export interface SignalRationale {
  symbol: string;
  score: number;
  reasons: string[];
  indicators: Record<string, number>;
  regime: MarketRegime;
  suggested_stop: number;
  suggested_target: number;
  risk_dollars: number | null;
}

export interface Signal {
  symbol: string;
  score: number;
  rationale: SignalRationale;
  proposal: TradeProposal;
}

export interface StrategyResult {
  signal: Signal | null;
  score: number;
  reasons: string[];
}

export interface Strategy {
  readonly name: string;
  evaluate(
    features: import('../analysis/features.js').SymbolFeatures,
    equity: number,
  ): StrategyResult;
}