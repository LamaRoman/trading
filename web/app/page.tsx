'use client';

import { usePoll, fmtUSD, fmtPct, fmtPrice, confColor, API_BASE } from '../lib/api';
import type { Overview } from '../lib/api';
import EquityCurve from '../components/EquityCurve';

export default function DashboardPage() {
  const ov = usePoll<Overview>('/api/overview', 3000);
  const pf = ov?.portfolio;
  const lb = ov?.leaderboard ?? [];

  return (
    <>
      {/* Hero stats */}
      <div className="stat-cards">
        <div className="stat-card accent-green">
          <div className="stat-card-label">Total Equity</div>
          <div className="stat-card-value">{pf ? fmtUSD(pf.equity) : '—'}</div>
          <div className={`stat-card-sub ${pf && pf.totalReturnPct >= 0 ? 'up' : 'down'}`}>
            {pf ? fmtPct(pf.totalReturnPct) + ' all time' : ''}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Realized P&L</div>
          <div className={`stat-card-value ${pf && pf.realizedPnl >= 0 ? 'up' : 'down'}`}>
            {pf ? fmtUSD(pf.realizedPnl) : '—'}
          </div>
          <div className="stat-card-sub muted">closed trades</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Unrealized P&L</div>
          <div className={`stat-card-value ${pf && pf.unrealizedPnl >= 0 ? 'up' : 'down'}`}>
            {pf ? fmtUSD(pf.unrealizedPnl) : '—'}
          </div>
          <div className="stat-card-sub muted">open positions</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Available Cash</div>
          <div className="stat-card-value">{pf ? fmtUSD(pf.cash) : '—'}</div>
          <div className="stat-card-sub muted">
            {pf ? `${pf.openCount} of ${ov?.config.maxConcurrent} slots used` : ''}
          </div>
        </div>
      </div>

      {/* Equity curve — full width */}
      <div className="panel" style={{ marginTop: 20 }}>
        <h2>Portfolio Performance</h2>
        <EquityCurve />
      </div>

      {/* Two-column: positions + top picks */}
      <div className="dash-grid">
        {/* Open positions */}
        <div className="panel">
          <h2>Open Positions</h2>
          {pf && pf.positions.length ? (
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Dir</th>
                  <th>Source</th>
                  <th>Lev</th>
                  <th>Entry</th>
                  <th>Mark</th>
                  <th>P&L</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pf.positions.map((p) => (
                  <tr key={p.id}>
                    <td className="fw-600">{p.symbol}</td>
                    <td><span className={`badge ${p.direction}`}>{p.direction}</span></td>
                    <td>
                      <span className={`source-badge ${p.source === 'manual' ? 'manual' : 'agent'}`}>
                        {p.source === 'manual' ? '✋' : '🤖'}
                      </span>
                    </td>
                    <td><span className="lev-badge">{p.leverage ?? 1}x</span></td>
                    <td className="mono">{fmtPrice(p.entryPrice)}</td>
                    <td className="mono">{fmtPrice(p.price)}</td>
                    <td className={`mono ${p.upnl >= 0 ? 'up' : 'down'}`}>
                      {fmtUSD(p.upnl)} <span className="muted">({fmtPct(p.upnlPct)})</span>
                    </td>
                    <td>
                      {p.source === 'manual' && (
                        <button
                          className="btn danger"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={async () => {
                            await fetch(API_BASE + `/api/trades/${p.id}/close`, { method: 'POST' });
                          }}
                        >
                          Close
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No open positions — cash is a valid position</div>
          )}
        </div>

        {/* Top picks */}
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Agent Top Picks</h2>
            <a href="/trade" className="link-subtle">View all →</a>
          </div>
          {lb.slice(0, 5).map((r) => (
            <div key={r.symbol} className="pick-row">
              <div className="pick-info">
                <span className="fw-600">{r.symbol}</span>
                <span className={`badge ${r.direction}`} style={{ marginLeft: 6 }}>{r.direction}</span>
                <span className="mono muted" style={{ marginLeft: 8, fontSize: 12 }}>{fmtPrice(r.price)}</span>
              </div>
              <div className="pick-conf" style={{ color: confColor(r.confidence) }}>
                {r.confidence}%
              </div>
            </div>
          ))}
          {!lb.length && <div className="empty">Waiting for first scan…</div>}
        </div>
      </div>

      {/* Agent last decision */}
      {ov?.lastDecision && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2>Last Agent Decision</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="badge leverage" style={{ fontSize: 12, padding: '4px 10px' }}>
              {ov.lastDecision.action}
            </span>
            <span style={{ fontSize: 13 }}>{ov.lastDecision.summary}</span>
            <span className="muted" style={{ fontSize: 11, marginLeft: 'auto' }}>
              {new Date(ov.lastDecision.createdAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
