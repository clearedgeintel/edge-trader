import { z } from 'zod';

export const RiskConfigSchema = z.object({
  /** Fraction of equity risked per trade (0.005 = 0.5%). */
  riskPerTradePct: z.number().min(0.001).max(0.05),
  /** Max total capital at risk across open positions. */
  maxPortfolioHeatPct: z.number().min(0.005).max(0.1),
  maxConcurrentPositions: z.number().int().min(1).max(20),
  /** ATR multiplier for adaptive stop distance. */
  atrMultiplier: z.number().min(0.5).max(5),
  /** Minimum reward-to-risk ratio required. */
  minRewardRisk: z.number().min(1).max(10),
  /** Pause trading after daily loss exceeds this fraction of equity. */
  dailyLossLimitPct: z.number().min(0.005).max(0.1),
  /** Circuit breaker: pause when drawdown from peak exceeds this. */
  maxDrawdownPausePct: z.number().min(0.02).max(0.5),
  /** Reject trades correlated above this with existing positions. */
  correlationThreshold: z.number().min(0).max(1),
  /** Minimum average daily volume for liquidity. */
  minAvgDailyVolume: z.number().int().min(0),
});

export const StrategyConfigSchema = z.object({
  minConfluenceScore: z.number().min(0).max(100),
  adxThreshold: z.number().min(10).max(50),
  rsiMin: z.number().min(0).max(100),
  rsiMax: z.number().min(0).max(100),
});

export const AlpacaConfigSchema = z.object({
  baseUrl: z.string().url(),
  dataUrl: z.string().url(),
  paper: z.boolean(),
});

export const SchedulerConfigSchema = z.object({
  scanIntervalMinutes: z.number().int().min(1).max(1440),
  marketTimezone: z.string(),
});

export const ApiConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  host: z.string(),
});

export const ExecutionConfigSchema = z.object({
  /** Must be explicitly enabled to place real orders. */
  enabled: z.boolean(),
  fractional: z.boolean(),
  /** Use Alpaca bracket orders (disabled when partials are active). */
  useBrackets: z.boolean(),
  /**
   * Place a broker-resident GTC stop order for whole-share positions so the
   * protective stop survives process restarts and between-scan gaps.
   * Fractional positions cannot rest stops at Alpaca and fall back to
   * monitor-poll exits.
   */
  brokerStops: z.boolean(),
  maxOrderRetries: z.number().int().min(0).max(5),
});

export const ReportCardConfigSchema = z.object({
  enabled: z.boolean(),
  useLlm: z.boolean(),
  llmModel: z.string(),
});

export const MonitorConfigSchema = z.object({
  enabled: z.boolean(),
  /** Fraction of position to sell at partial target (0.5 = 50%). */
  partialTakeProfitPct: z.number().min(0).max(1),
  /** R-multiple at which partial take-profit triggers. */
  partialTakeProfitR: z.number().min(0.5).max(10),
  /** ATR multiplier for trailing stop distance. */
  trailingStopAtrMultiplier: z.number().min(0.5).max(5),
  /** R-multiple profit before trailing stop activates. */
  trailingStopActivationR: z.number().min(0.5).max(10),
});

export const SafetyConfigSchema = z.object({
  maxOrdersPerDay: z.number().int().min(1).max(100),
  maxConsecutiveLosses: z.number().int().min(1).max(20),
  minEquity: z.number().min(0),
  consecutiveLossCooldownMinutes: z.number().int().min(15).max(1440),
});

export const RampConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['observation', 'paper', 'live_ramp', 'live_full']),
  /** Position size multiplier during live ramp (0.1 = 10%). */
  liveRampSizePct: z.number().min(0.05).max(0.5),
  paperMinDays: z.number().int().min(1),
  paperMinTrades: z.number().int().min(1),
  paperMinWinRate: z.number().min(0).max(1),
  liveRampMinDays: z.number().int().min(1),
  liveRampMinTrades: z.number().int().min(1),
  liveRampMinWinRate: z.number().min(0).max(1),
  autoAdvance: z.boolean(),
});

export const DataConfigSchema = z.object({
  benchmarkSymbol: z.string(),
  watchlist: z.array(z.string()).min(1),
  cacheTtlMinutes: z.object({
    '15Min': z.number().int().min(1),
    '1Hour': z.number().int().min(1),
    '1Day': z.number().int().min(1),
  }),
  lookbackBars: z.object({
    '15Min': z.number().int().min(50),
    '1Hour': z.number().int().min(50),
    '1Day': z.number().int().min(50),
  }),
});

export const AppConfigSchema = z.object({
  risk: RiskConfigSchema,
  strategy: StrategyConfigSchema,
  alpaca: AlpacaConfigSchema,
  scheduler: SchedulerConfigSchema,
  api: ApiConfigSchema,
  data: DataConfigSchema,
  execution: ExecutionConfigSchema,
  monitor: MonitorConfigSchema,
  reportCards: ReportCardConfigSchema,
  safety: SafetyConfigSchema,
  ramp: RampConfigSchema,
});

export type RiskConfig = z.infer<typeof RiskConfigSchema>;
export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;
export type AlpacaConfig = z.infer<typeof AlpacaConfigSchema>;
export type SchedulerConfig = z.infer<typeof SchedulerConfigSchema>;
export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export type DataConfig = z.infer<typeof DataConfigSchema>;
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;
export type MonitorConfig = z.infer<typeof MonitorConfigSchema>;
export type ReportCardConfig = z.infer<typeof ReportCardConfigSchema>;
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;
export type RampConfig = z.infer<typeof RampConfigSchema>;
export type RampMode = RampConfig['mode'];
export type AppConfig = z.infer<typeof AppConfigSchema>;