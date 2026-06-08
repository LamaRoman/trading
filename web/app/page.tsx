'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { fmtUSD, fmtPct, fmtPrice } from '../lib/api';
import { loadUser } from '../lib/auth';
import type { AuthUser } from '../lib/auth';
import {
  getAccountState, getAllMids,
  type HlAccountState,
} from '../lib/hyperliquid';
import MarketOverview from '../components/MarketOverview';

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [account, setAccount] = useState<HlAccountState | null>(null);
  const [mids, setMids] = useState<Record<string, string>>({});

  useEffect(() => {
    setUser(loadUser());
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [acc, ms] = await Promise.all([
        getAccountState(user.address),
        getAllMids(),
      ]);
      setAccount(acc);
      setMids(ms);
    } catch {}
  }, [user]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // Not connected — show public market overview
  if (!user) {
    return (
      <>
        {/* Hero */}
        <div className="hero-section">
          <h1 className="hero-title">Trade Perpetuals on Hyperliquid</h1>
          <p className="hero-sub">
            Professional-grade trading with real-time order books, live charts, and on-chain execution.
            Connect your wallet to start trading.
          </p>
          <div className="hero-actions">
            <a href="/trade" className="btn hero-btn primary">Start Trading</a>
            <a href="/leaderboard" className="btn hero-btn secondary">View Leaderboard</a>
          </div>
        </div>
        <MarketOverview />
      </>
    );
  }

  const margin = account?.crossMarginSummary ?? account?.marginSummary;
  const equity = margin ? parseFloat(margin.accountValue) : 0;
  const marginUsed = margin ? parseFloat(margin.totalMarginUsed) : 0;
  const notional = margin ? parseFloat(margin.totalNtlPos) : 0;
  const available = equity - marginUsed;

  const positions = account?.assetPositions?.filter(
    (p) => parseFloat(p.position.szi) !== 0,
  ) ?? [];

  const totalUpnl = positions.reduce((sum, p) => sum + parseFloat(p.position.unrealizedPnl), 0);

  return (
    <>
      {/* Hero */}
      <div className="dash-hero">
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>Account value</div>
          <div className="dash-equity-num">{fmtUSD(equity)}</div>
        </div>
        <div className="dash-quick-stats">
          <div className="dash-qs">
            <span className="muted">Available</span>
            <span>{fmtUSD(available)}</span>
          </div>
          <div className="dash-qs">
            <span className="muted">Margin used</span>
            <span>{fmtUSD(marginUsed)}</span>
          </div>
          <div className="dash-qs">
            <span className="muted">Unrealized</span>
            <span className={totalUpnl >= 0 ? 'up' : 'down'}>{fmtUSD(totalUpnl)}</span>
          </div>
          <div className="dash-qs">
            <span className="muted">Positions</span>
            <span>{positions.length}</span>
          </div>
        </div>
      </div>

      {/* Positions */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Positions</h2>
          <a href="/trade" className="link-subtle">Trade →</a>
        </div>
        {positions.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Side</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>Liq.</th>
                <th>Lev</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const pos = p.position;
                const szi = parseFloat(pos.szi);
                const isLong = szi > 0;
                const upnl = parseFloat(pos.unrealizedPnl);
                const entryPx = parseFloat(pos.entryPx);
                const markPx = parseFloat(mids[pos.coin] ?? '0');
                const lev = pos.leverage?.value ?? 1;
                const liqPx = pos.liquidationPx ? parseFloat(pos.liquidationPx) : null;
                return (
                  <tr key={pos.coin}>
                    <td className="fw-600">{pos.coin}</td>
                    <td><span className={`badge ${isLong ? 'LONG' : 'SHORT'}`}>{isLong ? 'LONG' : 'SHORT'}</span></td>
                    <td className="mono">{Math.abs(szi).toFixed(4)}</td>
                    <td className="mono">${entryPx.toFixed(2)}</td>
                    <td className="mono">{markPx > 0 ? `$${markPx.toFixed(2)}` : '—'}</td>
                    <td className="mono" style={{ color: 'var(--red)', fontSize: 12 }}>
                      {liqPx ? `$${liqPx.toFixed(2)}` : '—'}
                    </td>
                    <td><span className="lev-badge">{lev}x</span></td>
                    <td className={`mono ${upnl >= 0 ? 'up' : 'down'}`}>
                      {fmtUSD(upnl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty">No open positions</div>
        )}
      </div>
    </>
  );
}
