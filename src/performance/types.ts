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