import { jest } from '@jest/globals';
import { AlpacaClient } from '../../src/data/alpaca/client.js';
import type { AlpacaConfig } from '../../src/config/schema.js';

const config: AlpacaConfig = {
  baseUrl: 'https://paper-api.example',
  dataUrl: 'https://data.example',
  paper: true,
};
const creds = { apiKey: 'k', apiSecret: 's' };

function mockFetchOnce(json: unknown) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => json,
    text: async () => JSON.stringify(json),
  })) as unknown as typeof fetch;
}

describe('AlpacaClient field mapping (Alpaca returns snake_case)', () => {
  it('maps account fields to camelCase', async () => {
    mockFetchOnce({
      id: 'a', equity: '500', cash: '150',
      buying_power: '147.7', portfolio_value: '499.86',
      status: 'ACTIVE', currency: 'USD',
    });
    const acct = await new AlpacaClient(config, creds).getAccount();
    expect(acct.buyingPower).toBe('147.7');
    expect(acct.portfolioValue).toBe('499.86');
    expect(acct.equity).toBe('500');
  });

  it('maps position fields to camelCase', async () => {
    mockFetchOnce([{
      symbol: 'AMZN', qty: '1.43', avg_entry_price: '246.03',
      current_price: '246.01', market_value: '352.0',
      unrealized_pl: '-0.03', side: 'long',
    }]);
    const [pos] = await new AlpacaClient(config, creds).getPositions();
    expect(pos.avgEntryPrice).toBe('246.03');
    expect(pos.currentPrice).toBe('246.01');
    expect(pos.unrealizedPl).toBe('-0.03');
    expect(pos.symbol).toBe('AMZN');
  });
});
