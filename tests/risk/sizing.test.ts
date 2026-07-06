import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import {
  applySizeMultiplier,
  calculateDrawdown,
  calculateOpenRisk,
  calculatePositionSize,
} from '../../src/risk/sizing.js';
import type { TradeProposal } from '../../src/risk/types.js';

const config = DEFAULT_CONFIG.risk;

function makeProposal(overrides: Partial<TradeProposal> = {}): TradeProposal {
  return {
    symbol: 'AAPL',
    entryPrice: 180,
    stopPrice: 175,
    targetPrice: 195,
    atr: 2.5,
    avgDailyVolume: 1_000_000,
    ...overrides,
  };
}

describe('calculatePositionSize', () => {
  it('sizes position based on equity risk and ATR stop', () => {
    const equity = 1000;
    const proposal = makeProposal({ atr: 2.5 });

    const result = calculatePositionSize(equity, proposal, config);

    expect(result).not.toBeNull();
    expect(result!.riskDollars).toBeCloseTo(5);
    expect(result!.stopDistance).toBeCloseTo(4.5);
    expect(result!.qty).toBeCloseTo(5 / 4.5);
    expect(result!.rewardRisk).toBeCloseTo(15 / 4.5);
  });

  it('returns null for zero equity', () => {
    expect(calculatePositionSize(0, makeProposal(), config)).toBeNull();
  });

  it('returns null for zero ATR', () => {
    expect(calculatePositionSize(1000, makeProposal({ atr: 0 }), config)).toBeNull();
  });

  it('scales qty down with smaller equity', () => {
    const small = calculatePositionSize(500, makeProposal(), config);
    const large = calculatePositionSize(2000, makeProposal(), config);

    expect(small!.qty).toBeCloseTo(large!.qty / 4);
    expect(small!.riskDollars).toBeCloseTo(large!.riskDollars / 4);
  });
});

describe('applySizeMultiplier', () => {
  it('scales qty for live ramp', () => {
    const sizing = calculatePositionSize(1000, makeProposal(), config)!;
    const ramped = applySizeMultiplier(sizing, 0.1);
    expect(ramped.qty).toBeCloseTo(sizing.qty * 0.1);
    expect(ramped.riskDollars).toBeCloseTo(sizing.riskDollars * 0.1);
  });
});

describe('calculateOpenRisk', () => {
  it('sums risk across open positions', () => {
    const positions = [
      { qty: 2, entryPrice: 100, stopPrice: 95 },
      { qty: 1, entryPrice: 50, stopPrice: 48 },
    ];
    expect(calculateOpenRisk(positions)).toBeCloseTo(12);
  });

  it('returns 0 for no positions', () => {
    expect(calculateOpenRisk([])).toBe(0);
  });
});

describe('calculateDrawdown', () => {
  it('computes drawdown from peak', () => {
    expect(calculateDrawdown(900, 1000)).toBeCloseTo(0.1);
  });

  it('returns 0 when at peak', () => {
    expect(calculateDrawdown(1000, 1000)).toBe(0);
  });

  it('returns 0 when equity exceeds peak', () => {
    expect(calculateDrawdown(1100, 1000)).toBe(0);
  });
});