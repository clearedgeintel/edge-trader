import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import {
  applyPartialExit,
  evaluatePosition,
  updateTrailingStop,
} from '../../src/monitor/monitor.js';
import type { MonitoredPosition } from '../../src/monitor/types.js';

function makePosition(overrides: Partial<MonitoredPosition> = {}): MonitoredPosition {
  return {
    symbol: 'AAPL',
    qty: 2,
    originalQty: 2,
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 115,
    atr: 2,
    stopDistance: 5,
    trailingStop: null,
    partialTaken: false,
    bracketManaged: false,
    rationale: {
      symbol: 'AAPL',
      score: 80,
      reasons: [],
      indicators: {},
      regime: 'trending_bull',
      suggested_stop: 95,
      suggested_target: 115,
      risk_dollars: 5,
    },
    openedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('evaluatePosition', () => {
  const config = DEFAULT_CONFIG.monitor;

  it('triggers partial take-profit at 1R', () => {
    const action = evaluatePosition(makePosition(), 105, config);
    expect(action?.action).toBe('partial_take_profit');
    expect(action?.qty).toBe(1);
  });

  it('triggers stop loss', () => {
    const action = evaluatePosition(makePosition(), 94, config);
    expect(action?.action).toBe('stop_hit');
    expect(action?.qty).toBe(2);
  });

  it('triggers target hit', () => {
    const action = evaluatePosition(makePosition({ partialTaken: true }), 116, config);
    expect(action?.action).toBe('target_hit');
  });

  it('triggers trailing stop when trail is active', () => {
    const action = evaluatePosition(
      makePosition({ trailingStop: 108, partialTaken: true }),
      107,
      config,
    );
    expect(action?.action).toBe('trailing_stop');
  });

  it('skips bracket-managed positions', () => {
    expect(evaluatePosition(makePosition({ bracketManaged: true }), 94, config)).toBeNull();
  });
});

describe('updateTrailingStop', () => {
  const config = DEFAULT_CONFIG.monitor;

  it('returns null before activation R', () => {
    expect(updateTrailingStop(makePosition(), 103, config)).toBeNull();
  });

  it('sets trail after activation R', () => {
    const trail = updateTrailingStop(makePosition(), 110, config);
    expect(trail).not.toBeNull();
    expect(trail!).toBeGreaterThan(95);
  });

  it('ratchets trail upward only', () => {
    const pos = makePosition({ trailingStop: 105 });
    const trail = updateTrailingStop(pos, 112, config);
    expect(trail!).toBeGreaterThanOrEqual(105);
  });
});

describe('applyPartialExit', () => {
  it('reduces qty and marks partial taken', () => {
    const updated = applyPartialExit(makePosition(), 1);
    expect(updated.qty).toBe(1);
    expect(updated.partialTaken).toBe(true);
  });
});