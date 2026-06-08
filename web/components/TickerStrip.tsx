'use client';

import { useState, useEffect } from 'react';

interface CoinCtx {
  name: string;
  markPx: string;
  prevDayPx: string;
  dayNtlVlm: string;
}

const TOP_COINS = ['BTC', 'ETH', 'SOL', 'DOGE', 'HYPE', 'AVAX', 'SUI', 'PEPE', 'ARB', 'OP', 'WIF', 'LINK'];

export default function TickerStrip() {
  const [coins, setCoins] = useState<CoinCtx[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
        });
        const [meta, ctxs] = await r.json();
        const result: CoinCtx[] = [];
        for (const name of TOP_COINS) {
          const idx = meta.universe.findIndex((u: any) => u.name === name);
          if (idx >= 0 && ctxs[idx]?.markPx) {
            result.push({ name, ...ctxs[idx] });
          }
        }
        setCoins(result);
      } catch {}
    }
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  if (!coins.length) return null;

  return (
    <div className="ticker-strip">
      <div className="ticker-track">
        {coins.map((c) => {
          const mark = parseFloat(c.markPx);
          const prev = parseFloat(c.prevDayPx);
          const change = prev > 0 ? ((mark - prev) / prev) * 100 : 0;
          const isUp = change >= 0;
          return (
            <a key={c.name} href="/trade" className="ticker-item">
              <span className="ticker-coin">{c.name}</span>
              <span className="ticker-px mono">{mark >= 1 ? `$${mark.toLocaleString('en', { maximumFractionDigits: 2 })}` : `$${mark.toFixed(6)}`}</span>
              <span className={`ticker-chg mono ${isUp ? 'up' : 'down'}`}>
                {isUp ? '+' : ''}{change.toFixed(2)}%
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
