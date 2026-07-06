import { jest } from '@jest/globals';
import { PersistenceService } from '../../src/persistence/service.js';
import type { SupabaseRest } from '../../src/persistence/supabase.js';
import type { MonitoredPosition } from '../../src/monitor/types.js';
import type { ClosedTrade } from '../../src/performance/types.js';

function makePosition(overrides: Partial<MonitoredPosition> = {}): MonitoredPosition {
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
    ...overrides,
  };
}

function makeDb() {
  return {
    select: jest.fn(async () => [] as unknown[]),
    upsert: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
  };
}

describe('PersistenceService', () => {
  it('upserts current positions and deletes the rest', async () => {
    const db = makeDb();
    const svc = new PersistenceService(db as unknown as SupabaseRest);

    await svc.savePositions([makePosition()]);

    expect(db.upsert).toHaveBeenCalledTimes(1);
    const [table, rows, onConflict] = db.upsert.mock.calls[0] as [string, any[], string];
    expect(table).toBe('positions');
    expect(onConflict).toBe('symbol');
    expect(rows[0]).toMatchObject({ symbol: 'AAPL', qty: 2, entry_price: 180, stop_price: 171 });
    expect(rows[0].state.protectiveStopOrderId).toBe('stop-1');
    expect(db.delete).toHaveBeenCalledWith('positions', 'symbol=not.in.(AAPL)');
  });

  it('deletes all positions when none are held', async () => {
    const db = makeDb();
    const svc = new PersistenceService(db as unknown as SupabaseRest);

    await svc.savePositions([]);

    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledWith('positions', 'id=not.is.null');
  });

  it('persists a closed trade as a sell with full state', async () => {
    const db = makeDb();
    const svc = new PersistenceService(db as unknown as SupabaseRest);
    const trade: ClosedTrade = {
      id: 't-1',
      symbol: 'AAPL',
      entryPrice: 180,
      exitPrice: 171,
      qty: 2,
      pnl: -18,
      pnlPct: -5,
      exitReason: 'broker_stop',
      regime: 'trending_bull',
      score: 80,
      rationale: makePosition().rationale,
      openedAt: '2026-06-29T14:00:00Z',
      closedAt: '2026-06-29T15:00:00Z',
    };

    await svc.insertClosedTrade(trade);

    const [table, rows, onConflict] = db.upsert.mock.calls[0] as [string, any[], string];
    expect(table).toBe('trades');
    expect(onConflict).toBe('id');
    expect(rows[0]).toMatchObject({ id: 't-1', side: 'sell', pnl: -18, exit_reason: 'broker_stop' });
    expect(rows[0].state.pnl).toBe(-18);
  });

  it('swallows write failures so trading is never interrupted', async () => {
    const db = makeDb();
    db.upsert.mockRejectedValueOnce(new Error('network down') as never);
    const svc = new PersistenceService(db as unknown as SupabaseRest);

    await expect(svc.saveEngineState({ peakEquity: 1, dailyPnl: 0, dailyPnlDate: null })).resolves.toBeUndefined();
  });

  it('rehydrates engine state with numeric coercion', async () => {
    const db = makeDb();
    db.select.mockResolvedValueOnce([
      { peak_equity: '1200.50', daily_pnl: '-18', daily_pnl_date: '2026-06-29' },
    ] as never);
    const svc = new PersistenceService(db as unknown as SupabaseRest);

    const state = await svc.loadEngineState();
    expect(state).toEqual({ peakEquity: 1200.5, dailyPnl: -18, dailyPnlDate: '2026-06-29' });
  });
});
