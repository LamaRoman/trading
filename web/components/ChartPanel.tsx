'use client';
import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  LineSeries,
  type Time,
} from 'lightweight-charts';
import { usePoll, confColor, fmtPct } from '../lib/api';
import type { Trade, AssetScore, ScoreRow } from '../lib/api';
import SignalBars from './SignalBars';
import TVChart from './TVChart';

const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000) as Time;

export default function ChartPanel({ symbol, row }: { symbol: string; row?: ScoreRow }) {
  const confRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refs = useRef<any>({});
  const [showReasons, setShowReasons] = useState(false);

  const trades = usePoll<Trade[]>('/api/trades?limit=200', 6000);
  const scores = usePoll<AssetScore[]>(
    symbol ? `/api/assets/${encodeURIComponent(symbol)}/scores?limit=300` : null,
    4000,
  );

  useEffect(() => {
    if (!confRef.current) return;
    const chart = createChart(confRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111722' },
        textColor: '#8b97a8',
      },
      grid: {
        vertLines: { color: '#161d2b' },
        horzLines: { color: '#161d2b' },
      },
      height: 100,
      width: confRef.current.clientWidth,
      timeScale: { borderColor: '#1f2937', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#1f2937' },
    });
    const confLine = chart.addSeries(LineSeries, {
      color: '#f0b90b',
      lineWidth: 2,
      priceLineVisible: false,
    });
    confLine.createPriceLine({
      price: 65,
      color: '#3b82f6',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'threshold',
    });
    refs.current = { chart, confLine };
    const onResize = () => {
      if (confRef.current) chart.applyOptions({ width: confRef.current.clientWidth });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      refs.current = {};
    };
  }, [symbol]);

  useEffect(() => {
    const r = refs.current;
    if (!r.confLine || !scores) return;
    const map = new Map<number, number>();
    for (const s of scores) map.set(Math.floor(new Date(s.createdAt).getTime() / 1000), s.confidence);
    const data = [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ time: t as Time, value: v }));
    r.confLine.setData(data);
    r.chart.timeScale().fitContent();
  }, [scores]);

  const symTrades = trades?.filter((t) => t.symbol === symbol) ?? [];
  const reasons = row?.reasons.filter((r) => !r.startsWith('sentiment:')) ?? [];

  return (
    <div className="panel">
      {/* Header: confidence + direction + breakdown */}
      <div className="chart-meta" style={{ marginBottom: 8 }}>
        <div>
          <div className="muted" style={{ fontSize: 11 }}>
            {symbol} · agent confidence
          </div>
          <div className="big-conf" style={{ color: row ? confColor(row.confidence) : '#fff' }}>
            {row ? `${row.confidence}%` : '—'}{' '}
            {row && <span className={`badge ${row.direction}`}>{row.direction}</span>}
          </div>
        </div>
        {row && (
          <div style={{ flex: 1, minWidth: 220 }}>
            <SignalBars
              technical={row.technical}
              sentiment={row.sentiment}
              whale={row.whale}
              momentum={row.momentum}
            />
          </div>
        )}
      </div>

      {/* TradingView chart */}
      <TVChart symbol={symbol} height={580} />

      {/* Confidence timeline — compact */}
      <div className="muted" style={{ fontSize: 10, margin: '8px 0 2px', letterSpacing: '.4px' }}>
        CONFIDENCE TIMELINE
      </div>
      <div ref={confRef} className="chart-host" />

      {/* Reasons as chips — collapsible */}
      {reasons.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div
            className="chip-toggle"
            onClick={() => setShowReasons((p) => !p)}
          >
            <span className="muted" style={{ fontSize: 10, letterSpacing: '.4px' }}>
              SIGNALS ({reasons.length})
            </span>
            <span className="muted" style={{ fontSize: 10 }}>{showReasons ? '▲' : '▼'}</span>
          </div>
          {showReasons ? (
            <ul className="reasons reasons-compact">
              {reasons.map((x, i) => (
                <li key={i} className={x.startsWith('⚑') ? 'flag' : ''}>{x}</li>
              ))}
            </ul>
          ) : (
            <div className="chip-wrap">
              {reasons.slice(0, 4).map((x, i) => (
                <span key={i} className={`reason-chip ${x.startsWith('⚑') ? 'flag' : ''}`}>
                  {x.length > 40 ? x.slice(0, 38) + '…' : x}
                </span>
              ))}
              {reasons.length > 4 && (
                <span className="reason-chip more">+{reasons.length - 4} more</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trade history — show max 3, link to History page */}
      {symTrades.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 10, letterSpacing: '.4px' }}>
              TRADES ON {symbol}
            </span>
            {symTrades.length > 3 && (
              <a href="/history" className="link-subtle">All trades →</a>
            )}
          </div>
          <table>
            <thead>
              <tr>
                <th>Dir</th>
                <th>Lev</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>Reason</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {symTrades.slice(0, 3).map((t) => (
                <tr key={t.id}>
                  <td><span className={`badge ${t.direction}`}>{t.direction}</span></td>
                  <td><span className="badge leverage">{t.leverage ?? 1}x</span></td>
                  <td className="mono">{t.entryPrice.toFixed(3)}</td>
                  <td className="mono">{t.exitPrice != null ? t.exitPrice.toFixed(3) : '—'}</td>
                  <td className="muted">{t.exitReason?.replace(/_/g, ' ') ?? 'open'}</td>
                  <td className={`mono ${(t.pnl ?? 0) >= 0 ? 'up' : 'down'}`}>
                    {t.pnl != null ? `$${t.pnl.toFixed(2)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
