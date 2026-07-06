import type { ReportCardContent, ReportCardContext } from './types.js';

export function generateTemplateReportCard(ctx: ReportCardContext): ReportCardContent {
  const { rationale, trade, performance, equity, riskPerTradePct } = ctx;
  const riskDollars = equity * riskPerTradePct;

  const thesisSummary = [
    `${rationale.symbol} scored ${rationale.score}/100 in a ${rationale.regime.replace('_', ' ')} regime.`,
    rationale.reasons.slice(0, 3).join('. ') + '.',
  ].join(' ');

  const stop = rationale.suggested_stop.toFixed(2);
  const target = rationale.suggested_target.toFixed(2);
  const riskSnapshot = [
    `Account equity: $${equity.toFixed(2)}.`,
    `Risk per trade: $${riskDollars.toFixed(2)} (${(riskPerTradePct * 100).toFixed(1)}%).`,
    `Suggested stop: $${stop}, target: $${target}.`,
    `Open positions: ${performance.openPositions}.`,
  ].join(' ');

  let educationalExplanation = buildEducationalExplanation(rationale);

  if (trade) {
    const outcome = trade.pnl >= 0 ? 'profitable' : 'loss-making';
    educationalExplanation += ` This trade closed as ${outcome} (${trade.exitReason}) with P&L of $${trade.pnl.toFixed(2)} (${trade.pnlPct.toFixed(1)}%).`;
  }

  const suggestedTweaks = buildSuggestedTweaks(rationale, performance);

  return { thesisSummary, riskSnapshot, educationalExplanation, suggestedTweaks };
}

function buildEducationalExplanation(rationale: ReportCardContext['rationale']): string {
  const parts: string[] = [];

  if (rationale.regime === 'trending_bull') {
    parts.push(
      'This is a momentum pullback setup: the stock is in an uptrend and pulling back on lighter volume, suggesting buyers may step in.',
    );
  } else if (rationale.regime === 'choppy') {
    parts.push(
      'The market regime is choppy (low ADX). Pullback setups are less reliable here — extra caution is warranted.',
    );
  }

  if (rationale.indicators.rsi_15m !== undefined) {
    const rsi = rationale.indicators.rsi_15m;
    if (rsi >= 35 && rsi <= 55) {
      parts.push(
        `RSI at ${rsi.toFixed(0)} shows the pullback is shallow — sellers are not overwhelming buyers.`,
      );
    }
  }

  if (rationale.indicators.adx !== undefined && rationale.indicators.adx < 22) {
    parts.push('ADX is below the trend threshold, meaning directional conviction is weak.');
  }

  return parts.join(' ') || 'Signal generated from multi-timeframe confluence scoring.';
}

function buildSuggestedTweaks(
  rationale: ReportCardContext['rationale'],
  performance: ReportCardContext['performance'],
): string[] {
  const tweaks: string[] = [];

  if (rationale.regime === 'choppy') {
    tweaks.push('Consider raising minConfluenceScore to 75+ in choppy regimes.');
  }

  if (rationale.indicators.adx !== undefined && rationale.indicators.adx < 25) {
    tweaks.push('Consider raising adxThreshold if you see too many low-conviction entries.');
  }

  if (performance.winRate > 0 && performance.winRate < 0.4 && performance.totalTrades >= 5) {
    tweaks.push('Win rate is below 40% — review whether stops are too tight or entries too early.');
  }

  if (performance.totalTrades === 0) {
    tweaks.push('No closed trades yet — run paper trading for 2–4 weeks before going live.');
  }

  if (tweaks.length === 0) {
    tweaks.push('Current config looks reasonable for your account size. Keep monitoring drawdowns.');
  }

  return tweaks;
}