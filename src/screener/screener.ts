import type { ScreenerConfig } from '../config/schema.js';
import type { AlpacaClient, SymbolSnapshot } from '../data/alpaca/client.js';
import { logger } from '../lib/logger.js';

/** Common-stock ticker heuristic — drops warrants/units/dotted class shares cheaply. */
const SYMBOL_RE = /^[A-Z]{1,5}$/;

export interface ScreenedCandidate {
  symbol: string;
  price: number;
  dollarVolume: number;
}

/**
 * Pure filter + rank over snapshots (no network). Keeps liquid, reasonably
 * priced common stocks and ranks by dollar volume so a cap keeps the most
 * liquid names. The strategy's own trend/liquidity gates are the final filter.
 */
export function filterAndRankCandidates(
  snapshots: SymbolSnapshot[],
  config: ScreenerConfig,
): ScreenedCandidate[] {
  const seen = new Set<string>();
  const out: ScreenedCandidate[] = [];
  for (const s of snapshots) {
    if (!SYMBOL_RE.test(s.symbol) || seen.has(s.symbol)) continue;
    if (s.price < config.minPrice || s.price > config.maxPrice) continue;
    const dollarVolume = s.price * s.volume;
    if (dollarVolume < config.minDollarVolume) continue;
    seen.add(s.symbol);
    out.push({ symbol: s.symbol, price: s.price, dollarVolume });
  }
  out.sort((a, b) => b.dollarVolume - a.dollarVolume);
  return out;
}

/**
 * Builds a dynamic candidate universe from Alpaca's first-party screeners
 * (most-actives + optional gainers), refreshed on a cadence. Best-effort: any
 * failure falls back to the previous universe (or just the core watchlist).
 */
export class Screener {
  private cached: string[] = [];
  private lastRefresh = 0;

  constructor(
    private readonly client: AlpacaClient,
    private readonly config: ScreenerConfig,
  ) {}

  /** Core watchlist (always included, first) + screened candidates, capped. */
  async getUniverse(core: string[]): Promise<string[]> {
    if (!this.config.enabled) return core;

    const stale = Date.now() - this.lastRefresh > this.config.refreshMinutes * 60_000;
    if (stale || this.cached.length === 0) {
      try {
        this.cached = await this.buildCandidates(core);
        this.lastRefresh = Date.now();
        logger.info({ count: this.cached.length }, 'Screener universe refreshed');
      } catch (err) {
        logger.error({ err }, 'Screener refresh failed — using previous universe');
      }
    }

    const universe: string[] = [];
    const add = (sym: string) => {
      if (!universe.includes(sym)) universe.push(sym);
    };
    for (const s of core) add(s);
    for (const s of this.cached) {
      if (universe.length >= this.config.maxUniverse) break;
      add(s);
    }
    return universe.slice(0, this.config.maxUniverse);
  }

  private async buildCandidates(core: string[]): Promise<string[]> {
    const [actives, movers] = await Promise.all([
      this.client.getMostActives(this.config.topN),
      this.config.includeGainers
        ? this.client.getMovers(this.config.topN)
        : Promise.resolve({ gainers: [], losers: [] }),
    ]);

    const coreSet = new Set(core);
    const symbols = new Set<string>();
    for (const a of actives) {
      if (!coreSet.has(a.symbol) && SYMBOL_RE.test(a.symbol)) symbols.add(a.symbol);
    }
    for (const g of movers.gainers) {
      if (!coreSet.has(g.symbol) && SYMBOL_RE.test(g.symbol)) symbols.add(g.symbol);
    }

    if (symbols.size === 0) return [];
    const snapshots = await this.client.getSnapshots([...symbols]);
    return filterAndRankCandidates(snapshots, this.config).map((c) => c.symbol);
  }
}
