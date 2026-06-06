import axios from 'axios';
import { prisma } from '../db';
import { sendMessage } from './telegram';
import { postMarketScanToX, postNewsToX } from './xpost';
import { log } from '../logger';
import { config } from '../config';

const UA = 'Mozilla/5.0 (TradingAgent/1.0)';

let lastNewsAt: Date | null = null;

let lastPostAt: Date | null = null;

interface ScoreRow {
  symbol: string;
  confidence: number;
  direction: string;
  price: number;
  technical: number;
  sentiment: number;
  whale: number;
  momentum: number;
  reasons: any;
}

function dirEmoji(dir: string): string {
  if (dir === 'LONG')  return '🟢';
  if (dir === 'SHORT') return '🔴';
  return '⚪';
}

function confBar(c: number): string {
  const filled = Math.round(c / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${c}%`;
}

function fmtPrice(n: number): string {
  if (n >= 1000)  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (n >= 1)     return n.toFixed(3);
  if (n >= 0.001) return n.toFixed(5);
  return n.toFixed(8);
}

/** Escape HTML special chars so Telegram HTML parser doesn't choke. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface SRLevels {
  support: number[];
  resistance: number[];
}

interface SRByTimeframe {
  tf: string;
  label: string;
  support: number[];
  resistance: number[];
}

/**
 * Calculate support & resistance from pivot points for a given timeframe.
 * Uses 3-bar pivot confirmation and clusters nearby levels within 0.8%.
 */
async function getSupportResistance(
  assetId: number,
  currentPrice: number,
  timeframe: string,
  limit: number,
): Promise<SRLevels> {
  const candles = await prisma.candle.findMany({
    where: { assetId, timeframe },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  if (candles.length < 10) return { support: [], resistance: [] };

  const pivotHighs: number[] = [];
  const pivotLows:  number[] = [];

  for (let i = 3; i < candles.length - 3; i++) {
    const c = candles[i];
    const lH = [candles[i-1].high, candles[i-2].high, candles[i-3].high];
    const rH = [candles[i+1].high, candles[i+2].high, candles[i+3].high];
    const lL = [candles[i-1].low,  candles[i-2].low,  candles[i-3].low];
    const rL = [candles[i+1].low,  candles[i+2].low,  candles[i+3].low];
    if (c.high > Math.max(...lH) && c.high > Math.max(...rH)) pivotHighs.push(c.high);
    if (c.low  < Math.min(...lL) && c.low  < Math.min(...rL)) pivotLows.push(c.low);
  }

  function cluster(levels: number[]): number[] {
    if (!levels.length) return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const groups: number[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
      const last = groups[groups.length - 1];
      const avg  = last.reduce((a, b) => a + b, 0) / last.length;
      if (Math.abs(sorted[i] - avg) / avg < 0.008) last.push(sorted[i]);
      else groups.push([sorted[i]]);
    }
    return groups
      .sort((a, b) => b.length - a.length)
      .slice(0, 3)
      .map(g => g.reduce((a, b) => a + b, 0) / g.length)
      .sort((a, b) => a - b);
  }

  const clusteredResistance = cluster(pivotHighs).filter(r => r > currentPrice * 0.999).slice(0, 2);
  const clusteredSupport    = cluster(pivotLows).filter(s => s < currentPrice * 1.001).slice(-2).reverse();

  // Fallback: if no resistance found (price at recent highs),
  // use the highest candle high + round-number extensions above current price
  let resistance = clusteredResistance;
  if (!resistance.length) {
    const recentHigh = Math.max(...candles.slice(0, 50).map(c => c.high));
    const fallbacks: number[] = [];
    // Add recent high if it's above or near current price
    if (recentHigh >= currentPrice) fallbacks.push(recentHigh);
    // Add round-number levels above current price (+1.5% and +3%)
    fallbacks.push(currentPrice * 1.015);
    fallbacks.push(currentPrice * 1.030);
    resistance = fallbacks.slice(0, 2);
  }

  return { resistance, support: clusteredSupport };
}

/** Get S/R across multiple timeframes for a richer picture. */
async function getMultiTFLevels(
  assetId: number,
  currentPrice: number,
): Promise<SRByTimeframe[]> {
  const timeframes = [
    { tf: '5m',  label: '15Min', limit: 100 },  // ~8 hours of 5m candles
    { tf: '1h',  label: '1H',    limit: 72  },  // 3 days of 1h candles
    { tf: '1d',  label: '1D',    limit: 60  },  // 2 months of daily candles
  ];

  const results: SRByTimeframe[] = [];
  for (const { tf, label, limit } of timeframes) {
    const sr = await getSupportResistance(assetId, currentPrice, tf, limit);
    if (sr.support.length || sr.resistance.length) {
      results.push({ tf, label, ...sr });
    }
  }
  return results;
}

function sentimentEmoji(score: number): string {
  if (score > 0.3)  return '🟢';
  if (score < -0.3) return '🔴';
  return '🟡';
}

function fearGreedLabel(fg: number): string {
  if (fg <= 20) return `😱 Extreme Fear (${fg})`;
  if (fg <= 40) return `😟 Fear (${fg})`;
  if (fg <= 60) return `😐 Neutral (${fg})`;
  if (fg <= 80) return `😄 Greed (${fg})`;
  return `🤑 Extreme Greed (${fg})`;
}

/** Fetch top crypto headlines from CoinTelegraph + Yahoo. */
async function fetchNewsHeadlines(): Promise<{ title: string; source: string; score: number }[]> {
  const headlines: { title: string; source: string; score: number }[] = [];

  // CoinTelegraph RSS
  try {
    const { data } = await axios.get('https://cointelegraph.com/rss', {
      headers: { 'User-Agent': UA }, timeout: 8000,
    });
    const titles = (data as string).match(/<title><!\[CDATA\[(.*?)\]\]>/g) ?? [];
    for (const m of titles.slice(1, 10)) {
      const t = m.replace(/<title><!\[CDATA\[/, '').replace(/\]\]>/, '').trim();
      if (t.length > 10) {
        const tl = t.toLowerCase();
        let score = 0;
        const bullWords = ['surge', 'soar', 'rally', 'bull', 'record', 'gain', 'approval', 'etf', 'inflow'];
        const bearWords = ['crash', 'dump', 'plunge', 'bear', 'ban', 'hack', 'fraud', 'warning', 'lawsuit'];
        for (const w of bullWords) if (tl.includes(w)) score += 1;
        for (const w of bearWords) if (tl.includes(w)) score -= 1;
        headlines.push({ title: t, source: 'CoinTelegraph', score });
      }
    }
  } catch {}

  // Yahoo Finance crypto news
  try {
    const { data } = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
      params: { q: 'crypto bitcoin ethereum', newsCount: 8 },
      headers: { 'User-Agent': UA }, timeout: 8000,
    });
    for (const n of data.news ?? []) {
      if (n.title && n.title.length > 10) {
        const tl = n.title.toLowerCase();
        let score = 0;
        const bullWords = ['surge', 'soar', 'rally', 'bull', 'record', 'gain', 'approval', 'etf'];
        const bearWords = ['crash', 'dump', 'plunge', 'bear', 'ban', 'hack', 'warning', 'lawsuit'];
        for (const w of bullWords) if (tl.includes(w)) score += 1;
        for (const w of bearWords) if (tl.includes(w)) score -= 1;
        headlines.push({ title: n.title, source: 'Yahoo Finance', score });
      }
    }
  } catch {}

  // Deduplicate by similar titles
  const seen = new Set<string>();
  return headlines.filter(h => {
    const key = h.title.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

/** Post 3 — Crypto News. */
export async function postNews(force = false): Promise<boolean> {
  // Post news every 2 hours (independent of market scan interval)
  const intervalMs = 2 * 60 * 60 * 1000;
  if (!force && lastNewsAt && Date.now() - lastNewsAt.getTime() < intervalMs) {
    return false;
  }

  try {
    const headlines = await fetchNewsHeadlines();
    if (!headlines.length) return false;

    // Fear & Greed
    let fg: number | null = null;
    try {
      const { data } = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 });
      fg = Number(data?.data?.[0]?.value ?? null);
    } catch {}

    const now = new Date();
    const timeStr = now.toUTCString().replace(' GMT', ' UTC');

    let msg = `<b>📰 Crypto News Update</b>\n`;
    msg += `<i>${timeStr}</i>\n`;
    msg += `${'─'.repeat(30)}\n\n`;

    for (const h of headlines) {
      const emoji = sentimentEmoji(h.score);
      msg += `${emoji} ${esc(h.title)}\n`;
      msg += `   <i>— ${esc(h.source)}</i>\n\n`;
    }

    if (fg !== null) {
      msg += `${'─'.repeat(30)}\n`;
      msg += `📊 Market Sentiment: <b>${fearGreedLabel(fg)}</b>\n\n`;
    }

    msg += `<b>👉 Trade the news with our agent</b>\n`;
    msg += `🔗 <b>t.me/YetiTraders</b>`;

    await sendMessage(msg);
    lastNewsAt = new Date();
    log.info('📰 News post sent to Telegram');

    // Also post to X
    postNewsToX(headlines, fg, force).catch(() => {});

    return true;
  } catch (e: any) {
    log.error('News post failed:', e?.message);
    return false;
  }
}

/** Fetch latest scores from DB. */
async function getLatestScores() {
  const lastDecision = await prisma.agentDecision.findFirst({ orderBy: { id: 'desc' } });
  if (!lastDecision) return null;
  return prisma.assetScore.findMany({
    where: { decisionId: lastDecision.id },
    include: { asset: true },
    orderBy: { confidence: 'desc' },
    take: 8,
  });
}

/** Post 1 — Top Opportunities (high confidence, clear direction). */
async function postTopOpportunities(
  scores: (ScoreRow & { asset: { id: number; symbol: string } })[],
  force = false,
): Promise<void> {
  const topPicks = scores
    .filter(s => s.direction !== 'FLAT' && s.confidence >= 40)
    .slice(0, 3);

  if (!topPicks.length) return;

  const now = new Date();
  const timeStr = now.toUTCString().replace(' GMT', ' UTC');

  let msg = `<b>🔥 Top Opportunities</b>\n`;
  msg += `<i>${timeStr}</i>\n`;
  msg += `${'─'.repeat(30)}\n`;

  for (let i = 0; i < topPicks.length; i++) {
    const s = topPicks[i];
    const emoji = dirEmoji(s.direction);
    const reasons = Array.isArray(s.reasons) ? s.reasons : [];
    const topReason = reasons.find((r: string) =>
      !r.startsWith('regime') && !r.startsWith('leverage') && !r.startsWith('mode')
    ) ?? reasons[0] ?? '';

    const mtfLevels = await getMultiTFLevels(s.asset.id, s.price);

    msg += `\n${i + 1}. ${emoji} <b>${s.asset.symbol}</b> — <b>${s.direction}</b>\n`;
    msg += `   ${confBar(s.confidence)}\n`;
    msg += `   💵 Price: <b>$${fmtPrice(s.price)}</b>\n`;
    if (topReason) msg += `   💡 ${esc(topReason)}\n`;

    if (mtfLevels.length) {
      msg += `   📐 <b>Key Levels:</b>\n`;
      for (const { label, resistance, support } of mtfLevels) {
        if (!resistance.length && !support.length) continue;
        msg += `   <b>[${label}]</b>\n`;
        if (resistance.length) msg += `   🔴 Resistance: ${resistance.map(r => `$${fmtPrice(r)}`).join(' · ')}\n`;
        if (support.length)    msg += `   🟢 Support:    ${support.map(s => `$${fmtPrice(s)}`).join(' · ')}\n`;
      }
    }
  }

  msg += `\n<b>👉 Trade live with our agent</b>\n`;
  msg += `🔗 <b>t.me/YetiTraders</b>`;

  await sendMessage(msg);

  // Also post to X — extract picks with their S/R levels for X format
  const xPicks = await Promise.all(topPicks.map(async s => {
    const mtf = await getMultiTFLevels(s.asset.id, s.price);
    const h1 = mtf.find(t => t.label === '1H');
    const reasons = Array.isArray(s.reasons) ? s.reasons : [];
    const topReason = reasons.find((r: string) =>
      !r.startsWith('regime') && !r.startsWith('leverage') && !r.startsWith('mode')
    ) ?? '';
    return {
      symbol: s.asset.symbol,
      direction: s.direction,
      confidence: s.confidence,
      reason: topReason,
      resistance: (h1?.resistance ?? []).map(r => `$${fmtPrice(r)}`),
      support:    (h1?.support    ?? []).map(s => `$${fmtPrice(s)}`),
    };
  }));
  postMarketScanToX(xPicks, force).catch(() => {});
}

/** Post 2 — Coins to Watch (building momentum, not ready yet). */
async function postCoinsToWatch(
  scores: (ScoreRow & { asset: { id: number; symbol: string } })[],
  force = false,
): Promise<void> {
  const watchlist = scores
    .filter(s => s.direction === 'FLAT' || s.confidence < 65)
    .slice(0, 4);

  if (!watchlist.length) return;

  const now = new Date();
  const timeStr = now.toUTCString().replace(' GMT', ' UTC');

  let msg = `<b>👀 Coins to Watch</b>\n`;
  msg += `<i>${timeStr}</i>\n`;
  msg += `${'─'.repeat(30)}\n\n`;

  for (const s of watchlist) {
    const mtfLevels = await getMultiTFLevels(s.asset.id, s.price);
    msg += `⚪ <b>${s.asset.symbol}</b> — $${fmtPrice(s.price)}\n`;
    for (const { label, resistance, support } of mtfLevels) {
      if (!resistance.length && !support.length) continue;
      msg += `   <b>[${label}]</b>\n`;
      if (resistance.length) msg += `   🔴 Resistance: ${resistance.map(r => `$${fmtPrice(r)}`).join(' · ')}\n`;
      if (support.length)    msg += `   🟢 Support:    ${support.map(s => `$${fmtPrice(s)}`).join(' · ')}\n`;
    }
    msg += `\n`;
  }

  msg += `<b>👉 Trade live with our agent</b>\n`;
  msg += `🔗 <b>t.me/YetiTraders</b>`;

  await sendMessage(msg);
}

/** Build and send both posts to Telegram. */
export async function postMarketScan(force = false): Promise<boolean> {
  const intervalMs = config.telegram.postIntervalHours * 60 * 60 * 1000;
  if (!force && lastPostAt && Date.now() - lastPostAt.getTime() < intervalMs) {
    return false;
  }

  try {
    const scores = await getLatestScores();
    if (!scores || !scores.length) return false;

    await postTopOpportunities(scores as any, force);
    // Small delay between posts so they don't appear at the exact same second
    await new Promise(r => setTimeout(r, 2000));
    await postCoinsToWatch(scores as any, force);

    lastPostAt = new Date();
    return true;
  } catch (e: any) {
    log.error('Market post failed:', e?.message);
    return false;
  }
}

/** Post a milestone when equity crosses key thresholds. */
export async function checkMilestones(): Promise<void> {
  const pf  = await prisma.portfolioSnapshot.findFirst({ orderBy: { id: 'desc' } });
  const cfg = await prisma.agentConfig.findFirst({ where: { id: 1 } });
  if (!pf || !cfg) return;

  const returnPct = ((pf.equity - cfg.startingCapital) / cfg.startingCapital) * 100;
  const milestones = [5, 10, 25, 50, 100];

  for (const m of milestones) {
    const key = `milestone_${m}`;
    const already = await prisma.agentDecision.findFirst({
      where: { action: { contains: key } },
    });
    if (!already && returnPct >= m) {
      const msg =
        `🚀 <b>Milestone Hit! +${m}% Return!</b>\n\n` +
        `Our agent just crossed <b>+${m}%</b> total return!\n\n` +
        `📈 Starting capital: <b>$${cfg.startingCapital}</b>\n` +
        `💰 Current equity: <b>$${pf.equity.toFixed(2)}</b>\n` +
        `📊 Return: <b>+${returnPct.toFixed(2)}%</b>\n\n` +
        `The agent trades 24/7, learns from every trade, and manages risk automatically.\n\n` +
        `👉 Join <b>@YetiTraders</b>`;
      await sendMessage(msg);
      await prisma.agentDecision.create({
        data: { summary: `milestone ${m}%`, action: key },
      });
      log.info(`🎯 Milestone post sent: +${m}%`);
    }
  }
}
