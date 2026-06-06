'use client';

import { ethers } from 'ethers';
import { encode as msgpackEncode } from '@msgpack/msgpack';

const BASE_URL = 'https://api.hyperliquid-testnet.xyz';

const EIP712_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 421614,
  verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
};

const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HlMeta {
  universe: HlAssetMeta[];
}

export interface HlAssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

export interface HlSpotMeta {
  universe: HlSpotAssetMeta[];
  tokens: HlSpotToken[];
}

export interface HlSpotAssetMeta {
  name: string;
  tokens: [number, number]; // [base token index, quote token index]
  index: number;
  isCanonical: boolean;
}

export interface HlSpotToken {
  name: string;
  szDecimals: number;
  weiDecimals: number;
  index: number;
  tokenId: string;
  isNative: boolean;
}

export interface HlPosition {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
}

export interface HlAccountState {
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  assetPositions: { position: HlPosition }[];
  crossMaintenanceMarginUsed: string;
}

export interface HlOpenOrder {
  coin: string;
  side: 'B' | 'A';
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  origSz: string;
}

export interface OrderParams {
  coin: string;
  isBuy: boolean;
  price: string;
  size: string;
  reduceOnly?: boolean;
  orderType: 'market' | 'limit';
  tif?: 'Gtc' | 'Ioc' | 'Alo';
  isSpot?: boolean;
  tpPrice?: string;  // take profit trigger price
  slPrice?: string;  // stop loss trigger price
}

// ---------------------------------------------------------------------------
// Info API (public, no auth)
// ---------------------------------------------------------------------------

async function infoPost(body: Record<string, unknown>) {
  const res = await fetch(BASE_URL + '/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hyperliquid info error: ${res.status}`);
  return res.json();
}

export async function getMeta(): Promise<HlMeta> {
  return infoPost({ type: 'meta' });
}

export async function getSpotMeta(): Promise<HlSpotMeta> {
  return infoPost({ type: 'spotMeta' });
}

export async function getAccountState(address: string): Promise<HlAccountState> {
  return infoPost({ type: 'clearinghouseState', user: address });
}

export async function getOpenOrders(address: string): Promise<HlOpenOrder[]> {
  return infoPost({ type: 'openOrders', user: address });
}

export async function getAllMids(): Promise<Record<string, string>> {
  return infoPost({ type: 'allMids' });
}

// ---------------------------------------------------------------------------
// Action hashing (Hyperliquid L1 signing scheme)
// ---------------------------------------------------------------------------

function actionHash(action: Record<string, unknown>, nonce: number): string {
  const actionBytes = msgpackEncode(action);
  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(nonce), false);
  const vaultByte = new Uint8Array([0]); // no vault
  const chainByte = new Uint8Array([0]); // testnet = 0

  const combined = new Uint8Array(actionBytes.length + 8 + 1 + 1);
  combined.set(new Uint8Array(actionBytes), 0);
  combined.set(nonceBytes, actionBytes.length);
  combined.set(vaultByte, actionBytes.length + 8);
  combined.set(chainByte, actionBytes.length + 8 + 1);

  return ethers.keccak256(combined);
}

async function signL1Action(
  action: Record<string, unknown>,
  nonce: number,
): Promise<{ r: string; s: string; v: number }> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('MetaMask not found');

  const provider = new ethers.BrowserProvider(eth);
  const signer = await provider.getSigner();

  const connectionId = actionHash(action, nonce);

  const sig = await signer.signTypedData(EIP712_DOMAIN, AGENT_TYPES, {
    source: 'a',
    connectionId,
  });

  const { r, s, v } = ethers.Signature.from(sig);
  return { r, s, v };
}

async function exchangePost(action: Record<string, unknown>, nonce: number) {
  const signature = await signL1Action(action, nonce);

  const res = await fetch(BASE_URL + '/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature, vaultAddress: null }),
  });

  const data = await res.json();
  if (data.status === 'err') throw new Error(data.response ?? 'Exchange error');
  return data;
}

// ---------------------------------------------------------------------------
// Exchange API (signed)
// ---------------------------------------------------------------------------

