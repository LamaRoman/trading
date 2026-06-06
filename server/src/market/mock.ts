import { prisma } from '../db';
import { Candle, MarketDataProvider, AssetRef } from '../types';

/**
 * MockProvider — generates realistic synthetic OHLCV so the whole system runs
 * with zero API keys. Uses a regime-switching random walk (bull / bear / range)
 * with occasional "shock" bars (whale pump/dump) to give the whale & extreme
 * detectors something real to find later.
 *
 * Time is simulated: each tick() advances the series by exactly one bar, so the
 * agent can run fast without colliding on real-clock timestamps.
 */

type Regime = 'bull' | 'bear' | 'range';

interface RegimeParams {
  drift: number;
  vol: number;
}

const REGIME: Record<Regime, RegimeParams> = {
  bull: { drift: 0.0009, vol: 0.004 },
  bear: { drift: -0.0009, vol: 0.0045 },
  range: { drift: 0.0, vol: 0.0035 },
};

const TF_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

// Reasonable starting prices so charts look familiar.
const BASE_PRICE: Record<string, number> = {
  'BTC/USD': 62000,
  'ETH/USD': 3100,
  'SOL/USD': 155,
  'AVAX/USD': 38,
  'LINK/USD': 17,
  'XRP/USD': 0.52,
  'ADA/USD': 0.45,
  'DOGE/USD': 0.16,
};

interface AssetState {
  regime: Regime;
  barsLeft: number;
}

function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pickRegime(): Regime {
  // Symmetric bull/bear so prices mean-revert rather than balloon over time.
  const r = Math.random();
  if (r < 0.36) return 'bull';
  if (r < 0.72) return 'bear';
  return 'range';
}

function basePrice(symbol: string): number {
  if (BASE_PRICE[symbol]) return BASE_PRICE[symbol];
  // derive a stable pseudo-price from the symbol for unknown assets
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return 1 + (h % 5000) / 10;
}

export class MockProvider implements MarketDataProvider {
  name = 'mock';
  private state = new Map<number, AssetState>();

  private regimeFor(assetId: number): AssetState {
    let s = this.state.get(assetId);
    if (!s || s.barsLeft <= 0) {
      s = { regime: pickRegime(), barsLeft: 20 + Math.floor(Math.random() * 40) };
      this.state.set(assetId, s);
    }
    return s;
  }

  /** Build one candle following `prevClose` under the asset's current regime. */
  private nextCandle(
    assetId: number,
    symbol: string,
    prevClose: number,
    timestamp: Date,
  ): Candle {
    const st = this.regimeFor(assetId);
    st.barsLeft -= 1;
    const { drift, vol } = REGIME[st.regime];

    let ret = drift + randn() * vol;

    // ~2% chance of a whale shock bar: a sharp move with a volume spike.
    let volumeMult = 1;
    if (Math.random() < 0.02) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      ret += dir * (0.02 + Math.random() * 0.05); // 2-7% sudden move
      volumeMult = 4 + Math.random() * 6;
    }

    const open = prevClose;
    const close = Math.max(1e-6, prevClose * (1 + ret));
    const hi = Math.max(open, close) * (1 + Math.abs(randn()) * vol * 0.6);
    const lo = Math.min(open, close) * (1 - Math.abs(randn()) * vol * 0.6);
    const baseVol = basePrice(symbol) > 100 ? 50 : 50000;
    const volume = baseVol * (0.6 + Math.abs(randn()) * 0.8) * volumeMult;

    return { timestamp, open, high: hi, low: lo, close, volume };
  }

  async tick(asset: AssetRef, timeframe = '1m', limit = 250): Promise<Candle[]> {
    const intervalSec = TF_SECONDS[timeframe] ?? 60;
    const intervalMs = intervalSec * 1000;
    const minBars = Math.max(limit, 300);

    const count = await prisma.candle.count({
      where: { assetId: asset.id, timeframe },
    });

    if (count === 0) {
      // Backfill `minBars` candles ending at "now", aligned to the interval.
      const now = Date.now();
      const start = now - minBars * intervalMs;
      let prevClose = basePrice(asset.symbol);
      const rows: Candle[] = [];
      for (let i = 0; i < minBars; i++) {
        const tsMs = start + i * intervalMs;
        const c = this.nextCandle(asset.id, asset.symbol, prevClose, new Date(tsMs));
        rows.push(c);
        prevClose = c.close;
      }
      await prisma.candle.createMany({
        data: rows.map((c) => ({ ...c, assetId: asset.id, timeframe })),
        skipDuplicates: true,
      });
    } else {
      // Append exactly one new bar after the latest.
      const last = await prisma.candle.findFirst({
        where: { assetId: asset.id, timeframe },
        orderBy: { timestamp: 'desc' },
      });
      if (last) {
        const next = this.nextCandle(
          asset.id,
          asset.symbol,
          last.close,
          new Date(last.timestamp.getTime() + intervalMs),
        );
        await prisma.candle.create({
          data: { ...next, assetId: asset.id, timeframe },
        });
      }
    }

    const rows = await prisma.candle.findMany({
      where: { assetId: asset.id, timeframe },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return rows.reverse().map((r) => ({
      timestamp: r.timestamp,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));
  }
}
