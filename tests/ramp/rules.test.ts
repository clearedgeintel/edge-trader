import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import {
  canExecuteInMode,
  evaluateAdvancement,
  getSizeMultiplier,
  nextMode,
} from '../../src/ramp/rules.js';

describe('ramp rules', () => {
  const ramp = DEFAULT_CONFIG.ramp;

  it('returns correct size multipliers', () => {
    expect(getSizeMultiplier({ ...ramp, mode: 'observation' })).toBe(0);
    expect(getSizeMultiplier({ ...ramp, mode: 'paper' })).toBe(1);
    expect(getSizeMultiplier({ ...ramp, mode: 'live_ramp' })).toBe(0.1);
    expect(getSizeMultiplier({ ...ramp, mode: 'live_full' })).toBe(1);
  });

  it('blocks execution in observation mode', () => {
    expect(canExecuteInMode({ ...ramp, mode: 'observation' }, true)).toBe(false);
    expect(canExecuteInMode({ ...ramp, mode: 'paper' }, true)).toBe(true);
    expect(canExecuteInMode({ ...ramp, mode: 'live_ramp' }, false)).toBe(true);
    expect(canExecuteInMode({ ...ramp, mode: 'live_ramp' }, true)).toBe(false);
  });

  it('advances mode order', () => {
    expect(nextMode('observation')).toBe('paper');
    expect(nextMode('paper')).toBe('live_ramp');
    expect(nextMode('live_ramp')).toBe('live_full');
    expect(nextMode('live_full')).toBeNull();
  });

  it('evaluates paper advancement criteria', () => {
    const met = evaluateAdvancement('paper', ramp, {
      totalTrades: 15,
      wins: 8,
      losses: 7,
      winRate: 0.53,
      totalPnl: 50,
      avgPnl: 3.3,
      todayPnl: 5,
      openPositions: 0,
      recentSignals: 2,
    }, 20);
    expect(met.met).toBe(true);

    const notMet = evaluateAdvancement('paper', ramp, {
      totalTrades: 2,
      wins: 1,
      losses: 1,
      winRate: 0.5,
      totalPnl: 0,
      avgPnl: 0,
      todayPnl: 0,
      openPositions: 0,
      recentSignals: 0,
    }, 3);
    expect(notMet.met).toBe(false);
  });
});