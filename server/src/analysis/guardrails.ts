import { RegimeResult } from './regime';
import { MTFResult } from './multitf';
import { ConfidenceResult, Dir } from '../types';

interface Lesson { category: string; severity: number; active: boolean }
interface Position { symbol: string; direction: string }

export interface GuardResult {
  blocked: boolean;
  reason: string | null;
}

/**
 * Deep pre-trade guardrails v2. Checks every condition that should prevent a trade
 * before entry. Returns a block reason or null if clear.
 */
export function preTradeGuard(
  symbol: string,
  direction: Dir,
  confidence: number,
  signals: string[],
  regime: RegimeResult,
  mtf: MTFResult,
  lessons: Lesson[],
  openPositions: Position[],
  fearGreed: number | null,
  leverage: number = 1,
): GuardResult {
  const activeLessons = new Set(lessons.filter((l) => l.active && l.severity >= 30).map((l) => l.category));

  // 1) Regime-aware blocks
  if (regime.stance === 'sit-out') {
    return { blocked: true, reason: `regime sit-out: ${regime.description}` };
  }
  if (activeLessons.has('stopped_out_in_chop') && regime.regime === 'ranging') {
    return { blocked: true, reason: 'lesson: avoid ranging regime (learned it loses)' };
  }
  if (activeLessons.has('stopped_out_in_chop') && regime.regime === 'volatile-chop') {
    return { blocked: true, reason: 'lesson: avoid volatile chop (learned it kills)' };
  }

  // 2) Multi-timeframe conflict
  if (mtf.signals.length >= 2 && !mtf.aligned) {
    const dirs = mtf.signals.map((s) => s.direction).filter((d) => d !== 'FLAT');
    if (dirs.includes('LONG') && dirs.includes('SHORT')) {
      return { blocked: true, reason: `TF conflict: ${mtf.description}` };
    }
  }

  // 3) Legacy lesson blocks (Phase 1)
  if (
    activeLessons.has('bought_into_resistance') &&
    direction === 'LONG' &&
    (signals.includes('bollinger_upper') || signals.includes('peak'))
  ) {
    return { blocked: true, reason: 'lesson: bought into resistance' };
  }
  if (
    activeLessons.has('shorted_into_support') &&
    direction === 'SHORT' &&
    (signals.includes('bollinger_lower') || signals.includes('rock_bottom'))
  ) {
    return { blocked: true, reason: 'lesson: shorted into support' };
  }

  // 4) Sentiment-contrary block
  // Don't go LONG in Extreme Fear unless it's a rock-bottom bounce
  if (
    fearGreed != null &&
    fearGreed <= 15 &&
    direction === 'LONG' &&
    !signals.includes('rock_bottom')
  ) {
    return { blocked: true, reason: `sentiment block: Extreme Fear (${fearGreed}) without rock-bottom signal` };
  }
  // Don't go SHORT in Extreme Greed unless overbought
  if (
    fearGreed != null &&
    fearGreed >= 85 &&
    direction === 'SHORT' &&
    !signals.includes('peak') && !signals.includes('rsi_overbought')
  ) {
    return { blocked: true, reason: `sentiment block: Extreme Greed (${fearGreed}) without peak signal` };
  }

  // 5) Correlation block: don't stack too many in the same direction
  // (crude: count same-direction positions)
  const sameDir = openPositions.filter((p) => p.direction === direction).length;
  if (sameDir >= 2) {
    return { blocked: true, reason: `correlation block: already ${sameDir} ${direction} positions open` };
  }

  // 6) Pump & dump avoidance
  if (signals.includes('pump_dump')) {
    return { blocked: true, reason: 'manipulation block: pump & dump pattern detected' };
  }

  // 7) Leverage lesson: block high-leverage entries if the agent keeps getting burned
  if (
    leverage > 1 &&
    (activeLessons.has('overleveraged_loss') || activeLessons.has('overleveraged_stop'))
  ) {
    return { blocked: true, reason: `lesson: overleveraged losses at ${leverage}x — reduce leverage first` };
  }

  // 8) Churn lesson: if the agent keeps fading out of positions immediately,
  //    require higher conviction before entering anything new
  if (activeLessons.has('churned_position') && confidence < 75) {
    return { blocked: true, reason: `lesson: churn detected — require ≥75% confidence to re-enter (have ${confidence}%)` };
  }

  // 9) Switch lesson: if the agent keeps switching too early (selling losers to chase),
  //    require a much bigger edge before switching
  if (activeLessons.has('switched_too_early') && confidence < 80) {
    return { blocked: true, reason: `lesson: switching too early — require ≥80% confidence for new entries (have ${confidence}%)` };
  }

  // 10) Held-a-loser lesson: if the agent keeps riding losers to the stop,
  //     block low-confidence entries (the agent is bad at picking entries)
  if (activeLessons.has('held_a_loser') && confidence < 72) {
    return { blocked: true, reason: `lesson: held losers — require ≥72% confidence (have ${confidence}%)` };
  }

  return { blocked: false, reason: null };
}
