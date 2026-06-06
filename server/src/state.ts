import { prisma } from './db';
import { Weights } from './analysis/confidence';

/** Load the single AgentConfig row, creating it with defaults if missing. */
export async function getAgentConfig() {
  return prisma.agentConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export const DEFAULT_WEIGHTS: Weights = {
  technical: 0.4,
  sentiment: 0.25,
  whale: 0.2,
  momentum: 0.15,
};

/** Load the latest strategy weights (falls back to defaults). */
export async function getWeights(): Promise<Weights> {
  const w = await prisma.strategyWeight.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!w) return { ...DEFAULT_WEIGHTS };
  return { technical: w.technical, sentiment: w.sentiment, whale: w.whale, momentum: w.momentum };
}

const livePrices = new Map<number, number>();

export function setLivePrice(assetId: number, price: number) {
  livePrices.set(assetId, price);
}

export function getLivePrices(): Map<number, number> {
  return livePrices;
}
