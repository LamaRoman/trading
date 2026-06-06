import { prisma } from '../db';
import { log } from '../logger';
import { getProvider } from '../market/provider';
import { scoreAsset } from '../analysis/confidence';
import { getSentiment, SentimentResult } from '../intelligence/sentiment';
import { analyzeWhales } from '../intelligence/whale';
import { detectRegime, regimeMultiplier, RegimeResult } from '../analysis/regime';
import { analyzeMultiTF, mtfConfidenceModifier, MTFResult } from '../analysis/multitf';
import { preTradeGuard } from '../analysis/guardrails';
import { decideLeverage } from '../analysis/leverage';
import { decideMode } from '../analysis/mode';
import { decideCycleTime } from '../analysis/cycletime';
import { postMarketScan, postNews, checkMilestones } from '../intelligence/marketpost';
import { getAgentConfig, getWeights, setLivePrice } from '../state';
import { config as appConfig } from '../config';
import { getPortfolio } from '../trading/portfolio';
import { positionNotional, MIN_NOTIONAL } from '../trading/risk';
import { openTrade, closeTrade, checkBracket } from '../trading/executor';
import { learnFromTrade, getActiveLessons, getSignalReliability, decayLessons } from '../learning';
import { ConfidenceResult } from '../types';

const TIMEFRAME = '5m';
const CANDLE_LIMIT = 300;

// In-memory guardrail state (single long-running process).
const cooldown = new Map<number, number>(); // assetId -> cycles remaining
let switchesToday = 0;
let dayKey = '';
let dayStartEquity = 0;
let haltedForDay = false;
let cycleCount = 0;

interface Scored {
  asset: { id: number; symbol: string };
  res: ConfidenceResult;
  regime: RegimeResult;
  mtf: MTFResult;
  sentiment?: SentimentResult;
}

export interface CycleResult {
  decisionId: number;
  action: string;
  summary: string;
  leaderboard: Array<{ symbol: string; confidence: number; direction: string }>;
  equity: number;
  openCount: number;
  nextCycleSeconds: number;
}

