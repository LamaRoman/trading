import axios from 'axios';
import { log } from '../logger';

const UA = 'Mozilla/5.0 (TradingAgent/1.0)';
const TIMEOUT = 8000;

export interface Headline {
  title: string;
  source: string;
  score: number; // -1..+1
  ts: Date;
}

export interface SentimentResult {
  score: number;       // 0..100 (50 neutral)
  headlines: Headline[];
  fearGreed: number | null;  // 0..100
  reasons: string[];
}

// ---- simple keyword-based headline scorer ----
const BULL_WORDS = [
  'surge', 'soar', 'rally', 'bull', 'breakout', 'high', 'record', 'gain',
  'buy', 'accumulate', 'upgrade', 'approval', 'adopt', 'institutional',
  'etf', 'inflow', 'moon', 'pump', 'explode', 'rocket', 'long',
  'support', 'recovery', 'beat', 'profit', 'growth', 'optimism',
];
const BEAR_WORDS = [
  'crash', 'dump', 'plunge', 'bear', 'sell', 'decline', 'drop', 'low',
  'ban', 'hack', 'scam', 'rug', 'fraud', 'risk', 'warning', 'fear',
  'outflow', 'liquidat', 'short', 'collapse', 'tank', 'loss', 'panic',
  'reject', 'resistance', 'downgrade', 'sec', 'lawsuit', 'regulate',
];

function scoreTitle(title: string): number {
  const t = title.toLowerCase();
  let s = 0;
  for (const w of BULL_WORDS) if (t.includes(w)) s += 0.15;
  for (const w of BEAR_WORDS) if (t.includes(w)) s -= 0.15;
  return Math.max(-1, Math.min(1, s));
}

/** Does the headline relate to a specific asset (symbol match)? */
function relates(title: string, symbol: string): boolean {
  const t = title.toLowerCase();
  const base = symbol.split('/')[0].toLowerCase();
  const NAMES: Record<string, string[]> = {
    btc: ['bitcoin', 'btc'], eth: ['ethereum', 'eth', 'ether'],
    sol: ['solana', 'sol'], avax: ['avalanche', 'avax'],
    link: ['chainlink', 'link'], xrp: ['xrp', 'ripple'],
    ada: ['cardano', 'ada'], doge: ['dogecoin', 'doge'],
    ltc: ['litecoin', 'ltc'], shib: ['shiba', 'shib'],
    matic: ['polygon', 'matic'], pepe: ['pepe'],
  };
  const terms = NAMES[base] ?? [base];
  return terms.some((w) => t.includes(w)) || t.includes('crypto') || t.includes('bitcoin');
}

// ---- sources ----

async function yahooNews(query: string): Promise<Headline[]> {
  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v1/finance/search`,
      { params: { q: query, newsCount: 12 }, headers: { 'User-Agent': UA }, timeout: TIMEOUT },
    );
    return (data.news ?? []).map((n: any) => ({
      title: n.title ?? '',
      source: 'yahoo',
      score: scoreTitle(n.title ?? ''),
      ts: new Date(n.providerPublishTime ? n.providerPublishTime * 1000 : Date.now()),
    }));
  } catch (e: any) {
    log.warn('Yahoo news fetch failed:', e?.message);
    return [];
  }
}

async function cointelegraphRSS(): Promise<Headline[]> {
  try {
    const { data } = await axios.get('https://cointelegraph.com/rss', {
      headers: { 'User-Agent': UA }, timeout: TIMEOUT,
    });
    const titles = (data as string).match(/<title><!\[CDATA\[(.*?)\]\]>/g) ?? [];
    return titles.slice(0, 15).map((m: string) => {
      const t = m.replace(/<title><!\[CDATA\[/, '').replace(/\]\]>/, '');
      return { title: t, source: 'cointelegraph', score: scoreTitle(t), ts: new Date() };
    });
  } catch (e: any) {
    log.warn('Cointelegraph RSS failed:', e?.message);
    return [];
  }
}

async function redditCrypto(): Promise<Headline[]> {
  try {
    const { data } = await axios.get(
      'https://www.reddit.com/r/CryptoCurrency/hot.json?limit=20',
      { headers: { 'User-Agent': UA }, timeout: TIMEOUT },
    );
    return (data?.data?.children ?? []).map((c: any) => ({
      title: c.data?.title ?? '',
      source: 'reddit',
      score: scoreTitle(c.data?.title ?? ''),
      ts: new Date((c.data?.created_utc ?? 0) * 1000),
    }));
  } catch (e: any) {
    // Reddit blocks some IPs (403) — non-fatal
    log.warn('Reddit fetch failed (expected in some envs):', e?.message);
    return [];
  }
}

let _fgCache: { v: number; at: number } | null = null;

async function fearGreedIndex(): Promise<number | null> {
  // cache for 10 min (it only updates daily)
  if (_fgCache && Date.now() - _fgCache.at < 600_000) return _fgCache.v;
  try {
    const { data } = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: TIMEOUT });
    const v = Number(data?.data?.[0]?.value ?? 50);
    _fgCache = { v, at: Date.now() };
    return v;
  } catch {
    return _fgCache?.v ?? null;
  }
}

/**
 * Fetch sentiment for a specific asset. Aggregates multiple sources, filters for
 * relevance, and returns a 0..100 score (50 = neutral, >50 bullish).
 */
export async function getSentiment(symbol: string): Promise<SentimentResult> {
  const base = symbol.split('/')[0];

  // Fetch all sources in parallel (fail-tolerant)
  const [yahoo, ct, reddit, fg] = await Promise.all([
    yahooNews(base + ' crypto'),
    cointelegraphRSS(),
    redditCrypto(),
    fearGreedIndex(),
  ]);

  const all = [...yahoo, ...ct, ...reddit];
  // keep headlines relevant to this asset + broad crypto sentiment
  const relevant = all.filter((h) => relates(h.title, symbol));
  const headlines = relevant.slice(0, 20);

  const reasons: string[] = [];

  // headline sentiment average → 0..100 scale
  let headlineScore = 50;
  if (headlines.length >= 2) {
    const avg = headlines.reduce((a, h) => a + h.score, 0) / headlines.length;
    headlineScore = Math.round(50 + avg * 40); // scale [-1,1] → [10,90]
    const bullCount = headlines.filter((h) => h.score > 0.05).length;
    const bearCount = headlines.filter((h) => h.score < -0.05).length;
    reasons.push(
      `news sentiment: ${bullCount} bullish / ${bearCount} bearish of ${headlines.length} headlines`,
    );
  } else {
    reasons.push('insufficient news data — sentiment neutral');
  }

  // Fear & Greed (macro-level)
  let fgScore = 50;
  if (fg != null) {
    fgScore = fg;
    const label = fg <= 25 ? 'Extreme Fear' : fg <= 40 ? 'Fear' : fg <= 60 ? 'Neutral' : fg <= 75 ? 'Greed' : 'Extreme Greed';
    reasons.push(`Fear & Greed: ${fg} (${label})`);
  }

  // Combined: 60% headlines, 40% Fear & Greed (macro mood is powerful)
  const combined = Math.round(headlineScore * 0.6 + fgScore * 0.4);

  return {
    score: Math.max(0, Math.min(100, combined)),
    headlines,
    fearGreed: fg,
    reasons,
  };
}
