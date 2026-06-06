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

  useEffect(() => {
    setLoading(true);
    fetch('https://stats-data.hyperliquid.xyz/Mainnet/leaderboard')
      .then((r) => r.json())
      .then((d) => setRows(d.leaderboardRows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function getPerf(row: LeaderboardRow): WindowPerf | null {
    const entry = row.windowPerformances.find(([w]) => w === window);
    return entry ? entry[1] : null;
  }

  const sorted = [...rows]
    .map((r) => ({ row: r, perf: getPerf(r) }))
    .filter((x) => x.perf && parseFloat(x.perf.pnl) !== 0)
    .sort((a, b) => {
      const av = parseFloat(a.perf![sortBy]);
      const bv = parseFloat(b.perf![sortBy]);
      return sortBy === 'roi' ? bv - av : bv - av;
    })
    .slice(0, 25);

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Top Traders</h2>
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
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => setSortBy('pnl')}
              >
                P&L {sortBy === 'pnl' ? '▼' : ''}
              </th>
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => setSortBy('roi')}
              >
                ROI {sortBy === 'roi' ? '▼' : ''}
              </th>
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => setSortBy('vlm')}
              >
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
                <tr key={row.ethAddress}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <span className="mono" style={{ fontSize: 12 }}>
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
    </div>
  );
}
