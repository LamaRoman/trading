import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config';
import { log } from '../logger';

// Peak posting hours (UTC) — when crypto Twitter is most active
const PEAK_HOURS = [9, 13, 19]; // 9am, 1pm, 7pm UTC

let lastMarketPostAt: Date | null = null;
let lastNewsPostAt:   Date | null = null;
let client: TwitterApi | null = null;

function getClient(): TwitterApi | null {
  if (!config.x.enabled) return null;
  if (!config.x.apiKey || !config.x.apiSecret ||
      !config.x.accessToken || !config.x.accessTokenSecret) return null;
  if (!client) {
    client = new TwitterApi({
      appKey:            config.x.apiKey,
      appSecret:         config.x.apiSecret,
      accessToken:       config.x.accessToken,
      accessSecret:      config.x.accessTokenSecret,
    });
  }
  return client;
}

export function isConfigured(): boolean {
  return !!(config.x.apiKey && config.x.apiSecret &&
            config.x.accessToken && config.x.accessTokenSecret);
}

/** Check if current time is within ±30 min of a peak hour. */
function isNearPeakHour(): boolean {
  const nowUTC = new Date().getUTCHours() + new Date().getUTCMinutes() / 60;
  return PEAK_HOURS.some(h => Math.abs(nowUTC - h) <= 0.5);
}

/** Post a thread to X. First tweet is the hook, rest are details. */
async function postThread(tweets: string[]): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  try {
    await c.v2.tweetThread(tweets.map(text => ({ text })));
    log.info(`🐦 X thread posted (${tweets.length} tweets)`);
    return true;
  } catch (e: any) {
    log.error('X post failed:', e?.data?.detail ?? e?.message ?? e);
    return false;
  }
}

/** Test X connection. */
export async function testXConnection(): Promise<{ ok: boolean; username?: string; error?: string }> {
  const c = getClient();
  if (!c) return { ok: false, error: 'X API keys not configured' };
  try {
    const me = await c.v2.me();
    return { ok: true, username: me.data.username };
  } catch (e: any) {
    return { ok: false, error: e?.data?.detail ?? e?.message };
  }
}

/**
 * Post market scan as a thread.
 * Format optimised for the "For You" algorithm:
 *  - Tweet 1: strong hook (stops the scroll)
 *  - Tweet 2: top pick details
 *  - Tweet 3: remaining picks
 *  - Tweet 4: reply with Telegram link (avoids link suppression)
 */
export async function postMarketScanToX(
  picks: { symbol: string; direction: string; confidence: number; reason?: string;
           resistance: string[]; support: string[] }[],
  force = false,
): Promise<boolean> {
  if (!isConfigured()) return false;

  // Only post at peak hours (or forced)
  if (!force && !isNearPeakHour()) return false;

  // Respect 4-hour interval
  const intervalMs = 4 * 60 * 60 * 1000;
  if (!force && lastMarketPostAt && Date.now() - lastMarketPostAt.getTime() < intervalMs) {
    return false;
  }

  if (!picks.length) return false;

  const top = picks[0];
  const dirEmoji = top.direction === 'LONG' ? '🟢' : '🔴';
  const confStars = top.confidence >= 75 ? '⭐⭐⭐' : top.confidence >= 65 ? '⭐⭐' : '⭐';

  // Tweet 1 — hook (must stop the scroll)
  const hook =
    `🧠 AI just spotted a ${top.confidence}% confidence ${top.direction} signal\n\n` +
    `${dirEmoji} ${top.symbol}\n` +
    `${confStars} Confidence: ${top.confidence}%\n` +
    (top.reason ? `💡 ${top.reason}\n` : '') +
    `\n#crypto #${top.symbol.split('/')[0].toLowerCase()} #trading`;

  // Tweet 2 — key levels for top pick
  const levels =
    `📐 Key levels for ${top.symbol}:\n\n` +
    (top.resistance.length ? `🔴 Resistance: ${top.resistance.join(' · ')}\n` : '') +
    (top.support.length    ? `🟢 Support:    ${top.support.join(' · ')}\n`    : '') +
    `\nWatch these zones closely 👀`;

  // Tweet 3 — other picks (if any)
  const threads: string[] = [hook, levels];

  if (picks.length > 1) {
    const others = picks.slice(1).map(p => {
      const e = p.direction === 'LONG' ? '🟢' : '🔴';
      return `${e} ${p.symbol} — ${p.direction} (${p.confidence}%)`;
    }).join('\n');

    threads.push(
      `📊 More opportunities right now:\n\n${others}\n\n` +
      `Full analysis 👇 join us on Telegram (link in bio)`,
    );
  }

  const sent = await postThread(threads);
  if (sent) lastMarketPostAt = new Date();
  return sent;
}

/**
 * Post crypto news as a thread.
 * Tweet 1: hook with top story
 * Tweet 2-3: remaining headlines
 * Tweet 4: sentiment + CTA
 */
export async function postNewsToX(
  headlines: { title: string; source: string; score: number }[],
  fearGreed: number | null,
  force = false,
): Promise<boolean> {
  if (!isConfigured()) return false;
  if (!force && !isNearPeakHour()) return false;

  const intervalMs = 3 * 60 * 60 * 1000;
  if (!force && lastNewsPostAt && Date.now() - lastNewsPostAt.getTime() < intervalMs) {
    return false;
  }

  if (!headlines.length) return false;

  const sentEmoji = (s: number) => s > 0.3 ? '🟢' : s < -0.3 ? '🔴' : '🟡';

  // Tweet 1 — top story hook
  const top = headlines[0];
  const hook =
    `📰 ${sentEmoji(top.score)} ${top.title}\n\n` +
    `— ${top.source}\n\n` +
    `#crypto #bitcoin #cryptonews`;

  // Tweet 2 — remaining headlines
  const rest = headlines.slice(1, 5)
    .map(h => `${sentEmoji(h.score)} ${h.title}`)
    .join('\n\n');

  const threads: string[] = [hook];
  if (rest) threads.push(`More headlines:\n\n${rest}`);

  // Tweet 3 — sentiment summary
  if (fearGreed !== null) {
    const fgLabel =
      fearGreed <= 20 ? '😱 Extreme Fear' :
      fearGreed <= 40 ? '😟 Fear' :
      fearGreed <= 60 ? '😐 Neutral' :
      fearGreed <= 80 ? '😄 Greed' : '🤑 Extreme Greed';

    threads.push(
      `📊 Market Sentiment: ${fgLabel} (${fearGreed}/100)\n\n` +
      `Our agent is trading these signals 24/7.\n` +
      `Full analysis + signals → Telegram (link in bio)`,
    );
  }

  const sent = await postThread(threads);
  if (sent) lastNewsPostAt = new Date();
  return sent;
}
