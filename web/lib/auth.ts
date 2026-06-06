'use client';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export type TradingMode = 'SPOT' | 'LEVERAGE_ONLY';

export interface AuthUser {
  id: number;
  address: string;
  tradingMode: TradingMode;
}

/** Returns the stored JWT (if any). */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('trading_token');
}

/** Stores JWT + user after login. */
export function saveSession(token: string, user: AuthUser) {
  localStorage.setItem('trading_token', token);
  localStorage.setItem('trading_user', JSON.stringify(user));
}

/** Loads user from localStorage (no network call). */
export function loadUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('trading_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Clear session (logout). */
export function clearSession() {
  localStorage.removeItem('trading_token');
  localStorage.removeItem('trading_user');
}

/** Authenticated fetch helper. */
export async function authFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  return fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

/**
 * Full MetaMask login flow:
 * 1. Connect wallet (MetaMask popup)
 * 2. Get nonce from server
 * 3. Sign message (MetaMask signature popup)
 * 4. Verify on server → get JWT
 */
export async function loginWithMetaMask(): Promise<AuthUser> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('MetaMask not installed. Please install it from metamask.io');

  // 1. Request wallet access
  const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
  if (!accounts.length) throw new Error('No accounts found in MetaMask');
  const address = accounts[0].toLowerCase();

  // 2. Get nonce from server
  const nonceRes = await fetch(`${API_BASE}/api/auth/nonce/${address}`);
  if (!nonceRes.ok) throw new Error('Failed to get nonce from server');
  const { message } = await nonceRes.json();

  // 3. Sign the message (user sees MetaMask popup)
  const signature: string = await eth.request({
    method: 'personal_sign',
    params: [message, address],
  });

  // 4. Verify on server → get JWT
  const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  });
  if (!verifyRes.ok) {
    const err = await verifyRes.json();
    throw new Error(err.error ?? 'Verification failed');
  }
  const { token, user } = await verifyRes.json();

  saveSession(token, user);
  return user;
}

/** Update trading mode on server. */
export async function updateTradingMode(mode: TradingMode): Promise<AuthUser> {
  const res = await authFetch('/api/auth/me', {
    method: 'PUT',
    body: JSON.stringify({ tradingMode: mode }),
  });
  if (!res.ok) throw new Error('Failed to update trading mode');
  const user = await res.json();
  const token = getToken()!;
  saveSession(token, user);
  return user;
}

/** Short wallet address for display: 0x1234...abcd */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Live mode (Hyperliquid) toggle — stored separately from auth. */
export function isLiveMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('trading_live') === '1';
}

export function setLiveMode(live: boolean) {
  if (live) {
    localStorage.setItem('trading_live', '1');
  } else {
    localStorage.removeItem('trading_live');
  }
}
