import { scoreAsset, Weights } from '../analysis/confidence';
import { analyzeWhales } from '../intelligence/whale';
import { detectRegime, regimeMultiplier } from '../analysis/regime';
import { Candle, Dir, ConfidenceResult } from '../types';

export interface BacktestConfig {
  startingCapital: number;
  confidenceThreshold: number;
  riskPerTradePct: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxConcurrent: number;
  weights: Weights;
}

interface BTPosition {
  symbol: string;
  direction: Dir;
  entryPrice: number;
  entryIdx: number;
  qty: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  regime: string;
  signals: string[];
}

export interface BTTrade {
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  entryIdx: number;
  exitIdx: number;
  pnl: number;
  pnlPct: number;
  exitReason: string;
  confidence: number;
  regime: string;
}

export interface BacktestResult {
  trades: BTTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  totalReturnPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  profitFactor: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  equityCurve: Array<{ idx: number; equity: number }>;
  regimeBreakdown: Record<string, { trades: number; winRate: number; pnl: number }>;
}

const DEFAULT_CONFIG: BacktestConfig = {
  startingCapital: 10000,
  confidenceThreshold: 65,
  riskPerTradePct: 2,
  stopLossPct: 3,
  takeProfitPct: 6,
  maxConcurrent: 3,
  weights: { technical: 0.35, sentiment: 0.2, whale: 0.25, momentum: 0.2 },
};

/**
 * Backtest engine: replay historical candles through the confidence engine + trading rules.
 * Walks forward bar-by-bar, scoring with a lookback window, entering/exiting with bracket orders.
 */
export function runBacktest(
  candles: Candle[],
  symbol: string,
  config: Partial<BacktestConfig> = {},
): BacktestResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const LOOKBACK = 120;
  if (candles.length < LOOKBACK + 20) {
    return emptyResult(cfg.startingCapital);
  }

  let cash = cfg.startingCapital;
  const positions: BTPosition[] = [];
  const trades: BTTrade[] = [];
  const equityCurve: Array<{ idx: number; equity: number }> = [];
  let peakEquity = cfg.startingCapital;
  let maxDD = 0;

  for (let i = LOOKBACK; i < candles.length; i++) {
    const window = candles.slice(i - LOOKBACK, i + 1);
    const price = candles[i].close;

    // check bracket exits
    for (let p = positions.length - 1; p >= 0; p--) {
      const pos = positions[p];
      let exitReason = '';
      let exitPrice = price;
      const dirMul = pos.direction === 'LONG' ? 1 : -1;
      const hi = candles[i].high;
      const lo = candles[i].low;

      if (pos.direction === 'LONG') {
        if (lo <= pos.stopLoss) { exitReason = 'stop_loss'; exitPrice = pos.stopLoss; }
        else if (hi >= pos.takeProfit) { exitReason = 'take_profit'; exitPrice = pos.takeProfit; }
      } else {
        if (hi >= pos.stopLoss) { exitReason = 'stop_loss'; exitPrice = pos.stopLoss; }
        else if (lo <= pos.takeProfit) { exitReason = 'take_profit'; exitPrice = pos.takeProfit; }
      }

      if (exitReason) {
        const pnl = (exitPrice - pos.entryPrice) * pos.qty * dirMul;
        const pnlPct = ((exitPrice / pos.entryPrice) - 1) * 100 * dirMul;
        cash += pos.entryPrice * pos.qty + pnl;
        trades.push({
          symbol, direction: pos.direction, entryPrice: pos.entryPrice,
          exitPrice, entryIdx: pos.entryIdx, exitIdx: i,
          pnl, pnlPct, exitReason, confidence: pos.confidence, regime: pos.regime,
        });
        positions.splice(p, 1);
      }
    }

    // score every N bars (not every bar — too slow, and real agent doesn't either)
    if (i % 3 === 0 && positions.length < cfg.maxConcurrent) {
      const whale = analyzeWhales(window);
      const regime = detectRegime(window);
      const regMul = regimeMultiplier(regime);
      const res = scoreAsset(window, cfg.weights, { whale });

      if (res && res.direction !== 'FLAT') {
        const adjusted = Math.round(res.confidence * regMul);
        if (adjusted >= cfg.confidenceThreshold && regime.stance !== 'sit-out') {
          const riskAmt = cash * (cfg.riskPerTradePct / 100);
          const notional = Math.min(riskAmt / (cfg.stopLossPct / 100), cash * 0.33);
          if (notional > 50) {
            const qty = notional / price;
            const dir = res.direction as 'LONG' | 'SHORT';
            const tp = dir === 'LONG'
              ? price * (1 + cfg.takeProfitPct / 100)
              : price * (1 - cfg.takeProfitPct / 100);
            const sl = dir === 'LONG'
              ? price * (1 - cfg.stopLossPct / 100)
              : price * (1 + cfg.stopLossPct / 100);
            cash -= notional;
            positions.push({
              symbol, direction: dir, entryPrice: price, entryIdx: i,
              qty, stopLoss: sl, takeProfit: tp, confidence: adjusted,
              regime: regime.regime, signals: res.signals,
            });
          }
        }
      }
    }

    // equity snapshot
    const posValue = positions.reduce((a, pos) => {
      const dirMul = pos.direction === 'LONG' ? 1 : -1;
      return a + pos.entryPrice * pos.qty + (price - pos.entryPrice) * pos.qty * dirMul;
    }, 0);
    const equity = cash + posValue;
    equityCurve.push({ idx: i, equity });
    if (equity > peakEquity) peakEquity = equity;
    const dd = peakEquity - equity;
    if (dd > maxDD) maxDD = dd;
  }

  // close remaining positions at last price
  const lastPrice = candles[candles.length - 1].close;
  for (const pos of positions) {
    const dirMul = pos.direction === 'LONG' ? 1 : -1;
    const pnl = (lastPrice - pos.entryPrice) * pos.qty * dirMul;
    const pnlPct = ((lastPrice / pos.entryPrice) - 1) * 100 * dirMul;
    cash += pos.entryPrice * pos.qty + pnl;
    trades.push({
      symbol, direction: pos.direction, entryPrice: pos.entryPrice,
      exitPrice: lastPrice, entryIdx: pos.entryIdx, exitIdx: candles.length - 1,
      pnl, pnlPct, exitReason: 'end_of_data', confidence: pos.confidence, regime: pos.regime,
    });
  }

  return computeStats(trades, cfg.startingCapital, maxDD, equityCurve);
}

