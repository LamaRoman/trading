import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { getPortfolio } from '../trading/portfolio';
import { getAgentConfig, getLivePrices } from '../state';
import { startLoop, stopLoop, getLoopStatus } from '../agent/loop';
import { runCycle } from '../agent/cycle';
import { getSentiment } from '../intelligence/sentiment';
import { analyzeWhales } from '../intelligence/whale';
import { detectRegime } from '../analysis/regime';
import { runBacktest } from '../backtest/engine';
import { getProvider } from '../market/provider';
import { testConnection } from '../intelligence/telegram';
import { postMarketScan, postNews } from '../intelligence/marketpost';
import { testXConnection } from '../intelligence/xpost';

export const api = Router();

/** async handler wrapper → forwards errors to the error middleware */
const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/** Latest close per active asset (used for marking the portfolio to market). */
async function latestPrices(): Promise<Map<number, number>> {
  const live = getLivePrices();
  if (live.size > 0) return live;
  const assets = await prisma.asset.findMany({ where: { active: true } });
  const openTrades = await prisma.trade.findMany({
    where: { status: 'OPEN' },
    select: { assetId: true },
  });
  const allIds = new Set([
    ...assets.map((a) => a.id),
    ...openTrades.map((t) => t.assetId),
  ]);
  const m = new Map<number, number>();
  for (const id of allIds) {
    const c = await prisma.candle.findFirst({
      where: { assetId: id, timeframe: '5m' },
      orderBy: { timestamp: 'desc' },
    });
    if (c) m.set(id, c.close);
  }
  return m;
}

api.get('/health', (_req, res) => res.json({ ok: true }));

api.get('/status', h(async (_req, res) => {
  res.json({ loop: getLoopStatus(), config: await getAgentConfig() });
}));

/** One-shot aggregate for the dashboard header + leaderboard. */
api.get('/overview', h(async (_req, res) => {
  const prices = await latestPrices();
  const pf = await getPortfolio(prices);
  const config = await getAgentConfig();
  const lastDecision = await prisma.agentDecision.findFirst({ orderBy: { id: 'desc' } });
  const scores = lastDecision
    ? await prisma.assetScore.findMany({
        where: { decisionId: lastDecision.id },
        include: { asset: true },
        orderBy: { confidence: 'desc' },
      })
    : [];
  res.json({
    loop: getLoopStatus(),
    portfolio: pf,
    config,
    lastDecision,
    leaderboard: scores.map((s) => ({
      symbol: s.asset.symbol,
      name: s.asset.name,
      confidence: s.confidence,
      direction: s.direction,
      price: s.price,
      technical: s.technical,
      sentiment: s.sentiment,
      whale: s.whale,
      momentum: s.momentum,
      reasons: s.reasons,
    })),
  });
}));

api.get('/portfolio', h(async (_req, res) => {
  res.json(await getPortfolio(await latestPrices()));
}));

api.get('/positions', h(async (_req, res) => {
  const pf = await getPortfolio(await latestPrices());
  res.json(pf.positions);
}));

api.get('/leaderboard', h(async (_req, res) => {
  const lastDecision = await prisma.agentDecision.findFirst({ orderBy: { id: 'desc' } });
  if (!lastDecision) return res.json([]);
  const scores = await prisma.assetScore.findMany({
    where: { decisionId: lastDecision.id },
    include: { asset: true },
    orderBy: { confidence: 'desc' },
  });
  res.json(
    scores.map((s) => ({
      symbol: s.asset.symbol,
      name: s.asset.name,
      confidence: s.confidence,
      direction: s.direction,
      price: s.price,
      technical: s.technical,
      sentiment: s.sentiment,
      whale: s.whale,
      momentum: s.momentum,
      reasons: s.reasons,
    })),
  );
}));

api.get('/decisions', h(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json(await prisma.agentDecision.findMany({ orderBy: { id: 'desc' }, take: limit }));
}));

api.get('/trades', h(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const status = req.query.status as string | undefined;
  const trades = await prisma.trade.findMany({
    where: status ? { status: status as any } : {},
    include: { asset: true },
    orderBy: { id: 'desc' },
    take: limit,
  });
  res.json(trades.map((t) => ({ ...t, symbol: t.asset.symbol, source: t.source ?? 'agent' })));
}));

