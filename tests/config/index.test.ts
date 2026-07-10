import { DEFAULT_CONFIG, loadConfigFromEnv } from '../../src/config/index.js';

describe('loadConfigFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RISK_PER_TRADE_PCT;
    delete process.env.PORT;
    delete process.env.ALPACA_PAPER;
    delete process.env.EXECUTION_ENABLED;
    delete process.env.BROKER_STOPS;
    delete process.env.ALPACA_FEED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns defaults when no env overrides', () => {
    const config = loadConfigFromEnv();
    expect(config.risk.riskPerTradePct).toBe(DEFAULT_CONFIG.risk.riskPerTradePct);
    expect(config.risk.maxConcurrentPositions).toBe(3);
    expect(config.alpaca.paper).toBe(true);
  });

  it('applies env overrides for risk params', () => {
    process.env.RISK_PER_TRADE_PCT = '0.01';
    const config = loadConfigFromEnv();
    expect(config.risk.riskPerTradePct).toBe(0.01);
  });

  it('switches to live Alpaca when paper is false', () => {
    process.env.ALPACA_PAPER = 'false';
    const config = loadConfigFromEnv();
    expect(config.alpaca.paper).toBe(false);
    expect(config.alpaca.baseUrl).toBe('https://api.alpaca.markets');
  });

  it('enables broker-resident stops by default', () => {
    expect(loadConfigFromEnv().execution.brokerStops).toBe(true);
  });

  it('leaves data feed unset by default (paper→iex, live→sip)', () => {
    expect(loadConfigFromEnv().alpaca.feed).toBeUndefined();
  });

  it('overrides the data feed with ALPACA_FEED', () => {
    process.env.ALPACA_FEED = 'iex';
    process.env.ALPACA_PAPER = 'false';
    const config = loadConfigFromEnv();
    expect(config.alpaca.feed).toBe('iex');
    expect(config.alpaca.paper).toBe(false); // feed override preserves the paper override
  });

  it('disables broker stops when BROKER_STOPS=false', () => {
    process.env.BROKER_STOPS = 'false';
    const config = loadConfigFromEnv();
    expect(config.execution.brokerStops).toBe(false);
    expect(config.execution.enabled).toBe(false);
  });
});