function computeStats(
  trades: BTTrade[], startCap: number, maxDD: number,
  equityCurve: Array<{ idx: number; equity: number }>,
): BacktestResult {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const avgWin = wins.length ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.pnl, 0) / losses.length : 0;
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  // Sharpe (annualized from per-trade returns)
  const returns = trades.map((t) => t.pnlPct / 100);
  const meanRet = returns.reduce((a, r) => a + r, 0) / (returns.length || 1);
  const stdRet = Math.sqrt(returns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / (returns.length || 1));
  const sharpe = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(252) : 0;

  // regime breakdown
  const regimes: Record<string, { trades: number; wins: number; pnl: number }> = {};
  for (const t of trades) {
    const r = t.regime || 'unknown';
    if (!regimes[r]) regimes[r] = { trades: 0, wins: 0, pnl: 0 };
    regimes[r].trades += 1;
    if (t.pnl > 0) regimes[r].wins += 1;
    regimes[r].pnl += t.pnl;
  }
  const rb: Record<string, { trades: number; winRate: number; pnl: number }> = {};
  for (const [k, v] of Object.entries(regimes)) {
    rb[k] = { trades: v.trades, winRate: v.trades ? (v.wins / v.trades) * 100 : 0, pnl: v.pnl };
  }

  return {
    trades,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    totalPnl,
    totalReturnPct: (totalPnl / startCap) * 100,
    maxDrawdown: maxDD,
    maxDrawdownPct: startCap > 0 ? (maxDD / startCap) * 100 : 0,
    profitFactor: pf,
    sharpeRatio: sharpe,
    avgWin,
    avgLoss,
    bestTrade: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0,
    worstTrade: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0,
    equityCurve: equityCurve.filter((_, i) => i % 5 === 0), // subsample for dashboard
    regimeBreakdown: rb,
  };
}

function emptyResult(startCap: number): BacktestResult {
  return {
    trades: [], totalTrades: 0, wins: 0, losses: 0, winRate: 0,
    totalPnl: 0, totalReturnPct: 0, maxDrawdown: 0, maxDrawdownPct: 0,
    profitFactor: 0, sharpeRatio: 0, avgWin: 0, avgLoss: 0,
    bestTrade: 0, worstTrade: 0, equityCurve: [],
    regimeBreakdown: {},
  };
}
