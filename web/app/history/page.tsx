'use client';

import { useState } from 'react';
import { usePoll, fmtUSD, fmtPct, fmtPrice } from '../../lib/api';
import type { Overview, Trade } from '../../lib/api';
import Analytics from '../../components/Analytics';
import BacktestPanel from '../../components/BacktestPanel';

export default function HistoryPage() {
  const trades = usePoll<Trade[]>('/api/trades?status=CLOSED&limit=50', 5000);
  const ov = usePoll<Overview>('/api/overview', 5000);
  const [selSymbol, setSelSymbol] = useState<string | null>(null);
  const symbols = ov?.leaderboard.map((r) => r.symbol) ?? [];

  return (
    <>
      {/* Trade history */}
      <div className="panel">
        <h2>Trade History</h2>
        {trades && trades.length ? (
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Dir</th>
                <th>Source</th>
                <th>Lev</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Conf</th>
                <th>Reason</th>
                <th>P&L</th>
                <th>Lesson</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td className="fw-600">{t.symbol}</td>
                  <td><span className={`badge ${t.direction}`}>{t.direction}</span></td>
                  <td>
                    <span className={`source-badge ${t.source === 'manual' ? 'manual' : 'agent'}`}>
                      {t.source === 'manual' ? '✋' : '🤖'}
                    </span>
                  </td>
                  <td><span className="lev-badge">{t.leverage ?? 1}x</span></td>
                  <td className="mono">{fmtPrice(t.entryPrice)}</td>
                  <td className="mono">{t.exitPrice != null ? fmtPrice(t.exitPrice) : '—'}</td>
                  <td>{t.entryConfidence}%</td>
                  <td className="muted">{t.exitReason?.replace(/_/g, ' ')}</td>
                  <td className={`mono ${(t.pnl ?? 0) >= 0 ? 'up' : 'down'}`}>
                    {t.pnl != null ? fmtUSD(t.pnl) : '—'}{' '}
                    {t.pnlPct != null && <span className="muted">({fmtPct(t.pnlPct)})</span>}
                  </td>
                  <td>
                    {t.mistakeTags && t.mistakeTags.length ? (
                      <span className="shield">{t.mistakeTags.join(', ').replace(/_/g, ' ')}</span>
                    ) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No closed trades yet</div>
        )}
      </div>

      {/* Analytics */}
      <div className="analytics-grid">
        <Analytics />
      </div>

      {/* Backtest */}
      <div style={{ marginTop: 16 }}>
        <div className="panel" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Backtest</h2>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {symbols.map((s) => (
              <button
                key={s}
                className={`lev-btn ${selSymbol === s ? 'active' : ''}`}
                onClick={() => setSelSymbol(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {selSymbol && <BacktestPanel symbol={selSymbol} />}
      </div>
    </>
  );
}
