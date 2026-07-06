import type { RiskConfig } from '../config/schema.js';

export interface OpenPosition {
  symbol: string;
  qty: number;
  entryPrice: number;
  stopPrice: number;
  sector?: string;
}

export interface PortfolioState {
  equity: number;
  peakEquity: number;
  dailyPnl: number;
  openPositions: OpenPosition[];
}

export interface TradeProposal {
  symbol: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  atr: number;
  avgDailyVolume: number;
  sector?: string;
  /** Correlation coefficients vs each open position symbol (0–1). */
  correlations?: Record<string, number>;
}

export interface PositionSizeResult {
  qty: number;
  riskDollars: number;
  stopDistance: number;
  rewardRisk: number;
}

export type VetoReason =
  | 'max_positions_exceeded'
  | 'portfolio_heat_exceeded'
  | 'daily_loss_limit_breached'
  | 'max_drawdown_breached'
  | 'insufficient_reward_risk'
  | 'insufficient_liquidity'
  | 'correlation_too_high'
  | 'invalid_stop_distance'
  | 'invalid_equity';

export interface RiskVeto {
  approved: false;
  reason: VetoReason;
  message: string;
}

export interface RiskApproval {
  approved: true;
  sizing: PositionSizeResult;
}

export type RiskDecision = RiskVeto | RiskApproval;

export interface RiskContext {
  config: RiskConfig;
  portfolio: PortfolioState;
}