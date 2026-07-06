import type { AppConfig } from '../config/schema.js';
import type { SafetyTracker } from './tracker.js';
import type { CircuitTrip } from './types.js';
import { canExecuteInMode, getSizeMultiplier } from '../ramp/rules.js';

export interface CircuitCheckContext {
  config: AppConfig;
  equity: number;
  tracker: SafetyTracker;
}

export interface CircuitCheckResult {
  allowed: boolean;
  reason?: CircuitTrip['reason'];
  message?: string;
  sizeMultiplier: number;
}

export function checkSafetyCircuits(ctx: CircuitCheckContext): CircuitCheckResult {
  const { config, equity, tracker } = ctx;
  const sizeMultiplier = getSizeMultiplier(config.ramp);

  tracker.resetDailyIfNeeded();
  tracker.purgeExpired();

  if (tracker.isKillSwitchActive()) {
    return block('kill_switch', 'KILL_SWITCH is active — all trading halted', sizeMultiplier);
  }

  if (equity < config.safety.minEquity) {
    tracker.tripCircuit('min_equity', `Equity $${equity.toFixed(2)} below minimum $${config.safety.minEquity}`);
    return block('min_equity', `Equity below minimum $${config.safety.minEquity}`, sizeMultiplier);
  }

  if (tracker.hasActiveCircuit('max_orders_per_day')) {
    return block('max_orders_per_day', 'Daily order limit reached', sizeMultiplier);
  }

  if (tracker.hasActiveCircuit('consecutive_losses')) {
    return block('consecutive_losses', 'Consecutive loss cooldown active', sizeMultiplier);
  }

  if (!canExecuteInMode(config.ramp, config.alpaca.paper)) {
    if (config.ramp.mode === 'observation') {
      return block('ramp_observation', 'Ramp mode is observation — execution blocked', 0);
    }
    return block('ramp_observation', `Ramp mode ${config.ramp.mode} does not allow execution`, sizeMultiplier);
  }

  const isLiveMode = config.ramp.mode === 'live_ramp' || config.ramp.mode === 'live_full';
  if (isLiveMode && process.env.LIVE_ENABLED !== 'true') {
    return block('live_not_enabled', 'Live trading requires LIVE_ENABLED=true', sizeMultiplier);
  }

  if (isLiveMode && config.alpaca.paper) {
    return block('paper_live_mismatch', 'Live ramp requires ALPACA_PAPER=false', sizeMultiplier);
  }

  if (!isLiveMode && !config.alpaca.paper && config.execution.enabled) {
    return block('paper_live_mismatch', 'Paper ramp requires ALPACA_PAPER=true', sizeMultiplier);
  }

  return { allowed: true, sizeMultiplier };
}

function block(
  reason: CircuitTrip['reason'],
  message: string,
  sizeMultiplier: number,
): CircuitCheckResult {
  return { allowed: false, reason, message, sizeMultiplier };
}