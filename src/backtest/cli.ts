#!/usr/bin/env node
import 'dotenv/config';
import { loadConfigFromEnv } from '../config/index.js';
import { createAlpacaClient } from '../data/alpaca/client.js';
import { Screener } from '../screener/index.js';
import { runSweep, type SweepBreakdownRow } from './sweep.js';

function flagVal(args: string[], name: string, def: string): string {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
}

function printBreakdown(title: string, rows: SweepBreakdownRow[], limit = 12): void {
  console.log('\n' + title);
  for (const r of rows.slice(0, limit)) {
    const net = (r.netPnl >= 0 ? '+$' : '-$') + Math.abs(r.netPnl).toFixed(2);
    console.log(
      '  ' +
        r.key.padEnd(14) +
        String(r.trades).padStart(4) + ' trades  ' +
        (r.winRate * 100).toFixed(0).padStart(3) + '% win  ' +
        net.padStart(10) + '  ' +
        (r.avgR >= 0 ? '+' : '') + r.avgR.toFixed(2) + 'R',
    );
  }
}

async function main(): Promise<void> {
  const config = loadConfigFromEnv();
  const args = process.argv.slice(2);

  const days = parseInt(flagVal(args, '--days', '365'), 10);
  const equity = parseFloat(flagVal(args, '--equity', '1000'));
  const signalEvery = parseInt(flagVal(args, '--signal-every', '4'), 10);
  const useUniverse = args.includes('--universe');
  const flagValues = new Set(
    ['--days', '--equity', '--signal-every'].map((f) => flagVal(args, f, '\0')),
  );
  const explicit = args.filter((a) => !a.startsWith('--') && !flagValues.has(a));

  const alpaca = createAlpacaClient(config.alpaca);
  if (!alpaca) {
    console.error('Alpaca credentials not configured (set ALPACA_API_KEY / ALPACA_API_SECRET).');
    process.exit(1);
  }

  let symbols: string[];
  if (explicit.length > 0) {
    symbols = explicit.map((s) => s.toUpperCase());
  } else if (useUniverse) {
    const screener = new Screener(alpaca, { ...config.screener, enabled: true });
    symbols = await screener.getUniverse(config.data.watchlist);
  } else {
    symbols = config.data.watchlist;
  }

  console.log(`\nBacktesting ${symbols.length} symbol(s) over ~${days} days of 15m history...`);
  console.log(`Universe: ${symbols.join(', ')}`);
  console.log(`(min confluence ${config.strategy.minConfluenceScore}, RR ${config.risk.minRewardRisk}, ATR×${config.risk.atrMultiplier})`);

  const started = Date.now();
  const { aggregate: a, symbolsTested, symbolsSkipped } = await runSweep(alpaca, config, symbols, {
    intradayDays: days,
    benchmarkSymbol: config.data.benchmarkSymbol,
    startingEquity: equity,
    slippageBps: 5,
    signalEveryNBars: signalEvery,
    concurrency: 5,
  });

  const money = (n: number) => (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2);
  const pf = a.profitFactor == null ? '∞' : a.profitFactor.toFixed(2);
  const verdict =
    a.trades < 30
      ? 'INSUFFICIENT SAMPLE — widen --days or universe'
      : a.expectancy > 0 && a.profitFactor != null && a.profitFactor > 1.1
      ? 'POSITIVE EDGE (paper-validate before trusting)'
      : a.expectancy > -0.02 * equity && a.profitFactor != null && a.profitFactor >= 0.95
      ? 'MARGINAL — roughly breakeven'
      : 'NEGATIVE EDGE — the strategy loses as configured';

  console.log('\n' + '='.repeat(52));
  console.log(`RESULT — ${symbolsTested} symbols tested${symbolsSkipped.length ? `, ${symbolsSkipped.length} skipped (thin history)` : ''}, ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log('='.repeat(52));
  console.log(`Trades:        ${a.trades}`);
  console.log(`Win rate:      ${(a.winRate * 100).toFixed(1)}%  (${a.wins}W / ${a.losses}L)`);
  console.log(`Profit factor: ${pf}`);
  console.log(`Expectancy:    ${money(a.expectancy)}/trade   |   avg ${(a.avgR >= 0 ? '+' : '') + a.avgR.toFixed(2)}R`);
  console.log(`Avg win/loss:  ${money(a.avgWin)} / ${money(a.avgLoss)}`);
  console.log(`Net P&L:       ${money(a.netPnl)}  (on $${equity} per-symbol)`);
  console.log(`\n>>> ${verdict}`);

  printBreakdown('By score band:', a.byScoreBand);
  printBreakdown('By regime:', a.byRegime);
  printBreakdown('By exit reason:', a.byExitReason);
  printBreakdown('Best symbols:', a.bySymbol, 8);
  printBreakdown('Worst symbols:', [...a.bySymbol].reverse(), 8);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
