# edge-trader

Data-analysis-first algorithmic trading bot for small retail accounts ($500–$1,000). Built on Alpaca paper/live trading with transparent signals, strict risk controls, and educational report cards.

## Quick Start

### Prerequisites

- Node.js 20+
- [Alpaca](https://alpaca.markets/) paper trading account (free)
- Optional: [Anthropic API key](https://console.anthropic.com/) for LLM report cards

### Setup

```bash
git clone https://github.com/clearedgeintel/edge-trader.git
cd edge-trader
npm install
cp .env.example .env
# Add your Alpaca API keys to .env
```

### Run (analysis only — safe default)

```bash
npm run dev
```

Open the dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

Execution is **disabled by default**. The bot will analyze, score, and generate report cards without placing orders.

### Enable paper trading

```bash
# .env
EXECUTION_ENABLED=true
ALPACA_API_KEY=your_paper_key
ALPACA_API_SECRET=your_paper_secret
```

Run paper trading for **2–4 weeks** before considering live capital. With `EXECUTION_ENABLED=true`, ramp mode auto-sets to `paper`.

## Live Ramp (Phase 5)

edge-trader enforces a strict progression before live capital:

| Phase | Mode | Size | Requirements |
|-------|------|------|--------------|
| 1 | `observation` | 0% | Analyze + report cards only (default) |
| 2 | `paper` | 100% | Paper trade, validate fills/stops |
| 3 | `live_ramp` | 10% | Live with reduced size |
| 4 | `live_full` | 100% | Full live after ramp validation |

### Advance from paper → live ramp

```bash
# .env — after paper validation criteria met
ALPACA_PAPER=false
LIVE_ENABLED=true
RAMP_MODE=live_ramp
EXECUTION_ENABLED=true
```

Check advancement progress: `GET /ramp` or the dashboard. Manually advance when ready: `POST /ramp/advance`.

### Safety circuits

| Circuit | Default | Action |
|---------|---------|--------|
| Kill switch | `KILL_SWITCH=false` | Halts all orders instantly |
| Max orders/day | 10 | Prevents runaway order loops |
| Consecutive losses | 3 | 60-min cooldown after 3 losses |
| Min equity | $100 | Blocks trading below floor |
| Paper/live mismatch | — | Prevents wrong API for ramp phase |

## Small-Account Onboarding

### Recommended path

1. **Week 1–2**: Run with `EXECUTION_ENABLED=false`. Review signals and report cards daily.
2. **Week 3–4**: Enable paper execution. Verify fills, stops, and partials behave as expected.
3. **Week 5+**: If paper results are positive, ramp live capital at 5–10% of intended size first.

### Default risk settings (for $500–$1,000)

| Parameter | Default | Meaning |
|-----------|---------|---------|
| `riskPerTradePct` | 0.5% | $2.50–$5 risk per trade |
| `maxPortfolioHeatPct` | 2.5% | Max $12.50–$25 total at risk |
| `maxConcurrentPositions` | 3 | Keeps exposure manageable |
| `dailyLossLimitPct` | 2% | Pause after a bad day |
| `maxDrawdownPausePct` | 10% | Circuit breaker from peak |
| `minRewardRisk` | 2.5:1 | Only take trades with 2.5× payoff |

These are conservative by design. Do not increase risk until you have validated edge on paper.

### What the bot does each scan (every 15 min)

```
Reconcile positions → Monitor exits → Analyze watchlist → Score signals → Risk veto → Execute (if enabled)
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /dashboard` | Web UI |
| `GET /status` | Service health, account, risk state |
| `GET /analysis` | Multi-TF features per symbol |
| `GET /signals` | Actionable signals from last scan |
| `GET /positions` | Monitored open positions |
| `GET /performance` | P&L, win rate, trade history |
| `GET /report-cards` | Educational report cards |
| `GET /safety` | Active safety circuits |
| `GET /ramp` | Ramp phase + advancement criteria |
| `POST /ramp/advance` | Manually advance ramp phase |

## Backtesting

```bash
npm run backtest          # synthetic data demo
npm run backtest AAPL 1000
```

## Report Cards

Generated automatically after each signal and trade close. Template-based by default; enable LLM enrichment:

```bash
REPORT_CARDS_LLM_ENABLED=true
ANTHROPIC_API_KEY=your_key
```

The LLM is **post-decision only** — it never influences trade entries.

## Configuration

All parameters are in `src/config/defaults.ts` and overridable via environment variables. Key vars:

```
EXECUTION_ENABLED=false       # Must opt-in to place orders
BROKER_STOPS=true             # Resting GTC stop at Alpaca for whole-share positions
RAMP_MODE=observation         # observation | paper | live_ramp | live_full
LIVE_ENABLED=false            # Required for live trading
KILL_SWITCH=false             # Emergency halt
REPORT_CARDS_LLM_ENABLED=false
RISK_PER_TRADE_PCT=0.005
MIN_CONFLUENCE_SCORE=70
PORT=3000
```

## Docker

```bash
docker compose up --build
```

## Project Structure

```
src/
├── analysis/      # Indicators, regime detection, features
├── strategy/      # MomentumPullback confluence scoring
├── risk/          # Position sizing + veto guards
├── execution/     # Order placement + safety gates
├── monitor/       # Partials, trailing stops
├── backtest/      # Event-driven backtester
├── report-cards/  # Template + LLM educational cards
├── performance/   # Trade attribution + metrics
├── persistence/   # Optional Supabase durability layer
└── trading/       # Scan orchestrator
```

## Persistence

State is in-memory by default. Set `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` to
persist and rehydrate across restarts:

- **Open positions** (with stops, trailing, partial state, and broker-stop ids)
- **Closed trades & signals** (history powering win rate / ramp advancement)
- **Report cards**
- **Engine state** — peak equity and realized daily P&L, so the drawdown and
  daily-loss circuit breakers survive a restart instead of resetting

Apply the schema first (`db/schema.sql`), then run normally. Persistence is
best-effort: a Supabase outage is logged and never interrupts trading. On
startup the engine rehydrates, then reconciles positions against Alpaca — so a
fill that happened while the process was down is detected and recorded.

## Tests

```bash
npm test
npm run build
```

## License

MIT