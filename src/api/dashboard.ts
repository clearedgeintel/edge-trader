export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>edge-trader Dashboard</title>
  <style>
    :root {
      --bg: #0f1419;
      --surface: #1a2332;
      --border: #2d3a4f;
      --text: #e7ecf3;
      --muted: #8b9cb3;
      --accent: #3b82f6;
      --green: #22c55e;
      --red: #ef4444;
      --yellow: #eab308;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: var(--muted); font-size: 0.875rem; margin-bottom: 1.5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
    }
    .card-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .card-value { font-size: 1.5rem; font-weight: 600; margin-top: 0.25rem; }
    .positive { color: var(--green); }
    .negative { color: var(--red); }
    .section { margin-bottom: 1.5rem; }
    .section h2 { font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-weight: 500; font-size: 0.75rem; text-transform: uppercase; }
    .badge {
      display: inline-block; padding: 0.125rem 0.5rem; border-radius: 4px;
      font-size: 0.75rem; font-weight: 500;
    }
    .badge-bull { background: #14532d33; color: var(--green); }
    .badge-choppy { background: #713f1233; color: var(--yellow); }
    .badge-bear { background: #7f1d1d33; color: var(--red); }
    .report-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;
    }
    .report-card h3 { font-size: 0.875rem; margin-bottom: 0.5rem; }
    .report-card p { font-size: 0.8125rem; color: var(--muted); margin-bottom: 0.5rem; }
    .tweaks { list-style: none; }
    .tweaks li { font-size: 0.8125rem; color: var(--accent); padding: 0.25rem 0; }
    .tweaks li::before { content: "→ "; }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.5rem; }
    .dot-green { background: var(--green); }
    .dot-red { background: var(--red); }
    .dot-yellow { background: var(--yellow); }
    #refresh-note { font-size: 0.75rem; color: var(--muted); margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>edge-trader</h1>
  <p class="subtitle">Small-account algorithmic trading dashboard</p>

  <div class="grid" id="metrics"></div>

  <div class="section">
    <h2>Open Positions</h2>
    <div class="card"><table><thead><tr>
      <th>Symbol</th><th>Qty</th><th>Entry</th><th>Stop</th><th>Target</th><th>Trail</th><th>Score</th>
    </tr></thead><tbody id="positions"></tbody></table></div>
  </div>

  <div class="section">
    <h2>Recent Signals</h2>
    <div class="card"><table><thead><tr>
      <th>Symbol</th><th>Score</th><th>Regime</th><th>Stop</th><th>Target</th>
    </tr></thead><tbody id="signals"></tbody></table></div>
  </div>

  <div class="section">
    <h2>Trade History</h2>
    <div class="card"><table><thead><tr>
      <th>Symbol</th><th>P&L</th><th>Exit</th><th>Regime</th><th>Score</th>
    </tr></thead><tbody id="trades"></tbody></table></div>
  </div>

  <div class="section">
    <h2>Ramp & Safety</h2>
    <div class="grid" id="ramp-safety"></div>
    <div class="card" id="ramp-criteria" style="margin-top:0.75rem;font-size:0.8125rem;color:var(--muted)"></div>
  </div>

  <div class="section">
    <h2>Report Cards</h2>
    <div id="report-cards"></div>
  </div>

  <p id="refresh-note">Auto-refreshes every 30 seconds</p>

  <script>
    function fmt(n, dec=2) { return n == null ? '—' : Number(n).toFixed(dec); }
    function pnlClass(n) { return n >= 0 ? 'positive' : 'negative'; }
    function regimeBadge(r) {
      const cls = r === 'trending_bull' ? 'badge-bull' : r === 'choppy' ? 'badge-choppy' : 'badge-bear';
      return '<span class="badge ' + cls + '">' + (r || 'unknown') + '</span>';
    }

    async function load() {
      const [status, perf, positions, signals, cards, safety, ramp] = await Promise.all([
        fetch('/status').then(r => r.json()),
        fetch('/performance').then(r => r.json()),
        fetch('/positions').then(r => r.json()),
        fetch('/signals').then(r => r.json()),
        fetch('/report-cards').then(r => r.json()),
        fetch('/safety').then(r => r.json()),
        fetch('/ramp').then(r => r.json()),
      ]);

      const s = perf.snapshot;
      const eq = status.account?.equity;
      const paused = status.trading?.paused;

      document.getElementById('metrics').innerHTML = [
        { label: 'Equity', value: eq ? '$' + fmt(eq) : '—' },
        { label: 'Today P&L', value: (s.todayPnl >= 0 ? '+' : '') + '$' + fmt(s.todayPnl), cls: pnlClass(s.todayPnl) },
        { label: 'Total P&L', value: (s.totalPnl >= 0 ? '+' : '') + '$' + fmt(s.totalPnl), cls: pnlClass(s.totalPnl) },
        { label: 'Win Rate', value: (s.winRate * 100).toFixed(0) + '%' },
        { label: 'Trades', value: s.totalTrades },
        { label: 'Open Positions', value: s.openPositions },
        { label: 'Ramp Mode', value: (status.trading?.rampMode || '—').replace('_',' ') },
        { label: 'Size Mult', value: ((status.trading?.sizeMultiplier ?? 0) * 100).toFixed(0) + '%' },
        { label: 'Execution', value: status.trading?.executionEnabled ? 'ON' : 'OFF', cls: status.trading?.executionEnabled ? 'positive' : '' },
        { label: 'Status', value: paused ? 'PAUSED' : (status.marketOpen ? 'ACTIVE' : 'CLOSED'), cls: paused ? 'negative' : '' },
      ].map(m => '<div class="card"><div class="card-label">' + m.label + '</div><div class="card-value ' + (m.cls||'') + '">' + m.value + '</div></div>').join('');

      const rs = ramp.status || {};
      const sf = safety.status || {};
      document.getElementById('ramp-safety').innerHTML = [
        { label: 'Safety', value: sf.canExecute ? 'CLEAR' : 'BLOCKED', cls: sf.canExecute ? 'positive' : 'negative' },
        { label: 'Orders Today', value: (sf.ordersToday||0) + '/' + (sf.maxOrdersPerDay||10) },
        { label: 'Consec. Losses', value: sf.consecutiveLosses||0 },
        { label: 'Days in Phase', value: rs.daysInPhase||0 },
        { label: 'Next Mode', value: (rs.nextMode||'—').replace('_',' ') },
      ].map(m => '<div class="card"><div class="card-label">' + m.label + '</div><div class="card-value ' + (m.cls||'') + '">' + m.value + '</div></div>').join('');

      const crit = rs.advancement;
      document.getElementById('ramp-criteria').innerHTML = crit
        ? '<strong>Advancement to ' + (rs.nextMode||'?') + ':</strong> ' + (crit.met ? '<span class="positive">Ready</span>' : 'Not ready') + '<br>' + crit.reasons.join('<br>')
        : '';

      document.getElementById('positions').innerHTML = positions.positions.length === 0
        ? '<tr><td colspan="7" style="color:var(--muted)">No open positions</td></tr>'
        : positions.positions.map(p => '<tr><td>' + p.symbol + '</td><td>' + fmt(p.qty,4) + '</td><td>$' + fmt(p.entryPrice) + '</td><td>$' + fmt(p.stopPrice) + '</td><td>$' + fmt(p.targetPrice) + '</td><td>' + (p.trailingStop ? '$'+fmt(p.trailingStop) : '—') + '</td><td>' + p.score + '</td></tr>').join('');

      document.getElementById('signals').innerHTML = signals.signals.length === 0
        ? '<tr><td colspan="5" style="color:var(--muted)">No recent signals</td></tr>'
        : signals.signals.map(s => '<tr><td>' + s.symbol + '</td><td>' + s.score + '</td><td>' + regimeBadge(s.rationale.regime) + '</td><td>$' + fmt(s.proposal.stopPrice) + '</td><td>$' + fmt(s.proposal.targetPrice) + '</td></tr>').join('');

      document.getElementById('trades').innerHTML = perf.trades.length === 0
        ? '<tr><td colspan="5" style="color:var(--muted)">No closed trades yet</td></tr>'
        : perf.trades.map(t => '<tr><td>' + t.symbol + '</td><td class="' + pnlClass(t.pnl) + '">' + (t.pnl>=0?'+':'') + '$' + fmt(t.pnl) + '</td><td>' + t.exitReason + '</td><td>' + regimeBadge(t.regime) + '</td><td>' + t.score + '</td></tr>').join('');

      document.getElementById('report-cards').innerHTML = cards.cards.length === 0
        ? '<p style="color:var(--muted);font-size:0.875rem">No report cards yet — generated after signals and trade closes</p>'
        : cards.cards.slice(0, 5).map(c => '<div class="report-card"><h3>' + c.symbol + ' · ' + c.type + ' <span style="color:var(--muted)">(' + c.source + ')</span></h3><p><strong>Thesis:</strong> ' + c.content.thesisSummary + '</p><p><strong>Risk:</strong> ' + c.content.riskSnapshot + '</p><p>' + c.content.educationalExplanation + '</p><ul class="tweaks">' + c.content.suggestedTweaks.map(t => '<li>' + t + '</li>').join('') + '</ul></div>').join('');
    }

    load();
    setInterval(load, 30000);
  </script>
</body>
</html>`;