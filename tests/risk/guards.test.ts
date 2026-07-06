import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { evaluateTrade, isTradingPaused } from '../../src/risk/guards.js';
import type {
  PortfolioState,
  RiskContext,
  TradeProposal,
} from '../../src/risk/types.js';

const config = DEFAULT_CONFIG.risk;

function makePortfolio(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return {
    equity: 1000,
    peakEquity: 1000,
    dailyPnl: 0,
    openPositions: [],
    ...overrides,
  };
}

function makeProposal(overrides: Partial<TradeProposal> = {}): TradeProposal {
  return {
    symbol: 'AAPL',
    entryPrice: 180,
    stopPrice: 175,
    targetPrice: 195,
    atr: 2.5,
    avgDailyVolume: 1_000_000,
    ...overrides,
  };
}

function makeContext(portfolio: PortfolioState): RiskContext {
  return { config, portfolio };
}

describe('evaluateTrade', () => {
  it('approves a valid trade with correct sizing', () => {
    const decision = evaluateTrade(makeProposal(), makeContext(makePortfolio()));

    expect(decision.approved).toBe(true);
    if (decision.approved) {
      expect(decision.sizing.qty).toBeGreaterThan(0);
      expect(decision.sizing.rewardRisk).toBeGreaterThanOrEqual(config.minRewardRisk);
    }
  });

  it('vetoes when max positions exceeded', () => {
    const portfolio = makePortfolio({
      openPositions: [
        { symbol: 'MSFT', qty: 1, entryPrice: 400, stopPrice: 390 },
        { symbol: 'GOOG', qty: 1, entryPrice: 170, stopPrice: 165 },
        { symbol: 'AMZN', qty: 1, entryPrice: 200, stopPrice: 195 },
      ],
    });

    const decision = evaluateTrade(makeProposal(), makeContext(portfolio));

    expect(decision.approved).toBe(false);
    if (!decision.approved) {
      expect(decision.reason).toBe('max_positions_exceeded');
    }
  });

  it('vetoes duplicate symbol', () => {
    const portfolio = makePortfolio({
      openPositions: [{ symbol: 'AAPL', qty: 1, entryPrice: 180, stopPrice: 175 }],
    });

    const decision = evaluateTrade(makeProposal(), makeContext(portfolio));

    expect(decision.approved).toBe(false);
    if (!decision.approved) {
      expect(decision.reason).toBe('max_positions_exceeded');
    }
  });

  it('vetoes when portfolio heat would be exceeded', () => {
    const portfolio = makePortfolio({
      openPositions: [
        { symbol: 'MSFT', qty: 10, entryPrice: 400, stopPrice: 390 },
        { symbol: 'GOOG', qty: 10, entryPrice: 170, stopPrice: 160 },
      ],
    });

    const decision = evaluateTrade(makeProposal(), makeContext(portfolio));

    expect(decision.approved).toBe(false);
    if (!decision.approved) {
      expect(decision.reason).toBe('portfolio_heat_exceeded');
    }
  });

  it('vetoes when reward:risk is insufficient', () => {
    const decision = evaluateTrade(
      makeProposal({ targetPrice: 182 }),
      makeContext(makePortfolio()),
    );

    expect(decision.approved).toBe(false);
    if (!decision.approved) {
      expect(decision.reason).toBe('insufficient_reward_risk');
    }
  });

  it('vetoes when liquidity is insufficient', () => {
    const decision = evaluateTrade(
      makeProposal({ avgDailyVolume: 100_000 }),
      makeContext(makePortfolio()),
    );

    expect(decision.approved).toBe(false);
    if (!decision.approved) {
      expect(decision.reason).toBe('insufficient_liquidity');
    }
  });

  it('vetoes when daily loss limit breached', () => {
    const portfolio = makePortfolio({ dailyPnl: -25 });
    const decision = evaluateTrade(makeProposal(), makeContext(portfolio));

    expect(decision.approved).toBe(false);
    if (!decision.approved) {
      expect(decision.reason).toBe('daily_loss_limit_breached');
    }
  });

  it('vetoes when max drawdown breached', () => {
    const portfolio = makePortfolio({ equity: 850, peakEquity: 1000 });
    const decision = evaluateTrade(makeProposal(), makeContext(portfolio));

    expect(decision.approved).toBe(false);
    if (!decision.approved) {
      expect(decision.reason).toBe('max_drawdown_breached');
    }
  });

  it('vetoes when correlation with open position is too high', () => {
    const portfolio = makePortfolio({
      openPositions: [{ symbol: 'MSFT', qty: 1, entryPrice: 400, stopPrice: 390 }],
    });

    const decision = evaluateTrade(
      makeProposal({ correlations: { MSFT: 0.85 } }),
      makeContext(portfolio),
    );

    expect(decision.approved).toBe(false);
    if (!decision.approved) {
      expect(decision.reason).toBe('correlation_too_high');
    }
  });

  it('allows trade when correlation is below threshold', () => {
    const portfolio = makePortfolio({
      openPositions: [{ symbol: 'MSFT', qty: 1, entryPrice: 400, stopPrice: 390 }],
    });

    const decision = evaluateTrade(
      makeProposal({ correlations: { MSFT: 0.3 } }),
      makeContext(portfolio),
    );

    expect(decision.approved).toBe(true);
  });
});

describe('isTradingPaused', () => {
  it('returns null when trading is allowed', () => {
    expect(isTradingPaused(makePortfolio(), config)).toBeNull();
  });

  it('pauses on daily loss limit', () => {
    const veto = isTradingPaused(makePortfolio({ dailyPnl: -25 }), config);
    expect(veto).not.toBeNull();
    expect(veto!.reason).toBe('daily_loss_limit_breached');
  });

  it('pauses on max drawdown', () => {
    const veto = isTradingPaused(
      makePortfolio({ equity: 850, peakEquity: 1000 }),
      config,
    );
    expect(veto).not.toBeNull();
    expect(veto!.reason).toBe('max_drawdown_breached');
  });
});