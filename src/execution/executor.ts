import type { AppConfig } from '../config/schema.js';
import type { AlpacaClient } from '../data/alpaca/client.js';
import { logger } from '../lib/logger.js';
import type { PositionSizeResult } from '../risk/types.js';
import type { Signal } from '../strategy/types.js';
import { checkExecutionGates, type GateContext } from './gates.js';
import type { ExecutionRecord, ExecutionResult } from './types.js';

export function formatQty(qty: number, fractional: boolean): string {
  if (!fractional) return String(Math.floor(qty));
  const rounded = Math.floor(qty * 10000) / 10000;
  return rounded.toFixed(4).replace(/\.?0+$/, '') || '0';
}

export class OrderExecutor {
  private readonly records: ExecutionRecord[] = [];

  constructor(
    private readonly client: AlpacaClient,
    private readonly config: AppConfig,
  ) {}

  getRecords(): ExecutionRecord[] {
    return [...this.records];
  }

  async executeSignal(
    signal: Signal,
    sizing: PositionSizeResult,
    gateCtx: Omit<GateContext, 'symbol' | 'qty'>,
  ): Promise<ExecutionResult> {
    const qty = parseFloat(formatQty(sizing.qty, this.config.execution.fractional));
    const fullCtx: GateContext = { ...gateCtx, symbol: signal.symbol, qty };

    const gate = checkExecutionGates(fullCtx);
    if (!gate.allowed) {
      logger.warn({ symbol: signal.symbol, reason: gate.reason }, gate.message);
      return { success: false, symbol: signal.symbol, usedBracket: false, message: gate.message! };
    }

    const qtyStr = formatQty(qty, this.config.execution.fractional);
    const useBracket =
      this.config.execution.useBrackets &&
      this.config.monitor.partialTakeProfitPct === 0;

    let orderId: string | undefined;
    let attempts = 0;
    const maxRetries = this.config.execution.maxOrderRetries;

    while (attempts <= maxRetries) {
      try {
        const order = useBracket
          ? await this.client.submitBracketOrder({
              symbol: signal.symbol,
              qty: qtyStr,
              side: 'buy',
              stopPrice: signal.proposal.stopPrice,
              targetPrice: signal.proposal.targetPrice,
            })
          : await this.client.submitMarketOrder({
              symbol: signal.symbol,
              qty: qtyStr,
              side: 'buy',
            });

        orderId = order.id;
        this.records.push({
          orderId: order.id,
          symbol: signal.symbol,
          qty,
          side: 'buy',
          rationale: signal.rationale,
          executedAt: new Date().toISOString(),
          usedBracket: useBracket,
        });

        logger.info(
          { symbol: signal.symbol, qty: qtyStr, orderId, bracket: useBracket },
          'Order submitted',
        );

        return {
          success: true,
          symbol: signal.symbol,
          orderId,
          qty,
          usedBracket: useBracket,
          message: useBracket ? 'Bracket order submitted' : 'Market order submitted',
        };
      } catch (err) {
        attempts++;
        logger.error({ err, symbol: signal.symbol, attempt: attempts }, 'Order submission failed');
        if (attempts > maxRetries) {
          return {
            success: false,
            symbol: signal.symbol,
            usedBracket: useBracket,
            message: `Order failed after ${maxRetries + 1} attempts`,
          };
        }
      }
    }

    return {
      success: false,
      symbol: signal.symbol,
      usedBracket: useBracket,
      message: 'Order failed',
    };
  }

  async submitSell(symbol: string, qty: number, reason: string): Promise<ExecutionResult> {
    const qtyStr = formatQty(qty, this.config.execution.fractional);
    try {
      const order = await this.client.submitMarketOrder({
        symbol,
        qty: qtyStr,
        side: 'sell',
      });
      logger.info({ symbol, qty: qtyStr, orderId: order.id, reason }, 'Sell order submitted');
      return {
        success: true,
        symbol,
        orderId: order.id,
        qty,
        usedBracket: false,
        message: reason,
      };
    } catch (err) {
      logger.error({ err, symbol }, 'Sell order failed');
      return { success: false, symbol, usedBracket: false, message: 'Sell order failed' };
    }
  }
}