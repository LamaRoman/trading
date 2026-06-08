'use client';
import { useEffect, useRef, useState } from 'react';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

// ---- types (mirror the server API) ----
export type Dir = 'LONG' | 'SHORT' | 'FLAT';

export interface ScoreRow {
  symbol: string;
  name: string;
  confidence: number;
  direction: Dir;
  price: number;
  technical: number;
  sentiment: number;
  whale: number;
  momentum: number;
  reasons: string[];
}

export interface Position {
  id: number;
  symbol: string;
  direction: Dir;
  qty: number;
  entryPrice: number;
  price: number;
  notional: number;
  upnl: number;
  upnlPct: number;
  entryConfidence: number;
  leverage: number;
  effectiveLeverage: number;
  margin: number;
  addedMargin: number;
  stopLoss: number | null;
  takeProfit: number | null;
  liqPrice: number | null;
  source: 'agent' | 'manual';
  entryTime: string;
}

export interface Portfolio {
  startingCapital: number;
  cash: number;
  equity: number;
  openPositionsValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  openCount: number;
  positions: Position[];
  totalReturnPct: number;
}

export interface LoopStatus {
  running: boolean;
  busy: boolean;
  cycleSeconds: number;
  lastCycleAt: string | null;
  lastError: string | null;
}

export interface AgentConfig {
  confidenceThreshold: number;
  maxConcurrent: number;
  riskPerTradePct: number;
  takeProfitPct: number;
  stopLossPct: number;
  maxLeverage: number;
  minHoldBars: number;
  allowLeverage: boolean;
  minCycleSeconds: number;
  maxCycleSeconds: number;
  paused: boolean;
  startingCapital: number;
  builderFeePct: number;
  referralSharePct: number;
  builderAddress: string;
}

export interface Overview {
  loop: LoopStatus;
  portfolio: Portfolio;
  config: AgentConfig;
  lastDecision: { id: number; summary: string; action: string; createdAt: string } | null;
  leaderboard: ScoreRow[];
}

export interface Trade {
  id: number;
  symbol: string;
  direction: Dir;
  status: string;
  qty: number;
  entryPrice: number;
  entryTime: string;
  entryConfidence: number;
  leverage: number;
  source: 'agent' | 'manual';
  exitPrice: number | null;
  exitTime: string | null;
  exitReason: string | null;
  pnl: number | null;
  pnlPct: number | null;
  regime: string | null;
  mistakeTags: string[] | null;
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AssetScore {
  confidence: number;
  direction: Dir;
  price: number;
  technical: number;
  sentiment: number;
  whale: number;
  momentum: number;
  reasons: string[];
  createdAt: string;
}

export interface Lesson {
  category: string;
  description: string;
  occurrences: number;
  totalPnl: number;
  severity: number;
  active: boolean;
}

export interface Signal {
  name: string;
  category: string;
  reliability: number;
  wins: number;
  losses: number;
}

export interface Weights {
  current: { technical: number; sentiment: number; whale: number; momentum: number } | null;
}

// ---- helpers ----
export async function postJSON(path: string, body?: unknown) {
  const r = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

export async function delJSON(path: string, params?: Record<string, string>) {
  const url = new URL(API_BASE + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { method: 'DELETE' });
  return r.json();
}

/** Poll an endpoint on an interval; returns the latest data (or null). */
export function usePoll<T>(path: string | null, intervalMs = 4000): T | null {
  const [data, setData] = useState<T | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!path) return;
    let alive = true;
    const run = async () => {
      try {
        const r = await fetch(API_BASE + path);
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setData(j);
      } catch {
        /* ignore transient errors */
      }
    };
    run();
    const id = setInterval(run, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path, intervalMs]);

  return data;
}

// ---- intelligence types ----
export interface Headline {
  title: string;
  source: string;
  score: number;
}

export interface SentimentData {
  score: number;
  headlines: Headline[];
  fearGreed: number | null;
  reasons: string[];
}

export interface WhaleAlertData {
  type: string;
  severity: number;
  description: string;
}

export interface WhaleData {
  score: number;
  alerts: WhaleAlertData[];
  reasons: string[];
}

// ---- formatting ----
export const fmtUSD = (n: number, dp = 2) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtPrice = (n: number) =>
  n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5);

export const fmtPct = (n: number, dp = 2) => (n >= 0 ? '+' : '') + n.toFixed(dp) + '%';

export const confColor = (c: number) =>
  c >= 75 ? '#16c784' : c >= 65 ? '#3b82f6' : c >= 55 ? '#f0b90b' : '#8b97a8';
