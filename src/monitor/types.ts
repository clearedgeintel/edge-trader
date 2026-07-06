import type { SignalRationale } from '../strategy/types.js';

export type ExitAction =
  | 'partial_take_profit'
  | 'trailing_stop'
  | 'stop_hit'
  | 'target_hit';

export interface MonitoredPosition {
  symbol: string;
  qty: number;
  originalQty: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  atr: number;
  stopDistance: number;
  trailingStop: number | null;
  partialTaken: boolean;
  bracketManaged: boolean;
  rationale: SignalRationale;
  openedAt: string;
  /** Id of the broker-resident GTC stop order protecting this position, if any. */
  protectiveStopOrderId?: string | null;
  /** Stop price currently resting at the broker (for replace-on-change). */
  protectiveStopPrice?: number | null;
  /** Quantity currently covered by the broker stop (for replace-on-change). */
  protectiveStopQty?: number | null;
}

export interface MonitorAction {
  symbol: string;
  action: ExitAction;
  qty: number;
  price: number;
  reason: string;
}