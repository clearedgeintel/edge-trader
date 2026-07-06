import type { RiskConfig } from '../config/schema.js';
import type { PositionSizeResult, TradeProposal } from './types.js';

/**
 * Position sizing: risk a fixed % of equity per trade using ATR-based stops.
 *
 *   riskDollars = equity * riskPerTradePct
 *   stopDistance = ATR * atrMultiplier
 *   qty = riskDollars / stopDistance
 */
export function calculatePositionSize(
  equity: number,
  proposal: TradeProposal,
  config: RiskConfig,
): PositionSizeResult | null {
  if (equity <= 0) return null;

  const stopDistance = proposal.atr * config.atrMultiplier;
  if (stopDistance <= 0) return null;

  const riskDollars = equity * config.riskPerTradePct;
  const qty = riskDollars / stopDistance;

  const rewardDistance = Math.abs(proposal.targetPrice - proposal.entryPrice);
  const rewardRisk = rewardDistance / stopDistance;

  return {
    qty,
    riskDollars,
    stopDistance,
    rewardRisk,
  };
}

/** Sum of dollar risk across all open positions. */
export function calculateOpenRisk(positions: { qty: number; entryPrice: number; stopPrice: number }[]): number {
  return positions.reduce((total, pos) => {
    const stopDistance = Math.abs(pos.entryPrice - pos.stopPrice);
    return total + stopDistance * pos.qty;
  }, 0);
}

/** Drawdown from peak equity as a fraction (0–1). */
/** Scale position size for live ramp (e.g. 0.1 = 10% of normal size). */
export function applySizeMultiplier(
  sizing: PositionSizeResult,
  multiplier: number,
): PositionSizeResult {
  if (multiplier >= 1) return sizing;
  return {
    ...sizing,
    qty: sizing.qty * multiplier,
    riskDollars: sizing.riskDollars * multiplier,
  };
}

export function calculateDrawdown(equity: number, peakEquity: number): number {
  if (peakEquity <= 0) return 0;
  return Math.max(0, (peakEquity - equity) / peakEquity);
}