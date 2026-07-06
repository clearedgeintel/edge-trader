import type { AppConfig } from '../config/schema.js';
import type { AlpacaClient } from '../data/alpaca/client.js';
import type { HealthCheckResult } from './types.js';

export async function runStartupHealthCheck(
  alpaca: AlpacaClient | null,
  config: AppConfig,
): Promise<HealthCheckResult> {
  const checks: HealthCheckResult['checks'] = [];

  if (!alpaca) {
    checks.push({ name: 'alpaca', passed: false, message: 'Alpaca credentials not configured' });
    return { healthy: false, checks };
  }

  try {
    const account = await alpaca.getAccount();
    const equity = parseFloat(account.equity);
    checks.push({ name: 'alpaca_connectivity', passed: true, message: 'Alpaca API reachable' });
    checks.push({
      name: 'account_status',
      passed: account.status === 'ACTIVE',
      message: `Account status: ${account.status}`,
    });
    checks.push({
      name: 'min_equity',
      passed: equity >= config.safety.minEquity,
      message: `Equity $${equity.toFixed(2)} (min $${config.safety.minEquity})`,
    });
  } catch (err) {
    checks.push({
      name: 'alpaca_connectivity',
      passed: false,
      message: `Alpaca API failed: ${err instanceof Error ? err.message : 'unknown'}`,
    });
  }

  const isLive = config.ramp.mode === 'live_ramp' || config.ramp.mode === 'live_full';
  checks.push({
    name: 'paper_live_consistency',
    passed: isLive ? !config.alpaca.paper : true,
    message: isLive
      ? (config.alpaca.paper ? 'Live mode but paper API configured' : 'Live API configured')
      : 'Paper mode OK',
  });

  if (isLive) {
    checks.push({
      name: 'live_enabled',
      passed: process.env.LIVE_ENABLED === 'true',
      message: process.env.LIVE_ENABLED === 'true'
        ? 'LIVE_ENABLED=true'
        : 'LIVE_ENABLED not set — required for live trading',
    });
  }

  checks.push({
    name: 'kill_switch',
    passed: process.env.KILL_SWITCH !== 'true',
    message: process.env.KILL_SWITCH === 'true' ? 'KILL_SWITCH is active' : 'Kill switch off',
  });

  return {
    healthy: checks.every((c) => c.passed),
    checks,
  };
}