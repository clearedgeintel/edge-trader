import { generateTemplateReportCard } from '../../src/report-cards/template.js';
import type { ReportCardContext } from '../../src/report-cards/types.js';

function makeContext(overrides: Partial<ReportCardContext> = {}): ReportCardContext {
  return {
    rationale: {
      symbol: 'AAPL',
      score: 82,
      reasons: ['Daily trend strong', 'Pullback to EMA zone'],
      indicators: { adx: 28, rsi_15m: 42 },
      regime: 'trending_bull',
      suggested_stop: 175,
      suggested_target: 190,
      risk_dollars: 5,
    },
    performance: {
      totalTrades: 3,
      wins: 2,
      losses: 1,
      winRate: 0.67,
      totalPnl: 12.5,
      avgPnl: 4.17,
      todayPnl: 5,
      openPositions: 1,
      recentSignals: 2,
    },
    equity: 1000,
    riskPerTradePct: 0.005,
    ...overrides,
  };
}

describe('generateTemplateReportCard', () => {
  it('generates all required sections', () => {
    const card = generateTemplateReportCard(makeContext());
    expect(card.thesisSummary).toContain('AAPL');
    expect(card.thesisSummary).toContain('82');
    expect(card.riskSnapshot).toContain('$1000');
    expect(card.riskSnapshot).toContain('$5.00');
    expect(card.educationalExplanation.length).toBeGreaterThan(0);
    expect(card.suggestedTweaks.length).toBeGreaterThan(0);
  });

  it('includes trade outcome when trade is provided', () => {
    const card = generateTemplateReportCard(
      makeContext({
        trade: {
          id: '1',
          symbol: 'AAPL',
          entryPrice: 180,
          exitPrice: 175,
          qty: 1,
          pnl: -5,
          pnlPct: -2.78,
          exitReason: 'stop_hit',
          regime: 'trending_bull',
          score: 82,
          rationale: makeContext().rationale,
          openedAt: '2024-01-01',
          closedAt: '2024-01-02',
        },
      }),
    );
    expect(card.educationalExplanation).toContain('loss-making');
    expect(card.educationalExplanation).toContain('stop_hit');
  });

  it('suggests raising confluence in choppy regime', () => {
    const card = generateTemplateReportCard(
      makeContext({
        rationale: { ...makeContext().rationale, regime: 'choppy' },
      }),
    );
    expect(card.suggestedTweaks.some((t) => t.includes('minConfluenceScore'))).toBe(true);
  });
});