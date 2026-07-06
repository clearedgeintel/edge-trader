import express, { type Express, type Request, type Response } from 'express';
import type { AppConfig } from '../config/schema.js';
import type { AlpacaClient } from '../data/alpaca/client.js';
import type { Scheduler } from '../scheduler/index.js';
import { isTradingPaused } from '../risk/guards.js';
import type { TradingEngine } from '../trading/engine.js';
import type { HealthCheckResult } from '../safety/types.js';
import { DASHBOARD_HTML } from './dashboard.js';

export interface StatusContext {
  config: AppConfig;
  alpaca: AlpacaClient | null;
  scheduler: Scheduler;
  tradingEngine: TradingEngine | null;
  startedAt: Date;
  startupHealth: HealthCheckResult;
}

export function createStatusRouter(ctx: StatusContext): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/dashboard', (_req: Request, res: Response) => {
    res.type('html').send(DASHBOARD_HTML);
  });

  app.get('/status', async (_req: Request, res: Response) => {
    const portfolio = ctx.tradingEngine?.getPortfolioState() ?? null;
    const pauseVeto = portfolio ? isTradingPaused(portfolio, ctx.config.risk) : null;

    let account = null;
    let marketOpen = null;

    if (ctx.alpaca) {
      try {
        const [acct, clock] = await Promise.all([
          ctx.alpaca.getAccount(),
          ctx.alpaca.getClock(),
        ]);
        account = {
          equity: parseFloat(acct.equity),
          cash: parseFloat(acct.cash),
          buyingPower: parseFloat(acct.buyingPower),
          status: acct.status,
        };
        marketOpen = clock.is_open;
      } catch {
        account = { error: 'Failed to fetch Alpaca account' };
      }
    }

    res.json({
      service: 'edge-trader',
      version: '0.4.0',
      startedAt: ctx.startedAt.toISOString(),
      scheduler: {
        running: ctx.scheduler.isRunning(),
        intervalMinutes: ctx.config.scheduler.scanIntervalMinutes,
      },
      trading: {
        paused: pauseVeto !== null,
        pauseReason: pauseVeto?.reason ?? null,
        pauseMessage: pauseVeto?.message ?? null,
        paper: ctx.config.alpaca.paper,
        executionEnabled: ctx.config.execution.enabled,
        monitorEnabled: ctx.config.monitor.enabled,
        reportCardsEnabled: ctx.config.reportCards.enabled,
        rampMode: ctx.config.ramp.mode,
        sizeMultiplier: ctx.tradingEngine?.getRampManager().getStatus(
          ctx.tradingEngine.getPerformanceStore().getSnapshot(
            ctx.tradingEngine.getPositionStore().getAll().length,
            portfolio?.equity,
          ),
          ctx.config.alpaca.paper,
        ).sizeMultiplier ?? 0,
      },
      startupHealth: ctx.startupHealth,
      account,
      marketOpen,
      risk: {
        riskPerTradePct: ctx.config.risk.riskPerTradePct,
        maxPortfolioHeatPct: ctx.config.risk.maxPortfolioHeatPct,
        maxConcurrentPositions: ctx.config.risk.maxConcurrentPositions,
        dailyLossLimitPct: ctx.config.risk.dailyLossLimitPct,
        maxDrawdownPausePct: ctx.config.risk.maxDrawdownPausePct,
      },
    });
  });

  app.get('/safety', (_req: Request, res: Response) => {
    const tracker = ctx.tradingEngine?.getSafetyTracker();
    res.json({
      status: tracker?.getStatus() ?? { canExecute: false, activeCircuits: [] },
      config: ctx.config.safety,
    });
  });

  app.get('/ramp', (_req: Request, res: Response) => {
    const ramp = ctx.tradingEngine?.getRampManager();
    const perf = ctx.tradingEngine?.getPerformanceStore();
    const openCount = ctx.tradingEngine?.getPositionStore().getAll().length ?? 0;
    const portfolio = ctx.tradingEngine?.getPortfolioState();

    res.json({
      config: ctx.config.ramp,
      status: ramp?.getStatus(
        perf?.getSnapshot(openCount, portfolio?.equity) ?? {
          totalTrades: 0, wins: 0, losses: 0, winRate: 0,
          totalPnl: 0, avgPnl: 0, todayPnl: 0, openPositions: 0, recentSignals: 0,
        },
        ctx.config.alpaca.paper,
      ) ?? null,
      history: ramp?.getHistory() ?? [],
    });
  });

  app.post('/ramp/advance', (_req: Request, res: Response) => {
    const ramp = ctx.tradingEngine?.getRampManager();
    const perf = ctx.tradingEngine?.getPerformanceStore();
    if (!ramp || !perf) {
      res.status(503).json({ error: 'Trading engine not available' });
      return;
    }

    const openCount = ctx.tradingEngine!.getPositionStore().getAll().length;
    const portfolio = ctx.tradingEngine!.getPortfolioState();
    const criteria = ramp.getStatus(
      perf.getSnapshot(openCount, portfolio?.equity),
      ctx.config.alpaca.paper,
    ).advancement;

    if (!criteria?.met) {
      res.status(400).json({
        error: 'Advancement criteria not met',
        criteria,
      });
      return;
    }

    const newMode = ramp.advance('Manual advance via API');
    res.json({ mode: newMode, message: `Advanced to ${newMode}` });
  });

  app.get('/performance', (_req: Request, res: Response) => {
    const perf = ctx.tradingEngine?.getPerformanceStore();
    const portfolio = ctx.tradingEngine?.getPortfolioState();
    const openCount = ctx.tradingEngine?.getPositionStore().getAll().length ?? 0;
    const equity = portfolio?.equity;

    res.json({
      snapshot: perf?.getSnapshot(openCount, equity) ?? {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnl: 0,
        avgPnl: 0,
        todayPnl: 0,
        openPositions: 0,
        recentSignals: 0,
      },
      trades: perf?.getTrades(30) ?? [],
      daily: perf?.getDailyPerformance() ?? [],
      signals: perf?.getSignals(20) ?? [],
    });
  });

  app.get('/report-cards', (_req: Request, res: Response) => {
    const store = ctx.tradingEngine?.getReportCardStore();
    const limit = parseInt(String(_req.query.limit ?? '20'), 10);
    res.json({
      count: store?.getAll().length ?? 0,
      cards: store?.getAll(limit) ?? [],
    });
  });

  app.get('/signals', (_req: Request, res: Response) => {
    const signals = ctx.tradingEngine?.getLastSignals() ?? [];
    res.json({
      count: signals.length,
      minConfluenceScore: ctx.config.strategy.minConfluenceScore,
      signals: signals.map((s) => ({
        symbol: s.symbol,
        score: s.score,
        rationale: s.rationale,
        proposal: {
          entryPrice: s.proposal.entryPrice,
          stopPrice: s.proposal.stopPrice,
          targetPrice: s.proposal.targetPrice,
          atr: s.proposal.atr,
        },
      })),
    });
  });

  app.get('/positions', (_req: Request, res: Response) => {
    const store = ctx.tradingEngine?.getPositionStore();
    const positions = store?.getAll() ?? [];
    res.json({
      count: positions.length,
      positions: positions.map((p) => ({
        symbol: p.symbol,
        qty: p.qty,
        originalQty: p.originalQty,
        entryPrice: p.entryPrice,
        stopPrice: p.stopPrice,
        targetPrice: p.targetPrice,
        trailingStop: p.trailingStop,
        partialTaken: p.partialTaken,
        bracketManaged: p.bracketManaged,
        score: p.rationale.score,
        regime: p.rationale.regime,
        openedAt: p.openedAt,
      })),
    });
  });

  app.get('/analysis', (_req: Request, res: Response) => {
    const features = ctx.tradingEngine?.getLastAnalysis() ?? [];
    res.json({
      watchlist: ctx.config.data.watchlist,
      benchmark: ctx.config.data.benchmarkSymbol,
      symbols: features.map((f) => ({
        symbol: f.symbol,
        timestamp: f.timestamp,
        regime: f.regime,
        priceAboveEma200: f.priceAboveEma200,
        relativeStrengthVsBenchmark: f.relativeStrengthVsBenchmark,
        pullbackVolumeDecreasing: f.pullbackVolumeDecreasing,
        rsiInPullbackZone: f.rsiInPullbackZone,
        nearValueZone: f.nearValueZone,
        avgDailyVolume: f.avgDailyVolume,
        indicators: {
          daily: { adx: f.daily.adx14, ema200: f.daily.ema200, rsi: f.daily.rsi14 },
          intraday: { rsi: f.intraday.rsi14, ema9: f.intraday.ema9, vwap: f.intraday.vwap },
        },
      })),
    });
  });

  return app;
}