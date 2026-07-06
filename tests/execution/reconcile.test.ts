import { reconcilePositions } from '../../src/execution/reconcile.js';
import { PositionStore } from '../../src/monitor/position-store.js';

describe('reconcilePositions', () => {
  it('adopts untracked Alpaca positions', () => {
    const store = new PositionStore();
    const result = reconcilePositions(store, [
      { symbol: 'AAPL', qty: '2', avgEntryPrice: '180', currentPrice: '182', marketValue: '364', unrealizedPl: '4', side: 'long' },
    ]);
    expect(result.adopted).toContain('AAPL');
    expect(store.get('AAPL')?.qty).toBe(2);
  });

  it('removes positions closed at Alpaca', () => {
    const store = new PositionStore();
    store.adopt('MSFT', 1, 400);
    const result = reconcilePositions(store, []);
    expect(result.removed).toContain('MSFT');
    expect(store.get('MSFT')).toBeUndefined();
  });

  it('syncs qty changes', () => {
    const store = new PositionStore();
    store.adopt('GOOG', 2, 170);
    const result = reconcilePositions(store, [
      { symbol: 'GOOG', qty: '1', avgEntryPrice: '170', currentPrice: '172', marketValue: '172', unrealizedPl: '2', side: 'long' },
    ]);
    expect(result.synced).toContain('GOOG');
    expect(store.get('GOOG')?.qty).toBe(1);
  });
});