import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RampConfig, RampMode } from '../config/schema.js';
import { logger } from '../lib/logger.js';
import type { PerformanceSnapshot } from '../performance/types.js';
import {
  canExecuteInMode,
  evaluateAdvancement,
  getSizeMultiplier,
  nextMode,
} from './rules.js';
import type { RampState, RampStatus } from './types.js';

const STATE_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../data/ramp-state.json');

export class RampManager {
  private state: RampState;

  constructor(private rampConfig: RampConfig) {
    this.state = this.loadState();
    if (this.state.mode !== rampConfig.mode) {
      this.state.mode = rampConfig.mode;
      this.state.phaseStartedAt = new Date().toISOString();
      this.saveState();
    }
  }

  getMode(): RampMode {
    return this.state.mode;
  }

  getPhaseStartedAt(): string {
    return this.state.phaseStartedAt;
  }

  getDaysInPhase(): number {
    const start = new Date(this.state.phaseStartedAt).getTime();
    return Math.floor((Date.now() - start) / (24 * 60 * 60 * 1000));
  }

  getStatus(perf: PerformanceSnapshot, isPaper: boolean): RampStatus {
    const advancement = this.rampConfig.enabled
      ? evaluateAdvancement(this.state.mode, this.rampConfig, perf, this.getDaysInPhase())
      : null;

    return {
      mode: this.state.mode,
      phaseStartedAt: this.state.phaseStartedAt,
      daysInPhase: this.getDaysInPhase(),
      sizeMultiplier: getSizeMultiplier(this.rampConfig),
      canExecute: canExecuteInMode(this.rampConfig, isPaper),
      advancement,
      nextMode: nextMode(this.state.mode),
    };
  }

  advance(reason: string): RampMode | null {
    const next = nextMode(this.state.mode);
    if (!next) return null;

    const prev = this.state.mode;
    this.state.history.push({
      mode: next,
      advancedAt: new Date().toISOString(),
      reason,
    });
    this.state.mode = next;
    this.state.phaseStartedAt = new Date().toISOString();
    this.saveState();

    logger.info({ from: prev, to: next, reason }, 'Ramp advanced');
    return next;
  }

  tryAutoAdvance(perf: PerformanceSnapshot): RampMode | null {
    if (!this.rampConfig.autoAdvance) return null;

    const criteria = evaluateAdvancement(
      this.state.mode,
      this.rampConfig,
      perf,
      this.getDaysInPhase(),
    );
    if (!criteria.met) return null;

    const next = nextMode(this.state.mode);
    if (!next) return null;

    return this.advance(`Auto-advance: ${criteria.reasons.join('; ')}`);
  }

  getHistory(): RampState['history'] {
    return [...this.state.history];
  }

  private loadState(): RampState {
    try {
      if (existsSync(STATE_PATH)) {
        const raw = JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as RampState;
        return {
          mode: raw.mode ?? this.rampConfig.mode,
          phaseStartedAt: raw.phaseStartedAt ?? new Date().toISOString(),
          history: raw.history ?? [],
        };
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load ramp state, using defaults');
    }

    return {
      mode: this.rampConfig.mode,
      phaseStartedAt: new Date().toISOString(),
      history: [],
    };
  }

  private saveState(): void {
    try {
      const dir = dirname(STATE_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2));
    } catch (err) {
      logger.error({ err }, 'Failed to save ramp state');
    }
  }
}