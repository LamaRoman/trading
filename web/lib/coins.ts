/**
 * Coins that exist on BOTH Hyperliquid (perps) AND Binance/TradingView.
 * Only these coins are shown in the market selector.
 * Source: Hyperliquid perp universe intersected with Binance spot/futures.
 */
export const SUPPORTED_COINS = new Set([
  // Large caps
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LTC',
  'BCH', 'TRX', 'LINK', 'SHIB', 'MATIC', 'UNI', 'ATOM', 'ETC', 'ICP', 'FIL',
  // DeFi
  'AAVE', 'MKR', 'COMP', 'SNX', 'CRV', 'LDO', 'SUSHI', '1INCH', 'BAL', 'YFI',
  // L2 / Infra
  'OP', 'ARB', 'MANTA', 'ZRO', 'STRK', 'BLUR', 'ENS',
  // New L1s
  'SUI', 'APT', 'SEI', 'INJ', 'TIA', 'NEAR', 'ALGO', 'FTM', 'HBAR',
  // Gaming / NFT
  'AXS', 'SAND', 'MANA', 'GALA', 'IMX',
  // Memes
  'PEPE', 'WIF', 'BONK', 'FLOKI', 'DEGEN',
  // AI / Data
  'RNDR', 'FET', 'OCEAN', 'WLD', 'TAO',
  // Misc perps on HL with Binance data
  'APE', 'GMT', 'STX', 'DYDX', 'JTO', 'JUP', 'PYTH', 'W', 'EIGEN',
  'ORDI', 'SATS', 'BOME', 'POPCAT', 'MEW', 'BRETT', 'PEOPLE', 'ACE',
  'LISTA', 'PORTAL', 'ALT', 'TNSR', 'SAGA', 'REZ', 'BB', 'NOT',
  'ZK', 'ZETA', 'OMNI', 'SAFE', 'AEVO', 'ETHFI', 'VANRY',
  // HYPE (Hyperliquid native — exists on both)
  'HYPE', 'PURR',
]);

export function isSupportedCoin(coin: string): boolean {
  return SUPPORTED_COINS.has(coin.replace('/USD', '').replace('/USDT', ''));
}

export function toTVSymbol(coin: string): string {
  const base = coin.replace('/USD', '').replace('/USDT', '');
  return `BINANCE:${base}USDT`;
}