export async function runCycle(): Promise<CycleResult> {
  cycleCount += 1;
  const provider = getProvider();
  const config = await getAgentConfig();
  const weights = await getWeights();
  const signalRel = await getSignalReliability();
  const assets = await prisma.asset.findMany({ where: { active: true } });

  // Decay old lessons so the agent can try again after learning
  await decayLessons();

  // Also fetch prices for assets with open positions (may be inactive/removed from watchlist)
  const openTrades = await prisma.trade.findMany({
    where: { status: 'OPEN' },
    include: { asset: true },
  });
  const activeIds = new Set(assets.map((a) => a.id));
  const openOnlyAssets = openTrades
    .filter((t) => !activeIds.has(t.assetId))
    .map((t) => t.asset);

  // 1) SCAN — fetch candles + intelligence + score every asset
  const scored: Scored[] = [];
  const priceByAssetId = new Map<number, number>();
  let simTime: Date | null = null;

  // Price-only fetch for inactive assets with open trades
  for (const a of openOnlyAssets) {
    try {
      const candles = await provider.tick({ id: a.id, symbol: a.symbol }, TIMEFRAME, CANDLE_LIMIT);
      if (candles.length) {
        const last = candles[candles.length - 1];
        priceByAssetId.set(a.id, last.close);
        setLivePrice(a.id, last.close);
      }
    } catch (e: any) {
      log.error(`price fetch ${a.symbol}:`, e?.message ?? e);
    }
  }

  for (const a of assets) {
    try {
      const candles = await provider.tick({ id: a.id, symbol: a.symbol }, TIMEFRAME, CANDLE_LIMIT);
      const lastTs = candles[candles.length - 1]?.timestamp;
      if (lastTs && (!simTime || lastTs > simTime)) simTime = lastTs;

      // Phase 2: intelligence + Phase 3: regime + MTF
      const [sentiment, whale] = await Promise.all([
        getSentiment(a.symbol).catch((e: any) => { log.warn(`sentiment ${a.symbol}:`, e?.message); return undefined; }),
        Promise.resolve(analyzeWhales(candles)),
      ]);

      const regime = detectRegime(candles);
      const regMul = regimeMultiplier(regime);

      // MTF: try fetching 1h candles if provider supports it
      let candles1h: typeof candles | undefined;
      try { candles1h = await provider.tick({ id: a.id, symbol: a.symbol }, '1h', 120); } catch {}
      const mtf = analyzeMultiTF(candles, candles1h);
      const mtfMul = mtfConfidenceModifier(mtf);

      const res = scoreAsset(candles, weights, { sentiment, whale }, signalRel);
      if (res) {
        // Apply regime + MTF modifiers to confidence
        res.confidence = Math.round(Math.min(100, res.confidence * regMul * mtfMul));
        res.regime = regime.regime;
        if (regime.description) res.reasons.push(`regime: ${regime.description}`);
        if (mtf.description) res.reasons.push(mtf.description);
        scored.push({ asset: a, res, regime, mtf, sentiment });
        priceByAssetId.set(a.id, res.price);
        setLivePrice(a.id, res.price);
      }
    } catch (e: any) {
      log.error(`scan ${a.symbol}:`, e?.message ?? e);
    }
  }

  // 2) RANK by confidence
  scored.sort((x, y) => y.res.confidence - x.res.confidence);
  const scoreByAsset = new Map(scored.map((s) => [s.asset.id, s.res]));

  // persist this cycle's leaderboard (also serves as confidence-over-time)
  const at = simTime ?? new Date();
  const decision = await prisma.agentDecision.create({
    data: { summary: '(pending)', action: '(pending)', createdAt: at },
  });
  await prisma.assetScore.createMany({
    data: scored.map((s) => ({
      decisionId: decision.id,
      assetId: s.asset.id,
      confidence: s.res.confidence,
      direction: s.res.direction,
      price: s.res.price,
      technical: s.res.technical,
      sentiment: s.res.sentiment,
      whale: s.res.whale,
      momentum: s.res.momentum,
      reasons: s.res.reasons,
      createdAt: at,
    })),
  });

  // daily reset + cooldown decay
  const today = new Date().toISOString().slice(0, 10);
  let pf = await getPortfolio(priceByAssetId);
  if (today !== dayKey) {
    dayKey = today;
    switchesToday = 0;
    dayStartEquity = pf.equity;
    haltedForDay = false;
  }
  for (const [k, v] of cooldown) {
    if (v <= 1) cooldown.delete(k);
    else cooldown.set(k, v - 1);
  }

  const actions: string[] = [];

  // 3) EXIT checks (bracket hit, thesis flip, confidence fade)
  for (const pos of pf.positions) {
    const price = priceByAssetId.get(pos.assetId) ?? pos.price;
    let reason = checkBracket(pos, price);
    // bracket exits fill at the bracket level (not the gapped current price)
    let exitPrice = price;
    if (reason === 'stop_loss' && pos.stopLoss != null) exitPrice = pos.stopLoss;
    else if (reason === 'take_profit' && pos.takeProfit != null) exitPrice = pos.takeProfit;
    if (!reason) {
      const cur = scoreByAsset.get(pos.assetId);
      if (cur) {
        // Thesis invalidated: direction flipped — always exit immediately
        if (cur.direction !== pos.direction && cur.direction !== 'FLAT') {
          reason = 'thesis_invalidated';
        } else {
          // Confidence faded: only exit after minHoldBars to prevent churn.
          // Use a wider gap (-20 instead of -10) so we don't bail on small wobbles.
          const heldMs = at.getTime() - new Date(pos.entryTime).getTime();
          const heldBars = heldMs / (appConfig.agentCycleSeconds * 1000);
          const hasHeldLongEnough = heldBars >= config.minHoldBars;
          if (hasHeldLongEnough && cur.confidence < config.confidenceThreshold - 20) {
            reason = 'confidence_faded';
          }
        }
      }
    }
    if (reason) {
      const closed = await closeTrade(pos.id, exitPrice, reason, at);
      await learnFromTrade({ ...closed, leverage: closed.leverage ?? 1 });
      // Apply cooldown on ANY close (not just losses) — prevents immediate re-entry
      cooldown.set(pos.assetId, reason === 'take_profit' ? 2 : config.cooldownBars);
      actions.push(`EXIT ${pos.symbol} (${reason})`);
    }
  }

  // drawdown halt
  pf = await getPortfolio(priceByAssetId);
  const ddPct = dayStartEquity > 0 ? ((dayStartEquity - pf.equity) / dayStartEquity) * 100 : 0;
  if (ddPct >= config.maxDailyDrawdownPct) haltedForDay = true;

  // 4) ENTRIES / SWITCHES
  if (!config.paused && !haltedForDay) {
    const lessons = await getActiveLessons();
    const held = new Set(pf.positions.map((p) => p.assetId));
    const candidates = scored.filter(
      (s) =>
        (s.res.direction === 'LONG' || s.res.direction === 'SHORT') &&
        s.res.confidence >= config.confidenceThreshold &&
        !held.has(s.asset.id) &&
        !cooldown.has(s.asset.id),
    );

    for (const cand of candidates) {
      pf = await getPortfolio(priceByAssetId);

      // dynamic mode decision (spot vs leverage)
      const modeD = decideMode(
        cand.res.direction as 'LONG' | 'SHORT',
        cand.res.confidence,
        cand.regime,
        cand.mtf,
        lessons,
        config.allowLeverage,
      );
      // Spot mode: force LONG only, leverage=1, skip if direction is SHORT
      if (modeD.mode === 'spot' && cand.res.direction === 'SHORT') {
        actions.push(`SKIP ${cand.asset.symbol} SHORT (spot mode — no shorts)`);
        continue;
      }

      // dynamic leverage decision (only relevant in leverage mode)
      const levD = modeD.mode === 'leverage'
        ? decideLeverage(cand.res.confidence, cand.regime, cand.mtf, lessons, config.maxLeverage)
        : { leverage: 1, reasons: ['spot mode → 1x'] };
      const lev = levD.leverage;

      // Phase 3: deep pre-trade guardrails
      const fg = cand.sentiment?.fearGreed ?? null;
      const guard = preTradeGuard(
        cand.asset.symbol,
        cand.res.direction as 'LONG' | 'SHORT',
        cand.res.confidence,
        cand.res.signals,
        cand.regime,
        cand.mtf,
        lessons,
        pf.positions.map((p) => ({ symbol: p.symbol, direction: p.direction })),
        fg,
        lev,
      );
      if (guard.blocked) {
        actions.push(`BLOCKED ${cand.asset.symbol} (${guard.reason})`);
        log.agent(`🛑 blocked ${cand.asset.symbol}: ${guard.reason}`);
        continue;
      }

      // Dynamic stop-loss: tighten if the agent keeps holding losers
      const heldLoserLesson = lessons.find((l) => l.category === 'held_a_loser' && l.active && l.severity >= 30);
      const slPct = heldLoserLesson
        ? config.stopLossPct * 0.6  // 40% tighter stops (e.g. 3% → 1.8%)
        : config.stopLossPct;

      if (pf.openCount < config.maxConcurrent) {
        const notional = positionNotional(pf, config);
        if (notional >= MIN_NOTIONAL) {
          await openTrade({
            assetId: cand.asset.id,
            symbol: cand.asset.symbol,
            direction: cand.res.direction as 'LONG' | 'SHORT',
            notional,
            price: cand.res.price,
            confidence: cand.res.confidence,
            reasons: [
              ...cand.res.reasons,
              ...modeD.reasons.map((r) => `mode: ${r}`),
              ...levD.reasons.map((r) => `leverage: ${r}`),
              ...(heldLoserLesson ? [`lesson: tighter stop (${slPct.toFixed(1)}% vs ${config.stopLossPct}%)`] : []),
            ],
            signals: cand.res.signals,
            regime: cand.res.regime,
            takeProfitPct: config.takeProfitPct,
            stopLossPct: slPct,
            leverage: lev,
            at,
          });
          actions.push(`ENTER ${cand.res.direction} ${modeD.mode === 'spot' ? 'SPOT' : `${lev}x`} ${cand.asset.symbol} @${cand.res.confidence}%`);
        }
      } else if (switchesToday < config.maxSwitchesPerDay) {
        // opportunity-cost switch: replace the weakest held only if the edge clears the margin
        let weakest: { assetId: number; symbol: string; conf: number; id: number } | null = null;
        for (const p of pf.positions) {
          const cur = scoreByAsset.get(p.assetId);
          const conf = cur && cur.direction === p.direction ? cur.confidence : 0;
          if (!weakest || conf < weakest.conf) {
            weakest = { assetId: p.assetId, symbol: p.symbol, conf, id: p.id };
          }
        }
        // Increase switch margin if the agent has been switching too early
        const switchMargin = lessons.some((l) => l.category === 'switched_too_early' && l.active && l.severity >= 30)
          ? config.switchEdgeMargin * 2  // double the required edge
          : config.switchEdgeMargin;
        if (weakest && cand.res.confidence > weakest.conf + switchMargin) {
          const wp = priceByAssetId.get(weakest.assetId) ?? cand.res.price;
          const closed = await closeTrade(weakest.id, wp, 'switch', at);
          await learnFromTrade(closed);
          if ((closed.pnl ?? 0) < 0) cooldown.set(weakest.assetId, config.cooldownBars);
          switchesToday += 1;
          pf = await getPortfolio(priceByAssetId);
          const notional = positionNotional(pf, config);
          if (notional >= MIN_NOTIONAL) {
            await openTrade({
              assetId: cand.asset.id,
              symbol: cand.asset.symbol,
              direction: cand.res.direction as 'LONG' | 'SHORT',
              notional,
              price: cand.res.price,
              confidence: cand.res.confidence,
              reasons: [
                ...cand.res.reasons,
                ...modeD.reasons.map((r) => `mode: ${r}`),
                ...levD.reasons.map((r) => `leverage: ${r}`),
                ...(heldLoserLesson ? [`lesson: tighter stop (${slPct.toFixed(1)}%)`] : []),
              ],
              signals: cand.res.signals,
              regime: cand.res.regime,
              takeProfitPct: config.takeProfitPct,
              stopLossPct: slPct,
              leverage: lev,
            });
            actions.push(
              `SWITCH ${weakest.symbol}→${cand.asset.symbol} ${modeD.mode === 'spot' ? 'SPOT' : `${lev}x`} (+${(
                cand.res.confidence - weakest.conf
              ).toFixed(0)} edge)`,
            );
          }
        }
      }
    }
  }

  // 5) snapshot + finalize decision record
  pf = await getPortfolio(priceByAssetId);
  await prisma.portfolioSnapshot.create({
    data: {
      cash: pf.cash,
      openPositionsValue: pf.openPositionsValue,
      equity: pf.equity,
      realizedPnl: pf.realizedPnl,
      openTrades: pf.openCount,
      createdAt: at,
    },
  });

  // Dynamic cycle time based on current market regimes
  const allRegimes = scored.map((s) => s.regime);
  const cycleTime = decideCycleTime(allRegimes, config.minCycleSeconds, config.maxCycleSeconds);
  log.agent(`⏱  next cycle in ${cycleTime.seconds}s (${cycleTime.reason})`);

  const top = scored[0];
  const action = actions.length
    ? actions.join(' | ')
    : haltedForDay
      ? 'HALTED (daily drawdown)'
      : config.paused
        ? 'PAUSED'
        : 'HOLD';
  const summary = `eq $${pf.equity.toFixed(0)} (${pf.totalReturnPct >= 0 ? '+' : ''}${pf.totalReturnPct.toFixed(
    2,
  )}%) | open ${pf.openCount}/${config.maxConcurrent} | top ${top ? top.asset.symbol : '-'} ${
    top ? top.res.confidence : 0
  }% ${top ? top.res.direction : ''}`;
  await prisma.agentDecision.update({ where: { id: decision.id }, data: { action, summary } });

  log.agent(`cycle #${cycleCount} | ${action} | ${summary}`);

  // Telegram: post market scan + news on interval + check milestones
  postMarketScan().catch(() => {});
  postNews().catch(() => {});
  checkMilestones().catch(() => {});

  return {
    decisionId: decision.id,
    action,
    summary,
    leaderboard: scored
      .slice(0, 8)
      .map((s) => ({ symbol: s.asset.symbol, confidence: s.res.confidence, direction: s.res.direction })),
    equity: pf.equity,
    openCount: pf.openCount,
    nextCycleSeconds: cycleTime.seconds,
  };
}
