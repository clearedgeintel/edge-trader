import { SafetyTracker } from '../../src/safety/tracker.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

describe('SafetyTracker', () => {
  const config = DEFAULT_CONFIG.safety;

  it('tracks daily order limit', () => {
    const tracker = new SafetyTracker({ ...config, maxOrdersPerDay: 3 });
    tracker.recordOrder();
    tracker.recordOrder();
    tracker.recordOrder();
    expect(tracker.getStatus().canExecute).toBe(false);
    expect(tracker.hasActiveCircuit('max_orders_per_day')).toBe(true);
  });

  it('trips on consecutive losses', () => {
    const tracker = new SafetyTracker({ ...config, maxConsecutiveLosses: 2, consecutiveLossCooldownMinutes: 60 });
    tracker.recordTradeClose(-5);
    tracker.recordTradeClose(-3);
    expect(tracker.hasActiveCircuit('consecutive_losses')).toBe(true);
  });

  it('resets consecutive losses on win', () => {
    const tracker = new SafetyTracker(config);
    tracker.recordTradeClose(-5);
    tracker.recordTradeClose(10);
    expect(tracker.getStatus().consecutiveLosses).toBe(0);
  });
});