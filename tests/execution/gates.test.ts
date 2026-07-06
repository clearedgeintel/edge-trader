import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { checkExecutionGates } from '../../src/execution/gates.js';

const baseCtx = {
  config: { ...DEFAULT_CONFIG, execution: { ...DEFAULT_CONFIG.execution, enabled: true } },
  marketOpen: true,
  accountStatus: 'ACTIVE',
  positions: [],
  openOrders: [],
  portfolio: { equity: 1000, peakEquity: 1000, dailyPnl: 0, openPositions: [] },
  symbol: 'AAPL',
  qty: 1,
};

describe('checkExecutionGates', () => {
  it('allows execution when all gates pass', () => {
    expect(checkExecutionGates(baseCtx).allowed).toBe(true);
  });

  it('blocks when execution disabled', () => {
    const result = checkExecutionGates({
      ...baseCtx,
      config: { ...baseCtx.config, execution: { ...DEFAULT_CONFIG.execution, enabled: false } },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('execution_disabled');
  });

  it('blocks when market closed', () => {
    const result = checkExecutionGates({ ...baseCtx, marketOpen: false });
    expect(result.reason).toBe('market_closed');
  });

  it('blocks when position exists', () => {
    const result = checkExecutionGates({
      ...baseCtx,
      positions: [{ symbol: 'AAPL', qty: '1', avgEntryPrice: '180', currentPrice: '181', marketValue: '181', unrealizedPl: '1', side: 'long' }],
    });
    expect(result.reason).toBe('position_exists');
  });

  it('blocks when pending order exists', () => {
    const result = checkExecutionGates({
      ...baseCtx,
      openOrders: [{ id: '1', client_order_id: 'c1', symbol: 'AAPL', qty: '1', side: 'buy', type: 'market', status: 'new', filled_qty: '0', filled_avg_price: null, order_class: 'simple', created_at: '' }],
    });
    expect(result.reason).toBe('pending_order_exists');
  });

  it('blocks when trading paused', () => {
    const result = checkExecutionGates({
      ...baseCtx,
      portfolio: { equity: 850, peakEquity: 1000, dailyPnl: 0, openPositions: [] },
    });
    expect(result.reason).toBe('trading_paused');
  });
});