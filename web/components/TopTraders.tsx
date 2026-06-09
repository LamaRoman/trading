'use client';

import { useState, useEffect } from 'react';

interface WindowPerf {
  pnl: string;
  roi: string;
  vlm: string;
}

interface LeaderboardRow {
  ethAddress: string;
  accountValue: string;
  displayName: string | null;
  windowPerformances: [string, WindowPerf][];
}

interface TraderPosition {
  coin: string;
  szi: string;
  entryPx: string;
  leverage: { value: number } | null;
  unrealizedPnl: string;
  positionValue: string;
}

type TimeWindow = 'day' | 'week' | 'month' | 'allTime';

const WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: 'day', label: '24h' },
  { value: 'week', label: '7d' },
  { value: 'month', label: '30d' },
  { value: 'allTime', label: 'All Time' },
];

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export default function TopTraders() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [window, setWindow] = useState<TimeWindow>('week');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'pnl' | 'roi' | 'vlm'>('pnl');

  // Tab: winners or losers
  const [tab, setTab] = useState<'winners' | 'losers'>('winners');

  // Trader profile modal
  const [selectedTrader, setSelectedTrader] = useState<LeaderboardRow | null>(null);
  const [traderPositions, setTraderPositions] = useState<TraderPosition[]>([]);
  const [traderAcctValue, setTraderAcctValue] = useState(0);
  const [traderLoading, setTraderLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('https://stats-data.hyperliquid.xyz/Mainnet/leaderboard')
      .then((r) => r.json())
      .then((d) => setRows(d.leaderboardRows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function openTraderProfile(row: LeaderboardRow) {
    setSelectedTrader(row);
    setTraderLoading(true);
    setTraderPositions([]);
    try {
      const r = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearinghouseState', user: row.ethAddress }),
      });
      const d = await r.json();
      const open = d.assetPositions
        ?.filter((p: any) => parseFloat(p.position.szi) !== 0)
        .map((p: any) => p.position) ?? [];
      setTraderPositions(open);
      setTraderAcctValue(parseFloat(d.crossMarginSummary?.accountValue ?? '0'));
    } catch {}
    setTraderLoading(false);
  }

  function getPerf(row: LeaderboardRow): WindowPerf | null {
    const entry = row.windowPerformances.find(([w]) => w === window);
    return entry ? entry[1] : null;
  }

  const sorted = [...rows]
    .map((r) => ({ row: r, perf: getPerf(r) }))
    .filter((x) => {
      if (!x.perf || parseFloat(x.perf.pnl) === 0) return false;
      // For losers tab, only show negative P&L
      if (tab === 'losers') return parseFloat(x.perf.pnl) < 0;
      // For winners tab, only show positive P&L
      return parseFloat(x.perf.pnl) > 0;
    })
    .sort((a, b) => {
      const av = parseFloat(a.perf![sortBy]);
      const bv = parseFloat(b.perf![sortBy]);
      // Losers: ascending (most negative first), Winners: descending
      return tab === 'losers' ? av - bv : bv - av;
    })
    .slice(0, 25);

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`tt-tab ${tab === 'winners' ? 'active up' : ''}`}
            onClick={() => setTab('winners')}
          >
            🏆 Top Winners
          </button>
          <button
            className={`tt-tab ${tab === 'losers' ? 'active down' : ''}`}
            onClick={() => setTab('losers')}
          >
            📉 Top Losers
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              className={`lev-btn ${window === w.value ? 'active' : ''}`}
              onClick={() => setWindow(w.value)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty">Loading leaderboard…</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Trader</th>
              <th>Account</th>
              <th style={{ cursor: 'pointer' }} onClick={() => setSortBy('pnl')}>
                P&L {sortBy === 'pnl' ? '▼' : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => setSortBy('roi')}>
                ROI {sortBy === 'roi' ? '▼' : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => setSortBy('vlm')}>
                Volume {sortBy === 'vlm' ? '▼' : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ row, perf }, i) => {
              const pnl = parseFloat(perf!.pnl);
              const roi = parseFloat(perf!.roi) * 100;
              const vlm = parseFloat(perf!.vlm);
              const acct = parseFloat(row.accountValue);
              return (
                <tr
                  key={row.ethAddress}
                  onClick={() => openTraderProfile(row)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="muted">{i + 1}</td>
                  <td>
                    <span className="mono" style={{ fontSize: 14 }}>
                      {row.displayName || shortAddr(row.ethAddress)}
                    </span>
                  </td>
                  <td className="mono">{fmtCompact(acct)}</td>
                  <td className={`mono ${pnl >= 0 ? 'up' : 'down'}`}>
                    {pnl >= 0 ? '+' : ''}{fmtCompact(pnl)}
                  </td>
                  <td className={`mono ${roi >= 0 ? 'up' : 'down'}`}>
                    {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                  </td>
                  <td className="mono muted">{fmtCompact(vlm)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ── Trader Profile Modal ── */}
      {selectedTrader && (
        <div className="tp-overlay" onClick={() => setSelectedTrader(null)}>
          <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="tp-header">
              <div>
                <div className="tp-name">
                  {selectedTrader.displayName || shortAddr(selectedTrader.ethAddress)}
                </div>
                <div className="mono muted" style={{ fontSize: 13 }}>
                  {selectedTrader.ethAddress}
                </div>
              </div>
              <button className="tp-close" onClick={() => setSelectedTrader(null)}>✕</button>
            </div>

            {/* Stats */}
            <div className="tp-stats">
              <div className="tp-stat">
                <span className="tp-stat-label">Account Value</span>
                <span className="tp-stat-value">{fmtCompact(traderAcctValue)}</span>
              </div>
              {(() => {
                const perf = getPerf(selectedTrader);
                if (!perf) return null;
                const pnl = parseFloat(perf.pnl);
                const roi = parseFloat(perf.roi) * 100;
                return (
                  <>
                    <div className="tp-stat">
                      <span className="tp-stat-label">P&L ({WINDOWS.find(w => w.value === window)?.label})</span>
                      <span className={`tp-stat-value ${pnl >= 0 ? 'up' : 'down'}`}>
                        {pnl >= 0 ? '+' : ''}{fmtCompact(pnl)}
                      </span>
                    </div>
                    <div className="tp-stat">
                      <span className="tp-stat-label">ROI</span>
                      <span className={`tp-stat-value ${roi >= 0 ? 'up' : 'down'}`}>
                        {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                      </span>
                    </div>
                  </>
                );
              })()}
              <div className="tp-stat">
                <span className="tp-stat-label">Open Positions</span>
                <span className="tp-stat-value">{traderPositions.length}</span>
              </div>
            </div>

            {/* Positions */}
            <h3 style={{ margin: '16px 0 10px', fontSize: 15 }}>Live Positions</h3>
            {traderLoading ? (
              <div className="empty">Loading positions...</div>
            ) : traderPositions.length === 0 ? (
              <div className="empty">No open positions</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Side</th>
                    <th>Size</th>
                    <th>Entry Price</th>
                    <th>Liq. Price</th>
                    <th>Leverage</th>
                    <th>Unrealized P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {traderPositions.map((p) => {
                    const szi = parseFloat(p.szi);
                    const isLong = szi > 0;
                    const upnl = parseFloat(p.unrealizedPnl);
                    const entry = parseFloat(p.entryPx);
                    const lev = p.leverage?.value ?? 1;
                    const notional = Math.abs(szi) * entry;
                    const MMR = 0.005;
                    const liqPx = isLong
                      ? entry * (1 - 1 / lev + MMR)
                      : entry * (1 + 1 / lev - MMR);
                    const fmtPx = (n: number) => n >= 1 ? `$${n.toLocaleString('en', { maximumFractionDigits: 2 })}` : `$${n.toPrecision(4)}`;
                    return (
                      <tr key={p.coin}>
                        <td className="fw-600">{p.coin}/USD</td>
                        <td>
                          <span className={`badge ${isLong ? 'LONG' : 'SHORT'}`}>
                            {isLong ? 'LONG' : 'SHORT'}
                          </span>
                        </td>
                        <td className="mono">
                          {Math.abs(szi).toFixed(4)}
                          <span className="muted" style={{ marginLeft: 6 }}>({fmtCompact(notional)})</span>
                        </td>
                        <td className="mono">{fmtPx(entry)}</td>
                        <td className="mono down">{fmtPx(liqPx)}</td>
                        <td>
                          <span className="lev-badge">{lev}x</span>
                        </td>
                        <td className={`mono ${upnl >= 0 ? 'up' : 'down'}`} style={{ fontWeight: 600 }}>
                          {upnl >= 0 ? '+' : ''}{fmtCompact(upnl)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
