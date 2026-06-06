import axios from 'axios';
import { prisma } from '../db';
import { config } from '../config';
import { Candle, MarketDataProvider, AssetRef } from '../types';
import { log } from '../logger';

/**
 * AlpacaProvider — real crypto bars from Alpaca's market data API.
 * Activated by setting DATA_PROVIDER=alpaca and providing API keys.
 * Phase 1 implements bar fetching; live streaming + order routing come later.
 */
const TF_MAP: Record<string, string> = {
  '1m': '1Min',
  '5m': '5Min',
  '15m': '15Min',
  '1h': '1Hour',
  '4h': '4Hour',
  '1d': '1Day',
};

export class AlpacaProvider implements MarketDataProvider {
  name = 'alpaca';

  async tick(asset: AssetRef, timeframe = '1m', limit = 250): Promise<Candle[]> {
    if (!config.alpaca.keyId || !config.alpaca.secretKey) {
      throw new Error(
        'DATA_PROVIDER=alpaca but ALPACA_KEY_ID / ALPACA_SECRET_KEY are not set in server/.env',
      );
    }
    const tf = TF_MAP[timeframe] ?? '1Min';
    // Alpaca crypto bars endpoint (v1beta3).
    const url = `${config.alpaca.dataUrl}/v1beta3/crypto/us/bars`;
    try {
      const res = await axios.get(url, {
        params: { symbols: asset.symbol, timeframe: tf, limit },
        headers: {
          'APCA-API-KEY-ID': config.alpaca.keyId,
          'APCA-API-SECRET-KEY': config.alpaca.secretKey,
        },
      });
      const bars = res.data?.bars?.[asset.symbol] ?? [];
      const candles: Candle[] = bars.map((b: any) => ({
        timestamp: new Date(b.t),
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      }));

      // Persist for charts/history (idempotent on the unique key).
      if (candles.length) {
        await prisma.candle.createMany({
          data: candles.map((c) => ({ ...c, assetId: asset.id, timeframe })),
          skipDuplicates: true,
        });
      }
      return candles;
    } catch (err: any) {
      log.error(`Alpaca fetch failed for ${asset.symbol}:`, err?.message ?? err);
      throw err;
    }
  }
}
