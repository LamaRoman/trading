import { PortfolioState } from './portfolio';

export interface RiskInputs {
  riskPerTradePct: number;
  stopLossPct: number;
  maxConcurrent: number;
}

/**
 * Position size (in $ margin to reserve) for a new trade.
 *
 * The risk-based size caps the loss at `riskPerTradePct` of equity if the stop
 * is hit. Leverage is applied later in the executor — this returns the margin
 * amount, not the total exposure.
 */
export function positionNotional(p: PortfolioState, cfg: RiskInputs): number {
  const riskAmount = p.equity * (cfg.riskPerTradePct / 100);
  const riskBased = riskAmount / (cfg.stopLossPct / 100);
  const slotCap = p.equity / Math.max(1, cfg.maxConcurrent);
  const cashCap = Math.max(0, p.cash * 0.98);
  return Math.max(0, Math.min(riskBased, slotCap, cashCap));
}

/** Minimum notional worth trading (avoids dust positions). */
export const MIN_NOTIONAL = 50;
