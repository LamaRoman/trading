import 'dotenv/config';

/** Centralized, typed access to environment configuration. */
export const config = {
  port: Number(process.env.PORT ?? 4000),

  // "mock" (synthetic), "yahoo" (real, no key), or "alpaca" (real + keys)
  dataProvider: (process.env.DATA_PROVIDER ?? 'yahoo') as 'mock' | 'yahoo' | 'alpaca',

  // autonomous loop base interval (dynamic cycle time overrides this per-cycle)
  agentCycleSeconds: Number(process.env.AGENT_CYCLE_SECONDS ?? 30),
  agentAutostart: (process.env.AGENT_AUTOSTART ?? 'true').toLowerCase() === 'true',

  alpaca: {
    keyId: process.env.ALPACA_KEY_ID ?? '',
    secretKey: process.env.ALPACA_SECRET_KEY ?? '',
    dataUrl: process.env.ALPACA_DATA_URL ?? 'https://data.alpaca.markets',
    paperUrl: process.env.ALPACA_PAPER_URL ?? 'https://paper-api.alpaca.markets',
  },

  cmcApiKey: process.env.CMC_API_KEY ?? '',

  x: {
    apiKey:            process.env.X_API_KEY ?? '',
    apiSecret:         process.env.X_API_SECRET ?? '',
    accessToken:       process.env.X_ACCESS_TOKEN ?? '',
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET ?? '',
    enabled:           process.env.X_POST_ENABLED !== 'false',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    channelId: process.env.TELEGRAM_CHANNEL_ID ?? '',
    postIntervalHours: Number(process.env.TELEGRAM_POST_INTERVAL_HOURS ?? 4),
  },
};

export type AppConfig = typeof config;
