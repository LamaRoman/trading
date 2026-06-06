import { prisma } from '../db';
import { log } from '../logger';

export interface OpenParams {
  assetId: number;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  notional: number;
  price: number;
  confidence: number;
  reasons: string[];
  signals: string[];
  regime: string;
  takeProfitPct: number;
  stopLossPct: number;
  leverage?: number;
  at?: Date;
}

/** Open a paper trade with bracket orders (TP + SL). */
export async function openTrade(p: OpenParams) {
  const leverage = p.leverage ?? 1;
  const qty = (p.notional * leverage) / p.price;
  const tp =
    p.direction === 'LONG'
      ? p.price * (1 + p.takeProfitPct / 100)
      : p.price * (1 - p.takeProfitPct / 100);
  const sl =
    p.direction === 'LONG'
      ? p.price * (1 - p.stopLossPct / 100)
      : p.price * (1 + p.stopLossPct / 100);

  const t = await prisma.trade.create({
    data: {
      assetId: p.assetId,
      direction: p.direction,
      status: 'OPEN',
      qty,
      entryPrice: p.price,
      entryTime: p.at ?? undefined,
      entryConfidence: p.confidence,
      entryReasons: p.reasons,
      entrySignals: p.signals,
      regime: p.regime,
      leverage,
      stopLoss: sl,
      takeProfit: tp,
    },
  });

  log.trade(
    `OPEN ${p.direction} ${leverage}x ${p.symbol} @ ${p.price.toFixed(4)} | ` +
    `margin $${p.notional.toFixed(0)} (notional $${(p.notional * leverage).toFixed(0)}) | ` +
    `conf ${p.confidence}% | TP ${tp.toFixed(4)} SL ${sl.toFixed(4)}`,
  );
  return t;
}

/** Returns an exit reason if a bracket level is breached, else null. */
export function checkBracket(
  trade: { direction: string; stopLoss: number | null; takeProfit: number | null },
  price: number,
): string | null {
  if (trade.direction === 'LONG') {
    if (trade.stopLoss != null && price <= trade.stopLoss) return 'stop_loss';
    if (trade.takeProfit != null && price >= trade.takeProfit) return 'take_profit';
  } else {
    if (trade.stopLoss != null && price >= trade.stopLoss) return 'stop_loss';
    if (trade.takeProfit != null && price <= trade.takeProfit) return 'take_profit';
  }
  return null;
}

/** Close a paper trade and compute realized P&L. */
export async function closeTrade(tradeId: number, exitPrice: number, reason: string, at?: Date) {
  const t = await prisma.trade.findUnique({ where: { id: tradeId }, include: { asset: true } });
  if (!t) throw new Error(`trade ${tradeId} not found`);

  const dirMul = t.direction === 'LONG' ? 1 : -1;
  const pnl = (exitPrice - t.entryPrice) * t.qty * dirMul;
  const pnlPct = (exitPrice / t.entryPrice - 1) * 100 * dirMul;

  const closed = await prisma.trade.update({
    where: { id: tradeId },
    data: { status: 'CLOSED', exitPrice, exitTime: at ?? new Date(), exitReason: reason, pnl, pnlPct },
    include: { asset: true },
  });

  log.trade(
    `CLOSE ${t.direction} ${t.leverage}x ${t.asset.symbol} @ ${exitPrice.toFixed(4)} | ` +
    `${reason} | P&L $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`,
  );
  return closed;
}
