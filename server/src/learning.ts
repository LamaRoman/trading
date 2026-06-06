import { prisma } from './db';
import { log } from './logger';

/** Trade shape the learning system needs (subset of the Prisma Trade). */
export interface ClosableTrade {
  id: number;
  assetId: number;
  pnl: number | null;
  pnlPct: number | null;
  direction: string;
  regime: string | null;
  exitReason: string | null;
  entrySignals: unknown;
  leverage: number;
  asset?: { symbol: string };
}

function categoryForSignal(name: string): string {
  if (name.startsWith('whale') || name.startsWith('pump') || name.startsWith('stop_hunt')) return 'whale';
  if (name.startsWith('sentiment')) return 'sentiment';
  if (name.startsWith('momentum') || name === 'volume_breakout') return 'momentum';
  return 'technical';
}

const MISTAKE_DESCRIPTIONS: Record<string, string> = {
  bought_into_resistance:
    'Entered LONG near resistance / upper band — chased into a likely rejection.',
  shorted_into_support:
    'Entered SHORT near support / lower band — fought a likely bounce.',
  stopped_out_in_chop: 'Stopped out while the market was ranging (no trend to ride).',
  switched_too_early: 'Switched out of a position at a loss, chasing another setup.',
  held_a_loser: 'Let a loss run to the stop instead of cutting earlier.',
  overleveraged_loss:
    'Leverage amplified a loss beyond normal risk tolerance — reduce leverage or tighten stop.',
  overleveraged_stop:
    'Stopped out at high leverage — the stop was too tight for the volatility at this leverage.',
  churned_position:
    'Confidence faded almost immediately after entry — wait for stronger conviction before entering.',
  loss_general: 'Losing trade not matching a specific known pattern.',
};

function tagMistakes(trade: ClosableTrade): string[] {
  const tags: string[] = [];
  const signals = (Array.isArray(trade.entrySignals) ? trade.entrySignals : []) as string[];
  const lev = trade.leverage || 1;

  if (trade.direction === 'LONG' && (signals.includes('bollinger_upper') || signals.includes('peak')))
    tags.push('bought_into_resistance');
  if (
    trade.direction === 'SHORT' &&
    (signals.includes('bollinger_lower') || signals.includes('rock_bottom'))
  )
    tags.push('shorted_into_support');
  if (trade.exitReason === 'stop_loss' && trade.regime === 'ranging') tags.push('stopped_out_in_chop');
  if (trade.exitReason === 'switch') tags.push('switched_too_early');

  // leverage-specific: loss amplified beyond 2% equity or stopped out at 2x+
  if (lev >= 2 && trade.exitReason === 'stop_loss') tags.push('overleveraged_stop');
  if (lev >= 2 && (trade.pnlPct ?? 0) <= -3) tags.push('overleveraged_loss');

  // churn: confidence faded very quickly (loss < 0.5% means held barely any time)
  if (trade.exitReason === 'confidence_faded' && Math.abs(trade.pnlPct ?? 0) < 0.5)
    tags.push('churned_position');

  if (trade.exitReason === 'stop_loss' && tags.length === 0) tags.push('held_a_loser');
  if (tags.length === 0) tags.push('loss_general');
  return tags;
}

/**
 * Learn from a closed trade: update signal reliability, tag mistakes, accumulate
 * lessons, and adapt strategy weights. This is the "never repeat the same
 * mistake" engine.
 */
export async function learnFromTrade(trade: ClosableTrade): Promise<void> {
  const won = (trade.pnl ?? 0) > 0;
  const signals = (Array.isArray(trade.entrySignals) ? trade.entrySignals : []) as string[];

  // 1) signal reliability
  for (const name of signals) {
    const sig = await prisma.signal.upsert({
      where: { name },
      update: {},
      create: { name, category: categoryForSignal(name) },
    });
    await prisma.signalOutcome.create({
      data: { signalId: sig.id, tradeId: trade.id, won, pnlPct: trade.pnlPct ?? 0 },
    });
    const wins = sig.wins + (won ? 1 : 0);
    const losses = sig.losses + (won ? 0 : 1);
    const reliability = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 50;
    await prisma.signal.update({ where: { id: sig.id }, data: { wins, losses, reliability } });
  }

  // 2) mistakes + lessons — capture ALL losses including tiny churn losses
  const realLoss =
    !won &&
    (trade.exitReason === 'stop_loss' ||
      trade.exitReason === 'switch' ||
      trade.exitReason === 'confidence_faded' ||
      (trade.pnlPct ?? 0) < 0);
  if (realLoss) {
    const tags = tagMistakes(trade);
    await prisma.trade.update({ where: { id: trade.id }, data: { mistakeTags: tags } });
    for (const tag of tags) {
      const existing = await prisma.lesson.findUnique({ where: { category: tag } });
      if (existing) {
        const occurrences = existing.occurrences + 1;
        const totalPnl = existing.totalPnl + (trade.pnl ?? 0);
        await prisma.lesson.update({
          where: { category: tag },
          data: {
            occurrences,
            totalPnl,
            lastSeen: new Date(),
            severity: Math.min(100, occurrences * 10 + Math.abs(totalPnl) / 10),
            active: true,
          },
        });
      } else {
        await prisma.lesson.create({
          data: {
            category: tag,
            description: MISTAKE_DESCRIPTIONS[tag] ?? tag,
            occurrences: 1,
            totalPnl: trade.pnl ?? 0,
            severity: 10 + Math.abs(trade.pnl ?? 0) / 10,
            active: true,
          },
        });
      }
    }
    log.agent(`📓 learned from loss on ${trade.asset?.symbol ?? trade.assetId}: ${tags.join(', ')}`);
  }

  // 3) adapt weights from accumulated signal reliability
  await adaptWeights();
}

