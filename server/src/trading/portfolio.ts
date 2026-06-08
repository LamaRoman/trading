import { prisma } from '../db';
import { getAgentConfig } from '../state';

export interface OpenPosition {
  id: number;
  assetId: number;
  symbol: string;
  direction: string;
  qty: number;
  entryPrice: number;
  price: number;
  notional: number;
  upnl: number;
  upnlPct: number;
  entryConfidence: number;
  leverage: number;
  effectiveLeverage: number;
  margin: number;
  addedMargin: number;
  stopLoss: number | null;
  takeProfit: number | null;
  liqPrice: number | null;
  entryTime: Date;
}

export interface PortfolioState {
  startingCapital: number;
  cash: number;
  equity: number;
  openPositionsValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  openCount: number;
  positions: OpenPosition[];
  totalReturnPct: number;
}

/**
 * Derive full portfolio state from trades + starting capital.
 *
 * equity = startingCapital + realizedPnL + unrealizedPnL
 * cash   = startingCapital + realizedPnL - margin reserved
 * Margin reserved = notional / leverage (only margin is locked, not full notional).
 */
export async function getPortfolio(
  priceByAssetId: Map<number, number>,
): Promise<PortfolioState> {
  const config = await getAgentConfig();
  const closedAgg = await prisma.trade.aggregate({
    _sum: { pnl: true },
    where: { status: 'CLOSED' },
  });
  const realized = closedAgg._sum.pnl ?? 0;

  const open = await prisma.trade.findMany({
    where: { status: 'OPEN' },
    include: { asset: true },
  });

  let reserved = 0;
  let upnl = 0;

  const positions: OpenPosition[] = open.map((t) => {
    const price = priceByAssetId.get(t.assetId) ?? t.entryPrice;
    const lev = t.leverage || 1;
    const dirMul = t.direction === 'LONG' ? 1 : -1;
    const u = (price - t.entryPrice) * t.qty * dirMul;
    const baseMargin = (t.entryPrice * t.qty) / lev;
    const totalMargin = baseMargin + (t.addedMargin ?? 0);
    reserved += totalMargin;
    upnl += u;

    const notional = t.entryPrice * t.qty;
    const effLev = totalMargin > 0 ? notional / totalMargin : lev;

    // Liquidation price uses effective leverage (accounts for added/removed margin)
    const liqPrice = effLev > 1
      ? t.direction === 'LONG'
        ? t.entryPrice * (1 - 1 / effLev)
        : t.entryPrice * (1 + 1 / effLev)
      : null;

    return {
      id: t.id,
      assetId: t.assetId,
      symbol: t.asset.symbol,
      direction: t.direction,
      qty: t.qty,
      entryPrice: t.entryPrice,
      price,
      notional,
      upnl: u,
      upnlPct: (price / t.entryPrice - 1) * 100 * dirMul,
      entryConfidence: t.entryConfidence,
      leverage: lev,
      effectiveLeverage: parseFloat(effLev.toFixed(2)),
      margin: totalMargin,
      addedMargin: t.addedMargin ?? 0,
      stopLoss: t.stopLoss,
      takeProfit: t.takeProfit,
      liqPrice,
      entryTime: t.entryTime,
    };
  });

  const equity = config.startingCapital + realized + upnl;
  const cash = config.startingCapital + realized - reserved;

  return {
    startingCapital: config.startingCapital,
    cash,
    equity,
    openPositionsValue: equity - cash,
    realizedPnl: realized,
    unrealizedPnl: upnl,
    openCount: open.length,
    positions,
    totalReturnPct: (equity / config.startingCapital - 1) * 100,
  };
}
