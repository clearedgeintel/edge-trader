import type { AppConfig } from '../config/schema.js';
import type { BarDataService } from '../data/bar-service.js';
import type { Bar } from '../data/types.js';
import { computeIndicators } from './indicators/index.js';
import { buildFeatures, type SymbolFeatures } from './features.js';
import { detectRegime } from './regime.js';

export * from './indicators/index.js';
export * from './regime.js';
export * from './features.js';
export * from './offline.js';

export class AnalysisEngine {
  private benchmarkDaily: Bar[] | null = null;
  private benchmarkFetchedAt = 0;
  private readonly benchmarkRefreshMs = 60 * 60 * 1000;

  constructor(
    private readonly barService: BarDataService,
    private readonly config: AppConfig,
  ) {}

  private async getBenchmarkDaily(): Promise<Bar[]> {
    const now = Date.now();
    if (
      this.benchmarkDaily &&
      now - this.benchmarkFetchedAt < this.benchmarkRefreshMs
    ) {
      return this.benchmarkDaily;
    }

    this.benchmarkDaily = await this.barService.getBars(
      this.config.data.benchmarkSymbol,
      '1Day',
    );
    this.benchmarkFetchedAt = now;
    return this.benchmarkDaily;
  }

  async analyzeSymbol(symbol: string): Promise<SymbolFeatures> {
    const mtf = await this.barService.getMultiTimeframe(symbol);
    const benchmarkDaily = await this.getBenchmarkDaily();

    const dailyIndicators = computeIndicators(mtf.daily);
    const hourlyIndicators = computeIndicators(mtf.hourly);
    const intradayIndicators = computeIndicators(mtf.intraday);

    const regimeResult = detectRegime(
      mtf.daily,
      dailyIndicators,
      this.config.strategy,
    );

    return buildFeatures(
      mtf,
      dailyIndicators,
      hourlyIndicators,
      intradayIndicators,
      regimeResult,
      this.config.strategy,
      benchmarkDaily,
    );
  }

  async analyzeSymbols(symbols: string[]): Promise<SymbolFeatures[]> {
    return Promise.all(symbols.map((s) => this.analyzeSymbol(s)));
  }
}