'use client';

import { useState, useEffect } from 'react';

interface Props {
  coin: string; // e.g. "BTC" or "BTC/USD"
  onChangeCoin?: () => void;
}

function fmtCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(2)}`;
}

export default function MarketInfoBar({ coin, onChangeCoin }: Props) {
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

  const base = coin.replace('/USD', '');
  const mark = parseFloat(data.markPx);
  const oracle = parseFloat(data.oraclePx);
  const prev = parseFloat(data.prevDayPx);
  const change = prev > 0 ? ((mark - prev) / prev) * 100 : 0;
  const volume = parseFloat(data.dayNtlVlm);
  const oi = parseFloat(data.openInterest) * mark;
  const funding = parseFloat(data.funding) * 100;

  // Long/short from funding
  const bias = Math.max(-1, Math.min(1, funding / 0.05));
  const longPct = Math.round(50 - bias * 30);
  const shortPct = 100 - longPct;

  return (
    <div className="mib-wrap">
      {/* Top row: coin + stats */}
      <div className="mib-top">
        <div className="mib-coin" onClick={onChangeCoin} style={onChangeCoin ? { cursor: 'pointer' } : undefined}>
          <div className="mib-avatar">{base.slice(0, 2)}</div>
          <div className="mib-coin-info">
            <div className="mib-name">{base}-USD <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>▾</span></div>
            <span className="mib-lev">{maxLev}x</span>
          </div>
          <div className="mib-price-block">
            <span className={`mib-mark-price ${change >= 0 ? 'up' : 'down'}`}>
              {mark >= 1 ? `$${mark.toLocaleString('en', { maximumFractionDigits: 2 })}` : `$${mark.toFixed(6)}`}
            </span>
            <span className={`mib-change ${change >= 0 ? 'up' : 'down'}`}>
              {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="mib-stats">
          <div className="mib-stat">
            <span className="mib-label">Oracle</span>
            <span className="mib-value mono">{oracle >= 1 ? oracle.toLocaleString('en', { maximumFractionDigits: 0 }) : oracle.toFixed(6)}</span>
          </div>
          <div className="mib-stat">
            <span className="mib-label">24h Volume</span>
            <span className="mib-value mono">{fmtCompact(volume)}</span>
          </div>
          <div className="mib-stat">
            <span className="mib-label">Open Interest</span>
            <span className="mib-value mono">{fmtCompact(oi)}</span>
          </div>
          <div className="mib-stat">
            <span className="mib-label">Funding / 8h</span>
            <span className={`mib-value mono ${funding >= 0 ? 'up' : 'down'}`}>
              {funding >= 0 ? '+' : ''}{funding.toFixed(4)}%
            </span>
          </div>
        </div>
      </div>

      {/* Bottom row: long/short bar */}
      <div className="mib-ls">
        <span className="mib-ls-label up">{longPct}% Long</span>
        <div className="mib-ls-bar">
          <div className="mib-ls-long" style={{ width: `${longPct}%` }} />
          <div className="mib-ls-short" style={{ width: `${shortPct}%` }} />
        </div>
        <span className="mib-ls-label down">{shortPct}% Short</span>
      </div>
    </div>
  );
}
