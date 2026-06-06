import { computeIndicators } from './indicators';
import { Candle, Dir } from '../types';

export type TFLabel = '5m' | '1h' | '1d';

export interface TFSignal {
  tf: TFLabel;
  direction: Dir;
  strength: number; // 0-100
  rsi: number;
  emaAlign: boolean; // price > ema21 > ema50
  macdBull: boolean;
}

export interface MTFResult {
  signals: TFSignal[];
  aligned: boolean;        // all active TFs agree on direction
  alignedDir: Dir;          // the agreed direction (or FLAT)
  alignmentScore: number;   // 0-100 (how strongly they agree)
  description: string;
}

function tfSignal(candles: Candle[], tf: TFLabel): TFSignal | null {
  const ind = computeIndicators(candles);
  if (!ind) return null;

  let strength = 50;
  if (ind.price > ind.ema9 && ind.ema9 > ind.ema21) strength += 15;
  else if (ind.price < ind.ema9 && ind.ema9 < ind.ema21) strength -= 15;
  if (ind.rsi < 35) strength += 10;
  else if (ind.rsi > 65) strength -= 10;
  if (ind.macdHist > 0) strength += 8;
  else if (ind.macdHist < 0) strength -= 8;
  strength += ind.ret20 > 0 ? Math.min(12, ind.ret20 * 200) : Math.max(-12, ind.ret20 * 200);

  strength = Math.max(0, Math.min(100, strength));
  const dir: Dir = strength >= 58 ? 'LONG' : strength <= 42 ? 'SHORT' : 'FLAT';

  return {
    tf,
    direction: dir,
    strength,
    rsi: ind.rsi,
    emaAlign: ind.price > ind.ema21 && ind.ema21 > ind.ema50,
    macdBull: ind.macdHist > 0,
  };
}

/**
 * Multi-timeframe analysis. The agent should only take high-confidence trades
 * when multiple timeframes agree. Disagreement = reduced confidence.
 *
 * Pass candle arrays per timeframe; missing ones are skipped gracefully.
 */
export function analyzeMultiTF(
  candles5m: Candle[],
  candles1h?: Candle[],
  candles1d?: Candle[],
): MTFResult {
  const signals: TFSignal[] = [];

  const s5 = tfSignal(candles5m, '5m');
  if (s5) signals.push(s5);

  if (candles1h && candles1h.length >= 60) {
    const s1h = tfSignal(candles1h, '1h');
    if (s1h) signals.push(s1h);
  }

  if (candles1d && candles1d.length >= 60) {
    const s1d = tfSignal(candles1d, '1d');
    if (s1d) signals.push(s1d);
  }

  // alignment check
  const active = signals.filter((s) => s.direction !== 'FLAT');
  const longs = active.filter((s) => s.direction === 'LONG').length;
  const shorts = active.filter((s) => s.direction === 'SHORT').length;

  let aligned = false;
  let alignedDir: Dir = 'FLAT';
  let alignmentScore = 50;

  if (active.length >= 2) {
    if (longs === active.length) {
      aligned = true;
      alignedDir = 'LONG';
      alignmentScore = Math.round(signals.reduce((a, s) => a + s.strength, 0) / signals.length);
    } else if (shorts === active.length) {
      aligned = true;
      alignedDir = 'SHORT';
      alignmentScore = Math.round(signals.reduce((a, s) => a + (100 - s.strength), 0) / signals.length);
    } else {
      // disagreement
      alignmentScore = 30; // penalize
    }
  } else if (active.length === 1) {
    alignedDir = active[0].direction;
    alignmentScore = 45; // single-tf signal is weaker
  }

  const tfSummary = signals.map((s) => `${s.tf}:${s.direction}`).join(' · ');
  const description = aligned
    ? `✓ ${signals.length}TF aligned ${alignedDir} (${tfSummary})`
    : `✗ TF conflict (${tfSummary}) — reduced confidence`;

  return { signals, aligned, alignedDir, alignmentScore, description };
}

/**
 * Confidence modifier from multi-TF alignment.
 * Aligned = boost, conflicting = penalty, single-TF = neutral.
 */
export function mtfConfidenceModifier(mtf: MTFResult): number {
  if (mtf.aligned && mtf.signals.length >= 2) return 1.12;  // aligned across TFs = conviction boost
  if (!mtf.aligned && mtf.signals.length >= 2) return 0.82;  // conflict = significant penalty
  return 1.0; // single TF or insufficient data
}
