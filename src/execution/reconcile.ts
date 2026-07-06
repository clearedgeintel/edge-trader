import type { AlpacaPosition } from '../data/alpaca/client.js';
import { logger } from '../lib/logger.js';
import type { PositionStore } from '../monitor/position-store.js';
import type { OpenPosition, PortfolioState } from '../risk/types.js';

export interface ReconcileResult {
  adopted: string[];
  removed: string[];
  synced: string[];
}

export function reconcilePositions(
  store: PositionStore,
  alpacaPositions: AlpacaPosition[],
): ReconcileResult {
  const result: ReconcileResult = { adopted: [], removed: [], synced: [] };
  const alpacaSymbols = new Set(alpacaPositions.map((p) => p.symbol));

  for (const ap of alpacaPositions) {
    const qty = parseFloat(ap.qty);
    const entry = parseFloat(ap.avgEntryPrice);
    const tracked = store.get(ap.symbol);

    if (!tracked) {
      store.adopt(ap.symbol, qty, entry);
      result.adopted.push(ap.symbol);
      logger.warn({ symbol: ap.symbol, qty }, 'Adopted untracked Alpaca position');
    } else if (Math.abs(tracked.qty - qty) > 0.0001) {
      store.syncQty(ap.symbol, qty);
      result.synced.push(ap.symbol);
    }
  }

  for (const pos of store.getAll()) {
    if (!alpacaSymbols.has(pos.symbol)) {
      store.remove(pos.symbol);
      result.removed.push(pos.symbol);
      logger.info({ symbol: pos.symbol }, 'Removed closed position from store');
    }
  }

  return result;
}

export function buildPortfolioState(
  equity: number,
  peakEquity: number,
  dailyPnl: number,
  store: PositionStore,
): PortfolioState {
  const openPositions: OpenPosition[] = store.getAll().map((p) => ({
    symbol: p.symbol,
    qty: p.qty,
    entryPrice: p.entryPrice,
    stopPrice: p.trailingStop ?? p.stopPrice,
  }));

  return { equity, peakEquity, dailyPnl, openPositions };
}