import { RegimeResult } from './regime';

/**
 * Decide how many seconds until the next cycle based on the most
 * "urgent" regime across all scored assets.
 *
 * strong trend  → 15s  (market moving fast, need to act quickly)
 * normal trend  → 20s
 * squeeze       → 20s  (breakout imminent, watch closely)
 * volatile chop → 45s  (dangerous, don't over-trade)
 * ranging       → 90s  (nothing happening, conserve resources)
 * unknown       → 30s  (default)
 */
export function decideCycleTime(
  regimes: RegimeResult[],
  minSeconds: number,
  maxSeconds: number,
): { seconds: number; reason: string } {
  if (!regimes.length) return { seconds: 30, reason: 'no regime data → default 30s' };

  // Pick the most "urgent" regime across all assets
  let urgent = regimes[0];
  for (const r of regimes) {
    if (urgencyScore(r) > urgencyScore(urgent)) urgent = r;
  }

  let seconds: number;
  let reason: string;

  switch (urgent.regime) {
    case 'strong-trend-up':
    case 'strong-trend-down':
      seconds = 15;
      reason = `strong trend (ADX ${urgent.adx.toFixed(0)}) → 15s`;
      break;
    case 'trend-up':
    case 'trend-down':
      seconds = 20;
      reason = `trend (ADX ${urgent.adx.toFixed(0)}) → 20s`;
      break;
    case 'squeeze':
      seconds = 20;
      reason = 'squeeze (breakout imminent) → 20s';
      break;
    case 'volatile-chop':
      seconds = 45;
      reason = 'volatile chop → 45s';
      break;
    case 'ranging':
      seconds = 90;
      reason = 'ranging market → 90s';
      break;
    default:
      seconds = 30;
      reason = 'unknown regime → 30s';
  }

  // Clamp to config limits
  seconds = Math.max(minSeconds, Math.min(maxSeconds, seconds));
  return { seconds, reason };
}

function urgencyScore(r: RegimeResult): number {
  switch (r.regime) {
    case 'strong-trend-up':
    case 'strong-trend-down': return 5;
    case 'squeeze':           return 4;
    case 'trend-up':
    case 'trend-down':        return 3;
    case 'volatile-chop':     return 2;
    case 'ranging':           return 1;
    default:                  return 0;
  }
}
