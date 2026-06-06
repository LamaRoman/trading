import { RegimeResult } from './regime';
import { MTFResult } from './multitf';

interface Lesson { category: string; severity: number; active: boolean }

export interface LeverageDecision {
  leverage: number;
  reasons: string[];
}

/**
 * Dynamically decide leverage for a trade based on:
 *   1. Confidence — higher conviction → more leverage
 *   2. Regime — strong trend → more, choppy → less
 *   3. MTF alignment — aligned timeframes → more
 *   4. Lessons — overleveraged burns → clamp down
 *   5. maxLeverage — hard safety cap from config
 */
export function decideLeverage(
  confidence: number,
  regime: RegimeResult,
  mtf: MTFResult,
  lessons: Lesson[],
  maxLeverage: number,
): LeverageDecision {
  const reasons: string[] = [];
  let lev = 1;

  // confidence tiers
  if (confidence >= 85) {
    lev = 5;
    reasons.push(`very high confidence (${confidence}%) → 5x base`);
  } else if (confidence >= 78) {
    lev = 3;
    reasons.push(`high confidence (${confidence}%) → 3x base`);
  } else if (confidence >= 72) {
    lev = 2;
    reasons.push(`solid confidence (${confidence}%) → 2x base`);
  } else {
    reasons.push(`moderate confidence (${confidence}%) → 1x base`);
  }

  // regime adjustments
  const trending = regime.regime.includes('trend');
  const strong = regime.regime.startsWith('strong-');
  if (regime.stance === 'sit-out') {
    lev = 1;
    reasons.push('sit-out regime → forced 1x');
  } else if (strong && regime.adx >= 35) {
    lev = Math.min(lev + 1, 5);
    reasons.push(`strong trend (ADX ${regime.adx.toFixed(0)}) → +1x`);
  } else if (trending && regime.adx >= 25) {
    // trending but not strong — keep base, no bonus
  } else if (regime.regime === 'ranging' || regime.regime === 'volatile-chop') {
    lev = Math.max(1, lev - 2);
    reasons.push(`${regime.regime} → -2x`);
  } else if (regime.regime === 'squeeze') {
    lev = Math.max(1, lev - 1);
    reasons.push('squeeze (breakout pending) → -1x');
  }

  // MTF alignment bonus
  if (mtf.aligned && mtf.signals.length >= 2) {
    lev = Math.min(lev + 1, 5);
    reasons.push(`${mtf.signals.length}TF aligned → +1x`);
  } else if (!mtf.aligned && mtf.signals.length >= 2) {
    lev = Math.max(1, lev - 1);
    reasons.push('TF conflict → -1x');
  }

  // lesson penalty: if the agent has been burned by leverage, clamp hard
  const activeLessons = lessons.filter((l) => l.active && l.severity >= 30);
  const leverageLessons = activeLessons.filter(
    (l) => l.category === 'overleveraged_loss' || l.category === 'overleveraged_stop',
  );
  if (leverageLessons.length > 0) {
    const worstSeverity = Math.max(...leverageLessons.map((l) => l.severity));
    if (worstSeverity >= 60) {
      lev = 1;
      reasons.push(`severe leverage lesson (severity ${worstSeverity}) → forced 1x`);
    } else {
      lev = Math.min(lev, 2);
      reasons.push(`leverage lesson active (severity ${worstSeverity}) → capped 2x`);
    }
  }

  // hard cap
  lev = Math.max(1, Math.min(lev, maxLeverage));
  if (lev < maxLeverage) {
    // already explained above
  } else if (maxLeverage < 5) {
    reasons.push(`config cap → max ${maxLeverage}x`);
  }

  return { leverage: lev, reasons };
}
