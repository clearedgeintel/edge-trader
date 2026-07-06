import type { PerformanceSnapshot } from '../performance/types.js';
import type { SignalRationale } from '../strategy/types.js';
import type { ClosedTrade } from '../performance/types.js';

export type ReportCardType = 'signal' | 'trade_close';
export type ReportCardSource = 'template' | 'llm';

export interface ReportCardContent {
  thesisSummary: string;
  riskSnapshot: string;
  educationalExplanation: string;
  suggestedTweaks: string[];
}

export interface ReportCard {
  id: string;
  type: ReportCardType;
  symbol: string;
  createdAt: string;
  source: ReportCardSource;
  content: ReportCardContent;
}

export interface ReportCardContext {
  rationale: SignalRationale;
  trade?: ClosedTrade;
  performance: PerformanceSnapshot;
  equity: number;
  riskPerTradePct: number;
}