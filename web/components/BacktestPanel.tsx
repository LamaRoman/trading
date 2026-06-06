'use client';
import { useState } from 'react';
import { usePoll, fmtUSD, fmtPct, API_BASE } from '../lib/api';

interface BTResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  regimeBreakdown: Record<string, { trades: number; winRate: number; pnl: number }>;
}

export default function BacktestPanel({ symbol }: { symbol: string | null }) {
  const [result, setResult] = useState<BTResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!symbol) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/backtest/${encodeURIComponent(symbol)}`);
      setResult(await r.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <h2>Backtest — historical replay</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <span className="muted" style={{ fontSize: 11, lineHeight: '30px' }}>
          {symbol ?? 'select an asset'}
        </span>
        <button className="btn go" onClick={run} disabled={loading || !symbol}>
          {loading ? 'running…' : 'Run Backtest'}
        </button>
      </div>
      {result ? (
        <>
          <div className="kvs" style={{ gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
            {[
              ['Trades', String(result.totalTrades)],
              ['Win Rate', result.winRate.toFixed(1) + '%'],
              ['P&L', fmtUSD(result.totalPnl)],
              ['Return', fmtPct(result.totalReturnPct)],
              ['PF', result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)],
              ['Sharpe', result.sharpeRatio.toFixed(2)],
              ['Max DD', result.maxDrawdownPct.toFixed(1) + '%'],
              ['Avg Win', fmtUSD(result.avgWin)],
              ['Avg Loss', fmtUSD(result.avgLoss)],
              ['Best', fmtUSD(result.bestTrade)],
              ['Worst', fmtUSD(result.worstTrade)],
            ].map(([k, v]) => (
              <div className="kv" key={k}>
                <div className="k">{k}</div>
                <div className="v">{v}</div>
              </div>
            ))}
          </div>
          {Object.keys(result.regimeBreakdown).length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>BY REGIME</div>
              <table>
                <thead>
                  <tr><th>Regime</th><th>Trades</th><th>Win Rate</th><th>P&amp;L</th></tr>
                </thead>
                <tbody>
                  {Object.entries(result.regimeBreakdown).map(([r, v]) => (
                    <tr key={r}>
                      <td style={{ textTransform: 'capitalize' }}>{r.replace(/-/g, ' ')}</td>
                      <td>{v.trades}</td>
                      <td>{v.winRate.toFixed(0)}%</td>
                      <td className={v.pnl >= 0 ? 'up' : 'down'}>{fmtUSD(v.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : (
        <div className="empty">click Run to backtest {symbol ?? '…'} on historical data</div>
      )}
    </div>
  );
}
