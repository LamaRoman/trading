import { computeIndicators, IndicatorSet } from './indicators';
import { Candle, ComponentScore, ConfidenceResult, Dir } from '../types';
import { SentimentResult } from '../intelligence/sentiment';
import { WhaleResult } from '../intelligence/whale';

export interface Weights {
  technical: number;
  sentiment: number;
  whale: number;
  momentum: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Technical bullishness from trend, momentum oscillators, bands + extremes. */
function technicalScore(ind: IndicatorSet): ComponentScore {
  let score = 50;
  const reasons: string[] = [];
  const signals: string[] = [];

  // RSI
  if (ind.rsi <= 30) {
    score += Math.min(22, (30 - ind.rsi) * 1.5 + 8);
    reasons.push(`RSI oversold (${ind.rsi.toFixed(0)}) → bullish`);
    signals.push('rsi_oversold');
  } else if (ind.rsi >= 70) {
    score -= Math.min(22, (ind.rsi - 70) * 1.5 + 8);
    reasons.push(`RSI overbought (${ind.rsi.toFixed(0)}) → bearish`);
    signals.push('rsi_overbought');
  }

  // EMA stack (trend)
  if (ind.price > ind.ema9 && ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50) {
    score += 15;
    reasons.push('EMA stack bullish (price>9>21>50)');
    signals.push('ema_stack_bull');
  } else if (ind.price < ind.ema9 && ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50) {
    score -= 15;
    reasons.push('EMA stack bearish (price<9<21<50)');
    signals.push('ema_stack_bear');
  } else {
    score += ind.price > ind.ema50 ? 5 : -5;
  }

  // MACD histogram
  if (ind.macdHist > 0) {
    const rising = ind.macdHist > ind.macdPrevHist;
    score += rising ? 9 : 5;
    reasons.push(`MACD ${rising ? 'rising' : 'positive'} → bullish`);
    signals.push('macd_bull');
  } else if (ind.macdHist < 0) {
    const falling = ind.macdHist < ind.macdPrevHist;
    score -= falling ? 9 : 5;
    reasons.push(`MACD ${falling ? 'falling' : 'negative'} → bearish`);
    signals.push('macd_bear');
  }

  // Bollinger position (mean reversion)
  if (ind.pctB <= 0.1) {
    score += 8;
    reasons.push('price at/below lower Bollinger → mean-reversion bull');
    signals.push('bollinger_lower');
  } else if (ind.pctB >= 0.9) {
    score -= 8;
    reasons.push('price at/above upper Bollinger → mean-reversion bear');
    signals.push('bollinger_upper');
  }

  // Extremes (rock-bottom / peak)
  if (ind.rsi < 28 && ind.pctFromLow < 0.02 && ind.pctB < 0.12) {
    score += 10;
    reasons.push('⚑ ROCK-BOTTOM: oversold + at support → bounce candidate');
    signals.push('rock_bottom');
  }
  if (ind.rsi > 72 && ind.pctFromHigh > -0.02 && ind.pctB > 0.88) {
    score -= 10;
    reasons.push('⚑ PEAK: overbought + at resistance → reversal candidate');
    signals.push('peak');
  }

  return { score: clamp(score, 0, 100), reasons, signals, active: true };
}

/** Momentum bullishness from recent returns + volume confirmation. */
function momentumScore(ind: IndicatorSet): ComponentScore {
  let score = 50;
  const reasons: string[] = [];
  const signals: string[] = [];

  score += clamp(ind.ret20 * 350, -25, 25);
  score += clamp(ind.ret5 * 250, -12, 12);

  if (ind.volumeSpike > 2 && ind.ret5 > 0.003) {
    score += 8;
    reasons.push(`volume breakout ${ind.volumeSpike.toFixed(1)}x with price up`);
    signals.push('volume_breakout', 'momentum_up');
  } else if (ind.volumeSpike > 2 && ind.ret5 < -0.003) {
    score -= 8;
    reasons.push(`volume spike ${ind.volumeSpike.toFixed(1)}x with price down`);
    signals.push('volume_breakout', 'momentum_down');
  }

  if (ind.ret20 > 0.02) {
    reasons.push(`uptrend momentum (+${(ind.ret20 * 100).toFixed(1)}% / 20 bars)`);
    if (!signals.includes('momentum_up')) signals.push('momentum_up');
  } else if (ind.ret20 < -0.02) {
    reasons.push(`downtrend momentum (${(ind.ret20 * 100).toFixed(1)}% / 20 bars)`);
    if (!signals.includes('momentum_down')) signals.push('momentum_down');
  }

  return { score: clamp(score, 0, 100), reasons, signals, active: true };
}

function inferRegime(ind: IndicatorSet): string {
  if (ind.ret20 > 0.03 && ind.price > ind.ema50) return 'trending-up';
  if (ind.ret20 < -0.03 && ind.price < ind.ema50) return 'trending-down';
  return 'ranging';
}

/** Optional intelligence data from Phase 2+ sources. */
export interface IntelData {
  sentiment?: SentimentResult;
  whale?: WhaleResult;
}

/** Signal reliability map from the learning system. */
export type SignalReliability = Map<string, number>; // signal name → 0..100 reliability

/**
 * The confidence engine. Combines weighted component bullishness into an overall
 * confidence (probability-of-profit estimate) and a direction, with human-readable
 * reasons and named signals for the learning system.
 *
 * Phase 2: accepts real sentiment + whale intelligence; falls back gracefully if absent.
 */
export function scoreAsset(candles: Candle[], weights: Weights, intel?: IntelData, signalRel?: SignalReliability): ConfidenceResult | null {
  const ind = computeIndicators(candles);
  if (!ind) return null;

  const t = technicalScore(ind);
  const m = momentumScore(ind);

  // ---- Whale: use real analysis if provided, else basic volume proxy ----
  let wh: ComponentScore;
  if (intel?.whale) {
    const w = intel.whale;
    wh = {
      score: w.score,
      reasons: w.reasons,
      signals: w.signals,
      active: true,
    };
  } else {
    // fallback: Phase 1 volume proxy
    let ws = 50;
    const wr: string[] = [];
    const wsi: string[] = [];
    if (ind.volumeSpike >= 3) {
      if (ind.ret5 > 0) { ws += 15; wr.push(`large-volume buying ${ind.volumeSpike.toFixed(1)}x`); wsi.push('whale_accumulation'); }
      else { ws -= 15; wr.push(`large-volume selling ${ind.volumeSpike.toFixed(1)}x`); wsi.push('whale_distribution'); }
    } else { wr.push('no unusual whale volume'); }
    wh = { score: clamp(ws, 0, 100), reasons: wr, signals: wsi, active: true };
  }

  // ---- Sentiment: use real data if provided, else inactive stub ----
  let se: ComponentScore;
  if (intel?.sentiment && intel.sentiment.headlines.length >= 2) {
    const s = intel.sentiment;
    se = {
      score: s.score,
      reasons: s.reasons,
      signals: s.score > 60 ? ['sentiment_bull'] : s.score < 40 ? ['sentiment_bear'] : [],
      active: true, // REAL data — participates in confidence with full weight
    };
  } else {
    se = {
      score: 50,
      reasons: ['sentiment: no data available'],
      signals: [],
      active: false, // inactive — excluded from confidence calc
    };
  }

  // Combine only active components, renormalizing weights
  const comps = [
    { w: weights.technical, c: t },
    { w: weights.sentiment, c: se },
    { w: weights.whale, c: wh },
    { w: weights.momentum, c: m },
  ].filter((x) => x.c.active && x.w > 0);
  const wSum = comps.reduce((a, x) => a + x.w, 0) || 1;
  const tilt = comps.reduce((a, x) => a + x.w * (x.c.score - 50), 0) / wSum;

  const bullishness = 50 + tilt;
  const dist = Math.abs(tilt);
  const direction: Dir = dist < 2 ? 'FLAT' : tilt >= 0 ? 'LONG' : 'SHORT';
  let confidence = clamp(50 + dist, 0, 100);

  const reasons = [...t.reasons, ...m.reasons, ...wh.reasons, ...se.reasons];
  const signals = Array.from(new Set([...t.signals, ...m.signals, ...wh.signals, ...se.signals]));

  // Signal reliability penalty: if the signals driving this score have low reliability
  // (learned from past losses), reduce confidence proportionally
  if (signalRel && signalRel.size > 0) {
    const activeSignals = signals.filter((s) => signalRel.has(s));
    if (activeSignals.length > 0) {
      const avgReliability = activeSignals.reduce((a, s) => a + (signalRel.get(s) ?? 50), 0) / activeSignals.length;
      if (avgReliability < 40) {
        const penalty = (40 - avgReliability) * 0.3; // up to ~12 point penalty
        confidence = clamp(confidence - penalty, 0, 100);
        reasons.push(`⚑ signal reliability penalty: avg ${avgReliability.toFixed(0)}% → -${penalty.toFixed(0)} conf`);
      }
    }
  }

  return {
    confidence: Math.round(confidence),
    direction,
    bullishness: Math.round(bullishness),
    price: ind.price,
    technical: Math.round(t.score),
    sentiment: Math.round(se.score),
    whale: Math.round(wh.score),
    momentum: Math.round(m.score),
    reasons,
    signals,
    regime: inferRegime(ind),
  };
}
