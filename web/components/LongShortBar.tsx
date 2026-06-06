'use client';

import { useState, useEffect } from 'react';

interface AssetCtx {
  funding: string;
  openInterest: string;
  markPx: string;
  dayNtlVlm: string;
  prevDayPx: string;
}

interface Props {
  coin: string; // e.g. "BTC"
}

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function LongShortBar({ coin }: Props) {
  const [ctx, setCtx] = useState<AssetCtx | null>(null);
  const [coinName, setCoinName] = useState('');

  useEffect(() => {
    if (!coin) return;
    const base = coin.replace('/USD', '');

    async function load() {
      try {
        const r = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
        });
        const [meta, ctxs] = await r.json();
        const idx = meta.universe.findIndex((u: any) => u.name === base);
        if (idx >= 0) {
          setCtx(ctxs[idx]);
          setCoinName(meta.universe[idx].name);
        }
      } catch {}
    }

    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [coin]);

  if (!ctx) return null;

  const funding = parseFloat(ctx.funding);
  const oi = parseFloat(ctx.openInterest) * parseFloat(ctx.markPx);
  const volume24h = parseFloat(ctx.dayNtlVlm);
  const markPx = parseFloat(ctx.markPx);
  const prevPx = parseFloat(ctx.prevDayPx);
  const change24h = prevPx > 0 ? ((markPx - prevPx) / prevPx) * 100 : 0;

  // Derive long/short bias from funding rate
  // Negative funding → longs dominate (longs pay shorts)
  // Positive funding → shorts dominate (shorts pay longs)
  // Scale: funding of ±0.01% = ~50/50, ±0.1% = strong bias
  const fundingPct = funding * 100;
  const bias = Math.max(-1, Math.min(1, fundingPct / 0.05)); // normalize to -1..1
  // longPct: negative funding → more longs
  const longPct = Math.round(50 - bias * 30); // 20%-80% range
  const shortPct = 100 - longPct;

  const isLongBias = longPct > shortPct;

  return (
    <div className="ls-bar-wrap">
      {/* Long/Short ratio bar */}
      <div className="ls-bar-row">
        <span className="ls-label up">{longPct}% Long</span>
        <div className="ls-bar">
          <div className="ls-long" style={{ width: `${longPct}%` }} />
          <div className="ls-short" style={{ width: `${shortPct}%` }} />
        </div>
        <span className="ls-label down">{shortPct}% Short</span>
      </div>

      {/* Stats row */}
      <div className="ls-stats">
        <div className="ls-stat">
          <span className="ls-stat-label">Open Interest</span>
          <span className="ls-stat-value mono">{fmtNum(oi)}</span>
        </div>
        <div className="ls-stat">
          <span className="ls-stat-label">24h Volume</span>
          <span className="ls-stat-value mono">{fmtNum(volume24h)}</span>
        </div>
        <div className="ls-stat">
          <span className="ls-stat-label">Funding</span>
          <span className={`ls-stat-value mono ${funding < 0 ? 'down' : 'up'}`}>
            {funding >= 0 ? '+' : ''}{(funding * 100).toFixed(4)}%
          </span>
        </div>
        <div className="ls-stat">
          <span className="ls-stat-label">24h Change</span>
          <span className={`ls-stat-value mono ${change24h >= 0 ? 'up' : 'down'}`}>
            {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}
