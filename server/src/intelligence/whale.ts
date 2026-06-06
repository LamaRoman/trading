import { Candle } from '../types';

export interface WhaleAlert {
  type: 'accumulation' | 'distribution' | 'pump' | 'dump' | 'stop_hunt' | 'wash_suspect';
  severity: number; // 0..100
  description: string;
  barIndex: number;
}

export interface WhaleResult {
  score: number;       // 0..100 (50 neutral — >50 buying, <50 selling pressure)
  alerts: WhaleAlert[];
  reasons: string[];
  signals: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
const std = (arr: number[], m: number) => Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length || 1));

/**
 * Deep whale & manipulation analysis on OHLCV candles.
 * Much richer than the Phase 1 "volume spike" proxy.
 */
export function analyzeWhales(candles: Candle[]): WhaleResult {
  if (candles.length < 40) {
    return { score: 50, alerts: [], reasons: ['not enough bars for whale analysis'], signals: [] };
  }

  const alerts: WhaleAlert[] = [];
  const reasons: string[] = [];
  const signals: string[] = [];
  let score = 50;

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const lookback = candles.slice(-30);

  // 1) VOLUME PROFILE: accumulation vs distribution (Williams AD proxy)
  let ad = 0;
  for (const c of lookback) {
    const range = c.high - c.low;
    if (range > 0) {
      const clv = ((c.close - c.low) - (c.high - c.close)) / range; // -1..+1
      ad += clv * c.volume;
    }
  }
  const adNorm = ad / (mean(volumes.slice(-30)) * 30 || 1); // normalize
  if (adNorm > 0.3) {
    score += clamp(adNorm * 20, 0, 18);
    reasons.push(`accumulation detected (AD: ${adNorm.toFixed(2)}) — whales buying`);
    signals.push('whale_accumulation');
  } else if (adNorm < -0.3) {
    score -= clamp(Math.abs(adNorm) * 20, 0, 18);
    reasons.push(`distribution detected (AD: ${adNorm.toFixed(2)}) — whales selling`);
    signals.push('whale_distribution');
  }

  // 2) LARGE CANDLE DETECTION (outlier bars = institutional activity)
  const retAbs = lookback.map((c) => Math.abs(c.close / c.open - 1));
  const retMean = mean(retAbs);
  const retStd = std(retAbs, retMean);
  const volMean = mean(volumes.slice(-30));
  const volStd = std(volumes.slice(-30), volMean);

  for (let i = lookback.length - 5; i < lookback.length; i++) {
    const c = lookback[i];
    const ret = Math.abs(c.close / c.open - 1);
    const volZ = (c.volume - volMean) / (volStd || 1);
    const retZ = (ret - retMean) / (retStd || 1);
    if (volZ > 2.5 && retZ > 1.5) {
      const dir = c.close > c.open ? 'buying' : 'selling';
      alerts.push({
        type: c.close > c.open ? 'accumulation' : 'distribution',
        severity: Math.min(90, Math.round(volZ * 20)),
        description: `large institutional ${dir} bar (vol ${volZ.toFixed(1)}σ, move ${retZ.toFixed(1)}σ)`,
        barIndex: candles.length - lookback.length + i,
      });
    }
  }

  // 3) PUMP & DUMP DETECTION
  // pump: sharp rise (>3%) on high volume in last 10 bars followed by reversal
  const recent10 = candles.slice(-10);
  for (let i = 0; i < recent10.length - 2; i++) {
    const c = recent10[i];
    const ret = c.close / c.open - 1;
    const vol = c.volume / (volMean || 1);
    if (ret > 0.03 && vol > 2) {
      // check if it reversed within 3 bars
      const after = recent10.slice(i + 1, i + 4);
      const reversal = after.some((a) => a.close / a.open - 1 < -0.02);
      if (reversal) {
        alerts.push({
          type: 'pump',
          severity: 80,
          description: `pump & dump pattern: +${(ret * 100).toFixed(1)}% spike on ${vol.toFixed(1)}x volume then reversal`,
          barIndex: candles.length - 10 + i,
        });
        score -= 12;
        signals.push('pump_dump');
        reasons.push('⚠️ pump & dump pattern detected — caution');
      }
    }
    if (ret < -0.03 && vol > 2) {
      const after = recent10.slice(i + 1, i + 4);
      const bounce = after.some((a) => a.close / a.open - 1 > 0.02);
      if (bounce) {
        alerts.push({
          type: 'dump',
          severity: 75,
          description: `dump & bounce: ${(ret * 100).toFixed(1)}% drop on ${vol.toFixed(1)}x volume then recovery`,
          barIndex: candles.length - 10 + i,
        });
      }
    }
  }

  // 4) STOP-HUNT DETECTION (long wick through support/resistance then close back)
  const last5 = candles.slice(-5);
  for (const c of last5) {
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range > 0 && body / range < 0.25) {
      // tall wick, tiny body = possible stop hunt
      const lowerWick = Math.min(c.open, c.close) - c.low;
      const upperWick = c.high - Math.max(c.open, c.close);
      if (lowerWick / range > 0.6) {
        alerts.push({
          type: 'stop_hunt',
          severity: 60,
          description: 'long lower wick — possible stop-hunt below support',
          barIndex: candles.indexOf(c),
        });
        score += 5; // stop hunts below often precede bounces
        signals.push('stop_hunt_low');
        reasons.push('stop-hunt wick below support detected — potential bounce');
      }
      if (upperWick / range > 0.6) {
        alerts.push({
          type: 'stop_hunt',
          severity: 60,
          description: 'long upper wick — possible stop-hunt above resistance',
          barIndex: candles.indexOf(c),
        });
        score -= 5;
        signals.push('stop_hunt_high');
        reasons.push('stop-hunt wick above resistance detected — potential rejection');
      }
    }
  }

  // 5) WASH TRADING SUSPECT (unusually high volume with no price movement)
  const last3 = candles.slice(-3);
  for (const c of last3) {
    const ret = Math.abs(c.close / c.open - 1);
    const vol = c.volume / (volMean || 1);
    if (vol > 3 && ret < 0.002) {
      alerts.push({
        type: 'wash_suspect',
        severity: 40,
        description: `wash trading suspect: ${vol.toFixed(1)}x volume with only ${(ret * 100).toFixed(3)}% move`,
        barIndex: candles.indexOf(c),
      });
      reasons.push('⚠️ wash trading suspected — volume without price impact');
    }
  }

  if (!reasons.length) reasons.push('no unusual whale activity');

  return { score: clamp(score, 0, 100), alerts, reasons, signals };
}
