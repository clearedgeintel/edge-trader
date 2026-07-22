import { DEFAULT_CONFIG } from './defaults.js';
import {
  AppConfigSchema,
  RiskConfigSchema,
  type AppConfig,
  type RiskConfig,
} from './schema.js';

export * from './schema.js';
export { DEFAULT_CONFIG } from './defaults.js';

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const value = override[key];
    if (value === undefined) continue;
    const baseValue = base[key];
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof baseValue === 'object' &&
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMerge(
        baseValue as Record<string, unknown>,
        value as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      result[key] = value as T[keyof T];
    }
  }
  return result;
}

export function loadConfigFromEnv(): AppConfig {
  const overrides: Partial<AppConfig> = {};

  const riskOverrides: Partial<RiskConfig> = {};
  if (process.env.RISK_PER_TRADE_PCT) {
    riskOverrides.riskPerTradePct = parseFloat(process.env.RISK_PER_TRADE_PCT);
  }
  if (process.env.MAX_PORTFOLIO_HEAT_PCT) {
    riskOverrides.maxPortfolioHeatPct = parseFloat(process.env.MAX_PORTFOLIO_HEAT_PCT);
  }
  if (process.env.MAX_CONCURRENT_POSITIONS) {
    riskOverrides.maxConcurrentPositions = parseInt(process.env.MAX_CONCURRENT_POSITIONS, 10);
  }
  if (process.env.ATR_MULTIPLIER) {
    riskOverrides.atrMultiplier = parseFloat(process.env.ATR_MULTIPLIER);
  }
  if (process.env.MIN_REWARD_RISK) {
    riskOverrides.minRewardRisk = parseFloat(process.env.MIN_REWARD_RISK);
  }
  if (process.env.DAILY_LOSS_LIMIT_PCT) {
    riskOverrides.dailyLossLimitPct = parseFloat(process.env.DAILY_LOSS_LIMIT_PCT);
  }
  if (process.env.MAX_DRAWDOWN_PAUSE_PCT) {
    riskOverrides.maxDrawdownPausePct = parseFloat(process.env.MAX_DRAWDOWN_PAUSE_PCT);
  }
  if (Object.keys(riskOverrides).length > 0) {
    overrides.risk = { ...DEFAULT_CONFIG.risk, ...riskOverrides };
  }

  if (process.env.MIN_CONFLUENCE_SCORE) {
    overrides.strategy = {
      ...DEFAULT_CONFIG.strategy,
      minConfluenceScore: parseInt(process.env.MIN_CONFLUENCE_SCORE, 10),
    };
  }

  if (process.env.ALPACA_PAPER === 'false') {
    overrides.alpaca = {
      ...DEFAULT_CONFIG.alpaca,
      paper: false,
      baseUrl: 'https://api.alpaca.markets',
    };
  }

  if (process.env.ALPACA_FEED === 'iex' || process.env.ALPACA_FEED === 'sip') {
    overrides.alpaca = {
      ...DEFAULT_CONFIG.alpaca,
      ...(overrides.alpaca ?? {}),
      feed: process.env.ALPACA_FEED,
    };
  }

  if (process.env.PORT) {
    overrides.api = {
      ...DEFAULT_CONFIG.api,
      port: parseInt(process.env.PORT, 10),
    };
  }

  const screener = { ...DEFAULT_CONFIG.screener };
  let screenerTouched = false;
  if (process.env.SCREENER_ENABLED === 'true') {
    screener.enabled = true;
    screenerTouched = true;
  }
  if (process.env.SCREENER_MAX_UNIVERSE) {
    screener.maxUniverse = parseInt(process.env.SCREENER_MAX_UNIVERSE, 10);
    screenerTouched = true;
  }
  if (process.env.SCREENER_MIN_DOLLAR_VOLUME) {
    screener.minDollarVolume = parseFloat(process.env.SCREENER_MIN_DOLLAR_VOLUME);
    screenerTouched = true;
  }
  if (screenerTouched) overrides.screener = screener;

  if (process.env.EXECUTION_ENABLED === 'true' || process.env.BROKER_STOPS === 'false') {
    overrides.execution = {
      ...DEFAULT_CONFIG.execution,
      enabled: process.env.EXECUTION_ENABLED === 'true',
      brokerStops: process.env.BROKER_STOPS !== 'false',
    };
    if (process.env.EXECUTION_ENABLED === 'true' && !process.env.RAMP_MODE && !process.env.LIVE_ENABLED) {
      overrides.ramp = {
        ...DEFAULT_CONFIG.ramp,
        ...(overrides.ramp ?? {}),
        mode: 'paper',
      };
    }
  }

  if (process.env.REPORT_CARDS_LLM_ENABLED === 'true') {
    overrides.reportCards = {
      ...DEFAULT_CONFIG.reportCards,
      useLlm: true,
    };
  }

  if (process.env.LIVE_ENABLED === 'true') {
    overrides.ramp = {
      ...DEFAULT_CONFIG.ramp,
      mode: 'live_ramp',
    };
  }

  const rampMode = process.env.RAMP_MODE as import('./schema.js').RampMode | undefined;
  if (rampMode && ['observation', 'paper', 'live_ramp', 'live_full'].includes(rampMode)) {
    overrides.ramp = { ...DEFAULT_CONFIG.ramp, ...(overrides.ramp ?? {}), mode: rampMode };
  }

  const merged = deepMerge(DEFAULT_CONFIG, overrides);
  return AppConfigSchema.parse(merged);
}

/** Parse a partial runtime config update (e.g. from Supabase hot-reload). */
export function parseRuntimeConfigUpdate(raw: unknown): Partial<AppConfig> {
  return AppConfigSchema.partial().parse(raw);
}

/** Validate risk config in isolation for runtime updates. */
export function parseRiskConfigUpdate(raw: unknown): RiskConfig {
  return RiskConfigSchema.parse(raw);
}