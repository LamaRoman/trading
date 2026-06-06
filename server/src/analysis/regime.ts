import { ADX, ATR, BollingerBands, SMA } from 'technicalindicators';
import { Candle } from '../types';

export type RegimeType =
  | 'strong-trend-up'
  | 'trend-up'
  | 'strong-trend-down'
  | 'trend-down'
  | 'ranging'
  | 'volatile-chop'
  | 'squeeze'      // low vol compression → breakout imminent
  | 'unknown';

export interface RegimeResult {
  regime: RegimeType;
  adx: number;          // 0-100 trend strength
  atrPct: number;       // ATR as % of price (volatility)
  bbWidth: number;       // Bollinger bandwidth (volatility)
  trendDir: number;      // +1 up, -1 down, 0 flat (SMA slope)
  confidence: number;    // 0-100 how confident we are in the regime call
  description: string;
  /** Strategy modifier: should the agent be aggressive, cautious, or sit out? */
  stance: 'aggressive' | 'normal' | 'cautious' | 'sit-out';
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const last = <T>(a: T[]) => a[a.length - 1];

export function detectRegime(candles: Candle[]): RegimeResult {
  if (candles.length < 60) {
    return {
      regime: 'unknown', adx: 0, atrPct: 0, bbWidth: 0, trendDir: 0,
      confidence: 0, description: 'insufficient data', stance: 'cautious',
    };
  }

  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const price = close[close.length - 1];

  // ADX — trend strength (>25 trending, <20 ranging)
  const adxArr = ADX.calculate({ period: 14, close, high, low });
  const adx = last(adxArr)?.adx ?? 0;

  // ATR as % of price — volatility
  const atrArr = ATR.calculate({ period: 14, close, high, low });
  const atr = last(atrArr) ?? 0;
  const atrPct = price > 0 ? (atr / price) * 100 : 0;

  // ATR percentile over rolling window (is vol expanding or contracting?)
  const atrVals = atrArr.slice(-50);
  const atrSorted = [...atrVals].sort((a, b) => a - b);
  const atrPctile = atrVals.length > 0
    ? atrSorted.indexOf(atr) / atrSorted.length * 100
    : 50;

  // Bollinger bandwidth — squeeze detection
  const bbArr = BollingerBands.calculate({ period: 20, stdDev: 2, values: close });
  const bb = last(bbArr);
  const bbWidth = bb && bb.middle > 0 ? (bb.upper - bb.lower) / bb.middle * 100 : 2;

  // BB width percentile (squeeze = lowest 15%)
  const bbWidths = bbArr.slice(-50).map((b) => (b.upper - b.lower) / (b.middle || 1) * 100);
  const bbSorted = [...bbWidths].sort((a, b) => a - b);
  const bbPctile = bbSorted.length > 0
    ? bbSorted.indexOf(bbWidth) / bbSorted.length * 100
    : 50;

  // SMA slope — trend direction
  const sma50 = SMA.calculate({ period: 50, values: close });
  const smaRecent = sma50.slice(-10);
  const smaSlope = smaRecent.length >= 2
    ? (smaRecent[smaRecent.length - 1] - smaRecent[0]) / smaRecent[0] * 100
    : 0;
  const trendDir = smaSlope > 0.1 ? 1 : smaSlope < -0.1 ? -1 : 0;

  // ---- classify ----
  let regime: RegimeType;
  let confidence: number;
  let description: string;
  let stance: RegimeResult['stance'];

  if (bbPctile < 15) {
    // Bollinger squeeze — volatility compressed, breakout coming
    regime = 'squeeze';
    confidence = 70 + (15 - bbPctile);
    description = `Bollinger squeeze (width pctile ${bbPctile.toFixed(0)}%) — breakout imminent, direction TBD`;
    stance = 'cautious'; // wait for the breakout direction
  } else if (adx >= 30 && trendDir > 0) {
    regime = adx >= 45 ? 'strong-trend-up' : 'trend-up';
    confidence = Math.min(95, 60 + adx * 0.5);
    description = `${regime} (ADX ${adx.toFixed(0)}, slope +${smaSlope.toFixed(2)}%) — ride the trend`;
    stance = 'aggressive';
  } else if (adx >= 30 && trendDir < 0) {
    regime = adx >= 45 ? 'strong-trend-down' : 'trend-down';
    confidence = Math.min(95, 60 + adx * 0.5);
    description = `${regime} (ADX ${adx.toFixed(0)}, slope ${smaSlope.toFixed(2)}%) — ride or hedge`;
    stance = 'aggressive';
  } else if (adx < 20 && atrPctile > 70) {
    regime = 'volatile-chop';
    confidence = 65;
    description = `volatile chop (ADX ${adx.toFixed(0)}, ATR pctile ${atrPctile.toFixed(0)}%) — no trend, high vol → dangerous`;
    stance = 'sit-out';
  } else if (adx < 22) {
    regime = 'ranging';
    confidence = 60;
    description = `ranging (ADX ${adx.toFixed(0)}) — mean reversion plays only`;
    stance = 'cautious';
  } else {
    // weak/transitional trend
    regime = trendDir > 0 ? 'trend-up' : trendDir < 0 ? 'trend-down' : 'ranging';
    confidence = 45;
    description = `weak/transitional (ADX ${adx.toFixed(0)}) — reduced confidence`;
    stance = 'normal';
  }

  return { regime, adx, atrPct, bbWidth, trendDir, confidence, description, stance };
}

/**
 * Confidence multiplier based on regime. Trends deserve full conviction;
 * chop and squeeze should reduce position sizes / require higher thresholds.
 */
export function regimeMultiplier(regime: RegimeResult): number {
  switch (regime.stance) {
    case 'aggressive': return 1.15;  // boost confidence slightly in strong trends
    case 'normal':     return 1.0;
    case 'cautious':   return 0.88;  // reduce — need more conviction
    case 'sit-out':    return 0.7;   // heavily penalize — chop kills accounts
  }
}
