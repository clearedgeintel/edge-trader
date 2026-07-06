import type { BacktestMetrics, BacktestTrade, RegimeMetrics } from './types.js';

export function computeMetrics(
  trades: BacktestTrade[],
  startingEquity: number,
  equityCurve: { timestamp: string; equity: number }[],
): BacktestMetrics {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  const byRegime: Record<string, RegimeMetrics> = {};
  for (const trade of trades) {
    const key = trade.regime;
    if (!byRegime[key]) {
      byRegime[key] = { trades: 0, wins: 0, pnl: 0, winRate: 0 };
    }
    byRegime[key]!.trades++;
    byRegime[key]!.pnl += trade.pnl;
    if (trade.pnl > 0) byRegime[key]!.wins++;
  }
  for (const regime of Object.values(byRegime)) {
    regime.winRate = regime.trades > 0 ? regime.wins / regime.trades : 0;
  }

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length > 0 ? wins.length / trades.length : 0,
    totalPnl,
    totalReturnPct: startingEquity > 0 ? (totalPnl / startingEquity) * 100 : 0,
    avgPnl: trades.length > 0 ? totalPnl / trades.length : 0,
    avgWin: wins.length > 0 ? grossWin / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxDrawdownPct: computeMaxDrawdown(equityCurve) * 100,
    expectancy: trades.length > 0 ? totalPnl / trades.length : 0,
    finalEquity: startingEquity + totalPnl,
    byRegime,
  };
}

function computeMaxDrawdown(curve: { equity: number }[]): number {
  let peak = curve[0]?.equity ?? 0;
  let maxDd = 0;

  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) {
      maxDd = Math.max(maxDd, (peak - point.equity) / peak);
    }
  }
  return maxDd;
}