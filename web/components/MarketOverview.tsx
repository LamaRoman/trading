'use client';

import { useState, useEffect } from 'react';

interface AssetRow {
  name: string;
  markPx: number;
  change24h: number;
  volume: number;
  oi: number;
  funding: number;
}

function fmtCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(n: number): string {
  if (n >= 1) return `$${n.toLocaleString('en', { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(6)}`;
}

export default function MarketOverview() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [sortBy, setSortBy] = useState<'volume' | 'change24h' | 'oi'>('volume');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
        });
        const [meta, ctxs] = await r.json();
        const rows: AssetRow[] = [];
        for (let i = 0; i < meta.universe.length; i++) {
          const ctx = ctxs[i];
          if (!ctx?.markPx || parseFloat(ctx.dayNtlVlm) === 0) continue;
          const mark = parseFloat(ctx.markPx);
          const prev = parseFloat(ctx.prevDayPx);
          rows.push({
            name: meta.universe[i].name,
            markPx: mark,
            change24h: prev > 0 ? ((mark - prev) / prev) * 100 : 0,
            volume: parseFloat(ctx.dayNtlVlm),
            oi: parseFloat(ctx.openInterest) * mark,
            funding: parseFloat(ctx.funding) * 100,
          });
        }
        setAssets(rows);
      } catch {}
      setLoading(false);
    }
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...assets]
    .sort((a, b) => Math.abs(b[sortBy]) - Math.abs(a[sortBy]))
    .slice(0, 20);

  // Top gainers and losers
  const gainers = [...assets].sort((a, b) => b.change24h - a.change24h).slice(0, 5);
  const losers = [...assets].sort((a, b) => a.change24h - b.change24h).slice(0, 5);

  // Total platform stats
  const totalVol = assets.reduce((s, a) => s + a.volume, 0);
  const totalOI = assets.reduce((s, a) => s + a.oi, 0);

  return (
    <div>
      {/* Platform stats */}
      <div className="mo-stats">
        <div className="mo-stat">
          <span className="mo-stat-value">{assets.length}</span>
          <span className="mo-stat-label">Markets</span>
        </div>
        <div className="mo-stat">
          <span className="mo-stat-value">{fmtCompact(totalVol)}</span>
          <span className="mo-stat-label">24h Volume</span>
        </div>
        <div className="mo-stat">
          <span className="mo-stat-value">{fmtCompact(totalOI)}</span>
          <span className="mo-stat-label">Open Interest</span>
        </div>
      </div>

      {/* Gainers / Losers */}
      <div className="mo-gl-grid">
        <div className="panel mo-gl-panel">
          <h3 className="mo-gl-title up">🔥 Top Gainers</h3>
          {gainers.map((a) => (
            <a key={a.name} href="/trade" className="mo-gl-row">
              <span className="fw-600">{a.name}</span>
              <span className="mono">{fmtPrice(a.markPx)}</span>
              <span className="mono up">+{a.change24h.toFixed(2)}%</span>
            </a>
          ))}
        </div>
        <div className="panel mo-gl-panel">
          <h3 className="mo-gl-title down">📉 Top Losers</h3>
          {losers.map((a) => (
            <a key={a.name} href="/trade" className="mo-gl-row">
              <span className="fw-600">{a.name}</span>
              <span className="mono">{fmtPrice(a.markPx)}</span>
              <span className="mono down">{a.change24h.toFixed(2)}%</span>
            </a>
          ))}
        </div>
      </div>

      {/* Full market table */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Markets</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['volume', 'change24h', 'oi'] as const).map((s) => (
              <button
                key={s}
                className={`lev-btn ${sortBy === s ? 'active' : ''}`}
                onClick={() => setSortBy(s)}
              >
                {s === 'volume' ? 'Volume' : s === 'change24h' ? '24h Change' : 'Open Interest'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="empty">Loading markets...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Market</th>
                <th>Price</th>
                <th>24h Change</th>
                <th>24h Volume</th>
                <th>Open Interest</th>
                <th>Funding</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a, i) => (
                <tr key={a.name}>
                  <td className="muted">{i + 1}</td>
                  <td className="fw-600">{a.name}/USD</td>
                  <td className="mono">{fmtPrice(a.markPx)}</td>
                  <td className={`mono ${a.change24h >= 0 ? 'up' : 'down'}`}>
                    {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(2)}%
                  </td>
                  <td className="mono">{fmtCompact(a.volume)}</td>
                  <td className="mono">{fmtCompact(a.oi)}</td>
                  <td className={`mono ${a.funding >= 0 ? 'up' : 'down'}`}>
                    {a.funding >= 0 ? '+' : ''}{a.funding.toFixed(4)}%
                  </td>
                  <td>
                    <a href="/trade" className="btn" style={{ padding: '4px 12px', fontSize: 13 }}>Trade</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
