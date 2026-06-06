import { RegimeResult } from './regime';
import { MTFResult } from './multitf';

export type TradingMode = 'spot' | 'leverage';

interface Lesson { category: string; severity: number; active: boolean }

export interface ModeDecision {
  mode: TradingMode;
  reasons: string[];
}

/**
 * Decide whether to trade spot (LONG only, 1x, no liquidation)
 * or leverage (LONG/SHORT, dynamic leverage, liquidation exists).
 *
 * Spot is safer — use it when conviction is moderate or conditions are uncertain.
 * Leverage unlocks SHORTS and amplified longs — use it when the edge is clear.
 */
export function decideMode(
  direction: 'LONG' | 'SHORT',
  confidence: number,
  regime: RegimeResult,
  mtf: MTFResult,
  lessons: Lesson[],
  allowLeverage: boolean,
): ModeDecision {
  const reasons: string[] = [];

  // Hard kill-switch from config
  if (!allowLeverage) {
    reasons.push('leverage disabled in config → spot only');
    return { mode: 'spot', reasons };
  }

  // SHORTs require leverage — can't short on spot
  if (direction === 'SHORT') {
    reasons.push('SHORT requires leverage mode');
    return { mode: 'leverage', reasons };
  }

  // Churn lesson: agent has been burning itself — go spot to limit damage
  const activeLessons = lessons.filter((l) => l.active && l.severity >= 30);
  const churnLesson = activeLessons.find((l) => l.category === 'churned_position');
  if (churnLesson) {
    reasons.push(`churn lesson active (sev ${churnLesson.severity.toFixed(0)}) → spot only`);
    return { mode: 'spot', reasons };
  }

  // Risky regimes → spot
  if (regime.regime === 'volatile-chop') {
    reasons.push('volatile chop → spot only (too risky to lever)');
    return { mode: 'spot', reasons };
  }
  if (regime.regime === 'ranging' && confidence < 75) {
    reasons.push('ranging market + moderate confidence → spot');
    return { mode: 'spot', reasons };
  }
  if (regime.stance === 'sit-out') {
    reasons.push('sit-out regime → spot only');
    return { mode: 'spot', reasons };
  }

  // TF conflict with moderate confidence → spot
  if (!mtf.aligned && mtf.signals.length >= 2 && confidence < 78) {
    reasons.push('TF conflict + moderate confidence → spot');
    return { mode: 'spot', reasons };
  }

  // Strong conviction → leverage
  if (confidence >= 75) {
    reasons.push(`high confidence (${confidence}%) → leverage`);
    return { mode: 'leverage', reasons };
  }

  // Default: spot for moderate confidence
  reasons.push(`moderate confidence (${confidence}%) → spot`);
  return { mode: 'spot', reasons };
}
