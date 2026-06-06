import { RSI, EMA, MACD, BollingerBands, ATR, SMA } from 'technicalindicators';
import { Candle } from '../types';

export interface IndicatorSet {
  price: number;
  rsi: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  macdPrevHist: number;
  bollUpper: number;
  bollMiddle: number;
  bollLower: number;
  pctB: number; // %B: position within Bollinger band (0 = lower, 1 = upper)
  atr: number;
  vwap: number;
  volume: number;
  avgVolume: number;
  volumeSpike: number; // current volume / 20-period average
  ret5: number; // return over last 5 bars
  ret20: number; // return over last 20 bars
  recentHigh: number; // high over last 50 bars
  recentLow: number; // low over last 50 bars
  pctFromHigh: number; // (price - recentHigh) / recentHigh  (<= 0)
  pctFromLow: number; // (price - recentLow) / recentLow    (>= 0)
}

const last = <T>(arr: T[]): T | undefined => (arr.length ? arr[arr.length - 1] : undefined);

/** Compute the full indicator set from ascending candles. Returns null if too short. */
export function computeIndicators(candles: Candle[]): IndicatorSet | null {
  if (candles.length < 60) return null;

  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const vol = candles.map((c) => c.volume);
  const price = close[close.length - 1];

  const rsiArr = RSI.calculate({ period: 14, values: close });
  const ema9Arr = EMA.calculate({ period: 9, values: close });
  const ema21Arr = EMA.calculate({ period: 21, values: close });
  const ema50Arr = EMA.calculate({ period: 50, values: close });
  const ema200Arr = EMA.calculate({ period: 200, values: close });
  const macdArr = MACD.calculate({
    values: close,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const bollArr = BollingerBands.calculate({ period: 20, stdDev: 2, values: close });
  const atrArr = ATR.calculate({ period: 14, high, low, close });
  const volSmaArr = SMA.calculate({ period: 20, values: vol });

  const macdLast = last(macdArr);
  const macdPrev = macdArr.length >= 2 ? macdArr[macdArr.length - 2] : undefined;
  const boll = last(bollArr);

  // session VWAP over the provided window
  let pv = 0;
  let vv = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vv += c.volume;
  }
  const vwap = vv > 0 ? pv / vv : price;

  const window = candles.slice(-50);
  const recentHigh = Math.max(...window.map((c) => c.high));
  const recentLow = Math.min(...window.map((c) => c.low));

  const ret = (n: number) =>
    close.length > n ? price / close[close.length - 1 - n] - 1 : 0;

  const volume = vol[vol.length - 1];
  const avgVolume = last(volSmaArr) ?? volume;
  const bollUpper = boll?.upper ?? price;
  const bollLower = boll?.lower ?? price;
  const pctB = bollUpper > bollLower ? (price - bollLower) / (bollUpper - bollLower) : 0.5;

  return {
    price,
    rsi: last(rsiArr) ?? 50,
    ema9: last(ema9Arr) ?? price,
    ema21: last(ema21Arr) ?? price,
    ema50: last(ema50Arr) ?? price,
    ema200: last(ema200Arr) ?? price,
    macd: macdLast?.MACD ?? 0,
    macdSignal: macdLast?.signal ?? 0,
    macdHist: macdLast?.histogram ?? 0,
    macdPrevHist: macdPrev?.histogram ?? 0,
    bollUpper,
    bollMiddle: boll?.middle ?? price,
    bollLower,
    pctB,
    atr: last(atrArr) ?? 0,
    vwap,
    volume,
    avgVolume,
    volumeSpike: avgVolume > 0 ? volume / avgVolume : 1,
    ret5: ret(5),
    ret20: ret(20),
    recentHigh,
    recentLow,
    pctFromHigh: recentHigh > 0 ? (price - recentHigh) / recentHigh : 0,
    pctFromLow: recentLow > 0 ? (price - recentLow) / recentLow : 0,
  };
}
