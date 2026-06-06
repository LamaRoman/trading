import axios from 'axios';
import { config } from '../config';
import { log } from '../logger';

const BASE = `https://api.telegram.org/bot${config.telegram.botToken}`;

/** Send a message to the configured channel. */
export async function sendMessage(text: string): Promise<boolean> {
  if (!config.telegram.botToken || !config.telegram.channelId) return false;
  try {
    await axios.post(`${BASE}/sendMessage`, {
      chat_id: config.telegram.channelId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    log.info(`📢 Telegram post sent to ${config.telegram.channelId}`);
    return true;
  } catch (e: any) {
    log.error('Telegram send failed:', e?.response?.data?.description ?? e?.message);
    return false;
  }
}

/** Test the bot connection — returns true if working. */
export async function testConnection(): Promise<{ ok: boolean; botName?: string; error?: string }> {
  if (!config.telegram.botToken) return { ok: false, error: 'No bot token configured' };
  try {
    const r = await axios.get(`${BASE}/getMe`);
    return { ok: true, botName: r.data.result.username };
  } catch (e: any) {
    return { ok: false, error: e?.response?.data?.description ?? e?.message };
  }
}
