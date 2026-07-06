import { randomUUID } from 'node:crypto';
import type { ReportCardConfig } from '../config/schema.js';
import { logger } from '../lib/logger.js';
import { generateLlmReportCard } from './llm.js';
import { generateTemplateReportCard } from './template.js';
import type { ReportCard, ReportCardContext, ReportCardType } from './types.js';

export class ReportCardGenerator {
  constructor(private readonly config: ReportCardConfig) {}

  async generate(
    type: ReportCardType,
    symbol: string,
    ctx: ReportCardContext,
  ): Promise<ReportCard | null> {
    if (!this.config.enabled) return null;

    let content = generateTemplateReportCard(ctx);
    let source: ReportCard['source'] = 'template';

    if (this.config.useLlm) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        const llmContent = await generateLlmReportCard(ctx, {
          model: this.config.llmModel,
          apiKey,
        });
        if (llmContent) {
          content = llmContent;
          source = 'llm';
        } else {
          logger.info({ symbol }, 'LLM report card failed, using template fallback');
        }
      }
    }

    return {
      id: randomUUID(),
      type,
      symbol,
      createdAt: new Date().toISOString(),
      source,
      content,
    };
  }
}