/** Gently shift decision weights toward the categories that actually win. */
async function adaptWeights(): Promise<void> {
  const closed = await prisma.trade.count({ where: { status: 'CLOSED' } });
  if (closed < 20) return; // need a real baseline of outcomes before adapting

  const cats = ['technical', 'whale', 'momentum', 'sentiment'] as const;
  const targets: Record<string, number> = {};
  for (const c of cats) {
    const sigs = await prisma.signal.findMany({ where: { category: c } });
    const withData = sigs.filter((s) => s.wins + s.losses >= 2);
    targets[c] = withData.length
      ? withData.reduce((a, s) => a + s.reliability, 0) / withData.length
      : 50;
  }

  const current = await prisma.strategyWeight.findFirst({ orderBy: { createdAt: 'desc' } });
  const curW = current
    ? { technical: current.technical, sentiment: current.sentiment, whale: current.whale, momentum: current.momentum }
    : { technical: 0.4, sentiment: 0.25, whale: 0.2, momentum: 0.15 };

  // Phase 2: all four categories participate in weight adaptation.
  const raw = {
    technical: Math.max(1, targets.technical - 40),
    sentiment: Math.max(1, targets.sentiment - 40),
    whale: Math.max(1, targets.whale - 40),
    momentum: Math.max(1, targets.momentum - 40),
  };
  const rawTotal = raw.technical + raw.sentiment + raw.whale + raw.momentum;
  const target = {
    technical: raw.technical / rawTotal,
    sentiment: raw.sentiment / rawTotal,
    whale: raw.whale / rawTotal,
    momentum: raw.momentum / rawTotal,
  };

  // gentle EMA blend so weights drift rather than jump
  const a = 0.15;
  const blended = {
    technical: curW.technical * (1 - a) + target.technical * a,
    sentiment: curW.sentiment * (1 - a) + target.sentiment * a,
    whale: curW.whale * (1 - a) + target.whale * a,
    momentum: curW.momentum * (1 - a) + target.momentum * a,
  };
  const sum = blended.technical + blended.sentiment + blended.whale + blended.momentum;
  const norm = {
    technical: blended.technical / sum,
    sentiment: blended.sentiment / sum,
    whale: blended.whale / sum,
    momentum: blended.momentum / sum,
  };

  const drift =
    Math.abs(norm.technical - curW.technical) +
    Math.abs(norm.sentiment - curW.sentiment) +
    Math.abs(norm.whale - curW.whale) +
    Math.abs(norm.momentum - curW.momentum);
  if (drift > 0.01) {
    await prisma.strategyWeight.create({
      data: { ...norm, reason: 'adapted from signal reliability' },
    });
    log.agent(
      `⚖️  weights adapted → tech ${(norm.technical * 100).toFixed(0)} / sent ${(
        norm.sentiment * 100
      ).toFixed(0)} / whale ${(norm.whale * 100).toFixed(0)} / mom ${(norm.momentum * 100).toFixed(0)}`,
    );
  }
}

/** Active, high-severity lessons the agent currently guards against. */
export async function getActiveLessons() {
  return prisma.lesson.findMany({ where: { active: true, severity: { gte: 30 } } });
}

/** Load signal reliability map for confidence scoring. */
export async function getSignalReliability(): Promise<Map<string, number>> {
  const signals = await prisma.signal.findMany({
    where: { wins: { gte: 1 } },  // only signals with some track record
  });
  const map = new Map<string, number>();
  for (const s of signals) {
    if (s.wins + s.losses >= 3) {  // need at least 3 outcomes to be meaningful
      map.set(s.name, s.reliability);
    }
  }
  return map;
}

/**
 * Decay lesson severity over time. Called each cycle.
 * If a mistake hasn't been repeated recently, its severity slowly fades,
 * allowing the agent to try again with better signals.
 */
export async function decayLessons(): Promise<void> {
  const lessons = await prisma.lesson.findMany({ where: { active: true } });
  const now = Date.now();
  for (const l of lessons) {
    const hoursSinceLastSeen = (now - new Date(l.lastSeen).getTime()) / (1000 * 60 * 60);
    // Decay: reduce severity by 1 point per 6 hours since last occurrence
    // A severity-30 lesson fades to inactive after ~7.5 days of no repeats
    if (hoursSinceLastSeen > 6) {
      const decay = Math.floor(hoursSinceLastSeen / 6);
      const newSeverity = Math.max(0, l.severity - decay);
      const stillActive = newSeverity >= 10;
      await prisma.lesson.update({
        where: { id: l.id },
        data: { severity: newSeverity, active: stillActive },
      });
    }
  }
}

/** Block-on-repeat: returns the violated lesson category, or null if clear. */
export function violatesLesson(
  direction: string,
  signals: string[],
  lessons: { category: string }[],
): string | null {
  const cats = new Set(lessons.map((l) => l.category));
  if (
    cats.has('bought_into_resistance') &&
    direction === 'LONG' &&
    (signals.includes('bollinger_upper') || signals.includes('peak'))
  )
    return 'bought_into_resistance';
  if (
    cats.has('shorted_into_support') &&
    direction === 'SHORT' &&
    (signals.includes('bollinger_lower') || signals.includes('rock_bottom'))
  )
    return 'shorted_into_support';
  return null;
}
