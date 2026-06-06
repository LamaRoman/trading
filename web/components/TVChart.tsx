'use client';
import { useEffect, useRef, memo } from 'react';
import { SUPPORTED_COINS } from '../lib/coins';

function toTVSymbol(symbol: string): string {
  const base = symbol.split('/')[0];
  return `BINANCE:${base}USDT`;
}

// memo — only re-render when symbol/height changes, not on parent polls
function TVChart({ symbol, height = 660 }: { symbol: string; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const base = symbol.split('/')[0];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: toTVSymbol(symbol),
      interval: '15',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(17,23,34,1)',
      gridColor: 'rgba(31,41,55,1)',
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);

    return () => { container.innerHTML = ''; };
  }, [symbol]);

  return (
    <div style={{ height, width: '100%', position: 'relative', overflow: 'hidden' }}>
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: '100%', width: '100%', overflow: 'hidden' }}
      />
    </div>
  );
}

export default memo(TVChart);
