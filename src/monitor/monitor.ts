import type { MonitorConfig } from '../config/schema.js';
import type { MonitoredPosition, MonitorAction } from './types.js';

export function evaluatePosition(
  pos: MonitoredPosition,
  currentPrice: number,
  config: MonitorConfig,
): MonitorAction | null {
  if (!config.enabled || pos.bracketManaged) return null;

  const profit = currentPrice - pos.entryPrice;
  const rMultiple = pos.stopDistance > 0 ? profit / pos.stopDistance : 0;

  if (
    !pos.partialTaken &&
    config.partialTakeProfitPct > 0 &&
    rMultiple >= config.partialTakeProfitR
  ) {
    const sellQty = pos.qty * config.partialTakeProfitPct;
    if (sellQty > 0) {
      return {
        symbol: pos.symbol,
        action: 'partial_take_profit',
        qty: sellQty,
        price: currentPrice,
        reason: `Partial take-profit at ${rMultiple.toFixed(1)}R`,
      };
    }
  }

  const effectiveStop =
    pos.trailingStop !== null
      ? Math.max(pos.trailingStop, pos.stopPrice)
      : pos.stopPrice;

  if (currentPrice <= effectiveStop) {
    const isTrail = pos.trailingStop !== null && pos.trailingStop >= pos.stopPrice;
    return {
      symbol: pos.symbol,
      action: isTrail ? 'trailing_stop' : 'stop_hit',
      qty: pos.qty,
      price: currentPrice,
      reason: isTrail
        ? `Trailing stop hit at $${effectiveStop.toFixed(2)}`
        : `Stop loss hit at $${pos.stopPrice.toFixed(2)}`,
    };
  }

  if (currentPrice >= pos.targetPrice) {
    return {
      symbol: pos.symbol,
      action: 'target_hit',
      qty: pos.qty,
      price: currentPrice,
      reason: `Target hit at $${pos.targetPrice.toFixed(2)}`,
    };
  }

  return null;
}

export function updateTrailingStop(
  pos: MonitoredPosition,
  currentPrice: number,
  config: MonitorConfig,
): number | null {
  if (!config.enabled || pos.bracketManaged || pos.atr <= 0) return pos.trailingStop;

  const profit = currentPrice - pos.entryPrice;
  const rMultiple = pos.stopDistance > 0 ? profit / pos.stopDistance : 0;

  if (rMultiple < config.trailingStopActivationR) return pos.trailingStop;

  const trailDistance = pos.atr * config.trailingStopAtrMultiplier;
  const newTrail = currentPrice - trailDistance;
  const current = pos.trailingStop ?? pos.stopPrice;
  return Math.max(current, newTrail);
}

export function applyPartialExit(pos: MonitoredPosition, soldQty: number): MonitoredPosition {
  return {
    ...pos,
    qty: pos.qty - soldQty,
    partialTaken: true,
  };
}