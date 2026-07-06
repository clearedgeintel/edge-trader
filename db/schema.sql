-- edge-trader Supabase schema (Phase 0 foundation)
-- Run via Supabase SQL editor or migration tool.

-- Hot-reloadable runtime config
CREATE TABLE IF NOT EXISTS runtime_config (
  id          TEXT PRIMARY KEY DEFAULT 'default',
  config      JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trading signals with full structured rationale
CREATE TABLE IF NOT EXISTS signals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol      TEXT NOT NULL,
  score       NUMERIC(5,2) NOT NULL,
  rationale   JSONB NOT NULL,
  regime      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol_created ON signals (symbol, created_at DESC);

-- Executed trades linked to signals
CREATE TABLE IF NOT EXISTS trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       UUID REFERENCES signals(id),
  symbol          TEXT NOT NULL,
  side            TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  qty             NUMERIC(18,8) NOT NULL,
  entry_price     NUMERIC(18,4) NOT NULL,
  exit_price      NUMERIC(18,4),
  stop_price      NUMERIC(18,4),
  target_price    NUMERIC(18,4),
  pnl             NUMERIC(18,4),
  exit_reason     TEXT,
  attribution     JSONB,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades (symbol);
CREATE INDEX IF NOT EXISTS idx_trades_opened ON trades (opened_at DESC);

-- Current open positions (synced from Alpaca)
CREATE TABLE IF NOT EXISTS positions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          TEXT NOT NULL UNIQUE,
  qty             NUMERIC(18,8) NOT NULL,
  entry_price     NUMERIC(18,4) NOT NULL,
  stop_price      NUMERIC(18,4),
  current_price   NUMERIC(18,4),
  unrealized_pnl  NUMERIC(18,4),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily performance rollup
CREATE TABLE IF NOT EXISTS daily_performance (
  date            DATE PRIMARY KEY,
  equity_start    NUMERIC(18,4),
  equity_end      NUMERIC(18,4),
  pnl             NUMERIC(18,4),
  trades_count    INTEGER DEFAULT 0,
  win_rate        NUMERIC(5,4),
  max_drawdown    NUMERIC(5,4),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backtest runs
CREATE TABLE IF NOT EXISTS backtest_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  config_snapshot JSONB NOT NULL,
  metrics         JSONB,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS backtest_trades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  entry_price     NUMERIC(18,4) NOT NULL,
  exit_price      NUMERIC(18,4),
  qty             NUMERIC(18,8) NOT NULL,
  pnl             NUMERIC(18,4),
  mae             NUMERIC(18,4),
  mfe             NUMERIC(18,4),
  exit_reason     TEXT,
  rationale       JSONB,
  opened_at       TIMESTAMPTZ NOT NULL,
  closed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_backtest_trades_run ON backtest_trades (run_id);

-- LLM report cards (post-decision only)
CREATE TABLE IF NOT EXISTS report_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       UUID REFERENCES signals(id),
  trade_id        UUID REFERENCES trades(id),
  content         JSONB NOT NULL,
  model           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default runtime config
INSERT INTO runtime_config (id, config)
VALUES ('default', '{
  "risk": {
    "riskPerTradePct": 0.005,
    "maxPortfolioHeatPct": 0.025,
    "maxConcurrentPositions": 3,
    "atrMultiplier": 1.8,
    "minRewardRisk": 2.5,
    "dailyLossLimitPct": 0.02,
    "maxDrawdownPausePct": 0.1,
    "correlationThreshold": 0.7,
    "minAvgDailyVolume": 500000
  },
  "strategy": {
    "minConfluenceScore": 70,
    "adxThreshold": 22,
    "rsiMin": 35,
    "rsiMax": 55
  }
}'::jsonb)
ON CONFLICT (id) DO NOTHING;