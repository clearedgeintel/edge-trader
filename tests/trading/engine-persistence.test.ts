import { jest } from '@jest/globals';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { AppConfig } from '../../src/config/schema.js';
import type { AnalysisEngine } from '../../src/analysis/index.js';
import type {
  AlpacaAccount,
  AlpacaClient,
  AlpacaOrder,
  AlpacaPosition,
} from '../../src/data/alpaca/client.js';
import type { PersistenceService } from '../../src/persistence/service.js';
import type { MonitoredPosition } from '../../src/monitor/types.js';
import { TradingEngine } from '../../src/trading/engine.js';

function makeConfig(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    execution: { ...DEFAULT_CONFIG.execution, enabled: true, brokerStops: true },
    ramp: { ...DEFAULT_CONFIG.ramp, mode: 'paper' },
    data: { ...DEFAULT_CONFIG.data, watchlist: ['AAPL'] },
  };
}

const ACCOUNT: AlpacaAccount = {
  id: 'acc',
  equity: '1000',
  cash: '1000',
  buyingPower: '2000',
  portfolioValue: '1000',
  status: 'ACTIVE',
  currency: 'USD',
};

function position(overrides: Partial<AlpacaPosition> = {}): AlpacaPosition {
  return {
    symbol: 'AAPL',
    qty: '2',
    avgEntryPrice: '180',
    currentPrice: '182',
    marketValue: '364',
    unrealizedPl: '4',
    side: 'long',
    ...overrides,
  };
}

function sellOrder(overrides: Partial<AlpacaOrder> = {}): AlpacaOrder {
  return {
    id: 'exit-1',
    client_order_id: 'c-1',
    symbol: 'AAPL',
    qty: '2',
    side: 'sell',
    type: 'stop',
    status: 'filled',
    filled_qty: '2',
    filled_avg_price: '171',
    order_class: 'simple',
    created_at: '2026-06-29T15:00:00Z',
    ...overrides,
  };
}

interface MockState {
  positions: AlpacaPosition[];
  closedOrders: AlpacaOrder[];
}

function makeAlpaca(state: MockState) {
  return {
    getAccount: async () => ACCOUNT,
    getPositions: async () => state.positions,
    getOrders: async (status: 'open' | 'closed' | 'all') =>
      status === 'closed' ? state.closedOrders : [],
    getClock: async () => ({ is_open: true, next_open: '', next_close: '' }),
    submitStopOrder: jest.fn(async () => sellOrder({ id: 'stop-1', status: 'new' })),
    replaceStopOrder: jest.fn(async () => sellOrder({ id: 'stop-2', status: 'new' })),
    cancelOrder: jest.fn(async () => undefined),
    submitMarketOrder: jest.fn(),
  } as unknown as AlpacaClient;
}

const noAnalysis = { analyzeSymbols: async () => [] } as unknown as AnalysisEngine;

function tracked(): MonitoredPosition {
  return {
    symbol: 'AAPL',
    qty: 2,
    originalQty: 2,
    entryPrice: 180,
    stopPrice: 171,
    targetPrice: 198,
    atr: 5,
    stopDistance: 9,
    trailingStop: null,
    partialTaken: false,
    bracketManaged: false,
    rationale: {
      symbol: 'AAPL',
      score: 80,
      reasons: [],
      indicators: {},
      regime: 'trending_bull',
      suggested_stop: 171,
      suggested_target: 198,
      risk_dollars: 5,
    },
    openedAt: '2026-06-29T14:00:00Z',
    protectiveStopOrderId: 'stop-1',
  };
}

function makePersistence() {
  return {
    loadEngineState: jest.fn(async () => null),
    loadPositions: jest.fn(async () => [] as MonitoredPosition[]),
    loadClosedTrades: jest.fn(async () => []),
    loadSignals: jest.fn(async () => []),
    loadReportCards: jest.fn(async () => []),
    saveEngineState: jest.fn(async () => undefined),
    savePositions: jest.fn(async () => undefined),
    insertClosedTrade: jest.fn(async () => undefined),
    insertSignal: jest.fn(async () => undefined),
    insertReportCard: jest.fn(async () => undefined),
  };
}

describe('TradingEngine persistence wiring', () => {
  it('rehydrates positions and engine state on init()', async () => {
    const persistence = makePersistence();
    persistence.loadEngineState.mockResolvedValueOnce({
      peakEquity: 1200,
      dailyPnl: -7,
      dailyPnlDate: '2026-06-29',
    } as never);
    persistence.loadPositions.mockResolvedValueOnce([tracked()] as never);

    const state: MockState = { positions: [position()], closedOrders: [] };
    const engine = new TradingEngine(
      makeConfig(),
      makeAlpaca(state),
      noAnalysis,
      persistence as unknown as PersistenceService,
    );

    await engine.init();

    expect(engine.getPositionStore().get('AAPL')?.protectiveStopOrderId).toBe('stop-1');
    expect(engine.getDailyPnl()).toBe(-7);
  });

  it('snapshots state every scan and writes broker-side exits through', async () => {
    const persistence = makePersistence();
    const state: MockState = { positions: [position()], closedOrders: [] };
    const engine = new TradingEngine(
      makeConfig(),
      makeAlpaca(state),
      noAnalysis,
      persistence as unknown as PersistenceService,
    );

    await engine.runScan();
    expect(persistence.savePositions).toHaveBeenCalled();
    expect(persistence.saveEngineState).toHaveBeenCalled();

    // Broker stop fills between scans; position vanishes from Alpaca.
    state.positions = [];
    state.closedOrders = [sellOrder()];
    await engine.runScan();

    expect(persistence.insertClosedTrade).toHaveBeenCalledTimes(1);
    const trade = persistence.insertClosedTrade.mock.calls[0][0] as { pnl: number; exitReason: string };
    expect(trade.pnl).toBe(-18);
    expect(trade.exitReason).toBe('broker_stop');
  });
});
