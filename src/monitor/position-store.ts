import type { Signal } from '../strategy/types.js';
import type { PositionSizeResult } from '../risk/types.js';
import type { MonitoredPosition } from './types.js';

export class PositionStore {
  private readonly positions = new Map<string, MonitoredPosition>();

  addFromSignal(
    signal: Signal,
    sizing: PositionSizeResult,
    qty: number,
    bracketManaged: boolean,
  ): MonitoredPosition {
    const stopDistance = sizing.stopDistance;
    const pos: MonitoredPosition = {
      symbol: signal.symbol,
      qty,
      originalQty: qty,
      entryPrice: signal.proposal.entryPrice,
      stopPrice: signal.proposal.stopPrice,
      targetPrice: signal.proposal.targetPrice,
      atr: signal.proposal.atr,
      stopDistance,
      trailingStop: null,
      partialTaken: false,
      bracketManaged,
      rationale: signal.rationale,
      openedAt: new Date().toISOString(),
    };
    this.positions.set(signal.symbol, pos);
    return pos;
  }

  adopt(
    symbol: string,
    qty: number,
    entryPrice: number,
    stopPrice?: number,
  ): MonitoredPosition {
    const pos: MonitoredPosition = {
      symbol,
      qty,
      originalQty: qty,
      entryPrice,
      stopPrice: stopPrice ?? entryPrice * 0.95,
      targetPrice: entryPrice * 1.1,
      atr: (entryPrice - (stopPrice ?? entryPrice * 0.95)) / 1.8,
      stopDistance: entryPrice - (stopPrice ?? entryPrice * 0.95),
      trailingStop: null,
      partialTaken: false,
      bracketManaged: false,
      rationale: {
        symbol,
        score: 0,
        reasons: ['Adopted from Alpaca reconciliation'],
        indicators: {},
        regime: 'unknown',
        suggested_stop: stopPrice ?? entryPrice * 0.95,
        suggested_target: entryPrice * 1.1,
        risk_dollars: null,
      },
      openedAt: new Date().toISOString(),
    };
    this.positions.set(symbol, pos);
    return pos;
  }

  /** Replace the entire tracked set (e.g. rehydrating from persistence). */
  hydrate(positions: MonitoredPosition[]): void {
    this.positions.clear();
    for (const pos of positions) {
      this.positions.set(pos.symbol, pos);
    }
  }

  get(symbol: string): MonitoredPosition | undefined {
    return this.positions.get(symbol);
  }

  getAll(): MonitoredPosition[] {
    return [...this.positions.values()];
  }

  update(symbol: string, patch: Partial<MonitoredPosition>): void {
    const existing = this.positions.get(symbol);
    if (!existing) return;
    this.positions.set(symbol, { ...existing, ...patch });
  }

  remove(symbol: string): void {
    this.positions.delete(symbol);
  }

  syncQty(symbol: string, qty: number): void {
    const pos = this.positions.get(symbol);
    if (!pos) return;
    if (qty <= 0) {
      this.positions.delete(symbol);
    } else {
      this.positions.set(symbol, { ...pos, qty });
    }
  }
}