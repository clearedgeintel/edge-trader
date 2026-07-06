import type { RampMode } from '../config/schema.js';

export interface RampState {
  mode: RampMode;
  phaseStartedAt: string;
  history: { mode: RampMode; advancedAt: string; reason: string }[];
}

export interface AdvancementCriteria {
  met: boolean;
  reasons: string[];
  daysInPhase: number;
  tradeCount: number;
  winRate: number;
}

export interface RampStatus {
  mode: RampMode;
  phaseStartedAt: string;
  daysInPhase: number;
  sizeMultiplier: number;
  canExecute: boolean;
  advancement: AdvancementCriteria | null;
  nextMode: RampMode | null;
}