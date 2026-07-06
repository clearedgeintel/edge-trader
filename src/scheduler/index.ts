import { DateTime } from 'luxon';
import type { SchedulerConfig } from '../config/schema.js';
import { logger } from '../lib/logger.js';

export type ScanCallback = () => void | Promise<void>;

export class Scheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly config: SchedulerConfig,
    private readonly onScan: ScanCallback,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    const intervalMs = this.config.scanIntervalMinutes * 60 * 1000;
    logger.info(
      { intervalMinutes: this.config.scanIntervalMinutes },
      'Scheduler started',
    );

    void this.runScan();
    this.timer = setInterval(() => void this.runScan(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    logger.info('Scheduler stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  private async runScan(): Promise<void> {
    const now = DateTime.now().setZone(this.config.marketTimezone);
    logger.debug({ time: now.toISO() }, 'Scan tick');

    try {
      await this.onScan();
    } catch (err) {
      logger.error({ err }, 'Scan callback failed');
    }
  }
}