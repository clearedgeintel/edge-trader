import { DateTime } from 'luxon';
import type { AnalysisEngine } from '../analysis/index.js';
import type { AppConfig } from '../config/schema.js';
import type { AlpacaClient, AlpacaOrder } from '../data/alpaca/client.js';
import { OrderExecutor } from '../execution/executor.js';
import { buildPortfolioState, reconcilePositions } from '../execution/reconcile.js';
import { logger } from '../lib/logger.js';
import {
  applyPartialExit,
  evaluatePosition,
  PositionStore,
  updateTrailingStop,
} from '../monitor/index.js';
import { PerformanceStore } from '../performance/store.js';
import type { PersistenceService } from '../persistence/service.js';
import type { ClosedTrade, SignalRecord } from '../performance/types.js';
import type { ReportCard } from '../report-cards/types.js';
import { RampManager } from '../ramp/manager.js';
import { ReportCardGenerator } from '../report-cards/generator.js';
import { ReportCardStore } from '../report-cards/store.js';
import { evaluateTrade, isTradingPaused } from '../risk/guards.js';
import { applySizeMultiplier, calculatePositionSize } from '../risk/sizing.js';
import type { PortfolioState } from '../risk/types.js';
import type { SymbolFeatures } from '../analysis/features.js';
import type { MonitoredPosition } from '../monitor/types.js';
import { checkSafetyCircuits } from '../safety/circuits.js';
import { SafetyTracker } from '../safety/tracker.js';
import { createDefaultStrategy } from '../strategy/index.js';
import type { Signal } from '../strategy/types.js';

export interface ScanResult {
  analysis: SymbolFeatures[];
  signals: Signal[];
  executions: { symbol: string; success: boolean; message: string }[];
  monitorActions: { symbol: string; action: string; reason: string }[];
  reconcile: { adopted: string[]; removed: string[]; synced: string[] };
  reportCards: number;
  safetyBlocked: boolean;
}

