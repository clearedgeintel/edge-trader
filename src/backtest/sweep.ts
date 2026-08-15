import type { AppConfig } from '../config/schema.js';
import type { AlpacaClient } from '../data/alpaca/client.js';
import { logger } from '../lib/logger.js';
import { fetchBacktestBars, fetchBenchmarkDaily } from './data.js';
import { runBacktest } from './engine.js';
import type { BacktestTrade } from './types.js';

export interface SweepBreakdownRow {
  key: string;
  trades: number;
  winRate: number;
  netPnl: number;
  avgR: number;
}

export interface SweepAggregate {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  avgR: number;
  byRegime: SweepBreakdownRow[];
  byScoreBand: SweepBreakdownRow[];
  bySymbol: SweepBreakdownRow[];
  byExitReason: SweepBreakdownRow[];
}

export interface SweepResult {
  aggregate: SweepAggregate;
  symbolsTested: number;
  symbolsSkipped: string[];
}

export interface SweepOptions {
  intradayDays: number;
  benchmarkSymbol: string;
  startingEquity: number;
  slippageBps: number;
  signalEveryNBars: number;
  concurrency: number;
}

function rMultiple(t: BacktestTrade): number {
  const risk = (t.entryPrice - t.rationale.suggested_stop) * t.qty;
  return risk > 0 ? t.pnl / risk : 0;
}

function breakdown(
  trades: BacktestTrade[],
  keyOf: (t: BacktestTrade) => string,
): SweepBreakdownRow[] {
  const groups = new Map<string, BacktestTrade[]>();
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
    .sort((a, b) => b.netPnl - a.netPnl);
}

/** Pool all trades across symbols into edge stats — no per-symbol compounding. */
export function aggregateTrades(trades: BacktestTrade[]): SweepAggregate {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = losses.reduce((s, t) => s + t.pnl, 0);
  const netPnl = grossProfit + grossLoss;
  const n = trades.length;

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
    avgR: n > 0 ? trades.reduce((s, t) => s + rMultiple(t), 0) / n : 0,
    byRegime: breakdown(trades, (t) => t.regime),
    byScoreBand: breakdown(trades, (t) =>
      t.score >= 90 ? '90-100' : t.score >= 80 ? '80-89' : t.score >= 70 ? '70-79' : '<70',
    ),
    bySymbol: breakdown(trades, (t) => t.symbol),
    byExitReason: breakdown(trades, (t) => t.exitReason),
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (let i = next++; i < items.length; i = next++) {
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Run the strategy over real history for every symbol and pool the results. */
export async function runSweep(
  client: AlpacaClient,
  config: AppConfig,
  symbols: string[],
  opts: SweepOptions,
): Promise<SweepResult> {
  const benchmarkDaily = await fetchBenchmarkDaily(client, opts.benchmarkSymbol, opts.intradayDays);

  const allTrades: BacktestTrade[] = [];
  const skipped: string[] = [];

  await mapWithConcurrency(symbols, opts.concurrency, async (symbol) => {
    try {
      const bars = await fetchBacktestBars(client, symbol, opts.intradayDays);
      if (!bars) {
        skipped.push(symbol);
        return;
      }
      const result = runBacktest({
        config,
        btConfig: {
          symbol,
          startingEquity: opts.startingEquity,
          slippageBps: opts.slippageBps,
          signalEveryNBars: opts.signalEveryNBars,
        },
        daily: bars.daily,
        hourly: bars.hourly,
        intraday: bars.intraday,
        benchmarkDaily,
      });
      allTrades.push(...result.trades);
      logger.info({ symbol, trades: result.trades.length }, 'Backtested symbol');
    } catch (err) {
      logger.error({ err, symbol }, 'Backtest failed for symbol');
      skipped.push(symbol);
    }
  });

  return {
    aggregate: aggregateTrades(allTrades),
    symbolsTested: symbols.length - skipped.length,
    symbolsSkipped: skipped,
  };
}