api.get('/equity', h(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 500), 2000);
  const snaps = await prisma.portfolioSnapshot.findMany({ orderBy: { id: 'desc' }, take: limit });
  res.json(snaps.reverse());
}));

api.get('/assets', h(async (_req, res) => {
  res.json(await prisma.asset.findMany({ where: { active: true }, orderBy: { symbol: 'asc' } }));
}));

/** Search coins via CoinGecko (proxied through our server for network compatibility). */
api.get('/coins/search', h(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json([]);
  const axios = (await import('axios')).default;
  try {
    const r = await axios.get('https://api.coingecko.com/api/v3/search', {
      params: { query: q },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    const coins = (r.data?.coins ?? []).slice(0, 8).map((c: any) => ({
      id: c.id,
      name: c.name,
      symbol: (c.symbol ?? '').toUpperCase(),
      thumb: c.thumb ?? '',
      market_cap_rank: c.market_cap_rank ?? null,
    }));
    res.json(coins);
  } catch {
    // CoinGecko unreachable — fall back to matching against known Yahoo symbols
    const known = [
      { symbol: 'BTC', name: 'Bitcoin' }, { symbol: 'ETH', name: 'Ethereum' },
      { symbol: 'SOL', name: 'Solana' }, { symbol: 'AVAX', name: 'Avalanche' },
      { symbol: 'LINK', name: 'Chainlink' }, { symbol: 'XRP', name: 'XRP' },
      { symbol: 'ADA', name: 'Cardano' }, { symbol: 'DOGE', name: 'Dogecoin' },
      { symbol: 'LTC', name: 'Litecoin' }, { symbol: 'SHIB', name: 'Shiba Inu' },
      { symbol: 'DOT', name: 'Polkadot' }, { symbol: 'BNB', name: 'Binance Coin' },
      { symbol: 'ATOM', name: 'Cosmos' }, { symbol: 'ARB', name: 'Arbitrum' },
      { symbol: 'OP', name: 'Optimism' }, { symbol: 'TON', name: 'Toncoin' },
      { symbol: 'NEAR', name: 'NEAR Protocol' }, { symbol: 'SEI', name: 'Sei' },
      { symbol: 'INJ', name: 'Injective' }, { symbol: 'TIA', name: 'Celestia' },
      { symbol: 'UNI', name: 'Uniswap' }, { symbol: 'AAVE', name: 'Aave' },
      { symbol: 'FIL', name: 'Filecoin' }, { symbol: 'APT', name: 'Aptos' },
      { symbol: 'SUI', name: 'Sui' }, { symbol: 'MATIC', name: 'Polygon (legacy)' },
    ];
    const ql = q.toLowerCase();
    const matches = known.filter(
      (k) => k.symbol.toLowerCase().includes(ql) || k.name.toLowerCase().includes(ql),
    );
    res.json(matches.slice(0, 8).map((k) => ({
      id: k.symbol.toLowerCase(),
      name: k.name,
      symbol: k.symbol,
      thumb: '',
      market_cap_rank: null,
    })));
  }
}));

/** Add your own pick to the watchlist (the agent starts scoring it next cycle). */
api.post('/assets', h(async (req, res) => {
  let raw = String(req.body?.symbol ?? '').trim().toUpperCase();
  if (!raw) return res.status(400).json({ error: 'symbol required' });
  // normalize: "SHIB", "SHIBUSD", "SHIB/USD", "SHIB-USD" -> "SHIB/USD"
  raw = raw.replace(/[-/]?USDT?$/, '').replace(/[^A-Z0-9]/g, '');
  if (!raw) return res.status(400).json({ error: 'invalid symbol' });
  const symbol = `${raw}/USD`;
  const name = String(req.body?.name ?? raw);

  // Validate the symbol has tradable data on Yahoo BEFORE adding it.
  // Otherwise the user adds a token, it doesn't appear, and they have no idea why.
  try {
    const axios = (await import('axios')).default;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${raw}-USD`;
    const r = await axios.get(url, {
      params: { interval: '5m', range: '5d' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    });
    const bars = r.data?.chart?.result?.[0]?.timestamp?.length ?? 0;
    if (bars < 50) {
      return res.status(400).json({
        error: `'${raw}' has insufficient market data on Yahoo Finance. Supported: BTC, ETH, SOL, AVAX, LINK, XRP, ADA, DOGE, LTC, SHIB, DOT, BNB, ATOM, ARB, OP, TON, NEAR, SEI, INJ, TIA.`,
      });
    }
  } catch (e: any) {
    return res.status(400).json({
      error: `'${raw}' could not be validated. Supported: BTC, ETH, SOL, AVAX, LINK, XRP, ADA, DOGE, LTC, SHIB, DOT, BNB, ATOM, ARB, OP, TON, NEAR, SEI, INJ, TIA.`,
    });
  }

  const asset = await prisma.asset.upsert({
    where: { symbol },
    update: { active: true },
    create: { symbol, name, type: 'CRYPTO', active: true },
  });
  res.json(asset);
}));

/** Remove a pick from the watchlist (soft — keeps trade history). */
api.delete('/assets', h(async (req, res) => {
  const symbol = String(req.query.symbol ?? '');
  if (!symbol) return res.status(400).json({ error: 'symbol query param required' });
  await prisma.asset.update({ where: { symbol }, data: { active: false } }).catch(() => {});
  res.json({ ok: true, removed: symbol });
}));

api.get('/assets/:symbol/candles', h(async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const tf = (req.query.tf as string) ?? '1m';
  const limit = Math.min(Number(req.query.limit ?? 300), 1000);
  const asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) return res.status(404).json({ error: 'asset not found' });
  const candles = await prisma.candle.findMany({
    where: { assetId: asset.id, timeframe: tf },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  res.json(candles.reverse());
}));

/** Confidence-over-time + reasons for one asset (the chart reasoning timeline). */
api.get('/assets/:symbol/scores', h(async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const limit = Math.min(Number(req.query.limit ?? 200), 1000);
  const asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) return res.status(404).json({ error: 'asset not found' });
  const scores = await prisma.assetScore.findMany({
    where: { assetId: asset.id },
    orderBy: { id: 'desc' },
    take: limit,
  });
  res.json(scores.reverse());
}));

api.get('/lessons', h(async (_req, res) => {
  res.json(await prisma.lesson.findMany({ orderBy: { severity: 'desc' } }));
}));

api.get('/signals', h(async (_req, res) => {
  res.json(await prisma.signal.findMany({ orderBy: { reliability: 'desc' } }));
}));

api.get('/weights', h(async (_req, res) => {
  const current = await prisma.strategyWeight.findFirst({ orderBy: { id: 'desc' } });
  const history = await prisma.strategyWeight.findMany({ orderBy: { id: 'desc' }, take: 50 });
  res.json({ current, history: history.reverse() });
}));

api.get('/config', h(async (_req, res) => {
  res.json(await getAgentConfig());
}));

api.put('/config', h(async (req, res) => {
  const allowed = [
    'confidenceThreshold',
    'maxConcurrent',
    'riskPerTradePct',
    'maxDailyDrawdownPct',
    'maxSwitchesPerDay',
    'cooldownBars',
    'switchEdgeMargin',
    'takeProfitPct',
    'stopLossPct',
    'maxLeverage',
    'minHoldBars',
    'allowLeverage',
    'minCycleSeconds',
    'maxCycleSeconds',
    'paused',
    'startingCapital',
  ];
  const data: Record<string, unknown> = {};
  for (const k of allowed) if (k in req.body) data[k] = req.body[k];
  res.json(await prisma.agentConfig.update({ where: { id: 1 }, data }));
}));

/** Manual trade — place your own trade independently of the agent. */
api.post('/trades/manual', h(async (req, res) => {
  const { symbol, direction, notional, leverage = 1 } = req.body;
  if (!symbol || !direction || !notional) {
    return res.status(400).json({ error: 'symbol, direction and notional required' });
  }
  if (!['LONG', 'SHORT'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be LONG or SHORT' });
  }
  const asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) return res.status(404).json({ error: `asset ${symbol} not found — add it to watchlist first` });

  // Use latest known price
  const candle = await prisma.candle.findFirst({
    where: { assetId: asset.id, timeframe: '5m' },
    orderBy: { timestamp: 'desc' },
  });
  if (!candle) return res.status(400).json({ error: 'no price data yet — wait for first cycle' });

  const price = candle.close;
  const lev = Math.max(1, Math.min(Number(leverage), 10));
  const qty = (Number(notional) * lev) / price;

  const config = await getAgentConfig();
  const sl = direction === 'LONG'
    ? price * (1 - config.stopLossPct / 100)
    : price * (1 + config.stopLossPct / 100);
  const tp = direction === 'LONG'
    ? price * (1 + config.takeProfitPct / 100)
    : price * (1 - config.takeProfitPct / 100);

  const trade = await prisma.trade.create({
    data: {
      assetId: asset.id,
      direction: direction as any,
      status: 'OPEN',
      source: 'manual',
      qty,
      entryPrice: price,
      entryConfidence: 0,
      entryReasons: ['manual trade'],
      entrySignals: [],
      leverage: lev,
      stopLoss: sl,
      takeProfit: tp,
    },
  });
  res.json({ ...trade, symbol });
}));

/** Close a manual trade. */
api.post('/trades/:id/close', h(async (req, res) => {
  const id = Number(req.params.id);
  const trade = await prisma.trade.findUnique({ where: { id }, include: { asset: true } });
  if (!trade) return res.status(404).json({ error: 'trade not found' });
  if (trade.status === 'CLOSED') return res.status(400).json({ error: 'already closed' });

  // Use latest price
  const candle = await prisma.candle.findFirst({
    where: { assetId: trade.assetId, timeframe: '5m' },
    orderBy: { timestamp: 'desc' },
  });
  const exitPrice = candle?.close ?? trade.entryPrice;
  const dirMul = trade.direction === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - trade.entryPrice) * trade.qty * dirMul;
  const pnlPct = (exitPrice / trade.entryPrice - 1) * 100 * dirMul;

  const closed = await prisma.trade.update({
    where: { id },
    data: { status: 'CLOSED', exitPrice, exitTime: new Date(), exitReason: 'manual_close', pnl, pnlPct },
  });
  res.json({ ...closed, symbol: trade.asset.symbol });
}));

/** Mirror a Hyperliquid trade in the DB for analytics. */
api.post('/trades/exchange', h(async (req, res) => {
  const { symbol, direction, qty, entryPrice, leverage = 1, exchangeOrderId } = req.body;
  if (!symbol || !direction || !qty || !entryPrice) {
    return res.status(400).json({ error: 'symbol, direction, qty, entryPrice required' });
  }
  let asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) {
    asset = await prisma.asset.create({ data: { symbol, name: symbol, type: 'CRYPTO' } });
  }
  const trade = await prisma.trade.create({
    data: {
      assetId: asset.id,
      direction: direction as any,
      status: 'OPEN',
      source: 'manual',
      exchange: 'hyperliquid',
      exchangeOrderId: exchangeOrderId ?? null,
      qty: Number(qty),
      entryPrice: Number(entryPrice),
      entryConfidence: 0,
      entryReasons: ['hyperliquid live trade'],
      entrySignals: [],
      leverage: Number(leverage),
    },
  });
  res.json({ ...trade, symbol });
}));

/** Test Telegram bot connection. */
api.get('/telegram/test', h(async (_req, res) => {
  res.json(await testConnection());
}));

/** Force a market scan post immediately. */
api.post('/telegram/post', h(async (_req, res) => {
  const sent = await postMarketScan(true);
  res.json({ sent });
}));

/** Force a news post immediately. */
api.post('/telegram/news', h(async (_req, res) => {
  const sent = await postNews(true);
  res.json({ sent });
}));

/** Test X connection. */
api.get('/x/test', h(async (_req, res) => {
  res.json(await testXConnection());
}));

/** Force a market scan post to X immediately. */
api.post('/x/post', h(async (_req, res) => {
  const sent = await postMarketScan(true); // posts to both Telegram + X
  res.json({ sent });
}));

/** Force a news post to X immediately. */
api.post('/x/news', h(async (_req, res) => {
  const sent = await postNews(true); // posts to both Telegram + X
  res.json({ sent });
}));

api.post('/agent/start', h(async (_req, res) => res.json(startLoop())));
api.post('/agent/stop', h(async (_req, res) => res.json(stopLoop())));
api.post('/agent/cycle', h(async (_req, res) => res.json(await runCycle())));

/**
 * Full reset: wipe all trades, snapshots and decisions.
 * Keeps assets, signals, lessons and strategy weights (learning is valuable).
 * Sets starting capital to the provided amount (default $200).
 */
api.post('/agent/reset', h(async (req, res) => {
  stopLoop();
  const capital = Number(req.body?.capital ?? 200);

  await prisma.trade.deleteMany({});
  await prisma.portfolioSnapshot.deleteMany({});
  await prisma.assetScore.deleteMany({});
  await prisma.agentDecision.deleteMany({});
  await prisma.agentConfig.update({
    where: { id: 1 },
    data: { startingCapital: capital },
  });

  startLoop();
  res.json({ ok: true, capital, message: `Reset complete. Starting fresh with $${capital}.` });
}));

/** Real-time sentiment for an asset (news headlines + Fear & Greed). */
api.get('/intel/sentiment/:symbol', h(async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  res.json(await getSentiment(symbol));
}));

/** Whale + manipulation analysis for an asset (from stored candles). */
api.get('/intel/whale/:symbol', h(async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) return res.status(404).json({ error: 'asset not found' });
  const provider = getProvider();
  const candles = await provider.tick({ id: asset.id, symbol }, '5m', 300);
  res.json(analyzeWhales(candles));
}));

/** Market regime for an asset. */
api.get('/intel/regime/:symbol', h(async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) return res.status(404).json({ error: 'asset not found' });
  const provider = getProvider();
  const candles = await provider.tick({ id: asset.id, symbol }, '5m', 300);
  res.json(detectRegime(candles));
}));

/** Run a backtest on an asset's historical data. */
api.get('/backtest/:symbol', h(async (req, res) => {
  const symbol = decodeURIComponent(req.params.symbol);
  const asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) return res.status(404).json({ error: 'asset not found' });
  const provider = getProvider();
  const candles = await provider.tick({ id: asset.id, symbol }, '5m', 800);
  const result = runBacktest(candles, symbol);
  res.json(result);
}));

/** Performance analytics from realized trades. */
api.get('/analytics', h(async (_req, res) => {
  const trades = await prisma.trade.findMany({ where: { status: 'CLOSED' }, include: { asset: true } });
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0);
  const losses = trades.filter((t) => (t.pnl ?? 0) <= 0);
  const totalPnl = trades.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const avgWin = wins.length ? wins.reduce((a, t) => a + (t.pnl ?? 0), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + (t.pnl ?? 0), 0) / losses.length : 0;
  const grossWin = wins.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + (t.pnl ?? 0), 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  // by regime
  const regimes: Record<string, { trades: number; wins: number; pnl: number }> = {};
  for (const t of trades) {
    const r = t.regime || 'unknown';
    if (!regimes[r]) regimes[r] = { trades: 0, wins: 0, pnl: 0 };
    regimes[r].trades++;
    if ((t.pnl ?? 0) > 0) regimes[r].wins++;
    regimes[r].pnl += t.pnl ?? 0;
  }

  // by exit reason
  const byReason: Record<string, { count: number; pnl: number }> = {};
  for (const t of trades) {
    const r = t.exitReason || 'unknown';
    if (!byReason[r]) byReason[r] = { count: 0, pnl: 0 };
    byReason[r].count++;
    byReason[r].pnl += t.pnl ?? 0;
  }

  // by hour
  const byHour: Record<number, { count: number; pnl: number }> = {};
  for (const t of trades) {
    const h = t.exitTime ? new Date(t.exitTime).getUTCHours() : 0;
    if (!byHour[h]) byHour[h] = { count: 0, pnl: 0 };
    byHour[h].count++;
    byHour[h].pnl += t.pnl ?? 0;
  }

  res.json({
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length * 100) : 0,
    totalPnl,
    avgWin,
    avgLoss,
    profitFactor: pf,
    bestTrade: trades.length ? Math.max(...trades.map(t => t.pnl ?? 0)) : 0,
    worstTrade: trades.length ? Math.min(...trades.map(t => t.pnl ?? 0)) : 0,
    byRegime: regimes,
    byExitReason: byReason,
    byHour,
  });
}));
