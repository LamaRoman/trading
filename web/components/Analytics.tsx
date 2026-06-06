'use client';
import { usePoll, fmtUSD } from '../lib/api';

interface AnalyticsData {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  byRegime: Record<string, { trades: number; wins: number; pnl: number }>;
  byExitReason: Record<string, { count: number; pnl: number }>;
  byHour: Record<string, { count: number; pnl: number }>;
}

export default function Analytics() {
  const data = usePoll<AnalyticsData>('/api/analytics', 10000);
  if (!data || data.totalTrades === 0) {
    return (
      <div className="panel">
        <h2>Performance Analytics</h2>
        <div className="empty">need closed trades for analytics</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Performance Analytics</h2>
      <div className="kvs" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          ['Total Trades', String(data.totalTrades)],
          ['Win Rate', data.winRate.toFixed(1) + '%'],
          ['Total P&L', fmtUSD(data.totalPnl)],
          ['Profit Factor', data.profitFactor == null ? '—' : data.profitFactor === Infinity ? '∞' : data.profitFactor.toFixed(2)],
          ['Avg Win', data.avgWin != null ? fmtUSD(data.avgWin) : '—'],
          ['Avg Loss', data.avgLoss != null ? fmtUSD(data.avgLoss) : '—'],
          ['Best', data.bestTrade != null ? fmtUSD(data.bestTrade) : '—'],
          ['Worst', data.worstTrade != null ? fmtUSD(data.worstTrade) : '—'],
        ].map(([k, v]) => (
          <div className="kv" key={k}>
            <div className="k">{k}</div>
            <div className="v">{v}</div>
          </div>
        ))}
      </div>

      {Object.keys(data.byRegime).length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>P&amp;L BY REGIME</div>
          <table>
            <thead><tr><th>Regime</th><th>Trades</th><th>Wins</th><th>P&amp;L</th></tr></thead>
            <tbody>
              {Object.entries(data.byRegime).map(([r, v]) => (
                <tr key={r}>
                  <td style={{ textTransform: 'capitalize' }}>{r.replace(/-/g, ' ')}</td>
                  <td>{v.trades}</td>
                  <td>{v.wins}</td>
                  <td className={v.pnl >= 0 ? 'up' : 'down'}>{fmtUSD(v.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {Object.keys(data.byExitReason).length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 10, margin: '8px 0 4px' }}>BY EXIT REASON</div>
          <table>
            <thead><tr><th>Reason</th><th>Count</th><th>P&amp;L</th></tr></thead>
            <tbody>
              {Object.entries(data.byExitReason).map(([r, v]) => (
                <tr key={r}>
                  <td>{r.replace(/_/g, ' ')}</td>
                  <td>{v.count}</td>
                  <td className={v.pnl >= 0 ? 'up' : 'down'}>{fmtUSD(v.pnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {Object.keys(data.byHour).length > 0 && (
        <>
          <div className="muted" style={{ fontSize: 10, margin: '8px 0 4px' }}>P&amp;L BY HOUR (UTC)</div>
          <div style={{ display: 'flex', gap: 2, height: 40, alignItems: 'flex-end' }}>
            {Array.from({ length: 24 }, (_, h) => {
              const d = data.byHour[h];
              if (!d) return <div key={h} style={{ flex: 1, background: '#161d2b', height: 2 }} />;
              const max = Math.max(...Object.values(data.byHour).map((v) => Math.abs(v.pnl)));
              const pct = max > 0 ? Math.abs(d.pnl) / max : 0;
              return (
                <div
                  key={h}
                  title={`${h}:00 UTC — ${d.count} trades — ${fmtUSD(d.pnl)}`}
                  style={{
                    flex: 1,
                    height: Math.max(2, pct * 36),
                    background: d.pnl >= 0 ? '#16c784' : '#ea3943',
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }} className="muted">
            <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
          </div>
        </>
      )}
    </div>
  );
}
