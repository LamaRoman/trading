'use client';
import { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries, type Time } from 'lightweight-charts';
import { usePoll } from '../lib/api';

interface Snap {
  equity: number;
  createdAt: string;
}

export default function EquityCurve() {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refs = useRef<any>({});
  const snaps = usePoll<Snap[]>('/api/equity?limit=800', 5000);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: { background: { type: ColorType.Solid, color: '#111722' }, textColor: '#8b97a8' },
      grid: { vertLines: { color: '#161d2b' }, horzLines: { color: '#161d2b' } },
      height: 200,
      width: ref.current.clientWidth,
      timeScale: { borderColor: '#1f2937', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#1f2937' },
    });
    const area = chart.addSeries(AreaSeries, {
      lineColor: '#16c784',
      topColor: 'rgba(22,199,132,.3)',
      bottomColor: 'rgba(22,199,132,0)',
      lineWidth: 2,
    });
    refs.current = { chart, area };
    const onResize = () => ref.current && chart.applyOptions({ width: ref.current.clientWidth });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const r = refs.current;
    if (!r.area || !snaps) return;
    // dedupe by second (keep last) and sort ascending — lightweight-charts
    // requires strictly increasing, unique timestamps.
    const map = new Map<number, number>();
    for (const s of snaps) map.set(Math.floor(new Date(s.createdAt).getTime() / 1000), s.equity);
    const data = [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, v]) => ({ time: t as Time, value: v }));
    r.area.setData(data);
    r.chart.timeScale().fitContent();
  }, [snaps]);

  return <div ref={ref} className="chart-host" />;
}
