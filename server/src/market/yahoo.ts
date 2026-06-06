import axios from 'axios';
import { prisma } from '../db';
import { Candle, MarketDataProvider, AssetRef } from '../types';
import { log } from '../logger';

/**
 * YahooProvider — real, live OHLCV from Yahoo Finance's chart API.
 * Free, no API key, covers crypto (`BTC-USD`, `ETH-USD`, …) and stocks.
 * This makes the agent's picks data-driven on actual market prices.
 */
const TF: Record<string, { interval: string; range: string }> = {
  '1m': { interval: '2m', range: '1d' }, // 1m is flaky on Yahoo; 2m is reliable
  '5m': { interval: '5m', range: '5d' },
  '15m': { interval: '15m', range: '1mo' },
  '1h': { interval: '60m', range: '3mo' },
  '1d': { interval: '1d', range: '1y' },
};

/** "BTC/USD" -> "BTC-USD" (Yahoo's format). */
function ySymbol(symbol: string): string {
  return symbol.replace('/', '-');
}

export class YahooProvider implements MarketDataProvider {
  name = 'yahoo';

  async tick(asset: AssetRef, timeframe = '5m', limit = 300): Promise<Candle[]> {
    const m = TF[timeframe] ?? TF['5m'];
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ySymbol(asset.symbol)}`;
    try {
      const res = await axios.get(url, {
        params: { interval: m.interval, range: m.range },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000,
      });
      const r = res.data?.chart?.result?.[0];
      if (!r || !r.timestamp) throw new Error('no data in Yahoo response');
      const ts: number[] = r.timestamp;
      const q = r.indicators.quote[0];

      const candles: Candle[] = [];
      for (let i = 0; i < ts.length; i++) {
        if (q.open[i] == null || q.close[i] == null) continue; // skip gaps
        candles.push({
          timestamp: new Date(ts[i] * 1000),
          open: q.open[i],
          high: q.high[i],
          low: q.low[i],
          close: q.close[i],
          volume: q.volume[i] ?? 0,
        });
      }

      if (candles.length) {
        await prisma.candle.createMany({
          data: candles.map((c) => ({ ...c, assetId: asset.id, timeframe })),
          skipDuplicates: true,
        });
      }
      return candles.slice(-limit);
    } catch (err: any) {
      log.error(`Yahoo fetch ${asset.symbol}:`, err?.response?.status ?? err?.message ?? err);
      // Fall back to whatever history we already stored.
      const stored = await prisma.candle.findMany({
        where: { assetId: asset.id, timeframe },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return stored.reverse().map((r) => ({
        timestamp: r.timestamp,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      }));
    }
  }
}
