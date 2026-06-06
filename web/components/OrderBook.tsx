'use client';

import { useState, useEffect, useCallback } from 'react';

const BASE_URL = 'https://api.hyperliquid-testnet.xyz';

interface Level {
  px: string;
  sz: string;
  n: number;
}

interface Props {
  coin: string;
}

function fmtSz(sz: string): string {
  const n = parseFloat(sz);
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function fmtPx(px: string): string {
  const n = parseFloat(px);
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function fmtTotal(total: number): string {
  if (total >= 1000000) return (total / 1000000).toFixed(2) + 'M';
  if (total >= 1000) return (total / 1000).toFixed(1) + 'K';
  return total.toFixed(2);
}

const ROWS = 11;

export default function OrderBook({ coin }: Props) {
  const [bids, setBids] = useState<Level[]>([]);
  const [asks, setAsks] = useState<Level[]>([]);

  const fetch_ = useCallback(async () => {
    if (!coin) return;
    try {
      const r = await fetch(BASE_URL + '/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'l2Book', coin: coin.replace('/USD', '') }),
      });
      const d = await r.json();
      if (d.levels) {
        setBids(d.levels[0]?.slice(0, ROWS) ?? []);
        setAsks(d.levels[1]?.slice(0, ROWS) ?? []);
      }
    } catch {}
  }, [coin]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 1500);
    return () => clearInterval(id);
  }, [fetch_]);

  // Totals for depth bars
  let bidTotal = 0;
  const bidRows = bids.map((b) => {
    bidTotal += parseFloat(b.sz);
    return { ...b, total: bidTotal };
  });

  let askTotal = 0;
  const askRows = asks.map((a) => {
    askTotal += parseFloat(a.sz);
    return { ...a, total: askTotal };
  }).reverse();

  const maxTotal = Math.max(bidTotal, askTotal) || 1;

  const bestBid = bids[0] ? parseFloat(bids[0].px) : 0;
  const bestAsk = asks[0] ? parseFloat(asks[0].px) : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPct = bestAsk > 0 ? (spread / bestAsk) * 100 : 0;

  return (
    <div className="ob-panel panel">
      <div className="ob-title">Order Book</div>

      {/* Header */}
      <div className="ob-header">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      {/* Asks — reversed so lowest ask nearest spread */}
      <div className="ob-asks">
        {askRows.map((a, i) => (
          <div key={`a-${i}`} className="ob-row ask">
            <div className="ob-depth ask" style={{ width: `${(a.total / maxTotal) * 100}%` }} />
            <span className="ob-price mono down">{fmtPx(a.px)}</span>
            <span className="ob-size mono">{fmtSz(a.sz)}</span>
            <span className="ob-total mono">{fmtTotal(a.total)}</span>
          </div>
        ))}
      </div>

      {/* Spread row */}
      <div className="ob-spread">
        <span className="ob-mid mono">{bestBid > 0 ? fmtPx(bids[0].px) : '—'}</span>
        <span className="ob-spread-info">Spread {spread > 0 ? spread.toFixed(1) : '—'} ({spreadPct.toFixed(3)}%)</span>
      </div>

      {/* Bids */}
      <div className="ob-bids">
        {bidRows.map((b, i) => (
          <div key={`b-${i}`} className="ob-row bid">
            <div className="ob-depth bid" style={{ width: `${(b.total / maxTotal) * 100}%` }} />
            <span className="ob-price mono up">{fmtPx(b.px)}</span>
            <span className="ob-size mono">{fmtSz(b.sz)}</span>
            <span className="ob-total mono">{fmtTotal(b.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
