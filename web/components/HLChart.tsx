'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart, CandlestickSeries, HistogramSeries,
  ColorType, CrosshairMode, type Time, LineStyle,
} from 'lightweight-charts';

// Use mainnet for chart data — real prices for all coins
const BASE_URL = 'https://api.hyperliquid.xyz';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
type Interval = typeof INTERVALS[number];

interface HLCandle {
  t: number; T: number; o: string; h: string; l: string; c: string; v: string;
}

interface Props {
  coin: string;
  height?: number;
}

const DRAW_TOOLS = [
  { id: 'cursor',  label: '↖', title: 'Cursor' },
  { id: 'hline',   label: '—', title: 'Horizontal Line' },
  { id: 'vline',   label: '|', title: 'Vertical Line' },
];

export default function HLChart({ coin, height = 640 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const [timeframe, setTimeframe] = useState<Interval>('15m');
  const [ohlc, setOhlc] = useState<{ o: string; h: string; l: string; c: string } | null>(null);
  const [drawTool, setDrawTool] = useState<string>('cursor');

  const fetchCandles = useCallback(async (coin: string, tf: Interval) => {
    try {
      const startTime = Date.now() - lookbackMs(tf);
      const r = await fetch(BASE_URL + '/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval: tf, startTime } }),
      });
      const data: HLCandle[] = await r.json();
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }, []);

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111722' },
        textColor: '#8b97a8',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1a2234' },
        horzLines: { color: '#1a2234' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#4b5563', labelBackgroundColor: '#1e2d40' },
        horzLine: { color: '#4b5563', labelBackgroundColor: '#1e2d40' },
      },
      rightPriceScale: {
        borderColor: '#1f2937',
        textColor: '#8b97a8',
      },
      timeScale: {
        borderColor: '#1f2937',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      width: containerRef.current.clientWidth,
      height,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#0ecb81',
      downColor: '#f6465d',
      borderVisible: false,
      wickUpColor: '#0ecb81',
      wickDownColor: '#f6465d',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const onResize = () => {
      if (containerRef.current)
        chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', onResize);

    // Crosshair → OHLC display
    chart.subscribeCrosshairMove((param) => {
      if (param?.seriesData) {
        const d = param.seriesData.get(candleSeries) as any;
        if (d) setOhlc({
          o: d.open.toFixed(2), h: d.high.toFixed(2),
          l: d.low.toFixed(2), c: d.close.toFixed(2),
        });
      }
    });

    // Click to draw horizontal or vertical lines
    chart.subscribeClick((param) => {
      if (!param.point || !param.time) return;
      if (drawTool === 'hline') {
        const price = candleSeries.coordinateToPrice(param.point.y);
        if (price !== null) {
          candleSeries.createPriceLine({
            price,
            color: '#4b5563',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
          });
        }
      }
    });

    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [height]);

  // Load candles
  useEffect(() => {
    if (!candleSeriesRef.current || !coin) return;
    fetchCandles(coin, timeframe).then((data) => {
      if (!data.length) return;
      const candles = data.map((d) => ({
        time: Math.floor(d.t / 1000) as Time,
        open: parseFloat(d.o), high: parseFloat(d.h),
        low: parseFloat(d.l), close: parseFloat(d.c),
      }));
      const volumes = data.map((d) => ({
        time: Math.floor(d.t / 1000) as Time,
        value: parseFloat(d.v),
        color: parseFloat(d.c) >= parseFloat(d.o)
          ? 'rgba(14,203,129,0.25)' : 'rgba(246,70,93,0.25)',
      }));
      candleSeriesRef.current.setData(candles);
      volumeSeriesRef.current.setData(volumes);
      chartRef.current?.timeScale().fitContent();
      const last = data[data.length - 1];
      setOhlc({
        o: parseFloat(last.o).toFixed(2), h: parseFloat(last.h).toFixed(2),
        l: parseFloat(last.l).toFixed(2), c: parseFloat(last.c).toFixed(2),
      });
    });
  }, [coin, timeframe, fetchCandles]);

  // Poll updates
  useEffect(() => {
    if (!coin) return;
    const id = window.setInterval(async () => {
      const data = await fetchCandles(coin, timeframe);
      if (!data.length || !candleSeriesRef.current) return;
      const last = data[data.length - 1];
      candleSeriesRef.current.update({
        time: Math.floor(last.t / 1000) as Time,
        open: parseFloat(last.o), high: parseFloat(last.h),
        low: parseFloat(last.l), close: parseFloat(last.c),
      });
    }, 10000);
    return () => window.clearInterval(id);
  }, [coin, timeframe, fetchCandles]);

  const close = ohlc ? parseFloat(ohlc.c) : 0;
  const open  = ohlc ? parseFloat(ohlc.o) : 0;
  const isUp  = close >= open;

  return (
    <div className="hlc-wrap">
      {/* Left drawing toolbar */}
      <div className="hlc-drawbar">
        {DRAW_TOOLS.map((t) => (
          <button
            key={t.id}
            className={`hlc-draw-btn ${drawTool === t.id ? 'active' : ''}`}
            onClick={() => setDrawTool(t.id)}
            title={t.title}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart + toolbar column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top toolbar */}
        <div className="hlc-toolbar">
          <span className="hlc-symbol">{coin}/USD</span>
          <div className="hlc-intervals">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                className={`hlc-iv ${timeframe === iv ? 'active' : ''}`}
                onClick={() => setTimeframe(iv)}
              >
                {iv}
              </button>
            ))}
          </div>
          {ohlc && (
            <div className="hlc-ohlc">
              <span>O <strong>{ohlc.o}</strong></span>
              <span>H <strong className="up">{ohlc.h}</strong></span>
              <span>L <strong className="down">{ohlc.l}</strong></span>
              <span>C <strong style={{ color: isUp ? 'var(--green)' : 'var(--red)' }}>{ohlc.c}</strong></span>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          style={{ width: '100%', height, cursor: drawTool === 'cursor' ? 'default' : 'crosshair' }}
        />
      </div>
    </div>
  );
}

function lookbackMs(interval: Interval): number {
  const map: Record<Interval, number> = {
    '1m':  6  * 60 * 60 * 1000,
    '5m':  24 * 60 * 60 * 1000,
    '15m': 4  * 24 * 60 * 60 * 1000,
    '1h':  30 * 24 * 60 * 60 * 1000,
    '4h':  90 * 24 * 60 * 60 * 1000,
    '1d':  365 * 24 * 60 * 60 * 1000,
  };
  return map[interval];
}
