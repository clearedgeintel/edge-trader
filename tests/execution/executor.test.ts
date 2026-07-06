import { formatQty } from '../../src/execution/executor.js';

describe('formatQty', () => {
  it('floors to integer when fractional disabled', () => {
    expect(formatQty(1.8765, false)).toBe('1');
  });

  it('formats fractional qty to 4 decimal places', () => {
    expect(formatQty(1.87654321, true)).toBe('1.8765');
  });

  it('strips trailing zeros', () => {
    expect(formatQty(2.0, true)).toBe('2');
  });
});