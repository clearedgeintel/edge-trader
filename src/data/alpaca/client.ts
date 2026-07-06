import type { AlpacaConfig } from '../../config/schema.js';
import { logger } from '../../lib/logger.js';

export interface AlpacaCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface AlpacaAccount {
  id: string;
  equity: string;
  cash: string;
  buyingPower: string;
  portfolioValue: string;
  status: string;
  currency: string;
}

export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n?: number;
  vw?: number;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  avgEntryPrice: string;
  currentPrice: string;
  marketValue: string;
  unrealizedPl: string;
  side: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  type: string;
  status: string;
  filled_qty: string;
  filled_avg_price: string | null;
  order_class: string;
  created_at: string;
}

export interface BracketOrderRequest {
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  stopPrice: number;
  targetPrice: number;
}

export interface MarketOrderRequest {
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
}

export interface StopOrderRequest {
  symbol: string;
  qty: string;
  stopPrice: number;
}

export class AlpacaClient {
  private readonly baseUrl: string;
  private readonly dataUrl: string;
  private readonly headers: Record<string, string>;

  constructor(
    private readonly config: AlpacaConfig,
    credentials: AlpacaCredentials,
  ) {
    this.baseUrl = config.baseUrl;
    this.dataUrl = config.dataUrl;
    this.headers = {
      'APCA-API-KEY-ID': credentials.apiKey,
      'APCA-API-SECRET-KEY': credentials.apiSecret,
      Accept: 'application/json',
    };
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { ...this.headers, ...init?.headers },
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ url, status: response.status, body }, 'Alpaca API error');
      throw new Error(`Alpaca API ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async getAccount(): Promise<AlpacaAccount> {
    return this.request<AlpacaAccount>(`${this.baseUrl}/v2/account`);
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    return this.request<AlpacaPosition[]>(`${this.baseUrl}/v2/positions`);
  }

  async getClock(): Promise<{ is_open: boolean; next_open: string; next_close: string }> {
    return this.request(`${this.baseUrl}/v2/clock`);
  }

  async getBars(
    symbol: string,
    timeframe: '1Min' | '15Min' | '1Hour' | '1Day',
    start: string,
    end?: string,
    limit = 1000,
  ): Promise<AlpacaBar[]> {
    const params = new URLSearchParams({
      timeframe,
      start,
      limit: String(limit),
      adjustment: 'split',
      feed: this.config.paper ? 'iex' : 'sip',
    });
    if (end) params.set('end', end);

    const url = `${this.dataUrl}/v2/stocks/${symbol}/bars?${params}`;
    const data = await this.request<{ bars: AlpacaBar[] | null }>(url);
    return data.bars ?? [];
  }

  async getOrders(status: 'open' | 'closed' | 'all' = 'open'): Promise<AlpacaOrder[]> {
    return this.request<AlpacaOrder[]>(`${this.baseUrl}/v2/orders?status=${status}&limit=100`);
  }

  async submitMarketOrder(req: MarketOrderRequest): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`${this.baseUrl}/v2/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: req.symbol,
        qty: req.qty,
        side: req.side,
        type: 'market',
        time_in_force: 'day',
      }),
    });
  }

  async submitBracketOrder(req: BracketOrderRequest): Promise<AlpacaOrder> {
    const stopLimit = roundPrice(req.stopPrice * 0.995);
    return this.request<AlpacaOrder>(`${this.baseUrl}/v2/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: req.symbol,
        qty: req.qty,
        side: req.side,
        type: 'market',
        time_in_force: 'day',
        order_class: 'bracket',
        take_profit: { limit_price: roundPrice(req.targetPrice).toFixed(2) },
        stop_loss: {
          stop_price: roundPrice(req.stopPrice).toFixed(2),
          limit_price: stopLimit.toFixed(2),
        },
      }),
    });
  }

  /**
   * Submit a standalone broker-resident stop (sell) order. Uses GTC so the
   * protective stop persists across sessions/restarts. Alpaca only accepts
   * stop orders for whole-share quantities — callers must gate on that.
   */
  async submitStopOrder(req: StopOrderRequest): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`${this.baseUrl}/v2/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: req.symbol,
        qty: req.qty,
        side: 'sell',
        type: 'stop',
        time_in_force: 'gtc',
        stop_price: roundPrice(req.stopPrice).toFixed(2),
      }),
    });
  }

  /**
   * Replace an existing stop order's quantity and/or stop price. Alpaca cancels
   * the original and returns a new order with a fresh id.
   */
  async replaceStopOrder(
    orderId: string,
    qty: string,
    stopPrice: number,
  ): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`${this.baseUrl}/v2/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty, stop_price: roundPrice(stopPrice).toFixed(2) }),
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request(`${this.baseUrl}/v2/orders/${orderId}`, { method: 'DELETE' });
  }

  async closePosition(symbol: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`${this.baseUrl}/v2/positions/${symbol}`, {
      method: 'DELETE',
    });
  }

  isPaper(): boolean {
    return this.config.paper;
  }
}

function roundPrice(n: number): number {
  return Math.round(n * 100) / 100;
}

export function createAlpacaClient(
  config: AlpacaConfig,
  credentials?: AlpacaCredentials,
): AlpacaClient | null {
  const apiKey = credentials?.apiKey ?? process.env.ALPACA_API_KEY;
  const apiSecret = credentials?.apiSecret ?? process.env.ALPACA_API_SECRET;

  if (!apiKey || !apiSecret) {
    logger.warn('Alpaca credentials not configured');
    return null;
  }

  return new AlpacaClient(config, { apiKey, apiSecret });
}