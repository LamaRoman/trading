'use client';

import { useState, useEffect, useCallback } from 'react';
import { loadUser } from '../../lib/auth';
import type { AuthUser } from '../../lib/auth';
import { fmtUSD } from '../../lib/api';

const HL_INFO = 'https://api.hyperliquid-testnet.xyz/info';

interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  closedPnl: string;
  fee: string;
  oid: number;
  crossed: boolean;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function HistoryPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [fills, setFills] = useState<Fill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setUser(loadUser()); }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await fetch(HL_INFO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'userFillsByTime',
          user: user.address,
          startTime: Date.now() - 30 * 24 * 60 * 60 * 1000, // last 30 days
        }),
      });
      const data = await r.json();
      setFills(Array.isArray(data) ? data.reverse() : []);
    } catch {}
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 12 }}>
        <div style={{ fontSize: 40, opacity: .15 }}>📜</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Connect wallet to view history</div>
        <div className="muted">Your Hyperliquid trade fills will appear here.</div>
      </div>
    );
  }

  // Stats
  const totalPnl = fills.reduce((s, f) => s + parseFloat(f.closedPnl), 0);
  const totalFees = fills.reduce((s, f) => s + parseFloat(f.fee), 0);
  const totalVolume = fills.reduce((s, f) => s + parseFloat(f.px) * parseFloat(f.sz), 0);
  const winners = fills.filter(f => parseFloat(f.closedPnl) > 0).length;
  const losers = fills.filter(f => parseFloat(f.closedPnl) < 0).length;

  return (
    <>
      {/* Stats bar */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div>
            <div className="muted" style={{ marginBottom: 2 }}>Total Fills</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fills.length}</div>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 2 }}>Realized P&L</div>
            <div className={`${totalPnl >= 0 ? 'up' : 'down'}`} style={{ fontSize: 20, fontWeight: 700 }}>
              {totalPnl >= 0 ? '+' : ''}{fmtUSD(totalPnl)}
            </div>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 2 }}>Total Fees</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtUSD(totalFees)}</div>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 2 }}>Volume</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtUSD(totalVolume)}</div>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 2 }}>Win / Loss</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              <span className="up">{winners}</span> / <span className="down">{losers}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fill history table */}
      <div className="panel">
        <h2>Trade Fills</h2>
        {loading ? (
          <div className="empty">Loading fills...</div>
        ) : fills.length === 0 ? (
          <div className="empty">No trades in the last 30 days</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Coin</th>
                <th>Side</th>
                <th>Price</th>
                <th>Size</th>
                <th>Notional</th>
                <th>Fee</th>
                <th>Closed P&L</th>
              </tr>
            </thead>
            <tbody>
              {fills.map((f, i) => {
                const pnl = parseFloat(f.closedPnl);
                const notional = parseFloat(f.px) * parseFloat(f.sz);
                return (
                  <tr key={`${f.oid}-${i}`}>
                    <td className="muted">{fmtTime(f.time)}</td>
                    <td className="fw-600">{f.coin}</td>
                    <td>
                      <span className={`badge ${f.side === 'B' ? 'LONG' : 'SHORT'}`}>
                        {f.side === 'B' ? 'BUY' : 'SELL'}
                      </span>
                    </td>
                    <td className="mono">${parseFloat(f.px).toLocaleString()}</td>
                    <td className="mono">{parseFloat(f.sz).toFixed(4)}</td>
                    <td className="mono">{fmtUSD(notional)}</td>
                    <td className="mono muted">{fmtUSD(parseFloat(f.fee))}</td>
                    <td className={`mono ${pnl > 0 ? 'up' : pnl < 0 ? 'down' : ''}`}>
                      {pnl !== 0 ? `${pnl > 0 ? '+' : ''}${fmtUSD(pnl)}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
