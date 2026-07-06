import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { checkSafetyCircuits } from '../../src/safety/circuits.js';
import { SafetyTracker } from '../../src/safety/tracker.js';

describe('checkSafetyCircuits', () => {
  it('blocks observation mode', () => {
    const result = checkSafetyCircuits({
      config: { ...DEFAULT_CONFIG, ramp: { ...DEFAULT_CONFIG.ramp, mode: 'observation' } },
      equity: 1000,
      tracker: new SafetyTracker(DEFAULT_CONFIG.safety),
    });
    expect(result.allowed).toBe(false);
    expect(result.sizeMultiplier).toBe(0);
  });

  it('allows paper mode with size multiplier 1', () => {
    const result = checkSafetyCircuits({
      config: {
        ...DEFAULT_CONFIG,
        ramp: { ...DEFAULT_CONFIG.ramp, mode: 'paper' },
        alpaca: { ...DEFAULT_CONFIG.alpaca, paper: true },
      },
      equity: 1000,
      tracker: new SafetyTracker(DEFAULT_CONFIG.safety),
    });
    expect(result.allowed).toBe(true);
    expect(result.sizeMultiplier).toBe(1);
  });

  it('blocks live without LIVE_ENABLED', () => {
    const orig = process.env.LIVE_ENABLED;
    delete process.env.LIVE_ENABLED;
    const result = checkSafetyCircuits({
      config: {
        ...DEFAULT_CONFIG,
        ramp: { ...DEFAULT_CONFIG.ramp, mode: 'live_ramp' },
        alpaca: { ...DEFAULT_CONFIG.alpaca, paper: false },
      },
      equity: 1000,
      tracker: new SafetyTracker(DEFAULT_CONFIG.safety),
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('live_not_enabled');
    if (orig) process.env.LIVE_ENABLED = orig;
  });

  it('applies live ramp size multiplier', () => {
    process.env.LIVE_ENABLED = 'true';
    const result = checkSafetyCircuits({
      config: {
        ...DEFAULT_CONFIG,
        ramp: { ...DEFAULT_CONFIG.ramp, mode: 'live_ramp' },
        alpaca: { ...DEFAULT_CONFIG.alpaca, paper: false },
      },
      equity: 1000,
      tracker: new SafetyTracker(DEFAULT_CONFIG.safety),
    });
    expect(result.allowed).toBe(true);
    expect(result.sizeMultiplier).toBe(0.1);
    delete process.env.LIVE_ENABLED;
  });
});