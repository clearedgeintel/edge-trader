import type { AppConfig } from './schema.js';

/** Small-account defaults tuned for $500–$1,000 starter capital. */
export const DEFAULT_CONFIG: AppConfig = {
  risk: {
    riskPerTradePct: 0.005,
    maxPortfolioHeatPct: 0.025,
    maxConcurrentPositions: 3,
    atrMultiplier: 1.8,
    minRewardRisk: 2.5,
    dailyLossLimitPct: 0.02,
    maxDrawdownPausePct: 0.1,
    correlationThreshold: 0.7,
    minAvgDailyVolume: 500_000,
  },
  strategy: {
    minConfluenceScore: 70,
    adxThreshold: 22,
    rsiMin: 35,
    rsiMax: 55,
  },
  alpaca: {
    baseUrl: 'https://paper-api.alpaca.markets',
    dataUrl: 'https://data.alpaca.markets',
    paper: true,
  },
  scheduler: {
    scanIntervalMinutes: 15,
    marketTimezone: 'America/New_York',
  },
  api: {
    port: 3000,
    host: '0.0.0.0',
  },
  data: {
    benchmarkSymbol: 'SPY',
    watchlist: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA'],
    cacheTtlMinutes: {
      '15Min': 5,
      '1Hour': 15,
      '1Day': 60,
    },
    lookbackBars: {
      '15Min': 200,
      '1Hour': 200,
      '1Day': 250,
    },
  },
  execution: {
    enabled: false,
    fractional: true,
    useBrackets: true,
    brokerStops: true,
    maxOrderRetries: 2,
  },
  monitor: {
    enabled: true,
    partialTakeProfitPct: 0.5,
    partialTakeProfitR: 1.0,
    trailingStopAtrMultiplier: 1.5,
    trailingStopActivationR: 1.5,
  },
  reportCards: {
    enabled: true,
    useLlm: false,
    llmModel: 'claude-3-5-haiku-20241022',
  },
  safety: {
    maxOrdersPerDay: 10,
    maxConsecutiveLosses: 3,
    minEquity: 100,
    consecutiveLossCooldownMinutes: 60,
  },
  ramp: {
    enabled: true,
    mode: 'observation',
    liveRampSizePct: 0.1,
    paperMinDays: 14,
    paperMinTrades: 10,
    paperMinWinRate: 0.45,
    liveRampMinDays: 7,
    liveRampMinTrades: 5,
    liveRampMinWinRate: 0.4,
    autoAdvance: false,
  },
  screener: {
    enabled: false,
    maxUniverse: 25,
    topN: 50,
    includeGainers: true,
    minPrice: 5,
    maxPrice: 1000,
    minDollarVolume: 20_000_000,
    refreshMinutes: 720,
  },
};