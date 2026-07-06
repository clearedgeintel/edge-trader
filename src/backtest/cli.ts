#!/usr/bin/env node
import { loadConfigFromEnv } from '../config/index.js';
import { runBacktest } from './engine.js';
import type { Bar } from '../data/types.js';

function makeTrendBars(
  count: number,
  start: number,
  step: number,
  intervalMinutes: number,
  baseVol: number,
): Bar[] {
  const startDate = new Date('2024-01-02T09:30:00Z');
  return Array.from({ length: count }, (_, i) => {
    const close = start + i * step;
    const adjustedClose = i > count * 0.7 ? close - step * 2 : close;
    const vol = i > count * 0.7 ? baseVol * 0.4 : baseVol * 1.5;
    const ts = new Date(startDate.getTime() + i * intervalMinutes * 60_000);

    return {
      timestamp: ts.toISOString(),
      open: adjustedClose - 0.1,
      high: adjustedClose + 0.4,
      low: adjustedClose - 0.4,
      close: adjustedClose,
      volume: vol,
    };
  });
}

async function main(): Promise<void> {
  const config = loadConfigFromEnv();
  const symbol = process.argv[2] ?? 'AAPL';
  const equity = parseFloat(process.argv[3] ?? '1000');

  const daily = makeTrendBars(250, 100, 0.6, 24 * 60, 2_000_000);
  const hourly = makeTrendBars(200, 200, 0.15, 60, 500_000);
  const intraday = makeTrendBars(200, 220, 0.02, 15, 100_000);
  const benchmark = makeTrendBars(250, 400, 0.2, 24 * 60, 5_000_000);

  const result = runBacktest({
    config,
    btConfig: {
      symbol,
      startingEquity: equity,
      slippageBps: 5,
      signalEveryNBars: 4,
    },
    daily,
    hourly,
    intraday,
    benchmarkDaily: benchmark,
  });

  console.log('\n=== Backtest Results ===');
  console.log(`Symbol: ${symbol}`);
  console.log(`Trades: ${result.metrics.totalTrades}`);
  console.log(`Win Rate: ${(result.metrics.winRate * 100).toFixed(1)}%`);
  console.log(`Total PnL: $${result.metrics.totalPnl.toFixed(2)}`);
  console.log(`Return: ${result.metrics.totalReturnPct.toFixed(2)}%`);
  console.log(`Max Drawdown: ${result.metrics.maxDrawdownPct.toFixed(2)}%`);
  console.log(`Profit Factor: ${result.metrics.profitFactor === Infinity ? '∞' : result.metrics.profitFactor.toFixed(2)}`);
  console.log(`Expectancy: $${result.metrics.expectancy.toFixed(2)}/trade`);
  console.log(`Final Equity: $${result.metrics.finalEquity.toFixed(2)}`);

  if (Object.keys(result.metrics.byRegime).length > 0) {
    console.log('\nBy Regime:');
    for (const [regime, m] of Object.entries(result.metrics.byRegime)) {
      console.log(
        `  ${regime}: ${m.trades} trades, ${(m.winRate * 100).toFixed(0)}% win, $${m.pnl.toFixed(2)} pnl`,
      );
    }
  }

  if (result.trades.length > 0) {
    console.log('\nLast Trade:');
    const t = result.trades[result.trades.length - 1]!;
    console.log(`  Entry: $${t.entryPrice.toFixed(2)} → Exit: $${t.exitPrice.toFixed(2)}`);
    console.log(`  PnL: $${t.pnl.toFixed(2)} (${t.exitReason})`);
    console.log(`  Score: ${t.score}, Regime: ${t.regime}`);
    console.log(`  MAE: $${t.mae.toFixed(2)}, MFE: $${t.mfe.toFixed(2)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});