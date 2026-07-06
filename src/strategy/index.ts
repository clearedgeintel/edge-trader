import type { AppConfig } from '../config/schema.js';
import { MomentumPullbackStrategy } from './momentum-pullback.js';

export * from './types.js';
export * from './momentum-pullback.js';

export function createDefaultStrategy(config: AppConfig): MomentumPullbackStrategy {
  return new MomentumPullbackStrategy(config.strategy, config.risk);
}