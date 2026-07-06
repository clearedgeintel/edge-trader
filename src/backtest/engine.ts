import type { AppConfig } from '../config/schema.js';
import { analyzeFromBars } from '../analysis/offline.js';
import type { Bar } from '../data/types.js';
import { evaluateTrade, isTradingPaused } from '../risk/guards.js';
import type { OpenPosition, PortfolioState } from '../risk/types.js';
import { createDefaultStrategy } from '../strategy/index.js';
import type { Signal } from '../strategy/types.js';
import { computeMetrics } from './metrics.js';
import type {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
  ExitReason,
} from './types.js';

interface OpenBacktestPosition {
  symbol: string;
  qty: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  entryTime: string;
  entryBarIndex: number;
  signal: Signal;
  mae: number;
  mfe: number;
}

export interface BacktestInput {
  config: AppConfig;
  btConfig: BacktestConfig;
  daily: Bar[];
  hourly: Bar[];
  intraday: Bar[];
  benchmarkDaily: Bar[];
}

function applySlippage(price: number, slippageBps: number, side: 'buy' | 'sell'): number {
  const factor = slippageBps / 10_000;
  return side === 'buy' ? price * (1 + factor) : price * (1 - factor);
}

function dayKey(timestamp: string): string {
  return timestamp.slice(0, 10);
}

export function runBacktest(input: BacktestInput): BacktestResult {
  const { config, btConfig, daily, hourly, intraday, benchmarkDaily } = input;
  const strategy = createDefaultStrategy(config);

  let equity = btConfig.startingEquity;
  let peakEquity = equity;
  let dailyPnl = 0;
  let currentDay = '';
  const openPositions: OpenPosition[] = [];
  let active: OpenBacktestPosition | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: { timestamp: string; equity: number }[] = [
    { timestamp: intraday[0]?.timestamp ?? '', equity },
  ];

  const minStart = 50;

  for (let i = minStart; i < intraday.length; i++) {
    const bar = intraday[i]!;
    const barDay = dayKey(bar.timestamp);

    if (currentDay && barDay !== currentDay) {
      dailyPnl = 0;
    }
    currentDay = barDay;

    if (active) {
      const pos = active;
      const unrealizedLow = (bar.low - pos.entryPrice) * pos.qty;
      const unrealizedHigh = (bar.high - pos.entryPrice) * pos.qty;
      pos.mae = Math.min(pos.mae, unrealizedLow);
      pos.mfe = Math.max(pos.mfe, unrealizedHigh);

      let exitPrice: number | null = null;
      let exitReason: ExitReason | null = null;

      if (bar.low <= pos.stopPrice) {
        exitPrice = applySlippage(pos.stopPrice, btConfig.slippageBps, 'sell');
        exitReason = 'stop_hit';
      } else if (bar.high >= pos.targetPrice) {
        exitPrice = applySlippage(pos.targetPrice, btConfig.slippageBps, 'sell');
        exitReason = 'target_hit';
      }

      if (exitPrice !== null && exitReason !== null) {
        const pnl = (exitPrice - pos.entryPrice) * pos.qty;
        equity += pnl;
        dailyPnl += pnl;
        peakEquity = Math.max(peakEquity, equity);

        trades.push({
          symbol: pos.symbol,
          entryPrice: pos.entryPrice,
          exitPrice,
          qty: pos.qty,
          pnl,
          pnlPct: pos.entryPrice > 0 ? ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0,
          entryTime: pos.entryTime,
          exitTime: bar.timestamp,
          exitReason,
          regime: pos.signal.rationale.regime,
          score: pos.signal.score,
          mae: pos.mae,
          mfe: pos.mfe,
          rationale: pos.signal.rationale,
          holdingBars: i - pos.entryBarIndex,
        });

        active = null;
        openPositions.length = 0;
        equityCurve.push({ timestamp: bar.timestamp, equity });
        continue;
      }
    }

    if (active) continue;
    if (i % btConfig.signalEveryNBars !== 0) continue;

    const portfolio: PortfolioState = {
      equity,
      peakEquity,
      dailyPnl,
      openPositions,
    };

    if (isTradingPaused(portfolio, config.risk)) continue;

    const features = analyzeFromBars(
      btConfig.symbol,
      daily,
      hourly,
      intraday,
      benchmarkDaily,
      config.strategy,
      bar.timestamp,
    );
    if (!features) continue;

    const result = strategy.evaluate(features, equity);
    if (!result.signal) continue;

    const riskDecision = evaluateTrade(result.signal.proposal, {
      config: config.risk,
      portfolio,
    });
    if (!riskDecision.approved) continue;

    const entryPrice = applySlippage(bar.close, btConfig.slippageBps, 'buy');
    const qty = riskDecision.sizing.qty;

    active = {
      symbol: btConfig.symbol,
      qty,
      entryPrice,
      stopPrice: result.signal.proposal.stopPrice,
      targetPrice: result.signal.proposal.targetPrice,
      entryTime: bar.timestamp,
      entryBarIndex: i,
      signal: result.signal,
      mae: 0,
      mfe: 0,
    };

    openPositions.push({
      symbol: btConfig.symbol,
      qty,
      entryPrice,
      stopPrice: result.signal.proposal.stopPrice,
    });
  }

  if (active) {
    const lastBar = intraday[intraday.length - 1]!;
    const exitPrice = applySlippage(lastBar.close, btConfig.slippageBps, 'sell');
    const pnl = (exitPrice - active.entryPrice) * active.qty;
    equity += pnl;

    trades.push({
      symbol: active.symbol,
      entryPrice: active.entryPrice,
      exitPrice,
      qty: active.qty,
      pnl,
      pnlPct:
        active.entryPrice > 0
          ? ((exitPrice - active.entryPrice) / active.entryPrice) * 100
          : 0,
      entryTime: active.entryTime,
      exitTime: lastBar.timestamp,
      exitReason: 'end_of_data',
      regime: active.signal.rationale.regime,
      score: active.signal.score,
      mae: active.mae,
      mfe: active.mfe,
      rationale: active.signal.rationale,
      holdingBars: intraday.length - 1 - active.entryBarIndex,
    });

    equityCurve.push({ timestamp: lastBar.timestamp, equity });
  }

  const metrics = computeMetrics(trades, btConfig.startingEquity, equityCurve);

  return {
    config: btConfig,
    trades,
    metrics,
    equityCurve,
  };
}