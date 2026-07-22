import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import type { AlpacaClient, SymbolSnapshot } from '../../src/data/alpaca/client.js';
import { filterAndRankCandidates, Screener } from '../../src/screener/screener.js';

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

function mockClient(
  actives: { symbol: string }[],
  gainers: { symbol: string }[],
  snaps: SymbolSnapshot[],
): AlpacaClient {
  return {
    getMostActives: async () => actives.map((a) => ({ ...a, volume: 1, tradeCount: 1 })),
    getMovers: async () => ({
      gainers: gainers.map((g) => ({ ...g, price: 1, percentChange: 1 })),
      losers: [],
    }),
    getSnapshots: async () => snaps,
  } as unknown as AlpacaClient;
}

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
});
