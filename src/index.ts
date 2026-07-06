import 'dotenv/config';
import { AnalysisEngine } from './analysis/index.js';
import { loadConfigFromEnv } from './config/index.js';
import { BarDataService } from './data/bar-service.js';
import { createAlpacaClient } from './data/alpaca/client.js';
import { logger } from './lib/logger.js';
import { createPersistence } from './persistence/index.js';
import { createStatusRouter } from './api/status.js';
import { Scheduler } from './scheduler/index.js';
import { runStartupHealthCheck } from './safety/health.js';
import { TradingEngine } from './trading/engine.js';

const config = loadConfigFromEnv();
const startedAt = new Date();

const alpaca = createAlpacaClient(config.alpaca);
const barService = alpaca
  ? new BarDataService(alpaca, config.data, config.scheduler.marketTimezone)
  : null;
const analysisEngine = barService ? new AnalysisEngine(barService, config) : null;
const persistence = createPersistence();
const tradingEngine =
  alpaca && analysisEngine
    ? new TradingEngine(config, alpaca, analysisEngine, persistence)
    : null;

if (tradingEngine) await tradingEngine.init();

const health = await runStartupHealthCheck(alpaca, config);
for (const check of health.checks) {
  if (check.passed) {
    logger.info({ check: check.name }, check.message);
  } else {
    logger.warn({ check: check.name }, check.message);
  }
}

const scheduler = new Scheduler(config.scheduler, async () => {
  if (!tradingEngine) {
    logger.warn('Scan skipped — Alpaca not configured');
    return;
  }

  try {
    const result = await tradingEngine.runScan();
    logger.info(
      {
        analyzed: result.analysis.length,
        signals: result.signals.length,
        executions: result.executions,
        safetyBlocked: result.safetyBlocked,
        ramp: tradingEngine.getRampManager().getMode(),
      },
      'Scan complete',
    );
  } catch (err) {
    logger.error({ err }, 'Scan failed');
  }
});

const app = createStatusRouter({
  config,
  alpaca,
  scheduler,
  tradingEngine,
  startedAt,
  startupHealth: health,
});

app.listen(config.api.port, config.api.host, () => {
  logger.info(
    {
      port: config.api.port,
      paper: config.alpaca.paper,
      execution: config.execution.enabled,
      ramp: config.ramp.mode,
      healthy: health.healthy,
    },
    'edge-trader v0.4.0 started',
  );
  scheduler.start();
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  scheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  scheduler.stop();
  process.exit(0);
});