import type { RampConfig, RampMode } from '../config/schema.js';
import type { PerformanceSnapshot } from '../performance/types.js';
import type { AdvancementCriteria } from './types.js';

const MODE_ORDER: RampMode[] = ['observation', 'paper', 'live_ramp', 'live_full'];

export function getSizeMultiplier(ramp: RampConfig): number {
  switch (ramp.mode) {
    case 'observation':
      return 0;
    case 'paper':
      return 1;
    case 'live_ramp':
      return ramp.liveRampSizePct;
    case 'live_full':
      return 1;
  }
}

export function canExecuteInMode(ramp: RampConfig, isPaper: boolean): boolean {
  if (!ramp.enabled) return true;
  switch (ramp.mode) {
    case 'observation':
      return false;
    case 'paper':
      return isPaper;
    case 'live_ramp':
    case 'live_full':
      return !isPaper;
  }
}

export function nextMode(current: RampMode): RampMode | null {
  const idx = MODE_ORDER.indexOf(current);
  return idx < MODE_ORDER.length - 1 ? MODE_ORDER[idx + 1]! : null;
}

export function evaluateAdvancement(
  mode: RampMode,
  ramp: RampConfig,
  perf: PerformanceSnapshot,
  daysInPhase: number,
): AdvancementCriteria {
  const reasons: string[] = [];
  let met = false;

  switch (mode) {
    case 'observation':
      met = true;
      reasons.push('Ready to begin paper trading');
      break;

    case 'paper': {
      const daysOk = daysInPhase >= ramp.paperMinDays;
      const tradesOk = perf.totalTrades >= ramp.paperMinTrades;
      const winOk = perf.totalTrades > 0 && perf.winRate >= ramp.paperMinWinRate;
      if (daysOk) reasons.push(`${daysInPhase} days meets minimum ${ramp.paperMinDays}`);
      else reasons.push(`Need ${ramp.paperMinDays - daysInPhase} more days`);
      if (tradesOk) reasons.push(`${perf.totalTrades} trades meets minimum ${ramp.paperMinTrades}`);
      else reasons.push(`Need ${ramp.paperMinTrades - perf.totalTrades} more trades`);
      if (winOk) reasons.push(`Win rate ${(perf.winRate * 100).toFixed(0)}% meets ${(ramp.paperMinWinRate * 100).toFixed(0)}%`);
      else reasons.push(`Win rate ${(perf.winRate * 100).toFixed(0)}% below ${(ramp.paperMinWinRate * 100).toFixed(0)}%`);
      met = daysOk && tradesOk && winOk;
      break;
    }

    case 'live_ramp': {
      const daysOk = daysInPhase >= ramp.liveRampMinDays;
      const tradesOk = perf.totalTrades >= ramp.liveRampMinTrades;
      const winOk = perf.totalTrades > 0 && perf.winRate >= ramp.liveRampMinWinRate;
      if (daysOk) reasons.push(`${daysInPhase} days meets minimum ${ramp.liveRampMinDays}`);
      else reasons.push(`Need ${ramp.liveRampMinDays - daysInPhase} more days`);
      if (tradesOk) reasons.push(`${perf.totalTrades} live-ramp trades meets minimum ${ramp.liveRampMinTrades}`);
      else reasons.push(`Need ${ramp.liveRampMinTrades - perf.totalTrades} more trades`);
      if (winOk) reasons.push(`Win rate ${(perf.winRate * 100).toFixed(0)}% meets ${(ramp.liveRampMinWinRate * 100).toFixed(0)}%`);
      else reasons.push(`Win rate ${(perf.winRate * 100).toFixed(0)}% below ${(ramp.liveRampMinWinRate * 100).toFixed(0)}%`);
      met = daysOk && tradesOk && winOk;
      break;
    }

    case 'live_full':
      met = false;
      reasons.push('Already at full live size');
      break;
  }

  return {
    met,
    reasons,
    daysInPhase,
    tradeCount: perf.totalTrades,
    winRate: perf.winRate,
  };
}