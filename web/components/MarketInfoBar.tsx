'use client';

import { useState, useEffect } from 'react';

interface Props {
  coin: string; // e.g. "BTC"
}

function fmtCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(2)}`;
}

export default function MarketInfoBar({ coin }: Props) {
  const [data, setData] = useState<any>(null);
  const [maxLev, setMaxLev] = useState(0);

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
          setData(ctxs[idx]);
          setMaxLev(meta.universe[idx].maxLeverage);
        }
      } catch {}
    }
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [coin]);

  if (!data) return null;

  const mark = parseFloat(data.markPx);
  const oracle = parseFloat(data.oraclePx);
  const prev = parseFloat(data.prevDayPx);
  const change = prev > 0 ? ((mark - prev) / prev) * 100 : 0;
  const volume = parseFloat(data.dayNtlVlm);
  const oi = parseFloat(data.openInterest) * mark;
  const funding = parseFloat(data.funding) * 100;
  const base = coin.replace('/USD', '');

  return (
    <div className="mib">
      {/* Coin name + leverage badge */}
      <div className="mib-coin">
        <div className="mib-avatar">{base.slice(0, 2)}</div>
        <span className="mib-name">{base}-USD</span>
        {maxLev > 0 && <span className="mib-lev">{maxLev}x</span>}
      </div>

      <div className="mib-sep" />

      {/* Mark price */}
      <div className="mib-stat">
        <span className="mib-label">Mark</span>
        <span className={`mib-value mono ${change >= 0 ? 'up' : 'down'}`}>
          {mark >= 1 ? `$${mark.toLocaleString('en', { maximumFractionDigits: 2 })}` : `$${mark.toFixed(6)}`}
        </span>
      </div>

      {/* Oracle */}
      <div className="mib-stat">
        <span className="mib-label">Oracle</span>
        <span className="mib-value mono">
          {oracle >= 1 ? oracle.toLocaleString('en', { maximumFractionDigits: 0 }) : oracle.toFixed(6)}
        </span>
      </div>

      {/* 24h change */}
      <div className="mib-stat">
        <span className="mib-label">24h Change</span>
        <span className={`mib-value mono ${change >= 0 ? 'up' : 'down'}`}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>

      {/* 24h Volume */}
      <div className="mib-stat">
        <span className="mib-label">24h Volume</span>
        <span className="mib-value mono">{fmtCompact(volume)}</span>
      </div>

      {/* Open Interest */}
      <div className="mib-stat">
        <span className="mib-label">Open Interest</span>
        <span className="mib-value mono">{fmtCompact(oi)}</span>
      </div>

      {/* Funding */}
      <div className="mib-stat">
        <span className="mib-label">Funding</span>
        <span className={`mib-value mono ${funding >= 0 ? 'up' : 'down'}`}>
          {funding >= 0 ? '+' : ''}{funding.toFixed(4)}%
        </span>
      </div>
    </div>
  );
}
