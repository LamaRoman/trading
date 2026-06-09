'use client';

import { useState, useEffect } from 'react';

interface NotableTrader {
  name: string;
  tag: string; // role/description
  address: string;
  avatar: string; // emoji or initials
}

interface Position {
  coin: string;
  szi: string;
  entryPx: string;
  leverage: { value: number } | null;
  unrealizedPnl: string;
}

// Known public wallets of notable crypto traders on Hyperliquid
const NOTABLE: NotableTrader[] = [
  { name: 'James Wynn', tag: 'Whale Trader', address: '0x8f39fd8e33', avatar: 'JW' },
  { name: 'Penision Fund', tag: 'Top P&L', address: '', avatar: 'PF' },
  { name: 'BobbyBigSize', tag: 'High Volume', address: '', avatar: 'BB' },
  { name: 'HyperWhale', tag: 'Whale', address: '', avatar: 'HW' },
];

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

interface ResolvedTrader {
  name: string;
  tag: string;
  avatar: string;
  address: string;
  acctValue: number;
  positions: Position[];
  pnl7d: number;
  roi7d: number;
}

export default function NotableTraders() {
  const [traders, setTraders] = useState<ResolvedTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // First get leaderboard to resolve names to addresses
        const lbRes = await fetch('https://stats-data.hyperliquid.xyz/Mainnet/leaderboard');
        const lbData = await lbRes.json();
        const lbRows = lbData.leaderboardRows ?? [];

        // Map known names to their addresses
        const nameMap: Record<string, string> = {};
        for (const row of lbRows) {
          if (row.displayName) {
            nameMap[row.displayName] = row.ethAddress;
          }
        }

        // Also pick top 5 traders by account value as "whales"
        const topWhales = [...lbRows]
          .sort((a: any, b: any) => parseFloat(b.accountValue) - parseFloat(a.accountValue))
          .slice(0, 8);

        // Build notable list: known names + top whales
        const notableAddrs: { name: string; tag: string; avatar: string; address: string }[] = [];

        // Build perf lookup
        const perfMap: Record<string, { pnl: number; roi: number }> = {};
        for (const row of lbRows) {
          const weekPerf = row.windowPerformances?.find((w: any) => w[0] === 'week');
          if (weekPerf) {
            perfMap[row.ethAddress] = {
              pnl: parseFloat(weekPerf[1].pnl),
              roi: parseFloat(weekPerf[1].roi) * 100,
            };
          }
        }

        // Add known names if found
        for (const row of lbRows) {
          if (row.displayName && row.displayName.length > 0) {
            const acctVal = parseFloat(row.accountValue);
            if (acctVal > 1_000_000) { // Only show $1M+ accounts
              notableAddrs.push({
                name: row.displayName,
                tag: acctVal > 50_000_000 ? 'Mega Whale' : acctVal > 10_000_000 ? 'Whale' : 'Notable',
                avatar: row.displayName.slice(0, 2).toUpperCase(),
                address: row.ethAddress,
              });
            }
          }
        }

        // Add top unnamed whales
        for (const row of topWhales) {
          if (!row.displayName && parseFloat(row.accountValue) > 5_000_000) {
            notableAddrs.push({
              name: shortAddr(row.ethAddress),
              tag: 'Top Whale',
              avatar: '🐋',
              address: row.ethAddress,
            });
          }
        }

        // Dedupe and limit
        const seen = new Set<string>();
        const unique = notableAddrs.filter(t => {
          if (seen.has(t.address)) return false;
          seen.add(t.address);
          return true;
        }).slice(0, 12);

        // Fetch positions for each
        const resolved: ResolvedTrader[] = await Promise.all(
          unique.map(async (t) => {
            try {
              const r = await fetch('https://api.hyperliquid.xyz/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'clearinghouseState', user: t.address }),
              });
              const d = await r.json();
              const positions = d.assetPositions
                ?.filter((p: any) => parseFloat(p.position.szi) !== 0)
                .map((p: any) => p.position) ?? [];
              const perf = perfMap[t.address] ?? { pnl: 0, roi: 0 };
              return {
                ...t,
                acctValue: parseFloat(d.crossMarginSummary?.accountValue ?? '0'),
                positions,
                pnl7d: perf.pnl,
                roi7d: perf.roi,
              };
            } catch {
              return { ...t, acctValue: 0, positions: [], pnl7d: 0, roi7d: 0 };
            }
          })
        );

        setTraders(resolved.sort((a, b) => b.acctValue - a.acctValue));
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="panel">
        <h2>Notable Traders</h2>
        <div className="empty">Loading notable traders...</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Notable Traders</h2>
      <p className="muted" style={{ margin: '-8px 0 14px', fontSize: 14 }}>
        Track live positions of top Hyperliquid whales and known traders.
      </p>

      <div className="nt-grid">
        {traders.map((t) => (
          <div
            key={t.address}
            className={`nt-card ${expanded === t.address ? 'expanded' : ''}`}
            onClick={() => setExpanded(expanded === t.address ? null : t.address)}
          >
            {/* Card header */}
            <div className="nt-card-header">
              <img
                className="nt-avatar"
                src={`https://effigy.im/a/${t.address}.svg`}
                alt={t.name}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="nt-info">
                <div className="nt-name">{t.name}</div>
                <div className="nt-tag">{t.tag}</div>
              </div>
              <div className="nt-right">
                <div className="nt-acct">{fmtCompact(t.acctValue)}</div>
                <div className="nt-pos-count">
                  {t.positions.length > 0 ? (
                    <span className="up">{t.positions.length} open</span>
                  ) : (
                    <span className="muted">No positions</span>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded: stats + positions */}
            {expanded === t.address && (
              <div className="nt-stats">
                <div className="nt-stat-item">
                  <span className="muted">Account Value</span>
                  <span className="fw-600">{fmtCompact(t.acctValue)}</span>
                </div>
                <div className="nt-stat-item">
                  <span className="muted">P&L (7d)</span>
                  <span className={`fw-600 ${t.pnl7d >= 0 ? 'up' : 'down'}`}>{t.pnl7d >= 0 ? '+' : ''}{fmtCompact(t.pnl7d)}</span>
                </div>
                <div className="nt-stat-item">
                  <span className="muted">ROI</span>
                  <span className={`fw-600 ${t.roi7d >= 0 ? 'up' : 'down'}`}>{t.roi7d >= 0 ? '+' : ''}{t.roi7d.toFixed(2)}%</span>
                </div>
                <div className="nt-stat-item">
                  <span className="muted">Open Positions</span>
                  <span className="fw-600">{t.positions.length}</span>
                </div>
              </div>
            )}
            {expanded === t.address && t.positions.length > 0 && (
              <div className="nt-positions">
                <table style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '4px 6px' }}>Market</th>
                      <th style={{ padding: '4px 6px' }}>Side</th>
                      <th style={{ padding: '4px 6px' }}>Size</th>
                      <th style={{ padding: '4px 6px' }}>Leverage</th>
                      <th style={{ padding: '4px 6px' }}>Unrealized P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.positions.map((p) => {
                      const szi = parseFloat(p.szi);
                      const isLong = szi > 0;
                      const upnl = parseFloat(p.unrealizedPnl);
                      const entry = parseFloat(p.entryPx);
                      const notional = Math.abs(szi) * entry;
                      return (
                        <tr key={p.coin}>
                          <td style={{ padding: '3px 6px' }} className="fw-600">{p.coin}</td>
                          <td style={{ padding: '3px 6px' }}>
                            <span className={`badge ${isLong ? 'LONG' : 'SHORT'}`}>
                              {isLong ? 'LONG' : 'SHORT'}
                            </span>
                          </td>
                          <td style={{ padding: '3px 6px' }} className="mono">{fmtCompact(notional)}</td>
                          <td style={{ padding: '3px 6px' }}><span className="lev-badge">{p.leverage?.value ?? 1}x</span></td>
                          <td style={{ padding: '3px 6px' }} className={`mono ${upnl >= 0 ? 'up' : 'down'}`}>
                            {upnl >= 0 ? '+' : ''}{fmtCompact(upnl)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
