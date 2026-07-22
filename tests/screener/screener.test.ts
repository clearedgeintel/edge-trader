import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { AlpacaClient, AssetInfo, SymbolSnapshot } from '../../src/data/alpaca/client.js';
import {
  filterAndRankCandidates,
  isLeveragedOrInverse,
  Screener,
} from '../../src/screener/screener.js';

const cfg = {
  ...DEFAULT_CONFIG.screener,
  enabled: true,
  minPrice: 5,
  maxPrice: 1000,
  minDollarVolume: 20_000_000,
  maxUniverse: 3,
};

describe('filterAndRankCandidates', () => {
  it('drops junk by price/liquidity/format and ranks by dollar volume', () => {
    const snaps: SymbolSnapshot[] = [
      { symbol: 'AAA', price: 100, volume: 1_000_000 }, // $100M — keep
      { symbol: 'BBB', price: 50, volume: 1_000_000 }, //  $50M — keep
      { symbol: 'PENNY', price: 2, volume: 100_000_000 }, // price < 5 — drop
      { symbol: 'THIN', price: 100, volume: 1_000 }, // $100k < $20M — drop
      { symbol: 'TOOHIGH', price: 5000, volume: 1_000_000 }, // > maxPrice & bad symbol — drop
      { symbol: 'BRKB.', price: 100, volume: 1_000_000 }, // non-alpha ticker — drop
    ];
    const out = filterAndRankCandidates(snaps, cfg);
    expect(out.map((c) => c.symbol)).toEqual(['AAA', 'BBB']); // $100M ranked above $50M
  });
});

function asset(symbol: string, name: string): AssetInfo {
  return { symbol, name, tradable: true, assetClass: 'us_equity', exchange: 'NASDAQ' };
}

function mockClient(
  actives: { symbol: string }[],
  gainers: { symbol: string }[],
  snaps: SymbolSnapshot[],
  assets: AssetInfo[] = [],
): AlpacaClient {
  return {
    getMostActives: async () => actives.map((a) => ({ ...a, volume: 1, tradeCount: 1 })),
    getMovers: async () => ({
      gainers: gainers.map((g) => ({ ...g, price: 1, percentChange: 1 })),
      losers: [],
    }),
    getSnapshots: async () => snaps,
    getAssets: async (symbols: string[]) => assets.filter((a) => symbols.includes(a.symbol)),
  } as unknown as AlpacaClient;
}

describe('isLeveragedOrInverse', () => {
  it.each([
    ['Direxion Daily Semiconductor Bull 3X ETF', true],
    ['ProShares UltraPro QQQ', true],
    ['ProShares UltraPro Short QQQ', true],
    ['ProShares Short S&P500', true],
    ['GraniteShares 2x Long NVDA Daily ETF', true],
    ['Micron Technology, Inc. Common Stock', false],
    ['State Street SPDR S&P 500 ETF Trust', false],
    ['iShares Short Treasury Bond ETF', false],
    ['ProShares Bitcoin ETF', false],
  ])('%s -> %s', (name, expected) => {
    expect(isLeveragedOrInverse(name)).toBe(expected);
  });
});

describe('Screener.getUniverse', () => {
  it('returns only the core watchlist when disabled', async () => {
    const s = new Screener(mockClient([], [], []), { ...cfg, enabled: false });
    expect(await s.getUniverse(['AAPL'])).toEqual(['AAPL']);
  });

  it('puts core first, then screened candidates, capped to maxUniverse', async () => {
    const client = mockClient(
      [{ symbol: 'NVDA' }, { symbol: 'TSLA' }],
      [],
      [
        { symbol: 'NVDA', price: 100, volume: 1_000_000 }, // $100M
        { symbol: 'TSLA', price: 200, volume: 1_000_000 }, // $200M (ranked first)
      ],
    );
    const s = new Screener(client, { ...cfg, enabled: true, maxUniverse: 3 });
    const universe = await s.getUniverse(['AAPL', 'MSFT']);

    expect(universe[0]).toBe('AAPL');
    expect(universe[1]).toBe('MSFT');
    expect(universe.length).toBe(3); // 2 core + 1 screened (capped)
    expect(universe[2]).toBe('TSLA'); // higher dollar volume wins the last slot
  });

  it('excludes leveraged/inverse ETFs from the screened universe', async () => {
    const client = mockClient(
      [{ symbol: 'SOXL' }, { symbol: 'NVDA' }],
      [],
      [
        { symbol: 'SOXL', price: 30, volume: 100_000_000 }, // liquid, but leveraged
        { symbol: 'NVDA', price: 120, volume: 10_000_000 },
      ],
      [
        asset('SOXL', 'Direxion Daily Semiconductor Bull 3X ETF'),
        asset('NVDA', 'NVIDIA Corporation Common Stock'),
      ],
    );
    const s = new Screener(client, { ...cfg, enabled: true, maxUniverse: 10 });
    const universe = await s.getUniverse([]);
    expect(universe).toContain('NVDA');
    expect(universe).not.toContain('SOXL');
  });
});