export class TradingEngine {
  private readonly strategy;
  private readonly store = new PositionStore();
  private readonly executor: OrderExecutor;
  private readonly performance = new PerformanceStore();
  private readonly reportCardGen: ReportCardGenerator;
  private readonly reportCardStore = new ReportCardStore();
  private readonly safetyTracker: SafetyTracker;
  private readonly rampManager: RampManager;
  private peakEquity = 0;
  private dailyPnl = 0;
  /** Market-timezone calendar date the dailyPnl accumulator currently covers. */
  private dailyPnlDate: string | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly alpaca: AlpacaClient,
    private readonly analysisEngine: AnalysisEngine,
    private readonly persistence: PersistenceService | null = null,
  ) {
    this.strategy = createDefaultStrategy(config);
    this.executor = new OrderExecutor(alpaca, config);
    this.reportCardGen = new ReportCardGenerator(config.reportCards);
    this.safetyTracker = new SafetyTracker(config.safety);
    this.rampManager = new RampManager(config.ramp);
  }

  /**
   * Rehydrate durable state from Supabase before the first scan. Best-effort:
   * on any failure we log and start from a clean in-memory state (the next scan
   * re-syncs positions against Alpaca regardless).
   */
  async init(): Promise<void> {
    if (!this.persistence) return;
    try {
      const state = await this.persistence.loadEngineState();
      if (state) {
        this.peakEquity = state.peakEquity;
        this.dailyPnl = state.dailyPnl;
        this.dailyPnlDate = state.dailyPnlDate;
      }

      const [positions, trades, signals, cards] = await Promise.all([
        this.persistence.loadPositions(),
        this.persistence.loadClosedTrades(),
        this.persistence.loadSignals(),
        this.persistence.loadReportCards(),
      ]);

      if (positions.length) this.store.hydrate(positions);
      this.performance.hydrate(trades, signals);
      this.reportCardStore.hydrate(cards);

      logger.info(
        { positions: positions.length, trades: trades.length, signals: signals.length },
        'Rehydrated state from Supabase',
      );
    } catch (err) {
      logger.error({ err }, 'Failed to rehydrate from Supabase — starting from clean state');
    }
  }

  getPositionStore(): PositionStore {
    return this.store;
  }

  getExecutor(): OrderExecutor {
    return this.executor;
  }

  getPerformanceStore(): PerformanceStore {
    return this.performance;
  }

  getReportCardStore(): ReportCardStore {
    return this.reportCardStore;
  }

  getSafetyTracker(): SafetyTracker {
    return this.safetyTracker;
  }

  getRampManager(): RampManager {
    return this.rampManager;
  }

  getPortfolioState(): PortfolioState | null {
    return this.lastPortfolio;
  }

  private lastPortfolio: PortfolioState | null = null;
  private lastAnalysis: SymbolFeatures[] = [];
  private lastSignals: Signal[] = [];

  getLastAnalysis(): SymbolFeatures[] {
    return this.lastAnalysis;
  }

  getLastSignals(): Signal[] {
    return this.lastSignals;
  }

  /** Today's accumulated realized P&L (resets at the market-day boundary). */
  getDailyPnl(): number {
    return this.dailyPnl;
  }

  /**
   * Reset the realized-P&L accumulator when the market-timezone calendar day
   * changes. Must run before any P&L is read or accumulated within a scan.
   */
  private rollDailyPnl(): void {
    const today = DateTime.now()
      .setZone(this.config.scheduler.marketTimezone)
      .toISODate();
    if (this.dailyPnlDate !== today) {
      this.dailyPnlDate = today;
      this.dailyPnl = 0;
    }
  }

  /** Accumulate a realized P&L amount into today's running total. */
  private addRealizedPnl(pnl: number): void {
    this.rollDailyPnl();
    this.dailyPnl += pnl;
  }

  async runScan(): Promise<ScanResult> {
    const result: ScanResult = {
      analysis: [],
      signals: [],
      executions: [],
      monitorActions: [],
      reconcile: { adopted: [], removed: [], synced: [] },
      reportCards: 0,
      safetyBlocked: false,
    };

    try {
      await this.executeScan(result);
    } finally {
      // Always snapshot durable state, even on early return or error.
      await this.persistScanStateSafe();
    }
    return result;
  }

  private async executeScan(result: ScanResult): Promise<void> {
    const [account, alpacaPositions, openOrders, closedOrders, clock] = await Promise.all([
      this.alpaca.getAccount(),
      this.alpaca.getPositions(),
      this.alpaca.getOrders('open'),
      this.alpaca.getOrders('closed'),
      this.alpaca.getClock(),
    ]);

    const equity = parseFloat(account.equity);
    this.peakEquity = Math.max(equity, this.peakEquity);
    this.performance.setStartingEquity(equity);
    this.rollDailyPnl();

    // Snapshot tracked positions before reconcile prunes broker-side exits, so
    // we can attribute any that closed out-of-band (e.g. a resting broker stop
    // that filled while the process was down or between scans).
    const trackedBefore = new Map(this.store.getAll().map((p) => [p.symbol, p]));
    result.reconcile = reconcilePositions(this.store, alpacaPositions);
    await this.attributeBrokerExits(
      result.reconcile.removed,
      trackedBefore,
      closedOrders,
      equity,
    );

    const monitorActions = await this.runMonitor(alpacaPositions, equity);
    result.monitorActions = monitorActions;

    this.lastPortfolio = buildPortfolioState(
      equity,
      this.peakEquity,
      this.dailyPnl,
      this.store,
    );

    const perfSnapshot = this.performance.getSnapshot(
      this.store.getAll().length,
      equity,
    );
    this.rampManager.tryAutoAdvance(perfSnapshot);

    if (isTradingPaused(this.lastPortfolio, this.config.risk)) {
      logger.warn('Scan skipped — trading paused by risk module');
      return;
    }

    this.lastAnalysis = await this.analysisEngine.analyzeSymbols(
      this.config.data.watchlist,
    );
    result.analysis = this.lastAnalysis;

    const signals: Signal[] = [];
    for (const features of this.lastAnalysis) {
      const stratResult = this.strategy.evaluate(features, equity);
      if (!stratResult.signal) continue;

      const risk = evaluateTrade(stratResult.signal.proposal, {
        config: this.config.risk,
        portfolio: this.lastPortfolio,
      });
      if (!risk.approved) continue;

      signals.push(stratResult.signal);
    }
    this.lastSignals = signals;
    result.signals = signals;

    for (const signal of signals) {
      const record = this.performance.recordSignal(signal, false);
      await this.persistSignal(record);

      const card = await this.reportCardGen.generate('signal', signal.symbol, {
        rationale: signal.rationale,
        performance: perfSnapshot,
        equity,
        riskPerTradePct: this.config.risk.riskPerTradePct,
      });
      if (card) {
        this.reportCardStore.add(card);
        await this.persistReportCard(card);
        result.reportCards++;
      }
    }

    if (!this.config.execution.enabled || !clock.is_open) {
      return;
    }

    const circuits = checkSafetyCircuits({
      config: this.config,
      equity,
      tracker: this.safetyTracker,
    });

    if (!circuits.allowed) {
      result.safetyBlocked = true;
      logger.warn({ reason: circuits.reason, message: circuits.message }, 'Execution blocked by safety circuit');
      return;
    }

    for (const signal of signals) {
      const sizing = calculatePositionSize(equity, signal.proposal, this.config.risk);
      if (!sizing) continue;

      const adjusted = applySizeMultiplier(sizing, circuits.sizeMultiplier);
      if (adjusted.qty <= 0) continue;

      const execResult = await this.executor.executeSignal(signal, adjusted, {
        config: this.config,
        marketOpen: clock.is_open,
        accountStatus: account.status,
        positions: alpacaPositions,
        openOrders,
        portfolio: this.lastPortfolio,
      });

      result.executions.push({
        symbol: signal.symbol,
        success: execResult.success,
        message: execResult.message,
      });

      if (execResult.success && execResult.qty) {
        this.safetyTracker.recordOrder();
        const useBracket =
          this.config.execution.useBrackets &&
          this.config.monitor.partialTakeProfitPct === 0;
        this.store.addFromSignal(signal, adjusted, execResult.qty, useBracket);
      }
    }
  }

  private async runMonitor(
    alpacaPositions: Awaited<ReturnType<AlpacaClient['getPositions']>>,
    equity: number,
  ): Promise<{ symbol: string; action: string; reason: string }[]> {
    const actions: { symbol: string; action: string; reason: string }[] = [];

    if (!this.config.monitor.enabled) return actions;

    const priceMap = new Map(
      alpacaPositions.map((p) => [p.symbol, parseFloat(p.currentPrice)]),
    );

    for (const pos of this.store.getAll()) {
      if (pos.bracketManaged) continue;

      const price = priceMap.get(pos.symbol);
      if (price === undefined) continue;

      const newTrail = updateTrailingStop(pos, price, this.config.monitor);
      if (newTrail !== pos.trailingStop) {
        this.store.update(pos.symbol, { trailingStop: newTrail });
      }

      let updated = this.store.get(pos.symbol)!;
      const effectiveStop =
        updated.trailingStop !== null
          ? Math.max(updated.trailingStop, updated.stopPrice)
          : updated.stopPrice;

      // Keep the broker-resident protective stop in sync (whole-share only).
      const brokerStopsOn =
        this.config.execution.enabled && this.config.execution.brokerStops;
      if (brokerStopsOn) {
        await this.syncBrokerStop(updated, effectiveStop, actions);
        updated = this.store.get(pos.symbol)!;
      }

      const action = evaluatePosition(updated, price, this.config.monitor);
      if (!action) continue;

      if (!this.config.execution.enabled) {
        logger.info({ action }, 'Monitor action (execution disabled, not submitting)');
        actions.push({ symbol: action.symbol, action: action.action, reason: action.reason });
        continue;
      }

      // If a broker stop is resting, let it execute stop/trailing exits so we
      // never double-sell; the next scan's reconcile records the fill.
      const brokerStopActive = updated.protectiveStopOrderId != null;
      if (
        brokerStopActive &&
        (action.action === 'stop_hit' || action.action === 'trailing_stop')
      ) {
        logger.debug(
          { symbol: action.symbol, action: action.action },
          'Stop level reached — broker-resident stop will execute; skipping market sell',
        );
        continue;
      }

      const isFullExit = action.action !== 'partial_take_profit';

      // Cancel the resting broker stop before a monitor-initiated full exit so
      // it can't fire on an already-flat position.
      if (isFullExit && updated.protectiveStopOrderId) {
        await this.cancelBrokerStop(updated);
        updated = this.store.get(pos.symbol)!;
      }

      const sellResult = await this.executor.submitSell(
        action.symbol,
        action.qty,
        action.reason,
      );

      if (sellResult.success) {
        actions.push({ symbol: action.symbol, action: action.action, reason: action.reason });
        this.safetyTracker.recordOrder();

        if (isFullExit) {
          const trade = this.performance.recordClosedTrade(
            updated,
            action.price,
            action.qty,
            action.action,
          );
          this.safetyTracker.recordTradeClose(trade.pnl);
          this.addRealizedPnl(trade.pnl);
          await this.persistClosedTrade(trade);
          await this.generateTradeCloseCard(trade, equity);
          this.store.remove(action.symbol);
        } else {
          const partialPnl = (action.price - updated.entryPrice) * action.qty;
          this.safetyTracker.recordTradeClose(partialPnl);
          this.addRealizedPnl(partialPnl);
          this.store.update(action.symbol, applyPartialExit(updated, action.qty));
          // Reduce/cancel the broker stop to match the remaining (now possibly
          // fractional) quantity.
          if (brokerStopsOn) {
            await this.syncBrokerStop(this.store.get(action.symbol)!, effectiveStop, actions);
          }
        }
      }
    }

    return actions;
  }

  /**
   * Ensure the broker-resident protective stop matches the position. Whole-share
   * positions get a resting GTC stop placed/replaced; fractional positions can't
   * (Alpaca restriction) and fall back to monitor-poll exits.
   */
  private async syncBrokerStop(
    pos: MonitoredPosition,
    desiredStop: number,
    actions: { symbol: string; action: string; reason: string }[],
  ): Promise<void> {
    const eligible = Number.isInteger(pos.qty) && pos.qty >= 1;
    const stop = roundPrice(desiredStop);

    if (!eligible) {
      if (pos.protectiveStopOrderId) {
        await this.cancelBrokerStop(pos);
        logger.warn(
          { symbol: pos.symbol, qty: pos.qty },
          'Position not whole-share — broker stop removed; monitor poll is the only protection',
        );
      }
      return;
    }

    const qtyStr = String(pos.qty);

    if (!pos.protectiveStopOrderId) {
      try {
        const order = await this.alpaca.submitStopOrder({
          symbol: pos.symbol,
          qty: qtyStr,
          stopPrice: stop,
        });
        this.store.update(pos.symbol, {
          protectiveStopOrderId: order.id,
          protectiveStopPrice: stop,
          protectiveStopQty: pos.qty,
        });
        this.safetyTracker.recordOrder();
        actions.push({
          symbol: pos.symbol,
          action: 'broker_stop_placed',
          reason: `GTC stop @ $${stop.toFixed(2)}`,
        });
        logger.info({ symbol: pos.symbol, stop, orderId: order.id }, 'Broker protective stop placed');
      } catch (err) {
        logger.error(
          { err, symbol: pos.symbol },
          'Failed to place broker protective stop — monitor poll fallback',
        );
      }
      return;
    }

    const priceDrift =
      pos.protectiveStopPrice == null || Math.abs(pos.protectiveStopPrice - stop) >= 0.01;
    const qtyDrift = pos.protectiveStopQty !== pos.qty;
    if (!priceDrift && !qtyDrift) return;

    try {
      const order = await this.alpaca.replaceStopOrder(pos.protectiveStopOrderId, qtyStr, stop);
      this.store.update(pos.symbol, {
        protectiveStopOrderId: order.id,
        protectiveStopPrice: stop,
        protectiveStopQty: pos.qty,
      });
      actions.push({
        symbol: pos.symbol,
        action: 'broker_stop_updated',
        reason: `GTC stop -> $${stop.toFixed(2)}`,
      });
      logger.info({ symbol: pos.symbol, stop, orderId: order.id }, 'Broker protective stop updated');
    } catch (err) {
      // Replace fails if the order already filled/canceled; clear so the next
      // scan re-evaluates (reconcile records a fill if it executed).
      logger.warn(
        { err, symbol: pos.symbol },
        'Broker stop replace failed; clearing for re-evaluation',
      );
      this.store.update(pos.symbol, {
        protectiveStopOrderId: null,
        protectiveStopPrice: null,
        protectiveStopQty: null,
      });
    }
  }

  /** Cancel a position's broker stop (best-effort) and clear its tracking. */
  private async cancelBrokerStop(pos: MonitoredPosition): Promise<void> {
    if (!pos.protectiveStopOrderId) return;
    try {
      await this.alpaca.cancelOrder(pos.protectiveStopOrderId);
    } catch (err) {
      logger.warn({ err, symbol: pos.symbol }, 'Failed to cancel broker protective stop');
    }
    this.store.update(pos.symbol, {
      protectiveStopOrderId: null,
      protectiveStopPrice: null,
      protectiveStopQty: null,
    });
  }

  /**
   * Record trades for positions that closed at the broker out-of-band (e.g. a
   * resting stop that filled while the process was down or between scans), so
   * performance, safety counters, and daily P&L stay accurate.
   */
  private async attributeBrokerExits(
    removed: string[],
    trackedBefore: Map<string, MonitoredPosition>,
    closedOrders: AlpacaOrder[],
    equity: number,
  ): Promise<void> {
    for (const symbol of removed) {
      const pos = trackedBefore.get(symbol);
      if (!pos) continue;

      // Clean up any stop that might still be resting (e.g. position closed
      // manually or via a target leg rather than the stop itself).
      if (pos.protectiveStopOrderId) {
        try {
          await this.alpaca.cancelOrder(pos.protectiveStopOrderId);
        } catch {
          /* already inactive */
        }
      }

      const exit = closedOrders
        .filter(
          (o) =>
            o.symbol === symbol &&
            o.side === 'sell' &&
            o.status === 'filled' &&
            o.filled_avg_price != null,
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

      if (!exit) {
        logger.warn({ symbol }, 'Position closed at broker but no fill found to attribute');
        continue;
      }

      const exitPrice = parseFloat(exit.filled_avg_price!);
      const exitQty = parseFloat(exit.filled_qty) || pos.qty;
      const trade = this.performance.recordClosedTrade(pos, exitPrice, exitQty, 'broker_stop');
      this.safetyTracker.recordTradeClose(trade.pnl);
      this.addRealizedPnl(trade.pnl);
      await this.persistClosedTrade(trade);
      await this.generateTradeCloseCard(trade, equity);
      logger.info({ symbol, exitPrice, pnl: trade.pnl }, 'Recorded broker-side exit');
    }
  }

  private async generateTradeCloseCard(
    trade: ReturnType<PerformanceStore['recordClosedTrade']>,
    equity: number,
  ): Promise<void> {
    const card = await this.reportCardGen.generate('trade_close', trade.symbol, {
      rationale: trade.rationale,
      trade,
      performance: this.performance.getSnapshot(this.store.getAll().length, equity),
      equity,
      riskPerTradePct: this.config.risk.riskPerTradePct,
    });
    if (card) {
      this.reportCardStore.add(card);
      await this.persistReportCard(card);
    }
  }

  // ---- persistence (best-effort write-through) ----------------------------

  /** Snapshot durable state (open positions + engine state) to Supabase. */
  private async persistScanStateSafe(): Promise<void> {
    if (!this.persistence) return;
    try {
      await this.persistence.savePositions(this.store.getAll());
      await this.persistence.saveEngineState({
        peakEquity: this.peakEquity,
        dailyPnl: this.dailyPnl,
        dailyPnlDate: this.dailyPnlDate,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to persist scan state');
    }
  }

  private async persistClosedTrade(trade: ClosedTrade): Promise<void> {
    if (this.persistence) await this.persistence.insertClosedTrade(trade);
  }

  private async persistSignal(signal: SignalRecord): Promise<void> {
    if (this.persistence) await this.persistence.insertSignal(signal);
  }

  private async persistReportCard(card: ReportCard): Promise<void> {
    if (this.persistence) await this.persistence.insertReportCard(card);
  }
}

function roundPrice(n: number): number {
  return Math.round(n * 100) / 100;
}