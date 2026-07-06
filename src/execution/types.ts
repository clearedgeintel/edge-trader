import type { SignalRationale } from '../strategy/types.js';

export type GateFailureReason =
  | 'execution_disabled'
  | 'market_closed'
  | 'account_not_active'
  | 'position_exists'
  | 'pending_order_exists'
  | 'trading_paused'
  | 'invalid_qty'
  | 'safety_circuit';

export interface GateResult {
  allowed: boolean;
  reason?: GateFailureReason;
  message?: string;
}

export interface ExecutionResult {
  success: boolean;
  symbol: string;
  orderId?: string;
  qty?: number;
  usedBracket: boolean;
  message: string;
}

export interface ExecutionRecord {
  orderId: string;
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  rationale: SignalRationale;
  executedAt: string;
  usedBracket: boolean;
}