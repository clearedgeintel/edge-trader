import { logger } from '../lib/logger.js';
import type { ReportCardContent, ReportCardContext } from './types.js';

interface LlmOptions {
  model: string;
  apiKey: string;
}

export async function generateLlmReportCard(
  ctx: ReportCardContext,
  options: LlmOptions,
): Promise<ReportCardContent | null> {
  const prompt = buildPrompt(ctx);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn({ status: response.status, body }, 'LLM report card request failed');
      return null;
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
    };

    const text = data.content?.[0]?.text;
    if (!text) return null;

    return parseLlmResponse(text);
  } catch (err) {
    logger.warn({ err }, 'LLM report card error');
    return null;
  }
}

function buildPrompt(ctx: ReportCardContext): string {
  return `You are an educational trading coach for a small retail account ($500–$1000).
Analyze this trading signal/trade and respond with ONLY valid JSON (no markdown fences):

{
  "thesisSummary": "1-2 sentence trade thesis",
  "riskSnapshot": "1-2 sentence risk overview with dollar amounts",
  "educationalExplanation": "2-3 sentences explaining WHY this setup matters for a beginner",
  "suggestedTweaks": ["config tweak 1", "config tweak 2"]
}

Context:
${JSON.stringify(
  {
    rationale: ctx.rationale,
    trade: ctx.trade ?? null,
    performance: ctx.performance,
    equity: ctx.equity,
    riskPerTradePct: ctx.riskPerTradePct,
  },
  null,
  2,
)}`;
}

function parseLlmResponse(text: string): ReportCardContent | null {
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned) as ReportCardContent;
    if (!parsed.thesisSummary || !parsed.riskSnapshot) return null;
    return {
      thesisSummary: parsed.thesisSummary,
      riskSnapshot: parsed.riskSnapshot,
      educationalExplanation: parsed.educationalExplanation ?? '',
      suggestedTweaks: Array.isArray(parsed.suggestedTweaks) ? parsed.suggestedTweaks : [],
    };
  } catch {
    return null;
  }
}