export function assetIndex(meta: HlMeta, coin: string): number {
  const idx = meta.universe.findIndex((a) => a.name === coin);
  if (idx === -1) throw new Error(`Asset ${coin} not found on Hyperliquid`);
  return idx;
}

/** Spot asset index = 10000 + spot market index */
export function spotAssetIndex(spotMeta: HlSpotMeta, coin: string): number {
  const token = spotMeta.tokens.find((t) => t.name === coin);
  if (!token) throw new Error(`Spot token ${coin} not found on Hyperliquid`);
  const market = spotMeta.universe.find((m) => m.tokens[0] === token.index);
  if (!market) throw new Error(`Spot market for ${coin} not found`);
  return 10000 + market.index;
}

export function getSpotSzDecimals(spotMeta: HlSpotMeta, coin: string): number {
  const token = spotMeta.tokens.find((t) => t.name === coin);
  return token?.szDecimals ?? 4;
}

export async function getSpotBalances(address: string): Promise<Record<string, string>> {
  const data = await infoPost({ type: 'spotClearinghouseState', user: address });
  const balances: Record<string, string> = {};
  if (data?.balances) {
    for (const b of data.balances) {
      balances[b.coin] = b.total;
    }
  }
  return balances;
}

export function formatSize(size: number, szDecimals: number): string {
  return size.toFixed(szDecimals);
}

export function formatPrice(price: number): string {
  const sig = 5;
  if (price === 0) return '0';
  const magnitude = Math.floor(Math.log10(Math.abs(price)));
  const decimals = Math.max(0, sig - 1 - magnitude);
  return price.toFixed(decimals);
}

export async function placeOrder(meta: HlMeta, params: OrderParams, spotMeta?: HlSpotMeta) {
  const isSpot = params.isSpot && spotMeta;
  const idx = isSpot
    ? spotAssetIndex(spotMeta!, params.coin)
    : assetIndex(meta, params.coin);
  const nonce = Date.now();

  // Main order wire
  const orders: Record<string, unknown>[] = [{
    a: idx,
    b: params.isBuy,
    p: params.price,
    s: params.size,
    r: isSpot ? false : (params.reduceOnly ?? false),
    t: params.orderType === 'market'
      ? { limit: { tif: 'Ioc' } }
      : { limit: { tif: params.tif ?? 'Gtc' } },
  }];

  // Take Profit — triggers a market close when price reaches tpPrice
  if (params.tpPrice && !isSpot) {
    orders.push({
      a: idx,
      b: !params.isBuy,        // opposite direction to close
      p: params.tpPrice,
      s: params.size,
      r: true,                 // reduce only
      t: { trigger: { triggerPx: params.tpPrice, isMarket: true, tpsl: 'tp' } },
    });
  }

  // Stop Loss — triggers a market close when price reaches slPrice
  if (params.slPrice && !isSpot) {
    orders.push({
      a: idx,
      b: !params.isBuy,        // opposite direction to close
      p: params.slPrice,
      s: params.size,
      r: true,                 // reduce only
      t: { trigger: { triggerPx: params.slPrice, isMarket: true, tpsl: 'sl' } },
    });
  }

  const action = {
    type: 'order',
    orders,
    grouping: orders.length > 1 ? 'tpsl' : 'na',
  };

  return exchangePost(action, nonce);
}

export async function cancelOrder(coin: string, oid: number, meta: HlMeta) {
  const idx = assetIndex(meta, coin);
  const nonce = Date.now();
  const action = {
    type: 'cancel',
    cancels: [{ a: idx, o: oid }],
  };
  return exchangePost(action, nonce);
}

export async function closePosition(meta: HlMeta, coin: string, size: string, isBuy: boolean) {
  return placeOrder(meta, {
    coin,
    isBuy,
    price: isBuy ? '999999' : '0.01',
    size,
    reduceOnly: true,
    orderType: 'market',
  });
}

// ---------------------------------------------------------------------------
// Symbol helpers — map "BTC/USD" watchlist names to Hyperliquid coin names
// ---------------------------------------------------------------------------

export function watchlistToCoin(symbol: string): string {
  return symbol.replace(/\/USD$/, '').replace(/\/USDT$/, '');
}

export function coinToWatchlist(coin: string): string {
  return coin + '/USD';
}
