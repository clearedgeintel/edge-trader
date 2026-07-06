export type CircuitReason =
  | 'kill_switch'
  | 'max_orders_per_day'
  | 'consecutive_losses'
  | 'min_equity'
  | 'live_not_enabled'
  | 'ramp_observation'
  | 'paper_live_mismatch';

export interface CircuitTrip {
  reason: CircuitReason;
  message: string;
  trippedAt: string;
  expiresAt?: string;
}

export interface SafetyStatus {
  killSwitchActive: boolean;
  ordersToday: number;
  maxOrdersPerDay: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  activeCircuits: CircuitTrip[];
  canExecute: boolean;
}

export interface HealthCheckResult {
  healthy: boolean;
  checks: { name: string; passed: boolean; message: string }[];
}