import type { MarketRegime } from '../analysis/regime.js';
import type { SignalRationale } from '../strategy/types.js';

export type ExitReason = 'stop_hit' | 'target_hit' | 'end_of_data' | 'risk_veto';

export interface BacktestTrade {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnl: number;
  pnlPct: number;
  entryTime: string;
  exitTime: string;
  exitReason: ExitReason;
  regime: MarketRegime;
  score: number;
  mae: number;
  mfe: number;
  rationale: SignalRationale;
  holdingBars: number;
}

export interface BacktestConfig {
  symbol: string;
  startingEquity: number;
  slippageBps: number;
  /** Only evaluate signals every N intraday bars (1 = every bar). */
  signalEveryNBars: number;
}

export interface RegimeMetrics {
  trades: number;
  wins: number;
  pnl: number;
  winRate: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalReturnPct: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdownPct: number;
  expectancy: number;
  finalEquity: number;
  byRegime: Record<string, RegimeMetrics>;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  equityCurve: { timestamp: string; equity: number }[];
}