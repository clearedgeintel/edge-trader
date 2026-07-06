import { randomUUID } from 'node:crypto';
import type { MonitoredPosition } from '../monitor/types.js';
import type { Signal } from '../strategy/types.js';
import type { ClosedTrade, DailyPerformance, PerformanceSnapshot, SignalRecord } from './types.js';

export class PerformanceStore {
  private readonly trades: ClosedTrade[] = [];
  private readonly signals: SignalRecord[] = [];
  private startingEquity = 0;

  setStartingEquity(equity: number): void {
    if (this.startingEquity === 0) this.startingEquity = equity;
  }

  /** Replace trade/signal history (e.g. rehydrating from persistence). */
  hydrate(trades: ClosedTrade[], signals: SignalRecord[]): void {
    this.trades.splice(0, this.trades.length, ...trades);
    this.signals.splice(0, this.signals.length, ...signals);
  }

  recordSignal(signal: Signal, executed: boolean): SignalRecord {
    const record: SignalRecord = {
      id: randomUUID(),
      symbol: signal.symbol,
      score: signal.score,
      regime: signal.rationale.regime,
      rationale: signal.rationale,
      executed,
      createdAt: new Date().toISOString(),
    };
    this.signals.push(record);
    return record;
  }

  recordClosedTrade(
    pos: MonitoredPosition,
    exitPrice: number,
    qty: number,
    exitReason: string,
  ): ClosedTrade {
    const pnl = (exitPrice - pos.entryPrice) * qty;
    const trade: ClosedTrade = {
      id: randomUUID(),
      symbol: pos.symbol,
      entryPrice: pos.entryPrice,
      exitPrice,
      qty,
      pnl,
      pnlPct: pos.entryPrice > 0 ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0,
      exitReason,
      regime: pos.rationale.regime,
      score: pos.rationale.score,
      rationale: pos.rationale,
      openedAt: pos.openedAt,
      closedAt: new Date().toISOString(),
    };
    this.trades.push(trade);
    return trade;
  }

  getTrades(limit = 50): ClosedTrade[] {
    return this.trades.slice(-limit).reverse();
  }

  getSignals(limit = 50): SignalRecord[] {
    return this.signals.slice(-limit).reverse();
  }

  getDailyPerformance(): DailyPerformance[] {
    const byDay = new Map<string, DailyPerformance>();

    for (const trade of this.trades) {
      const date = trade.closedAt.slice(0, 10);
      const day = byDay.get(date) ?? { date, pnl: 0, trades: 0, wins: 0 };
      day.pnl += trade.pnl;
      day.trades++;
      if (trade.pnl > 0) day.wins++;
      byDay.set(date, day);
    }

    return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  getSnapshot(openPositions: number, currentEquity?: number): PerformanceSnapshot {
    const wins = this.trades.filter((t) => t.pnl > 0);
    const today = new Date().toISOString().slice(0, 10);
    const todayTrades = this.trades.filter((t) => t.closedAt.startsWith(today));
    const todayPnl = todayTrades.reduce((s, t) => s + t.pnl, 0);
    const totalPnl =
      currentEquity !== undefined && this.startingEquity > 0
        ? currentEquity - this.startingEquity
        : this.trades.reduce((s, t) => s + t.pnl, 0);

    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recentSignals = this.signals.filter(
      (s) => new Date(s.createdAt).getTime() > last24h,
    ).length;

    return {
      totalTrades: this.trades.length,
      wins: wins.length,
      losses: this.trades.length - wins.length,
      winRate: this.trades.length > 0 ? wins.length / this.trades.length : 0,
      totalPnl,
      avgPnl: this.trades.length > 0 ? totalPnl / this.trades.length : 0,
      todayPnl,
      openPositions,
      recentSignals,
    };
  }
}