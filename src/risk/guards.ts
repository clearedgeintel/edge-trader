import type { RiskConfig } from '../config/schema.js';
import { calculateDrawdown, calculateOpenRisk, calculatePositionSize } from './sizing.js';
import type {
  PortfolioState,
  RiskApproval,
  RiskContext,
  RiskDecision,
  RiskVeto,
  TradeProposal,
  VetoReason,
} from './types.js';

function veto(reason: VetoReason, message: string): RiskVeto {
  return { approved: false, reason, message };
}

/**
 * Evaluate a proposed trade against all portfolio guards.
 * The risk module has absolute veto power — no overrides.
 */
export function evaluateTrade(
  proposal: TradeProposal,
  ctx: RiskContext,
): RiskDecision {
  const { config, portfolio } = ctx;

  if (portfolio.equity <= 0) {
    return veto('invalid_equity', 'Equity must be positive to size positions');
  }

  const sizing = calculatePositionSize(portfolio.equity, proposal, config);
  if (!sizing) {
    return veto('invalid_stop_distance', 'Cannot compute position size: invalid ATR or stop distance');
  }

  // minRewardRisk is an inclusive minimum. The strategy sets targets at exactly
  // minRewardRisk × stopDistance, so a float epsilon keeps that from being
  // spuriously rejected (e.g. 3.6 / 1.44 === 2.4999999999999996 < 2.5).
  if (sizing.rewardRisk < config.minRewardRisk - 1e-9) {
    return veto(
      'insufficient_reward_risk',
      `Reward:risk ${sizing.rewardRisk.toFixed(2)} below minimum ${config.minRewardRisk}`,
    );
  }

  if (proposal.avgDailyVolume < config.minAvgDailyVolume) {
    return veto(
      'insufficient_liquidity',
      `Avg daily volume ${proposal.avgDailyVolume} below minimum ${config.minAvgDailyVolume}`,
    );
  }

  if (portfolio.openPositions.length >= config.maxConcurrentPositions) {
    return veto(
      'max_positions_exceeded',
      `Already at max positions (${config.maxConcurrentPositions})`,
    );
  }

  const alreadyOpen = portfolio.openPositions.some((p) => p.symbol === proposal.symbol);
  if (alreadyOpen) {
    return veto('max_positions_exceeded', `Already have an open position in ${proposal.symbol}`);
  }

  const openRisk = calculateOpenRisk(portfolio.openPositions);
  const newTotalRisk = openRisk + sizing.riskDollars;
  const maxHeatDollars = portfolio.equity * config.maxPortfolioHeatPct;
  if (newTotalRisk > maxHeatDollars) {
    return veto(
      'portfolio_heat_exceeded',
      `Total risk $${newTotalRisk.toFixed(2)} would exceed max heat $${maxHeatDollars.toFixed(2)}`,
    );
  }

  const dailyLossLimit = portfolio.equity * config.dailyLossLimitPct;
  if (portfolio.dailyPnl < 0 && Math.abs(portfolio.dailyPnl) >= dailyLossLimit) {
    return veto(
      'daily_loss_limit_breached',
      `Daily loss $${Math.abs(portfolio.dailyPnl).toFixed(2)} hit limit $${dailyLossLimit.toFixed(2)}`,
    );
  }

  const drawdown = calculateDrawdown(portfolio.equity, portfolio.peakEquity);
  if (drawdown >= config.maxDrawdownPausePct) {
    return veto(
      'max_drawdown_breached',
      `Drawdown ${(drawdown * 100).toFixed(1)}% exceeds pause threshold ${(config.maxDrawdownPausePct * 100).toFixed(1)}%`,
    );
  }

  if (proposal.correlations) {
    for (const [symbol, correlation] of Object.entries(proposal.correlations)) {
      const isOpen = portfolio.openPositions.some((p) => p.symbol === symbol);
      if (isOpen && correlation >= config.correlationThreshold) {
        return veto(
          'correlation_too_high',
          `Correlation ${correlation.toFixed(2)} with open position ${symbol} exceeds threshold ${config.correlationThreshold}`,
        );
      }
    }
  }

  return { approved: true, sizing } satisfies RiskApproval;
}

/** Quick check whether trading should be paused entirely (circuit breakers). */
export function isTradingPaused(portfolio: PortfolioState, config: RiskConfig): RiskVeto | null {
  if (portfolio.equity <= 0) {
    return veto('invalid_equity', 'Equity must be positive');
  }

  const dailyLossLimit = portfolio.equity * config.dailyLossLimitPct;
  if (portfolio.dailyPnl < 0 && Math.abs(portfolio.dailyPnl) >= dailyLossLimit) {
    return veto(
      'daily_loss_limit_breached',
      `Daily loss limit reached: $${Math.abs(portfolio.dailyPnl).toFixed(2)}`,
    );
  }

  const drawdown = calculateDrawdown(portfolio.equity, portfolio.peakEquity);
  if (drawdown >= config.maxDrawdownPausePct) {
    return veto(
      'max_drawdown_breached',
      `Max drawdown pause triggered: ${(drawdown * 100).toFixed(1)}%`,
    );
  }

  return null;
}