import { randomUUID } from 'node:crypto';
import type { MonitoredPosition } from '../monitor/types.js';
import type { Signal } from '../strategy/types.js';
import type {
  ClosedTrade,
  DailyPerformance,
  PerfBreakdownRow,
  PerformanceAnalytics,
  PerformanceSnapshot,
  SignalRecord,
} from './types.js';

/** Initial dollar risk of a trade (entry to stop), used for R-multiple math. */
function tradeRisk(t: ClosedTrade): number {
  return (t.entryPrice - t.rationale.suggested_stop) * t.qty;
}

function rMultiple(t: ClosedTrade): number {
  const risk = tradeRisk(t);
  return risk > 0 ? t.pnl / risk : 0;
}

function breakdown(trades: ClosedTrade[], keyOf: (t: ClosedTrade) => string): PerfBreakdownRow[] {
  const groups = new Map<string, ClosedTrade[]>();
  for (const t of trades) {
    const k = keyOf(t);
    const arr = groups.get(k) ?? [];
    arr.push(t);
    groups.set(k, arr);
  }
  return [...groups.entries()]
    .map(([key, ts]) => ({
      key,
      trades: ts.length,
      winRate: ts.filter((t) => t.pnl > 0).length / ts.length,
      netPnl: ts.reduce((s, t) => s + t.pnl, 0),
      avgR: ts.reduce((s, t) => s + rMultiple(t), 0) / ts.length,
    }))
    .sort((a, b) => a.netPnl - b.netPnl);
}

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

  /**
   * Aggregate stats + breakdowns over the strategy's closed trades. Adopted
   * (score-0) positions the bot re-adopted from Alpaca are NOT the strategy, so
   * they're excluded from the metrics and reported separately.
   */
  getAnalytics(): PerformanceAnalytics {
    const adopted = this.trades.filter((t) => t.score === 0);
    const trades = this.trades.filter((t) => t.score !== 0);
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl <= 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = losses.reduce((s, t) => s + t.pnl, 0); // <= 0
    const netPnl = grossProfit + grossLoss;
    const n = trades.length;
    const avgR = n > 0 ? trades.reduce((s, t) => s + rMultiple(t), 0) / n : 0;

    return {
      trades: n,
      wins: wins.length,
      losses: losses.length,
      winRate: n > 0 ? wins.length / n : 0,
      netPnl,
      grossProfit,
      grossLoss,
      profitFactor: grossLoss !== 0 ? grossProfit / Math.abs(grossLoss) : null,
      avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
      avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
      expectancy: n > 0 ? netPnl / n : 0,
      avgR,
      adoptedTrades: adopted.length,
      adoptedNetPnl: adopted.reduce((s, t) => s + t.pnl, 0),
      byExitReason: breakdown(trades, (t) => t.exitReason),
      byScoreBand: breakdown(trades, (t) =>
        t.score >= 90 ? '90-100' : t.score >= 80 ? '80-89' : t.score >= 70 ? '70-79' : '<70',
      ),
      byRegime: breakdown(trades, (t) => t.regime),
      bySymbol: breakdown(trades, (t) => t.symbol),
    };
  }
}