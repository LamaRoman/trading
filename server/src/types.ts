/** Shared domain types. */

export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Dir = 'LONG' | 'SHORT' | 'FLAT';

export interface AssetRef {
  id: number;
  symbol: string;
  type?: string;
}

/** A market-data source. Mock for offline dev; Alpaca for real data. */
export interface MarketDataProvider {
  name: string;
  /**
   * Ensure enough history exists, advance the series by one bar (mock) or
   * fetch the latest bars (real), persist, and return the latest `limit`
   * candles in ascending time order.
   */
  tick(asset: AssetRef, timeframe: string, limit: number): Promise<Candle[]>;
}

/** One component's contribution to the overall confidence. */
export interface ComponentScore {
  /** 0..100 bullishness (50 = neutral, >50 bullish, <50 bearish). */
  score: number;
  reasons: string[];
  /** named signals that fired (for the learning system). */
  signals: string[];
  /** whether this component carries information this phase (stubs are false). */
  active: boolean;
}

/** Output of the confidence engine for a single asset. */
export interface ConfidenceResult {
  /** 0..100 probability-of-profit estimate in the chosen direction. */
  confidence: number;
  direction: Dir;
  /** 0..100 net bullishness across all components. */
  bullishness: number;
  price: number;
  // component sub-scores (0..100 bullishness each)
  technical: number;
  sentiment: number;
  whale: number;
  momentum: number;
  reasons: string[];
  /** named signals that fired this scoring (for learning attribution). */
  signals: string[];
  /** market regime at scoring time */
  regime: string;
}
