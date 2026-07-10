import { jest } from '@jest/globals';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { AppConfig } from '../../src/config/schema.js';
import type { AnalysisEngine } from '../../src/analysis/index.js';
import type { SymbolFeatures } from '../../src/analysis/features.js';
import type {
  AlpacaAccount,
  AlpacaClient,
  AlpacaOrder,
  AlpacaPosition,
} from '../../src/data/alpaca/client.js';
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
  const submitStopOrder = jest.fn(async () => sellOrder({ id: 'stop-1', status: 'new' }));
  const cancelOrder = jest.fn(async () => undefined);
  const replaceStopOrder = jest.fn(async () => sellOrder({ id: 'stop-2', status: 'new' }));
  const submitSell = jest.fn();

  const alpaca = {
    getAccount: async () => ACCOUNT,
    getPositions: async () => state.positions,
    getOrders: async (status: 'open' | 'closed' | 'all') =>
      status === 'closed' ? state.closedOrders : [],
    getClock: async () => ({ is_open: true, next_open: '', next_close: '' }),
    submitStopOrder,
    replaceStopOrder,
    cancelOrder,
    submitMarketOrder: submitSell,
  } as unknown as AlpacaClient;

  return { alpaca, submitStopOrder, cancelOrder, replaceStopOrder };
}

const noAnalysis = {
  analyzeSymbols: async () => [],
} as unknown as AnalysisEngine;

/** Features crafted to clear the confluence score + risk checks and produce a signal. */
function qualifyingFeatures(symbol = 'AMZN'): SymbolFeatures {
  const tf = {
    price: 180, ema9: 179.5, ema21: 179, ema50: 178, ema200: 175,
    rsi14: 42, adx14: 28, atr14: 0.8, bbUpper: 181, bbMiddle: 179.5,
    bbLower: 178, vwap: 179.8, avgVolume20: 1_000_000,
  };
  return {
    symbol,
    timestamp: '2026-07-10T15:00:00Z',
    regime: 'trending_bull',
    daily: { ...tf, adx14: 28, atr14: 3 },
    hourly: tf,
    intraday: tf,
    priceAboveEma200: true,
    ema50SlopePositive: true,
    relativeStrengthVsBenchmark: 0.05,
    pullbackVolumeDecreasing: true,
    rsiInPullbackZone: true,
    nearValueZone: true,
    bullishConfirmation: true,
    avgDailyVolume: 2_000_000,
  } as SymbolFeatures;
}

function analysisOf(features: SymbolFeatures[]): AnalysisEngine {
  return { analyzeSymbols: async () => features } as unknown as AnalysisEngine;
}

describe('TradingEngine — signal/report-card dedup', () => {
  it('emits one signal + card per setup, not one per scan', async () => {
    const config: AppConfig = {
      ...makeConfig(),
      execution: { ...makeConfig().execution, enabled: false },
    };
    const state: MockState = { positions: [], closedOrders: [] };
    const { alpaca } = makeAlpaca(state);
    const engine = new TradingEngine(config, alpaca, analysisOf([qualifyingFeatures('AMZN')]));

    // AMZN keeps qualifying across three scans.
    await engine.runScan();
    await engine.runScan();
    await engine.runScan();

    expect(engine.getReportCardStore().getAll().length).toBe(1);
    expect(engine.getPerformanceStore().getSignals().length).toBe(1);
    // The live snapshot still reflects the currently-actionable signal every scan.
    expect(engine.getLastSignals().length).toBe(1);
  });
});

describe('TradingEngine — broker-resident stops (Fix #2)', () => {
  it('places a GTC broker stop for a whole-share position', async () => {
    const state: MockState = { positions: [position()], closedOrders: [] };
    const { alpaca, submitStopOrder } = makeAlpaca(state);
    const engine = new TradingEngine(makeConfig(), alpaca, noAnalysis);

    const result = await engine.runScan();

    expect(submitStopOrder).toHaveBeenCalledTimes(1);
    expect(submitStopOrder).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'AAPL', qty: '2' }),
    );
    expect(result.monitorActions.map((a) => a.action)).toContain('broker_stop_placed');
    expect(engine.getPositionStore().get('AAPL')?.protectiveStopOrderId).toBe('stop-1');
  });

  it('does not place a broker stop for a fractional position', async () => {
    const state: MockState = {
      positions: [position({ qty: '2.5' })],
      closedOrders: [],
    };
    const { alpaca, submitStopOrder } = makeAlpaca(state);
    const engine = new TradingEngine(makeConfig(), alpaca, noAnalysis);

    await engine.runScan();

    expect(submitStopOrder).not.toHaveBeenCalled();
    expect(engine.getPositionStore().get('AAPL')?.protectiveStopOrderId ?? null).toBeNull();
  });
});

describe('TradingEngine — realized daily P&L + broker-exit attribution (Fix #1)', () => {
  it('records a broker-side stop fill and feeds realized daily P&L', async () => {
    const state: MockState = { positions: [position()], closedOrders: [] };
    const { alpaca, cancelOrder } = makeAlpaca(state);
    const engine = new TradingEngine(makeConfig(), alpaca, noAnalysis);

    // Scan 1: adopt the position and place the broker stop.
    await engine.runScan();
    expect(engine.getDailyPnl()).toBe(0);

    // Between scans the broker stop fills at 171 and the position disappears.
    state.positions = [];
    state.closedOrders = [sellOrder({ filled_avg_price: '171', filled_qty: '2' })];

    const result = await engine.runScan();

    // Entry 180, exit 171, qty 2 => -18 realized.
    expect(engine.getDailyPnl()).toBe(-18);
    expect(result.reconcile.removed).toContain('AAPL');

    const trades = engine.getPerformanceStore().getTrades();
    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe('broker_stop');
    expect(trades[0].pnl).toBe(-18);

    // The lingering broker stop id is cleaned up.
    expect(cancelOrder).toHaveBeenCalledWith('stop-1');
    expect(engine.getPositionStore().get('AAPL')).toBeUndefined();
  });
});
