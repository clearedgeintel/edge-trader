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
      --nav-h: 56px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    .wrap { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }

    /* --- sticky nav --- */
    header.nav {
      position: sticky; top: 0; z-index: 20;
      background: rgba(15,20,25,0.85);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
    }
    .nav-inner {
      max-width: 1200px; margin: 0 auto; padding: 0 1.5rem;
      min-height: var(--nav-h);
      display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
    }
    .brand { font-weight: 700; font-size: 1rem; letter-spacing: -0.01em; margin-right: 0.25rem; }
    .navlinks { display: flex; gap: 0.25rem; flex-wrap: wrap; flex: 1; }
    .navlinks a {
      color: var(--muted); text-decoration: none; font-size: 0.8125rem;
      padding: 0.35rem 0.6rem; border-radius: 6px;
    }
    .navlinks a:hover { color: var(--text); background: var(--surface); }
    .nav-right { display: flex; align-items: center; gap: 0.75rem; }
    .pill {
      display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.3rem 0.6rem; border-radius: 999px;
      background: var(--surface); border: 1px solid var(--border);
      font-size: 0.8125rem; font-weight: 600;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
    .dot-green { background: var(--green); } .dot-red { background: var(--red); } .dot-yellow { background: var(--yellow); }
    .pill-mode { color: var(--muted); font-weight: 500; font-size: 0.75rem; }
    button.refresh {
      background: var(--surface); color: var(--text); border: 1px solid var(--border);
      border-radius: 6px; padding: 0.35rem 0.7rem; font-size: 0.8125rem; cursor: pointer;
    }
    button.refresh:hover { border-color: var(--accent); }
    .updated { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }

    h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: var(--muted); font-size: 0.875rem; margin-bottom: 1.5rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
    .card-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .card-value { font-size: 1.5rem; font-weight: 600; margin-top: 0.25rem; }
    .positive { color: var(--green); }
    .negative { color: var(--red); }
    .section { margin-bottom: 1.5rem; scroll-margin-top: calc(var(--nav-h) + 12px); }
    .section h2 { font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-weight: 500; font-size: 0.75rem; text-transform: uppercase; }
    .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; }
    .badge-bull { background: #14532d33; color: var(--green); }
    .badge-choppy { background: #713f1233; color: var(--yellow); }
    .badge-bear { background: #7f1d1d33; color: var(--red); }
    .report-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
    .report-card h3 { font-size: 0.875rem; margin-bottom: 0.5rem; }
    .report-card p { font-size: 0.8125rem; color: var(--muted); margin-bottom: 0.5rem; }
    .tweaks { list-style: none; }
    .tweaks li { font-size: 0.8125rem; color: var(--accent); padding: 0.25rem 0; }
    .tweaks li::before { content: "→ "; }
    #error { display: none; background: #7f1d1d33; border: 1px solid var(--red); color: #fecaca;
      border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.875rem; }
    .api-links { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--muted); }
    .api-links a { color: var(--muted); text-decoration: none; margin-right: 0.75rem; }
    .api-links a:hover { color: var(--accent); }
  </style>
</head>
<body>
  <header class="nav">
    <div class="nav-inner">
      <span class="brand">edge-trader</span>
      <nav class="navlinks">
        <a href="#overview">Overview</a>
        <a href="#sec-positions">Positions</a>
        <a href="#sec-signals">Signals</a>
        <a href="#sec-trades">Trades</a>
        <a href="#sec-ramp">Ramp &amp; Safety</a>
        <a href="#sec-cards">Report Cards</a>
      </nav>
      <div class="nav-right">
        <span class="pill"><span class="dot" id="pill-dot"></span><span id="pill-text">…</span><span class="pill-mode" id="pill-mode"></span></span>
        <span class="updated" id="updated">connecting…</span>
        <button class="refresh" id="refresh" title="Refresh now">↻</button>
      </div>
    </div>
  </header>

  <div class="wrap">
    <h1>Dashboard</h1>
    <p class="subtitle">Small-account algorithmic trading — live status</p>

    <div id="error"></div>

    <div class="section" id="overview">
      <div class="grid" id="metrics"></div>
    </div>

    <div class="section" id="sec-positions">
      <h2>Open Positions</h2>
      <div class="card"><table><thead><tr>
        <th>Symbol</th><th>Qty</th><th>Entry</th><th>Price</th><th>P&L</th><th>Stop</th><th>Target</th><th>Trail</th><th>Score</th>
      </tr></thead><tbody id="positions"></tbody></table></div>
    </div>

    <div class="section" id="sec-signals">
      <h2>Recent Signals</h2>
      <div class="card"><table><thead><tr>
        <th>Symbol</th><th>Score</th><th>Regime</th><th>Stop</th><th>Target</th>
      </tr></thead><tbody id="signals"></tbody></table></div>
    </div>

    <div class="section" id="sec-trades">
      <h2>Trade History</h2>
      <div class="card"><table><thead><tr>
        <th>Symbol</th><th>P&L</th><th>Exit</th><th>Regime</th><th>Score</th>
      </tr></thead><tbody id="trades"></tbody></table></div>
    </div>

    <div class="section" id="sec-ramp">
      <h2>Ramp &amp; Safety</h2>
      <div class="grid" id="ramp-safety"></div>
      <div class="card" id="ramp-criteria" style="margin-top:0.75rem;font-size:0.8125rem;color:var(--muted)"></div>
    </div>

    <div class="section" id="sec-cards">
      <h2>Report Cards</h2>
      <div id="report-cards"></div>
    </div>

    <div class="api-links">
      Raw JSON:
      <a href="/status" target="_blank">/status</a>
      <a href="/analysis" target="_blank">/analysis</a>
      <a href="/signals" target="_blank">/signals</a>
      <a href="/positions" target="_blank">/positions</a>
      <a href="/performance" target="_blank">/performance</a>
      <a href="/report-cards" target="_blank">/report-cards</a>
      <a href="/safety" target="_blank">/safety</a>
      <a href="/ramp" target="_blank">/ramp</a>
      <a href="/health" target="_blank">/health</a>
    </div>
  </div>

  <script>
    function fmt(n, dec=2) { return n == null ? '—' : Number(n).toFixed(dec); }
    function pnlClass(n) { return n >= 0 ? 'positive' : 'negative'; }
    function regimeBadge(r) {
      const cls = r === 'trending_bull' ? 'badge-bull' : r === 'choppy' ? 'badge-choppy' : 'badge-bear';
      return '<span class="badge ' + cls + '">' + (r || 'unknown') + '</span>';
    }

    let lastLoaded = null;

    function setPill(paused, marketOpen, mode) {
      const dot = document.getElementById('pill-dot');
      const text = document.getElementById('pill-text');
      const label = paused ? 'PAUSED' : (marketOpen ? 'ACTIVE' : 'CLOSED');
      dot.className = 'dot ' + (paused ? 'dot-red' : (marketOpen ? 'dot-green' : 'dot-yellow'));
      text.textContent = label;
      document.getElementById('pill-mode').textContent = mode ? '· ' + mode.replace('_',' ') : '';
    }

    function tickUpdated() {
      const el = document.getElementById('updated');
      if (!lastLoaded) return;
      const secs = Math.round((Date.now() - lastLoaded) / 1000);
      el.textContent = 'updated ' + (secs < 1 ? 'just now' : secs + 's ago');
    }

    async function load() {
      const err = document.getElementById('error');
      try {
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
        setPill(paused, status.marketOpen, status.trading?.rampMode);

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
          ? '<tr><td colspan="9" style="color:var(--muted)">No open positions</td></tr>'
          : positions.positions.map(p => {
              const price = p.currentPrice != null ? '$' + fmt(p.currentPrice) : '—';
              let pnl = '—', cls = '';
              if (p.unrealizedPnl != null) {
                const v = p.unrealizedPnl;
                cls = v >= 0 ? 'positive' : 'negative';
                pnl = (v >= 0 ? '+$' : '-$') + fmt(Math.abs(v))
                  + (p.unrealizedPnlPct != null ? ' (' + (p.unrealizedPnlPct >= 0 ? '+' : '') + fmt(p.unrealizedPnlPct,1) + '%)' : '');
              }
              return '<tr><td>' + p.symbol + '</td><td>' + fmt(p.qty,4) + '</td><td>$' + fmt(p.entryPrice) + '</td><td>' + price + '</td><td class="' + cls + '">' + pnl + '</td><td>$' + fmt(p.stopPrice) + '</td><td>$' + fmt(p.targetPrice) + '</td><td>' + (p.trailingStop ? '$'+fmt(p.trailingStop) : '—') + '</td><td>' + p.score + '</td></tr>';
            }).join('');

        document.getElementById('signals').innerHTML = signals.signals.length === 0
          ? '<tr><td colspan="5" style="color:var(--muted)">No recent signals</td></tr>'
          : signals.signals.map(s => '<tr><td>' + s.symbol + '</td><td>' + s.score + '</td><td>' + regimeBadge(s.rationale.regime) + '</td><td>$' + fmt(s.proposal.stopPrice) + '</td><td>$' + fmt(s.proposal.targetPrice) + '</td></tr>').join('');

        document.getElementById('trades').innerHTML = perf.trades.length === 0
          ? '<tr><td colspan="5" style="color:var(--muted)">No closed trades yet</td></tr>'
          : perf.trades.map(t => '<tr><td>' + t.symbol + '</td><td class="' + pnlClass(t.pnl) + '">' + (t.pnl>=0?'+':'') + '$' + fmt(t.pnl) + '</td><td>' + t.exitReason + '</td><td>' + regimeBadge(t.regime) + '</td><td>' + t.score + '</td></tr>').join('');

        document.getElementById('report-cards').innerHTML = cards.cards.length === 0
          ? '<p style="color:var(--muted);font-size:0.875rem">No report cards yet — generated after signals and trade closes</p>'
          : cards.cards.slice(0, 5).map(c => '<div class="report-card"><h3>' + c.symbol + ' · ' + c.type + ' <span style="color:var(--muted)">(' + c.source + ')</span></h3><p><strong>Thesis:</strong> ' + c.content.thesisSummary + '</p><p><strong>Risk:</strong> ' + c.content.riskSnapshot + '</p><p>' + c.content.educationalExplanation + '</p><ul class="tweaks">' + c.content.suggestedTweaks.map(t => '<li>' + t + '</li>').join('') + '</ul></div>').join('');

        err.style.display = 'none';
        lastLoaded = Date.now();
        tickUpdated();
      } catch (e) {
        err.style.display = 'block';
        err.textContent = 'Could not reach the API (' + (e && e.message ? e.message : e) + '). Retrying…';
      }
    }

    document.getElementById('refresh').addEventListener('click', load);
    load();
    setInterval(load, 30000);
    setInterval(tickUpdated, 1000);
  </script>
</body>
</html>`;
