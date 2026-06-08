'use client';

import { useState, useEffect } from 'react';
import LongShortBar from '../../components/LongShortBar';

const TOP_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'HYPE', 'AVAX', 'SUI', 'PEPE', 'ARB', 'OP', 'WIF', 'LINK', 'NEAR', 'APT', 'INJ'];

interface FundingRow {
  name: string;
  funding: number;
  oi: number;
  volume: number;
  mark: number;
  change: number;
}

function fmtCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(2)}`;
}

export default function IntelligencePage() {
  const [sel, setSel] = useState('BTC');
  const [fundingData, setFundingData] = useState<FundingRow[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
        });
        const [meta, ctxs] = await r.json();
        const rows: FundingRow[] = [];
        for (const coin of TOP_COINS) {
          const idx = meta.universe.findIndex((u: any) => u.name === coin);
          if (idx < 0 || !ctxs[idx]?.markPx) continue;
          const ctx = ctxs[idx];
          const mark = parseFloat(ctx.markPx);
          const prev = parseFloat(ctx.prevDayPx);
          rows.push({
            name: coin,
            funding: parseFloat(ctx.funding) * 100,
            oi: parseFloat(ctx.openInterest) * mark,
            volume: parseFloat(ctx.dayNtlVlm),
            mark,
            change: prev > 0 ? ((mark - prev) / prev) * 100 : 0,
          });
        }
        setFundingData(rows);
      } catch {}
    }
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* Coin selector */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Market Intelligence</h2>
        <p className="muted" style={{ margin: '6px 0 12px', fontSize: 14 }}>
          Live funding rates, open interest, and long/short sentiment from Hyperliquid mainnet.
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TOP_COINS.map((s) => (
            <button
              key={s}
              className={`lev-btn ${sel === s ? 'active' : ''}`}
              onClick={() => setSel(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Long/Short bar for selected coin */}
      <LongShortBar coin={sel} />

      {/* Funding rate comparison table */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Funding Rate Comparison</h2>
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th>Funding (8h)</th>
              <th>24h Change</th>
              <th>Open Interest</th>
              <th>24h Volume</th>
              <th>Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {fundingData.map((r) => {
              const sentiment = r.funding < -0.005 ? 'Bullish' : r.funding > 0.005 ? 'Bearish' : 'Neutral';
              const sentCls = sentiment === 'Bullish' ? 'up' : sentiment === 'Bearish' ? 'down' : 'muted';
              return (
                <tr key={r.name} style={{ cursor: 'pointer' }} onClick={() => setSel(r.name)}>
                  <td className="fw-600">{r.name}/USD</td>
                  <td className={`mono ${r.funding >= 0 ? 'up' : 'down'}`}>
                    {r.funding >= 0 ? '+' : ''}{r.funding.toFixed(4)}%
                  </td>
                  <td className={`mono ${r.change >= 0 ? 'up' : 'down'}`}>
                    {r.change >= 0 ? '+' : ''}{r.change.toFixed(2)}%
                  </td>
                  <td className="mono">{fmtCompact(r.oi)}</td>
                  <td className="mono">{fmtCompact(r.volume)}</td>
                  <td className={sentCls} style={{ fontWeight: 600 }}>{sentiment}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
