import type { AppConfig } from '../config/schema.js';
import type { AlpacaOrder, AlpacaPosition } from '../data/alpaca/client.js';
import { isTradingPaused } from '../risk/guards.js';
import type { PortfolioState } from '../risk/types.js';
import type { GateResult } from './types.js';

export interface GateContext {
  config: AppConfig;
  marketOpen: boolean;
  accountStatus: string;
  positions: AlpacaPosition[];
  openOrders: AlpacaOrder[];
  portfolio: PortfolioState | null;
  symbol: string;
  qty: number;
}

function deny(reason: GateResult['reason'], message: string): GateResult {
  return { allowed: false, reason, message };
}

export function checkExecutionGates(ctx: GateContext): GateResult {
  if (!ctx.config.execution.enabled) {
    return deny('execution_disabled', 'Execution is disabled — set EXECUTION_ENABLED=true to trade');
  }

  if (!ctx.marketOpen) {
    return deny('market_closed', 'Market is closed');
  }

  if (ctx.accountStatus !== 'ACTIVE') {
    return deny('account_not_active', `Account status is ${ctx.accountStatus}`);
  }

  if (ctx.portfolio && isTradingPaused(ctx.portfolio, ctx.config.risk)) {
    return deny('trading_paused', 'Trading paused by risk circuit breaker');
  }

  if (ctx.qty <= 0) {
    return deny('invalid_qty', 'Computed quantity must be positive');
  }

  const hasPosition = ctx.positions.some((p) => p.symbol === ctx.symbol);
  if (hasPosition) {
    return deny('position_exists', `Already holding ${ctx.symbol}`);
  }

  const hasPending = ctx.openOrders.some(
    (o) => o.symbol === ctx.symbol && ['new', 'accepted', 'pending_new', 'partially_filled'].includes(o.status),
  );
  if (hasPending) {
    return deny('pending_order_exists', `Pending order exists for ${ctx.symbol}`);
  }

  return { allowed: true };
}