import { logger } from '../lib/logger.js';
import type { MonitoredPosition } from '../monitor/types.js';
import type { ClosedTrade, SignalRecord } from '../performance/types.js';
import type { ReportCard } from '../report-cards/types.js';
import { createSupabaseRest, SupabaseRest } from './supabase.js';

export interface EngineState {
  peakEquity: number;
  dailyPnl: number;
  dailyPnlDate: string | null;
}

/**
 * Maps the engine's in-memory domain objects to/from the Supabase schema.
 * Full objects are stored in JSONB (`state`/`content`/`rationale`) for faithful
 * rehydration; typed columns are populated alongside for SQL inspection.
 *
 * Every method is best-effort: write failures are logged and swallowed so a
 * persistence outage never interrupts trading. Loads throw so init() can decide
 * to start fresh.
 */
export class PersistenceService {
  constructor(private readonly db: SupabaseRest) {}

  // ---- engine state -------------------------------------------------------

  async loadEngineState(): Promise<EngineState | null> {
    const rows = await this.db.select<{
      peak_equity: string | number;
      daily_pnl: string | number;
      daily_pnl_date: string | null;
    }>('engine_state', 'select=*&id=eq.default');
    const row = rows[0];
    if (!row) return null;
    return {
      peakEquity: Number(row.peak_equity),
      dailyPnl: Number(row.daily_pnl),
      dailyPnlDate: row.daily_pnl_date,
    };
  }

  async saveEngineState(state: EngineState): Promise<void> {
    await this.write('engine_state', () =>
      this.db.upsert(
        'engine_state',
        [
          {
            id: 'default',
            peak_equity: state.peakEquity,
            daily_pnl: state.dailyPnl,
            daily_pnl_date: state.dailyPnlDate,
            updated_at: new Date().toISOString(),
          },
        ],
        'id',
      ),
    );
  }

  // ---- open positions -----------------------------------------------------

  async loadPositions(): Promise<MonitoredPosition[]> {
    const rows = await this.db.select<{ state: MonitoredPosition | null }>(
      'positions',
      'select=state',
    );
    return rows.map((r) => r.state).filter((s): s is MonitoredPosition => s != null);
  }

  /** Upsert the current position set and delete any rows no longer held. */
  async savePositions(positions: MonitoredPosition[]): Promise<void> {
    await this.write('positions', async () => {
      if (positions.length) {
        const now = new Date().toISOString();
        await this.db.upsert(
          'positions',
          positions.map((p) => ({
            symbol: p.symbol,
            qty: p.qty,
            entry_price: p.entryPrice,
            stop_price: p.trailingStop ?? p.stopPrice,
            state: p,
            updated_at: now,
          })),
          'symbol',
        );
      }

      const symbols = positions.map((p) => p.symbol);
      const filter = symbols.length
        ? `symbol=not.in.(${symbols.join(',')})`
        : 'id=not.is.null';
      await this.db.delete('positions', filter);
    });
  }

  // ---- closed trades ------------------------------------------------------

  async loadClosedTrades(): Promise<ClosedTrade[]> {
    const rows = await this.db.select<{ state: ClosedTrade | null }>(
      'trades',
      'select=state&order=closed_at.asc&limit=1000',
    );
    return rows.map((r) => r.state).filter((s): s is ClosedTrade => s != null);
  }

  async insertClosedTrade(trade: ClosedTrade): Promise<void> {
    await this.write('trades', () =>
      this.db.upsert(
        'trades',
        [
          {
            id: trade.id,
            symbol: trade.symbol,
            side: 'sell',
            qty: trade.qty,
            entry_price: trade.entryPrice,
            exit_price: trade.exitPrice,
            stop_price: trade.rationale.suggested_stop,
            target_price: trade.rationale.suggested_target,
            pnl: trade.pnl,
            exit_reason: trade.exitReason,
            attribution: { pnlPct: trade.pnlPct, regime: trade.regime, score: trade.score },
            state: trade,
            opened_at: trade.openedAt,
            closed_at: trade.closedAt,
          },
        ],
        'id',
      ),
    );
  }

  // ---- signals ------------------------------------------------------------

  async loadSignals(): Promise<SignalRecord[]> {
    const rows = await this.db.select<{
      id: string;
      symbol: string;
      score: string | number;
      regime: SignalRecord['regime'];
      rationale: SignalRecord['rationale'];
      executed: boolean;
      created_at: string;
    }>('signals', 'select=*&order=created_at.asc&limit=1000');
    return rows.map((r) => ({
      id: r.id,
      symbol: r.symbol,
      score: Number(r.score),
      regime: r.regime,
      rationale: r.rationale,
      executed: r.executed,
      createdAt: r.created_at,
    }));
  }

  async insertSignal(signal: SignalRecord): Promise<void> {
    await this.write('signals', () =>
      this.db.upsert(
        'signals',
        [
          {
            id: signal.id,
            symbol: signal.symbol,
            score: signal.score,
            rationale: signal.rationale,
            regime: signal.regime,
            executed: signal.executed,
            created_at: signal.createdAt,
          },
        ],
        'id',
      ),
    );
  }

  // ---- report cards -------------------------------------------------------

  async loadReportCards(): Promise<ReportCard[]> {
    const rows = await this.db.select<{ content: ReportCard | null }>(
      'report_cards',
      'select=content&order=created_at.asc&limit=200',
    );
    return rows.map((r) => r.content).filter((c): c is ReportCard => c != null);
  }

  async insertReportCard(card: ReportCard): Promise<void> {
    await this.write('report_cards', () =>
      this.db.upsert(
        'report_cards',
        [
          {
            id: card.id,
            content: card,
            model: card.source,
            created_at: card.createdAt,
          },
        ],
        'id',
      ),
    );
  }

  /** Run a write, swallowing (but logging) failures so trading never breaks. */
  private async write(table: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      logger.error({ err, table }, 'Supabase persistence write failed');
    }
  }
}

/** Build a PersistenceService from env, or null when Supabase isn't configured. */
export function createPersistence(): PersistenceService | null {
  const db = createSupabaseRest();
  return db ? new PersistenceService(db) : null;
}
