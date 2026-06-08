'use client';

import { useState, useEffect, useCallback } from 'react';
import { loadUser } from '../../lib/auth';
import type { AuthUser } from '../../lib/auth';
import { getAccountState, getSpotBalances, type HlAccountState } from '../../lib/hyperliquid';
import { fmtUSD } from '../../lib/api';

export default function WalletPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [account, setAccount] = useState<HlAccountState | null>(null);
  const [spotBals, setSpotBals] = useState<Record<string, string>>({});

  useEffect(() => { setUser(loadUser()); }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [acc, bals] = await Promise.all([
        getAccountState(user.address),
        getSpotBalances(user.address),
      ]);
      setAccount(acc);
      setSpotBals(bals);
    } catch {}
  }, [user]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: 12 }}>
        <div style={{ fontSize: 40, opacity: .15 }}>💰</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Connect wallet to view balances</div>
        <div className="muted">Your Hyperliquid account balances and positions will appear here.</div>
      </div>
    );
  }

  const margin = account?.crossMarginSummary ?? account?.marginSummary;
  const equity = margin ? parseFloat(margin.accountValue) : 0;
  const marginUsed = margin ? parseFloat(margin.totalMarginUsed) : 0;
  const available = equity - marginUsed;
  const notional = margin ? parseFloat(margin.totalNtlPos) : 0;

  const positions = account?.assetPositions?.filter(
    (p) => parseFloat(p.position.szi) !== 0,
  ) ?? [];

  const totalUpnl = positions.reduce((s, p) => s + parseFloat(p.position.unrealizedPnl), 0);

  // Spot balances (non-zero)
  const spotEntries = Object.entries(spotBals).filter(([, v]) => parseFloat(v) > 0.0001);

  const cashPct = equity > 0 ? (available / equity) * 100 : 100;
  const marginPct = equity > 0 ? (marginUsed / equity) * 100 : 0;

  return (
    <>
      {/* Hero balance */}
      <div style={{ marginBottom: 20 }}>
        <div className="muted" style={{ marginBottom: 4 }}>Account Value</div>
        <div style={{ fontSize: 36, fontWeight: 800 }}>{fmtUSD(equity)}</div>
        <div style={{ display: 'flex', gap: 24, marginTop: 10 }}>
          <div>
            <span className="muted">Available </span>
            <span className="fw-600">{fmtUSD(available)}</span>
          </div>
          <div>
            <span className="muted">Margin Used </span>
            <span className="fw-600">{fmtUSD(marginUsed)}</span>
          </div>
          <div>
            <span className="muted">Unrealized P&L </span>
            <span className={`fw-600 ${totalUpnl >= 0 ? 'up' : 'down'}`}>{totalUpnl >= 0 ? '+' : ''}{fmtUSD(totalUpnl)}</span>
          </div>
        </div>
      </div>

      {/* Allocation bar */}
      {equity > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, background: 'var(--border)' }}>
            <div style={{ width: `${cashPct}%`, background: 'var(--green)', borderRadius: 3, minWidth: 3 }} />
            {marginPct > 0 && <div style={{ width: `${marginPct}%`, background: 'var(--blue)', borderRadius: 3, minWidth: 3 }} />}
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 8, fontSize: 13 }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--green)', marginRight: 6 }} />Available {cashPct.toFixed(0)}%</span>
            {marginPct > 0 && <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--blue)', marginRight: 6 }} />In Margin {marginPct.toFixed(0)}%</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Perp Positions */}
        <div className="panel">
          <h2>Perpetual Positions</h2>
          {positions.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Entry</th>
                  <th>Mark</th>
                  <th>P&L</th>
                  <th>Lev</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const pos = p.position;
                  const szi = parseFloat(pos.szi);
                  const isLong = szi > 0;
                  const upnl = parseFloat(pos.unrealizedPnl);
                  return (
                    <tr key={pos.coin}>
                      <td className="fw-600">{pos.coin}/USD</td>
                      <td><span className={`badge ${isLong ? 'LONG' : 'SHORT'}`}>{isLong ? 'LONG' : 'SHORT'}</span></td>
                      <td className="mono">{Math.abs(szi).toFixed(4)}</td>
                      <td className="mono">${parseFloat(pos.entryPx).toLocaleString()}</td>
                      <td className="mono">${parseFloat(pos.positionValue ? (parseFloat(pos.positionValue) / Math.abs(szi)).toString() : pos.entryPx).toLocaleString()}</td>
                      <td className={`mono ${upnl >= 0 ? 'up' : 'down'}`}>{upnl >= 0 ? '+' : ''}{fmtUSD(upnl)}</td>
                      <td><span className="lev-badge">{pos.leverage?.value ?? 1}x</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">No open positions</div>
          )}
        </div>

        {/* Spot Balances */}
        <div className="panel">
          <h2>Spot Balances</h2>
          {spotEntries.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {spotEntries.map(([coin, bal]) => (
                  <tr key={coin}>
                    <td className="fw-600">{coin}</td>
                    <td className="mono">{parseFloat(bal).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">No spot holdings</div>
          )}
        </div>
      </div>

      {/* Wallet address info */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Wallet Details</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span className="muted">Connected Address</span>
            <span className="mono" style={{ fontSize: 13 }}>{user.address}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span className="muted">Network</span>
            <span>Hyperliquid L1</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span className="muted">Deposit / Withdraw</span>
            <a href="https://app.hyperliquid.xyz/portfolio" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)' }}>
              Go to Hyperliquid →
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
