import type { SafetyConfig } from '../config/schema.js';
import type { CircuitTrip, SafetyStatus } from './types.js';

export class SafetyTracker {
  private ordersToday = 0;
  private consecutiveLosses = 0;
  private currentDay = '';
  private activeCircuits: CircuitTrip[] = [];
  private lossCooldownUntil: number | null = null;

  constructor(private readonly config: SafetyConfig) {}

  resetDailyIfNeeded(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.currentDay) {
      this.currentDay = today;
      this.ordersToday = 0;
      this.clearCircuit('max_orders_per_day');
    }
  }

  recordOrder(): void {
    this.resetDailyIfNeeded();
    this.ordersToday++;
    if (this.ordersToday >= this.config.maxOrdersPerDay) {
      this.tripCircuit('max_orders_per_day', `Daily order limit reached (${this.config.maxOrdersPerDay})`);
    }
  }

  recordTradeClose(pnl: number): void {
    if (pnl < 0) {
      this.consecutiveLosses++;
      if (this.consecutiveLosses >= this.config.maxConsecutiveLosses) {
        this.lossCooldownUntil = Date.now() + this.config.consecutiveLossCooldownMinutes * 60_000;
        this.tripCircuit(
          'consecutive_losses',
          `${this.consecutiveLosses} consecutive losses — cooling down for ${this.config.consecutiveLossCooldownMinutes}min`,
          this.lossCooldownUntil,
        );
      }
    } else {
      this.consecutiveLosses = 0;
      this.clearCircuit('consecutive_losses');
      this.lossCooldownUntil = null;
    }
  }

  tripCircuit(reason: CircuitTrip['reason'], message: string, expiresAt?: number): void {
    const existing = this.activeCircuits.find((c) => c.reason === reason);
    if (existing) return;

    this.activeCircuits.push({
      reason,
      message,
      trippedAt: new Date().toISOString(),
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
  }

  clearCircuit(reason: CircuitTrip['reason']): void {
    this.activeCircuits = this.activeCircuits.filter((c) => c.reason !== reason);
  }

  purgeExpired(): void {
    const now = Date.now();
    this.activeCircuits = this.activeCircuits.filter((c) => {
      if (!c.expiresAt) return true;
      if (new Date(c.expiresAt).getTime() <= now) {
        if (c.reason === 'consecutive_losses') {
          this.consecutiveLosses = 0;
          this.lossCooldownUntil = null;
        }
        return false;
      }
      return true;
    });
  }

  isKillSwitchActive(): boolean {
    return process.env.KILL_SWITCH === 'true';
  }

  getStatus(): SafetyStatus {
    this.purgeExpired();
    const killSwitchActive = this.isKillSwitchActive();
    if (killSwitchActive) {
      this.tripCircuit('kill_switch', 'KILL_SWITCH=true — all execution halted');
    } else {
      this.clearCircuit('kill_switch');
    }

    return {
      killSwitchActive,
      ordersToday: this.ordersToday,
      maxOrdersPerDay: this.config.maxOrdersPerDay,
      consecutiveLosses: this.consecutiveLosses,
      maxConsecutiveLosses: this.config.maxConsecutiveLosses,
      activeCircuits: [...this.activeCircuits],
      canExecute: !killSwitchActive && this.activeCircuits.length === 0,
    };
  }

  hasActiveCircuit(reason: CircuitTrip['reason']): boolean {
    this.purgeExpired();
    return this.activeCircuits.some((c) => c.reason === reason);
  }
}