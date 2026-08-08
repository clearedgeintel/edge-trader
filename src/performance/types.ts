import type { MarketRegime } from '../analysis/regime.js';
import type { SignalRationale } from '../strategy/types.js';

export interface ClosedTrade {
  id: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnl: number;
  pnlPct: number;
  exitReason: string;
  regime: MarketRegime;
  score: number;
  rationale: SignalRationale;
  openedAt: string;
  closedAt: string;
}

export interface SignalRecord {
  id: string;
  symbol: string;
  score: number;
  regime: MarketRegime;
  rationale: SignalRationale;
  executed: boolean;
  createdAt: string;
}

export interface DailyPerformance {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
}

export interface PerfBreakdownRow {
  key: string;
  trades: number;
  winRate: number;
  netPnl: number;
  avgR: number;
}

export interface PerformanceAnalytics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  avgR: number;
  /** Adopted (score-0) positions the bot re-adopted from Alpaca — excluded from the metrics above. */
  adoptedTrades: number;
  adoptedNetPnl: number;
  byExitReason: PerfBreakdownRow[];
  byScoreBand: PerfBreakdownRow[];
  byRegime: PerfBreakdownRow[];
  bySymbol: PerfBreakdownRow[];
}

export interface PerformanceSnapshot {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  todayPnl: number;
  openPositions: number;
  recentSignals: number;
}